// The "Welcome to the Champions Group Family" mail HR sends a joiner on their
// official mailbox, once IT has created it.
//
// Shared, not server-only, because the same renderer runs in two places: the
// send (lib/server/welcome-mail.ts) and the live preview on the Settings page,
// which re-renders the template as HR types. One renderer means the preview
// cannot drift from what the joiner receives.
//
// The body is plain text with three bits of markup, which is all the mail HR
// sends by hand today uses:
//   **text**          bold
//   a line of === or ---   a horizontal rule (the mail's section dividers)
//   * item / - item   a bullet
// Blank lines separate paragraphs; a single line break stays a line break.
// Anything else is text — there is no HTML input, so nothing HR types can
// break the mail's markup or inject into it.
import type { BrandTheme } from './brands';

export const WELCOME_TOKENS = [
	{ token: '{name}', means: "the joiner's name" },
	{ token: '{employeeId}', means: 'the employee code' },
	{ token: '{company}', means: 'the hiring entity' },
	{ token: '{reportingManager}', means: 'the reporting manager on the offer letter' },
	{ token: '{designation}', means: 'the designation on the offer letter' },
	{ token: '{joiningDate}', means: 'the joining date' },
	{ token: '{officialEmail}', means: 'their official email' }
] as const;

export type WelcomeValues = Record<
	'name' | 'employeeId' | 'company' | 'reportingManager' | 'designation' | 'joiningDate' | 'officialEmail',
	string
>;

/** The two documents the mail encloses. Fixed slots rather than a free list:
 *  the body names both, and HR replaces each once a year, not per joiner. */
export const WELCOME_ATTACHMENT_SLOTS = [
	{ key: 'coreValues', label: 'Champions Group Core Values' },
	{ key: 'holidayCalendar', label: 'Holiday Calendar' }
] as const;
export type WelcomeAttachmentSlot = (typeof WELCOME_ATTACHMENT_SLOTS)[number]['key'];

export function isWelcomeSlot(v: string): v is WelcomeAttachmentSlot {
	return WELCOME_ATTACHMENT_SLOTS.some((s) => s.key === v);
}

export interface WelcomeMailSettings {
	/** Copied on every welcome mail, alongside the joiner's reporting manager
	 *  when the candidate page has one. */
	cc: string[];
	subject: string;
	body: string;
	signoffName: string;
	signoffDesignation: string;
}

/** The mail HR sends by hand today, as the default. Wording is theirs; the
 *  name, code, entity and manager are tokens so nobody retypes them. */
export const WELCOME_MAIL_DEFAULTS: WelcomeMailSettings = {
	cc: ['hrd.jst@championsmail.com'],
	subject: 'Welcome to the Champions Group Family - Excited to Have You On-board!',
	signoffName: 'Renuka B L',
	signoffDesignation: 'HR Trainee',
	body: `Dear {name},

We’re absolutely thrilled to have you on board as our newest member!

At Champions Group, we believe in setting our team up for nothing but success. With a legacy of excellence and a vibrant culture, we’re proud to say that 25% of our team has been with us for over 10 years – and now, you’re part of that legacy!

**Our Mission:**
Enabling Growth

We’re confident that your skills will shine here, and you’ll make a valuable impact on our journey.

**Our Vision:**
At Champions Group, we aim to be the go-to partner for businesses looking to outsource their operations and marketing processes. We’re dedicated to maintaining the highest moral and ethical standards, building a customer-centric culture that earns trust and delivers unmatched service.

**Our Goal:**
To boost productivity, streamline processes and drive innovation for every client.

**Our Culture:**
At Champions Group, our values and vision define everything we do. As we move forward, we’ll continue to adapt to the ever-changing world, with policies and strategies that keep us ahead of the game. Our commitment to excellence gives {company} the competitive edge in a global market – and now you’re part of it!

**Our Mission:**
We’re on a mission to drive growth for every client and partner who trusts us with their business and marketing processes. With a relentless focus on high standards, customer-centric service, and innovative solutions, we’re here to make a difference. Together, we’ll improve productivity, enhance process efficiency, and push the boundaries of what’s possible.

Your employee ID: **{employeeId}**
You’re now a proud member of our **{company}**, reporting to **{reportingManager}**.

We can’t wait to see the amazing things you’ll accomplish with us.

Welcome aboard – let’s grow together!

==========
If you require assistance with HR-related matters, please do not hesitate to contact us through email at hrd.jst@championsmail.com or via Flock (HRD JST).

Any query regarding leaves and attendance, please send a mail to Attendance@Championsmail.com.

If you need to take an emergency leave, please notify your reporting authority as soon as possible, and if it is a scheduled leave, please apply to Attendance@Championsmail.com.

Apart from the standard holiday list (attached along with this email for your reference), you will have 0.5 day of sick leave each month which is not carried forward.

We believe in a hardworking culture and encourage you to clock 8+ hrs Time on System in Prohance/day to be considered for a full day present.
==========
If you have any concerns related to Payroll, please reach out to: payroll@championinfometrics.com
==========
If you need assistance with Salesforce, please contact sfdc@lakeb2b.com
==========
If you require any assistance with IT-related issues, such as Prohance, Bitrix & Flock or any process related website being inaccessible, please contact IT through email at ithelpdesk@championsmail.com or Flock (Tech Team JST).

Please do not transmit any official documents, client contact information, or assets developed for clients to your personal ID as part of the IT policy & NDA.
==========
Kindly have a glance at the enclosed documents to know more about us:
* Champions Group Core Values
* Holiday Calendar

We wish you a prosperous career at Champions Group!!`
};

