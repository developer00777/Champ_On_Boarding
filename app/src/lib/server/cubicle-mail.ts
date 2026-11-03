// The "new joinee cubicle number allocation" mail, telling the IT, workforce and
// learning desks where a joiner will sit.
//
// Modelled on the mail facilities sends by hand today, reply-all on the
// employee code mail: a greeting, a sentence carrying the cubicle number, then
// the joiner as label/value rows — Emp Code, Emp Name, Floor, Team.
//
// The cubicle and floor are the two things HR types, on the candidate page;
// everything else comes off the record the same way the employee code mail
// takes it: the code from the candidate, Team from the IT-mail Team Name with
// the offer's Department behind it. Same split as employee-code-mail.ts —
// build and send are separate, so the modal HR approves and the mail the desks
// receive cannot drift.
import { Candidate, Company, OfferLetter } from './db/schema';
import { brandBySlug, type BrandTheme } from '$lib/shared/brands';
import { sendBrandedMail, escapeHtml, brandLogoUrl } from './mailer';
import {
	getCubicleMailSettings,
	renderCubicleSubject,
	type CubicleMailSettings
} from './settings';

interface CubicleValues {
	cubicle: string;
	empCode: string;
	name: string;
	floor: string;
	team: string;
}

/** The rows under the cubicle sentence, in the order facilities writes them. */
const ROWS: { label: string; key: keyof CubicleValues }[] = [
	{ label: 'Emp Code', key: 'empCode' },
	{ label: 'Emp Name', key: 'name' },
	{ label: 'Floor', key: 'floor' },
	{ label: 'Team', key: 'team' }
];

function valuesFor(
	candidate: Record<string, unknown>,
	offer: Record<string, unknown> | null
): CubicleValues {
	return {
		cubicle: String(candidate.cubicleNo ?? ''),
		empCode: String(candidate.employeeId ?? ''),
		name: String(candidate.fullName ?? candidate.email ?? ''),
		floor: String(candidate.cubicleFloor ?? ''),
		// HR's override first, else the offer letter's department — the same
		// precedence as the employee code mail, so the two mails name one team.
		team: String(candidate.teamName ?? offer?.department ?? '')
	};
}

function rowsHtml(brand: BrandTheme, v: CubicleValues): string {
	const border = '1px solid #d0d5dd';
	const rows = ROWS.map(
		(r) =>
			`<tr><th style="border:${border};padding:7px 11px;background:${brand.colors.ink};color:#ffffff;` +
			`font-size:11.5px;font-weight:700;text-align:left;white-space:nowrap;width:1%">${escapeHtml(r.label)}</th>` +
			`<td style="border:${border};padding:7px 11px;font-size:12.5px;color:#101828">` +
			`${v[r.key] ? escapeHtml(v[r.key]) : '&nbsp;'}</td></tr>`
	).join('');
	return `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;max-width:460px">${rows}</table>`;
}

function bodyHtml(brand: BrandTheme, v: CubicleValues, s: CubicleMailSettings): string {
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
			<p style="margin:0 0 14px;font-size:14.5px">${escapeHtml(s.greeting)}</p>
			<p style="margin:0 0 20px;font-size:14.5px">${escapeHtml(s.intro)} <strong>Cubicle &ndash; ${escapeHtml(v.cubicle)}</strong></p>
			<div style="overflow-x:auto">${rowsHtml(brand, v)}</div>
			<p style="margin:24px 0 4px;font-size:14.5px">Best Regards,</p>
			<p style="margin:0;font-size:14.5px;font-weight:700">${escapeHtml(s.signoffName)}</p>
			${s.signoffDesignation ? `<p style="margin:0;font-size:13px;color:#475467">${escapeHtml(s.signoffDesignation)}</p>` : ''}
			<p style="margin:2px 0 0;font-size:13px;color:#475467">${escapeHtml(brand.legalName)}</p>
		</div>
	</div>
</body>
</html>`;
}

/** Plain-text alternative, laid out as facilities types it: "Emp Code : …". */
function bodyText(v: CubicleValues, s: CubicleMailSettings): string {
	const rows = ROWS.map((r) => `${r.label} : ${v[r.key] || '—'}`).join('\n');
	return (
		`${s.greeting}\n\n${s.intro} Cubicle – ${v.cubicle}\n\n${rows}\n\n` +
		`Best Regards,\n${s.signoffName}${s.signoffDesignation ? `\n${s.signoffDesignation}` : ''}`
	);
}

export interface CubicleMailDraft {
	to: string[];
	cc: string[];
	subject: string;
	html: string;
	text: string;
	/** Label/value pairs, cubicle first, for a preview that wants the fields as
	 *  data rather than as the rendered table. */
	fields: { label: string; value: string }[];
	/** Details that would go out blank. The cubicle itself is never one of them
	 *  by the time a mail can be sent — the send refuses without it. */
	missing: string[];
	brandSlug: string;
}

/** Builds the mail without sending it. Shared by the preview endpoint and the
 *  send, so what HR approves in the modal is byte-for-byte what goes out. */
export async function buildCubicleMail(candidateId: string): Promise<CubicleMailDraft> {
	const candidate = await Candidate.findById(candidateId).lean();
	if (!candidate) throw new Error(`Cubicle mail: candidate ${candidateId} not found`);
	const [company, offer, settings] = await Promise.all([
		Company.findById(candidate.companyId).lean(),
		OfferLetter.findOne({ candidateId }).lean(),
		getCubicleMailSettings()
	]);

	const brand = brandBySlug(company?.brandSlug ?? undefined);
	const v = valuesFor(
		candidate as unknown as Record<string, unknown>,
		(offer as unknown as Record<string, unknown>) ?? null
	);
	const fields = [
		{ label: 'Cubicle', value: v.cubicle },
		...ROWS.map((r) => ({ label: r.label, value: v[r.key] }))
	];

	return {
		to: settings.to,
		cc: settings.cc,
		// Reused from the same values as the body, so the subject can never name
		// a different code or person than the rows beneath it.
		subject: renderCubicleSubject(settings.subject, v),
		html: bodyHtml(brand, v, settings),
		text: bodyText(v, settings),
		fields,
		missing: fields.filter((f) => !f.value).map((f) => f.label),
		brandSlug: brand.slug
	};
}

/** Builds and sends the mail. Throws on send failure so the caller can surface
 *  it — this mail is only ever sent by hand, from inside the confirm modal. */
export async function sendCubicleMail(candidateId: string): Promise<{ to: string[]; cc: string[] }> {
	const draft = await buildCubicleMail(candidateId);

	await sendBrandedMail(
		draft.to,
		draft.subject,
		draft.text,
		brandBySlug(draft.brandSlug),
		undefined,
		'onboarding',
		candidateId,
		{ cc: draft.cc, tagPurpose: 'cubicle', html: draft.html }
	);

	await Candidate.findByIdAndUpdate(candidateId, { cubicleMailSentAt: new Date() });
	return { to: draft.to, cc: draft.cc };
}
