import { error, fail } from '@sveltejs/kit';
import { eq, and } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db, t } from '$lib/server/db';
import { audit } from '$lib/server/audit';
import { decrypt } from '$lib/server/crypto';
import { sendMail, brandSignoff } from '$lib/server/mailer';
import { checklistFor, missingMandatory } from '$lib/server/checklist';
import { maskAadhaar, validateMasterSheet } from '$lib/shared/validation';
import { PHYSICAL_ITEM_TYPES, type Track } from '$lib/shared/matrix';
import { VERIFY_SPECS } from '$lib/shared/match';
import { verificationsFor, runVerification } from '$lib/server/verify/engine';
import { isConfigured as digilockerConfigured } from '$lib/server/verify/digilocker';
import { brandBySlug } from '$lib/shared/brands';

async function getCandidate(id: string) {
	const [row] = await db
		.select({ candidate: t.candidates, company: t.companies })
		.from(t.candidates)
		.innerJoin(t.companies, eq(t.candidates.companyId, t.companies.id))
		.where(eq(t.candidates.id, id));
	return row;
}

/** Re-check the master sheet against current values to surface review flags. */
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

	const checklist = await checklistFor(candidate.id, candidate.track as Track);
	const physical = await db
		.select()
		.from(t.physicalItems)
		.where(eq(t.physicalItems.candidateId, candidate.id));

	const aadhaarPlain = candidate.aadhaarNoEncrypted ? decrypt(candidate.aadhaarNoEncrypted) : null;

	const verifications = (await verificationsFor(candidate.id)).map((v) => ({
		source: v.source,
		docKind: v.docKind,
		label: VERIFY_SPECS[v.docKind]?.label ?? v.docKind,
		status: v.status,
		score: v.score,
		note: v.note,
		fieldResults: v.fieldResults,
		verifiedAt: v.verifiedAt.toISOString()
	}));

	return {
		verifications,
		digilockerEnabled: digilockerConfigured(),
		candidate: {
			...candidate,
			aadhaarNoEncrypted: undefined,
			aadhaarMasked: maskAadhaar(candidate.aadhaarLast4),
			createdAt: candidate.createdAt.toISOString(),
			submittedAt: candidate.submittedAt?.toISOString() ?? null,
			reviewedAt: candidate.reviewedAt?.toISOString() ?? null,
			consentAt: candidate.consentAt?.toISOString() ?? null
		},
		companyName: company.name,
		brand: brandBySlug(company.brandSlug),
		checklist: checklist.map((s) => ({
			...s,
			docs: s.docs.map((d) => ({
				id: d.id,
				mime: d.mime,
				sizeBytes: d.sizeBytes,
				ocrStatus: d.ocrStatus,
				reviewStatus: d.reviewStatus,
				reviewNote: d.reviewNote,
				ocrTranscript: d.ocrTranscript,
				uploadedAt: d.uploadedAt.toISOString()
			}))
		})),
		physical: PHYSICAL_ITEM_TYPES.map((p) => {
			const item = physical.find((i) => i.itemType === p.type);
			return {
				id: item?.id,
				type: p.type,
				label: p.label,
				received: item?.received ?? false,
				receivedAt: item?.receivedAt?.toISOString() ?? null
			};
		}),
		flags: candidate.status === 'submitted' ? reviewFlags(candidate, aadhaarPlain) : []
	};
};

