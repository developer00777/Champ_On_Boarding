/**
 * Conformance — does an uploaded document meet the standard registered for its
 * slot (doc-standards.ts)?
 *
 * The client has always expected a `conformance` field on the upload response
 * (see c/[token]/+page.svelte) but nothing ever produced one, so the standards
 * registry sat unused and every upload reported clean. This is that producer.
 *
 * It is deliberately deterministic: it grades the values OCR already returned
 * rather than making a second model call to ask "is this really an Aadhaar?".
 * Identifier formats are checked in code (checkFormat → Verhoeff/regex), which
 * is the one judgement never to delegate to a model — doc-standards.ts:5 says
 * as much. The model's own `readable` flag is the only model opinion used, and
 * that is a question it is genuinely reliable at.
 *
 * Consequently a `fail` here means something concrete: a required field was not
 * found at all, or an identifier failed its checksum. It never means "the model
 * had a hunch".
 */
import { standardFor, checkFormat, panIsIndividual } from '$lib/shared/doc-standards';

export interface Conformance {
	status: 'pass' | 'warn' | 'fail';
	reasons: string[];
}

/**
 * @param slot      matrix slot type (= DocStandard.slot)
 * @param fields    OCR values keyed by the standard's `key` (ocr.ts raw json)
 * @param unreadable the model's own legibility verdict
 */
export function checkConformance(
	slot: string,
	fields: Record<string, unknown>,
	unreadable: boolean
): Conformance {
	const std = standardFor(slot);
	// No registered standard = nothing to check against; never invent a failure.
	if (!std) return { status: 'pass', reasons: [] };

	if (unreadable) {
		return {
			status: 'fail',
			reasons: [
				'We could not read this image. Please retake it: flat surface, good light, all four corners in frame.'
			]
		};
	}

	const reasons: string[] = [];
	let badFormat = false;
	let missingRequired = false;

	for (const f of std.fields) {
		const value = String(fields[f.key] ?? '').trim();

		if (!value) {
			if (f.required) {
				missingRequired = true;
				reasons.push(`${f.label} could not be read from this ${std.label}.`);
			}
			continue;
		}

		const ok = checkFormat(f.format, value);
		// null = not applicable or unverifiable (e.g. a masked Aadhaar), which is
		// a legitimate document, not a failure.
		if (ok === false) {
			badFormat = true;
			reasons.push(`The ${f.label} read from this document is not a valid ${f.format}.`);
		}

		// A company PAN in a slot expecting the candidate's own is a real mistake,
		// but it is the kind a human should judge, so warn rather than block.
		if (f.format === 'pan' && ok === true && !panIsIndividual(value)) {
			reasons.push(`This PAN does not look like an individual's — check it is your own PAN, not a company's.`);
		}
	}

	// Only strict (government) documents can be blocked. Supporting documents are
	// too varied in layout to fail on a missing sub-element without producing
	// false rejections — doc-standards.ts:8.
	if (std.rigor === 'strict' && (badFormat || missingRequired)) {
		return { status: 'fail', reasons };
	}
	return { status: reasons.length ? 'warn' : 'pass', reasons };
}
