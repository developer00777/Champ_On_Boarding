import { getRedis } from '$lib/server/redis';

// Redis-backed rate limiter — fails open so a Redis outage never blocks the app.
export async function rateLimited(key: string, limit: number, windowSec: number): Promise<boolean> {
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
