// Twilio WhatsApp Business API integration.
// All credentials are read from env vars — set them in Railway's variable panel.
// Twilio proxies Meta's WhatsApp Cloud API; templates are approved WhatsApp
// Content Templates (Console → Messaging → Content Template Builder), never
// raw Body text — every send here is business-initiated, so it is always
// outside the 24h customer-service window and Meta requires a template.
//
// Required env vars:
//   TWILIO_ACCOUNT_SID        — starts with "AC" (Console → Account Info)
//   TWILIO_API_KEY_SID        — starts with "SK" (Console → Account → API keys & tokens)
//   TWILIO_API_KEY_SECRET     — shown once when the API key is created
//   TWILIO_WHATSAPP_FROM      — sender in "whatsapp:+<E.164>" form, e.g. whatsapp:+14155238886
//   TWILIO_TEMPLATE_WELCOME   — ContentSid ("HX...") for the welcome template
//   TWILIO_TEMPLATE_OFFER     — ContentSid for the offer-letter-sent template
//   TWILIO_TEMPLATE_APPROVED  — ContentSid for the approved template
//
// API Key + Secret (not Account SID + Auth Token) per Twilio's own production
// guidance: scoped and revocable independently of the main account credentials.
// See setup steps in README.md / DEPLOYMENT docs.
//
// Sending is best-effort — failures are logged but never throw to the caller.

import { env } from '$env/dynamic/private';

async function sendTemplate(to: string, contentSid: string | undefined, variables: Record<string, string>): Promise<void> {
	const accountSid = env.TWILIO_ACCOUNT_SID;
	const apiKeySid = env.TWILIO_API_KEY_SID;
	const apiKeySecret = env.TWILIO_API_KEY_SECRET;
	const from = env.TWILIO_WHATSAPP_FROM;

	if (!accountSid || !apiKeySid || !apiKeySecret || !from) {
		console.log(`[whatsapp] skipped — TWILIO_ACCOUNT_SID/TWILIO_API_KEY_SID/TWILIO_API_KEY_SECRET/TWILIO_WHATSAPP_FROM not fully set`);
		return;
	}
	if (!contentSid) {
		console.log(`[whatsapp] skipped — no ContentSid configured for this template`);
		return;
	}

	// Normalise to E.164: strip leading 0, prepend 91 for Indian numbers if no country code
	const normalised = to.replace(/\D/g, '');
	const e164Digits = normalised.startsWith('91') && normalised.length === 12
		? normalised
		: normalised.length === 10
			? `91${normalised}`
			: normalised;

	const body = new URLSearchParams({
		To: `whatsapp:+${e164Digits}`,
		From: from,
		ContentSid: contentSid,
		ContentVariables: JSON.stringify(variables)
	});

	const creds = Buffer.from(`${apiKeySid}:${apiKeySecret}`).toString('base64');

	try {
		const res = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
			method: 'POST',
			headers: {
				Authorization: `Basic ${creds}`,
				'Content-Type': 'application/x-www-form-urlencoded'
			},
			body,
			signal: AbortSignal.timeout(15_000)
		});
		const responseBody = await res.text();
		console.log(`[whatsapp] ${contentSid} → whatsapp:+${e164Digits} status=${res.status} body=${responseBody.slice(0, 200)}`);
	} catch (err) {
		console.error(`[whatsapp] send failed for ${contentSid}:`, err);
	}
}

/**
 * Sends the onboarding welcome message to the candidate via WhatsApp.
 *
 * Content Template variables (ContentVariables keys "1".."4"):
 *   {{1}} Candidate first name
 *   {{2}} Company name
 *   {{3}} Track label (e.g. "Full-time")
 *   {{4}} The onboarding link — bind this to the template's URL button's
 *         dynamic suffix (or to a body placeholder if the template has no
 *         button); Twilio Content Templates take every dynamic value,
 *         header/body/button alike, through the same ContentVariables map.
 *
 * Register this template in Console → Messaging → Content Template Builder
 * with category UTILITY, get it Meta-approved, then set its ContentSid
 * ("HX...") as TWILIO_TEMPLATE_WELCOME.
 */
export async function sendOnboardingWelcomeWA(opts: {
	mobile: string;
	candidateName: string;
	companyName: string;
	trackLabel: string;
	link: string;
}): Promise<void> {
	await sendTemplate(opts.mobile, env.TWILIO_TEMPLATE_WELCOME, {
		'1': opts.candidateName || 'there',
		'2': opts.companyName,
		'3': opts.trackLabel,
		'4': opts.link
	});
}

/**
 * Sends a notification to the candidate that their offer letter has been emailed.
 *
 * Content Template variables:
 *   {{1}} Candidate first name
 *   {{2}} Company name
 *   {{3}} Candidate's email address (where letter was sent)
 *
 * Register with category UTILITY; set ContentSid as TWILIO_TEMPLATE_OFFER.
 */
export async function sendOfferLetterNotificationWA(opts: {
	mobile: string;
	candidateName: string;
	companyName: string;
	candidateEmail: string;
}): Promise<void> {
	await sendTemplate(opts.mobile, env.TWILIO_TEMPLATE_OFFER, {
		'1': opts.candidateName || 'there',
		'2': opts.companyName,
		'3': opts.candidateEmail
	});
}

/**
 * Notifies the candidate via WhatsApp that their submission has been approved.
 *
 * Content Template variables:
 *   {{1}} Candidate first name
 *   {{2}} Company name
 *
 * Register with category UTILITY; set ContentSid as TWILIO_TEMPLATE_APPROVED.
 */
export async function sendApprovalNotificationWA(opts: {
	mobile: string;
	candidateName: string;
	companyName: string;
}): Promise<void> {
	await sendTemplate(opts.mobile, env.TWILIO_TEMPLATE_APPROVED, {
		'1': opts.candidateName || 'there',
		'2': opts.companyName
	});
}
