// The exit workflow: where each step stands, its mails, and when the letters go.
//
// FLOW_STEPS (shared/offboarding.ts) is the order the page lists the steps in,
// and nothing more (HR decision, Nov 2026): every step is independent. Each
// clearance mail is ready from the start and goes whenever HR sends it — the
// manager need not have signed before IT is asked, and payroll can be mailed
// before HR has filled the F&F. syncFlow() keeps the rest in step with what has
// happened — the exit's status, the "your turn" alert to HR, the scheduled
// release — and is called after every send and signature. It is idempotent.
//
// No approver is mailed on its own: each mail waits for HR, who previews it
// (draftStep) and sends it (mailStep) from the exit page. A signed step can be
// sent back (sendBackStep) when something is missing: it reopens, and the same
// reviewed mail asks for exactly what HR ticked.
//
// The last step is the release: the letters HR picked go to the employee a set
// number of days after payroll signs — automatically only once every clearance
// is signed. A ticker (like the BGV reminders') sends whatever has come due;
// HR can also release by hand at any point.
import { env } from '$env/dynamic/private';
import { connectDb } from '$lib/server/db';
import { Admin, AppSetting, Exit, ExitClearance, ExitDocument } from '$lib/server/db/schema';
import { audit } from '$lib/server/audit';
import { baseUrl } from '$lib/server/base-url';
import { brandBySlug } from '$lib/shared/brands';
import {
	DEPT_FLOW_STEPS,
	FLOW_STEPS,
	HANDOVER_DOCS,
	defaultReleaseLetters,
	lettersForTrack,
	routeCc,
	routeTo,
	type ClearanceDept,
	type FlowStepKey,
	type RoutingKey
} from '$lib/shared/offboarding';
import { createExitToken, exitCompany } from './exit';
import { EXIT_DOCS, EXIT_DOC_BY_KEY, exitPackZip, loadPdfInput, renderExitDoc } from './documents';
import { noDuesPdf } from './pdf';
import {
	buildClearanceMail,
	buildHandoverMail,
	sendClearanceMail,
	sendExitAlert,
	sendHandoverMail,
	type MailDraft,
	type MailEdits
} from './mail';
import { checkMailDetails, detailsProblem } from '$lib/shared/exit-mail-details';

type Lean = Record<string, any>;
const DAY_MS = 24 * 60 * 60 * 1000;

// ── Routing defaults ─────────────────────────────────────────────────────────
// What a new exit's mail settings start from. Saved from any exit's settings
// card ("use as the default"), so the desk sets them once rather than per exit.
// The manager is never defaulted: it is a different person for every employee.

interface Addr {
	/** The To addresses, comma-separated (see routeTo()). */
	email: string;
	cc: string[];
	name: string;
	designation: string;
}
export interface RoutingDefaults {
	/** Only the manager's Cc has a default — the manager differs per employee. */
	manager: { cc: string[] };
	it: Addr;
	salesforce: Addr & { enabled: boolean };
	hr: Addr;
	payroll: Addr;
	releaseAfterDays: number;
}

const ROUTING_SETTING_KEY = 'exit_routing';

export const ROUTING_FALLBACK: RoutingDefaults = {
	manager: { cc: [] },
	it: { email: 'ithelpdesk@championsmail.com', cc: [], name: 'IT Helpdesk', designation: '' },
	salesforce: { email: '', cc: [], name: '', designation: '', enabled: false },
	hr: { email: 'hrd.jst@championsmail.com', cc: [], name: 'HR desk', designation: '' },
	payroll: { email: '', cc: [], name: '', designation: '' },
	releaseAfterDays: 30
};

export async function getRoutingDefaults(): Promise<RoutingDefaults> {
	const row = await AppSetting.findOne({ key: ROUTING_SETTING_KEY }).lean<Lean>();
	const v = (row?.value ?? {}) as Partial<RoutingDefaults>;
	const addr = (a: Partial<Addr> | undefined, f: Addr): Addr => ({
		email: a?.email ?? f.email,
		cc: Array.isArray(a?.cc) ? a.cc : f.cc,
		name: a?.name ?? f.name,
		designation: a?.designation ?? f.designation
	});
	return {
		manager: { cc: Array.isArray(v.manager?.cc) ? v.manager.cc : ROUTING_FALLBACK.manager.cc },
		it: addr(v.it, ROUTING_FALLBACK.it),
		salesforce: {
			...addr(v.salesforce, ROUTING_FALLBACK.salesforce),
			enabled: v.salesforce?.enabled ?? ROUTING_FALLBACK.salesforce.enabled
		},
		hr: addr(v.hr, ROUTING_FALLBACK.hr),
		payroll: addr(v.payroll, ROUTING_FALLBACK.payroll),
		releaseAfterDays: Number.isFinite(v.releaseAfterDays) ? Number(v.releaseAfterDays) : ROUTING_FALLBACK.releaseAfterDays
	};
}

