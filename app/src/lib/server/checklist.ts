import { eq } from 'drizzle-orm';
import { db, t } from './db';
import { slotsForTrack, type Track } from '$lib/shared/matrix';
import type { Doc } from './db/schema';

export interface SlotStatus {
	type: string;
	label: string;
	hint: string;
	mandatory: boolean;
	maxFiles: number;
	ocr: boolean;
	docs: Doc[];
	satisfied: boolean;
}

/** Per-slot upload status for a candidate, derived from the track matrix. */
export async function checklistFor(candidateId: string, track: Track): Promise<SlotStatus[]> {
	const docs = await db.select().from(t.documents).where(eq(t.documents.candidateId, candidateId));
	return slotsForTrack(track).map((slot) => {
		const slotDocs = docs.filter((d) => d.docType === slot.type);
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
