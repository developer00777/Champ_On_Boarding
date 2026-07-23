// Resend delivery-event webhook. Resend signs requests the same way Svix
// does (svix-id / svix-timestamp / svix-signature headers) — there is no
// Resend-specific SDK for this, so verification is done by hand per
// https://docs.svix.com/receiving/verifying-payloads/how-manual rather than
// pulling in the full svix package for three lines of HMAC.
//
// Closes the loop on outbound mail: sendBrandedMail() tags every candidate-
// facing send with { candidate_id, purpose } (see mailer.ts); this endpoint
// reads those tags back off delivered/bounced/opened/clicked/complained
// events and writes them onto that candidate's audit trail, so a bounced
// onboarding-link email is visible on the candidate's page instead of
// silently disappearing into an inbox nobody watches.
import { error, json } from '@sveltejs/kit';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { AuditLog } from '$lib/server/db/schema';

interface ResendWebhookEvent {
	type: string;
	created_at: string;
	data: {
		email_id?: string;
		from?: string;
		to?: string[];
		subject?: string;
		tags?: Record<string, string>;
		bounce?: { type?: string; message?: string };
		click?: { link?: string };
	};
}

/** Svix manual verification: HMAC-SHA256 over `${id}.${timestamp}.${body}`,
 *  keyed by the base64 portion of the whsec_ secret, compared against every
 *  `v1,<sig>` entry in the space-delimited svix-signature header. */
function verifySignature(secret: string, id: string, timestamp: string, body: string, signatureHeader: string): boolean {
	const key = Buffer.from(secret.replace(/^whsec_/, ''), 'base64');
	const signedContent = `${id}.${timestamp}.${body}`;
	const expected = createHmac('sha256', key).update(signedContent).digest('base64');
	const expectedBuf = Buffer.from(expected);

	return signatureHeader
		.split(' ')
		.map((entry) => entry.split(',')[1])
		.filter(Boolean)
		.some((candidate) => {
			const candidateBuf = Buffer.from(candidate);
			return candidateBuf.length === expectedBuf.length && timingSafeEqual(candidateBuf, expectedBuf);
		});
}

const AUDIT_ACTION_BY_EVENT: Record<string, string> = {
	'email.delivered': 'mail_delivered',
	'email.bounced': 'mail_bounced',
	'email.delivery_delayed': 'mail_delayed',
	'email.complained': 'mail_complained',
	'email.opened': 'mail_opened',
	'email.clicked': 'mail_clicked',
	'email.failed': 'mail_failed'
};

export const POST: RequestHandler = async ({ request }) => {
	const secret = env.RESEND_WEBHOOK_SECRET;
	if (!secret) {
		console.error('[webhooks/resend] RESEND_WEBHOOK_SECRET not configured — rejecting');
		error(500, 'Webhook not configured');
	}

	const id = request.headers.get('svix-id');
	const timestamp = request.headers.get('svix-timestamp');
	const signature = request.headers.get('svix-signature');
	if (!id || !timestamp || !signature) error(400, 'Missing signature headers');

	const body = await request.text();
	if (!verifySignature(secret, id, timestamp, body, signature)) {
		console.error('[webhooks/resend] signature verification failed');
		error(401, 'Invalid signature');
	}

	let event: ResendWebhookEvent;
	try {
		event = JSON.parse(body);
	} catch {
		error(400, 'Invalid JSON');
	}

	const action = AUDIT_ACTION_BY_EVENT[event.type];
	if (!action) {
		// Domain/contact events, email.sent, email.scheduled, email.suppressed —
		// not tracked per-candidate. Not an error, just nothing to log.
		return json({ ok: true, ignored: event.type });
	}

	const candidateId = event.data.tags?.candidate_id ?? null;
	await AuditLog.create({
		candidateId,
		actor: 'resend',
		action,
		field: event.data.tags?.purpose ?? null,
		newValue: event.data.bounce?.message ?? event.data.click?.link ?? event.data.to?.[0] ?? null
	});

	return json({ ok: true });
};
