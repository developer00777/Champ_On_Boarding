import {
	pgTable,
	text,
	timestamp,
	boolean,
	integer,
	jsonb,
	uuid
} from 'drizzle-orm/pg-core';

export const companies = pgTable('companies', {
	id: uuid('id').primaryKey().defaultRandom(),
	name: text('name').notNull().unique(),
	// Selects the brand theme (colours, fonts, logo) from src/lib/shared/brands.ts.
	brandSlug: text('brand_slug'),
	active: boolean('active').notNull().default(true)
});

export const admins = pgTable('admins', {
	id: uuid('id').primaryKey().defaultRandom(),
	email: text('email').notNull().unique(),
	passwordHash: text('password_hash').notNull(),
	role: text('role', { enum: ['hr_admin', 'super_admin'] }).notNull(),
	status: text('status', { enum: ['active', 'disabled'] }).notNull().default('active'),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const sessions = pgTable('sessions', {
	id: uuid('id').primaryKey().defaultRandom(),
	adminId: uuid('admin_id').notNull().references(() => admins.id),
	tokenHash: text('token_hash').notNull().unique(),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const candidates = pgTable('candidates', {
	id: uuid('id').primaryKey().defaultRandom(),
	companyId: uuid('company_id').notNull().references(() => companies.id),
	track: text('track', { enum: ['intern', 'fresher', 'experienced'] }).notNull(),

	fullName: text('full_name'),
	dob: text('dob'),
	gender: text('gender'),
	email: text('email').notNull(),
	mobile: text('mobile'),

	fatherName: text('father_name'),
	fatherMobile: text('father_mobile'),
	motherName: text('mother_name'),
	motherMobile: text('mother_mobile'),
	motherDob: text('mother_dob'),
	maritalStatus: text('marital_status', { enum: ['single', 'married'] }),
	spouseName: text('spouse_name'),
	spouseContact: text('spouse_contact'),
	spouseDob: text('spouse_dob'),

	presentAddress: text('present_address'),
	presentPin: text('present_pin'),
	presentHouseNo: text('present_house_no'),
	permanentAddress: text('permanent_address'),
	permanentPin: text('permanent_pin'),
	permanentHouseNo: text('permanent_house_no'),

	aadhaarNoEncrypted: text('aadhaar_no_encrypted'),
	aadhaarLast4: text('aadhaar_last4'),
	panNo: text('pan_no'),
	uanNo: text('uan_no'),
	dlNo: text('dl_no'),
	passportNo: text('passport_no'),

	bankName: text('bank_name'),
	accountNo: text('account_no'),
	ifsc: text('ifsc'),
	branch: text('branch'),

	// OCR-suggested values keyed by candidate field name; never authoritative (PRD §4)
	ocrSuggestions: jsonb('ocr_suggestions').$type<Record<string, string>>().default({}),

	consentAt: timestamp('consent_at', { withTimezone: true }),
	consentIp: text('consent_ip'),

	status: text('status', {
		enum: [
			'created',
			'opened',
			'in_progress',
			'submitted',
			'changes_requested',
			'approved',
			'complete',
			'revoked'
		]
	})
		.notNull()
		.default('created'),

	createdBy: uuid('created_by').references(() => admins.id),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
	submittedAt: timestamp('submitted_at', { withTimezone: true }),
	reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
	reviewedBy: uuid('reviewed_by').references(() => admins.id)
});

export const linkTokens = pgTable('link_tokens', {
	id: uuid('id').primaryKey().defaultRandom(),
	candidateId: uuid('candidate_id').notNull().references(() => candidates.id),
	tokenHash: text('token_hash').notNull().unique(),
	expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
	openedAt: timestamp('opened_at', { withTimezone: true }),
	revoked: boolean('revoked').notNull().default(false),
	createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow()
});

export const documents = pgTable('documents', {
	id: uuid('id').primaryKey().defaultRandom(),
	candidateId: uuid('candidate_id').notNull().references(() => candidates.id),
	docType: text('doc_type').notNull(),
	spacesKey: text('spaces_key').notNull(),
	mime: text('mime').notNull(),
	sizeBytes: integer('size_bytes').notNull(),
	ocrStatus: text('ocr_status', {
		enum: ['pending', 'parsed', 'unreadable', 'failed', 'store_only']
	})
		.notNull()
		.default('pending'),
	ocrJson: jsonb('ocr_json').$type<Record<string, unknown>>(),
	ocrTranscript: text('ocr_transcript'),
	confirmed: boolean('confirmed').notNull().default(false),
	reviewStatus: text('review_status', {
		enum: ['uploaded', 'flagged', 'accepted', 'reupload_requested']
	})
		.notNull()
		.default('uploaded'),
	reviewNote: text('review_note'),
	uploadedAt: timestamp('uploaded_at', { withTimezone: true }).notNull().defaultNow()
});

export const physicalItems = pgTable('physical_items', {
	id: uuid('id').primaryKey().defaultRandom(),
	candidateId: uuid('candidate_id').notNull().references(() => candidates.id),
	itemType: text('item_type', {
		enum: ['passport_photos_x4', 'offer_letter_signed']
	}).notNull(),
	received: boolean('received').notNull().default(false),
	receivedAt: timestamp('received_at', { withTimezone: true }),
	receivedBy: uuid('received_by').references(() => admins.id),
	note: text('note')
});

export const auditLog = pgTable('audit_log', {
	id: uuid('id').primaryKey().defaultRandom(),
	candidateId: uuid('candidate_id'),
	actor: text('actor').notNull(), // admin email or 'candidate' or 'system'
	action: text('action').notNull(),
	field: text('field'),
	oldValue: text('old_value'),
	newValue: text('new_value'),
	ip: text('ip'),
	at: timestamp('at', { withTimezone: true }).notNull().defaultNow()
});

export type Candidate = typeof candidates.$inferSelect;
export type Doc = typeof documents.$inferSelect;
export type Admin = typeof admins.$inferSelect;
export type PhysicalItem = typeof physicalItems.$inferSelect;
