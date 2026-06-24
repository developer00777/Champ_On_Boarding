// Seed: group companies + the bootstrap super admin.
// Run: npm run db:seed  (idempotent — skips anything that already exists)
import mongoose from 'mongoose';
import { randomBytes } from 'node:crypto';
import { hash } from '@node-rs/argon2';

const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017';
const MONGODB_DB = process.env.MONGODB_DB ?? 'champonboard';

await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB });
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
	{ name: 'Cirrologix', brandSlug: 'cirrologix' }
];

for (const { name, brandSlug } of COMPANIES) {
	await companies.updateOne({ name }, { $set: { name, brandSlug, active: true } }, { upsert: true });
}
console.log('Companies seeded.');

const SUPER_ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'deep@championsmail.com';
const existing = await admins.findOne({ email: SUPER_ADMIN_EMAIL });

if (!existing) {
	const password = process.env.SEED_ADMIN_PASSWORD ?? randomBytes(9).toString('base64url');
	const passwordHash = await hash(password);
	await admins.insertOne({
		email: SUPER_ADMIN_EMAIL,
		passwordHash,
		role: 'super_admin',
		status: 'active',
		createdAt: new Date()
	});
	console.log(`Super admin created: ${SUPER_ADMIN_EMAIL}`);
	console.log(`Password: ${password}`);
	console.log('Store this password now — it is not shown again.');
} else {
	console.log(`Super admin already exists: ${SUPER_ADMIN_EMAIL}`);
}

await mongoose.disconnect();
