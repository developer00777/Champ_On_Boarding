// Verification engine — source-agnostic. Given authoritative/extracted values keyed by
// candidate-field name, it compares them against what the candidate typed, scores the
// match, and persists one `verifications` row per (candidate, source, docKind).
import { and, eq } from 'drizzle-orm';
import { db, t } from '../db';
import { audit } from '../audit';
import {
	VERIFY_SPECS,
	matchField,
	overallVerdict,
	type FieldResult,
	type VerifyStatus
} from '$lib/shared/match';
import type { Candidate, Verification } from '../db/schema';

export type VerifySource = 'digilocker' | 'ocr_crosscheck';

/** Never persist long raw identifiers (e.g. a full Aadhaar) — mask to last 4 (PRD §9). */
function maskLong(value: string): string {
	return value.replace(/\d{8,}/g, (m) => `${'X'.repeat(m.length - 4)}${m.slice(-4)}`);
}

/** The candidate's typed value for a verify-spec field (the "expected" side). */
function expectedFor(candidate: Candidate, field: string): string {
	const v = (candidate as unknown as Record<string, unknown>)[field];
	return v == null ? '' : String(v);
}

/**
 * Compare `found` (authoritative pull or OCR) against the candidate's typed details for one
 * document kind, store the result, and return it. Unknown docKinds are ignored (returns null).
 */
export async function runVerification(
	candidate: Candidate,
	source: VerifySource,
	docKind: string,
	found: Record<string, string>,
	actor = 'system'
): Promise<Verification | null> {
	const spec = VERIFY_SPECS[docKind];
	if (!spec) return null;

	const results: FieldResult[] = spec.fields.map((f) => {
		const expected = expectedFor(candidate, f.field);
		const foundVal = found[f.field] ?? '';
		const { score, verdict } = matchField(f.kind, expected, foundVal);
		return {
			...f,
			expected: maskLong(expected),
			found: maskLong(foundVal),
			score,
			verdict
		};
	});

	const { status, score } = overallVerdict(results);
	return persist(candidate.id, source, docKind, status, score, results, null, actor);
}

/** Record a failed verification attempt (e.g. DigiLocker returned no such document). */
export async function recordVerificationError(
	candidateId: string,
	source: VerifySource,
	docKind: string,
	note: string,
	actor = 'system'
): Promise<void> {
	await persist(candidateId, source, docKind, 'error', 0, [], note, actor);
}

async function persist(
	candidateId: string,
	source: VerifySource,
	docKind: string,
	status: VerifyStatus | 'error',
	score: number,
	fieldResults: FieldResult[],
	note: string | null,
	actor: string
): Promise<Verification> {
	const [row] = await db
		.insert(t.verifications)
		.values({ candidateId, source, docKind, status, score, fieldResults, note })
		.onConflictDoUpdate({
			target: [t.verifications.candidateId, t.verifications.source, t.verifications.docKind],
			set: { status, score, fieldResults, note, verifiedAt: new Date() }
		})
		.returning();

	await audit({
		candidateId,
		actor,
		action: 'document_verified',
		field: `${source}:${docKind}`,
		newValue: `${status} (${score}%)`
	});
	return row;
}

export async function verificationsFor(candidateId: string): Promise<Verification[]> {
	return db.select().from(t.verifications).where(eq(t.verifications.candidateId, candidateId));
}

export async function clearVerification(candidateId: string, source: VerifySource) {
	await db
		.delete(t.verifications)
		.where(and(eq(t.verifications.candidateId, candidateId), eq(t.verifications.source, source)));
}
