// Shared "send the offer letter" path — used both when bundled into the
// initial onboarding-link email and when triggered later from the candidate
// detail page once the recruiter finishes the form.
// Offer letters are now sent and downloaded as PDF (branded, with logo).
// The .docx template is retained only for the "Download .docx" button (Word-editable copy).
import type { CandidateDoc, OfferLetterDoc } from '$lib/server/db/schema';
import type { BrandTheme } from '$lib/shared/brands';
import { sendMail, brandFromHeader, offerLetterHtml } from '$lib/server/mailer';
import { env as publicEnv } from '$env/dynamic/public';
import {
	offerLetterInputFromDraft,
	isOfferLetterComplete,
	LETTER_TYPE_BY_TRACK
} from '$lib/server/offer-letter/fields';
import { generateOfferLetterPdf } from '$lib/server/offer-letter/pdf';

export function offerLetterReadyToSend(draft: OfferLetterDoc | null): boolean {
	return !!draft && isOfferLetterComplete(offerLetterInputFromDraft(draft));
}

async function buildOfferLetterPdfAttachment(
	candidate: Pick<CandidateDoc, 'fullName' | 'email' | 'presentAddress' | 'track'>,
	companyName: string,
	draft: OfferLetterDoc,
	brand: BrandTheme
) {
	const input = offerLetterInputFromDraft(draft);
	const pdfBuffer = await generateOfferLetterPdf(candidate, companyName, input, brand);
	const safeName = (candidate.fullName ?? candidate.email).replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '_');
	return { filename: `${safeName}_offer_letter.pdf`, content: pdfBuffer };
}

/** Sends the branded offer-letter email with the filled PDF attached. */
export async function sendOfferLetterMail(
	candidate: Pick<CandidateDoc, 'fullName' | 'email' | 'presentAddress' | 'track'>,
	companyName: string,
	draft: OfferLetterDoc,
	brand: BrandTheme
) {
	const attachment = await buildOfferLetterPdfAttachment(candidate, companyName, draft, brand);
	const letterType = LETTER_TYPE_BY_TRACK[candidate.track as keyof typeof LETTER_TYPE_BY_TRACK];
	const jobTitle = draft.jobTitle;
	await sendOfferLetterBrandedMail(
		candidate,
		companyName,
		draft,
		brand,
		letterType,
		jobTitle ?? '',
		[attachment]
	);
}

/** Rich offer-letter delivery email using the dedicated HTML template. */
export async function sendOfferLetterBrandedMail(
	candidate: Pick<CandidateDoc, 'fullName' | 'email'>,
	companyName: string,
	_draft: OfferLetterDoc,
	brand: BrandTheme,
	letterType: string,
	jobTitle: string,
	attachments: { filename: string; content: Buffer }[]
) {
	const candidateName = candidate.fullName ?? candidate.email;
	const base = (publicEnv.PUBLIC_BASE_URL ?? 'http://localhost:5173').replace(/\/$/, '');
	const logoUrl = `${base}${brand.logo.src}`;

	const html = offerLetterHtml({
		brand,
		candidateName,
		companyName,
		jobTitle,
		letterType,
		logoUrl
	});

	const plainText =
		`Dear ${candidateName},\n\n` +
		`Congratulations!\n\n` +
		`We are delighted to offer you the position of "${jobTitle}" at ${companyName}.\n\n` +
		`Please find your ${letterType} attached as a PDF. Sign and return a copy to confirm acceptance.\n\n` +
		`— HR Team, ${companyName}`;

	await sendMail(candidate.email, `Your ${letterType} from ${brand.legalName}`, plainText, {
		from: brandFromHeader(brand, 'offer'),
		html,
		attachments
	});
}

/** Builds the onboarding-link email body/attachments, bundling the offer
 *  letter when a complete draft already exists so the candidate gets one
 *  message instead of two. */
export async function buildOnboardingLinkAttachments(
	candidate: Pick<CandidateDoc, 'fullName' | 'email' | 'presentAddress' | 'track'>,
	companyName: string,
	draft: OfferLetterDoc | null,
	brand: BrandTheme
) {
	if (!offerLetterReadyToSend(draft)) return { attachments: undefined, offerLetterBundled: false };
	return {
		attachments: [await buildOfferLetterPdfAttachment(candidate, companyName, draft!, brand)],
		offerLetterBundled: true
	};
}
