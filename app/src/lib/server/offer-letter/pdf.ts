// Generates a branded offer letter as a PDF using pdfkit.
// This is the canonical output format (replaces .docx for sending/downloading).
// The .docx template is kept only as a legacy fallback for Word-editable exports.
import PDFDocument from 'pdfkit';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type { BrandTheme } from '$lib/shared/brands';
import type { OfferLetterInput } from './fields';
import { EMPLOYMENT_TYPE_LABELS, COMPENSATION_LABEL_BY_TRACK, LETTER_TYPE_BY_TRACK } from './fields';
import type { CandidateDoc } from '$lib/server/db/schema';
import type { Track } from '$lib/shared/matrix';

function hexToRgb(hex: string): [number, number, number] {
	const h = hex.replace('#', '');
	return [
		parseInt(h.slice(0, 2), 16),
		parseInt(h.slice(2, 4), 16),
		parseInt(h.slice(4, 6), 16)
	];
}

function tryReadLogo(src: string): Buffer | null {
	// src is like "/brands/champion-infratech.png" — map to static/
	// Supports .png and .webp (pdfkit can't handle .webp; fallback to null)
	if (src.endsWith('.webp')) return null;
	try {
		const staticDir = resolve('static');
		return readFileSync(resolve(staticDir, src.replace(/^\//, '')));
	} catch {
		return null;
	}
}

function docBuffer(doc: PDFKit.PDFDocument): Promise<Buffer> {
	return new Promise((resolve, reject) => {
		const chunks: Buffer[] = [];
		doc.on('data', (chunk: Buffer) => chunks.push(chunk));
		doc.on('end', () => resolve(Buffer.concat(chunks)));
		doc.on('error', reject);
		doc.end();
	});
}

function dataUriToBuffer(dataUri: string): { buffer: Buffer; mime: string } | null {
	const match = dataUri.match(/^data:([^;]+);base64,(.+)$/);
	if (!match) return null;
	return { mime: match[1], buffer: Buffer.from(match[2], 'base64') };
}

export async function generateOfferLetterPdf(
	candidate: Pick<CandidateDoc, 'fullName' | 'email' | 'presentAddress' | 'track'>,
	companyName: string,
	offer: OfferLetterInput,
	brand: BrandTheme
): Promise<Buffer> {
	const doc = new PDFDocument({
		size: 'A4',
		margins: { top: 50, bottom: 50, left: 60, right: 60 },
		info: {
			Title: `${LETTER_TYPE_BY_TRACK[candidate.track as Track]} — ${candidate.fullName ?? candidate.email}`,
			Author: companyName,
			Creator: 'ChampOnboard'
		}
	});

	const W = 595.28;   // A4 width in pts
	const M = 60;       // left/right margin
	const CW = W - M * 2; // content width
	const [pr, pg, pb] = hexToRgb(brand.colors.primary);
	const [ir, ig, ib] = hexToRgb(brand.colors.ink);

	// ── Header bar ───────────────────────────────────────────────────────────
	doc.rect(0, 0, W, 72).fill(`rgb(${ir},${ig},${ib})`);

	const logoBuf = tryReadLogo(brand.logo.src);
	if (logoBuf) {
		try {
			doc.image(logoBuf, M, 16, { height: 40, fit: [160, 40] });
		} catch {
			// image decode failed — skip logo, show monogram instead
			doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(20).text(brand.logo.monogram, M, 26);
		}
	} else {
		doc.fillColor('#ffffff').font('Helvetica-Bold').fontSize(20).text(brand.logo.monogram, M, 26);
	}

	// Company name right-aligned in header
	doc.fillColor('#ffffff').font('Helvetica').fontSize(9)
		.text(companyName, M, 30, { width: CW, align: 'right' });

	// ── Thin accent rule ─────────────────────────────────────────────────────
	doc.rect(0, 72, W, 3).fill(`rgb(${pr},${pg},${pb})`);

	// ── Date ─────────────────────────────────────────────────────────────────
	const today = new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' });
	doc.moveDown(1.4);
	doc.fillColor('#555555').font('Helvetica').fontSize(9)
		.text(`Date: ${today}`, M, doc.y, { align: 'right', width: CW });

	// ── Letter type heading ───────────────────────────────────────────────────
	const letterType = LETTER_TYPE_BY_TRACK[candidate.track as Track];
	doc.moveDown(0.6);
	doc.fillColor(`rgb(${ir},${ig},${ib})`).font('Helvetica-Bold').fontSize(16)
		.text(letterType.toUpperCase(), M, doc.y, { align: 'center', width: CW });

	// ── Horizontal rule ───────────────────────────────────────────────────────
	doc.moveDown(0.5);
	doc.rect(M, doc.y, CW, 1).fill(`rgb(${pr},${pg},${pb})`);
	doc.moveDown(0.8);

	// ── Salutation ───────────────────────────────────────────────────────────
	const candidateName = candidate.fullName ?? candidate.email;
	doc.fillColor('#1a1a1a').font('Helvetica').fontSize(10.5)
		.text(`Dear ${candidateName},`, M);

	doc.moveDown(0.6);
	doc.text(
		`We are pleased to offer you the position of `,
		M, doc.y, { continued: true }
	)
		.font('Helvetica-Bold').text(offer.jobTitle || '___________', { continued: true })
		.font('Helvetica').text(` in the `, { continued: true })
		.font('Helvetica-Bold').text(offer.department || '___________', { continued: true })
		.font('Helvetica').text(` department at `, { continued: true })
		.font('Helvetica-Bold').text(companyName, { continued: true })
		.font('Helvetica').text(`. We look forward to you joining our team.`);

	// ── Details table ─────────────────────────────────────────────────────────
	doc.moveDown(1);
	doc.fillColor(`rgb(${ir},${ig},${ib})`).font('Helvetica-Bold').fontSize(10.5)
		.text('EMPLOYMENT DETAILS', M);
	doc.moveDown(0.4);
	doc.rect(M, doc.y, CW, 1).fill(`rgb(${pr},${pg},${pb})`);
	doc.moveDown(0.5);

	const compensationLabel = COMPENSATION_LABEL_BY_TRACK[candidate.track as Track];
	const rows: Array<[string, string]> = [
		['Joining Date', offer.joiningDate || '—'],
		['Office Location', offer.officeLocation || '—'],
		['Reporting Manager', offer.reportingManager || '—'],
		['Employment Type', offer.employmentType ? EMPLOYMENT_TYPE_LABELS[offer.employmentType] : '—'],
		[compensationLabel, offer.ctcAmount || '—'],
		['Notice Period', offer.noticePeriod || '—'],
		['Acceptance Due Date', offer.acceptanceDueDate || '—'],
		...(offer.endDate ? [['End Date', offer.endDate] as [string, string]] : [])
	];

	let rowY = doc.y;
	const colLabel = M;
	const colVal = M + CW * 0.45;
	const rowH = 20;

	rows.forEach(([label, value], i) => {
		const bg = i % 2 === 0 ? '#f7f8fa' : '#ffffff';
		doc.rect(M, rowY, CW, rowH).fill(bg);
		doc.fillColor('#444444').font('Helvetica').fontSize(9.5)
			.text(label, colLabel + 6, rowY + 6, { width: CW * 0.43 });
		doc.fillColor('#111111').font('Helvetica-Bold').fontSize(9.5)
			.text(value, colVal, rowY + 6, { width: CW * 0.53 });
		rowY += rowH;
	});

	doc.y = rowY + 14;

	// ── Address ───────────────────────────────────────────────────────────────
	if (candidate.presentAddress) {
		doc.fillColor('#555555').font('Helvetica').fontSize(9)
			.text(`Address: ${candidate.presentAddress}`, M, doc.y, { width: CW });
		doc.moveDown(0.6);
	}

	// ── Body text ─────────────────────────────────────────────────────────────
	doc.moveDown(0.4);
	doc.fillColor('#1a1a1a').font('Helvetica').fontSize(10)
		.text(
			`Please confirm your acceptance of this offer by signing and returning a copy of this letter by ` +
			`${offer.acceptanceDueDate || 'the stated date'}. We are excited to welcome you to our team and look forward ` +
			`to working with you.`,
			M, doc.y, { width: CW, lineGap: 3 }
		);

	// ── Signatory ─────────────────────────────────────────────────────────────
	doc.moveDown(1.8);
	doc.fillColor('#1a1a1a').font('Helvetica').fontSize(10).text('Yours sincerely,', M);
	doc.moveDown(0.6);

	// Render uploaded signature image if present, otherwise leave blank space
	const sigData = offer.signatoryImageBase64 ? dataUriToBuffer(offer.signatoryImageBase64) : null;
	if (sigData) {
		try {
			doc.image(sigData.buffer, M, doc.y, { height: 48, fit: [150, 48] });
			doc.moveDown(3.2);
		} catch {
			doc.moveDown(2.4);
		}
	} else {
		doc.moveDown(2.4);
	}

	doc.rect(M, doc.y, 140, 1).fill('#aaaaaa');
	doc.moveDown(0.4);
	doc.fillColor('#111111').font('Helvetica-Bold').fontSize(10)
		.text(offer.signatoryName || companyName, M);
	doc.fillColor('#555555').font('Helvetica').fontSize(9)
		.text(offer.signatoryDesignation || '', M);
	doc.text(companyName, M);

	// ── Footer bar ────────────────────────────────────────────────────────────
	const pageHeight = 841.89;
	doc.rect(0, pageHeight - 36, W, 36).fill(`rgb(${ir},${ig},${ib})`);
	doc.fillColor('#aaaaaa').font('Helvetica').fontSize(8)
		.text(
			`${companyName} — Confidential`,
			M,
			pageHeight - 24,
			{ width: CW, align: 'center' }
		);

	return docBuffer(doc);
}
