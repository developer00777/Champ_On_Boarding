// Public, token-gated BGV verification form for the PREVIOUS employer.
// The token is minted per candidate in /admin/bgv and emailed inside the BGV
// request; submitting here writes the "Your Verification Inputs" column onto
// the BgvRequest and flips it to completed, which is what the admin BGV
// section surfaces as the verification result.
import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { Candidate, Company, Admin } from '$lib/server/db/schema';
import { resolveBgvToken, BGV_PARTICULARS } from '$lib/server/bgv';
import { brandBySlug } from '$lib/shared/brands';
import { sendBrandedMail } from '$lib/server/mailer';
import { audit } from '$lib/server/audit';
import { baseUrl } from '$lib/server/base-url';

async function resolveContext(token: string) {
	const bgv = await resolveBgvToken(token);
	if (!bgv) return null;
	const candidate = await Candidate.findById(bgv.candidateId).lean();
	if (!candidate) return null;
	const company = await Company.findById(candidate.companyId).lean();
	return { bgv, candidate, company };
}

export const load: PageServerLoad = async ({ params }) => {
	const ctx = await resolveContext(params.token);
	if (!ctx) error(404, 'This verification link is invalid.');
	const { bgv, candidate, company } = ctx;
	const c = candidate as unknown as Record<string, string | null>;

	return {
		companyName: company?.name ?? brandBySlug(company?.brandSlug ?? undefined).name,
		candidateName: candidate.fullName || candidate.email,
		completed: bgv.status === 'completed',
		completedAt: bgv.completedAt?.toISOString() ?? null,
		particulars: BGV_PARTICULARS.map((r) => ({
			key: r.verify,
			label: r.label,
			declared: c[r.field] ?? null
		}))
	};
};

export const actions: Actions = {
	submit: async ({ params, request, getClientAddress }) => {
		const ctx = await resolveContext(params.token);
		if (!ctx) return fail(404, { message: 'This verification link is invalid.' });
		const { bgv, candidate, company } = ctx;
		if (bgv.status === 'completed')
			return fail(409, { message: 'This verification has already been submitted. Thank you!' });

		const form = await request.formData();
		const get = (k: string) => String(form.get(k) ?? '').trim();

		const verification: Record<string, string | null> = {};
		for (const row of BGV_PARTICULARS) verification[row.verify] = get(row.verify) || null;
		verification.integrityIssues = get('integrityIssues') || null;
		verification.exitFormalitiesDetails = get('exitFormalitiesDetails') || null;
		verification.additionalComments = get('additionalComments') || null;
		verification.verifierName = get('verifierName') || null;

		const rehireEligible = get('rehireEligible');
		const exitFormalitiesPending = get('exitFormalitiesPending');

		const errors: string[] = [];
		if (!['yes', 'no'].includes(rehireEligible)) errors.push('Please answer "Eligibility for re-hire" (Yes / No).');
		if (!['yes', 'no'].includes(exitFormalitiesPending)) errors.push('Please answer "Any Exit Formalities Pending" (Yes / No).');
		if (exitFormalitiesPending === 'yes' && !verification.exitFormalitiesDetails)
			errors.push('Exit formalities are pending — please give us some details.');
		if (!verification.verifierName) errors.push("Verifier's Name & Designation is required.");
		if (errors.length) return fail(400, { message: errors.join(' ') });

		verification.rehireEligible = rehireEligible;
		verification.exitFormalitiesPending = exitFormalitiesPending;

		bgv.set('verification', verification);
		bgv.status = 'completed';
		bgv.completedAt = new Date();
		bgv.completedIp = getClientAddress();
		await bgv.save();

		await audit({
			candidateId: String(candidate._id),
			actor: verification.verifierName ?? 'previous-employer',
			action: 'bgv_completed',
			field: candidate.prevCompanyName ?? null,
			ip: getClientAddress()
		});

		// Tell the HR admin who sent the request — best-effort, the employer's
		// submission must never fail on a mail hiccup.
		if (bgv.sentBy) {
			try {
				const admin = await Admin.findById(bgv.sentBy).lean();
				if (admin?.email) {
					const brand = brandBySlug(company?.brandSlug ?? undefined);
					const base = baseUrl();
					await sendBrandedMail(
						admin.email,
						`✅ BGV completed: ${candidate.fullName || candidate.email}`,
						`The previous employer has submitted the BGV verification form for ` +
							`${candidate.fullName || candidate.email}.\n\n` +
							`Verifier: ${verification.verifierName}\n` +
							`Eligibility for re-hire: ${rehireEligible}\n` +
							`Exit formalities pending: ${exitFormalitiesPending}\n\n` +
							`Full results: ${base}/admin/bgv/${String(candidate._id)}`,
						brand,
						undefined,
						'onboarding',
						String(candidate._id),
						{ tagPurpose: 'bgv_completed_alert' }
					);
				}
			} catch (e) {
				console.error('[bgv] completion alert failed:', e);
			}
		}

		return { done: true };
	}
};
