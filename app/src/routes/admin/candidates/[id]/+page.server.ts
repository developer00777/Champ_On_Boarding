import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { Candidate, Company, Document, PhysicalItem, LinkToken } from '$lib/server/db/schema';
import { audit } from '$lib/server/audit';
import { decrypt } from '$lib/server/crypto';
import { sendMail, brandSignoff } from '$lib/server/mailer';
import { checklistFor, missingMandatory } from '$lib/server/checklist';
import { maskAadhaar, validateMasterSheet } from '$lib/shared/validation';
import { PHYSICAL_ITEM_TYPES, type Track } from '$lib/shared/matrix';
import { brandBySlug } from '$lib/shared/brands';

async function getCandidate(id: string) {
	const candidate = await Candidate.findById(id).lean();
	if (!candidate) return null;
	const company = await Company.findById(candidate.companyId).lean();
	return { candidate, company };
}

function reviewFlags(candidate: Record<string, unknown>, aadhaarPlain: string | null) {
	const fields: Record<string, string> = {};
	for (const [k, v] of Object.entries(candidate)) {
		if (typeof v === 'string') fields[k] = v;
	}
	fields.aadhaarNo = aadhaarPlain ?? '';
	return validateMasterSheet(fields).map((e) => e.message);
}

export const load: PageServerLoad = async ({ params }) => {
	const row = await getCandidate(params.id);
	if (!row) error(404, 'Candidate not found');
	const { candidate, company } = row;

	const checklist = await checklistFor(String(candidate._id), candidate.track as Track);
	const physical = await PhysicalItem.find({ candidateId: candidate._id }).lean();

	const aadhaarPlain = candidate.aadhaarNoEncrypted ? decrypt(candidate.aadhaarNoEncrypted) : null;

	return {
		candidate: {
			id: String(candidate._id),
			email: candidate.email,
			fullName: candidate.fullName ?? null,
			track: candidate.track,
			status: candidate.status,
			gender: candidate.gender ?? null,
			dob: candidate.dob ?? null,
			mobile: candidate.mobile ?? null,
			fatherName: candidate.fatherName ?? null,
			fatherMobile: candidate.fatherMobile ?? null,
			motherName: candidate.motherName ?? null,
			motherMobile: candidate.motherMobile ?? null,
			motherDob: candidate.motherDob ?? null,
			maritalStatus: candidate.maritalStatus ?? null,
			spouseName: candidate.spouseName ?? null,
			spouseContact: candidate.spouseContact ?? null,
			spouseDob: candidate.spouseDob ?? null,
			presentAddress: candidate.presentAddress ?? null,
			presentPin: candidate.presentPin ?? null,
			presentHouseNo: candidate.presentHouseNo ?? null,
			permanentAddress: candidate.permanentAddress ?? null,
			permanentPin: candidate.permanentPin ?? null,
			permanentHouseNo: candidate.permanentHouseNo ?? null,
			aadhaarMasked: maskAadhaar(candidate.aadhaarLast4 ?? null),
			panNo: candidate.panNo ?? null,
			uanNo: candidate.uanNo ?? null,
			dlNo: candidate.dlNo ?? null,
			passportNo: candidate.passportNo ?? null,
			bankName: candidate.bankName ?? null,
			accountNo: candidate.accountNo ?? null,
			ifsc: candidate.ifsc ?? null,
			branch: candidate.branch ?? null,
			consentAt: candidate.consentAt?.toISOString() ?? null,
			createdAt: (candidate as unknown as { createdAt: Date }).createdAt.toISOString(),
			submittedAt: candidate.submittedAt?.toISOString() ?? null,
			reviewedAt: candidate.reviewedAt?.toISOString() ?? null
		},
		companyName: company?.name ?? '',
		brand: brandBySlug(company?.brandSlug ?? undefined),
		checklist: checklist.map((s) => ({
			...s,
			docs: s.docs.map((d) => ({
				id: d.id,
				mime: d.mime,
				sizeBytes: 0,
				ocrStatus: d.ocrStatus,
				reviewStatus: d.reviewStatus,
				reviewNote: d.reviewNote,
				ocrTranscript: null,
				uploadedAt: new Date().toISOString()
			}))
		})),
		physical: PHYSICAL_ITEM_TYPES.map((p) => {
			const item = physical.find((i) => i.itemType === p.type);
			return {
				id: item ? String(item._id) : null,
				type: p.type,
				label: p.label,
				received: item?.received ?? false,
				receivedAt: item?.receivedAt?.toISOString() ?? null
			};
		}),
		flags:
			candidate.status === 'submitted'
				? reviewFlags(candidate as unknown as Record<string, unknown>, aadhaarPlain)
				: []
	};
};

