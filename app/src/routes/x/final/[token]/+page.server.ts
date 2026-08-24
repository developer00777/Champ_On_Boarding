// The final document handover: what the ex-employee sees 30-45 days after their
// last working day. Their relieving and experience letters, three payslips, the
// F&F statement and amount, PF details when the EPFO exit is processed, and
// taxation documents when they apply.
//
// Read-only by design. Everything here is either an HR-uploaded file or a live
// render of the exit's own documents, so the employee's copy and HR's copy can
// never disagree.
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';
import { ExitDocument } from '$lib/server/db/schema';
import { brandBySlug } from '$lib/shared/brands';
import { HANDOVER_DOCS } from '$lib/shared/offboarding';
import { availableDocs } from '$lib/server/offboarding/documents';
import { exitCompany, resolveExitToken, serviceLabel } from '$lib/server/offboarding/exit';

export const load: PageServerLoad = async ({ params }) => {
	const resolved = await resolveExitToken(params.token, 'handover');
	if (!resolved) error(404, 'This link is invalid or has expired.');
	const { exit } = resolved;
	const company = await exitCompany(exit.companyId);
	const brand = brandBySlug(company?.brandSlug ?? undefined);
	const e = exit as unknown as Record<string, any>;

	const files = await ExitDocument.find({ exitId: exit._id, source: 'hr' }).lean();
	const byType = new Map(files.map((f) => [f.docType, f]));

	// Whether each handover slot is in scope for this exit. A document that does
	// not apply is not shown at all — an ex-employee should not be left wondering
	// why their "PF details" row is empty when they had no PF.
	const applies = (when: string | null) => {
		if (!when) return true;
		if (when === 'recommendationApplicable') return !!exit.recommendationApplicable;
		if (when === 'pfExitProcessed') return !!e.fnf?.pfExitProcessed;
		if (when === 'taxationApplicable') return !!e.fnf?.taxationApplicable;
		return true;
	};

	return {
		brand,
		companyName: company?.name ?? brand.legalName,
		employee: {
			fullName: exit.fullName,
			employeeId: exit.employeeId,
			designation: exit.designation ?? null,
			doj: exit.doj ?? null,
			lwd: exit.lwd ?? null,
			service: serviceLabel(exit.doj, exit.lwd)
		},
		settlement: {
			netAmount: e.fnf?.netAmount ?? null,
			settlementDate: e.fnf?.settlementDate ?? null,
			leaveEncashment: e.fnf?.leaveEncashmentAmount ?? null,
			pfProcessed: !!e.fnf?.pfExitProcessed,
			pfDateOfExit: e.fnf?.pfDateOfExit ?? null,
			uanNo: exit.uanNo ?? null,
			pfRemarks: e.fnf?.pfRemarks ?? null,
			taxationApplicable: !!e.fnf?.taxationApplicable,
			taxationRemarks: e.fnf?.taxationRemarks ?? null
		},
		// HR-uploaded documents, in the printed order, only those that apply and
		// have actually been attached.
		files: HANDOVER_DOCS.filter((d) => applies(d.applicableWhen))
			.map((d) => {
				const f = byType.get(d.docType);
				return f
					? {
							id: String(f._id),
							docType: d.docType,
							label: d.label,
							mime: f.mime,
							sizeBytes: f.sizeBytes
						}
					: null;
			})
			.filter((f): f is NonNullable<typeof f> => f !== null),
		// Their own exit forms, still live-rendered so they can keep a copy.
		documents: availableDocs(e)
	};
};
