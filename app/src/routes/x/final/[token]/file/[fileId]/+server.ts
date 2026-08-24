// Streams one handover document to the ex-employee.
import { error } from '@sveltejs/kit';
import { ObjectId } from 'mongodb';
import type { RequestHandler } from './$types';
import { ExitDocument } from '$lib/server/db/schema';
import { getGridFSBytes } from '$lib/server/storage';
import { audit } from '$lib/server/audit';
import { extFor, safeFilename } from '$lib/server/offboarding/documents';
import { resolveExitToken } from '$lib/server/offboarding/exit';

export const config = { runtime: 'nodejs24.x' };

export const GET: RequestHandler = async ({ params, getClientAddress }) => {
	const resolved = await resolveExitToken(params.token, 'handover');
	if (!resolved) error(404, 'This link is invalid or has expired.');

	// Scoped to this exit, so a token can never reach another employee's files.
	const file = await ExitDocument.findOne({
		_id: params.fileId,
		exitId: resolved.exit._id,
		source: 'hr'
	}).lean();
	if (!file) error(404, 'Document not found');

	const bytes = await getGridFSBytes(file.gridfsId as ObjectId).catch(() => null);
	if (!bytes) error(404, 'Document content is no longer available');

	await audit({
		candidateId: resolved.exit.candidateId ? String(resolved.exit.candidateId) : null,
		actor: 'employee',
		action: 'exit_handover_file_downloaded',
		field: file.docType,
		ip: getClientAddress()
	});

	const stem = safeFilename(String(resolved.exit.fullName ?? 'document'));
	return new Response(bytes.slice().buffer, {
		headers: {
			'Content-Type': file.mime,
			'Content-Disposition': `attachment; filename="${stem}_${safeFilename(file.docType)}.${extFor(file.mime)}"`,
			'Cache-Control': 'private, no-store'
		}
	});
};
