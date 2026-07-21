// Aggregation layer for /admin/analytics. Every function here runs one Mongo
// aggregation (or a small fixed number) and returns plain data — no HTML, no
// SvelteKit types, so it stays testable and reusable if a second consumer
// (e.g. a scheduled digest email) ever wants the same numbers.
import { Types } from 'mongoose';
import {
	Candidate,
	Company,
	Document,
	LinkToken,
	PhysicalItem,
	Verification,
	OfferLetter,
	Admin
} from './db/schema';
import { DOC_SLOTS, TRACKS, TRACK_LABELS, type Track } from '$lib/shared/matrix';

export interface AnalyticsFilters {
	from: Date | null;
	companyId: string | null;
	track: Track | null;
}

function matchStage(filters: AnalyticsFilters): Record<string, unknown> {
	const match: Record<string, unknown> = {};
	if (filters.from) match.createdAt = { $gte: filters.from };
	if (filters.companyId) match.companyId = new Types.ObjectId(filters.companyId);
	if (filters.track) match.track = filters.track;
	return match;
}

// ── Funnel snapshot ─────────────────────────────────────────────────────────
export async function getFunnelSnapshot(filters: AnalyticsFilters) {
	const rows = await Candidate.aggregate<{ _id: string; n: number }>([
		{ $match: matchStage(filters) },
		{ $group: { _id: '$status', n: { $sum: 1 } } }
	]);
	const byStatus = Object.fromEntries(rows.map((r) => [r._id, r.n]));
	// Cumulative stage counts: "opened" means reached opened-or-later, matching
	// how the candidate detail page's journey tracker reads status as a stage,
	// not a point-in-time bucket.
	const order = ['created', 'opened', 'in_progress', 'submitted', 'changes_requested', 'approved', 'complete'];
	const reached = (stage: string) => {
		const idx = order.indexOf(stage);
		return order.slice(idx).reduce((sum, s) => sum + (byStatus[s] ?? 0), 0);
	};
	return {
		sent: reached('created'),
		opened: reached('opened') + reached('in_progress') + reached('submitted') + reached('changes_requested') + reached('approved') + reached('complete'),
		submitted: (byStatus.submitted ?? 0) + (byStatus.changes_requested ?? 0) + (byStatus.approved ?? 0) + (byStatus.complete ?? 0),
		approved: (byStatus.approved ?? 0) + (byStatus.complete ?? 0),
		complete: byStatus.complete ?? 0,
		revoked: byStatus.revoked ?? 0
	};
}

// ── Trend series (created / opened / submitted / approved per bucket) ──────
export type TrendBucket = 'week' | 'month' | 'quarter' | 'year';

const BUCKET_UNIT: Record<TrendBucket, 'week' | 'month' | 'quarter' | 'year'> = {
	week: 'week',
	month: 'month',
	quarter: 'quarter',
	year: 'year'
};

export async function getTrendSeries(filters: AnalyticsFilters, bucket: TrendBucket) {
	const unit = BUCKET_UNIT[bucket];
	const match = matchStage(filters);

	const created = await Candidate.aggregate<{ _id: Date; n: number }>([
		{ $match: match },
		{ $group: { _id: { $dateTrunc: { date: '$createdAt', unit } }, n: { $sum: 1 } } },
		{ $sort: { _id: 1 } }
	]);
	const submitted = await Candidate.aggregate<{ _id: Date; n: number }>([
		{ $match: { ...match, submittedAt: { $ne: null } } },
		{ $group: { _id: { $dateTrunc: { date: '$submittedAt', unit } }, n: { $sum: 1 } } },
		{ $sort: { _id: 1 } }
	]);
	const approved = await Candidate.aggregate<{ _id: Date; n: number }>([
		{ $match: { ...match, reviewedAt: { $ne: null }, status: { $in: ['approved', 'complete'] } } },
		{ $group: { _id: { $dateTrunc: { date: '$reviewedAt', unit } }, n: { $sum: 1 } } },
		{ $sort: { _id: 1 } }
	]);
	// LinkToken has no companyId/track of its own — join back to Candidate for
	// those filters to apply; unfiltered runs skip the lookup entirely.
	const opened = filters.companyId || filters.track
		? await LinkToken.aggregate<{ _id: Date; n: number }>([
				{ $match: { openedAt: { $ne: null } } },
				{
					$lookup: {
						from: 'candidates',
						localField: 'candidateId',
						foreignField: '_id',
						as: 'candidate'
					}
				},
				{ $unwind: '$candidate' },
				{
					$match: {
						...(filters.companyId ? { 'candidate.companyId': new Types.ObjectId(filters.companyId) } : {}),
						...(filters.track ? { 'candidate.track': filters.track } : {}),
						...(filters.from ? { 'candidate.createdAt': { $gte: filters.from } } : {})
					}
				},
				{ $group: { _id: { $dateTrunc: { date: '$openedAt', unit } }, n: { $sum: 1 } } },
				{ $sort: { _id: 1 } }
			])
		: await LinkToken.aggregate<{ _id: Date; n: number }>([
				{ $match: { openedAt: { $ne: null }, ...(filters.from ? { createdAt: { $gte: filters.from } } : {}) } },
				{ $group: { _id: { $dateTrunc: { date: '$openedAt', unit } }, n: { $sum: 1 } } },
				{ $sort: { _id: 1 } }
			]);

	// Merge the four series onto a shared, sorted bucket axis.
	const keys = new Set<string>();
	const toMap = (rows: { _id: Date; n: number }[]) => {
		const m = new Map<string, number>();
		for (const r of rows) {
			const k = r._id.toISOString();
			m.set(k, r.n);
			keys.add(k);
		}
		return m;
	};
	const cM = toMap(created), oM = toMap(opened), sM = toMap(submitted), aM = toMap(approved);
	const sortedKeys = [...keys].sort();
	return sortedKeys.map((k) => ({
		bucketStart: k,
		created: cM.get(k) ?? 0,
		opened: oM.get(k) ?? 0,
		submitted: sM.get(k) ?? 0,
		approved: aM.get(k) ?? 0
	}));
}

