// Per-candidate BGV workspace: the candidate's declared particulars, the
// editable request email (pre-addressed to the declared previous-employer HR
// contact), the send/re-send action, the sent/reply mail thread, and — once
// the employer responds — the verification result.
import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { Candidate, Company, EmailMessage, BgvRequest } from '$lib/server/db/schema';
import { isBgvEligible, TRACK_LABELS, type Track } from '$lib/shared/matrix';
import { brandBySlug } from '$lib/shared/brands';
import { isValidEmail, titleCase } from '$lib/shared/validation';
import { isoToDDMMYYYY } from '$lib/shared/dates';
import { sendMail, brandFromHeader, mailboxFor } from '$lib/server/mailer';
import { getOrCreateBgv, bgvFormPdf, bgvEmailText, bgvRequestHtml, defaultBgvEmail, BGV_PARTICULARS, BGV_EXTRAS } from '$lib/server/bgv';
import { addDays, firstReminderAt, sendBgvReminder } from '$lib/server/bgv-reminders';
import {
	BGV_CADENCE_BOUNDS,
	BGV_CADENCE_DEFAULTS,
	clampCadenceInt,
	resolveCadence
} from '$lib/shared/bgv-cadence';
import { audit } from '$lib/server/audit';
import { lacking, levelsToday } from '$lib/server/access';
import type { Level } from '$lib/shared/access';

/** Each BGV power is its own row in Access & org (the bgv.* capabilities),
 *  handed out per person; this is the refusal when the login lacks one. */
async function requireCap(locals: App.Locals, cap: string, min: Level = 'act') {
	const message = await lacking(locals.admin, cap, min);
	return message ? fail(403, { message }) : null;
}

const BGV_CAPS = ['bgv.view', 'bgv.thread', 'bgv.send', 'bgv.remind', 'bgv.plan', 'bgv.close', 'bgv.edit'] as const;

/** The two answers stored as an enum; every other verification input is text. */
const YES_NO_KEYS = new Set(['rehireEligible', 'exitFormalitiesPending']);
const VERIFY_ROWS = [...BGV_PARTICULARS, ...BGV_EXTRAS].map((r) => ({ key: r.verify as string, label: r.label as string }));
/** The left column: what the candidate declared, which lives on the candidate
 *  record itself. Posted as `d_<field>` so it cannot collide with a
 *  verification key. */
const DECLARED_ROWS = BGV_PARTICULARS.map((r) => ({ field: r.field as string, label: r.label as string }));
const DECLARED_DATES = new Set(['prevDoj', 'prevDol']);
const DDMMYYYY = /^\d{2}\/\d{2}\/\d{4}$/;

