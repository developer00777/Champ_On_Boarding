// DIRECT UPLOAD — the letter HR wrote themselves.
//
// Some offers are negotiated into a document no template will ever produce.
// Rather than have HR send that letter from their own mailbox, losing the
// portal's record of what went out, they upload the finished PDF here and it
// becomes this candidate's offer letter: previewed, signed and emailed by the
// same buttons as a generated one.
//
// The upload is stored exactly as received and never modified. The signature is
// stamped on at read time from a position stored alongside it, so re-placing it
// is free, the original is always recoverable, and a letter can be re-signed
// after the signature image itself is replaced.
import { PDFDocument } from 'pdf-lib';

/** Where the employer's signature sits on the uploaded letter. PDF user space:
 *  origin bottom-left, 72 units to the inch. */
export interface UploadedSignature {
	/** 1-based, matching how the editor and HR talk about pages. */
	page: number;
	x: number;
	y: number;
	/** Rendered width; height follows the image's own aspect ratio. */
	width: number;
	/** Whether a signature line was found, or this is the fallback position. */
	detected: boolean;
	/** The text the position was taken from, so the editor can say why. */
	anchorText: string;
	/** HR can turn the stamp off for a letter that is already signed. */
	enabled: boolean;
}

/** Signature lines belong to whoever signs beneath them, and a letter has at
 *  least two. Stamping the company's signature over the candidate's line would
 *  be worse than not stamping at all, so the employer's side is scored for and
 *  the candidate's side scored against — never merely "the first match". */
const ANCHORS: Array<{ re: RegExp; score: number }> = [
	{ re: /employer\s+representative\s+signature/i, score: 100 },
	{ re: /authoriz(ed|sed)\s+signatory/i, score: 95 },
	{ re: /for\s+and\s+on\s+behalf/i, score: 80 },
	{ re: /signatory/i, score: 60 },
	{ re: /yours\s+(sincerely|faithfully|truly)/i, score: 55 },
	{ re: /signature/i, score: 40 }
];

/** Text that marks the other party's line. Heavily negative rather than an
 *  outright skip: "Employer Representative Signature" must still win on a page
 *  where "Employee Acceptance Signature" sits beside it. */
const NOT_OURS = /employee|candidate|intern\b|mentor|applicant|received|accepted\s+by|witness/i;

interface TextItem {
	text: string;
	x: number;
	y: number;
	width: number;
	page: number;
}

interface PageSize {
	w: number;
	h: number;
}

/** Pulls every positioned text run out of the PDF. pdfjs is loaded lazily and
 *  from its legacy build: the modern one assumes browser globals that do not
 *  exist under Node, and nothing else in the app needs it loaded at all. */
async function textItems(
	bytes: Uint8Array
): Promise<{ items: TextItem[]; pages: number; sizes: PageSize[] }> {
	const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
	// A copy: pdfjs transfers the buffer it is handed, which would leave the
	// caller's bytes detached and unusable for the stamping pass afterwards.
	const doc = await pdfjs.getDocument({ data: new Uint8Array(bytes), useSystemFonts: true })
		.promise;
	const items: TextItem[] = [];
	const sizes: PageSize[] = [];
	const pages = doc.numPages;
	for (let p = 1; p <= pages; p++) {
		const page = await doc.getPage(p);
		const vp = page.getViewport({ scale: 1 });
		sizes.push({ w: vp.width, h: vp.height });
		const content = await page.getTextContent();
		for (const item of content.items) {
			const it = item as { str?: string; width?: number; transform?: number[] };
			if (!it.str?.trim() || !it.transform) continue;
			items.push({
				text: it.str,
				x: it.transform[4],
				y: it.transform[5],
				width: it.width ?? 0,
				page: p
			});
		}
	}
	await doc.destroy();
	return { items, pages, sizes };
}

const A4: PageSize = { w: 595.28, h: 841.89 };

