import { Candidate, LinkToken } from './db/schema';
import { randomToken, sha256 } from './crypto';

const LINK_DAYS = 7;

export async function createLinkToken(candidateId: string) {
	const token = randomToken();
	await LinkToken.create({
		candidateId,
		tokenHash: sha256(token),
		expiresAt: new Date(Date.now() + LINK_DAYS * 86_400_000)
	});
	return token;
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
