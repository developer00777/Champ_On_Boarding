import mongoose, { Schema } from 'mongoose';
import type { Types } from 'mongoose';

const { model, models } = mongoose;

// ── Companies ────────────────────────────────────────────────────────────────
const companySchema = new Schema(
	{
		name: { type: String, required: true, unique: true },
		brandSlug: { type: String, default: null },
		// Logo uploaded when the company was added, as a data-URI. Brands in
		// brands.ts ship their own logo file; this covers companies added from the
		// admin UI, which have no brand entry to draw art from. Takes precedence
		// over the brand's logo when set.
		logoBase64: { type: String, default: null },
		active: { type: Boolean, default: true }
	},
	{ timestamps: true }
);
export const Company = models.Company ?? model('Company', companySchema);

// ── Admins ───────────────────────────────────────────────────────────────────
const adminSchema = new Schema(
	{
		email: { type: String, required: true, unique: true },
		passwordHash: { type: String, required: true },
		role: { type: String, enum: ['hr_admin', 'super_admin'], required: true },
		status: { type: String, enum: ['active', 'disabled'], default: 'active' }
	},
	{ timestamps: true }
);
export const Admin = models.Admin ?? model('Admin', adminSchema);

// ── Candidates ───────────────────────────────────────────────────────────────
const candidateSchema = new Schema(
	{
		companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
		track: { type: String, enum: ['intern', 'fresher', 'experienced', 'consultant', 'contract'], required: true },
		fullName: String,
		dob: String,
		gender: String,
		email: { type: String, required: true, index: true },
		mobile: String,
		fatherName: String,
		fatherMobile: String,
		motherName: String,
		motherMobile: String,
		motherDob: String,
		maritalStatus: { type: String, enum: ['single', 'married'], default: null },
		spouseName: String,
		spouseContact: String,
		spouseDob: String,
		emergencyContactName: String,
		emergencyContactMobile: String,
		emergencyContactRelation: String,
		presentAddress: String,
		presentPin: String,
		presentHouseNo: String,
		permanentAddress: String,
		permanentPin: String,
		permanentHouseNo: String,
		aadhaarNoEncrypted: String,
		aadhaarLast4: String,
		panNo: String,
		uanNo: String,
		dlNo: String,
		passportNo: String,
		linkedinId: String,
		// The name printed on the passbook, which is not always the candidate's
		// fullName — maiden names, initials spelled out, a name the bank never
		// updated. Payroll needs the bank's spelling to make a transfer land.
		bankAccountName: String,
		bankName: String,
		accountNo: String,
		ifsc: String,
		branch: String,
		employeeId: { type: String, default: null },
		ocrSuggestions: { type: Map, of: String, default: {} },
		// HR asking a candidate to upload an optional document they skipped (e.g.
		// degree certificate) — there is no Document row to flip reviewStatus on
		// for a file that was never uploaded, so the request lives here instead,
		// keyed by docType. Cleared the moment a matching Document appears.
		requestedDocTypes: {
			type: [{ docType: { type: String, required: true }, note: { type: String, default: null } }],
			default: []
		},
		consentAt: Date,
		consentIp: String,
		status: {
			type: String,
			enum: ['created', 'opened', 'in_progress', 'submitted', 'changes_requested', 'approved', 'complete', 'revoked'],
			default: 'created'
		},
		createdBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
		submittedAt: Date,
		reviewedAt: Date,
		reviewedBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null }
	},
	{ timestamps: true }
);
export const Candidate = models.Candidate ?? model('Candidate', candidateSchema);

// ── Link Tokens ───────────────────────────────────────────────────────────────
const linkTokenSchema = new Schema(
	{
		candidateId: { type: Schema.Types.ObjectId, ref: 'Candidate', required: true },
		tokenHash: { type: String, required: true, unique: true },
		// AES-256-GCM encrypted copy of the raw token (see crypto.ts), so the admin
		// panel can always display/re-test a candidate's live link without having
		// to regenerate it just to see it. tokenHash remains the source of truth
		// for verifying incoming /c/[token] requests; this field is display-only.
		tokenEncrypted: { type: String, default: null },
		expiresAt: { type: Date, required: true },
		openedAt: { type: Date, default: null },
		revoked: { type: Boolean, default: false }
	},
	{ timestamps: true }
);
linkTokenSchema.index({ candidateId: 1 });
export const LinkToken = models.LinkToken ?? model('LinkToken', linkTokenSchema);

