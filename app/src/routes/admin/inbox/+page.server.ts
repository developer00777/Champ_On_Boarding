import type { PageServerLoad } from './$types';
import { Candidate, EmailMessage } from '$lib/server/db/schema';
import { RANGE_KEYS, rangeStart, type RangeKey } from '$lib/shared/ranges';

const DIRECTIONS = ['all', 'outbound', 'inbound'] as const;
type Direction = (typeof DIRECTIONS)[number];

const PAGE_SIZE = 50;

export const load: PageServerLoad = async ({ url }) => {
	const range = (url.searchParams.get('range') as RangeKey) || 'all';
	const direction = (url.searchParams.get('direction') as Direction) || 'all';
	const mailbox = url.searchParams.get('mailbox') ?? '';
	const page = Math.max(1, Number(url.searchParams.get('page') ?? '1') || 1);

	const query: Record<string, unknown> = {};
	if (direction !== 'all') query.direction = direction;
	if (mailbox) {
		// A message's own mailbox is `to` for inbound (candidate → offer@/onboarding@)
		// and `from` for outbound (offer@/onboarding@ → candidate) — matching on
		// either side is what "everything through this mailbox" means to HR.
		query.$or = [{ from: { $regex: mailbox, $options: 'i' } }, { to: { $regex: mailbox, $options: 'i' } }];
	}
	const start = rangeStart(range);
	if (start) query.createdAt = { $gte: start };

	const [total, messages] = await Promise.all([
		EmailMessage.countDocuments(query),
		EmailMessage.find(query)
			.sort({ createdAt: -1 })
			.skip((page - 1) * PAGE_SIZE)
			.limit(PAGE_SIZE)
			.lean()
	]);

	const candidateIds = [...new Set(messages.filter((m) => m.candidateId).map((m) => String(m.candidateId)))];
	const candidates = candidateIds.length
		? await Candidate.find({ _id: { $in: candidateIds } }, 'fullName email').lean()
		: [];
	const candidateById = new Map(candidates.map((c) => [String(c._id), c]));

	return {
		messages: messages.map((m) => {
			const candidate = m.candidateId ? candidateById.get(String(m.candidateId)) : null;
			return {
				id: String(m._id),
				direction: m.direction,
				candidateId: m.candidateId ? String(m.candidateId) : null,
				candidateName: candidate?.fullName ?? candidate?.email ?? null,
				from: m.from,
				to: m.to,
				subject: m.subject,
				text: m.text,
				purpose: m.purpose,
				status: m.status,
				statusDetail: m.statusDetail,
				createdAt: m.createdAt.toISOString()
			};
		}),
		total,
		page,
		pageSize: PAGE_SIZE,
		range,
		direction,
		mailbox,
		ranges: RANGE_KEYS
	};
};
