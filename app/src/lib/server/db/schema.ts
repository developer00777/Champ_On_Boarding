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
		role: { type: String, enum: ['hr_admin', 'super_admin', 'finance_team'], required: true },
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
		fullName: { type: String, index: true },
		dob: String,
		gender: String,
		email: { type: String, required: true, index: true },
		mobile: String,
		fatherName: String,
		fatherMobile: String,
		fatherDob: String,
		motherName: String,
		motherMobile: String,
		motherDob: String,
		// Master Tracker columns HR hands to payroll, and mandatory at submission
		// since Aug 2026 (validateMasterSheet) — religion's old "Prefer not to
		// say" opt-out went with that change. Not `required` at the schema level:
		// rows are created by HR before the candidate fills anything in, and rows
		// predating the rule still hold blanks. Option lists live in
		// shared/demographics.ts, shared by the candidate form and HR's editor.
		religion: String,
		motherTongue: String,
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
		// Previous employment — self-declared by experienced/consultant/contract
		// candidates in the onboarding form. These are the "Candidate's
		// Particulars" a BGV request quotes to the previous employer, and
		// prevHrEmail is the address the BGV form is auto-addressed to (HR can
		// still edit the To: before sending — see /admin/bgv).
		prevCompanyName: String,
		prevEmployeeId: String,
		prevDoj: String,
		prevDol: String,
		prevDesignation: String,
		prevRemuneration: String,
		prevSupervisor: String,
		prevReasonLeaving: String,
		prevHrEmail: { type: String, index: true },
		// The name printed on the passbook, which is not always the candidate's
		// fullName — maiden names, initials spelled out, a name the bank never
		// updated. Payroll needs the bank's spelling to make a transfer land.
		bankAccountName: String,
		bankName: String,
		accountNo: String,
		ifsc: String,
		branch: String,
		employeeId: { type: String, default: null, index: true },
		// One of the three shifts the roster actually runs (see SHIFT_TIMINGS in
		// shared/shifts.ts). Flows to the Master Tracker CSV and the IT/VPN setup
		// mail (see it-setup-mail.ts). Legacy rows may still hold free text from
		// before the three were fixed, so reads must not assume the enum.
		shiftTiming: { type: String, default: null },
		// The remaining IT/VPN mail columns HR fills by hand (see it-setup-mail.ts).
		// Team Name and Payroll Entity default to the offer letter's department and
		// the company name respectively, but HR can override either — null means
		// "use the derived value", a set value always wins. WFH/WFO and Mode have
		// no derivable source at all, so they are HR's entry or nothing.
		teamName: { type: String, default: null },
		payrollEntity: { type: String, default: null },
		workLocationMode: { type: String, default: null },
		joiningMode: { type: String, default: null },
		ocrSuggestions: { type: Map, of: String, default: {} },
		// HR asking a candidate to upload an optional document they skipped (e.g.
		// degree certificate) — there is no Document row to flip reviewStatus on
		// for a file that was never uploaded, so the request lives here instead,
		// keyed by docType. Cleared the moment a matching Document appears.
		requestedDocTypes: {
			type: [{ docType: { type: String, required: true }, note: { type: String, default: null } }],
			default: []
		},
		// Removed from the BGV section by HR ("delete BGV candidate"): hides the
		// row from /admin/bgv and blocks its BGV workspace. The BgvRequest row is
		// deleted along with setting this; onboarding data is untouched.
		bgvExcluded: { type: Boolean, default: false },
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
		reviewedBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
		// A manual HR hiring call — independent of `status` above, which tracks
		// document-onboarding progress, not whether the candidate was actually
		// hired. Settable at any stage (e.g. rejecting someone who never
		// finished the form) and reversible (HR can change their mind).
		hiringDecision: { type: String, enum: ['accepted', 'rejected'], default: null },
		hiringDecisionAt: Date,
		hiringDecisionBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
		// Set each time the IT/VPN system-enablement mail goes out for this
		// candidate. The mail is sent manually from the candidate page, so this is
		// a record of when the desk was last told — it drives the button's
		// Send/Resend label rather than gating anything.
		itSetupMailSentAt: { type: Date, default: null }
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
			foodPm: { type: String, default: null },
			// Variable Pay carries its own enable flag, independent of the
			// annexure-wide `enabled` above — HR adds/removes it per offer.
			variablePayEnabled: { type: Boolean, default: false },
			variablePayPm: { type: String, default: null }
		},
		status: { type: String, enum: ['draft', 'sent'], default: 'draft' },
		sentAt: { type: Date, default: null },
		sentBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null }
	},
	{ timestamps: true }
);
export const OfferLetter = models.OfferLetter ?? model('OfferLetter', offerLetterSchema);

