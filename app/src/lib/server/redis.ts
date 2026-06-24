import Redis from 'ioredis';
import { env } from '$env/dynamic/private';

let _client: Redis | null = null;

export function getRedis(): Redis {
	if (!_client) {
		_client = new Redis(env.REDIS_URL, {
			lazyConnect: false,
			maxRetriesPerRequest: 1,
			enableOfflineQueue: true,
			connectTimeout: 5000,
			retryStrategy: (times) => (times > 3 ? null : Math.min(times * 200, 1000))
		});
		_client.on('error', (e) => console.error('[redis] error:', e.message));
	}
	return _client;
}
