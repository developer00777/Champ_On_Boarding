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

/** Drop every live session for one admin.
 *
 *  Sessions are keyed by a hash of the token, not by admin, so there is no
 *  index to look them up by — the only way is to scan. Written out inline twice
 *  already; deletion needs it a third time, and a login that is gone must not
 *  keep a working session behind it. */
async function revokeSessions(adminId: string) {
	const redis = getRedis();
	let cursor = '0';
	do {
		const [next, keys] = await redis.scan(cursor, 'MATCH', 'session:*', 'COUNT', 100);
		cursor = next;
		for (const key of keys) {
			if ((await redis.get(key)) === adminId) await redis.del(key);
		}
	} while (cursor !== '0');
}

/** A password a super admin typed. Blank means "generate one instead", which is
 *  the default both at creation and on reset. */
function readChosenPassword(form: FormData): { ok: true; password: string | null } | { ok: false; message: string } {
	const raw = String(form.get('password') ?? '');
	if (!raw) return { ok: true, password: null };
	if (raw.length < 8) return { ok: false, message: 'Password must be at least 8 characters.' };
	if (raw.length > 200) return { ok: false, message: 'That password is too long.' };
	// Trailing whitespace in a password nobody can see is a support call waiting
	// to happen: it pastes, it does not type, and the mismatch is invisible.
	if (raw !== raw.trim()) return { ok: false, message: 'Password cannot start or end with a space.' };
	return { ok: true, password: raw };
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

		const chosen = readChosenPassword(form);
		if (!chosen.ok) return fail(400, { message: chosen.message });
		const generated = !chosen.password;
		password = chosen.password ?? generatePassword();

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

	/** Remove a login for good.
	 *
	 *  Disabling keeps the row and blocks sign-in, which is the right default and
	 *  stays the first thing offered. This is for the case disabling does not
	 *  cover: a login created by mistake, a duplicate, a contractor whose record
	 *  should not sit in the list for years.
	 *
	 *  What this does NOT delete is the history. Audit entries store the actor as
	 *  an email string rather than a reference, so everything this person ever did
	 *  survives them — which is the point of an audit log, and the reason deleting
	 *  a login is safe to offer at all. Records that point at the admin row by id
	 *  (who approved, who sent, who uploaded) are left dangling deliberately and
	 *  already read as "a login since removed" wherever they are shown. */
	deleteUser: async ({ request, locals, getClientAddress }) => {
		requireSuperAdmin(locals);
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { message: 'Bad request.' });

		if (id === locals.admin!.id)
			return fail(400, { message: 'You cannot delete your own login.' });

		const target = await Admin.findById(id).lean();
		if (!target) return fail(404, { message: 'Login not found.' });

		// The same rule disabling enforces: never leave the portal with no way in.
		// Counted across active super admins other than this one, so deleting a
		// disabled super admin is fine and deleting the last working one is not.
		if (target.role === 'super_admin') {
			const otherActiveSupers = await Admin.countDocuments({
				role: 'super_admin',
				status: 'active',
				_id: { $ne: id }
			});
			if (otherActiveSupers === 0)
				return fail(400, { message: 'Cannot delete the last active super admin.' });
		}

		// Typed back by the person doing it. A confirm dialog is muscle memory;
		// an email address is not, and this cannot be undone.
		const typed = String(form.get('confirmEmail') ?? '').trim().toLowerCase();
		if (typed !== String(target.email).toLowerCase())
			return fail(400, { message: 'Type the exact email address to confirm the deletion.' });

		await revokeSessions(id);
		await Admin.findByIdAndDelete(id);

		// Written after the row is gone, naming the email, because there is no
		// longer an id worth recording.
		await audit({
			actor: locals.admin!.email,
			action: 'admin_deleted',
			field: String(target.role),
			oldValue: String(target.email),
			newValue: null,
			ip: getClientAddress()
		});

		return { deleted: true, email: target.email };
	},

	resetPassword: async ({ request, locals, getClientAddress }) => {
		requireSuperAdmin(locals);
		const form = await request.formData();
		const id = String(form.get('id') ?? '');
		if (!id) return fail(400, { message: 'Bad request.' });

		const target = await Admin.findById(id).lean();
		if (!target) return fail(404, { message: 'Login not found.' });

		// A typed password, or a generated one when the box is left blank. Set by
		// hand it is handed over in person or over a channel the super admin
		// chooses; generated it is shown once here and never again.
		const chosen = readChosenPassword(form);
		if (!chosen.ok) return fail(400, { message: chosen.message });
		const password = chosen.password ?? generatePassword();
		await Admin.findByIdAndUpdate(id, { passwordHash: await hashPassword(password) });

		await revokeSessions(id);

		await audit({
			actor: locals.admin!.email,
			action: 'admin_password_reset',
			field: chosen.password ? 'set by hand' : 'generated',
			newValue: target.email,
			ip: getClientAddress()
		});

		return { passwordReset: true, email: target.email, password, chosen: !!chosen.password };
	}
};
