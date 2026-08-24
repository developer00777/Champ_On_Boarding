// The exit documents, rendered live from the Exit record on every download.
//
// Nothing here is cached or frozen into a stored file: HR asked to be able to
// pull a current copy "at any instant for physical keeping", and a clearance
// signed a minute ago has to show up in the next download. That means every
// generator takes the exit (plus its clearances and signature images) and draws
// whatever state it is in — including a half-answered form, which prints with
// blank rules so the same PDF works as the print-and-sign copy.
import type { PDFImage } from 'pdf-lib';
import type { BrandTheme } from '$lib/shared/brands';
import { todayDDMMYYYYInIST } from '$lib/shared/dates';
import {
	ASSET_ITEMS,
	EXIT_Q11_ROWS,
	EXIT_Q11_SCALE,
	EXIT_Q12_ROWS,
	EXIT_Q12_SCALE,
	EXIT_Q13_ROWS,
	EXIT_Q13_SCALE,
	EXIT_RECOMMEND_OPTIONS,
	EXIT_TEXT_QUESTIONS,
	EXIT_WORKLOAD_OPTIONS,
	NDA_CLAUSES,
	NDA_REGISTERED_OFFICE,
	RELIEVING_ITEMS,
	type NdcSection
} from '$lib/shared/offboarding';
import { NDC_SECTIONS } from '$lib/shared/offboarding';
import {
	BLACK,
	BODY,
	GREY,
	RULE,
	SHADE,
	choiceRow,
	clause,
	createDoc,
	ensure,
	fieldGrid,
	finish,
	gap,
	keepTogether,
	newPage,
	noteBox,
	para,
	questionBox,
	ratingGrid,
	sanitize,
	sectionHeading,
	signaturePanels,
	title,
	wrap,
	type DocCtx,
	type SignaturePanel
} from './pdf-kit';
import { embedImage } from './pdf-kit';
import { asRecord } from './exit';

/** Everything the generators read. Assembled once by the caller (see
 *  offboarding/documents.ts) so a single download can render several documents
 *  from one set of fetches and one set of embedded signature images. */
export interface ExitPdfInput {
	exit: Record<string, any>;
	brand: BrandTheme;
	companyName: string;
	/** Employee's uploaded signature, as raw bytes. */
	employeeSignature: Uint8Array | null;
	/** Per-department approver signature bytes, keyed by ExitClearance.department. */
	clearanceSignatures: Record<string, Uint8Array>;
	/** The clearance rows as ndcState() computed them. */
	ndc: {
		dept: string;
		deptLabel: string;
		signatory: string;
		rows: { key: string; label: string; verdict: string | null; remark: string | null }[];
		verdict: string | null;
		remarks: string | null;
		approverName: string | null;
		approverDesignation: string | null;
		signed: boolean;
		signedAt: string | null;
	}[];
	/** Computed service length, e.g. "4 years 8 months". */
	serviceLabel: string | null;
}

const dash = (v: unknown): string => {
	const s = String(v ?? '').trim();
	return s;
};

/** The identity block every exit document opens with. Drawn from the exit
 *  record so the four documents can never disagree about who this is. */
function identityRows(e: Record<string, any>) {
	return [
		{ label: 'Name', value: dash(e.fullName) },
		{ label: 'Employee No.', value: dash(e.employeeId) },
		{ label: 'Team / Dept.', value: dash(e.ndc?.team) || dash(e.department) },
		{ label: 'Reporting to', value: dash(e.reportingManager) },
		{ label: 'Date of Joining', value: dash(e.doj) },
		{ label: 'Date of Leaving', value: dash(e.lwd) || dash(e.resignationDate) },
		{ label: 'Email ID', value: dash(e.personalEmail) },
		{ label: 'Name as per Bank', value: dash(e.ndc?.nameAsPerBank) || dash(e.bankAccountName) },
		{ label: 'Mobile No.', value: dash(e.personalMobile) },
		{ label: 'Designation', value: dash(e.designation) }
	];
}

