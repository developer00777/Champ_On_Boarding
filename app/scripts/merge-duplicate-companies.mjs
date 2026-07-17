/**
 * Merge duplicate company rows onto one canonical row per brandSlug.
 *
 * Historically seedCompanies() matched a company by name-or-alias with findOne()
 * and renamed just that row. When a second row for the same entity already
 * existed, it was left behind without a brandSlug — and since the document
 * matrix (ENTITY_DOC_OVERRIDES in shared/matrix.ts) keys on brandSlug, every
 * candidate sitting on a stranded row silently got the wrong document rules.
 * The seed no longer does this, but rows created before the fix need repairing.
 *
 * The canonical row is the "… Pvt Ltd" name where the entity has one, matching
 * how the entities are named on paper. Candidates (and anything else pointing at
 * companyId) are repointed onto it, and only then is the empty duplicate removed.
 * Nothing is deleted while it still has records attached.
 *
 * Dry run by default — prints the plan and writes nothing:
 *   node --env-file=.env scripts/merge-duplicate-companies.mjs
 * Apply it for real:
 *   node --env-file=.env scripts/merge-duplicate-companies.mjs --apply
 */
import mongoose from 'mongoose';

const APPLY = process.argv.includes('--apply');

/** Collections holding a companyId that must follow the merge.
 *  Only Candidate carries companyId today (see db/schema.ts); everything else
 *  reaches a company through candidateId. Add to this list if that changes. */
const REFERRING = ['candidates'];

const uri = process.env.MONGODB_URI;
if (!uri) {
	console.error('MONGODB_URI is not set. Run with: node --env-file=.env scripts/merge-duplicate-companies.mjs');
	process.exit(1);
}

await mongoose.connect(uri, {
	dbName: process.env.MONGODB_DB ?? 'champonboard',
	authSource: 'admin',
	serverSelectionTimeoutMS: 5000
});
const db = mongoose.connection.db;

const companies = await db.collection('companies').find({}).toArray();

/** Rows with no brandSlug can't be grouped; report them rather than guess. */
const stranded = companies.filter((c) => !c.brandSlug);
const groups = new Map();
for (const c of companies.filter((c) => c.brandSlug)) {
	if (!groups.has(c.brandSlug)) groups.set(c.brandSlug, []);
	groups.get(c.brandSlug).push(c);
}

async function refCounts(id) {
	const counts = {};
	for (const coll of REFERRING) {
		const existing = await db.listCollections({ name: coll }).toArray();
		if (!existing.length) continue;
		const n = await db.collection(coll).countDocuments({ companyId: id });
		if (n) counts[coll] = n;
	}
	return counts;
}

console.log(APPLY ? '=== APPLYING ===\n' : '=== DRY RUN — nothing will be written ===\n');

let merges = 0;

for (const [slug, rows] of groups) {
	if (rows.length < 2) continue;
	merges++;

	// Prefer the "Pvt Ltd" name; fall back to the oldest row so the choice is
	// deterministic rather than dependent on collection order.
	const survivor =
		rows.find((r) => /\bpvt\b/i.test(r.name)) ??
		[...rows].sort((a, b) => String(a._id).localeCompare(String(b._id)))[0];
	const losers = rows.filter((r) => String(r._id) !== String(survivor._id));

	console.log(`${slug}`);
	console.log(`  keep   "${survivor.name}"  (${survivor._id})`);

	for (const loser of losers) {
		const counts = await refCounts(loser._id);
		const summary = Object.entries(counts).map(([k, v]) => `${v} ${k}`).join(', ') || 'no records';
		console.log(`  merge  "${loser.name}"  (${loser._id}) — ${summary}`);

		if (!APPLY) continue;

		for (const coll of Object.keys(counts)) {
			const res = await db.collection(coll).updateMany({ companyId: loser._id }, { $set: { companyId: survivor._id } });
			console.log(`         moved ${res.modifiedCount} ${coll}`);
		}

		// Re-check rather than trusting the counts above: if anything still points
		// here, leave the row alone so the records stay reachable.
		const left = await refCounts(loser._id);
		if (Object.keys(left).length) {
			console.log(`         SKIP delete — still referenced: ${JSON.stringify(left)}`);
			continue;
		}
		// Carry over a logo the survivor lacks before dropping the row.
		if (loser.logoBase64 && !survivor.logoBase64) {
			await db.collection('companies').updateOne({ _id: survivor._id }, { $set: { logoBase64: loser.logoBase64 } });
			console.log('         carried logo over to the surviving row');
		}
		await db.collection('companies').deleteOne({ _id: loser._id });
		console.log('         deleted duplicate row');
	}

	if (APPLY && survivor.brandSlug !== slug) {
		await db.collection('companies').updateOne({ _id: survivor._id }, { $set: { brandSlug: slug, active: true } });
	}
	console.log('');
}

if (stranded.length) {
	console.log('Rows with no brandSlug (not touched — set one in the admin UI or seed list):');
	for (const s of stranded) console.log(`  "${s.name}" (${s._id})`);
	console.log('');
}

if (!merges) console.log('No duplicate brandSlug groups found.\n');
else if (!APPLY) console.log(`${merges} group(s) would be merged. Re-run with --apply to write.\n`);

await mongoose.disconnect();
