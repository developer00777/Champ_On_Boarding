import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { baseUrl } from '$lib/server/base-url';
import { Candidate, Company, PhysicalItem, OfferLetter } from '$lib/server/db/schema';
import { createLinkToken } from '$lib/server/tokens';
import { audit } from '$lib/server/audit';
import { sendBrandedMail, brandSignoff } from '$lib/server/mailer';
import { TRACKS, TRACK_LABELS, PHYSICAL_ITEM_TYPES, isHrFiledTrack, type Track } from '$lib/shared/matrix';
import { brandBySlug } from '$lib/shared/brands';
import { buildOnboardingLinkAttachments } from '$lib/server/offer-letter/send';
import { sendOnboardingWelcomeWA } from '$lib/server/whatsapp';
import { isJoiningDateToday } from '$lib/shared/dates';
import { LINK_DELIVERIES, waShareUrl, type LinkDelivery } from '$lib/shared/link-delivery';

/** Statuses that mean "candidate still has work to do". */
const IN_PROGRESS = ['created', 'opened', 'in_progress', 'changes_requested'];
const DONE = ['approved', 'complete'];
/** 'approved' = HR signed off but onboarding isn't fully wrapped (e.g. no
 *  employee ID yet); 'complete' is the fully-onboarded end state. Kept as its
 *  own stat since "Approved" already reports the broader DONE count. */
const COMPLETE = ['complete'];

export const load: PageServerLoad = async ({ locals }) => {
	// Count in the database rather than fetching every candidate to length-check
	// four arrays in the browser. The full list lives at /admin/candidates now.
	const [
		total,
		awaitingReview,
		inProgress,
		approved,
		completed,
		offerSent,
		offerPendingAgg,
		recentDocs,
		companies,
		pendingOfferDocs,
		joiningTodayDocs
	] = await Promise.all([
		Candidate.countDocuments(),
		Candidate.countDocuments({ status: 'submitted' }),
		Candidate.countDocuments({ status: { $in: IN_PROGRESS } }),
		Candidate.countDocuments({ status: { $in: DONE } }),
		Candidate.countDocuments({ status: { $in: COMPLETE } }),
		// Offer sent — counted off the letter, not the candidate's status, because
		// "sent" is a fact about the letter and a candidate keeps moving through
		// their own stages afterwards. Counted on OfferLetter and then reduced to
		// distinct candidates, so a record that somehow has two rows counts once.
		OfferLetter.distinct('candidateId', { status: 'sent' }).then((ids) => ids.length),
		// Offer yet to be released — the same set the "Offers to send" list below
		// shows, minus its display limit. Approved, but with no letter row at all
		// or one still in draft.
		Candidate.aggregate([
			{ $match: { status: { $in: DONE } } },
			{
				$lookup: {
					from: 'offerletters',
					localField: '_id',
					foreignField: 'candidateId',
					as: 'offerLetter'
				}
			},
			{ $match: { $or: [{ offerLetter: { $size: 0 } }, { 'offerLetter.status': 'draft' }] } },
			{ $count: 'n' }
		]),
		Candidate.find().populate('companyId').sort({ createdAt: -1 }).limit(5).lean(),
		Company.find({ active: true }).sort({ name: 1 }).lean(),
		// Candidates HR has already approved but who don't yet have a sent offer
		// letter — the moment offer letters are actually due to go out, and easy
		// to lose track of once a candidate scrolls off "Recent candidates".
		Candidate.aggregate([
			{ $match: { status: { $in: DONE } } },
			{
				$lookup: {
					from: 'offerletters',
					localField: '_id',
					foreignField: 'candidateId',
					as: 'offerLetter'
				}
			},
			{ $match: { $or: [{ offerLetter: { $size: 0 } }, { 'offerLetter.status': 'draft' }] } },
			{ $sort: { reviewedAt: -1, createdAt: -1 } },
			{ $limit: 25 },
			{
				$lookup: {
					from: 'companies',
					localField: 'companyId',
					foreignField: '_id',
					as: 'company'
				}
			}
		]),
		// Candidates whose offer letter has actually been emailed (status:
		// 'sent') and whose joiningDate is today — surfaced as a popup + Home
		// section so HR doesn't have to remember to check who starts today.
		// Excludes 'complete'/'revoked': once onboarding is fully wrapped up (or
		// the link revoked) there's nothing left for HR to act on, so keeping
		// them in the list would just re-show the popup for someone already
		// handled. joiningDate can't be matched with an exact-string $match:
		// offer letters created before the native date picker landed may still
		// hold whatever free text HR typed ("03-Aug-26", "30 July 2026", ...),
		// so candidates are filtered in JS below via isJoiningDateToday, which
		// parses every format this field has ever stored.
		Candidate.aggregate([
			{ $match: { status: { $nin: ['complete', 'revoked'] } } },
			{
				$lookup: {
					from: 'offerletters',
					localField: '_id',
					foreignField: 'candidateId',
					as: 'offerLetter'
				}
			},
			{ $unwind: '$offerLetter' },
			{ $match: { 'offerLetter.status': 'sent' } },
			{
				$lookup: {
					from: 'companies',
					localField: 'companyId',
					foreignField: '_id',
					as: 'company'
				}
			}
		])
	]);
	const joiningTodayFiltered = joiningTodayDocs.filter((c) =>
		isJoiningDateToday(c.offerLetter?.joiningDate)
	);

	return {
		stats: {
			total,
			awaitingReview,
			inProgress,
			approved,
			completed,
			offerSent,
			offerPending: offerPendingAgg[0]?.n ?? 0
		},
		total,
		recent: recentDocs.map((c) => {
			const company = c.companyId as unknown as { name: string };
			return {
				id: String(c._id),
				email: c.email,
				fullName: c.fullName ?? null,
				track: c.track,
				status: c.status,
				company: company?.name ?? ''
			};
		}),
		pendingOffers: pendingOfferDocs.map((c) => ({
			id: String(c._id),
			email: c.email,
			fullName: c.fullName ?? null,
			track: c.track,
			status: c.status,
			company: c.company?.[0]?.name ?? ''
		})),
		joiningToday: joiningTodayFiltered.map((c) => ({
			id: String(c._id),
			email: c.email,
			fullName: c.fullName ?? null,
			track: c.track,
			company: c.company?.[0]?.name ?? ''
		})),
		companies: companies.map((c) => ({ id: String(c._id), name: c.name, brandSlug: c.brandSlug ?? null })),
		tracks: TRACKS,
		isSuperAdmin: locals.admin?.role === 'super_admin',
		isApprover: locals.admin?.role === 'super_admin' || locals.admin?.role === 'hr_admin'
	};
};