async function begin(input: ExitPdfInput, docTitle: string) {
	const ctx = await createDoc(input.brand, input.companyName, docTitle, todayDDMMYYYYInIST());
	const employeeSig = input.employeeSignature
		? await embedImage(ctx.doc, input.employeeSignature)
		: null;
	const clearanceSigs: Record<string, PDFImage | null> = {};
	for (const [dept, bytes] of Object.entries(input.clearanceSignatures)) {
		clearanceSigs[dept] = await embedImage(ctx.doc, bytes);
	}
	return { ctx, employeeSig, clearanceSigs };
}

/** The employee's signature panel, captioned per document. */
function employeePanel(
	image: PDFImage | null,
	submittedAt: Date | string | null | undefined,
	caption = 'Employee'
): SignaturePanel {
	return {
		caption,
		image,
		date: submittedAt ? formatStamp(submittedAt) : null
	};
}

function formatStamp(value: Date | string): string {
	const d = value instanceof Date ? value : new Date(value);
	if (isNaN(d.getTime())) return '';
	return d.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata' });
}

// ── 1. No Dues / Clearance Certificate ───────────────────────────────────────

export async function noDuesPdf(input: ExitPdfInput): Promise<Uint8Array> {
	const { exit: e } = input;
	const { ctx, employeeSig, clearanceSigs } = await begin(input, 'No Dues Certificate');

	title(ctx, 'NO DUES CERTIFICATE / CLEARANCE CERTIFICATE');
	fieldGrid(ctx, identityRows(e));

	// Section tables: one block per department, its rows ticked No Dues / Dues
	// with the approver's remark, then that department's signature line.
	for (const section of input.ndc) {
		const def = NDC_SECTIONS.find((s) => s.dept === section.dept);
		drawNdcSection(ctx, section, def, clearanceSigs[section.dept] ?? null);
	}

	// Employee's own handover notes — the "List should be attached" / "Brief
	// backside of the page" prompts on the printed form.
	const notes: { label: string; value: string }[] = [
		{ label: 'Files handed over (soft & hard copies)', value: dash(e.ndc?.filesHandover) },
		{ label: 'Official logins / credentials handed over', value: dash(e.ndc?.loginsHandover) },
		{ label: 'Leads & client follow-up details', value: dash(e.ndc?.leadsHandover) },
		{ label: 'Other remarks', value: dash(e.ndc?.deptOthers) }
	].filter((n) => n.value);
	if (notes.length) {
		sectionHeading(ctx, "Employee's handover details");
		for (const n of notes) questionBox(ctx, n.label, n.value, { minH: 16 });
	}

	// Assets, when the employee declared any.
	const assets = (e.assets ?? []) as { item: string; returned: boolean; note?: string | null }[];
	if (assets.length) {
		sectionHeading(ctx, 'Company assets returned');
		assetTable(ctx, assets);
	}

	// Final clearance remarks (HRD).
	const hrd = input.ndc.find((s) => s.dept === 'hrd');
	sectionHeading(ctx, 'Remarks on Final Clearance (HRD)');
	questionBox(ctx, '', hrd?.remarks ?? null, { minH: 34 });

	const payroll = input.ndc.find((s) => s.dept === 'payroll');
	const manager = input.ndc.find((s) => s.dept === 'manager');
	signaturePanels(ctx, [
		{
			caption: 'Payroll In-Charge',
			subCaption: payroll?.approverName ?? null,
			image: clearanceSigs['payroll'] ?? null,
			date: payroll?.signedAt ? formatStamp(payroll.signedAt) : null
		},
		{
			caption: 'HRD',
			subCaption: hrd?.approverName ?? null,
			image: clearanceSigs['hrd'] ?? null,
			date: hrd?.signedAt ? formatStamp(hrd.signedAt) : null
		},
		{
			caption: 'Divisional Head / President',
			subCaption: manager?.approverName ?? null,
			image: clearanceSigs['manager'] ?? null,
			date: manager?.signedAt ? formatStamp(manager.signedAt) : null
		}
	]);

	noteBox(ctx, [
		'Note:',
		'- Accounts to check the last salary paid month before processing F&F pay.',
		'- This certificate is required to be processed within 10 days from the date of leaving of the employee.',
		'- Departmental Head is only authorized to give certificate.',
		'- Settlement will have to be made to the leaver only after obtaining this certificate duly approved by all concerned.'
	]);

	return finish(ctx);
}

