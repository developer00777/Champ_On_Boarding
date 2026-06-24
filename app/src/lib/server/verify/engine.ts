import { Verification } from '../db/schema';
import { audit } from '../audit';
import {
	VERIFY_SPECS,
	matchField,
	overallVerdict,
	type FieldResult,
	type VerifyStatus
} from '$lib/shared/match';

export type VerifySource = 'ocr_crosscheck';

function maskLong(value: string): string {
	return value.replace(/\d{8,}/g, (m) => `${'X'.repeat(m.length - 4)}${m.slice(-4)}`);
}

function expectedFor(candidate: Record<string, unknown>, field: string): string {
	const v = candidate[field];
	return v == null ? '' : String(v);
}

export async function runVerification(
	candidate: Record<string, unknown>,
	source: VerifySource,
	docKind: string,
	found: Record<string, string>,
	actor = 'system'
) {
	const spec = VERIFY_SPECS[docKind];
	if (!spec) return null;

	const results: FieldResult[] = spec.fields.map((f) => {
		const expected = expectedFor(candidate, f.field);
		const foundVal = found[f.field] ?? '';
		const { score, verdict } = matchField(f.kind, expected, foundVal);
		return { ...f, expected: maskLong(expected), found: maskLong(foundVal), score, verdict };
	});

	const { status, score } = overallVerdict(results);
	const candidateId = String((candidate._id ?? candidate.id) as string);
	return persist(candidateId, source, docKind, status, score, results, null, actor);
}

export async function recordVerificationError(
	candidateId: string,
	source: VerifySource,
	docKind: string,
	note: string,
	actor = 'system'
) {
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
) {
	const doc = await Verification.findOneAndUpdate(
		{ candidateId, source, docKind },
		{ status, score, fieldResults, note, verifiedAt: new Date() },
		{ upsert: true, new: true }
	).lean();

	await audit({
		candidateId,
		actor,
		action: 'document_verified',
		field: `${source}:${docKind}`,
		newValue: `${status} (${score}%)`
	});
	return doc;
}

export async function verificationsFor(candidateId: string) {
	return Verification.find({ candidateId }).lean();
}

export async function clearVerification(candidateId: string, source: VerifySource) {
	await Verification.deleteMany({ candidateId, source });
}
