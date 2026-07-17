import mongoose from 'mongoose';
import { env } from '$env/dynamic/private';

let connected = false;

const COMPANIES = [
	{ name: 'Champion Infratech Pvt Ltd',      brandSlug: 'champion-infratech',  aliases: ['Champion Infratech'] },
	{ name: 'Champions Club Pvt Ltd',           brandSlug: 'champions-club',       aliases: ['Champions Club'] },
	{ name: 'Cirrologix Technologies Pvt Ltd',  brandSlug: 'cirrologix',           aliases: ['Cirrologix'] },
	{ name: 'IP Momentum Pvt Ltd',              brandSlug: 'ip-momentum',          aliases: ['IP Momentum'] },
	{ name: 'Champion Products Pvt Ltd',        brandSlug: 'champion-products',    aliases: ['Champion Products'] },
	{ name: 'Champion Infometrics Pvt Ltd',     brandSlug: 'champion-infometrics', aliases: ['Champion Infometrics'] },
	{ name: 'Champions Yacht Club Pvt Ltd',     brandSlug: 'champions-yacht-club', aliases: ['Champions Yacht Club', 'Champions Yacht Club Pvt'] },
	{ name: 'Champion LandZone Pvt Ltd',        brandSlug: 'champion-landzone',    aliases: ['Landzone', 'LandZone', 'Champion LandZone'] },
	{ name: 'Champions Luxury Resorts Pvt Ltd', brandSlug: 'champions-luxury-resorts', aliases: ['Champion Luxury Resorts', 'Champions Luxury Resorts'] },
];

async function seedCompanies() {
	const Company = mongoose.model('Company');
	for (const co of COMPANIES) {
		// Match on brandSlug as well as the names: a row already carrying the slug
		// is this entity even if someone has since edited its name in the admin UI.
		const rows = await Company.find({
			$or: [{ name: { $in: [co.name, ...co.aliases] } }, { brandSlug: co.brandSlug }]
		}).sort({ _id: 1 });

		if (rows.length === 0) {
			await Company.create({ name: co.name, brandSlug: co.brandSlug, active: true });
			continue;
		}

		// Repair brandSlug on every match, not just the first. Renaming only one
		// left the others stranded without a slug, which is what the doc matrix
		// keys on, so candidates on a stranded row silently got the wrong rules.
		//
		// The name is only claimed if no other row holds it — `name` is unique, so
		// renaming a duplicate onto the canonical name throws and takes boot down.
		// Duplicates are merged by scripts/merge-duplicate-companies.mjs, not here:
		// moving candidate records is not something a boot-time seed should do.
		const canonical = rows.find((r) => r.name === co.name) ?? rows[0];
		for (const row of rows) {
			const patch: Record<string, unknown> = { brandSlug: co.brandSlug, active: true };
			if (String(row._id) === String(canonical._id) && row.name !== co.name) patch.name = co.name;
			await Company.findByIdAndUpdate(row._id, patch);
		}
	}
}

export async function connectDb() {
	if (connected || mongoose.connection.readyState === 1) return;
	const uri = env.MONGODB_URI;
	if (!uri) throw new Error('MONGODB_URI is not set');
	await mongoose.connect(uri, {
		dbName: env.MONGODB_DB ?? 'champonboard',
		authSource: 'admin',
		serverSelectionTimeoutMS: 5000,
		connectTimeoutMS: 5000
	});
	connected = true;
	seedCompanies().catch((e) => console.error('[seed] companies failed:', e));
}

export { mongoose };