/** One department block of the No-Dues certificate: a three-column tick table
 *  (row | No Dues/Dues | remark) plus that department's signature. */
function drawNdcSection(
	ctx: DocCtx,
	section: ExitPdfInput['ndc'][number],
	def: NdcSection | undefined,
	sig: PDFImage | null
) {
	const size = BODY - 0.5;
	const labelW = ctx.CW * 0.52;
	const tickW = ctx.CW * 0.13;
	const remarkW = ctx.CW - labelW - tickW * 2;
	const headH = size + 11;

	/** The section's heading bar: department name on the left, the Dues / No Dues
	 *  / Remarks column labels across the rest. Redrawn after a page break — a
	 *  continuation page of ticks with no section name and no column labels is
	 *  unreadable, and on a clearance certificate, misleading. */
	const drawHead = (continued: boolean) => {
		// Reserve the bar plus two rows so a section never breaks immediately
		// after its own header.
		ensure(ctx, headH + (size + 9) * 2 + 6);
		ctx.page.drawRectangle({ x: ctx.M, y: ctx.y - headH, width: ctx.CW, height: headH, color: SHADE });
		ctx.page.drawText(sanitize(continued ? `${section.deptLabel} (continued)` : section.deptLabel), {
			x: ctx.M + 6,
			y: ctx.y - headH + 4,
			size,
			font: ctx.fontB,
			color: ctx.inkColor
		});
		const heads: [string, number][] = [
			['Dues', labelW],
			['No Dues', labelW + tickW],
			['Remarks', labelW + tickW * 2]
		];
		for (const [label, offset] of heads) {
			const w = ctx.fontB.widthOfTextAtSize(label, size - 1);
			const cellW = label === 'Remarks' ? remarkW : tickW;
			ctx.page.drawText(label, {
				x: ctx.M + offset + (cellW - w) / 2,
				y: ctx.y - headH + 4,
				size: size - 1,
				font: ctx.fontB,
				color: GREY
			});
		}
		ctx.y -= headH;
	};

	drawHead(false);
	let colTop = ctx.y + headH;

	for (const row of section.rows) {
		const lines = wrap(ctx.fontR, row.label, size, labelW - 12);
		const remarkLines = row.remark ? wrap(ctx.fontR, row.remark, size - 1, remarkW - 8) : [];
		const rowH = Math.max(
			size + 9,
			lines.length * (size + 2.5) + 6,
			remarkLines.length * (size + 1.5) + 6
		);
		if (ctx.y - rowH < ctx.bottomY) {
			// Close this page's column rules, then reopen the table on the next
			// page under a repeated header.
			ndcVerticals(ctx, colTop, ctx.y, labelW, tickW);
			newPage(ctx);
			drawHead(true);
			colTop = ctx.y + headH;
		}
		let ty = ctx.y - size - 4;
		for (const line of lines) {
			ctx.page.drawText(line, { x: ctx.M + 6, y: ty, size, font: ctx.fontR, color: BLACK });
			ty -= size + 2.5;
		}
		// The tick goes in whichever column the department chose; both stay empty
		// until they answer, so an unsigned certificate prints as a blank form.
		const cy = ctx.y - rowH / 2 - size * 0.35;
		for (const [verdict, offset] of [
			['dues', labelW],
			['no_dues', labelW + tickW]
		] as const) {
			if (row.verdict !== verdict) continue;
			const mark = 'X';
			const w = ctx.fontB.widthOfTextAtSize(mark, size + 1);
			ctx.page.drawText(mark, {
				x: ctx.M + offset + (tickW - w) / 2,
				y: cy,
				size: size + 1,
				font: ctx.fontB,
				color: ctx.inkColor
			});
		}
		let ry = ctx.y - size - 4;
		for (const line of remarkLines) {
			ctx.page.drawText(line, {
				x: ctx.M + labelW + tickW * 2 + 4,
				y: ry,
				size: size - 1,
				font: ctx.fontR,
				color: GREY
			});
			ry -= size + 1.5;
		}
		ctx.y -= rowH;
		ctx.page.drawRectangle({ x: ctx.M, y: ctx.y, width: ctx.CW, height: 0.5, color: RULE });
	}
	ndcVerticals(ctx, colTop, ctx.y, labelW, tickW);

	// Department verdict + signature, inline under its own table.
	ctx.y -= 6;
	const verdictText = section.verdict
		? section.verdict === 'no_dues'
			? 'No dues outstanding'
			: 'Dues outstanding'
		: 'Awaiting clearance';
	ensure(ctx, 46);
	ctx.page.drawText(sanitize(`Approval: ${verdictText}`), {
		x: ctx.M,
		y: ctx.y - size,
		size,
		font: ctx.fontB,
		color: section.verdict ? ctx.inkColor : GREY
	});
	ctx.y -= size + 6;
	if (section.remarks) {
		para(ctx, `Remarks: ${section.remarks}`, { size: size - 0.5, color: GREY, gapAfter: 2 });
	}
	signaturePanels(ctx, [
		{
			caption: def?.signatory ?? section.deptLabel,
			subCaption:
				[section.approverName, section.approverDesignation].filter(Boolean).join(', ') || null,
			image: sig,
			date: section.signedAt ? formatStamp(section.signedAt) : null
		}
	]);
}

