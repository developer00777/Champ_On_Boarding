import { redirect, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/public';
import { db, t } from '$lib/server/db';
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

// DigiLocker redirects here after consent. We verify state, exchange the code, pull the
// issued documents, and run verification against the candidate's typed details.
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

	const [candidate] = await db
		.select()
		.from(t.candidates)
		.where(eq(t.candidates.id, s.candidateId));
	if (!candidate) error(404, 'Candidate not found.');

	// redirect() throws, so the outcome is computed here and the redirect is issued after.
	let outcome = 'ok';
	try {
		const redirectUri = `${env.PUBLIC_BASE_URL}/digilocker/callback`;
		const accessToken = await exchangeCode(code, s.verifier, redirectUri);
		const docs = await pullVerifiableDocs(accessToken);
		await audit({
			candidateId: candidate.id,
			actor: 'candidate',
			action: 'digilocker_linked',
			ip: getClientAddress()
		});

		let verified = 0;
		for (const [docKind, found] of Object.entries(docs)) {
			if (!found) continue;
			await runVerification(candidate, 'digilocker', docKind, found, 'candidate');
			verified++;
		}
		if (!verified) {
			await recordVerificationError(
				candidate.id,
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
