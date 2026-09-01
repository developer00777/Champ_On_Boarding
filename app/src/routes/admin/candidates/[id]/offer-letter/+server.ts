import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { Candidate, Company, OfferLetter } from '$lib/server/db/schema';
import { audit } from '$lib/server/audit';
import { offerLetterInputFromDraft } from '$lib/server/offer-letter/fields';
import { offerLetterInputFromForm } from '$lib/server/offer-letter/form';
import { generateOfferLetterPdf } from '$lib/server/offer-letter/pdf';
import { brandBySlug } from '$lib/shared/brands';

/** getClientAddress() throws outright when ADDRESS_HEADER names a header the
 *  request does not carry — which is every request that does not come through a
 *  reverse proxy. The audit entry is a side note here; the letter itself must
 *  still render, so a missing IP is recorded as unknown rather than 500-ing the
 *  download. hooks.server.ts guards the same call the same way. */
function clientIp(getClientAddress: () => string): string | undefined {
	try {
		return getClientAddress();
	} catch {
		return undefined;
	}
}

export const GET: RequestHandler = async ({ params, locals, getClientAddress }) => {
	if (!locals.admin) error(401, 'Not authenticated');

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
		ip: clientIp(getClientAddress)
	});

	const input = offerLetterInputFromDraft(draft);
	const pdfBytes = await generateOfferLetterPdf(candidate, company?.name ?? '', input, brand);
	// Copy into a standalone ArrayBuffer — an unambiguous BodyInit that both
	// TypeScript and every JS runtime treat as binary (never JSON-serialised).
	const body = pdfBytes.slice().buffer;

	const safeName = (candidate.fullName ?? candidate.email).replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '_');

	return new Response(body, {
		headers: {
			'Content-Type': 'application/pdf',
			'Content-Disposition': `attachment; filename="${safeName}_offer_letter.pdf"`,
			'Cache-Control': 'no-store'
		}
	});
};

/** In-portal preview. Same renderer and the same form parse the save action
 *  uses, but nothing is persisted and the PDF comes back `inline` so it opens
 *  in a viewer rather than landing in the downloads folder — HR checks the
 *  letter against what is on screen right now, including edits not yet saved.
 *
 *  Separate from the GET above on purpose: GET is the download of the saved
 *  draft and stays exactly as it was. */
export const POST: RequestHandler = async ({ params, request, locals, getClientAddress }) => {
	if (!locals.admin) error(401, 'Not authenticated');

	const candidate = await Candidate.findById(params.id).lean();
	if (!candidate) error(404, 'Candidate not found');

	const company = await Company.findById(candidate.companyId).lean();
	const brand = brandBySlug(company?.brandSlug ?? undefined);

	const parsed = await offerLetterInputFromForm(await request.formData());
	if (!parsed.ok) error(400, parsed.error);

	await audit({
		candidateId: params.id,
		actor: locals.admin!.email,
		action: 'offer_letter_previewed',
		newValue: candidate.fullName ?? candidate.email,
		ip: clientIp(getClientAddress)
	});

	const pdfBytes = await generateOfferLetterPdf(candidate, company?.name ?? '', parsed.input, brand);
	const safeName = (candidate.fullName ?? candidate.email)
		.replace(/[^a-zA-Z0-9 ]/g, '')
		.trim()
		.replace(/\s+/g, '_');

	return new Response(pdfBytes.slice().buffer, {
		headers: {
			'Content-Type': 'application/pdf',
			'Content-Disposition': `inline; filename="${safeName}_offer_letter_preview.pdf"`,
			'Cache-Control': 'no-store'
		}
	});
};
