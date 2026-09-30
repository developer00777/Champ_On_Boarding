import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { Admin } from '$lib/server/db/schema';
import { verifyPassword, createSession } from '$lib/server/auth';
import { audit } from '$lib/server/audit';
import { rateLimited } from '$lib/server/rate-limit';

export const load: PageServerLoad = ({ locals }) => {
	if (locals.admin) redirect(303, '/admin');
};

export const actions: Actions = {
	default: async ({ request, cookies, getClientAddress }) => {
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim().toLowerCase();
		const password = String(form.get('password') ?? '');
		if (!email || !password) return fail(400, { message: 'Email and password are required.' });

		// Two budgets. The whole HR team logs in from one office IP, so an IP-only
		// limit of 10 a minute let a few colleagues signing in at once lock each
		// other out. Guessing is capped per account; the IP cap only stops a
		// sweep across many accounts.
		let ip = '';
		try {
			ip = getClientAddress();
		} catch {
			// Unknown IP — the per-account budget still applies.
		}
		if (
			(await rateLimited(`login:${ip}:${email}`, 10, 60)) ||
			(await rateLimited(`login:${ip}`, 60, 60))
		) {
			return fail(429, { message: 'Too many attempts, try again in a minute.' });
		}

		try {
			const admin = await Admin.findOne({ email }).lean();

			if (!admin || admin.status !== 'active') {
				await audit({ actor: email, action: 'login_failed', ip: getClientAddress() });
				return fail(401, { message: 'Invalid email or password.' });
			}

			const ok = await verifyPassword(admin.passwordHash, password);

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
