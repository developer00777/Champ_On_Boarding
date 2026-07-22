// Generates a branded offer letter PDF using pdf-lib (pure JS, no Node streams —
// works on Vercel Edge, Node serverless, and Railway alike).
//
// Three real Champions Group templates, selected by track:
//   intern                → Internship Joining Agreement
//   consultant            → Consultant Agreement
//   contract              → Contract Agreement (same structure/terms as the
//                           consultant agreement, under its own title)
//   experienced | fresher → Offer of Appointment
//
// The layout engine below flows text down the page and auto-inserts page breaks
// (header + footer redrawn on each), so multi-page letters never overflow or
// leave blank pages. Company name is substituted from the recruiting brand.
import { PDFDocument, rgb, StandardFonts, PageSizes } from 'pdf-lib';
import type { PDFFont, PDFPage, PDFImage } from 'pdf-lib';
import fontkit from '@pdf-lib/fontkit';
import { env as publicEnv } from '$env/dynamic/public';
import type { BrandTheme } from '$lib/shared/brands';
import type { OfferLetterInput } from './fields';
import {
	EMPLOYMENT_TYPE_LABELS,
	DEFAULT_INTERN_CRITERIA,
	DEFAULT_CONSULTANT_PAYMENT_CLAUSE,
	computeAnnexureTotals
} from './fields';
import type { CandidateDoc } from '$lib/server/db/schema';
import { CONSULTANT_LETTER_TRACKS, type Track } from '$lib/shared/matrix';

// ── low-level helpers ────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
	const h = hex.replace('#', '');
	return [
		parseInt(h.slice(0, 2), 16) / 255,
		parseInt(h.slice(2, 4), 16) / 255,
		parseInt(h.slice(4, 6), 16) / 255
	];
}

async function fetchLogoBytes(brand: BrandTheme): Promise<Uint8Array | null> {
	if (brand.logo.src.endsWith('.webp')) return null;

	// Read straight off disk where the bundle ships `static/` alongside the
	// server (adapter-node, local scripts). Avoids the server HTTP-fetching its
	// own asset, which silently degrades the letter to a text monogram whenever
	// PUBLIC_BASE_URL is unset or the port isn't listening yet.
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
		/* no fs (edge runtime) — fall through to HTTP */
	}

	try {
		const base = (publicEnv.PUBLIC_BASE_URL ?? 'http://localhost:5173').replace(/\/$/, '');
		const res = await fetch(`${base}${brand.logo.src}`, { signal: AbortSignal.timeout(4000) });
		if (!res.ok) return null;
		return new Uint8Array(await res.arrayBuffer());
	} catch {
		return null;
	}
}

function dataUriToBytes(dataUri: string): Uint8Array | null {
	const match = dataUri.match(/^data:([^;]+);base64,(.+)$/);
	if (!match) return null;
	const bin = atob(match[2]);
	const bytes = new Uint8Array(bin.length);
	for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
	return bytes;
}

