import mongoose from 'mongoose';
import { env } from '$env/dynamic/private';

let connected = false;

export async function connectDb() {
	if (connected || mongoose.connection.readyState === 1) return;
	// Strip any database path from the URI — we set dbName explicitly.
	// This handles Railway's ${{MongoDB.MONGO_URL}} which appends /railway.
	const uri = (env.MONGODB_URI ?? '').replace(/\/[^/?]+(\?|$)/, '$1');
	await mongoose.connect(uri, {
		dbName: env.MONGODB_DB ?? 'champonboard',
		authSource: 'admin'
	});
	connected = true;
}

export { mongoose };
