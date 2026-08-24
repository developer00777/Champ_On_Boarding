import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { audit } from '$lib/server/audit';
import {
	getItSetupMailSettings,
	saveItSetupMailSettings,
	parseRecipients,
	IT_SETUP_MAIL_DEFAULTS
} from '$lib/server/settings';
import {
	EXIT_MAIL_DEFAULTS,
	getExitMailSettings,
	saveExitMailSettings
} from '$lib/server/offboarding/mail';

export const load: PageServerLoad = async ({ locals }) => {
	const [itSetupMail, exitMail] = await Promise.all([
		getItSetupMailSettings(),
		getExitMailSettings()
	]);
	return {
		itSetupMail,
		defaults: IT_SETUP_MAIL_DEFAULTS,
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
	saveItSetupMail: async ({ request, locals, getClientAddress }) => {
		if (locals.admin?.role !== 'super_admin')
			return fail(403, { error: 'Only a super admin can change these settings.' });

		const form = await request.formData();
		const to = parseRecipients(String(form.get('to') ?? ''));
		const cc = parseRecipients(String(form.get('cc') ?? ''));
		const signoffName = String(form.get('signoffName') ?? '').trim().slice(0, 80);
		const signoffDesignation = String(form.get('signoffDesignation') ?? '').trim().slice(0, 80);

		// An empty To would silently send nowhere, so it is the one field that
		// cannot be cleared. Cc legitimately can be.
		if (!to.length)
			return fail(400, { error: 'Enter at least one valid "To" address.' });

		await saveItSetupMailSettings({ to, cc, signoffName, signoffDesignation }, locals.admin.id);
		await audit({
			actor: locals.admin.email,
			action: 'settings_updated',
			field: 'it_setup_mail',
			newValue: `to: ${to.join(', ')} | cc: ${cc.join(', ') || '—'} | signoff: ${signoffName}`,
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