export async function saveRoutingDefaults(value: RoutingDefaults, adminId: string) {
	await AppSetting.findOneAndUpdate(
		{ key: ROUTING_SETTING_KEY },
		{ key: ROUTING_SETTING_KEY, value, updatedBy: adminId },
		{ upsert: true }
	);
}

/** The routing and cadence a brand-new exit starts with. */
export async function initialRouting(reportingManager: string | null) {
	const d = await getRoutingDefaults();
	const from = (a: Addr) => ({ email: a.email || null, cc: a.cc, name: a.name || null, designation: a.designation || null });
	return {
		routing: {
			manager: { email: null, cc: d.manager.cc, name: reportingManager || null, designation: null },
			it: from(d.it),
			salesforce: { ...from(d.salesforce), enabled: d.salesforce.enabled },
			hr: from(d.hr),
			payroll: from(d.payroll)
		},
		flow: { releaseAfterDays: d.releaseAfterDays, autoRelease: true }
	};
}

// ── Where each step stands ───────────────────────────────────────────────────

/** done — signed, filled or released.
 *  active — out of HR's hands for now: a mail awaiting sign-off, or a release
 *    that is scheduled.
 *  waiting — not started: a mail not sent yet, F&F not handed over, letters
 *    not scheduled. Never "held": every step can be started at any time.
 *  blocked — a mail with no address to send to.
 *  skipped — Salesforce, when it is not part of this exit. */
export type StepStatus = 'done' | 'active' | 'blocked' | 'waiting' | 'skipped';

export interface StepState {
	key: FlowStepKey;
	label: string;
	hint: string;
	status: StepStatus;
	/** Who this step mails, when it mails anyone. */
	to: string | null;
	/** When it was sent (active) or finished (done), ISO. */
	sentAt: string | null;
	doneAt: string | null;
	/** One line under the label: a verdict, a due date, what is missing. */
	detail: string | null;
	clearanceId: string | null;
	/** The step's first mail is ready for HR to review and send. */
	ready: boolean;
}

/** Whether a step still needs something — not done, and part of this exit. */
const isOpen = (s: StepState | undefined) => !!s && s.status !== 'done' && s.status !== 'skipped';

const fmt = (d: Date | string | null | undefined) =>
	d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '';

/** The letters the release sends: HR's pick, else the track's default — and
 *  never one the track does not have. An empty pick is honoured (HR may send
 *  only uploaded documents). */
export function releaseLetterKeys(exit: Lean): string[] {
	const allowed = lettersForTrack(exit.track) as string[];
	const picked = exit.flow?.letterKeys as string[] | undefined | null;
	return (picked ?? defaultReleaseLetters(exit.track)).filter((k) => allowed.includes(k));
}

/** Pure: the state of every step, from the exit and its clearance rows. Each
 *  step is read on its own — no step's state depends on another's. */
/** Which details the final release needs: with letters in it, their
 *  reference number too (see MAIL_DETAILS). */
export function lettersDetailKey(exit: Lean): 'letters' | 'handover' {
	return releaseLetterKeys(exit).length ? 'letters' : 'handover';
}

