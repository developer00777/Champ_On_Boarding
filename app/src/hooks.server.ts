import { redirect, type Handle } from '@sveltejs/kit';
import { connectDb } from '$lib/server/db';
import { getRedis } from '$lib/server/redis';
import { resolveSession } from '$lib/server/auth';

// Redis-backed rate limiter — works correctly across serverless invocations.
async function rateLimited(key: string, limit: number, windowSec: number): Promise<boolean> {
	const redis = getRedis();
	const rKey = `rl:${key}`;
	const count = await redis.incr(rKey);
	if (count === 1) await redis.expire(rKey, windowSec);
	return count > limit;
}

export const handle: Handle = async ({ event, resolve }) => {
	await connectDb();

	const ip = event.getClientAddress();

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

	event.locals.admin = await resolveSession(event.cookies);

	if (
		event.url.pathname.startsWith('/admin') &&
		event.url.pathname !== '/admin/login' &&
		!event.locals.admin
	) {
		redirect(303, '/admin/login');
	}

	return resolve(event);
};
