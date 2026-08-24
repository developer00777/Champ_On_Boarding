// One generated exit document, rendered live on every request.
//
// Nothing is cached: HR asked to be able to pull a current copy at any instant,
// so a clearance signed a minute ago is in the next download.
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { audit } from '$lib/server/audit';
import { loadPdfInput, renderExitDoc } from '$lib/server/offboarding/documents';

export const config = { runtime: 'nodejs24.x' };

export const GET: RequestHandler = async ({ params, locals, getClientAddress }) => {
	// Any signed-in admin may download, matching every onboarding download
	// endpoint (candidate documents, docs-zip, the payroll report, offer
	// letters) — all of which gate on `locals.admin` alone. That means
	// finance_team, which is view-only for mutations, can read exit documents
	// including the exit-interview transcript. If HR wants those restricted,
	// it should be decided for onboarding and offboarding together rather than
	// diverging here.
	if (!locals.admin) error(401, 'Not authenticated');

	const input = await loadPdfInput(params.id);
	if (!input) error(404, 'Offboarding record not found');

	const rendered = await renderExitDoc(params.key, input);
	if (!rendered) error(404, 'That document does not apply to this exit');

	await audit({
		candidateId: input.exit.candidateId ? String(input.exit.candidateId) : null,
		actor: locals.admin.email,
		action: 'exit_document_downloaded',
		field: params.key,
		newValue: String(input.exit.fullName ?? ''),
		ip: getClientAddress()
	});

	// Copy into a standalone ArrayBuffer — an unambiguous binary BodyInit that is
	// never JSON-serialised by a runtime.
	return new Response(rendered.bytes.slice().buffer, {
		headers: {
			'Content-Type': 'application/pdf',
			'Content-Disposition': `attachment; filename="${rendered.filename}"`,
			'Cache-Control': 'no-store'
		}
	});
};
