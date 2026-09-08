// Admin-editable operational settings, backed by the AppSetting collection.
// Every setting has a code-supplied default, so a fresh install (empty
// collection) behaves exactly as configured here until HR changes it in
// /admin/settings — "keep it as a default unless changed".
import { AppSetting } from './db/schema';

export interface ItSetupMailSettings {
	/** Primary recipients of the "enable the system & configure the VPN" mail. */
	to: string[];
	cc: string[];
	/** Subject line template. `{name}` and `{company}` are substituted at send
	 *  time (see IT_SETUP_SUBJECT_TOKENS); any other text is used verbatim, and
	 *  a template with no tokens is a perfectly valid fixed subject. */
	subject: string;
	/** Sign-off block under "Regards," in the mail body. */
	signoffName: string;
	signoffDesignation: string;
}

/** What HR can put in the subject template, and what each stands for. Shared
 *  with the settings form so the help text and the substitution cannot drift. */
export const IT_SETUP_SUBJECT_TOKENS = [
	{ token: '{joiningDate}', means: 'the joining date, as 2-Sep-2026' },
	{ token: '{team}', means: 'the team name' },
	{ token: '{name}', means: "the candidate's name" },
	{ token: '{company}', means: 'the hiring entity' }
] as const;

export interface ItSetupSubjectValues {
	name: string;
	company: string;
	joiningDate: string;
	team: string;
}

export const IT_SETUP_MAIL_KEY = 'it_setup_mail';

export const IT_SETUP_MAIL_DEFAULTS: ItSetupMailSettings = {
	to: ['ithelpdesk@championsmail.com', 'workforce@championsmail.com', 'learning@championsmail.com'],
	cc: ['hrd.jst@championsmail.com'],
	// What IT asked for: "New Joinee 2-Sep-2026 (Creative Team)". Both parts are
	// filled from the record, so HR never retypes a date or a team.
	subject: 'New Joinee {joiningDate} ({team})',
	signoffName: 'Bhavana setty',
	signoffDesignation: 'HR Coordinator'
};

/** Substitutes the subject tokens. Also collapses newlines: a subject is a
 *  single header, and a stray line break pasted into the box would otherwise
 *  be a header-injection vector. */
export function renderItSetupSubject(template: string, values: ItSetupSubjectValues): string {
	return (
		(template || IT_SETUP_MAIL_DEFAULTS.subject)
			.replace(/\{joiningDate\}/g, values.joiningDate)
			.replace(/\{team\}/g, values.team)
			.replace(/\{name\}/g, values.name)
			.replace(/\{company\}/g, values.company)
			.replace(/[\r\n]+/g, ' ')
			// A record with no joining date or team yet would otherwise leave
			// "New Joinee  ()" in the subject; drop the empty bracket and close
			// up the gap instead of shipping the gap.
			.replace(/\(\s*\)/g, '')
			.replace(/\s{2,}/g, ' ')
			.trim()
	);
}

// ── Employee code mail ───────────────────────────────────────────────────────

export interface EmployeeCodeMailSettings {
	to: string[];
	cc: string[];
	/** Subject template. Tokens below; `{requestId}` is the helpdesk thread this
	 *  replies into, and the whole "[Request ID :## ##] :" prefix drops out when
	 *  the candidate has none. */
	subject: string;
	signoffName: string;
	signoffDesignation: string;
}

export const EMPLOYEE_CODE_SUBJECT_TOKENS = [
	{ token: '{requestId}', means: 'the IT helpdesk request ID, if one is set' },
	{ token: '{team}', means: 'the team name' },
	{ token: '{doj}', means: 'the joining date, as 8-Sep-2026' },
	{ token: '{name}', means: "the candidate's name" }
] as const;

export interface EmployeeCodeSubjectValues {
	requestId: string;
	team: string;
	doj: string;
	name: string;
}

export const EMPLOYEE_CODE_MAIL_KEY = 'employee_code_mail';

