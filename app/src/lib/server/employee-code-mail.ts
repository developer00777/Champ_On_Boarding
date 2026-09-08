// The "new joinee employee code" mail HR sends to the IT helpdesk once a
// candidate has been given their employee code.
//
// Modelled on the mail HR sends by hand today: a short note over a six-column
// table — Sl, EmpCode, Team, Full Name, DOJ, Designation — replying into the
// helpdesk thread the IT setup mail opened, so the subject carries that
// thread's Request ID when there is one.
//
// Every value comes off the record rather than being retyped: the code from
// the candidate, DOJ and Designation from the offer letter, Team from the
// IT-mail Team Name with the offer's Department behind it. Same split as
// it-setup-mail.ts — build and send are separate so the modal HR approves and
// the mail IT receives cannot drift.
import { Candidate, Company, OfferLetter } from './db/schema';
import { brandBySlug } from '$lib/shared/brands';
import type { BrandTheme } from '$lib/shared/brands';
import { sendBrandedMail, escapeHtml, brandLogoUrl } from './mailer';
import { getEmployeeCodeMailSettings, renderEmployeeCodeSubject } from './settings';
import { toDayMonYear } from '$lib/shared/dates';

/** Column order is the helpdesk's, taken from the mail HR sends today. */
const COLUMNS = ['Sl', 'EmpCode', 'Team', 'Full Name', 'DOJ', 'Designation'] as const;

function rowFor(
	candidate: Record<string, unknown>,
	offer: Record<string, unknown> | null
): string[] {
	const doj = String(offer?.joiningDate ?? '');
	return [
		'1',
		String(candidate.employeeId ?? ''),
		// HR's override first, else the offer letter's department — the same
		// precedence the IT setup mail's Team Name column uses.
		String(candidate.teamName ?? offer?.department ?? ''),
		String(candidate.fullName ?? candidate.email ?? ''),
		// Padded: the helpdesk thread writes 08-Sep-2026, not 8-Sep-2026.
		toDayMonYear(doj, { pad: true }) || doj,
		String(offer?.jobTitle ?? '')
	];
}

function tableHtml(brand: BrandTheme, cells: string[]): string {
	const border = '1px solid #d0d5dd';
	const th = COLUMNS.map(
		(c) =>
			`<th style="border:${border};padding:7px 9px;background:${brand.colors.ink};color:#ffffff;` +
			`font-size:11.5px;font-weight:700;text-align:left">${escapeHtml(c)}</th>`
	).join('');
	const td = cells
		.map(
			(v) =>
				`<td style="border:${border};padding:7px 9px;font-size:12.5px;color:#101828">` +
				`${v ? escapeHtml(v) : '&nbsp;'}</td>`
		)
		.join('');
	return `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%">
	<tr>${th}</tr>
	<tr>${td}</tr>
</table>`;
}

