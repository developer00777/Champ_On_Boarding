// DigiLocker provider — OAuth 2.0 (authorization code + PKCE) via MeriPehchaan, then pulls
// issuer-signed documents (legally at par with originals) and maps them to candidate-field
// keys for the verification engine. Fully env-gated: with no credentials the feature is off.
//
// NOTE: DigiLocker host/paths have moved between API versions (now under
// digilocker.meripehchaan.gov.in / API Setu). All endpoints are env-overridable — confirm
// the exact authorize/token/files paths and scopes against the current API Setu spec for
// your registered Requester app before going live.
import { createHash, randomBytes } from 'node:crypto';
import { env } from '$env/dynamic/private';

function cfg() {
	return {
		clientId: env.DIGILOCKER_CLIENT_ID ?? '',
		clientSecret: env.DIGILOCKER_CLIENT_SECRET ?? '',
		authBase: env.DIGILOCKER_AUTH_BASE ?? 'https://digilocker.meripehchaan.gov.in/public/oauth2/1',
		apiBase: env.DIGILOCKER_API_BASE ?? 'https://digilocker.meripehchaan.gov.in/public/oauth2/2',
		eaadhaarPath: env.DIGILOCKER_EAADHAAR_PATH ?? '/xml/eaadhaar'
	};
}

export const isConfigured = (): boolean => !!(cfg().clientId && cfg().clientSecret);

// --- PKCE --------------------------------------------------------------------

export function pkcePair(): { verifier: string; challenge: string } {
	const verifier = randomBytes(32).toString('base64url');
	const challenge = createHash('sha256').update(verifier).digest('base64url');
	return { verifier, challenge };
}

export function buildAuthorizeUrl(redirectUri: string, state: string, challenge: string): string {
	const c = cfg();
	const u = new URL(`${c.authBase}/authorize`);
	u.searchParams.set('response_type', 'code');
	u.searchParams.set('client_id', c.clientId);
	u.searchParams.set('redirect_uri', redirectUri);
	u.searchParams.set('state', state);
	u.searchParams.set('code_challenge', challenge);
	u.searchParams.set('code_challenge_method', 'S256');
	return u.toString();
}

export async function exchangeCode(
	code: string,
	verifier: string,
	redirectUri: string
): Promise<string> {
	const c = cfg();
	const res = await fetch(`${c.authBase}/token`, {
		method: 'POST',
		headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({
			grant_type: 'authorization_code',
			code,
			client_id: c.clientId,
			client_secret: c.clientSecret,
			redirect_uri: redirectUri,
			code_verifier: verifier
		})
	});
	if (!res.ok) throw new Error(`DigiLocker token ${res.status}: ${(await res.text()).slice(0, 200)}`);
	const json = (await res.json()) as { access_token?: string };
	if (!json.access_token) throw new Error('DigiLocker token response had no access_token');
	return json.access_token;
}

// --- pulling + parsing -------------------------------------------------------

async function apiText(path: string, token: string): Promise<string> {
	const res = await fetch(`${cfg().apiBase}${path}`, {
		headers: { Authorization: `Bearer ${token}` }
	});
	if (!res.ok) throw new Error(`DigiLocker ${path} → ${res.status}`);
	return res.text();
}

async function apiJson<T>(path: string, token: string): Promise<T> {
	const res = await fetch(`${cfg().apiBase}${path}`, {
		headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }
	});
	if (!res.ok) throw new Error(`DigiLocker ${path} → ${res.status}`);
	return res.json() as Promise<T>;
}

/** Flatten all XML attributes into a lowercased map (first occurrence wins). Tolerant of the
 *  schema differences between issuers — we only need a handful of well-known attribute names. */
function xmlAttrs(xml: string): Record<string, string> {
	const out: Record<string, string> = {};
	for (const m of xml.matchAll(/([\w:-]+)\s*=\s*"([^"]*)"/g)) {
		const key = m[1].toLowerCase();
		if (!(key in out)) out[key] = m[2];
	}
	return out;
}

const pick = (a: Record<string, string>, ...keys: string[]): string => {
	for (const k of keys) if (a[k]) return a[k];
	return '';
};

function last4(value: string): string {
	const digits = value.replace(/\D/g, '');
	return digits ? digits.slice(-4) : '';
}

function stripRelation(careOf: string): string {
	// "C/O Suresh Kumar" / "S/O: Suresh" → "Suresh Kumar"
	return careOf.replace(/^[CSDW]\s*\/\s*O[:\s.]*/i, '').trim();
}

function mapAadhaar(xml: string): Record<string, string> {
	const a = xmlAttrs(xml);
	return {
		fullName: pick(a, 'name', 'fullname'),
		dob: pick(a, 'dob', 'dateofbirth'),
		gender: pick(a, 'gender'),
		aadhaarLast4: last4(pick(a, 'uid', 'maskeduid', 'aadhaarno', 'aadhaar')),
		presentPin: pick(a, 'pc', 'pincode', 'pin')
	};
}

function mapPan(xml: string): Record<string, string> {
	const a = xmlAttrs(xml);
	return {
		fullName: pick(a, 'name', 'fullname'),
		dob: pick(a, 'dob', 'dateofbirth'),
		panNo: pick(a, 'pan', 'panno', 'pannumber').toUpperCase(),
		fatherName: pick(a, 'fathersname', 'fathername', 'fname') || stripRelation(pick(a, 'careof', 'co'))
	};
}

interface IssuedItem {
	uri?: string;
	doctype?: string;
	doc_type?: string;
	name?: string;
}

/**
 * Pull every document we know how to verify and return them keyed by docKind
 * (`aadhaar`, `pan`). Each value is candidate-field-keyed, ready for the engine.
 * Individual failures are swallowed so one missing doc doesn't sink the rest.
 */
export async function pullVerifiableDocs(
	token: string
): Promise<Partial<Record<string, Record<string, string>>>> {
	const out: Partial<Record<string, Record<string, string>>> = {};

	try {
		out.aadhaar = mapAadhaar(await apiText(cfg().eaadhaarPath, token));
	} catch (e) {
		console.warn('[digilocker] eAadhaar pull failed:', (e as Error).message);
	}

	try {
		const list = await apiJson<{ items?: IssuedItem[] } | IssuedItem[]>('/files/issued', token);
		const items: IssuedItem[] = Array.isArray(list) ? list : (list.items ?? []);
		for (const it of items) {
			const doctype = String(it.doctype ?? it.doc_type ?? '').toUpperCase();
			if (doctype === 'PANCR' && it.uri && !out.pan) {
				out.pan = mapPan(await apiText(`/xml/${encodeURIComponent(it.uri)}`, token));
			}
			// Marksheet doctypes are board-specific (CBSE/CISCE/state). Add their codes here to
			// pull `marksheet_10` / `marksheet_12` once your Requester app is approved for them.
		}
	} catch (e) {
		console.warn('[digilocker] issued-files pull failed:', (e as Error).message);
	}

	return out;
}
