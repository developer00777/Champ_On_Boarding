// BGV (background verification) plumbing — experienced-track candidates only.
//
// The flow: an experienced candidate declares their previous employment in the
// onboarding form (prev* fields on Candidate). HR opens /admin/bgv, where a
// request email is pre-addressed to the candidate's declared previous-company
// HR address and pre-filled from the standard template below — still fully
// editable before sending, and re-sendable any time. The email carries the
// verification table IN ITS BODY (HTML table + plain-text fallback, plus a
// printable PDF attachment) — the employer answers by simply replying to the
// email. Their reply is then parsed by an LLM (parseBgvReply, called from the
// Resend inbound webhook) and mapped onto BgvRequest.verification, i.e. the
// "Your Verification Inputs" column in /admin/bgv. The tokenised online form
// (/bgv/[token]) still works as an unadvertised fallback.
import { PDFDocument, StandardFonts, PageSizes, rgb } from 'pdf-lib';
import type { PDFFont } from 'pdf-lib';
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import type { BrandTheme } from '$lib/shared/brands';
import { BgvRequest, type BgvRequestDoc } from './db/schema';
import { randomToken, sha256, encrypt, decrypt } from './crypto';
import { fetchWithRetry } from './ocr';

/** The "Candidate's Particulars" rows, in the order the HR template lists
 *  them. `field` is the Candidate column holding the candidate's declaration;
 *  `verify` is the BgvRequest.verification key the previous employer fills. */
export const BGV_PARTICULARS = [
	{ label: "Candidate's Name", field: 'fullName', verify: 'candidateName' },
	{ label: 'Employee ID', field: 'prevEmployeeId', verify: 'employeeId' },
	{ label: 'Company Name', field: 'prevCompanyName', verify: 'companyName' },
	{ label: 'Date of Joining', field: 'prevDoj', verify: 'dateOfJoining' },
	{ label: 'Date of Leaving', field: 'prevDol', verify: 'dateOfLeaving' },
	{ label: 'Designation', field: 'prevDesignation', verify: 'designation' },
	{ label: 'Remuneration per annum', field: 'prevRemuneration', verify: 'remuneration' },
	{ label: 'Supervisor Name & Designation', field: 'prevSupervisor', verify: 'supervisor' },
	{ label: 'Reason for Leaving', field: 'prevReasonLeaving', verify: 'reasonForLeaving' }
] as const;

/** Extra verification-only rows (no candidate declaration to compare against). */
export const BGV_EXTRAS = [
	{ label: 'Integrity / Disciplinary / Personal issues if any', verify: 'integrityIssues' },
	{ label: 'Eligibility for re-hire', verify: 'rehireEligible' },
	{ label: 'Any Exit Formalities Pending', verify: 'exitFormalitiesPending' },
	{ label: 'If yes, please give us some details', verify: 'exitFormalitiesDetails' },
	{ label: 'Additional HR Comments', verify: 'additionalComments' },
	{ label: "Verifier's Name & Designation", verify: 'verifierName' }
] as const;

export async function getOrCreateBgv(candidateId: string): Promise<BgvRequestDoc> {
	const existing = await BgvRequest.findOne({ candidateId });
	if (existing) return existing as BgvRequestDoc;
	const token = randomToken();
	return (await BgvRequest.create({
		candidateId,
		tokenHash: sha256(token),
		tokenEncrypted: encrypt(token)
	})) as BgvRequestDoc;
}

export async function resolveBgvToken(token: string): Promise<BgvRequestDoc | null> {
	return (await BgvRequest.findOne({ tokenHash: sha256(token) })) as BgvRequestDoc | null;
}

export function bgvFormUrl(bgv: BgvRequestDoc): string {
	const base = (publicEnv.PUBLIC_BASE_URL ?? 'http://localhost:5173').replace(/\/$/, '');
	return `${base}/bgv/${decrypt(bgv.tokenEncrypted)}`;
}

/** The standard "BGV Request to Previous Employer" email, pre-filled but fully
 *  HR-editable in /admin/bgv before sending. The verification table itself is
 *  not part of this editable text — it is appended automatically on send, both
 *  as an HTML table (bgvRequestHtml) and as plain text (bgvEmailText). */