// ── BGV Requests ──────────────────────────────────────────────────────────────
// One per experienced-track candidate: carries the token behind the public
// employer-facing verification form (/bgv/[token]), the last-sent copy of the
// HR-editable request email, and — once the previous employer submits the form
// — their verification inputs. Email replies to the request are matched in the
// Resend webhook by prevHrEmail and land in EmailMessage with purpose
// 'bgv_reply'; replyReceivedAt mirrors that here for the BGV list view.
const bgvRequestSchema = new Schema(
	{
		candidateId: { type: Schema.Types.ObjectId, ref: 'Candidate', required: true, unique: true },
		// Same pattern as LinkToken: sha256 hash is the source of truth for
		// verifying /bgv/[token] requests; the AES copy is display-only so the
		// admin panel can always show the live form link.
		tokenHash: { type: String, required: true, unique: true },
		tokenEncrypted: { type: String, default: null },
		status: { type: String, enum: ['pending', 'sent', 'completed'], default: 'pending' },
		// Last-sent copy of the request email (HR edits before each send).
		to: { type: String, default: null },
		cc: { type: String, default: null },
		subject: { type: String, default: null },
		body: { type: String, default: null },
		sentAt: { type: Date, default: null },
		sentBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
		sentCount: { type: Number, default: 0 },
		replyReceivedAt: { type: Date, default: null },
		// The previous employer's "Your Verification Inputs" column.
		verification: {
			candidateName: { type: String, default: null },
			employeeId: { type: String, default: null },
			companyName: { type: String, default: null },
			dateOfJoining: { type: String, default: null },
			dateOfLeaving: { type: String, default: null },
			designation: { type: String, default: null },
			remuneration: { type: String, default: null },
			supervisor: { type: String, default: null },
			reasonForLeaving: { type: String, default: null },
			integrityIssues: { type: String, default: null },
			rehireEligible: { type: String, enum: ['yes', 'no', null], default: null },
			exitFormalitiesPending: { type: String, enum: ['yes', 'no', null], default: null },
			exitFormalitiesDetails: { type: String, default: null },
			additionalComments: { type: String, default: null },
			verifierName: { type: String, default: null }
		},
		completedAt: { type: Date, default: null },
		completedIp: { type: String, default: null }
	},
	{ timestamps: true }
);
export const BgvRequest = models.BgvRequest ?? model('BgvRequest', bgvRequestSchema);

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
		from: { type: String, required: true, index: true },
		to: { type: String, required: true, index: true },
		subject: { type: String, default: null, index: true },
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

// ── App Settings ─────────────────────────────────────────────────────────────
// Single-row-per-key store for admin-editable operational config that is not
// per-candidate and does not belong in env vars because HR — not a deploy —
// needs to change it (e.g. who the IT/VPN setup mail is addressed to). Code
// always supplies a default, so an empty collection is a valid fresh install.
const appSettingSchema = new Schema(
	{
		key: { type: String, required: true, unique: true },
		value: { type: Schema.Types.Mixed, default: null },
		updatedBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null }
	},
	{ timestamps: true }
);
export const AppSetting = models.AppSetting ?? model('AppSetting', appSettingSchema);

// ── Shared types ──────────────────────────────────────────────────────────────
export type CandidateDoc = InstanceType<typeof Candidate> & { _id: Types.ObjectId };
export type DocumentDoc = InstanceType<typeof Document> & { _id: Types.ObjectId };
export type AdminDoc = InstanceType<typeof Admin> & { _id: Types.ObjectId };
export type PhysicalItemDoc = InstanceType<typeof PhysicalItem> & { _id: Types.ObjectId };
export type OfferLetterDoc = InstanceType<typeof OfferLetter> & { _id: Types.ObjectId };
export type BgvRequestDoc = InstanceType<typeof BgvRequest> & { _id: Types.ObjectId };

