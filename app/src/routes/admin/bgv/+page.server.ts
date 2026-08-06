// BGV dashboard — restricted by HR decision to the four BGV entities
// (see BGV_ENTITY_SLUGS in matrix.ts) and the Experienced track only.
// Candidates HR has deleted from BGV (bgvExcluded) stay hidden.
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { Candidate, Company, BgvRequest } from '$lib/server/db/schema';
import { BGV_ENTITY_SLUGS } from '$lib/shared/matrix';
import { audit } from '$lib/server/audit';

export const load: PageServerLoad = async () => {
	const companies = await Company.find({}).lean();
	const eligibleCompanyIds = companies
		.filter((c) => c.brandSlug && BGV_ENTITY_SLUGS.includes(c.brandSlug))
		.map((c) => c._id);

	const candidates = await Candidate.find({
		track: 'experienced',
		companyId: { $in: eligibleCompanyIds },
		status: { $ne: 'revoked' },
		bgvExcluded: { $ne: true }
	})
		.sort({ createdAt: -1 })
		.lean();

	const bgvs = await BgvRequest.find({ candidateId: { $in: candidates.map((c) => c._id) } }).lean();
	const companyById = new Map(companies.map((c) => [String(c._id), c.name]));
	const bgvByCandidate = new Map(bgvs.map((b) => [String(b.candidateId), b]));

	// One display name per BGV entity — duplicate company rows for the same
	// brandSlug exist in older databases; prefer the fuller ("… Pvt Ltd") name.
	const nameBySlug = new Map<string, string>();
	for (const c of companies) {
		if (!c.brandSlug || !BGV_ENTITY_SLUGS.includes(c.brandSlug) || !c.active) continue;
		const current = nameBySlug.get(c.brandSlug);
		if (!current || c.name.length > current.length) nameBySlug.set(c.brandSlug, c.name);
	}

	return {
		entityNames: [...nameBySlug.values()].sort(),
		rows: candidates.map((c) => {
			const bgv = bgvByCandidate.get(String(c._id));
			return {
				id: String(c._id),
				name: c.fullName || c.email,
				entity: companyById.get(String(c.companyId)) ?? '—',
				prevCompany: c.prevCompanyName ?? null,
				prevHrEmail: c.prevHrEmail ?? null,
				candidateStatus: c.status,
				bgvStatus: (bgv?.status ?? 'pending') as 'pending' | 'sent' | 'completed',
				sentAt: bgv?.sentAt?.toISOString() ?? null,
				sentCount: bgv?.sentCount ?? 0,
				replyReceivedAt: bgv?.replyReceivedAt?.toISOString() ?? null,
				completedAt: bgv?.completedAt?.toISOString() ?? null
			};
		})
	};
};

export const actions: Actions = {
	// "Delete" scoped to BGV only: hides the candidate from this section and
	// drops their BgvRequest (verification data + form token). The onboarding
	// record itself is untouched — full candidate deletion lives on the
	// candidate page and stays super_admin-only.
	deleteBgv: async ({ request, locals, getClientAddress }) => {
		if (locals.admin?.role !== 'super_admin' && locals.admin?.role !== 'hr_admin')
			return fail(403, { message: 'Only HR or a super admin can delete a BGV.' });

		const form = await request.formData();
		const candidateId = String(form.get('candidateId') ?? '');
		const candidate = await Candidate.findById(candidateId).lean().catch(() => null);
		if (!candidate) return fail(404, { message: 'Candidate not found.' });

		await Candidate.findByIdAndUpdate(candidateId, { bgvExcluded: true });
		await BgvRequest.deleteOne({ candidateId });

		await audit({
			candidateId,
			actor: locals.admin!.email,
			action: 'bgv_deleted',
			field: candidate.prevCompanyName ?? null,
			ip: getClientAddress()
		});

		return { deleted: true };
	}
};
