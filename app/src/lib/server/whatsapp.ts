// DoubleTick WhatsApp Business API integration.
// All credentials are read from env vars — set them in Railway's variable panel.
// DoubleTick is a Meta WABA reseller; their REST API mirrors Meta's Cloud API shape.
//
// Required env vars:
//   DOUBLETICK_API_KEY       — Bearer token from DoubleTick dashboard
//   DOUBLETICK_API_URL       — Base URL (default: https://public.doubletick.io/whatsapp/v1)
//   DOUBLETICK_PHONE_ID      — Sender phone number ID from DoubleTick
//
// Template names must be pre-approved in your DoubleTick / Meta account.
// Sending is best-effort — failures are logged but never throw to the caller.

import { env } from '$env/dynamic/private';

interface WaTextComponent {
	type: 'body' | 'header' | 'footer';
	parameters: Array<{ type: 'text'; text: string }>;
}

interface WaButtonComponent {
	type: 'button';
	sub_type: 'url';
	index: string;
	parameters: Array<{ type: 'text'; text: string }>;
}

type WaComponent = WaTextComponent | WaButtonComponent;

async function sendTemplate(
	to: string,
	templateName: string,
	components: WaComponent[]
): Promise<void> {
	const apiKey = env.DOUBLETICK_API_KEY;
	const phoneId = env.DOUBLETICK_PHONE_ID;
	const baseUrl = (env.DOUBLETICK_API_URL ?? 'https://public.doubletick.io/whatsapp/v1').replace(/\/$/, '');

	if (!apiKey || !phoneId) {
		console.log(`[whatsapp] skipped — DOUBLETICK_API_KEY or DOUBLETICK_PHONE_ID not set`);
		return;
	}

	// Normalise to E.164: strip leading 0, prepend 91 for Indian numbers if no country code
	const normalised = to.replace(/\D/g, '');
	const e164 = normalised.startsWith('91') && normalised.length === 12
		? normalised
		: normalised.length === 10
			? `91${normalised}`
			: normalised;

	const payload = {
		messaging_product: 'whatsapp',
		to: e164,
		type: 'template',
		template: {
			name: templateName,
			language: { code: 'en' },
			components
		}
	};

	try {
		const res = await fetch(`${baseUrl}/messages`, {
			method: 'POST',
			headers: {
				Authorization: `Bearer ${apiKey}`,
				'Content-Type': 'application/json',
				'X-Phone-Id': phoneId
			},
			body: JSON.stringify(payload)
		});
		const body = await res.text();
		console.log(`[whatsapp] ${templateName} → ${e164} status=${res.status} body=${body.slice(0, 200)}`);
	} catch (err) {
		console.error(`[whatsapp] send failed for ${templateName}:`, err);
	}
}

/**
 * Sends the onboarding welcome message to the candidate via WhatsApp.
 *
 * Template: `champ_onboarding_welcome`
 * Expected body variables (in order):
 *   {{1}} Candidate first name
 *   {{2}} Company name
 *   {{3}} Track label (e.g. "Full-time")
 *
 * Expected button variable (URL button, index 0):
 *   {{1}} The onboarding link (dynamic suffix)
 *
 * Register this template in DoubleTick → Message Templates with category UTILITY.
 * Sample body:
 *   "Hi {{1}}, welcome to {{2}}! 🎉
 *    You've been selected for the {{3}} role.
 *    Please complete your onboarding here — the link expires in 7 days:"
 */
export async function sendOnboardingWelcomeWA(opts: {
	mobile: string;
	candidateName: string;
	companyName: string;
	trackLabel: string;
	link: string;
}): Promise<void> {
	const templateName = env.DOUBLETICK_TEMPLATE_WELCOME ?? 'champ_onboarding_welcome';

	await sendTemplate(opts.mobile, templateName, [
		{
			type: 'body',
			parameters: [
				{ type: 'text', text: opts.candidateName || 'there' },
				{ type: 'text', text: opts.companyName },
				{ type: 'text', text: opts.trackLabel }
			]
		},
		{
			type: 'button',
			sub_type: 'url',
			index: '0',
			parameters: [{ type: 'text', text: opts.link }]
		}
	]);
}

/**
 * Sends a notification to the candidate that their offer letter has been emailed.
 *
 * Template: `champ_offer_letter_sent`
 * Body variables:
 *   {{1}} Candidate first name
 *   {{2}} Company name
 *   {{3}} Candidate's email address (where letter was sent)
 *
 * Register with category UTILITY.
 */
export async function sendOfferLetterNotificationWA(opts: {
	mobile: string;
	candidateName: string;
	companyName: string;
	candidateEmail: string;
}): Promise<void> {
	const templateName = env.DOUBLETICK_TEMPLATE_OFFER ?? 'champ_offer_letter_sent';

	await sendTemplate(opts.mobile, templateName, [
		{
			type: 'body',
			parameters: [
				{ type: 'text', text: opts.candidateName || 'there' },
				{ type: 'text', text: opts.companyName },
				{ type: 'text', text: opts.candidateEmail }
			]
		}
	]);
}

/**
 * Notifies the candidate via WhatsApp that their submission has been approved.
 *
 * Template: `champ_onboarding_approved`
 * Body variables:
 *   {{1}} Candidate first name
 *   {{2}} Company name
 *
 * Register with category UTILITY.
 */
export async function sendApprovalNotificationWA(opts: {
	mobile: string;
	candidateName: string;
	companyName: string;
}): Promise<void> {
	const templateName = env.DOUBLETICK_TEMPLATE_APPROVED ?? 'champ_onboarding_approved';

	await sendTemplate(opts.mobile, templateName, [
		{
			type: 'body',
			parameters: [
				{ type: 'text', text: opts.candidateName || 'there' },
				{ type: 'text', text: opts.companyName }
			]
		}
	]);
}