export function flowSteps(exit: Lean, clearances: Lean[]): StepState[] {
	const byDept = new Map(clearances.map((c) => [String(c.department), c]));
	return FLOW_STEPS.map((def) => {
		const base: StepState = {
			key: def.key,
			label: def.label,
			hint: def.hint,
			status: 'waiting',
			to: null,
			sentAt: null,
			doneAt: null,
			detail: null,
			clearanceId: null,
			ready: false
		};
		const route = exit.routing?.[def.key as RoutingKey] as Lean | undefined;

		if (def.dept) {
			base.to = routeTo(route).join(', ') || null;
			if (def.key === 'salesforce' && !route?.enabled) {
				return { ...base, status: 'skipped', detail: 'Not part of this exit' };
			}
			const row = byDept.get(def.dept);
			base.clearanceId = row ? String(row._id) : null;
			base.sentAt = row?.sentAt ? new Date(row.sentAt).toISOString() : null;
			if (row?.status === 'completed') {
				return {
					...base,
					status: 'done',
					doneAt: row.completedAt ? new Date(row.completedAt).toISOString() : null,
					detail: `${row.verdict === 'dues' ? 'Dues outstanding' : 'No dues'}${row.approverName ? ` · ${row.approverName}` : ''}`
				};
			}
			if (!base.to) return { ...base, status: 'blocked', detail: 'Add an email in Mail settings' };
			const sentBack = !!row?.sendBack?.at;
			if (row?.status === 'sent')
				return {
					...base,
					status: 'active',
					detail: sentBack
						? `Sent back ${fmt(row.sendBack.at)} — waiting for their update`
						: `Awaiting sign-off · sent ${fmt(row.sentAt)}`
				};
			return {
				...base,
				ready: true,
				detail: sentBack ? 'Send-back ready — review and send it' : 'Not sent yet — send it any time'
			};
		}

		if (def.key === 'hr') {
			base.to = route?.email || null;
			if (exit.flow?.hrDoneAt)
				return {
					...base,
					status: 'done',
					doneAt: new Date(exit.flow.hrDoneAt).toISOString(),
					detail: exit.flow.hrDoneBy ? `Handed to payroll by ${exit.flow.hrDoneBy}` : 'Handed to payroll'
				};
			return { ...base, detail: 'Fill the F&F and leave any time, then hand it to payroll' };
		}

		// letters
		base.to = exit.personalEmail ?? null;
		if (exit.flow?.releasedAt)
			return {
				...base,
				status: 'done',
				doneAt: new Date(exit.flow.releasedAt).toISOString(),
				detail: `Sent${exit.flow.releasedBy ? ` · ${exit.flow.releasedBy}` : ''}`
			};
		if (exit.flow?.autoRelease === false)
			return { ...base, detail: 'Manual — release them whenever you are ready' };
		if (exit.flow?.scheduledAt)
			return { ...base, status: 'active', detail: `Scheduled for ${fmt(exit.flow.scheduledAt)}` };
		return {
			...base,
			detail: `${exit.flow?.releaseAfterDays ?? 30} days after payroll signs, once every clearance is in — or release by hand`
		};
	});
}

/** The clearance mails still waiting on a signature, by label. */
export function openClearances(steps: StepState[]): string[] {
	return steps
		.filter((s) => FLOW_STEPS.find((d) => d.key === s.key)?.dept && isOpen(s))
		.map((s) => s.label);
}

// ── Keeping in step ──────────────────────────────────────────────────────────

/** Statuses syncFlow may move between. Only reached once HR has accepted the
 *  employee's submission: before that the status tracks the employee's forms,
 *  and a clearance going out must not lock them out of finishing them. */
const MOVABLE = ['in_progress', 'submitted', 'changes_requested', 'clearances', 'cleared', 'fnf'];

async function setLastError(exitId: string, step: string | null, message: string | null) {
	await Exit.findByIdAndUpdate(exitId, {
		'flow.lastError': { step, message, at: step ? new Date() : null }
	});
}

/** Brings the exit in line with its steps: the status (once the submission is
 *  accepted), the alert telling HR the departmental clearances are in, and the
 *  scheduled release. Sends no approver mail — those are HR's to send. Safe to
 *  call at any time and any number of times. Errors are logged, never thrown. */
export async function syncFlow(exitId: string): Promise<void> {
	try {
		const exit = await Exit.findById(exitId).lean<Lean>();
		// Exits from before the workflow keep their old rules.
		if (!exit?.flow?.startedAt || exit.status === 'completed') return;
		const clearances = await ExitClearance.find({ exitId }).lean<Lean[]>();
		const steps = flowSteps(exit, clearances);
		const by = new Map(steps.map((s) => [s.key, s]));
		const deptOpen = DEPT_FLOW_STEPS.some((k) => isOpen(by.get(k)));
		const payrollDone = by.get('payroll')?.status === 'done';

		// Clearances pending → F&F in progress (only payroll left) → cleared
		// (everyone signed, the letters to go).
		if (exit.reviewedAt && MOVABLE.includes(exit.status)) {
			const status = deptOpen ? 'clearances' : payrollDone ? 'cleared' : 'fnf';
			if (exit.status !== status) await Exit.findByIdAndUpdate(exitId, { status });
		}
		// A nudge, not a gate: HR can fill the F&F at any time.
		if (!deptOpen && !payrollDone && !exit.flow?.hrDoneAt) await notifyHrTurn(exit);
		await scheduleRelease(exitId);
	} catch (e) {
		console.error(`[exit-flow] sync failed for exit=${exitId}:`, e);
	}
}

/** Puts an exit on the workflow — when HR accepts the submission or sends any
 *  of its mails — and brings it in step. */
export async function startFlow(exitId: string) {
	await Exit.updateOne({ _id: exitId, 'flow.startedAt': null }, { $set: { 'flow.startedAt': new Date() } });
	await syncFlow(exitId);
}

/** Every generated exit document except the letters, plus every file uploaded
 *  against the exit, as one zip — what payroll gets attached to their request
 *  (and can download again from their clearance page). One file rather than a
 *  dozen keeps the mail readable and the papers together. */
