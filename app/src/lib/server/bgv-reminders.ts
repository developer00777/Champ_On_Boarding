// Automated BGV follow-up — chases a previous employer who has not replied.
//
// The shape of the problem: a BGV request goes to a stranger's HR desk with no
// account, no login and no obligation to answer, and the candidate's joining
// date does not move while everyone waits. So the platform re-asks until the
// employer replies or the run is spent, then stops and leaves it to HR.
//
// The cadence is per candidate, set on the BGV record and stored on the
// request itself (lib/shared/bgv-cadence.ts) — the recruiter working a case
// knows whether this employer needs a nudge in two days or a fortnight, and no
// org-wide number can. Every read here resolves through resolveCadence, so a
// request HR never tuned still behaves like the default.
//
// `BgvRequest.nextReminderAt` is the whole work queue. A row is due when it
// holds a past timestamp; null means nothing is scheduled — never sent,
// replied, paused by HR, or the run is finished. Nothing else needs consulting
// to decide whether to mail someone, which is what keeps the sweep a single
// indexed query rather than a scan with business rules layered on top.
//
// Reminders stop on their own the moment a reply lands: the Resend inbound
// webhook stamps replyReceivedAt and clears nextReminderAt (see
// /webhooks/resend), so a reply that arrives thirty seconds before a sweep
// still cancels that sweep's mail.
import { env } from '$env/dynamic/private';
import { connectDb } from './db';
import { getRedis } from './redis';
import { BgvRequest, Candidate, Company } from './db/schema';
import { brandBySlug } from '$lib/shared/brands';
import { isBgvEligible } from '$lib/shared/matrix';
import { sendMail, brandFromHeader, mailboxFor } from './mailer';
import { bgvEmailText, bgvFormPdf, bgvReminderBody, bgvRequestHtml } from './bgv';
import { resolveCadence, type BgvCadence } from '$lib/shared/bgv-cadence';
import { audit } from './audit';

const DAY_MS = 86_400_000;

export function addDays(from: Date, days: number): Date {
	return new Date(from.getTime() + days * DAY_MS);
}

/** When the next reminder after this one is due, or null to stop the run.
 *  Called with the count *after* the send being scheduled for. */
export function nextReminderAfter(
	countSoFar: number,
	cadence: BgvCadence,
	from: Date = new Date()
): Date | null {
	if (!cadence.enabled) return null;
	if (countSoFar >= cadence.maxReminders) return null;
	return addDays(from, cadence.everyDays);
}

/** Schedules the first reminder for a freshly sent request. Exported for the
 *  send action, so "sent the request" and "armed the chase" stay one step. */
export function firstReminderAt(cadence: BgvCadence, from: Date = new Date()): Date | null {
	return cadence.enabled ? addDays(from, cadence.everyDays) : null;
}

export interface ReminderOutcome {
	sent: boolean;
	/** Why nothing was sent — safe to show to HR verbatim. */
	reason?: string;
	reminderNumber?: number;
	nextReminderAt?: Date | null;
}

/** Sends one reminder for a BGV request and records it.
 *
 *  `manual` is HR pressing "Send reminder now": it re-arms a run that was
 *  paused or spent and restarts the counter, because an explicit re-request is
 *  a fresh chase rather than the tail of an abandoned one. `auto` is the sweep,
 *  which only ever continues a run already in flight. */
