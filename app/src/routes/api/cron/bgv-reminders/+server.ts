// External trigger for the BGV reminder sweep, for deployments that cannot
// hold an in-process interval (Vercel, or anywhere the app scales to zero).
// A long-running server already sweeps itself — see startBgvReminderTicker —
// and calling this as well is harmless: both go through the same Redis lock
// and the same per-row claim, so a reminder still cannot go out twice.
//
// Wire it up as, e.g., a Vercel cron or an uptime pinger every 15 minutes:
//   curl -H "Authorization: Bearer $CRON_SECRET" https://<host>/api/cron/bgv-reminders
import { error, json } from '@sveltejs/kit';
import { timingSafeEqual } from 'node:crypto';
import type { RequestHandler } from './$types';
import { env } from '$env/dynamic/private';
import { sweepBgvReminders } from '$lib/server/bgv-reminders';

/** Constant-time compare that tolerates a length mismatch — timingSafeEqual
 *  throws on differing lengths, which would itself leak the secret's length. */
function secretMatches(provided: string, expected: string): boolean {
	const a = Buffer.from(provided);
	const b = Buffer.from(expected);
	return a.length === b.length && timingSafeEqual(a, b);
}

async function handle(request: Request): Promise<Response> {
	const expected = env.CRON_SECRET;
	// Closed by default: with no secret configured this endpoint would be an
	// unauthenticated way for anyone to make the platform send mail.
	if (!expected) error(503, 'CRON_SECRET is not configured — this endpoint is disabled.');

	const header = request.headers.get('authorization') ?? '';
	const provided = header.replace(/^Bearer\s+/i, '').trim();
	if (!provided || !secretMatches(provided, expected)) error(401, 'Unauthorized');

	const result = await sweepBgvReminders();
	return json({ ok: true, ...result });
}

// GET as well as POST: most cron products (Vercel included) only issue a GET.
export const GET: RequestHandler = ({ request }) => handle(request);
export const POST: RequestHandler = ({ request }) => handle(request);
