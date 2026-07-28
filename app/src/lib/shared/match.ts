// Document verification matching — pure, individually testable (like validation.ts).
// Compares OCR-extracted values against the candidate's typed master-sheet fields
// and produces a per-field + overall verdict.
//
// Indian names defeat exact comparison (expanded vs initialled, surname ordering,
// transliteration spellings) so names use token-aware Jaro-Winkler with thresholds and
// a 'review' band rather than a hard pass/fail.

export type FieldKind = 'name' | 'date' | 'gender' | 'digits' | 'exact';
export type Verdict = 'match' | 'review' | 'mismatch' | 'missing' | 'missing-expected';
export type VerifyStatus = 'verified' | 'review' | 'mismatch';

export interface FieldSpec {
	/** candidate column name — also the key the verifier uses for the found value */
	field: string;
	label: string;
	kind: FieldKind;
	weight: number;
}

export interface FieldResult extends FieldSpec {
	expected: string;
	found: string;
	score: number; // 0–100
	verdict: Verdict;
}

// --- string similarity -------------------------------------------------------

function jaro(a: string, b: string): number {
	if (a === b) return 1;
	if (!a.length || !b.length) return 0;
	const maxDist = Math.max(0, Math.floor(Math.max(a.length, b.length) / 2) - 1);
	const aM = new Array(a.length).fill(false);
	const bM = new Array(b.length).fill(false);
	let matches = 0;
	for (let i = 0; i < a.length; i++) {
		const start = Math.max(0, i - maxDist);
		const end = Math.min(i + maxDist + 1, b.length);
		for (let j = start; j < end; j++) {
			if (bM[j] || a[i] !== b[j]) continue;
			aM[i] = bM[j] = true;
			matches++;
			break;
		}
	}
	if (!matches) return 0;
	let transpositions = 0;
	let k = 0;
	for (let i = 0; i < a.length; i++) {
		if (!aM[i]) continue;
		while (!bM[k]) k++;
		if (a[i] !== b[k]) transpositions++;
		k++;
	}
	transpositions /= 2;
	return (matches / a.length + matches / b.length + (matches - transpositions) / matches) / 3;
}

export function jaroWinkler(a: string, b: string): number {
	const j = jaro(a, b);
	if (j < 0.7) return j;
	let prefix = 0;
	const max = Math.min(4, a.length, b.length);
	for (let i = 0; i < max && a[i] === b[i]; i++) prefix++;
	return j + prefix * 0.1 * (1 - j);
}

// --- name comparison ---------------------------------------------------------

const HONORIFICS = new Set([
	'mr', 'mrs', 'ms', 'miss', 'dr', 'shri', 'sri', 'smt', 'kumari', 'km', 'master'
]);

function normName(s: string): string {
	return s
		.toLowerCase()
		.normalize('NFKD')
		.replace(/[^a-z\s]/g, ' ')
		.replace(/\s+/g, ' ')
		.trim();
}

function nameTokens(s: string): string[] {
	return normName(s)
		.split(' ')
		.filter((tok) => tok && !HONORIFICS.has(tok));
}

/** 0–1 similarity tolerant of word order and single-letter initials. */
export function nameSimilarity(a: string, b: string): number {
	const ta = nameTokens(a);
	const tb = nameTokens(b);
	if (!ta.length || !tb.length) return 0;

	const [short, long] = ta.length <= tb.length ? [ta, tb] : [tb, ta];
	const used = new Array(long.length).fill(false);
	let sum = 0;
	for (const tok of short) {
		let best = 0;
		let bestIdx = -1;
		for (let i = 0; i < long.length; i++) {
			if (used[i]) continue;
			// "S" vs "Suresh" → treat as initial match
			const sim =
				tok.length === 1 || long[i].length === 1
					? tok[0] === long[i][0]
						? 0.9
						: 0
					: jaroWinkler(tok, long[i]);
			if (sim > best) {
				best = sim;
				bestIdx = i;
			}
		}
		if (bestIdx >= 0) {
			used[bestIdx] = true;
			sum += best;
		}
	}
	const tokenScore = sum / short.length;
	const fullScore = jaroWinkler(normName(a).replace(/\s/g, ''), normName(b).replace(/\s/g, ''));
	return Math.max(tokenScore, fullScore);
}