function bodyHtml(
	brand: BrandTheme,
	cells: string[],
	signoffName: string,
	signoffDesignation: string
): string {
	const logoBg = brand.logo.onDark ? brand.colors.ink : '#ffffff';
	return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#f2f4f7;font-family:Arial,Helvetica,sans-serif;color:#101828">
	<div style="max-width:820px;margin:0 auto;background:#ffffff;border:1px solid #e4e7ec;border-radius:${brand.cardRadius}px;overflow:hidden">
		<div style="background:${logoBg};padding:18px 24px">
			<img src="${brandLogoUrl(brand)}" alt="${escapeHtml(brand.name)}" height="34" style="height:34px;width:auto;display:block" />
		</div>
		<div style="background:${brand.colors.primary};height:4px;font-size:0;line-height:0">&nbsp;</div>
		<div style="padding:24px">
			<p style="margin:0 0 14px;font-size:14.5px">Dear Team,</p>
			<p style="margin:0 0 20px;font-size:14.5px">Kindly find the below new joinee employee code.</p>
			<div style="overflow-x:auto">${tableHtml(brand, cells)}</div>
			<p style="margin:24px 0 4px;font-size:14.5px">Best Regards,</p>
			<p style="margin:0;font-size:14.5px;font-weight:700">${escapeHtml(signoffName)}</p>
			${signoffDesignation ? `<p style="margin:0;font-size:13px;color:#475467">${escapeHtml(signoffDesignation)}</p>` : ''}
			<p style="margin:2px 0 0;font-size:13px;color:#475467">${escapeHtml(brand.legalName)}</p>
		</div>
	</div>
</body>
</html>`;
}

/** Plain-text alternative — the same six values as labelled pairs, for clients
 *  that refuse HTML. */
function bodyText(cells: string[], signoffName: string, signoffDesignation: string): string {
	const pairs = COLUMNS.map((c, i) => `${c}: ${cells[i] || '—'}`).join('\n');
	return (
		`Dear Team,\n\nKindly find the below new joinee employee code.\n\n${pairs}\n\n` +
		`Best Regards,\n${signoffName}${signoffDesignation ? `\n${signoffDesignation}` : ''}`
	);
}

export interface EmployeeCodeMailDraft {
	to: string[];
	cc: string[];
	subject: string;
	html: string;
	text: string;
	/** COLUMNS-aligned label/value pairs, for a preview that wants the fields
	 *  as data rather than as the rendered table. */
	fields: { label: string; value: string }[];
	/** Columns that would go out blank. EmpCode being one of them is the whole
	 *  point of the confirm step — a mail announcing a code that is not there
	 *  yet is worse than no mail. */
	missing: string[];
	brandSlug: string;
}

/** Builds the mail without sending it. Shared by the preview endpoint and the
 *  send, so what HR approves in the modal is byte-for-byte what goes out. */
export async function buildEmployeeCodeMail(candidateId: string): Promise<EmployeeCodeMailDraft> {
	const candidate = await Candidate.findById(candidateId).lean();
	if (!candidate) throw new Error(`Employee code mail: candidate ${candidateId} not found`);
	const [company, offer, settings] = await Promise.all([
		Company.findById(candidate.companyId).lean(),
		OfferLetter.findOne({ candidateId }).lean(),
		getEmployeeCodeMailSettings()
	]);

	const brand = brandBySlug(company?.brandSlug ?? undefined);
	const cells = rowFor(
		candidate as unknown as Record<string, unknown>,
		(offer as unknown as Record<string, unknown>) ?? null
	);

	return {
		to: settings.to,
		cc: settings.cc,
		subject: renderEmployeeCodeSubject(settings.subject, {
			// Reused from the row so the subject can never name a different team or
			// date than the table beneath it.
			team: cells[2],
			doj: cells[4],
			name: cells[3],
			requestId: String(candidate.itRequestId ?? '')
		}),
		html: bodyHtml(brand, cells, settings.signoffName, settings.signoffDesignation),
		text: bodyText(cells, settings.signoffName, settings.signoffDesignation),
		fields: COLUMNS.map((label, i) => ({ label, value: cells[i] ?? '' })),
		brandSlug: brand.slug,
		// Sl is ours and always filled, so an empty cell here is genuinely a gap
		// in what HR entered.
		missing: COLUMNS.filter((_, i) => !cells[i]).map((c) => c)
	};
}

/** Builds and sends the mail. Throws on send failure so the caller can surface
 *  it — this mail is only ever sent by hand, from inside the confirm modal. */
export async function sendEmployeeCodeMail(
	candidateId: string
): Promise<{ to: string[]; cc: string[] }> {
	const draft = await buildEmployeeCodeMail(candidateId);

	await sendBrandedMail(
		draft.to,
		draft.subject,
		draft.text,
		brandBySlug(draft.brandSlug),
		undefined,
		'onboarding',
		candidateId,
		{ cc: draft.cc, tagPurpose: 'employee_code', html: draft.html }
	);

	await Candidate.findByIdAndUpdate(candidateId, { employeeCodeMailSentAt: new Date() });
	return { to: draft.to, cc: draft.cc };
}