export const EMPLOYEE_CODE_MAIL_DEFAULTS: EmployeeCodeMailSettings = {
	to: ['ithelpdesk@championsmail.com', 'onboarding@offer.championsmail.com'],
	cc: [
		'hrd.jst@championsmail.com',
		'aleena.j@championsmail.com',
		'bhavana.setty@championsmail.com',
		'dongresalomi.s@championsmail.com',
		'shaik.j@championsmail.com',
		'renuka.b@championsmail.com',
		'delwin.a@championsmail.com'
	],
	subject: 'RE: [Request ID :##{requestId}##] : New Joinee-{team}({doj})',
	signoffName: 'Sarang Manoharan',
	signoffDesignation: ''
};

/** Substitutes the subject tokens. Newlines collapse (a subject is one header),
 *  and an absent request ID takes its bracketed prefix with it rather than
 *  leaving "RE: [Request ID :####] :" in the subject line. */
export function renderEmployeeCodeSubject(
	template: string,
	values: EmployeeCodeSubjectValues
): string {
	return (template || EMPLOYEE_CODE_MAIL_DEFAULTS.subject)
		.replace(/\{requestId\}/g, values.requestId)
		.replace(/\{team\}/g, values.team)
		.replace(/\{doj\}/g, values.doj)
		.replace(/\{name\}/g, values.name)
		.replace(/[\r\n]+/g, ' ')
		// Drops "[Request ID :#### ] :" (and any empty bracket) when the id is
		// blank, then closes up the gap it leaves behind.
		.replace(/\[[^\]]*:\s*##\s*##[^\]]*\]\s*:\s*/g, '')
		.replace(/\(\s*\)/g, '')
		.replace(/\s{2,}/g, ' ')
		.trim();
}

export async function getEmployeeCodeMailSettings(): Promise<EmployeeCodeMailSettings> {
	const row = await AppSetting.findOne({ key: EMPLOYEE_CODE_MAIL_KEY }).lean();
	const v = (row?.value ?? {}) as Partial<EmployeeCodeMailSettings>;
	return {
		// A saved-but-empty To would send the mail nowhere, so it falls back to
		// the default just as an absent one does. Cc is legitimately clearable.
		to: v.to?.length ? v.to : EMPLOYEE_CODE_MAIL_DEFAULTS.to,
		cc: Array.isArray(v.cc) ? v.cc : EMPLOYEE_CODE_MAIL_DEFAULTS.cc,
		subject: v.subject?.trim() || EMPLOYEE_CODE_MAIL_DEFAULTS.subject,
		signoffName: v.signoffName?.trim() || EMPLOYEE_CODE_MAIL_DEFAULTS.signoffName,
		signoffDesignation: v.signoffDesignation?.trim() ?? EMPLOYEE_CODE_MAIL_DEFAULTS.signoffDesignation
	};
}

export async function saveEmployeeCodeMailSettings(
	value: EmployeeCodeMailSettings,
	adminId: string
) {
	await AppSetting.findOneAndUpdate(
		{ key: EMPLOYEE_CODE_MAIL_KEY },
		{ key: EMPLOYEE_CODE_MAIL_KEY, value, updatedBy: adminId },
		{ upsert: true }
	);
}

// ── Fixed dropdown lists ─────────────────────────────────────────────────────
//
// Short, admin-editable option lists that back a dropdown somewhere in the app.
// Kept as a registry rather than one setting per list: adding a future dropdown
// is a single entry here plus wherever it renders, with no new settings screen,
// no new AppSetting key and no migration. All of them live in one AppSetting
// row keyed FIXED_LISTS_KEY.

export interface FixedListDef {
	/** Stable storage key — renaming one orphans whatever HR has saved. */
	key: string;
	label: string;
	help: string;
	defaults: string[];
}

export const FIXED_LIST_DEFS: FixedListDef[] = [
	{
		key: 'officeLocations',
		label: 'Office locations',
		help: 'Offered in the offer letter’s Office location dropdown.',
		defaults: ['JS Tower', 'BCS', 'Ranch']
	},
	{
		key: 'noticePeriods',
		label: 'Notice periods',
		help: 'Offered in both of the offer letter’s notice period dropdowns. Written into the letter verbatim, so phrase them as they should read in a clause.',
		// 15 days is here because the consultant agreement has always defaulted to
		// it; dropping it would leave no way to set a consultant's notice without
		// editing this list first.
		defaults: ['15 days', '30 days', '60 days', '90 days']
	}
];

export const FIXED_LISTS_KEY = 'fixed_lists';

export type FixedLists = Record<string, string[]>;

/** One entry per line, blanks and duplicates dropped, order preserved — the
 *  order HR types is the order the dropdown offers. */
export function parseFixedList(raw: string): string[] {
	return [...new Set(raw.split('\n').map((l) => l.trim()).filter(Boolean))].slice(0, 100);
}

export async function getFixedLists(): Promise<FixedLists> {
	const row = await AppSetting.findOne({ key: FIXED_LISTS_KEY }).lean();
	const saved = (row?.value ?? {}) as Partial<Record<string, unknown>>;
	const out: FixedLists = {};
	for (const def of FIXED_LIST_DEFS) {
		const v = saved[def.key];
		// A saved-but-empty list would leave the dropdown with nothing to offer,
		// so it falls back to the defaults exactly as an absent one does.
		out[def.key] = Array.isArray(v) && v.length ? (v as string[]) : def.defaults;
	}
	return out;
}

export async function saveFixedLists(value: FixedLists, adminId: string) {
	await AppSetting.findOneAndUpdate(
		{ key: FIXED_LISTS_KEY },
		{ key: FIXED_LISTS_KEY, value, updatedBy: adminId },
		{ upsert: true }
	);
}

/** Splits an HR-typed recipient box into addresses. Accepts the shapes people
 *  actually paste out of Outlook — semicolon- or comma-separated, quoted,
 *  wrapped in <>, one per line — and drops anything that isn't an address so a
 *  stray separator can never become a bogus recipient Resend rejects. */
export function parseRecipients(raw: string): string[] {
	return [
		...new Set(
			raw
				.split(/[;,\n]/)
				.map((p) => p.trim().replace(/^['"]|['"]$/g, '').trim())
				.map((p) => {
					const angled = p.match(/<([^>]+)>/);
					return (angled ? angled[1] : p).trim().toLowerCase();
				})
				.filter((p) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p))
		)
	];
}

export async function getItSetupMailSettings(): Promise<ItSetupMailSettings> {
	const row = await AppSetting.findOne({ key: IT_SETUP_MAIL_KEY }).lean();
	const v = (row?.value ?? {}) as Partial<ItSetupMailSettings>;
	return {
		// A saved-but-empty To list would silently send the mail nowhere, so an
		// empty array falls back to the defaults just like an absent one.
		to: v.to?.length ? v.to : IT_SETUP_MAIL_DEFAULTS.to,
		// Cc is legitimately clearable — HR may want no one copied.
		cc: Array.isArray(v.cc) ? v.cc : IT_SETUP_MAIL_DEFAULTS.cc,
		// A blank subject would send a subjectless mail, so it falls back the same
		// way the To list does.
		subject: v.subject?.trim() || IT_SETUP_MAIL_DEFAULTS.subject,
		signoffName: v.signoffName?.trim() || IT_SETUP_MAIL_DEFAULTS.signoffName,
		signoffDesignation: v.signoffDesignation?.trim() || IT_SETUP_MAIL_DEFAULTS.signoffDesignation
	};
}

export async function saveItSetupMailSettings(value: ItSetupMailSettings, adminId: string) {
	await AppSetting.findOneAndUpdate(
		{ key: IT_SETUP_MAIL_KEY },
		{ key: IT_SETUP_MAIL_KEY, value, updatedBy: adminId },
		{ upsert: true }
	);
}
