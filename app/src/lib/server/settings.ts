// Admin-editable operational settings, backed by the AppSetting collection.
// Every setting has a code-supplied default, so a fresh install (empty
// collection) behaves exactly as configured here until HR changes it in
// /admin/settings — "keep it as a default unless changed".
import { AppSetting } from './db/schema';

export interface ItSetupMailSettings {
	/** Primary recipients of the "enable the system & configure the VPN" mail. */
	to: string[];
	cc: string[];
	/** Sign-off block under "Regards," in the mail body. */
	signoffName: string;
	signoffDesignation: string;
}

export const IT_SETUP_MAIL_KEY = 'it_setup_mail';

export const IT_SETUP_MAIL_DEFAULTS: ItSetupMailSettings = {
	to: ['ithelpdesk@championsmail.com', 'workforce@championsmail.com', 'learning@championsmail.com'],
	cc: ['hrd.jst@championsmail.com'],
	signoffName: 'Bhavana setty',
	signoffDesignation: 'HR Coordinator'
};

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
