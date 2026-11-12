import { Candidate, LinkToken } from './db/schema';
import { randomToken, sha256, encrypt, decrypt } from './crypto';

const LINK_DAYS = 7;

export async function createLinkToken(candidateId: string) {
	const token = randomToken();
	await LinkToken.create({
		candidateId,
		tokenHash: sha256(token),
		tokenEncrypted: encrypt(token),
		expiresAt: new Date(Date.now() + LINK_DAYS * 86_400_000)
	});
	return token;
}

/** Returns a live onboarding link for this candidate, creating or extending one
 *  as needed, and hands back the raw token.
 *
 *  A link is only good for LINK_DAYS from issue, but joining day is routinely
 *  further out than that — so when HR asks the candidate to confirm a
 *  joining-day detail, the link they are being sent to has usually expired. This
 *  pushes the newest un-revoked link's expiry back out rather than minting a
 *  second one, so the URL HR already has on screen (and any the candidate
 *  bookmarked) keeps working. Only when there is no usable link at all — none
 *  issued, all revoked, or the stored copy is unreadable — is a fresh one cut.
 *
 *  Returns null if the candidate's record is revoked: a revoked record should
 *  not be handed a working link by a side effect. */
export async function ensureLiveLinkToken(candidateId: string): Promise<string | null> {
	const candidate = await Candidate.findById(candidateId).lean();
	if (!candidate || candidate.status === 'revoked') return null;

	const expiresAt = new Date(Date.now() + LINK_DAYS * 86_400_000);
	const existing = await LinkToken.findOne({ candidateId, revoked: false }).sort({ createdAt: -1 });

	if (existing?.tokenEncrypted) {
		try {
			const token = decrypt(existing.tokenEncrypted);
			// Never shorten a link that already outlives this window.
			if (existing.expiresAt < expiresAt) {
				existing.expiresAt = expiresAt;
				await existing.save();
			}
			return token;
		} catch {
			// Unreadable stored copy (e.g. issued under a rotated ENCRYPTION_KEY) —
			// fall through and cut a fresh link rather than fail the request.
		}
	}

	return createLinkToken(candidateId);
}

export async function resolveCandidateToken(token: string) {
	const link = await LinkToken.findOne({
		tokenHash: sha256(token),
		revoked: false,
		expiresAt: { $gt: new Date() }
	}).lean();
	if (!link) return null;

	const candidate = await Candidate.findById(link.candidateId).lean();
	if (!candidate || candidate.status === 'revoked') return null;

	if (!link.openedAt) {
		await LinkToken.findByIdAndUpdate(link._id, { openedAt: new Date() });
		if (candidate.status === 'created') {
			await Candidate.findByIdAndUpdate(candidate._id, { status: 'opened' });
			candidate.status = 'opened';
		}
	}

	return {
		...candidate,
		id: String(candidate._id),
		companyId: String(candidate.companyId),
		createdBy: candidate.createdBy ? String(candidate.createdBy) : null,
		ocrSuggestions: (() => {
			const s = candidate.ocrSuggestions;
			if (!s) return {};
			if (s instanceof Map) return Object.fromEntries(s);
			return s as Record<string, string>;
		})()
	};
}