/** Reads the uploaded letter and works out where its signature belongs. */
export async function inspectUploadedLetter(
	bytes: Uint8Array
): Promise<{ pages: number; sizes: PageSize[]; signature: UploadedSignature }> {
	let items: TextItem[] = [];
	let pages = 1;
	let sizes: PageSize[] = [A4];
	try {
		const read = await textItems(bytes);
		items = read.items;
		pages = read.pages;
		if (read.sizes.length) sizes = read.sizes;
	} catch {
		// A scanned or otherwise text-free PDF still uploads and still sends; it
		// just lands on the fallback position for HR to drag into place.
	}

	let best: { item: TextItem; score: number } | null = null;
	for (const item of items) {
		const anchor = ANCHORS.find((a) => a.re.test(item.text));
		if (!anchor) continue;
		// Later pages win ties: a letter repeating "Signature" in its terms and
		// again on the signing page should be stamped on the signing page.
		let score = anchor.score + item.page * 2;
		if (NOT_OURS.test(item.text)) score -= 80;
		if (score <= 0) continue;
		if (!best || score > best.score) best = { item, score };
	}

	if (best) {
		const page = sizes[best.item.page - 1] ?? A4;
		// As wide as the line it belongs to, within limits — a signature scaled to
		// a two-word caption reads as a stamp, one scaled to a long caption reads
		// as a banner.
		const width = Math.min(170, Math.max(95, best.item.width || 130));
		return {
			pages,
			sizes,
			signature: {
				page: best.item.page,
				// Sits just above the caption, which is where a signature goes.
				x: Math.max(12, Math.min(best.item.x, page.w - width - 12)),
				y: Math.min(best.item.y + 5, page.h - 60),
				width,
				detected: true,
				anchorText: best.item.text.trim().slice(0, 80),
				enabled: true
			}
		};
	}

	// Nothing recognisable: the foot of the last page, left margin. Deliberately
	// somewhere obvious rather than somewhere plausible — HR should see that it
	// needs placing, not discover it later on a letter already sent.
	const last = sizes[pages - 1] ?? A4;
	return {
		pages,
		sizes,
		signature: {
			page: pages,
			x: 56,
			y: Math.min(140, last.h / 5),
			width: 130,
			detected: false,
			anchorText: '',
			enabled: true
		}
	};
}

/** Decodes the stored `data:` URI the signature image is kept as. */
function dataUriToBytes(dataUri: string): { bytes: Uint8Array; png: boolean } | null {
	const m = /^data:(image\/[a-z+]+);base64,(.+)$/i.exec(dataUri);
	if (!m) return null;
	try {
		return { bytes: new Uint8Array(Buffer.from(m[2], 'base64')), png: /png/i.test(m[1]) };
	} catch {
		return null;
	}
}

/** The uploaded letter with the signature drawn on, which is the form every
 *  reader of it wants: the preview, the download and the email attachment.
 *  Returns the bytes untouched when there is no signature to draw, no position
 *  to draw it at, or HR has turned the stamp off. */
export async function stampUploadedLetter(
	bytes: Uint8Array,
	signature: UploadedSignature | null,
	signatureImageDataUri: string
): Promise<Uint8Array> {
	if (!signature?.enabled || !signatureImageDataUri) return bytes;
	const img = dataUriToBytes(signatureImageDataUri);
	if (!img) return bytes;

	try {
		const doc = await PDFDocument.load(bytes);
		const pages = doc.getPages();
		const page = pages[Math.min(Math.max(signature.page, 1), pages.length) - 1];
		if (!page) return bytes;

		const embedded = img.png ? await doc.embedPng(img.bytes) : await doc.embedJpg(img.bytes);
		const scaled = embedded.scale(signature.width / embedded.width);
		page.drawImage(embedded, {
			x: signature.x,
			y: signature.y,
			width: scaled.width,
			height: scaled.height
		});
		return await doc.save();
	} catch {
		// An encrypted or malformed PDF must still reach the candidate as the
		// letter HR uploaded — unsigned is recoverable, unsent is not.
		return bytes;
	}
}
