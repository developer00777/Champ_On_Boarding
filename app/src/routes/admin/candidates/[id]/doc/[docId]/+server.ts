import { error } from '@sveltejs/kit';
import { ObjectId } from 'mongodb';
import type { RequestHandler } from './$types';
import { Document } from '$lib/server/db/schema';
import { getGridFSStream } from '$lib/server/storage';
import { audit } from '$lib/server/audit';

// Documents are never public — streamed directly from GridFS after RBAC check (PRD §9).
export const GET: RequestHandler = async ({ params, locals, getClientAddress }) => {
	const doc = await Document.findOne({ _id: params.docId, candidateId: params.id }).lean();
	if (!doc) error(404, 'Document not found');

	await audit({
		candidateId: params.id,
		actor: locals.admin!.email,
		action: 'document_viewed',
		field: doc.docType,
		ip: getClientAddress()
	});

	const stream = await getGridFSStream(doc.gridfsId as ObjectId);
	const { Readable } = await import('node:stream');
	const nodeReadable = stream as unknown as NodeJS.ReadableStream;

	return new Response(Readable.toWeb(nodeReadable as import('node:stream').Readable) as ReadableStream, {
		headers: {
			'Content-Type': doc.mime,
			'Content-Disposition': `inline; filename="document.${doc.mime.split('/')[1]}"`,
			'Cache-Control': 'private, no-store'
		}
	});
};
