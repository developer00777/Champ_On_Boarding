// The welcome mail exactly as the joiner will receive it, for HR to read before
// sending. Same builder as the send (see welcome-mail.ts), so the preview
// cannot drift from the real thing.
import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { buildWelcomeMail } from '$lib/server/welcome-mail';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.admin) error(401, 'Not authenticated');
	if (locals.admin.role !== 'super_admin' && locals.admin.role !== 'hr_admin')
		error(403, 'Only HR or a super admin can do this.');

	const draft = await buildWelcomeMail(params.id);
	return json({
		to: draft.to,
		cc: draft.cc,
		subject: draft.subject,
		html: draft.html,
		attachments: draft.attachments,
		hasPhoto: draft.hasPhoto,
		missing: draft.missing,
		blocker: draft.blocker
	});
};
