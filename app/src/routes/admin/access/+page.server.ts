// ACCESS & REPORTING STUDIO — /admin/access
//
// Three modes over one set of people: the org chart (not built yet), the
// permission matrix, and a simulator that shows a chosen person exactly what
// they would see and press.
//
// Super-admin only, and deliberately so: this is the page that decides who can
// use every other page.
//
// Nothing here is enforced yet. The guards across the app still read `role`;
// this authors the richer model beside it. The matrix says so on its face
// rather than implying an enforcement that is not there — see the header of
// lib/shared/access.ts.
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { Admin, AuditLog } from '$lib/server/db/schema';
import { audit } from '$lib/server/audit';
import { BRANDS } from '$lib/shared/brands';
import { TRACKS } from '$lib/shared/matrix';
import {
	CAPS,
	LEVELS,
	POPULATIONS,
	PRESETS,
	type Level,
	type Population
} from '$lib/shared/access';

function requireSuperAdmin(locals: App.Locals) {
	if (!locals.admin) redirect(303, '/admin/login');
	if (locals.admin.role !== 'super_admin') redirect(303, '/admin');
}

/** Grants are stored as a list because capability keys carry dots; the studio
 *  works in plain objects. These two functions are the only place that knows. */
function grantsToObject(rows: unknown): Record<string, Level> {
	const out: Record<string, Level> = {};
	if (!Array.isArray(rows)) return out;
	for (const r of rows) {
		const row = r as { cap?: string; level?: string };
		if (!row?.cap || !CAPS[row.cap]) continue;
		if (!LEVELS.includes(row.level as Level)) continue;
		out[row.cap] = row.level as Level;
	}
	return out;
}
function checkersToObject(rows: unknown): Record<string, boolean> {
	const out: Record<string, boolean> = {};
	if (!Array.isArray(rows)) return out;
	for (const cap of rows) if (typeof cap === 'string' && CAPS[cap]) out[cap] = true;
	return out;
}

/** 'all' is kept literally; anything else is filtered to values that still
 *  exist, so a deleted entity cannot leave a dangling slug in someone's scope. */
function scopeList(raw: unknown, valid: string[]): 'all' | string[] {
	if (raw === 'all' || raw === undefined || raw === null) return 'all';
	if (!Array.isArray(raw)) return 'all';
	const kept = raw.filter((v): v is string => typeof v === 'string' && valid.includes(v));
	return kept.length ? kept : 'all';
}

export const load: PageServerLoad = async ({ locals }) => {
	requireSuperAdmin(locals);

	const entitySlugs = BRANDS.map((b) => b.slug);
	const admins = await Admin.find({}).sort({ createdAt: 1 }).lean();

	// The studio's own audit entries, shown as "recent activity" beside the
	// pending changes — the same list, before and after applying.
	const recent = await AuditLog.find({ action: { $regex: '^access_' } })
		.sort({ createdAt: -1 })
		.limit(40)
		.lean();

	return {
		people: admins.map((a) => ({
			id: String(a._id),
			email: a.email,
			name: (a.name as string | null) ?? a.email.split('@')[0],
			title: (a.title as string | null) ?? '',
			preset: PRESETS[a.role] ? a.role : 'hr_admin',
			status: (a.status as 'active' | 'disabled') ?? 'active',
			grants: grantsToObject(a.grants),
			checkers: checkersToObject(a.checkers),
			population: (POPULATIONS.some((p) => p.k === a.population) ? a.population : 'entity') as Population,
			entities: scopeList(a.entities, entitySlugs),
			tracks: scopeList(a.tracks, TRACKS as unknown as string[]),
			reportsTo: a.reportsTo ? String(a.reportsTo) : null,
			accessExpiresAt: a.accessExpiresAt ? (a.accessExpiresAt as Date).toISOString().slice(0, 10) : null,
			isSelf: String(a._id) === locals.admin!.id
		})),
		entities: BRANDS.map((b) => ({ slug: b.slug, name: b.legalName || b.name })),
		tracks: TRACKS,
		recent: recent.map((r) => ({
			when: (r.createdAt as Date).toISOString(),
			who: r.actor as string,
			what: (r.newValue as string) ?? (r.action as string)
		}))
	};
};

