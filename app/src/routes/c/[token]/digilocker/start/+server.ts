import { redirect, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/public';
import { resolveCandidateToken } from '$lib/server/tokens';
import { encrypt, randomToken } from '$lib/server/crypto';
import { isConfigured, pkcePair, buildAuthorizeUrl } from '$lib/server/verify/digilocker';

const COOKIE = 'dl_oauth';

// Kicks off the DigiLocker consent flow: stash state + PKCE verifier in a signed,
// short-lived cookie, then bounce the candidate to DigiLocker to authorise sharing.
export const GET: RequestHandler = async ({ params, cookies }) => {
	if (!isConfigured()) error(503, 'DigiLocker verification is not configured.');

	const candidate = await resolveCandidateToken(params.token);
	if (!candidate) error(404, 'This onboarding link is invalid, expired, or revoked.');
	if (!candidate.consentAt) error(400, 'Please accept the consent declaration before verifying.');

	const redirectUri = `${env.PUBLIC_BASE_URL}/digilocker/callback`;
	const state = randomToken(16);
	const { verifier, challenge } = pkcePair();

	cookies.set(
		COOKIE,
		encrypt(
			JSON.stringify({
				state,
				verifier,
				candidateId: candidate.id,
				token: params.token,
				exp: Date.now() + 600_000
			})
		),
		{
			path: '/',
			httpOnly: true,
			sameSite: 'lax',
			secure: env.PUBLIC_BASE_URL?.startsWith('https://') ?? false,
			maxAge: 600
		}
	);

	redirect(302, buildAuthorizeUrl(redirectUri, state, challenge));
};
