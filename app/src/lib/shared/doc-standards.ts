// Document standards registry — the "schema" each uploaded document is checked against.
// For government documents (Aadhaar, PAN, bank instrument, board marksheets) the entry
// encodes the official issuer, the mandated visible elements, and the identifier formats
// from the Indian standard. The LLM verifies the image against this; identifier formats
// are ALSO re-validated deterministically in code (never trust the model for a checksum).
//
// `rigor: 'strict'` → a government doc that can be marked non-conformant (fail).
// `rigor: 'lenient'` → a supporting doc; we only sanity-check it's the right kind of
//   document and legible, and never hard-fail on missing sub-elements.

import { isValidAadhaar, isValidPan, isValidIfsc, isValidPin } from './validation';

export type FormatKind = 'aadhaar' | 'pan' | 'ifsc' | 'pin' | 'account' | 'none';

export interface StdField {
	/** key the LLM returns this value under */
	key: string;
	label: string;
	/** candidate column this fills as a suggestion ('' / undefined = keep in JSON only) */
	candidateField?: string;
	format?: FormatKind;
	required: boolean;
}

export interface DocStandard {
	/** matches a matrix slot `type` */
	slot: string;
	label: string;
	issuer: string;
	rigor: 'strict' | 'lenient';
	/** one-line identity used in the prompt */
	description: string;
	/** elements the official standard mandates be visibly present */
	requiredElements: string[];
	/** standard/format rules surfaced to the model for context */
	standardNotes: string[];
	fields: StdField[];
}

const AADHAAR_FRONT: DocStandard = {
	slot: 'aadhaar_front',
	label: 'Aadhaar Card — Front',
	issuer: 'Unique Identification Authority of India (UIDAI), Government of India',
	rigor: 'strict',
	description: 'the front side of an Indian Aadhaar card',
	requiredElements: [
		'"Government of India" / "भारत सरकार" header',
		'Ashoka pillar national emblem',
		'UIDAI logo',
		'cardholder photograph',
		'cardholder name',
		'date of birth or year of birth',
		'gender (Male/Female/Transgender)',
		'12-digit Aadhaar number printed in three groups of four'
	],
	standardNotes: [
		'The Aadhaar number is exactly 12 digits, first digit between 2 and 9, with a valid Verhoeff checksum.',
		'A masked Aadhaar (first 8 digits shown as X) is also a legitimate UIDAI output.'
	],
	fields: [
		{ key: 'full_name', label: 'Name', candidateField: 'fullName', required: true },
		{ key: 'date_of_birth', label: 'Date of birth', candidateField: 'dob', required: true },
		{ key: 'gender', label: 'Gender', candidateField: 'gender', required: true },
		{ key: 'aadhaar_number', label: 'Aadhaar number', candidateField: 'aadhaarNo', format: 'aadhaar', required: true }
	]
};

const AADHAAR_BACK: DocStandard = {
	slot: 'aadhaar_back',
	label: 'Aadhaar Card — Back',
	issuer: 'Unique Identification Authority of India (UIDAI), Government of India',
	rigor: 'strict',
	description: 'the back / address side of an Indian Aadhaar card',
	requiredElements: [
		'"Unique Identification Authority of India" text',
		'full postal address block',
		'6-digit PIN code',
		'secure QR code',
		'the 12-digit Aadhaar number'
	],
	standardNotes: ['The PIN code is 6 digits and does not start with 0.'],
	fields: [
		{ key: 'full_address', label: 'Address', candidateField: 'presentAddress', required: true },
		{ key: 'pin_code', label: 'PIN code', candidateField: 'presentPin', format: 'pin', required: true }
	]
};

const PAN: DocStandard = {
	slot: 'pan',
	label: 'PAN Card',
	issuer: 'Income Tax Department, Government of India',
	rigor: 'strict',
	description: 'an Indian Permanent Account Number (PAN) card',
	requiredElements: [
		'"INCOME TAX DEPARTMENT" text',
		'"GOVT. OF INDIA" / "भारत सरकार" text',
		'Permanent Account Number (10 characters)',
		'cardholder name',
		'date of birth',
		'cardholder photograph',
		'signature'
	],
	standardNotes: [
		'PAN is 10 characters: 5 letters, 4 digits, 1 letter (AAAAA9999A).',
		'For an individual the 4th character is "P"; the 5th character is the first letter of the surname.'
	],
	fields: [
		{ key: 'full_name', label: 'Name', candidateField: 'fullName', required: true },
		{ key: 'fathers_name', label: "Father's name", candidateField: 'fatherName', required: false },
		{ key: 'date_of_birth', label: 'Date of birth', candidateField: 'dob', required: true },
		{ key: 'pan_number', label: 'PAN number', candidateField: 'panNo', format: 'pan', required: true }
	]
};

