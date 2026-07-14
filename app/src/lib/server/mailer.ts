// Mailer — Resend when RESEND_API_KEY is set, console otherwise (dev).
import { env } from '$env/dynamic/private';
import { env as publicEnv } from '$env/dynamic/public';
import type { BrandTheme } from '$lib/shared/brands';

export interface MailAttachment {
	filename: string;
	content: Buffer;
}

interface SendMailOptions {
	/** Overrides the default `from` header, e.g. a brand-aware display name. */
	from?: string;
	/** Optional HTML body. When present, sent alongside `text` as a fallback. */
	html?: string;
	attachments?: MailAttachment[];
}

/** Standard HR sign-off line for a brand, e.g. "— HR, Champion Infratech". */
export function brandSignoff(brand: BrandTheme): string {
	return `— HR, ${brand.legalName}`;
}

export type MailPurpose = 'onboarding' | 'offer';

/** Resolves the configured mailbox for a purpose. `offer` falls back to the
 *  onboarding mailbox (MAIL_FROM) when OFFER_MAIL_FROM isn't set, so a second
 *  address is opt-in. */
function fromAddressFor(purpose: MailPurpose): string {
	const onboarding = env.MAIL_FROM ?? 'onboarding@example.com';
	if (purpose === 'offer') return env.OFFER_MAIL_FROM ?? onboarding;
	return onboarding;
}

/** "Brand Legal Name <mailbox@domain>" — keeps a per-purpose sending mailbox
 *  (see fromAddressFor) but shows the recruiting brand's name to the recipient. */
export function brandFromHeader(brand: BrandTheme, purpose: MailPurpose = 'onboarding'): string {
	const configured = fromAddressFor(purpose);
	const match = configured.match(/<([^>]+)>/);
	const address = match ? match[1] : configured;
	return `${brand.legalName} <${address}>`;
}

/** Absolute URL for a brand's logo, served from the app's own static assets.
 *  Most mail clients (Gmail, Outlook) strip `data:` URI images from HTML
 *  email for security reasons, so the logo must be a normal hosted URL. */
function brandLogoUrl(brand: BrandTheme): string {
	const base = (publicEnv.PUBLIC_BASE_URL ?? 'http://localhost:5173').replace(/\/$/, '');
	return `${base}${brand.logo.src}`;
}

export async function sendMail(to: string, subject: string, text: string, options: SendMailOptions = {}) {
	const from = options.from ?? env.MAIL_FROM ?? 'onboarding@example.com';
	console.log(
		`[mail] key_set=${!!env.RESEND_API_KEY} from="${from}" to=${to}` +
			(options.attachments?.length ? ` attachments=${options.attachments.map((a) => a.filename).join(',')}` : '')
	);
	if (!env.RESEND_API_KEY) {
		console.log(`[mail:console] to=${to} subject="${subject}"\n${text}`);
		return;
	}
	const payload: Record<string, unknown> = { from, to, subject, text };
	if (options.html) payload.html = options.html;
	if (options.attachments?.length) {
		payload.attachments = options.attachments.map((a) => ({
			filename: a.filename,
			content: a.content.toString('base64')
		}));
	}
	const res = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${env.RESEND_API_KEY}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify(payload)
	});
	const body = await res.text();
	console.log(`[mail] Resend ${res.status}: ${body.slice(0, 300)}`);
}

/** Wraps plain-text body in a minimal branded HTML shell with the brand's logo. */
async function brandedHtml(brand: BrandTheme, text: string): Promise<string | undefined> {
	const logo = brandLogoUrl(brand);
	const bodyHtml = text
		.split('\n')
		.map((line) => (line ? `<p style="margin:0 0 12px">${escapeHtml(line)}</p>` : ''))
		.join('\n');
	const logoBg = brand.logo.onDark ? brand.colors.ink : 'transparent';
	return `<!doctype html>
<html>
<body style="margin:0;padding:24px;background:#f4f4f5;font-family:${brand.fonts.body};color:${brand.colors.text}">
	<div style="max-width:560px;margin:0 auto;background:${brand.colors.surface};border-radius:${brand.cardRadius}px;overflow:hidden;border:1px solid ${brand.colors.border}">
		<div style="background:${logoBg};padding:18px 24px">
			<img src="${logo}" alt="${escapeHtml(brand.name)}" height="32" style="height:32px;width:auto;display:block" />
		</div>
		<div style="padding:24px">
			${bodyHtml}
		</div>
	</div>
</body>
</html>`;
}

/** Rich HTML template specifically for offer letter delivery emails.
 *  Replaces the generic branded mail for offer-letter purpose. */
