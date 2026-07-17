/**
 * Score OCR extraction against what candidates actually submitted.
 *
 * There is no labelled test set, so this uses the best ground truth available:
 * the values a candidate left in their record after reviewing the suggestions.
 * OCR is only ever a suggestion (see ocr.ts) — the candidate types and corrects —
 * so a disagreement between ocrJson and the final field is, in the common case,
 * OCR having been wrong and a human having fixed it.
 *
 * Read the caveats before trusting a number:
 *
 *  - Only submitted/approved candidates count. A half-filled record's blank
 *    field is not a correction, it is an absence, and scoring it as a miss
 *    would understate accuracy badly.
 *  - Ground truth is imperfect: a candidate who accepts a wrong suggestion
 *    without checking makes OCR look right. This measures agreement with the
 *    final record, which is a ceiling on true accuracy, not true accuracy.
 *  - Scored per document via ocrJson, NOT via candidate.ocrSuggestions —
 *    suggestions are merged across uploads (upload/+server.ts), so a name there
 *    cannot be attributed to the document it came from.
 *  - aadhaarNo is skipped: it is encrypted at rest, so there is no plaintext
 *    field to compare against.
 *
 * Comparison reuses the app's own matcher (shared/match.ts) so "correct" means
 * the same thing here as it does in verification — names via Jaro-Winkler bands
 * rather than exact string equality, which Indian names routinely defeat.
 *
 *   node --env-file=.env scripts/ocr-accuracy.mjs
 *   node --env-file=.env scripts/ocr-accuracy.mjs --doc-type pan   # one slot
 *   node --env-file=.env scripts/ocr-accuracy.mjs --show-misses    # list them
 */
import mongoose from 'mongoose';
import { matchField } from '../src/lib/shared/match.ts';

const args = process.argv.slice(2);
const only = args.includes('--doc-type') ? args[args.indexOf('--doc-type') + 1] : null;
const showMisses = args.includes('--show-misses');

/** ocrJson key -> candidate column, mirroring OCR_SCHEMAS.fieldMap in ocr.ts.
 *  Duplicated deliberately: this script must keep scoring historical rows the
 *  way they were extracted even after that map changes. */
const FIELD_MAP = {
	aadhaar_front: { full_name: 'fullName', date_of_birth: 'dob', gender: 'gender' },
	aadhaar_back: { full_address: 'presentAddress', pin_code: 'presentPin' },
	pan: { full_name: 'fullName', fathers_name: 'fatherName', date_of_birth: 'dob', pan_number: 'panNo' },
	bank_proof: {
		account_holder_name: 'bankAccountName',
		bank_name: 'bankName',
		account_number: 'accountNo',
		ifsc_code: 'ifsc',
		branch_name: 'branch'
	}
};

/** How each column should be compared — same kinds shared/match.ts uses. */
const KIND = {
	fullName: 'name', fatherName: 'name', bankAccountName: 'name', bankName: 'name',
	branch: 'name', presentAddress: 'name',
	dob: 'date', gender: 'gender',
	presentPin: 'digits', accountNo: 'digits',
	panNo: 'exact', ifsc: 'exact'
};

