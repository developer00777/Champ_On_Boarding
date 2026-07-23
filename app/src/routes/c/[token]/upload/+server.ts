import { json, error } from '@sveltejs/kit';
import { ObjectId } from 'mongodb';
import type { RequestHandler } from './$types';
import { Candidate, Document } from '$lib/server/db/schema';
import { resolveCandidateToken } from '$lib/server/tokens';
import { audit } from '$lib/server/audit';
import { uploadBytesToGridFS, deleteFromGridFS, gridFSFileSize } from '$lib/server/storage';
import { runOcr, hasOcrSchema } from '$lib/server/ocr';
import { slotByType, ACCEPTED_MIMES, MAX_FILE_BYTES } from '$lib/shared/matrix';

const EXT: Record<string, string> = {
	'image/jpeg': 'jpg',
	'image/png': 'png',
	'image/webp': 'webp',
	'application/pdf': 'pdf'
};

/** Magic-byte signatures for the file types ACCEPTED_MIMES allows. The
 *  browser-supplied Content-Type on the form field is client-controlled and
 *  proves nothing — a renamed executable can declare "image/png". This checks
 *  the actual bytes so the declared MIME can't be spoofed past validation. */
const MAGIC_BYTES: Record<string, (bytes: Uint8Array) => boolean> = {
	'image/jpeg': (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
	'image/png': (b) =>
		b.length >= 8 &&
		b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
		b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
	'application/pdf': (b) =>
		b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d
};

function matchesMagicBytes(mime: string, bytes: Uint8Array): boolean {
	const check = MAGIC_BYTES[mime];
	return check ? check(bytes) : true; // no signature defined (e.g. webp) — skip, MIME check still applies
}

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
	const filename = `${candidate.id}/${slot.type}/${crypto.randomUUID()}.${EXT[mime]}`;
	const gridfsId = await uploadBytesToGridFS(bytes, filename, mime);

	const doc = await Document.create({
		candidateId: candidate.id,
		docType: slot.type,
		gridfsId,
		mime,
		sizeBytes: size,
		ocrStatus: hasOcrSchema(slot.ocr) ? 'pending' : 'store_only'
	});

	// A file now exists for this slot — any standing "please upload this"
	// request HR left on the candidate record is resolved.
	await Candidate.findByIdAndUpdate(candidate.id, {
		$pull: { requestedDocTypes: { docType: slot.type } }
	});

	await audit({
		candidateId: candidate.id,
		actor: 'candidate',
		action: 'document_uploaded',
		field: doc.docType,
		ip: getClientAddress()
	});

	if (!hasOcrSchema(slot?.ocr)) {
		return json({ docId: String(doc._id), ocrStatus: 'store_only', suggestions: {} });
	}

	try {
		const result = await runOcr(slot.ocr, gridfsId, mime);
		if (result.unreadable) {
			await Document.findByIdAndUpdate(doc._id, {
				ocrStatus: 'unreadable',
				ocrJson: result.fields,
				ocrTranscript: result.transcript
			});
			return json({
				docId: String(doc._id),
				ocrStatus: 'unreadable',
				suggestions: {},
				message:
					'We could not read this image. Please retake it: flat surface, good light, all corners visible.'
			});
		}

		const suggestions: Record<string, string> = { ...result.fields };
		if (slot.ocr === 'aadhaar_back') {
			if (suggestions.presentAddress) suggestions.permanentAddress = suggestions.presentAddress;
			if (suggestions.presentPin) suggestions.permanentPin = suggestions.presentPin;
		}

		const existing = await Candidate.findById(candidate.id).lean();
		const s = existing?.ocrSuggestions;
		const prev = s instanceof Map ? Object.fromEntries(s) : ((s as Record<string, string>) ?? {});
		const merged = { ...prev, ...suggestions };
		await Candidate.findByIdAndUpdate(candidate.id, { ocrSuggestions: merged });
		await Document.findByIdAndUpdate(doc._id, {
			ocrStatus: 'parsed',
			ocrJson: result.fields,
			ocrTranscript: result.transcript
		});
		await audit({ candidateId: candidate.id, actor: 'system', action: 'ocr_parsed', field: doc.docType });

		return json({ docId: String(doc._id), ocrStatus: 'parsed', suggestions });
	} catch (e) {
		console.error('[ocr] failed:', e);
		await Document.findByIdAndUpdate(doc._id, { ocrStatus: 'failed' });
		return json({ docId: String(doc._id), ocrStatus: 'failed', suggestions: {} });
	}
};
