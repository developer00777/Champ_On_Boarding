import Redis from 'ioredis';
import { env } from '$env/dynamic/private';

let _client: Redis | null = null;

export function getRedis(): Redis {
	if (!_client) {
		_client = new Redis(env.REDIS_URL, { lazyConnect: false, maxRetriesPerRequest: 3 });
	}
	return _client;
}