async function payrollAttachments(exitId: string) {
	const pack = await exitPackZip(exitId, { includeUploads: true, includeHandover: true, skipLetters: true });
	return pack ? [{ filename: pack.filename, content: Buffer.from(pack.bytes) }] : [];
}

export interface SendBack {
	note: string | null;
	items: string[];
	uploads: string[];
}

/** What one clearance step's mail says, for the preview and the send alike. */
function stepMailOpts(
	exit: Lean,
	key: FlowStepKey,
	dept: ClearanceDept,
	reminder: boolean,
	sendBack: SendBack | null = null
) {
	const route = (exit.routing?.[key as RoutingKey] ?? {}) as Lean;
	return {
		sendBack,
		to: routeTo(route),
		cc: routeCc(route),
		signoff: exit.routing?.signoff ?? null,
		approverName: (route.name as string) || null,
		department: dept,
		employeeName: exit.fullName,
		employeeId: exit.employeeId,
		lwd: exit.lwd ?? null,
		reminder,
		...(dept === 'payroll'
			? {
					extraIntro: [
						// Payroll can be mailed before HR has filled the F&F: then
						// they enter the figures rather than check them.
						(exit.flow?.hrDoneAt
							? 'HR has filled in the full & final settlement and the leave position. Everything is done on the page ' +
								'the button below opens — no login, nothing else to open: check and correct the F&F figures, tick '
							: 'Everything is done on the page the button below opens — no login, nothing else to open: fill in ' +
								'the full & final settlement and the leave position, tick ') +
							'off the F&F checks, upload the last three months’ payslips, and sign.',
						'Every exit document for this employee is attached as one zip file, and can be downloaded again from that page.'
					],
					note: {
						title: 'Your figures are the final ones',
						text:
							'What you save on that page is what the employee’s settlement statement shows, the payslips go to ' +
							'the employee with their final documents, and signing starts the countdown to their relieving letter.'
					}
				}
			: {})
	};
}

export interface StepDraft extends MailDraft {
	key: FlowStepKey | 'letters';
	label: string;
	reminder: boolean;
	/** False when the mail can only be previewed: already signed, not part of
	 *  this exit, or the address is missing. */
	sendable: boolean;
	why: string | null;
	attachments: { name: string; href: string }[];
	/** Set when this is a send-back: what HR is asking for. */
	sendBack?: SendBack | null;
}

const asSendBack = (v: Lean | null | undefined): SendBack | null =>
	v && (v.items?.length || v.uploads?.length || v.note)
		? { note: v.note ?? null, items: [...(v.items ?? [])], uploads: [...(v.uploads ?? [])] }
		: null;

/** The mail a step would send right now, for HR to review before pressing
 *  Send. The link in it is a placeholder: the real one is minted at send. */
