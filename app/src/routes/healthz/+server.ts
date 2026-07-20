// Real health check — verifies the app can actually reach its dependencies,
// not just that the Node process is up. Platform health checks (Railway,
// Vercel) should point here instead of an arbitrary page like /admin/login,
// which only reads a cookie and says nothing about DB/Redis connectivity.
import { mongoose } from '$lib/server/db';
import { getRedis } from '$lib/server/redis';

export async function GET() {
	const checks: Record<string, 'ok' | string> = {};

	try {
		if (mongoose.connection.readyState !== 1) throw new Error(`readyState=${mongoose.connection.readyState}`);
		await mongoose.connection.db!.admin().ping();
		checks.mongo = 'ok';
	} catch (e) {
		checks.mongo = e instanceof Error ? e.message : String(e);
	}

	try {
		const pong = await getRedis().ping();
		if (pong !== 'PONG') throw new Error(`unexpected reply: ${pong}`);
		checks.redis = 'ok';
	} catch (e) {
		checks.redis = e instanceof Error ? e.message : String(e);
	}

	const healthy = Object.values(checks).every((v) => v === 'ok');

	return new Response(JSON.stringify({ status: healthy ? 'ok' : 'unhealthy', checks }), {
		status: healthy ? 200 : 503,
		headers: { 'Content-Type': 'application/json' }
	});
}
