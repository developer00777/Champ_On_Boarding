import type { LayoutServerLoad } from './$types';
import { levelsToday } from '$lib/server/access';

export const load: LayoutServerLoad = async ({ locals, cookies }) => {
	const theme = cookies.get('ae-theme') === 'light' ? 'light' : 'dark';
	// The nav links whose pages are given per person in Access & org follow the
	// same check the pages make, so a link is shown exactly when it would open.
	const lv = locals.admin ? await levelsToday(locals.admin, ['team.view', 'entity.view', 'bgv.view'] as const) : null;
	const nav = {
		team: !!lv && lv['team.view'] !== 'none',
		entities: !!lv && lv['entity.view'] !== 'none',
		bgv: !!lv && lv['bgv.view'] !== 'none'
	};
	return { admin: locals.admin, theme, nav };
};
