// The employee's exit portal — the offboarding counterpart to /c/[token].
//
// Public and token-gated: the token is the credential. One page carrying all
// five exit forms, each saved independently so a long form is never lost, and
// each stamped with its own submittedAt so HR can see what is still coming.
import { error, fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { Admin, Exit, ExitDocument } from '$lib/server/db/schema';
import { audit } from '$lib/server/audit';
import { encrypt } from '$lib/server/crypto';
import { baseUrl } from '$lib/server/base-url';
import { brandBySlug } from '$lib/shared/brands';
import { isValidAadhaar, isValidEmail, isValidMobile, titleCase } from '$lib/shared/validation';
import { isoToDDMMYYYY, toIsoDate, todayDDMMYYYYInIST } from '$lib/shared/dates';
import {
	ASSET_ITEMS,
	EXIT_Q11_ROWS,
	EXIT_Q12_ROWS,
	EXIT_Q13_ROWS,
	EXIT_TEXT_QUESTIONS,
	EXIT_UPLOAD_DOCS,
	NDC_EMPLOYEE_DECLARATIONS,
	NDC_EMPLOYEE_ROW_KEYS,
	NDC_EMPLOYEE_SECTIONS,
	RELIEVING_ITEMS
} from '$lib/shared/offboarding';
import {
	allFormsComplete,
	asRecord,
	exitCompany,
	formStates,
	resolveExitToken,
	serviceLabel
} from '$lib/server/offboarding/exit';
import { availableDocs } from '$lib/server/offboarding/documents';
import { sendExitAlert } from '$lib/server/offboarding/mail';

/** Stages in which the employee may still edit. Mirrors EDITABLE_STATUSES in
 *  the onboarding portal — once HR has accepted, the forms are closed. */
const EDITABLE = ['link_sent', 'in_progress', 'submitted', 'changes_requested'];

async function ctx(token: string) {
	const resolved = await resolveExitToken(token, 'forms');
	if (!resolved) return null;
	const company = await exitCompany(resolved.exit.companyId);
	return { exit: resolved.exit, company };
}

/** The employee's answers to the variable-length question sets, as one record
 *  the page can index by the same shared definitions it renders from. Declared
 *  rather than spread: a spread's index signature is dropped as soon as literal
 *  keys follow it, which loses every question key. */
function answersFor(
	source: Record<string, unknown> | undefined,
	fields: readonly string[]
): Record<string, string> {
	const out: Record<string, string> = {};
	for (const field of fields) out[field] = (source?.[field] as string | null) ?? '';
	return out;
}

export const load: PageServerLoad = async ({ params }) => {
	const c = await ctx(params.token);
	if (!c) error(404, 'This exit link is invalid, expired, or has been revoked.');
	const { exit, company } = c;
	const brand = brandBySlug(company?.brandSlug ?? undefined);
	const e = exit as unknown as Record<string, any>;

	const files = await ExitDocument.find({ exitId: exit._id, source: 'employee' }).lean();

	// The asset list starts from the SOP's standard set, with whatever the
	// employee has already declared merged over it.
	const declared = new Map(
		(e.assets ?? []).map((a: Record<string, unknown>) => [String(a.item), a])
	);
	const assets = ASSET_ITEMS.map((item) => {
		const row = declared.get(item) as Record<string, unknown> | undefined;
		return { item, returned: !!row?.returned, note: (row?.note as string | null) ?? '' };
	});

	return {
		brand,
		companyName: company?.name ?? brand.legalName,
		exit: {
			employeeId: exit.employeeId,
			fullName: exit.fullName,
			personalEmail: exit.personalEmail,
			personalMobile: exit.personalMobile ?? null,
			designation: exit.designation ?? null,
			department: exit.department ?? null,
			division: exit.division ?? null,
			reportingManager: exit.reportingManager ?? null,
			doj: exit.doj ?? null,
			lwd: exit.lwd ?? null,
			resignationDate: exit.resignationDate,
			separationType: exit.separationType ?? 'voluntary',
			service: serviceLabel(exit.doj, exit.lwd),
			status: exit.status,
			consented: !!exit.consentAt,
			bankAccountName: exit.bankAccountName ?? null,
			// Never send the Aadhaar itself back to the browser — only whether one
			// is on file, exactly as the onboarding portal handles it.
			hasAadhaar: !!e.nda?.aadhaarNoEncrypted,
			aadhaarLast4: e.nda?.aadhaarLast4 ?? null,
			ndc: {
				team: e.ndc?.team ?? '',
				nameAsPerBank: e.ndc?.nameAsPerBank ?? '',
				filesHandover: e.ndc?.filesHandover ?? '',
				loginsHandover: e.ndc?.loginsHandover ?? '',
				leadsHandover: e.ndc?.leadsHandover ?? '',
				deptOthers: e.ndc?.deptOthers ?? '',
				rows: asRecord(e.ndc?.rows),
				rowNotes: asRecord(e.ndc?.rowNotes),
				submitted: !!e.ndc?.submittedAt
			},
			nda: {
				agreementDate: e.nda?.agreementDate ?? '',
				agreementDateIso: toIsoDate(e.nda?.agreementDate),
				fullName: e.nda?.fullName ?? exit.fullName,
				permanentAddress: e.nda?.permanentAddress ?? '',
				submitted: !!e.nda?.submittedAt
			},
			exitInterview: {
				answers: answersFor(
					e.exitInterview,
					EXIT_TEXT_QUESTIONS.map((q) => q.field)
				),
				supervisor: (e.exitInterview?.supervisor ?? exit.reportingManager ?? '') as string,
				division: (e.exitInterview?.division ?? exit.division ?? '') as string,
				jobTitle: (e.exitInterview?.jobTitle ?? exit.designation ?? '') as string,
				reasonForLeaving: (e.exitInterview?.reasonForLeaving ?? '') as string,
				q10Workload: (e.exitInterview?.q10Workload ?? '') as string,
				q11Supervisor: asRecord(e.exitInterview?.q11Supervisor),
				q12Ratings: asRecord(e.exitInterview?.q12Ratings),
				q12Comments: (e.exitInterview?.q12Comments ?? '') as string,
				q13Benefits: asRecord(e.exitInterview?.q13Benefits),
				q14bWouldRecommend: (e.exitInterview?.q14bWouldRecommend ?? '') as string,
				submitted: !!e.exitInterview?.submittedAt
			},
			relievingFormalities: {
				answers: answersFor(
					e.relievingFormalities,
					RELIEVING_ITEMS.map((i) => i.field)
				),
				jobTitle: (e.relievingFormalities?.jobTitle ?? exit.designation ?? '') as string,
				division: (e.relievingFormalities?.division ?? exit.division ?? '') as string,
				notes: e.relievingFormalities?.notes ?? '',
				futureContactEmail: e.relievingFormalities?.futureContactEmail ?? '',
				futureContactMobile: e.relievingFormalities?.futureContactMobile ?? '',
				futureContactAddress: e.relievingFormalities?.futureContactAddress ?? '',
				emergencyContactName: e.relievingFormalities?.emergencyContactName ?? '',
				emergencyContactMobile: e.relievingFormalities?.emergencyContactMobile ?? '',
				submitted: !!e.relievingFormalities?.submittedAt
			},
			gratuity: {
				applicable: !!e.gratuity?.applicable,
				totalService: e.gratuity?.totalService ?? serviceLabel(exit.doj, exit.lwd) ?? '',
				nomineeName: e.gratuity?.nomineeName ?? '',
				nomineeRelation: e.gratuity?.nomineeRelation ?? '',
				addressForCorrespondence: e.gratuity?.addressForCorrespondence ?? '',
				submitted: !!e.gratuity?.submittedAt
			},
			assets
		},
		forms: formStates(e),
		complete: allFormsComplete(e),
		documents: availableDocs(e),
		requestedFields: (e.requestedFields ?? []).map((r: { field: string; note?: string | null }) => ({
			field: r.field,
			note: r.note ?? null
		})),
		files: files.map((f) => ({
			id: String(f._id),
			docType: f.docType,
			label: f.label ?? f.docType,
			mime: f.mime,
			sizeBytes: f.sizeBytes,
			reviewStatus: f.reviewStatus,
			reviewNote: f.reviewNote ?? null
		})),
		uploadSlots: EXIT_UPLOAD_DOCS.map((d) => ({
			docType: d.docType,
			label: d.label,
			hint: d.hint,
			mandatory: d.mandatory
		})),
		editable: EDITABLE.includes(exit.status),
		submitted: ['submitted', 'clearances', 'cleared', 'fnf', 'completed'].includes(exit.status),
		todayIso: toIsoDate(todayDDMMYYYYInIST())
	};
};

/** Marks the exit in progress and clears any standing re-request for the fields
 *  this save touched, so HR's "waiting on" list empties as the employee works. */
async function afterSave(exitId: string, status: string, prefix: string) {
	const update: Record<string, unknown> = {};
	if (status === 'link_sent') update.status = 'in_progress';
	await Exit.findByIdAndUpdate(exitId, {
		...update,
		$pull: { requestedFields: { field: { $regex: `^${prefix}\\.` } } }
	});
}

/** Every failure returns the same keys so the page can read form?.ndaError (and
 *  friends) without TypeScript narrowing them away on branches that don't set
 *  one. `section` names which form should show the message inline. */
type Section = 'nda' | 'relieving' | 'gratuity' | 'submit' | null;

function no(status: number, message: string, section: Section = null) {
	return fail(status, {
		message,
		ndaError: section === 'nda',
		relievingError: section === 'relieving',
		gratuityError: section === 'gratuity',
		submitError: section === 'submit'
	});
}

function guard(exit: { status: string } | undefined) {
	if (!exit) return no(404, 'This exit link is invalid.');
	if (!EDITABLE.includes(exit.status))
		return no(409, 'Your exit documents have been submitted and can no longer be edited.');
	return null;
}

export const actions: Actions = {
	/** Acknowledging the exit pack before filling anything in — the offboarding
	 *  counterpart of the onboarding consent step, and the DPDP record for
	 *  processing this data. */
	consent: async ({ params, getClientAddress }) => {
		const c = await ctx(params.token);
		const bad = guard(c?.exit);
		if (bad) return bad;
		if (!c!.exit.consentAt) {
			c!.exit.consentAt = new Date();
			c!.exit.consentIp = getClientAddress();
			await c!.exit.save();
			await audit({
				candidateId: c!.exit.candidateId ? String(c!.exit.candidateId) : null,
				actor: 'employee',
				action: 'exit_consent_given',
				field: c!.exit.employeeId,
				ip: getClientAddress()
			});
		}
		return { consented: true };
	},

	/** 5.1 — the employee's half of the No Dues certificate. */
	saveNdc: async ({ params, request, getClientAddress }) => {
		const c = await ctx(params.token);
		const bad = guard(c?.exit);
		if (bad) return bad;
		const form = await request.formData();
		const get = (k: string) => String(form.get(k) ?? '').trim();

		// Assets are declared alongside the NDC — they are the same conversation.
		// An approver may already have verified some of these on their clearance
		// page, so the employee's save must carry those stamps forward rather than
		// rebuilding the array from scratch and wiping them. A row an approver has
		// verified keeps that verdict: their physical check outranks a later
		// self-declaration.
		const prior = new Map(
			(((c!.exit as unknown as Record<string, any>).assets ?? []) as {
				toObject?: () => Record<string, unknown>;
			}[]).map((raw) => {
				const a = (raw.toObject ? raw.toObject() : raw) as Record<string, unknown>;
				return [String(a.item), a];
			})
		);
		const assets = ASSET_ITEMS.map((item) => {
			const was = prior.get(item);
			const declared = form.get(`asset_${item}`) === 'on';
			return {
				item,
				returned: was?.verifiedAt ? !!was.returned : declared,
				note: String(form.get(`assetnote_${item}`) ?? '').trim() || null,
				verifiedAt: (was?.verifiedAt as Date | null) ?? null
			};
		});

		// The employee's declaration against the certificate's own tick-rows. Only
		// keys NDC_EMPLOYEE_ROW_KEYS knows about are accepted, and only the three
		// declared values, so a hand-crafted POST cannot invent a row or smuggle
		// an approver's `no_dues` verdict in through the employee's form.
		const allowed = new Set<string>(NDC_EMPLOYEE_DECLARATIONS.map((d) => d.value));
		const priorRows = asRecord((c!.exit as unknown as Record<string, any>).ndc?.rows);
		const priorNotes = asRecord((c!.exit as unknown as Record<string, any>).ndc?.rowNotes);
		const ndcRows: Record<string, string> = {};
		const ndcRowNotes: Record<string, string> = {};
		for (const section of NDC_EMPLOYEE_SECTIONS) {
			for (const row of section.rows) {
				// A row the rendered form did not carry keeps whatever it had —
				// saving one section must never blank another's answers.
				if (!form.has(`ndcrow_${row.key}`)) {
					if (priorRows[row.key]) ndcRows[row.key] = priorRows[row.key];
					if (priorNotes[row.key]) ndcRowNotes[row.key] = priorNotes[row.key];
					continue;
				}
				const value = get(`ndcrow_${row.key}`);
				if (allowed.has(value) && NDC_EMPLOYEE_ROW_KEYS.has(row.key)) ndcRows[row.key] = value;
				// Rows with a `noteField` keep their note on that dedicated field
				// (filesHandover and friends), so they are never doubled up here.
				if (row.noteField) continue;
				const note = get(`ndcnote_${row.key}`);
				if (note) ndcRowNotes[row.key] = note;
			}
		}

		await Exit.findByIdAndUpdate(c!.exit._id, {
			'ndc.team': get('team') || null,
			'ndc.nameAsPerBank': titleCase(get('nameAsPerBank')) || null,
			'ndc.filesHandover': get('filesHandover') || null,
			'ndc.loginsHandover': get('loginsHandover') || null,
			'ndc.leadsHandover': get('leadsHandover') || null,
			'ndc.deptOthers': get('deptOthers') || null,
			'ndc.rows': ndcRows,
			'ndc.rowNotes': ndcRowNotes,
			'ndc.submittedAt': new Date(),
			assets
		});
		await afterSave(String(c!.exit._id), c!.exit.status, 'ndc');
		await audit({
			candidateId: c!.exit.candidateId ? String(c!.exit.candidateId) : null,
			actor: 'employee',
			action: 'exit_ndc_saved',
			ip: getClientAddress()
		});
		return { ndcSaved: true };
	},

	/** 5.2 — the NDA. Accepting the agreement and supplying the Aadhaar is the
	 *  signature event; the image itself is uploaded separately. */
	saveNda: async ({ params, request, getClientAddress }) => {
		const c = await ctx(params.token);
		const bad = guard(c?.exit);
		if (bad) return bad;
		const form = await request.formData();
		const get = (k: string) => String(form.get(k) ?? '').trim();

		const fullName = titleCase(get('fullName'));
		const permanentAddress = get('permanentAddress');
		const aadhaar = get('aadhaarNo').replace(/\s/g, '');
		const accepted = form.get('accept') === 'on';
		const e = c!.exit as unknown as Record<string, any>;

		const errors: string[] = [];
		if (!fullName) errors.push('Your full name is required.');
		if (!permanentAddress) errors.push('Your permanent address is required.');
		// An Aadhaar already on file need not be retyped; a new one must be valid.
		if (!aadhaar && !e.nda?.aadhaarNoEncrypted) errors.push('Your Aadhaar number is required.');
		if (aadhaar && !isValidAadhaar(aadhaar)) errors.push('That Aadhaar number is not valid.');
		if (!accepted) errors.push('Please confirm you have read and accept the agreement.');
		if (errors.length) return no(400, errors.join(' '), 'nda');

		const update: Record<string, unknown> = {
			'nda.agreementDate': isoToDDMMYYYY(get('agreementDate')) || todayDDMMYYYYInIST(),
			'nda.fullName': fullName,
			'nda.permanentAddress': permanentAddress,
			'nda.acceptedAt': new Date(),
			'nda.submittedAt': new Date()
		};
		if (aadhaar) {
			update['nda.aadhaarNoEncrypted'] = encrypt(aadhaar);
			update['nda.aadhaarLast4'] = aadhaar.slice(-4);
		}
		await Exit.findByIdAndUpdate(c!.exit._id, update);
		await afterSave(String(c!.exit._id), c!.exit.status, 'nda');
		await audit({
			candidateId: c!.exit.candidateId ? String(c!.exit.candidateId) : null,
			actor: 'employee',
			action: 'exit_nda_accepted',
			ip: getClientAddress()
		});
		return { ndaSaved: true };
	},

	/** 5.3 — the exit interview. Every question is optional: an employee who
	 *  declines to answer must still be able to finish their exit. */
	saveExitInterview: async ({ params, request, getClientAddress }) => {
		const c = await ctx(params.token);
		const bad = guard(c?.exit);
		if (bad) return bad;
		const form = await request.formData();
		const get = (k: string) => String(form.get(k) ?? '').trim();

		const update: Record<string, unknown> = {
			'exitInterview.supervisor': get('supervisor') || null,
			'exitInterview.division': get('division') || null,
			'exitInterview.jobTitle': get('jobTitle') || null,
			'exitInterview.reasonForLeaving': get('reasonForLeaving') || null,
			'exitInterview.q10Workload': get('q10Workload') || null,
			'exitInterview.q12Comments': get('q12Comments') || null,
			'exitInterview.q14bWouldRecommend': get('q14bWouldRecommend') || null,
			'exitInterview.submittedAt': new Date()
		};
		for (const q of EXIT_TEXT_QUESTIONS) {
			update[`exitInterview.${q.field}`] = get(q.field) || null;
		}
		// The three rating grids arrive as one field per row, named grid_rowKey.
		for (const [gridField, rows] of [
			['q11Supervisor', EXIT_Q11_ROWS],
			['q12Ratings', EXIT_Q12_ROWS],
			['q13Benefits', EXIT_Q13_ROWS]
		] as const) {
			const map: Record<string, string> = {};
			for (const row of rows) {
				const v = get(`${gridField}_${row.key}`);
				if (v) map[row.key] = v;
			}
			update[`exitInterview.${gridField}`] = map;
		}

		await Exit.findByIdAndUpdate(c!.exit._id, update);
		await afterSave(String(c!.exit._id), c!.exit.status, 'exitInterview');
		await audit({
			candidateId: c!.exit.candidateId ? String(c!.exit.candidateId) : null,
			actor: 'employee',
			action: 'exit_interview_saved',
			ip: getClientAddress()
		});
		return { exitInterviewSaved: true };
	},

	/** 5.4 — the relieving formalities form. */
	saveRelieving: async ({ params, request, getClientAddress }) => {
		const c = await ctx(params.token);
		const bad = guard(c?.exit);
		if (bad) return bad;
		const form = await request.formData();
		const get = (k: string) => String(form.get(k) ?? '').trim();

		const update: Record<string, unknown> = {
			'relievingFormalities.jobTitle': get('jobTitle') || null,
			'relievingFormalities.division': get('division') || null,
			'relievingFormalities.notes': get('notes') || null,
			'relievingFormalities.futureContactEmail': get('futureContactEmail').toLowerCase() || null,
			'relievingFormalities.futureContactMobile': get('futureContactMobile') || null,
			'relievingFormalities.futureContactAddress': get('futureContactAddress') || null,
			'relievingFormalities.emergencyContactName': titleCase(get('emergencyContactName')) || null,
			'relievingFormalities.emergencyContactMobile': get('emergencyContactMobile') || null,
			'relievingFormalities.submittedAt': new Date()
		};
		for (const item of RELIEVING_ITEMS) {
			update[`relievingFormalities.${item.field}`] = get(item.field) || null;
		}

		const errors: string[] = [];
		const futureEmail = get('futureContactEmail');
		if (futureEmail && !isValidEmail(futureEmail))
			errors.push('That future contact email is not valid.');
		for (const [field, label] of [
			['futureContactMobile', 'future contact mobile'],
			['emergencyContactMobile', 'emergency contact mobile']
		] as const) {
			const v = get(field);
			if (v && !isValidMobile(v)) errors.push(`That ${label} is not a valid 10-digit number.`);
		}
		if (errors.length) return no(400, errors.join(' '), 'relieving');

		await Exit.findByIdAndUpdate(c!.exit._id, update);
		await afterSave(String(c!.exit._id), c!.exit.status, 'relievingFormalities');
		await audit({
			candidateId: c!.exit.candidateId ? String(c!.exit.candidateId) : null,
			actor: 'employee',
			action: 'exit_relieving_saved',
			ip: getClientAddress()
		});
		return { relievingSaved: true };
	},

	/** 5.5 — gratuity Form I, only shown when service qualifies. */
	saveGratuity: async ({ params, request, getClientAddress }) => {
		const c = await ctx(params.token);
		const bad = guard(c?.exit);
		if (bad) return bad;
		const e = c!.exit as unknown as Record<string, any>;
		if (!e.gratuity?.applicable)
			return no(400, 'Gratuity does not apply to this exit.', 'gratuity');

		const form = await request.formData();
		const get = (k: string) => String(form.get(k) ?? '').trim();

		await Exit.findByIdAndUpdate(c!.exit._id, {
			'gratuity.totalService': get('totalService') || null,
			'gratuity.nomineeName': titleCase(get('nomineeName')) || null,
			'gratuity.nomineeRelation': get('nomineeRelation') || null,
			'gratuity.addressForCorrespondence': get('addressForCorrespondence') || null,
			'gratuity.submittedAt': new Date()
		});
		await afterSave(String(c!.exit._id), c!.exit.status, 'gratuity');
		await audit({
			candidateId: c!.exit.candidateId ? String(c!.exit.candidateId) : null,
			actor: 'employee',
			action: 'exit_gratuity_saved',
			ip: getClientAddress()
		});
		return { gratuitySaved: true };
	},

	/** Hands the whole pack to HR. Gated on every applicable form being saved
	 *  and a signature image being on file — those are what the documents need
	 *  to be printable. */
	submitAll: async ({ params, getClientAddress }) => {
		const c = await ctx(params.token);
		const bad = guard(c?.exit);
		if (bad) return bad;
		const { exit, company } = c!;
		const e = exit as unknown as Record<string, any>;

		const missing = formStates(e)
			.filter((f) => f.applicable && !f.submitted)
			.map((f) => f.label);
		const signature = await ExitDocument.findOne({
			exitId: exit._id,
			source: 'employee',
			docType: 'signature',
			reviewStatus: { $ne: 'reupload_requested' }
		}).lean();
		if (!signature) missing.push('Your signature image');
		if (missing.length)
			return no(400, `Still to complete: ${missing.join(', ')}.`, 'submit');

		exit.status = 'submitted';
		exit.submittedAt = new Date();
		exit.requestedFields = [];
		await exit.save();

		await audit({
			candidateId: exit.candidateId ? String(exit.candidateId) : null,
			actor: 'employee',
			action: 'exit_submitted',
			field: exit.employeeId,
			ip: getClientAddress()
		});

		// Tell whoever opened this exit. Best-effort: the employee's submission
		// must never fail on a mail hiccup.
		try {
			const brand = brandBySlug(company?.brandSlug ?? undefined);
			const recipients: string[] = [];
			if (exit.createdBy) {
				const admin = await Admin.findById(exit.createdBy).lean();
				if (admin?.email) recipients.push(admin.email);
			}
			await sendExitAlert({
				to: recipients,
				subject: `Exit documents submitted: ${exit.fullName}`,
				lines: [
					`${exit.fullName} (${exit.employeeId}) has submitted their exit documents for review.`,
					`Last working day: ${exit.lwd ?? 'not confirmed'}.`
				],
				brand,
				url: `${baseUrl()}/admin/offboarding/${String(exit._id)}`
			});
		} catch (err) {
			console.error('[exit] submission alert failed:', err);
		}

		return { submitted: true };
	}
};
