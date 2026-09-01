// Parses the admin offer-letter form into an OfferLetterInput.
//
// Shared rather than inlined in the save action because two callers need the
// exact same reading of the same form: `?/saveOfferLetter`, which persists it,
// and the preview endpoint, which renders it to a PDF without saving. If they
// parsed the form separately, a preview could show something the letter that
// eventually goes out does not say — which is the one thing a preview must
// never do.
import type { OfferLetterInput } from './fields';
import { isoToDDMMYYYY } from '$lib/shared/dates';

const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024;
const SIGNATURE_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

export type OfferLetterFormResult =
	| { ok: true; input: OfferLetterInput }
	| { ok: false; error: string };

export async function offerLetterInputFromForm(form: FormData): Promise<OfferLetterFormResult> {
	// Signature image upload — converted to a base64 data-URI. With no new file,
	// the existing value carried by the hidden field is preserved.
	let signatoryImageBase64 = String(form.get('signatoryImageBase64Existing') ?? '');
	const sigFile = form.get('signatoryImage');
	if (sigFile instanceof File && sigFile.size > 0) {
		if (sigFile.size > MAX_SIGNATURE_BYTES) {
			return { ok: false, error: 'Signature image must be under 2 MB.' };
		}
		if (!SIGNATURE_TYPES.includes(sigFile.type)) {
			return { ok: false, error: 'Signature must be a PNG, JPG, or WebP image.' };
		}
		const bytes = await sigFile.arrayBuffer();
		signatoryImageBase64 = `data:${sigFile.type};base64,${Buffer.from(bytes).toString('base64')}`;
	}

	const text = (key: string) => String(form.get(key) ?? '').trim();

	return {
		ok: true,
		input: {
			jobTitle: text('jobTitle'),
			department: text('department'),
			reportingManager: text('reportingManager'),
			officeLocation: text('officeLocation'),
			joiningDate: isoToDDMMYYYY(text('joiningDate')),
			endDate: text('endDate'),
			employmentType: text('employmentType') as OfferLetterInput['employmentType'],
			ctcAmount: text('ctcAmount'),
			monthlyCompensation: text('monthlyCompensation'),
			noticePeriod: text('noticePeriod'),
			confirmedNoticePeriod: text('confirmedNoticePeriod'),
			acceptanceDueDate: text('acceptanceDueDate'),
			signatoryName: text('signatoryName'),
			signatoryDesignation: text('signatoryDesignation'),
			signatoryImageBase64,
			weeklyExpectation: text('weeklyExpectation'),
			keyResponsibilities: text('keyResponsibilities'),
			internCriteria: text('internCriteria'),
			paymentClause: text('paymentClause'),
			compensationAnnexure: {
				enabled: form.get('annexureEnabled') === 'on',
				basicPm: text('annexureBasicPm'),
				hraPm: text('annexureHraPm'),
				bonusLabel: text('annexureBonusLabel'),
				bonusPm: text('annexureBonusPm'),
				ltaPm: text('annexureLtaPm'),
				shiftLabel: text('annexureShiftLabel'),
				shiftPm: text('annexureShiftPm'),
				specialPm: text('annexureSpecialPm'),
				pfPm: text('annexurePfPm'),
				gratuityPm: text('annexureGratuityPm'),
				insurancePm: text('annexureInsurancePm'),
				foodPm: text('annexureFoodPm'),
				variablePayEnabled: form.get('annexureVariablePayEnabled') === 'on',
				variablePayPm: text('annexureVariablePayPm')
			}
		}
	};
}
