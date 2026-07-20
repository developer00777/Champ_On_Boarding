import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { Candidate, Company } from '$lib/server/db/schema';
import { audit } from '$lib/server/audit';
import { BRANDS } from '$lib/shared/brands';

/** Uploaded logos are stored inline on the company row as data-URIs, matching how
 *  offer-letter signatures are handled. Keep the cap low: the row is read on
 *  every admin page load, and the value is inlined into candidate-facing emails. */
const LOGO_MAX_BYTES = 512 * 1024;
const LOGO_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/svg+xml'];

async function readLogo(form: FormData): Promise<string | null | { error: string }> {
	const file = form.get('logo');
	if (!(file instanceof File) || file.size === 0) return null;
	if (file.size > LOGO_MAX_BYTES)
		return { error: `Logo must be under ${LOGO_MAX_BYTES / 1024} KB.` };
	if (!LOGO_TYPES.includes(file.type))
		return { error: 'Logo must be a PNG, JPG, WebP or SVG image.' };
	const bytes = await file.arrayBuffer();
	return `data:${file.type};base64,${Buffer.from(bytes).toString('base64')}`;
}

export const load: PageServerLoad = async ({ locals }) => {
	const companies = await Company.find({ active: true }).sort({ name: 1 }).lean();

	// Candidate counts per company: an entity with candidates attached cannot be
	// safely renamed away or ignored, and it is what makes duplicate rows obvious.
	const counts = await Candidate.aggregate<{ _id: unknown; n: number }>([
		{ $group: { _id: '$companyId', n: { $sum: 1 } } }
	]);
	const countBy = new Map(counts.map((c) => [String(c._id), c.n]));

	return {
		companies: companies.map((c) => ({
			id: String(c._id),
			name: c.name,
			brandSlug: c.brandSlug ?? null,
			logoBase64: c.logoBase64 ?? null,
			candidateCount: countBy.get(String(c._id)) ?? 0
		})),
		brandOptions: BRANDS.map((b) => ({
			slug: b.slug,
			name: b.name,
			primary: b.colors.primary,
			logo: b.logo.src
		})),
		isSuperAdmin: locals.admin?.role === 'super_admin'
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

		// `name` is unique in the schema, so a duplicate would surface as a raw
		// Mongo E11000. Catch it here to say something the recruiter can act on —
		// and because near-duplicate company rows silently split candidate records.
		const clash = await Company.findOne({ name: new RegExp(`^${escapeRegex(name)}$`, 'i') }).lean();
		if (clash) return fail(400, { companyError: `"${name}" already exists.` });

		const logo = await readLogo(form);
		if (logo && typeof logo === 'object') return fail(400, { companyError: logo.error });

		await Company.create({ name, brandSlug, logoBase64: logo });
		await audit({
			actor: locals.admin!.email,
			action: 'company_created',
			field: 'name',
			newValue: name
		});
		return { companyCreated: name };
	},

	setCompanyLogo: async ({ request, locals }) => {
		if (locals.admin?.role !== 'super_admin') return fail(403, { companyError: 'Forbidden.' });
		const form = await request.formData();
		const companyId = String(form.get('companyId') ?? '');
		if (String(form.get('remove') ?? '') === '1') {
			await Company.findByIdAndUpdate(companyId, { logoBase64: null });
			return { logoSaved: companyId };
		}
		const logo = await readLogo(form);
		if (!logo) return fail(400, { companyError: 'Choose an image first.' });
		if (typeof logo === 'object') return fail(400, { companyError: logo.error });
		await Company.findByIdAndUpdate(companyId, { logoBase64: logo });
		return { logoSaved: companyId };
	},

	deleteCompany: async ({ request, locals }) => {
		if (locals.admin?.role !== 'super_admin') return fail(403, { companyError: 'Forbidden.' });
		const form = await request.formData();
		const companyId = String(form.get('companyId') ?? '');
		const company = await Company.findById(companyId).lean();
		if (!company) return fail(404, { companyError: 'Company not found.' });

		// Soft delete, matching the `active` flag `seedCompanies`/this page already
		// filter on: a company with candidate history must keep resolving on their
		// records (detail pages, exports, audit log), so it is hidden, not erased.
		const candidateCount = await Candidate.countDocuments({ companyId });
		if (candidateCount > 0) {
			return fail(400, {
				companyError: `Can't remove ${company.name} — it has ${candidateCount} candidate${candidateCount === 1 ? '' : 's'}. Move or delete those first.`
			});
		}

		await Company.findByIdAndUpdate(companyId, { active: false });
		await audit({
			actor: locals.admin!.email,
			action: 'company_deleted',
			field: 'name',
			oldValue: company.name
		});
		return { companyDeleted: company.name };
	}
};

function escapeRegex(s: string): string {
	return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
