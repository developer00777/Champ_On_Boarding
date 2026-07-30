// Office/VPN egress IPs allowed to reach the /admin panel. Candidate-facing
// routes (/c/[token], /webhooks/*) are never gated by this — candidates fill
// in onboarding forms from home, and Resend's webhook servers aren't office
// IPs either. See hooks.server.ts for where this is enforced.
//
// Source: IT-provided list, 2026-07-30 (office ISPs + VPN egress ranges).
// Update this file (not the env var) when IT sends a revised list.

interface AllowEntry {
	label: string;
	cidr: string; // "a.b.c.d/32" for a single host, or a real CIDR block
}

const ALLOWLIST: AllowEntry[] = [
	// CLOUD ISP — individual egress IPs (NAT pool), no stated subnet
	{ label: 'CLOUD ISP', cidr: '190.92.198.57/32' },
	{ label: 'CLOUD ISP', cidr: '49.0.205.220/32' },
	{ label: 'CLOUD ISP', cidr: '159.138.107.202/32' },
	{ label: 'CLOUD ISP', cidr: '119.8.170.37/32' },
	{ label: 'CLOUD ISP', cidr: '119.8.165.6/32' },
	{ label: 'CLOUD ISP', cidr: '159.138.106.128/32' },
	{ label: 'CLOUD ISP', cidr: '114.119.172.181/32' },
	{ label: 'CLOUD ISP', cidr: '159.138.90.112/32' },
	{ label: 'CLOUD ISP', cidr: '94.74.82.243/32' },
	{ label: 'CLOUD ISP', cidr: '119.8.160.197/32' },

	// AIRTEL ISP JST — two small ranges
	{ label: 'AIRTEL ISP JST', cidr: '182.72.210.5/32' },
	{ label: 'AIRTEL ISP JST', cidr: '182.72.210.6/32' },
	// 182.75.51.225-255 given explicitly (not the full .224/27 block — .224 itself was not listed)
	{ label: 'AIRTEL ISP JST', cidr: '182.75.51.225/32' },
	{ label: 'AIRTEL ISP JST', cidr: '182.75.51.226/31' },
	{ label: 'AIRTEL ISP JST', cidr: '182.75.51.228/30' },
	{ label: 'AIRTEL ISP JST', cidr: '182.75.51.232/29' },
	{ label: 'AIRTEL ISP JST', cidr: '182.75.51.240/28' },

	// TATA ISP JST / TATA TDS — same two /24s given under both labels
	{ label: 'TATA (JST/TDS)', cidr: '103.170.162.0/24' },
	{ label: 'TATA (JST/TDS)', cidr: '103.170.163.0/24' },

	// AIRTEL TDS — 182.78.39.1-255
	{ label: 'AIRTEL TDS', cidr: '182.78.39.0/24' }
];

function ipToInt(ip: string): number | null {
	const parts = ip.split('.');
	if (parts.length !== 4) return null;
	let n = 0;
	for (const p of parts) {
		const v = Number(p);
		if (!Number.isInteger(v) || v < 0 || v > 255) return null;
		n = (n << 8) | v;
	}
	return n >>> 0;
}

function inCidr(ip: number, cidr: string): boolean {
	const [base, bitsStr] = cidr.split('/');
	const baseInt = ipToInt(base);
	const bits = Number(bitsStr);
	if (baseInt === null || !Number.isInteger(bits)) return false;
	if (bits === 0) return true;
	const mask = bits === 32 ? 0xffffffff : (~0 << (32 - bits)) >>> 0;
	return (ip & mask) === (baseInt & mask);
}

/** True if `ip` (client IPv4 address, e.g. from getClientAddress()) matches
 *  an allowlisted office/VPN entry. Unparseable input (e.g. an IPv6 address,
 *  which none of the provided ranges cover) is denied. */
export function isAllowedAdminIp(ip: string): boolean {
	const n = ipToInt(ip.trim());
	if (n === null) return false;
	return ALLOWLIST.some((entry) => inCidr(n, entry.cidr));
}
