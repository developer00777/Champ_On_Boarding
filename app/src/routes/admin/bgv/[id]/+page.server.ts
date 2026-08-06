// Per-candidate BGV workspace: the candidate's declared particulars, the
// editable request email (pre-addressed to the declared previous-employer HR
// contact), the send/re-send action, the sent/reply mail thread, and — once
// the employer responds — the verification result.
import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { Candidate, Company, EmailMessage, BgvRequest } from '$lib/server/db/schema';
import { isBgvEligible, TRACK_LABELS, type Track } from '$lib/shared/matrix';
import { brandBySlug } from '$lib/shared/brands';
import { isValidEmail } from '$lib/shared/validation';
import { sendMail, brandFromHeader } from '$lib/server/mailer';
import { getOrCreateBgv, bgvFormPdf, bgvEmailText, bgvRequestHtml, defaultBgvEmail, BGV_PARTICULARS, BGV_EXTRAS } from '$lib/server/bgv';
import { audit } from '$lib/server/audit';

/** Sending a BGV request is recruiter/HR work, same rule as approving a
 *  candidate — finance_team can look but not send. */
function requireApprover(locals: App.Locals) {
	if (locals.admin?.role !== 'super_admin' && locals.admin?.role !== 'hr_admin')
		return fail(403, { message: 'Only HR or a super admin can send BGV requests.' });
	return null;
}

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
	const row = await getBgvCandidate(params.id);
	if (!row) error(404, 'No BGV-eligible candidate with this id.');
	const { candidate, company } = row;
	const companyName = company?.name ?? brandBySlug(company?.brandSlug ?? undefined).name;
	const bgv = await getOrCreateBgv(params.id);

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
	const or: Record<string, unknown>[] = [{ purpose: { $in: ['bgv_request', 'bgv_reply'] } }];
	if (candidate.prevHrEmail) {
		or.push({ direction: 'inbound', from: new RegExp(escapeRegex(candidate.prevHrEmail), 'i') });
	}
	const messages = await EmailMessage.find({ candidateId: candidate._id, $or: or })
		.sort({ createdAt: 1 })
		.lean();

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
			label: r.label,
			declared: c[r.field] ?? null,
			verified: verification[r.verify] ?? null
		})),
		extras: BGV_EXTRAS.map((r) => ({ label: r.label, verified: verification[r.verify] ?? null })),
		bgv: {
			status: bgv.status as 'pending' | 'sent' | 'completed',
			sentAt: bgv.sentAt?.toISOString() ?? null,
			sentCount: bgv.sentCount ?? 0,
			replyReceivedAt: bgv.replyReceivedAt?.toISOString() ?? null,
			completedAt: bgv.completedAt?.toISOString() ?? null,
			verifierName: verification.verifierName ?? null
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
		canSend: locals.admin?.role === 'super_admin' || locals.admin?.role === 'hr_admin'
	};
};

export const actions: Actions = {
	send: async ({ params, request, locals, getClientAddress }) => {
		const forbidden = requireApprover(locals);
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

	// Same scope as the list-page delete: removes the candidate from the BGV
	// section (bgvExcluded) and drops their BgvRequest. Onboarding data stays.
	deleteBgv: async ({ params, locals, getClientAddress }) => {
		const forbidden = requireApprover(locals);
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