export async function draftStep(
	exitId: string,
	key: FlowStepKey,
	/** Preview a send-back with these asks, instead of the step's own mail. */
	proposedBack: SendBack | null = null
): Promise<StepDraft | { error: string }> {
	const def = FLOW_STEPS.find((d) => d.key === key);
	if (!def) return { error: 'Unknown step.' };
	// Read together: the dialog waits on this, and on a remote database each
	// round trip is most of the wait.
	const [exit, clearances, files] = await Promise.all([
		Exit.findById(exitId).lean<Lean>(),
		ExitClearance.find({ exitId }).lean<Lean[]>(),
		ExitDocument.find({ exitId }).select('docType label source').lean<Lean[]>()
	]);
	if (!exit) return { error: 'Exit not found.' };
	const state = flowSteps(exit, clearances).find((s) => s.key === key)!;
	const company = await exitCompany(exit.companyId);
	const brand = brandBySlug(company?.brandSlug ?? undefined);
	const base = `/admin/offboarding/${exitId}`;
	const fileLabel = new Map<string, string>(HANDOVER_DOCS.map((d) => [d.docType, d.label]));
	const placeholder = (path: string) => `${baseUrl()}${path}/«secure link created when you press Send»`;

	if (def.dept) {
		const dept = def.dept as ClearanceDept;
		const row = clearances.find((c) => c.department === dept);
		const back = asSendBack(proposedBack ?? row?.sendBack);
		const reminder = !proposedBack && row?.status === 'sent';
		const opts = stepMailOpts(exit, key, dept, reminder, back);
		const mail = await buildClearanceMail({ ...opts, brand, url: placeholder('/x/clearance') });
		// Which documents apply is decided by the exit alone, so the preview
		// lists them without rendering a single PDF.
		const packCount = EXIT_DOCS.filter((d) => !d.letter && d.applies(exit)).length + files.length;
		const attachments =
			dept === 'payroll'
				? [{ name: `Exit documents (zip · ${packCount} files)`, href: `${base}/pack-zip?for=payroll` }]
				: [{ name: 'No Dues Certificate', href: `${base}/doc/no_dues` }];
		if (proposedBack) {
			const why =
				exit.status === 'completed'
					? 'This exit is closed — reopen it first.'
					: row?.status !== 'completed'
						? 'They have not signed yet — there is nothing to send back.'
						: !opts.to.length
							? 'No email set — add it in Mail settings.'
							: !back
								? 'Tick what is missing, ask for a document, or write a note.'
								: null;
			return { ...mail, key, label: def.label, reminder: false, sendable: !why, why, attachments, sendBack: back };
		}
		const why =
			state.status === 'done'
				? 'Already signed.'
				: state.status === 'skipped'
					? 'Not part of this exit — switch it on in Mail settings.'
					: !opts.to.length
						? 'No email set — add it in Mail settings.'
						: null;
		return { ...mail, key, label: def.label, reminder, sendable: !why, why, attachments, sendBack: back };
	}

	if (key === 'letters') {
		const keys = releaseLetterKeys(exit);
		const hrFiles = files.filter((f) => f.source === 'hr');
		const mail = await buildHandoverMail({
			to: exit.personalEmail,
			employeeName: exit.fullName,
			signoff: exit.routing?.signoff ?? null,
			brand,
			url: placeholder('/x/final'),
			fnfAmount: exit.fnf?.netAmount ?? null,
			fnfDate: exit.fnf?.settlementDate ?? null,
			documents: [
				...keys.map((k) => EXIT_DOC_BY_KEY.get(k as never)?.label ?? k),
				...new Set(hrFiles.map((f) => fileLabel.get(f.docType) ?? f.label ?? f.docType))
			]
		});
		const blocker = exit.flow?.releasedAt
			? 'Already sent.'
			: !keys.length && !hrFiles.length
				? 'Nothing to send — pick at least one letter or upload a handover document.'
				: null;
		// Releasing early is allowed (HR's call), but never without saying so.
		const open = openClearances(flowSteps(exit, clearances));
		const early =
			!blocker && open.length
				? `Not every clearance is signed yet (still open: ${open.join(', ')}) — releasing now sends this before they are in, and closes the exit.`
				: null;
		return {
			...mail,
			key,
			label: def.label,
			reminder: false,
			sendable: !blocker,
			why: blocker ?? early,
			attachments: keys.map((k) => ({
				name: EXIT_DOC_BY_KEY.get(k as never)?.label ?? k,
				href: `${base}/doc/${k}`
			}))
		};
	}
	return { error: 'That step does not send a mail.' };
}

/** Sends (or, with `reminder`, re-sends) one clearance step's mail to the
 *  address in the exit's mail settings — whenever HR chooses, whatever the
 *  other steps are doing. The first send is claimed atomically — pending →
 *  sent — so a double press cannot mail the approver twice. */
