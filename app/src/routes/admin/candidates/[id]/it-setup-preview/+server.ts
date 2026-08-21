// The IT/VPN mail exactly as IT will receive it, for HR to eyeball before
// sending. Same builder as the send (see it-setup-mail.ts), so the preview
// cannot drift from the real thing — a blank Shift Timing here is a blank
// Shift Timing in IT's inbox.
import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { buildItSetupMail } from '$lib/server/it-setup-mail';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.admin) error(401, 'Not authenticated');
	// Read-only, but scoped to the roles that can actually send it — no reason
	// for a viewer to pull recipient lists.
	if (locals.admin.role !== 'super_admin' && locals.admin.role !== 'hr_admin')
		error(403, 'Only HR or a super admin can do this.');

	const draft = await buildItSetupMail(params.id);
	return json({
		to: draft.to,
		cc: draft.cc,
		subject: draft.subject,
		html: draft.html,
		fields: draft.fields,
		missing: draft.missing
	});
};
