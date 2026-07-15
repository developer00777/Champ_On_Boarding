// Maps DB documents + recruiter input onto the exact `[Placeholder]` keys the
// offer letter template expects. Pure mapping — no persistence, no I/O.
import type { CandidateDoc, OfferLetterDoc } from '$lib/server/db/schema';
import { COMPENSATION_FIELD_BY_TRACK, TRACKS, type Track } from '$lib/shared/matrix';

export const EMPLOYMENT_TYPE_LABELS = {
	full_time: 'Full-time',
	part_time: 'Part-time',
	contract: 'Contract',
	consultant: 'Consultant'
} as const;

export type EmploymentType = keyof typeof EMPLOYMENT_TYPE_LABELS;

/** What the covering email calls the attached document, per track — cosmetic
 *  only: every track attaches the same "Employment Offer Letter" .docx. */
export const LETTER_TYPE_BY_TRACK: Record<Track, string> = {
	intern: 'Internship Letter',
	fresher: 'Offer Letter',
	experienced: 'Offer Letter',
	consultant: 'Consultant Letter',
	contract: 'Contract Letter'
};

/** Compensation field label per track — same underlying `ctcAmount` DB field.
 *  Derived from the shared definition the admin form renders, so the label a
 *  recruiter reads and the one quoted elsewhere cannot drift apart. */
export const COMPENSATION_LABEL_BY_TRACK: Record<Track, string> = Object.fromEntries(
	TRACKS.map((t) => [t, COMPENSATION_FIELD_BY_TRACK[t].label])
) as Record<Track, string>;

export interface OfferLetterInput {
	jobTitle: string;
	department: string;
	reportingManager: string;
	officeLocation: string;
	joiningDate: string;
	endDate: string;
	employmentType: EmploymentType | '';
	ctcAmount: string;
	/** Offer-of-appointment only: the monthly take-home quoted alongside annual
	 *  CTC in clause 1. Not CTC/12 — the real letters quote an independent
	 *  figure — so it is entered, never derived. */
	monthlyCompensation: string;
	noticePeriod: string;
	/** Offer-of-appointment clause 5: notice owed once probation is confirmed.
	 *  Bold in the signed letters and distinct from `noticePeriod` (which applies
	 *  during probation), so it is its own field rather than a fixed string. */
	confirmedNoticePeriod: string;
	acceptanceDueDate: string;
	signatoryName: string;
	signatoryDesignation: string;
	/** PNG/JPG signature image stored as a data-URI (base64). Optional. */
	signatoryImageBase64: string;
	/** Consultant/contract: clause-3 weekly expectation line (e.g. "Minimum 04 Content per Week"). */
	weeklyExpectation: string;
	/** Consultant/contract: clause-4 key responsibilities, one bullet per line. */
	keyResponsibilities: string;
	/** Intern-only: the Intern Agreement evaluation criteria, one bullet per
	 *  line. Recruiter-editable per intern (the profile differs by team), so it
	 *  is stored rather than fixed in the template. Blank → DEFAULT_INTERN_CRITERIA. */
	internCriteria: string;
	/** Consultant/contract: the clause-5 payment sentence, editable in full because
	 *  fee structures vary per consultant. `{amount}` is substituted with the
	 *  formatted `ctcAmount`, so the fee tracks that field unless the recruiter
	 *  writes an explicit figure. Blank → DEFAULT_CONSULTANT_PAYMENT_CLAUSE. */
	paymentClause: string;
}

/** The four criteria the signed internship agreements carry. Used to pre-fill
 *  the recruiter's textarea and as the fallback when it is left blank. */
export const DEFAULT_INTERN_CRITERIA = [
	'Hands-on experience in innovative tech projects.',
	'Collaboration with a diverse and dynamic team.',
	'Learning opportunities through workshops and training sessions.',
	'Exposure to cutting-edge technologies and industry trends.'
].join('\n');

/** The clause-5 payment sentence the signed consultant agreements carry. Used to
 *  pre-fill the recruiter's textarea and as the fallback when it is left blank.
 *  `{amount}` is replaced with the formatted `ctcAmount` at render time. */
export const DEFAULT_CONSULTANT_PAYMENT_CLAUSE =
	'You shall be paid as Total sum of {amount}/- per month which is subject to standard deduction as per the State and Govt Policy and TDS certificate will be given on timely basis.';

