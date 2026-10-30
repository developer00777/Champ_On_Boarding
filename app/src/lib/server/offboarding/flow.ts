// The exit chain: who is mailed next, and when the letters go out.
//
// FLOW_STEPS (shared/offboarding.ts) is the order. Nothing here is sent in
// parallel: each step's mail is readied only once the step before it is done,
// so IT is never asked to sign before the manager has, and payroll gets the
// settlement only after HR has filled it. advanceFlow() is the one function
// that moves an exit along — called when the chain starts, when an approver
// signs, when HR hands over to payroll, and when HR fixes a missing address —
// and it is idempotent.
//
// No approver is mailed on its own: when a step comes up, its mail waits for
// HR, who previews it (draftStep) and sends it (mailStep) from the exit page.
// A signed step can be sent back (sendBackStep) when something is missing: it
// reopens, and the same reviewed mail asks for exactly what HR ticked.
//
// The last step is the release: the letters HR picked go to the employee a set
// number of days after payroll signs. A ticker (like the BGV reminders') sends
// whatever has come due; HR can also release by hand at any point.
import { env } from '$env/dynamic/private';
import { connectDb } from '$lib/server/db';
import { Admin, AppSetting, Exit, ExitClearance, ExitDocument } from '$lib/server/db/schema';
import { audit } from '$lib/server/audit';
import { baseUrl } from '$lib/server/base-url';
import { brandBySlug } from '$lib/shared/brands';
import {
	FLOW_STEPS,
	HANDOVER_DOCS,
	defaultReleaseLetters,
	lettersForTrack,
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
	type MailDraft
} from './mail';

type Lean = Record<string, any>;
const DAY_MS = 24 * 60 * 60 * 1000;

// ── Routing defaults ─────────────────────────────────────────────────────────
// What a new exit's mail settings start from. Saved from any exit's settings
// card ("use as the default"), so the desk sets them once rather than per exit.
// The manager is never defaulted: it is a different person for every employee.

interface Addr {
	email: string;
	name: string;
	designation: string;
}
export interface RoutingDefaults {
	it: Addr;
	salesforce: Addr & { enabled: boolean };
	hr: Addr;
	payroll: Addr;
	releaseAfterDays: number;
}

const ROUTING_SETTING_KEY = 'exit_routing';

export const ROUTING_FALLBACK: RoutingDefaults = {
	it: { email: 'ithelpdesk@championsmail.com', name: 'IT Helpdesk', designation: '' },
	salesforce: { email: '', name: '', designation: '', enabled: false },
	hr: { email: 'hrd.jst@championsmail.com', name: 'HR desk', designation: '' },
	payroll: { email: '', name: '', designation: '' },
	releaseAfterDays: 30
};

export async function getRoutingDefaults(): Promise<RoutingDefaults> {
	const row = await AppSetting.findOne({ key: ROUTING_SETTING_KEY }).lean<Lean>();
	const v = (row?.value ?? {}) as Partial<RoutingDefaults>;
	const addr = (a: Partial<Addr> | undefined, f: Addr): Addr => ({
		email: a?.email ?? f.email,
		name: a?.name ?? f.name,
		designation: a?.designation ?? f.designation
	});
	return {
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
	return {
		routing: {
			manager: { email: null, name: reportingManager || null, designation: null },
			it: { email: d.it.email || null, name: d.it.name || null, designation: d.it.designation || null },
			salesforce: {
				email: d.salesforce.email || null,
				name: d.salesforce.name || null,
				designation: d.salesforce.designation || null,
				enabled: d.salesforce.enabled
			},
			hr: { email: d.hr.email || null, name: d.hr.name || null, designation: d.hr.designation || null },
			payroll: { email: d.payroll.email || null, name: d.payroll.name || null, designation: d.payroll.designation || null }
		},
		flow: { releaseAfterDays: d.releaseAfterDays, autoRelease: true }
	};
}

// ── Where the chain stands ───────────────────────────────────────────────────

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
	/** The step's mail is waiting for HR to review and send. */
	ready: boolean;
}

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

/** Pure: the state of every step, from the exit and its clearance rows. The
 *  first step that is not done or skipped is the active one; everything after
 *  it is waiting. Before the chain starts, every step waits. */
