// HR uploading into one of the candidate's own document slots, on their behalf.
//
// For the candidate who cannot get on with the onboarding link: they hand over
// or WhatsApp their papers, and HR files them here. Unlike other-docs (HR's
// private reference files) this lands in the document matrix itself, so it is
// OCR'd, satisfies the checklist and feeds the cross-check exactly as if the
// candidate had uploaded it.
//
// A multipart POST rather than a form action, matching the candidate's uploader
// and HR's reference uploader: a 150 MB scan without a page round trip.
import { json, error } from '@sveltejs/kit';
import type { ObjectId } from 'mongodb';
import type { RequestHandler } from './$types';
import { Candidate, Document } from '$lib/server/db/schema';
import { deleteFromGridFS } from '$lib/server/storage';
import { audit } from '$lib/server/audit';
import { lacking } from '$lib/server/access';
import { matchesMagicBytes } from '$lib/server/uploads';
import { storeCandidateDocument } from '$lib/server/candidate-documents';
import { slotByType, ACCEPTED_MIMES, MAX_FILE_BYTES } from '$lib/shared/matrix';

export const config = { runtime: 'nodejs24.x' };

export const POST: RequestHandler = async ({ params, request, locals, getClientAddress }) => {
	if (!locals.admin) error(401, 'Not authenticated');
	// Handed out per person in Access & org (docs.upload), not by role.
	const refused = await lacking(locals.admin, 'docs.upload', 'act');
	if (refused) error(403, refused);

	const candidate = await Candidate.findById(params.id).lean();
	if (!candidate) error(404, 'Candidate not found');
	// Same window as the Request upload / Re-upload buttons beside it.
	if (['approved', 'complete', 'revoked'].includes(candidate.status))
		error(409, 'This record is closed — documents can no longer be changed');

	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		error(400, 'Expected a multipart form with a file');
	}

	const docType = String(form.get('docType') ?? '');
	const replaceDocId = String(form.get('replaceDocId') ?? '');
	const fileField = form.get('file');

	const slot = slotByType(docType);
	if (!slot || !slot.tracks.includes(candidate.track as never)) error(400, 'Unknown document type');
	if (!(fileField instanceof File) || fileField.size === 0) error(400, 'No file provided');
	if (!ACCEPTED_MIMES.includes(fileField.type))
		error(400, 'Only JPG, PNG or PDF files are accepted');
	if (fileField.size > MAX_FILE_BYTES) error(400, 'File is larger than 150 MB');

	// Replacing names the file it supersedes; it must be in this slot, so a
	// stale page cannot delete some other document.
	const replacing = replaceDocId
		? await Document.findOne({ _id: replaceDocId, candidateId: params.id, docType: slot.type }).lean()
		: null;
	if (replaceDocId && !replacing) error(404, 'The file being replaced is no longer there — reload the page');

	if (!replacing) {
		const usable = await Document.countDocuments({
			candidateId: params.id,
			docType: slot.type,
			reviewStatus: { $ne: 'reupload_requested' }
		});
		if (usable >= slot.maxFiles)
			error(400, `This slot already has ${slot.maxFiles} file(s) — replace one instead`);
	}

	const bytes = new Uint8Array(await fileField.arrayBuffer());
	if (!matchesMagicBytes(fileField.type, bytes))
		error(400, 'File content does not match its declared type. Please upload a genuine PDF, JPG or PNG.');

	const stored = await storeCandidateDocument({
		candidateId: params.id,
		slot,
		bytes,
		mime: fileField.type,
		actor: locals.admin.email,
		uploadedBy: locals.admin.email,
		ip: getClientAddress()
	});

	// The old file goes only once the new one is safely stored, so a failed
	// upload never leaves the slot emptier than it was.
	if (replacing) {
		await deleteFromGridFS(replacing.gridfsId as ObjectId).catch(() => {});
		await Document.deleteOne({ _id: replacing._id });
		await audit({
			candidateId: params.id,
			actor: locals.admin.email,
			action: 'document_removed',
			field: slot.type,
			newValue: 'replaced by HR',
			ip: getClientAddress()
		});
	}

	return json(stored);
};
