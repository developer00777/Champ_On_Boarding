import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { env } from '$env/dynamic/private';
import * as schema from './schema';

// On Vercel each serverless instance must keep a tiny pool and must not use
// prepared statements when going through a transaction pooler (Neon pooled /
// Supabase pgbouncer). Locally and on the Dockerised droplet we keep a normal pool.
const serverless = !!env.VERCEL;
const client = postgres(env.DATABASE_URL, {
	max: serverless ? 1 : 10,
	prepare: serverless ? false : undefined
});

export const db = drizzle(client, { schema });
export * as t from './schema';