export async function mailStep(
	exitId: string,
	key: FlowStepKey,
	opts: { reminder?: boolean; edits?: MailEdits | null } = {}
): Promise<{ ok: true } | { error: string }> {
	const def = FLOW_STEPS.find((d) => d.key === key);
	if (!def?.dept) return { error: 'That step does not send a clearance.' };
	const dept = def.dept as ClearanceDept;
	const exit = await Exit.findById(exitId).lean<Lean>();
	if (!exit) return { error: 'Exit not found.' };
	// The employee details this mail prints must be real before it goes.
	const badDetails = detailsProblem(checkMailDetails(exit, key));
	if (badDetails) return { error: badDetails };
	const route = (exit.routing?.[key as RoutingKey] ?? {}) as Lean;
	const to = routeTo(route);
	if (!to.length) return { error: `Add the ${def.label} email in Mail settings first.` };
	// The first To address is the approver on record; the rest are copied in
	// as recipients of the same mail and can open the same link.
	const email = to[0];

	const existing = await ExitClearance.findOne({ exitId, department: dept }).lean<Lean>();
	if (existing?.status === 'completed') return { error: `The ${def.label} has already signed.` };
	// The row follows the mail settings: an address corrected there is the one
	// the next send uses, and the name and designation prefill their page. A
	// send-back keeps what the approver typed when they signed.
	const signedBefore = !!existing?.sendBack?.at;
	await ExitClearance.findOneAndUpdate(
		{ exitId, department: dept },
		{
			$set: {
				approverEmail: email,
				...(signedBefore
					? {}
					: { approverName: route.name || null, approverDesignation: route.designation || null })
			},
			$setOnInsert: { exitId, department: dept }
		},
		{ upsert: true }
	);

	let row: Lean | null;
	if (opts.reminder) {
		row = await ExitClearance.findOneAndUpdate(
			{ exitId, department: dept, status: { $ne: 'completed' } },
			{ $set: { status: 'sent', sentAt: new Date() }, $inc: { sentCount: 1 } },
			{ new: true }
		).lean<Lean>();
	} else {
		row = await ExitClearance.findOneAndUpdate(
			{ exitId, department: dept, status: 'pending' },
			{ $set: { status: 'sent', sentAt: new Date() }, $inc: { sentCount: 1 } },
			{ new: true }
		).lean<Lean>();
		if (!row) return { ok: true }; // someone else just sent it
	}
	if (!row) return { error: 'Nothing to send.' };

	const company = await exitCompany(exit.companyId);
	const brand = brandBySlug(company?.brandSlug ?? undefined);
	const token = await createExitToken(exitId, 'clearance', String(row._id));
	const url = `${baseUrl()}/x/clearance/${token}`;

	try {
		let attachments: { filename: string; content: Buffer }[] | undefined;
		if (dept === 'payroll') {
			attachments = await payrollAttachments(exitId);
		} else {
			const input = await loadPdfInput(exitId);
			if (input)
				attachments = [{ filename: `No-Dues-${exit.employeeId}.pdf`, content: Buffer.from(await noDuesPdf(input)) }];
		}
		await sendClearanceMail({
			...stepMailOpts(exit, key, dept, !!opts.reminder, asSendBack(existing?.sendBack)),
			brand,
			url,
			attachments,
			edits: opts.edits
		});
	} catch (e) {
		console.error(`[exit-flow] ${key} mail failed for exit=${exitId}:`, e);
		// Put a first send back so the next advance retries it.
		if (!opts.reminder)
			await ExitClearance.updateOne({ _id: row._id, status: 'sent' }, { $set: { status: 'pending' }, $inc: { sentCount: -1 } });
		await setLastError(exitId, key, `The ${def.label} mail to ${to.join(', ')} could not be sent. Check the addresses, then Review & send again.`);
		return { error: `The mail to ${to.join(', ')} could not be sent.` };
	}
	if (exit.flow?.lastError?.step) await setLastError(exitId, null, null);
	// A clearance can now go before the submission is accepted. Sending one puts
	// the exit on the workflow, so the approver's signature is handled by it
	// rather than by the pre-workflow rules on the clearance page.
	if (!exit.flow?.startedAt)
		await Exit.updateOne({ _id: exitId, 'flow.startedAt': null }, { $set: { 'flow.startedAt': new Date() } });
	return { ok: true };
}

/** Reopens a signed clearance and mails the approver what HR says is missing
 *  — the reviewed send-back. Their earlier answers stay filled in; they
 *  complete what was asked and sign again. Sending anyone back also stops a
 *  scheduled release until they have: it waits on every clearance, and
 *  payroll's figures especially are no longer final. */
export async function sendBackStep(
	exitId: string,
	key: FlowStepKey,
	back: SendBack,
	by: string,
	edits: MailEdits | null = null
): Promise<{ ok: true } | { error: string }> {
	const def = FLOW_STEPS.find((d) => d.key === key);
	if (!def?.dept) return { error: 'That step has no approver to send back to.' };
	if (!asSendBack(back)) return { error: 'Tick what is missing, ask for a document, or write a note.' };
	const exit = await Exit.findById(exitId).lean<Lean>();
	if (!exit) return { error: 'Exit not found.' };
	if (exit.status === 'completed') return { error: 'This exit is closed — reopen it first.' };

	const reopened = await ExitClearance.findOneAndUpdate(
		{ exitId, department: def.dept, status: 'completed' },
		{
			$set: {
				status: 'pending',
				completedAt: null,
				sendBack: { note: back.note, items: back.items, uploads: back.uploads, at: new Date(), by }
			}
		},
		{ new: true }
	).lean<Lean>();
	if (!reopened) return { error: `The ${def.label} has not signed yet — there is nothing to send back.` };

	if (def.dept === 'payroll')
		await Exit.findByIdAndUpdate(exitId, { 'fnf.submittedByPayrollAt': null, 'flow.scheduledAt': null });

	const res = await mailStep(exitId, key, { edits });
	// Either way the step is open again, so a scheduled release is withdrawn.
	await syncFlow(exitId);
	if ('error' in res) {
		// Leave it reopened: the step now shows as ready, and Review & send
		// re-sends the same request once the address is fixed.
		return res;
	}
	return { ok: true };
}

