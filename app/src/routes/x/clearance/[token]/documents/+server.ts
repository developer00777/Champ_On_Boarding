// Payroll's documents zip, from their clearance page: every exit document but
// the letters, and every file uploaded against the exit — the same pack their
// mail carries, fetched fresh so it includes anything added since. Token-gated
// like the page itself; only the payroll clearance link reaches it, since the
// other approvers sign one section and have no use for the rest.
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { audit } from '$lib/server/audit';
import { resolveExitToken } from '$lib/server/offboarding/exit';
import { exitPackZip } from '$lib/server/offboarding/documents';

export const config = { runtime: 'nodejs24.x' };

export const GET: RequestHandler = async ({ params, getClientAddress }) => {
	const resolved = await resolveExitToken(params.token, 'clearance');
	if (!resolved?.clearance || resolved.clearance.department !== 'payroll')
		error(404, 'This link is invalid, expired, or has been revoked.');
	const { exit, clearance } = resolved;

	const pack = await exitPackZip(String(exit._id), { includeUploads: true, includeHandover: true, skipLetters: true });
	if (!pack) error(404, 'Nothing to download for this exit.');

	await audit({
		candidateId: exit.candidateId ? String(exit.candidateId) : null,
		actor: clearance.approverEmail ?? 'payroll',
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