export function defaultBgvEmail(
	candidate: { fullName?: string | null; email: string; prevHrEmail?: string | null; prevEmployeeId?: string | null },
	hiringCompanyName: string,
	senderEmail: string
) {
	const contact = env.MAIL_FROM ?? senderEmail;
	return {
		to: candidate.prevHrEmail ?? '',
		cc: '',
		subject: 'Employee BGV Form',
		body:
			`Greetings Sir/Madam,\n\n` +
			`This mail is regarding the background verification of the ex-employee of your company, ` +
			`${candidate.fullName || candidate.email}` +
			`${candidate.prevEmployeeId ? ` (Employee ID: ${candidate.prevEmployeeId})` : ''}.\n\n` +
			`Kindly requesting you to provide us an insight about this employee, which will help us to proceed in further.\n\n` +
			`You will find the BGV form as a table below in this very email — please hit Reply and fill in ` +
			`your verification inputs against each item. Your reply reaches our HR desk directly. ` +
			`A printable copy is also attached as a PDF.\n\n` +
			`Thank you for your cooperation.\n\n` +
			`Warm regards,\n` +
			`${senderEmail}\n` +
			`HR Department\n` +
			`${hiringCompanyName}\n` +
			`${contact}`
	};
}

/** The extra verification-only rows as they should be asked in the email,
 *  with the Yes/No prompts spelled out. */
const EMAIL_EXTRA_ROWS: { label: string; hint?: string }[] = [
	{ label: 'Integrity / Disciplinary / Personal issues if any' },
	{ label: 'Eligibility for re-hire', hint: 'Yes / No' },
	{ label: 'Any Exit Formalities Pending', hint: 'Yes / No' },
	{ label: 'If yes, please give us some details' },
	{ label: 'Additional HR Comments' },
	{ label: "Verifier's Name & Designation" }
];

function declaredValue(candidate: Record<string, unknown>, field: string): string {
	return String((candidate[field] as string | null) ?? '').trim();
}

/** Plain-text body actually sent: the HR-edited cover text followed by the
 *  verification table in reply-friendly text form, so the table survives even
 *  in text-only mail clients and comes back quoted in the employer's reply —
 *  which is exactly what parseBgvReply reads. */
export function bgvEmailText(bodyText: string, candidate: Record<string, unknown>): string {
	const lines: string[] = [
		bodyText.trimEnd(),
		'',
		'==========================================================',
		"EMPLOYEE BGV FORM — Candidate's Particulars",
		'Please reply with "Your Verification Inputs" filled in against each item.',
		'=========================================================='
	];
	let n = 1;
	for (const row of BGV_PARTICULARS) {
		lines.push('', `${n}. ${row.label}: ${declaredValue(candidate, row.field) || '—'}`, `   Your Verification Input:`);
		n++;
	}
	for (const row of EMAIL_EXTRA_ROWS) {
		lines.push('', `${n}. ${row.label}${row.hint ? ` (${row.hint})` : ''}:`, `   Your Verification Input:`);
		n++;
	}
	lines.push('', '==========================================================');
	return lines.join('\n');
}

