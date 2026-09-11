// One place that turns an exit id into rendered exit documents.
//
// Every download route — HR's, the employee's, and the ZIP of the whole pack —
// goes through here, so the four documents are always assembled from the same
// fetches and the same signature images, and adding a document is one entry in
// EXIT_DOCS rather than a new endpoint's worth of plumbing.
import { ObjectId } from 'mongodb';
import { Exit, ExitClearance, ExitDocument } from '$lib/server/db/schema';
import { getGridFSBytes } from '$lib/server/storage';
import { brandBySlug } from '$lib/shared/brands';
import { ndcState, serviceLabel, exitCompany } from './exit';
import type { ExitPdfInput } from './pdf';
import {
	exitInterviewPdf,
	fnfSummaryPdf,
	gratuityFormPdf,
	ndaPdf,
	noDuesPdf,
	relievingFormalitiesPdf
} from './pdf';

export type ExitDocKey =
	| 'no_dues'
	| 'exit_interview'
	| 'nda'
	| 'relieving_formalities'
	| 'gratuity'
	| 'fnf_summary';

/** Who may see a document, and when.
 *
 *  `internal`        HR only, never offered to the employee. The No Dues
 *                    certificate is the internal clearance record — it carries
 *                    other departments' verdicts and signatures, and the
 *                    employee neither fills it nor receives it.
 *  `after_approval`  Released to the employee once HR has accepted their
 *                    submission (Exit.reviewedAt). Before that the document is
 *                    a draft of unreviewed answers, and handing someone a
 *                    PDF of their own unchecked NDA invites them to treat it
 *                    as final. */
type ExitDocAudience = 'internal' | 'after_approval';

interface ExitDocDef {
	key: ExitDocKey;
	label: string;
	/** Filename stem; the employee's name is prefixed at download time. */
	slug: string;
	render: (input: ExitPdfInput) => Promise<Uint8Array>;
	/** Only offered when this returns true — gratuity depends on service length,
	 *  the F&F summary on HR having filled the settlement block. */
	applies: (exit: Record<string, any>) => boolean;
	audience: ExitDocAudience;
}

/** HR has accepted the employee's submission — set by ?/acceptSubmission,
 *  which also moves the exit to `clearances`. Read as a timestamp rather than
 *  as a status so a later stage (cleared, fnf, completed) still counts as
 *  approved; a status list would have to be extended every time one is added. */
export function hrApproved(exit: Record<string, any>): boolean {
	return !!exit.reviewedAt;
}

export const EXIT_DOCS: ExitDocDef[] = [
	{
		key: 'no_dues',
		label: 'No Dues Certificate',
		slug: 'No-Dues-Certificate',
		render: noDuesPdf,
		applies: () => true,
		// Internal: filled by HR and the clearing departments, signed by them,
		// and never part of what the employee receives.
		audience: 'internal'
	},
	{
		key: 'exit_interview',
		label: 'Exit Interview Form',
		slug: 'Exit-Interview-Form',
		render: exitInterviewPdf,
		applies: () => true,
		audience: 'after_approval'
	},
	{
		key: 'nda',
		label: 'NDA & Non-Compete Agreement',
		slug: 'NDA-Non-Compete',
		render: ndaPdf,
		applies: () => true,
		audience: 'after_approval'
	},
	{
		key: 'relieving_formalities',
		label: 'Relieving Formalities Form',
		slug: 'Relieving-Formalities',
		render: relievingFormalitiesPdf,
		applies: () => true,
		audience: 'after_approval'
	},
	{
		key: 'gratuity',
		label: 'Gratuity — Form I',
		slug: 'Gratuity-Form-I',
		render: gratuityFormPdf,
		applies: (e) => !!e.gratuity?.applicable,
		audience: 'after_approval'
	},
	{
		key: 'fnf_summary',
		label: 'Full & Final Settlement Summary',
		slug: 'FnF-Settlement',
		render: fnfSummaryPdf,
		// Only once HR has recorded something — an empty statement of blanks is
		// worse than no statement at all.
		applies: (e) => !!(e.fnf?.netAmount || e.fnf?.settlementDate || e.fnf?.salaryDueFrom),
		audience: 'after_approval'
	}
];

export const EXIT_DOC_BY_KEY = new Map(EXIT_DOCS.map((d) => [d.key, d]));

/** Assembles everything the generators read: the exit, its clearances, and the
 *  signature bytes pulled out of GridFS. A missing or unreadable signature is
 *  not an error — the document simply prints a blank rule instead. */
export async function loadPdfInput(exitId: string): Promise<ExitPdfInput | null> {
	const exit = await Exit.findById(exitId).lean();
	if (!exit) return null;

	const [company, clearances, sigDocs] = await Promise.all([
		exitCompany(exit.companyId),
		ExitClearance.find({ exitId }).lean(),
		ExitDocument.find({ exitId, source: 'employee', docType: 'signature' })
			.sort({ createdAt: -1 })
			.lean()
	]);

	const brand = brandBySlug(company?.brandSlug ?? undefined);

	let employeeSignature: Uint8Array | null = null;
	const latest = sigDocs.find((d) => d.reviewStatus !== 'reupload_requested') ?? sigDocs[0];
	if (latest) {
		employeeSignature = await getGridFSBytes(latest.gridfsId as ObjectId).catch(() => null);
	}

	const clearanceSignatures: Record<string, Uint8Array> = {};
	for (const c of clearances) {
		if (!c.signatureGridfsId) continue;
		const bytes = await getGridFSBytes(c.signatureGridfsId as ObjectId).catch(() => null);
		if (bytes) clearanceSignatures[String(c.department)] = bytes;
	}

	return {
		exit: exit as unknown as Record<string, any>,
		brand,
		companyName: company?.name ?? brand.legalName,
		employeeSignature,
		clearanceSignatures,
		ndc: ndcState(clearances as unknown as Record<string, unknown>[]),
		serviceLabel: serviceLabel(exit.doj, exit.lwd)
	};
}