// pdf-lib StandardFonts use WinAnsi (cp1252) encoding and throw on any character
// outside it (₹, curly quotes, em-dash, emoji, non-Latin scripts). Map the common
// ones and strip the rest so a stray character never crashes generation.
function sanitize(text: string): string {
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

/** "240000" → "Rs. 2,40,000" (₹ glyph is not WinAnsi-encodable). */
function formatMoney(raw: string): string {
	const cleaned = raw.replace(/[^0-9.]/g, '');
	const num = parseInt(cleaned, 10);
	if (isNaN(num)) return raw;
	return 'Rs. ' + num.toLocaleString('en-IN');
}

/** Digits with no currency prefix — "17000" → "17,000" (the intern letter
 *  writes the stipend bare, with the currency carried by the words after it). */
function formatPlainAmount(raw: string): string {
	const num = parseInt(raw.replace(/[^0-9.]/g, ''), 10);
	return isNaN(num) ? raw : num.toLocaleString('en-IN');
}

/** Table-cell money format matching the signed annexure — "31,000.00", no
 *  currency prefix (the table header already establishes it's a salary grid). */
function formatTableAmount(n: number): string {
	return n.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** "1,040,880" → "10.41 Lakhs", matching the annexure's "CTC: 37.54+ Lakhs"
 *  footer line. */
function formatLakhs(n: number): string {
	return (n / 100000).toFixed(2) + ' Lakhs';
}

const ONES = [
	'', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten',
	'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'
];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function twoDigits(n: number): string {
	if (n < 20) return ONES[n];
	const t = TENS[Math.floor(n / 10)];
	const o = ONES[n % 10];
	return o ? `${t}-${o}` : t;
}

/** 17000 → "Seventeen Thousand" using the Indian system (lakh/crore), matching
 *  how the signed letters spell the stipend out beside the figure. */
function amountInWords(raw: string): string {
	let n = parseInt(raw.replace(/[^0-9]/g, ''), 10);
	if (isNaN(n) || n <= 0) return '';
	const parts: string[] = [];
	const units: Array<[number, string]> = [
		[10000000, 'Crore'],
		[100000, 'Lakh'],
		[1000, 'Thousand'],
		[100, 'Hundred']
	];
	for (const [value, label] of units) {
		const count = Math.floor(n / value);
		if (count > 0) {
			parts.push(`${twoDigits(count)} ${label}`);
			n %= value;
		}
	}
	if (n > 0) parts.push(twoDigits(n));
	return parts.join(' ');
}

// ── layout engine ────────────────────────────────────────────────────────────

interface Ctx {
	doc: PDFDocument;
	page: PDFPage;
	fontR: PDFFont;
	fontB: PDFFont;
	W: number;
	H: number;
	M: number;       // left/right margin
	CW: number;      // content width
	y: number;       // current baseline cursor (top-down)
	topY: number;    // y where content starts on a fresh page
	bottomY: number; // y below which we must break the page
	logo: PDFImage | null;
	inkColor: ReturnType<typeof rgb>;
	primaryColor: ReturnType<typeof rgb>;
	brand: BrandTheme;
	companyName: string;
	/** Body text size for this letter. Per-track: the intern agreement runs
	 *  larger so it fills its pinned pages (see INTERN_BODY_SIZE). */
	bodySize: number;
	/** Multiplier on the space between blocks (paragraphs, clauses, bullets).
	 *  The intern letter opens this up so its clauses reach the bottom margin
	 *  the way the signed original's do, instead of stopping ~30% short. */
	blockGap: number;
	/** Every "Authorized Signatory" rule drawn so far, with the page and exact
	 *  coordinates it was drawn at. The uploaded signature image is stamped
	 *  onto each of these afterwards — capturing the real draw spot instead of
	 *  guessing from the cursor's position once the whole document is laid out,
	 *  which broke the moment a page (the annexure) could render after the
	 *  signature block. */
	employerSigSpots: Array<{ page: PDFPage; x: number; y: number; width: number }>;
}

const BLACK = rgb(0.13, 0.13, 0.13);
const GREY = rgb(0.4, 0.4, 0.4);
const LIGHT = rgb(0.6, 0.6, 0.6);

// Clears the tallest header drawChrome() can draw: 14pt top gap + a 46pt logo
// + 3pt + the 9pt entity name beneath it, plus breathing room before the body.
const HEADER_H = 84;
const FOOTER_H = 26;

/** Default body text size. The offer-of-appointment and consultant letters are
 *  long enough to fill their pages at this size. */
const BODY_SIZE = 9.5;

/** The internship agreement is short, and its page breaks are pinned to the
 *  signed original's (see renderInternship). At BODY_SIZE the text ran out
 *  ~40% up each page and the pinned breaks left a dead band below it, so the
 *  intern letter is set at the Word original's ~11pt and fills the page the
 *  way the real document does. */
const INTERN_BODY_SIZE = 11;

/** Space between the intern letter's blocks, as a multiple of the default. The
 *  signed original runs its clauses down to the bottom margin; at 1.0 the text
 *  stopped ~40% up each page and the pinned breaks left a dead band below it.
 *  Tuned against the real content: this is the widest rhythm that still fits the
 *  three pinned pages — past ~3.5 the acceptance block overflows to a 4th/5th. */
const INTERN_BLOCK_GAP = 3.0;

/** Gap between wrapped lines for a given type size. Anchored so BODY_SIZE still
 *  returns the 3.5pt the appointment/consultant letters were tuned against —
 *  deriving it as a flat ratio drifted their glyphs by ~0.5pt for no reason. */
function leadingFor(size: number): number {
	return 3.5 * (size / BODY_SIZE);
}

/** Tracks whose offer of appointment is laid out to match the signed reference
 *  (3 pages: terms → acceptance → joining documents). `contract` shares the same
 *  template text but was not part of that reference, so it keeps the original
 *  free-flowing layout and its existing page count. */
const APPOINTMENT_PINNED_TRACKS: ReadonlySet<Track> = new Set<Track>(['fresher', 'experienced']);

/** Body/rhythm for the pinned appointment letters. Same reasoning as the intern
 *  letter: the reference is ~11pt on US Letter, so at BODY_SIZE on A4 the text
 *  stops well short of the bottom and the pinned breaks leave a dead band. */
const APPOINTMENT_BODY_SIZE = 11;

/** Tuned against the reference, which is itself only ~6% empty on its dense
 *  terms page but ~21%/~29% on the acceptance and joining-docs pages — those
 *  pages are genuinely short, so the target is the reference's profile, not a
 *  full sheet. 2.5 lands 4%/31%/41%; past ~2.9 the acceptance block overflows
 *  to a 4th page. */
const APPOINTMENT_BLOCK_GAP = 2.5;

/** The signed reference's final page: the documents required at joining. Fixed
 *  boilerplate — the same legal checklist for every hire, verbatim from the
 *  reference, so it is not recruiter-editable. */
const JOINING_DOCUMENTS = [
	'Photocopies of your educational certificates.',
	'PAN Card is must to submit.',
	'ADHAR Card Photocopy',
	'6 Passport size photographs',
	'Relieving letter from previous employer, if applicable',
	'Recent salary statement, if applicable.',
	'PF account details, if applicable.',
	'Proof of age.',
	'Income Tax Deduction certificate from the previous employer'
];

function drawChrome(ctx: Ctx, page: PDFPage) {
	const { W, H, M, brand, companyName } = ctx;
	// Top accent stripe
	page.drawRectangle({ x: 0, y: H - 4, width: W, height: 4, color: ctx.primaryColor });

	// Logo top-right, with the entity name beneath it.
	//
	// Sizing is by AREA, not scaleToFit(box): the brand logos range from 1.6:1
	// (Infometrics) to 6.8:1 (Champions Club), and fitting those to one box makes
	// the tall ones render at 42% of the width the wide ones get — they read as
	// different sizes on the page. Matching area instead makes them look like
	// siblings. The box is still enforced as a ceiling so nothing overruns.
	const NAME_SIZE = 9;
	const nameText = sanitize(brand.legalName || companyName);
	const nameW = ctx.fontB.widthOfTextAtSize(nameText, NAME_SIZE);
	let logoBottom = H - 30;

	// Print the name beneath the logo only when the artwork does not already
	// spell it out. A wordmark logo (hasWordmark) plus a printed name showed the
	// company name twice. A bare mark, or the monogram fallback when the image is
	// missing, still needs the printed name — it is the only place it appears.
	const showName = !(ctx.logo && brand.logo.hasWordmark);

	// The logo hugs the page edge more tightly than the text margin — it reads as
	// letterhead, which sits further into the corner than the body block.
	const LOGO_M = 34;

	if (ctx.logo) {
		const { width: iw, height: ih } = ctx.logo.scale(1);
		const TARGET_AREA = 182 * 50; // optical area every logo aims to fill
		const byArea = Math.sqrt(TARGET_AREA / (iw * ih));
		// Ceilings: width up to ~half the page (wide wordmarks like IP Momentum at
		// 7:1 are dominated by the width cap, so it is generous), height held clear
		// of the accent stripe. Floor the height so a very wide logo never shrinks
		// to an unreadable strip.
		const scale = Math.min(byArea, 285 / iw, 58 / ih);
		const h0 = ih * scale;
		const finalScale = h0 < 30 ? Math.min(30 / ih, 285 / iw) : scale;
		const w = iw * finalScale;
		const h = ih * finalScale;
		logoBottom = H - 12 - h;

		// `onDark` logos are white artwork meant for a dark surface. The page is
		// white, so without a plate behind them the wordmark is white-on-white and
		// simply disappears — Champion Products and Infratech were rendering as a
		// blank corner. brandCssVars() does the same thing for the web app
		// (brands.ts), the PDF just never did.
		if (brand.logo.onDark) {
			const PAD_X = 8;
			const PAD_Y = 5;
			page.drawRectangle({
				x: W - LOGO_M - w - PAD_X,
				y: logoBottom - PAD_Y,
				width: w + PAD_X * 2,
				height: h + PAD_Y * 2,
				color: ctx.inkColor
			});
		}
		page.drawImage(ctx.logo, { x: W - LOGO_M - w, y: logoBottom, width: w, height: h });
	} else {
		const mono = sanitize(brand.logo.monogram);
		const w = ctx.fontB.widthOfTextAtSize(mono, 20);
		logoBottom = H - 36;
		page.drawText(mono, { x: W - LOGO_M - w, y: logoBottom, font: ctx.fontB, size: 20, color: ctx.inkColor });
	}

	// The entity name is set under the logo rather than left to the 7.5pt footer,
	// but only when the logo does not already carry it (see showName above).
	if (showName) {
		page.drawText(nameText, {
			x: W - LOGO_M - nameW,
			y: logoBottom - NAME_SIZE - 3,
			font: ctx.fontB,
			size: NAME_SIZE,
			color: ctx.inkColor
		});
	}
	// Footer rule + confidential line + company name
	page.drawRectangle({ x: M, y: FOOTER_H, width: ctx.CW, height: 0.5, color: rgb(0.85, 0.85, 0.85) });
	const foot = sanitize(`${companyName}  -  Private & Confidential`);
	const fw = ctx.fontR.widthOfTextAtSize(foot, 7.5);
	page.drawText(foot, { x: (W - fw) / 2, y: FOOTER_H - 12, font: ctx.fontR, size: 7.5, color: LIGHT });
}

function newPage(ctx: Ctx) {
	const page = ctx.doc.addPage([ctx.W, ctx.H]);
	drawChrome(ctx, page);
	ctx.page = page;
	ctx.y = ctx.topY;
}

/** Ensure `need` pts of vertical space remain; else start a new page. */
function ensure(ctx: Ctx, need: number) {
	if (ctx.y - need < ctx.bottomY) newPage(ctx);
}

/** Greedy word-wrap to a pixel width for a given font/size. */
function wrap(ctx: Ctx, text: string, font: PDFFont, size: number, maxW: number): string[] {
	const words = sanitize(text).split(/\s+/);
	const lines: string[] = [];
	let line = '';
	for (const word of words) {
		const trial = line ? line + ' ' + word : word;
		if (font.widthOfTextAtSize(trial, size) > maxW && line) {
			lines.push(line);
			line = word;
		} else {
			line = trial;
		}
	}
	if (line) lines.push(line);
	return lines.length ? lines : [''];
}

/** Draw a paragraph (optionally indented), wrapping + paging as needed. */
function para(
	ctx: Ctx,
	text: string,
	opts: { size?: number; font?: PDFFont; color?: ReturnType<typeof rgb>; indent?: number; gapAfter?: number; lineGap?: number } = {}
) {
	const size = opts.size ?? ctx.bodySize;
	const font = opts.font ?? ctx.fontR;
	const color = opts.color ?? BLACK;
	const indent = opts.indent ?? 0;
	const lineGap = opts.lineGap ?? leadingFor(size);
	const maxW = ctx.CW - indent;
	const lines = wrap(ctx, text, font, size, maxW);
	for (const line of lines) {
		ensure(ctx, size + lineGap);
		ctx.page.drawText(line, { x: ctx.M + indent, y: ctx.y, font, size, color });
		ctx.y -= size + lineGap;
	}
	ctx.y -= (opts.gapAfter ?? 6) * ctx.blockGap;
}

/** A numbered/lettered clause: marker in the gutter, text hanging-indented. */
function clause(ctx: Ctx, marker: string, text: string, opts: { size?: number; gapAfter?: number } = {}) {
	const size = opts.size ?? ctx.bodySize;
	const lineGap = leadingFor(size);
	const gutter = ctx.fontR.widthOfTextAtSize(marker + ' ', size) + 2;
	const maxW = ctx.CW - gutter;
	const lines = wrap(ctx, text, ctx.fontR, size, maxW);
	ensure(ctx, size + lineGap);
	// marker
	ctx.page.drawText(sanitize(marker), { x: ctx.M, y: ctx.y, font: ctx.fontR, size, color: BLACK });
	// first line beside marker
	ctx.page.drawText(lines[0], { x: ctx.M + gutter, y: ctx.y, font: ctx.fontR, size, color: BLACK });
	ctx.y -= size + lineGap;
	for (let i = 1; i < lines.length; i++) {
		ensure(ctx, size + lineGap);
		ctx.page.drawText(lines[i], { x: ctx.M + gutter, y: ctx.y, font: ctx.fontR, size, color: BLACK });
		ctx.y -= size + lineGap;
	}
	ctx.y -= (opts.gapAfter ?? 5) * ctx.blockGap;
}

/** Bullet point (hanging indent under a dash). */
function bullet(ctx: Ctx, text: string, opts: { size?: number; indent?: number } = {}) {
	const size = opts.size ?? ctx.bodySize;
	const lineGap = leadingFor(size);
	const indent = opts.indent ?? 16;
	const gutter = 10;
	const maxW = ctx.CW - indent - gutter;
	const lines = wrap(ctx, text, ctx.fontR, size, maxW);
	ensure(ctx, size + lineGap);
	ctx.page.drawText('-', { x: ctx.M + indent, y: ctx.y, font: ctx.fontR, size, color: BLACK });
	ctx.page.drawText(lines[0], { x: ctx.M + indent + gutter, y: ctx.y, font: ctx.fontR, size, color: BLACK });
	ctx.y -= size + lineGap;
	for (let i = 1; i < lines.length; i++) {
		ensure(ctx, size + lineGap);
		ctx.page.drawText(lines[i], { x: ctx.M + indent + gutter, y: ctx.y, font: ctx.fontR, size, color: BLACK });
		ctx.y -= size + lineGap;
	}
	ctx.y -= 3 * ctx.blockGap;
}

/** Centered, underlined section heading. */
function heading(ctx: Ctx, text: string, opts: { size?: number } = {}) {
	const size = opts.size ?? 12;
	ensure(ctx, size + 14);
	const t = sanitize(text);
	const w = ctx.fontB.widthOfTextAtSize(t, size);
	const x = (ctx.W - w) / 2;
	ctx.page.drawText(t, { x, y: ctx.y, font: ctx.fontB, size, color: ctx.inkColor });
	// underline
	ctx.page.drawRectangle({ x, y: ctx.y - 2.5, width: w, height: 0.8, color: ctx.inkColor });
	ctx.y -= size + 12;
}

/** Left bold sub-heading. */
function subHeading(ctx: Ctx, text: string, opts: { size?: number; gapAfter?: number } = {}) {
	// Track the body size (+0.5 to sit just above it) rather than a fixed 10pt,
	// which read as smaller than the intern letter's 11pt body text.
	const size = opts.size ?? ctx.bodySize + 0.5;
	ensure(ctx, size + 8);
	ctx.page.drawText(sanitize(text), { x: ctx.M, y: ctx.y, font: ctx.fontB, size, color: BLACK });
	ctx.y -= size + (opts.gapAfter ?? 6) * ctx.blockGap;
}

/** A signature line + caption. Returns after advancing the cursor. */
function signatureLine(ctx: Ctx, caption: string, opts: { width?: number; bold?: boolean } = {}) {
	const width = opts.width ?? 200;
	const above = 14 * ctx.blockGap; // room to actually sign
	ensure(ctx, above + 18);
	ctx.y -= above;
	ctx.page.drawRectangle({ x: ctx.M, y: ctx.y, width, height: 0.6, color: rgb(0.6, 0.6, 0.6) });
	// The employer's uploaded signature image belongs on this exact rule, on
	// whichever page it lands — capture it here rather than inferring it from
	// the cursor once the whole document (including any pages rendered after
	// this one, e.g. the annexure) has finished laying out.
	if (caption === 'Authorized Signatory') {
		ctx.employerSigSpots.push({ page: ctx.page, x: ctx.M, y: ctx.y, width });
	}
	ctx.y -= 12;
	ctx.page.drawText(sanitize(caption), {
		x: ctx.M, y: ctx.y, font: opts.bold ? ctx.fontB : ctx.fontR, size: ctx.bodySize, color: BLACK
	});
	ctx.y -= 16;
}

function gap(ctx: Ctx, pts: number) {
	ctx.y -= pts;
}

/** Force the next content onto a fresh page (no-op if already at the top, so a
 *  reflow that lands the break naturally never emits a blank page). */
function pageBreak(ctx: Ctx) {
	if (ctx.y < ctx.topY) newPage(ctx);
}

/** Right-aligned rule + centred caption, e.g. the "Intern Signature" the
 *  internship agreement repeats mid-document so each page carries a sign-off. */
function signatureLineRight(ctx: Ctx, caption: string, opts: { width?: number } = {}) {
	const width = opts.width ?? 170;
	const above = 14 * ctx.blockGap;
	ensure(ctx, above + 20);
	ctx.y -= above;
	const x = ctx.W - ctx.M - width;
	ctx.page.drawRectangle({ x, y: ctx.y, width, height: 0.6, color: rgb(0.6, 0.6, 0.6) });
	ctx.y -= 12;
	const t = sanitize(caption);
	const tw = ctx.fontB.widthOfTextAtSize(t, ctx.bodySize);
	ctx.page.drawText(t, { x: x + (width - tw) / 2, y: ctx.y, font: ctx.fontB, size: ctx.bodySize, color: BLACK });
	ctx.y -= 16;
}

/** Two side-by-side signature columns (Intern | Mentor) with an optional
 *  "Date: ____" row beneath, mirroring the internship acceptance block. */
function signatureColumns(
	ctx: Ctx,
	left: string,
	right: string,
	opts: { dateRow?: boolean } = {}
) {
	const colW = 170;
	const leftX = ctx.M;
	const rightX = ctx.M + ctx.CW - colW;
	// Room to actually sign above each rule, scaled per track. The rule→caption
	// distance stays fixed so the caption never drifts off its own line.
	const above = 14 * ctx.blockGap;
	ensure(ctx, above + (opts.dateRow ? 46 : 20));
	ctx.y -= above;
	for (const x of [leftX, rightX]) {
		ctx.page.drawRectangle({ x, y: ctx.y, width: colW, height: 0.6, color: rgb(0.6, 0.6, 0.6) });
	}
	ctx.y -= 12;
	for (const [x, label] of [[leftX, left], [rightX, right]] as const) {
		const t = sanitize(label);
		const tw = ctx.fontB.widthOfTextAtSize(t, ctx.bodySize);
		ctx.page.drawText(t, { x: x + (colW - tw) / 2, y: ctx.y, font: ctx.fontB, size: ctx.bodySize, color: BLACK });
	}
	ctx.y -= 18 * ctx.blockGap;
	if (opts.dateRow) {
		for (const x of [leftX, rightX]) {
			ctx.page.drawText(sanitize('Date: _____________________'), {
				x, y: ctx.y, font: ctx.fontR, size: ctx.bodySize, color: BLACK
			});
		}
		ctx.y -= 18 * ctx.blockGap;
	}
}

/** Run `block` on a single page: if it needs more room than remains, break first.
 *  Keeps signature/acceptance blocks from splitting across a page boundary — a
 *  document people physically sign should never orphan "Date:" onto its own page. */
function keepTogether(ctx: Ctx, need: number, block: () => void) {
	ensure(ctx, need);
	block();
}

// ── table primitive (compensation annexure grid) ─────────────────────────────

interface TableCol {
	/** Fraction of the table width (must sum to 1 across a row's columns). */
	width: number;
	align?: 'left' | 'right' | 'center';
}

interface TableRowOpts {
	bold?: boolean;
	shade?: boolean;
	/** Draw a rule under this row (every row gets one by default; set false to
	 *  merge visually with the row beneath, e.g. a shaded subtotal followed
	 *  immediately by its section header). */
	rule?: boolean;
}

/** Fixed-column bordered table used for the compensation annexure. Handles
 *  page-break mid-table by redrawing outer borders per page — the annexure is
 *  short enough in practice that this never triggers, but a recruiter with an
 *  unusually long custom label list should not get a corrupted table. */
function table(ctx: Ctx, cols: TableCol[], rowH: number) {
	const x0 = ctx.M;
	const tw = ctx.CW;
	const colX: number[] = [];
	let acc = 0;
	for (const c of cols) {
		colX.push(x0 + acc * tw);
		acc += c.width;
	}
	colX.push(x0 + tw);

	function row(cells: string[], opts: TableRowOpts = {}) {
		ensure(ctx, rowH);
		const y0 = ctx.y;
		if (opts.shade) {
			ctx.page.drawRectangle({ x: x0, y: y0 - rowH, width: tw, height: rowH, color: rgb(0.88, 0.88, 0.88) });
		}
		const font = opts.bold ? ctx.fontB : ctx.fontR;
		const size = ctx.bodySize;
		const textY = y0 - rowH / 2 - size * 0.32;
		cells.forEach((raw, i) => {
			const text = sanitize(raw);
			const w = font.widthOfTextAtSize(text, size);
			const colW = colX[i + 1] - colX[i];
			const pad = 6;
			let tx = colX[i] + pad;
			const align = cols[i].align ?? 'left';
			if (align === 'right') tx = colX[i + 1] - pad - w;
			else if (align === 'center') tx = colX[i] + (colW - w) / 2;
			ctx.page.drawText(text, { x: tx, y: textY, font, size, color: BLACK });
		});
		// vertical borders
		for (const x of colX) {
			ctx.page.drawRectangle({ x, y: y0 - rowH, width: 0.6, height: rowH, color: rgb(0.55, 0.55, 0.55) });
		}
		if (opts.rule !== false) {
			ctx.page.drawRectangle({ x: x0, y: y0 - rowH, width: tw, height: 0.6, color: rgb(0.55, 0.55, 0.55) });
		}
		ctx.y -= rowH;
	}

	/** Full-width row spanning every column (section labels like "Other
	 *  Non-Cash Components:"). */
	function spanRow(text: string, opts: TableRowOpts = {}) {
		ensure(ctx, rowH);
		const y0 = ctx.y;
		if (opts.shade) {
			ctx.page.drawRectangle({ x: x0, y: y0 - rowH, width: tw, height: rowH, color: rgb(0.88, 0.88, 0.88) });
		}
		const font = opts.bold ? ctx.fontB : ctx.fontR;
		const size = ctx.bodySize;
		ctx.page.drawText(sanitize(text), {
			x: x0 + 6,
			y: y0 - rowH / 2 - size * 0.32,
			font,
			size,
			color: BLACK
		});
		ctx.page.drawRectangle({ x: x0, y: y0 - rowH, width: 0.6, height: rowH, color: rgb(0.55, 0.55, 0.55) });
		ctx.page.drawRectangle({ x: x0 + tw, y: y0 - rowH, width: 0.6, height: rowH, color: rgb(0.55, 0.55, 0.55) });
		if (opts.rule !== false) {
			ctx.page.drawRectangle({ x: x0, y: y0 - rowH, width: tw, height: 0.6, color: rgb(0.55, 0.55, 0.55) });
		}
		ctx.y -= rowH;
	}

	function topRule() {
		ctx.page.drawRectangle({ x: x0, y: ctx.y, width: tw, height: 0.6, color: rgb(0.55, 0.55, 0.55) });
	}

	return { row, spanRow, topRule };
}

// ── header block (Name / Contact / Email + Place / Date) ─────────────────────

function drawApplicantHeader(
	ctx: Ctx,
	opts: { name: string; contact: string; email: string; place?: string; date: string; internLabels?: boolean }
) {
	const labelName = opts.internLabels ? 'Intern Name' : 'Name';
	const labelContact = opts.internLabels ? 'Intern Contact No.' : 'Contact No';
	const labelEmail = opts.internLabels ? 'Intern Email Address' : 'Email ID';
	const size = ctx.bodySize;

	// Place (left) + Date (right) row for internship-style header
	if (opts.place !== undefined) {
		ctx.page.drawText(sanitize(`Place: ${opts.place}`), { x: ctx.M, y: ctx.y, font: ctx.fontB, size, color: BLACK });
		const dateStr = sanitize(`Date: ${opts.date}`);
		const dw = ctx.fontB.widthOfTextAtSize(dateStr, size);
		ctx.page.drawText(dateStr, { x: ctx.W - ctx.M - dw, y: ctx.y, font: ctx.fontB, size, color: BLACK });
		ctx.y -= size + 8;
	}

	const row = (label: string, value: string) => {
		ensure(ctx, size + 4);
		ctx.page.drawText(sanitize(`${label}: `), { x: ctx.M, y: ctx.y, font: ctx.fontB, size, color: BLACK });
		const lw = ctx.fontB.widthOfTextAtSize(`${label}: `, size);
		ctx.page.drawText(sanitize(value || '-'), { x: ctx.M + lw, y: ctx.y, font: ctx.fontR, size, color: BLACK });
		ctx.y -= size + 4;
	};
	row(labelName, opts.name);
	row(labelContact, opts.contact);
	row(labelEmail, opts.email);

	// Divider rule under the applicant block
	ctx.y -= 4;
	ctx.page.drawRectangle({ x: ctx.M, y: ctx.y, width: ctx.CW, height: 0.6, color: rgb(0.75, 0.75, 0.75) });
	ctx.y -= 14;
}

// ── date helpers ─────────────────────────────────────────────────────────────

function today(): string {
	return new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

// ═══════════════════════════════════════════════════════════════════════════
//  TEMPLATE 1 — OFFER OF APPOINTMENT  (experienced / fresher / contract)
// ═══════════════════════════════════════════════════════════════════════════
function renderOfferOfAppointment(
	ctx: Ctx,
	c: { name: string; contact: string; email: string },
	o: OfferLetterInput,
	company: string,
	/** Lay the letter out to match the signed reference's pages. False for
	 *  `contract`, which keeps the original free-flowing layout. */
	pinned = false
) {
	drawApplicantHeader(ctx, { name: c.name, contact: c.contact, email: c.email, date: today() });

	heading(ctx, 'OFFER OF APPOINTMENT');
	gap(ctx, 4);

	para(ctx, `Dear ${c.name},`, { font: ctx.fontB, gapAfter: 8 });

	para(
		ctx,
		`Further to your recent interview and its results, we are pleased to offer you an employment with our organization ${company} as "${o.jobTitle || '____________'}" with "subject to the following terms and conditions".`,
		{ gapAfter: 8 }
	);

	subHeading(ctx, `The starting date of your employment will be no later than ${o.joiningDate || '____________'}`, { gapAfter: 8 });

	const ctc = o.ctcAmount ? formatMoney(o.ctcAmount) : '____________';
	// The real letters quote an independent monthly take-home alongside annual
	// CTC; when HR leaves it blank the clause collapses to the CTC-only form.
	const monthly = o.monthlyCompensation?.trim() ? formatMoney(o.monthlyCompensation) : '';
	clause(
		ctx,
		'1.',
		monthly
			? `Your Total Cost To Company per Annum is ${ctc}/- out of which your monthly compensation is ${monthly}/- inclusive of Standard statutory deductions. *Refer Annexure*`
			: `Your Total Cost To Company per Annum is ${ctc}/- inclusive of Standard statutory deductions. *Refer Annexure*`
	);
	clause(ctx, '2.', `Statutory deductions and other standard benefits from the Company are as per the Rules and regulations.`);
	clause(ctx, '3.', `All rewards and increments will be based purely on your performance on the job and your Contribution to the company and subject to Company Rules and regulations as mentioned in company HRIS portal and Intranet.`);
	clause(ctx, '4.', `You will be required to observe the rules and regulations applicable to all employees of the Company. You will not engage in any trade or profession or undertaken employment, full or part-time, while in the services of the Company.`);
	clause(ctx, '5.', `You will on probation period of 6 months, after which you will be due for the confirmation. During this probation period, you required to give a notice period of ${o.noticePeriod || '30 days'} in the event of your resigning from the services of the company in normal circumstances but if training provided you are entitled to follow company process. However the notice period will be ${o.confirmedNoticePeriod?.trim() || '60 days'} after confirmation. Further ${company} can terminate this employment by serving you either by one-month notice or a month salary in lieu of notice, during the period of employment.`);
	clause(ctx, '6.', `In addition to holding all confidential information as a key member of our organization, you will not directly or indirectly engage in services with any of our competitors or start your own consultancy of similar nature during your tenure of employment or two years after leaving the company.`);
	clause(ctx, '7.', `You are entitled for Leave as per the rules and regulations of the company.`);
	clause(ctx, '8.', `You will have to work as per the scheduled time allotted to you except, Holidays. You will have to be flexible with your timings depending upon the company's requirements.`);
	clause(ctx, '9.', `During the term of your employment you are expected to adhere to the service conditions of the company that are in existence and framed by the company from time to time.`);
	clause(ctx, '10.', `The retirement of all members is 58 years.`);

	// The signed reference breaks here: page 1 closes on clause 10.
	if (pinned) pageBreak(ctx);

	clause(ctx, '11.', `You are requested to sign the EMPLOYMENT COMMITMENT AGREEMENT at the time of joining the Company and also by signing this Letter of offer you agree to be the part of ${company} for the period of two years.`);
	clause(ctx, '12.', `We are consciously endeavoring to build an atmosphere of trust, openness, responsiveness, Autonomy and growth among all members of the Strategic family. As a new entrant, we would like you to whole-heartedly contribute in this process.`, { gapAfter: 8 });

	para(ctx, `As a token of acceptance of the above terms and conditions, you are requested to sign a copy of this letter and return to us.`, { gapAfter: 6 });
	para(ctx, `Wish you a long and enjoyable career with ${company}.`, { gapAfter: 16 });

	// Employer signature + candidate acceptance: one indivisible block (~150pt).
	keepTogether(ctx, 150, () => {
		para(ctx, `For ${company}`, { font: ctx.fontB, gapAfter: 4 });
		signatureLine(ctx, 'Authorized Signatory', { width: 190, bold: true });

		gap(ctx, 10);
		para(ctx, `I hereby accept the above-mentioned terms and conditions`, { gapAfter: 14 });
		para(ctx, `Name:`, { gapAfter: 14 });
		para(ctx, `Signature:`, { gapAfter: 14 });
		para(ctx, `Date:`, { gapAfter: 0 });
	});

	if (!pinned) return;

	// Final page — the joining documents checklist. The reference carries a
	// salary annexure between the acceptance and this page; it is a per-person
	// breakdown (Basic/HRA/PF/Gratuity/ESI) the tool does not collect, so it is
	// deliberately omitted and this follows the acceptance directly.
	pageBreak(ctx);

	para(ctx, `You are required to submit to us the following at the time of your joining.`, { gapAfter: 4 });
	para(ctx, `(ALL DOCUMENTS ARE COMPULSORY-Get originals for verification at the time of joining)`, {
		font: ctx.fontB,
		gapAfter: 12
	});
	for (const doc of JOINING_DOCUMENTS) bullet(ctx, doc);
	gap(ctx, 18);

	// Both parties counter-sign this page in the reference.
	signatureColumns(ctx, 'Employee Acceptance Signature', 'Employer Representative Signature', {
		dateRow: true
	});
}

// ═══════════════════════════════════════════════════════════════════════════
//  PAGE 4 — COMPENSATION ANNEXURE  (fresher / experienced, when HR fills it in)
// ═══════════════════════════════════════════════════════════════════════════
//
// Reproduces the reference annexure's look (Employee/Effective Date/Designation
// header block, Components | P.M. | P.A. grid, shaded subtotal + total rows,
// CTC-in-Lakhs footer, dual signature block) but every P.M. figure is HR-
// editable and every P.A./total is derived, never re-typed — see
// computeAnnexureTotals in fields.ts.
function renderCompensationAnnexure(
	ctx: Ctx,
	c: { name: string },
	o: OfferLetterInput,
	company: string
) {
	pageBreak(ctx);

	const totals = computeAnnexureTotals(o.compensationAnnexure);
	const rowH = 15.5;
	const cols: TableCol[] = [
		{ width: 0.5, align: 'left' },
		{ width: 0.25, align: 'right' },
		{ width: 0.25, align: 'right' }
	];
	const t = table(ctx, cols, rowH);

	// Header block: Employee Name / Effective Date / Designation Offered — three
	// full-width rows above the Components|P.M.|P.A. grid, as in the reference.
	t.spanRow(`Employee Name :   ${c.name}`, { bold: true });
	t.spanRow(`Effective Date :   ${o.joiningDate || today()}`, { bold: true });
	t.spanRow(`Designation Offered :   ${o.jobTitle || '____________'}`, { bold: true });

	t.row(['Components', 'P.M.', 'P.A.'], { bold: true, shade: true });

	for (const line of totals.cash) {
		t.row([line.label, formatTableAmount(line.pm), formatTableAmount(line.pa)]);
	}
	t.row(
		['Total Cash Compensation (Before PF).', formatTableAmount(totals.cashTotalPm), formatTableAmount(totals.cashTotalPa)],
		{ bold: true, shade: true }
	);

	t.spanRow('Other Non-Cash Components:', { bold: true });
	for (const line of totals.nonCash) {
		t.row([line.label, formatTableAmount(line.pm), formatTableAmount(line.pa)]);
	}
	t.row(
		['Total Non-Cash Components', formatTableAmount(totals.nonCashTotalPm), formatTableAmount(totals.nonCashTotalPa)],
		{ bold: true, shade: true }
	);
	t.row(
		['Total Yearly Cost to Company', formatTableAmount(totals.grandTotalPm), formatTableAmount(totals.grandTotalPa)],
		{ bold: true, shade: true }
	);
	t.spanRow(`  CTC: ${formatLakhs(totals.grandTotalPa)}+`, { rule: false });

	gap(ctx, 28);

	keepTogether(ctx, 90, () => {
		signatureColumns(ctx, 'Employee Acceptance Signature', 'Employer Representative Signature', {
			dateRow: true
		});
	});
}

// ═══════════════════════════════════════════════════════════════════════════
//  TEMPLATE 2 — INTERNSHIP JOINING AGREEMENT  (intern)
// ═══════════════════════════════════════════════════════════════════════════
function renderInternship(
	ctx: Ctx,
	c: { name: string; contact: string; email: string },
	o: OfferLetterInput,
	company: string
) {
	const place = o.officeLocation || 'Bangalore';
	drawApplicantHeader(ctx, {
		name: c.name, contact: c.contact, email: c.email,
		place, date: today(), internLabels: true
	});

	heading(ctx, 'INTERNSHIP JOINING AGREEMENT');
	gap(ctx, 4);

	const start = o.joiningDate || '____________';
	const end = o.endDate || '____________';
	// "17,000/- per month (Rupees-Seventeen Thousand only)" — figure and words,
	// as the signed letters write it.
	const stipend = o.ctcAmount ? formatPlainAmount(o.ctcAmount) : '____________';
	const stipendWords = o.ctcAmount ? amountInWords(o.ctcAmount) : '';

	para(
		ctx,
		`With reference to your application we would like to congratulate you on being selected for internship with ${company}, based at ${place} as "${o.jobTitle || 'Trainee'}". Your internship is scheduled to start effective from ${start} to ${end}.`,
		{ gapAfter: 8 }
	);

	subHeading(ctx, 'Terms and conditions of the internship Program.', { gapAfter: 8 });

	clause(
		ctx,
		'1.',
		stipendWords
			? `As intern you will be paid ${stipend}/- per month (Rupees-${stipendWords} only), which is including Statutory deductions if any.`
			: `As intern you will be paid ${stipend}/- per month, which is including Statutory deductions if any.`
	);
	clause(ctx, '2.', `You are expected to operate with the highest degree of initiative, economy, efficiency and responsibility, you will at all times act bearing in mind the best interests of the company and will not no time do or say anything which compromises the company's goals or reputations. The company's standards of conduct and value system will be explained to you. These should be complied with at all times. If at any time you are found violating these standards of conduct or value systems, termination of services may be given without any notice. Further, if at any time it is found that you have made any false statement or produced false documents, your services are liable to be terminated without notice.`);
	clause(ctx, '3.', `During the internship program intern is abide by the company working hours, shifts and holidays based on the project allotted.`);
	clause(ctx, '4.', `During the course of Internship, you shall not accept any other employment, either full-time or part-time, either for remuneration or otherwise.`);
	clause(ctx, '5.', `Internship program can be terminated based on the company policy and procedure or based on code of the intern during the internship by without giving any notice to the Intern or by one day Updation with or without pay.`);
	clause(ctx, '6.', `You are responsible for your own accommodation and commuting office place.`, { gapAfter: 10 });

	signatureLineRight(ctx, 'Intern Signature');

	// The signed original breaks here: page 1 closes on clause 6 + the intern's
	// signature, so each page stands alone as a signing unit.
	pageBreak(ctx);

	// NDA clause 7
	subHeading(ctx, `7.  Non-Disclosure Agreement during the Internship with ${company}.`, { gapAfter: 6 });
	clause(ctx, 'a.', `During the course of your Internship with ${company} you will have access to confidential information about ${company}, its clients, its business transactions, and associated companies. You shall not during your course of internship or having ceased to be in the Internship of ${company}, disclose such confidential/proprietary information to any third party and/or any unauthorized person. All notes and memoranda pertaining to ${company} secrets and confidential/proprietary information made by or acquired by you during the course of your Internship shall at all times remain the property of ${company}.`);
	clause(ctx, 'b.', `You are obliged to sign a Non-disclosure agreement specific to a particular client as and when required by ${company}.`);
	clause(ctx, 'c.', `Prior to joining ${company}, you will be free from any contractual restrictions preventing you from accepting this offer or starting work on your Internship.`, { gapAfter: 8 });

	// Intern agreement. Recruiter-editable criteria; blank → the standard four.
	const criteria = (o.internCriteria?.trim() ? o.internCriteria : DEFAULT_INTERN_CRITERIA)
		.split('\n')
		.map((l) => l.trim())
		.filter(Boolean);
	const internAgreementText = `I ${c.name} acknowledge that I have been given a unique opportunity to gain valuable professional experience. I will be able to fulfil the Intern Profile described in a timely and professional manner. I also acknowledge that this internship is to be considered as a professional experience and that my performance will be evaluated based upon the following criteria:`;

	// Measure the heading + paragraph + every bullet so the list never orphans a
	// criterion onto the next page. Measured, not guessed: recruiters can add or
	// reword bullets, and a hardcoded height would silently stop matching.
	// Derived from ctx.bodySize so the math follows the type size.
	const lineH = ctx.bodySize + leadingFor(ctx.bodySize); // exactly what para()/bullet() advance
	const bulletLines = criteria.reduce(
		(n, cr) => n + wrap(ctx, cr, ctx.fontR, ctx.bodySize, ctx.CW - 26).length,
		0
	);
	const internAgreementNeed =
		ctx.bodySize + 6 + // "Intern Agreement:" sub-heading
		wrap(ctx, internAgreementText, ctx.fontR, ctx.bodySize, ctx.CW).length * lineH +
		bulletLines * lineH +
		criteria.length * 3 +
		6;

	keepTogether(ctx, internAgreementNeed, () => {
		subHeading(ctx, 'Intern Agreement:', { gapAfter: 6 });
		para(ctx, internAgreementText, { gapAfter: 6 });
		for (const cr of criteria) bullet(ctx, cr);
	});
	gap(ctx, 6);

	// Mentor agreement
	subHeading(ctx, 'Mentor Agreement', { gapAfter: 6 });
	const mentor = o.reportingManager || '____________';
	para(ctx, `I ${mentor} agree to mentor intern ${c.name} at ${company}. I acknowledge that this will be a professional experience for the intern, and agree to provide learning assistance and supervision throughout the internship. I agree to consult with both the intern and the internship coordinator before making any changes to the work plan.`, { gapAfter: 8 });

	signatureLineRight(ctx, 'Intern Signature');
	gap(ctx, 6);

	// Acceptance — the original's page 3, opening on "For <company>".
	pageBreak(ctx);

	para(ctx, `For ${company}`, { font: ctx.fontB, gapAfter: 6 });
	para(ctx, `If you accept the above terms and conditions of service, please signify your acceptance on the duplicate copy of the internship letter provided to you and report for duty as indicated above.`, { gapAfter: 6 });
	para(ctx, `I am sure that you will find your Internship with ${company} a great challenge and I look forward to a long and mutually beneficial association.`, { gapAfter: 6 });
	para(ctx, `Again, congratulations and we look forward to working with you.`, { gapAfter: 12 });

	// The signed letters carry the whole acceptance block — both signature grids,
	// the date row, and the company counter-signature — on a page of its own.
	keepTogether(ctx, 330, () => {
		subHeading(ctx, 'Acceptance Signature:', { gapAfter: 10 });
		signatureColumns(ctx, 'Intern Name', 'Mentor Name');
		gap(ctx, 10);
		signatureColumns(ctx, 'Intern Signature', 'Mentor Signature', { dateRow: true });
		gap(ctx, 6);

		para(ctx, `For ${company}:`, { font: ctx.fontB, gapAfter: 10 });
		signatureLine(ctx, 'Name');
		signatureLine(ctx, 'Signature');
		para(ctx, `Date: ____________________`, { gapAfter: 0 });
	});
}

// ═══════════════════════════════════════════════════════════════════════════
//  TEMPLATE 3 — CONSULTANT AGREEMENT  (consultant)
// ═══════════════════════════════════════════════════════════════════════════
function renderConsultant(
	ctx: Ctx,
	c: { name: string; contact: string; email: string },
	o: OfferLetterInput,
	company: string,
	/** Title for this track. Contract hires get the same agreement structure and
	 *  terms as consultants, but the document is their own — it must not call
	 *  itself a Consultant Agreement. */
	title = 'Consultant Agreement'
) {
	drawApplicantHeader(ctx, { name: c.name, contact: c.contact, email: c.email, date: today() });

	heading(ctx, title);
	gap(ctx, 4);

	para(ctx, `Dear ${c.name},`, { font: ctx.fontB, gapAfter: 8 });
	para(
		ctx,
		`With reference to your application and the subsequent discussions you had with us, we are pleased to offer you the position of "${o.jobTitle || '____________'}" on contractual assignment with us on the following terms and conditions:`,
		{ gapAfter: 8 }
	);

	subHeading(ctx, 'Terms and Conditions of the employment:', { gapAfter: 8 });

	clause(ctx, '1.', `This assignment will be effective from ${o.joiningDate || '____________'}.`);
	clause(ctx, '2.', `Your posting will be at our Corporate Office which is allocated based on the project need i.e., presently at ${company}${o.officeLocation ? ' - ' + o.officeLocation : ''}. However, during your contract period you may be stationed / located / posted / transferred by us to any other location of our Organization, as may be necessary for the implementation of the Project requirement.`);

	// Clause 3 — per-person weekly expectation
	if (o.weeklyExpectation.trim()) {
		clause(ctx, '3.', `You are expected to Maintain ${o.weeklyExpectation.trim()}.`);
	} else {
		clause(ctx, '3.', `You are expected to maintain the agreed weekly deliverables as discussed.`);
	}

	// Clause 4 — Key Responsibilities (manually entered, one bullet per line)
	const kras = o.keyResponsibilities.split('\n').map((l) => l.trim()).filter(Boolean);
	ensure(ctx, 20);
	ctx.page.drawText('4.', { x: ctx.M, y: ctx.y, font: ctx.fontR, size: 9.5, color: BLACK });
	ctx.page.drawText(sanitize('As discussed, here you can find Key Responsibilities:'), { x: ctx.M + 16, y: ctx.y, font: ctx.fontB, size: 9.5, color: BLACK });
	ctx.y -= 15;
	if (kras.length) {
		for (const k of kras) bullet(ctx, k);
	} else {
		bullet(ctx, '____________________________________________');
		bullet(ctx, '____________________________________________');
	}
	gap(ctx, 4);

	// Clause 5 — payment terms. Recruiter-editable in full (fee structures vary);
	// `{amount}` keeps the figure tracking ctcAmount so the two cannot drift apart.
	const fee = o.ctcAmount ? formatMoney(o.ctcAmount) : '____________';
	const paymentText = (o.paymentClause?.trim() || DEFAULT_CONSULTANT_PAYMENT_CLAUSE).replace(
		/\{amount\}/g,
		fee
	);
	clause(ctx, '5.', paymentText);
	clause(ctx, '6.', `This offer is valid and effective only after verification of your Personal and Professional Background besides your criminal background verification.`);
	clause(ctx, '7.', `Your salary shall be processed against the receipt of your monthly Report and performance reports duly approved by the authorized signatory and submitted to the HR Department.`);
	clause(ctx, '8.', `Absent from work:`);
	clause(ctx, '', `(1) If you remain absent from work, without any reasonable explanation, for more than two consecutive days, it will be presumed that you are no longer interested in working for the Company and have abandoned its services, There by terminating your contract of service without any notice. In such case, you will not be entitled to any compensation from the Company.`);
	clause(ctx, '9.', `Notice Period: During your contract period, you are required to give a notice period of ${o.noticePeriod || '15 days'} in the event of your resigning from the services of the company. Further ${company} can terminate your employment based on the Clients' input and based on projects' requirements at any given Point.`);
	clause(ctx, '10.', `Code of conduct: You are expected to operate with the highest degree of initiative, efficiency and responsibility, you will at all times act bearing in mind the best interests of the company and will not do or say anything which compromises the company's goals or reputations. The company's standards of conduct and value system will be explained to you. These should be complied with at all times. If at any time you are found violating these standards of conduct or value systems, termination of services may be given without any prior notice. Further, if at any time it is found that you have made any false statement or produced false documents, your services are liable to be terminated without any prior notice.`);
	clause(ctx, '11.', `Confidentiality: The Employee will not, during or at any time after the termination of your employment, disclose to any person or persons (except to senior Employees of the Company) nor use for your own benefit any confidential information that you may receive or obtain in relation to the affairs of the Company or its Clients.`);
	clause(ctx, '12.', `Termination of Employment: Company has the right to terminate the employment if it finds its employee indulging in the following without any prior notice or warning, pertaining to immediate termination.`);
	clause(ctx, 'a)', `Breach of company rules and regulations.`);
	clause(ctx, 'b)', `Having indulged in any activity which is illegal, against public interest or company or the project which employee is allotted.`);
	clause(ctx, 'c)', `Creating or getting associated with illegal groups or causing damage to Company or Clients' reputation and work place.`);
	clause(ctx, 'd)', `Found in any criminal or any other activity as specified by the state and central laws or found guilty of any laws or acts.`);
	clause(ctx, 'e)', `Strikes or protest against company or its clients or any project related personnel's.`);
	clause(ctx, 'f)', `Publishing, talking or posing anything negative statement about the Company Or its clients or any officials related to this project in public or social or any other open platforms.`);
	clause(ctx, 'g)', `Being absent from the work without intimation or Updation for two (2) consecutive scheduled working days.`);
	clause(ctx, 'h)', `If failed to perform as expected and trained by the project allotted and role as prescribed by Department or Reporting Authority.`);
	clause(ctx, 'i)', `If we find any employee with Unconstructive or Unethical Behavior with your reporting head or Co-Workers/Company Staff or with Customers.`);
	clause(ctx, 'j)', `If we receive any negative feedback from respective Reporting Officer/In charge or negative feedback from Customers.`);
	clause(ctx, 'k)', `If we found you being associated with any Unauthorized Association or Political Parties or if they form any Employee Union Committees.`);
	clause(ctx, 'l)', `Employee should not start a similar business till 12 months from the date of resigning, if contract is active for more than 12 months.`);
	clause(ctx, 'm)', `Should not share any important information or stock information to others or Competitor or other vendors.`, { gapAfter: 8 });

	subHeading(ctx, '12. General Conditions of Work: You will be bound by the following:', { gapAfter: 6 });
	bullet(ctx, `Age limit for employment is 58 Years; any employee above 58 Years will be given notice to resign immediately without any prior notice.`);
	bullet(ctx, `You will have no objection to working extra hours in the morning and or the evening according to the requirements of the job;`);
	bullet(ctx, `You will carry out your duties with diligence and loyalty at all times, keeping the Company's interest paramount;`);
	bullet(ctx, `You shall not at any circumstances either directly or indirectly, receive or accept for your own or on behalf of any commission, rebate, discount or profit from any person, company, or firm having business transactions with ${company} and the project allocated.`);
	bullet(ctx, `During your employment you will be bound by the Company's Rules and Regulations framed and enforced from time to time. The company reserves the right to amend or alter the said Rules and Regulations at its discretion, without any notice thereof, and these will be deemed as Rules and Regulations in terms of your employment;`);
	bullet(ctx, `The Company shall verify the facts stated by you in your resume submitted during the interview process. If any of the facts stated there in are found to be false, your services will be terminated immediately without any notice or any compensation in lieu of the notice period:`);
	bullet(ctx, `This letter is governed by and shall be construed in accordance with the laws of Karnataka, and both parties to this letter shall submit to the exclusive jurisdiction of the Karnataka Courts. This letter contains the entire understanding between the parties and supersedes all previous agreements and /or arrangements relating to employment with ${company} if any. Any amendment or modification to this letter shall be made in writing and signed by both the parties.`);
	bullet(ctx, `The terms and conditions of service are confidential and may not disclose to or discussed with anyone.`);
	bullet(ctx, `You will be required to observe the rules and regulations applicable to all employees of the company.`);
	bullet(ctx, `As being on Contract you are not entitled for any Gratuity or any other statutory obligations for the company.`);
	bullet(ctx, `The Parties acknowledge that this Agreement is non-exclusive and that either Party will be free, during and after the Term, to engage or contract with third parties for the provision of services similar to the Services.`);
	bullet(ctx, `You will keep us informed of any changes in your residential address, your family status or any other personal particulars relevant to your employment, as and when the change may occur.`);
	gap(ctx, 8);

	subHeading(ctx, 'Acceptance:', { gapAfter: 6 });
	para(ctx, `We are consciously endeavoring to build an atmosphere of trust, openness, responsiveness, autonomy and growth among all members of the ${company} family. As a new entrant, we would like you to wholeheartedly contribute in this process.`, { gapAfter: 6 });
	para(ctx, `This letter constitutes the complete understanding between you and the company regarding terms of employment with the company. This supersedes any and all other agreements, either written or oral, between you and the company regarding your employment. Any modification of this agreement will be effective only if it is in writing signed by both the parties. Any arbitration arising out of this contract will be held between employee and employer at Bangalore Head Office with company nominated person on one to one basis.`, { gapAfter: 6 });
	para(ctx, `I am sure that you will find your employment with ${company} a great challenge and we look forward to a long and mutually beneficial association.`, { gapAfter: 14 });

	keepTogether(ctx, 190, () => {
		para(ctx, `For ${company}`, { font: ctx.fontB, gapAfter: 10 });
		signatureLine(ctx, 'Authorized Signatory', { width: 190, bold: true });
		para(ctx, `Date:`, { gapAfter: 12 });

		para(ctx, `I have read, understood and accepted the above: I understand that the terms and conditions are pre - conditions to my being offered employment with the company. I am under no obligation or duress to accept these terms and conditions of employment. I accept them of my own free choice and will.`, { gapAfter: 14 });
		para(ctx, `Name:`, { font: ctx.fontB, gapAfter: 14 });
		para(ctx, `Signature:`, { font: ctx.fontB, gapAfter: 0 });
	});
}

// ── entry point ──────────────────────────────────────────────────────────────

export async function generateOfferLetterPdf(
	candidate: Pick<CandidateDoc, 'fullName' | 'email' | 'presentAddress' | 'track'> & { mobile?: string | null },
	companyName: string,
	offer: OfferLetterInput,
	brand: BrandTheme
): Promise<Uint8Array> {
	const doc = await PDFDocument.create();
	doc.registerFontkit(fontkit);
	doc.setTitle(`Offer Letter - ${candidate.fullName ?? candidate.email}`);
	doc.setAuthor(companyName);
	doc.setCreator('ChampHR');

	// Embed Carlito (metric-compatible with Calibri) to match the original Word
	// templates. Falls back to Helvetica only if the font modules fail to load.
	let fontR: PDFFont;
	let fontB: PDFFont;
	try {
		const [{ CARLITO_REGULAR_BASE64 }, { CARLITO_BOLD_BASE64 }] = await Promise.all([
			import('./font-carlito-regular'),
			import('./font-carlito-bold')
		]);
		const toBytes = (b64: string) => {
			const bin = atob(b64);
			const arr = new Uint8Array(bin.length);
			for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
			return arr;
		};
		// liga/clig off: Carlito's `ti`/`tt` ligatures embed as single glyphs with
		// no reverse mapping to their characters, so "conditions" rendered as
		// "conditi ons" and extracted from the text layer as "condi ons". Turning
		// the substitution off keeps Calibri's metrics while leaving every glyph
		// individually addressable. subset:false for the same reason — subsetting
		// drops glyphs the layout engine still references.
		const features = { liga: false, clig: false };
		fontR = await doc.embedFont(toBytes(CARLITO_REGULAR_BASE64), { subset: false, features });
		fontB = await doc.embedFont(toBytes(CARLITO_BOLD_BASE64), { subset: false, features });
	} catch {
		fontR = await doc.embedFont(StandardFonts.Helvetica);
		fontB = await doc.embedFont(StandardFonts.HelveticaBold);
	}

	// Logo (best-effort)
	const logoBytes = await fetchLogoBytes(brand);
	let logo: PDFImage | null = null;
	if (logoBytes) {
		try {
			logo = brand.logo.src.endsWith('.png')
				? await doc.embedPng(logoBytes)
				: await doc.embedJpg(logoBytes);
		} catch { logo = null; }
	}

	const [W, H] = PageSizes.A4;
	const M = 56;
	const [pr, pg, pb] = hexToRgb(brand.colors.primary);
	const [ir, ig, ib] = hexToRgb(brand.colors.ink);

	const track = candidate.track as Track;

	const ctx: Ctx = {
		doc,
		page: null as unknown as PDFPage,
		fontR,
		fontB,
		W,
		H,
		M,
		CW: W - M * 2,
		y: 0,
		topY: H - HEADER_H,
		bottomY: FOOTER_H + 20,
		logo,
		inkColor: rgb(ir, ig, ib),
		primaryColor: rgb(pr, pg, pb),
		brand,
		companyName: sanitize(companyName),
		bodySize:
			track === 'intern'
				? INTERN_BODY_SIZE
				: APPOINTMENT_PINNED_TRACKS.has(track)
					? APPOINTMENT_BODY_SIZE
					: BODY_SIZE,
		blockGap:
			track === 'intern'
				? INTERN_BLOCK_GAP
				: APPOINTMENT_PINNED_TRACKS.has(track)
					? APPOINTMENT_BLOCK_GAP
					: 1,
		employerSigSpots: []
	};

	// First page
	newPage(ctx);

	const c = {
		name: candidate.fullName ?? candidate.email,
		contact: candidate.mobile ? `+91 ${candidate.mobile}` : '',
		email: candidate.email
	};

	if (track === 'intern') {
		renderInternship(ctx, c, offer, ctx.companyName);
	} else if (CONSULTANT_LETTER_TRACKS.includes(track)) {
		renderConsultant(
			ctx,
			c,
			offer,
			ctx.companyName,
			track === 'contract' ? 'Contract Agreement' : 'Consultant Agreement'
		);
	} else {
		const pinned = APPOINTMENT_PINNED_TRACKS.has(track);
		renderOfferOfAppointment(ctx, c, offer, ctx.companyName, pinned);
		// Page 4: the compensation annexure clause 1 refers to. Appointment
		// tracks only (fresher/experienced) — consultants/contract are paid a
		// flat fee via clause 5, not a Basic/HRA/PF breakdown.
		if (pinned && offer.compensationAnnexure.enabled) {
			renderCompensationAnnexure(ctx, c, offer, ctx.companyName);
		}
	}

	// Stamp the uploaded signature image onto every "Authorized Signatory" rule
	// captured while rendering (renderOfferOfAppointment's employer block,
	// renderConsultant's) — each on its own page, sitting just above its own
	// rule, however many pages the letter ends up with.
	if (offer.signatoryImageBase64 && ctx.employerSigSpots.length) {
		const sigBytes = dataUriToBytes(offer.signatoryImageBase64);
		if (sigBytes) {
			try {
				const sigImg = await doc.embedPng(sigBytes).catch(() => doc.embedJpg(sigBytes));
				const dims = sigImg.scaleToFit(140, 40);
				for (const spot of ctx.employerSigSpots) {
					spot.page.drawImage(sigImg, {
						x: spot.x + (spot.width - dims.width) / 2,
						y: spot.y + 4,
						width: dims.width,
						height: dims.height
					});
				}
			} catch { /* ignore bad signature image */ }
		}
	}

	return doc.save();
}

// Re-export so existing imports of EMPLOYMENT_TYPE_LABELS via this module still work.
export { EMPLOYMENT_TYPE_LABELS };
