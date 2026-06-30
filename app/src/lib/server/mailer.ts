// Mailer — Resend when RESEND_API_KEY is set, console otherwise (dev).
import { env } from '$env/dynamic/private';
import type { BrandTheme } from '$lib/shared/brands';

/** Standard HR sign-off line for a brand, e.g. "— HR, Champion Infratech". */
export function brandSignoff(brand: BrandTheme): string {
	return `— HR, ${brand.legalName}`;
}

export async function sendMail(to: string, subject: string, text: string) {
	console.log(`[mail] key_set=${!!env.RESEND_API_KEY} from="${env.MAIL_FROM}" to=${to}`);
	if (!env.RESEND_API_KEY) {
		console.log(`[mail:console] to=${to} subject="${subject}"\n${text}`);
		return;
	}
	const res = await fetch('https://api.resend.com/emails', {
		method: 'POST',
		headers: {
			Authorization: `Bearer ${env.RESEND_API_KEY}`,
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({ from: env.MAIL_FROM ?? 'onboarding@example.com', to, subject, text })
	});
	const body = await res.text();
	console.log(`[mail] Resend ${res.status}: ${body.slice(0, 300)}`);
}
