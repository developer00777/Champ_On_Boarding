import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '$env/dynamic/private';
import * as schema from './schema';

// Vercel serverless: each invocation is short-lived, so a pool of 1 prevents
// connection exhaustion. Long-lived Node.js servers (Railway/DO) benefit from more.
const client = postgres(env.DATABASE_URL, {
	max: process.env.VERCEL ? 1 : 10,
	idle_timeout: 20,
	connect_timeout: 10
});

export const db = drizzle(client, { schema });
export * as t from './schema';
