// One approver's clearance page. Public and token-gated, no login — the SOP's
// approvers are IT, admin, finance and reporting managers who have no reason to
// hold an account in this app.
//
// The page shows only the No-Dues rows that department owns (NDC_SECTIONS), the
// employee's declaration for context, and a signature upload. Submitting writes
// the verdicts onto the ExitClearance row, which is what the live certificate
// renders from.
import { error, fail } from '@sveltejs/kit';
import { ObjectId } from 'mongodb';
import type { Actions, PageServerLoad } from './$types';
import { Admin, Exit, ExitClearance, ExitDocument } from '$lib/server/db/schema';
import { audit } from '$lib/server/audit';
import { isoToDDMMYYYY, toIsoDate } from '$lib/shared/dates';
import { baseUrl } from '$lib/server/base-url';
import { brandBySlug } from '$lib/shared/brands';
import { deleteFromGridFS, uploadBytesToGridFS } from '$lib/server/storage';
import {
	CLEARANCE_DEPT_LABELS,
	NDC_EMPLOYEE_DECLARATION_LABELS,
	NDC_SECTION_BY_DEPT,
	type ClearanceDept,
	ASSET_ITEMS,
	FNF_PAYROLL_FIELDS,
	FNF_PAYROLL_DATE_KEYS,
	FNF_PAYROLL_CHECKS,
	HANDOVER_DOCS,
	PAYSLIP_DOC_TYPES
} from '$lib/shared/offboarding';
import { parseStoredDate } from '$lib/shared/dates';
import {
	asRecord,
	clearanceProgress,
	exitCompany,
	resolveExitToken,
	serviceLabel,
	serviceMonths
} from '$lib/server/offboarding/exit';
import { sendExitAlert } from '$lib/server/offboarding/mail';
import { advanceFlow, flowSteps } from '$lib/server/offboarding/flow';
import {
	ACCEPTED_EXIT_MIMES,
	ACCEPTED_IMAGE_MIMES,
	MAX_EXIT_FILE_BYTES,
	matchesMagicBytes
} from '$lib/server/offboarding/uploads';
import { EXIT_DOCS, extFor } from '$lib/server/offboarding/documents';

