// The two documents every welcome mail encloses — Core Values and the Holiday
// Calendar. Org-wide rather than per candidate: uploaded once from any
// candidate's page, carried by every welcome mail until replaced.
//
// GET opens the stored file, POST uploads or replaces it, DELETE removes it.
import { error, json } from '@sveltejs/kit';
import { ObjectId } from 'mongodb';
import type { RequestHandler } from './$types';
import { audit } from '$lib/server/audit';
import { deleteFromGridFS, getGridFSStream, uploadBytesToGridFS } from '$lib/server/storage';
import {
	WELCOME_ATTACHMENT_MAX_BYTES,
	WELCOME_ATTACHMENT_TYPES,
	cleanAttachmentName,
	getWelcomeAttachments,
	setWelcomeAttachment,
	welcomeAttachmentBytesMatch,
	welcomeAttachmentMime
} from '$lib/server/welcome-mail';
import { WELCOME_ATTACHMENT_SLOTS, isWelcomeSlot } from '$lib/shared/welcome-mail';

export const config = { runtime: 'nodejs24.x' };

function slotOf(raw: string) {
	if (!isWelcomeSlot(raw)) error(404, 'Unknown welcome attachment');
	return raw;
}

/** Changing these changes what every joiner receives, so it is HR's job, as
 *  sending the mail is. */
function requireHr(locals: App.Locals) {
	if (!locals.admin) error(401, 'Not authenticated');
	if (locals.admin.role !== 'super_admin' && locals.admin.role !== 'hr_admin')
		error(403, 'Only HR or a super admin can change the welcome mail attachments.');
	return locals.admin;
}

/** Superseded blobs go, but a failure to delete one must not fail the change
 *  that has already been recorded. */
async function dropBlob(id: string | undefined) {
	if (!id) return;
	await deleteFromGridFS(new ObjectId(id)).catch((e) =>
		console.error(`[welcome-attachments] could not delete blob ${id}:`, e)
	);
}

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.admin) error(401, 'Not authenticated');
	const slot = slotOf(params.slot);
	const meta = (await getWelcomeAttachments())[slot];
	if (!meta) error(404, 'Not uploaded yet');

	const stream = await getGridFSStream(new ObjectId(meta.gridfsId));
	const { Readable } = await import('node:stream');
	return new Response(Readable.toWeb(stream as unknown as import('node:stream').Readable) as ReadableStream, {
		headers: {
			'Content-Type': meta.mime,
			'Content-Disposition': `inline; filename="${meta.filename.replace(/[^\x20-\x7e]/g, '_')}"`,
			'Cache-Control': 'private, no-store'
		}
	});
};

export const POST: RequestHandler = async ({ params, request, locals, getClientAddress }) => {
	const admin = requireHr(locals);
	const slot = slotOf(params.slot);

	let form: FormData;
	try {
		form = await request.formData();
	} catch {
		error(400, 'Expected a multipart form with a file');
	}
	const file = form.get('file');
	if (!(file instanceof File) || file.size === 0) error(400, 'No file provided');
	if (file.size > WELCOME_ATTACHMENT_MAX_BYTES) error(400, 'File is larger than 10 MB');
	const mime = welcomeAttachmentMime(file);
	if (!mime) error(400, 'Only PDF, Word, Excel, PowerPoint, JPG or PNG files are accepted');

	const bytes = new Uint8Array(await file.arrayBuffer());
	if (!welcomeAttachmentBytesMatch(mime, bytes))
		error(400, 'File content does not match its type. Please upload the original document.');

	const label = WELCOME_ATTACHMENT_SLOTS.find((s) => s.key === slot)!.label;
	const ext = WELCOME_ATTACHMENT_TYPES[mime].ext;
	// The joiner sees this name in their mail client, so HR's own filename is
	// kept, given the right extension if it lacked one.
	let filename = cleanAttachmentName(file.name, `${label}.${ext}`);
	if (!filename.toLowerCase().endsWith(`.${ext}`) && !(ext === 'jpg' && /\.jpeg$/i.test(filename)))
		filename = `${filename}.${ext}`;

	const gridfsId = await uploadBytesToGridFS(bytes, `welcome/${slot}/${crypto.randomUUID()}.${ext}`, mime);
	const value = {
		gridfsId: String(gridfsId),
		filename,
		mime,
		sizeBytes: file.size,
		uploadedBy: admin.email,
		uploadedAt: new Date().toISOString()
	};
	const before = await setWelcomeAttachment(slot, value, admin.id);
	await dropBlob(before?.gridfsId);

	await audit({
		actor: admin.email,
		action: before ? 'welcome_attachment_replaced' : 'welcome_attachment_uploaded',
		field: slot,
		oldValue: before?.filename ?? null,
		newValue: filename,
		ip: getClientAddress()
	});

	return json({ slot, filename, sizeBytes: file.size, uploadedBy: admin.email, uploadedAt: value.uploadedAt });
};

export const DELETE: RequestHandler = async ({ params, locals, getClientAddress }) => {
	const admin = requireHr(locals);
	const slot = slotOf(params.slot);
	const before = await setWelcomeAttachment(slot, null, admin.id);
	if (!before) error(404, 'Not uploaded yet');
	await dropBlob(before.gridfsId);
	await audit({
		actor: admin.email,
		action: 'welcome_attachment_removed',
		field: slot,
		oldValue: before.filename,
		ip: getClientAddress()
	});
	return json({ removed: true });
};