export async function sendBgvReminder(
	bgvId: string,
	opts: { trigger: 'auto' | 'manual'; actor: string }
): Promise<ReminderOutcome> {
	const bgv = await BgvRequest.findById(bgvId);
	if (!bgv) return { sent: false, reason: 'This BGV request no longer exists.' };
	const cadence = resolveCadence(bgv);

	// Guards, in the order that makes the clearest message for HR. Each one also
	// parks the row (nextReminderAt = null) so a permanently-unsendable request
	// stops coming back round on every sweep.
	const park = async (reason: string): Promise<ReminderOutcome> => {
		if (bgv.nextReminderAt) await BgvRequest.updateOne({ _id: bgv._id }, { $set: { nextReminderAt: null } });
		return { sent: false, reason };
	};

	if (!bgv.sentAt || !bgv.to)
		return park('The first BGV request has not been sent yet — send that before chasing a reply.');
	if (bgv.status === 'completed') return park('This verification is already complete.');
	if (bgv.replyReceivedAt) return park('The previous employer has already replied.');

	const candidate = await Candidate.findById(bgv.candidateId).lean().catch(() => null);
	if (!candidate) return park('The candidate record has been deleted.');
	if (candidate.bgvExcluded) return park('This candidate has been removed from BGV.');
	if (candidate.status === 'revoked') return park('This candidate’s onboarding has been revoked.');

	const company = await Company.findById(candidate.companyId).lean();
	if (!isBgvEligible(candidate.track, company?.brandSlug))
		return park('This candidate is no longer BGV-eligible.');

	if (opts.trigger === 'auto') {
		if (!cadence.enabled) return park('Reminders are switched off for this candidate.');
		if ((bgv.reminderCount ?? 0) >= cadence.maxReminders)
			return park(`All ${cadence.maxReminders} reminders have been sent.`);
	}

	// A manual re-request starts a fresh run — see the doc comment.
	const runCount = opts.trigger === 'manual' ? 0 : (bgv.reminderCount ?? 0);
	const reminderNumber = runCount + 1;

	const companyName = company?.name ?? brandBySlug(company?.brandSlug ?? undefined).name;
	const brand = brandBySlug(company?.brandSlug ?? undefined);
	const candidateRec = candidate as unknown as Record<string, unknown>;

	const body = bgvReminderBody({
		candidateName: candidate.fullName || candidate.email,
		prevEmployeeId: candidate.prevEmployeeId ?? null,
		hiringCompanyName: companyName,
		// Auto sends have no admin behind them, so they sign with the BGV desk
		// itself — which is also the address a reply comes back to.
		senderEmail: opts.trigger === 'manual' ? opts.actor : mailboxFor('bgv'),
		originalSentAt: bgv.sentAt ?? null,
		reminderNumber,
		remindersLeft: Math.max(0, cadence.maxReminders - reminderNumber)
	});

	const cc = String(bgv.cc ?? '')
		.split(/[,;\s]+/)
		.filter(Boolean);
	const safeName = (candidate.fullName || 'candidate').replace(/[^A-Za-z0-9]+/g, '-');
	const pdf = await bgvFormPdf(candidateRec, companyName);

	try {
		await sendMail(bgv.to, bgv.subject || 'Employee BGV Form', bgvEmailText(body, candidateRec), {
			from: brandFromHeader(brand, 'bgv'),
			html: bgvRequestHtml(brand, body, candidateRec),
			cc: cc.length ? cc : undefined,
			attachments: [{ filename: `BGV-Form-${safeName}.pdf`, content: pdf }],
			// Reply-To is explicit on reminders because the chase is the whole
			// point: the employer must land back on the BGV mailbox, which is
			// where the inbound webhook reads replies from.
			replyTo: mailboxFor('bgv'),
			tags: { candidate_id: String(candidate._id), purpose: 'bgv_reminder' }
		});
	} catch (e) {
		console.error(`[bgv-reminders] send failed for ${bgvId}:`, e);
		return { sent: false, reason: 'The mail provider rejected the reminder. It will be retried.' };
	}

	const now = new Date();
	// `enabled: true` regardless of the stored flag: a manual chase un-pauses
	// the candidate below, and an auto one only got here because it was on.
	const nextAt = nextReminderAfter(reminderNumber, { ...cadence, enabled: true }, now);
	await BgvRequest.updateOne(
		{ _id: bgv._id },
		{
			$set: {
				reminderCount: reminderNumber,
				lastReminderAt: now,
				nextReminderAt: nextAt,
				// A manual chase un-pauses the candidate: HR asking for one now
				// and the toggle still reading "paused" would be a lie.
				remindersEnabled: true
			}
		}
	);

	await audit({
		candidateId: String(candidate._id),
		actor: opts.actor,
		action: opts.trigger === 'manual' ? 'bgv_reminder_sent_manual' : 'bgv_reminder_sent',
		field: bgv.to,
		newValue: `reminder ${reminderNumber} of ${cadence.maxReminders}`
	});

	return { sent: true, reminderNumber, nextReminderAt: nextAt };
}

export interface SweepResult {
	due: number;
	sent: number;
	skipped: number;
	failed: number;
	/** Set when the sweep did not run at all. */
	note?: string;
}

/** How long a claimed row waits before another sweep may pick it up. Covers a
 *  process dying mid-send: the row retries in an hour rather than either
 *  double-sending or going quiet until the next cadence tick. */
const CLAIM_RETRY_MS = 60 * 60_000;
const SWEEP_LOCK_KEY = 'bgv:reminders:sweep';
const SWEEP_LOCK_TTL = 300;
/** A single sweep never mails more than this, so a backlog drains over several
 *  ticks instead of arriving at Resend as one burst. */
