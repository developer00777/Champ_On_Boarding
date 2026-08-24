import { redirect, type Handle } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import { connectDb } from '$lib/server/db';
import { getRedis } from '$lib/server/redis';
import { resolveSession } from '$lib/server/auth';
import { isAllowedAdminIp } from '$lib/server/ip-allowlist';

// Redis-backed rate limiter — fails open so a Redis outage never blocks the app.
async function rateLimited(key: string, limit: number, windowSec: number): Promise<boolean> {
	try {
		const redis = getRedis();
		const rKey = `rl:${key}`;
		const count = await redis.incr(rKey);
		if (count === 1) await redis.expire(rKey, windowSec);
		return count > limit;
	} catch (e) {
		console.error('[rate-limit] Redis error, failing open:', e);
		return false;
	}
}

export const handle: Handle = async ({ event, resolve }) => {
	try {
		await connectDb();
	} catch (e) {
		console.error('[hooks] MongoDB connect error:', e);
	}

	// getClientAddress() throws when ADDRESS_HEADER is set but the incoming
	// request doesn't carry that header — true for Railway's own healthcheck
	// prober hitting /healthz, which never sends X-Forwarded-For. Letting that
	// throw crashes every request handled here and fails the healthcheck, so
	// treat "can't determine the IP" as unknown rather than a hard error.
	let ip = '';
	try {
		ip = event.getClientAddress();
	} catch (e) {
		console.warn('[hooks] getClientAddress() failed, treating as unknown IP:', e);
	}

	// Office/VPN-only admin panel. ADMIN_IP_ALLOWLIST_MODE unset or "log" only
	// logs what would be blocked, so a missing office IP can be caught before
	// it locks anyone out; set to "enforce" once the log has been reviewed.
	if (event.url.pathname.startsWith('/admin')) {
		const mode = env.ADMIN_IP_ALLOWLIST_MODE ?? 'log';
		if (mode !== 'off' && !isAllowedAdminIp(ip)) {
			if (mode === 'enforce') {
				return new Response('Forbidden — this admin panel is restricted to the office network.', {
					status: 403
				});
			}
			console.warn(`[ip-allowlist] would BLOCK ${ip} -> ${event.url.pathname} (log-only mode)`);
		}
	}

	if (event.request.method === 'POST' && event.url.pathname === '/admin/login') {
		if (await rateLimited(`login:${ip}`, 10, 60)) {
			return new Response('Too many attempts, try again in a minute.', { status: 429 });
		}
	}
	// /bgv/ is the previous-employer verification form and /x/ the offboarding
	// surfaces (the employee's exit forms, an approver's clearance page, the
	// final document handover) — all public and token-gated like /c/, so they
	// share the same abuse budget.
	if (
		event.url.pathname.startsWith('/c/') ||
		event.url.pathname.startsWith('/bgv/') ||
		event.url.pathname.startsWith('/x/')
	) {
		if (await rateLimited(`cand:${ip}`, 240, 60)) {
			return new Response('Too many requests.', { status: 429 });
		}
	}

	try {
		event.locals.admin = await resolveSession(event.cookies);
	} catch (e) {
		console.error('[hooks] resolveSession error:', e);
		event.locals.admin = null;
	}

	if (
		event.url.pathname.startsWith('/admin') &&
		event.url.pathname !== '/admin/login' &&
		!event.locals.admin
	) {
		redirect(303, '/admin/login');
	}

	return resolve(event);
};
