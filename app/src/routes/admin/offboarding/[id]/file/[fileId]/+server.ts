// Streams one uploaded exit file — an employee's signature image, their new
// employer's offer letter, or an HR-uploaded handover document — to HR.
import { error } from '@sveltejs/kit';
import { ObjectId } from 'mongodb';
import type { RequestHandler } from './$types';
import { ExitDocument } from '$lib/server/db/schema';
import { getGridFSBytes } from '$lib/server/storage';
import { audit } from '$lib/server/audit';
import { extFor, safeFilename } from '$lib/server/offboarding/documents';

export const config = { runtime: 'nodejs24.x' };

export const GET: RequestHandler = async ({ params, locals, getClientAddress, url }) => {
	if (!locals.admin) error(401, 'Not authenticated');

	const file = await ExitDocument.findOne({ _id: params.fileId, exitId: params.id }).lean();
	if (!file) error(404, 'File not found');

	const bytes = await getGridFSBytes(file.gridfsId as ObjectId).catch(() => null);
	if (!bytes) error(404, 'File content is no longer available');

	await audit({
		actor: locals.admin.email,
		action: 'exit_file_viewed',
		field: file.docType,
		ip: getClientAddress()
	});

	// `?download` forces a save; without it images render inline so HR can eyeball
	// a signature without leaving the page.
	const inline = !url.searchParams.has('download');
	const name = `${safeFilename(file.docType)}.${extFor(file.mime)}`;
	return new Response(bytes.slice().buffer, {
		headers: {
			'Content-Type': file.mime,
			'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="${name}"`,
			'Cache-Control': 'private, no-store'
		}
	});
};
