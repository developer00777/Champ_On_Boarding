import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { audit } from '$lib/server/audit';
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
	type FixedLists
} from '$lib/server/settings';
import {
	EXIT_MAIL_DEFAULTS,
	getExitMailSettings,
	saveExitMailSettings
} from '$lib/server/offboarding/mail';

export const load: PageServerLoad = async ({ locals }) => {
	const [itSetupMail, exitMail, fixedLists] = await Promise.all([
		getItSetupMailSettings(),
		getExitMailSettings(),
		getFixedLists()
	]);
	return {
		itSetupMail,
		defaults: IT_SETUP_MAIL_DEFAULTS,
		// Passed as data rather than imported by the component: settings.ts is a
		// $lib/server module and must never reach the client bundle.
		subjectTokens: IT_SETUP_SUBJECT_TOKENS,
		fixedLists,
		fixedListDefs: FIXED_LIST_DEFS,
		exitMail,
		exitDefaults: EXIT_MAIL_DEFAULTS,
		isSuperAdmin: locals.admin?.role === 'super_admin'
	};
};

export const actions: Actions = {
	// Who the system/VPN enablement mail goes to, and how it signs off. Changing
	// these is an operational call HR makes, not a redeploy — but it changes what
	// leaves the building, so it stays super-admin only like every other
	// org-wide setting.
	/** The fixed dropdown lists. One action for all of them — a future list is an
	 *  entry in FIXED_LIST_DEFS and a textarea, not another action. */
	saveFixedLists: async ({ request, locals, getClientAddress }) => {
		if (locals.admin?.role !== 'super_admin')
			return fail(403, { error: 'Only a super admin can change these settings.' });

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

		await saveFixedLists(next, locals.admin.id);
		await audit({
			actor: locals.admin.email,
			action: 'settings_updated',
			field: 'fixed_lists',
			newValue: FIXED_LIST_DEFS.map((d) => `${d.key}: ${next[d.key].join(', ')}`).join(' | '),
			ip: getClientAddress()
		});
		return { fixedListsSaved: true };
	},

	saveItSetupMail: async ({ request, locals, getClientAddress }) => {
		if (locals.admin?.role !== 'super_admin')
			return fail(403, { error: 'Only a super admin can change these settings.' });

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
			locals.admin.id
		);
		await audit({
			actor: locals.admin.email,
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
		if (locals.admin?.role !== 'super_admin')
			return fail(403, { error: 'Only a super admin can change these settings.' });
		await saveItSetupMailSettings(IT_SETUP_MAIL_DEFAULTS, locals.admin.id);
		await audit({
			actor: locals.admin.email,
			action: 'settings_updated',
			field: 'it_setup_mail',
			newValue: 'reset to defaults',
			ip: getClientAddress()
		});
		return { reset: true };
	},

	// Offboarding mail: who IT's "block system access" request goes to, who is
	// copied on the employee-facing exit and handover mails, and how they sign
	// off. Same reasoning as the IT setup mail above — an operational call HR
	// makes, but it changes what leaves the building, so super-admin only.
	saveExitMail: async ({ request, locals, getClientAddress }) => {
		if (locals.admin?.role !== 'super_admin')
			return fail(403, { error: 'Only a super admin can change these settings.' });

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
			locals.admin.id
		);
		await audit({
			actor: locals.admin.email,
			action: 'settings_updated',
			field: 'exit_mail',
			newValue: `it: ${itTo.join(', ')} | hrCc: ${hrCc.join(', ') || '—'} | signoff: ${signoffName}`,
			ip: getClientAddress()
		});
		return { exitSaved: true };
	},

	resetExitMail: async ({ locals, getClientAddress }) => {
		if (locals.admin?.role !== 'super_admin')
			return fail(403, { error: 'Only a super admin can change these settings.' });
		await saveExitMailSettings(EXIT_MAIL_DEFAULTS, locals.admin.id);
		await audit({
			actor: locals.admin.email,
			action: 'settings_updated',
			field: 'exit_mail',
			newValue: 'reset to defaults',
			ip: getClientAddress()
		});
		return { exitReset: true };
	}
};
