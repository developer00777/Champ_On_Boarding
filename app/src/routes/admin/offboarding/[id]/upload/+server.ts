// HR uploading the handover documents: the three payslips, the relieving and
// experience letters, the recommendation letter, PF proof and Form 16.
//
// A multipart POST rather than a form action so the page can upload several
// files without a full round trip, matching the candidate portal's uploader.
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { Exit, ExitDocument } from '$lib/server/db/schema';
import { uploadBytesToGridFS } from '$lib/server/storage';
import { audit } from '$lib/server/audit';
import { HANDOVER_DOCS } from '$lib/shared/offboarding';
import { extFor } from '$lib/server/offboarding/documents';
import { ACCEPTED_EXIT_MIMES, MAX_EXIT_FILE_BYTES, matchesMagicBytes } from '$lib/server/offboarding/uploads';

export const config = { runtime: 'nodejs24.x' };

const LABEL_BY_TYPE = new Map<string, string>(HANDOVER_DOCS.map((d) => [d.docType, d.label]));

export const POST: RequestHandler = async ({ params, request, locals, getClientAddress }) => {
	if (!locals.admin) error(401, 'Not authenticated');
	if (locals.admin.role !== 'super_admin' && locals.admin.role !== 'hr_admin')
		error(403, 'Only HR or a super admin can upload handover documents');

	const exit = await Exit.findById(params.id).lean();
	if (!exit) error(404, 'Offboarding record not found');

	const form = await request.formData();
	const docType = String(form.get('docType') ?? '');
	const fileField = form.get('file');

	if (!LABEL_BY_TYPE.has(docType)) error(400, 'Unknown handover document type');
	if (!(fileField instanceof File) || fileField.size === 0) error(400, 'No file provided');
	if (!ACCEPTED_EXIT_MIMES.includes(fileField.type))
		error(400, 'Only PDF, JPG, PNG or WEBP files are accepted');
	if (fileField.size > MAX_EXIT_FILE_BYTES) error(400, 'File is larger than 25 MB');

	const bytes = new Uint8Array(await fileField.arrayBuffer());
	if (!matchesMagicBytes(fileField.type, bytes))
		error(400, 'File content does not match its declared type. Please upload a genuine PDF, JPG or PNG.');

	const filename = `exits/${params.id}/${docType}/${crypto.randomUUID()}.${extFor(fileField.type)}`;
	const gridfsId = await uploadBytesToGridFS(bytes, filename, fileField.type);

	// One file per handover slot: re-uploading replaces rather than accumulates,
	// because "Payslip — month 1" means one payslip.
	const existing = await ExitDocument.find({ exitId: params.id, source: 'hr', docType }).lean();
	const doc = await ExitDocument.create({
		exitId: params.id,
		source: 'hr',
		docType,
		label: LABEL_BY_TYPE.get(docType),
		gridfsId,
		mime: fileField.type,
		sizeBytes: fileField.size,
		uploadedBy: locals.admin.id
	});
	for (const old of existing) {
		const { deleteFromGridFS } = await import('$lib/server/storage');
		const { ObjectId } = await import('mongodb');
		await deleteFromGridFS(old.gridfsId as InstanceType<typeof ObjectId>).catch(() => {});
		await ExitDocument.deleteOne({ _id: old._id });
	}

	await audit({
		candidateId: exit.candidateId ? String(exit.candidateId) : null,
		actor: locals.admin.email,
		action: 'exit_handover_file_uploaded',
		field: docType,
		ip: getClientAddress()
	});

	return json({
		id: String(doc._id),
		docType,
		label: LABEL_BY_TYPE.get(docType),
		mime: fileField.type,
		sizeBytes: fileField.size
	});
};
