// Live typeahead for the candidates search box — a handful of best matches
// as the admin types, so they can jump straight to a candidate instead of
// submitting the full filtered list. Keep this endpoint cheap: a bounded
// candidate pool fetched via a loose Mongo prefilter, ranked in memory by
// fuzzy score so typos ("Kartik") and mid-name matches still surface, in
// relevance order rather than however Mongo happened to return them.
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { Candidate } from '$lib/server/db/schema';
import { rankByFuzzyMatch } from '$lib/shared/match';

const LIMIT = 8;
const POOL_LIMIT = 200;

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.admin) error(401, 'Not authenticated');

	const q = (url.searchParams.get('q') ?? '').trim();
	if (!q) return json({ results: [] });

	const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	// A loose per-character substring prefilter (not a prefix/anchor match) so
	// the pool still contains typo'd names for the in-memory fuzzy pass to rank —
	// a plain substring on the first couple characters is usually enough to keep
	// this a real index-assisted query rather than a full collection scan.
	const loose = new RegExp(escaped.slice(0, Math.max(2, Math.ceil(escaped.length / 2))), 'i');
	const pool = await Candidate.find(
		{ $or: [{ fullName: loose }, { employeeId: loose }, { email: loose }] },
		'fullName email employeeId track'
	)
		.limit(POOL_LIMIT)
		.lean();

	const results = rankByFuzzyMatch(pool, q, (c) => [c.fullName, c.employeeId, c.email], LIMIT);

	return json({
		results: results.map((c) => ({
			id: String(c._id),
			fullName: c.fullName ?? null,
			email: c.email,
			employeeId: c.employeeId ?? null,
			track: c.track
		}))
	});
};
