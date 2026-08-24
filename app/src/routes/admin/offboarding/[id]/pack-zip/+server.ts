// The whole exit pack as a ZIP: every applicable generated document plus the
// files uploaded by the employee and by HR. This is the "download all live docs
// at any instant for physical keeping" path.
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { Exit } from '$lib/server/db/schema';
import { audit } from '$lib/server/audit';
import { exitPackZip } from '$lib/server/offboarding/documents';

export const config = { runtime: 'nodejs24.x' };

export const GET: RequestHandler = async ({ params, locals, getClientAddress }) => {
	if (!locals.admin) error(401, 'Not authenticated');

	const exit = await Exit.findById(params.id).lean();
	if (!exit) error(404, 'Offboarding record not found');

	const pack = await exitPackZip(params.id, { includeUploads: true, includeHandover: true });
	if (!pack) error(404, 'Nothing to download for this exit');

	await audit({
		candidateId: exit.candidateId ? String(exit.candidateId) : null,
		actor: locals.admin.email,
		action: 'exit_pack_downloaded',
		field: exit.employeeId,
		ip: getClientAddress()
	});

	return new Response(pack.bytes.slice().buffer, {
		headers: {
			'Content-Type': 'application/zip',
			'Content-Disposition': `attachment; filename="${pack.filename}"`,
			'Cache-Control': 'private, no-store'
		}
	});
};
