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
import { baseUrl } from '$lib/server/base-url';
import { brandBySlug } from '$lib/shared/brands';
import { deleteFromGridFS, uploadBytesToGridFS } from '$lib/server/storage';
import {
	CLEARANCE_DEPT_LABELS,
	NDC_SECTION_BY_DEPT,
	type ClearanceDept
} from '$lib/shared/offboarding';
import {
	asRecord,
	clearanceProgress,
	exitCompany,
	resolveExitToken,
	serviceLabel
} from '$lib/server/offboarding/exit';
import { sendExitAlert } from '$lib/server/offboarding/mail';
import {
	ACCEPTED_IMAGE_MIMES,
	MAX_EXIT_FILE_BYTES,
	matchesMagicBytes
} from '$lib/server/offboarding/uploads';

async function ctx(token: string) {
	const resolved = await resolveExitToken(token, 'clearance');
	if (!resolved?.clearance) return null;
	const company = await exitCompany(resolved.exit.companyId);
	return { exit: resolved.exit, clearance: resolved.clearance, company };
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
			remark: remarks[r.key] ?? ''
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
		assets: (e.assets ?? []).map((a: Record<string, unknown>) => ({
			item: a.item as string,
			returned: !!a.returned,
			note: (a.note as string | null) ?? null
		})),
		clearance: {
			approverName: clearance.approverName ?? '',
			approverDesignation: clearance.approverDesignation ?? '',
			verdict: clearance.verdict ?? '',
			remarks: clearance.remarks ?? '',
			hasSignature: !!clearance.signatureGridfsId,
			completed: clearance.status === 'completed',
			completedAt: clearance.completedAt?.toISOString() ?? null
		},
		/** IT and admin also confirm the physical asset return (SOP step 6). */
		verifiesAssets: dept === 'it' || dept === 'admin'
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
			const current = ((exit as unknown as Record<string, any>).assets ?? []) as {
				toObject?: () => Record<string, unknown>;
			}[];
			const assets = current.map((raw) => {
				const a = (raw.toObject ? raw.toObject() : raw) as Record<string, unknown>;
				if (!form.has(`assetseen_${String(a.item)}`)) return a;
				return {
					...a,
					returned: form.get(`asset_${String(a.item)}`) === 'on',
					verifiedAt: new Date()
				};
			});
			await Exit.findByIdAndUpdate(exit._id, { assets });
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

		// Every clearance in, so the exit is cleared. Only advance from the
		// clearance stages — never pull a completed exit backwards.
		const all = await ExitClearance.find({ exitId: exit._id }).select('status').lean();
		const progress = clearanceProgress(all.map((a) => ({ status: String(a.status) })));
		if (progress.allDone && ['clearances', 'submitted'].includes(exit.status)) {
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
				subject: progress.allDone
					? `All clearances signed: ${exit.fullName}`
					: `Clearance signed: ${exit.fullName}`,
				lines: [
					`${approverName} signed the ${CLEARANCE_DEPT_LABELS[clearance.department as ClearanceDept]} ` +
						`clearance for ${exit.fullName} (${exit.employeeId}).`,
					`Verdict: ${verdict === 'no_dues' ? 'No dues outstanding' : 'Dues outstanding'}.`,
					progress.allDone
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