// ── Documents (metadata — file bytes in GridFS) ───────────────────────────────
const documentSchema = new Schema(
	{
		candidateId: { type: Schema.Types.ObjectId, ref: 'Candidate', required: true },
		docType: { type: String, required: true },
		gridfsId: { type: Schema.Types.ObjectId, required: true },
		mime: { type: String, required: true },
		sizeBytes: { type: Number, required: true },
		ocrStatus: {
			type: String,
			enum: ['pending', 'parsed', 'unreadable', 'failed', 'store_only'],
			default: 'pending'
		},
		ocrJson: { type: Schema.Types.Mixed, default: null },
		ocrTranscript: { type: String, default: null },
		reviewStatus: {
			type: String,
			enum: ['uploaded', 'flagged', 'accepted', 'reupload_requested'],
			default: 'uploaded'
		},
		reviewNote: { type: String, default: null }
	},
	{ timestamps: true }
);
documentSchema.index({ candidateId: 1 });
export const Document = models.Document ?? model('Document', documentSchema);

// ── Physical Items ────────────────────────────────────────────────────────────
const physicalItemSchema = new Schema(
	{
		candidateId: { type: Schema.Types.ObjectId, ref: 'Candidate', required: true },
		itemType: {
			type: String,
			enum: ['passport_photos_x4', 'offer_letter_signed', 'nda_signed_copy'],
			required: true
		},
		received: { type: Boolean, default: false },
		receivedAt: { type: Date, default: null },
		receivedBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
		note: { type: String, default: null }
	},
	{ timestamps: true }
);
physicalItemSchema.index({ candidateId: 1 });
export const PhysicalItem = models.PhysicalItem ?? model('PhysicalItem', physicalItemSchema);

// ── Audit Log ─────────────────────────────────────────────────────────────────
const auditLogSchema = new Schema(
	{
		candidateId: { type: Schema.Types.ObjectId, ref: 'Candidate', default: null },
		actor: { type: String, required: true },
		action: { type: String, required: true },
		field: { type: String, default: null },
		oldValue: { type: String, default: null },
		newValue: { type: String, default: null },
		ip: { type: String, default: null }
	},
	{ timestamps: true }
);
export const AuditLog = models.AuditLog ?? model('AuditLog', auditLogSchema);

// ── Verifications ─────────────────────────────────────────────────────────────
const verificationSchema = new Schema(
	{
		candidateId: { type: Schema.Types.ObjectId, ref: 'Candidate', required: true },
		source: { type: String, enum: ['ocr_crosscheck'], required: true },
		docKind: { type: String, required: true },
		status: { type: String, required: true },
		score: { type: Number, required: true },
		fieldResults: { type: Schema.Types.Mixed, default: [] },
		note: { type: String, default: null },
		verifiedAt: { type: Date, default: () => new Date() }
	},
	{ timestamps: true }
);
verificationSchema.index({ candidateId: 1, source: 1, docKind: 1 }, { unique: true });
export const Verification = models.Verification ?? model('Verification', verificationSchema);

