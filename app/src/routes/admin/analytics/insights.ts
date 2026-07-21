// Deterministic findings engine — every entry here is a fixed rule over real
// aggregated numbers (see analytics.ts), evaluated the same way every time.
// No model, no inference: a rule either fires or it doesn't, based on an
// explicit threshold stated in its own condition. This is what stands in for
// "AI recommendations" in this dashboard — auditable, reproducible, free to
// run, and each finding can point at exactly which number produced it.
import type { DocSlotStat, VerificationStats, StageDurations, AdminWorkloadRow, ConversionRates, FunnelData } from './charts';

export type Severity = 'critical' | 'warning' | 'info' | 'good';
export type FindingCategory = 'Documents' | 'Timing' | 'Verification' | 'Workload' | 'Conversion' | 'Funnel';

export interface Finding {
	severity: Severity;
	category: FindingCategory;
	text: string;
}

const SEVERITY_RANK: Record<Severity, number> = { critical: 0, warning: 1, info: 2, good: 3 };

// ── Documents ────────────────────────────────────────────────────────────────
// Mandatory and optional slots are scored on completely different questions:
// a mandatory slot's rate answers "is this blocking people", an optional
// slot's rate answers "are people bothering with this at all" — conflating
// them is exactly the miscategorization that prompted this rule split.
const MANDATORY_BLOCKER_THRESHOLD = 65; // below this, call it a blocker outright
const MANDATORY_WATCH_THRESHOLD = 80; // below this (but above blocker), call it worth watching
const OPTIONAL_LOW_UPTAKE_THRESHOLD = 40; // optional slots are framed as uptake, not failure
const MIN_SAMPLE = 3; // don't rank a slot on fewer than this many candidates who needed it

function docFindings(docSlots: DocSlotStat[]): Finding[] {
	const findings: Finding[] = [];
	const mandatory = docSlots.filter((s) => s.mandatory && s.rate != null && s.needed >= MIN_SAMPLE).sort((a, b) => (a.rate as number) - (b.rate as number));
	const optional = docSlots.filter((s) => !s.mandatory && s.rate != null && s.needed >= MIN_SAMPLE).sort((a, b) => (a.rate as number) - (b.rate as number));

	if (mandatory.length > 0) {
		const worst = mandatory[0];
		const rate = worst.rate as number;
		if (rate < MANDATORY_BLOCKER_THRESHOLD) {
			findings.push({
				severity: 'critical',
				category: 'Documents',
				text: `<strong>${worst.label}</strong> is a required document and the biggest blocker right now — only <strong>${rate}%</strong> of the ${worst.needed} candidates who need it get it right on the first try (based on ${worst.needed} candidates). Everyone else needs a re-upload request, which is what actually slows a file down.`
			});
		} else if (rate < MANDATORY_WATCH_THRESHOLD) {
			findings.push({
				severity: 'warning',
				category: 'Documents',
				text: `<strong>${worst.label}</strong> is required and sits at <strong>${rate}%</strong> first-try success across ${worst.needed} candidates — inside the watch range, not yet a blocker.`
			});
		}
		const second = mandatory[1];
		if (second && (second.rate as number) < MANDATORY_WATCH_THRESHOLD && (second.rate as number) >= MANDATORY_BLOCKER_THRESHOLD) {
			findings.push({
				severity: 'warning',
				category: 'Documents',
				text: `<strong>${second.label}</strong> is also below the healthy range (<strong>${second.rate}%</strong>, ${second.needed} candidates) — worth a look if you're updating the instructions candidates see before uploading.`
			});
		}
	}

	if (optional.length > 0) {
		const lowest = optional[0];
		const rate = lowest.rate as number;
		if (rate < OPTIONAL_LOW_UPTAKE_THRESHOLD) {
			findings.push({
				severity: 'info',
				category: 'Documents',
				text: `<strong>${lowest.label}</strong> is optional, and only <strong>${rate}%</strong> of the ${lowest.needed} candidates who could add it did — this is expected for an optional slot, not a blocker. Nothing to fix here unless you intend to make it mandatory.`
			});
		}
	}

	const allRanked = docSlots.filter((s) => s.rate != null && s.needed >= MIN_SAMPLE);
	const mandatoryHealthy = mandatory.filter((s) => (s.rate as number) >= MANDATORY_WATCH_THRESHOLD).length;
	if (mandatory.length > 0) {
		findings.push({
			severity: 'good',
			category: 'Documents',
			text: `<strong>${mandatoryHealthy} of ${mandatory.length}</strong> required document types are healthy (80%+ first-try success). ${allRanked.length - mandatory.length > 0 ? `The remaining ${allRanked.length - mandatory.length} optional slot${allRanked.length - mandatory.length === 1 ? '' : 's'} ${allRanked.length - mandatory.length === 1 ? 'is' : 'are'} tracked separately above, since low uptake there isn't a failure.` : ''}`
		});
	}

	return findings;
}

