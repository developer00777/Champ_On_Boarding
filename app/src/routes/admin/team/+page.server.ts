import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { Admin } from '$lib/server/db/schema';
import { hashPassword } from '$lib/server/auth';
import { randomToken } from '$lib/server/crypto';
import { audit } from '$lib/server/audit';
import { getRedis } from '$lib/server/redis';

const ROLES = ['hr_admin', 'super_admin', 'finance_team'] as const;
type Role = (typeof ROLES)[number];

function requireSuperAdmin(locals: App.Locals) {
	if (!locals.admin) redirect(303, '/admin/login');
	if (locals.admin.role !== 'super_admin') redirect(303, '/admin');
}

function generatePassword(): string {
	return randomToken(9).replace(/[-_]/g, '');
}

export const load: PageServerLoad = async ({ locals }) => {
	requireSuperAdmin(locals);

	const admins = await Admin.find({}).sort({ createdAt: 1 }).lean();

	return {
		admins: admins.map((a) => ({
			id: String(a._id),
			email: a.email,
			role: a.role,
			status: a.status,
			createdAt: (a.createdAt as Date).toISOString(),
			isSelf: String(a._id) === locals.admin!.id
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

		const existing = await Admin.findOne({ email }).lean();
		if (existing) return fail(409, { message: `A login already exists for ${email}.` });

		let generated = false;
		if (!password) {
			password = generatePassword();
			generated = true;
		} else if (password.length < 8) {
			return fail(400, { message: 'Password must be at least 8 characters.' });
		}

		const passwordHash = await hashPassword(password);
		await Admin.create({ email, role, passwordHash });

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

		if (status === 'disabled') {
			const target = await Admin.findById(id).lean();
			if (!target) return fail(404, { message: 'Login not found.' });
			if (target.role === 'super_admin') {
				const activeSupers = await Admin.countDocuments({
					role: 'super_admin',
					status: 'active',
					_id: { $ne: id }
				});
				if (activeSupers === 0)
					return fail(400, { message: 'Cannot disable the last active super admin.' });
			}
		}

		const updated = await Admin.findByIdAndUpdate(id, { status }, { new: true }).lean();
		if (!updated) return fail(404, { message: 'Login not found.' });

		if (status === 'disabled') {
			// Revoke all active sessions for this admin from Redis
			const redis = getRedis();
			const pattern = `session:*`;
			let cursor = '0';
			do {
				const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
				cursor = next;
				for (const key of keys) {
					const val = await redis.get(key);
					if (val === id) await redis.del(key);
				}
			} while (cursor !== '0');
		}

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

		const target = await Admin.findById(id).lean();
		if (!target) return fail(404, { message: 'Login not found.' });

		const password = generatePassword();
		await Admin.findByIdAndUpdate(id, { passwordHash: await hashPassword(password) });

		// Force re-login everywhere
		const redis = getRedis();
		const pattern = `session:*`;
		let cursor = '0';
		do {
			const [next, keys] = await redis.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
			cursor = next;
			for (const key of keys) {
				const val = await redis.get(key);
				if (val === id) await redis.del(key);
			}
		} while (cursor !== '0');

		await audit({
			actor: locals.admin!.email,
			action: 'admin_password_reset',
			newValue: target.email,
			ip: getClientAddress()
		});

		return { passwordReset: true, email: target.email, password };
	}
};
