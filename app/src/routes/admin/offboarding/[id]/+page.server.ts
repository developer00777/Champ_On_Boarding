// The exit workspace: one page carrying an exit from resignation to closure.
//
// Ordered by the SOP's steps, and each action is one step of it:
//   saveParticulars   step 2   confirm LWD + the employment details the forms print
//   sendFormsLink     step 5   email the employee their exit-documents link
//   requestChanges    step 5   send them back to specific fields
//   acceptSubmission  step 7   accept the submission, which starts the exit chain
//   startChain        step 7   start the chain on an exit accepted before it existed
//   resendStep        step 7   send one step's mail after HR reviewed it (or a reminder)
//   sendBackStep      step 7   reopen a signed clearance: ask for what is missing
//   requestUploads    any      ask the employee for a document again, at any stage
//   saveRouting       —        who each step mails, for this exit (and the default)
//   sendItBlockMail   step 5   the "block system access" mail to IT
//   saveFnf           step 8   HR's F&F, leave and loans — and handing them to payroll
//   saveRelease       step 9   which letters go to the employee, and the cadence
//   saveClosure       step 10  the exit-completion checklist
//   sendHandover      step 9   release now: the letters and the handover link
//
// The order the mails go out in lives in offboarding/flow.ts, not here: each
// step's mail is readied when the one before it finishes, and goes once HR has
// reviewed it (mail-preview/[step]) and pressed Send.
import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { Admin, Exit, ExitClearance, ExitDocument, ExitToken } from '$lib/server/db/schema';
import { audit } from '$lib/server/audit';
import { lacking, mayToday } from '$lib/server/access';
import { brandBySlug } from '$lib/shared/brands';
import { baseUrl } from '$lib/server/base-url';
import { isValidEmail, isValidMobile, titleCase } from '$lib/shared/validation';
import { isoToDDMMYYYY, toIsoDate } from '$lib/shared/dates';
import { TRACKS, type Track } from '$lib/shared/matrix';
import {
	CLEARANCE_DEPT_LABELS,
	CLOSURE_CHECKLIST_KEYS,
	EXIT_UPLOAD_DOCS,
	FLOW_STEPS,
	FNF_PAYROLL_DATE_KEYS,
	FNF_PAYROLL_FIELDS,
	HANDOVER_DOCS,
	LETTER_SALUTATIONS,
	LETTER_SOURCES,
	ROUTING_KEYS,
	ROUTING_LABELS,
	UPLOAD_REQUEST_PREFIX,
	lettersForTrack,
	requestedFieldLabel,
	sendBackItems,
	type ClearanceDept,
	type FlowStepKey
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
	serviceLabel
} from '$lib/server/offboarding/exit';
import { EXIT_DOC_BY_KEY, availableDocs } from '$lib/server/offboarding/documents';
import {
	advanceFlow,
	flowSteps,
	getRoutingDefaults,
	mailStep,
	releaseLetterKeys,
	releaseLetters,
	saveRoutingDefaults,
	scheduleRelease,
	sendBackStep,
	startFlow
} from '$lib/server/offboarding/flow';
import {
	buildItExitMail,
	getExitMailSettings,
	sendExitFormsMail,
	sendItExitMail
} from '$lib/server/offboarding/mail';

/** Every failure on this page returns the same shape, so the Svelte side can
 *  read `form?.particularsError` (and friends) without TypeScript narrowing the
 *  key away on the branches that don't set it. `section` names which block
 *  should show the message inline; null means the page-level banner. */
type Section =
	| 'particulars'
	| 'letters'
	| 'changes'
	| 'clearance'
	| 'handover'
	| 'routing'
	| 'fnf'
	| 'release'
	| null;

