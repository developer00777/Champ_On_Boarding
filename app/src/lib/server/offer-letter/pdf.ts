// Generates a branded offer letter PDF using pdfkit.
// Logo loading: fetches from the app's own PUBLIC_BASE_URL so it works in
// both local dev and Vercel/Railway serverless (no readFileSync on static/).
import PDFDocument from 'pdfkit';
import { env as publicEnv } from '$env/dynamic/public';
import type { BrandTheme } from '$lib/shared/brands';
import type { OfferLetterInput } from './fields';
import { EMPLOYMENT_TYPE_LABELS, COMPENSATION_LABEL_BY_TRACK, LETTER_TYPE_BY_TRACK } from './fields';
import type { CandidateDoc } from '$lib/server/db/schema';
import type { Track } from '$lib/shared/matrix';

function hexToRgb(hex: string): [number, number, number] {
	const h = hex.replace('#', '');
	return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

async function fetchLogoBuffer(brand: BrandTheme): Promise<Buffer | null> {
	// Skip .webp — pdfkit can't decode it
	if (brand.logo.src.endsWith('.webp')) return null;
	try {
		const base = (publicEnv.PUBLIC_BASE_URL ?? 'http://localhost:5173').replace(/\/$/, '');
		const res = await fetch(`${base}${brand.logo.src}`, { signal: AbortSignal.timeout(4000) });
		if (!res.ok) return null;
		return Buffer.from(await res.arrayBuffer());
	} catch {
		return null;
	}
}

function dataUriToBuffer(dataUri: string): { buffer: Buffer; mime: string } | null {
	const match = dataUri.match(/^data:([^;]+);base64,(.+)$/);
	if (!match) return null;
	return { mime: match[1], buffer: Buffer.from(match[2], 'base64') };
}

/** Format a currency string: "240000" → "₹2,40,000" */
function formatCurrency(raw: string): string {
	const num = parseInt(raw.replace(/[^0-9]/g, ''), 10);
	if (isNaN(num)) return raw;
	return '₹' + num.toLocaleString('en-IN');
}

/** Append " days" if value is purely numeric */
function formatNoticePeriod(raw: string): string {
	return /^\d+$/.test(raw.trim()) ? `${raw.trim()} days` : raw;
}

function docBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		doc.on('data', (c: Buffer) => chunks.push(c));
		doc.on('end', () => resolve(Buffer.concat(chunks)));
		doc.on('error', reject);
		doc.end();
	});
}