/** Fields every letter needs, whatever the track. */
const REQUIRED_ALL_TRACKS: Array<keyof OfferLetterInput> = [
	'jobTitle',
	'department',
	'reportingManager',
	'officeLocation',
	'joiningDate',
	'employmentType',
	'ctcAmount',
	'acceptanceDueDate',
	'signatoryName',
	'signatoryDesignation'
];

/** What each track additionally needs, mirroring the field its letter renders and
 *  the admin form shows. Required-ness must stay track-aware: a field the
 *  recruiter cannot see must never block sending, and one the letter quotes must
 *  never be silently blank. */
export function requiredOfferLetterFields(track: Track): Array<keyof OfferLetterInput> {
	switch (track) {
		// The internship agreement quotes an end date, and terminates "without any
		// notice" — so it needs endDate and has no notice period at all.
		case 'intern':
			return [...REQUIRED_ALL_TRACKS, 'endDate'];
		// Clause 9 quotes a notice period; clauses 3 and 4 are per-person.
		case 'consultant':
		case 'contract':
			return [...REQUIRED_ALL_TRACKS, 'noticePeriod', 'weeklyExpectation', 'keyResponsibilities'];
		// Appointment letter clause 5 quotes the probation notice period.
		default:
			return [...REQUIRED_ALL_TRACKS, 'noticePeriod'];
	}
}

export const OFFER_LETTER_FIELD_LABELS: Record<keyof OfferLetterInput, string> = {
	jobTitle: 'Job title',
	department: 'Department',
	reportingManager: "Reporting manager's name/designation",
	officeLocation: 'Office location',
	joiningDate: 'Joining date',
	endDate: 'End date',
	employmentType: 'Employment type',
	ctcAmount: 'CTC amount',
	monthlyCompensation: 'Monthly compensation',
	noticePeriod: 'Notice period (during probation)',
	confirmedNoticePeriod: 'Notice period (after confirmation)',
	acceptanceDueDate: 'Acceptance due date',
	signatoryName: 'Authorized signatory name',
	signatoryDesignation: "Signatory's designation",
	signatoryImageBase64: 'Signature image',
	weeklyExpectation: 'Weekly expectation',
	keyResponsibilities: 'Key responsibilities',
	internCriteria: 'Intern evaluation criteria',
	paymentClause: 'Payment clause'
};

export function missingOfferLetterFields(input: OfferLetterInput, track: Track): string[] {
	return requiredOfferLetterFields(track)
		.filter((key) => !input[key].trim())
		.map((key) =>
			// Name the compensation field the way this track's form labels it, so
			// "missing: CTC amount" cannot point an intern's recruiter at a field
			// their form calls "Stipend (monthly)".
			key === 'ctcAmount'
				? COMPENSATION_FIELD_BY_TRACK[track].label
				: OFFER_LETTER_FIELD_LABELS[key]
		);
}

export function offerLetterInputFromDraft(draft: OfferLetterDoc | null): OfferLetterInput {
	return {
		jobTitle: draft?.jobTitle ?? '',
		department: draft?.department ?? '',
		reportingManager: draft?.reportingManager ?? '',
		officeLocation: draft?.officeLocation ?? '',
		joiningDate: draft?.joiningDate ?? '',
		endDate: draft?.endDate ?? '',
		employmentType: (draft?.employmentType as EmploymentType | null) ?? '',
		ctcAmount: draft?.ctcAmount ?? '',
		monthlyCompensation: draft?.monthlyCompensation ?? '',
		noticePeriod: draft?.noticePeriod ?? '',
		confirmedNoticePeriod: draft?.confirmedNoticePeriod ?? '',
		acceptanceDueDate: draft?.acceptanceDueDate ?? '',
		signatoryName: draft?.signatoryName ?? '',
		signatoryDesignation: draft?.signatoryDesignation ?? '',
		signatoryImageBase64: draft?.signatoryImageBase64 ?? '',
		weeklyExpectation: draft?.weeklyExpectation ?? '',
		keyResponsibilities: draft?.keyResponsibilities ?? '',
		// Pre-fill the standard four so the recruiter edits a real list rather
		// than facing an empty box and retyping the boilerplate.
		internCriteria: draft?.internCriteria ?? DEFAULT_INTERN_CRITERIA,
		paymentClause: draft?.paymentClause ?? DEFAULT_CONSULTANT_PAYMENT_CLAUSE
	};
}

export function isOfferLetterComplete(input: OfferLetterInput, track: Track): boolean {
	return requiredOfferLetterFields(track).every((key) => input[key].trim().length > 0);
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
