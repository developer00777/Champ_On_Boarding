import type { PageServerLoad } from './$types';
import { Candidate, Company, OfferLetter } from '$lib/server/db/schema';
import { TRACKS } from '$lib/shared/matrix';
import { RANGE_KEYS, rangeStart, type RangeKey } from '$lib/shared/ranges';

export const load: PageServerLoad = async ({ url }) => {
	const range = (url.searchParams.get('range') ?? 'all') as RangeKey;
	const safeRange: RangeKey = RANGE_KEYS.includes(range) ? range : 'all';
	const track = url.searchParams.get('track') ?? '';
	const status = url.searchParams.get('status') ?? '';
	// The entity, as a company id. Filtering on the id rather than the name
	// means a company renamed in /admin/entities does not silently drop out of
	// its own saved filter link.
	const entity = url.searchParams.get('entity') ?? '';
	const q = (url.searchParams.get('q') ?? '').trim();

	// Filter in the query, not the client: this list only grows, and the page
	// should not ship every candidate to the browser to hide most of them.
	const where: Record<string, unknown> = {};
	const from = rangeStart(safeRange);
	if (from) where.createdAt = { $gte: from };
	if (track) where.track = track;
	if (status) where.status = status;
	// Only when it is a plausible ObjectId. Mongoose throws a CastError on
	// anything else, which surfaced as a 500 on a hand-typed or stale URL —
	// a filter nobody can satisfy should return nothing, not break the page.
	if (/^[a-f\d]{24}$/i.test(entity)) where.companyId = entity;
	if (q) {
		// Literal substring match (regex metacharacters escaped), case-insensitive,
		// against the candidate's name or their employee code once generated.
		const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
		where.$or = [{ fullName: rx }, { employeeId: rx }];
	}

	// Every company that actually has candidates, so the dropdown offers the
	// entities the list can show rather than all twelve — a filter that can
	// only ever return nothing is worse than no filter.
	const [docs, total, usedCompanyIds] = await Promise.all([
		Candidate.find(where).populate('companyId').sort({ createdAt: -1 }).lean(),
		Candidate.countDocuments(),
		Candidate.distinct('companyId')
	]);
	const companies = await Company.find({ _id: { $in: usedCompanyIds } })
		.select('name')
		.sort({ name: 1 })
		.lean();
	const offerLetters = await OfferLetter.find({ candidateId: { $in: docs.map((c) => c._id) } })
		.select('candidateId joiningDate status sentAt')
		.lean();
	const joiningDateByCandidateId = new Map(
		offerLetters.map((o) => [String(o.candidateId), o.joiningDate ?? null])
	);
	// Whether the letter has gone out is the question the list gets asked most
	// often after "have they been approved", and answering it meant opening each
	// record in turn. It rides along on the join that was already happening.
	const offerSentByCandidateId = new Map(
		offerLetters.map((o) => [String(o.candidateId), o.status === 'sent'])
	);

	return {
		candidates: docs.map((c) => {
			const company = c.companyId as unknown as { name: string };
			return {
				id: String(c._id),
				email: c.email,
				fullName: c.fullName ?? null,
				track: c.track,
				status: c.status,
				// Carried into the list so a decision one person took is visible to
				// everyone scanning for work, not only to whoever opens the record.
				// Without it the list looked identical before and after an Accept.
				hiringDecision: c.hiringDecision ?? null,
				company: company?.name ?? '',
				createdAt: (c as { createdAt: Date }).createdAt.toISOString(),
				submittedAt: c.submittedAt?.toISOString() ?? null,
				joiningDate: joiningDateByCandidateId.get(String(c._id)) ?? null,
				offerLetterSent: offerSentByCandidateId.get(String(c._id)) ?? false
			};
		}),
		total,
		range: safeRange,
		track,
		status,
		entity,
		entities: companies.map((c) => ({ id: String(c._id), name: c.name as string })),
		q,
		tracks: TRACKS
	};
};
