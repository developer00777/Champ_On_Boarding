import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { env } from '$env/dynamic/public';
import { Candidate, Company, PhysicalItem, OfferLetter } from '$lib/server/db/schema';
import { createLinkToken } from '$lib/server/tokens';
import { audit } from '$lib/server/audit';
import { sendBrandedMail, brandSignoff } from '$lib/server/mailer';
import { TRACKS, TRACK_LABELS, PHYSICAL_ITEM_TYPES, type Track } from '$lib/shared/matrix';
import { brandBySlug } from '$lib/shared/brands';
import { buildOnboardingLinkAttachments } from '$lib/server/offer-letter/send';
import { sendOnboardingWelcomeWA } from '$lib/server/whatsapp';

/** Statuses that mean "candidate still has work to do". */
const IN_PROGRESS = ['created', 'opened', 'in_progress', 'changes_requested'];
const DONE = ['approved', 'complete'];

export const load: PageServerLoad = async ({ locals }) => {
	// Count in the database rather than fetching every candidate to length-check
	// four arrays in the browser. The full list lives at /admin/candidates now.
	const [total, awaitingReview, inProgress, approved, recentDocs, companies] = await Promise.all([
		Candidate.countDocuments(),
		Candidate.countDocuments({ status: 'submitted' }),
		Candidate.countDocuments({ status: { $in: IN_PROGRESS } }),
		Candidate.countDocuments({ status: { $in: DONE } }),
		Candidate.find().populate('companyId').sort({ createdAt: -1 }).limit(5).lean(),
		Company.find({ active: true }).sort({ name: 1 }).lean()
	]);

	return {
		stats: { total, awaitingReview, inProgress, approved },
		total,
		recent: recentDocs.map((c) => {
			const company = c.companyId as unknown as { name: string };
			return {
				id: String(c._id),
				email: c.email,
				fullName: c.fullName ?? null,
				track: c.track,
				status: c.status,
				company: company?.name ?? ''
			};
		}),
		companies: companies.map((c) => ({ id: String(c._id), name: c.name, brandSlug: c.brandSlug ?? null })),
		tracks: TRACKS,
		isSuperAdmin: locals.admin?.role === 'super_admin'
	};
};

export const actions: Actions = {
	generateLink: async ({ request, locals, getClientAddress }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim().toLowerCase();
		const track = String(form.get('track') ?? '') as Track;
		const companyId = String(form.get('companyId') ?? '');
		const candidateName = String(form.get('candidateName') ?? '').trim();
		const candidateMobile = String(form.get('candidateMobile') ?? '').trim().replace(/\D/g, '');

		if (!email || !/^\S+@\S+\.\S+$/.test(email))
			return fail(400, { message: 'A valid candidate email is required.' });
		if (!TRACKS.includes(track)) return fail(400, { message: 'Pick a track.' });
		if (!companyId) return fail(400, { message: 'Pick a company.' });

		const company = await Company.findById(companyId).lean();
		if (!company) return fail(400, { message: 'Pick a company.' });
		const brand = brandBySlug(company.brandSlug ?? undefined);

		// A candidate can legitimately be re-linked after their record is revoked
		// or fully onboarded (rehire, new track), but never while an existing
		// link for the same email + company is still active — otherwise HR ends
		// up with silent duplicate records mid-review.
		const activeDuplicate = await Candidate.findOne({
			email,
			companyId,
			status: { $nin: ['revoked', 'complete'] }
		}).lean();
		if (activeDuplicate) {
			return fail(409, {
				message: `${email} already has an active onboarding link for this company (status: ${activeDuplicate.status}). Revoke it before creating a new one.`
			});
		}

		const candidate = await Candidate.create({
			email,
			track,
			companyId,
			fullName: candidateName || null,
			mobile: candidateMobile || null,
			createdBy: locals.admin!.id
		});

		await PhysicalItem.insertMany(
			PHYSICAL_ITEM_TYPES.map((p) => ({ candidateId: candidate._id, itemType: p.type }))
		);

		const token = await createLinkToken(String(candidate._id));
		const base = env.PUBLIC_BASE_URL ?? 'http://localhost:5173';
		const link = `${base}/c/${token}`;

		await audit({
			candidateId: String(candidate._id),
			actor: locals.admin!.email,
			action: 'link_generated',
			field: track,
			ip: getClientAddress()
		});

		// Bundle the offer letter into this same email if a complete draft already
		// exists for this candidate (e.g. CTC was finalized before the link went
		// out) — one message to the candidate instead of two.
		const offerDraft = await OfferLetter.findOne({ candidateId: candidate._id }).lean();
		const { attachments, offerLetterBundled } = await buildOnboardingLinkAttachments(
			candidate,
			company.name,
			offerDraft,
			brand
		);

		await sendBrandedMail(
			email,
			`Your ${brand.name} onboarding link`,
			`Hello${candidateName ? ' ' + candidateName : ''},\n\n` +
				`Welcome aboard! Please complete your onboarding here (the link expires in 7 days):\n\n${link}\n\n` +
				`Keep your Aadhaar card, PAN card, bank passbook and education documents handy — ` +
				`photograph them on a flat surface in good light.` +
				(offerLetterBundled ? `\n\nYour offer letter is attached to this email.` : '') +
				`\n\n${brandSignoff(brand)}`,
			brand,
			attachments
		);

		// Send WhatsApp welcome message via Twilio (best-effort, non-fatal)
		if (candidateMobile) {
			await sendOnboardingWelcomeWA({
				mobile: candidateMobile,
				candidateName: candidateName || 'there',
				companyName: company.name,
				trackLabel: TRACK_LABELS[track],
				link
			});
		}

		const waText = encodeURIComponent(
			`Welcome to ${brand.name}! Please complete your onboarding here (expires in 7 days): ${link}`
		);
		return { link, waUrl: `https://wa.me/?text=${waText}`, email };
	}
};
