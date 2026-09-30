// The server side of levelToday: reads the login's own grants, so a guard can
// ask "may this person do this right now" of a capability the app enforces.
import { Admin } from '$lib/server/db/schema';
import { levelIndex, levelToday, type Level } from '$lib/shared/access';

/** Today's level on each of `caps` for a signed-in admin, from one read. */
export async function levelsToday<C extends string>(
	admin: { id: string; role: string },
	caps: readonly C[]
): Promise<Record<C, Level>> {
	const doc = await Admin.findById(admin.id).select('role grants accessExpiresAt').lean();
	// The session's role, not the document's, is what the rest of this request
	// is judged by; the document supplies only the grants.
	const login = { role: admin.role, grants: doc?.grants, accessExpiresAt: (doc?.accessExpiresAt as Date | null) ?? null };
	return Object.fromEntries(caps.map((c) => [c, levelToday(login, c)])) as Record<C, Level>;
}

export async function mayToday(admin: { id: string; role: string } | null, cap: string, min: Level): Promise<boolean> {
	if (!admin) return false;
	const { [cap]: level } = await levelsToday(admin, [cap]);
	return levelIndex(level) >= levelIndex(min);
}
