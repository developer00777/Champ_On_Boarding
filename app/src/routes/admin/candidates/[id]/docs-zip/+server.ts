// Streams all of a candidate's uploaded documents as a single ZIP archive.
// Available to HR admins for any candidate status — no employee code required.
import { error } from '@sveltejs/kit';

// Force Node.js runtime — PizZip + GridFS use Node APIs, incompatible with Edge
export const config = { runtime: 'nodejs24.x' };
import { ObjectId } from 'mongodb';
import type { RequestHandler } from './$types';
import { Candidate } from '$lib/server/db/schema';
import { Document } from '$lib/server/db/schema';
import { getGridFSBytes } from '$lib/server/storage';
import { audit } from '$lib/server/audit';
import PizZip from 'pizzip';

function ext(mime: string): string {
	const map: Record<string, string> = {
		'image/jpeg': 'jpg',
		'image/png': 'png',
		'application/pdf': 'pdf'
	};
	return map[mime] ?? 'bin';
}

function safeFilename(name: string): string {
	return name.replace(/[^a-zA-Z0-9 _\-().]/g, '').trim().replace(/\s+/g, '_');
}

export const GET: RequestHandler = async ({ params, locals, getClientAddress }) => {
	if (!locals.admin) error(401, 'Not authenticated');

	const candidate = await Candidate.findById(params.id).lean();
	if (!candidate) error(404, 'Candidate not found');

	const docs = await Document.find({ candidateId: params.id }).lean();
	if (docs.length === 0) error(404, 'No documents uploaded yet.');

	await audit({
		candidateId: params.id,
		actor: locals.admin!.email,
		action: 'documents_zip_downloaded',
		newValue: String(docs.length),
		ip: getClientAddress()
	});

	const zip = new PizZip();
	const counts: Record<string, number> = {};

	for (const doc of docs) {
		try {
			const bytes = await getGridFSBytes(doc.gridfsId as ObjectId);
			const base = safeFilename(doc.docType);
			counts[base] = (counts[base] ?? 0) + 1;
			const suffix = counts[base] > 1 ? `_${counts[base]}` : '';
			const filename = `${base}${suffix}.${ext(doc.mime)}`;
			zip.file(filename, Buffer.from(bytes));
		} catch (err) {
			console.error(`[docs-zip] failed to fetch doc ${doc._id}:`, err);
		}
	}

	const candidateSafe = safeFilename(candidate.fullName ?? candidate.email);
	const zipBuffer = zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });

	return new Response(new Uint8Array(zipBuffer), {
		headers: {
			'Content-Type': 'application/zip',
			'Content-Disposition': `attachment; filename="${candidateSafe}_documents.zip"`,
			'Cache-Control': 'private, no-store'
		}
	});
};
