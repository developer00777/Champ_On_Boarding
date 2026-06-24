import { redirect, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/public';
import { Candidate } from '$lib/server/db/schema';
import { decrypt } from '$lib/server/crypto';
import { audit } from '$lib/server/audit';
import { exchangeCode, pullVerifiableDocs } from '$lib/server/verify/digilocker';
import { runVerification, recordVerificationError } from '$lib/server/verify/engine';

const COOKIE = 'dl_oauth';

interface OAuthState {
	state: string;
	verifier: string;
	candidateId: string;
	token: string;
	exp: number;
}

export const GET: RequestHandler = async ({ url, cookies, getClientAddress }) => {
	const raw = cookies.get(COOKIE);
	cookies.delete(COOKIE, { path: '/' });
	if (!raw) error(400, 'Your DigiLocker session expired. Please start the verification again.');

	let s: OAuthState;
	try {
		s = JSON.parse(decrypt(raw));
	} catch {
		error(400, 'Invalid DigiLocker session.');
	}
	if (s.exp < Date.now())
		error(400, 'Your DigiLocker session expired. Please start the verification again.');

	const back = `/c/${s.token}`;
	const code = url.searchParams.get('code');
	const returnedState = url.searchParams.get('state');

	if (url.searchParams.get('error') || !code) redirect(302, `${back}?dl=denied`);
	if (returnedState !== s.state) error(400, 'DigiLocker state mismatch — please retry.');

	const candidate = await Candidate.findById(s.candidateId).lean();
	if (!candidate) error(404, 'Candidate not found.');

	let outcome = 'ok';
	try {
		const redirectUri = `${env.PUBLIC_BASE_URL}/digilocker/callback`;
		const accessToken = await exchangeCode(code, s.verifier, redirectUri);
		const docs = await pullVerifiableDocs(accessToken);
		await audit({
			candidateId: String(candidate._id),
			actor: 'candidate',
			action: 'digilocker_linked',
			ip: getClientAddress()
		});

		let verified = 0;
		for (const [docKind, found] of Object.entries(docs)) {
			if (!found) continue;
			await runVerification(candidate as Record<string, unknown>, 'digilocker', docKind, found, 'candidate');
			verified++;
		}
		if (!verified) {
			await recordVerificationError(
				String(candidate._id),
				'digilocker',
				'aadhaar',
				'DigiLocker returned no verifiable documents'
			);
			outcome = 'empty';
		}
	} catch (e) {
		console.error('[digilocker] callback failed:', e);
		outcome = 'error';
	}

	redirect(302, `${back}?dl=${outcome}`);
};
