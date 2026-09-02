import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { Candidate, Company, Admin, OfferLetter, PhysicalItem } from '$lib/server/db/schema';
import { resolveCandidateToken } from '$lib/server/tokens';
import { checklistFor, missingMandatory } from '$lib/server/checklist';
import { audit } from '$lib/server/audit';
import { encrypt } from '$lib/server/crypto';
import { validateMasterSheet, titleCase, maskAadhaar } from '$lib/shared/validation';
import { isoToDDMMYYYY } from '$lib/shared/dates';
import {
	TRACK_LABELS,
	PHYSICAL_ITEM_TYPES,
	CONFIRMABLE_FIELDS,
	confirmableItemByField,
	isBgvEligible,
	type Track
} from '$lib/shared/matrix';
import { brandBySlug } from '$lib/shared/brands';
import { sendBrandedMail, brandSignoff } from '$lib/server/mailer';
import { env } from '$env/dynamic/private';
import { baseUrl } from '$lib/server/base-url';

const EDITABLE_STATUSES = ['opened', 'in_progress', 'changes_requested'];

const FIELDS = [
	'fullName', 'dob', 'gender', 'mobile',
	'fatherName', 'fatherMobile', 'fatherDob', 'motherName', 'motherMobile', 'motherDob',
	'religion', 'motherTongue',
	'maritalStatus', 'spouseName', 'spouseContact', 'spouseDob',
	'emergencyContactName', 'emergencyContactMobile', 'emergencyContactRelation',
	'presentAddress', 'presentPin', 'presentHouseNo',
	'permanentAddress', 'permanentPin', 'permanentHouseNo',
	'panNo', 'uanNo', 'dlNo', 'passportNo', 'linkedinId',
	'bankAccountName', 'bankName', 'accountNo', 'accountNoConfirm', 'ifsc', 'branch',
	'prevCompanyName', 'prevEmployeeId', 'prevDoj', 'prevDol', 'prevDesignation',
	'prevRemuneration', 'prevSupervisor', 'prevReasonLeaving', 'prevHrEmail'
] as const;

/** Rendered as native date inputs — see the matching list in +page.svelte. */
const DATE_FIELDS = new Set(['dob', 'fatherDob', 'motherDob', 'spouseDob', 'prevDoj', 'prevDol']);

const TITLE_CASE_FIELDS = new Set([
	'fullName', 'fatherName', 'motherName', 'spouseName', 'emergencyContactName',
	'bankAccountName', 'bankName', 'branch', 'motherTongue'
]);

/** Read back to the candidate and validated, but never stored: see validation.ts. */
const TRANSIENT_FIELDS = ['accountNoConfirm'] as const;

function formToFields(form: FormData): Record<string, string> {
	const out: Record<string, string> = {};
	for (const f of FIELDS) {
		let v = String(form.get(f) ?? '').trim();
		// The date inputs submit ISO; storage is the canonical "DD/MM/YYYY" every
		// reader and printed document already expects. isoToDDMMYYYY passes a
		// non-ISO value through untouched, so a record saved before the pickers
		// landed round-trips unchanged.
		if (DATE_FIELDS.has(f) && v) v = isoToDDMMYYYY(v);
		if (TITLE_CASE_FIELDS.has(f) && v) v = titleCase(v);
		if (f === 'panNo' || f === 'ifsc') v = v.toUpperCase();
		if (f === 'prevHrEmail') v = v.toLowerCase();
		out[f] = v;
	}
	out.aadhaarNo = String(form.get('aadhaarNo') ?? '').replace(/\s/g, '');
	return out;
}