export const actions: Actions = {
	// Cross-check OCR-extracted values against the typed master sheet. Works without DigiLocker;
	// a high-trust DigiLocker pull (source 'digilocker') uses the same engine when configured.
	crosscheck: async ({ params, locals }) => {
		const row = await getCandidate(params.id);
		if (!row) return fail(404);
		const { candidate } = row;

		const sugg = candidate.ocrSuggestions ?? {};
		const found: Record<string, string> = { ...sugg };
		if (sugg.aadhaarNo) found.aadhaarLast4 = sugg.aadhaarNo.replace(/\D/g, '').slice(-4);

		let count = 0;
		for (const docKind of ['aadhaar', 'pan']) {
			const result = await runVerification(
				candidate,
				'ocr_crosscheck',
				docKind,
				found,
				locals.admin!.email
			);
			if (result) count++;
		}
		return { crosschecked: count };
	},

	approve: async ({ params, locals, getClientAddress }) => {
		const row = await getCandidate(params.id);
		if (!row) return fail(404);
		const { candidate } = row;
		const brand = brandBySlug(row.company.brandSlug);
		if (candidate.status !== 'submitted')
			return fail(409, { message: 'Only submitted candidates can be approved.' });

		const checklist = await checklistFor(candidate.id, candidate.track as Track);
		if (missingMandatory(checklist).length)
			return fail(400, { message: 'Mandatory documents are missing — cannot approve.' });

		const physical = await db
			.select()
			.from(t.physicalItems)
			.where(eq(t.physicalItems.candidateId, candidate.id));
		const allPhysical = physical.length > 0 && physical.every((p) => p.received);

		await db
			.update(t.candidates)
			.set({
				status: allPhysical ? 'complete' : 'approved',
				reviewedAt: new Date(),
				reviewedBy: locals.admin!.id
			})
			.where(eq(t.candidates.id, candidate.id));
		await audit({
			candidateId: candidate.id,
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

		const [doc] = await db
			.select()
			.from(t.documents)
			.where(and(eq(t.documents.id, docId), eq(t.documents.candidateId, row.candidate.id)));
		if (!doc) return fail(404);

		await db
			.update(t.documents)
			.set({ reviewStatus: 'reupload_requested', reviewNote: note || null })
			.where(eq(t.documents.id, doc.id));
		await db
			.update(t.candidates)
			.set({ status: 'changes_requested' })
			.where(eq(t.candidates.id, row.candidate.id));
		await audit({
			candidateId: row.candidate.id,
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
				`\n\nPlease open your onboarding link again, replace the document, and resubmit.\n\n${brandSignoff(brandBySlug(row.company.brandSlug))}`
		);
		return { ok: true };
	},

	physical: async ({ params, request, locals, getClientAddress }) => {
		const row = await getCandidate(params.id);
		if (!row) return fail(404);
		const form = await request.formData();
		const itemId = String(form.get('itemId') ?? '');
		const received = form.get('received') === 'true';

		await db
			.update(t.physicalItems)
			.set({
				received,
				receivedAt: received ? new Date() : null,
				receivedBy: received ? locals.admin!.id : null
			})
			.where(
				and(eq(t.physicalItems.id, itemId), eq(t.physicalItems.candidateId, row.candidate.id))
			);
		await audit({
			candidateId: row.candidate.id,
			actor: locals.admin!.email,
			action: received ? 'physical_item_received' : 'physical_item_unset',
			field: itemId,
			ip: getClientAddress()
		});

		// approved + all physical received → complete (PRD §3)
		const physical = await db
			.select()
			.from(t.physicalItems)
			.where(eq(t.physicalItems.candidateId, row.candidate.id));
		const allReceived = physical.every((p) => p.received);
		if (row.candidate.status === 'approved' && allReceived) {
			await db
				.update(t.candidates)
				.set({ status: 'complete' })
				.where(eq(t.candidates.id, row.candidate.id));
		} else if (row.candidate.status === 'complete' && !allReceived) {
			await db
				.update(t.candidates)
				.set({ status: 'approved' })
				.where(eq(t.candidates.id, row.candidate.id));
		}
		return { ok: true };
	},

	reveal: async ({ params, locals, getClientAddress }) => {
		const row = await getCandidate(params.id);
		if (!row) return fail(404);
		if (!row.candidate.aadhaarNoEncrypted) return fail(404, { message: 'No Aadhaar on record.' });
		// PRD §9 — every reveal is audit-logged
		await audit({
			candidateId: row.candidate.id,
			actor: locals.admin!.email,
			action: 'aadhaar_revealed',
			ip: getClientAddress()
		});
		return { aadhaar: decrypt(row.candidate.aadhaarNoEncrypted) };
	},

	revoke: async ({ params, locals, getClientAddress }) => {
		const row = await getCandidate(params.id);
		if (!row) return fail(404);
		await db
			.update(t.linkTokens)
			.set({ revoked: true })
			.where(eq(t.linkTokens.candidateId, row.candidate.id));
		await db
			.update(t.candidates)
			.set({ status: 'revoked' })
			.where(eq(t.candidates.id, row.candidate.id));
		await audit({
			candidateId: row.candidate.id,
			actor: locals.admin!.email,
			action: 'link_revoked',
			ip: getClientAddress()
		});
		return { ok: true };
	}
};
