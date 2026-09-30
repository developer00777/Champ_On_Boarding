import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { audit } from '$lib/server/audit';
import { levelsToday, mayToday } from '$lib/server/access';
import { CAPS, SETTINGS_CAPS, type SettingsCap } from '$lib/shared/access';
import {
	getItSetupMailSettings,
	saveItSetupMailSettings,
	parseRecipients,
	IT_SETUP_MAIL_DEFAULTS,
	IT_SETUP_SUBJECT_TOKENS,
	FIXED_LIST_DEFS,
	getFixedLists,
	saveFixedLists,
	parseFixedList,
	type FixedLists,
	EMPLOYEE_CODE_MAIL_DEFAULTS,
	EMPLOYEE_CODE_SUBJECT_TOKENS,
	getEmployeeCodeMailSettings,
	saveEmployeeCodeMailSettings
} from '$lib/server/settings';
import {
	EXIT_MAIL_DEFAULTS,
	getExitMailSettings,
	saveExitMailSettings
} from '$lib/server/offboarding/mail';

// Each section of this page is its own capability in the access studio's
// Access & org module (SETTINGS_CAPS), and this page is where they are
// enforced: Act edits the section, View reads it, none hides it. A super admin
// holds all four at Act; everyone else reads them unless given more, one
// section at a time.
const LABEL: Record<SettingsCap, string> = {
	'settings.itMail': 'the IT & VPN setup mail',
	'settings.empCodeMail': 'the employee code mail',
	'settings.exitMail': 'the offboarding mail',
	'settings.lists': 'the dropdown options'
};

/** The refusal for a save this login may not make, or null when it may. */
async function deny(admin: App.Locals['admin'], cap: SettingsCap) {
	if (await mayToday(admin, cap, 'act')) return null;
	return fail(403, {
		error: `You can’t change ${LABEL[cap]}. A super admin can give you Act on “${CAPS[cap].label}” in Access & org, or ask Champ to request it.`
	});
}

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.admin) redirect(303, '/admin/login');
	const level = await levelsToday(locals.admin, SETTINGS_CAPS);
	const see = (c: SettingsCap) => level[c] !== 'none';
	const [itSetupMail, exitMail, fixedLists, employeeCodeMail] = await Promise.all([
		see('settings.itMail') ? getItSetupMailSettings() : null,
		see('settings.exitMail') ? getExitMailSettings() : null,
		see('settings.lists') ? getFixedLists() : null,
		see('settings.empCodeMail') ? getEmployeeCodeMailSettings() : null
	]);
	return {
		// A hidden section's settings are not sent at all: hiding it in the page
		// while its recipient list sat in the page data would hide nothing.
		itSetupMail,
		defaults: IT_SETUP_MAIL_DEFAULTS,
		// Passed as data rather than imported by the component: settings.ts is a
		// $lib/server module and must never reach the client bundle.
		subjectTokens: IT_SETUP_SUBJECT_TOKENS,
		fixedLists,
		fixedListDefs: FIXED_LIST_DEFS,
		employeeCodeMail,
		employeeCodeDefaults: EMPLOYEE_CODE_MAIL_DEFAULTS,
		employeeCodeTokens: EMPLOYEE_CODE_SUBJECT_TOKENS,
		exitMail,
		exitDefaults: EXIT_MAIL_DEFAULTS,
		canEdit: {
			itMail: level['settings.itMail'] === 'act',
			empCodeMail: level['settings.empCodeMail'] === 'act',
			exitMail: level['settings.exitMail'] === 'act',
			lists: level['settings.lists'] === 'act'
		},
		capLabel: Object.fromEntries(SETTINGS_CAPS.map((c) => [c, CAPS[c].label])) as Record<SettingsCap, string>
	};
};

