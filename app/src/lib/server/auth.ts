import { hash, verify } from '@node-rs/argon2';
import type { Cookies } from '@sveltejs/kit';
import { Admin } from './db/schema';
import { getRedis } from './redis';
import { randomToken, sha256 } from './crypto';

const SESSION_COOKIE = 'session';
const SESSION_DAYS = 14;
const SESSION_TTL = SESSION_DAYS * 86_400; // seconds for Redis SETEX

export const hashPassword = (password: string) => hash(password);
export const verifyPassword = (passwordHash: string, password: string) =>
	verify(passwordHash, password);

export async function createSession(cookies: Cookies, adminId: string) {
	const token = randomToken();
	const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
	await getRedis().setex(`session:${sha256(token)}`, SESSION_TTL, adminId);
	cookies.set(SESSION_COOKIE, token, {
		path: '/',
		httpOnly: true,
		sameSite: 'lax',
		secure: process.env.NODE_ENV === 'production',
		expires: expiresAt
	});
}

export async function resolveSession(cookies: Cookies) {
	const token = cookies.get(SESSION_COOKIE);
	if (!token) return null;
	const adminId = await getRedis().get(`session:${sha256(token)}`);
	if (!adminId) return null;
	const admin = await Admin.findById(adminId).lean();
	if (!admin || admin.status !== 'active') return null;
	return { id: String(admin._id), email: admin.email, role: admin.role };
}

export async function destroySession(cookies: Cookies) {
	const token = cookies.get(SESSION_COOKIE);
	if (token) await getRedis().del(`session:${sha256(token)}`);
	cookies.delete(SESSION_COOKIE, { path: '/' });
}
