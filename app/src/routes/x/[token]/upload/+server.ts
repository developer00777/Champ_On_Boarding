// The employee's uploads in the exit portal: their signature image, the new
// employer's offer letter, an asset-handover photo.
//
// The signature is the important one — it is what gets drawn into every
// generated exit document, so it is validated as a real image (not a PDF) and
// re-uploading replaces the previous one rather than accumulating.
import { json, error } from '@sveltejs/kit';
import { ObjectId } from 'mongodb';
import type { RequestHandler } from './$types';
import { Exit, ExitDocument } from '$lib/server/db/schema';
import { deleteFromGridFS, uploadBytesToGridFS } from '$lib/server/storage';
import { audit } from '$lib/server/audit';
import { resolveExitToken } from '$lib/server/offboarding/exit';
import { extFor } from '$lib/server/offboarding/documents';
import { EXIT_UPLOAD_DOCS } from '$lib/shared/offboarding';
import {
	ACCEPTED_EXIT_MIMES,
	ACCEPTED_IMAGE_MIMES,
	MAX_EXIT_FILE_BYTES,
	matchesMagicBytes
} from '$lib/server/offboarding/uploads';

export const config = { runtime: 'nodejs24.x' };

const EDITABLE = ['link_sent', 'in_progress', 'submitted', 'changes_requested'];
const SLOT_BY_TYPE = new Map<string, (typeof EXIT_UPLOAD_DOCS)[number]>(
	EXIT_UPLOAD_DOCS.map((d) => [d.docType, d])
);

export const POST: RequestHandler = async ({ params, request, getClientAddress }) => {
	const resolved = await resolveExitToken(params.token, 'forms');
	if (!resolved) error(404, 'This exit link is invalid, expired, or has been revoked.');
	const { exit } = resolved;
	if (!EDITABLE.includes(exit.status))
		error(409, 'Your exit documents have been submitted and can no longer be edited.');

	const contentType = request.headers.get('content-type') ?? '';

	// ── action=remove (JSON body) ────────────────────────────────────────────
	if (contentType.includes('application/json')) {
		const body = await request.json();
		if (body.action !== 'remove') error(400, 'Unknown action');
		const doc = await ExitDocument.findOne({
			_id: body.fileId,
			exitId: exit._id,
			source: 'employee'
		}).lean();
		if (!doc) error(404, 'Unknown file');
		await deleteFromGridFS(doc.gridfsId as ObjectId).catch(() => {});
		await ExitDocument.deleteOne({ _id: doc._id });
		await audit({
			candidateId: exit.candidateId ? String(exit.candidateId) : null,
			actor: 'employee',
			action: 'exit_file_removed',
			field: doc.docType,
			ip: getClientAddress()
		});
		return json({ ok: true });
	}

	if (!contentType.includes('multipart/form-data')) error(400, 'Expected multipart/form-data');

	const form = await request.formData();
	const docType = String(form.get('docType') ?? '');
	const fileField = form.get('file');

	const slot = SLOT_BY_TYPE.get(docType);
	if (!slot) error(400, 'Unknown document type');
	if (!(fileField instanceof File) || fileField.size === 0) error(400, 'No file provided');

	// A signature must be an image: a PDF cannot be stamped onto a signature line.
	const allowed = docType === 'signature' ? ACCEPTED_IMAGE_MIMES : ACCEPTED_EXIT_MIMES;
	if (!allowed.includes(fileField.type))
		error(
			400,
			docType === 'signature'
				? 'Please upload a photo or scan of your signature as a JPG or PNG image.'
				: 'Only PDF, JPG, PNG or WEBP files are accepted'
		);
	if (fileField.size > MAX_EXIT_FILE_BYTES) error(400, 'File is larger than 25 MB');

	const bytes = new Uint8Array(await fileField.arrayBuffer());
	if (!matchesMagicBytes(fileField.type, bytes))
		error(400, 'File content does not match its declared type. Please upload a genuine image or PDF.');

	const filename = `exits/${String(exit._id)}/${docType}/${crypto.randomUUID()}.${extFor(fileField.type)}`;
	const gridfsId = await uploadBytesToGridFS(bytes, filename, fileField.type);

	// One file per slot: the newest upload replaces the previous, which also
	// clears any re-upload request HR left on it.
	const previous = await ExitDocument.find({ exitId: exit._id, source: 'employee', docType }).lean();
	const doc = await ExitDocument.create({
		exitId: exit._id,
		source: 'employee',
		docType,
		label: slot.label,
		gridfsId,
		mime: fileField.type,
		sizeBytes: fileField.size
	});
	for (const old of previous) {
		await deleteFromGridFS(old.gridfsId as ObjectId).catch(() => {});
		await ExitDocument.deleteOne({ _id: old._id });
	}

	if (exit.status === 'link_sent') {
		await Exit.findByIdAndUpdate(exit._id, { status: 'in_progress' });
	}

	await audit({
		candidateId: exit.candidateId ? String(exit.candidateId) : null,
		actor: 'employee',
		action: 'exit_file_uploaded',
		field: docType,
		ip: getClientAddress()
	});

	return json({
		id: String(doc._id),
		docType,
		label: slot.label,
		mime: fileField.type,
		sizeBytes: fileField.size
	});
};