const SWEEP_BATCH = 100;

/** One pass over everything due. Safe to call concurrently and from several
 *  replicas: a Redis lock keeps one sweep at a time, and each row is claimed
 *  with a conditional update, so even without the lock no reminder goes twice. */
export async function sweepBgvReminders(): Promise<SweepResult> {
	const empty: SweepResult = { due: 0, sent: 0, skipped: 0, failed: 0 };
	await connectDb();

	// No org-wide switch to consult: the cadence lives on each request, so the
	// due query below is the only gate. BGV_REMINDER_TICKER=off is the
	// operational kill switch if a deploy ever needs one.

	// Fails open on a Redis outage: a missed lock risks a duplicate reminder,
	// while refusing to run risks every verification stalling silently. The
	// per-row claim below is the real guard.
	let lockToken: string | null = null;
	try {
		lockToken = `${process.pid}-${Date.now()}`;
		const got = await getRedis().set(SWEEP_LOCK_KEY, lockToken, 'EX', SWEEP_LOCK_TTL, 'NX');
		if (got !== 'OK') return { ...empty, note: 'Another sweep is already running.' };
	} catch (e) {
		console.error('[bgv-reminders] Redis lock unavailable, sweeping anyway:', e);
		lockToken = null;
	}

	const result: SweepResult = { ...empty };
	try {
		const now = new Date();
		const due = await BgvRequest.find({
			status: 'sent',
			remindersEnabled: true,
			replyReceivedAt: null,
			nextReminderAt: { $ne: null, $lte: now }
		})
			.sort({ nextReminderAt: 1 })
			.limit(SWEEP_BATCH)
			.select({ _id: 1 })
			.lean();
		result.due = due.length;

		for (const row of due) {
			// Claim first: push the row out of the queue before sending, so a
			// crash between here and the send cannot replay it on the next tick.
			const claimed = await BgvRequest.findOneAndUpdate(
				{ _id: row._id, nextReminderAt: { $ne: null, $lte: now } },
				{ $set: { nextReminderAt: new Date(Date.now() + CLAIM_RETRY_MS) } }
			);
			if (!claimed) {
				result.skipped++;
				continue;
			}

			try {
				const outcome = await sendBgvReminder(String(row._id), {
					trigger: 'auto',
					actor: 'system'
				});
				if (outcome.sent) result.sent++;
				else result.skipped++;
			} catch (e) {
				console.error(`[bgv-reminders] unexpected failure on ${row._id}:`, e);
				result.failed++;
			}
		}
	} finally {
		if (lockToken) {
			try {
				const held = await getRedis().get(SWEEP_LOCK_KEY);
				if (held === lockToken) await getRedis().del(SWEEP_LOCK_KEY);
			} catch {
				// Lock expires on its own via the TTL.
			}
		}
	}

	if (result.due) {
		console.log(
			`[bgv-reminders] due=${result.due} sent=${result.sent} skipped=${result.skipped} failed=${result.failed}`
		);
	}
	return result;
}

// ── In-process ticker ────────────────────────────────────────────────────────
//
// A long-running server (Docker, Railway, `npm run dev`) schedules its own
// sweeps, so a working deployment needs no external cron. Serverless does not:
// a lambda has no process to hold an interval, so Vercel deployments must hit
// /api/cron/bgv-reminders on a schedule instead — the same sweep, same locking.

const TICK_MS = 15 * 60_000;
/** Nothing sweeps for the first minute: the process has just booted, Mongo may
 *  still be connecting, and a deploy should not fire mail before it serves a
 *  request. */
const FIRST_TICK_MS = 60_000;
let ticking = false;

export function startBgvReminderTicker() {
	if (ticking) return;
	if (env.BGV_REMINDER_TICKER === 'off') return;
	// Vercel: see the note above. process.env, not $env/dynamic — this is the
	// platform's own marker, not app config.
	if (process.env.VERCEL) return;
	ticking = true;

	const schedule = (ms: number) => {
		const t = setTimeout(run, ms);
		// Never hold the process open on the ticker alone — the HTTP server is
		// what keeps a server alive, and a script importing this should still exit.
		t.unref?.();
	};
	const run = () => {
		sweepBgvReminders()
			.catch((e) => console.error('[bgv-reminders] sweep failed:', e))
			.finally(() => schedule(TICK_MS));
	};

	console.log(`[bgv-reminders] ticker armed — first sweep in ${FIRST_TICK_MS / 1000}s, then every ${TICK_MS / 60_000}m`);
	schedule(FIRST_TICK_MS);
}