// ── Offer Letters ─────────────────────────────────────────────────────────────
// Recruiter-entered fields the template can't auto-fill (name/address/company
// come from Candidate/Company directly). One doc per candidate; upserted as a
// draft while the recruiter is filling it in, flipped to 'sent' once emailed.
const offerLetterSchema = new Schema(
	{
		candidateId: { type: Schema.Types.ObjectId, ref: 'Candidate', required: true, unique: true },
		jobTitle: { type: String, default: null },
		department: { type: String, default: null },
		reportingManager: { type: String, default: null },
		officeLocation: { type: String, default: null },
		joiningDate: { type: String, default: null },
		endDate: { type: String, default: null },
		employmentType: { type: String, enum: ['full_time', 'part_time', 'contract', 'consultant'], default: null },
		ctcAmount: { type: String, default: null },
		monthlyCompensation: { type: String, default: null },
		noticePeriod: { type: String, default: null },
		confirmedNoticePeriod: { type: String, default: null },
		acceptanceDueDate: { type: String, default: null },
		signatoryName: { type: String, default: null },
		signatoryDesignation: { type: String, default: null },
		signatoryImageBase64: { type: String, default: null },
		// Consultant-track only: clause-3 weekly expectation + clause-4 KRA bullets
		// (one responsibility per line). Ignored for other tracks.
		weeklyExpectation: { type: String, default: null },
		keyResponsibilities: { type: String, default: null },
		// Intern-track only: the "evaluated based upon the following criteria"
		// bullets (one per line). Null falls back to the standard four.
		internCriteria: { type: String, default: null },
		// Consultant/contract tracks: the clause-5 payment sentence. `{amount}` is
		// substituted with ctcAmount. Null falls back to the standard wording.
		paymentClause: { type: String, default: null },
		// Offer-of-appointment tracks only: the page-4 salary breakdown (Basic/HRA/
		// PF/Gratuity/etc.), entered as monthly (P.M.) figures — annual (P.A.) and
		// the totals are always derived as P.M. x 12, never stored, so they cannot
		// drift from the figures HR actually typed in. `enabled` lets HR omit the
		// page entirely for a candidate rather than send one full of zeros.
		compensationAnnexure: {
			enabled: { type: Boolean, default: false },
			basicPm: { type: String, default: null },
			hraPm: { type: String, default: null },
			bonusLabel: { type: String, default: null },
			bonusPm: { type: String, default: null },
			ltaPm: { type: String, default: null },
			shiftLabel: { type: String, default: null },
			shiftPm: { type: String, default: null },
			specialPm: { type: String, default: null },
			pfPm: { type: String, default: null },
			gratuityPm: { type: String, default: null },
			insurancePm: { type: String, default: null },
			foodPm: { type: String, default: null }
		},
		status: { type: String, enum: ['draft', 'sent'], default: 'draft' },
		sentAt: { type: Date, default: null },
		sentBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null }
	},
	{ timestamps: true }
);
export const OfferLetter = models.OfferLetter ?? model('OfferLetter', offerLetterSchema);

// ── Email Messages (Inbox) ───────────────────────────────────────────────────
// Both directions in one collection so the admin Inbox is a single
// chronological thread: `direction: 'outbound'` rows are written the moment
// sendBrandedMail() fires (see mailer.ts) and updated in place as Resend's
// delivery webhook reports status; `direction: 'inbound'` rows are created by
// the same webhook on email.received (see /webhooks/resend), one per reply
// from a candidate (or anyone else) to offer@ / onboarding@.
const emailMessageSchema = new Schema(
	{
		direction: { type: String, enum: ['outbound', 'inbound'], required: true },
		candidateId: { type: Schema.Types.ObjectId, ref: 'Candidate', default: null },
		resendEmailId: { type: String, default: null, index: true },
		from: { type: String, required: true },
		to: { type: String, required: true },
		subject: { type: String, default: null },
		text: { type: String, default: null },
		purpose: { type: String, default: null },
		// Outbound lifecycle: sent → delivered → opened/clicked, or bounced/
		// complained/delayed/failed at any point. Inbound rows are always 'received'.
		status: {
			type: String,
			enum: ['sent', 'delivered', 'opened', 'clicked', 'bounced', 'complained', 'delayed', 'failed', 'received'],
			required: true
		},
		statusDetail: { type: String, default: null }
	},
	{ timestamps: true }
);
emailMessageSchema.index({ candidateId: 1, createdAt: -1 });
export const EmailMessage = models.EmailMessage ?? model('EmailMessage', emailMessageSchema);

// ── Shared types ──────────────────────────────────────────────────────────────
export type CandidateDoc = InstanceType<typeof Candidate> & { _id: Types.ObjectId };
export type DocumentDoc = InstanceType<typeof Document> & { _id: Types.ObjectId };
export type AdminDoc = InstanceType<typeof Admin> & { _id: Types.ObjectId };
export type PhysicalItemDoc = InstanceType<typeof PhysicalItem> & { _id: Types.ObjectId };
export type OfferLetterDoc = InstanceType<typeof OfferLetter> & { _id: Types.ObjectId };
