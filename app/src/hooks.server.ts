import { redirect, type Handle } from '@sveltejs/kit';
import { resolveSession } from '$lib/server/auth';

// In-memory rate limiter — adequate for a single App Platform instance (PRD §9).
const hits = new Map<string, { count: number; resetAt: number }>();
function rateLimited(key: string, limit: number, windowMs: number): boolean {
	const now = Date.now();
	const entry = hits.get(key);
	if (!entry || entry.resetAt < now) {
		hits.set(key, { count: 1, resetAt: now + windowMs });
		return false;
	}
	entry.count += 1;
	return entry.count > limit;
}

export const handle: Handle = async ({ event, resolve }) => {
	const ip = event.getClientAddress();

	if (event.request.method === 'POST' && event.url.pathname === '/admin/login') {
		if (rateLimited(`login:${ip}`, 10, 60_000)) {
			return new Response('Too many attempts, try again in a minute.', { status: 429 });
		}
	}
	if (event.url.pathname.startsWith('/c/')) {
		if (rateLimited(`cand:${ip}`, 240, 60_000)) {
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