// ── Stage durations (median days) ───────────────────────────────────────────
function medianDays(diffsMs: number[]): number | null {
	if (diffsMs.length === 0) return null;
	const sorted = [...diffsMs].sort((a, b) => a - b);
	const mid = Math.floor(sorted.length / 2);
	const ms = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
	return ms / (1000 * 60 * 60 * 24);
}

export async function getStageDurations(filters: AnalyticsFilters) {
	const match = matchStage(filters);
	const candidateIds = filters.companyId || filters.track ? await Candidate.find(match).distinct('_id') : null;

	const [linkRows, subRows] = await Promise.all([
		LinkToken.find({
			openedAt: { $ne: null },
			...(candidateIds ? { candidateId: { $in: candidateIds } } : {})
		})
			.populate({ path: 'candidateId', select: 'createdAt', match: filters.from ? { createdAt: { $gte: filters.from } } : {} })
			.lean(),
		Candidate.find({ ...match, submittedAt: { $ne: null } }).select('createdAt submittedAt reviewedAt').lean()
	]);

	const sentToOpened = linkRows
		.filter((r) => r.candidateId)
		.map((r) => new Date(r.openedAt as Date).getTime() - new Date((r.candidateId as unknown as { createdAt: Date }).createdAt).getTime())
		.filter((ms) => ms >= 0);

	const openedToSubmitted = subRows
		.map((c) => new Date(c.submittedAt as Date).getTime() - new Date((c as unknown as { createdAt: Date }).createdAt).getTime())
		.filter((ms) => ms >= 0);

	const submittedToApproved = subRows
		.filter((c) => c.reviewedAt)
		.map((c) => new Date(c.reviewedAt as Date).getTime() - new Date(c.submittedAt as Date).getTime())
		.filter((ms) => ms >= 0);

	return {
		sentToOpened: medianDays(sentToOpened),
		// Labelled "sent to submitted" (not "opened to submitted") deliberately:
		// LinkToken.openedAt isn't reliably captured for every candidate, but
		// Candidate.createdAt always is, so this is the honestly-computable gap.
		sentToSubmitted: medianDays(openedToSubmitted),
		submittedToApproved: medianDays(submittedToApproved),
		sampleSizes: {
			sentToOpened: sentToOpened.length,
			sentToSubmitted: openedToSubmitted.length,
			submittedToApproved: submittedToApproved.length
		}
	};
}