function ndcVerticals(ctx: DocCtx, top: number, bottom: number, labelW: number, tickW: number) {
	const h = top - bottom;
	if (h <= 0) return;
	for (const x of [ctx.M, ctx.M + labelW, ctx.M + labelW + tickW, ctx.M + labelW + tickW * 2, ctx.M + ctx.CW]) {
		ctx.page.drawRectangle({ x, y: bottom, width: 0.5, height: h, color: RULE });
	}
	ctx.page.drawRectangle({ x: ctx.M, y: top, width: ctx.CW, height: 0.5, color: RULE });
}

function assetTable(
	ctx: DocCtx,
	assets: { item: string; returned: boolean; note?: string | null }[]
) {
	const size = BODY - 0.5;
	const itemW = ctx.CW * 0.42;
	const statusW = ctx.CW * 0.18;
	const noteW = ctx.CW - itemW - statusW;
	const rowH = size + 9;
	ensure(ctx, rowH * 2);
	const top = ctx.y;
	ctx.page.drawRectangle({ x: ctx.M, y: ctx.y - rowH, width: ctx.CW, height: rowH, color: SHADE });
	const heads: [string, number, number][] = [
		['Asset', ctx.M + 6, itemW],
		['Returned', ctx.M + itemW + 6, statusW],
		['Remarks', ctx.M + itemW + statusW + 6, noteW]
	];
	for (const [label, x] of heads) {
		ctx.page.drawText(label, { x, y: ctx.y - rowH + 4, size: size - 1, font: ctx.fontB, color: ctx.inkColor });
	}
	ctx.y -= rowH;
	for (const a of assets) {
		ensure(ctx, rowH);
		ctx.page.drawText(sanitize(a.item), { x: ctx.M + 6, y: ctx.y - size - 3, size, font: ctx.fontR, color: BLACK });
		ctx.page.drawText(a.returned ? 'Yes' : 'No', {
			x: ctx.M + itemW + 6,
			y: ctx.y - size - 3,
			size,
			font: ctx.fontB,
			color: a.returned ? ctx.inkColor : GREY
		});
		if (a.note) {
			const line = wrap(ctx.fontR, a.note, size - 1, noteW - 8)[0];
			ctx.page.drawText(line, {
				x: ctx.M + itemW + statusW + 6,
				y: ctx.y - size - 3,
				size: size - 1,
				font: ctx.fontR,
				color: GREY
			});
		}
		ctx.y -= rowH;
		ctx.page.drawRectangle({ x: ctx.M, y: ctx.y, width: ctx.CW, height: 0.5, color: RULE });
	}
	for (const x of [ctx.M, ctx.M + itemW, ctx.M + itemW + statusW, ctx.M + ctx.CW]) {
		const h = top - ctx.y;
		if (h > 0) ctx.page.drawRectangle({ x, y: ctx.y, width: 0.5, height: h, color: RULE });
	}
	ctx.y -= 10;
}

