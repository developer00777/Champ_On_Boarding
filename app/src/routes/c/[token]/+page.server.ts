import { error, fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db, t } from '$lib/server/db';
import { resolveCandidateToken } from '$lib/server/tokens';
import { checklistFor } from '$lib/server/checklist';
import { audit } from '$lib/server/audit';
import { encrypt } from '$lib/server/crypto';
import { validateMasterSheet, titleCase, maskAadhaar } from '$lib/shared/validation';
import { TRACK_LABELS, PHYSICAL_ITEM_TYPES, type Track } from '$lib/shared/matrix';
import { isConfigured as digilockerConfigured } from '$lib/server/verify/digilocker';
import { verificationsFor } from '$lib/server/verify/engine';
import { VERIFY_SPECS } from '$lib/shared/match';

const EDITABLE_STATUSES = ['opened', 'in_progress', 'changes_requested'];

// Master-sheet fields the candidate may write (PRD §3). Aadhaar handled separately.
const FIELDS = [
	'fullName',
	'dob',
	'gender',
	'mobile',
	'fatherName',
	'fatherMobile',
	'motherName',
	'motherMobile',
	'motherDob',
	'maritalStatus',
	'spouseName',
	'spouseContact',
	'spouseDob',
	'presentAddress',
	'presentPin',
	'presentHouseNo',
	'permanentAddress',
	'permanentPin',
	'permanentHouseNo',
	'panNo',
	'uanNo',
	'dlNo',
	'passportNo',
	'bankName',
	'accountNo',
	'ifsc',
	'branch'
] as const;

const TITLE_CASE_FIELDS = new Set([
	'fullName',
	'fatherName',
	'motherName',
	'spouseName',
	'bankName',
	'branch'
]);

function formToFields(form: FormData): Record<string, string> {
	const out: Record<string, string> = {};
	for (const f of FIELDS) {
		let v = String(form.get(f) ?? '').trim();
		if (TITLE_CASE_FIELDS.has(f) && v) v = titleCase(v);
		if (f === 'panNo' || f === 'ifsc') v = v.toUpperCase();
		out[f] = v;
	}
	out.aadhaarNo = String(form.get('aadhaarNo') ?? '').replace(/\s/g, '');
	return out;
}

export const load: PageServerLoad = async ({ params }) => {
	const candidate = await resolveCandidateToken(params.token);
	if (!candidate) error(404, 'This onboarding link is invalid, expired, or revoked.');

	const [company] = await db
		.select()
		.from(t.companies)
		.where(eq(t.companies.id, candidate.companyId));
	const checklist = await checklistFor(candidate.id, candidate.track as Track);
	const dlVerifications = (await verificationsFor(candidate.id))
		.filter((v) => v.source === 'digilocker')
		.map((v) => ({
			docKind: v.docKind,
			label: VERIFY_SPECS[v.docKind]?.label ?? v.docKind,
			status: v.status,
			score: v.score
		}));

	return {
		digilocker: {
			enabled: digilockerConfigured(),
			results: dlVerifications
		},
		candidate: {
			id: candidate.id,
			track: candidate.track,
			trackLabel: TRACK_LABELS[candidate.track as Track],
			status: candidate.status,
			consented: !!candidate.consentAt,
			email: candidate.email,
			aadhaarMasked: maskAadhaar(candidate.aadhaarLast4),
			hasAadhaar: !!candidate.aadhaarNoEncrypted,
			fields: Object.fromEntries(
				FIELDS.map((f) => [f, (candidate as unknown as Record<string, string | null>)[f] ?? ''])
			),
			suggestions: candidate.ocrSuggestions ?? {}
		},
		companyName: company?.name ?? 'Champions Group',
		checklist: checklist.map((s) => ({
			...s,
			docs: s.docs.map((d) => ({
				id: d.id,
				ocrStatus: d.ocrStatus,
				reviewStatus: d.reviewStatus,
				reviewNote: d.reviewNote,
				mime: d.mime
			}))
		})),
		physicalItems: PHYSICAL_ITEM_TYPES.map((p) => p.label),
		editable: EDITABLE_STATUSES.includes(candidate.status)
	};
};

export const actions: Actions = {
	consent: async ({ params, getClientAddress }) => {
		const candidate = await resolveCandidateToken(params.token);
		if (!candidate) return fail(404);
		if (!candidate.consentAt) {
			await db
				.update(t.candidates)
				.set({ consentAt: new Date(), consentIp: getClientAddress() })
				.where(eq(t.candidates.id, candidate.id));
			await audit({
				candidateId: candidate.id,
				actor: 'candidate',
				action: 'consent_given',
				ip: getClientAddress()
			});
		}
		return { ok: true };
	},

	save: async ({ params, request, getClientAddress }) => {
		const candidate = await resolveCandidateToken(params.token);
		if (!candidate) return fail(404);
		if (!EDITABLE_STATUSES.includes(candidate.status))
			return fail(409, { message: 'This submission can no longer be edited.' });

		const fields = formToFields(await request.formData());
		const update: Record<string, unknown> = { ...fields };
		delete update.aadhaarNo;
		if (fields.aadhaarNo) {
			update.aadhaarNoEncrypted = encrypt(fields.aadhaarNo);
			update.aadhaarLast4 = fields.aadhaarNo.slice(-4);
		}
		if (candidate.status === 'opened') update.status = 'in_progress';

		await db.update(t.candidates).set(update).where(eq(t.candidates.id, candidate.id));
		await audit({
			candidateId: candidate.id,
			actor: 'candidate',
			action: 'fields_saved',
			ip: getClientAddress()
		});
		return { saved: true };
	},

	submit: async ({ params, request, getClientAddress }) => {
		const candidate = await resolveCandidateToken(params.token);
		if (!candidate) return fail(404);
		if (!EDITABLE_STATUSES.includes(candidate.status))
			return fail(409, { message: 'This submission can no longer be edited.' });
		if (!candidate.consentAt) return fail(400, { message: 'Consent is required.' });

		const fields = formToFields(await request.formData());
		const errors = validateMasterSheet(fields);

		const checklist = await checklistFor(candidate.id, candidate.track as Track);
		const missing = checklist.filter((s) => s.mandatory && !s.satisfied);
		for (const slot of missing) {
			errors.push({ field: slot.type, message: `${slot.label} has not been uploaded` });
		}
		if (errors.length) return fail(400, { errors, fields });

		const update: Record<string, unknown> = { ...fields };
		delete update.aadhaarNo;
		update.aadhaarNoEncrypted = encrypt(fields.aadhaarNo);
		update.aadhaarLast4 = fields.aadhaarNo.slice(-4);
		update.status = 'submitted';
		update.submittedAt = new Date();

		await db.update(t.candidates).set(update).where(eq(t.candidates.id, candidate.id));
		await audit({
			candidateId: candidate.id,
			actor: 'candidate',
			action: 'submitted',
			ip: getClientAddress()
		});
		return { submitted: true };
	}
};
