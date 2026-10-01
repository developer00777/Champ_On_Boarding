// Shared "send the offer letter" path — used both when bundled into the
// initial onboarding-link email and when triggered later from the candidate
// detail page once the recruiter finishes the form.
// Offer letters are now sent and downloaded as PDF (branded, with logo).
// The .docx template is retained only for the "Download .docx" button (Word-editable copy).
import type { CandidateDoc, OfferLetterDoc } from '$lib/server/db/schema';
import type { BrandTheme } from '$lib/shared/brands';
import type { Track } from '$lib/shared/matrix';
import { sendMail, brandFromHeader, offerLetterHtml } from '$lib/server/mailer';
import { baseUrl } from '$lib/server/base-url';
import {
	offerLetterInputFromDraft,
	isOfferLetterComplete,
	missingOfferLetterFields,
	LETTER_TYPE_BY_TRACK,
	type OfferLetterInput
} from '$lib/server/offer-letter/fields';
import { grossGap } from '$lib/shared/annexure';
import { generateOfferLetterPdf } from '$lib/server/offer-letter/pdf';
import { getGridFSBytes } from '$lib/server/storage';
import { stampUploadedLetter } from '$lib/server/offer-letter/uploaded';

/** True when this candidate has a directly-uploaded letter. While they do, it
 *  is their offer letter everywhere — preview, download, the candidate's own
 *  download, the offer email and the onboarding-link email — however much of
 *  the form is filled in. The form's fields describe a letter they are not
 *  getting until the upload is removed. */
export function hasUploadedLetter(draft: Pick<OfferLetterDoc, 'uploadedLetter'> | null | undefined): boolean {
	return !!draft?.uploadedLetter?.fileId;
}

/** Why the generated letter cannot go out yet, or null when it can. Never
 *  asked of an uploaded letter: that is already written. */
export function generatedLetterProblem(draft: OfferLetterDoc | null, track: Track): string | null {
	const input = offerLetterInputFromDraft(draft);
	if (!isOfferLetterComplete(input, track))
		return `Fill in all offer letter fields before sending (missing: ${missingOfferLetterFields(input, track).join(', ')}).`;
	// Saving refuses an annexure that does not add up, except while an upload
	// stands in for the letter — so a draft saved then, with the upload since
	// removed, is caught here before the generated letter can carry it.
	const gap = grossGap(input.compensationAnnexure);
	if (gap)
		return `The annexure’s total cash components are ₹${Math.abs(gap).toLocaleString('en-IN')} ${gap > 0 ? 'short of' : 'more than'} the gross salary. Fix it and save before sending.`;
	return null;
}

export function offerLetterReadyToSend(draft: OfferLetterDoc | null, track: Track): boolean {
	if (!draft) return false;
	if (hasUploadedLetter(draft)) return true;
	return generatedLetterProblem(draft, track) === null;
}

/** This candidate's offer letter as a PDF — the one place that decides which
 *  letter that is. The uploaded letter, stamped with the saved signature, wins
 *  whenever there is one; otherwise the letter is generated from `input`,
 *  which defaults to the saved draft (the admin preview passes the form as it
 *  stands instead). Every route that serves or sends the letter calls this. */
export async function offerLetterPdf(
	candidate: Pick<CandidateDoc, 'fullName' | 'email' | 'presentAddress' | 'track'>,
	companyName: string,
	draft: OfferLetterDoc | null,
	brand: BrandTheme,
	input?: OfferLetterInput
): Promise<{ bytes: Uint8Array; uploaded: boolean }> {
	const saved = offerLetterInputFromDraft(draft);
	if (draft && hasUploadedLetter(draft)) {
		const bytes = await stampUploadedLetter(
			await getGridFSBytes(draft.uploadedLetter!.fileId!),
			draft.uploadedLetter!.signature ?? null,
			saved.signatoryImageBase64
		);
		return { bytes, uploaded: true };
	}
	return { bytes: await generateOfferLetterPdf(candidate, companyName, input ?? saved, brand), uploaded: false };
}

async function buildOfferLetterPdfAttachment(
	candidate: Pick<CandidateDoc, 'fullName' | 'email' | 'presentAddress' | 'track'>,
	companyName: string,
	draft: OfferLetterDoc,
	brand: BrandTheme
) {
	const { bytes } = await offerLetterPdf(candidate, companyName, draft, brand);
	const safeName = (candidate.fullName ?? candidate.email).replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '_');
	return { filename: `${safeName}_offer_letter.pdf`, content: Buffer.from(bytes) };
}

/** Sends the branded offer-letter email with the filled PDF attached. */
export async function sendOfferLetterMail(
	candidate: Pick<CandidateDoc, '_id' | 'fullName' | 'email' | 'presentAddress' | 'track'>,
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
	candidate: Pick<CandidateDoc, '_id' | 'fullName' | 'email'>,
	companyName: string,
	_draft: OfferLetterDoc,
	brand: BrandTheme,
	letterType: string,
	jobTitle: string,
	attachments: { filename: string; content: Buffer }[]
) {
	const candidateName = candidate.fullName ?? candidate.email;
	const base = baseUrl();
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
		attachments,
		tags: { candidate_id: String(candidate._id), purpose: 'offer' }
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
	if (!offerLetterReadyToSend(draft, candidate.track as Track))
		return { attachments: undefined, offerLetterBundled: false };
	return {
		attachments: [await buildOfferLetterPdfAttachment(candidate, companyName, draft!, brand)],
		offerLetterBundled: true
	};
}
