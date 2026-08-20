// The "Please enable the System & Configure the VPN" mail HR sends to IT
// helpdesk / workforce / learning the moment a candidate is approved.
//
// The body is the single-row table IT already works from, in the column order
// they expect. DOJ, Designation and Reporting Head come off the offer letter.
// The rest are HR's own call, stored on the candidate: Shift Timing and
// WFH/WFO are picked outright, while Team Name, Payroll Entity and Mode start
// from the offer's department, the company name and the hiring track
// respectively — all three overridable, and a set candidate value always wins
// over the derived one.
import { Candidate, Company, OfferLetter } from './db/schema';
import { brandBySlug } from '$lib/shared/brands';
import type { BrandTheme } from '$lib/shared/brands';
import { sendBrandedMail, escapeHtml, brandLogoUrl } from './mailer';
import { getItSetupMailSettings } from './settings';
import { TRACK_MODE } from '$lib/shared/shifts';

/** Column order is IT's, not ours — do not reorder without asking them. */
const COLUMNS = [
	'Sl.no', 'Employee Name', 'DOJ', 'Designation', 'Team Name', 'Reporting Head',
	'Shift Timing', 'Gender', 'Mobile', 'WFH/WFO', 'Payroll Entity', 'Mode'
] as const;

const GENDER_LABELS: Record<string, string> = { male: 'Male', female: 'Female', other: 'Other' };

/** Cell values for one candidate, in COLUMNS order. Empty string renders as a
 *  blank cell rather than a dash — IT fills these in by hand. */
function rowFor(
	candidate: Record<string, unknown>,
	companyName: string,
	offer: Record<string, unknown> | null
): string[] {
	const g = String(candidate.gender ?? '').toLowerCase();
	return [
		'1',
		String(candidate.fullName ?? candidate.email ?? ''),
		String(offer?.joiningDate ?? ''),
		String(offer?.jobTitle ?? ''),
		// HR's override first, else the offer letter's department / the company.
		String(candidate.teamName ?? offer?.department ?? ''),
		String(offer?.reportingManager ?? ''),
		String(candidate.shiftTiming ?? ''),
		GENDER_LABELS[g] ?? String(candidate.gender ?? ''),
		String(candidate.mobile ?? ''),
		String(candidate.workLocationMode ?? ''),
		String(candidate.payrollEntity ?? companyName),
		// Mode follows the hiring track unless HR overrode it.
		String(candidate.joiningMode ?? TRACK_MODE[String(candidate.track ?? '')] ?? '')
	];
}

function tableHtml(brand: BrandTheme, cells: string[]): string {
	const border = '1px solid #d0d5dd';
	const th = COLUMNS.map(
		(c) =>
			`<th style="border:${border};padding:6px 7px;background:${brand.colors.ink};color:#ffffff;` +
			`font-size:11px;font-weight:700;text-align:left">${escapeHtml(c)}</th>`
	).join('');
	const td = cells
		.map(
			(v) =>
				`<td style="border:${border};padding:6px 7px;font-size:11.5px;color:#101828">` +
				`${v ? escapeHtml(v) : '&nbsp;'}</td>`
		)
		.join('');
	// table-layout:fixed keeps all twelve columns on screen instead of letting
	// one long value (a designation, an entity name) push the tail off the
	// right edge — mail clients widely ignore the overflow-x wrapper.
	return `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;table-layout:fixed">
	<tr>${th}</tr>
	<tr>${td}</tr>
</table>`;
}

function bodyHtml(brand: BrandTheme, cells: string[], signoffName: string, signoffDesignation: string): string {
	const logoBg = brand.logo.onDark ? brand.colors.ink : '#ffffff';
	return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#f2f4f7;font-family:Arial,Helvetica,sans-serif;color:#101828">
	<div style="max-width:900px;margin:0 auto;background:#ffffff;border:1px solid #e4e7ec;border-radius:${brand.cardRadius}px;overflow:hidden">
		<div style="background:${logoBg};padding:18px 24px">
			<img src="${brandLogoUrl(brand)}" alt="${escapeHtml(brand.name)}" height="34" style="height:34px;width:auto;display:block" />
		</div>
		<div style="background:${brand.colors.primary};height:4px;font-size:0;line-height:0">&nbsp;</div>
		<div style="padding:24px">
			<p style="margin:0 0 14px;font-size:14.5px">Hi Team,</p>
			<p style="margin:0 0 20px;font-size:14.5px">Please enable the System &amp; Configure the VPN.</p>
			<div style="overflow-x:auto">${tableHtml(brand, cells)}</div>
			<p style="margin:24px 0 4px;font-size:14.5px">Regards,</p>
			<p style="margin:0;font-size:14.5px;font-weight:700">${escapeHtml(signoffName)}</p>
			<p style="margin:0;font-size:13px;color:#475467">${escapeHtml(signoffDesignation)}</p>
			<p style="margin:2px 0 0;font-size:13px;color:#475467">${escapeHtml(brand.legalName)}</p>
		</div>
	</div>
</body>
</html>`;
}

/** Plain-text alternative — same table as aligned columns, for clients that
 *  refuse HTML. */
function bodyText(cells: string[], signoffName: string, signoffDesignation: string): string {
	const pairs = COLUMNS.map((c, i) => `${c}: ${cells[i] || '—'}`).join('\n');
	return `Hi Team,\n\nPlease enable the System & Configure the VPN.\n\n${pairs}\n\nRegards,\n${signoffName}\n${signoffDesignation}`;
}

/** Builds and sends the IT setup mail for a candidate. Throws on send failure
 *  so a manual resend can surface the error; the approval-triggered auto-send
 *  catches it (see the approve action) — a mail problem must not block an
 *  approval that has already been committed. */
export async function sendItSetupMail(candidateId: string): Promise<{ to: string[]; cc: string[] }> {
	const candidate = await Candidate.findById(candidateId).lean();
	if (!candidate) throw new Error(`IT setup mail: candidate ${candidateId} not found`);
	const [company, offer, settings] = await Promise.all([
		Company.findById(candidate.companyId).lean(),
		OfferLetter.findOne({ candidateId }).lean(),
		getItSetupMailSettings()
	]);

	const brand = brandBySlug(company?.brandSlug ?? undefined);
	const companyName = company?.name ?? brand.legalName;
	const cells = rowFor(
		candidate as unknown as Record<string, unknown>,
		companyName,
		(offer as unknown as Record<string, unknown>) ?? null
	);

	const name = candidate.fullName || candidate.email;
	await sendBrandedMail(
		// The whole desk goes on To — helpdesk, workforce and learning are all
		// primary recipients of this request, not observers — with HRD on Cc.
		settings.to,
		`System & VPN setup — ${name} (${companyName})`,
		bodyText(cells, settings.signoffName, settings.signoffDesignation),
		brand,
		undefined,
		'onboarding',
		candidateId,
		{
			cc: settings.cc,
			tagPurpose: 'it_setup',
			html: bodyHtml(brand, cells, settings.signoffName, settings.signoffDesignation)
		}
	);

	await Candidate.findByIdAndUpdate(candidateId, { itSetupMailSentAt: new Date() });
	return { to: settings.to, cc: settings.cc };
}