export function offerLetterHtml(opts: {
	brand: BrandTheme;
	candidateName: string;
	companyName: string;
	jobTitle: string;
	letterType: string;
	logoUrl: string;
}): string {
	const { brand, candidateName, companyName, jobTitle, letterType, logoUrl } = opts;
	const logoBg = brand.logo.onDark ? brand.colors.ink : '#ffffff';
	const primary = brand.colors.primary;
	const ink = brand.colors.ink;
	const text = brand.colors.text;
	const border = brand.colors.border;
	const radius = brand.cardRadius;

	return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f2f4f7;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="background:#f2f4f7;padding:32px 16px">
  <tr><td align="center">
    <table width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:${radius}px;overflow:hidden;border:1px solid ${border};max-width:560px">

      <!-- Header -->
      <tr>
        <td style="background:${ink};padding:22px 32px">
          <img src="${logoUrl}" alt="${escapeHtml(brand.name)}" height="38"
               style="height:38px;width:auto;display:block;background:${logoBg};padding:${brand.logo.onDark ? '6px 10px' : '0'};border-radius:6px" />
        </td>
      </tr>

      <!-- Accent stripe -->
      <tr><td style="background:${primary};height:4px;font-size:0;line-height:0">&nbsp;</td></tr>

      <!-- Congratulations hero -->
      <tr>
        <td style="padding:36px 32px 24px;text-align:center">
          <div style="display:inline-block;background:${primary}18;border-radius:50%;width:64px;height:64px;line-height:64px;font-size:32px;margin-bottom:18px">🎉</div>
          <h1 style="margin:0 0 8px;font-size:24px;font-weight:800;color:${ink};letter-spacing:-0.5px">
            Congratulations, ${escapeHtml(candidateName)}!
          </h1>
          <p style="margin:0;font-size:15px;color:#555;line-height:1.6">
            We are delighted to offer you the position of<br>
            <strong style="color:${ink}">${escapeHtml(jobTitle)}</strong> at
            <strong style="color:${primary}">${escapeHtml(companyName)}</strong>.
          </p>
        </td>
      </tr>

      <!-- Divider -->
      <tr><td style="padding:0 32px"><div style="height:1px;background:${border}"></div></td></tr>

      <!-- Body -->
      <tr>
        <td style="padding:28px 32px;color:${text};font-size:14.5px;line-height:1.75">
          <p style="margin:0 0 16px">
            It was a pleasure connecting with you through our recruitment process.
            We are thrilled to welcome you to the ${escapeHtml(companyName)} family and look
            forward to the value and energy you will bring to our team.
          </p>
          <p style="margin:0 0 16px">
            Please find your <strong>${escapeHtml(letterType)}</strong> attached to this email as a PDF.
            Kindly review the details carefully and confirm your acceptance by signing and
            returning a copy at the earliest.
          </p>
          <p style="margin:0">
            Should you have any questions, please do not hesitate to reach out to us.
            We are excited to have you on board!
          </p>
        </td>
      </tr>

      <!-- CTA note -->
      <tr>
        <td style="padding:0 32px 28px">
          <div style="background:${primary}12;border-left:4px solid ${primary};border-radius:0 8px 8px 0;padding:14px 18px">
            <p style="margin:0;font-size:13px;color:${ink};font-weight:700">📎 Your ${escapeHtml(letterType)} is attached</p>
            <p style="margin:4px 0 0;font-size:12.5px;color:#666">
              Open the PDF, read the terms carefully, and reply to this email with a signed copy to confirm acceptance.
            </p>
          </div>
        </td>
      </tr>

      <!-- Divider -->
      <tr><td style="padding:0 32px"><div style="height:1px;background:${border}"></div></td></tr>

      <!-- Sign-off -->
      <tr>
        <td style="padding:24px 32px;font-size:14px;color:${text}">
          <p style="margin:0 0 4px">Warm regards,</p>
          <p style="margin:0;font-weight:700;color:${ink}">HR Team</p>
          <p style="margin:0;font-size:13px;color:#777">${escapeHtml(companyName)}</p>
        </td>
      </tr>

      <!-- Footer -->
      <tr>
        <td style="background:${ink};padding:16px 32px;text-align:center">
          <p style="margin:0;font-size:11px;color:#aaa">
            This is an automated email from ${escapeHtml(companyName)}'s onboarding platform.
            Please do not reply to this email directly — contact HR for any queries.
          </p>
        </td>
      </tr>

    </table>
  </td></tr>
</table>
</body>
</html>`;
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

/** Sends a plain-text-compatible email with brand-aware from-name, an inline
 *  logo HTML body, and optional attachments (e.g. a filled offer letter).
 *  `purpose` picks which configured mailbox sends it — see fromAddressFor. */
export async function sendBrandedMail(
	to: string,
	subject: string,
	text: string,
	brand: BrandTheme,
	attachments?: MailAttachment[],
	purpose: MailPurpose = 'onboarding'
) {
	await sendMail(to, subject, text, {
		from: brandFromHeader(brand, purpose),
		html: await brandedHtml(brand, text),
		attachments
	});
}
