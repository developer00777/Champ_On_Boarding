import mongoose from 'mongoose';
import { env } from '$env/dynamic/private';

let connected = false;

export async function connectDb() {
	if (connected || mongoose.connection.readyState === 1) return;
	await mongoose.connect(env.MONGODB_URI, { dbName: env.MONGODB_DB ?? 'champonboard' });
	connected = true;
}

export { mongoose };
