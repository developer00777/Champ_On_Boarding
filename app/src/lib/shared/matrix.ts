// PRD §3 — the FINAL document matrix (confirmed by HR, 12 June 2026).
// Track → required document slots. This is data: a new track or document is a
// new entry here (plus an OCR schema in ocr.ts if it is an extraction target).

export type Track = 'intern' | 'fresher' | 'experienced';
export const TRACKS: Track[] = ['intern', 'fresher', 'experienced'];

export const TRACK_LABELS: Record<Track, string> = {
	intern: 'Intern',
	fresher: 'Fresher',
	experienced: 'Experienced'
};

export interface DocSlot {
	type: string;
	label: string;
	hint: string;
	tracks: Track[];
	mandatory: boolean;
	/** key into the OCR extraction registry; absent = store-only */
	ocr?: string;
	/** how many files the slot accepts */
	maxFiles: number;
}

const ALL: Track[] = ['intern', 'fresher', 'experienced'];
const EXP: Track[] = ['experienced'];

export const DOC_SLOTS: DocSlot[] = [
	{ type: 'aadhaar_front', label: 'Aadhaar Card — Front', hint: 'Full Aadhaar number and name clearly visible, all 4 corners in frame', tracks: ALL, mandatory: true, ocr: 'aadhaar_front', maxFiles: 1 },
	{ type: 'aadhaar_back', label: 'Aadhaar Card — Back (optional)', hint: 'Address fully visible, no glare', tracks: ALL, mandatory: false, ocr: 'aadhaar_back', maxFiles: 1 },
	{ type: 'pan', label: 'PAN Card', hint: "Name, PAN number and father's name must be visible", tracks: ALL, mandatory: true, ocr: 'pan', maxFiles: 1 },
	{ type: 'bank_proof', label: 'Bank Passbook / Cheque front', hint: 'Name, IFSC, branch, bank name and account number must be visible', tracks: ALL, mandatory: true, ocr: 'bank_proof', maxFiles: 1 },
	{ type: 'marksheet_10', label: '10th Marks Sheet', hint: 'Clear and fully visible', tracks: ALL, mandatory: true, maxFiles: 1 },
	{ type: 'marksheet_12', label: '12th Marks Sheet', hint: 'Clear and fully visible', tracks: ALL, mandatory: true, maxFiles: 1 },
	{ type: 'degree_cert', label: 'Degree / MBA Certificate (optional)', hint: 'Clear and fully visible', tracks: ALL, mandatory: false, maxFiles: 1 },
	{ type: 'resume', label: 'Resume', hint: 'Updated resume (PDF preferred)', tracks: ALL, mandatory: true, maxFiles: 1 },
	{ type: 'test_results', label: 'Test Results', hint: 'IQ, GRIT and Growth Mindset test screenshots (up to 3 files)', tracks: ALL, mandatory: true, maxFiles: 3 },
	{ type: 'internship_cert', label: 'Last Internship Certificate', hint: 'Most recent internship certificate', tracks: ['intern'], mandatory: true, maxFiles: 1 },
	{ type: 'relieving_letter', label: 'Relieving Letters — previous 3 employers', hint: 'One relieving letter per company, from your last 3 employers (most recent first). Up to 3 files.', tracks: EXP, mandatory: true, maxFiles: 3 },
	{ type: 'offer_letter_prev', label: 'Offer Letters — previous employers (optional)', hint: 'Offer / appointment letters from your previous companies. Up to 3 files.', tracks: EXP, mandatory: false, maxFiles: 3 },
	{ type: 'bank_statement', label: 'Last 3 Months Bank Statement', hint: 'Salary account statement covering the last 3 months', tracks: EXP, mandatory: true, maxFiles: 3 },
	{ type: 'payslips', label: 'Last 3 Months Payslips', hint: 'One file per month is fine (up to 3)', tracks: EXP, mandatory: true, maxFiles: 3 },
	{ type: 'bgc_form', label: 'BGC Form (filled)', hint: 'Completed background-check form', tracks: EXP, mandatory: true, maxFiles: 1 },
	{ type: 'bgv_form', label: 'BGV Form (filled)', hint: 'Completed background-verification form', tracks: EXP, mandatory: true, maxFiles: 1 },
	{ type: 'photo_soft', label: 'Passport-size photo (soft copy)', hint: 'One recent passport-size photo, plain background', tracks: ALL, mandatory: true, maxFiles: 1 }
];

export function slotsForTrack(track: Track): DocSlot[] {
	return DOC_SLOTS.filter((s) => s.tracks.includes(track));
}

export function slotByType(type: string): DocSlot | undefined {
	return DOC_SLOTS.find((s) => s.type === type);
}

// PRD §3 — physical handover items, tracked in-portal (HR decision).
export const PHYSICAL_ITEM_TYPES = [
	{ type: 'passport_photos_x4', label: '4 passport-size photos (physical)' },
	{ type: 'offer_letter_signed', label: 'Offer Letter — signed hard copy' },
	{ type: 'nda_signed_copy', label: 'NDA — signed in person & copy handed over' }
] as const;

// HR decision (18 Jun 2026): uploads restricted to JPG / PNG / PDF only.
export const ACCEPTED_MIMES = ['image/jpeg', 'image/png', 'application/pdf'];
export const MAX_FILE_BYTES = 150 * 1024 * 1024; // 150 MB
