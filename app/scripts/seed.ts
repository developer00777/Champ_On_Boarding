// Seed: the bootstrap super admin.
// Run: npm run db:seed  (idempotent — skips the admin if it already exists)
//
// Companies are deliberately NOT seeded here. connectDb() already seeds them
// on every app boot (src/lib/server/db/index.ts), and doing it here too was
// doubly harmful: the Railway start script runs the .mjs twin of this file on
// every deploy, and its upsert force-set `active: true` — silently
// resurrecting every company an admin had soft-deleted from /admin/entities —
// and it matched on outdated short names ("Champion Infratech"), inserting
// duplicate rows next to the canonical "… Pvt Ltd" ones on each fresh deploy.
import mongoose from 'mongoose';
import { randomBytes } from 'node:crypto';
import { hash } from '@node-rs/argon2';

const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017';
const MONGODB_DB = process.env.MONGODB_DB ?? 'champonboard';

console.log(`[seed] connecting to MongoDB db="${MONGODB_DB}"`);
await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB, authSource: 'admin' });
console.log(`[seed] connected`);
const db = mongoose.connection.db!;

const admins = db.collection('admins');

const SUPER_ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'deep@championsmail.com';
const SUPER_ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD;

console.log(`[seed] admin email="${SUPER_ADMIN_EMAIL}" password_set=${!!SUPER_ADMIN_PASSWORD}`);

const existing = await admins.findOne({ email: SUPER_ADMIN_EMAIL });

if (!existing) {
	const password = SUPER_ADMIN_PASSWORD ?? randomBytes(9).toString('base64url');
	const passwordHash = await hash(password);
	await admins.insertOne({
		email: SUPER_ADMIN_EMAIL,
		passwordHash,
		role: 'super_admin',
		status: 'active',
		createdAt: new Date()
	});
	console.log(`[seed] super admin created: ${SUPER_ADMIN_EMAIL}`);
} else if (SUPER_ADMIN_PASSWORD) {
	const passwordHash = await hash(SUPER_ADMIN_PASSWORD);
	await admins.updateOne(
		{ email: SUPER_ADMIN_EMAIL },
		{ $set: { passwordHash, role: 'super_admin', status: 'active' } }
	);
	console.log(`[seed] super admin password synced: ${SUPER_ADMIN_EMAIL}`);
} else {
	console.log(`[seed] super admin already exists, no password env set — skipping: ${SUPER_ADMIN_EMAIL}`);
}

await mongoose.disconnect();
console.log('[seed] done');
