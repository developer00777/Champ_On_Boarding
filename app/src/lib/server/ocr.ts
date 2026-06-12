// OcrProvider — OpenRouter → Gemini Flash. One multimodal call per document:
// structured field JSON + plain-text transcript. Raw OCR is always "suggested",
// never authoritative (PRD §4).
import { env } from '$env/dynamic/private';
import { getObjectBytes } from './storage';

export interface OcrResult {
	fields: Record<string, string>; // candidate-field-keyed suggestions
	transcript: string;
	raw: Record<string, unknown>;
	unreadable: boolean;
}

interface OcrSchema {
	/** model-facing field name → candidate column it suggests into ('' = keep in ocr_json only) */
	fieldMap: Record<string, string>;
	docDescription: string;
}

// Extraction registry — adding an OCR target = one entry here + `ocr:` key in matrix.ts.
const OCR_SCHEMAS: Record<string, OcrSchema> = {
	aadhaar_front: {
		docDescription: 'the front side of an Indian Aadhaar card',
		fieldMap: {
			full_name: 'fullName',
			date_of_birth: 'dob',
			gender: 'gender',
			aadhaar_number: 'aadhaarNo'
		}
	},
	aadhaar_back: {
		docDescription: 'the back side of an Indian Aadhaar card (address side)',
		fieldMap: { full_address: 'presentAddress', pin_code: 'presentPin' }
	},
	pan: {
		docDescription: 'an Indian PAN card',
		fieldMap: {
			full_name: 'fullName',
			fathers_name: 'fatherName',
			date_of_birth: 'dob',
			pan_number: 'panNo'
		}
	},
	bank_proof: {
		docDescription: 'an Indian bank passbook front page or cancelled cheque',
		fieldMap: {
			account_holder_name: 'fullName',
			bank_name: 'bankName',
			account_number: 'accountNo',
			ifsc_code: 'ifsc',
			branch_name: 'branch'
		}
	}
};

export function hasOcrSchema(key: string | undefined): key is string {
	return !!key && key in OCR_SCHEMAS;
}

export async function runOcr(ocrKey: string, spacesKey: string, mime: string): Promise<OcrResult> {
	const schema = OCR_SCHEMAS[ocrKey];
	const bytes = await getObjectBytes(spacesKey);
	const dataUrl = `data:${mime};base64,${Buffer.from(bytes).toString('base64')}`;

	const modelFields = Object.keys(schema.fieldMap);
	const prompt = [
		`This image is ${schema.docDescription}.`,
		`Extract the following fields and return ONLY a JSON object, no markdown fences:`,
		`{ ${modelFields.map((f) => `"${f}": string`).join(', ')}, "transcript": string, "readable": boolean }`,
		`Rules: dates as DD/MM/YYYY; numbers without spaces; use "" for any field not present or not legible;`,
		`"transcript" is a clean plain-text transcription of all visible text;`,
		`"readable" is false only if the image is too blurred/dark/cropped to extract anything.`
	].join('\n');

	const content =
		mime === 'application/pdf'
			? [
					{ type: 'text', text: prompt },
					{ type: 'file', file: { filename: 'document.pdf', file_data: dataUrl } }
				]
			: [
					{ type: 'text', text: prompt },
					{ type: 'image_url', image_url: { url: dataUrl } }
				];

	const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			model: env.OPENROUTER_MODEL ?? 'google/gemini-3.5-flash',
			messages: [{ role: 'user', content }],
			// PRD §9: least exposure — opt out of provider data collection on every call
			provider: { data_collection: 'deny' },
			temperature: 0
		})
	});

	if (!res.ok) {
		const body = await res.text();
		throw new Error(`OpenRouter ${res.status}: ${body.slice(0, 300)}`);
	}

	const json = await res.json();
	const text: string = json.choices?.[0]?.message?.content ?? '';
	const match = text.match(/\{[\s\S]*\}/);
	if (!match) throw new Error('OCR response contained no JSON');
	const parsed = JSON.parse(match[0]) as Record<string, unknown>;

	const fields: Record<string, string> = {};
	for (const [modelField, candidateField] of Object.entries(schema.fieldMap)) {
		const value = String(parsed[modelField] ?? '').trim();
		if (value && candidateField) fields[candidateField] = value;
	}

	return {
		fields,
		transcript: String(parsed.transcript ?? ''),
		raw: parsed,
		unreadable: parsed.readable === false
	};
}
