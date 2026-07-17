/**
 * Re-encrypt stored Aadhaar numbers under a new ENCRYPTION_KEY.
 *
 * Aadhaar numbers are stored as AES-256-GCM under ENCRYPTION_KEY (crypto.ts).
 * The key is not a config value you can simply swap: every existing
 * aadhaarNoEncrypted was sealed with the old one, and changing the env var
 * alone makes every stored Aadhaar permanently unreadable. This walks the
 * records and re-seals each under the new key.
 *
 * GCM authenticates, so a wrong OLD key fails loudly on decrypt rather than
 * yielding plausible garbage. That is what makes this safe to verify: every
 * row is decrypted, re-encrypted, and then read back through the new key and
 * compared to the original plaintext BEFORE anything is written.
 *
 * Dry run (decrypts and verifies, writes nothing):
 *   OLD_ENCRYPTION_KEY=<64hex> NEW_ENCRYPTION_KEY=<64hex> \
 *     node --env-file=.env scripts/rotate-encryption-key.mjs
 *
 * Apply:
 *   ... same, plus --apply
 *
 * Afterwards set ENCRYPTION_KEY=<the new key> in the environment and redeploy.
 * Do it promptly: between the write and the redeploy the app is running with
 * the old key and cannot read the rows this just rewrote.
 *
 * Generate a new key with:  openssl rand -hex 32
 */
import mongoose from 'mongoose';
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const APPLY = process.argv.includes('--apply');
const OLD = process.env.OLD_ENCRYPTION_KEY;
const NEW = process.env.NEW_ENCRYPTION_KEY;

const bad = (k, name) => !k || !/^[0-9a-fA-F]{64}$/.test(k) ? `${name} must be 64 hex chars (32 bytes)` : null;
const problem = bad(OLD, 'OLD_ENCRYPTION_KEY') ?? bad(NEW, 'NEW_ENCRYPTION_KEY');
if (problem) {
	console.error(problem);
	console.error('\nUsage: OLD_ENCRYPTION_KEY=<64hex> NEW_ENCRYPTION_KEY=<64hex> \\');
	console.error('         node --env-file=.env scripts/rotate-encryption-key.mjs [--apply]');
	process.exit(1);
}
if (OLD.toLowerCase() === NEW.toLowerCase()) {
	console.error('OLD and NEW keys are identical — nothing to rotate.');
	process.exit(1);
}

// Mirrors crypto.ts exactly. Duplicated rather than imported because that module
// reads the key from $env at call time and can only hold one key at once.
const enc = (plain, keyHex) => {
	const iv = randomBytes(12);
	const c = createCipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), iv);
	const out = Buffer.concat([c.update(plain, 'utf8'), c.final()]);
	return `${iv.toString('base64url')}.${out.toString('base64url')}.${c.getAuthTag().toString('base64url')}`;
};
const dec = (payload, keyHex) => {
	const [iv, data, tag] = String(payload).split('.');
	const d = createDecipheriv('aes-256-gcm', Buffer.from(keyHex, 'hex'), Buffer.from(iv, 'base64url'));
	d.setAuthTag(Buffer.from(tag, 'base64url'));
	return Buffer.concat([d.update(Buffer.from(data, 'base64url')), d.final()]).toString('utf8');
};

const uri = process.env.MONGODB_URI;
if (!uri) {
	console.error('MONGODB_URI is not set.');
	process.exit(1);
}
try {
	await mongoose.connect(uri, {
		dbName: process.env.MONGODB_DB ?? 'champonboard',
		authSource: 'admin',
		serverSelectionTimeoutMS: 8000
	});
} catch (e) {
	console.error(`Could not reach MongoDB: ${e.message.split('\n')[0]}`);
	process.exit(1);
}
const col = mongoose.connection.db.collection('candidates');

const rows = await col.find({ aadhaarNoEncrypted: { $nin: [null, ''] } }, { projection: { aadhaarNoEncrypted: 1 } }).toArray();
console.log(APPLY ? '=== APPLYING ===' : '=== DRY RUN — nothing will be written ===');
console.log(`${rows.length} record(s) with an encrypted Aadhaar.\n`);

const planned = [];
const failed = [];

for (const r of rows) {
	try {
		const plain = dec(r.aadhaarNoEncrypted, OLD);
		const resealed = enc(plain, NEW);
		// Prove the new payload round-trips before considering it good. Without
		// this the script could cheerfully write rows nothing can ever decrypt.
		if (dec(resealed, NEW) !== plain) throw new Error('re-encrypted value failed to round-trip');
		planned.push({ _id: r._id, resealed });
	} catch (e) {
		// Almost always a wrong OLD key, or a row already rotated.
		failed.push({ _id: r._id, reason: e.message.split('\n')[0] });
	}
}

console.log(`  ${planned.length} decrypt + re-encrypt + verify OK`);
if (failed.length) {
	console.log(`  ${failed.length} FAILED:`);
	for (const f of failed.slice(0, 10)) console.log(`    ${f._id}: ${f.reason}`);
	if (failed.length > 10) console.log(`    … and ${failed.length - 10} more`);
}

// All-or-nothing: a partial rotation leaves the collection split across two
// keys, and no single ENCRYPTION_KEY can then read all of it.
if (failed.length) {
	console.log('\nRefusing to write: some rows could not be re-encrypted.');
	console.log('Check OLD_ENCRYPTION_KEY is the key the data was written with.');
	await mongoose.disconnect();
	process.exit(1);
}

if (!APPLY) {
	console.log(`\nAll ${planned.length} verified. Re-run with --apply to write.`);
	console.log('Then set ENCRYPTION_KEY to the new key and redeploy.');
	await mongoose.disconnect();
	process.exit(0);
}

let written = 0;
for (const p of planned) {
	await col.updateOne({ _id: p._id }, { $set: { aadhaarNoEncrypted: p.resealed } });
	written++;
}
console.log(`\nRewrote ${written} record(s).`);
console.log('NOW set ENCRYPTION_KEY to the new key and redeploy — until you do,');
console.log('the running app is on the old key and cannot read these rows.');

await mongoose.disconnect();
