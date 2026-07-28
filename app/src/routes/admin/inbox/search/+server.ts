// Live typeahead for the inbox search box — best-matching messages by
// subject, address, or linked candidate name/employee code, cheap enough to
// run on every keystroke (small limit, projected fields only).
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { Candidate, EmailMessage } from '$lib/server/db/schema';

const LIMIT = 8;

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.admin) error(401, 'Not authenticated');

	const q = (url.searchParams.get('q') ?? '').trim();
	if (!q) return json({ results: [] });

	const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');

	const hitIds = (await Candidate.find({ $or: [{ fullName: rx }, { employeeId: rx }] }, '_id').limit(50).lean()).map((c) => c._id);

	const qClauses: Record<string, unknown>[] = [{ from: rx }, { to: rx }, { subject: rx }];
	if (hitIds.length) qClauses.push({ candidateId: { $in: hitIds } });

	const messages = await EmailMessage.find({ $or: qClauses }, 'direction candidateId from to subject createdAt')
		.sort({ createdAt: -1 })
		.limit(LIMIT)
		.lean();

	const candidateIds = [...new Set(messages.filter((m) => m.candidateId).map((m) => String(m.candidateId)))];
	const candidates = candidateIds.length ? await Candidate.find({ _id: { $in: candidateIds } }, 'fullName email').lean() : [];
	const candidateById = new Map(candidates.map((c) => [String(c._id), c]));

	return json({
		results: messages.map((m) => {
			const candidate = m.candidateId ? candidateById.get(String(m.candidateId)) : null;
			// There's no per-message deep link on /admin/inbox (rows expand in place),
			// so jump to the linked candidate when there is one; otherwise fall back
			// to a scoped inbox search on this message's own subject so the row
			// surfaces at the top of the filtered list.
			const href = m.candidateId ? `/admin/candidates/${m.candidateId}` : `/admin/inbox?q=${encodeURIComponent(m.subject || m.from)}`;
			return {
				id: String(m._id),
				direction: m.direction,
				candidateName: candidate?.fullName ?? candidate?.email ?? null,
				from: m.from,
				to: m.to,
				subject: m.subject,
				createdAt: m.createdAt.toISOString(),
				href
			};
		})
	});
};
