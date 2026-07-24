import { error, fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { Candidate, Company, Document, PhysicalItem, LinkToken, Verification, OfferLetter } from '$lib/server/db/schema';
import { audit } from '$lib/server/audit';
import { decrypt } from '$lib/server/crypto';
import { deleteFromGridFS } from '$lib/server/storage';
import { sendBrandedMail, brandSignoff } from '$lib/server/mailer';
import { checklistFor, missingMandatory } from '$lib/server/checklist';
import {
	maskAadhaar,
	validateMasterSheet,
	titleCase,
	isValidPan,
	isValidIfsc,
	isValidPin,
	isValidMobile
} from '$lib/shared/validation';
import { PHYSICAL_ITEM_TYPES, TRACK_LABELS, slotByType, type Track } from '$lib/shared/matrix';
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
import { sendApprovalNotificationWA, sendOfferLetterNotificationWA } from '$lib/server/whatsapp';
import { createLinkToken } from '$lib/server/tokens';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';

async function getCandidate(id: string) {
	const candidate = await Candidate.findById(id).lean();
	if (!candidate) return null;
	const company = await Company.findById(candidate.companyId).lean();
	return { candidate, company };
}

/** Every mutation on a candidate record — including after HR has already
 *  approved it — is super_admin-only. hr_admin keeps full read access to this
 *  page but cannot change anything here, regardless of the candidate's status. */
function requireSuperAdmin(locals: App.Locals) {
	if (locals.admin?.role !== 'super_admin') return fail(403, { message: 'Only a super admin can edit candidate records.' });
	return null;
}

/** Approving a candidate and sending their offer letter are HR/recruiter's
 *  core job, not an admin-only escalation — both hr_admin and super_admin
 *  can perform these. Every other mutation on this page stays super_admin-only. */
function requireApprover(locals: App.Locals) {
	if (locals.admin?.role !== 'super_admin' && locals.admin?.role !== 'hr_admin')
		return fail(403, { message: 'Only HR or a super admin can do this.' });
	return null;
}

function reviewFlags(candidate: Record<string, unknown>, aadhaarPlain: string | null) {
	const fields: Record<string, string> = {};
	for (const [k, v] of Object.entries(candidate)) {
		if (typeof v === 'string') fields[k] = v;
	}
	fields.aadhaarNo = aadhaarPlain ?? '';
	return validateMasterSheet(fields).map((e) => e.message);
}

// Every candidate-submitted profile field HR can correct after the fact.
// Deliberately excludes Aadhaar (its own encrypted write-once flow — an admin
// typo-fix there needs its own reveal-then-edit path, not bundled in here) and
// email/track (identity keys other records — offer letters, verifications —
// are already keyed against, so changing them here would silently orphan
// those instead of updating them).
const PROFILE_FIELDS = [
	'fullName', 'dob', 'gender', 'mobile',
	'fatherName', 'fatherMobile', 'motherName', 'motherMobile', 'motherDob',
	'maritalStatus', 'spouseName', 'spouseContact', 'spouseDob',
	'emergencyContactName', 'emergencyContactMobile', 'emergencyContactRelation',
	'presentAddress', 'presentPin', 'presentHouseNo',
	'permanentAddress', 'permanentPin', 'permanentHouseNo',
	'panNo', 'dlNo', 'passportNo', 'linkedinId',
	'bankAccountName', 'bankName', 'accountNo', 'ifsc', 'branch'
] as const;

const PROFILE_TITLE_CASE_FIELDS = new Set([
	'fullName', 'fatherName', 'motherName', 'spouseName', 'emergencyContactName',
	'bankAccountName', 'bankName', 'branch'
]);

/** Same normalization the candidate-facing form applies (see
 *  /c/[token]/+page.server.ts formToFields) — an HR-entered correction should
 *  read the same as a candidate-entered one, not a differently-cased outlier. */
function profileFormToUpdate(form: FormData): Record<string, string> {
	const out: Record<string, string> = {};
	for (const f of PROFILE_FIELDS) {
		let v = String(form.get(f) ?? '').trim();
		if (PROFILE_TITLE_CASE_FIELDS.has(f) && v) v = titleCase(v);
		if (f === 'panNo' || f === 'ifsc') v = v.toUpperCase();
		out[f] = v;
	}
	return out;
}

/** Correcting one field (e.g. just motherDob) must not be blocked by an
 *  unrelated field the candidate never filled in — so this checks format only
 *  where a value is present, not the full master-sheet completeness gate
 *  candidates face at submission. */
function validateProfileEdit(fields: Record<string, string>): string[] {
	const errors: string[] = [];
	if (fields.panNo && !isValidPan(fields.panNo)) errors.push('PAN must match AAAAA9999A');
	if (fields.ifsc && !isValidIfsc(fields.ifsc)) errors.push('IFSC must match AAAA0XXXXXX');
	for (const [field, label] of [
		['presentPin', 'Present PIN'],
		['permanentPin', 'Permanent PIN']
	] as const) {
		if (fields[field] && !isValidPin(fields[field])) errors.push(`${label} must be 6 digits`);
	}
	for (const [field, label] of [
		['mobile', 'Mobile'],
		['fatherMobile', "Father's mobile"],
		['motherMobile', "Mother's mobile"],
		['emergencyContactMobile', 'Emergency contact mobile']
	] as const) {
		if (fields[field] && !isValidMobile(fields[field])) errors.push(`${label} must be a 10-digit number starting 6–9`);
	}
	if (fields.maritalStatus && !['single', 'married'].includes(fields.maritalStatus))
		errors.push('Marital status must be single or married');
	return errors;
}

export const load: PageServerLoad = async ({ params, locals }) => {
	const row = await getCandidate(params.id);
	if (!row) error(404, 'Candidate not found');
	const { candidate, company } = row;

	const [checklist, physical, verificationDocs, offerLetter, activeLinkToken] = await Promise.all([
		checklistFor(String(candidate._id), candidate.track as Track, company?.brandSlug),
		PhysicalItem.find({ candidateId: candidate._id }).lean(),
		Verification.find({ candidateId: candidate._id }).lean(),
		OfferLetter.findOne({ candidateId: candidate._id }).lean(),
		// Most recent non-revoked, unexpired token — the one candidateId can
		// currently open. Older tokens are left alone (never deleted) as an
		// audit trail; only this one is ever surfaced for display/testing.
		LinkToken.findOne({ candidateId: candidate._id, revoked: false, expiresAt: { $gt: new Date() } })
			.sort({ createdAt: -1 })
			.lean()
	]);

	const aadhaarPlain = candidate.aadhaarNoEncrypted ? decrypt(candidate.aadhaarNoEncrypted) : null;

	const base = (publicEnv.PUBLIC_BASE_URL ?? 'http://localhost:5173').replace(/\/$/, '');
	const onboardingLink =
		activeLinkToken?.tokenEncrypted != null
			? {
					url: `${base}/c/${decrypt(activeLinkToken.tokenEncrypted)}`,
					expiresAt: activeLinkToken.expiresAt.toISOString(),
					openedAt: activeLinkToken.openedAt?.toISOString() ?? null
				}
			: null;

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
			bankAccountName: candidate.bankAccountName ?? null,
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
				uploadedAt: new Date().toISOString(),
				// Per-document standard-conformance check (e.g. "is this actually a
				// passport photo") is not implemented yet — always null until that
				// verification step exists; the UI already no-ops safely on null.
				standardStatus: null as string | null,
				standardReasons: null as string[] | null
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
		},
		onboardingLink,
		isSuperAdmin: locals.admin?.role === 'super_admin',
		isApprover: locals.admin?.role === 'super_admin' || locals.admin?.role === 'hr_admin'
	};
};