export function flowSteps(exit: Lean, clearances: Lean[]): StepState[] {
	const started = !!exit.flow?.startedAt;
	const byDept = new Map(clearances.map((c) => [String(c.department), c]));
	let reached = !started;
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
			base.to = route?.email || null;
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
			if (reached) return base;
			reached = true;
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
				status: 'active',
				ready: true,
				detail: sentBack ? 'Send-back ready — review and send it' : 'Mail ready — review and send it'
			};
		}

		if (def.key === 'hr') {
			base.to = route?.email || null;
			if (exit.flow?.hrDoneAt)
				return {
					...base,
					status: 'done',
					doneAt: new Date(exit.flow.hrDoneAt).toISOString(),
					detail: exit.flow.hrDoneBy ? `Sent to payroll by ${exit.flow.hrDoneBy}` : 'Sent to payroll'
				};
			if (reached) return base;
			reached = true;
			return { ...base, status: 'active', detail: 'Fill the F&F and leave, then send to payroll' };
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
		if (reached) {
			return {
				...base,
				detail: exit.flow?.autoRelease === false ? 'Manual release' : `${exit.flow?.releaseAfterDays ?? 30} days after payroll`
			};
		}
		reached = true;
		return {
			...base,
			status: 'active',
			detail:
				exit.flow?.autoRelease === false
					? 'Waiting for HR to release'
					: exit.flow?.scheduledAt
						? `Scheduled for ${fmt(exit.flow.scheduledAt)}`
						: 'Scheduling…'
		};
	});
}

// ── Moving along ─────────────────────────────────────────────────────────────

/** The exit's status follows the chain, but never moves a closed exit. */
const STATUS_FOR: Record<FlowStepKey, string> = {
	manager: 'clearances',
	it: 'clearances',
	salesforce: 'clearances',
	hr: 'cleared',
	payroll: 'fnf',
	letters: 'fnf'
};
const MOVABLE = ['in_progress', 'submitted', 'changes_requested', 'clearances', 'cleared', 'fnf'];

async function setLastError(exitId: string, step: string | null, message: string | null) {
	await Exit.findByIdAndUpdate(exitId, {
		'flow.lastError': { step, message, at: step ? new Date() : null }
	});
}

/** Moves the exit to its next step: readies that step's mail for HR to
 *  review, or tells HR it is their turn, or schedules the release. Safe to
 *  call at any time and any number of times. Errors are recorded on the exit,
 *  never thrown. */
export async function advanceFlow(exitId: string): Promise<void> {
	try {
		const exit = await Exit.findById(exitId).lean<Lean>();
		if (!exit?.flow?.startedAt || exit.status === 'completed') return;
		const clearances = await ExitClearance.find({ exitId }).lean<Lean[]>();
		const steps = flowSteps(exit, clearances);
		const current = steps.find((s) => s.status === 'active' || s.status === 'blocked');
		if (!current) return;

		const status = STATUS_FOR[current.key];
		if (MOVABLE.includes(exit.status) && exit.status !== status)
			await Exit.findByIdAndUpdate(exitId, { status });
		if (current.status === 'blocked') return;

		const def = FLOW_STEPS.find((d) => d.key === current.key)!;
		// A mail step waits on HR: they review the draft and press Send.
		if (def.dept) return;
		if (current.key === 'hr') {
			await notifyHrTurn(exit);
			return;
		}
		await scheduleRelease(exitId);
	} catch (e) {
		console.error(`[exit-flow] advance failed for exit=${exitId}:`, e);
	}
}

/** Starts the chain — on accepting the submission, or by hand for an exit that
 *  was accepted before the chain existed. */