async function ctx(token: string) {
	const resolved = await resolveExitToken(token, 'clearance');
	if (!resolved?.clearance) return null;
	const company = await exitCompany(resolved.exit.companyId);
	return { exit: resolved.exit, clearance: resolved.clearance, company };
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const HANDOVER_LABEL = new Map<string, string>(HANDOVER_DOCS.map((d) => [d.docType, d.label]));

/** The F&F worksheet: the "detailed worksheet shall be attached" that the
 *  payroll No-Dues row asks for. Optional, and it reaches the employee too. */
const WORKSHEET_DOC = 'fnf_statement';

/** The payslip slots payroll fills, oldest first: the three months ending
 *  with the last working day's month, named so payroll knows which to attach.
 *  Someone who served under three months owes fewer payslips. */
function payslipSlots(exit: { doj?: string | null; lwd?: string | null; resignationDate?: string | null }) {
	const end = parseStoredDate(exit.lwd ?? exit.resignationDate);
	const served = serviceMonths(exit.doj, exit.lwd);
	const needed = served === null ? 3 : Math.min(3, Math.max(1, served + 1));
	return PAYSLIP_DOC_TYPES.map((docType, i) => {
		let month: string | null = null;
		if (end) {
			const d = new Date(end.year, end.month - 1 - (2 - i), 1);
			month = `${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
		}
		return { docType, month, required: i >= 3 - needed };
	});
}

/** Everything payroll's page shows beyond the figures: the checks, the
 *  payslip and worksheet slots with what is already on file, the details a
 *  transfer needs, and what the documents zip holds. */
async function payrollView(exit: Record<string, any>, token: string) {
	const files = await ExitDocument.find({ exitId: exit._id })
		.select('docType label source sizeBytes createdAt')
		.sort({ createdAt: 1 })
		.lean();
	const onFile = (docType: string) => {
		const f = files.filter((x) => x.source === 'hr' && x.docType === docType).at(-1);
		return f
			? {
					sizeBytes: Number(f.sizeBytes),
					uploadedAt: (f.createdAt as Date | undefined)?.toISOString() ?? null,
					href: `/x/clearance/${token}/file/${String(f._id)}`
				}
			: null;
	};
	const ticked = new Set<string>(exit.fnf?.payrollChecks ?? []);
	return {
		checks: FNF_PAYROLL_CHECKS.map((c) => ({ key: c.key, label: c.label, checked: ticked.has(c.key) })),
		payslips: payslipSlots(exit).map((s) => ({ ...s, file: onFile(s.docType) })),
		worksheet: onFile(WORKSHEET_DOC),
		details: {
			bankAccountName: (exit.bankAccountName as string | null) ?? null,
			panNo: (exit.panNo as string | null) ?? null,
			uanNo: (exit.uanNo as string | null) ?? null
		},
		pack: {
			href: `/x/clearance/${token}/documents`,
			items: [
				...EXIT_DOCS.filter((d) => !d.letter && d.applies(exit)).map((d) => d.label),
				...files.map(
					(f) =>
						`${HANDOVER_LABEL.get(String(f.docType)) ?? f.label ?? f.docType}${
							f.source === 'employee' ? ' (from the employee)' : f.source === 'approver' ? ' (from an approver)' : ''
						}`
				)
			]
		}
	};
}

export const load: PageServerLoad = async ({ params }) => {
	const c = await ctx(params.token);
	if (!c) error(404, 'This clearance link is invalid, expired, or has been revoked.');
	const { exit, clearance, company } = c;
	const brand = brandBySlug(company?.brandSlug ?? undefined);
	const e = exit as unknown as Record<string, any>;
	const dept = clearance.department as ClearanceDept;
	const section = NDC_SECTION_BY_DEPT.get(dept);

	const rows = asRecord(clearance.rows);
	const remarks = asRecord(clearance.rowRemarks);

	// What the employee declared against these same rows on their exit form.
	// Read at load time, so reopening the link always shows the current claim
	// rather than a snapshot taken when the request was emailed.
	const declaredRows = asRecord(e.ndc?.rows);
	const declaredNotes = asRecord(e.ndc?.rowNotes);

	return {
		brand,
		companyName: company?.name ?? brand.legalName,
		department: dept,
		departmentLabel: CLEARANCE_DEPT_LABELS[dept] ?? dept,
		signatory: section?.signatory ?? '',
		rows: (section?.rows ?? []).map((r) => ({
			key: r.key,
			label: r.label,
			verdict: rows[r.key] ?? '',
			remark: remarks[r.key] ?? '',
			// The employee's own claim for this row, so the approver is confirming
			// or contradicting something specific. Null on the sections the
			// employee is not asked to declare (payroll, finance) and on rows they
			// have not answered yet.
			employeeSaid: declaredRows[r.key]
				? NDC_EMPLOYEE_DECLARATION_LABELS[declaredRows[r.key]] ?? declaredRows[r.key]
				: null,
			employeeSaidValue: declaredRows[r.key] ?? null,
			// Rows with a `noteField` carry their note on the dedicated ndc.* field
			// the employee's form writes; the rest use the generic notes map.
			employeeNote: (r.noteField ? e.ndc?.[r.noteField] : declaredNotes[r.key]) || null
		})),
		employee: {
			fullName: exit.fullName,
			employeeId: exit.employeeId,
			designation: exit.designation ?? null,
			department: e.ndc?.team ?? exit.department ?? null,
			reportingManager: exit.reportingManager ?? null,
			doj: exit.doj ?? null,
			lwd: exit.lwd ?? null,
			resignationDate: exit.resignationDate,
			service: serviceLabel(exit.doj, exit.lwd)
		},
		// What the employee said they handed over, so the approver is checking a
		// claim rather than recalling from memory.
		declaration: {
			filesHandover: e.ndc?.filesHandover ?? null,
			loginsHandover: e.ndc?.loginsHandover ?? null,
			leadsHandover: e.ndc?.leadsHandover ?? null,
			deptOthers: e.ndc?.deptOthers ?? null
		},
		// The SOP's standard asset set, with whatever has been recorded merged
		// over it. Built here rather than read straight off the exit because
		// nothing seeds that list any more: HR used to, on a No Dues form it no
		// longer fills, and an empty list would silently leave IT and admin with
		// nothing to tick. A newly added item also appears on an exit already in
		// progress this way.
		assets: (() => {
			const recorded = new Map(
				((e.assets ?? []) as Record<string, unknown>[]).map((a) => [String(a.item), a])
			);
			return ASSET_ITEMS.map((item) => {
				const row = recorded.get(item);
				return {
					item,
					returned: !!row?.returned,
					note: ((row?.note as string | null) ?? null) as string | null
				};
			});
		})(),
		clearance: {
			approverName: clearance.approverName ?? '',
			approverDesignation: clearance.approverDesignation ?? '',
			verdict: clearance.verdict ?? '',
			remarks: clearance.remarks ?? '',
			hasSignature: !!clearance.signatureGridfsId,
			completed: clearance.status === 'completed',
			completedAt: clearance.completedAt?.toISOString() ?? null
		},
		/** HR sent this signed clearance back: what is missing, and the
		 *  documents to attach — shown above the form, which keeps the earlier
		 *  answers filled in. */
		sendBack: (() => {
			const b = (clearance as unknown as Record<string, any>).sendBack;
			return b?.at
				? { note: (b.note as string | null) ?? null, items: [...(b.items ?? [])] as string[], uploads: [...(b.uploads ?? [])] as string[] }
				: null;
		})(),
		/** IT and admin also confirm the physical asset return (SOP step 6). */
		verifiesAssets: dept === 'it' || dept === 'admin',
		/** Whether this section's rows are ones the employee self-declares. Drives
		 *  the "not answered yet" prompt: on payroll and finance there is nothing
		 *  for the employee to have said, so silence there is not an omission. */
		employeeDeclaresSection: !!section?.employeeDeclares,
		/** Payroll is the only department asked for figures as well as a verdict:
		 *  the full & final settlement is theirs to state, and HR reads it back
		 *  rather than re-keying it from an email. */
		collectsFnf: dept === 'payroll',
		/** HR filled the settlement before handing it over (their step in the
		 *  exit chain), so payroll is reviewing figures rather than entering them. */
		fnfPrefilled: !!e.flow?.hrDoneAt,
		payroll: dept === 'payroll' ? await payrollView(e, params.token) : null,
		fnfFields: FNF_PAYROLL_FIELDS.map((f) => ({
			key: f.key,
			label: f.label,
			date: 'date' in f && !!f.date,
			money: 'money' in f && !!f.money,
			// Dates are stored DD/MM/YYYY; a date input needs ISO.
			value: (() => {
				const raw = ((e.fnf ?? {}) as Record<string, string | null>)[f.key] ?? '';
				if (!raw) return '';
				return 'date' in f && f.date ? (toIsoDate(raw) ?? '') : raw;
			})()
		}))
	};
};

export const actions: Actions = {
	submit: async ({ params, request, getClientAddress }) => {
		const c = await ctx(params.token);
		if (!c) return fail(404, { message: 'This clearance link is invalid.' });
		const { exit, clearance, company } = c;
		if (clearance.status === 'completed')
			return fail(409, { message: 'This clearance has already been signed. Thank you!' });

		const section = NDC_SECTION_BY_DEPT.get(clearance.department as ClearanceDept);
		const form = await request.formData();
		const get = (k: string) => String(form.get(k) ?? '').trim();

		const approverName = get('approverName');
		const approverDesignation = get('approverDesignation');
		const verdict = get('verdict');

		const errors: string[] = [];
		if (!approverName) errors.push('Please enter your name.');
		if (!['no_dues', 'dues'].includes(verdict))
			errors.push('Please record whether there are dues outstanding.');

		// Every row this department owns must be answered — a half-ticked
		// certificate is not a clearance.
		const rows: Record<string, string> = {};
		const rowRemarks: Record<string, string> = {};
		for (const row of section?.rows ?? []) {
			const v = get(`row_${row.key}`);
			if (!['no_dues', 'dues'].includes(v)) {
				errors.push(`Please answer "${row.label}".`);
				continue;
			}
			rows[row.key] = v;
			const remark = get(`remark_${row.key}`);
			if (remark) rowRemarks[row.key] = remark;
		}

		// A signature is what makes this a signed clearance, so one is required
		// unless a previous attempt already stored it.
		const file = form.get('signature');
		let signatureGridfsId: ObjectId | null = null;
		let signatureMime: string | null = null;
		if (file instanceof File && file.size > 0) {
			if (!ACCEPTED_IMAGE_MIMES.includes(file.type))
				errors.push('Please upload your signature as a JPG or PNG image.');
			else if (file.size > MAX_EXIT_FILE_BYTES) errors.push('That signature image is too large.');
			else {
				const bytes = new Uint8Array(await file.arrayBuffer());
				if (!matchesMagicBytes(file.type, bytes))
					errors.push('That file does not look like a genuine image.');
				else {
					signatureGridfsId = await uploadBytesToGridFS(
						bytes,
						`exits/${String(exit._id)}/clearance-${clearance.department}/${crypto.randomUUID()}`,
						file.type
					);
					signatureMime = file.type;
				}
			}
		} else if (!clearance.signatureGridfsId) {
			errors.push('Please upload an image of your signature.');
		}

		// The documents HR asked for when sending this back: each one required,
		// checked like every other exit upload, and stored only once the whole
		// submission is valid.
		const back = (clearance as unknown as Record<string, any>).sendBack;
		const askedUploads: string[] = back?.at ? [...(back.uploads ?? [])] : [];
		const attached: { label: string; bytes: Uint8Array; mime: string; size: number }[] = [];
		for (let i = 0; i < askedUploads.length; i++) {
			const label = askedUploads[i];
			const f = form.get(`requested_${i}`);
			if (!(f instanceof File) || f.size === 0) {
				errors.push(`Please attach: ${label}.`);
				continue;
			}
			if (!ACCEPTED_EXIT_MIMES.includes(f.type)) {
				errors.push(`"${label}" must be a PDF, JPG, PNG or WEBP file.`);
				continue;
			}
			if (f.size > MAX_EXIT_FILE_BYTES) {
				errors.push(`"${label}" is larger than 25 MB.`);
				continue;
			}
			const bytes = new Uint8Array(await f.arrayBuffer());
			if (!matchesMagicBytes(f.type, bytes)) {
				errors.push(`"${label}" does not look like a genuine PDF or image.`);
				continue;
			}
			attached.push({ label, bytes, mime: f.type, size: f.size });
		}

		// Payroll: every F&F check confirmed, a net figure stated, and the
		// payslips this exit needs either attached now or already on file.
		const payslipUploads: { docType: string; bytes: Uint8Array; mime: string; size: number }[] = [];
		if (clearance.department === 'payroll') {
			for (const c of FNF_PAYROLL_CHECKS)
				if (form.get(`check_${c.key}`) !== 'on') errors.push(`Please confirm you have checked: ${c.label.toLowerCase()}.`);
			if (!get('netAmount')) errors.push('Please enter the net F&F payable.');
			const have = new Set(
				(
					await ExitDocument.find({
						exitId: exit._id,
						source: 'hr',
						docType: { $in: [...PAYSLIP_DOC_TYPES, WORKSHEET_DOC] }
					})
						.select('docType')
						.lean()
				).map((d) => String(d.docType))
			);
			const slots = [
				...payslipSlots(exit).map((s) => ({
					docType: s.docType,
					label: `the payslip for ${s.month ?? `month ${s.docType.slice(-1)}`}`,
					required: s.required
				})),
				{ docType: WORKSHEET_DOC, label: 'the F&F worksheet', required: false }
			];
			for (const slot of slots) {
				const f = form.get(slot.docType);
				const what = slot.label[0].toUpperCase() + slot.label.slice(1);
				if (!(f instanceof File) || f.size === 0) {
					if (slot.required && !have.has(slot.docType)) errors.push(`Please upload ${slot.label}.`);
					continue;
				}
				if (!ACCEPTED_EXIT_MIMES.includes(f.type)) {
					errors.push(`${what} must be a PDF, JPG, PNG or WEBP file.`);
					continue;
				}
				if (f.size > MAX_EXIT_FILE_BYTES) {
					errors.push(`${what} is larger than 25 MB.`);
					continue;
				}
				const bytes = new Uint8Array(await f.arrayBuffer());
				if (!matchesMagicBytes(f.type, bytes)) {
					errors.push(`${what} does not look like a genuine PDF or image.`);
					continue;
				}
				payslipUploads.push({ docType: slot.docType, bytes, mime: f.type, size: f.size });
			}
		}

		if (errors.length) {
			// A signature that uploaded before a later validation error would
			// otherwise be orphaned in GridFS with nothing pointing at it.
			if (signatureGridfsId) await deleteFromGridFS(signatureGridfsId).catch(() => {});
			return fail(400, { message: errors.join(' ') });
		}

		// IT and admin verifying the physical asset return writes straight onto the
		// exit — it is one shared list, not a per-department copy. `assetseen_*`
		// marks which rows this approver's form actually rendered, so a department
		// that never saw a row cannot clear it by omission.
		if (clearance.department === 'it' || clearance.department === 'admin') {
			// Mongoose subdocuments must be converted before spreading: `...doc`
			// copies internal document state, not the plain fields, and the
			// resulting object silently fails to save.
			const current = new Map(
				(((exit as unknown as Record<string, any>).assets ?? []) as {
					toObject?: () => Record<string, unknown>;
				}[]).map((raw) => {
					const a = (raw.toObject ? raw.toObject() : raw) as Record<string, unknown>;
					return [String(a.item), a];
				})
			);
			// Over the standard set, not over what happens to be stored: on the
			// first clearance to reach this exit there is nothing stored yet, and
			// mapping an empty list would quietly discard every tick just made.
			const assets = ASSET_ITEMS.map((item) => {
				const a = current.get(item) ?? { item, returned: false, note: null };
				if (!form.has(`assetseen_${item}`)) return a;
				return { ...a, item, returned: form.get(`asset_${item}`) === 'on', verifiedAt: new Date() };
			});
			await Exit.findByIdAndUpdate(exit._id, { assets });
		}

		// Payroll states the full & final figures here, on the page they already
		// have to visit to sign off. Bounded by FNF_PAYROLL_FIELDS so a
		// hand-crafted POST cannot reach a field this form never showed — the
		// same rule the NDC rows and the asset list follow.
		if (clearance.department === 'payroll') {
			const fnfPatch: Record<string, unknown> = {};
			for (const f of FNF_PAYROLL_FIELDS) {
				const raw = get(f.key);
				fnfPatch[`fnf.${f.key}`] = FNF_PAYROLL_DATE_KEYS.has(f.key)
					? isoToDDMMYYYY(raw) || null
					: raw || null;
			}
			fnfPatch['fnf.payrollChecks'] = FNF_PAYROLL_CHECKS.map((c) => c.key);
			fnfPatch['fnf.submittedByPayrollAt'] = new Date();
			fnfPatch['fnf.submittedByPayrollName'] = approverName;
			fnfPatch['fnf.updatedAt'] = new Date();
			await Exit.findByIdAndUpdate(exit._id, fnfPatch);
		}

		if (signatureGridfsId) {
			// Replace rather than accumulate: one signature per clearance.
			if (clearance.signatureGridfsId)
				await deleteFromGridFS(clearance.signatureGridfsId as ObjectId).catch(() => {});
			clearance.signatureGridfsId = signatureGridfsId;
			clearance.signatureMime = signatureMime;
		}
		clearance.approverName = approverName;
		clearance.approverDesignation = approverDesignation || null;
		clearance.set('rows', rows);
		clearance.set('rowRemarks', rowRemarks);
		clearance.verdict = verdict;
		clearance.remarks = get('remarks') || null;
		for (const a of attached) {
			const gridfsId = await uploadBytesToGridFS(
				a.bytes,
				`exits/${String(exit._id)}/clearance-${clearance.department}/attached-${crypto.randomUUID()}.${extFor(a.mime)}`,
				a.mime
			);
			await ExitDocument.create({
				exitId: exit._id,
				source: 'approver',
				clearanceId: clearance._id,
				docType: `approver_${clearance.department}`,
				label: a.label,
				gridfsId,
				mime: a.mime,
				sizeBytes: a.size
			});
		}
		// Payroll's payslips and worksheet fill the same handover slots HR's
		// page has, so they reach the employee's final documents. One file per
		// slot: a new upload replaces whatever was there.
		for (const u of payslipUploads) {
			const gridfsId = await uploadBytesToGridFS(
				u.bytes,
				`exits/${String(exit._id)}/${u.docType}/${crypto.randomUUID()}.${extFor(u.mime)}`,
				u.mime
			);
			const replaced = await ExitDocument.find({ exitId: exit._id, source: 'hr', docType: u.docType }).lean();
			await ExitDocument.create({
				exitId: exit._id,
				source: 'hr',
				clearanceId: clearance._id,
				docType: u.docType,
				label: HANDOVER_LABEL.get(u.docType) ?? u.docType,
				gridfsId,
				mime: u.mime,
				sizeBytes: u.size
			});
			for (const o of replaced) {
				await deleteFromGridFS(o.gridfsId as ObjectId).catch(() => {});
				await ExitDocument.deleteOne({ _id: o._id });
			}
		}

		// The request is answered: it moves to the history, so HR can see a
		// clearance was sent back once and what for.
		const wasSentBack = !!back?.at;
		if (wasSentBack) {
			const h = clearance.get('sendBackHistory') ?? [];
			clearance.set('sendBackHistory', [
				...h,
				{ note: back.note, items: back.items, uploads: back.uploads, at: back.at, by: back.by, resolvedAt: new Date() }
			]);
			clearance.set('sendBack', null);
		}
		clearance.status = 'completed';
		clearance.completedAt = new Date();
		clearance.completedIp = getClientAddress();
		await clearance.save();

		await audit({
			candidateId: exit.candidateId ? String(exit.candidateId) : null,
			actor: approverName,
			action: 'exit_clearance_signed',
			field: String(clearance.department),
			newValue: verdict,
			ip: getClientAddress()
		});

		// An exit on the chain moves itself on: this signature readies the next
		// step's mail for HR to review and send (or hands the F&F to HR, or
		// schedules the release).
		// Exits from before the chain keep the old rule — every clearance in,
		// so the exit is cleared — and never pull a completed exit backwards.
		const onChain = !!(exit as unknown as { flow?: { startedAt?: Date | null } }).flow?.startedAt;
		const all = await ExitClearance.find({ exitId: exit._id }).select('status').lean();
		const progress = clearanceProgress(all.map((a) => ({ status: String(a.status) })));
		let next: string | null = null;
		if (onChain) {
			await advanceFlow(String(exit._id));
			const [fresh, rows] = await Promise.all([
				Exit.findById(exit._id).lean(),
				ExitClearance.find({ exitId: exit._id }).lean()
			]);
			const step = fresh
				? flowSteps(fresh as Record<string, unknown>, rows as Record<string, unknown>[]).find(
						(s) => s.status === 'active' || s.status === 'blocked'
					)
				: null;
			next = !step
				? null
				: step.status === 'blocked'
					? `Next: ${step.label} — no email set yet. Add it in Mail settings on the exit page.`
					: step.ready
						? `Next: the ${step.label} mail to ${step.to} is ready — review it on the exit page and send it.`
						: `Next: ${step.label}.`;
		} else if (progress.allDone && ['clearances', 'submitted'].includes(exit.status)) {
			await Exit.findByIdAndUpdate(exit._id, { status: 'cleared' });
		}

		// Tell HR. Best-effort — the approver's signature must not fail on mail.
		try {
			const brand = brandBySlug(company?.brandSlug ?? undefined);
			const recipients: string[] = [];
			if (exit.createdBy) {
				const admin = await Admin.findById(exit.createdBy).lean();
				if (admin?.email) recipients.push(admin.email);
			}
			await sendExitAlert({
				to: recipients,
				subject: wasSentBack
					? `Clearance updated: ${exit.fullName}`
					: !onChain && progress.allDone
						? `All clearances signed: ${exit.fullName}`
						: `Clearance signed: ${exit.fullName}`,
				lines: [
					`${approverName} ${wasSentBack ? 'updated and re-signed' : 'signed'} the ${CLEARANCE_DEPT_LABELS[clearance.department as ClearanceDept]} ` +
						`clearance for ${exit.fullName} (${exit.employeeId}).`,
					...(attached.length ? [`Attached: ${attached.map((a) => a.label).join(', ')}.`] : []),
					...(payslipUploads.length
						? [`Uploaded: ${payslipUploads.map((u) => HANDOVER_LABEL.get(u.docType) ?? u.docType).join(', ')}.`]
						: []),
					...(clearance.department === 'payroll' ? [`Net F&F payable: ${get('netAmount')}.`] : []),
					`Verdict: ${verdict === 'no_dues' ? 'No dues outstanding' : 'Dues outstanding'}.`,
					onChain
						? (next ?? 'The exit chain is complete.')
						: progress.allDone
							? 'Every requested clearance is now in — the exit is ready for full and final settlement.'
							: `${progress.done} of ${progress.total} clearances signed.`
				],
				brand,
				url: `${baseUrl()}/admin/offboarding/${String(exit._id)}`
			});
		} catch (err) {
			console.error('[exit] clearance alert failed:', err);
		}

		return { done: true };
	}
};
