// HR uploading a reference document against a candidate.
//
// A multipart POST rather than a form action so the card can upload without a
// full page round trip, matching the candidate portal's uploader and the
// offboarding handover uploader.
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { Candidate, CandidateFile } from '$lib/server/db/schema';
import { uploadBytesToGridFS } from '$lib/server/storage';
import { audit } from '$lib/server/audit';
import { ACCEPTED_MIMES, MAX_FILE_BYTES } from '$lib/shared/matrix';
import { matchesMagicBytes, extFor, safeFilename } from '$lib/server/uploads';

export const config = { runtime: 'nodejs24.x' };

export const POST: RequestHandler = async ({ params, request, locals, getClientAddress }) => {
	if (!locals.admin) error(401, 'Not authenticated');
	// Same bar as the rest of HR's work on this page: a viewer can read the
	// record but not add to it.
	if (locals.admin.role !== 'super_admin' && locals.admin.role !== 'hr_admin')
		error(403, 'Only HR or a super admin can upload reference documents');

	const candidate = await Candidate.findById(params.id).lean();
	if (!candidate) error(404, 'Candidate not found');

	// A request with no body at all throws here rather than yielding an empty
	// FormData, which surfaced as a 500 instead of the 400 below.
	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		error(400, 'Expected a multipart form with a file');
	}

	const fileField = form.get('file');
	const note = String(form.get('note') ?? '').trim().slice(0, 300);

	if (!(fileField instanceof File) || fileField.size === 0) error(400, 'No file provided');
	if (!ACCEPTED_MIMES.includes(fileField.type))
		error(400, 'Only JPG, PNG or PDF files are accepted');
	if (fileField.size > MAX_FILE_BYTES) error(400, 'File is larger than 150 MB');

	const bytes = new Uint8Array(await fileField.arrayBuffer());
	if (!matchesMagicBytes(fileField.type, bytes))
		error(400, 'File content does not match its declared type. Please upload a genuine PDF, JPG or PNG.');

	// HR's label if they gave one, else the name they uploaded it under — never
	// blank, so the list never shows an unnamed row.
	const label =
		String(form.get('label') ?? '').trim().slice(0, 120) ||
		safeFilename(fileField.name, 'Reference document');

	const gridfsId = await uploadBytesToGridFS(
		bytes,
		`candidates/${params.id}/reference/${crypto.randomUUID()}.${extFor(fileField.type)}`,
		fileField.type
	);

	// Appended, not replaced: unlike a matrix slot or a handover payslip, there
	// is no fixed number of reference documents.
	const doc = await CandidateFile.create({
		candidateId: params.id,
		label,
		note: note || null,
		gridfsId,
		mime: fileField.type,
		sizeBytes: fileField.size,
		uploadedBy: locals.admin.id
	});

	await audit({
		candidateId: params.id,
		actor: locals.admin.email,
		action: 'reference_file_uploaded',
		field: label,
		ip: getClientAddress()
	});

	return json({
		id: String(doc._id),
		label,
		note: note || null,
		mime: fileField.type,
		sizeBytes: fileField.size,
		uploadedAt: doc.createdAt?.toISOString?.() ?? new Date().toISOString()
	});
};
