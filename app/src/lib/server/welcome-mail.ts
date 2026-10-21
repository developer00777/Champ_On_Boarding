// The welcome mail to a joiner's official mailbox, with the Core Values and
// Holiday Calendar documents attached.
//
// Same build/send split as it-setup-mail.ts: the preview HR confirms in and
// the mail the joiner receives come from one builder, so they cannot drift.
// The template itself and its renderer are in shared/welcome-mail.ts.
//
// The two attachments are org-wide, not per candidate: HR uploads them once
// (from any candidate's page) and every welcome mail after that carries them,
// until someone replaces one — the holiday calendar once a year, typically.
import { ObjectId } from 'mongodb';
import { AppSetting, Candidate, Company, Document, OfferLetter } from './db/schema';
import { brandBySlug } from '$lib/shared/brands';
import { sendBrandedMail, brandLogoUrl, type MailAttachment } from './mailer';
import { getWelcomeMailSettings } from './settings';
import { getGridFSBytes } from './storage';
import { toDayMonYear } from '$lib/shared/dates';
import {
	WELCOME_ATTACHMENT_SLOTS,
	WELCOME_TOKENS,
	renderWelcomeHtml,
	renderWelcomeSubject,
	renderWelcomeText,
	tokensUsed,
	WELCOME_PHOTO_CID,
	type WelcomeAttachmentSlot,
	type WelcomeValues
} from '$lib/shared/welcome-mail';

// ── Attachments ──────────────────────────────────────────────────────────────

export const WELCOME_ATTACHMENTS_KEY = 'welcome_mail_attachments';

export interface WelcomeAttachment {
	gridfsId: string;
	filename: string;
	mime: string;
	sizeBytes: number;
	uploadedBy: string;
	uploadedAt: string;
}

/** What a joiner can reasonably open. Office formats are in because the Core
 *  Values deck is more often a .docx or .pptx than a PDF. */
export const WELCOME_ATTACHMENT_TYPES: Record<string, { ext: string; magic: number[] }> = {
	'application/pdf': { ext: 'pdf', magic: [0x25, 0x50, 0x44, 0x46] },
	'image/jpeg': { ext: 'jpg', magic: [0xff, 0xd8, 0xff] },
	'image/png': { ext: 'png', magic: [0x89, 0x50, 0x4e, 0x47] },
	// OOXML files are zips, so all three share the PK signature.
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document': { ext: 'docx', magic: [0x50, 0x4b, 0x03, 0x04] },
	'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': { ext: 'xlsx', magic: [0x50, 0x4b, 0x03, 0x04] },
	'application/vnd.openxmlformats-officedocument.presentationml.presentation': { ext: 'pptx', magic: [0x50, 0x4b, 0x03, 0x04] }
};

/** Per file. Resend caps a whole message at 40 MB after base64, so two of
 *  these leave room for the body with margin to spare. */
export const WELCOME_ATTACHMENT_MAX_BYTES = 10 * 1024 * 1024;

/** The declared type if it is one we take, else the one its extension names —
 *  Windows browsers report an empty type for some Office files. The bytes are
 *  checked against it either way, so neither source is trusted on its own. */
export function welcomeAttachmentMime(file: { type: string; name: string }): string | null {
	if (WELCOME_ATTACHMENT_TYPES[file.type]) return file.type;
	const ext = file.name.split('.').pop()?.toLowerCase() ?? '';
	const byExt = Object.entries(WELCOME_ATTACHMENT_TYPES).find(([, t]) => t.ext === ext || (ext === 'jpeg' && t.ext === 'jpg'));
	return byExt?.[0] ?? null;
}

export function welcomeAttachmentBytesMatch(mime: string, bytes: Uint8Array): boolean {
	const magic = WELCOME_ATTACHMENT_TYPES[mime]?.magic;
	return !!magic && magic.every((b, i) => bytes[i] === b);
}

/** A filename the joiner's mail client will show as-is: HR's own name for the
 *  file, minus anything that could break a header or a path. */
