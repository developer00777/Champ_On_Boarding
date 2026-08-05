// BGV dashboard — experienced-like candidates only (fresher/intern hires have
// no previous employer to verify against, so they never appear here).
import type { PageServerLoad } from './$types';
import { Candidate, Company, BgvRequest } from '$lib/server/db/schema';
import { EXP_LIKE_TRACKS, TRACK_LABELS, type Track } from '$lib/shared/matrix';

export const load: PageServerLoad = async () => {
	const candidates = await Candidate.find({
		track: { $in: EXP_LIKE_TRACKS },
		status: { $ne: 'revoked' }
	})
		.sort({ createdAt: -1 })
		.lean();

	const ids = candidates.map((c) => c._id);
	const [companies, bgvs] = await Promise.all([
		Company.find({}).lean(),
		BgvRequest.find({ candidateId: { $in: ids } }).lean()
	]);
	const companyById = new Map(companies.map((c) => [String(c._id), c.name]));
	const bgvByCandidate = new Map(bgvs.map((b) => [String(b.candidateId), b]));

	return {
		rows: candidates.map((c) => {
			const bgv = bgvByCandidate.get(String(c._id));
			return {
				id: String(c._id),
				name: c.fullName || c.email,
				trackLabel: TRACK_LABELS[c.track as Track] ?? c.track,
				entity: companyById.get(String(c.companyId)) ?? '—',
				prevCompany: c.prevCompanyName ?? null,
				prevHrEmail: c.prevHrEmail ?? null,
				candidateStatus: c.status,
				bgvStatus: (bgv?.status ?? 'pending') as 'pending' | 'sent' | 'completed',
				sentAt: bgv?.sentAt?.toISOString() ?? null,
				sentCount: bgv?.sentCount ?? 0,
				replyReceivedAt: bgv?.replyReceivedAt?.toISOString() ?? null,
				completedAt: bgv?.completedAt?.toISOString() ?? null
			};
		})
	};
};
