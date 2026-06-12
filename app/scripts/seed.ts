// Seed: group companies + the bootstrap super admin.
// Run: npm run db:seed  (idempotent — skips anything that already exists)
import postgres from 'postgres';
import { randomBytes } from 'node:crypto';
import { hash } from '@node-rs/argon2';

const sql = postgres(process.env.DATABASE_URL ?? 'postgres://champ:champ@localhost:5432/champonboard');

const COMPANIES = ['Champions Group'];
const SUPER_ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'deep@championsmail.com';

for (const name of COMPANIES) {
	await sql`INSERT INTO companies (name) VALUES (${name}) ON CONFLICT (name) DO NOTHING`;
}

const existing = await sql`SELECT id FROM admins WHERE email = ${SUPER_ADMIN_EMAIL}`;
if (existing.length === 0) {
	const password = process.env.SEED_ADMIN_PASSWORD ?? randomBytes(9).toString('base64url');
	const passwordHash = await hash(password);
	await sql`INSERT INTO admins (email, password_hash, role)
	          VALUES (${SUPER_ADMIN_EMAIL}, ${passwordHash}, 'super_admin')`;
	console.log(`Super admin created: ${SUPER_ADMIN_EMAIL}`);
	console.log(`Password: ${password}`);
	console.log('Store this password now — it is not shown again.');
} else {
	console.log(`Super admin already exists: ${SUPER_ADMIN_EMAIL}`);
}

await sql.end();
