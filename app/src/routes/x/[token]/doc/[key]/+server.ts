// Lets the employee download their own exit documents as they stand — the same
// live-rendered PDFs HR sees, so both sides are looking at one document.
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { audit } from '$lib/server/audit';
import { loadPdfInput, renderExitDoc } from '$lib/server/offboarding/documents';
import { resolveExitToken } from '$lib/server/offboarding/exit';

export const config = { runtime: 'nodejs24.x' };

export const GET: RequestHandler = async ({ params, getClientAddress }) => {
	const resolved = await resolveExitToken(params.token, 'forms');
	if (!resolved) error(404, 'This exit link is invalid, expired, or has been revoked.');

	const input = await loadPdfInput(String(resolved.exit._id));
	if (!input) error(404, 'Exit record not found');

	// 'employee' is what enforces the release rule — the No Dues certificate is
	// internal, and the rest only unlock once HR has accepted the submission.
	// A 404 rather than a 403: the employee has no business knowing an internal
	// document exists for them to be refused.
	const rendered = await renderExitDoc(params.key, input, 'employee');
	if (!rendered) error(404, 'That document is not available on your exit link yet.');

	await audit({
		candidateId: resolved.exit.candidateId ? String(resolved.exit.candidateId) : null,
		actor: 'employee',
		action: 'exit_document_downloaded',
		field: params.key,
		ip: getClientAddress()
	});

	return new Response(rendered.bytes.slice().buffer, {
		headers: {
			'Content-Type': 'application/pdf',
			'Content-Disposition': `attachment; filename="${rendered.filename}"`,
			'Cache-Control': 'no-store'
		}
	});
};
