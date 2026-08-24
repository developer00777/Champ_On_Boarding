// Shared pdf-lib layout kit for the exit documents.
//
// The offer letter has its own layout engine (offer-letter/pdf.ts) tuned to
// reproduce three signed letter templates page-for-page. The exit documents are
// forms, not letters: label/value header blocks, tick tables and rating grids,
// with signature panels that may or may not carry an image yet. They share the
// branded chrome and the WinAnsi sanitising with the offer letter but need a
// different set of primitives, so this is a sibling kit rather than an
// extension — four documents building on one context instead of four copies of
// the same PDFDocument setup.
import { PDFDocument, rgb, StandardFonts, PageSizes } from 'pdf-lib';
import type { PDFFont, PDFPage, PDFImage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { baseUrl } from '$lib/server/base-url';
import type { BrandTheme } from '$lib/shared/brands';

export const BLACK = rgb(0.13, 0.13, 0.13);
export const GREY = rgb(0.4, 0.4, 0.4);
export const LIGHT = rgb(0.6, 0.6, 0.6);
export const RULE = rgb(0.62, 0.62, 0.66);
export const SHADE = rgb(0.93, 0.93, 0.95);

const HEADER_H = 76;
const FOOTER_H = 26;
export const BODY = 9;

export interface DocCtx {
	doc: PDFDocument;
	page: PDFPage;
	fontR: PDFFont;
	fontB: PDFFont;
	W: number;
	H: number;
	M: number;
	CW: number;
	y: number;
	topY: number;
	bottomY: number;
	logo: PDFImage | null;
	inkColor: ReturnType<typeof rgb>;
	primaryColor: ReturnType<typeof rgb>;
	brand: BrandTheme;
	companyName: string;
	/** Printed in the footer of every page and in the running head. */
	docTitle: string;
	/** Stamped in the footer so a printed copy says when it was pulled — these
	 *  documents are generated live and change as clearances land, so an
	 *  undated printout is genuinely ambiguous. */
	generatedAt: string;
}

function hexToRgb(hex: string): [number, number, number] {
	const h = hex.replace('#', '');
	return [
		parseInt(h.slice(0, 2), 16) / 255,
		parseInt(h.slice(2, 4), 16) / 255,
		parseInt(h.slice(4, 6), 16) / 255
	];
}

/** pdf-lib's WinAnsi encoding throws on anything outside cp1252 (₹, curly
 *  quotes, em dashes, emoji). Same mapping the offer letter uses. */
export function sanitize(text: string): string {
	return (text ?? '')
		.replace(/₹/g, 'Rs.')
		.replace(/[‘’‚‛]/g, "'")
		.replace(/[“”„‟]/g, '"')
		.replace(/[–—―]/g, '-')
		.replace(/[…]/g, '...')
		.replace(/[ ]/g, ' ')
		.replace(/[•]/g, '-')
		.replace(/[^\x09\x0A\x0D\x20-\x7E¡-ÿ]/g, '');
}

async function fetchLogoBytes(brand: BrandTheme): Promise<Uint8Array | null> {
	// pdf-lib cannot embed webp.
	if (brand.logo.src.endsWith('.webp')) return null;
	try {
		const { readFile } = await import('node:fs/promises');
		const { join } = await import('node:path');
		for (const dir of ['static', 'client', join('build', 'client')]) {
			try {
				return new Uint8Array(await readFile(join(process.cwd(), dir, brand.logo.src)));
			} catch {
				/* try next candidate root */
			}
		}
	} catch {
		/* no fs — fall through to HTTP */
	}
	try {
		const res = await fetch(`${baseUrl()}${brand.logo.src}`, { signal: AbortSignal.timeout(4000) });
		if (!res.ok) return null;
		return new Uint8Array(await res.arrayBuffer());
	} catch {
		return null;
	}
}

/** Embeds an image from raw bytes, sniffing PNG vs JPEG by trying both. Used
 *  for the signature images uploaded by employees and approvers, which arrive
 *  as whatever their phone camera produced. */
export async function embedImage(doc: PDFDocument, bytes: Uint8Array): Promise<PDFImage | null> {
	try {
		return await doc.embedPng(bytes).catch(() => doc.embedJpg(bytes));
	} catch {
		return null;
	}
}

/** Running head + footer, redrawn on every page. */
function drawChrome(ctx: DocCtx, page: PDFPage) {
	const { W, H, M, brand, companyName } = ctx;
	page.drawRectangle({ x: 0, y: H - 4, width: W, height: 4, color: ctx.primaryColor });

	// Entity name top-left, document title top-right — these are filed
	// documents, so the header names both on every sheet.
	const entity = sanitize(brand.legalName || companyName).toUpperCase();
	page.drawText(entity, { x: M, y: H - 26, size: 8.5, font: ctx.fontB, color: ctx.inkColor });
	const title = sanitize(ctx.docTitle);
	const tw = ctx.fontR.widthOfTextAtSize(title, 8.5);
	page.drawText(title, { x: W - M - tw, y: H - 26, size: 8.5, font: ctx.fontR, color: GREY });

	if (ctx.logo) {
		// Area-matched sizing, as in the offer letter: the brand logos range from
		// 1.6:1 to nearly 7:1, and fitting them all to one box makes the tall ones
		// render visibly smaller than the wide ones.
		const { width: iw, height: ih } = ctx.logo.scale(1);
		const byArea = Math.sqrt((120 * 30) / (iw * ih));
		const scale = Math.min(byArea, 150 / iw, 30 / ih);
		const w = iw * scale;
		const h = ih * scale;
		const x = W - M - w;
		const y = H - 34 - h;
		if (brand.logo.onDark) {
			// White artwork on white paper is invisible — lay an ink plate first.
			page.drawRectangle({ x: x - 4, y: y - 3, width: w + 8, height: h + 6, color: ctx.inkColor });
		}
		page.drawImage(ctx.logo, { x, y, width: w, height: h });
	}

	page.drawRectangle({ x: M, y: H - 40, width: ctx.CW, height: 0.6, color: RULE });

	const foot = sanitize(`${companyName} - Private & Confidential   |   Generated ${ctx.generatedAt}`);
	const fw = ctx.fontR.widthOfTextAtSize(foot, 7.5);
	page.drawText(foot, { x: (W - fw) / 2, y: 14, size: 7.5, font: ctx.fontR, color: LIGHT });
	page.drawRectangle({ x: M, y: 26, width: ctx.CW, height: 0.5, color: rgb(0.85, 0.85, 0.87) });
}

/** Creates a branded A4 document ready to draw into. Carlito (a Calibri metric
 *  clone) is embedded from the offer letter's inlined base64 so exit documents
 *  match the letters HR already sends, with Helvetica as the fallback. */
export async function createDoc(
	brand: BrandTheme,
	companyName: string,
	docTitle: string,
	generatedAt: string
): Promise<DocCtx> {
	const doc = await PDFDocument.create();
	doc.registerFontkit(fontkit);
	doc.setTitle(`${docTitle} - ${companyName}`);
	doc.setAuthor(companyName);
	doc.setCreator('ChampHR');

	let fontR: PDFFont, fontB: PDFFont;
	try {
		const [{ CARLITO_REGULAR_BASE64 }, { CARLITO_BOLD_BASE64 }] = await Promise.all([
			import('../offer-letter/font-carlito-regular'),
			import('../offer-letter/font-carlito-bold')
		]);
		const toBytes = (b64: string) => {
			const bin = atob(b64);
			const arr = new Uint8Array(bin.length);
			for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
			return arr;
		};
		// liga/clig off and subset:false for the same reason as the offer letter:
		// Carlito's ti/tt ligatures embed as single glyphs with no reverse
		// mapping, which renders "conditions" as "conditi ons".
		const features = { liga: false, clig: false };
		fontR = await doc.embedFont(toBytes(CARLITO_REGULAR_BASE64), { subset: false, features });
		fontB = await doc.embedFont(toBytes(CARLITO_BOLD_BASE64), { subset: false, features });
	} catch {
		fontR = await doc.embedFont(StandardFonts.Helvetica);
		fontB = await doc.embedFont(StandardFonts.HelveticaBold);
	}

	const logoBytes = await fetchLogoBytes(brand);
	let logo: PDFImage | null = null;
	if (logoBytes) logo = await embedImage(doc, logoBytes);

	const [W, H] = PageSizes.A4;
	const M = 44;
	const page = doc.addPage(PageSizes.A4);
	const ctx: DocCtx = {
		doc,
		page,
		fontR,
		fontB,
		W,
		H,
		M,
		CW: W - M * 2,
		y: H - HEADER_H,
		topY: H - HEADER_H,
		bottomY: FOOTER_H + 14,
		logo,
		inkColor: rgb(...hexToRgb(brand.colors.ink)),
		primaryColor: rgb(...hexToRgb(brand.colors.primary)),
		brand,
		companyName,
		docTitle,
		generatedAt
	};
	drawChrome(ctx, page);
	return ctx;
}

export function newPage(ctx: DocCtx) {
	ctx.page = ctx.doc.addPage(PageSizes.A4);
	drawChrome(ctx, ctx.page);
	ctx.y = ctx.topY;
}

/** Breaks the page when `need` points won't fit above the footer. */
export function ensure(ctx: DocCtx, need: number) {
	if (ctx.y - need < ctx.bottomY) newPage(ctx);
}

export function gap(ctx: DocCtx, pts: number) {
	ctx.y -= pts;
}

export function wrap(font: PDFFont, text: string, size: number, maxW: number): string[] {
	const words = sanitize(text).split(/\s+/).filter(Boolean);
	const lines: string[] = [];
	let line = '';
	for (const word of words) {
		const probe = line ? `${line} ${word}` : word;
		if (font.widthOfTextAtSize(probe, size) <= maxW) {
			line = probe;
		} else {
			if (line) lines.push(line);
			// A single word longer than the column (a pasted URL, an unbroken
			// account number) would loop forever appended to itself — hard-split it.
			if (font.widthOfTextAtSize(word, size) > maxW) {
				let chunk = '';
				for (const ch of word) {
					if (font.widthOfTextAtSize(chunk + ch, size) > maxW) {
						lines.push(chunk);
						chunk = ch;
					} else {
						chunk += ch;
					}
				}
				line = chunk;
			} else {
				line = word;
			}
		}
	}
	if (line) lines.push(line);
	return lines.length ? lines : [''];
}

/** Centred, underlined document title. */
export function title(ctx: DocCtx, text: string, size = 13) {
	ensure(ctx, size + 16);
	const t = sanitize(text);
	const w = ctx.fontB.widthOfTextAtSize(t, size);
	const x = ctx.M + (ctx.CW - w) / 2;
	ctx.page.drawText(t, { x, y: ctx.y - size, size, font: ctx.fontB, color: ctx.inkColor });
	ctx.page.drawRectangle({ x, y: ctx.y - size - 4, width: w, height: 0.8, color: ctx.inkColor });
	ctx.y -= size + 14;
}

/** Left-aligned bold section heading with a hairline under it. */
export function sectionHeading(ctx: DocCtx, text: string, size = BODY + 1) {
	ensure(ctx, size + 14);
	ctx.page.drawText(sanitize(text), {
		x: ctx.M,
		y: ctx.y - size,
		size,
		font: ctx.fontB,
		color: ctx.inkColor
	});
	ctx.y -= size + 4;
	ctx.page.drawRectangle({ x: ctx.M, y: ctx.y, width: ctx.CW, height: 0.5, color: RULE });
	ctx.y -= 8;
}

export interface ParaOpts {
	size?: number;
	font?: PDFFont;
	color?: ReturnType<typeof rgb>;
	indent?: number;
	gapAfter?: number;
	maxW?: number;
}

export function para(ctx: DocCtx, text: string, opts: ParaOpts = {}) {
	const size = opts.size ?? BODY;
	const font = opts.font ?? ctx.fontR;
	const color = opts.color ?? BLACK;
	const indent = opts.indent ?? 0;
	const maxW = opts.maxW ?? ctx.CW - indent;
	const lead = size + 3;
	for (const line of wrap(font, text, size, maxW)) {
		ensure(ctx, lead);
		ctx.page.drawText(line, { x: ctx.M + indent, y: ctx.y - size, size, font, color });
		ctx.y -= lead;
	}
	ctx.y -= opts.gapAfter ?? 4;
}

/** Numbered clause with a hanging indent — used for the NDA's twelve clauses
 *  and the relieving form's numbered items. */
export function clause(
	ctx: DocCtx,
	marker: string,
	heading: string | null,
	body: string,
	opts: { size?: number; gapAfter?: number } = {}
) {
	const size = opts.size ?? BODY;
	const gutter = 22;
	ensure(ctx, size * 3);
	const startY = ctx.y;
	ctx.page.drawText(sanitize(marker), {
		x: ctx.M,
		y: startY - size,
		size,
		font: ctx.fontB,
		color: ctx.inkColor
	});
	if (heading) {
		para(ctx, heading, { size, font: ctx.fontB, indent: gutter, gapAfter: 1, color: ctx.inkColor });
	}
	para(ctx, body, { size, indent: gutter, gapAfter: opts.gapAfter ?? 6 });
}

/** Two-column "Label : value" grid for the identity block every exit form
 *  opens with. Values print on a rule when blank so a printed copy can be
 *  filled by hand. */
export function fieldGrid(
	ctx: DocCtx,
	rows: { label: string; value: string | null }[],
	opts: { cols?: 1 | 2; size?: number } = {}
) {
	const size = opts.size ?? BODY;
	const cols = opts.cols ?? 2;
	const colW = ctx.CW / cols;
	const labelW = cols === 2 ? 92 : 130;
	const rowH = size + 9;

	for (let i = 0; i < rows.length; i += cols) {
		ensure(ctx, rowH);
		for (let c = 0; c < cols; c++) {
			const row = rows[i + c];
			if (!row) continue;
			const x = ctx.M + c * colW;
			ctx.page.drawText(sanitize(row.label), {
				x,
				y: ctx.y - size,
				size,
				font: ctx.fontB,
				color: ctx.inkColor
			});
			const vx = x + labelW;
			const vw = colW - labelW - 10;
			const value = (row.value ?? '').trim();
			if (value) {
				// Long values (an address in a half-width cell) get truncated with an
				// ellipsis rather than overrunning the neighbouring column — the full
				// text is always available in the app, and these header cells are
				// identity fields, not prose.
				const lines = wrap(ctx.fontR, value, size, vw);
				const shown = lines.length > 1 ? `${lines[0].replace(/[\s,]+$/, '')}...` : lines[0];
				ctx.page.drawText(shown, { x: vx, y: ctx.y - size, size, font: ctx.fontR, color: BLACK });
			} else {
				ctx.page.drawRectangle({ x: vx, y: ctx.y - size - 1, width: vw, height: 0.5, color: RULE });
			}
		}
		ctx.y -= rowH;
	}
	ctx.y -= 4;
}

/** A label with the answer beneath it in a bordered box — the shape every
 *  free-text question on the exit interview form takes. `minH` keeps an
 *  unanswered box big enough to write in on a printed copy. */
export function questionBox(
	ctx: DocCtx,
	label: string,
	answer: string | null,
	opts: { minH?: number; size?: number } = {}
) {
	const size = opts.size ?? BODY;
	const minH = opts.minH ?? 30;
	const labelLines = wrap(ctx.fontB, label, size, ctx.CW - 4);
	const answerLines = answer?.trim() ? wrap(ctx.fontR, answer, size, ctx.CW - 14) : [];
	const boxH = Math.max(minH, answerLines.length * (size + 3) + 10);

	ensure(ctx, labelLines.length * (size + 3) + boxH + 10);
	for (const line of labelLines) {
		ctx.page.drawText(line, { x: ctx.M, y: ctx.y - size, size, font: ctx.fontB, color: ctx.inkColor });
		ctx.y -= size + 3;
	}
	ctx.y -= 3;
	ctx.page.drawRectangle({
		x: ctx.M,
		y: ctx.y - boxH,
		width: ctx.CW,
		height: boxH,
		borderColor: RULE,
		borderWidth: 0.5
	});
	let ty = ctx.y - size - 4;
	for (const line of answerLines) {
		ctx.page.drawText(line, { x: ctx.M + 7, y: ty, size, font: ctx.fontR, color: BLACK });
		ty -= size + 3;
	}
	ctx.y -= boxH + 9;
}

/** A rating grid: one row per item, one column per scale point, an X in the
 *  chosen cell. Q11/Q12/Q13 of the exit interview and the No-Dues tick columns
 *  are all this shape. */
export function ratingGrid(
	ctx: DocCtx,
	scale: readonly { value: string; label: string }[],
	rows: readonly { key: string; label: string }[],
	answers: Record<string, string>,
	opts: { size?: number; labelShare?: number } = {}
) {
	const size = opts.size ?? BODY - 0.5;
	const labelW = ctx.CW * (opts.labelShare ?? 0.46);
	const cellW = (ctx.CW - labelW) / scale.length;
	const headH = size + 12;

	const drawHead = () => {
		// Reserve the header plus two rows: a grid that starts at the bottom of a
		// page and breaks after one row reads as a rendering fault, not a table.
		ensure(ctx, headH + (size + 10) * 2 + 6);
		ctx.page.drawRectangle({ x: ctx.M, y: ctx.y - headH, width: ctx.CW, height: headH, color: SHADE });
		scale.forEach((s, i) => {
			const t = sanitize(s.label);
			const w = ctx.fontB.widthOfTextAtSize(t, size - 0.5);
			const cx = ctx.M + labelW + i * cellW + (cellW - w) / 2;
			ctx.page.drawText(t, { x: cx, y: ctx.y - headH + 4.5, size: size - 0.5, font: ctx.fontB, color: ctx.inkColor });
		});
		ctx.y -= headH;
	};

	drawHead();
	const gridTop = ctx.y + headH;
	let colTop = gridTop;

	for (const row of rows) {
		const labelLines = wrap(ctx.fontR, row.label, size, labelW - 10);
		const rowH = Math.max(size + 10, labelLines.length * (size + 2.5) + 7);
		if (ctx.y - rowH < ctx.bottomY) {
			// Close the column rules on this page before breaking, or the grid's
			// verticals stop mid-table.
			drawVerticals(ctx, colTop, ctx.y, labelW, cellW, scale.length);
			newPage(ctx);
			drawHead();
			colTop = ctx.y + headH;
		}
		let ty = ctx.y - size - 4;
		for (const line of labelLines) {
			ctx.page.drawText(line, { x: ctx.M + 5, y: ty, size, font: ctx.fontR, color: BLACK });
			ty -= size + 2.5;
		}
		const chosen = answers[row.key];
		scale.forEach((s, i) => {
			if (s.value !== chosen) return;
			const mark = 'X';
			const w = ctx.fontB.widthOfTextAtSize(mark, size + 1);
			ctx.page.drawText(mark, {
				x: ctx.M + labelW + i * cellW + (cellW - w) / 2,
				y: ctx.y - rowH / 2 - size * 0.35,
				size: size + 1,
				font: ctx.fontB,
				color: ctx.inkColor
			});
		});
		ctx.y -= rowH;
		ctx.page.drawRectangle({ x: ctx.M, y: ctx.y, width: ctx.CW, height: 0.5, color: RULE });
	}
	drawVerticals(ctx, colTop, ctx.y, labelW, cellW, scale.length);
	ctx.y -= 10;
}

function drawVerticals(
	ctx: DocCtx,
	top: number,
	bottom: number,
	labelW: number,
	cellW: number,
	cols: number
) {
	const h = top - bottom;
	if (h <= 0) return;
	const xs = [ctx.M, ctx.M + labelW];
	for (let i = 1; i <= cols; i++) xs.push(ctx.M + labelW + i * cellW);
	for (const x of xs) {
		ctx.page.drawRectangle({ x, y: bottom, width: 0.5, height: h, color: RULE });
	}
	ctx.page.drawRectangle({ x: ctx.M, y: top, width: ctx.CW, height: 0.5, color: RULE });
}

/** A checkbox row — `[X] Too heavy   [ ] About right` — for the single-choice
 *  questions (Q10 workload, Q14B recommendation, the Yes/No relieving items). */
export function choiceRow(
	ctx: DocCtx,
	options: readonly { value: string; label: string }[],
	chosen: string | null,
	opts: { size?: number; indent?: number } = {}
) {
	const size = opts.size ?? BODY;
	const indent = opts.indent ?? 0;
	ensure(ctx, size + 10);
	let x = ctx.M + indent;
	const box = size * 0.9;
	for (const o of options) {
		ctx.page.drawRectangle({
			x,
			y: ctx.y - size,
			width: box,
			height: box,
			borderColor: rgb(0.45, 0.45, 0.45),
			borderWidth: 0.6
		});
		if (o.value === chosen) {
			ctx.page.drawText('X', {
				x: x + 1.6,
				y: ctx.y - size + 1.4,
				size: size - 1.5,
				font: ctx.fontB,
				color: ctx.inkColor
			});
		}
		const label = sanitize(o.label);
		ctx.page.drawText(label, {
			x: x + box + 5,
			y: ctx.y - size + 0.5,
			size,
			font: ctx.fontR,
			color: BLACK
		});
		x += box + 9 + ctx.fontR.widthOfTextAtSize(label, size) + 16;
	}
	ctx.y -= size + 9;
}

export interface SignaturePanel {
	caption: string;
	/** Printed under the rule, e.g. the approver's name and designation. */
	subCaption?: string | null;
	image?: PDFImage | null;
	date?: string | null;
}

/** Signature panels laid out side by side. A panel with an image stamps it on
 *  the rule; one without leaves the rule blank to be signed by hand — which is
 *  what makes the same generator serve both the live digital copy and the
 *  print-and-sign copy HR keeps physically. */
export function signaturePanels(ctx: DocCtx, panels: SignaturePanel[], opts: { size?: number } = {}) {
	if (!panels.length) return;
	const size = opts.size ?? BODY;
	const colW = ctx.CW / panels.length;
	const panelW = Math.min(colW - 12, 180);
	const need = 54 + size * 3;
	ensure(ctx, need);
	ctx.y -= 30; // room to actually sign
	const ruleY = ctx.y;

	panels.forEach((p, i) => {
		const x = ctx.M + i * colW;
		ctx.page.drawRectangle({ x, y: ruleY, width: panelW, height: 0.6, color: rgb(0.55, 0.55, 0.55) });
		if (p.image) {
			// Sits on the rule, not floating above it: a signature that hovers
			// clear of its line reads as a pasted-on image rather than a signature.
			const dims = p.image.scaleToFit(panelW - 8, 30);
			ctx.page.drawImage(p.image, {
				x: x + (panelW - dims.width) / 2,
				y: ruleY + 1,
				width: dims.width,
				height: dims.height
			});
		}
		ctx.page.drawText(sanitize(p.caption), {
			x,
			y: ruleY - size - 4,
			size,
			font: ctx.fontB,
			color: ctx.inkColor
		});
		let sy = ruleY - size * 2 - 7;
		if (p.subCaption) {
			for (const line of wrap(ctx.fontR, p.subCaption, size - 1, panelW)) {
				ctx.page.drawText(line, { x, y: sy, size: size - 1, font: ctx.fontR, color: GREY });
				sy -= size + 1;
			}
		}
		ctx.page.drawText(sanitize(p.date ? `Date: ${p.date}` : 'Date: ____________'), {
			x,
			y: sy - 2,
			size: size - 0.5,
			font: ctx.fontR,
			color: GREY
		});
	});
	ctx.y = ruleY - size * 3 - 22 - (panels.some((p) => p.subCaption) ? 12 : 0);
}

/** A boxed note — used for the No-Dues certificate's standing instructions and
 *  for "not yet answered" states so a printed copy is never silently blank. */
export function noteBox(ctx: DocCtx, lines: string[], opts: { size?: number } = {}) {
	const size = opts.size ?? BODY - 1;
	const wrapped = lines.flatMap((l) => wrap(ctx.fontR, l, size, ctx.CW - 18));
	const boxH = wrapped.length * (size + 2.5) + 12;
	ensure(ctx, boxH + 8);
	ctx.page.drawRectangle({
		x: ctx.M,
		y: ctx.y - boxH,
		width: ctx.CW,
		height: boxH,
		color: rgb(0.97, 0.97, 0.98),
		borderColor: rgb(0.88, 0.88, 0.9),
		borderWidth: 0.5
	});
	// The primary-coloured spine marks this as an instruction block rather than
	// content, matching the accent stripe in the header.
	ctx.page.drawRectangle({ x: ctx.M, y: ctx.y - boxH, width: 2.4, height: boxH, color: ctx.primaryColor });
	let ty = ctx.y - size - 5;
	for (const line of wrapped) {
		ctx.page.drawText(line, { x: ctx.M + 10, y: ty, size, font: ctx.fontR, color: GREY });
		ty -= size + 2.5;
	}
	ctx.y -= boxH + 8;
}

/** Runs `block` with a guarantee that `need` points are available first, so a
 *  closing sign-off never lands alone on a fresh page away from the text it
 *  belongs to. */
export function keepTogether(ctx: DocCtx, need: number, block: () => void) {
	ensure(ctx, need);
	block();
}

export function finish(ctx: DocCtx): Promise<Uint8Array> {
	return ctx.doc.save();
}