// ── 2. Exit Interview Form ───────────────────────────────────────────────────

export async function exitInterviewPdf(input: ExitPdfInput): Promise<Uint8Array> {
	const { exit: e } = input;
	const ei = (e.exitInterview ?? {}) as Record<string, any>;
	const { ctx, employeeSig } = await begin(input, 'Exit Interview Form');

	title(ctx, 'EXIT INTERVIEW FORM');
	fieldGrid(ctx, [
		{ label: 'Employee Name', value: dash(e.fullName) },
		{ label: 'Supervisor', value: dash(ei.supervisor) || dash(e.reportingManager) },
		{ label: 'Division', value: dash(ei.division) || dash(e.division) },
		{ label: 'Job Title', value: dash(ei.jobTitle) || dash(e.designation) },
		{ label: 'Hire Date', value: dash(e.doj) },
		{ label: 'Separation Date', value: dash(e.lwd) || dash(e.resignationDate) }
	]);

	questionBox(
		ctx,
		'Reason for leaving the organization (Voluntary / Involuntary)',
		[
			e.separationType ? (e.separationType === 'voluntary' ? 'Voluntary' : 'Involuntary') : '',
			dash(ei.reasonForLeaving)
		]
			.filter(Boolean)
			.join(' — ') || null,
		{ minH: 24 }
	);

	// Q1-Q9 in printed order.
	for (const q of EXIT_TEXT_QUESTIONS.slice(0, 9)) {
		questionBox(ctx, `${q.n}. ${q.label}`, dash(ei[q.field]) || null);
	}

	// Q10 — workload.
	ensure(ctx, 40);
	para(ctx, '10. Was your workload usually:', { font: ctx.fontB, gapAfter: 3, color: ctx.inkColor });
	choiceRow(ctx, EXIT_WORKLOAD_OPTIONS, dash(ei.q10Workload) || null, { indent: 10 });

	// Q11 — supervisor grid.
	sectionHeading(ctx, '11. What did you think of your supervisor on the following points');
	ratingGrid(ctx, EXIT_Q11_SCALE, EXIT_Q11_ROWS, asRecord(ei.q11Supervisor));

	// Q12 — organisation grid + comments.
	sectionHeading(ctx, '12. How would you rate the following');
	ratingGrid(ctx, EXIT_Q12_SCALE, EXIT_Q12_ROWS, asRecord(ei.q12Ratings));
	questionBox(ctx, 'Comments:', dash(ei.q12Comments) || null, { minH: 24 });

	// Q13 — benefits grid.
	sectionHeading(ctx, '13. How did you feel about the employee benefits provided by the company');
	ratingGrid(ctx, EXIT_Q13_SCALE, EXIT_Q13_ROWS, asRecord(ei.q13Benefits), { labelShare: 0.34 });

	// Q14 A/B.
	questionBox(
		ctx,
		'14. A) What advice would you pass on to the next person selected to perform your job duties?',
		dash(ei.q14aAdviceToSuccessor) || null
	);
	ensure(ctx, 42);
	para(ctx, 'B) Would you recommend the company to a friend as a good organization to work for?', {
		font: ctx.fontB,
		gapAfter: 3,
		color: ctx.inkColor
	});
	choiceRow(ctx, EXIT_RECOMMEND_OPTIONS, dash(ei.q14bWouldRecommend) || null, { indent: 10 });

	// Q15.
	questionBox(
		ctx,
		`15. What suggestions do you have to make ${input.companyName} a better place to work?`,
		dash(ei.q15Suggestions) || null
	);

	signaturePanels(ctx, [
		{ caption: 'Human Resource Representative', date: null },
		employeePanel(employeeSig, ei.submittedAt)
	]);

	return finish(ctx);
}