// ── Document slot satisfaction (which document blocks completion most) ─────
export async function getDocSlotSatisfaction(filters: AnalyticsFilters) {
	const match = matchStage(filters);
	const candidates = await Candidate.find(match).select('_id track').lean();
	if (candidates.length === 0) return [];

	const candidateIds = candidates.map((c) => c._id);
	const docs = await Document.find({ candidateId: { $in: candidateIds } })
		.select('candidateId docType reviewStatus')
		.lean();

	const docsByCandidate = new Map<string, typeof docs>();
	for (const d of docs) {
		const key = String(d.candidateId);
		if (!docsByCandidate.has(key)) docsByCandidate.set(key, []);
		docsByCandidate.get(key)!.push(d);
	}

	// One counter per doc slot: how many candidates who NEEDED this slot (it's
	// in their track's matrix) satisfied it without a pending re-upload.
	const need = new Map<string, number>();
	const satisfied = new Map<string, number>();
	for (const slot of DOC_SLOTS) {
		need.set(slot.type, 0);
		satisfied.set(slot.type, 0);
	}

	for (const c of candidates) {
		const track = c.track as Track;
		const applicableSlots = DOC_SLOTS.filter((s) => s.tracks.includes(track));
		const candidateDocs = docsByCandidate.get(String(c._id)) ?? [];
		for (const slot of applicableSlots) {
			need.set(slot.type, (need.get(slot.type) ?? 0) + 1);
			const hasUsable = candidateDocs.some((d) => d.docType === slot.type && d.reviewStatus !== 'reupload_requested');
			if (hasUsable) satisfied.set(slot.type, (satisfied.get(slot.type) ?? 0) + 1);
		}
	}

	return DOC_SLOTS.map((slot) => {
		const n = need.get(slot.type) ?? 0;
		const s = satisfied.get(slot.type) ?? 0;
		return {
			type: slot.type,
			label: slot.label.replace(/\s*\(optional\)/i, ''),
			mandatory: slot.mandatory,
			needed: n,
			rate: n > 0 ? Math.round((s / n) * 100) : null
		};
	}).filter((s) => s.needed > 0);
}

// ── Verification / data-quality ─────────────────────────────────────────────
export async function getVerificationStats(filters: AnalyticsFilters) {
	const match = matchStage(filters);
	const candidateIds = filters.companyId || filters.track || filters.from
		? await Candidate.find(match).distinct('_id')
		: null;

	const baseMatch = candidateIds ? { candidateId: { $in: candidateIds } } : {};

	const buckets = await Verification.aggregate<{ _id: number | 'other'; n: number }>([
		{ $match: baseMatch },
		{
			$bucket: {
				groupBy: '$score',
				boundaries: [0, 60, 70, 80, 90, 101],
				default: 'other',
				output: { n: { $sum: 1 } }
			}
		}
	]);
	const scoreLabels = ['0-59', '60-69', '70-79', '80-89', '90-100'];
	const boundaries = [0, 60, 70, 80, 90];
	const histogram = boundaries.map((b, i) => ({
		bucket: scoreLabels[i],
		n: buckets.find((row) => row._id === b)?.n ?? 0
	}));

	const byCompany = await Verification.aggregate<{ _id: string; total: number; mismatches: number }>([
		{ $match: baseMatch },
		{
			$lookup: {
				from: 'candidates',
				localField: 'candidateId',
				foreignField: '_id',
				as: 'candidate'
			}
		},
		{ $unwind: '$candidate' },
		{
			$group: {
				_id: '$candidate.companyId',
				total: { $sum: 1 },
				mismatches: { $sum: { $cond: [{ $eq: ['$status', 'mismatch'] }, 1, 0] } }
			}
		}
	]);
	const companies = await Company.find({ _id: { $in: byCompany.map((r) => r._id) } })
		.select('name')
		.lean();
	const nameById = new Map(companies.map((c) => [String(c._id), c.name]));
	const mismatchByCompany = byCompany
		.map((r) => ({
			company: nameById.get(String(r._id)) ?? 'Unknown',
			rate: r.total > 0 ? Math.round((r.mismatches / r.total) * 100) : 0,
			total: r.total
		}))
		.sort((a, b) => b.rate - a.rate);

	return { histogram, mismatchByCompany };
}

// ── Company x Track volume heatmap ──────────────────────────────────────────
export async function getCompanyTrackBreakdown(filters: AnalyticsFilters) {
	const match = matchStage(filters);
	const rows = await Candidate.aggregate<{ _id: { companyId: Types.ObjectId; track: string }; n: number }>([
		{ $match: match },
		{ $group: { _id: { companyId: '$companyId', track: '$track' }, n: { $sum: 1 } } }
	]);
	const companyIds = [...new Set(rows.map((r) => String(r._id.companyId)))];
	const companies = await Company.find({ _id: { $in: companyIds } }).select('name').lean();
	const nameById = new Map(companies.map((c) => [String(c._id), c.name]));

	const byCompany = new Map<string, Record<string, number>>();
	for (const r of rows) {
		const name = nameById.get(String(r._id.companyId)) ?? 'Unknown';
		if (!byCompany.has(name)) byCompany.set(name, {});
		byCompany.get(name)![r._id.track] = r.n;
	}

	return [...byCompany.entries()]
		.map(([company, tracks]) => ({
			company,
			tracks: TRACKS.map((t) => ({ track: t, label: TRACK_LABELS[t], n: tracks[t] ?? 0 })),
			total: Object.values(tracks).reduce((a, b) => a + b, 0)
		}))
		.sort((a, b) => b.total - a.total);
}