function esc(value: string): string {
	return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function fill(template: string, values: WelcomeValues, encode: (v: string) => string): string {
	return template.replace(/\{(\w+)\}/g, (whole, key: string) =>
		key in values ? encode(values[key as keyof WelcomeValues] ?? '') : whole
	);
}

/** Subject with tokens filled. Newlines collapse — a subject is one header,
 *  and a pasted line break would otherwise be a header-injection vector. */
export function renderWelcomeSubject(template: string, values: WelcomeValues): string {
	return fill(template || WELCOME_MAIL_DEFAULTS.subject, values, (v) => v)
		.replace(/[\r\n]+/g, ' ')
		.replace(/\s{2,}/g, ' ')
		.trim();
}

const RULE = /^\s*(={3,}|-{3,})\s*$/;
const BULLET = /^\s*[*•-]\s+/;

/** Bold and mailto links, on text that is already escaped. Tokens are filled
 *  after this, so a value containing ** can never turn into markup. */
function inline(escaped: string, linkColor: string): string {
	return escaped
		.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
		.replace(
			/([A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,})/g,
			`<a href="mailto:$1" style="color:${linkColor};text-decoration:underline">$1</a>`
		);
}

function bodyBlocksHtml(template: string, values: WelcomeValues, brand: BrandTheme): string {
	const p = 'margin:0 0 14px;font-size:14.5px;line-height:1.65';
	const out: string[] = [];
	let para: string[] = [];
	let bullets: string[] = [];
	const line = (raw: string) => fill(inline(esc(raw), brand.colors.primary), values, esc);
	const flushPara = () => {
		if (para.length) out.push(`<p style="${p}">${para.map(line).join('<br>')}</p>`);
		para = [];
	};
	const flushBullets = () => {
		if (bullets.length)
			out.push(
				`<ul style="margin:0 0 14px;padding-left:22px;font-size:14.5px;line-height:1.65">` +
					bullets.map((b) => `<li>${line(b)}</li>`).join('') +
					`</ul>`
			);
		bullets = [];
	};
	for (const raw of template.replace(/\r\n?/g, '\n').split('\n')) {
		if (!raw.trim()) {
			flushPara();
			flushBullets();
		} else if (RULE.test(raw)) {
			flushPara();
			flushBullets();
			out.push(`<hr style="border:0;border-top:1px solid #d0d5dd;margin:18px 0">`);
		} else if (BULLET.test(raw)) {
			flushPara();
			bullets.push(raw.replace(BULLET, ''));
		} else {
			flushBullets();
			para.push(raw);
		}
	}
	flushPara();
	flushBullets();
	return out.join('\n');
}

/** Where the joiner's photo is read from. The send uses `cid:` (the photo
 *  rides inside the mail as an inline attachment, so it never needs a public
 *  URL); the admin preview uses a data: URI of the same bytes. */
export const WELCOME_PHOTO_CID = 'joiner-photo';

function initials(name: string): string {
	const parts = name.replace(/[^\p{L}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
	return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase() || '★';
}

/** The personal opening: the joiner's own photo, framed, with their name, role
 *  and first-day facts. The photo is shown exactly as uploaded — its own
 *  aspect ratio, no crop, no filter — and everything creative happens around
 *  it: the brand gradient, the white polaroid frame, the accent ring. Without
 *  a usable photo the frame holds their initials instead.
 *
 *  Tables and inline styles only, so Outlook lays it out too; the gradient and
 *  shadow are progressive (bgcolor is the flat fallback). */
function heroHtml(values: WelcomeValues, brand: BrandTheme, photoSrc: string | null): string {
	const c = brand.colors;
	const frame =
		`background:#ffffff;padding:7px;border-radius:18px;border:3px solid ${c.accent};` +
		`box-shadow:0 10px 28px rgba(0,0,0,.28)`;
	const picture = photoSrc
		? `<img src="${esc(photoSrc)}" alt="${esc(values.name)}" width="136" style="display:block;width:136px;height:auto;border-radius:12px;border:0" />`
		: `<div style="width:136px;height:136px;line-height:136px;border-radius:12px;background:${c.primary};color:${c.onPrimary};` +
			`font-size:46px;font-weight:800;text-align:center;letter-spacing:1px">${esc(initials(values.name))}</div>`;
	const role = [values.designation, values.company].filter(Boolean).map(esc).join(' &nbsp;·&nbsp; ');

	const facts = [
		['Employee ID', values.employeeId],
		['Joining on', values.joiningDate],
		['Reporting to', values.reportingManager]
	].filter(([, v]) => v);
	const chips = facts.length
		? `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-bottom:1px solid #eaecf0">
			<tr>${facts
				.map(
					([k, v], i) =>
						`<td align="center" width="${Math.floor(100 / facts.length)}%" style="padding:14px 8px;${i ? 'border-left:1px solid #eaecf0;' : ''}">
					<div style="font-size:10px;letter-spacing:.14em;text-transform:uppercase;color:#667085;font-weight:700">${esc(k)}</div>
					<div style="margin-top:4px;font-size:15px;font-weight:800;color:${c.primary}">${esc(v)}</div>
				</td>`
				)
				.join('')}</tr>
		</table>`
		: '';

	return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="${c.ink}" style="background:${c.ink};background-image:${c.heroGradient}">
		<tr><td align="center" style="padding:30px 24px 28px;color:${c.onPrimary};text-align:center">
			<div style="font-size:11px;letter-spacing:.24em;text-transform:uppercase;font-weight:700;color:${c.onPrimary};opacity:.85">✦ Welcome to the family ✦</div>
			<table role="presentation" cellpadding="0" cellspacing="0" align="center" style="margin:18px auto 0"><tr><td style="${frame}">${picture}</td></tr></table>
			<div style="margin-top:16px;font-size:26px;line-height:1.2;font-weight:800;color:${c.onPrimary}">${esc(values.name)}</div>
			${role ? `<div style="margin-top:6px;font-size:14px;color:${c.onPrimary};opacity:.9">${role}</div>` : ''}
			<div style="margin:14px auto 0;width:44px;height:3px;border-radius:2px;background:${c.accent};font-size:0;line-height:0">&nbsp;</div>
		</td></tr>
	</table>
	${chips}`;
}

/** The whole HTML mail: the entity's logo, the joiner's photo hero, the body,
 *  the sign-off. `logoUrl` is passed in because the server needs an absolute
 *  URL (mail clients strip relative and data: images) while the Settings
 *  preview can use a path. `photoSrc` is null when there is no usable photo. */
export function renderWelcomeHtml(opts: {
	settings: Pick<WelcomeMailSettings, 'body' | 'signoffName' | 'signoffDesignation'>;
	values: WelcomeValues;
	brand: BrandTheme;
	logoUrl: string;
	photoSrc?: string | null;
}): string {
	const { settings, values, brand, logoUrl } = opts;
	const logoBg = brand.logo.onDark ? brand.colors.ink : '#ffffff';
	const body = bodyBlocksHtml(settings.body || WELCOME_MAIL_DEFAULTS.body, values, brand);
	const hero = heroHtml(values, brand, opts.photoSrc ?? null);
	return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#f2f4f7;font-family:Arial,Helvetica,sans-serif;color:#101828">
	<div style="max-width:680px;margin:0 auto;background:#ffffff;border:1px solid #e4e7ec;border-radius:${brand.cardRadius}px;overflow:hidden">
		<div style="background:${logoBg};padding:18px 24px">
			<img src="${esc(logoUrl)}" alt="${esc(brand.name)}" height="34" style="height:34px;width:auto;display:block" />
		</div>
		${hero}
		<div style="padding:26px 28px">
			${body}
			<p style="margin:22px 0 4px;font-size:14.5px">Regards,</p>
			<p style="margin:0;font-size:14.5px;font-weight:700">${esc(settings.signoffName)}</p>
			${settings.signoffDesignation ? `<p style="margin:0;font-size:13px;color:#475467">${esc(settings.signoffDesignation)}</p>` : ''}
			<p style="margin:2px 0 0;font-size:13px;color:#475467">${esc(brand.legalName)}</p>
		</div>
	</div>
</body>
</html>`;
}

/** Plain-text alternative for clients that refuse HTML: the template with its
 *  tokens filled, bold markers dropped and bullets drawn as •. */
export function renderWelcomeText(
	settings: Pick<WelcomeMailSettings, 'body' | 'signoffName' | 'signoffDesignation'>,
	values: WelcomeValues,
	legalName: string
): string {
	const body = fill(settings.body || WELCOME_MAIL_DEFAULTS.body, values, (v) => v)
		.replace(/\r\n?/g, '\n')
		.split('\n')
		.map((l) => (RULE.test(l) ? '='.repeat(40) : l.replace(BULLET, '• ')))
		.join('\n')
		.replace(/\*\*(.+?)\*\*/g, '$1');
	const sign = [settings.signoffName, settings.signoffDesignation, legalName].filter(Boolean).join('\n');
	return `${body}\n\nRegards,\n${sign}`;
}

/** The tokens a body actually uses, so the preview only warns about a blank
 *  value the joiner would actually see — an unset manager is no gap in a
 *  template that never mentions one. */
export function tokensUsed(...templates: string[]): Set<keyof WelcomeValues> {
	const used = new Set<keyof WelcomeValues>();
	for (const t of templates)
		for (const m of t.matchAll(/\{(\w+)\}/g))
			if (WELCOME_TOKENS.some((k) => k.token === `{${m[1]}}`)) used.add(m[1] as keyof WelcomeValues);
	return used;
}