const uri = process.env.MONGODB_URI;
if (!uri) {
	console.error('MONGODB_URI is not set. Run: node --env-file=.env scripts/ocr-accuracy.mjs');
	process.exit(1);
}
if (only && !FIELD_MAP[only]) {
	console.error(`Unknown --doc-type "${only}". Scoreable: ${Object.keys(FIELD_MAP).join(', ')}`);
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
const db = mongoose.connection.db;

// Only candidates who finished: an in-progress record's empty field is an
// absence, not a correction, and would be scored as a miss.
const DONE = ['submitted', 'approved', 'complete'];
const candidates = await db.collection('candidates').find({ status: { $in: DONE } }).toArray();
const byId = new Map(candidates.map((c) => [String(c._id), c]));

const q = { ocrStatus: 'parsed', ocrJson: { $ne: null } };
if (only) q.docType = only;
const docs = await db.collection('documents').find(q).toArray();

const stats = new Map(); // "docType.field" -> {match, review, mismatch, blank}
const misses = [];

for (const doc of docs) {
	const map = FIELD_MAP[doc.docType];
	const cand = byId.get(String(doc.candidateId));
	if (!map || !cand || !doc.ocrJson) continue;

	for (const [jsonKey, column] of Object.entries(map)) {
		const found = String(doc.ocrJson[jsonKey] ?? '').trim();
		const expected = String(cand[column] ?? '').trim();
		// No ground truth to score against — the candidate left it blank too.
		if (!expected) continue;

		const key = `${doc.docType}.${column}`;
		if (!stats.has(key)) stats.set(key, { match: 0, review: 0, mismatch: 0, blank: 0 });
		const s = stats.get(key);

		if (!found) {
			// OCR returned "" where the candidate had a value: a miss, but a safe
			// one — it suggests nothing rather than suggesting something wrong.
			s.blank++;
			if (showMisses) misses.push({ key, verdict: 'blank', expected, found: '(none)' });
			continue;
		}

		const { verdict } = matchField(KIND[column] ?? 'exact', expected, found);
		if (verdict === 'match') s.match++;
		else if (verdict === 'review') s.review++;
		else {
			s.mismatch++;
			if (showMisses) misses.push({ key, verdict, expected, found });
		}
	}
}

if (!stats.size) {
	console.log('No scoreable documents found.');
	console.log(`(${candidates.length} finished candidates, ${docs.length} parsed docs with ocrJson)`);
	await mongoose.disconnect();
	process.exit(0);
}

console.log(`Scored ${docs.length} parsed documents from ${candidates.length} finished candidates.\n`);
console.log('field                              n   match  review  mism.  blank   acc%');
console.log('─'.repeat(76));

const rows = [...stats.entries()].sort((a, b) => a[0].localeCompare(b[0]));
let tot = { match: 0, review: 0, mismatch: 0, blank: 0 };
for (const [key, s] of rows) {
	const n = s.match + s.review + s.mismatch + s.blank;
	// "Accurate" = exact match only. review/blank are not wins: a review still
	// costs a human a look, which is the cost this is meant to measure.
	const acc = n ? Math.round((100 * s.match) / n) : 0;
	console.log(
		`${key.padEnd(32)}${String(n).padStart(4)}${String(s.match).padStart(7)}` +
			`${String(s.review).padStart(8)}${String(s.mismatch).padStart(7)}${String(s.blank).padStart(7)}` +
			`${String(acc).padStart(7)}`
	);
	for (const k of Object.keys(tot)) tot[k] += s[k];
}
const n = tot.match + tot.review + tot.mismatch + tot.blank;
console.log('─'.repeat(76));
console.log(
	`${'OVERALL'.padEnd(32)}${String(n).padStart(4)}${String(tot.match).padStart(7)}` +
		`${String(tot.review).padStart(8)}${String(tot.mismatch).padStart(7)}${String(tot.blank).padStart(7)}` +
		`${String(n ? Math.round((100 * tot.match) / n) : 0).padStart(7)}`
);

if (showMisses && misses.length) {
	console.log(`\n${misses.length} misses:\n`);
	for (const m of misses.slice(0, 60)) {
		console.log(`  ${m.key} [${m.verdict}]`);
		console.log(`    typed:     "${m.expected}"`);
		console.log(`    extracted: "${m.found}"`);
	}
	if (misses.length > 60) console.log(`  … and ${misses.length - 60} more`);
} else if (misses.length) {
	console.log(`\n${misses.length} mismatches — re-run with --show-misses to see them.`);
}

console.log('\nNote: this measures agreement with the final record, which is a');
console.log('ceiling on true accuracy — a candidate who accepted a wrong');
console.log('suggestion without checking counts here as a match.');

await mongoose.disconnect();