// ── Offboarding: Exits ───────────────────────────────────────────────────────
// One row per employee separation, created by HR from /admin/offboarding with
// just the four things they know at resignation time (employee id, name,
// personal email, resignation date). Deliberately NOT a stage on Candidate:
// most people leaving today were hired before this app existed and have no
// Candidate row at all. `candidateId` is an optional back-link, matched on
// creation by employee id or email, which lets the exit prefill DOJ,
// designation, manager, UAN and bank details from their onboarding record —
// and stays null for everyone else, who HR fills in by hand.
//
// The document data the employee submits lives in the four `*Form` sub-objects
// (one per entity exit form, per the Exit Process SOP §5). Every generated PDF
// is rendered live from these fields, so HR can download a current copy at any
// instant — nothing is frozen into a file until the employee signs.
const exitSchema = new Schema(
	{
		companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
		// Optional link to the onboarding record — see note above.
		candidateId: { type: Schema.Types.ObjectId, ref: 'Candidate', default: null, index: true },

		// ── What HR types to initiate (SOP steps 1-2) ────────────────────────
		employeeId: { type: String, required: true, index: true },
		fullName: { type: String, required: true, index: true },
		/** Personal (non-company) address — company mail is revoked on LWD, so
		 *  every exit link and the final document handover must go here. */
		personalEmail: { type: String, required: true, index: true },
		personalMobile: { type: String, default: null },
		resignationDate: { type: String, required: true },
		/** Confirmed Last Working Day. Set by HR at resignation approval (SOP
		 *  step 2) — not known at initiation, so not required. */
		lwd: { type: String, default: null },
		noticePeriod: { type: String, default: null },
		separationType: { type: String, enum: ['voluntary', 'involuntary'], default: 'voluntary' },

		// ── Employment particulars the exit forms print ──────────────────────
		// Prefilled from the linked Candidate/OfferLetter where one exists,
		// otherwise HR's own entry. Stored on the exit rather than read through
		// the link every time: an exit document must keep saying what it said
		// when it was signed, even if the onboarding record is later edited.
		doj: { type: String, default: null },
		designation: { type: String, default: null },
		department: { type: String, default: null },
		reportingManager: { type: String, default: null },
		division: { type: String, default: null },
		uanNo: { type: String, default: null },
		panNo: { type: String, default: null },
		bankAccountName: { type: String, default: null },

		// ── Stage machine ────────────────────────────────────────────────────
		// initiated        HR created the row; no link sent yet
		// link_sent        exit-forms link emailed to the employee
		// in_progress      employee has opened it and started filling
		// submitted        employee submitted all applicable forms
		// changes_requested HR asked for specific fields again (see requestedFields)
		// clearances       HR accepted the submission; approvers are signing
		// cleared          every requested approver has signed off
		// fnf              HR has filled the F&F / PF / payroll block
		// completed        final document handover link sent; exit closed
		status: {
			type: String,
			enum: [
				'initiated', 'link_sent', 'in_progress', 'submitted',
				'changes_requested', 'clearances', 'cleared', 'fnf', 'completed'
			],
			default: 'initiated'
		},

		createdBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
		submittedAt: { type: Date, default: null },
		reviewedAt: { type: Date, default: null },
		reviewedBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
		completedAt: { type: Date, default: null },

		/** HR sending the employee back to specific fields rather than the whole
		 *  form again (the "confirm and re-request a particular info" step).
		 *  `field` is a dotted path into the form objects below, e.g.
		 *  'ndc.nameAsPerBank'. Cleared per-field as the employee resubmits. */
		requestedFields: {
			type: [{ field: { type: String, required: true }, note: { type: String, default: null } }],
			default: []
		},

		consentAt: { type: Date, default: null },
		consentIp: { type: String, default: null },

		// ── 5.1 No Dues / Clearance Certificate (employee's half) ────────────
		// The approval columns are NOT here: each department's tick, remark and
		// signature lives on its own ExitClearance row, so the live NDC PDF is
		// assembled from this plus whatever clearances have landed so far.
		ndc: {
			team: { type: String, default: null },
			nameAsPerBank: { type: String, default: null },
			/** Free-text handover notes the NDC asks for ("List should be
			 *  attached" / "Brief backside of the page"), per section. */
			filesHandover: { type: String, default: null },
			loginsHandover: { type: String, default: null },
			leadsHandover: { type: String, default: null },
			deptOthers: { type: String, default: null },
			/** The employee's own declaration against the certificate's tick-rows,
			 *  rowKey -> handed_over|pending|na (NDC_EMPLOYEE_DECLARATIONS). Kept
			 *  as a Map for the same reason the exit-interview grids are: a new row
			 *  in NDC_SECTIONS must not need a migration. This is the claim each
			 *  approver cross-checks on their clearance page — it never becomes
			 *  the clearance itself, which stays on ExitClearance.rows. */
			rows: { type: Map, of: String, default: {} },
			/** rowKey -> the employee's note for that row. The four Employee's-
			 *  Department rows are not in here: their note is the dedicated field
			 *  above (see NdcRow.noteField). */
			rowNotes: { type: Map, of: String, default: {} },
			submittedAt: { type: Date, default: null }
		},

		// ── 5.2 Non-Disclosure & Non-Compete Agreement ───────────────────────
		nda: {
			agreementDate: { type: String, default: null },
			fullName: { type: String, default: null },
			permanentAddress: { type: String, default: null },
			/** AES-256-GCM like Candidate.aadhaarNoEncrypted — never stored raw. */
			aadhaarNoEncrypted: { type: String, default: null },
			aadhaarLast4: { type: String, default: null },
			acceptedAt: { type: Date, default: null },
			submittedAt: { type: Date, default: null }
		},

		// ── 5.3 Exit Interview Form ──────────────────────────────────────────
		// Q1-Q9, Q14A and Q15 are free text; Q10/Q14B are single choice; Q11-Q13
		// are rating grids stored as { rowKey: choice } maps so a new row in the
		// printed form is a change to the row list in offboarding/forms.ts, not
		// a schema migration.
		exitInterview: {
			supervisor: { type: String, default: null },
			division: { type: String, default: null },
			jobTitle: { type: String, default: null },
			reasonForLeaving: { type: String, default: null },
			q1DecideToLeave: { type: String, default: null },
			q2MostSatisfying: { type: String, default: null },
			q3LeastSatisfying: { type: String, default: null },
			q4MostFrustrating: { type: String, default: null },
			q5SupportLevel: { type: String, default: null },
			q6PoliciesInhibited: { type: String, default: null },
			q7PerformanceFeedback: { type: String, default: null },
			q8SalarySatisfied: { type: String, default: null },
			q9QualitiesNeeded: { type: String, default: null },
			q10Workload: { type: String, enum: ['too_heavy', 'about_right', 'too_light', null], default: null },
			/** Q11 — supervisor ratings, rowKey → almost_always|usually|sometimes|never */
			q11Supervisor: { type: Map, of: String, default: {} },
			/** Q12 — organisation ratings, rowKey → excellent|good|fair|poor */
			q12Ratings: { type: Map, of: String, default: {} },
			q12Comments: { type: String, default: null },
			/** Q13 — benefits ratings, rowKey → excellent|good|fair|poor|no_opinion */
			q13Benefits: { type: Map, of: String, default: {} },
			q14aAdviceToSuccessor: { type: String, default: null },
			q14bWouldRecommend: {
				type: String,
				enum: ['most_definitely', 'with_reservations', 'no', null],
				default: null
			},
			q15Suggestions: { type: String, default: null },
			submittedAt: { type: Date, default: null }
		},

		// ── 5.4 Relieving Formalities Form ───────────────────────────────────
		// Every numbered item on the printed form is a Yes/No the employee
		// answers; `*Note` carries the explanation a "no" needs.
		relievingFormalities: {
			jobTitle: { type: String, default: null },
			division: { type: String, default: null },
			resignationInWriting: { type: String, enum: ['yes', 'no', null], default: null },
			commitmentPeriodComplete: { type: String, enum: ['yes', 'no', null], default: null },
			newEmployerOfferSubmitted: { type: String, enum: ['yes', 'no', null], default: null },
			salesApproval: { type: String, enum: ['yes', 'no', 'na', null], default: null },
			accountingCleared: { type: String, enum: ['yes', 'no', null], default: null },
			hrAlumniEnrolled: { type: String, enum: ['yes', 'no', null], default: null },
			itEmailBackedUp: { type: String, enum: ['yes', 'no', null], default: null },
			notes: { type: String, default: null },
			/** Alumni-forum contact details the HR item (4c) collects. */
			futureContactEmail: { type: String, default: null },
			futureContactMobile: { type: String, default: null },
			futureContactAddress: { type: String, default: null },
			emergencyContactName: { type: String, default: null },
			emergencyContactMobile: { type: String, default: null },
			submittedAt: { type: Date, default: null }
		},

		// ── 5.5 Gratuity (Form I) — only at 4 years 7 months+ service ────────
		// `applicable` is computed from doj/lwd on save (see offboarding/service.ts)
		// but stored so HR can override an edge case rather than fight the maths.
		gratuity: {
			applicable: { type: Boolean, default: false },
			totalService: { type: String, default: null },
			nomineeName: { type: String, default: null },
			nomineeRelation: { type: String, default: null },
			addressForCorrespondence: { type: String, default: null },
			submittedAt: { type: Date, default: null }
		},

		// ── Asset return (SOP step 6) ────────────────────────────────────────
		// Employee declares, IT/Admin verify on their clearance page. Stored as
		// rows so the asset list can grow without a migration.
		assets: {
			type: [
				{
					item: { type: String, required: true },
					returned: { type: Boolean, default: false },
					note: { type: String, default: null },
					verifiedAt: { type: Date, default: null }
				}
			],
			default: []
		},

		// ── Payroll / F&F (SOP step 8) — HR's own entry ──────────────────────
		fnf: {
			salaryDueFrom: { type: String, default: null },
			salaryDueTo: { type: String, default: null },
			leaveBalanceDays: { type: String, default: null },
			leaveEncashmentAmount: { type: String, default: null },
			noticePayRecovery: { type: String, default: null },
			assetRecovery: { type: String, default: null },
			otherDeductions: { type: String, default: null },
			/** Net F&F payable and the date it is/was settled — printed on the
			 *  final handover page and mailed with the closing documents. */
			netAmount: { type: String, default: null },
			settlementDate: { type: String, default: null },
			approvedBy: { type: String, default: null },
			/** EPFO exit (SOP 10.4). `pfExitProcessed` gates whether PF details
			 *  are shown to the employee in the final handover. */
			pfExitProcessed: { type: Boolean, default: false },
			pfDateOfExit: { type: String, default: null },
			pfRemarks: { type: String, default: null },
			/** Taxation block — only surfaced when HR marks it applicable. */
			taxationApplicable: { type: Boolean, default: false },
			taxationRemarks: { type: String, default: null },
			updatedAt: { type: Date, default: null }
		},

		/** Whether a recommendation letter is being issued — HR's call, per the
		 *  brief ("the recommendation letter if applicable"). */
		recommendationApplicable: { type: Boolean, default: false },

		/** SOP 10.7 exit-completion checklist: itemKey → checked. Kept as a map
		 *  so the checklist is data (offboarding/forms.ts), not schema. */
		closureChecklist: { type: Map, of: Boolean, default: {} },

		// ── System-update tracking (SOP step 10) ─────────────────────────────
		itAccessRevokedMailSentAt: { type: Date, default: null },
		handoverMailSentAt: { type: Date, default: null }
	},
	{ timestamps: true }
);
exitSchema.index({ companyId: 1, status: 1 });
export const Exit = models.Exit ?? model('Exit', exitSchema);

