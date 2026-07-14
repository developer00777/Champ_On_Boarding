// Generates a branded offer letter PDF using pdf-lib (pure JS, no Node streams).
// Works on Vercel Edge, Node.js serverless, and Railway — no runtime restrictions.
import { PDFDocument, rgb, StandardFonts, PageSizes } from 'pdf-lib';
import { env as publicEnv } from '$env/dynamic/public';
import type { BrandTheme } from '$lib/shared/brands';
import type { OfferLetterInput } from './fields';
import { EMPLOYMENT_TYPE_LABELS, COMPENSATION_LABEL_BY_TRACK, LETTER_TYPE_BY_TRACK } from './fields';
import type { CandidateDoc } from '$lib/server/db/schema';
import type { Track } from '$lib/shared/matrix';

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

function formatCurrency(raw: string): string {
	const num = parseInt(raw.replace(/[^0-9]/g, ''), 10);
	if (isNaN(num)) return raw;
	return '₹' + num.toLocaleString('en-IN');
}

function formatNoticePeriod(raw: string): string {
	return /^\d+$/.test(raw.trim()) ? `${raw.trim()} days` : raw;
}

// pdf-lib text wrapping helper
function wrapText(text: string, maxWidth: number, fontSize: number, avgCharWidth: number): string[] {
	const charsPerLine = Math.floor(maxWidth / (fontSize * avgCharWidth));
	const words = text.split(' ');
	const lines: string[] = [];
	let current = '';
	for (const word of words) {
		if ((current + ' ' + word).trim().length > charsPerLine && current) {
			lines.push(current.trim());
			current = word;
		} else {
			current = (current + ' ' + word).trim();
		}
	}
	if (current) lines.push(current.trim());
	return lines;
}

