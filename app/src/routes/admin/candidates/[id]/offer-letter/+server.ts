import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { Candidate, Company, OfferLetter } from '$lib/server/db/schema';
import { audit } from '$lib/server/audit';
import { buildOfferLetterFields, offerLetterInputFromDraft } from '$lib/server/offer-letter/fields';
import { fillDocxTemplate } from '$lib/server/offer-letter/docx';
import { offerLetterTemplateBuffer } from '$lib/server/offer-letter/template';

export const GET: RequestHandler = async ({ params, locals, getClientAddress }) => {
	const candidate = await Candidate.findById(params.id).lean();
	if (!candidate) error(404, 'Candidate not found');

	const company = await Company.findById(candidate.companyId).lean();
	const draft = await OfferLetter.findOne({ candidateId: params.id }).lean();

	await audit({
		candidateId: params.id,
		actor: locals.admin!.email,
		action: 'offer_letter_downloaded',
		newValue: candidate.fullName ?? candidate.email,
		ip: getClientAddress()
	});

	const fields = buildOfferLetterFields(candidate, company?.name ?? '', offerLetterInputFromDraft(draft));
	const buffer = fillDocxTemplate(offerLetterTemplateBuffer(), fields);

	const safeName = (candidate.fullName ?? candidate.email).replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '_');
	const filename = `${safeName}_offer_letter.docx`;

	return new Response(buffer as unknown as ArrayBuffer, {
		headers: {
			'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
			'Content-Disposition': `attachment; filename="${filename}"`,
			'Cache-Control': 'no-store'
		}
	});
};
