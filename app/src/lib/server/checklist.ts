import { Document } from './db/schema';
import { slotsForTrack, type Track } from '$lib/shared/matrix';

export interface SlotStatus {
	type: string;
	label: string;
	hint: string;
	mandatory: boolean;
	maxFiles: number;
	ocr: boolean;
	docs: Array<{ id: string; docType: string; reviewStatus: string; ocrStatus: string; reviewNote: string | null; mime: string }>;
	satisfied: boolean;
	/** Set when this slot is one of several alternatives (see DocSlot.group). */
	group?: string;
	/** Labels of the sibling slots that would also satisfy this one, so the UI can
	 *  say "or upload X instead" without knowing the matrix. */
	alternatives?: string[];
}

export async function checklistFor(
	candidateId: string,
	track: Track,
	brandSlug?: string | null
): Promise<SlotStatus[]> {
	const docs = await Document.find({ candidateId }, 'docType reviewStatus ocrStatus reviewNote mime').lean();
	const slots = slotsForTrack(track, brandSlug);

	/** Doc types that count towards each group, and whether any of them has a
	 *  usable file. Computed once up front: a slot cannot judge its own group
	 *  without seeing its siblings. */
	const usableFor = (type: string) =>
		docs.some((d) => d.docType === type && d.reviewStatus !== 'reupload_requested');
	const groupSatisfied = new Map<string, boolean>();
	for (const s of slots) {
		if (!s.group) continue;
		groupSatisfied.set(s.group, (groupSatisfied.get(s.group) ?? false) || usableFor(s.type));
	}

	return slots.map((slot) => {
		const slotDocs = docs
			.filter((d) => d.docType === slot.type)
			.map((d) => ({
				id: String(d._id),
				docType: d.docType,
				reviewStatus: d.reviewStatus,
				ocrStatus: d.ocrStatus,
				reviewNote: d.reviewNote ?? null,
				mime: d.mime
			}));
		const usable = slotDocs.filter((d) => d.reviewStatus !== 'reupload_requested');
		// A grouped slot rides on its group: a bank statement satisfies the payslip
		// slot too, so neither is reported missing once either is uploaded.
		const satisfied =
			!slot.mandatory || usable.length > 0 || (!!slot.group && groupSatisfied.get(slot.group) === true);
		return {
			type: slot.type,
			label: slot.label,
			hint: slot.hint,
			mandatory: slot.mandatory,
			maxFiles: slot.maxFiles,
			ocr: !!slot.ocr,
			docs: slotDocs,
			satisfied,
			group: slot.group,
			alternatives: slot.group
				? slots.filter((s) => s.group === slot.group && s.type !== slot.type).map((s) => s.label)
				: undefined
		};
	});
}

/** Mandatory slots with nothing usable uploaded. Grouped alternatives collapse to
 *  a single entry — an unsatisfied salary_proof group is one thing missing, not
 *  two, and listing both would tell the candidate to upload both. */
export const missingMandatory = (checklist: SlotStatus[]) => {
	const seenGroup = new Set<string>();
	return checklist.filter((s) => {
		if (!s.mandatory || s.satisfied) return false;
		if (!s.group) return true;
		if (seenGroup.has(s.group)) return false;
		seenGroup.add(s.group);
		return true;
	});
};