export function cleanAttachmentName(name: string, fallback: string): string {
	const cleaned = name.replace(/[\r\n"\\/:*?<>|]/g, '').replace(/\s+/g, ' ').trim().slice(0, 150);
	return cleaned || fallback;
}

export async function getWelcomeAttachments(): Promise<Partial<Record<WelcomeAttachmentSlot, WelcomeAttachment>>> {
	const row = await AppSetting.findOne({ key: WELCOME_ATTACHMENTS_KEY }).lean();
	return (row?.value ?? {}) as Partial<Record<WelcomeAttachmentSlot, WelcomeAttachment>>;
}

/** Sets or clears one slot, returning what it held so the caller can delete
 *  the superseded blob. A dotted $set/$unset touches only that slot, so two
 *  people replacing the two documents at once cannot undo each other. */
export async function setWelcomeAttachment(
	slot: WelcomeAttachmentSlot,
	value: WelcomeAttachment | null,
	adminId: string
): Promise<WelcomeAttachment | null> {
	const before = await AppSetting.findOneAndUpdate(
		{ key: WELCOME_ATTACHMENTS_KEY },
		value
			? { $set: { [`value.${slot}`]: value, updatedBy: adminId } }
			: { $unset: { [`value.${slot}`]: '' }, $set: { updatedBy: adminId } },
		{ upsert: true, returnDocument: 'before' }
	).lean();
	return ((before?.value ?? {}) as Record<string, WelcomeAttachment>)[slot] ?? null;
}

// ── The joiner's photo ───────────────────────────────────────────────────────

/** Past this the photo is left out rather than risk the mail bouncing. A
 *  phone photo of a passport print is a few MB at most. */
const PHOTO_MAX_BYTES = 6 * 1024 * 1024;

type JoinerPhoto =
	| { ok: true; bytes: Buffer; mime: string; filename: string }
	| { ok: false; why: string };

/** The passport-size photo from their onboarding form, exactly as uploaded —
 *  nothing here resizes or re-encodes it. The newest upload that HR has not
 *  sent back for re-upload wins, since a rejected photo is one HR has already
 *  said should not represent them. A PDF cannot sit inline in a mail, so it
 *  counts as no photo, and the mail shows their initials instead. */
async function joinerPhoto(candidateId: string): Promise<JoinerPhoto> {
	const docs = await Document.find({ candidateId, docType: 'photo_soft' }).sort({ createdAt: -1 }).lean();
	if (!docs.length) return { ok: false, why: 'Passport photo (not uploaded — initials shown instead)' };
	const usable = docs.filter((d) => d.reviewStatus !== 'reupload_requested');
	const doc = usable.find((d) => d.mime === 'image/jpeg' || d.mime === 'image/png');
	if (!doc)
		return {
			ok: false,
			why: usable.length
				? 'Passport photo (uploaded as a PDF, which cannot be shown in a mail — initials shown instead)'
				: 'Passport photo (re-upload requested — initials shown instead)'
		};
	if (doc.sizeBytes > PHOTO_MAX_BYTES)
		return { ok: false, why: 'Passport photo (over 6 MB, too large to embed — initials shown instead)' };
	const bytes = Buffer.from(await getGridFSBytes(doc.gridfsId as unknown as ObjectId));
	return { ok: true, bytes, mime: doc.mime, filename: `photo.${doc.mime === 'image/png' ? 'png' : 'jpg'}` };
}

// ── The mail ─────────────────────────────────────────────────────────────────

const TOKEN_LABEL: Record<keyof WelcomeValues, string> = {
	name: 'Name',
	employeeId: 'Employee code',
	company: 'Entity',
	reportingManager: 'Reporting manager',
	designation: 'Designation',
	joiningDate: 'Joining date',
	officialEmail: 'Official email'
};

export interface WelcomeMailDraft {
	to: string[];
	cc: string[];
	subject: string;
	html: string;
	text: string;
	attachments: { slot: WelcomeAttachmentSlot; label: string; filename: string; sizeBytes: number }[];
	/** Values the template uses that would go out blank, and documents not
	 *  uploaded yet. Warnings: HR may still send. */
	missing: string[];
	/** Why it cannot be sent at all — only ever the missing official address. */
	blocker: string | null;
	brandSlug: string;
	/** Whether the hero carries their photo (else their initials). */
	hasPhoto: boolean;
	/** The photo as the inline attachment the `cid:` in `html` points at.
	 *  Only on a draft built for sending. */
	photoAttachment: MailAttachment | null;
}

/** `for: 'send'` points the photo at its inline attachment; the default,
 *  'preview', embeds the same bytes as a data: URI so the admin's preview
 *  iframe can show it. The markup is otherwise identical. */
export async function buildWelcomeMail(
	candidateId: string,
	opts: { for?: 'preview' | 'send' } = {}
): Promise<WelcomeMailDraft> {
	const candidate = await Candidate.findById(candidateId).lean();
	if (!candidate) throw new Error(`Welcome mail: candidate ${candidateId} not found`);
	const [company, offer, settings, stored, photo] = await Promise.all([
		Company.findById(candidate.companyId).lean(),
		OfferLetter.findOne({ candidateId }).lean(),
		getWelcomeMailSettings(),
		getWelcomeAttachments(),
		joinerPhoto(candidateId)
	]);
	const forSend = opts.for === 'send';
	const photoSrc = photo.ok
		? forSend
			? `cid:${WELCOME_PHOTO_CID}`
			: `data:${photo.mime};base64,${photo.bytes.toString('base64')}`
		: null;

	const brand = brandBySlug(company?.brandSlug ?? undefined);
	// The brand's short name ("Champion Infometrics") reads better mid-sentence
	// than the legal one, but only when the brand really is this company's — an
	// entity with no brand entry falls back to the default theme, whose name
	// would be someone else's.
	const companyName = company?.brandSlug === brand.slug ? brand.name : (company?.name ?? brand.name);
	const doj = String(offer?.joiningDate ?? '');
	const values: WelcomeValues = {
		name: candidate.fullName || candidate.email,
		employeeId: candidate.employeeId ?? '',
		company: companyName,
		reportingManager: offer?.reportingManager ?? '',
		designation: offer?.jobTitle ?? '',
		joiningDate: toDayMonYear(doj) || doj,
		officialEmail: candidate.officialEmail ?? ''
	};

	const to = candidate.officialEmail ? [candidate.officialEmail] : [];
	const cc = [...new Set([...settings.cc, candidate.reportingManagerEmail ?? ''])].filter(
		(a) => a && !to.includes(a)
	);

	const attachments = WELCOME_ATTACHMENT_SLOTS.flatMap((s) => {
		const a = stored[s.key];
		return a ? [{ slot: s.key, label: s.label, filename: a.filename, sizeBytes: a.sizeBytes }] : [];
	});

	const used = tokensUsed(settings.subject, settings.body);
	const missing = [
		...WELCOME_TOKENS.map((t) => t.token.slice(1, -1) as keyof WelcomeValues)
			.filter((k) => used.has(k) && !values[k])
			.map((k) => TOKEN_LABEL[k]),
		...WELCOME_ATTACHMENT_SLOTS.filter((s) => !stored[s.key]).map((s) => `${s.label} (attachment)`),
		...(photo.ok ? [] : [photo.why])
	];

	return {
		to,
		cc,
		subject: renderWelcomeSubject(settings.subject, values),
		html: renderWelcomeHtml({ settings, values, brand, logoUrl: brandLogoUrl(brand), photoSrc }),
		text: renderWelcomeText(settings, values, brand.legalName),
		attachments,
		missing,
		blocker: to.length ? null : 'Set the official email first — the welcome mail goes to it.',
		brandSlug: brand.slug,
		hasPhoto: photo.ok,
		photoAttachment:
			photo.ok && forSend ? { filename: photo.filename, content: photo.bytes, contentId: WELCOME_PHOTO_CID } : null
	};
}

/** Builds and sends. Throws on failure so the page can say so — this mail is
 *  only ever sent by hand, from inside the preview. */
export async function sendWelcomeMail(candidateId: string): Promise<{ to: string[]; cc: string[] }> {
	const draft = await buildWelcomeMail(candidateId, { for: 'send' });
	if (draft.blocker) throw new Error(draft.blocker);

	const stored = await getWelcomeAttachments();
	// The photo goes inline, shown in the hero rather than listed as a file.
	const files: MailAttachment[] = draft.photoAttachment ? [draft.photoAttachment] : [];
	for (const a of draft.attachments) {
		const meta = stored[a.slot]!;
		const bytes = await getGridFSBytes(new ObjectId(meta.gridfsId));
		files.push({ filename: meta.filename, content: Buffer.from(bytes) });
	}

	await sendBrandedMail(draft.to, draft.subject, draft.text, brandBySlug(draft.brandSlug), files, 'onboarding', candidateId, {
		cc: draft.cc,
		tagPurpose: 'welcome',
		html: draft.html
	});

	await Candidate.findByIdAndUpdate(candidateId, { welcomeMailSentAt: new Date() });
	return { to: draft.to, cc: draft.cc };
}
