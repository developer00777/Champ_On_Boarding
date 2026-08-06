import { env as publicEnv } from '$env/dynamic/public';

/** Canonical public origin for this product. Every candidate-facing link
 *  (onboarding, BGV, offer letters, welcome cards) must be built from this so
 *  recipients land on the branded domain rather than a platform-generated host
 *  like *.up.railway.app or *.vercel.app. */
export const CANONICAL_BASE_URL = 'https://champ-onboarding.com';

/** Resolve the base URL for outbound links, without a trailing slash.
 *
 *  PUBLIC_BASE_URL still wins so local dev and preview deploys can override it,
 *  but a platform host is never allowed through: those get generated whenever a
 *  deploy target injects its own URL, and the resulting links leak to
 *  candidates. Anything on railway.app / vercel.app falls back to the canonical
 *  domain instead. */
export function baseUrl(): string {
	const raw = publicEnv.PUBLIC_BASE_URL?.trim();
	if (!raw) return CANONICAL_BASE_URL;

	const cleaned = raw.replace(/\/$/, '');
	let host: string;
	try {
		host = new URL(cleaned).hostname;
	} catch {
		// Not a parseable URL — unusable for building links.
		return CANONICAL_BASE_URL;
	}

	if (/(^|\.)(up\.railway\.app|railway\.app|vercel\.app)$/i.test(host)) {
		return CANONICAL_BASE_URL;
	}

	return cleaned;
}
