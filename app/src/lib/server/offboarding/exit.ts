// Offboarding plumbing: exit records, their three kinds of token link, and the
// derived state every surface needs (service length for gratuity, which forms
// are still outstanding, which clearances have come back).
//
// The token pattern is the one LinkToken and BgvRequest already use: sha256 is
// the source of truth for verifying an incoming request, and an AES copy is
// kept so HR can re-display a live link without regenerating it. Unlike BGV
// tokens — which never expire — exit links do, because they carry an
// ex-employee's personal data to a personal mailbox.
import { Candidate, Company, Exit, ExitClearance, ExitToken, OfferLetter } from '$lib/server/db/schema';
import type { ExitDoc, ExitClearanceDoc, ExitTokenDoc } from '$lib/server/db/schema';
import { randomToken, sha256, encrypt, decrypt } from '$lib/server/crypto';
import { baseUrl } from '$lib/server/base-url';
import { parseStoredDate } from '$lib/shared/dates';
import {
	DEFAULT_CLEARANCE_DEPTS,
	GRATUITY_MIN_SERVICE_MONTHS,
	NDC_SECTION_BY_DEPT,
	type ClearanceDept
} from '$lib/shared/offboarding';

/** How long each kind of link stays valid. The forms link is short — it is the
 *  employee's last-working-day task. The handover link is long because it is
 *  the ex-employee's only copy of their relieving letter and payslips. */
const TOKEN_DAYS: Record<ExitTokenPurpose, number> = {
	forms: 30,
	clearance: 30,
	handover: 180
};

export type ExitTokenPurpose = 'forms' | 'clearance' | 'handover';

// ── Tokens ───────────────────────────────────────────────────────────────────

/** Mints a fresh token for one purpose, revoking any live predecessor so a
 *  re-send always invalidates the old link rather than leaving two valid. */
export async function createExitToken(
	exitId: string,
	purpose: ExitTokenPurpose,
	clearanceId?: string
): Promise<string> {
	await ExitToken.updateMany(
		{
			exitId,
			purpose,
			revoked: false,
			...(clearanceId ? { clearanceId } : {})
		},
		{ revoked: true }
	);
	const token = randomToken();
	await ExitToken.create({
		exitId,
		purpose,
		clearanceId: clearanceId ?? null,
		tokenHash: sha256(token),
		tokenEncrypted: encrypt(token),
		expiresAt: new Date(Date.now() + TOKEN_DAYS[purpose] * 86_400_000)
	});
	return token;
}

/** The live token row for a purpose, or null. Used by HR's page to show the
 *  current link; `decrypt(row.tokenEncrypted)` recovers the raw token. */
export async function liveExitToken(
	exitId: string,
	purpose: ExitTokenPurpose,
	clearanceId?: string
): Promise<ExitTokenDoc | null> {
	return (await ExitToken.findOne({
		exitId,
		purpose,
		revoked: false,
		expiresAt: { $gt: new Date() },
		...(clearanceId ? { clearanceId } : {})
	})
		.sort({ createdAt: -1 })
		.lean()) as ExitTokenDoc | null;
}

/** Public URL for a token row, or null when it has no displayable copy. */
export function exitTokenUrl(row: ExitTokenDoc | null): string | null {
	if (!row?.tokenEncrypted) return null;
	const raw = decrypt(row.tokenEncrypted);
	const base = baseUrl();
	if (row.purpose === 'forms') return `${base}/x/${raw}`;
	if (row.purpose === 'clearance') return `${base}/x/clearance/${raw}`;
	return `${base}/x/final/${raw}`;
}

/** Resolves an incoming token to its exit, enforcing purpose, expiry and
 *  revocation. Stamps openedAt the first time a link is used, and nudges an
 *  exit from link_sent to in_progress the way resolveCandidateToken does. */
export async function resolveExitToken(token: string, purpose: ExitTokenPurpose) {
	const row = await ExitToken.findOne({
		tokenHash: sha256(token),
		purpose,
		revoked: false,
		expiresAt: { $gt: new Date() }
	});
	if (!row) return null;

	const exit = (await Exit.findById(row.exitId)) as ExitDoc | null;
	if (!exit) return null;

	if (!row.openedAt) {
		row.openedAt = new Date();
		await row.save();
		if (purpose === 'forms' && exit.status === 'link_sent') {
			exit.status = 'in_progress';
			await exit.save();
		}
	}

	const clearance = row.clearanceId
		? ((await ExitClearance.findById(row.clearanceId)) as ExitClearanceDoc | null)
		: null;

	return { exit, clearance, token: row };
}

// ── Service length & gratuity ────────────────────────────────────────────────