export const actions: Actions = {
	// Every save below changes what leaves the building or what everyone can
	// pick, so none is open by default: each needs Act on its own section, which
	// a super admin has and hands out per person in the access studio.
	/** The fixed dropdown lists. One action for all of them — a future list is an
	 *  entry in FIXED_LIST_DEFS and a textarea, not another action. */
	saveFixedLists: async ({ request, locals, getClientAddress }) => {
		const denied = await deny(locals.admin, 'settings.lists');
		if (denied) return denied;

		const form = await request.formData();
		const next: FixedLists = {};
		const empty: string[] = [];
		for (const def of FIXED_LIST_DEFS) {
			const items = parseFixedList(String(form.get(def.key) ?? ''));
			// An empty list leaves its dropdown with nothing to pick, so it is
			// rejected rather than saved — clearing one is almost always a slip.
			if (!items.length) empty.push(def.label);
			next[def.key] = items;
		}
		if (empty.length)
			return fail(400, { error: `${empty.join(' and ')} cannot be empty — add at least one option.` });

		await saveFixedLists(next, locals.admin!.id);
		await audit({
			actor: locals.admin!.email,
			action: 'settings_updated',
			field: 'fixed_lists',
			newValue: FIXED_LIST_DEFS.map((d) => `${d.key}: ${next[d.key].join(', ')}`).join(' | '),
			ip: getClientAddress()
		});
		return { fixedListsSaved: true };
	},

	saveEmployeeCodeMail: async ({ request, locals, getClientAddress }) => {
		const denied = await deny(locals.admin, 'settings.empCodeMail');
		if (denied) return denied;

		const form = await request.formData();
		const to = parseRecipients(String(form.get('ecTo') ?? ''));
		const cc = parseRecipients(String(form.get('ecCc') ?? ''));
		const subject = String(form.get('ecSubject') ?? '')
			.replace(/[\r\n]+/g, ' ')
			.trim()
			.slice(0, 200);
		const signoffName = String(form.get('ecSignoffName') ?? '').trim().slice(0, 80);
		const signoffDesignation = String(form.get('ecSignoffDesignation') ?? '').trim().slice(0, 80);

		if (!to.length) return fail(400, { error: 'Enter at least one valid "To" address.' });

		await saveEmployeeCodeMailSettings(
			{ to, cc, subject, signoffName, signoffDesignation },
			locals.admin!.id
		);
		await audit({
			actor: locals.admin!.email,
			action: 'settings_updated',
			field: 'employee_code_mail',
			newValue: `to: ${to.join(', ')} | cc: ${cc.join(', ') || '—'} | subject: ${subject || '(default)'}`,
			ip: getClientAddress()
		});
		return { employeeCodeMailSaved: true };
	},

	saveItSetupMail: async ({ request, locals, getClientAddress }) => {
		const denied = await deny(locals.admin, 'settings.itMail');
		if (denied) return denied;

		const form = await request.formData();
		const to = parseRecipients(String(form.get('to') ?? ''));
		const cc = parseRecipients(String(form.get('cc') ?? ''));
		const signoffName = String(form.get('signoffName') ?? '').trim().slice(0, 80);
		const signoffDesignation = String(form.get('signoffDesignation') ?? '').trim().slice(0, 80);
		// Newlines stripped here as well as at render time: a subject is one
		// header, and it should not be possible to store a multi-line one.
		const subject = String(form.get('subject') ?? '')
			.replace(/[\r\n]+/g, ' ')
			.trim()
			.slice(0, 200);

		// An empty To would silently send nowhere, so it is the one field that
		// cannot be cleared. Cc legitimately can be.
		if (!to.length)
			return fail(400, { error: 'Enter at least one valid "To" address.' });

		await saveItSetupMailSettings(
			{ to, cc, subject, signoffName, signoffDesignation },
			locals.admin!.id
		);
		await audit({
			actor: locals.admin!.email,
			action: 'settings_updated',
			field: 'it_setup_mail',
			newValue: `to: ${to.join(', ')} | cc: ${cc.join(', ') || '—'} | subject: ${subject || '(default)'} | signoff: ${signoffName}`,
			ip: getClientAddress()
		});
		return { saved: true };
	},

	// Puts every field back to the code-supplied default in one click, rather
	// than making HR retype four addresses from memory to undo a bad edit.
	resetItSetupMail: async ({ locals, getClientAddress }) => {
		const denied = await deny(locals.admin, 'settings.itMail');
		if (denied) return denied;
		await saveItSetupMailSettings(IT_SETUP_MAIL_DEFAULTS, locals.admin!.id);
		await audit({
			actor: locals.admin!.email,
			action: 'settings_updated',
			field: 'it_setup_mail',
			newValue: 'reset to defaults',
			ip: getClientAddress()
		});
		return { reset: true };
	},

	// Offboarding mail: who IT's "block system access" request goes to, who is
	// copied on the employee-facing exit and handover mails, and how they sign
	// off. An operational call HR makes, but it changes what leaves the
	// building, so it needs Act on the offboarding mail section.
	saveExitMail: async ({ request, locals, getClientAddress }) => {
		const denied = await deny(locals.admin, 'settings.exitMail');
		if (denied) return denied;

		const form = await request.formData();
		const itTo = parseRecipients(String(form.get('itTo') ?? ''));
		const itCc = parseRecipients(String(form.get('itCc') ?? ''));
		const hrCc = parseRecipients(String(form.get('hrCc') ?? ''));
		const signoffName = String(form.get('exitSignoffName') ?? '').trim().slice(0, 80);
		const signoffDesignation = String(form.get('exitSignoffDesignation') ?? '')
			.trim()
			.slice(0, 80);

		// As with the IT setup mail, an empty To would send nowhere. Both Cc
		// lists are legitimately clearable.
		if (!itTo.length)
			return fail(400, { error: 'Enter at least one valid IT "To" address for exit mails.' });

		await saveExitMailSettings(
			{ itTo, itCc, hrCc, signoffName, signoffDesignation },
			locals.admin!.id
		);
		await audit({
			actor: locals.admin!.email,
			action: 'settings_updated',
			field: 'exit_mail',
			newValue: `it: ${itTo.join(', ')} | hrCc: ${hrCc.join(', ') || '—'} | signoff: ${signoffName}`,
			ip: getClientAddress()
		});
		return { exitSaved: true };
	},

	resetExitMail: async ({ locals, getClientAddress }) => {
		const denied = await deny(locals.admin, 'settings.exitMail');
		if (denied) return denied;
		await saveExitMailSettings(EXIT_MAIL_DEFAULTS, locals.admin!.id);
		await audit({
			actor: locals.admin!.email,
			action: 'settings_updated',
			field: 'exit_mail',
			newValue: 'reset to defaults',
			ip: getClientAddress()
		});
		return { exitReset: true };
	}
};
