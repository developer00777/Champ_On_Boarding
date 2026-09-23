// What one login has actually done.
//
// The audit trail has been written on 100-odd paths since the portal was built
// and read nowhere, so the record of who did what has never been visible to the
// people accountable for it. This is the first window onto it: one person at a
// time, from the row that names them.
//
// Super-admin only, matching the page it opens from. The trail names everyone's
// actions, so who may read it is a real decision and not an incidental one.
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { Admin, AuditLog, Candidate } from '$lib/server/db/schema';

export const config = { runtime: 'nodejs24.x' };

/** Enough to see a pattern without turning a panel into a dataset. The page
 *  says when it has been cut off rather than implying this is everything. */
const LIMIT = 100;

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.admin) error(401, 'Not authenticated');
	if (locals.admin.role !== 'super_admin')
		error(403, 'Only a super admin can read the activity log.');

	const id = url.searchParams.get('id') ?? '';
	if (!/^[a-f\d]{24}$/i.test(id)) error(400, 'Bad request.');

	const who = await Admin.findById(id).select('email').lean();
	if (!who) error(404, 'Login not found.');

	// Matched on email, not id: the audit trail records the actor as a string
	// precisely so that history outlives the login. That also means this keeps
	// working for a login that has since been deleted and recreated.
	const rows = await AuditLog.find({ actor: who.email })
		.sort({ createdAt: -1 })
		.limit(LIMIT + 1)
		.lean();

	const truncated = rows.length > LIMIT;
	const page = rows.slice(0, LIMIT);

	// Resolve the candidates in one query rather than per row — a busy login's
	// hundred entries would otherwise be a hundred round trips.
	const ids = [...new Set(page.map((r) => r.candidateId).filter(Boolean).map(String))];
	const candidates = ids.length
		? await Candidate.find({ _id: { $in: ids } }).select('fullName email').lean()
		: [];
	const nameById = new Map(
		candidates.map((c) => [String(c._id), (c.fullName as string) ?? (c.email as string)])
	);

	return json({
		email: who.email,
		truncated,
		total: page.length,
		entries: page.map((r) => ({
			at: (r.createdAt as Date).toISOString(),
			action: r.action as string,
			// The record it was about, when it was about one. Some actions —
			// settings, logins, exports — are not tied to a candidate at all.
			subject: r.candidateId ? (nameById.get(String(r.candidateId)) ?? 'a deleted record') : null,
			field: (r.field as string) ?? null,
			from: (r.oldValue as string) ?? null,
			to: (r.newValue as string) ?? null,
			ip: (r.ip as string) ?? null
		}))
	});
};
