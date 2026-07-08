// Shared "send the offer letter" path — used both when bundled into the
// initial onboarding-link email and when triggered later from the candidate
// detail page once the recruiter finishes the form.
import type { CandidateDoc, OfferLetterDoc } from '$lib/server/db/schema';
import type { BrandTheme } from '$lib/shared/brands';
import { sendBrandedMail, brandSignoff } from '$lib/server/mailer';
import { buildOfferLetterFields, offerLetterInputFromDraft, isOfferLetterComplete } from '$lib/server/offer-letter/fields';
import { fillDocxTemplate } from '$lib/server/offer-letter/docx';
import { offerLetterTemplateBuffer } from '$lib/server/offer-letter/template';

export function offerLetterReadyToSend(draft: OfferLetterDoc | null): boolean {
	return !!draft && isOfferLetterComplete(offerLetterInputFromDraft(draft));
}

async function buildOfferLetterAttachment(
	candidate: Pick<CandidateDoc, 'fullName' | 'email' | 'presentAddress'>,
	companyName: string,
	draft: OfferLetterDoc
) {
	const fields = buildOfferLetterFields(candidate, companyName, offerLetterInputFromDraft(draft));
	const content = fillDocxTemplate(await offerLetterTemplateBuffer(), fields);
	const safeName = (candidate.fullName ?? candidate.email).replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '_');
	return { filename: `${safeName}_offer_letter.docx`, content };
}

/** Sends the branded offer-letter email with the filled .docx attached. */
export async function sendOfferLetterMail(
	candidate: Pick<CandidateDoc, 'fullName' | 'email' | 'presentAddress'>,
	companyName: string,
	draft: OfferLetterDoc,
	brand: BrandTheme
) {
	const attachment = await buildOfferLetterAttachment(candidate, companyName, draft);
	await sendBrandedMail(
		candidate.email,
		`Your offer letter from ${brand.name}`,
		`Hello${candidate.fullName ? ' ' + candidate.fullName : ''},\n\n` +
			`Congratulations! Please find your offer letter attached.\n\n` +
			`Review the terms and reach out to HR with any questions.\n\n${brandSignoff(brand)}`,
		brand,
		[attachment]
	);
}

/** Builds the onboarding-link email body/attachments, bundling the offer
 *  letter when a complete draft already exists so the candidate gets one
 *  message instead of two. */
export async function buildOnboardingLinkAttachments(
	candidate: Pick<CandidateDoc, 'fullName' | 'email' | 'presentAddress'>,
	companyName: string,
	draft: OfferLetterDoc | null
) {
	if (!offerLetterReadyToSend(draft)) return { attachments: undefined, offerLetterBundled: false };
	return {
		attachments: [await buildOfferLetterAttachment(candidate, companyName, draft!)],
		offerLetterBundled: true
	};
}
