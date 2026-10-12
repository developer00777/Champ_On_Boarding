// Changing a candidate's hiring track, for when the role turns out to be a
// different kind of hire after onboarding has started (an intern taken on as a
// fresher, a consultant converted to experienced). Like an entity move, the
// record, its uploads, its link and its offer draft all stay put — only `track`
// changes — so nobody is onboarded twice.
//
// The track decides far more than the entity does: which documents are asked
// for, which offer letter template prints and what its pay figure means, who
// enters the UAN, whether background verification applies, and the joining mode
// the IT mail carries. trackImpact() spells out, for this person, what stops
// applying, what someone now has to do, and what simply follows — before the
// change (so HR sees what they are agreeing to) and after it (as the to-do).
import { Candidate, Exit, OfferLetter } from './db/schema';
import { checklistFor, missingMandatory } from './checklist';
import { audit } from './audit';
import {
	LETTER_TYPE_BY_TRACK,
	OFFER_LETTER_FIELD_LABELS,
	offerLetterInputFromDraft,
	requiredOfferLetterFields
} from './offer-letter/fields';
import {
	COMPENSATION_FIELD_BY_TRACK,
	CONSULTANT_LETTER_TRACKS,
	EXP_LIKE_TRACKS,
	TRACK_LABELS,
	TRACKS,
	isBgvEligible,
	type Track
} from '$lib/shared/matrix';
import { TRACK_MODE } from '$lib/shared/shifts';

type Lean = Record<string, any>;

export interface TrackNote {
	/** `loss` is something that stops applying or drops out of view; `todo`
	 *  needs someone to act; `info` is what the change does by itself. */
	tone: 'loss' | 'todo' | 'info';
	text: string;
}

const day = (d: Date | string | null | undefined) =>
	d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

