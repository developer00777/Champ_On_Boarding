import mongoose from 'mongoose';
import { env } from '$env/dynamic/private';

let connected = false;

const COMPANIES = [
	{ name: 'Champion Infratech Pvt Ltd',      brandSlug: 'champion-infratech',  aliases: ['Champion Infratech'] },
	{ name: 'Champions Club Pvt Ltd',           brandSlug: 'champions-club',       aliases: ['Champions Club'] },
	{ name: 'Cirrologix Technologies Pvt Ltd',  brandSlug: 'cirrologix',           aliases: ['Cirrologix'] },
	{ name: 'IP Momentum',                      brandSlug: 'ip-momentum',          aliases: [] },
	{ name: 'Champion Products Pvt Ltd',        brandSlug: 'champion-products',    aliases: ['Champion Products'] },
	{ name: 'Champion Infometrics Pvt Ltd',     brandSlug: 'champion-infometrics', aliases: ['Champion Infometrics'] },
	{ name: 'Champions Yacht Club Pvt',         brandSlug: 'champions-yacht-club', aliases: ['Champions Yacht Club'] },
];

async function seedCompanies() {
	const Company = mongoose.model('Company');
	for (const co of COMPANIES) {
		const existing = await Company.findOne({ name: { $in: [co.name, ...co.aliases] } });
		if (existing) {
			if (existing.name !== co.name || existing.brandSlug !== co.brandSlug) {
				await Company.findByIdAndUpdate(existing._id, { name: co.name, brandSlug: co.brandSlug, active: true });
			}
		} else {
			await Company.create({ name: co.name, brandSlug: co.brandSlug, active: true });
		}
	}
}

export async function connectDb() {
	if (connected || mongoose.connection.readyState === 1) return;
	await mongoose.connect(env.MONGODB_URI, {
		dbName: env.MONGODB_DB ?? 'champonboard',
		authSource: 'admin',
		serverSelectionTimeoutMS: 5000,
		connectTimeoutMS: 5000
	});
	connected = true;
	seedCompanies().catch((e) => console.error('[seed] companies failed:', e));
}

export { mongoose };