// ── Admin workload ───────────────────────────────────────────────────────────
export async function getAdminWorkload(filters: AnalyticsFilters) {
	const match = { ...matchStage(filters), reviewedBy: { $ne: null } };
	const rows = await Candidate.aggregate<{ _id: Types.ObjectId; n: number; avgLatencyMs: number | null }>([
		{ $match: match },
		{
			$group: {
				_id: '$reviewedBy',
				n: { $sum: 1 },
				avgLatencyMs: {
					$avg: {
						$cond: [
							{ $and: ['$submittedAt', '$reviewedAt'] },
							{ $subtract: ['$reviewedAt', '$submittedAt'] },
							null
						]
					}
				}
			}
		},
		{ $sort: { n: -1 } }
	]);
	const adminIds = rows.map((r) => r._id);
	const admins = await Admin.find({ _id: { $in: adminIds } }).select('email').lean();
	const emailById = new Map(admins.map((a) => [String(a._id), a.email]));
	return rows.map((r) => ({
		email: emailById.get(String(r._id)) ?? 'Unknown',
		reviewed: r.n,
		avgLatencyDays: r.avgLatencyMs != null ? Math.round((r.avgLatencyMs / (1000 * 60 * 60 * 24)) * 10) / 10 : null
	}));
}

// ── Offer letter / physical item conversion ─────────────────────────────────
export async function getConversionRates(filters: AnalyticsFilters) {
	const match = matchStage(filters);
	const candidateIds = await Candidate.find(match).distinct('_id');

	const [offerDraft, offerSent, physicalTotal, physicalReceived] = await Promise.all([
		OfferLetter.countDocuments({ candidateId: { $in: candidateIds } }),
		OfferLetter.countDocuments({ candidateId: { $in: candidateIds }, status: 'sent' }),
		PhysicalItem.countDocuments({ candidateId: { $in: candidateIds } }),
		PhysicalItem.countDocuments({ candidateId: { $in: candidateIds }, received: true })
	]);

	return {
		offerLetterConversion: offerDraft > 0 ? Math.round((offerSent / offerDraft) * 100) : null,
		physicalItemConversion: physicalTotal > 0 ? Math.round((physicalReceived / physicalTotal) * 100) : null
	};
}

// ── Knowledge graph: Company -> Track -> DocSlot ────────────────────────────
export interface GraphNode {
	id: string;
	label: string;
	kind: 'company' | 'track' | 'slot';
	rate?: number | null;
}
export interface GraphEdge {
	a: string;
	b: string;
}

export async function getGraphData(filters: AnalyticsFilters) {
	const match = matchStage(filters);
	const [companyTrackRows, slotSatisfaction] = await Promise.all([
		Candidate.aggregate<{ _id: { companyId: Types.ObjectId; track: string }; n: number }>([
			{ $match: match },
			{ $group: { _id: { companyId: '$companyId', track: '$track' }, n: { $sum: 1 } } }
		]),
		getDocSlotSatisfaction(filters)
	]);

	const companyIds = [...new Set(companyTrackRows.map((r) => String(r._id.companyId)))];
	const companies = await Company.find({ _id: { $in: companyIds } }).select('name').lean();
	const nameById = new Map(companies.map((c) => [String(c._id), c.name]));

	const nodes: GraphNode[] = [];
	const edges: GraphEdge[] = [];
	const seenTracks = new Set<string>();

	for (const c of companies) {
		nodes.push({ id: 'co:' + String(c._id), label: c.name, kind: 'company' });
	}
	for (const row of companyTrackRows) {
		const coId = 'co:' + String(row._id.companyId);
		const trId = 'tr:' + row._id.track;
		if (!seenTracks.has(trId)) {
			nodes.push({ id: trId, label: TRACK_LABELS[row._id.track as Track] ?? row._id.track, kind: 'track' });
			seenTracks.add(trId);
		}
		edges.push({ a: coId, b: trId });
	}
	for (const slot of slotSatisfaction) {
		const slId = 'sl:' + slot.type;
		nodes.push({ id: slId, label: slot.label, kind: 'slot', rate: slot.rate });
		for (const docSlot of DOC_SLOTS) {
			if (docSlot.type !== slot.type) continue;
			for (const track of docSlot.tracks) {
				const trId = 'tr:' + track;
				if (seenTracks.has(trId)) edges.push({ a: trId, b: slId });
			}
		}
	}

	return { nodes, edges, companyName: nameById };
}