// ── Timing ───────────────────────────────────────────────────────────────────
const SLOW_STAGE_DAYS: Record<'sentToOpened' | 'sentToSubmitted' | 'submittedToApproved', number> = {
	sentToOpened: 2,
	sentToSubmitted: 5,
	submittedToApproved: 3
};
const STAGE_LABEL: Record<keyof typeof SLOW_STAGE_DAYS, string> = {
	sentToOpened: 'Link sent → opened',
	sentToSubmitted: 'Link sent → submitted',
	submittedToApproved: 'Submitted → approved (HR review)'
};

function timingFindings(sd: StageDurations): Finding[] {
	const findings: Finding[] = [];
	(Object.keys(SLOW_STAGE_DAYS) as (keyof typeof SLOW_STAGE_DAYS)[]).forEach((key) => {
		const days = sd[key];
		const n = sd.sampleSizes[key];
		if (days == null || n < MIN_SAMPLE) return;
		const threshold = SLOW_STAGE_DAYS[key];
		if (days > threshold) {
			const isReview = key === 'submittedToApproved';
			findings.push({
				severity: days > threshold * 1.5 ? 'critical' : 'warning',
				category: 'Timing',
				text: `<strong>${STAGE_LABEL[key]}</strong> takes a median of <strong>${days.toFixed(1)} days</strong> across ${n} candidates — above the ${threshold}-day mark. ${isReview ? 'That gap is HR review time, not candidate behavior — worth checking if reviews are queuing up.' : 'That gap is candidate-side — the reminder/nudge cadence on the link may need a look.'}`
			});
		}
	});
	if (findings.length === 0 && sd.sampleSizes.sentToSubmitted >= MIN_SAMPLE) {
		findings.push({
			severity: 'good',
			category: 'Timing',
			text: `Every measurable stage is inside its expected window — no timing bottleneck detected in this range.`
		});
	}
	return findings;
}

// ── Verification / data quality ─────────────────────────────────────────────
const MISMATCH_THRESHOLD = 15;

function verificationFindings(v: VerificationStats): Finding[] {
	const findings: Finding[] = [];
	const eligible = v.mismatchByCompany.filter((c) => c.total >= MIN_SAMPLE);
	const worst = [...eligible].sort((a, b) => b.rate - a.rate)[0];
	if (worst && worst.rate >= MISMATCH_THRESHOLD) {
		findings.push({
			severity: worst.rate >= MISMATCH_THRESHOLD * 2 ? 'critical' : 'warning',
			category: 'Verification',
			text: `<strong>${worst.company}</strong> has a <strong>${worst.rate}%</strong> OCR mismatch rate (${worst.total} verifications) — meaningfully higher than the rest. Could mean lower-quality uploads or an OCR-schema edge case specific to that company's documents.`
		});
	}
	const totalVerified = v.histogram.reduce((a, b) => a + b.n, 0);
	if (totalVerified >= MIN_SAMPLE) {
		const passing = v.histogram.filter((h) => h.bucket === '80-89' || h.bucket === '90-100').reduce((a, b) => a + b.n, 0);
		const passRate = Math.round((passing / totalVerified) * 100);
		if (passRate >= 80 && !findings.some((f) => f.severity === 'critical' || f.severity === 'warning')) {
			findings.push({
				severity: 'good',
				category: 'Verification',
				text: `<strong>${passRate}%</strong> of ${totalVerified} cross-checked documents scored 80 or above — verification quality is healthy overall.`
			});
		}
	}
	return findings;
}

