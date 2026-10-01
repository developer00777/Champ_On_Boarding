// The server side of levelToday: reads the login's own grants, so a guard can
// ask "may this person do this right now" of a capability the app enforces.
import { Admin } from '$lib/server/db/schema';
import { CAPS, LEVEL_LABEL, levelIndex, levelToday, type Level } from '$lib/shared/access';

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

/** The refusal for a guard, or null when this login may go ahead. Phrased
 *  for the person refused: which row to ask for and at what level, so the
 *  message is also the instruction. Callers wrap it in their own fail()/error()
 *  shape. */
export async function lacking(
	admin: { id: string; role: string } | null,
	cap: string,
	min: Level = 'act'
): Promise<string | null> {
	if (!admin) return 'Not signed in.';
	if (await mayToday(admin, cap, min)) return null;
	return `You need ${LEVEL_LABEL[min]} on “${CAPS[cap]?.label ?? cap}” in Access & org. A super admin can give it to you there.`;
}
