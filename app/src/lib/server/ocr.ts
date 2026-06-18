// Document inspection — OpenRouter → Gemini Flash, one multimodal call per document.
// It does two jobs at once: (1) extract candidate-field suggestions (never authoritative,
// PRD §4), and (2) check the image against its Indian document STANDARD (right type,
// mandated elements present, identifiers well-formed). Identifier formats are re-validated
// deterministically in code — the model is never trusted for a checksum.
//
// Prompt-engineering choices (best practice):
//  - dedicated system role framing the model as a strict KYC verifier;
//  - per-document instructions generated from the standards registry;
//  - enumerated "expected elements" the model must tick off one-by-one (grounding);
//  - hard anti-hallucination rules ("report only what is visibly present", "" when illegible);
//  - structured JSON output enforced via response_format json_schema (with a regex fallback);
//  - temperature 0 + provider data_collection denied.
import { env } from '$env/dynamic/private';
import { getObjectBytes } from './storage';
import { standardFor, checkFormat, panIsIndividual, type DocStandard } from '$lib/shared/doc-standards';

export type ConformanceStatus = 'pass' | 'warn' | 'fail' | 'skipped';

export interface Conformance {
	status: ConformanceStatus;
	detectedType: string;
	isExpectedType: boolean;
	confidence: number;
	missingElements: string[];
	formatFailures: string[];
	qualityIssues: string[];
	tampering: boolean;
	/** human-readable explanation lines, shown to candidate / HR */
	reasons: string[];
}

export interface InspectionResult {
	/** candidate-field-keyed suggestions (same convention as before) */
	fields: Record<string, string>;
	transcript: string;
	conformance: Conformance;
	unreadable: boolean;
	raw: Record<string, unknown>;
}

interface ModelOutput {
	detected_type: string;
	is_expected_type: boolean;
	readable: boolean;
	required_elements: { element: string; present: boolean }[];
	fields: { key: string; value: string }[];
	quality_issues: string[];
	tampering_suspected: boolean;
	confidence: number;
	transcript: string;
	notes: string;
}

const RESPONSE_SCHEMA = {
	name: 'document_inspection',
	strict: true,
	schema: {
		type: 'object',
		additionalProperties: false,
		properties: {
			detected_type: { type: 'string' },
			is_expected_type: { type: 'boolean' },
			readable: { type: 'boolean' },
			required_elements: {
				type: 'array',
				items: {
					type: 'object',
					additionalProperties: false,
					properties: { element: { type: 'string' }, present: { type: 'boolean' } },
					required: ['element', 'present']
				}
			},
			fields: {
				type: 'array',
				items: {
					type: 'object',
					additionalProperties: false,
					properties: { key: { type: 'string' }, value: { type: 'string' } },
					required: ['key', 'value']
				}
			},
			quality_issues: { type: 'array', items: { type: 'string' } },
			tampering_suspected: { type: 'boolean' },
			confidence: { type: 'number' },
			transcript: { type: 'string' },
			notes: { type: 'string' }
		},
		required: [
			'detected_type', 'is_expected_type', 'readable', 'required_elements',
			'fields', 'quality_issues', 'tampering_suspected', 'confidence', 'transcript', 'notes'
		]
	}
} as const;

const SYSTEM_PROMPT =
	'You are a meticulous KYC document-verification assistant for Indian Government and ' +
	'supporting documents. You are shown ONE uploaded image or PDF. Report ONLY what is ' +
	'visibly present — never infer, auto-complete, or guess a value that is not clearly ' +
	'legible. Be strict and conservative: when in doubt, mark an element absent and a field ' +
	'empty. You transcribe and assess; you do not compute checksums.';

function buildUserPrompt(std: DocStandard): string {
	const lines: string[] = [
		`EXPECTED DOCUMENT: ${std.label} — ${std.description}, issued by ${std.issuer}.`,
		`TASK: Decide whether the image is genuinely this document and conforms to its standard, then extract the listed fields.`,
		'',
		'EXPECTED ELEMENTS (return one required_elements row per item, in this order, present=true only if you can actually see it):'
	];
	std.requiredElements.forEach((el, i) => lines.push(`  ${i + 1}. ${el}`));
	if (std.standardNotes.length) {
		lines.push('', 'STANDARD NOTES (context only — do NOT compute checksums):');
		std.standardNotes.forEach((n) => lines.push(`  - ${n}`));
	}
	lines.push('', 'FIELDS TO EXTRACT (return one fields row per key; value = exact visible text, else ""):');
	std.fields.forEach((f) => lines.push(`  - ${f.key} (${f.label})${f.required ? ' [required]' : ''}`));
	lines.push(
		'',
		'RULES:',
		'- is_expected_type=false if the image is a different document; still set detected_type to what it actually is.',
		'- readable=false ONLY if the image is too blurred, dark, glare-covered or cropped to read.',
		'- quality_issues: short tags only for real problems (e.g. "blur","glare","cropped","low-resolution","partial").',
		'- tampering_suspected=true only on clear signs (mismatched fonts, edited regions, a pasted photo).',
		'- Express any dates as DD/MM/YYYY. Identifiers without spaces.',
		'- transcript: faithful plain-text of all visible text. confidence: 0..1 overall.',
		'- Return ONLY the JSON object, no markdown.'
	);
	return lines.join('\n');
}