export async function generateOfferLetterPdf(
	candidate: Pick<CandidateDoc, 'fullName' | 'email' | 'presentAddress' | 'track'>,
	companyName: string,
	offer: OfferLetterInput,
	brand: BrandTheme
): Promise<Uint8Array> {
	const pdfDoc = await PDFDocument.create();
	pdfDoc.setTitle(`${LETTER_TYPE_BY_TRACK[candidate.track as Track]} — ${candidate.fullName ?? candidate.email}`);
	pdfDoc.setAuthor(companyName);
	pdfDoc.setCreator('ChampOnboard');

	const fontRegular = await pdfDoc.embedFont(StandardFonts.Helvetica);
	const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);

	// Fetch logo + sig before drawing
	const logoBytes = await fetchLogoBytes(brand);
	const sigBytes = offer.signatoryImageBase64 ? dataUriToBytes(offer.signatoryImageBase64) : null;

	let logoImage = null;
	if (logoBytes) {
		try {
			// Try PNG first, fall back to JPG
			if (brand.logo.src.endsWith('.png')) {
				logoImage = await pdfDoc.embedPng(logoBytes);
			} else {
				logoImage = await pdfDoc.embedJpg(logoBytes);
			}
		} catch { logoImage = null; }
	}

	let sigImage = null;
	if (sigBytes) {
		try {
			sigImage = await pdfDoc.embedPng(sigBytes).catch(() => pdfDoc.embedJpg(sigBytes!));
		} catch { sigImage = null; }
	}

	const [W, H] = PageSizes.A4; // 595.28 x 841.89
	const page = pdfDoc.addPage([W, H]);

	// Colours
	const [pr, pg, pb] = hexToRgb(brand.colors.primary);
	const [ir, ig, ib] = hexToRgb(brand.colors.ink);
	const inkColor = rgb(ir, ig, ib);
	const primaryColor = rgb(pr, pg, pb);
	const black = rgb(0.1, 0.1, 0.1);
	const grey = rgb(0.4, 0.4, 0.4);
	const lightGrey = rgb(0.6, 0.6, 0.6);
	const white = rgb(1, 1, 1);
	const rowBg = rgb(0.96, 0.97, 0.98);

	const M = 56;       // margin
	const CW = W - M * 2;
	const HEADER_H = 78;
	const FOOTER_H = 28;

	// ── Header bar ────────────────────────────────────────────────────────────
	page.drawRectangle({ x: 0, y: H - HEADER_H, width: W, height: HEADER_H, color: inkColor });

	// Logo image or monogram
	if (logoImage) {
		const logoDims = logoImage.scaleToFit(160, 44);
		page.drawImage(logoImage, {
			x: M,
			y: H - HEADER_H + (HEADER_H - logoDims.height) / 2,
			width: logoDims.width,
			height: logoDims.height
		});
	} else {
		page.drawText(brand.logo.monogram, {
			x: M, y: H - HEADER_H + 28,
			font: fontBold, size: 22, color: white
		});
	}

	// Company name right-aligned in header
	const coNameW = fontRegular.widthOfTextAtSize(companyName, 8.5);
	page.drawText(companyName, {
		x: W - M - coNameW, y: H - HEADER_H + 14,
		font: fontRegular, size: 8.5, color: rgb(0.8, 0.8, 0.8)
	});

	// ── Accent stripe ─────────────────────────────────────────────────────────
	page.drawRectangle({ x: 0, y: H - HEADER_H - 3, width: W, height: 3, color: primaryColor });

	// ── Footer bar ────────────────────────────────────────────────────────────
	page.drawRectangle({ x: 0, y: 0, width: W, height: FOOTER_H, color: inkColor });
	const footerText = `${companyName} — Confidential`;
	const footerW = fontRegular.widthOfTextAtSize(footerText, 7.5);
	page.drawText(footerText, {
		x: (W - footerW) / 2, y: 9,
		font: fontRegular, size: 7.5, color: rgb(0.6, 0.6, 0.6)
	});

	// ── Content cursor ────────────────────────────────────────────────────────
	let y = H - HEADER_H - 3 - 22; // start just below accent stripe

	// ── Date ─────────────────────────────────────────────────────────────────
	const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: 'long', year: 'numeric' });
	const dateStr = `Date: ${today}`;
	const dateW = fontRegular.widthOfTextAtSize(dateStr, 9);
	page.drawText(dateStr, { x: W - M - dateW, y, font: fontRegular, size: 9, color: grey });
	y -= 24;

	// ── Letter title ─────────────────────────────────────────────────────────
	const letterType = LETTER_TYPE_BY_TRACK[candidate.track as Track];
	const titleText = letterType.toUpperCase();
	const titleW = fontBold.widthOfTextAtSize(titleText, 15);
	page.drawText(titleText, { x: (W - titleW) / 2, y, font: fontBold, size: 15, color: inkColor });
	y -= 8;

	// Rule under title
	page.drawRectangle({ x: M, y, width: CW, height: 0.75, color: primaryColor });
	y -= 18;

	// ── To: address block ────────────────────────────────────────────────────
	const candidateName = candidate.fullName ?? candidate.email;
	page.drawText('To,', { x: M, y, font: fontRegular, size: 10, color: black });
	y -= 14;
	page.drawText(candidateName, { x: M, y, font: fontBold, size: 10, color: black });
	y -= 14;
	if (candidate.presentAddress) {
		const addrLines = wrapText(candidate.presentAddress, CW * 0.55, 9.5, 0.52);
		for (const line of addrLines) {
			page.drawText(line, { x: M, y, font: fontRegular, size: 9.5, color: grey });
			y -= 13;
		}
	}
	y -= 10;

	// ── Salutation ────────────────────────────────────────────────────────────
	page.drawText(`Dear ${candidateName},`, { x: M, y, font: fontRegular, size: 10.5, color: black });
	y -= 18;

	// ── Opening paragraph ────────────────────────────────────────────────────
	const openingLines = wrapText(
		`We are pleased to extend this ${letterType} to you for the position of ${offer.jobTitle || '___________'} in the ${offer.department || '___________'} department at ${companyName}. We look forward to you joining our team.`,
		CW, 10, 0.52
	);
	for (const line of openingLines) {
		page.drawText(line, { x: M, y, font: fontRegular, size: 10, color: black });
		y -= 14;
	}
	y -= 10;

	// ── Employment details heading ─────────────────────────────────────────────
	page.drawText('EMPLOYMENT DETAILS', { x: M, y, font: fontBold, size: 10, color: inkColor });
	y -= 6;
	page.drawRectangle({ x: M, y, width: CW, height: 0.75, color: primaryColor });
	y -= 6;

	// ── Details table ─────────────────────────────────────────────────────────
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

	const ROW_H = 22;
	const colVal = M + CW * 0.46;

	for (let i = 0; i < rows.length; i++) {
		const [label, value] = rows[i];
		// Alternating row background
		if (i % 2 === 0) {
			page.drawRectangle({ x: M, y: y - ROW_H + 5, width: CW, height: ROW_H, color: rowBg });
		}
		// Left accent stripe
		page.drawRectangle({ x: M, y: y - ROW_H + 5, width: 3, height: ROW_H, color: i % 2 === 0 ? primaryColor : rgb(0.88, 0.88, 0.88) });
		page.drawText(label, { x: M + 8, y: y - 7, font: fontRegular, size: 9.5, color: grey });
		page.drawText(value, { x: colVal, y: y - 7, font: fontBold, size: 9.5, color: black });
		y -= ROW_H;
	}

	// Bottom rule of table
	page.drawRectangle({ x: M, y, width: CW, height: 0.75, color: rgb(0.85, 0.85, 0.85) });
	y -= 16;

	// ── Body paragraph ────────────────────────────────────────────────────────
	const bodyLines = wrapText(
		`We are confident that your skills and experience will be a valuable addition to our team. Please confirm your acceptance of this offer by signing and returning a copy of this letter by ${offer.acceptanceDueDate || 'the stated date'}. We are excited to welcome you aboard and look forward to working together.`,
		CW, 10, 0.52
	);
	for (const line of bodyLines) {
		page.drawText(line, { x: M, y, font: fontRegular, size: 10, color: black });
		y -= 14;
	}
	y -= 16;

	// ── Signatory ─────────────────────────────────────────────────────────────
	page.drawText('Yours sincerely,', { x: M, y, font: fontRegular, size: 10, color: black });
	y -= 14;

	if (sigImage) {
		try {
			const sigDims = sigImage.scaleToFit(160, 52);
			page.drawImage(sigImage, { x: M, y: y - sigDims.height, width: sigDims.width, height: sigDims.height });
			y -= sigDims.height + 8;
		} catch {
			y -= 52;
		}
	} else {
		y -= 52; // blank space for wet signature
	}

	// Signature rule
	page.drawRectangle({ x: M, y, width: 150, height: 0.75, color: rgb(0.67, 0.67, 0.67) });
	y -= 12;
	page.drawText(offer.signatoryName || companyName, { x: M, y, font: fontBold, size: 10, color: black });
	y -= 13;
	if (offer.signatoryDesignation) {
		page.drawText(offer.signatoryDesignation, { x: M, y, font: fontRegular, size: 9, color: grey });
		y -= 13;
	}
	page.drawText(companyName, { x: M, y, font: fontRegular, size: 9, color: lightGrey });
	y -= 24;

	// ── Acceptance block ──────────────────────────────────────────────────────
	if (y > FOOTER_H + 80) {
		page.drawRectangle({ x: M, y, width: CW, height: 0.75, color: rgb(0.85, 0.85, 0.85) });
		y -= 14;
		page.drawText('ACCEPTANCE', { x: M, y, font: fontBold, size: 9, color: grey });
		y -= 14;

		const acceptLines = wrapText(
			`I, ${candidateName}, hereby accept the offer of employment as stated above and confirm that the details provided are accurate.`,
			CW, 9, 0.52
		);
		for (const line of acceptLines) {
			page.drawText(line, { x: M, y, font: fontRegular, size: 9, color: grey });
			y -= 13;
		}
		y -= 24;

		// Candidate sig + date lines
		const lineW = 155;
		page.drawRectangle({ x: M, y, width: lineW, height: 0.75, color: rgb(0.67, 0.67, 0.67) });
		page.drawRectangle({ x: M + lineW + 40, y, width: lineW, height: 0.75, color: rgb(0.67, 0.67, 0.67) });
		y -= 12;
		page.drawText('Signature', { x: M, y, font: fontRegular, size: 8.5, color: lightGrey });
		page.drawText('Date', { x: M + lineW + 40, y, font: fontRegular, size: 8.5, color: lightGrey });
	}

	const pdfBytes = await pdfDoc.save();
	return pdfBytes;
}