// ── Admin workload ───────────────────────────────────────────────────────────
const WORKLOAD_IMBALANCE_RATIO = 2.5;

function workloadFindings(rows: AdminWorkloadRow[]): Finding[] {
	if (rows.length < 2) return [];
	const sorted = [...rows].sort((a, b) => b.reviewed - a.reviewed);
	const top = sorted[0];
	const median = sorted[Math.floor(sorted.length / 2)];
	if (median.reviewed > 0 && top.reviewed / median.reviewed >= WORKLOAD_IMBALANCE_RATIO) {
		return [
			{
				severity: 'warning',
				category: 'Workload',
				text: `<strong>${top.email}</strong> has reviewed <strong>${top.reviewed}</strong> candidates this range — over ${WORKLOAD_IMBALANCE_RATIO}x the team median (${median.reviewed}). Review load isn't evenly spread.`
			}
		];
	}
	return [];
}

// ── Conversion ───────────────────────────────────────────────────────────────
const CONVERSION_LOW_THRESHOLD = 60;

function conversionFindings(c: ConversionRates): Finding[] {
	const findings: Finding[] = [];
	if (c.offerLetterConversion != null && c.offerLetterConversion < CONVERSION_LOW_THRESHOLD) {
		findings.push({
			severity: 'warning',
			category: 'Conversion',
			text: `Only <strong>${c.offerLetterConversion}%</strong> of drafted offer letters have actually been sent — drafts may be stalling before the send step.`
		});
	}
	if (c.physicalItemConversion != null && c.physicalItemConversion < CONVERSION_LOW_THRESHOLD) {
		findings.push({
			severity: 'info',
			category: 'Conversion',
			text: `<strong>${c.physicalItemConversion}%</strong> of physical handover items (photos, signed offer letter, NDA) are marked received — normal if joining day hasn't happened yet for most of this range.`
		});
	}
	return findings;
}

// ── Funnel drop-off ──────────────────────────────────────────────────────────
function funnelFindings(f: FunnelData): Finding[] {
	const stages: { label: string; value: number }[] = [
		{ label: 'Link sent', value: f.sent },
		{ label: 'Opened', value: f.opened },
		{ label: 'Submitted', value: f.submitted },
		{ label: 'Approved', value: f.approved }
	];
	let worstDrop = { from: '', to: '', pct: 0 };
	for (let i = 1; i < stages.length; i++) {
		if (stages[i - 1].value < MIN_SAMPLE) continue;
		const drop = 100 - Math.round((stages[i].value / stages[i - 1].value) * 100);
		if (drop > worstDrop.pct) worstDrop = { from: stages[i - 1].label, to: stages[i].label, pct: drop };
	}
	if (worstDrop.pct >= 30) {
		return [
			{
				severity: worstDrop.pct >= 50 ? 'critical' : 'warning',
				category: 'Funnel',
				text: `The biggest drop-off is between <strong>${worstDrop.from}</strong> and <strong>${worstDrop.to}</strong> — <strong>${worstDrop.pct}%</strong> of candidates don't make that transition. That's the highest-leverage stage to investigate.`
			}
		];
	}
	return [];
}

export interface InsightsInput {
	docSlots: DocSlotStat[];
	stageDurations: StageDurations;
	verification: VerificationStats;
	adminWorkload: AdminWorkloadRow[];
	conversion: ConversionRates;
	funnel: FunnelData;
}

/** Runs every rule, sorts by severity (critical first, good last), and caps
 *  the list so the panel stays scannable — nothing here is randomized or
 *  ranked by anything other than the fixed severity order plus each
 *  category's own internal sort. */
export function computeFindings(input: InsightsInput, limit = 8): Finding[] {
	const all = [
		...docFindings(input.docSlots),
		...timingFindings(input.stageDurations),
		...verificationFindings(input.verification),
		...workloadFindings(input.adminWorkload),
		...conversionFindings(input.conversion),
		...funnelFindings(input.funnel)
	];
	all.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
	return all.slice(0, limit);
}