async function callModel(std: DocStandard, dataUrl: string, mime: string): Promise<ModelOutput> {
	const prompt = buildUserPrompt(std);
	const filePart =
		mime === 'application/pdf'
			? { type: 'file', file: { filename: 'document.pdf', file_data: dataUrl } }
			: { type: 'image_url', image_url: { url: dataUrl } };

	const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			model: env.OPENROUTER_MODEL ?? 'google/gemini-3.5-flash',
			messages: [
				{ role: 'system', content: SYSTEM_PROMPT },
				{ role: 'user', content: [{ type: 'text', text: prompt }, filePart] }
			],
			response_format: { type: 'json_schema', json_schema: RESPONSE_SCHEMA },
			provider: { data_collection: 'deny' }, // PRD §9 — least exposure
			temperature: 0
		})
	});

	if (!res.ok) {
		const body = await res.text();
		throw new Error(`OpenRouter ${res.status}: ${body.slice(0, 300)}`);
	}
	const json = await res.json();
	const text: string = json.choices?.[0]?.message?.content ?? '';
	const match = text.match(/\{[\s\S]*\}/); // fallback if a model wraps/ignores response_format
	if (!match) throw new Error('Inspection response contained no JSON');
	return JSON.parse(match[0]) as ModelOutput;
}

function normaliseGender(value: string): string {
	const g = value.toLowerCase();
	return g.startsWith('f') ? 'Female' : g.startsWith('m') ? 'Male' : value ? 'Other' : '';
}

/** Inspect one document against its standard. Returns extraction + conformance verdict. */
export async function inspectDocument(
	slot: string,
	spacesKey: string,
	mime: string
): Promise<InspectionResult> {
	const std = standardFor(slot);
	if (!std) {
		return {
			fields: {},
			transcript: '',
			unreadable: false,
			raw: {},
			conformance: {
				status: 'skipped', detectedType: '', isExpectedType: true, confidence: 1,
				missingElements: [], formatFailures: [], qualityIssues: [], tampering: false, reasons: []
			}
		};
	}

	const bytes = await getObjectBytes(spacesKey);
	const dataUrl = `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;
	const out = await callModel(std, dataUrl, mime);

	// --- map extracted fields → candidate-field suggestions -------------------
	const byKey = new Map((out.fields ?? []).map((f) => [f.key, String(f.value ?? '').trim()]));
	const fields: Record<string, string> = {};
	const formatFailures: string[] = [];
	const softNotes: string[] = [];

	for (const f of std.fields) {
		let value = byKey.get(f.key) ?? '';
		if (f.candidateField === 'gender') value = normaliseGender(value);
		if (value && f.candidateField) fields[f.candidateField] = value;

		// deterministic identifier validation (the model is never trusted here)
		if (value) {
			const ok = checkFormat(f.format, value);
			if (ok === false) formatFailures.push(`${f.label} "${value}" is not a valid ${f.format}`);
			else if (ok === null && /[xX*]/.test(value) && f.format === 'aadhaar')
				softNotes.push('Aadhaar number is masked — checksum could not be verified.');
			if (f.format === 'pan' && ok && !panIsIndividual(value))
				softNotes.push('PAN does not appear to be an individual PAN (4th letter ≠ P).');
		} else if (f.required) {
			formatFailures.push(`${f.label} could not be read`);
		}
	}

	// --- conformance verdict --------------------------------------------------
	const strict = std.rigor === 'strict';
	const unreadable = out.readable === false;
	const missingElements = (out.required_elements ?? []).filter((e) => !e.present).map((e) => e.element);
	const qualityIssues = out.quality_issues ?? [];
	const tampering = !!out.tampering_suspected;
	const confidence = typeof out.confidence === 'number' ? out.confidence : 0;
	const reasons: string[] = [];
	let status: ConformanceStatus = 'pass';

	if (unreadable) {
		status = 'fail';
		reasons.push('The image is not legible — retake on a flat surface, in good light, with all corners visible.');
	} else if (!out.is_expected_type) {
		status = 'fail';
		reasons.push(`This looks like ${out.detected_type || 'a different document'}, not a ${std.label}.`);
	} else if (strict) {
		if (missingElements.length) {
			status = 'fail';
			reasons.push(`Missing required element(s): ${missingElements.join(', ')}.`);
		}
		if (formatFailures.length) {
			status = 'fail';
			reasons.push(...formatFailures);
		}
		if (tampering) {
			status = 'fail';
			reasons.push('Possible tampering detected — needs manual review.');
		}
	}

	if (status === 'pass') {
		if (tampering) {
			status = 'warn';
			reasons.push('Possible tampering — flagged for review.');
		} else if (qualityIssues.length) {
			status = 'warn';
			reasons.push(`Quality issues: ${qualityIssues.join(', ')}.`);
		} else if (confidence && confidence < 0.6) {
			status = 'warn';
			reasons.push('Low confidence in this document — please double-check it.');
		} else if (softNotes.length) {
			status = 'warn';
			reasons.push(...softNotes);
		}
	}

	return {
		fields,
		transcript: out.transcript ?? '',
		unreadable,
		raw: out as unknown as Record<string, unknown>,
		conformance: {
			status, detectedType: out.detected_type ?? '', isExpectedType: !!out.is_expected_type,
			confidence, missingElements, formatFailures, qualityIssues, tampering, reasons
		}
	};
}
