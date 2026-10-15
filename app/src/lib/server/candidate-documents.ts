// Storing a file into one of a candidate's document slots, whoever uploads it.
//
// Two doors lead here: the candidate's own uploader (/c/[token]/upload) and HR
// uploading on the candidate's behalf (/admin/candidates/[id]/doc-upload) for
// someone who cannot manage the onboarding link. Both must land the same row,
// run the same OCR and feed the same suggestions, or an HR-uploaded Aadhaar
// would silently drop out of the OCR cross-check.
import type { DocSlot } from '$lib/shared/matrix';
import { Candidate, Document } from './db/schema';
import { audit } from './audit';
import { uploadBytesToGridFS } from './storage';
import { runOcr, hasOcrSchema } from './ocr';
import { extFor } from './uploads';

export interface StoredDocument {
	docId: string;
	ocrStatus: 'parsed' | 'unreadable' | 'failed' | 'store_only';
	suggestions: Record<string, string>;
}

export async function storeCandidateDocument(opts: {
	candidateId: string;
	slot: DocSlot;
	bytes: Uint8Array;
	mime: string;
	/** 'candidate', or the uploading admin's email. */
	actor: string;
	/** The admin's email when HR uploaded it on the candidate's behalf. */
	uploadedBy?: string | null;
	ip?: string;
}): Promise<StoredDocument> {
	const { candidateId, slot, bytes, mime, actor, ip } = opts;
	const filename = `${candidateId}/${slot.type}/${crypto.randomUUID()}.${extFor(mime)}`;
	const gridfsId = await uploadBytesToGridFS(bytes, filename, mime);

	const doc = await Document.create({
		candidateId,
		docType: slot.type,
		gridfsId,
		mime,
		sizeBytes: bytes.byteLength,
		ocrStatus: hasOcrSchema(slot.ocr) ? 'pending' : 'store_only',
		uploadedBy: opts.uploadedBy ?? null
	});

	// A file now exists for this slot — any standing "please upload this"
	// request HR left on the candidate record is resolved.
	await Candidate.findByIdAndUpdate(candidateId, {
		$pull: { requestedDocTypes: { docType: slot.type } }
	});

	await audit({
		candidateId,
		actor,
		action: 'document_uploaded',
		field: doc.docType,
		newValue: opts.uploadedBy ? 'uploaded by HR on the candidate’s behalf' : undefined,
		ip
	});

	if (!hasOcrSchema(slot.ocr)) {
		return { docId: String(doc._id), ocrStatus: 'store_only', suggestions: {} };
	}

	try {
		const result = await runOcr(slot.ocr, gridfsId, mime);
		if (result.unreadable) {
			await Document.findByIdAndUpdate(doc._id, {
				ocrStatus: 'unreadable',
				ocrJson: result.fields,
				ocrTranscript: result.transcript
			});
			return { docId: String(doc._id), ocrStatus: 'unreadable', suggestions: {} };
		}

		const suggestions: Record<string, string> = { ...result.fields };
		if (slot.ocr === 'aadhaar_back') {
			if (suggestions.presentAddress) suggestions.permanentAddress = suggestions.presentAddress;
			if (suggestions.presentPin) suggestions.permanentPin = suggestions.presentPin;
		}

		const existing = await Candidate.findById(candidateId).lean();
		const s = existing?.ocrSuggestions;
		const prev = s instanceof Map ? Object.fromEntries(s) : ((s as Record<string, string>) ?? {});
		await Candidate.findByIdAndUpdate(candidateId, { ocrSuggestions: { ...prev, ...suggestions } });
		await Document.findByIdAndUpdate(doc._id, {
			ocrStatus: 'parsed',
			ocrJson: result.fields,
			ocrTranscript: result.transcript
		});
		await audit({ candidateId, actor: 'system', action: 'ocr_parsed', field: doc.docType });

		return { docId: String(doc._id), ocrStatus: 'parsed', suggestions };
	} catch (e) {
		console.error('[ocr] failed:', e);
		await Document.findByIdAndUpdate(doc._id, { ocrStatus: 'failed' });
		return { docId: String(doc._id), ocrStatus: 'failed', suggestions: {} };
	}
}