const BANK_PROOF: DocStandard = {
	slot: 'bank_proof',
	label: 'Bank Passbook / Cheque',
	issuer: 'an RBI-licensed bank',
	rigor: 'strict',
	description: 'an Indian bank passbook front page or a cancelled cheque leaf',
	requiredElements: [
		'bank name',
		'branch name',
		'IFSC code',
		'account number',
		'account holder name'
	],
	standardNotes: [
		'IFSC is 11 characters: 4 letters, then the digit 0, then 6 alphanumerics (AAAA0XXXXXX).',
		'The account number is numeric, typically 9 to 18 digits.'
	],
	fields: [
		{ key: 'account_holder_name', label: 'Account holder', candidateField: 'fullName', required: true },
		{ key: 'bank_name', label: 'Bank name', candidateField: 'bankName', required: true },
		{ key: 'account_number', label: 'Account number', candidateField: 'accountNo', format: 'account', required: true },
		{ key: 'ifsc_code', label: 'IFSC', candidateField: 'ifsc', format: 'ifsc', required: true },
		{ key: 'branch_name', label: 'Branch', candidateField: 'branch', required: false }
	]
};

const marksheet = (slot: string, label: string, exam: string): DocStandard => ({
	slot,
	label,
	issuer: 'a recognised education board (CBSE / CISCE / State Board / NIOS)',
	rigor: 'strict',
	description: `an Indian ${label.toLowerCase()} (${exam})`,
	requiredElements: [
		'issuing board name',
		'candidate / student name',
		'roll or registration number',
		'year of passing',
		'subject-wise marks or grades'
	],
	standardNotes: [`The certificate must clearly be a ${exam}, not any other class or document.`],
	fields: [
		{ key: 'full_name', label: 'Name', candidateField: 'fullName', required: true },
		{ key: 'date_of_birth', label: 'Date of birth', candidateField: 'dob', required: false },
		{ key: 'roll_number', label: 'Roll / registration no.', required: true },
		{ key: 'board_name', label: 'Board', required: true },
		{ key: 'year_of_passing', label: 'Year of passing', required: true }
	]
});

// Supporting documents — confirm it is the right *kind* of document and legible; never
// hard-fail on internal sub-fields (these have no single government standard).
const lenient = (slot: string, label: string, description: string, requiredElements: string[] = []): DocStandard => ({
	slot,
	label,
	issuer: '—',
	rigor: 'lenient',
	description,
	requiredElements,
	standardNotes: [],
	fields: []
});

export const DOC_STANDARDS: Record<string, DocStandard> = {
	aadhaar_front: AADHAAR_FRONT,
	aadhaar_back: AADHAAR_BACK,
	pan: PAN,
	bank_proof: BANK_PROOF,
	marksheet_10: marksheet('marksheet_10', '10th Marksheet', 'Class X / Secondary School Examination'),
	marksheet_12: marksheet('marksheet_12', '12th Marksheet', 'Class XII / Senior Secondary Examination'),
	degree_cert: lenient('degree_cert', 'Degree / MBA Certificate', 'a university degree or diploma certificate', ['issuing university or institution', 'candidate name', 'degree / programme name']),
	resume: lenient('resume', 'Resume', "a candidate's resume / CV"),
	test_results: lenient('test_results', 'Test Results', 'an assessment / test result sheet or screenshot'),
	internship_cert: lenient('internship_cert', 'Internship Certificate', 'an internship completion certificate', ['issuing organisation', 'candidate name']),
	relieving_letter: lenient('relieving_letter', 'Relieving Letter', 'an employment relieving / experience letter on company letterhead', ['employer name / letterhead', 'employee name']),
	offer_letter_prev: lenient('offer_letter_prev', 'Offer Letter', 'an employment offer / appointment letter', ['employer name', 'candidate name']),
	bank_statement: lenient('bank_statement', 'Bank Statement', 'a bank account statement', ['bank name', 'account holder name', 'transaction rows']),
	payslips: lenient('payslips', 'Payslip', 'a monthly salary slip / payslip', ['employer name', 'salary components']),
	bgc_form: lenient('bgc_form', 'BGC Form', 'a filled background-check form'),
	bgv_form: lenient('bgv_form', 'BGV Form', 'a filled background-verification form'),
	photo_soft: lenient('photo_soft', 'Passport Photo', 'a passport-size portrait photograph of a single person on a plain background', ['single human face', 'plain background'])
};

export function standardFor(slot: string | undefined): DocStandard | undefined {
	return slot ? DOC_STANDARDS[slot] : undefined;
}

const FORMAT_VALIDATORS: Record<FormatKind, ((v: string) => boolean) | null> = {
	aadhaar: isValidAadhaar,
	pan: isValidPan,
	ifsc: isValidIfsc,
	pin: isValidPin,
	account: (v) => /^\d{9,18}$/.test(v.replace(/\s/g, '')),
	none: null
};

/** Deterministic format check. Returns true/false, or null when not applicable / unverifiable. */
export function checkFormat(kind: FormatKind | undefined, value: string): boolean | null {
	if (!kind || kind === 'none' || !value) return null;
	// A masked identifier (e.g. masked Aadhaar) can't be checksum-verified — treat as unknown.
	if (/[xX*]/.test(value)) return null;
	const fn = FORMAT_VALIDATORS[kind];
	return fn ? fn(value) : null;
}

/** For an individual, a PAN's 4th character must be 'P'. */
export function panIsIndividual(pan: string): boolean {
	return /^[A-Z]{3}P[A-Z]/.test(pan.trim().toUpperCase());
}
