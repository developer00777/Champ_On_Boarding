import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { Candidate, Company, OfferLetter } from '$lib/server/db/schema';
import { audit } from '$lib/server/audit';
import { offerLetterInputFromDraft } from '$lib/server/offer-letter/fields';
import { offerLetterInputFromForm } from '$lib/server/offer-letter/form';
import { generateOfferLetterPdf } from '$lib/server/offer-letter/pdf';
import { brandBySlug } from '$lib/shared/brands';
import { getGridFSBytes } from '$lib/server/storage';
import { stampUploadedLetter } from '$lib/server/offer-letter/uploaded';
import type { ObjectId } from 'mongodb';

/** A directly-uploaded letter replaces the generated one wholesale, so both the
 *  download and the preview serve it instead of rendering. Returns null when
 *  this candidate's letter is generated, which is the normal case. */
async function uploadedLetterBytes(draft: unknown): Promise<Uint8Array | null> {
	const d = draft as {
		uploadedLetter?: { fileId?: ObjectId | null; signature?: never };
		signatoryImageBase64?: string | null;
	} | null;
	const fileId = d?.uploadedLetter?.fileId;
	if (!fileId) return null;
	const raw = await getGridFSBytes(fileId);
	return stampUploadedLetter(
		raw,
		d?.uploadedLetter?.signature ?? null,
		d?.signatoryImageBase64 ?? ''
	);
}

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
	const uploaded = await uploadedLetterBytes(draft);
	const pdfBytes = uploaded ?? (await generateOfferLetterPdf(candidate, company?.name ?? '', input, brand));
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

	// An uploaded letter is the letter: the form's fields do not compose with it,
	// so the preview shows the upload rather than rendering something the
	// candidate would never receive.
	const uploadedDraft = await OfferLetter.findOne({ candidateId: params.id }).lean();
	const uploaded = await uploadedLetterBytes(uploadedDraft);

	const parsed = await offerLetterInputFromForm(await request.formData());
	if (!parsed.ok) error(400, parsed.error);

	// Hand-edited wording is a super-admin power, so for anyone else the letter
	// is previewed with the edits already on file rather than whatever the
	// posted form carries. Both directions matter: a lesser role must not be
	// able to preview terms they could not save, and must not be shown a letter
	// stripped of edits that would go out if they sent it. The form they post
	// has no manual-edit fields at all, so without this their preview would
	// silently drop a super admin's changes.
	if (locals.admin.role !== 'super_admin') {
		const draft = await OfferLetter.findOne({ candidateId: params.id }).lean();
		const saved = offerLetterInputFromDraft(draft);
		parsed.input.manualEdits = saved.manualEdits;
		parsed.input.manualAdditions = saved.manualAdditions;
	}

	await audit({
		candidateId: params.id,
		actor: locals.admin!.email,
		action: 'offer_letter_previewed',
		newValue: candidate.fullName ?? candidate.email,
		ip: clientIp(getClientAddress)
	});

	const pdfBytes =
		uploaded ?? (await generateOfferLetterPdf(candidate, company?.name ?? '', parsed.input, brand));
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
