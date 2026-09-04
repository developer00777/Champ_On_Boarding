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