// ── Offboarding: Exit Link Tokens ────────────────────────────────────────────
// Same hash-plus-encrypted-copy pattern as LinkToken/BgvRequest: sha256 is the
// source of truth for verifying an incoming request, the AES copy is
// display-only so HR can always re-show a live link without regenerating it.
//
// One row per (exit, purpose) — an exit hands out three different kinds of
// link over its life, and they must be independently expirable:
//   forms     the employee's exit-documents portal (/x/[token])
//   clearance a single approver's clearance page (/x/clearance/[token])
//   handover  the final documents page, ~30-45 days after LWD (/x/final/[token])
const exitTokenSchema = new Schema(
	{
		exitId: { type: Schema.Types.ObjectId, ref: 'Exit', required: true, index: true },
		purpose: { type: String, enum: ['forms', 'clearance', 'handover'], required: true },
		/** Set only on clearance tokens — which ExitClearance row this link is for. */
		clearanceId: { type: Schema.Types.ObjectId, ref: 'ExitClearance', default: null },
		tokenHash: { type: String, required: true, unique: true },
		tokenEncrypted: { type: String, default: null },
		expiresAt: { type: Date, required: true },
		openedAt: { type: Date, default: null },
		revoked: { type: Boolean, default: false }
	},
	{ timestamps: true }
);
export const ExitToken = models.ExitToken ?? model('ExitToken', exitTokenSchema);

