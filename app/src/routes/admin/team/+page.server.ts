import { fail, redirect } from '@sveltejs/kit';
import { asc, eq, and, ne, count } from 'drizzle-orm';
import type { Actions, PageServerLoad } from './$types';
import { db, t } from '$lib/server/db';
import { hashPassword } from '$lib/server/auth';
import { randomToken } from '$lib/server/crypto';
import { audit } from '$lib/server/audit';

const ROLES = ['hr_admin', 'super_admin'] as const;
type Role = (typeof ROLES)[number];

// Only super admins may manage team logins (PRD §2 — least privilege).
function requireSuperAdmin(locals: App.Locals) {
	if (!locals.admin) redirect(303, '/admin/login');
	if (locals.admin.role !== 'super_admin') redirect(303, '/admin');
}

// Generate a readable temporary password when the admin doesn't supply one.
function generatePassword(): string {
	// ~13 chars, URL-safe, no ambiguous separators.
	return randomToken(9).replace(/[-_]/g, '');
}

export const load: PageServerLoad = async ({ locals }) => {
	requireSuperAdmin(locals);

	const admins = await db
		.select({
			id: t.admins.id,
			email: t.admins.email,
			role: t.admins.role,
			status: t.admins.status,
			createdAt: t.admins.createdAt
		})
		.from(t.admins)
		.orderBy(asc(t.admins.createdAt));

	return {
		admins: admins.map((a) => ({
			id: a.id,
			email: a.email,
			role: a.role,
			status: a.status,
			createdAt: a.createdAt.toISOString(),
			isSelf: a.id === locals.admin!.id
		}))
	};
};

export const actions: Actions = {
	createUser: async ({ request, locals, getClientAddress }) => {
		requireSuperAdmin(locals);
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim().toLowerCase();
		const role = String(form.get('role') ?? '') as Role;
		let password = String(form.get('password') ?? '');

		if (!email || !/^\S+@\S+\.\S+$/.test(email))
			return fail(400, { message: 'A valid email is required.' });
		if (!ROLES.includes(role)) return fail(400, { message: 'Pick a role.' });

		const [existing] = await db
			.select({ id: t.admins.id })
			.from(t.admins)
			.where(eq(t.admins.email, email));
		if (existing) return fail(409, { message: `A login already exists for ${email}.` });

		let generated = false;
		if (!password) {
			password = generatePassword();
			generated = true;
		} else if (password.length < 8) {
			return fail(400, { message: 'Password must be at least 8 characters.' });
		}

		const passwordHash = await hashPassword(password);
		await db.insert(t.admins).values({ email, role, passwordHash });

		await audit({
			actor: locals.admin!.email,
			action: 'admin_created',
			field: role,
			newValue: email,
			ip: getClientAddress()
		});

		return {
			created: true,
			email,
			role,
			// Show the password once so the super admin can hand it over.
			password: generated ? password : null
		};
	},

	setStatus: async ({ request, locals, getClientAddress }) => {
		requireSuperAdmin(locals);
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		const status = String(form.get('status') ?? '') as 'active' | 'disabled';
		if (!id || (status !== 'active' && status !== 'disabled'))
			return fail(400, { message: 'Bad request.' });

		if (id === locals.admin!.id)
			return fail(400, { message: 'You cannot disable your own login.' });

		// Never leave the system without an active super admin.
		if (status === 'disabled') {
			const [target] = await db.select().from(t.admins).where(eq(t.admins.id, id));
			if (!target) return fail(404, { message: 'Login not found.' });
			if (target.role === 'super_admin') {
				const [{ value: activeSupers }] = await db
					.select({ value: count() })
					.from(t.admins)
					.where(
						and(
							eq(t.admins.role, 'super_admin'),
							eq(t.admins.status, 'active'),
							ne(t.admins.id, id)
						)
					);
				if (activeSupers === 0)
					return fail(400, { message: 'Cannot disable the last active super admin.' });
			}
		}

		const [updated] = await db
			.update(t.admins)
			.set({ status })
			.where(eq(t.admins.id, id))
			.returning({ email: t.admins.email });
		if (!updated) return fail(404, { message: 'Login not found.' });

		// Disabling a login should also revoke its active sessions immediately.
		if (status === 'disabled') await db.delete(t.sessions).where(eq(t.sessions.adminId, id));

		await audit({
			actor: locals.admin!.email,
			action: status === 'disabled' ? 'admin_disabled' : 'admin_enabled',
			newValue: updated.email,
			ip: getClientAddress()
		});

		return { statusChanged: true, email: updated.email, status };
	},

	resetPassword: async ({ request, locals, getClientAddress }) => {
		requireSuperAdmin(locals);
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { message: 'Bad request.' });

		const [target] = await db
			.select({ email: t.admins.email })
			.from(t.admins)
			.where(eq(t.admins.id, id));
		if (!target) return fail(404, { message: 'Login not found.' });

		const password = generatePassword();
		await db
			.update(t.admins)
			.set({ passwordHash: await hashPassword(password) })
			.where(eq(t.admins.id, id));

		// Force re-login everywhere with the new password.
		await db.delete(t.sessions).where(eq(t.sessions.adminId, id));

		await audit({
			actor: locals.admin!.email,
			action: 'admin_password_reset',
			newValue: target.email,
			ip: getClientAddress()
		});

		return { passwordReset: true, email: target.email, password };
	}
};