/** Whole months of continuous service between two stored dates, or null when
 *  either is missing or unparseable. Counts a partial month only once the day
 *  of the month is reached, which is how HR reads "4 years 7 months". */
export function serviceMonths(doj: string | null | undefined, lwd: string | null | undefined): number | null {
	const from = parseStoredDate(doj);
	const to = parseStoredDate(lwd);
	if (!from || !to) return null;
	let months = (to.year - from.year) * 12 + (to.month - from.month);
	if (to.day < from.day) months -= 1;
	return months < 0 ? 0 : months;
}

/** "4 years 7 months" for display, or null when service can't be computed. */
export function serviceLabel(doj: string | null | undefined, lwd: string | null | undefined): string | null {
	const months = serviceMonths(doj, lwd);
	if (months === null) return null;
	const years = Math.floor(months / 12);
	const rem = months % 12;
	const parts: string[] = [];
	if (years) parts.push(`${years} year${years === 1 ? '' : 's'}`);
	if (rem) parts.push(`${rem} month${rem === 1 ? '' : 's'}`);
	return parts.length ? parts.join(' ') : 'Less than a month';
}

/** SOP 5.5 — gratuity applies at 4 years 7 months or more. Returns null when
 *  service is unknown, so callers can leave HR's manual flag alone rather than
 *  overwriting it with a guess. */
export function gratuityApplicable(
	doj: string | null | undefined,
	lwd: string | null | undefined
): boolean | null {
	const months = serviceMonths(doj, lwd);
	if (months === null) return null;
	return months >= GRATUITY_MIN_SERVICE_MONTHS;
}

// ── Creating an exit ─────────────────────────────────────────────────────────

/** Finds the onboarding record for someone HR is offboarding, so an exit can
 *  prefill DOJ, designation, manager and bank details rather than asking HR to
 *  retype what the app already knows. Matched on employee code first (the
 *  identifier HR actually works from), then on email as a fallback. Returns
 *  null for anyone hired before this app existed — the common case today. */
export async function findOnboardingMatch(employeeId: string, email: string) {
	const byCode = employeeId.trim()
		? await Candidate.findOne({ employeeId: employeeId.trim() }).lean()
		: null;
	const candidate =
		byCode ?? (email.trim() ? await Candidate.findOne({ email: email.trim().toLowerCase() }).lean() : null);
	if (!candidate) return null;
	const offer = await OfferLetter.findOne({ candidateId: candidate._id }).lean();
	return { candidate, offer };
}

/** The employment particulars an exit copies off an onboarding record at
 *  creation. Copied rather than joined: an exit document must keep saying what
 *  it said when it was signed, even if the onboarding record is edited later. */
export function prefillFromOnboarding(
	candidate: Record<string, unknown> | null,
	offer: Record<string, unknown> | null
) {
	if (!candidate) return {};
	return {
		doj: (offer?.joiningDate as string | null) ?? null,
		designation: (offer?.jobTitle as string | null) ?? null,
		department: (candidate.teamName as string | null) ?? (offer?.department as string | null) ?? null,
		reportingManager: (offer?.reportingManager as string | null) ?? null,
		division: (offer?.department as string | null) ?? null,
		uanNo: (candidate.uanNo as string | null) ?? null,
		panNo: (candidate.panNo as string | null) ?? null,
		bankAccountName: (candidate.bankAccountName as string | null) ?? null,
		personalMobile: (candidate.mobile as string | null) ?? null
	};
}

// ── Clearances ───────────────────────────────────────────────────────────────

/** Creates the clearance rows for an exit, one per department HR is asking.
 *  Idempotent per department: re-running with a new address updates the
 *  existing row rather than creating a duplicate, so HR can correct a typo in
 *  an approver's email without losing a signature that already landed. */
export async function upsertClearances(
	exitId: string,
	approvers: { department: ClearanceDept; email: string; name?: string | null; designation?: string | null }[]
) {
	for (const a of approvers) {
		await ExitClearance.findOneAndUpdate(
			{ exitId, department: a.department },
			{
				$set: {
					approverEmail: a.email.trim().toLowerCase(),
					approverName: a.name?.trim() || null,
					approverDesignation: a.designation?.trim() || null
				},
				$setOnInsert: { exitId, department: a.department }
			},
			{ upsert: true }
		);
	}
}

export const DEFAULT_DEPTS = DEFAULT_CLEARANCE_DEPTS;

/** Progress over the clearances actually requested for this exit. `total` is
 *  the number of rows that exist, not the size of the department list, so an
 *  exit that skipped Salesforce is not permanently 7/8 cleared. */
export function clearanceProgress(clearances: { status: string }[]) {
	const total = clearances.length;
	const done = clearances.filter((c) => c.status === 'completed').length;
	return { done, total, allDone: total > 0 && done === total };
}

