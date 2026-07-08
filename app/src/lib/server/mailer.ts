// Mailer — Resend when RESEND_API_KEY is set, console otherwise (dev).
import { env } from '$env/dynamic/private';
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

/** "Brand Legal Name <mailbox@domain>" — keeps the shared sending mailbox but
 *  shows the recruiting brand's name to the recipient. */
export function brandFromHeader(brand: BrandTheme): string {
	const configured = env.MAIL_FROM ?? 'onboarding@example.com';
	const match = configured.match(/<([^>]+)>/);
	const address = match ? match[1] : configured;
	return `${brand.legalName} <${address}>`;
}

/** data: URI for a brand's logo, or null if the asset isn't in the registry. */
async function brandLogoDataUri(brand: BrandTheme): Promise<string | null> {
	const { BRAND_LOGO_ASSETS } = await import('$lib/server/email/logo-assets');
	const asset = BRAND_LOGO_ASSETS[brand.logo.src];
	if (!asset) return null;
	return `data:${asset.mime};base64,${asset.base64}`;
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
	const logo = await brandLogoDataUri(brand);
	if (!logo) return undefined;
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

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;');
}

/** Sends a plain-text-compatible email with brand-aware from-name, an inline
 *  logo HTML body, and optional attachments (e.g. a filled offer letter). */
export async function sendBrandedMail(
	to: string,
	subject: string,
	text: string,
	brand: BrandTheme,
	attachments?: MailAttachment[]
) {
	await sendMail(to, subject, text, {
		from: brandFromHeader(brand),
		html: await brandedHtml(brand, text),
		attachments
	});
}
