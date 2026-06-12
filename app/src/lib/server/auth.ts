import { hash, verify } from '@node-rs/argon2';
import { eq, and, gt } from 'drizzle-orm';
import type { Cookies } from '@sveltejs/kit';
import { db, t } from './db';
import { randomToken, sha256 } from './crypto';

const SESSION_COOKIE = 'session';
const SESSION_DAYS = 14;

export const hashPassword = (password: string) => hash(password);
export const verifyPassword = (passwordHash: string, password: string) =>
	verify(passwordHash, password);

export async function createSession(cookies: Cookies, adminId: string) {
	const token = randomToken();
	const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
	await db.insert(t.sessions).values({ adminId, tokenHash: sha256(token), expiresAt });
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
	const rows = await db
		.select({ admin: t.admins })
		.from(t.sessions)
		.innerJoin(t.admins, eq(t.sessions.adminId, t.admins.id))
		.where(and(eq(t.sessions.tokenHash, sha256(token)), gt(t.sessions.expiresAt, new Date())));
	const admin = rows[0]?.admin;
	if (!admin || admin.status !== 'active') return null;
	return { id: admin.id, email: admin.email, role: admin.role };
}

export async function destroySession(cookies: Cookies) {
	const token = cookies.get(SESSION_COOKIE);
	if (token) await db.delete(t.sessions).where(eq(t.sessions.tokenHash, sha256(token)));
	cookies.delete(SESSION_COOKIE, { path: '/' });
}
