import type { PageServerLoad } from './$types';
import { Company } from '$lib/server/db/schema';
import { RANGE_KEYS, RANGE_LABELS, rangeStart, type RangeKey } from '$lib/shared/ranges';
import { TRACKS, TRACK_LABELS, type Track } from '$lib/shared/matrix';
import {
	getFunnelSnapshot,
	getTrendSeries,
	getStageDurations,
	getDocSlotSatisfaction,
	getVerificationStats,
	getCompanyTrackBreakdown,
	getAdminWorkload,
	getConversionRates,
	getGraphData,
	type TrendBucket
} from '$lib/server/analytics';

// Trend bucket reuses the candidates-list range vocabulary where it overlaps,
// but a dashboard groups TIME differently than it filters a list: "week" here
// means "bucket by week", not "only show the last week". Kept as its own tiny
// enum rather than overloading RangeKey, which means something else on
// /admin/candidates.
const BUCKET_KEYS: TrendBucket[] = ['week', 'month', 'quarter', 'year'];

export const load: PageServerLoad = async ({ url }) => {
	const range = (url.searchParams.get('range') ?? 'quarter') as RangeKey;
	const safeRange: RangeKey = RANGE_KEYS.includes(range) ? range : 'quarter';
	const bucket = (url.searchParams.get('bucket') ?? 'week') as TrendBucket;
	const safeBucket: TrendBucket = BUCKET_KEYS.includes(bucket) ? bucket : 'week';
	const companyId = url.searchParams.get('company') || null;
	const track = (url.searchParams.get('track') || null) as Track | null;
	const safeTrack = track && TRACKS.includes(track) ? track : null;

	const filters = { from: rangeStart(safeRange), companyId, track: safeTrack };

	const [
		funnel,
		trend,
		stageDurations,
		docSlots,
		verification,
		breakdown,
		adminWorkload,
		conversion,
		graph,
		companies
	] = await Promise.all([
		getFunnelSnapshot(filters),
		getTrendSeries(filters, safeBucket),
		getStageDurations(filters),
		getDocSlotSatisfaction(filters),
		getVerificationStats(filters),
		getCompanyTrackBreakdown(filters),
		getAdminWorkload(filters),
		getConversionRates(filters),
		getGraphData(filters),
		Company.find({ active: true }).sort({ name: 1 }).select('name').lean()
	]);

	return {
		range: safeRange,
		bucket: safeBucket,
		companyId,
		track: safeTrack,
		rangeOptions: RANGE_KEYS.filter((k) => k !== 'day').map((k) => ({ value: k, label: RANGE_LABELS[k] })),
		bucketOptions: BUCKET_KEYS.map((k) => ({ value: k, label: k[0].toUpperCase() + k.slice(1) })),
		companies: companies.map((c) => ({ value: String(c._id), label: c.name })),
		tracks: TRACKS.map((t) => ({ value: t, label: TRACK_LABELS[t] })),
		funnel,
		trend,
		stageDurations,
		docSlots,
		verification,
		breakdown,
		adminWorkload,
		conversion,
		graph: {
			nodes: graph.nodes,
			edges: graph.edges
		}
	};
};