function no(status: number, message: string, section: Section = null) {
	return fail(status, {
		message,
		particularsError: section === 'particulars',
		lettersError: section === 'letters',
		routingError: section === 'routing',
		fnfError: section === 'fnf',
		releaseError: section === 'release',
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
	// The No Dues certificate's "Team" line. Collected here because the whole
	// certificate is filled internally — the employee is never asked for it.
	team: (v: string) => v,
	division: (v: string) => v,
	reportingManager: titleCase,
	uanNo: (v: string) => v,
	panNo: (v: string) => v.toUpperCase(),
	bankAccountName: titleCase,
	noticePeriod: (v: string) => v,
	// Set when the exit was started; printed on the exit letters.
	refNo: (v: string) => v
} as const;

/** What HR still fills on the F&F card: the statutory follow-ups. The
 *  settlement figures are payroll's and arrive from their clearance page — see
 *  FNF_PAYROLL_FIELDS. Keeping them out of this list is the enforcement: HR
 *  cannot overwrite a figure it did not calculate. */
const FNF_FIELDS = ['pfDateOfExit', 'pfRemarks', 'taxationRemarks'] as const;

/** Dates in the F&F block are stored DD/MM/YYYY like every other date here, so
 *  the ones backed by a date input need converting on the way in. */
const FNF_DATE_FIELDS = new Set(['pfDateOfExit']);

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
			refNo: (e.refNo as string | null) ?? (e.letters?.refNo as string | null) ?? null,
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
			team: exit.team ?? null,
			division: exit.division ?? null,
			reportingManager: exit.reportingManager ?? null,
			uanNo: exit.uanNo ?? null,
			panNo: exit.panNo ?? null,
			bankAccountName: exit.bankAccountName ?? null,
			track: (exit.track as string | null) ?? null,
			letters: {
				salutation: e.letters?.salutation ?? null,
				refNo: e.letters?.refNo ?? null,
				usn: e.letters?.usn ?? null,
				internshipPeriod: e.letters?.internshipPeriod ?? null,
				workSummary: e.letters?.workSummary ?? null
			},
			status: exit.status,
			service: serviceLabel(exit.doj, exit.lwd),
			submittedAt: exit.submittedAt?.toISOString() ?? null,
			reviewedAt: exit.reviewedAt?.toISOString() ?? null,
			completedAt: exit.completedAt?.toISOString() ?? null,
			consentAt: exit.consentAt?.toISOString() ?? null,
			itAccessRevokedMailSentAt: exit.itAccessRevokedMailSentAt?.toISOString() ?? null,
			handoverMailSentAt: exit.handoverMailSentAt?.toISOString() ?? null,
			requestedFields: (exit.requestedFields ?? []).map(
				(r: { field: string; note?: string | null }) => ({
					field: r.field,
					label: requestedFieldLabel(r.field),
					note: r.note ?? null
				})
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
		/** The exit chain, step by step — what the map on the left draws. Each
		 *  step carries its clearance link (when it has one) so HR can copy it
		 *  out of band when someone says the mail never arrived. */
		steps: flowSteps(e, clearances as unknown as Record<string, unknown>[]).map((s) => {
			const i = clearances.findIndex((c) => String(c._id) === s.clearanceId);
			const c = i >= 0 ? (clearances[i] as unknown as Record<string, any>) : null;
			const def = FLOW_STEPS.find((d) => d.key === s.key);
			return {
				...s,
				link: i >= 0 ? exitTokenUrl(clearanceTokens[i]) : null,
				/** What HR can tick when sending this approver back. */
				sendBackItems: def?.dept ? sendBackItems(def.dept) : [],
				/** The open send-back, if any — what the approver is still to do. */
				sendBack: c?.sendBack?.at
					? { note: c.sendBack.note ?? null, items: c.sendBack.items ?? [], uploads: c.sendBack.uploads ?? [] }
					: null,
				sentBackCount: (c?.sendBackHistory?.length ?? 0) + (c?.sendBack?.at ? 1 : 0),
				/** Documents this approver attached when asked. */
				files: c
					? files
							.filter((f) => f.source === 'approver' && String(f.clearanceId) === String(c._id))
							.map((f) => ({ id: String(f._id), label: f.label ?? f.docType }))
					: []
			};
		}),
		/** The documents the employee uploads, and where each stands — what the
		 *  "Ask for documents" dialog ticks from. */
		uploadDocs: EXIT_UPLOAD_DOCS.map((d) => {
			const file = files.find((f) => f.source === 'employee' && f.docType === d.docType);
			return {
				docType: d.docType,
				label: d.label.replace(/^Your s/, 'S'),
				mandatory: d.mandatory,
				fileId: file ? String(file._id) : null,
				requested: (exit.requestedFields ?? []).some(
					(r: { field: string }) => r.field === `${UPLOAD_REQUEST_PREFIX}${d.docType}`
				)
			};
		}),
		flow: {
			startedAt: e.flow?.startedAt ? new Date(e.flow.startedAt).toISOString() : null,
			hrDoneAt: e.flow?.hrDoneAt ? new Date(e.flow.hrDoneAt).toISOString() : null,
			scheduledAt: e.flow?.scheduledAt ? new Date(e.flow.scheduledAt).toISOString() : null,
			releasedAt: e.flow?.releasedAt ? new Date(e.flow.releasedAt).toISOString() : null,
			releasedBy: (e.flow?.releasedBy as string | null) ?? null,
			releaseAfterDays: Number(e.flow?.releaseAfterDays ?? 30),
			autoRelease: e.flow?.autoRelease !== false,
			letterKeys: releaseLetterKeys(e),
			lastError: e.flow?.lastError?.message
				? { step: e.flow.lastError.step as string, message: e.flow.lastError.message as string }
				: null
		},
		/** The letters this track can be sent, for the release card. */
		releaseOptions: lettersForTrack(e.track).map((k) => ({
			key: k,
			label: EXIT_DOC_BY_KEY.get(k)?.label ?? k,
			source: LETTER_SOURCES[k]
		})),
		/** Who each step mails, for this exit; and the saved default, so the card
		 *  can say when this exit differs from it. */
		routing: Object.fromEntries(
			ROUTING_KEYS.map((k) => [
				k,
				{ email: (e.routing?.[k]?.email as string | null) ?? '', name: (e.routing?.[k]?.name as string | null) ?? '' }
			])
		) as Record<(typeof ROUTING_KEYS)[number], { email: string; name: string }>,
		salesforceEnabled: !!e.routing?.salesforce?.enabled,
		routingDefaults: await getRoutingDefaults(),
		// HR's settlement form: HR fills it, payroll gets it prefilled and has
		// the last word. Read-only here once payroll has signed.
		fnfForm: FNF_PAYROLL_FIELDS.map((f) => {
			const raw = ((e.fnf ?? {}) as Record<string, string | null>)[f.key] ?? '';
			const date = 'date' in f && !!f.date;
			return {
				key: f.key,
				label: f.label,
				date,
				money: 'money' in f && !!f.money,
				value: date ? (toIsoDate(raw) ?? '') : raw,
				display: raw
			};
		}),
		payrollSigned: !!e.fnf?.submittedByPayrollAt,
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
			applicableWhen: d.applicableWhen,
			legacy: d.legacy
		})),
		uploadSlots: EXIT_UPLOAD_DOCS.map((d) => ({
			docType: d.docType,
			label: d.label,
			mandatory: d.mandatory
		})),
		itMailRecipients: { to: mailSettings.itTo, cc: mailSettings.itCc },
		isHr: locals.admin?.role === 'super_admin' || locals.admin?.role === 'hr_admin',
		isSuperAdmin: locals.admin?.role === 'super_admin',
		/** "Exits: reopen or delete an exit" in Access & org — the reopen action's check. */
		canReopen: await mayToday(locals.admin, 'exit.reopen', 'approve')
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
		if (!patch.refNo) errors.push('Reference number is required.');
		else if (await Exit.exists({ refNo: patch.refNo, _id: { $ne: params.id } }))
			errors.push(`Reference number ${patch.refNo} is already used by another offboarding.`);
		if (errors.length) return no(400, errors.join(' '), 'particulars');

		const doj = isoToDDMMYYYY(get('doj')) || null;
		const lwd = isoToDDMMYYYY(get('lwd')) || null;
		const resignationDate = isoToDDMMYYYY(get('resignationDate')) || row.exit.resignationDate;
		const separationType = get('separationType') === 'involuntary' ? 'involuntary' : 'voluntary';
		const track = TRACKS.includes(get('track') as Track) ? get('track') : null;
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
			track,
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
			// Decides which exit letters are generated, so a change is traced.
			track,
			// Stringified so they diff against the stored values the same way the
			// text fields do. Gratuity especially: it decides whether a Form I is
			// generated at all, so an untraced flip is exactly what an audit log
			// is for.
			'gratuity.applicable': String(applicable)
		};
		const beforeFlags: Record<string, string | null> = {
			separationType: (row.exit.separationType as string | null) ?? null,
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

	/** The details only the exit letters print — salutation and, for interns,
	 *  USN, period and the work summary. The rest of each letter (the reference
	 *  number included) comes from the particulars above. */
	saveLetters: async ({ params, request, locals, getClientAddress }) => {
		const forbidden = requireHr(locals);
		if (forbidden) return forbidden;
		const row = await getExit(params.id);
		if (!row) return no(404, 'Offboarding record not found.');

		const form = await request.formData();
		const get = (k: string) => String(form.get(k) ?? '').trim() || null;

		const salutation = get('salutation');
		if (salutation && !(LETTER_SALUTATIONS as readonly string[]).includes(salutation))
			return no(400, 'Pick Mr., Ms. or Mrs.', 'letters');

		const next: Record<string, string | null> = {
			salutation,
			usn: get('usn')?.toUpperCase() ?? null,
			internshipPeriod: get('internshipPeriod'),
			workSummary: get('workSummary')
		};
		const before = ((row.exit as unknown as { letters?: Record<string, string | null> }).letters ??
			{}) as Record<string, string | null>;

		await Exit.findByIdAndUpdate(
			params.id,
			Object.fromEntries(Object.entries(next).map(([k, v]) => [`letters.${k}`, v]))
		);

		for (const [field, value] of Object.entries(next)) {
			const old = before[field] ?? null;
			if (old === value) continue;
			await audit({
				candidateId: row.exit.candidateId ? String(row.exit.candidateId) : null,
				actor: locals.admin!.email,
				action: 'exit_particulars_set',
				field: `letters.${field}`,
				oldValue: old,
				newValue: value,
				ip: getClientAddress()
			});
		}

		return { lettersSaved: true };
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
	/** The No Dues certificate, filled internally.
	 *
	 *  This used to be the employee's first exit form. It is now HR's: the
	 *  certificate records what the company holds and what each department
	 *  signs off, none of which the employee is in a position to state. The
	 *  header (name, employee number, team, reporting to, dates, contact, bank
	 *  name) comes from the particulars above; this action captures the
	 *  handover notes and the per-row position the approvers cross-check. */
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
		// Accepting is what starts the chain: the reporting manager's mail is
		// readied for HR to review and send, and each step after it likewise as
		// the one before it signs.
		await startFlow(params.id);
		return { accepted: true };
	},

	/** Starts the exit chain for an exit accepted before the chain existed, or
	 *  nudges it on after something was fixed. Safe to press twice. */
	startChain: async ({ params, locals, getClientAddress }) => {
		const forbidden = requireHr(locals);
		if (forbidden) return forbidden;
		const row = await getExit(params.id);
		if (!row) return no(404, 'Offboarding record not found.');
		if (!row.exit.reviewedAt)
			return no(409, "Accept the employee's submission first — that is what starts the chain.");
		if (row.exit.status === 'completed') return no(409, 'This exit is closed.');
		await startFlow(params.id);
		await audit({
			candidateId: row.exit.candidateId ? String(row.exit.candidateId) : null,
			actor: locals.admin!.email,
			action: 'exit_chain_started',
			ip: getClientAddress()
		});
		return { chainStarted: true };
	},

	/** Sends one clearance step's mail once HR has reviewed it — the first
	 *  send, or a reminder to someone who has not signed. Only the step the
	 *  chain is on can be sent, so nobody is asked out of order. */
	resendStep: async ({ params, request, locals, getClientAddress }) => {
		const forbidden = requireHr(locals);
		if (forbidden) return forbidden;
		const row = await getExit(params.id);
		if (!row) return no(404, 'Offboarding record not found.');
		const key = String((await request.formData()).get('step') ?? '') as FlowStepKey;
		const def = FLOW_STEPS.find((s) => s.key === key && s.dept);
		if (!def) return no(400, 'That step does not send a mail.');
		const clearances = await ExitClearance.find({ exitId: params.id }).lean();
		const state = flowSteps(row.exit as unknown as Record<string, unknown>, clearances as unknown as Record<string, unknown>[]).find(
			(s) => s.key === key
		);
		if (state?.status !== 'active')
			return no(
				409,
				state?.status === 'done'
					? `The ${def.label} has already signed.`
					: state?.status === 'blocked'
						? `Add the ${def.label} email in Mail settings first.`
						: `It is not the ${def.label}'s turn yet — the steps before it are still open.`
			);
		const current = clearances.find((c) => c.department === def.dept);
		const res = await mailStep(params.id, key, { reminder: current?.status === 'sent' });
		if ('error' in res) return no(400, res.error);
		await advanceFlow(params.id);
		await audit({
			candidateId: row.exit.candidateId ? String(row.exit.candidateId) : null,
			actor: locals.admin!.email,
			action: 'exit_step_resent',
			field: key,
			ip: getClientAddress()
		});
		return { stepResent: def.label };
	},

	/** Sends a signed clearance back to its approver: what HR ticked as
	 *  missing, any documents to attach, and a note — after HR reviewed the
	 *  mail. The approver's answers stay filled in; they fix and sign again. */
	sendBackStep: async ({ params, request, locals, getClientAddress }) => {
		const forbidden = requireHr(locals);
		if (forbidden) return forbidden;
		const row = await getExit(params.id);
		if (!row) return no(404, 'Offboarding record not found.');
		const form = await request.formData();
		const key = String(form.get('step') ?? '') as FlowStepKey;
		const def = FLOW_STEPS.find((s) => s.key === key && s.dept);
		if (!def) return no(400, 'That step has no approver to send back to.');
		const clean = (v: FormDataEntryValue) => String(v).trim().slice(0, 300);
		const allowed = new Set(sendBackItems(def.dept!));
		const back = {
			note: clean(form.get('note') ?? '') || null,
			items: form.getAll('item').map(clean).filter((i) => allowed.has(i)),
			uploads: form.getAll('upload').map(clean).filter(Boolean).slice(0, 5)
		};
		const res = await sendBackStep(params.id, key, back, locals.admin!.email);
		if ('error' in res) return no(400, res.error);
		await audit({
			candidateId: row.exit.candidateId ? String(row.exit.candidateId) : null,
			actor: locals.admin!.email,
			action: 'exit_clearance_sent_back',
			field: key,
			newValue: [...back.items, ...back.uploads.map((u) => `Attach: ${u}`), back.note ?? ''].filter(Boolean).join('; '),
			ip: getClientAddress()
		});
		return { sentBack: def.label };
	},

	/** Asks the employee for one or more of their documents again — a new
	 *  upload, or a re-upload of one HR cannot use. Works at any stage until the
	 *  exit closes: it reopens only those uploads on their page, never their
	 *  forms, so signatures already collected stay valid. */
	requestUploads: async ({ params, request, locals, getClientAddress }) => {
		const forbidden = requireHr(locals);
		if (forbidden) return forbidden;
		const row = await getExit(params.id);
		if (!row) return no(404, 'Offboarding record not found.');
		const { exit, company } = row;
		if (exit.status === 'completed') return no(409, 'This exit is closed. Reopen it before asking for documents.');
		if (exit.status === 'initiated') return no(409, 'Send the employee their forms link first.');

		const form = await request.formData();
		const known = new Set<string>(EXIT_UPLOAD_DOCS.map((d) => d.docType));
		const docs = [...new Set(form.getAll('doc').map(String))].filter((d) => known.has(d));
		if (!docs.length) return no(400, 'Tick at least one document.');
		const note = String(form.get('note') ?? '').trim().slice(0, 300) || null;
		const requested = docs.map((d) => ({ field: `${UPLOAD_REQUEST_PREFIX}${d}`, note }));

		const token = await createExitToken(params.id, 'forms');
		try {
			await sendExitFormsMail({
				exitId: params.id,
				to: exit.personalEmail,
				employeeName: exit.fullName,
				lwd: exit.lwd ?? null,
				brand: brandBySlug(company?.brandSlug ?? undefined),
				url: `${baseUrl()}/x/${token}`,
				changesRequested: requested
			});
		} catch (err) {
			console.error('[exit] document request send failed:', err);
			return no(502, 'The mail provider rejected the send. Try again.');
		}

		// The file HR could not use is flagged rather than deleted: it stays
		// viewable until the replacement arrives, which then supersedes it.
		await ExitDocument.updateMany(
			{ exitId: params.id, source: 'employee', docType: { $in: docs } },
			{ $set: { reviewStatus: 'reupload_requested', reviewNote: note } }
		);
		await Exit.findByIdAndUpdate(params.id, {
			$pull: { requestedFields: { field: { $in: requested.map((r) => r.field) } } }
		});
		await Exit.findByIdAndUpdate(params.id, { $push: { requestedFields: { $each: requested } } });
		await audit({
			candidateId: exit.candidateId ? String(exit.candidateId) : null,
			actor: locals.admin!.email,
			action: 'exit_documents_requested',
			field: docs.join(', '),
			newValue: note,
			ip: getClientAddress()
		});
		return { docsRequested: docs.length };
	},

	/** The mail settings at the bottom of the page: who each step of this exit
	 *  mails — and, when ticked, the starting point for exits created from now
	 *  on. A step already signed keeps the address it was signed under; these
	 *  only steer what is still to come. */
	saveRouting: async ({ params, request, locals, getClientAddress }) => {
		const forbidden = requireHr(locals);
		if (forbidden) return forbidden;
		const row = await getExit(params.id);
		if (!row) return no(404, 'Offboarding record not found.');
		const form = await request.formData();
		const get = (k: string) => String(form.get(k) ?? '').trim();

		const patch: Record<string, unknown> = {};
		const errors: string[] = [];
		const value: Record<string, { email: string; name: string }> = {};
		for (const key of ROUTING_KEYS) {
			const email = get(`${key}_email`).toLowerCase();
			const name = get(`${key}_name`);
			if (email && !isValidEmail(email))
				errors.push(`${ROUTING_LABELS[key]}: "${email}" is not a valid email address.`);
			value[key] = { email, name };
			patch[`routing.${key}.email`] = email || null;
			patch[`routing.${key}.name`] = name || null;
		}
		const salesforceOn = form.get('salesforce_enabled') === 'on';
		patch['routing.salesforce.enabled'] = salesforceOn;
		if (errors.length) return no(400, errors.join(' '), 'routing');

		await Exit.findByIdAndUpdate(params.id, patch);
		// Taking Salesforce off this exit drops a clearance not yet signed, so the
		// No Dues certificate stops waiting on it and its link stops working.
		if (!salesforceOn) {
			const open = await ExitClearance.findOne({
				exitId: params.id,
				department: 'salesforce',
				status: { $ne: 'completed' }
			}).lean();
			if (open) {
				await ExitToken.deleteMany({ exitId: params.id, purpose: 'clearance', clearanceId: open._id });
				await ExitClearance.deleteOne({ _id: open._id });
			}
		}

		const asDefault = form.get('saveDefault') === 'on';
		if (asDefault) {
			const current = await getRoutingDefaults();
			await saveRoutingDefaults(
				{
					it: value.it,
					salesforce: { ...value.salesforce, enabled: salesforceOn },
					hr: value.hr,
					payroll: value.payroll,
					releaseAfterDays: current.releaseAfterDays
				},
				locals.admin!.id
			);
		}
		await audit({
			candidateId: row.exit.candidateId ? String(row.exit.candidateId) : null,
			actor: locals.admin!.email,
			action: 'exit_routing_saved',
			field: asDefault ? 'this exit + default' : 'this exit',
			newValue: ROUTING_KEYS.map((k) => `${k}=${value[k].email || '—'}`).join(', '),
			ip: getClientAddress()
		});
		// A blank address may have been holding the chain; this is what lets it on.
		await advanceFlow(params.id);
		return { routingSaved: true, routingDefaulted: asDefault };
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

	/** HR's step in the chain: the F&F, leave and loan figures, plus the PF and
	 *  tax follow-ups. "Save & hand to payroll" also closes HR's step, which
	 *  readies payroll's mail — the prefilled settlement with every document
	 *  attached — for HR to review and send.
	 *  Once payroll has signed, their figures are final and only the PF/tax
	 *  block stays HR's to edit. */
	saveFnf: async ({ params, request, locals, getClientAddress }) => {
		const forbidden = requireHr(locals);
		if (forbidden) return forbidden;
		const row = await getExit(params.id);
		if (!row) return no(404, 'Offboarding record not found.');
		const { exit } = row;
		const e = exit as unknown as Record<string, any>;

		const form = await request.formData();
		const patch: Record<string, unknown> = {};
		const payrollSigned = !!e.fnf?.submittedByPayrollAt;
		if (!payrollSigned) {
			for (const f of FNF_PAYROLL_FIELDS) {
				const raw = String(form.get(f.key) ?? '').trim();
				patch[`fnf.${f.key}`] = FNF_PAYROLL_DATE_KEYS.has(f.key) ? isoToDDMMYYYY(raw) || null : raw || null;
			}
		}
		for (const field of FNF_FIELDS) {
			const raw = String(form.get(field) ?? '').trim();
			patch[`fnf.${field}`] = FNF_DATE_FIELDS.has(field) ? isoToDDMMYYYY(raw) || null : raw || null;
		}
		patch['fnf.pfExitProcessed'] = form.get('pfExitProcessed') === 'on';
		patch['fnf.taxationApplicable'] = form.get('taxationApplicable') === 'on';
		patch['fnf.updatedAt'] = new Date();

		const handOver = form.get('handToPayroll') === '1';
		if (handOver) {
			const clearances = await ExitClearance.find({ exitId: params.id }).lean();
			const current = flowSteps(e, clearances as unknown as Record<string, unknown>[]).find(
				(s) => s.status === 'active' || s.status === 'blocked'
			);
			if (current?.key !== 'hr')
				return no(
					409,
					current
						? `The chain is waiting on "${current.label}" — it is not HR's turn yet.`
						: "The chain has not started. Accept the employee's submission first.",
					'fnf'
				);
			if (!String(form.get('netAmount') ?? '').trim())
				return no(400, 'Fill in the net F&F payable before handing it to payroll.', 'fnf');
			patch['flow.hrDoneAt'] = new Date();
			patch['flow.hrDoneBy'] = locals.admin!.email;
		}

		await Exit.findByIdAndUpdate(params.id, patch);
		await audit({
			candidateId: exit.candidateId ? String(exit.candidateId) : null,
			actor: locals.admin!.email,
			action: handOver ? 'exit_fnf_sent_to_payroll' : 'exit_fnf_saved',
			field: 'netAmount',
			newValue: String(form.get('netAmount') ?? '') || null,
			ip: getClientAddress()
		});
		if (handOver) await advanceFlow(params.id);
		return { fnfSaved: true, handedToPayroll: handOver };
	},

	/** The last step: which letters go to the employee, and the cadence — how
	 *  many days after payroll signs off they go out by themselves. */
	saveRelease: async ({ params, request, locals, getClientAddress }) => {
		const forbidden = requireHr(locals);
		if (forbidden) return forbidden;
		const row = await getExit(params.id);
		if (!row) return no(404, 'Offboarding record not found.');
		if (row.exit.status === 'completed') return no(409, 'This exit is closed.', 'release');

		const form = await request.formData();
		const allowed = lettersForTrack(row.exit.track as string | null) as string[];
		const letterKeys = form.getAll('letterKey').map(String).filter((k) => allowed.includes(k));
		const days = Number(String(form.get('releaseAfterDays') ?? '').trim());
		if (!Number.isInteger(days) || days < 0 || days > 365)
			return no(400, 'Days after payroll sign-off must be a whole number from 0 to 365.', 'release');
		const autoRelease = form.get('autoRelease') === 'on';

		await Exit.findByIdAndUpdate(params.id, {
			'flow.letterKeys': letterKeys,
			'flow.releaseAfterDays': days,
			'flow.autoRelease': autoRelease
		});
		if (form.get('saveDefault') === 'on') {
			const current = await getRoutingDefaults();
			await saveRoutingDefaults({ ...current, releaseAfterDays: days }, locals.admin!.id);
		}
		await audit({
			candidateId: row.exit.candidateId ? String(row.exit.candidateId) : null,
			actor: locals.admin!.email,
			action: 'exit_release_set',
			field: letterKeys.join(', ') || 'no letters',
			newValue: autoRelease ? `${days} days after payroll` : 'manual',
			ip: getClientAddress()
		});
		// Re-dates a release already scheduled; with payroll already signed and a
		// cadence already past, this is what sends it.
		await scheduleRelease(params.id, { reset: true });
		return { releaseSaved: true };
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

	/** Releases now: the selected letters and the handover link go to the
	 *  employee, and the exit closes — what the cadence would do on its date. */
	sendHandover: async ({ params, locals, getClientAddress }) => {
		const forbidden = requireHr(locals);
		if (forbidden) return forbidden;
		const row = await getExit(params.id);
		if (!row) return no(404, 'Offboarding record not found.');
		const res = await releaseLetters(params.id, locals.admin!.email);
		if ('error' in res) return no(400, res.error, 'handover');
		await audit({
			candidateId: row.exit.candidateId ? String(row.exit.candidateId) : null,
			actor: locals.admin!.email,
			action: 'exit_handover_sent',
			field: row.exit.personalEmail,
			ip: getClientAddress()
		});
		return { handoverSent: true, url: res.url };
	},

	/** Reopens a closed exit — a relieving letter reissued, a figure corrected. */
	reopen: async ({ params, locals, getClientAddress }) => {
		const noReopen = await lacking(locals.admin, 'exit.reopen', 'approve');
		if (noReopen) return no(403, noReopen);
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
			handoverMailSentAt: null,
			// The release can be sent again — but only by HR: a reopened exit is
			// being corrected, and must not go out again on a schedule behind them.
			'flow.releasedAt': null,
			'flow.releasedBy': null,
			'flow.scheduledAt': null,
			'flow.autoRelease': false
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