// ── Offboarding: Departmental Clearances ─────────────────────────────────────
// One row per approver asked to clear an exit (SOP step 7). Each carries the
// No-Dues rows that department owns, so the live NDC PDF is the employee's half
// plus every clearance row that has come back. `department` matches a key in
// NDC_SECTIONS (offboarding/forms.ts), which defines the printed rows.
const exitClearanceSchema = new Schema(
	{
		exitId: { type: Schema.Types.ObjectId, ref: 'Exit', required: true, index: true },
		department: {
			type: String,
			enum: ['manager', 'department', 'salesforce', 'it', 'hrd', 'admin', 'finance', 'payroll'],
			required: true
		},
		approverName: { type: String, default: null },
		approverEmail: { type: String, required: true },
		approverDesignation: { type: String, default: null },
		status: { type: String, enum: ['pending', 'sent', 'completed'], default: 'pending' },
		/** Per-row verdict for this department's NDC rows: rowKey → dues|no_dues. */
		rows: { type: Map, of: String, default: {} },
		/** Per-row remark, rowKey → text. */
		rowRemarks: { type: Map, of: String, default: {} },
		/** Department-level overall verdict and remarks (the NDC's Remarks column). */
		verdict: { type: String, enum: ['dues', 'no_dues', null], default: null },
		remarks: { type: String, default: null },
		/** Signature image in GridFS, drawn into the NDC PDF. */
		signatureGridfsId: { type: Schema.Types.ObjectId, default: null },
		signatureMime: { type: String, default: null },
		sentAt: { type: Date, default: null },
		sentCount: { type: Number, default: 0 },
		completedAt: { type: Date, default: null },
		completedIp: { type: String, default: null }
	},
	{ timestamps: true }
);
exitClearanceSchema.index({ exitId: 1, department: 1 }, { unique: true });
export const ExitClearance = models.ExitClearance ?? model('ExitClearance', exitClearanceSchema);

