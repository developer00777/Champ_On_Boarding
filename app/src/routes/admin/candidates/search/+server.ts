// Live typeahead for the candidates search box — a handful of best matches
// as the admin types, so they can jump straight to a candidate instead of
// submitting the full filtered list. Keep this endpoint cheap: small limit,
// projected fields only, name/employee-code prefix matched first (uses the
// index) with a substring fallback so mid-name typos still surface results.
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { Candidate } from '$lib/server/db/schema';

const LIMIT = 8;

export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.admin) error(401, 'Not authenticated');

	const q = (url.searchParams.get('q') ?? '').trim();
	if (!q) return json({ results: [] });

	const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
	const prefix = new RegExp('^' + escaped, 'i');
	const substring = new RegExp(escaped, 'i');

	// Prefix matches first (hits the index), topped up with substring matches
	// if there aren't enough — a plain concat + de-dupe, not a second round trip.
	const prefixHits = await Candidate.find({ $or: [{ fullName: prefix }, { employeeId: prefix }] }, 'fullName email employeeId track')
		.limit(LIMIT)
		.lean();

	let results = prefixHits;
	if (results.length < LIMIT) {
		const seen = new Set(results.map((c) => String(c._id)));
		const fillerHits = await Candidate.find({ $or: [{ fullName: substring }, { employeeId: substring }] }, 'fullName email employeeId track')
			.limit(LIMIT)
			.lean();
		for (const c of fillerHits) {
			if (results.length >= LIMIT) break;
			if (seen.has(String(c._id))) continue;
			seen.add(String(c._id));
			results.push(c);
		}
	}

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