export async function generateOfferLetterPdf(
	candidate: Pick<CandidateDoc, 'fullName' | 'email' | 'presentAddress' | 'track'>,
	companyName: string,
	offer: OfferLetterInput,
	brand: BrandTheme
): Promise<Buffer> {
	// Fetch logo before opening the document (async not allowed mid-stream)
	const logoBuf = await fetchLogoBuffer(brand);
	const sigData = offer.signatoryImageBase64 ? dataUriToBuffer(offer.signatoryImageBase64) : null;

	const [pr, pg, pb] = hexToRgb(brand.colors.primary);
	const [ir, ig, ib] = hexToRgb(brand.colors.ink);
	const primaryCss = `rgb(${pr},${pg},${pb})`;
	const inkCss = `rgb(${ir},${ig},${ib})`;

	const W = 595.28;  // A4 width pts
	const H = 841.89;  // A4 height pts
	const M = 56;      // left/right margin
	const CW = W - M * 2;
	const HEADER_H = 80;
	const FOOTER_H = 32;
	const FOOTER_Y = H - FOOTER_H;

	const doc = new PDFDocument({
		size: 'A4',
		// Reserve top margin for header, bottom for footer
		margins: { top: HEADER_H + 20, bottom: FOOTER_H + 20, left: M, right: M },
		info: {
			Title: `${LETTER_TYPE_BY_TRACK[candidate.track as Track]} — ${candidate.fullName ?? candidate.email}`,
			Author: companyName,
			Creator: 'ChampOnboard'
		},
		autoFirstPage: false
	});

	// ── Draw header + footer on every page via events ────────────────────────
	function drawPageChrome() {
		// Header bar
		doc.save();
		doc.rect(0, 0, W, HEADER_H).fill(inkCss);

		// Logo or monogram
		if (logoBuf) {
			try {
				doc.image(logoBuf, M, 18, { height: 44, fit: [170, 44] });
			} catch {
				doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(22)
					.text(brand.logo.monogram, M, 28);
			}
		} else {
			doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(22)
				.text(brand.logo.monogram, M, 28);
		}

		// Company name right-aligned in header
		doc.fillColor('rgba(255,255,255,0.75)').font('Helvetica').fontSize(8.5)
			.text(companyName, M, 56, { width: CW, align: 'right' });

		// Accent stripe under header
		doc.rect(0, HEADER_H, W, 3).fill(primaryCss);

		// Footer bar
		doc.rect(0, FOOTER_Y, W, FOOTER_H).fill(inkCss);
		doc.fillColor('rgba(255,255,255,0.45)').font('Helvetica').fontSize(7.5)
			.text(`${companyName} — Confidential`, M, FOOTER_Y + 11, { width: CW, align: 'center' });

		doc.restore();
	}

	doc.on('pageAdded', drawPageChrome);
	doc.addPage();

	// ── Date (right-aligned, top of content area) ─────────────────────────────
	const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
	doc.fillColor('#666666').font('Helvetica').fontSize(9)
		.text(`Date: ${today}`, M, HEADER_H + 18, { width: CW, align: 'right' });

	// ── Letter title ──────────────────────────────────────────────────────────
	const letterType = LETTER_TYPE_BY_TRACK[candidate.track as Track];
	doc.moveDown(1.2);
	doc.fillColor(inkCss).font('Helvetica-Bold').fontSize(15)
		.text(letterType.toUpperCase(), M, doc.y, { align: 'center', width: CW });

	// Thin rule under title
	doc.moveDown(0.5);
	doc.rect(M, doc.y, CW, 0.75).fill(primaryCss);
	doc.moveDown(1);

	// ── Candidate address block (formal letter style) ─────────────────────────
	const candidateName = candidate.fullName ?? candidate.email;
	doc.fillColor('#1a1a1a').font('Helvetica').fontSize(10);
	doc.text(`To,`);
	doc.text(candidateName, { bold: false });
	if (candidate.presentAddress) doc.text(candidate.presentAddress, { width: CW * 0.55 });
	doc.moveDown(1);

	// ── Salutation ────────────────────────────────────────────────────────────
	doc.font('Helvetica').fontSize(10.5).fillColor('#1a1a1a')
		.text(`Dear ${candidateName},`);
	doc.moveDown(0.6);

	// ── Opening paragraph ─────────────────────────────────────────────────────
	doc.font('Helvetica').fontSize(10).fillColor('#222222')
		.text(`We are pleased to extend this ${letterType} to you for the position of `, { continued: true })
		.font('Helvetica-Bold').text(offer.jobTitle || '___________', { continued: true })
		.font('Helvetica').text(` in the `, { continued: true })
		.font('Helvetica-Bold').text(offer.department || '___________', { continued: true })
		.font('Helvetica').text(` department at `, { continued: true })
		.font('Helvetica-Bold').text(companyName, { continued: true })
		.font('Helvetica').text(`. We look forward to you joining our team.`, { lineGap: 2 });

	// ── Employment details table ───────────────────────────────────────────────
	doc.moveDown(1);
	doc.fillColor(inkCss).font('Helvetica-Bold').fontSize(10)
		.text('EMPLOYMENT DETAILS', M);
	doc.moveDown(0.35);
	doc.rect(M, doc.y, CW, 1).fill(primaryCss);
	doc.moveDown(0.4);

	const compensationLabel = COMPENSATION_LABEL_BY_TRACK[candidate.track as Track];
	const rows: Array<[string, string]> = [
		['Date of Joining', offer.joiningDate || '—'],
		['Office Location', offer.officeLocation || '—'],
		['Reporting Manager', offer.reportingManager || '—'],
		['Employment Type', offer.employmentType ? EMPLOYMENT_TYPE_LABELS[offer.employmentType] : '—'],
		[compensationLabel, offer.ctcAmount ? `${formatCurrency(offer.ctcAmount)} per annum` : '—'],
		['Notice Period', offer.noticePeriod ? formatNoticePeriod(offer.noticePeriod) : '—'],
		['Acceptance Due Date', offer.acceptanceDueDate || '—'],
		...(offer.endDate ? [['End Date', offer.endDate] as [string, string]] : [])
	];

	let rowY = doc.y;
	const colLabel = M;
	const colVal = M + CW * 0.46;
	const rowH = 22;

	rows.forEach(([label, value], i) => {
		const bg = i % 2 === 0 ? '#f5f6f8' : '#ffffff';
		doc.rect(M, rowY, CW, rowH).fill(bg);
		// Left border accent on alternate rows
		doc.rect(M, rowY, 3, rowH).fill(i % 2 === 0 ? primaryCss : '#e0e0e0');
		doc.fillColor('#555555').font('Helvetica').fontSize(9.5)
			.text(label, colLabel + 8, rowY + 7, { width: CW * 0.42, lineBreak: false });
		doc.fillColor('#111111').font('Helvetica-Bold').fontSize(9.5)
			.text(value, colVal, rowY + 7, { width: CW * 0.52, lineBreak: false });
		rowY += rowH;
	});

	// Bottom rule of table
	doc.rect(M, rowY, CW, 1).fill('#dddddd');
	doc.y = rowY + 18;

	// ── Body paragraph ────────────────────────────────────────────────────────
	doc.fillColor('#222222').font('Helvetica').fontSize(10)
		.text(
			`We are confident that your skills and experience will be a valuable addition to our team. ` +
			`Please confirm your acceptance of this offer by signing and returning a copy of this letter ` +
			`by ${offer.acceptanceDueDate || 'the stated date'}. ` +
			`We are excited to welcome you aboard and look forward to working together.`,
			M, doc.y, { width: CW, lineGap: 3 }
		);

	// ── Signatory block ────────────────────────────────────────────────────────
	doc.moveDown(1.6);
	doc.fillColor('#222222').font('Helvetica').fontSize(10).text('Yours sincerely,', M);
	doc.moveDown(0.5);

	if (sigData) {
		try {
			doc.image(sigData.buffer, M, doc.y, { height: 52, fit: [160, 52] });
			doc.y = doc.y + 58;
		} catch {
			doc.moveDown(2.8);
		}
	} else {
		// Blank signature space
		doc.moveDown(2.8);
	}

	// Signature line
	doc.rect(M, doc.y, 150, 0.75).fill('#aaaaaa');
	doc.moveDown(0.5);
	doc.fillColor('#111111').font('Helvetica-Bold').fontSize(10)
		.text(offer.signatoryName || companyName, M);
	doc.fillColor('#555555').font('Helvetica').fontSize(9)
		.text(offer.signatoryDesignation || '', M);
	doc.fillColor('#666666').font('Helvetica').fontSize(9)
		.text(companyName, M);

	// ── Declaration / acceptance block ─────────────────────────────────────────
	doc.moveDown(2);
	doc.rect(M, doc.y, CW, 0.75).fill('#dddddd');
	doc.moveDown(0.8);
	doc.fillColor('#444444').font('Helvetica-Bold').fontSize(9)
		.text('ACCEPTANCE', M);
	doc.moveDown(0.4);
	doc.fillColor('#555555').font('Helvetica').fontSize(9)
		.text(
			`I, ${candidateName}, hereby accept the offer of employment as stated above and confirm that ` +
			`the details provided are accurate.`,
			M, doc.y, { width: CW, lineGap: 2 }
		);
	doc.moveDown(2.2);

	// Signature + Date lines for candidate
	const lineW = 160;
	doc.rect(M, doc.y, lineW, 0.75).fill('#aaaaaa');
	doc.rect(M + lineW + 40, doc.y, lineW, 0.75).fill('#aaaaaa');
	doc.moveDown(0.4);
	doc.fillColor('#666666').font('Helvetica').fontSize(8.5)
		.text('Signature', M, doc.y, { width: lineW, align: 'left' });
	doc.text('Date', M + lineW + 40, doc.y - doc.currentLineHeight(), { width: lineW, align: 'left' });

	return docBuffer(doc);
}