export const actions: Actions = {
	approve: async ({ params, locals, getClientAddress }) => {
		const row = await getCandidate(params.id);
		if (!row) return fail(404);
		const { candidate } = row;
		const brand = brandBySlug(row.company?.brandSlug ?? undefined);
		if (candidate.status !== 'submitted')
			return fail(409, { message: 'Only submitted candidates can be approved.' });

		const checklist = await checklistFor(String(candidate._id), candidate.track as Track);
		if (missingMandatory(checklist).length)
			return fail(400, { message: 'Mandatory documents are missing — cannot approve.' });

		const physical = await PhysicalItem.find({ candidateId: candidate._id }).lean();
		const allPhysical = physical.length > 0 && physical.every((p) => p.received);

		await Candidate.findByIdAndUpdate(candidate._id, {
			status: allPhysical ? 'complete' : 'approved',
			reviewedAt: new Date(),
			reviewedBy: locals.admin!.id
		});
		await audit({
			candidateId: params.id,
			actor: locals.admin!.email,
			action: 'approved',
			ip: getClientAddress()
		});
		await sendMail(
			candidate.email,
			'Your onboarding is approved',
			`Hello,\n\nYour onboarding submission has been reviewed and approved by HR.\n` +
				`Reminder for your joining day: bring 4 passport-size photos and the signed hard copy of your offer letter.\n\n${brandSignoff(brand)}`
		);
		return { ok: true };
	},

	requestReupload: async ({ params, request, locals, getClientAddress }) => {
		const row = await getCandidate(params.id);
		if (!row) return fail(404);
		const form = await request.formData();
		const docId = String(form.get('docId') ?? '');
		const note = String(form.get('note') ?? '').trim();

		const doc = await Document.findOne({ _id: docId, candidateId: params.id }).lean();
		if (!doc) return fail(404);

		await Document.findByIdAndUpdate(doc._id, {
			reviewStatus: 'reupload_requested',
			reviewNote: note || null
		});
		await Candidate.findByIdAndUpdate(params.id, { status: 'changes_requested' });
		await audit({
			candidateId: params.id,
			actor: locals.admin!.email,
			action: 'reupload_requested',
			field: doc.docType,
			newValue: note,
			ip: getClientAddress()
		});
		await sendMail(
			row.candidate.email,
			'Action needed on your onboarding documents',
			`Hello,\n\nHR has requested a re-upload of one of your documents (${doc.docType.replace(/_/g, ' ')})` +
				(note ? `:\n"${note}"` : '.') +
				`\n\nPlease open your onboarding link again, replace the document, and resubmit.\n\n${brandSignoff(brandBySlug(row.company?.brandSlug ?? undefined))}`
		);
		return { ok: true };
	},

	physical: async ({ params, request, locals, getClientAddress }) => {
		const row = await getCandidate(params.id);
		if (!row) return fail(404);
		const form = await request.formData();
		const itemId = String(form.get('itemId') ?? '');
		const received = form.get('received') === 'true';

		await PhysicalItem.findOneAndUpdate(
			{ _id: itemId, candidateId: params.id },
			{
				received,
				receivedAt: received ? new Date() : null,
				receivedBy: received ? locals.admin!.id : null
			}
		);
		await audit({
			candidateId: params.id,
			actor: locals.admin!.email,
			action: received ? 'physical_item_received' : 'physical_item_unset',
			field: itemId,
			ip: getClientAddress()
		});

		const physical = await PhysicalItem.find({ candidateId: params.id }).lean();
		const allReceived = physical.every((p) => p.received);
		if (row.candidate.status === 'approved' && allReceived) {
			await Candidate.findByIdAndUpdate(params.id, { status: 'complete' });
		} else if (row.candidate.status === 'complete' && !allReceived) {
			await Candidate.findByIdAndUpdate(params.id, { status: 'approved' });
		}
		return { ok: true };
	},

	reveal: async ({ params, locals, getClientAddress }) => {
		const row = await getCandidate(params.id);
		if (!row) return fail(404);
		if (!row.candidate.aadhaarNoEncrypted)
			return fail(404, { message: 'No Aadhaar on record.' });
		await audit({
			candidateId: params.id,
			actor: locals.admin!.email,
			action: 'aadhaar_revealed',
			ip: getClientAddress()
		});
		return { aadhaar: decrypt(row.candidate.aadhaarNoEncrypted) };
	},

	revoke: async ({ params, locals, getClientAddress }) => {
		const row = await getCandidate(params.id);
		if (!row) return fail(404);
		await LinkToken.updateMany({ candidateId: params.id }, { revoked: true });
		await Candidate.findByIdAndUpdate(params.id, { status: 'revoked' });
		await audit({
			candidateId: params.id,
			actor: locals.admin!.email,
			action: 'link_revoked',
			ip: getClientAddress()
		});
		return { ok: true };
	}
};