export const load: PageServerLoad = async ({ params }) => {
	const candidate = await resolveCandidateToken(params.token);
	if (!candidate) error(404, 'This onboarding link is invalid, expired, or revoked.');

	const company = await Company.findById(candidate.companyId).lean();
	const [checklist, offerLetter] = await Promise.all([
		checklistFor(candidate.id, candidate.track as Track, company?.brandSlug),
		OfferLetter.findOne({ candidateId: candidate.id }).lean()
	]);
	const brand = brandBySlug(company?.brandSlug ?? undefined);

	return {
		brand,
		offerLetterSent: offerLetter?.status === 'sent',
		candidate: {
			id: candidate.id,
			track: candidate.track,
			// Whether the previous-employment (BGV) section applies: experienced
			// track at one of the BGV entities. Uses the company's raw brandSlug.
			bgvEligible: isBgvEligible(candidate.track, company?.brandSlug),
			trackLabel: TRACK_LABELS[candidate.track as Track],
			status: candidate.status,
			consented: !!candidate.consentAt,
			email: candidate.email,
			aadhaarMasked: maskAadhaar(candidate.aadhaarLast4 ?? null),
			hasAadhaar: !!candidate.aadhaarNoEncrypted,
			fields: Object.fromEntries(
				FIELDS.map((f) => [f, (candidate as unknown as Record<string, string | null>)[f] ?? ''])
			),
			suggestions: candidate.ocrSuggestions ?? {}
		},
		companyName: company?.name ?? brand.name,
		checklist: checklist.map((s) => ({
			...s,
			docs: s.docs.map((d) => ({
				id: d.id,
				ocrStatus: d.ocrStatus,
				reviewStatus: d.reviewStatus,
				reviewNote: d.reviewNote,
				mime: d.mime,
				// Per-document standard-conformance check is not implemented yet —
				// always null until that verification step exists; the UI already
				// no-ops safely on null.
				standardStatus: null as string | null,
				standardReasons: null as string[] | null
			}))
		})),
		// Objects the candidate physically brings. The confirmation items are
		// excluded: they are a detail HR reads back, not something to carry in,
		// and their labels are written for HR's checklist rather than for them.
		physicalItems: PHYSICAL_ITEM_TYPES.filter((p) => !('confirms' in p)).map((p) => p.label),
		editable: EDITABLE_STATUSES.includes(candidate.status),
		// Joining-day details HR has asked this candidate to re-confirm. Surfaced
		// whatever the record's status: the point of the ask is that it happens
		// after submission, usually after approval, on or near joining day — so
		// this deliberately does not go through `editable`.
		requestedConfirmations: (candidate.requestedConfirmations ?? []).map(
			(r: { field: string; note?: string | null }) => {
				const item = confirmableItemByField(r.field);
				return {
					field: r.field,
					label: item?.confirmLabel ?? r.field,
					note: r.note ?? null,
					value: (candidate as Record<string, any>)[r.field] ?? ''
				};
			}
		)
	};
};

