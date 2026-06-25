// Upserts all 7 Champion Group companies with correct full legal names and brand slugs.
// Safe to run multiple times. Renames short-name duplicates to the full legal name.
// Usage: MONGODB_URI=<uri> MONGODB_DB=champonboard node scripts/seed-companies.mjs

import mongoose from 'mongoose';

const { MONGODB_URI, MONGODB_DB = 'champonboard' } = process.env;
if (!MONGODB_URI) { console.error('MONGODB_URI required'); process.exit(1); }

const Company = mongoose.model('Company', new mongoose.Schema({
	name: { type: String, required: true, unique: true },
	brandSlug: { type: String, default: null },
	active: { type: Boolean, default: true }
}, { timestamps: true }));

// Each entry: final name, brand slug, and any old short names already in the DB to rename
const COMPANIES = [
	{
		name: 'Champion Infratech Pvt Ltd',
		brandSlug: 'champion-infratech',
		aliases: ['Champion Infratech']
	},
	{
		name: 'Champions Club Pvt Ltd',
		brandSlug: 'champions-club',
		aliases: ['Champions Club']
	},
	{
		name: 'Cirrologix Technologies Pvt Ltd',
		brandSlug: 'cirrologix',
		aliases: ['Cirrologix']
	},
	{
		name: 'IP Momentum',
		brandSlug: 'ip-momentum',
		aliases: []
	},
	{
		name: 'Champion Products Pvt Ltd',
		brandSlug: 'champion-products',
		aliases: ['Champion Products']
	},
	{
		name: 'Champion Infometrics Pvt Ltd',
		brandSlug: 'champion-infometrics',
		aliases: ['Champion Infometrics']
	},
	{
		name: 'Champions Yacht Club Pvt',
		brandSlug: 'champions-yacht-club',
		aliases: ['Champions Yacht Club']
	},
];

await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB, authSource: 'admin' });

for (const co of COMPANIES) {
	// Try to find by final name or any alias
	const existing = await Company.findOne({ name: { $in: [co.name, ...co.aliases] } });

	if (existing) {
		// Update to final name + correct brand slug
		existing.name = co.name;
		existing.brandSlug = co.brandSlug;
		existing.active = true;
		await existing.save();
		console.log(`Updated : ${co.name} (${co.brandSlug})`);
	} else {
		await Company.create({ name: co.name, brandSlug: co.brandSlug, active: true });
		console.log(`Created : ${co.name} (${co.brandSlug})`);
	}
}

await mongoose.disconnect();
console.log('Done.');
