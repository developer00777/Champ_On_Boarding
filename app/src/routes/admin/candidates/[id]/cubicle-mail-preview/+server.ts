// The cubicle allocation mail exactly as the desks will receive it, for HR to
// eyeball before sending. Same builder as the send (cubicle-mail.ts), so the
// preview cannot drift from the real thing — a blank Floor here is a blank
// Floor in their inbox.
import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { buildCubicleMail } from '$lib/server/cubicle-mail';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.admin) error(401, 'Not authenticated');
	// Read-only, but scoped to the roles that can actually send it — no reason
	// for a viewer to pull recipient lists.
	if (locals.admin.role !== 'super_admin' && locals.admin.role !== 'hr_admin')
		error(403, 'Only HR or a super admin can do this.');

	const draft = await buildCubicleMail(params.id);
	return json({
		to: draft.to,
		cc: draft.cc,
		subject: draft.subject,
		html: draft.html,
		fields: draft.fields,
		missing: draft.missing
	});
};
