// The exit workspace: one page carrying an exit from resignation to closure.
//
// Ordered by the SOP's steps, and each action is one step of it:
//   saveParticulars   step 2   confirm LWD + the employment details the forms print
//   sendFormsLink     step 5   email the employee their exit-documents link
//   requestChanges    step 5   send them back to specific fields
//   acceptSubmission  step 7   accept the submission and open the clearance round
//   sendClearances    step 7   email each approver their clearance link
//   remindClearance   step 7   nudge one approver
//   sendItBlockMail   step 5   the "block system access" mail to IT
//   saveFnf           step 8   the payroll / F&F / PF / taxation block
//   saveClosure       step 10  the exit-completion checklist
//   sendHandover      step 9   the final documents link, ~30-45 days after LWD
import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { Admin, Exit, ExitClearance, ExitDocument, ExitToken } from '$lib/server/db/schema';
import { audit } from '$lib/server/audit';
import { brandBySlug } from '$lib/shared/brands';
import { baseUrl } from '$lib/server/base-url';
import { isValidEmail, isValidMobile, titleCase } from '$lib/shared/validation';
import { isoToDDMMYYYY, toIsoDate } from '$lib/shared/dates';
import {
	CLEARANCE_DEPT_LABELS,
	CLOSURE_CHECKLIST_KEYS,
	EXIT_UPLOAD_DOCS,
	HANDOVER_DOCS,
	NDC_SECTIONS,
	type ClearanceDept
} from '$lib/shared/offboarding';
import {
	allFormsComplete,
	asBoolRecord,
	asRecord,
	clearanceProgress,
	createExitToken,
	exitCompany,
	exitTokenUrl,
	formStates,
	gratuityApplicable,
	liveExitToken,
	ndcState,
	serviceLabel,
	upsertClearances
} from '$lib/server/offboarding/exit';
import { availableDocs, loadPdfInput } from '$lib/server/offboarding/documents';
import { noDuesPdf } from '$lib/server/offboarding/pdf';
import {
	buildItExitMail,
	getExitMailSettings,
	sendClearanceMail,
	sendExitFormsMail,
	sendHandoverMail,
	sendItExitMail
} from '$lib/server/offboarding/mail';

/** Every failure on this page returns the same shape, so the Svelte side can
 *  read `form?.particularsError` (and friends) without TypeScript narrowing the
 *  key away on the branches that don't set it. `section` names which block
 *  should show the message inline; null means the page-level banner. */
type Section = 'particulars' | 'changes' | 'clearance' | 'handover' | null;

function no(status: number, message: string, section: Section = null) {
	return fail(status, {
		message,
		particularsError: section === 'particulars',
		changesError: section === 'changes',
		clearanceError: section === 'clearance',
		handoverError: section === 'handover'
	});
}

function requireHr(locals: App.Locals) {
	if (locals.admin?.role !== 'super_admin' && locals.admin?.role !== 'hr_admin')
		return no(403, 'Only HR or a super admin can do this.');
	return null;
}

/** Fetch + guard, returning null rather than throwing so `load` can 404 and the
 *  actions can `fail(404)` off the same helper. */
async function getExit(id: string) {
	const exit = await Exit.findById(id).lean().catch(() => null);
	if (!exit) return null;
	const company = await exitCompany(exit.companyId);
	return { exit, company };
}

/** The particulars HR can edit on the exit record, and how each is cleaned. */
const PARTICULAR_FIELDS = {
	fullName: titleCase,
	personalEmail: (v: string) => v.toLowerCase(),
	personalMobile: (v: string) => v,
	designation: (v: string) => v,
	department: (v: string) => v,
	division: (v: string) => v,
	reportingManager: titleCase,
	uanNo: (v: string) => v,
	panNo: (v: string) => v.toUpperCase(),
	bankAccountName: titleCase,
	noticePeriod: (v: string) => v
} as const;

const FNF_FIELDS = [
	'salaryDueFrom', 'salaryDueTo', 'leaveBalanceDays', 'leaveEncashmentAmount',
	'noticePayRecovery', 'assetRecovery', 'otherDeductions', 'netAmount',
	'settlementDate', 'approvedBy', 'pfDateOfExit', 'pfRemarks', 'taxationRemarks'
] as const;

/** Dates in the F&F block are stored DD/MM/YYYY like every other date here, so
 *  the ones backed by a date input need converting on the way in. */
const FNF_DATE_FIELDS = new Set(['salaryDueFrom', 'salaryDueTo', 'settlementDate', 'pfDateOfExit']);

