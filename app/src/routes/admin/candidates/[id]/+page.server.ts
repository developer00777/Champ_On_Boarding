import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { Candidate, Company, Document, PhysicalItem, LinkToken, Verification, OfferLetter } from '$lib/server/db/schema';
import { audit } from '$lib/server/audit';
import { decrypt } from '$lib/server/crypto';
import { sendBrandedMail, brandSignoff } from '$lib/server/mailer';
import { checklistFor, missingMandatory } from '$lib/server/checklist';
import { maskAadhaar, validateMasterSheet } from '$lib/shared/validation';
import { PHYSICAL_ITEM_TYPES, TRACK_LABELS, type Track } from '$lib/shared/matrix';
import { brandBySlug } from '$lib/shared/brands';
import { runVerification } from '$lib/server/verify/engine';
import { VERIFY_SPECS } from '$lib/shared/match';
import {
	offerLetterInputFromDraft,
	isOfferLetterComplete,
	missingOfferLetterFields,
	type OfferLetterInput
} from '$lib/server/offer-letter/fields';
import { sendOfferLetterMail } from '$lib/server/offer-letter/send';
import { sendApprovalNotificationWA } from '$lib/server/whatsapp';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

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

	const [checklist, physical, verificationDocs, offerLetter] = await Promise.all([
		checklistFor(String(candidate._id), candidate.track as Track),
		PhysicalItem.find({ candidateId: candidate._id }).lean(),
		Verification.find({ candidateId: candidate._id }).lean(),
		OfferLetter.findOne({ candidateId: candidate._id }).lean()
	]);

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
			emergencyContactName: candidate.emergencyContactName ?? null,
			emergencyContactMobile: candidate.emergencyContactMobile ?? null,
			emergencyContactRelation: candidate.emergencyContactRelation ?? null,
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
			linkedinId: candidate.linkedinId ?? null,
			bankName: candidate.bankName ?? null,
			accountNo: candidate.accountNo ?? null,
			ifsc: candidate.ifsc ?? null,
			branch: candidate.branch ?? null,
			employeeId: candidate.employeeId ?? null,
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
				: [],
		verifications: verificationDocs.map((v) => {
			const spec = VERIFY_SPECS[v.docKind];
			return {
				label: spec?.label ?? v.docKind,
				source: v.source,
				status: v.status as string,
				score: v.score,
				note: v.note ?? null,
				fieldResults: (v.fieldResults as Array<{ label: string; expected: string; found: string; verdict: string }>) ?? []
			};
		}),
		offerLetter: {
			...offerLetterInputFromDraft(offerLetter),
			status: offerLetter?.status ?? 'draft',
			sentAt: offerLetter?.sentAt?.toISOString() ?? null
		}
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
		await sendBrandedMail(
			candidate.email,
			'Your onboarding is approved',
			`Hello,\n\nYour onboarding submission has been reviewed and approved by HR.\n` +
				`Reminder for your joining day: bring 4 passport-size photos and the signed hard copy of your offer letter.\n\n${brandSignoff(brand)}`,
			brand
		);

		// WhatsApp approval notification to candidate (best-effort)
		if (candidate.mobile) {
			await sendApprovalNotificationWA({
				mobile: candidate.mobile,
				candidateName: candidate.fullName || '',
				companyName: row.company?.name ?? brand.name
			}).catch((err) => console.error('[wa] approval notification failed:', err));
		}

		// Alert onboarding concern person to create employee code
		const onboardingEmail = env.ONBOARDING_CONCERN_EMAIL;
		if (onboardingEmail) {
			const base = (publicEnv.PUBLIC_BASE_URL ?? 'http://localhost:5173').replace(/\/$/, '');
			const reviewUrl = `${base}/admin/candidates/${params.id}`;
			await sendBrandedMail(
				onboardingEmail,
				`✅ Create employee code: ${candidate.fullName || candidate.email}`,
				`Hello,\n\n` +
				`${candidate.fullName || candidate.email} has been approved by HR and is ready for employee code creation.\n\n` +
				`Track: ${TRACK_LABELS[candidate.track as Track]}\n` +
				`Company: ${row.company?.name ?? brand.name}\n` +
				`Job title: ${(await OfferLetter.findOne({ candidateId: params.id }).lean())?.jobTitle ?? '—'}\n` +
				`Email: ${candidate.email}\n` +
				`Mobile: ${candidate.mobile ?? '—'}\n\n` +
				`Please create their employee code and update the system:\n${reviewUrl}\n\n` +
				`${brandSignoff(brand)}`,
				brand
			).catch((err) => console.error('[approve-alert] onboarding concern email failed:', err));
		}

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
		const reuploadBrand = brandBySlug(row.company?.brandSlug ?? undefined);
		await sendBrandedMail(
			row.candidate.email,
			'Action needed on your onboarding documents',
			`Hello,\n\nHR has requested a re-upload of one of your documents (${doc.docType.replace(/_/g, ' ')})` +
				(note ? `:\n"${note}"` : '.') +
				`\n\nPlease open your onboarding link again, replace the document, and resubmit.\n\n${brandSignoff(reuploadBrand)}`,
			reuploadBrand
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
	},

	setUan: async ({ params, request, locals, getClientAddress }) => {
		const row = await getCandidate(params.id);
		if (!row) return fail(404);
		if (['intern', 'fresher'].includes(row.candidate.track) === false)
			return fail(400, { message: 'UAN is set by the candidate for experienced track.' });
		const form = await request.formData();
		const uanNo = String(form.get('uanNo') ?? '').trim() || null;
		await Candidate.findByIdAndUpdate(params.id, { uanNo });
		await audit({
			candidateId: params.id,
			actor: locals.admin!.email,
			action: 'uan_set',
			newValue: uanNo ?? '',
			ip: getClientAddress()
		});
		return { uanSaved: true, uanNo: uanNo ?? '' };
	},

	crosscheck: async ({ params, locals, getClientAddress }) => {
		const row = await getCandidate(params.id);
		if (!row) return fail(404);
		const { candidate } = row;

		const docs = await Document.find({
			candidateId: params.id,
			ocrStatus: { $in: ['parsed', 'pending'] }
		}).lean();

		let crosschecked = 0;
		for (const doc of docs) {
			if (!doc.ocrJson) continue;
			try {
				const found = doc.ocrJson as Record<string, string>;
				await runVerification(
					candidate as unknown as Record<string, unknown>,
					'ocr_crosscheck',
					doc.docType,
					found,
					locals.admin!.email
				);
				crosschecked++;
			} catch (e) {
				console.error('[crosscheck] doc', doc._id, e);
			}
		}

		await audit({
			candidateId: params.id,
			actor: locals.admin!.email,
			action: 'ocr_crosscheck_run',
			newValue: String(crosschecked),
			ip: getClientAddress()
		});

		return { crosschecked };
	},

	saveOfferLetter: async ({ params, request, locals, getClientAddress }) => {
		const row = await getCandidate(params.id);
		if (!row) return fail(404);
		const form = await request.formData();

		// Handle signature image upload — convert to base64 data-URI for storage.
		// If no new file is uploaded, preserve the existing value from the hidden field.
		let signatoryImageBase64 = String(form.get('signatoryImageBase64Existing') ?? '');
		const sigFile = form.get('signatoryImage');
		if (sigFile instanceof File && sigFile.size > 0) {
			if (sigFile.size > 2 * 1024 * 1024)
				return fail(400, { message: 'Signature image must be under 2 MB.' });
			if (!['image/png', 'image/jpeg', 'image/webp'].includes(sigFile.type))
				return fail(400, { message: 'Signature must be a PNG, JPG, or WebP image.' });
			const bytes = await sigFile.arrayBuffer();
			signatoryImageBase64 = `data:${sigFile.type};base64,${Buffer.from(bytes).toString('base64')}`;
		}

		const input: OfferLetterInput = {
			jobTitle: String(form.get('jobTitle') ?? '').trim(),
			department: String(form.get('department') ?? '').trim(),
			reportingManager: String(form.get('reportingManager') ?? '').trim(),
			officeLocation: String(form.get('officeLocation') ?? '').trim(),
			joiningDate: String(form.get('joiningDate') ?? '').trim(),
			endDate: String(form.get('endDate') ?? '').trim(),
			employmentType: String(form.get('employmentType') ?? '').trim() as OfferLetterInput['employmentType'],
			ctcAmount: String(form.get('ctcAmount') ?? '').trim(),
			noticePeriod: String(form.get('noticePeriod') ?? '').trim(),
			acceptanceDueDate: String(form.get('acceptanceDueDate') ?? '').trim(),
			signatoryName: String(form.get('signatoryName') ?? '').trim(),
			signatoryDesignation: String(form.get('signatoryDesignation') ?? '').trim(),
			signatoryImageBase64
		};

		await OfferLetter.findOneAndUpdate({ candidateId: params.id }, { $set: input }, { upsert: true });
		await audit({
			candidateId: params.id,
			actor: locals.admin!.email,
			action: 'offer_letter_saved',
			ip: getClientAddress()
		});

		return { offerLetterSaved: true };
	},

	setEmployeeId: async ({ params, request, locals, getClientAddress }) => {
		const row = await getCandidate(params.id);
		if (!row) return fail(404);
		const form = await request.formData();
		const employeeId = String(form.get('employeeId') ?? '').trim() || null;
		await Candidate.findByIdAndUpdate(params.id, { employeeId });
		await audit({
			candidateId: params.id,
			actor: locals.admin!.email,
			action: 'employee_id_set',
			newValue: employeeId ?? '',
			ip: getClientAddress()
		});
		return { employeeIdSaved: true, employeeId: employeeId ?? '' };
	},

	sendOfferLetterEmail: async ({ params, locals, getClientAddress }) => {
		const row = await getCandidate(params.id);
		if (!row) return fail(404);
		const { candidate, company } = row;

		const draft = await OfferLetter.findOne({ candidateId: params.id });
		const draftInput = offerLetterInputFromDraft(draft);
		if (!draft || !isOfferLetterComplete(draftInput)) {
			return fail(400, {
				offerLetterError: true,
				message: `Fill in all offer letter fields before sending (missing: ${missingOfferLetterFields(draftInput).join(', ')}).`
			});
		}

		const brand = brandBySlug(company?.brandSlug ?? undefined);
		await sendOfferLetterMail(candidate, company?.name ?? '', draft, brand);

		draft.status = 'sent';
		draft.sentAt = new Date();
		draft.sentBy = locals.admin!.id;
		await draft.save();

		await audit({
			candidateId: params.id,
			actor: locals.admin!.email,
			action: 'offer_letter_sent',
			newValue: candidate.email,
			ip: getClientAddress()
		});

		return { offerLetterSent: true };
	}
};
