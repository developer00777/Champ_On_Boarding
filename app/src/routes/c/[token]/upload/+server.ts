import { json, error } from '@sveltejs/kit';
import { ObjectId } from 'mongodb';
import type { RequestHandler } from './$types';
import { Document } from '$lib/server/db/schema';
import { resolveCandidateToken } from '$lib/server/tokens';
import { audit } from '$lib/server/audit';
import { deleteFromGridFS } from '$lib/server/storage';
import { matchesMagicBytes } from '$lib/server/uploads';
import { storeCandidateDocument } from '$lib/server/candidate-documents';
import { slotByType, ACCEPTED_MIMES, MAX_FILE_BYTES } from '$lib/shared/matrix';

// Single-step upload: multipart POST → stored in GridFS → OCR runs server-side.
export const POST: RequestHandler = async ({ params, request, getClientAddress }) => {
	const candidate = await resolveCandidateToken(params.token);
	if (!candidate) error(404, 'Invalid link');
	if (!['opened', 'in_progress', 'changes_requested'].includes(candidate.status))
		error(409, 'This submission can no longer be edited');

	const contentType = request.headers.get('content-type') ?? '';

	// ── action=remove (JSON body) ─────────────────────────────────────────────
	if (contentType.includes('application/json')) {
		const body = await request.json();
		if (body.action !== 'remove') error(400, 'Unknown action');

		const doc = await Document.findOne({ _id: body.docId, candidateId: candidate.id }).lean();
		if (!doc) error(404, 'Unknown document');
		await deleteFromGridFS(doc.gridfsId as ObjectId).catch(() => {});
		await Document.deleteOne({ _id: doc._id });
		await audit({
			candidateId: candidate.id,
			actor: 'candidate',
			action: 'document_removed',
			field: doc.docType,
			ip: getClientAddress()
		});
		return json({ ok: true });
	}

	// ── Multipart file upload ─────────────────────────────────────────────────
	if (!contentType.includes('multipart/form-data')) error(400, 'Expected multipart/form-data');

	const form = await request.formData();
	const docType = String(form.get('docType') ?? '');
	const fileField = form.get('file');

	if (!(fileField instanceof File)) error(400, 'No file provided');

	const mime = fileField.type;
	const size = fileField.size;

	const slot = slotByType(docType);
	if (!slot || !slot.tracks.includes(candidate.track as never)) error(400, 'Unknown document type');
	if (!ACCEPTED_MIMES.includes(mime)) error(400, 'Only JPG, PNG, WEBP or PDF files are accepted');
	if (size > MAX_FILE_BYTES) error(400, 'File is larger than 150 MB');

	const existingDocs = await Document.find({
		candidateId: candidate.id,
		docType: slot.type,
		reviewStatus: { $ne: 'reupload_requested' }
	}).lean();
	if (existingDocs.length >= slot.maxFiles)
		error(400, `Maximum ${slot.maxFiles} file(s) for this slot`);

	const bytes = new Uint8Array(await fileField.arrayBuffer());
	if (!matchesMagicBytes(mime, bytes)) {
		error(400, 'File content does not match its declared type. Please upload a genuine JPG, PNG or PDF.');
	}
	const stored = await storeCandidateDocument({
		candidateId: candidate.id,
		slot,
		bytes,
		mime,
		actor: 'candidate',
		ip: getClientAddress()
	});
	if (stored.ocrStatus === 'unreadable') {
		return json({
			...stored,
			message:
				'We could not read this image. Please retake it: flat surface, good light, all corners visible.'
		});
	}
	return json(stored);
};
