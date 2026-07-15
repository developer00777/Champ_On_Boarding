import type { PageServerLoad } from './$types';
import { Candidate } from '$lib/server/db/schema';
import { TRACKS } from '$lib/shared/matrix';
import { RANGE_KEYS, rangeStart, type RangeKey } from '$lib/shared/ranges';

export const load: PageServerLoad = async ({ url }) => {
	const range = (url.searchParams.get('range') ?? 'all') as RangeKey;
	const safeRange: RangeKey = RANGE_KEYS.includes(range) ? range : 'all';
	const track = url.searchParams.get('track') ?? '';
	const status = url.searchParams.get('status') ?? '';

	// Filter in the query, not the client: this list only grows, and the page
	// should not ship every candidate to the browser to hide most of them.
	const where: Record<string, unknown> = {};
	const from = rangeStart(safeRange);
	if (from) where.createdAt = { $gte: from };
	if (track) where.track = track;
	if (status) where.status = status;

	const [docs, total] = await Promise.all([
		Candidate.find(where).populate('companyId').sort({ createdAt: -1 }).lean(),
		Candidate.countDocuments()
	]);

	return {
		candidates: docs.map((c) => {
			const company = c.companyId as unknown as { name: string };
			return {
				id: String(c._id),
				email: c.email,
				fullName: c.fullName ?? null,
				track: c.track,
				status: c.status,
				company: company?.name ?? '',
				createdAt: (c as { createdAt: Date }).createdAt.toISOString(),
				submittedAt: c.submittedAt?.toISOString() ?? null
			};
		}),
		total,
		range: safeRange,
		track,
		status,
		tracks: TRACKS
	};
};