// ── 3. Non-Disclosure & Non-Compete Agreement ────────────────────────────────

export async function ndaPdf(input: ExitPdfInput): Promise<Uint8Array> {
	const { exit: e, brand } = input;
	const nda = (e.nda ?? {}) as Record<string, any>;
	const { ctx, employeeSig } = await begin(input, 'NDA & Non-Compete');

	title(ctx, 'NON DISCLOSURE & NON COMPETE AGREEMENT');

	const agreementDate = dash(nda.agreementDate);
	para(
		ctx,
		`THIS NON-DISCLOSURE & NON-COMPETE AGREEMENT has been entered into this day of ` +
			`${agreementDate || '.........................'} (DD/MM/YYYY)`,
		{ gapAfter: 8 }
	);

	para(ctx, 'BY AND BETWEEN', { font: ctx.fontB, gapAfter: 3, color: ctx.inkColor });
	para(
		ctx,
		`${brand.legalName} whose registered office is at ${NDA_REGISTERED_OFFICE}`,
		{ gapAfter: 4 }
	);
	para(
		ctx,
		'Hereinafter called "CHAMPION/DISCLOSING PARTY" (which expression unless repugnant to the context shall mean ' +
			'and include its subsidiaries, affiliates, and its successors and assigns) of the FIRST PART',
		{ size: BODY - 0.5, color: GREY, gapAfter: 8 }
	);

	para(ctx, 'AND', { font: ctx.fontB, gapAfter: 3, color: ctx.inkColor });
	fieldGrid(
		ctx,
		[
			{ label: 'Name', value: dash(nda.fullName) || dash(e.fullName) },
			{ label: 'Residing at', value: dash(nda.permanentAddress) }
		],
		{ cols: 1 }
	);
	para(
		ctx,
		'Hereinafter referred to as "EMPLOYEE" (which expression unless repugnant to the context shall include all ' +
			'beneficiaries of the said Employee/Consultant)',
		{ size: BODY - 0.5, color: GREY, gapAfter: 10 }
	);

	for (const c of NDA_CLAUSES) {
		clause(ctx, `${c.n}.`, c.heading, c.body);
	}

	gap(ctx, 4);
	// The witness clause, the executing party's details and the signature lines
	// are one block: split across a page break they read as an unsigned
	// agreement followed by a stray signature sheet.
	keepTogether(ctx, 155, () => {
		para(
			ctx,
			'IN WITNESS WHEREOF, the parties hereto have in their complete legal capacity caused this Agreement to be ' +
				'executed as of the date first written above.',
			{ gapAfter: 10 }
		);

		fieldGrid(
			ctx,
			[
				{ label: 'Employee Name', value: dash(nda.fullName) || dash(e.fullName) },
				{ label: 'Aadhaar Card #', value: nda.aadhaarLast4 ? `XXXX XXXX ${nda.aadhaarLast4}` : '' },
				{ label: 'Date', value: agreementDate }
			],
			{ cols: 1 }
		);

		signaturePanels(ctx, [
			employeePanel(employeeSig, nda.submittedAt, 'Employee Signature'),
			{ caption: `For ${brand.legalName}`, subCaption: 'Authorized Signatory', date: null }
		]);
	});

	if (nda.acceptedAt) {
		// The digital-acceptance record. A signed PDF with no provenance is worth
		// less than one that says where the signature came from.
		noteBox(ctx, [
			`Accepted electronically on ${formatStamp(nda.acceptedAt)} by ${dash(nda.fullName) || dash(e.fullName)}` +
				` (${dash(e.personalEmail)}).`,
			'Signature image supplied by the employee through the exit portal.'
		]);
	}

	return finish(ctx);
}

// ── 4. Relieving Formalities Form ────────────────────────────────────────────