// ── Offboarding: Exit Documents (file bytes in GridFS) ───────────────────────
// Both directions of file exchange for an exit, in one collection:
//   - `source: 'employee'` — what the employee uploads (their signature image,
//     an asset-return photo, the new employer's offer letter the Relieving
//     Formalities form asks for).
//   - `source: 'hr'` — what HR uploads for the final handover: the three
//     payslips, the relieving and experience letters, the recommendation
//     letter, PF withdrawal proof, Form 16. These are the files the employee
//     downloads from the handover link.
// Generated PDFs (NDC, NDA, exit interview, relieving formalities, gratuity)
// are NOT stored here — they are rendered live on every download so HR always
// gets current data, per the brief.
const exitDocumentSchema = new Schema(
	{
		exitId: { type: Schema.Types.ObjectId, ref: 'Exit', required: true, index: true },
		source: { type: String, enum: ['employee', 'hr'], required: true },
		docType: { type: String, required: true },
		label: { type: String, default: null },
		gridfsId: { type: Schema.Types.ObjectId, required: true },
		mime: { type: String, required: true },
		sizeBytes: { type: Number, required: true },
		uploadedBy: { type: Schema.Types.ObjectId, ref: 'Admin', default: null },
		reviewStatus: {
			type: String,
			enum: ['uploaded', 'accepted', 'reupload_requested'],
			default: 'uploaded'
		},
		reviewNote: { type: String, default: null }
	},
	{ timestamps: true }
);
exitDocumentSchema.index({ exitId: 1, docType: 1 });
export const ExitDocument = models.ExitDocument ?? model('ExitDocument', exitDocumentSchema);

export type ExitDoc = InstanceType<typeof Exit> & { _id: Types.ObjectId };
export type ExitClearanceDoc = InstanceType<typeof ExitClearance> & { _id: Types.ObjectId };
export type ExitTokenDoc = InstanceType<typeof ExitToken> & { _id: Types.ObjectId };
export type ExitDocumentDoc = InstanceType<typeof ExitDocument> & { _id: Types.ObjectId };
