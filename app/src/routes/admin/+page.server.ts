import { fail } from '@sveltejs/kit';
import { desc, eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { env } from '$env/dynamic/public';
import { db, t } from '$lib/server/db';
import { createLinkToken } from '$lib/server/tokens';
import { audit } from '$lib/server/audit';
import { sendMail, brandSignoff } from '$lib/server/mailer';
import { TRACKS, PHYSICAL_ITEM_TYPES, type Track } from '$lib/shared/matrix';
import { brandBySlug } from '$lib/shared/brands';

export const load: PageServerLoad = async () => {
	const rows = await db
		.select({ candidate: t.candidates, company: t.companies })
		.from(t.candidates)
		.innerJoin(t.companies, eq(t.candidates.companyId, t.companies.id))
		.orderBy(desc(t.candidates.createdAt));

	const companies = await db.select().from(t.companies).where(eq(t.companies.active, true));

	return {
		candidates: rows.map((r) => ({
			id: r.candidate.id,
			email: r.candidate.email,
			fullName: r.candidate.fullName,
			track: r.candidate.track,
			status: r.candidate.status,
			company: r.company.name,
			createdAt: r.candidate.createdAt.toISOString(),
			submittedAt: r.candidate.submittedAt?.toISOString() ?? null
		})),
		companies: companies.map((c) => ({ id: c.id, name: c.name })),
		tracks: TRACKS
	};
};

export const actions: Actions = {
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

		const [company] = await db.select().from(t.companies).where(eq(t.companies.id, companyId));
		if (!company) return fail(400, { message: 'Pick a company.' });
		const brand = brandBySlug(company.brandSlug);

		const [candidate] = await db
			.insert(t.candidates)
			.values({
				email,
				track,
				companyId,
				fullName: candidateName || null,
				createdBy: locals.admin!.id
			})
			.returning();

		// PRD §3 — physical handover items tracked from day one.
		await db.insert(t.physicalItems).values(
			PHYSICAL_ITEM_TYPES.map((p) => ({ candidateId: candidate.id, itemType: p.type }))
		);

		const token = await createLinkToken(candidate.id);
		const base = env.PUBLIC_BASE_URL ?? 'http://localhost:5173';
		const link = `${base}/c/${token}`;

		await audit({
			candidateId: candidate.id,
			actor: locals.admin!.email,
			action: 'link_generated',
			field: track,
			ip: getClientAddress()
		});

		await sendMail(
			email,
			`Your ${brand.name} onboarding link`,
			`Hello${candidateName ? ' ' + candidateName : ''},\n\n` +
				`Welcome aboard! Please complete your onboarding here (the link expires in 7 days):\n\n${link}\n\n` +
				`Keep your Aadhaar card, PAN card, bank passbook and education documents handy — ` +
				`photograph them on a flat surface in good light.\n\n${brandSignoff(brand)}`
		);

		const waText = encodeURIComponent(
			`Welcome to ${brand.name}! Please complete your onboarding here (expires in 7 days): ${link}`
		);
		return { link, waUrl: `https://wa.me/?text=${waText}`, email };
	}
};
