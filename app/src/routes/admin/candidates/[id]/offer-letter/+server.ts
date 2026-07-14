import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { Candidate, Company, OfferLetter } from '$lib/server/db/schema';
import { audit } from '$lib/server/audit';
import { offerLetterInputFromDraft } from '$lib/server/offer-letter/fields';
import { generateOfferLetterPdf } from '$lib/server/offer-letter/pdf';
import { brandBySlug } from '$lib/shared/brands';

export const GET: RequestHandler = async ({ params, locals, getClientAddress }) => {
	const candidate = await Candidate.findById(params.id).lean();
	if (!candidate) error(404, 'Candidate not found');

	const company = await Company.findById(candidate.companyId).lean();
	const draft = await OfferLetter.findOne({ candidateId: params.id }).lean();
	const brand = brandBySlug(company?.brandSlug ?? undefined);

	await audit({
		candidateId: params.id,
		actor: locals.admin!.email,
		action: 'offer_letter_downloaded',
		newValue: candidate.fullName ?? candidate.email,
		ip: getClientAddress()
	});

	const input = offerLetterInputFromDraft(draft);
	const buffer = await generateOfferLetterPdf(candidate, company?.name ?? '', input, brand);

	const safeName = (candidate.fullName ?? candidate.email).replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '_');

	return new Response(new Uint8Array(buffer), {
		headers: {
			'Content-Type': 'application/pdf',
			'Content-Disposition': `attachment; filename="${safeName}_offer_letter.pdf"`,
			'Cache-Control': 'no-store'
		}
	});
};