export async function startFlow(exitId: string) {
	await Exit.updateOne({ _id: exitId, 'flow.startedAt': null }, { $set: { 'flow.startedAt': new Date() } });
	await advanceFlow(exitId);
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
		to: String(route.email ?? '').trim().toLowerCase(),
		approverName: (route.name as string) || null,
		department: dept,
		employeeName: exit.fullName,
		employeeId: exit.employeeId,
		lwd: exit.lwd ?? null,
		reminder,
		...(dept === 'payroll'
			? {
					extraIntro: [
						'HR has filled in the full & final settlement and the leave position. Everything is done on the page ' +
							'the button below opens — no login, nothing else to open: check and correct the F&F figures, tick ' +
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
	/** False when the mail can only be previewed: an earlier step is still open,
	 *  or the address is missing. */
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
						: !opts.to
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
					? 'Not part of this exit.'
					: !opts.to
						? 'No email set — add it in Mail settings.'
						: state.status !== 'active'
							? 'An earlier step is still open — this is what will go once it is done.'
							: null;
		return { ...mail, key, label: def.label, reminder, sendable: !why, why, attachments, sendBack: back };
	}

	if (key === 'letters') {
		const keys = releaseLetterKeys(exit);
		const hrFiles = files.filter((f) => f.source === 'hr');
		const mail = await buildHandoverMail({
			to: exit.personalEmail,
			employeeName: exit.fullName,
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
		const early =
			!blocker && state.status !== 'active'
				? 'Payroll has not signed off yet — releasing now sends this before the rest of the chain is done, and closes the exit.'
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
 *  address in the exit's mail settings. The first send is claimed atomically
 *  — pending → sent — so two signatures landing at once cannot mail the next
 *  approver twice. */
export async function mailStep(
	exitId: string,
	key: FlowStepKey,
	opts: { reminder?: boolean } = {}
): Promise<{ ok: true } | { error: string }> {
	const def = FLOW_STEPS.find((d) => d.key === key);
	if (!def?.dept) return { error: 'That step does not send a clearance.' };
	const dept = def.dept as ClearanceDept;
	const exit = await Exit.findById(exitId).lean<Lean>();
	if (!exit) return { error: 'Exit not found.' };
	const route = (exit.routing?.[key as RoutingKey] ?? {}) as Lean;
	const email = String(route.email ?? '').trim().toLowerCase();
	if (!email) return { error: `Add the ${def.label} email in Mail settings first.` };

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
			to: email,
			brand,
			url,
			attachments
		});
	} catch (e) {
		console.error(`[exit-flow] ${key} mail failed for exit=${exitId}:`, e);
		// Put a first send back so the next advance retries it.
		if (!opts.reminder)
			await ExitClearance.updateOne({ _id: row._id, status: 'sent' }, { $set: { status: 'pending' }, $inc: { sentCount: -1 } });
		await setLastError(exitId, key, `The ${def.label} mail to ${email} could not be sent. Check the address, then Review & send again.`);
		return { error: `The mail to ${email} could not be sent.` };
	}
	if (exit.flow?.lastError?.step) await setLastError(exitId, null, null);
	return { ok: true };
}

/** Reopens a signed clearance and mails the approver what HR says is missing
 *  — the reviewed send-back. Their earlier answers stay filled in; they
 *  complete what was asked and sign again, and the chain carries on from
 *  there. Sending payroll back also stops a scheduled release, since the
 *  figures it would print are no longer final. */
export async function sendBackStep(
	exitId: string,
	key: FlowStepKey,
	back: SendBack,
	by: string
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

	const res = await mailStep(exitId, key);
	if ('error' in res) {
		// Leave it reopened: the map now shows the step as ready, and Review &
		// send re-sends the same request once the address is fixed.
		return res;
	}
	await advanceFlow(exitId);
	return { ok: true };
}

async function hrRecipients(exit: Lean): Promise<string[]> {
	const to = new Set<string>();
	if (exit.routing?.hr?.email) to.add(String(exit.routing.hr.email).toLowerCase());
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
			subject: `Your turn: F&F and leave for ${exit.fullName}`,
			lines: [
				`The departmental clearances for ${exit.fullName} (${exit.employeeId}) are signed.`,
				'Fill in the full & final settlement and the leave position on the exit page, then send it to payroll — ' +
					'they get it prefilled, with every exit document attached.'
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
 *  and releases straight away if that is already past. */
export async function scheduleRelease(exitId: string, opts: { reset?: boolean } = {}) {
	const exit = await Exit.findById(exitId).lean<Lean>();
	if (!exit || exit.flow?.releasedAt || exit.status === 'completed') return;
	const signed = await payrollSignedAt(exitId);
	if (!signed || exit.flow?.autoRelease === false) {
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
				subject: `Payroll signed: ${exit.fullName}`,
				lines: [
					`Payroll has signed off the full & final settlement for ${exit.fullName} (${exit.employeeId}).`,
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
	actor: string
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
			brand,
			url,
			fnfAmount: exit.fnf?.netAmount ?? null,
			fnfDate: exit.fnf?.settlementDate ?? null,
			documents: [
				...keys.map((k) => EXIT_DOC_BY_KEY.get(k as never)?.label ?? k),
				...new Set(files.map((f) => fileLabel.get(f.docType) ?? f.label ?? f.docType))
			],
			attachments
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