// ── Form completeness ────────────────────────────────────────────────────────

export interface FormState {
	key: 'ndc' | 'nda' | 'exitInterview' | 'relievingFormalities' | 'gratuity';
	label: string;
	submitted: boolean;
	applicable: boolean;
}

/** Which of the five exit forms this employee has to complete, and which are
 *  done. Gratuity is the only conditional one (SOP 5.5). Drives the employee's
 *  progress rail and HR's "waiting on" column from one place. */
export function formStates(exit: Record<string, unknown>): FormState[] {
	const sub = (key: string) =>
		!!(exit[key] as { submittedAt?: Date | null } | undefined)?.submittedAt;
	const gratuity = exit.gratuity as { applicable?: boolean } | undefined;
	return [
		{ key: 'ndc', label: 'No Dues / Clearance details', submitted: sub('ndc'), applicable: true },
		{ key: 'nda', label: 'Non-Disclosure & Non-Compete Agreement', submitted: sub('nda'), applicable: true },
		{ key: 'exitInterview', label: 'Exit Interview', submitted: sub('exitInterview'), applicable: true },
		{
			key: 'relievingFormalities',
			label: 'Relieving Formalities',
			submitted: sub('relievingFormalities'),
			applicable: true
		},
		{
			key: 'gratuity',
			label: 'Gratuity (Form I)',
			submitted: sub('gratuity'),
			applicable: !!gratuity?.applicable
		}
	];
}

/** True when every applicable form has been submitted — the gate on letting the
 *  employee submit the whole exit pack for HR review. */
export function allFormsComplete(exit: Record<string, unknown>): boolean {
	return formStates(exit)
		.filter((f) => f.applicable)
		.every((f) => f.submitted);
}

// ── Live document assembly ───────────────────────────────────────────────────

export interface NdcRowState {
	dept: ClearanceDept;
	deptLabel: string;
	signatory: string;
	rows: { key: string; label: string; verdict: string | null; remark: string | null }[];
	verdict: string | null;
	remarks: string | null;
	approverName: string | null;
	approverDesignation: string | null;
	signed: boolean;
	signedAt: string | null;
	signatureGridfsId: string | null;
}

/** The No-Dues certificate as it stands right now: every section's printed rows
 *  with whatever verdict its department has returned so far, and null where
 *  nobody has answered yet. This is what makes "HR can download the live
 *  document at any instant" work — the PDF is rendered from this, never cached. */
export function ndcState(clearances: Record<string, unknown>[]): NdcRowState[] {
	const byDept = new Map(clearances.map((c) => [String(c.department), c]));
	const out: NdcRowState[] = [];
	for (const [dept, section] of NDC_SECTION_BY_DEPT) {
		const c = byDept.get(dept);
		// Only sections HR actually asked for appear on the certificate: an
		// optional section with no clearance row was never in scope.
		if (!c && section.optional) continue;
		const rows = asRecord(c?.rows);
		const remarks = asRecord(c?.rowRemarks);
		out.push({
			dept,
			deptLabel: section.label,
			signatory: section.signatory,
			rows: section.rows.map((r) => ({
				key: r.key,
				label: r.label,
				verdict: rows[r.key] ?? null,
				remark: remarks[r.key] ?? null
			})),
			verdict: (c?.verdict as string | null) ?? null,
			remarks: (c?.remarks as string | null) ?? null,
			approverName: (c?.approverName as string | null) ?? null,
			approverDesignation: (c?.approverDesignation as string | null) ?? null,
			signed: c?.status === 'completed',
			signedAt: (c?.completedAt as Date | null)?.toISOString() ?? null,
			signatureGridfsId: c?.signatureGridfsId ? String(c.signatureGridfsId) : null
		});
	}
	return out;
}

/** Mongoose Maps come back as a Map from a hydrated doc and a plain object from
 *  .lean() — every reader of a Map field has to cope with both. */
export function asRecord(value: unknown): Record<string, string> {
	if (!value) return {};
	if (value instanceof Map) return Object.fromEntries(value) as Record<string, string>;
	return value as Record<string, string>;
}

/** Same, for the boolean-valued closure checklist. */
export function asBoolRecord(value: unknown): Record<string, boolean> {
	if (!value) return {};
	if (value instanceof Map) return Object.fromEntries(value) as Record<string, boolean>;
	return value as Record<string, boolean>;
}

/** Brand + display name for an exit, the same chain every other surface uses:
 *  companyId → Company.brandSlug → brandBySlug. */
export async function exitCompany(companyId: unknown) {
	const company = await Company.findById(companyId).lean();
	return company;
}
