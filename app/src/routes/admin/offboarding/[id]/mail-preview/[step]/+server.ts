// The mail one exit step would send, composed but not sent — what HR reviews
// in the exit page's "Review & send" dialog before pressing Send. Built by the
// same functions the send uses, so the preview is exactly what goes.
//
// Steps: the chain's (manager, it, salesforce, payroll, letters) plus the
// mails HR sends outside it — `forms` (the employee's exit-forms link),
// `itblock` (the "block system access" mail) and `docs` (asking the employee
// for a document again: ?doc=signature&doc=…&note=…).
//
// An approver step with ?back=1 previews sending their signed clearance back:
// ?item=…&upload=…&note=… are what HR has ticked and typed so far.
import { error, json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { Exit } from '$lib/server/db/schema';
import { baseUrl } from '$lib/server/base-url';
import { brandBySlug } from '$lib/shared/brands';
import { EXIT_UPLOAD_DOCS, FLOW_STEPS, UPLOAD_REQUEST_PREFIX, type FlowStepKey } from '$lib/shared/offboarding';
import { exitCompany } from '$lib/server/offboarding/exit';
import { draftStep } from '$lib/server/offboarding/flow';
import { buildExitFormsMail, buildItExitMail } from '$lib/server/offboarding/mail';

export const config = { runtime: 'nodejs24.x' };

const clean = (v: string) => v.trim().slice(0, 300);

export const GET: RequestHandler = async ({ params, locals, url }) => {
	if (!locals.admin) error(401, 'Not authenticated');
	const q = url.searchParams;
	const note = clean(q.get('note') ?? '') || null;

	if (FLOW_STEPS.some((s) => s.key === params.step)) {
		const back = q.has('back')
			? {
					note,
					items: q.getAll('item').map(clean).filter(Boolean),
					uploads: q.getAll('upload').map(clean).filter(Boolean)
				}
			: null;
		const draft = await draftStep(params.id, params.step as FlowStepKey, back);
		if ('error' in draft) error(404, draft.error);
		return json(draft, { headers: { 'Cache-Control': 'private, no-store' } });
	}

	const exit = await Exit.findById(params.id).lean().catch(() => null);
	if (!exit) error(404, 'Offboarding record not found');
	const company = await exitCompany(exit.companyId);
	const brand = brandBySlug(company?.brandSlug ?? undefined);

	if (params.step === 'forms') {
		const mail = await buildExitFormsMail({
			to: exit.personalEmail,
			employeeName: exit.fullName,
			signoff: exit.routing?.signoff ?? null,
			lwd: exit.lwd ?? null,
			brand,
			url: `${baseUrl()}/x/«secure link created when you press Send»`
		});
		const closed = exit.status === 'completed';
		return json({
			...mail,
			key: 'forms',
			label: 'Employee exit forms',
			reminder: false,
			sendable: !closed && !!exit.personalEmail,
			why: closed ? 'This exit is closed — reopen it first.' : exit.personalEmail ? null : 'No personal email on the exit.',
			attachments: []
		});
	}

	if (params.step === 'docs') {
		const known = new Set<string>(EXIT_UPLOAD_DOCS.map((d) => d.docType));
		const docs = [...new Set(q.getAll('doc'))].filter((d) => known.has(d));
		const mail = await buildExitFormsMail({
			to: exit.personalEmail,
			employeeName: exit.fullName,
			signoff: exit.routing?.signoff ?? null,
			lwd: exit.lwd ?? null,
			brand,
			url: `${baseUrl()}/x/«secure link created when you press Send»`,
			changesRequested: docs.length
				? docs.map((d) => ({ field: `${UPLOAD_REQUEST_PREFIX}${d}`, note }))
				: [{ field: `${UPLOAD_REQUEST_PREFIX}…`, note }]
		});
		const why =
			exit.status === 'completed'
				? 'This exit is closed — reopen it first.'
				: exit.status === 'initiated'
					? 'Send the employee their forms link first.'
					: !docs.length
						? 'Tick at least one document.'
						: null;
		return json({
			...mail,
			key: 'docs',
			label: 'Ask the employee for documents',
			reminder: false,
			sendable: !why,
			why,
			attachments: []
		});
	}

	if (params.step === 'itblock') {
		const mail = await buildItExitMail({
			brand,
			employeeId: exit.employeeId,
			employeeName: exit.fullName,
			signoff: exit.routing?.signoff ?? null,
			lwd: exit.lwd ?? null,
			team: exit.department ?? exit.division ?? null,
			to: exit.routing?.itBlock?.to ?? null,
			cc: exit.routing?.itBlock?.cc ?? null
		});
		return json({
			to: mail.to,
			cc: mail.cc,
			subject: mail.subject,
			html: mail.html,
			text: mail.text,
			key: 'itblock',
			label: 'IT — block system access',
			reminder: !!exit.itAccessRevokedMailSentAt,
			sendable: true,
			why: mail.missing.length ? `Blank in the table: ${mail.missing.join(', ')}.` : null,
			attachments: []
		});
	}

	error(404, 'That step does not send a mail');
};
