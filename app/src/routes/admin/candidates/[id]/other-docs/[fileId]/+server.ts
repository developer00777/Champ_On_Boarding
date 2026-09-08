// One of HR's reference documents, streamed back. Never public — same RBAC and
// audit trail as the candidate's own documents (PRD §9).
import { error } from '@sveltejs/kit';
import { ObjectId } from 'mongodb';
import type { RequestHandler } from './$types';
import { CandidateFile } from '$lib/server/db/schema';
import { getGridFSStream } from '$lib/server/storage';
import { audit } from '$lib/server/audit';
import { extFor, safeFilename } from '$lib/server/uploads';

export const GET: RequestHandler = async ({ params, locals, getClientAddress }) => {
	if (!locals.admin) error(401, 'Not authenticated');

	// Scoped by candidate as well as id, so a file id from one record cannot be
	// read through another's URL.
	const doc = await CandidateFile.findOne({ _id: params.fileId, candidateId: params.id }).lean();
	if (!doc) error(404, 'Document not found');

	await audit({
		candidateId: params.id,
		actor: locals.admin!.email,
		action: 'reference_file_viewed',
		field: doc.label,
		ip: getClientAddress()
	});

	const stream = await getGridFSStream(doc.gridfsId as unknown as ObjectId);
	const { Readable } = await import('node:stream');
	const nodeReadable = stream as unknown as import('node:stream').Readable;

	// Named from HR's own label rather than "document.pdf", since a candidate can
	// have several of these and they are told apart by that label.
	const filename = `${safeFilename(doc.label)}.${extFor(doc.mime)}`;
	return new Response(Readable.toWeb(nodeReadable) as ReadableStream, {
		headers: {
			'Content-Type': doc.mime,
			'Content-Disposition': `inline; filename="${filename}"`,
			'Cache-Control': 'private, no-store'
		}
	});
};
