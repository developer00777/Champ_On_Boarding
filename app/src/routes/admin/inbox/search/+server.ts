// Live typeahead for the inbox search box — best-matching messages by
// subject, address, or linked candidate name/employee code, ranked by fuzzy
// score so a typo'd subject or name still surfaces, in relevance order.
// Cheap enough to run on every keystroke: bounded pool, projected fields only.
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { Candidate, EmailMessage } from '$lib/server/db/schema';
import { rankByFuzzyMatch } from '$lib/shared/match';

const LIMIT = 8;
const POOL_LIMIT = 200;

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.admin) error(401, 'Not authenticated');

	const q = (url.searchParams.get('q') ?? '').trim();
	if (!q) return json({ results: [] });

	const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	// Loose per-character substring prefilter, same reasoning as the candidates
	// search endpoint: keep typo'd matches in the pool for the in-memory fuzzy
	// pass, without falling back to a full collection scan.
	const loose = new RegExp(escaped.slice(0, Math.max(2, Math.ceil(escaped.length / 2))), 'i');

	const hitIds = (await Candidate.find({ $or: [{ fullName: loose }, { employeeId: loose }] }, '_id fullName').lean()).map(
		(c) => c._id
	);

	const pool = await EmailMessage.find(
		{ $or: [{ from: loose }, { to: loose }, { subject: loose }, ...(hitIds.length ? [{ candidateId: { $in: hitIds } }] : [])] },
		'direction candidateId from to subject createdAt'
	)
		.sort({ createdAt: -1 })
		.limit(POOL_LIMIT)
		.lean();

	const candidateIds = [...new Set(pool.filter((m) => m.candidateId).map((m) => String(m.candidateId)))];
	const candidates = candidateIds.length ? await Candidate.find({ _id: { $in: candidateIds } }, 'fullName email').lean() : [];
	const candidateById = new Map(candidates.map((c) => [String(c._id), c]));

	const ranked = rankByFuzzyMatch(pool, q, (m) => {
		const candidate = m.candidateId ? candidateById.get(String(m.candidateId)) : null;
		return [m.subject, m.from, m.to, candidate?.fullName];
	}, LIMIT);

	return json({
		results: ranked.map((m) => {
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