function escapeHtml(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Branded HTML version of the BGV request: the HR-edited cover text on top,
 *  then the two-column verification table with the candidate's declared
 *  particulars filled in and an empty "Your Verification Inputs" column the
 *  employer answers by replying. */
export function bgvRequestHtml(
	brand: BrandTheme,
	bodyText: string,
	candidate: Record<string, unknown>
): string {
	const base = (publicEnv.PUBLIC_BASE_URL ?? 'http://localhost:5173').replace(/\/$/, '');
	const logoUrl = `${base}${brand.logo.src}`;
	const logoBg = brand.logo.onDark ? brand.colors.ink : 'transparent';
	const primary = brand.colors.primary;
	const ink = brand.colors.ink;
	const border = brand.colors.border;

	const bodyHtml = bodyText
		.split('\n')
		.map((line) => (line ? `<p style="margin:0 0 12px">${escapeHtml(line)}</p>` : ''))
		.join('\n');

	const particularRows = BGV_PARTICULARS.map(
		(row) => `
      <tr>
        <td style="padding:10px 12px;border:1px solid ${border};vertical-align:top">
          <div style="font-size:11px;color:#777;margin-bottom:2px">${escapeHtml(row.label)}</div>
          <div style="font-size:13.5px;font-weight:700;color:${ink}">${escapeHtml(declaredValue(candidate, row.field) || '—')}</div>
        </td>
        <td style="padding:10px 12px;border:1px solid ${border};vertical-align:top;background:#fbfbfe">
          <span style="font-size:12px;color:#999">Reply with your input</span>
        </td>
      </tr>`
	).join('');

	const extraRows = EMAIL_EXTRA_ROWS.map(
		(row) => `
      <tr>
        <td style="padding:10px 12px;border:1px solid ${border};vertical-align:top">
          <div style="font-size:12.5px;font-weight:700;color:${ink}">${escapeHtml(row.label)}</div>
        </td>
        <td style="padding:10px 12px;border:1px solid ${border};vertical-align:top;background:#fbfbfe">
          <span style="font-size:12px;color:#999">${escapeHtml(row.hint ?? 'Reply with your input')}</span>
        </td>
      </tr>`
	).join('');

	return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f2f4f7;font-family:Arial,sans-serif;color:#333">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f2f4f7;padding:32px 12px">
  <tr><td align="center">
    <table width="640" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:${brand.cardRadius}px;overflow:hidden;border:1px solid ${border};max-width:640px">
      <tr>
        <td style="background:${logoBg === 'transparent' ? '#ffffff' : logoBg};padding:18px 28px;border-bottom:4px solid ${primary}">
          <img src="${logoUrl}" alt="${escapeHtml(brand.name)}" height="34" style="height:34px;width:auto;display:block" />
        </td>
      </tr>
      <tr>
        <td style="padding:26px 28px 6px;font-size:14px;line-height:1.65">
          ${bodyHtml}
        </td>
      </tr>
      <tr>
        <td style="padding:8px 28px 26px">
          <div style="background:${primary}12;border-left:4px solid ${primary};border-radius:0 8px 8px 0;padding:12px 16px;margin-bottom:16px">
            <p style="margin:0;font-size:13px;color:${ink};font-weight:700">✍️ How to respond</p>
            <p style="margin:4px 0 0;font-size:12.5px;color:#666">
              Hit <strong>Reply</strong> and type your verification input against each item of the table below
              (the quoted text in your reply already lists every item). Your reply is recorded automatically.
            </p>
          </div>
          <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
            <tr>
              <th align="left" style="padding:10px 12px;border:1px solid ${border};background:${ink};color:#fff;font-size:11px;letter-spacing:0.08em;text-transform:uppercase">Candidate's Particulars</th>
              <th align="left" style="padding:10px 12px;border:1px solid ${border};background:${ink};color:#fff;font-size:11px;letter-spacing:0.08em;text-transform:uppercase">Your Verification Inputs</th>
            </tr>
            ${particularRows}
            ${extraRows}
          </table>
        </td>
      </tr>
      <tr>
        <td style="background:${ink};padding:14px 28px;text-align:center">
          <p style="margin:0;font-size:11px;color:#aaa">
            Background verification request from ${escapeHtml(brand.legalName)}'s onboarding platform.
            A printable PDF copy of this form is attached.
          </p>
        </td>
      </tr>
    </table>
  </td></tr>
</table>
</body>
</html>`;
}

// ── PDF form ─────────────────────────────────────────────────────────────────

function wrap(font: PDFFont, text: string, size: number, maxWidth: number): string[] {
	const words = text.split(/\s+/).filter(Boolean);
	const lines: string[] = [];
	let line = '';
	for (const word of words) {
		const probe = line ? `${line} ${word}` : word;
		if (font.widthOfTextAtSize(probe, size) <= maxWidth) {
			line = probe;
		} else {
			if (line) lines.push(line);
			line = word;
		}
	}
	if (line) lines.push(line);
	return lines.length ? lines : [''];
}

/** One-page printable BGV form: the candidate's particulars filled in on the
 *  left, a blank "Your Verification Inputs" column for the employer to write
 *  into on the right. Attached to every BGV request email. */
export async function bgvFormPdf(
	// Accepts either a hydrated CandidateDoc or a .lean() object — only the
	// string prev* fields and fullName are read.
	candidate: Record<string, unknown>,
	hiringCompanyName: string
): Promise<Buffer> {
	const doc = await PDFDocument.create();
	const page = doc.addPage(PageSizes.A4);
	const { width, height } = page.getSize();
	const regular = await doc.embedFont(StandardFonts.Helvetica);
	const bold = await doc.embedFont(StandardFonts.HelveticaBold);

	const margin = 46;
	const tableW = width - margin * 2;
	const colSplit = 0.52; // left column share
	const leftW = tableW * colSplit;
	const line = rgb(0.72, 0.72, 0.76);
	const ink = rgb(0.1, 0.1, 0.14);
	const faint = rgb(0.42, 0.42, 0.48);

	let y = height - margin;
	page.drawText('Employee Background Verification Form', { x: margin, y: y - 16, size: 16, font: bold, color: ink });
	y -= 24;
	page.drawText(`Requested by ${hiringCompanyName} — please verify the particulars below and return this form.`, {
		x: margin, y: y - 11, size: 9.5, font: regular, color: faint
	});
	y -= 30;

	// Header row
	const headH = 22;
	page.drawRectangle({ x: margin, y: y - headH, width: tableW, height: headH, color: rgb(0.93, 0.93, 0.96) });
	page.drawText("Candidate's Particulars", { x: margin + 8, y: y - 15, size: 10, font: bold, color: ink });
	page.drawText('Your Verification Inputs', { x: margin + leftW + 8, y: y - 15, size: 10, font: bold, color: ink });
	const tableTop = y;
	y -= headH;

	const rows: { label: string; value: string | null; hint?: string }[] = [
		...BGV_PARTICULARS.map((r) => ({
			label: r.label,
			value: ((candidate[r.field] as string | null) ?? '') || '—'
		})),
		{ label: 'Integrity / Disciplinary / Personal issues if any', value: null },
		{ label: 'Eligibility for re-hire', value: null, hint: 'Yes / No' },
		{ label: 'Any Exit Formalities Pending', value: null, hint: 'Yes / No' },
		{ label: 'If yes, please give us some details', value: null },
		{ label: 'Additional HR Comments', value: null },
		{ label: "Verifier's Name & Designation", value: null }
	];

	for (const row of rows) {
		const labelLines = wrap(bold, row.label, 9, leftW - 40);
		const valueLines = row.value ? wrap(regular, row.value, 9, leftW - 40) : [];
		const rowH = Math.max(30, (labelLines.length + valueLines.length) * 11 + 14);
		let ty = y - 12;
		for (const l of labelLines) {
			page.drawText(l, { x: margin + 8, y: ty, size: 9, font: bold, color: ink });
			ty -= 11;
		}
		for (const l of valueLines) {
			page.drawText(l, { x: margin + 8, y: ty, size: 9, font: regular, color: faint });
			ty -= 11;
		}
		if (row.hint) {
			page.drawText(row.hint, { x: margin + leftW + 8, y: y - 12, size: 9, font: regular, color: faint });
		}
		y -= rowH;
		page.drawLine({ start: { x: margin, y }, end: { x: margin + tableW, y }, thickness: 0.6, color: line });
	}

	// Table borders
	page.drawLine({ start: { x: margin, y: tableTop }, end: { x: margin, y }, thickness: 0.8, color: line });
	page.drawLine({ start: { x: margin + leftW, y: tableTop }, end: { x: margin + leftW, y }, thickness: 0.8, color: line });
	page.drawLine({ start: { x: margin + tableW, y: tableTop }, end: { x: margin + tableW, y }, thickness: 0.8, color: line });
	page.drawLine({ start: { x: margin, y: tableTop }, end: { x: margin + tableW, y: tableTop }, thickness: 0.8, color: line });

	y -= 34;
	page.drawText('Signature & Date: ____________________________', { x: margin, y, size: 10, font: regular, color: ink });
	page.drawText(`HR Department, ${hiringCompanyName}`, { x: margin, y: y - 20, size: 8.5, font: regular, color: faint });

	return Buffer.from(await doc.save());
}

// ── LLM reply parsing ────────────────────────────────────────────────────────

export interface ParsedBgvReply {
	/** verification-key → extracted value; only keys the employer answered. */
	fields: Record<string, string>;
	/** false for out-of-office / "we'll get back to you" / unrelated replies. */
	providesVerification: boolean;
}

const VERIFY_KEYS = [
	...BGV_PARTICULARS.map((r) => r.verify),
	'integrityIssues',
	'rehireEligible',
	'exitFormalitiesPending',
	'exitFormalitiesDetails',
	'additionalComments',
	'verifierName'
] as const;

/** Reads a previous employer's email reply to a BGV request and maps whatever
 *  they answered onto the verification keys — the "Your Verification Inputs"
 *  column. Replies are free-form (inline answers against the quoted table,
 *  a rewritten list, or plain prose), which is exactly what an LLM is for.
 *  Throws on model/transport errors; the webhook treats that as best-effort. */
export async function parseBgvReply(
	replyText: string,
	candidate: Record<string, unknown>
): Promise<ParsedBgvReply> {
	if (!env.OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY not set — cannot parse BGV reply');

	const declared = BGV_PARTICULARS.map(
		(r) => `- ${r.label} [key: ${r.verify}] — candidate declared: "${declaredValue(candidate, r.field) || '—'}"`
	).join('\n');

	const prompt = [
		`You are reading an email REPLY from a previous employer's HR desk, responding to a background-verification (BGV) request about an ex-employee.`,
		`The original request (usually quoted inside the reply) listed the candidate's declared particulars and asked the employer to fill "Your Verification Input" against each item.`,
		``,
		`Candidate's declared particulars:`,
		declared,
		`Additional verification-only items: integrityIssues, rehireEligible (Yes/No), exitFormalitiesPending (Yes/No), exitFormalitiesDetails, additionalComments, verifierName (name & designation of the person verifying).`,
		``,
		`Extract ONLY what the EMPLOYER states in their reply and return a single JSON object, no markdown fences:`,
		`{ ${VERIFY_KEYS.map((k) => `"${k}": string`).join(', ')}, "providesVerification": boolean }`,
		`Rules:`,
		`- A value counts only if the employer wrote or clearly confirmed it. If they confirm a declared value ("correct", "confirmed", "yes" against an item), output that declared value.`,
		`- Quoted request text with empty "Your Verification Input:" lines is NOT an answer — use "" for items the employer did not address.`,
		`- rehireEligible and exitFormalitiesPending must be exactly "yes", "no", or "".`,
		`- Keep the employer's own wording for free-text items (integrityIssues, reasonForLeaving, additionalComments, ...).`,
		`- "providesVerification" is true only if the reply substantively answers the verification request — false for out-of-office, acknowledgements, refusals, or unrelated mail.`,
		``,
		`Employer's reply email:`,
		`"""`,
		replyText.slice(0, 20_000),
		`"""`
	].join('\n');

	const res = await fetchWithRetry('https://openrouter.ai/api/v1/chat/completions', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${env.OPENROUTER_API_KEY}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			model: env.OPENROUTER_MODEL ?? 'google/gemini-3.5-flash',
			messages: [{ role: 'user', content: prompt }],
			provider: { data_collection: 'deny' },
			temperature: 0
		})
	});
	if (!res.ok) {
		const body = await res.text();
		throw new Error(`OpenRouter ${res.status}: ${body.slice(0, 300)}`);
	}

	const json = await res.json();
	const text: string = json.choices?.[0]?.message?.content ?? '';
	const match = text.match(/\{[\s\S]*\}/);
	if (!match) throw new Error('BGV reply parse: response contained no JSON');
	const parsed = JSON.parse(match[0]) as Record<string, unknown>;

	const fields: Record<string, string> = {};
	for (const key of VERIFY_KEYS) {
		let value = String(parsed[key] ?? '').trim();
		if (key === 'rehireEligible' || key === 'exitFormalitiesPending') {
			const v = value.toLowerCase();
			value = v === 'yes' || v === 'no' ? v : '';
		}
		if (value) fields[key] = value;
	}

	return { fields, providesVerification: parsed.providesVerification === true };
}