async function hrRecipients(exit: Lean): Promise<string[]> {
	const to = new Set<string>();
	for (const a of routeTo(exit.routing?.hr)) to.add(a);
	if (exit.createdBy) {
		const admin = await Admin.findById(exit.createdBy, 'email').lean<Lean>();
		if (admin?.email) to.add(String(admin.email).toLowerCase());
	}
	return [...to];
}

async function notifyHrTurn(exit: Lean) {
	const claimed = await Exit.updateOne(
		{ _id: exit._id, 'flow.hrNotifiedAt': null },
		{ $set: { 'flow.hrNotifiedAt': new Date() } }
	);
	if (!claimed.modifiedCount) return;
	try {
		const company = await exitCompany(exit.companyId);
		await sendExitAlert({
			to: await hrRecipients(exit),
			cc: routeCc(exit.routing?.hr),
			subject: `Clearances signed: F&F and leave for ${exit.fullName}`,
			lines: [
				`The departmental clearances for ${exit.fullName} (${exit.employeeId}) are signed.`,
				'If you have not yet, fill in the full & final settlement and the leave position on the exit page and ' +
					'hand it to payroll — they get it prefilled, with every exit document attached.'
			],
			brand: brandBySlug(company?.brandSlug ?? undefined),
			url: `${baseUrl()}/admin/offboarding/${String(exit._id)}`
		});
	} catch (e) {
		console.error('[exit-flow] HR turn alert failed:', e);
	}
}

/** When payroll signed off — the release counts from here. */
async function payrollSignedAt(exitId: string): Promise<Date | null> {
	const row = await ExitClearance.findOne({ exitId, department: 'payroll', status: 'completed' }, 'completedAt').lean<Lean>();
	return row?.completedAt ? new Date(row.completedAt) : null;
}

/** Sets (or, after HR changes the cadence, resets) when the release is due,
 *  and releases straight away if that is already past. The date counts from
 *  payroll's sign-off, but nothing is scheduled while any clearance is still
 *  open: with the steps independent, payroll may sign before IT has, and the
 *  letters must not go out on their own ahead of a department. HR can still
 *  release by hand whenever they choose. */
export async function scheduleRelease(exitId: string, opts: { reset?: boolean } = {}) {
	const exit = await Exit.findById(exitId).lean<Lean>();
	if (!exit || exit.flow?.releasedAt || exit.status === 'completed') return;
	const signed = await payrollSignedAt(exitId);
	const clearances = await ExitClearance.find({ exitId }).lean<Lean[]>();
	const pending = openClearances(flowSteps(exit, clearances)).length > 0;
	if (!signed || pending || exit.flow?.autoRelease === false) {
		if (exit.flow?.scheduledAt) await Exit.findByIdAndUpdate(exitId, { 'flow.scheduledAt': null });
		return;
	}
	if (exit.flow?.scheduledAt && !opts.reset) {
		if (new Date(exit.flow.scheduledAt) <= new Date()) await releaseLetters(exitId, 'Scheduled release');
		return;
	}
	const days = Math.max(0, Number(exit.flow?.releaseAfterDays ?? 30));
	const due = new Date(signed.getTime() + days * DAY_MS);
	const first = !exit.flow?.scheduledAt;
	await Exit.findByIdAndUpdate(exitId, { 'flow.scheduledAt': due });
	if (due <= new Date()) {
		await releaseLetters(exitId, 'Scheduled release');
		return;
	}
	if (first) {
		try {
			const company = await exitCompany(exit.companyId);
			await sendExitAlert({
				to: await hrRecipients(exit),
				subject: `All clearances signed: ${exit.fullName}`,
				lines: [
					`Every clearance for ${exit.fullName} (${exit.employeeId}) is signed, payroll's full & final settlement included.`,
					`Their letters go out automatically on ${fmt(due)}. Change the selection or the date on the exit page.`
				],
				brand: brandBySlug(company?.brandSlug ?? undefined),
				url: `${baseUrl()}/admin/offboarding/${exitId}`
			});
		} catch (e) {
			console.error('[exit-flow] release-scheduled alert failed:', e);
		}
	}
}

// ── The release ──────────────────────────────────────────────────────────────

/** Sends the employee their letters and the handover link, and closes the
 *  exit. Claimed atomically on `flow.releasedAt`, so the ticker and a manual
 *  press can never both send. */
