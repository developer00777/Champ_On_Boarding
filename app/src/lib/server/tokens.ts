import { and, eq, gt } from 'drizzle-orm';
import { db, t } from './db';
import { randomToken, sha256 } from './crypto';

const LINK_DAYS = 7;

export async function createLinkToken(candidateId: string) {
	const token = randomToken();
	await db.insert(t.linkTokens).values({
		candidateId,
		tokenHash: sha256(token),
		expiresAt: new Date(Date.now() + LINK_DAYS * 86_400_000)
	});
	return token;
}

/** Resolve a candidate from a raw link token; null if missing/expired/revoked. */
export async function resolveCandidateToken(token: string) {
	const rows = await db
		.select({ link: t.linkTokens, candidate: t.candidates })
		.from(t.linkTokens)
		.innerJoin(t.candidates, eq(t.linkTokens.candidateId, t.candidates.id))
		.where(
			and(
				eq(t.linkTokens.tokenHash, sha256(token)),
				eq(t.linkTokens.revoked, false),
				gt(t.linkTokens.expiresAt, new Date())
			)
		);
	const row = rows[0];
	if (!row || row.candidate.status === 'revoked') return null;
	if (!row.link.openedAt) {
		await db
			.update(t.linkTokens)
			.set({ openedAt: new Date() })
			.where(eq(t.linkTokens.id, row.link.id));
		if (row.candidate.status === 'created') {
			await db
				.update(t.candidates)
				.set({ status: 'opened' })
				.where(eq(t.candidates.id, row.candidate.id));
			row.candidate.status = 'opened';
		}
	}
	return row.candidate;
}
