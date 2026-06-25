// Run once against production to ensure all 7 companies exist with correct brand slugs.
// Usage: MONGODB_URI=<uri> MONGODB_DB=champonboard node scripts/seed-companies.mjs

import mongoose from 'mongoose';

const { MONGODB_URI, MONGODB_DB = 'champonboard' } = process.env;
if (!MONGODB_URI) { console.error('MONGODB_URI required'); process.exit(1); }

const Company = mongoose.model('Company', new mongoose.Schema({
	name: { type: String, required: true, unique: true },
	brandSlug: { type: String, default: null },
	active: { type: Boolean, default: true }
}, { timestamps: true }));

const COMPANIES = [
	{ name: 'Champion Infratech Pvt Ltd',       brandSlug: 'champion-infratech'   },
	{ name: 'Champions Club Pvt Ltd',            brandSlug: 'champions-club'        },
	{ name: 'Cirrologix Technologies Pvt Ltd',   brandSlug: 'cirrologix'            },
	{ name: 'IP Momentum',                       brandSlug: 'ip-momentum'           },
	{ name: 'Champion Products Pvt Ltd',         brandSlug: 'champion-products'     },
	{ name: 'Champion Infometrics Pvt Ltd',      brandSlug: 'champion-infometrics'  },
	{ name: 'Champions Yacht Club Pvt',          brandSlug: 'champions-yacht-club'  },
];

await mongoose.connect(MONGODB_URI, { dbName: MONGODB_DB, authSource: 'admin' });

for (const co of COMPANIES) {
	const result = await Company.findOneAndUpdate(
		{ name: co.name },
		{ $setOnInsert: { name: co.name, brandSlug: co.brandSlug, active: true } },
		{ upsert: true, new: true }
	);
	console.log(`${result.wasNew !== false ? 'Created' : 'Exists '}: ${co.name} (${co.brandSlug})`);
}

await mongoose.disconnect();
console.log('Done.');