const list = (items: string[]) =>
	items.length <= 1 ? items.join('') : `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;

/** Which offer letter template a track prints (offer-letter/pdf.ts), and the
 *  prefixes of the block keys that template's hand edits are stored against. */
type Template = 'intern' | 'consultant' | 'appointment';
const templateOf = (t: Track): Template =>
	t === 'intern' ? 'intern' : CONSULTANT_LETTER_TRACKS.includes(t) ? 'consultant' : 'appointment';
const KEY_PREFIXES: Record<Template, string[]> = {
	intern: ['intern.'],
	consultant: ['con.'],
	appointment: ['app.', 'annex.']
};

/** The offer fields only some templates print. A value in one of these is kept
 *  in the draft whatever the track, but a template that does not quote it
 *  simply leaves it out — which is the "lost" HR needs to hear about. */
const TEMPLATE_ONLY_FIELDS: { key: string; label: string; in: Template[] }[] = [
	{ key: 'endDate', label: 'end date', in: ['intern'] },
	{ key: 'internCriteria', label: 'intern evaluation criteria', in: ['intern'] },
	{ key: 'weeklyExpectation', label: 'weekly expectation', in: ['consultant'] },
	{ key: 'keyResponsibilities', label: 'key responsibilities', in: ['consultant'] },
	{ key: 'paymentClause', label: 'payment clause', in: ['consultant'] },
	{ key: 'monthlyCompensation', label: 'monthly compensation', in: ['appointment'] },
	{ key: 'noticePeriod', label: 'notice period', in: ['appointment', 'consultant'] }
];

/** Whether the single pay figure is a monthly or an annual amount on a track's
 *  letter — the same stored number reads differently (see
 *  COMPENSATION_FIELD_BY_TRACK). */
const payPeriod = (t: Track) => (t === 'fresher' || t === 'experienced' ? 'annual' : 'monthly');

export async function trackImpact(candidate: Lean, company: Lean | null, to: Track): Promise<TrackNote[]> {
	const notes: TrackNote[] = [];
	const from = candidate.track as Track;
	const fromLabel = TRACK_LABELS[from] ?? from;
	const toLabel = TRACK_LABELS[to];
	const brandSlug = company?.brandSlug ?? null;
	const id = String(candidate._id);

	const [offer, before, after, openExit] = await Promise.all([
		OfferLetter.findOne({ candidateId: candidate._id }).lean<Lean>(),
		checklistFor(id, from, brandSlug),
		checklistFor(id, to, brandSlug),
		Exit.findOne({ candidateId: candidate._id, status: { $ne: 'completed' } }, 'track').lean<Lean>()
	]);

	notes.push({
		tone: 'info',
		text: `Same record, same onboarding link and the same uploaded files. The documents list, the candidate's form, the offer letter and every list or report now treat them as ${toLabel}.`
	});

	// ── Documents ────────────────────────────────────────────────────────────
	// Uploads in a slot the new track does not have drop out of the checklist.
	// The files are not deleted: they stay on the record and in the documents
	// ZIP, and switching back lists them again.
	const afterTypes = new Set(after.map((s) => s.type));
	for (const s of before) {
		if (afterTypes.has(s.type) || !s.docs.length) continue;
		const n = s.docs.length;
		notes.push({
			tone: 'loss',
			text: `${s.label} (${n} file${n > 1 ? 's' : ''} uploaded) is not part of the ${toLabel} track and leaves the documents list. The file${n > 1 ? 's stay' : ' stays'} on record and in the documents ZIP; changing back to ${fromLabel} lists ${n > 1 ? 'them' : 'it'} again.`
		});
	}

	const missingBefore = new Set(missingMandatory(before).map((s) => s.group ?? s.type));
	const newlyMissing = missingMandatory(after).filter((s) => !missingBefore.has(s.group ?? s.type));
	for (const s of newlyMissing) {
		const alt = s.alternatives?.length ? ` (or ${list(s.alternatives)})` : '';
		notes.push({
			tone: 'todo',
			text: `${s.label}${alt} is required for ${toLabel} and has not been uploaded.`
		});
	}
	if (newlyMissing.length) {
		// Where the candidate can upload it from depends on how far they got.
		if (candidate.status === 'submitted')
			notes.push({ tone: 'todo', text: `They have already submitted, so their link is closed to uploads. Use "Request upload" on ${newlyMissing.length > 1 ? 'each missing document' : 'it'} in the documents list — that reopens the link.` });
		else if (['approved', 'complete'].includes(candidate.status))
			notes.push({ tone: 'todo', text: `This record is already approved. The approval stands, but ${newlyMissing.length > 1 ? 'these documents are' : 'this document is'} outstanding for the ${toLabel} track — collect ${newlyMissing.length > 1 ? 'them' : 'it'} by hand.` });
		else if (candidate.status === 'revoked')
			notes.push({ tone: 'todo', text: 'Their onboarding link is revoked. Regenerate it before asking for the documents above.' });
		else notes.push({ tone: 'info', text: 'The documents above appear on their onboarding link straight away.' });
	}

	const missingAfter = new Set(missingMandatory(after).map((s) => s.group ?? s.type));
	for (const s of missingMandatory(before)) {
		if (missingAfter.has(s.group ?? s.type) || !afterTypes.has(s.type)) continue;
		notes.push({ tone: 'info', text: `${s.label} is not required for ${toLabel}, so it no longer blocks this record.` });
	}
	for (const s of missingMandatory(before)) {
		if (afterTypes.has(s.type)) continue;
		notes.push({ tone: 'info', text: `${s.label} was outstanding for ${fromLabel} and is not asked for on the ${toLabel} track.` });
	}

	// ── Background verification ──────────────────────────────────────────────
	const bgvBefore = isBgvEligible(from, brandSlug);
	const bgvAfter = isBgvEligible(to, brandSlug);
	if (!bgvBefore && bgvAfter)
		notes.push({ tone: 'todo', text: `${toLabel} hires at this entity go through background verification: previous-employment details become required on their form, and they appear under Verification.` });
	if (bgvBefore && !bgvAfter)
		notes.push({ tone: 'loss', text: `Background verification only runs for Experienced hires, so this candidate leaves the Verification list and the previous-employment section stops being required. Anything already sent stays on record.` });

	// ── UAN ──────────────────────────────────────────────────────────────────
	const expBefore = EXP_LIKE_TRACKS.includes(from);
	const expAfter = EXP_LIKE_TRACKS.includes(to);
	const uan = candidate.uanNo ? ` The UAN on record (${candidate.uanNo}) is kept.` : '';
	if (expBefore && !expAfter)
		notes.push({ tone: 'info', text: `The UAN moves from the candidate's form to HR: it is set on this page from now on.${uan}` });
	if (!expBefore && expAfter)
		notes.push({ tone: 'info', text: `The candidate enters their own UAN on their form from now on; HR can no longer set it here.${uan}` });

	// ── Offer letter ─────────────────────────────────────────────────────────
	const tFrom = templateOf(from);
	const tTo = templateOf(to);
	const letterChanges = tFrom !== tTo || LETTER_TYPE_BY_TRACK[from] !== LETTER_TYPE_BY_TRACK[to];
	if (!offer) {
		notes.push({ tone: 'info', text: `No offer letter has been drafted yet; it will be drafted as the ${toLabel} ${LETTER_TYPE_BY_TRACK[to]}.` });
	} else {
		if (offer.uploadedLetter?.fileId) {
			if (letterChanges)
				notes.push({ tone: 'todo', text: `The directly uploaded offer letter is a fixed file written as a ${LETTER_TYPE_BY_TRACK[from]}. Upload a ${toLabel} letter, or remove it to use the generated ${LETTER_TYPE_BY_TRACK[to]}.` });
		} else if (letterChanges) {
			notes.push({ tone: 'info', text: `The generated offer letter switches from the ${LETTER_TYPE_BY_TRACK[from]} to the ${LETTER_TYPE_BY_TRACK[to]} template.` });
		}

		if (offer.status === 'sent' && letterChanges)
			notes.push({ tone: 'todo', text: `${/^[aeiou]/i.test(LETTER_TYPE_BY_TRACK[from]) ? 'An' : 'A'} ${LETTER_TYPE_BY_TRACK[from]} already went to the candidate${offer.sentAt ? ` on ${day(offer.sentAt)}` : ''}. Send the ${LETTER_TYPE_BY_TRACK[to]} so they hold the right letter.` });

		// The pay figure is one stored number read per track.
		const amount = String(offer.ctcAmount ?? '').trim();
		const payFrom = COMPENSATION_FIELD_BY_TRACK[from];
		const payTo = COMPENSATION_FIELD_BY_TRACK[to];
		if (amount && payPeriod(from) !== payPeriod(to))
			notes.push({ tone: 'todo', text: `The pay figure ${amount} was entered as ${payFrom.label}; the ${toLabel} letter prints it as ${payTo.label}. Re-enter it before the letter goes out, or the candidate is sent the wrong amount.` });
		else if (amount && payFrom.label !== payTo.label)
			notes.push({ tone: 'info', text: `The pay figure ${amount} now prints as ${payTo.label} rather than ${payFrom.label}.` });

		if (tFrom !== tTo) {
			// Values only the old template quoted: kept, but no longer printed.
			const dropped = TEMPLATE_ONLY_FIELDS.filter(
				(f) => f.in.includes(tFrom) && !f.in.includes(tTo) && String(offer[f.key] ?? '').trim()
			).map((f) => f.label);
			if (offer.compensationAnnexure?.enabled && tFrom === 'appointment') dropped.push('compensation annexure page');
			if (dropped.length)
				notes.push({ tone: 'loss', text: `The ${list(dropped)} ${dropped.length > 1 ? 'are' : 'is'} only printed in the ${LETTER_TYPE_BY_TRACK[from]}: kept in the draft, but left out of the ${LETTER_TYPE_BY_TRACK[to]}.` });

			// Hand edits are stored against the old template's block keys.
			const prefixes = KEY_PREFIXES[tTo];
			const fits = (key: string) => prefixes.some((p) => String(key ?? '').startsWith(p));
			const edits = (offer.manualEdits ?? []).filter((e: Lean) => !fits(e.key)).length;
			const added = (offer.manualAdditions ?? []).filter((a: Lean) => !fits(a.afterKey)).length;
			if (edits || added) {
				const parts = [
					edits ? `${edits} hand edit${edits > 1 ? 's' : ''}` : '',
					added ? `${added} added block${added > 1 ? 's' : ''}` : ''
				].filter(Boolean);
				notes.push({ tone: 'loss', text: `${list(parts)} made to the ${LETTER_TYPE_BY_TRACK[from]}'s wording ${edits + added > 1 ? 'belong' : 'belongs'} to that template and will not appear in the ${LETTER_TYPE_BY_TRACK[to]}. Redo ${edits + added > 1 ? 'them' : 'it'} in the offer editor if still needed.` });
			}
		}

		// Fields the new template needs that the draft does not have. Only
		// relevant to a generated letter — an uploaded one is already written.
		if (!offer.uploadedLetter?.fileId) {
			// Compared by field key, not label: the pay field is labelled per
			// track, so an empty one would otherwise look newly missing.
			const input = offerLetterInputFromDraft(offer as never);
			const blank = (t: Track) =>
				requiredOfferLetterFields(t).filter((k) => !String(input[k] ?? '').trim());
			const missingNow = new Set(blank(from));
			const needed = blank(to)
				.filter((k) => !missingNow.has(k))
				.map((k) => (k === 'ctcAmount' ? payTo.label : OFFER_LETTER_FIELD_LABELS[k]));
			if (needed.length)
				notes.push({ tone: 'todo', text: `The ${LETTER_TYPE_BY_TRACK[to]} also needs ${list(needed.map((l) => l.toLowerCase()))}. Fill ${needed.length > 1 ? 'them' : 'it'} in on the offer letter form.` });
		}
	}

	// ── IT setup mail ────────────────────────────────────────────────────────
	const modeFrom = TRACK_MODE[from];
	const modeTo = TRACK_MODE[to];
	if (modeFrom !== modeTo) {
		const typed = String(candidate.joiningMode ?? '').trim();
		if (typed && typed === modeFrom)
			notes.push({ tone: 'info', text: `The joining mode was typed in as ${typed}; that is cleared, so the IT mail carries ${modeTo}.` });
		else if (typed)
			notes.push({ tone: 'todo', text: `The joining mode is set by hand to "${typed}" and is left as it is. Change it under IT mail details if it should now be ${modeTo}.` });
		else notes.push({ tone: 'info', text: `The IT mail's joining mode changes from ${modeFrom} to ${modeTo}.` });
		if (candidate.itSetupMailSentAt)
			notes.push({ tone: 'todo', text: `The IT setup mail went out on ${day(candidate.itSetupMailSentAt)} with mode ${modeFrom}. Resend it.` });
	}

	// ── Offboarding ──────────────────────────────────────────────────────────
	if (openExit && openExit.track && openExit.track !== to)
		notes.push({ tone: 'todo', text: `Their open exit record was created as ${TRACK_LABELS[openExit.track as Track] ?? openExit.track} and keeps its own track, which decides their exit letters. Change it on the exit page if it should now be ${toLabel}.` });

	return notes;
}

