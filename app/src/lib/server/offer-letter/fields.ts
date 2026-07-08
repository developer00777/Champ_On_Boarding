// Maps DB documents + recruiter input onto the exact `[Placeholder]` keys the
// offer letter template expects. Pure mapping — no persistence, no I/O.
import type { CandidateDoc, OfferLetterDoc } from '$lib/server/db/schema';

export const EMPLOYMENT_TYPE_LABELS = {
	full_time: 'Full-time',
	part_time: 'Part-time',
	contract: 'Contract'
} as const;

export type EmploymentType = keyof typeof EMPLOYMENT_TYPE_LABELS;

export interface OfferLetterInput {
	jobTitle: string;
	department: string;
	reportingManager: string;
	officeLocation: string;
	joiningDate: string;
	employmentType: EmploymentType | '';
	ctcAmount: string;
	noticePeriod: string;
	acceptanceDueDate: string;
	signatoryName: string;
	signatoryDesignation: string;
}

/** Fields required before an offer letter can be sent (all recruiter inputs). */
export const REQUIRED_OFFER_LETTER_FIELDS: Array<keyof OfferLetterInput> = [
	'jobTitle',
	'department',
	'reportingManager',
	'officeLocation',
	'joiningDate',
	'employmentType',
	'ctcAmount',
	'noticePeriod',
	'acceptanceDueDate',
	'signatoryName',
	'signatoryDesignation'
];

export const OFFER_LETTER_FIELD_LABELS: Record<keyof OfferLetterInput, string> = {
	jobTitle: 'Job title',
	department: 'Department',
	reportingManager: "Reporting manager's name/designation",
	officeLocation: 'Office location',
	joiningDate: 'Joining date',
	employmentType: 'Employment type',
	ctcAmount: 'CTC amount',
	noticePeriod: 'Notice period',
	acceptanceDueDate: 'Acceptance due date',
	signatoryName: 'Authorized signatory name',
	signatoryDesignation: "Signatory's designation"
};

export function missingOfferLetterFields(input: OfferLetterInput): string[] {
	return REQUIRED_OFFER_LETTER_FIELDS.filter((key) => !input[key].trim()).map(
		(key) => OFFER_LETTER_FIELD_LABELS[key]
	);
}

export function offerLetterInputFromDraft(draft: OfferLetterDoc | null): OfferLetterInput {
	return {
		jobTitle: draft?.jobTitle ?? '',
		department: draft?.department ?? '',
		reportingManager: draft?.reportingManager ?? '',
		officeLocation: draft?.officeLocation ?? '',
		joiningDate: draft?.joiningDate ?? '',
		employmentType: (draft?.employmentType as EmploymentType | null) ?? '',
		ctcAmount: draft?.ctcAmount ?? '',
		noticePeriod: draft?.noticePeriod ?? '',
		acceptanceDueDate: draft?.acceptanceDueDate ?? '',
		signatoryName: draft?.signatoryName ?? '',
		signatoryDesignation: draft?.signatoryDesignation ?? ''
	};
}

export function isOfferLetterComplete(input: OfferLetterInput): boolean {
	return REQUIRED_OFFER_LETTER_FIELDS.every((key) => input[key].trim().length > 0);
}

export function buildOfferLetterFields(
	candidate: Pick<CandidateDoc, 'fullName' | 'email' | 'presentAddress'>,
	companyName: string,
	offer: OfferLetterInput
): Record<string, string> {
	const today = new Date().toLocaleDateString('en-GB').replace(/\//g, '/'); // DD/MM/YYYY
	const candidateName = candidate.fullName ?? candidate.email;

	return {
		'DD/MM/YYYY': today,
		'Candidate Name': candidateName,
		'Candidate Address': candidate.presentAddress ?? '',
		'Company Name': companyName,
		'Job Title': offer.jobTitle,
		'Department Name': offer.department,
		"Manager's Name/Designation": offer.reportingManager,
		'Office Location': offer.officeLocation,
		'Joining Date': offer.joiningDate,
		'Full-time/Part-time/Contract': offer.employmentType ? EMPLOYMENT_TYPE_LABELS[offer.employmentType] : '',
		Amount: offer.ctcAmount,
		'Notice Period': offer.noticePeriod,
		'Acceptance Due Date': offer.acceptanceDueDate,
		'Authorized Signatory': offer.signatoryName,
		Designation: offer.signatoryDesignation
	};
}
