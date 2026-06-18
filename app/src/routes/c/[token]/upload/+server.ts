import { json, error } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db, t } from '$lib/server/db';
import { resolveCandidateToken } from '$lib/server/tokens';
import { audit } from '$lib/server/audit';
import { objectKey, presignPut, objectExists, deleteObject } from '$lib/server/storage';
import { inspectDocument } from '$lib/server/ocr';
import { slotByType, ACCEPTED_MIMES, MAX_FILE_BYTES } from '$lib/shared/matrix';
import { standardFor } from '$lib/shared/doc-standards';

const EXT: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'application/pdf': 'pdf'
};

// Two-step upload: action=presign → browser PUTs to storage → action=complete (runs OCR).
export const POST: RequestHandler = async ({ params, request, getClientAddress }) => {
	const candidate = await resolveCandidateToken(params.token);
	if (!candidate) error(404, 'Invalid link');
	if (!['opened', 'in_progress', 'changes_requested'].includes(candidate.status))
		error(409, 'This submission can no longer be edited');

	const body = await request.json();

	if (body.action === 'presign') {
		const slot = slotByType(String(body.docType ?? ''));
		if (!slot || !slot.tracks.includes(candidate.track as never)) error(400, 'Unknown document type');
		const mime = String(body.mime ?? '');
		if (!ACCEPTED_MIMES.includes(mime)) error(400, 'Only JPG, PNG or PDF files are accepted');
		if (Number(body.size) > MAX_FILE_BYTES) error(400, 'File is larger than 10 MB');

		const existing = await db
			.select()
			.from(t.documents)
			.where(eq(t.documents.candidateId, candidate.id));
		const active = existing.filter(
			(d) => d.docType === slot.type && d.reviewStatus !== 'reupload_requested'
		);
		if (active.length >= slot.maxFiles) error(400, `Maximum ${slot.maxFiles} file(s) for this slot`);

		const key = objectKey(candidate.id, slot.type, EXT[mime]);
		const std = standardFor(slot.type);
		const [doc] = await db
			.insert(t.documents)
			.values({
				candidateId: candidate.id,
				docType: slot.type,
				spacesKey: key,
				mime,
				sizeBytes: Number(body.size) || 0,
				ocrStatus: std?.fields.length ? 'pending' : 'store_only',
				standardStatus: std ? 'pending' : 'skipped'
			})
			.returning();

		return json({ docId: doc.id, putUrl: await presignPut(key, mime) });
	}

	if (body.action === 'complete') {
		const [doc] = await db
			.select()
			.from(t.documents)
			.where(eq(t.documents.id, String(body.docId ?? '')));
		if (!doc || doc.candidateId !== candidate.id) error(404, 'Unknown document');

		const size = await objectExists(doc.spacesKey);
		if (size === null) error(400, 'Upload did not reach storage — please retry');
		if (size > MAX_FILE_BYTES) {
			await deleteObject(doc.spacesKey);
			await db.delete(t.documents).where(eq(t.documents.id, doc.id));
			error(400, 'File is larger than 10 MB');
		}
		await db.update(t.documents).set({ sizeBytes: size }).where(eq(t.documents.id, doc.id));
		await audit({
			candidateId: candidate.id,
			actor: 'candidate',
			action: 'document_uploaded',
			field: doc.docType,
			ip: getClientAddress()
		});

		const std = standardFor(doc.docType);
		if (!std) {
			await db
				.update(t.documents)
				.set({ ocrStatus: 'store_only', standardStatus: 'skipped' })
				.where(eq(t.documents.id, doc.id));
			return json({ ocrStatus: 'store_only', suggestions: {}, conformance: null });
		}

		try {
			const result = await inspectDocument(doc.docType, doc.spacesKey, doc.mime);
			const c = result.conformance;

			// Merge field suggestions; aadhaar_back fills permanent address too if still empty.
			const suggestions: Record<string, string> = { ...result.fields };
			if (doc.docType === 'aadhaar_back') {
				if (suggestions.presentAddress) suggestions.permanentAddress = suggestions.presentAddress;
				if (suggestions.presentPin) suggestions.permanentPin = suggestions.presentPin;
			}
			if (Object.keys(suggestions).length) {
				await db
					.update(t.candidates)
					.set({ ocrSuggestions: { ...(candidate.ocrSuggestions ?? {}), ...suggestions } })
					.where(eq(t.candidates.id, candidate.id));
			}

			const ocrStatus = result.unreadable ? 'unreadable' : std.fields.length ? 'parsed' : 'store_only';
			await db
				.update(t.documents)
				.set({
					ocrStatus,
					ocrJson: result.raw,
					ocrTranscript: result.transcript,
					standardStatus: c.status,
					standardCheck: c as unknown as Record<string, unknown>
				})
				.where(eq(t.documents.id, doc.id));
			await audit({
				candidateId: candidate.id,
				actor: 'system',
				action: 'standard_checked',
				field: doc.docType,
				newValue: c.status
			});

			return json({
				ocrStatus,
				suggestions,
				conformance: { status: c.status, reasons: c.reasons, detectedType: c.detectedType }
			});
		} catch (e) {
			console.error('[inspect] failed:', e);
			// Never fatal — the candidate types fields manually; HR reviews the document (PRD §6).
			await db
				.update(t.documents)
				.set({ ocrStatus: 'failed', standardStatus: 'skipped' })
				.where(eq(t.documents.id, doc.id));
			return json({ ocrStatus: 'failed', suggestions: {}, conformance: null });
		}
	}

	if (body.action === 'remove') {
		const [doc] = await db
			.select()
			.from(t.documents)
			.where(eq(t.documents.id, String(body.docId ?? '')));
		if (!doc || doc.candidateId !== candidate.id) error(404, 'Unknown document');
		await deleteObject(doc.spacesKey).catch(() => {});
		await db.delete(t.documents).where(eq(t.documents.id, doc.id));
		await audit({
			candidateId: candidate.id,
			actor: 'candidate',
			action: 'document_removed',
			field: doc.docType,
			ip: getClientAddress()
		});
		return json({ ok: true });
	}

	error(400, 'Unknown action');
};
