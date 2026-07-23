// Resend webhook — both delivery events for outbound mail and email.received
// for inbound replies. Resend signs requests the same way Svix does
// (svix-id / svix-timestamp / svix-signature headers) — there is no
// Resend-specific SDK for this, so verification is done by hand per
// https://docs.svix.com/receiving/verifying-payloads/how-manual rather than
// pulling in the full svix package for three lines of HMAC.
//
// Closes the loop on mail in both directions, backing the admin /admin/inbox
// panel:
//  - Outbound: sendMail() (mailer.ts) writes a 'sent' EmailMessage the moment
//    a candidate-facing send fires, tagged with { candidate_id, purpose }.
//    This endpoint updates that row's status as delivered/opened/bounced/etc
//    events arrive, and mirrors the same event onto AuditLog for the
//    per-candidate audit trail on the candidate detail page.
//  - Inbound: email.received webhooks only carry metadata (no body) — this
//    endpoint calls the Received Emails API for the full text, matches the
//    sender to a candidate by email address, and writes a new 'received'
//    EmailMessage row.
import { error, json } from '@sveltejs/kit';
import { createHmac, timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { AuditLog, Candidate, EmailMessage } from '$lib/server/db/schema';

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

const STATUS_BY_EVENT: Record<string, string> = {
	'email.delivered': 'delivered',
	'email.bounced': 'bounced',
	'email.delivery_delayed': 'delayed',
	'email.complained': 'complained',
	'email.opened': 'opened',
	'email.clicked': 'clicked',
	'email.failed': 'failed'
};
const AUDIT_ACTION_BY_STATUS: Record<string, string> = {
	delivered: 'mail_delivered',
	bounced: 'mail_bounced',
	delayed: 'mail_delayed',
	complained: 'mail_complained',
	opened: 'mail_opened',
	clicked: 'mail_clicked',
	failed: 'mail_failed'
};

async function fetchReceivedBody(emailId: string): Promise<string | null> {
	try {
		const res = await fetch(`https://api.resend.com/emails/receiving/${emailId}`, {
			headers: { Authorization: `Bearer ${env.RESEND_API_KEY}` },
			signal: AbortSignal.timeout(10_000)
		});
		if (!res.ok) return null;
		const body = (await res.json()) as { text?: string };
		return body.text ?? null;
	} catch (e) {
		console.error('[webhooks/resend] failed to fetch received email body:', e);
		return null;
	}
}

/** Best-effort: strips any display name and angle brackets from a From/To
 *  header value ("Name <addr@x.com>" or plain "addr@x.com") down to the bare
 *  address, for matching against Candidate.email (case-insensitive). */
function bareAddress(value: string): string {
	const match = value.match(/<([^>]+)>/);
	return (match ? match[1] : value).trim().toLowerCase();
}

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

	if (event.type === 'email.received') {
		const from = event.data.from ?? '';
		const senderAddress = bareAddress(from);
		const candidate = senderAddress
			? await Candidate.findOne({ email: senderAddress }).lean()
			: null;

		const text = event.data.email_id ? await fetchReceivedBody(event.data.email_id) : null;

		await EmailMessage.create({
			direction: 'inbound',
			candidateId: candidate?._id ?? null,
			resendEmailId: event.data.email_id ?? null,
			from,
			to: event.data.to?.[0] ?? '',
			subject: event.data.subject ?? null,
			text,
			status: 'received'
		});

		if (candidate) {
			await AuditLog.create({
				candidateId: String(candidate._id),
				actor: senderAddress,
				action: 'mail_received',
				field: event.data.subject ?? null
			});
		}

		return json({ ok: true });
	}

	const status = STATUS_BY_EVENT[event.type];
	if (!status) {
		// domain/contact events, email.sent, email.scheduled, email.suppressed —
		// not tracked per-candidate. Not an error, just nothing to log.
		return json({ ok: true, ignored: event.type });
	}

	const candidateId = event.data.tags?.candidate_id ?? null;
	const statusDetail = event.data.bounce?.message ?? event.data.click?.link ?? null;

	if (event.data.email_id) {
		await EmailMessage.findOneAndUpdate(
			{ resendEmailId: event.data.email_id },
			{ status, statusDetail }
		);
	}

	await AuditLog.create({
		candidateId,
		actor: 'resend',
		action: AUDIT_ACTION_BY_STATUS[status],
		field: event.data.tags?.purpose ?? null,
		newValue: statusDetail ?? event.data.to?.[0] ?? null
	});

	return json({ ok: true });
};
