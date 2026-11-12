// The IT desk's confirmation that an exiting employee's system access is
// blocked. Opened from the "Confirm access is blocked" button in the block
// mail; pressing Confirm stamps the exit, and HR's page shows it at once.
//
// No login: the link itself is the credential, like the clearance links. It
// only ever records a confirmation (and who gave it) — nothing is shown but
// the four details the mail already carried.
import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { Exit } from '$lib/server/db/schema';
import { audit } from '$lib/server/audit';
import { brandBySlug } from '$lib/shared/brands';
import { exitCompany, resolveExitToken } from '$lib/server/offboarding/exit';

export const load: PageServerLoad = async ({ params }) => {
	const resolved = await resolveExitToken(params.token, 'itblock');
	if (!resolved) error(404, 'This link is invalid or has expired.');
	const e = resolved.exit as unknown as Record<string, any>;
	const company = await exitCompany(e.companyId);
	const brand = brandBySlug(company?.brandSlug ?? undefined);
	return {
		brand,
		companyName: company?.name ?? brand.legalName,
		employee: {
			fullName: String(e.fullName ?? ''),
			employeeId: String(e.employeeId ?? ''),
			lwd: (e.lwd as string | null) ?? null,
			team: ((e.department || e.division) as string | null) ?? null
		},
		confirmed: e.itAccessBlockedAt
			? {
					at: new Date(e.itAccessBlockedAt).toISOString(),
					by: (e.itAccessBlockedBy as string | null) ?? null,
					note: (e.itAccessBlockedNote as string | null) ?? null
				}
			: null
	};
};

export const actions: Actions = {
	confirm: async ({ params, request, getClientAddress }) => {
		const resolved = await resolveExitToken(params.token, 'itblock');
		if (!resolved) return fail(404, { message: 'This link is invalid or has expired.', name: '', note: null });
		const e = resolved.exit as unknown as Record<string, any>;
		const form = await request.formData();
		const name = String(form.get('name') ?? '').trim().slice(0, 80);
		const note = String(form.get('note') ?? '').trim().slice(0, 500) || null;
		if (!name) return fail(400, { message: 'Enter your name, so HR knows who confirmed it.', name, note });

		// The first confirmation stands; a second press changes nothing.
		const updated = await Exit.findOneAndUpdate(
			{ _id: e._id, itAccessBlockedAt: null },
			{ itAccessBlockedAt: new Date(), itAccessBlockedBy: `${name} (IT)`, itAccessBlockedNote: note }
		);
		if (updated)
			await audit({
				candidateId: e.candidateId ? String(e.candidateId) : null,
				actor: `${name} (IT, via the block-access link)`,
				action: 'exit_it_block_confirmed',
				field: String(e.employeeId ?? ''),
				newValue: note,
				ip: getClientAddress()
			});
		return { confirmed: true };
	}
};
