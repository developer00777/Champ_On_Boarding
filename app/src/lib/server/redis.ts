import Redis from 'ioredis';
import { env } from '$env/dynamic/private';

let _client: Redis | null = null;

export function getRedis(): Redis {
	if (!_client) {
		_client = new Redis(env.REDIS_URL, {
			lazyConnect: true,
			maxRetriesPerRequest: 1,
			enableOfflineQueue: false,
			connectTimeout: 5000
		});
		_client.on('error', (e) => console.error('[redis] connection error:', e.message));
	}
	return _client;
}