export const actions: Actions = {
	consent: async ({ params, getClientAddress }) => {
		const candidate = await resolveCandidateToken(params.token);
		if (!candidate) return fail(404);
		if (!candidate.consentAt) {
			await Candidate.findByIdAndUpdate(candidate.id, {
				consentAt: new Date(),
				consentIp: getClientAddress()
			});
			await audit({ candidateId: candidate.id, actor: 'candidate', action: 'consent_given', ip: getClientAddress() });
		}
		return { ok: true };
	},

	/** The candidate confirming a joining-day detail HR asked about.
	 *
	 *  Intentionally outside EDITABLE_STATUSES: HR asks for this on or near
	 *  joining day, by which point the record is submitted or approved and the
	 *  main form is closed. Only the one field HR actually asked about can be
	 *  written, and only while a matching request is outstanding — so this cannot
	 *  become a back door into editing a locked submission. */
	confirmDetail: async ({ params, request, getClientAddress }) => {
		const candidate = await resolveCandidateToken(params.token);
		if (!candidate) return fail(404);

		const form = await request.formData();
		const field = String(form.get('field') ?? '');
		const value = String(form.get('value') ?? '').trim();

		if (!CONFIRMABLE_FIELDS.has(field))
			return fail(400, { message: 'That is not a detail we ask you to confirm.' });

		const outstanding = (candidate.requestedConfirmations ?? []).some(
			(r: { field: string }) => r.field === field
		);
		if (!outstanding) return fail(409, { message: 'That confirmation is no longer outstanding.' });
		if (!value) return fail(400, { message: 'Please enter a value before confirming.' });

		const item = confirmableItemByField(field);
		await Candidate.findByIdAndUpdate(candidate.id, {
			[field]: value,
			$pull: { requestedConfirmations: { field } }
		});
		// Recorded on the joining-day item so HR sees the candidate has answered
		// before they tick it off. HR's own tick stays theirs to make.
		if (item) {
			await PhysicalItem.findOneAndUpdate(
				{ candidateId: candidate.id, itemType: item.type },
				{ candidateConfirmedAt: new Date(), candidateConfirmedValue: value },
				{ upsert: true, setDefaultsOnInsert: true }
			);
		}
		await audit({
			candidateId: candidate.id,
			actor: 'candidate',
			action: 'detail_confirmed',
			field,
			newValue: value,
			ip: getClientAddress()
		});
		return { detailConfirmed: item?.confirmLabel ?? field };
	},

	save: async ({ params, request, getClientAddress }) => {
		const candidate = await resolveCandidateToken(params.token);
		if (!candidate) return fail(404);
		if (!EDITABLE_STATUSES.includes(candidate.status))
			return fail(409, { message: 'This submission can no longer be edited.' });

		const fields = formToFields(await request.formData());
		const update: Record<string, unknown> = { ...fields };
		delete update.aadhaarNo;
		for (const f of TRANSIENT_FIELDS) delete update[f];
		if (fields.aadhaarNo) {
			update.aadhaarNoEncrypted = encrypt(fields.aadhaarNo);
			update.aadhaarLast4 = fields.aadhaarNo.slice(-4);
		}
		if (candidate.status === 'opened') update.status = 'in_progress';

		await Candidate.findByIdAndUpdate(candidate.id, update);
		await audit({ candidateId: candidate.id, actor: 'candidate', action: 'fields_saved', ip: getClientAddress() });
		return { saved: true };
	},

	submit: async ({ params, request, getClientAddress }) => {
		const candidate = await resolveCandidateToken(params.token);
		if (!candidate) return fail(404);
		if (!EDITABLE_STATUSES.includes(candidate.status))
			return fail(409, { message: 'This submission can no longer be edited.' });
		if (!candidate.consentAt) return fail(400, { message: 'Consent is required.' });

		// Fetched before validation because the entity decides more than the
		// document matrix: it also gates the previous-employment (BGV) block.
		const company = await Company.findById(candidate.companyId).lean();

		const fields = formToFields(await request.formData());
		const errors = validateMasterSheet(fields, isBgvEligible(candidate.track, company?.brandSlug));
		const checklist = await checklistFor(candidate.id, candidate.track as Track, company?.brandSlug);
		for (const slot of missingMandatory(checklist)) {
			// Grouped slots collapse to one entry, so name the alternatives rather
			// than demanding this specific document.
			const message = slot.alternatives?.length
				? `Upload either ${slot.label} or ${slot.alternatives.join(' or ')}`
				: `${slot.label} has not been uploaded`;
			errors.push({ field: slot.type, message });
		}
		if (errors.length) return fail(400, { errors, fields });

		const update: Record<string, unknown> = { ...fields };
		delete update.aadhaarNo;
		for (const f of TRANSIENT_FIELDS) delete update[f];
		update.aadhaarNoEncrypted = encrypt(fields.aadhaarNo);
		update.aadhaarLast4 = fields.aadhaarNo.slice(-4);
		update.status = 'submitted';
		update.submittedAt = new Date();

		await Candidate.findByIdAndUpdate(candidate.id, update);
		await audit({ candidateId: candidate.id, actor: 'candidate', action: 'submitted', ip: getClientAddress() });

		// Alert the HR admin who created this candidate's link
		const brand = brandBySlug(company?.brandSlug ?? undefined);
		const base = baseUrl();
		const reviewUrl = `${base}/admin/candidates/${candidate.id}`;

		const alertRecipients: string[] = [];

		// Creator (HR admin who generated the link)
		if (candidate.createdBy) {
			const creator = await Admin.findById(candidate.createdBy).lean();
			if (creator?.email) alertRecipients.push(creator.email);
		}
		// Catch-all onboarding alert address from env
		if (env.ONBOARDING_ALERT_EMAIL && !alertRecipients.includes(env.ONBOARDING_ALERT_EMAIL)) {
			alertRecipients.push(env.ONBOARDING_ALERT_EMAIL);
		}

		for (const recipient of alertRecipients) {
			await sendBrandedMail(
				recipient,
				`🔔 Action needed: ${candidate.fullName || candidate.email} has submitted onboarding`,
				`Hello,\n\n` +
				`${candidate.fullName || candidate.email} has completed and submitted their onboarding documentation for review.\n\n` +
				`Track: ${TRACK_LABELS[candidate.track as Track]}\n` +
				`Company: ${company?.name ?? brand.name}\n\n` +
				`Please review their submission and approve or request changes:\n${reviewUrl}\n\n` +
				`${brandSignoff(brand)}`,
				brand
			).catch((err) => console.error('[submit-alert] email failed:', err));
		}

		return { submitted: true };
	}
};