/** Documents currently available for an exit, in printed order.
 *
 *  `viewer` decides what the list may contain. HR sees everything that
 *  applies; the employee sees only what their audience allows, and only once
 *  HR has approved. Defaulting to 'hr' keeps every existing HR-side caller
 *  correct — a new caller that forgets the argument over-shows to staff rather
 *  than leaking to the employee. */
export function availableDocs(exit: Record<string, any>, viewer: 'hr' | 'employee' = 'hr') {
	return EXIT_DOCS.filter((d) => d.applies(exit) && canSee(d, exit, viewer)).map((d) => ({
		key: d.key,
		label: d.label
	}));
}

/** The single rule both the listing and the download route ask. Keeping it one
 *  function is the point: a UI that hides a link is not a control, and these
 *  two must never be able to disagree. */
export function canSee(def: ExitDocDef, exit: Record<string, any>, viewer: 'hr' | 'employee') {
	if (viewer === 'hr') return true;
	if (def.audience === 'internal') return false;
	return hrApproved(exit);
}

/** Why the employee cannot download yet — shown on their portal so the absence
 *  of a download reads as a stage, not a fault. */
export function employeeDocsPendingReason(exit: Record<string, any>): string | null {
	if (hrApproved(exit)) return null;
	return 'Your copies are released once HR has reviewed and accepted your submission.';
}

export function safeFilename(name: string): string {
	return name.replace(/[^a-zA-Z0-9 _\-().]/g, '').trim().replace(/\s+/g, '_') || 'exit';
}

/** Renders one document. Returns null for an unknown key or one that doesn't
 *  apply to this exit, so a hand-typed URL can't produce a nonsense PDF. */
export async function renderExitDoc(
	key: string,
	input: ExitPdfInput,
	viewer: 'hr' | 'employee' = 'hr'
): Promise<{ bytes: Uint8Array; filename: string; label: string } | null> {
	const def = EXIT_DOC_BY_KEY.get(key as ExitDocKey);
	if (!def || !def.applies(input.exit)) return null;
	// The audience check lives here, not only in the caller: this is the one
	// function every download route goes through.
	if (!canSee(def, input.exit, viewer)) return null;
	const bytes = await def.render(input);
	const stem = safeFilename(String(input.exit.fullName ?? input.exit.employeeId ?? 'exit'));
	return { bytes, filename: `${stem}_${def.slug}.pdf`, label: def.label };
}

/** The whole exit pack as a ZIP: every applicable generated document, plus the
 *  files the employee uploaded and — for HR — whatever handover documents have
 *  been attached. This is the "download all live docs at any instant for
 *  physical keeping" path. */
export async function exitPackZip(
	exitId: string,
	opts: { includeUploads?: boolean; includeHandover?: boolean } = {}
): Promise<{ bytes: Uint8Array; filename: string } | null> {
	const input = await loadPdfInput(exitId);
	if (!input) return null;
	const PizZip = (await import('pizzip')).default;
	const zip = new PizZip();

	for (const def of EXIT_DOCS) {
		if (!def.applies(input.exit)) continue;
		try {
			const bytes = await def.render(input);
			zip.file(`${def.slug}.pdf`, Buffer.from(bytes));
		} catch (e) {
			// Best-effort per document: one generator failing must not cost HR the
			// rest of the pack.
			console.error(`[exit-pack] failed to render ${def.key}:`, e);
		}
	}

	if (opts.includeUploads || opts.includeHandover) {
		const where: Record<string, unknown> = { exitId };
		if (opts.includeUploads && !opts.includeHandover) where.source = 'employee';
		if (opts.includeHandover && !opts.includeUploads) where.source = 'hr';
		const files = await ExitDocument.find(where).lean();
		const counts: Record<string, number> = {};
		for (const f of files) {
			try {
				const bytes = await getGridFSBytes(f.gridfsId as ObjectId);
				const base = safeFilename(f.docType);
				counts[base] = (counts[base] ?? 0) + 1;
				const suffix = counts[base] > 1 ? `_${counts[base]}` : '';
				const folder = f.source === 'hr' ? 'Handover' : 'Employee-uploads';
				zip.file(`${folder}/${base}${suffix}.${extFor(f.mime)}`, Buffer.from(bytes));
			} catch (e) {
				console.error(`[exit-pack] failed to fetch file ${f._id}:`, e);
			}
		}
	}

	const stem = safeFilename(String(input.exit.fullName ?? input.exit.employeeId ?? 'exit'));
	return {
		bytes: new Uint8Array(zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' })),
		filename: `${stem}_exit_documents.zip`
	};
}

export function extFor(mime: string): string {
	const map: Record<string, string> = {
		'image/jpeg': 'jpg',
		'image/png': 'png',
		'image/webp': 'webp',
		'application/pdf': 'pdf'
	};
	return map[mime] ?? 'bin';
}
