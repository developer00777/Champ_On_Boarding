// The block list behind the offer letter's Manual edits editor: every piece of
// wording this candidate's letter draws, in document order, with the text the
// template produces and the super admin's replacement where one exists.
//
// It is answered by rendering the letter and reading back what the renderer
// recorded, not by a separate list of the letter's contents — see MANUAL EDITS
// in offer-letter/pdf.ts. That costs one render per open, and buys the
// guarantee that the editor can never offer a block the letter does not have,
// nor miss one it does.
import type { RequestHandler } from './$types';
import { error, json } from '@sveltejs/kit';
import { Candidate, Company } from '$lib/server/db/schema';
import { offerLetterInputFromForm } from '$lib/server/offer-letter/form';
import { renderOfferLetter } from '$lib/server/offer-letter/pdf';
import { brandBySlug } from '$lib/shared/brands';
import { lacking } from '$lib/server/access';

export const POST: RequestHandler = async ({ params, request, locals }) => {
	if (!locals.admin) error(401, 'Not authenticated');
	// Hand-editing a letter's terms is "Offer letter: hand-edit the wording" in
	// the access studio. The save action and the preview endpoint check the same
	// row on the way back in; this one keeps the editor itself out of reach.
	const no = await lacking(locals.admin, 'offer.manual');
	if (no) error(403, no);

	const candidate = await Candidate.findById(params.id).lean();
	if (!candidate) error(404, 'Candidate not found');

	const company = await Company.findById(candidate.companyId).lean();
	const brand = brandBySlug(company?.brandSlug ?? undefined);

	// Parsed from the posted form, not the saved draft, so the editor shows the
	// letter as it reads with the edits currently on screen — a job title typed
	// a moment ago already appears in the paragraph that quotes it.
	const parsed = await offerLetterInputFromForm(await request.formData());
	if (!parsed.ok) error(400, parsed.error);

	const { blocks } = await renderOfferLetter(candidate, company?.name ?? '', parsed.input, brand);

	// Overrides whose block this letter no longer draws — saved against another
	// track's template, or against wording since renamed. Kept rather than
	// dropped (see manualEditRows in offer-letter/form.ts), and surfaced here so
	// the editor can offer to clear them instead of leaving them invisible.
	const drawn = new Set(blocks.map((b) => b.key));
	const orphans = parsed.input.manualEdits.filter((e) => !drawn.has(e.key)).map((e) => e.key);
	// An added block whose anchor this letter does not draw never renders, for
	// the same reason and with the same remedy.
	const orphanAdditions = parsed.input.manualAdditions
		.filter((a) => !drawn.has(a.afterKey))
		.map((a) => a.id);

	return json({ blocks, orphans, orphanAdditions });
};