export const actions: Actions = {
	generateLink: async ({ request, locals, getClientAddress }) => {
		if (locals.admin?.role === 'finance_team')
			return fail(403, { message: 'View-only access — cannot create onboarding links.' });
		const form = await request.formData();
		const email = String(form.get('email') ?? '').trim().toLowerCase();
		const track = String(form.get('track') ?? '') as Track;
		const companyId = String(form.get('companyId') ?? '');
		const candidateName = String(form.get('candidateName') ?? '').trim();
		const candidateMobile = String(form.get('candidateMobile') ?? '').trim().replace(/\D/g, '');

		if (!TRACKS.includes(track)) return fail(400, { message: 'Pick a track.' });
		const hrFiled = isHrFiledTrack(track);
		// Admin track: how the link reaches the person is HR's call, case by
		// case — mailed to them, copied and sent by HR, or none at all (HR files
		// the record by hand). Every other track always mails it.
		const rawDelivery = String(form.get('delivery') ?? '');
		const delivery: LinkDelivery = hrFiled
			? (LINK_DELIVERIES as readonly string[]).includes(rawDelivery)
				? (rawDelivery as LinkDelivery)
				: 'copy'
			: 'email';

		// Email is optional on Admin records — some admin staff have none — but
		// whatever is typed must be valid, and mailing the link needs one.
		if (email && !/^\S+@\S+\.\S+$/.test(email))
			return fail(400, { message: 'Enter a valid email address.' });
		if (!email && !hrFiled) return fail(400, { message: 'A valid candidate email is required.' });
		if (!email && delivery === 'email')
			return fail(400, { message: 'Add their email to mail the link, or pick "Copy link" and send it yourself.' });
		// Without an email the name is the only thing that identifies the record
		// in every list, mail and file name.
		if (!email && !candidateName)
			return fail(400, { message: 'Add their name — with no email it is what identifies the record.' });
		if (!companyId) return fail(400, { message: 'Pick a company.' });

		const company = await Company.findById(companyId).lean();
		if (!company) return fail(400, { message: 'Pick a company.' });
		const brand = brandBySlug(company.brandSlug ?? undefined);

		// A candidate can legitimately be re-linked after their record is revoked
		// or fully onboarded (rehire, new track), but never while an existing
		// link for the same email + company is still active — otherwise HR ends
		// up with silent duplicate records mid-review. An Admin record with no
		// email is matched on mobile instead, when there is one.
		const sameKey = email ? { email } : candidateMobile ? { mobile: candidateMobile } : null;
		const activeDuplicate = sameKey
			? await Candidate.findOne({
					...sameKey,
					companyId,
					status: { $nin: ['revoked', 'complete'] }
				}).lean()
			: null;
		if (activeDuplicate) {
			return fail(409, {
				message: `${email || `Mobile ${candidateMobile}`} already has an active onboarding record for this company (status: ${activeDuplicate.status}). Revoke it before creating a new one.`
			});
		}

		const candidate = await Candidate.create({
			...(email ? { email } : {}),
			track,
			companyId,
			fullName: candidateName || null,
			mobile: candidateMobile || null,
			// A record with no link has nothing to open, so it starts where HR
			// filling it in leaves it: in progress, not 'link sent'.
			...(delivery === 'none' ? { status: 'in_progress' } : {}),
			createdBy: locals.admin!.id
		});
		const candidateId = String(candidate._id);

		await PhysicalItem.insertMany(
			PHYSICAL_ITEM_TYPES.map((p) => ({ candidateId: candidate._id, itemType: p.type }))
		);

		// No link: no token, and nothing goes to the person. HR is sent straight
		// to the record to start filing.
		if (delivery === 'none') {
			await audit({
				candidateId,
				actor: locals.admin!.email,
				action: 'record_created_for_hr_filing',
				field: track,
				ip: getClientAddress()
			});
			return { hrFiled: true as const, candidateId, email: email || null, name: candidateName || null };
		}

		const token = await createLinkToken(candidateId);
		const base = baseUrl();
		const link = `${base}/c/${token}`;
		const shareText = `Welcome to ${brand.name}! Please complete your onboarding here (expires in 7 days): ${link}`;

		await audit({
			candidateId,
			actor: locals.admin!.email,
			action: 'link_generated',
			field: track,
			newValue: hrFiled ? (delivery === 'email' ? 'emailed' : 'copied by HR') : undefined,
			ip: getClientAddress()
		});

		// Copy: HR sends it themselves (typically on WhatsApp), so nothing is
		// mailed or messaged from here.
		if (delivery === 'copy') {
			return {
				link,
				waUrl: waShareUrl(candidateMobile, shareText),
				email: email || null,
				name: candidateName || null,
				candidateId,
				delivery
			};
		}

		// Bundle the offer letter into this same email if a complete draft already
		// exists for this candidate (e.g. CTC was finalized before the link went
		// out) — one message to the candidate instead of two.
		const offerDraft = await OfferLetter.findOne({ candidateId: candidate._id }).lean();
		const { attachments, offerLetterBundled } = await buildOnboardingLinkAttachments(
			candidate,
			company.name,
			offerDraft,
			brand
		);

		await sendBrandedMail(
			email,
			`Your ${brand.name} onboarding link`,
			`Hello${candidateName ? ' ' + candidateName : ''},\n\n` +
				`Welcome aboard! Please complete your onboarding here (the link expires in 7 days):\n\n${link}\n\n` +
				`Keep your Aadhaar card, PAN card, bank passbook and education documents handy — ` +
				`photograph them on a flat surface in good light.` +
				(offerLetterBundled ? `\n\nYour offer letter is attached to this email.` : '') +
				`\n\n${brandSignoff(brand)}`,
			brand,
			attachments,
			'onboarding',
			String(candidate._id)
		);

		// Send WhatsApp welcome message via Twilio (best-effort, non-fatal).
		// Not for Admin records: there only what HR picked goes out.
		if (candidateMobile && !hrFiled) {
			await sendOnboardingWelcomeWA({
				mobile: candidateMobile,
				candidateName: candidateName || 'there',
				companyName: company.name,
				trackLabel: TRACK_LABELS[track],
				link
			});
		}

		return {
			link,
			waUrl: waShareUrl(hrFiled ? candidateMobile : '', shareText),
			email,
			name: candidateName || null,
			candidateId,
			delivery
		};
	}
};