export async function relievingFormalitiesPdf(input: ExitPdfInput): Promise<Uint8Array> {
	const { exit: e } = input;
	const rf = (e.relievingFormalities ?? {}) as Record<string, any>;
	const { ctx, employeeSig } = await begin(input, 'Relieving Formalities');

	title(ctx, 'EMPLOYEE RELIEVING FORMALITIES FORM');
	fieldGrid(ctx, [
		{ label: 'Employee Name', value: dash(e.fullName) },
		{ label: 'Job Title', value: dash(rf.jobTitle) || dash(e.designation) },
		{ label: 'Division', value: dash(rf.division) || dash(e.division) },
		{ label: 'Separation Date', value: dash(e.lwd) || dash(e.resignationDate) }
	]);
	gap(ctx, 4);

	const YES_NO = [
		{ value: 'yes', label: 'Yes' },
		{ value: 'no', label: 'No' }
	] as const;
	const YES_NO_NA = [...YES_NO, { value: 'na', label: 'N/A' }] as const;

	for (const item of RELIEVING_ITEMS) {
		ensure(ctx, 46);
		para(ctx, `${item.n}. ${item.label}`, { font: ctx.fontB, gapAfter: 2, color: ctx.inkColor });
		if (item.note) para(ctx, item.note, { size: BODY - 1, color: GREY, gapAfter: 3, indent: 10 });
		choiceRow(ctx, item.allowNa ? YES_NO_NA : YES_NO, dash(rf[item.field]) || null, { indent: 10 });
	}

	// Item 4c collects the alumni-forum contact details.
	const contactRows = [
		{ label: 'Future email', value: dash(rf.futureContactEmail) },
		{ label: 'Future mobile', value: dash(rf.futureContactMobile) },
		{ label: 'Future address', value: dash(rf.futureContactAddress) },
		{ label: 'Emergency contact', value: dash(rf.emergencyContactName) },
		{ label: 'Emergency mobile', value: dash(rf.emergencyContactMobile) }
	];
	if (contactRows.some((r) => r.value)) {
		sectionHeading(ctx, 'Alumni forum & future contact details');
		fieldGrid(ctx, contactRows);
	}

	if (dash(rf.notes)) {
		questionBox(ctx, 'Additional notes', dash(rf.notes), { minH: 20 });
	}

	signaturePanels(ctx, [
		{ caption: 'Human Resource Representative', date: null },
		employeePanel(employeeSig, rf.submittedAt, 'Employee Signature')
	]);

	return finish(ctx);
}

// ── 5. Gratuity — Form I ─────────────────────────────────────────────────────
// The statutory Form I under the Payment of Gratuity Act. The source PDF in
// design/ is a scan, so this is a clean re-typeset of the same application
// rather than a fill of that image.

export async function gratuityFormPdf(input: ExitPdfInput): Promise<Uint8Array> {
	const { exit: e, brand } = input;
	const g = (e.gratuity ?? {}) as Record<string, any>;
	const { ctx, employeeSig } = await begin(input, 'Gratuity - Form I');

	title(ctx, 'FORM I — APPLICATION FOR GRATUITY BY AN EMPLOYEE');
	para(ctx, '[Under Rule 7(1) of the Payment of Gratuity (Central) Rules, 1972]', {
		size: BODY - 1,
		color: GREY,
		gapAfter: 10
	});

	para(ctx, `To,`, { gapAfter: 2 });
	para(ctx, `The Employer, ${brand.legalName}`, { indent: 12, gapAfter: 2 });
	para(ctx, NDA_REGISTERED_OFFICE, { indent: 12, color: GREY, size: BODY - 0.5, gapAfter: 10 });

	para(
		ctx,
		'Sir, I beg to apply for payment of gratuity to which I am entitled under sub-section (1) of Section 4 of the ' +
			'Payment of Gratuity Act, 1972 on account of my superannuation / retirement / resignation after completion of ' +
			'not less than five years of continuous service / total disablement due to accident / total disablement due to ' +
			'disease. Necessary particulars relating to my appointment are given below:',
		{ gapAfter: 10 }
	);

	fieldGrid(
		ctx,
		[
			{ label: '1. Name in full', value: dash(e.fullName) },
			{ label: '2. Address in full', value: dash(g.addressForCorrespondence) },
			{ label: '3. Department / Branch', value: dash(e.department) },
			{ label: '4. Post held with Ticket/Serial No.', value: dash(e.designation) },
			{ label: '5. Employee No.', value: dash(e.employeeId) },
			{ label: '6. Date of appointment', value: dash(e.doj) },
			{ label: '7. Date of termination', value: dash(e.lwd) || dash(e.resignationDate) },
			{ label: '8. Total period of service', value: dash(g.totalService) || input.serviceLabel || '' },
			{ label: '9. Cause of termination', value: e.separationType === 'involuntary' ? 'Termination' : 'Resignation' },
			{ label: '10. UAN / PF No.', value: dash(e.uanNo) },
			{ label: '11. Nominee', value: dash(g.nomineeName) },
			{ label: '12. Relationship with nominee', value: dash(g.nomineeRelation) }
		],
		{ cols: 1 }
	);

	gap(ctx, 6);
	para(
		ctx,
		'I request that my gratuity may be paid to me by crediting the amount to my bank account / by cheque as per the ' +
			'particulars held on record.',
		{ gapAfter: 10 }
	);

	fieldGrid(
		ctx,
		[
			{ label: 'Name as per Bank', value: dash(e.ndc?.nameAsPerBank) || dash(e.bankAccountName) },
			{ label: 'PAN', value: dash(e.panNo) }
		],
		{ cols: 1 }
	);

	signaturePanels(ctx, [
		employeePanel(employeeSig, g.submittedAt, 'Signature / Thumb impression of the applicant employee'),
		{ caption: 'For office use — Employer', date: null }
	]);

	return finish(ctx);
}

