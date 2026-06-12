import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db, t } from '$lib/server/db';
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

		const [admin] = await db.select().from(t.admins).where(eq(t.admins.email, email));
		const ok = admin && admin.status === 'active' && (await verifyPassword(admin.passwordHash, password));
		if (!ok) {
			await audit({ actor: email, action: 'login_failed', ip: getClientAddress() });
			return fail(401, { message: 'Invalid email or password.' });
		}

		await createSession(cookies, admin.id);
		await audit({ actor: admin.email, action: 'login', ip: getClientAddress() });
		redirect(303, '/admin');
	}
};