export const load: PageServerLoad = async ({ params, locals }) => {
	const row = await getExit(params.id);
	if (!row) error(404, 'Offboarding record not found');
	const { exit, company } = row;
	const brand = brandBySlug(company?.brandSlug ?? undefined);

	const [clearances, files, formsToken, handoverToken] = await Promise.all([
		ExitClearance.find({ exitId: params.id }).lean(),
		ExitDocument.find({ exitId: params.id }).lean(),
		liveExitToken(params.id, 'forms'),
		liveExitToken(params.id, 'handover')
	]);

	// Each clearance's own live link, so HR can copy one out of band when an
	// approver says the email never arrived.
	const clearanceTokens = await Promise.all(
		clearances.map((c) => liveExitToken(params.id, 'clearance', String(c._id)))
	);

	const mailSettings = await getExitMailSettings();
	const e = exit as unknown as Record<string, any>;

	return {
		exit: {
			id: String(exit._id),
			candidateId: exit.candidateId ? String(exit.candidateId) : null,
			companyName: company?.name ?? brand.legalName,
			brandSlug: brand.slug,
			employeeId: exit.employeeId,
			fullName: exit.fullName,
			personalEmail: exit.personalEmail,
			personalMobile: exit.personalMobile ?? null,
			resignationDate: exit.resignationDate,
			resignationDateIso: toIsoDate(exit.resignationDate),
			lwd: exit.lwd ?? null,
			lwdIso: toIsoDate(exit.lwd),
			noticePeriod: exit.noticePeriod ?? null,
			separationType: exit.separationType ?? 'voluntary',
			doj: exit.doj ?? null,
			dojIso: toIsoDate(exit.doj),
			designation: exit.designation ?? null,
			department: exit.department ?? null,
			division: exit.division ?? null,
			reportingManager: exit.reportingManager ?? null,
			uanNo: exit.uanNo ?? null,
			panNo: exit.panNo ?? null,
			bankAccountName: exit.bankAccountName ?? null,
			status: exit.status,
			service: serviceLabel(exit.doj, exit.lwd),
			submittedAt: exit.submittedAt?.toISOString() ?? null,
			reviewedAt: exit.reviewedAt?.toISOString() ?? null,
			completedAt: exit.completedAt?.toISOString() ?? null,
			consentAt: exit.consentAt?.toISOString() ?? null,
			itAccessRevokedMailSentAt: exit.itAccessRevokedMailSentAt?.toISOString() ?? null,
			handoverMailSentAt: exit.handoverMailSentAt?.toISOString() ?? null,
			recommendationApplicable: !!exit.recommendationApplicable,
			requestedFields: (exit.requestedFields ?? []).map(
				(r: { field: string; note?: string | null }) => ({ field: r.field, note: r.note ?? null })
			),
			// The four form payloads, as plain objects for the review panel. Maps
			// come back differently from .lean() than from a hydrated doc, so every
			// Map field goes through asRecord.
			// rows/rowNotes are Map fields — see the note above; .lean() does not
			// hand them back as plain objects reliably, so both go through asRecord.
			ndc: {
				...(e.ndc ?? {}),
				rows: asRecord(e.ndc?.rows),
				rowNotes: asRecord(e.ndc?.rowNotes)
			},
			nda: {
				...(e.nda ?? {}),
				// The number itself is never sent to the browser — only its last four,
				// exactly as the onboarding side handles Aadhaar.
				aadhaarNoEncrypted: undefined,
				aadhaarLast4: e.nda?.aadhaarLast4 ?? null
			},
			exitInterview: {
				...(e.exitInterview ?? {}),
				q11Supervisor: asRecord(e.exitInterview?.q11Supervisor),
				q12Ratings: asRecord(e.exitInterview?.q12Ratings),
				q13Benefits: asRecord(e.exitInterview?.q13Benefits)
			},
			relievingFormalities: e.relievingFormalities ?? {},
			gratuity: e.gratuity ?? {},
			assets: (e.assets ?? []).map((a: Record<string, unknown>) => ({
				item: a.item,
				returned: !!a.returned,
				note: a.note ?? null
			})),
			fnf: e.fnf ?? {},
			closureChecklist: asBoolRecord(e.closureChecklist)
		},
		forms: formStates(e),
		formsComplete: allFormsComplete(e),
		documents: availableDocs(e),
		// Whether service length says gratuity applies, so HR sees the computed
		// answer next to their own override rather than only the stored flag.
		gratuityComputed: gratuityApplicable(exit.doj, exit.lwd),
		formsLink: exitTokenUrl(formsToken),
		formsLinkExpires: formsToken?.expiresAt?.toISOString() ?? null,
		formsLinkOpened: formsToken?.openedAt?.toISOString() ?? null,
		handoverLink: exitTokenUrl(handoverToken),
		clearances: clearances.map((c, i) => ({
			id: String(c._id),
			department: c.department as ClearanceDept,
			label: CLEARANCE_DEPT_LABELS[c.department as ClearanceDept] ?? c.department,
			approverName: c.approverName ?? null,
			approverEmail: c.approverEmail,
			approverDesignation: c.approverDesignation ?? null,
			status: c.status,
			verdict: c.verdict ?? null,
			remarks: c.remarks ?? null,
			rows: asRecord(c.rows),
			rowRemarks: asRecord(c.rowRemarks),
			hasSignature: !!c.signatureGridfsId,
			sentAt: c.sentAt?.toISOString() ?? null,
			sentCount: c.sentCount ?? 0,
			completedAt: c.completedAt?.toISOString() ?? null,
			link: exitTokenUrl(clearanceTokens[i])
		})),
		clearanceProgress: clearanceProgress(clearances.map((c) => ({ status: String(c.status) }))),
		ndcSections: NDC_SECTIONS.map((s) => ({
			dept: s.dept,
			label: s.label,
			signatory: s.signatory,
			optional: s.optional,
			rows: s.rows.map((r) => ({ key: r.key, label: r.label }))
		})),
		ndcState: ndcState(clearances as unknown as Record<string, unknown>[]),
		employeeFiles: files
			.filter((f) => f.source === 'employee')
			.map((f) => ({
				id: String(f._id),
				docType: f.docType,
				label: f.label ?? f.docType,
				mime: f.mime,
				sizeBytes: f.sizeBytes,
				reviewStatus: f.reviewStatus,
				createdAt: (f as unknown as { createdAt: Date }).createdAt.toISOString()
			})),
		handoverFiles: files
			.filter((f) => f.source === 'hr')
			.map((f) => ({
				id: String(f._id),
				docType: f.docType,
				label: f.label ?? f.docType,
				mime: f.mime,
				sizeBytes: f.sizeBytes,
				createdAt: (f as unknown as { createdAt: Date }).createdAt.toISOString()
			})),
		handoverSlots: HANDOVER_DOCS.map((d) => ({
			docType: d.docType,
			label: d.label,
			applicableWhen: d.applicableWhen
		})),
		uploadSlots: EXIT_UPLOAD_DOCS.map((d) => ({
			docType: d.docType,
			label: d.label,
			mandatory: d.mandatory
		})),
		itMailRecipients: { to: mailSettings.itTo, cc: mailSettings.itCc },
		isHr: locals.admin?.role === 'super_admin' || locals.admin?.role === 'hr_admin',
		isSuperAdmin: locals.admin?.role === 'super_admin'
	};
};

