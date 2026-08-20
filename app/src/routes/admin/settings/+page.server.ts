import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { audit } from '$lib/server/audit';
import {
	getItSetupMailSettings,
	saveItSetupMailSettings,
	parseRecipients,
	IT_SETUP_MAIL_DEFAULTS
} from '$lib/server/settings';

export const load: PageServerLoad = async ({ locals }) => {
	const itSetupMail = await getItSetupMailSettings();
	return {
		itSetupMail,
		defaults: IT_SETUP_MAIL_DEFAULTS,
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
	}
};