function escapeRegex(v: string): string {
	return v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** BGV workspace exists only for Experienced hires at the four BGV entities
 *  (isBgvEligible), and never for candidates HR has deleted from BGV. */
async function getBgvCandidate(id: string) {
	const candidate = await Candidate.findById(id).lean().catch(() => null);
	if (!candidate || candidate.bgvExcluded) return null;
	const company = await Company.findById(candidate.companyId).lean();
	if (!isBgvEligible(candidate.track, company?.brandSlug)) return null;
	return { candidate, company };
}

export const load: PageServerLoad = async ({ params, locals }) => {
	if (!locals.admin) redirect(303, '/admin/login');
	const lv = await levelsToday(locals.admin, BGV_CAPS);
	if (lv['bgv.view'] === 'none') redirect(303, '/admin');
	const row = await getBgvCandidate(params.id);
	if (!row) error(404, 'No BGV-eligible candidate with this id.');
	const { candidate, company } = row;
	const companyName = company?.name ?? brandBySlug(company?.brandSlug ?? undefined).name;
	const bgv = await getOrCreateBgv(params.id);
	const cadence = resolveCadence(bgv);

	// The last-sent copy wins so HR's edits survive across visits; the template
	// only seeds a never-sent request. The verification table is not part of
	// this editable text — it is appended to the outgoing mail automatically.
	const seeded = defaultBgvEmail(candidate, companyName, locals.admin?.email ?? '');
	const compose = {
		to: bgv.to ?? seeded.to,
		cc: bgv.cc ?? seeded.cc,
		subject: bgv.subject ?? seeded.subject,
		body: bgv.body ?? seeded.body
	};

	// The BGV mail thread: everything sent/tagged for this purpose, plus any
	// inbound mail from the declared previous-employer address (covers replies
	// that arrived before purpose tagging could identify them).
	const or: Record<string, unknown>[] = [
		{ purpose: { $in: ['bgv_request', 'bgv_reminder', 'bgv_reply'] } }
	];
	if (candidate.prevHrEmail) {
		or.push({ direction: 'inbound', from: new RegExp(escapeRegex(candidate.prevHrEmail), 'i') });
	}
	// The thread carries the previous employer's own replies, so it is only
	// read for a login that may see it.
	const messages =
		lv['bgv.thread'] === 'view'
			? await EmailMessage.find({ candidateId: candidate._id, $or: or }).sort({ createdAt: 1 }).lean()
			: [];

	const c = candidate as unknown as Record<string, string | null>;
	const verification = (bgv.verification ?? {}) as Record<string, string | null>;

	return {
		candidate: {
			id: String(candidate._id),
			name: candidate.fullName || candidate.email,
			email: candidate.email,
			trackLabel: TRACK_LABELS[candidate.track as Track] ?? candidate.track,
			status: candidate.status,
			prevHrEmail: candidate.prevHrEmail ?? null
		},
		companyName,
		particulars: BGV_PARTICULARS.map((r) => ({
			key: r.verify as string,
			field: r.field as string,
			label: r.label,
			declared: c[r.field] ?? null,
			verified: verification[r.verify] ?? null
		})),
		extras: BGV_EXTRAS.map((r) => ({
			key: r.verify as string,
			label: r.label,
			verified: verification[r.verify] ?? null,
			yesNo: YES_NO_KEYS.has(r.verify)
		})),
		bgv: {
			status: bgv.status as 'pending' | 'sent' | 'completed',
			sentAt: bgv.sentAt?.toISOString() ?? null,
			sentCount: bgv.sentCount ?? 0,
			replyReceivedAt: bgv.replyReceivedAt?.toISOString() ?? null,
			completedAt: bgv.completedAt?.toISOString() ?? null,
			verifierName: verification.verifierName ?? null,
			editedBy: bgv.verificationEditedBy ?? null,
			editedAt: bgv.verificationEditedAt?.toISOString() ?? null
		},
		reminders: {
			// This candidate's own cadence — the only place it is set.
			enabled: cadence.enabled,
			everyDays: cadence.everyDays,
			maxReminders: cadence.maxReminders,
			// True while HR has never tuned this request, so the form can say the
			// numbers are defaults rather than someone's deliberate choice.
			isDefault: bgv.reminderEveryDays == null && bgv.reminderMaxCount == null,
			defaults: BGV_CADENCE_DEFAULTS,
			bounds: BGV_CADENCE_BOUNDS,
			count: bgv.reminderCount ?? 0,
			lastAt: bgv.lastReminderAt?.toISOString() ?? null,
			nextAt: bgv.nextReminderAt?.toISOString() ?? null,
			mailbox: mailboxFor('bgv')
		},
		compose,
		messages: messages.map((m) => ({
			id: String(m._id),
			direction: m.direction,
			from: m.from,
			to: m.to,
			subject: m.subject,
			text: m.text,
			status: m.status,
			purpose: m.purpose,
			at: (m as unknown as { createdAt: Date }).createdAt.toISOString()
		})),
		/** What this login may do on the case, per row in Access & org. A write
		 *  row at View shows its section read-only; at none the section is hidden. */
		can: {
			thread: lv['bgv.thread'] === 'view',
			sendSee: lv['bgv.send'] !== 'none',
			send: lv['bgv.send'] === 'act',
			remind: lv['bgv.remind'] === 'act',
			planSee: lv['bgv.plan'] !== 'none',
			plan: lv['bgv.plan'] === 'act',
			close: lv['bgv.close'] === 'approve',
			edit: lv['bgv.edit'] === 'act'
		}
	};
};

export const actions: Actions = {
	send: async ({ params, request, locals, getClientAddress }) => {
		const forbidden = await requireCap(locals, 'bgv.send');
		if (forbidden) return forbidden;

		const row = await getBgvCandidate(params.id);
		if (!row) return fail(404, { message: 'Candidate not found.' });
		const { candidate, company } = row;

		const form = await request.formData();
		const to = String(form.get('to') ?? '').trim().toLowerCase();
		const ccRaw = String(form.get('cc') ?? '').trim();
		const subject = String(form.get('subject') ?? '').trim();
		const body = String(form.get('body') ?? '').trim();

		if (!to || !isValidEmail(to)) return fail(400, { message: 'Enter a valid To: email address.' });
		const cc = ccRaw.split(/[,;\s]+/).filter(Boolean).map((a) => a.toLowerCase());
		for (const address of cc) {
			if (!isValidEmail(address)) return fail(400, { message: `Invalid Cc address: ${address}` });
		}
		if (!subject) return fail(400, { message: 'Subject is required.' });
		if (!body) return fail(400, { message: 'Email body is required.' });

		const companyName = company?.name ?? brandBySlug(company?.brandSlug ?? undefined).name;
		const brand = brandBySlug(company?.brandSlug ?? undefined);
		const bgv = await getOrCreateBgv(params.id);

		const candidateRec = candidate as unknown as Record<string, unknown>;
		const pdf = await bgvFormPdf(candidateRec, companyName);
		const safeName = (candidate.fullName || 'candidate').replace(/[^A-Za-z0-9]+/g, '-');
		try {
			// The verification table travels in the email body itself — as an HTML
			// table and as a reply-friendly plain-text list (which the employer's
			// reply quotes back, and parseBgvReply reads). No links.
			await sendMail(to, subject, bgvEmailText(body, candidateRec), {
				from: brandFromHeader(brand, 'bgv'),
				html: bgvRequestHtml(brand, body, candidateRec),
				cc: cc.length ? cc : undefined,
				attachments: [{ filename: `BGV-Form-${safeName}.pdf`, content: pdf }],
				// The employer must reply to the BGV mailbox: that is the address
				// the inbound webhook reads verification answers from.
				replyTo: mailboxFor('bgv'),
				tags: { candidate_id: String(candidate._id), purpose: 'bgv_request' }
			});
		} catch (e) {
			console.error('[bgv] send failed:', e);
			return fail(502, { message: 'The mail provider rejected the send. Check the addresses and try again.' });
		}

		bgv.to = to;
		bgv.cc = ccRaw || null;
		bgv.subject = subject;
		bgv.body = body;
		if (bgv.status !== 'completed') bgv.status = 'sent';
		bgv.sentAt = new Date();
		bgv.sentBy = locals.admin!.id;
		bgv.sentCount = (bgv.sentCount ?? 0) + 1;
		// Sending the request arms the chase in the same step, so nobody has to
		// remember to switch it on. A re-send restarts the run from zero: HR has
		// just re-asked, and the reminders that follow should be counted against
		// this attempt, not the abandoned one. The cadence itself is left alone —
		// it is this candidate's setting, not part of the send.
		bgv.remindersEnabled = true;
		bgv.reminderCount = 0;
		bgv.lastReminderAt = null;
		bgv.nextReminderAt =
			bgv.status === 'completed' ? null : firstReminderAt(resolveCadence(bgv));
		await bgv.save();

		// Keep the candidate record's HR address in sync with where HR actually
		// sent the request, so the reply-matching webhook and the next pre-fill
		// both point at the address that was really used.
		if (candidate.prevHrEmail !== to) {
			await Candidate.findByIdAndUpdate(candidate._id, { prevHrEmail: to });
		}

		await audit({
			candidateId: String(candidate._id),
			actor: locals.admin!.email,
			action: 'bgv_request_sent',
			field: to,
			ip: getClientAddress()
		});

		return { sent: true };
	},

	/** Re-request now: sends the follow-up immediately instead of waiting for
	 *  the cadence, and restarts the run — the same mail the sweep would send,
	 *  so a chased employer sees one consistent conversation. */
	remindNow: async ({ params, locals }) => {
		const forbidden = await requireCap(locals, 'bgv.remind');
		if (forbidden) return forbidden;

		const row = await getBgvCandidate(params.id);
		if (!row) return fail(404, { message: 'Candidate not found.' });

		const bgv = await getOrCreateBgv(params.id);
		const outcome = await sendBgvReminder(String(bgv._id), {
			trigger: 'manual',
			actor: locals.admin!.email
		});
		if (!outcome.sent) return fail(400, { message: outcome.reason ?? 'Could not send the reminder.' });

		return { reminded: true, reminderNumber: outcome.reminderNumber };
	},

	/** This candidate's reminder plan: on/off, how often, and how many times.
	 *  Set here rather than org-wide because the recruiter working the case is
	 *  the one who knows whether this employer needs chasing every two days or
	 *  every fortnight. Its own row in Access & org (bgv.plan). */
	saveReminderPlan: async ({ params, request, locals, getClientAddress }) => {
		const forbidden = await requireCap(locals, 'bgv.plan');
		if (forbidden) return forbidden;

		const row = await getBgvCandidate(params.id);
		if (!row) return fail(404, { message: 'Candidate not found.' });

		const form = await request.formData();
		const enabled = form.get('enabled') === 'on';
		const everyDaysRaw = Number(form.get('everyDays'));
		const maxRaw = Number(form.get('maxReminders'));

		// Validated rather than silently clamped, so a typo tells HR what the
		// allowed range is instead of quietly becoming a different number.
		const { everyDays: dB, maxReminders: mB } = BGV_CADENCE_BOUNDS;
		if (!Number.isFinite(everyDaysRaw) || everyDaysRaw < dB.min || everyDaysRaw > dB.max)
			return fail(400, { message: `Reminder cadence must be between ${dB.min} and ${dB.max} days.` });
		if (!Number.isFinite(maxRaw) || maxRaw < mB.min || maxRaw > mB.max)
			return fail(400, { message: `Reminder count must be between ${mB.min} and ${mB.max}.` });

		const bgv = await getOrCreateBgv(params.id);
		const before = resolveCadence(bgv);

		bgv.remindersEnabled = enabled;
		bgv.reminderEveryDays = clampCadenceInt(everyDaysRaw, before.everyDays, dB.min, dB.max);
		bgv.reminderMaxCount = clampCadenceInt(maxRaw, before.maxReminders, mB.min, mB.max);
		const cadence = resolveCadence(bgv);

		const stopped = !enabled || !bgv.sentAt || !!bgv.replyReceivedAt || bgv.status === 'completed';
		const spent = (bgv.reminderCount ?? 0) >= cadence.maxReminders;
		if (stopped || spent) {
			bgv.nextReminderAt = null;
		} else {
			// Re-anchor on the last mail actually sent, so shortening the cadence
			// counts from that mail rather than from this edit. A due-in-the-past
			// result simply fires on the next sweep, which is what shortening a
			// cadence on an overdue chase should do.
			const anchor = bgv.lastReminderAt ?? bgv.sentAt ?? new Date();
			const due = addDays(anchor, cadence.everyDays);
			bgv.nextReminderAt = due.getTime() < Date.now() ? new Date() : due;
		}
		await bgv.save();

		await audit({
			candidateId: params.id,
			actor: locals.admin!.email,
			action: 'bgv_reminder_plan_updated',
			field: bgv.to ?? null,
			oldValue: `${before.enabled ? 'on' : 'off'} · every ${before.everyDays}d · max ${before.maxReminders}`,
			newValue: `${cadence.enabled ? 'on' : 'off'} · every ${cadence.everyDays}d · max ${cadence.maxReminders}`,
			ip: getClientAddress()
		});

		return { planSaved: true };
	},

	/** Corrects both columns of the BGV table by hand. The right column is the
	 *  employer's verification inputs, for when the AI mapping of their reply
	 *  missed or misread a row (or they answered by phone); blank clears a row.
	 *  The left column is what the candidate declared, which is the candidate
	 *  record itself, so a correction there shows on the candidate page and in
	 *  the next BGV mail too. `complete` marks the BGV verified and stops the
	 *  chase; unticking it reopens a completed one. */
	saveVerification: async ({ params, request, locals, getClientAddress }) => {
		const forbidden = await requireCap(locals, 'bgv.edit');
		if (forbidden) return forbidden;

		const row = await getBgvCandidate(params.id);
		if (!row) return fail(404, { message: 'Candidate not found.' });

		const form = await request.formData();
		const bgv = await getOrCreateBgv(params.id);
		const before = (bgv.toObject().verification ?? {}) as Record<string, string | null>;

		const next: Record<string, string | null> = {};
		for (const { key, label } of VERIFY_ROWS) {
			const v = String(form.get(key) ?? '').trim().slice(0, 1000);
			if (YES_NO_KEYS.has(key) && v && v !== 'yes' && v !== 'no')
				return fail(400, { message: `${label} must be Yes, No or blank.` });
			next[key] = v || null;
		}
		const changed = VERIFY_ROWS.filter(({ key }) => (before[key] ?? null) !== next[key]).map((r) => r.label);

		// Left column — only fields actually posted are touched, so a form that
		// does not carry them (an older page) cannot blank the candidate.
		const cand = row.candidate as unknown as Record<string, string | null | undefined>;
		const declared: Record<string, string> = {};
		for (const { field, label } of DECLARED_ROWS) {
			if (!form.has(`d_${field}`)) continue;
			let v = String(form.get(`d_${field}`) ?? '').trim().slice(0, 300);
			if (DECLARED_DATES.has(field) && v) {
				v = isoToDDMMYYYY(v);
				if (!DDMMYYYY.test(v)) return fail(400, { message: `${label} must be a date as DD/MM/YYYY.` });
			}
			if (field === 'fullName') {
				if (!v) return fail(400, { message: "Candidate's Name cannot be blank." });
				v = titleCase(v);
			}
			if ((cand[field] ?? '') !== v) declared[field] = v;
		}
		const declaredChanged = DECLARED_ROWS.filter(({ field }) => field in declared).map((r) => r.label);

		const complete = form.get('complete') === 'on';
		const wasComplete = bgv.status === 'completed';
		if (!changed.length && !declaredChanged.length && complete === wasComplete)
			return { verificationSaved: true, changed: 0 };

		if (declaredChanged.length) {
			await Candidate.findByIdAndUpdate(params.id, declared);
			await audit({
				candidateId: params.id,
				actor: locals.admin!.email,
				action: 'bgv_particulars_edited',
				field: declaredChanged.join(', '),
				newValue: `${declaredChanged.length} declared particular${declaredChanged.length === 1 ? '' : 's'} corrected from BGV`,
				ip: getClientAddress()
			});
		}
		if (!changed.length && complete === wasComplete)
			return { verificationSaved: true, changed: declaredChanged.length };

		bgv.set('verification', next);
		if (changed.length) {
			bgv.verificationEditedBy = locals.admin!.email;
			bgv.verificationEditedAt = new Date();
		}
		if (complete && !wasComplete) {
			bgv.status = 'completed';
			bgv.completedAt = new Date();
			// A verified BGV has nothing left to chase.
			bgv.nextReminderAt = null;
		} else if (!complete && wasComplete) {
			bgv.status = bgv.sentAt ? 'sent' : 'pending';
			bgv.completedAt = null;
		}
		await bgv.save();

		await audit({
			candidateId: params.id,
			actor: locals.admin!.email,
			action: 'bgv_verification_edited',
			field: changed.join(', ') || undefined,
			oldValue: wasComplete ? 'completed' : null,
			newValue: `${changed.length} row${changed.length === 1 ? '' : 's'} edited by hand${
				complete !== wasComplete ? (complete ? ' · marked verified' : ' · reopened') : ''
			}`,
			ip: getClientAddress()
		});

		return { verificationSaved: true, changed: changed.length + declaredChanged.length };
	},

	// Same scope as the list-page delete: removes the candidate from the BGV
	// section (bgvExcluded) and drops their BgvRequest. Onboarding data stays.
	deleteBgv: async ({ params, locals, getClientAddress }) => {
		const forbidden = await requireCap(locals, 'bgv.close', 'approve');
		if (forbidden) return forbidden;

		const row = await getBgvCandidate(params.id);
		if (!row) return fail(404, { message: 'Candidate not found.' });

		await Candidate.findByIdAndUpdate(params.id, { bgvExcluded: true });
		await BgvRequest.deleteOne({ candidateId: params.id });

		await audit({
			candidateId: params.id,
			actor: locals.admin!.email,
			action: 'bgv_deleted',
			field: row.candidate.prevCompanyName ?? null,
			ip: getClientAddress()
		});

		redirect(303, '/admin/bgv');
	}
};
