// Candidate-facing offer letter PDF download — token-gated.
// Only served once the HR team has marked the offer letter as 'sent'.
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { Company, OfferLetter, type OfferLetterDoc } from '$lib/server/db/schema';
import { resolveCandidateToken } from '$lib/server/tokens';
import { offerLetterPdf } from '$lib/server/offer-letter/send';
import { brandBySlug } from '$lib/shared/brands';

export const GET: RequestHandler = async ({ params }) => {
	const candidate = await resolveCandidateToken(params.token);
	if (!candidate) error(404, 'This link is invalid or has expired.');

	const draft = await OfferLetter.findOne({ candidateId: candidate.id }).lean();
	if (!draft || draft.status !== 'sent')
		error(404, 'Your offer letter has not been issued yet. Please check back later.');

	const company = await Company.findById(candidate.companyId).lean();
	const brand = brandBySlug(company?.brandSlug ?? undefined);

	// The same letter the candidate was emailed: the uploaded one when HR
	// uploaded it, however much of the form is filled in. This used to always
	// render from the form, so a candidate downloading again got a different
	// letter from the one in their inbox.
	const { bytes } = await offerLetterPdf(candidate, company?.name ?? '', draft as OfferLetterDoc, brand);
	const body = bytes.slice().buffer;

	const safeName = (candidate.fullName ?? candidate.email)
		.replace(/[^a-zA-Z0-9 ]/g, '')
		.trim()
		.replace(/\s+/g, '_');

	return new Response(body, {
		headers: {
			'Content-Type': 'application/pdf',
			'Content-Disposition': `attachment; filename="${safeName}_offer_letter.pdf"`,
			'Cache-Control': 'private, no-store'
		}
	});
};
