// The directly-uploaded offer letter: put one here and it becomes this
// candidate's letter, in place of the one generated from the form.
//
//   POST   upload a PDF, read it, and work out where its signature goes
//   GET    the letter — stamped by default, ?raw=1 for the bytes as uploaded
//   PATCH  move/resize the signature, or turn the stamp off
//   DELETE drop it and go back to the generated letter
//
// Uploading and changing are a super admin's call, matching the button that
// opens this. Reading is open to HR: whoever can send the letter has to be able
// to see the letter they are sending.
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { ObjectId } from 'mongodb';
import { Candidate, OfferLetter } from '$lib/server/db/schema';
import { uploadBytesToGridFS, getGridFSBytes, deleteFromGridFS } from '$lib/server/storage';
import { audit } from '$lib/server/audit';
import { matchesMagicBytes, safeFilename } from '$lib/server/uploads';
import { offerLetterInputFromDraft } from '$lib/server/offer-letter/fields';
import {
	inspectUploadedLetter,
	stampUploadedLetter,
	type UploadedSignature
} from '$lib/server/offer-letter/uploaded';

export const config = { runtime: 'nodejs24.x' };

/** An offer letter is a document, not a photo album: 25 MB is far past any real
 *  one and well under the body limit, so a mistaken upload fails fast rather
 *  than after a long wait. */
const MAX_LETTER_BYTES = 25 * 1024 * 1024;

function requireSuperAdmin(locals: App.Locals) {
	if (!locals.admin) error(401, 'Not authenticated');
	if (locals.admin.role !== 'super_admin')
		error(403, 'Only a super admin can upload an offer letter.');
}

function requireReader(locals: App.Locals) {
	if (!locals.admin) error(401, 'Not authenticated');
	if (locals.admin.role !== 'super_admin' && locals.admin.role !== 'hr_admin')
		error(403, 'Only HR or a super admin can read an offer letter.');
}

async function draftFor(id: string) {
	const candidate = await Candidate.findById(id).lean();
	if (!candidate) error(404, 'Candidate not found');
	return { candidate, draft: await OfferLetter.findOne({ candidateId: id }) };
}

/** The stored placement, or null when no letter has been uploaded. */
function signatureOf(draft: { uploadedLetter?: unknown } | null): UploadedSignature | null {
	const u = (draft?.uploadedLetter ?? null) as { signature?: UploadedSignature } | null;
	return u?.signature ?? null;
}

export const POST: RequestHandler = async ({ params, request, locals, getClientAddress }) => {
	requireSuperAdmin(locals);
	const { candidate } = await draftFor(params.id);

	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		error(400, 'Expected a multipart form with a file');
	}

	const file = form.get('file');
	if (!(file instanceof File) || file.size === 0) error(400, 'No file provided');
	if (file.type !== 'application/pdf') error(400, 'The offer letter must be a PDF.');
	if (file.size > MAX_LETTER_BYTES) error(400, 'That PDF is larger than 25 MB.');

	const bytes = new Uint8Array(await file.arrayBuffer());
	// The declared type is client-controlled and proves nothing; the bytes are
	// what gets emailed to the candidate.
	if (!matchesMagicBytes('application/pdf', bytes))
		error(400, 'That file is not a genuine PDF. Export it again and retry.');

	// Read the letter before storing it: a PDF that cannot be opened at all is
	// one nobody should be able to send.
	const { pages, signature } = await inspectUploadedLetter(bytes);

	const fileId = await uploadBytesToGridFS(
		bytes,
		`candidates/${params.id}/offer-letter/${crypto.randomUUID()}.pdf`,
		'application/pdf'
	);

	// Replacing an upload removes the one it replaces: these are large, and a
	// superseded letter left in storage is a letter that can still be fetched.
	const draft = await OfferLetter.findOne({ candidateId: params.id });
	const previous = draft?.uploadedLetter?.fileId ?? null;

	await OfferLetter.findOneAndUpdate(
		{ candidateId: params.id },
		{
			$set: {
				uploadedLetter: {
					fileId,
					filename: safeFilename(file.name, 'offer-letter.pdf'),
					sizeBytes: file.size,
					pages,
					uploadedBy: locals.admin!.email,
					uploadedAt: new Date(),
					signature
				}
			}
		},
		{ upsert: true }
	);
	if (previous) await deleteFromGridFS(previous).catch(() => {});

	await audit({
		candidateId: params.id,
		actor: locals.admin!.email,
		action: 'offer_letter_uploaded',
		newValue: `${safeFilename(file.name, 'offer-letter.pdf')} (${pages} pages)`,
		ip: getClientAddress()
	});

	return json({
		filename: safeFilename(file.name, 'offer-letter.pdf'),
		sizeBytes: file.size,
		pages,
		signature,
		uploadedBy: locals.admin!.email,
		uploadedAt: new Date().toISOString()
	});
};

