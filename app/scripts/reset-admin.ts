// One-shot admin password reset. Run from Railway console:
// node scripts/reset-admin.ts
import mongoose from 'mongoose';
import { hash } from '@node-rs/argon2';

const MONGODB_URI = process.env.MONGODB_URI ?? 'mongodb://localhost:27017';
const MONGODB_DB = process.env.MONGODB_DB ?? 'champonboard';
const EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'deep@championsmail.com';
const PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'champ-admin-2026';

console.log(`Connecting to MongoDB...`);
await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB });
const admins = mongoose.connection.db!.collection('admins');

const passwordHash = await hash(PASSWORD);

const result = await admins.findOneAndUpdate(
	{ email: EMAIL },
	{ $set: { passwordHash, role: 'super_admin', status: 'active' } },
	{ upsert: true, returnDocument: 'after' }
);

console.log(`Done. Admin record:`);
console.log(`  email:  ${result?.email}`);
console.log(`  role:   ${result?.role}`);
console.log(`  status: ${result?.status}`);
console.log(`  _id:    ${result?._id}`);
console.log(`Password set to: ${PASSWORD}`);

await mongoose.disconnect();
