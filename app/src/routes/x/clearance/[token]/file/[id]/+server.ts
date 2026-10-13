// One file of the exit, for payroll to open from their clearance page — the
// payslips and worksheet already on file, so they can see what they are
// replacing. Payroll's link only, and only a file of this exit.
import { error } from '@sveltejs/kit';
import { ObjectId } from 'mongodb';
import type { RequestHandler } from './$types';
import { ExitDocument } from '$lib/server/db/schema';
import { getGridFSBytes } from '$lib/server/storage';
import { resolveExitToken } from '$lib/server/offboarding/exit';
import { extFor, safeFilename } from '$lib/server/offboarding/documents';

export const config = { runtime: 'nodejs24.x' };

export const GET: RequestHandler = async ({ params }) => {
	const resolved = await resolveExitToken(params.token, 'clearance');
	if (!resolved?.clearance || resolved.clearance.department !== 'payroll')
		error(404, 'This link is invalid, expired, or has been revoked.');
	if (!ObjectId.isValid(params.id)) error(404, 'File not found');

	const file = await ExitDocument.findOne({ _id: params.id, exitId: resolved.exit._id }).lean();
	if (!file) error(404, 'File not found');
	const bytes = await getGridFSBytes(file.gridfsId as ObjectId).catch(() => null);
	if (!bytes) error(404, 'File content is no longer available');

	const name = `${safeFilename(String(file.docType))}.${extFor(String(file.mime))}`;
	return new Response(bytes.slice().buffer, {
		headers: {
			'Content-Type': String(file.mime),
			'Content-Disposition': `inline; filename="${name}"`,
			'Cache-Control': 'private, no-store'
		}
	});
};