// --- typeahead fuzzy ranking --------------------------------------------------
// Search-box ranking (candidates/inbox typeahead): unlike nameSimilarity above,
// a search query is a fragment the admin is still typing, not a full field to
// compare — so an exact substring/prefix hit should always outrank a Jaro-Winkler
// near-miss, and short queries ("ka") shouldn't fuzzy-match everything.

/** 0–1 relevance of `query` against `text` for typeahead ranking. Exact
 *  substring hits score highest (prefix scores higher still); otherwise falls
 *  back to Jaro-Winkler so a typo ("Kartik") still surfaces ("Karthik"). Also
 *  tried against each whitespace token of `text` — a typo'd surname ("redy")
 *  would otherwise be swamped by the length mismatch against the full
 *  "karthik reddy" string and never clear the ranking floor. */
export function fuzzyScore(query: string, text: string): number {
	const q = query.trim().toLowerCase();
	const t = text.trim().toLowerCase();
	if (!q || !t) return 0;
	if (t === q) return 1;
	if (t.startsWith(q)) return 0.95;
	if (t.includes(q)) return 0.85;
	// Below ~3 chars, Jaro-Winkler on short strings is too easily fooled
	// (e.g. "ka" vs "sara" scores high) — require a literal match instead.
	if (q.length < 3) return 0;
	const whole = jaroWinkler(q, t);
	const tokens = t.split(/\s+/);
	const bestToken = tokens.length > 1 ? Math.max(...tokens.map((tok) => jaroWinkler(q, tok))) : 0;
	return Math.max(whole, bestToken) * 0.7;
}

/** Best fuzzyScore of `query` against any of an item's searchable fields,
 *  ranked and filtered to a floor so unrelated results don't show up. */
export function rankByFuzzyMatch<T>(items: T[], query: string, fields: (item: T) => Array<string | null | undefined>, limit: number): T[] {
	const scored = items
		.map((item) => {
			const score = Math.max(0, ...fields(item).map((f) => (f ? fuzzyScore(query, f) : 0)));
			return { item, score };
		})
		.filter((s) => s.score >= 0.4)
		.sort((a, b) => b.score - a.score);
	return scored.slice(0, limit).map((s) => s.item);
}

// --- date normalisation ------------------------------------------------------

