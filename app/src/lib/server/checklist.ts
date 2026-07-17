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
}

export async function checklistFor(
	candidateId: string,
	track: Track,
	brandSlug?: string | null
): Promise<SlotStatus[]> {
	const docs = await Document.find({ candidateId }, 'docType reviewStatus ocrStatus reviewNote mime').lean();
	return slotsForTrack(track, brandSlug).map((slot) => {
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
		return {
			type: slot.type,
			label: slot.label,
			hint: slot.hint,
			mandatory: slot.mandatory,
			maxFiles: slot.maxFiles,
			ocr: !!slot.ocr,
			docs: slotDocs,
			satisfied: !slot.mandatory || usable.length > 0
		};
	});
}

export const missingMandatory = (checklist: SlotStatus[]) =>
	checklist.filter((s) => s.mandatory && !s.satisfied);