export const actions: Actions = {
	approve: async ({ params, locals, getClientAddress }) => {
		const forbidden = requireApprover(locals);
		if (forbidden) return forbidden;
		const row = await getCandidate(params.id);
		if (!row) return fail(404);
		const { candidate } = row;
		const brand = brandBySlug(row.company?.brandSlug ?? undefined);
		if (candidate.status !== 'submitted')
			return fail(409, { message: 'Only submitted candidates can be approved.' });

		const checklist = await checklistFor(
			String(candidate._id),
			candidate.track as Track,
			row.company?.brandSlug
		);
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
			brand,
			undefined,
			'onboarding',
			params.id
		);

		// WhatsApp approval notification (best-effort — a WhatsApp failure must
		// never block approval, which has already been committed to the DB above).
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
		const forbidden = requireApprover(locals);
		if (forbidden) return forbidden;
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
			reuploadBrand,
			undefined,
			'onboarding',
			params.id
		);
		return { ok: true };
	},

	// Mirrors requestReupload, but for a slot nothing has ever been uploaded to
	// (typically an optional document, e.g. degree certificate) — there is no
	// Document row to key off, so the request is recorded on the candidate and
	// picked up by checklistFor() until a matching file actually lands.
	requestUpload: async ({ params, request, locals, getClientAddress }) => {
		const forbidden = requireApprover(locals);
		if (forbidden) return forbidden;
		const row = await getCandidate(params.id);
		if (!row) return fail(404);
		const form = await request.formData();
		const docType = String(form.get('docType') ?? '');
		const note = String(form.get('note') ?? '').trim();

		const slot = slotByType(docType);
		if (!slot) return fail(404);

		// Pull any stale request for this docType before pushing the fresh one —
		// two ops, not one, since Mongo can't $pull and $push the same array path
		// in a single update.
		await Candidate.findByIdAndUpdate(params.id, { $pull: { requestedDocTypes: { docType } } });
		await Candidate.findByIdAndUpdate(params.id, {
			$push: { requestedDocTypes: { docType, note: note || null } },
			...(row.candidate.status === 'submitted' ? { status: 'changes_requested' } : {})
		});
		await audit({
			candidateId: params.id,
			actor: locals.admin!.email,
			action: 'upload_requested',
			field: docType,
			newValue: note,
			ip: getClientAddress()
		});
		const requestBrand = brandBySlug(row.company?.brandSlug ?? undefined);
		await sendBrandedMail(
			row.candidate.email,
			'Action needed on your onboarding documents',
			`Hello,\n\nHR has requested that you upload your ${slot.label.replace(/\s*\(optional\)/i, '')}` +
				(note ? `:\n"${note}"` : '.') +
				`\n\nPlease open your onboarding link again and upload it.\n\n${brandSignoff(requestBrand)}`,
			requestBrand,
			undefined,
			'onboarding',
			params.id
		);
		return { uploadRequested: true };
	},

	physical: async ({ params, request, locals, getClientAddress }) => {
		const forbidden = requireSuperAdmin(locals);
		if (forbidden) return forbidden;
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
		const forbidden = requireSuperAdmin(locals);
		if (forbidden) return forbidden;
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

	// HR/admin-facing "does this candidate's link actually work" check: retires
	// whatever link is currently active and issues a fresh one, so the old link
	// (any copy of it sitting in an old email/chat) stops working the moment a
	// new one is handed out. Unlike `revoke`, this does not touch candidate.status
	// — the candidate is still expected to complete onboarding, just via a new URL.
	regenerateLink: async ({ params, locals, getClientAddress }) => {
		const forbidden = requireSuperAdmin(locals);
		if (forbidden) return forbidden;
		const row = await getCandidate(params.id);
		if (!row) return fail(404);
		if (['revoked', 'complete'].includes(row.candidate.status))
			return fail(409, { message: `Cannot regenerate a link for a ${row.candidate.status} candidate.` });

		await LinkToken.updateMany({ candidateId: params.id, revoked: false }, { revoked: true });
		const token = await createLinkToken(params.id);
		const base = (publicEnv.PUBLIC_BASE_URL ?? 'http://localhost:5173').replace(/\/$/, '');

		await audit({
			candidateId: params.id,
			actor: locals.admin!.email,
			action: 'link_regenerated',
			ip: getClientAddress()
		});
		return { linkRegenerated: true, newLink: `${base}/c/${token}` };
	},

	deleteCandidate: async ({ params, locals, getClientAddress }) => {
		if (locals.admin?.role !== 'super_admin') return fail(403, { message: 'Forbidden.' });
		const row = await getCandidate(params.id);
		if (!row) return fail(404);
		const { candidate } = row;

		const docs = await Document.find({ candidateId: params.id }).lean();
		for (const doc of docs) {
			await deleteFromGridFS(doc.gridfsId as import('mongodb').ObjectId).catch((e) =>
				console.error(`[delete-candidate] failed to remove GridFS blob ${doc.gridfsId}:`, e)
			);
		}

		await Promise.all([
			Document.deleteMany({ candidateId: params.id }),
			LinkToken.deleteMany({ candidateId: params.id }),
			PhysicalItem.deleteMany({ candidateId: params.id }),
			Verification.deleteMany({ candidateId: params.id }),
			OfferLetter.deleteMany({ candidateId: params.id })
		]);

		await audit({
			candidateId: params.id,
			actor: locals.admin!.email,
			action: 'candidate_deleted',
			newValue: candidate.fullName ?? candidate.email,
			ip: getClientAddress()
		});

		await Candidate.findByIdAndDelete(params.id);

		redirect(303, '/admin/candidates');
	},

	setUan: async ({ params, request, locals, getClientAddress }) => {
		const forbidden = requireSuperAdmin(locals);
		if (forbidden) return forbidden;
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
		const forbidden = requireSuperAdmin(locals);
		if (forbidden) return forbidden;
		const row = await getCandidate(params.id);
		if (!row) return fail(404);
		const { candidate } = row;

		const docs = await Document.find({
			candidateId: params.id,
			ocrStatus: { $in: ['parsed', 'pending'] }
		}).lean();

		// VERIFY_SPECS has one combined 'aadhaar' entry (front supplies
		// name/dob/gender, back supplies the PIN) but front/back are separate
		// Document rows — merge their ocrJson before verifying so neither side's
		// fields get reported as spuriously "missing" against the other's OCR.
		const docKindOf = (docType: string) => (docType.startsWith('aadhaar_') ? 'aadhaar' : docType);

		const foundByKind = new Map<string, Record<string, string>>();
		for (const doc of docs) {
			if (!doc.ocrJson) continue;
			const kind = docKindOf(doc.docType);
			const existing = foundByKind.get(kind) ?? {};
			foundByKind.set(kind, { ...existing, ...(doc.ocrJson as Record<string, string>) });
		}
		// aadhaar_front's OCR yields the full number as aadhaarNo, but the spec
		// (like the candidate's own stored field) compares only the last 4.
		for (const found of foundByKind.values()) {
			if (found.aadhaarNo && !found.aadhaarLast4) found.aadhaarLast4 = found.aadhaarNo.slice(-4);
		}

		let crosschecked = 0;
		for (const [kind, found] of foundByKind) {
			try {
				await runVerification(
					candidate as unknown as Record<string, unknown>,
					'ocr_crosscheck',
					kind,
					found,
					locals.admin!.email
				);
				crosschecked++;
			} catch (e) {
				console.error('[crosscheck]', kind, e);
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
		const forbidden = requireApprover(locals);
		if (forbidden) return forbidden;
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
			monthlyCompensation: String(form.get('monthlyCompensation') ?? '').trim(),
			noticePeriod: String(form.get('noticePeriod') ?? '').trim(),
			confirmedNoticePeriod: String(form.get('confirmedNoticePeriod') ?? '').trim(),
			acceptanceDueDate: String(form.get('acceptanceDueDate') ?? '').trim(),
			signatoryName: String(form.get('signatoryName') ?? '').trim(),
			signatoryDesignation: String(form.get('signatoryDesignation') ?? '').trim(),
			signatoryImageBase64,
			weeklyExpectation: String(form.get('weeklyExpectation') ?? '').trim(),
			keyResponsibilities: String(form.get('keyResponsibilities') ?? '').trim(),
			internCriteria: String(form.get('internCriteria') ?? '').trim(),
			paymentClause: String(form.get('paymentClause') ?? '').trim(),
			compensationAnnexure: {
				enabled: form.get('annexureEnabled') === 'on',
				basicPm: String(form.get('annexureBasicPm') ?? '').trim(),
				hraPm: String(form.get('annexureHraPm') ?? '').trim(),
				bonusLabel: String(form.get('annexureBonusLabel') ?? '').trim(),
				bonusPm: String(form.get('annexureBonusPm') ?? '').trim(),
				ltaPm: String(form.get('annexureLtaPm') ?? '').trim(),
				shiftLabel: String(form.get('annexureShiftLabel') ?? '').trim(),
				shiftPm: String(form.get('annexureShiftPm') ?? '').trim(),
				specialPm: String(form.get('annexureSpecialPm') ?? '').trim(),
				pfPm: String(form.get('annexurePfPm') ?? '').trim(),
				gratuityPm: String(form.get('annexureGratuityPm') ?? '').trim(),
				insurancePm: String(form.get('annexureInsurancePm') ?? '').trim(),
				foodPm: String(form.get('annexureFoodPm') ?? '').trim()
			}
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

	// HR/admin correcting a candidate-submitted profile field after the fact
	// (e.g. mother's DOB entered wrong) — the candidate themself can only edit
	// while their status is opened/in_progress/changes_requested, so once
	// they've submitted (or been approved), this is the only way to fix a typo
	// without asking them to redo the whole form.
	editProfile: async ({ params, request, locals, getClientAddress }) => {
		const forbidden = requireSuperAdmin(locals);
		if (forbidden) return forbidden;
		const row = await getCandidate(params.id);
		if (!row) return fail(404);

		const form = await request.formData();
		const fields = profileFormToUpdate(form);
		const errors = validateProfileEdit(fields);
		if (errors.length) return fail(400, { message: errors.join('; '), profileEditError: true });

		await Candidate.findByIdAndUpdate(params.id, fields);
		await audit({
			candidateId: params.id,
			actor: locals.admin!.email,
			action: 'profile_edited_by_admin',
			ip: getClientAddress()
		});
		return { profileSaved: true };
	},

	setEmployeeId: async ({ params, request, locals, getClientAddress }) => {
		const forbidden = requireSuperAdmin(locals);
		if (forbidden) return forbidden;
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
		const forbidden = requireApprover(locals);
		if (forbidden) return forbidden;
		const row = await getCandidate(params.id);
		if (!row) return fail(404);
		const { candidate, company } = row;

		const draft = await OfferLetter.findOne({ candidateId: params.id });
		const draftInput = offerLetterInputFromDraft(draft);
		const track = candidate.track as Track;
		if (!draft || !isOfferLetterComplete(draftInput, track)) {
			return fail(400, {
				offerLetterError: true,
				message: `Fill in all offer letter fields before sending (missing: ${missingOfferLetterFields(draftInput, track).join(', ')}).`
			});
		}

		const brand = brandBySlug(company?.brandSlug ?? undefined);
		try {
			await sendOfferLetterMail(candidate, company?.name ?? '', draft, brand);
		} catch (e) {
			console.error(`[offer-letter] send failed for candidate=${params.id}:`, e);
			await audit({
				candidateId: params.id,
				actor: locals.admin!.email,
				action: 'offer_letter_send_failed',
				newValue: candidate.email,
				ip: getClientAddress()
			});
			return fail(502, {
				offerLetterError: true,
				message: 'Could not send the offer letter email — the draft was not marked as sent. Check the mail provider and try again.'
			});
		}

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

		// WhatsApp notification that the offer letter has been emailed —
		// best-effort, must never block the send that already succeeded above.
		if (candidate.mobile) {
			await sendOfferLetterNotificationWA({
				mobile: candidate.mobile,
				candidateName: candidate.fullName || '',
				companyName: company?.name ?? brand.name,
				candidateEmail: candidate.email
			}).catch((err) => console.error('[wa] offer letter notification failed:', err));
		}

		return { offerLetterSent: true };
	}
};
