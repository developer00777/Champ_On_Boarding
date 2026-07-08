import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { env } from '$env/dynamic/public';
import { Candidate, Company, PhysicalItem, OfferLetter } from '$lib/server/db/schema';
import { createLinkToken } from '$lib/server/tokens';
import { audit } from '$lib/server/audit';
import { sendBrandedMail, brandSignoff } from '$lib/server/mailer';
import { TRACKS, PHYSICAL_ITEM_TYPES, type Track } from '$lib/shared/matrix';
import { brandBySlug, BRANDS } from '$lib/shared/brands';
import { buildOnboardingLinkAttachments } from '$lib/server/offer-letter/send';

export const load: PageServerLoad = async ({ locals }) => {
	const candidateDocs = await Candidate.find()
		.populate('companyId')
		.sort({ createdAt: -1 })
		.lean();

	const companies = await Company.find({ active: true }).lean();

	return {
		candidates: candidateDocs.map((c) => {
			const company = c.companyId as unknown as { name: string };
			return {
				id: String(c._id),
				email: c.email,
				fullName: c.fullName ?? null,
				track: c.track,
				status: c.status,
				company: company?.name ?? '',
				createdAt: (c as { createdAt: Date }).createdAt.toISOString(),
				submittedAt: c.submittedAt?.toISOString() ?? null
			};
		}),
		companies: companies.map((c) => ({ id: String(c._id), name: c.name, brandSlug: c.brandSlug ?? null })),
		tracks: TRACKS,
		isSuperAdmin: locals.admin?.role === 'super_admin',
		brandOptions: BRANDS.map((b) => ({ slug: b.slug, name: b.name, primary: b.colors.primary }))
	};
};

export const actions: Actions = {
	setCompanyBrand: async ({ request, locals }) => {
		if (locals.admin?.role !== 'super_admin') return fail(403, { companyError: 'Forbidden.' });
		const form = await request.formData();
		const companyId = String(form.get('companyId') ?? '');
		const brandSlug = String(form.get('brandSlug') ?? '') || null;
		await Company.findByIdAndUpdate(companyId, { brandSlug });
		return { brandSaved: companyId };
	},

	createCompany: async ({ request, locals }) => {
		if (locals.admin?.role !== 'super_admin') return fail(403, { companyError: 'Forbidden.' });
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim();
		const brandSlug = String(form.get('brandSlug') ?? '') || null;
		if (!name) return fail(400, { companyError: 'Company name is required.' });
		await Company.create({ name, brandSlug });
		return { companyCreated: name };
	},

	generateLink: async ({ request, locals, getClientAddress }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim().toLowerCase();
		const track = String(form.get('track') ?? '') as Track;
		const companyId = String(form.get('companyId') ?? '');
		const candidateName = String(form.get('candidateName') ?? '').trim();

		if (!email || !/^\S+@\S+\.\S+$/.test(email))
			return fail(400, { message: 'A valid candidate email is required.' });
		if (!TRACKS.includes(track)) return fail(400, { message: 'Pick a track.' });
		if (!companyId) return fail(400, { message: 'Pick a company.' });

		const company = await Company.findById(companyId).lean();
		if (!company) return fail(400, { message: 'Pick a company.' });
		const brand = brandBySlug(company.brandSlug ?? undefined);

		const candidate = await Candidate.create({
			email,
			track,
			companyId,
			fullName: candidateName || null,
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
			offerDraft
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

		const waText = encodeURIComponent(
			`Welcome to ${brand.name}! Please complete your onboarding here (expires in 7 days): ${link}`
		);
		return { link, waUrl: `https://wa.me/?text=${waText}`, email };
	}
};