export const actions: Actions = {
	/** SOP step 2 — HR confirms the LWD and the employment particulars the exit
	 *  documents print. Everything here is HR's to correct at any stage. */
	saveParticulars: async ({ params, request, locals, getClientAddress }) => {
		const forbidden = requireHr(locals);
		if (forbidden) return forbidden;
		const row = await getExit(params.id);
		if (!row) return no(404, 'Offboarding record not found.');

		const form = await request.formData();
		const get = (k: string) => String(form.get(k) ?? '').trim();

		const patch: Record<string, string | null> = {};
		for (const [field, clean] of Object.entries(PARTICULAR_FIELDS)) {
			const raw = get(field);
			patch[field] = raw ? clean(raw) : null;
		}
		const errors: string[] = [];
		if (!patch.fullName) errors.push('Employee name is required.');
		if (!patch.personalEmail) errors.push('Personal email is required.');
		else if (!isValidEmail(patch.personalEmail)) errors.push('Enter a valid personal email address.');
		if (patch.personalMobile && !isValidMobile(patch.personalMobile))
			errors.push('Mobile number must be 10 digits starting 6-9.');
		if (errors.length) return no(400, errors.join(' '), 'particulars');

		const doj = isoToDDMMYYYY(get('doj')) || null;
		const lwd = isoToDDMMYYYY(get('lwd')) || null;
		const resignationDate = isoToDDMMYYYY(get('resignationDate')) || row.exit.resignationDate;
		const separationType = get('separationType') === 'involuntary' ? 'involuntary' : 'voluntary';
		const gratuityOverride = get('gratuityApplicable');

		// The computed answer is the default; HR's explicit choice wins, because
		// the SOP's rule has edge cases (leave without pay, a re-hire's earlier
		// stint) that a date subtraction cannot see.
		const computed = gratuityApplicable(doj, lwd);
		const applicable =
			gratuityOverride === 'yes' ? true : gratuityOverride === 'no' ? false : computed === true;

		await Exit.findByIdAndUpdate(params.id, {
			...patch,
			doj,
			lwd,
			resignationDate,
			separationType,
			recommendationApplicable: get('recommendationApplicable') === 'on',
			'gratuity.applicable': applicable
		});

		// One audit row per changed field, the way setItMailFields does it, so the
		// trail says what moved rather than only that something did.
		const before = row.exit as unknown as Record<string, string | null>;
		const audited: Record<string, string | null> = {
			...patch,
			doj,
			lwd,
			resignationDate,
			separationType,
			// Stringified so they diff against the stored values the same way the
			// text fields do. Gratuity especially: it decides whether a Form I is
			// generated at all, so an untraced flip is exactly what an audit log
			// is for.
			recommendationApplicable: String(get('recommendationApplicable') === 'on'),
			'gratuity.applicable': String(applicable)
		};
		const beforeFlags: Record<string, string | null> = {
			separationType: (row.exit.separationType as string | null) ?? null,
			recommendationApplicable: String(!!row.exit.recommendationApplicable),
			'gratuity.applicable': String(
				!!(row.exit as unknown as { gratuity?: { applicable?: boolean } }).gratuity?.applicable
			)
		};
		for (const [field, value] of Object.entries(audited)) {
			const old = field in beforeFlags ? beforeFlags[field] : (before[field] ?? null);
			if (old === value) continue;
			await audit({
				candidateId: row.exit.candidateId ? String(row.exit.candidateId) : null,
				actor: locals.admin!.email,
				action: 'exit_particulars_set',
				field,
				oldValue: old,
				newValue: value,
				ip: getClientAddress()
			});
		}

		return { particularsSaved: true };
	},

	/** SOP step 5 — mint (or re-mint) the employee's exit-forms link and email
	 *  it. Re-sending revokes the previous link, so a forwarded old URL dies. */
	sendFormsLink: async ({ params, locals, getClientAddress }) => {
		const forbidden = requireHr(locals);
		if (forbidden) return forbidden;
		const row = await getExit(params.id);
		if (!row) return no(404, 'Offboarding record not found.');
		const { exit, company } = row;
		if (exit.status === 'completed')
			return no(409, 'This exit is closed - reopen it before sending a new link.');

		const brand = brandBySlug(company?.brandSlug ?? undefined);
		const token = await createExitToken(params.id, 'forms');
		const url = `${baseUrl()}/x/${token}`;

		try {
			await sendExitFormsMail({
				exitId: params.id,
				to: exit.personalEmail,
				employeeName: exit.fullName,
				lwd: exit.lwd ?? null,
				brand,
				url
			});
		} catch (e) {
			console.error('[exit] forms link send failed:', e);
			return no(502, 'The mail provider rejected the send. Check the address and try again.');
		}

		// Only advance the stage from the pre-link states: an employee already
		// filling the form must not be knocked back to link_sent by a re-send.
		if (exit.status === 'initiated' || exit.status === 'link_sent') {
			await Exit.findByIdAndUpdate(params.id, { status: 'link_sent' });
		}

		await audit({
			candidateId: exit.candidateId ? String(exit.candidateId) : null,
			actor: locals.admin!.email,
			action: 'exit_forms_link_sent',
			field: exit.personalEmail,
			ip: getClientAddress()
		});

		return { formsLinkSent: true, url };
	},

	/** Revokes the employee's live forms link without sending anything. */
	revokeFormsLink: async ({ params, locals, getClientAddress }) => {
		const forbidden = requireHr(locals);
		if (forbidden) return forbidden;
		await ExitToken.updateMany({ exitId: params.id, purpose: 'forms', revoked: false }, { revoked: true });
		await audit({
			actor: locals.admin!.email,
			action: 'exit_forms_link_revoked',
			field: params.id,
			ip: getClientAddress()
		});
		return { formsLinkRevoked: true };
	},

	/** SOP step 5 — HR reviewed the submission and needs specific fields again.
	 *  The employee's link is reissued and the mail names exactly what to fix. */
	requestChanges: async ({ params, request, locals, getClientAddress }) => {
		const forbidden = requireHr(locals);
		if (forbidden) return forbidden;
		const row = await getExit(params.id);
		if (!row) return no(404, 'Offboarding record not found.');
		const { exit, company } = row;

		// Sending fields back re-opens the forms to the employee, so it must not be
		// reachable from a stage where the exit is already settled or closed —
		// that would re-open a finished exit and put it back on the "waiting on
		// employee" list with its completedAt still set. A super admin reopens a
		// closed exit explicitly (see `reopen`) before correcting anything.
		if (!['link_sent', 'in_progress', 'submitted', 'changes_requested'].includes(exit.status))
			return no(
				409,
				exit.status === 'completed'
					? 'This exit is closed. Reopen it before asking the employee for changes.'
					: exit.status === 'initiated'
						? 'Send the employee their exit forms link first — there is nothing to send back yet.'
						: `Clearances are already under way (status "${exit.status}") — sending the forms back now ` +
								'would invalidate signatures already collected.',
				'changes'
			);

		const form = await request.formData();
		// The UI posts one `field` entry per checked item plus a shared note.
		const fields = form.getAll('field').map((f) => String(f)).filter(Boolean);
		const note = String(form.get('note') ?? '').trim() || null;
		if (!fields.length)
			return no(400, 'Tick at least one item to send back.', 'changes');

		const requested = fields.map((field) => ({ field, note }));
		const token = await createExitToken(params.id, 'forms');
		const url = `${baseUrl()}/x/${token}`;
		const brand = brandBySlug(company?.brandSlug ?? undefined);

		try {
			await sendExitFormsMail({
				exitId: params.id,
				to: exit.personalEmail,
				employeeName: exit.fullName,
				lwd: exit.lwd ?? null,
				brand,
				url,
				changesRequested: requested
			});
		} catch (e) {
			console.error('[exit] change request send failed:', e);
			return no(502, 'The mail provider rejected the send. Try again.');
		}

		await Exit.findByIdAndUpdate(params.id, {
			status: 'changes_requested',
			requestedFields: requested
		});
		await audit({
			candidateId: exit.candidateId ? String(exit.candidateId) : null,
			actor: locals.admin!.email,
			action: 'exit_changes_requested',
			field: fields.join(', '),
			newValue: note,
			ip: getClientAddress()
		});

		return { changesRequested: true };
	},

	/** SOP step 7 — HR accepts the employee's submission, which is what opens the
	 *  clearance round. Deliberately separate from sending the clearance emails:
	 *  accepting is a judgement, sending is a mechanical follow-up, and HR may
	 *  want to fix an approver address in between. */
	acceptSubmission: async ({ params, locals, getClientAddress }) => {
		const forbidden = requireHr(locals);
		if (forbidden) return forbidden;
		const row = await getExit(params.id);
		if (!row) return no(404, 'Offboarding record not found.');
		const { exit } = row;
		if (!['submitted', 'changes_requested', 'in_progress'].includes(exit.status))
			return no(409, `Nothing to accept - this exit is at "${exit.status}".`);

		await Exit.findByIdAndUpdate(params.id, {
			status: 'clearances',
			reviewedAt: new Date(),
			reviewedBy: locals.admin!.id,
			requestedFields: []
		});
		await audit({
			candidateId: exit.candidateId ? String(exit.candidateId) : null,
			actor: locals.admin!.email,
			action: 'exit_submission_accepted',
			ip: getClientAddress()
		});
		return { accepted: true };
	},

	/** SOP step 7 — save the approver list and email each of them their
	 *  clearance link. Re-running only mails the ones still outstanding, so this
	 *  doubles as "send the rest" after adding a department. */
	sendClearances: async ({ params, request, locals, getClientAddress }) => {
		const forbidden = requireHr(locals);
		if (forbidden) return forbidden;
		const row = await getExit(params.id);
		if (!row) return no(404, 'Offboarding record not found.');
		const { exit, company } = row;

		// The employee has to have declared their handover before anyone can clear
		// it: requesting clearances from a fresh exit would mail every approver a
		// blank No-Dues certificate to sign off. `acceptSubmission` is the gate
		// that opens this round, so only stages at or past it qualify.
		if (!['submitted', 'changes_requested', 'clearances', 'cleared', 'fnf'].includes(exit.status))
			return no(
				409,
				exit.status === 'completed'
					? 'This exit is closed — reopen it before requesting clearances again.'
					: 'The employee has not submitted their exit documents yet. Accept their submission first, ' +
							'or the approvers would be asked to sign a blank certificate.',
				'clearance'
			);

		const form = await request.formData();
		const approvers: {
			department: ClearanceDept;
			email: string;
			name?: string | null;
			designation?: string | null;
		}[] = [];
		const errors: string[] = [];

		for (const section of NDC_SECTIONS) {
			const email = String(form.get(`email_${section.dept}`) ?? '').trim().toLowerCase();
			// An optional section is only in scope when HR ticks it; a blank address
			// on any section simply means "not this one".
			if (!email) continue;
			if (!isValidEmail(email)) {
				errors.push(`${section.label}: "${email}" is not a valid email address.`);
				continue;
			}
			approvers.push({
				department: section.dept,
				email,
				name: String(form.get(`name_${section.dept}`) ?? '').trim() || null,
				designation: String(form.get(`designation_${section.dept}`) ?? '').trim() || null
			});
		}
		if (errors.length) return no(400, errors.join(' '), 'clearance');
		if (!approvers.length)
			return no(400, 'Add at least one approver email before requesting clearances.', 'clearance');

		// Skips departments whose clearance is already signed: their approver name
		// is printed beside a stored signature on the certificate, and overwriting
		// it from the form would caption one person's signature with another's.
		const signed = new Set(
			(await ExitClearance.find({ exitId: params.id, status: 'completed' }).select('department').lean())
				.map((c) => String(c.department))
		);
		await upsertClearances(
			params.id,
			approvers.filter((a) => !signed.has(a.department))
		);

		const brand = brandBySlug(company?.brandSlug ?? undefined);
		// The certificate as it currently stands travels with every request, so an
		// approver can see what they are signing without opening the link.
		let attachment;
		try {
			const input = await loadPdfInput(params.id);
			if (input) {
				const bytes = await noDuesPdf(input);
				attachment = [{ filename: `No-Dues-${exit.employeeId}.pdf`, content: Buffer.from(bytes) }];
			}
		} catch (e) {
			// A failed render must not stop the clearance request going out.
			console.error('[exit] NDC attachment render failed:', e);
		}

		const rows = await ExitClearance.find({ exitId: params.id });
		const sent: string[] = [];
		const failed: string[] = [];
		for (const c of rows) {
			if (c.status === 'completed') continue;
			const token = await createExitToken(params.id, 'clearance', String(c._id));
			const url = `${baseUrl()}/x/clearance/${token}`;
			try {
				await sendClearanceMail({
					to: c.approverEmail,
					approverName: c.approverName ?? null,
					department: c.department as ClearanceDept,
					employeeName: exit.fullName,
					employeeId: exit.employeeId,
					lwd: exit.lwd ?? null,
					brand,
					url,
					attachments: attachment
				});
				c.status = 'sent';
				c.sentAt = new Date();
				c.sentCount = (c.sentCount ?? 0) + 1;
				await c.save();
				sent.push(c.department as string);
			} catch (e) {
				console.error(`[exit] clearance send failed for ${c.department}:`, e);
				failed.push(c.department as string);
			}
		}

		// Only move an exit forward into the clearance round — never pull one that
		// has already cleared, reached F&F, or closed back to 'clearances'.
		if (['submitted', 'changes_requested'].includes(exit.status)) {
			await Exit.findByIdAndUpdate(params.id, { status: 'clearances' });
		}

		await audit({
			candidateId: exit.candidateId ? String(exit.candidateId) : null,
			actor: locals.admin!.email,
			action: 'exit_clearances_sent',
			field: sent.join(', ') || undefined,
			ip: getClientAddress()
		});

		if (failed.length && !sent.length)
			return no(502, `The mail provider rejected every clearance request (${failed.join(', ')}).`, 'clearance');
		return { clearancesSent: sent.length, clearancesFailed: failed };
	},

	/** Nudge one approver whose clearance is still outstanding. */
	remindClearance: async ({ params, request, locals, getClientAddress }) => {
		const forbidden = requireHr(locals);
		if (forbidden) return forbidden;
		const row = await getExit(params.id);
		if (!row) return no(404, 'Offboarding record not found.');
		const { exit, company } = row;

		const clearanceId = String((await request.formData()).get('clearanceId') ?? '');
		const c = await ExitClearance.findOne({ _id: clearanceId, exitId: params.id });
		if (!c) return no(404, 'Clearance not found.');
		if (c.status === 'completed')
			return no(409, 'That clearance is already signed.');

		const token = await createExitToken(params.id, 'clearance', String(c._id));
		try {
			await sendClearanceMail({
				to: c.approverEmail,
				approverName: c.approverName ?? null,
				department: c.department as ClearanceDept,
				employeeName: exit.fullName,
				employeeId: exit.employeeId,
				lwd: exit.lwd ?? null,
				brand: brandBySlug(company?.brandSlug ?? undefined),
				url: `${baseUrl()}/x/clearance/${token}`,
				reminder: true
			});
		} catch (e) {
			console.error('[exit] clearance reminder failed:', e);
			return no(502, 'The mail provider rejected the reminder. Try again.');
		}
		c.sentAt = new Date();
		c.sentCount = (c.sentCount ?? 0) + 1;
		await c.save();
		await audit({
			actor: locals.admin!.email,
			action: 'exit_clearance_reminded',
			field: `${c.department} <${c.approverEmail}>`,
			ip: getClientAddress()
		});
		return { reminded: true, department: c.department };
	},

	/** Drops a clearance HR no longer needs (e.g. Salesforce for a non-sales
	 *  employee added by mistake). Its section then disappears from the live
	 *  certificate, because ndcState only prints sections that have a row. */
	removeClearance: async ({ params, request, locals, getClientAddress }) => {
		const forbidden = requireHr(locals);
		if (forbidden) return forbidden;
		const clearanceId = String((await request.formData()).get('clearanceId') ?? '');
		const c = await ExitClearance.findOne({ _id: clearanceId, exitId: params.id }).lean();
		if (!c) return no(404, 'Clearance not found.');
		await ExitToken.deleteMany({ exitId: params.id, purpose: 'clearance', clearanceId });
		await ExitClearance.deleteOne({ _id: clearanceId });
		await audit({
			actor: locals.admin!.email,
			action: 'exit_clearance_removed',
			field: String(c.department),
			ip: getClientAddress()
		});
		return { clearanceRemoved: true };
	},

	/** SOP step 5 — the "block the system access" mail to the IT desk. */
	sendItBlockMail: async ({ params, locals, getClientAddress }) => {
		const forbidden = requireHr(locals);
		if (forbidden) return forbidden;
		const row = await getExit(params.id);
		if (!row) return no(404, 'Offboarding record not found.');
		const { exit, company } = row;

		try {
			await sendItExitMail({
				brand: brandBySlug(company?.brandSlug ?? undefined),
				employeeId: exit.employeeId,
				employeeName: exit.fullName,
				lwd: exit.lwd ?? null,
				team: exit.department ?? exit.division ?? null
			});
		} catch (e) {
			console.error('[exit] IT block mail failed:', e);
			return no(502, 'The mail provider rejected the send. Try again.');
		}

		await Exit.findByIdAndUpdate(params.id, { itAccessRevokedMailSentAt: new Date() });
		await audit({
			candidateId: exit.candidateId ? String(exit.candidateId) : null,
			actor: locals.admin!.email,
			action: 'exit_it_block_mail_sent',
			field: exit.employeeId,
			ip: getClientAddress()
		});
		return { itMailSent: true };
	},

	/** SOP step 8 — the payroll / F&F / PF / taxation block. */
	saveFnf: async ({ params, request, locals, getClientAddress }) => {
		const forbidden = requireHr(locals);
		if (forbidden) return forbidden;
		const row = await getExit(params.id);
		if (!row) return no(404, 'Offboarding record not found.');

		const form = await request.formData();
		const patch: Record<string, unknown> = {};
		for (const field of FNF_FIELDS) {
			const raw = String(form.get(field) ?? '').trim();
			patch[`fnf.${field}`] = FNF_DATE_FIELDS.has(field) ? isoToDDMMYYYY(raw) || null : raw || null;
		}
		patch['fnf.pfExitProcessed'] = form.get('pfExitProcessed') === 'on';
		patch['fnf.taxationApplicable'] = form.get('taxationApplicable') === 'on';
		patch['fnf.updatedAt'] = new Date();

		// Recording the settlement is what moves an exit into the F&F stage —
		// but never backwards out of completed.
		const { exit } = row;
		if (exit.status === 'cleared' || exit.status === 'clearances') patch.status = 'fnf';

		await Exit.findByIdAndUpdate(params.id, patch);
		await audit({
			candidateId: exit.candidateId ? String(exit.candidateId) : null,
			actor: locals.admin!.email,
			action: 'exit_fnf_saved',
			field: 'netAmount',
			newValue: String(form.get('netAmount') ?? '') || null,
			ip: getClientAddress()
		});
		return { fnfSaved: true };
	},

	/** SOP 10.7 — the exit-completion checklist. */
	saveClosure: async ({ params, request, locals, getClientAddress }) => {
		const forbidden = requireHr(locals);
		if (forbidden) return forbidden;
		const row = await getExit(params.id);
		if (!row) return no(404, 'Offboarding record not found.');

		const form = await request.formData();
		const checked = new Set(form.getAll('checklist').map((v) => String(v)));
		const map: Record<string, boolean> = {};
		for (const key of CLOSURE_CHECKLIST_KEYS) map[key] = checked.has(key);

		await Exit.findByIdAndUpdate(params.id, { closureChecklist: map });
		await audit({
			actor: locals.admin!.email,
			action: 'exit_closure_checklist_saved',
			newValue: `${checked.size}/${CLOSURE_CHECKLIST_KEYS.length}`,
			ip: getClientAddress()
		});
		return { closureSaved: true };
	},

	/** SOP step 9 — the final documents link, ~30-45 days after the LWD. Mints a
	 *  six-month handover token and mails it with everything HR has attached. */
	sendHandover: async ({ params, locals, getClientAddress }) => {
		const forbidden = requireHr(locals);
		if (forbidden) return forbidden;
		const row = await getExit(params.id);
		if (!row) return no(404, 'Offboarding record not found.');
		const { exit, company } = row;
		const e = exit as unknown as Record<string, any>;

		const files = await ExitDocument.find({ exitId: params.id, source: 'hr' }).lean();
		if (!files.length)
			return no(
				400,
				'Upload at least one handover document (relieving letter, payslips, F&F statement) before sending the link.',
				'handover'
			);

		const brand = brandBySlug(company?.brandSlug ?? undefined);
		const token = await createExitToken(params.id, 'handover');
		const url = `${baseUrl()}/x/final/${token}`;
		const labelByType = new Map<string, string>(HANDOVER_DOCS.map((d) => [d.docType, d.label]));

		try {
			await sendHandoverMail({
				to: exit.personalEmail,
				employeeName: exit.fullName,
				brand,
				url,
				fnfAmount: e.fnf?.netAmount ?? null,
				fnfDate: e.fnf?.settlementDate ?? null,
				documents: [...new Set(files.map((f) => labelByType.get(f.docType) ?? f.label ?? f.docType))]
			});
		} catch (err) {
			console.error('[exit] handover send failed:', err);
			return no(502, 'The mail provider rejected the send. Try again.', 'handover');
		}

		await Exit.findByIdAndUpdate(params.id, {
			status: 'completed',
			handoverMailSentAt: new Date(),
			completedAt: new Date()
		});
		await audit({
			candidateId: exit.candidateId ? String(exit.candidateId) : null,
			actor: locals.admin!.email,
			action: 'exit_handover_sent',
			field: exit.personalEmail,
			ip: getClientAddress()
		});
		return { handoverSent: true, url };
	},

	/** Reopens a closed exit — a relieving letter reissued, a figure corrected. */
	reopen: async ({ params, locals, getClientAddress }) => {
		if (locals.admin?.role !== 'super_admin')
			return no(403, 'Only a super admin can reopen a closed exit.');
		const row = await getExit(params.id);
		if (!row) return no(404, 'Offboarding record not found.');
		// The handover page renders the settlement live, so leaving its link valid
		// while HR corrects figures would show the ex-employee intermediate
		// numbers. Revoke it; `sendHandover` mints a fresh one when HR is done.
		await ExitToken.updateMany(
			{ exitId: params.id, purpose: 'handover', revoked: false },
			{ revoked: true }
		);
		await Exit.findByIdAndUpdate(params.id, {
			status: 'fnf',
			completedAt: null,
			handoverMailSentAt: null
		});
		await audit({
			actor: locals.admin!.email,
			action: 'exit_reopened',
			field: row.exit.employeeId,
			ip: getClientAddress()
		});
		return { reopened: true };
	},

	/** Removes one HR-uploaded handover file. */
	removeHandoverFile: async ({ params, request, locals, getClientAddress }) => {
		const forbidden = requireHr(locals);
		if (forbidden) return forbidden;
		const fileId = String((await request.formData()).get('fileId') ?? '');
		const file = await ExitDocument.findOne({ _id: fileId, exitId: params.id, source: 'hr' }).lean();
		if (!file) return no(404, 'File not found.');
		const { deleteFromGridFS } = await import('$lib/server/storage');
		const { ObjectId } = await import('mongodb');
		await deleteFromGridFS(file.gridfsId as InstanceType<typeof ObjectId>).catch(() => {});
		await ExitDocument.deleteOne({ _id: fileId });
		await audit({
			actor: locals.admin!.email,
			action: 'exit_handover_file_removed',
			field: file.docType,
			ip: getClientAddress()
		});
		return { handoverFileRemoved: true };
	},

	/** Asks the employee to re-upload one of their files (usually an unreadable
	 *  signature image). Mirrors the onboarding requestReupload action. */
	requestReupload: async ({ params, request, locals, getClientAddress }) => {
		const forbidden = requireHr(locals);
		if (forbidden) return forbidden;
		const form = await request.formData();
		const fileId = String(form.get('fileId') ?? '');
		const note = String(form.get('note') ?? '').trim() || null;
		const file = await ExitDocument.findOne({ _id: fileId, exitId: params.id, source: 'employee' });
		if (!file) return no(404, 'File not found.');
		file.reviewStatus = 'reupload_requested';
		file.reviewNote = note;
		await file.save();
		await audit({
			actor: locals.admin!.email,
			action: 'exit_reupload_requested',
			field: file.docType,
			newValue: note,
			ip: getClientAddress()
		});
		return { reuploadRequested: true };
	}
};