export async function releaseLetters(
	exitId: string,
	actor: string,
	/** HR's edits from the review dialog; a scheduled release has none. */
	edits: MailEdits | null = null
): Promise<{ ok: true; url: string } | { error: string }> {
	const exit = await Exit.findOneAndUpdate(
		{ _id: exitId, 'flow.releasedAt': null, status: { $ne: 'completed' } },
		{ $set: { 'flow.releasedAt': new Date(), 'flow.releasedBy': actor } },
		{ new: true }
	).lean<Lean>();
	if (!exit) return { error: 'This exit has already been released or closed.' };

	try {
		const keys = releaseLetterKeys(exit);
		const files = await ExitDocument.find({ exitId, source: 'hr' }).lean<Lean[]>();
		if (!keys.length && !files.length)
			throw new Error('Nothing to send — pick at least one letter or upload a handover document.');
		// Every exit letter opens with the reference number, so it may be left
		// blank all through the exit but not when a letter actually goes out.
		// A scheduled release stays due and goes on the first tick after HR adds it.
		if (keys.length && !String(exit.refNo ?? exit.letters?.refNo ?? '').trim())
			throw new Error('Add the reference number under Particulars — it is printed on the letters being released.');
		// Same for the details the mail and letters print: a scheduled release
		// stays due until HR fills them in.
		const badDetails = detailsProblem(checkMailDetails(exit, lettersDetailKey(exit)));
		if (badDetails) throw new Error(badDetails);

		const input = await loadPdfInput(exitId);
		if (!input) throw new Error('Exit not found.');
		const attachments: { filename: string; content: Buffer }[] = [];
		for (const key of keys) {
			const rendered = await renderExitDoc(key, input);
			if (rendered) attachments.push({ filename: rendered.filename, content: Buffer.from(rendered.bytes) });
		}

		const company = await exitCompany(exit.companyId);
		const brand = brandBySlug(company?.brandSlug ?? undefined);
		const token = await createExitToken(exitId, 'handover');
		const url = `${baseUrl()}/x/final/${token}`;
		const fileLabel = new Map<string, string>(HANDOVER_DOCS.map((d) => [d.docType, d.label]));
		await sendHandoverMail({
			to: exit.personalEmail,
			employeeName: exit.fullName,
			signoff: exit.routing?.signoff ?? null,
			brand,
			url,
			fnfAmount: exit.fnf?.netAmount ?? null,
			fnfDate: exit.fnf?.settlementDate ?? null,
			documents: [
				...keys.map((k) => EXIT_DOC_BY_KEY.get(k as never)?.label ?? k),
				...new Set(files.map((f) => fileLabel.get(f.docType) ?? f.label ?? f.docType))
			],
			attachments,
			edits
		});

		await Exit.findByIdAndUpdate(exitId, {
			status: 'completed',
			completedAt: new Date(),
			handoverMailSentAt: new Date(),
			// What actually went, so the employee's portal lists exactly these.
			'flow.letterKeys': keys,
			'flow.lastError': { step: null, message: null, at: null }
		});
		await audit({
			candidateId: exit.candidateId ? String(exit.candidateId) : null,
			actor,
			action: 'exit_letters_released',
			field: keys.join(', ') || 'uploads only',
			newValue: exit.personalEmail
		});
		return { ok: true, url };
	} catch (e) {
		const message = e instanceof Error ? e.message : 'The release could not be sent.';
		console.error(`[exit-flow] release failed for exit=${exitId}:`, e);
		await Exit.findByIdAndUpdate(exitId, {
			'flow.releasedAt': null,
			'flow.releasedBy': null,
			'flow.lastError': { step: 'letters', message, at: new Date() }
		});
		return { error: message };
	}
}

// ── Ticker ───────────────────────────────────────────────────────────────────
// Same shape as the BGV reminder ticker: a long-running server sweeps every
// fifteen minutes, and a missed tick only delays a release, never drops it.

export async function sweepDueReleases() {
	// The ticker can fire before any request has opened the connection.
	await connectDb();
	const due = await Exit.find(
		{
			'flow.scheduledAt': { $lte: new Date() },
			'flow.releasedAt': null,
			'flow.autoRelease': { $ne: false },
			status: { $ne: 'completed' }
		},
		'_id'
	).lean<Lean[]>();
	for (const row of due) await releaseLetters(String(row._id), 'Scheduled release');
	return due.length;
}

const TICK_MS = 15 * 60_000;
const FIRST_TICK_MS = 60_000;
let ticking = false;

export function startExitReleaseTicker() {
	if (ticking) return;
	if (env.EXIT_RELEASE_TICKER === 'off') return;
	if (process.env.VERCEL) return;
	ticking = true;
	const schedule = (ms: number) => {
		const t = setTimeout(run, ms);
		t.unref?.();
	};
	const run = () => {
		sweepDueReleases()
			.then((n) => n && console.log(`[exit-release] released ${n} due exit(s)`))
			.catch((e) => console.error('[exit-release] sweep failed:', e))
			.finally(() => schedule(TICK_MS));
	};
	schedule(FIRST_TICK_MS);
}