/** One person's worth of changes, as the browser posts them. */
interface PersonPatch {
	id: string;
	preset: string;
	status: 'active' | 'disabled';
	population: Population;
	entities: 'all' | string[];
	tracks: 'all' | string[];
	reportsTo: string | null;
	accessExpiresAt: string | null;
	grants: Record<string, Level>;
	checkers: Record<string, boolean>;
}

export const actions: Actions = {
	// Everything the studio changed, applied in one go. A single action rather
	// than one per field because the reviewer approved a set of changes, and
	// applying half of them because the fifth was malformed would leave access
	// in a state nobody chose.
	applyAccess: async ({ request, locals, getClientAddress }) => {
		requireSuperAdmin(locals);
		const form = await request.formData();

		let patches: PersonPatch[];
		try {
			patches = JSON.parse(String(form.get('changes') ?? '[]'));
			if (!Array.isArray(patches)) throw new Error('not a list');
		} catch {
			return fail(400, { message: 'Could not read the changes.' });
		}
		if (!patches.length) return fail(400, { message: 'Nothing to apply.' });

		const admins = await Admin.find({}).lean();
		const byId = new Map(admins.map((a) => [String(a._id), a]));
		const entitySlugs = BRANDS.map((b) => b.slug);

		// Validate every patch before writing any of them.
		for (const p of patches) {
			const current = byId.get(p.id);
			if (!current) return fail(400, { message: 'That login no longer exists — reload and try again.' });
			if (!PRESETS[p.preset]) return fail(400, { message: `Unknown role preset "${p.preset}".` });
			if (p.reportsTo && !byId.has(p.reportsTo))
				return fail(400, { message: 'A reporting line points at a login that no longer exists.' });
			if (p.reportsTo === p.id) return fail(400, { message: 'Someone cannot report to themselves.' });
			// A super admin who removes their own super_admin preset locks
			// themselves — and possibly everyone — out of this page.
			if (p.id === locals.admin!.id && p.preset !== 'super_admin')
				return fail(400, { message: 'You cannot take super admin away from yourself. Ask another super admin.' });
			if (p.id === locals.admin!.id && p.status !== 'active')
				return fail(400, { message: 'You cannot disable your own login here.' });
		}

		// Cycles are checked against the whole proposed chart, not the saved one:
		// two moves that are each fine alone can still close a loop together.
		const proposedParent = new Map<string, string | null>(
			admins.map((a) => [String(a._id), a.reportsTo ? String(a.reportsTo) : null])
		);
		for (const p of patches) proposedParent.set(p.id, p.reportsTo);
		for (const id of proposedParent.keys()) {
			const seen = new Set<string>([id]);
			let cur = proposedParent.get(id) ?? null;
			while (cur) {
				if (seen.has(cur)) return fail(400, { message: 'That reporting line would loop back on itself.' });
				seen.add(cur);
				cur = proposedParent.get(cur) ?? null;
			}
		}

		let changed = 0;
		for (const p of patches) {
			const grants = Object.entries(p.grants ?? {})
				.filter(([cap, level]) => CAPS[cap] && LEVELS.includes(level))
				.map(([cap, level]) => ({ cap, level }));
			const checkers = Object.keys(p.checkers ?? {}).filter((cap) => CAPS[cap] && p.checkers[cap]);
			const expires = p.accessExpiresAt ? new Date(p.accessExpiresAt) : null;

			await Admin.findByIdAndUpdate(p.id, {
				$set: {
					role: p.preset,
					status: p.status === 'disabled' ? 'disabled' : 'active',
					grants,
					checkers,
					population: p.population,
					entities: scopeList(p.entities, entitySlugs),
					tracks: scopeList(p.tracks, TRACKS as unknown as string[]),
					reportsTo: p.reportsTo ?? null,
					accessExpiresAt: expires && !isNaN(expires.getTime()) ? expires : null
				}
			});

			const before = byId.get(p.id)!;
			await audit({
				actor: locals.admin!.email,
				action: 'access_updated',
				field: before.email,
				oldValue: `${before.role} · ${Array.isArray(before.grants) ? before.grants.length : 0} overrides`,
				newValue: `${PRESETS[p.preset].name} · ${grants.length} override${grants.length === 1 ? '' : 's'}${checkers.length ? ` · ${checkers.length} routed for sign-off` : ''}${p.status === 'disabled' ? ' · login disabled' : ''}`,
				ip: getClientAddress()
			});
			changed++;
		}

		return { applied: changed };
	}
};
