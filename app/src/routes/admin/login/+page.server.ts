import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { Admin } from '$lib/server/db/schema';
import { verifyPassword, createSession } from '$lib/server/auth';
import { audit } from '$lib/server/audit';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.admin) redirect(303, '/admin');
};

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim().toLowerCase();
		const password = String(form.get('password') ?? '');
		if (!email || !password) return fail(400, { message: 'Email and password are required.' });

		try {
			const admin = await Admin.findOne({ email }).lean();
			console.log('[login] admin lookup:', email, 'found:', !!admin, 'status:', admin?.status);

			if (!admin || admin.status !== 'active') {
				await audit({ actor: email, action: 'login_failed', ip: getClientAddress() });
				return fail(401, { message: 'Invalid email or password.' });
			}

			const ok = await verifyPassword(admin.passwordHash, password);
			console.log('[login] password verify:', ok);

			if (!ok) {
				await audit({ actor: email, action: 'login_failed', ip: getClientAddress() });
				return fail(401, { message: 'Invalid email or password.' });
			}

			await createSession(cookies, String(admin._id));
			await audit({ actor: admin.email, action: 'login', ip: getClientAddress() });
		} catch (e) {
			console.error('[login] error:', e);
			return fail(500, { message: 'Server error — check logs.' });
		}

		redirect(303, '/admin');
	}
};