// ── 6. Full & Final settlement summary ───────────────────────────────────────
// Not one of the three source forms, but the brief requires the F&F date and
// amount to reach the employee in the final handover, and a downloadable
// statement is the natural artefact for that.

export async function fnfSummaryPdf(input: ExitPdfInput): Promise<Uint8Array> {
	const { exit: e } = input;
	const f = (e.fnf ?? {}) as Record<string, any>;
	const { ctx } = await begin(input, 'Full & Final Settlement');

	title(ctx, 'FULL & FINAL SETTLEMENT SUMMARY');
	fieldGrid(ctx, identityRows(e).slice(0, 8));

	sectionHeading(ctx, 'Settlement');
	fieldGrid(
		ctx,
		[
			{ label: 'Salary due from', value: dash(f.salaryDueFrom) },
			{ label: 'Salary due to', value: dash(f.salaryDueTo) },
			{ label: 'Leave balance (days)', value: dash(f.leaveBalanceDays) },
			{ label: 'Leave encashment', value: dash(f.leaveEncashmentAmount) },
			{ label: 'Notice pay recovery', value: dash(f.noticePayRecovery) },
			{ label: 'Asset recovery', value: dash(f.assetRecovery) },
			{ label: 'Other deductions', value: dash(f.otherDeductions) },
			{ label: 'Net F&F payable', value: dash(f.netAmount) },
			{ label: 'Settlement date', value: dash(f.settlementDate) },
			{ label: 'Approved by', value: dash(f.approvedBy) }
		]
	);

	if (f.pfExitProcessed) {
		sectionHeading(ctx, 'Provident Fund');
		fieldGrid(ctx, [
			{ label: 'UAN', value: dash(e.uanNo) },
			{ label: 'Date of exit (EPFO)', value: dash(f.pfDateOfExit) }
		]);
		if (dash(f.pfRemarks)) para(ctx, dash(f.pfRemarks), { color: GREY, size: BODY - 0.5 });
	}

	if (f.taxationApplicable) {
		sectionHeading(ctx, 'Taxation');
		para(ctx, dash(f.taxationRemarks) || 'Form 16 / taxation details issued separately.', {
			color: GREY,
			size: BODY - 0.5
		});
	}

	signaturePanels(ctx, [
		{ caption: 'Payroll', date: null },
		{ caption: 'HRD', date: null }
	]);

	noteBox(ctx, [
		'This statement is generated from the live exit record and reflects the settlement as recorded at the time of ' +
			'download. Please contact the HR desk if any figure needs correction.'
	]);

	return finish(ctx);
}
