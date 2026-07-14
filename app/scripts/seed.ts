// Seed: group companies + the bootstrap super admin.
// Run: npm run db:seed  (idempotent — skips anything that already exists)
import mongoose from 'mongoose';
import { randomBytes } from 'node:crypto';
import { hash } from '@node-rs/argon2';

const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017';
const MONGODB_DB = process.env.MONGODB_DB ?? 'champonboard';

console.log(`[seed] connecting to MongoDB db="${MONGODB_DB}"`);
await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB, authSource: 'admin' });
console.log(`[seed] connected`);
const db = mongoose.connection.db!;

const companies = db.collection('companies');
const admins = db.collection('admins');

const COMPANIES = [
	{ name: 'Champion Infratech', brandSlug: 'champion-infratech' },
	{ name: 'Champions Club', brandSlug: 'champions-club' },
	{ name: 'IP Momentum', brandSlug: 'ip-momentum' },
	{ name: 'Champion Products', brandSlug: 'champion-products' },
	{ name: 'Champion Infometrics', brandSlug: 'champion-infometrics' },
	{ name: 'Champions Yacht Club', brandSlug: 'champions-yacht-club' },
	{ name: 'Cirrologix', brandSlug: 'cirrologix' },
	{ name: 'Iconic Studio Pvt Ltd', brandSlug: 'iconic-studio' },
	{ name: '100X Longevity Pvt Ltd', brandSlug: '100x-longevity' }
];

for (const { name, brandSlug } of COMPANIES) {
	await companies.updateOne({ name }, { $set: { name, brandSlug, active: true } }, { upsert: true });
}
console.log('[seed] companies seeded');

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
