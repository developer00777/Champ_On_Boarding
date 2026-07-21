import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = ({ locals, cookies }) => {
	const theme = cookies.get('ae-theme') === 'light' ? 'light' : 'dark';
	return { admin: locals.admin, theme };
};