/** Coerce DD/MM/YYYY, YYYY-MM-DD, DD-MM-YY etc. to canonical YYYY-MM-DD, or null. */
export function normDate(s: string): string | null {
	const m = s.trim().match(/(\d{1,4})[/\-.](\d{1,2})[/\-.](\d{1,4})/);
	if (!m) return null;
	let [, a, b, c] = m;
	let y: string, mo: string, d: string;
	if (a.length === 4) {
		[y, mo, d] = [a, b, c]; // YYYY-MM-DD
	} else {
		[d, mo, y] = [a, b, c]; // DD/MM/YYYY
	}
	if (y.length === 2) y = (Number(y) > 30 ? '19' : '20') + y;
	if (Number(mo) < 1 || Number(mo) > 12 || Number(d) < 1 || Number(d) > 31) return null;
	return `${y.padStart(4, '0')}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
}

// --- field + overall comparison ---------------------------------------------

export function matchField(kind: FieldKind, expected: string, found: string): { score: number; verdict: Verdict } {
	const e = (expected ?? '').trim();
	const f = (found ?? '').trim();
	if (!e) return { score: 0, verdict: 'missing-expected' };
	if (!f) return { score: 0, verdict: 'missing' };

	switch (kind) {
		case 'name': {
			const score = Math.round(nameSimilarity(e, f) * 100);
			return { score, verdict: score >= 82 ? 'match' : score >= 68 ? 'review' : 'mismatch' };
		}
		case 'date': {
			const de = normDate(e);
			const df = normDate(f);
			if (!de || !df) return { score: 0, verdict: 'review' };
			return de === df ? { score: 100, verdict: 'match' } : { score: 0, verdict: 'mismatch' };
		}
		case 'gender':
			return e[0].toLowerCase() === f[0].toLowerCase()
				? { score: 100, verdict: 'match' }
				: { score: 0, verdict: 'mismatch' };
		case 'digits': {
			const de = e.replace(/\D/g, '');
			const df = f.replace(/\D/g, '');
			return de && de === df ? { score: 100, verdict: 'match' } : { score: 0, verdict: 'mismatch' };
		}
		case 'exact':
		default: {
			const ok = e.toUpperCase().replace(/\s/g, '') === f.toUpperCase().replace(/\s/g, '');
			return ok ? { score: 100, verdict: 'match' } : { score: 0, verdict: 'mismatch' };
		}
	}
}

/** Roll per-field verdicts into an overall status + weighted score. */
export function overallVerdict(results: FieldResult[]): { status: VerifyStatus; score: number } {
	if (results.some((r) => r.verdict === 'mismatch')) {
		return { status: 'mismatch', score: weightedScore(results) };
	}
	if (results.some((r) => r.verdict === 'review' || r.verdict === 'missing')) {
		return { status: 'review', score: weightedScore(results) };
	}
	return { status: 'verified', score: weightedScore(results) };
}

function weightedScore(results: FieldResult[]): number {
	const scored = results.filter((r) => r.verdict !== 'missing-expected');
	const totalWeight = scored.reduce((acc, r) => acc + r.weight, 0);
	if (!totalWeight) return 0;
	return Math.round(scored.reduce((acc, r) => acc + r.score * r.weight, 0) / totalWeight);
}

// --- what each document proves ----------------------------------------------
// `field` is the candidate column (the expected/typed side); the verifier returns the
// found values keyed by the same names (same convention as ocr.ts fieldMap).

export interface VerifySpec {
	label: string;
	fields: FieldSpec[];
}

export const VERIFY_SPECS: Record<string, VerifySpec> = {
	aadhaar: {
		label: 'Aadhaar',
		fields: [
			{ field: 'fullName', label: 'Name', kind: 'name', weight: 3 },
			{ field: 'dob', label: 'Date of birth', kind: 'date', weight: 3 },
			{ field: 'gender', label: 'Gender', kind: 'gender', weight: 1 },
			{ field: 'aadhaarLast4', label: 'Aadhaar (last 4)', kind: 'digits', weight: 2 },
			{ field: 'presentPin', label: 'PIN code', kind: 'digits', weight: 1 }
		]
	},
	pan: {
		label: 'PAN',
		fields: [
			{ field: 'fullName', label: 'Name', kind: 'name', weight: 3 },
			{ field: 'dob', label: 'Date of birth', kind: 'date', weight: 2 },
			{ field: 'panNo', label: 'PAN number', kind: 'exact', weight: 3 },
			{ field: 'fatherName', label: "Father's name", kind: 'name', weight: 1 }
		]
	},
	marksheet_10: {
		label: '10th Marksheet',
		fields: [
			{ field: 'fullName', label: 'Name', kind: 'name', weight: 3 },
			{ field: 'dob', label: 'Date of birth', kind: 'date', weight: 2 }
		]
	},
	marksheet_12: {
		label: '12th Marksheet',
		fields: [
			{ field: 'fullName', label: 'Name', kind: 'name', weight: 3 },
			{ field: 'dob', label: 'Date of birth', kind: 'date', weight: 2 }
		]
	}
};
