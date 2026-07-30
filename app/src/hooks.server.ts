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

	const ip = event.getClientAddress();

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
	if (event.url.pathname.startsWith('/c/')) {
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