export const GET: RequestHandler = async ({ params, url, locals }) => {
	requireReader(locals);
	const { candidate, draft } = await draftFor(params.id);
	const fileId = draft?.uploadedLetter?.fileId;
	if (!fileId) error(404, 'No letter has been uploaded for this candidate.');

	const raw = await getGridFSBytes(fileId as unknown as ObjectId);
	// ?raw=1 is what the placement editor renders on its canvas: it draws the
	// signature itself, and a copy with the signature already burnt in would
	// show it twice.
	const bytes =
		url.searchParams.get('raw') === '1'
			? raw
			: await stampUploadedLetter(
					raw,
					signatureOf(draft),
					offerLetterInputFromDraft(draft).signatoryImageBase64
				);

	const safeName = (candidate.fullName ?? candidate.email)
		.replace(/[^a-zA-Z0-9 ]/g, '')
		.trim()
		.replace(/\s+/g, '_');

	return new Response(bytes.slice().buffer, {
		headers: {
			'Content-Type': 'application/pdf',
			'Content-Disposition': `inline; filename="${safeName}_offer_letter.pdf"`,
			'Cache-Control': 'no-store'
		}
	});
};

export const PATCH: RequestHandler = async ({ params, request, locals, getClientAddress }) => {
	requireSuperAdmin(locals);
	const { draft } = await draftFor(params.id);
	if (!draft?.uploadedLetter?.fileId) error(404, 'No letter has been uploaded for this candidate.');

	const body = (await request.json().catch(() => null)) as Partial<UploadedSignature> | null;
	if (!body) error(400, 'Expected a signature position.');

	const current = signatureOf(draft);
	const num = (v: unknown, fallback: number) =>
		typeof v === 'number' && Number.isFinite(v) ? v : fallback;
	const pages = draft.uploadedLetter.pages ?? 1;

	// Clamped rather than rejected: the editor drags in page coordinates and a
	// value a hair off the edge is a slip, not an attack. A signature parked
	// outside the page would simply never appear on the letter.
	const signature: UploadedSignature = {
		page: Math.min(Math.max(Math.round(num(body.page, current?.page ?? 1)), 1), pages),
		x: Math.max(0, num(body.x, current?.x ?? 56)),
		y: Math.max(0, num(body.y, current?.y ?? 140)),
		width: Math.min(400, Math.max(40, num(body.width, current?.width ?? 130))),
		// Detection is a fact about the upload, not something the editor sets.
		detected: current?.detected ?? false,
		anchorText: current?.anchorText ?? '',
		enabled: typeof body.enabled === 'boolean' ? body.enabled : (current?.enabled ?? true)
	};

	await OfferLetter.findOneAndUpdate(
		{ candidateId: params.id },
		{ $set: { 'uploadedLetter.signature': signature } }
	);

	await audit({
		candidateId: params.id,
		actor: locals.admin!.email,
		action: 'offer_letter_signature_placed',
		newValue: `page ${signature.page} at ${Math.round(signature.x)},${Math.round(signature.y)}${signature.enabled ? '' : ' (stamp off)'}`,
		ip: getClientAddress()
	});

	return json({ signature });
};

export const DELETE: RequestHandler = async ({ params, locals, getClientAddress }) => {
	requireSuperAdmin(locals);
	const { draft } = await draftFor(params.id);
	const fileId = draft?.uploadedLetter?.fileId;
	if (!fileId) error(404, 'No letter has been uploaded for this candidate.');

	await OfferLetter.findOneAndUpdate(
		{ candidateId: params.id },
		{ $set: { uploadedLetter: null } }
	);
	await deleteFromGridFS(fileId as unknown as ObjectId).catch(() => {});

	await audit({
		candidateId: params.id,
		actor: locals.admin!.email,
		action: 'offer_letter_upload_removed',
		ip: getClientAddress()
	});

	return json({ ok: true });
};