/** Validates the target track, or returns a refusal message. */
export function resolveTrack(candidate: Lean, raw: string) {
	if (!TRACKS.includes(raw as Track)) return { error: 'Pick the track to change this candidate to.' } as const;
	const to = raw as Track;
	if (to === candidate.track) return { error: `This candidate is already on the ${TRACK_LABELS[to]} track.` } as const;
	return { to } as const;
}

export async function changeTrack(
	candidate: Lean,
	company: Lean | null,
	to: Track,
	actor: string,
	ip: string
) {
	const from = candidate.track as Track;
	// Worked out before the write: the notes describe the state being left.
	const notes = await trackImpact(candidate, company, to);
	const patch: Record<string, unknown> = { track: to };
	// A joining mode that only restates the old track's default was never a
	// real override — clear it so the IT mail picks the new default up.
	if (TRACK_MODE[from] !== TRACK_MODE[to] && String(candidate.joiningMode ?? '').trim() === TRACK_MODE[from])
		patch.joiningMode = null;
	await Candidate.findByIdAndUpdate(candidate._id, patch);
	await audit({
		candidateId: String(candidate._id),
		actor,
		action: 'track_changed',
		field: 'track',
		oldValue: TRACK_LABELS[from] ?? from,
		newValue: TRACK_LABELS[to],
		ip
	});
	return notes;
}
