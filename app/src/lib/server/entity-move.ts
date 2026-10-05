// Moving a candidate to another entity, for when the hiring company changes
// after onboarding has started. The record, its documents, its link and its
// offer draft all stay put — only `companyId` changes — so nobody is onboarded
// twice. Everything branded (the portal, the document matrix, the offer
// letterhead, the IT and employee code mails) reads the entity at request time
// and follows the record on its own.
//
// What does not follow on its own is anything that already left the building
// under the old name, or a rule that differs between the two entities. Those
// are what moveImpact() spells out, both before the move (so HR can see what
// they are agreeing to) and after it (as the to-do list).
import { Candidate, Company, OfferLetter } from './db/schema';
import { checklistFor, missingMandatory } from './checklist';
import { audit } from './audit';
import { brandBySlug } from '$lib/shared/brands';
import { isBgvEligible, type Track } from '$lib/shared/matrix';

type Lean = Record<string, any>;

export interface MoveNote {
	/** `todo` needs someone to act; `info` is what the move did by itself. */
	tone: 'todo' | 'info';
	text: string;
}

const day = (d: Date | string | null | undefined) =>
	d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '';

/** The names an entity goes by on paper — its row name and its brand's legal
 *  name — lowercased, for spotting the old entity in text HR wrote by hand. */
function namesOf(company: Lean | null): string[] {
	if (!company) return [];
	const brand = brandBySlug(company.brandSlug);
	return [...new Set([company.name, brand.legalName, brand.name].filter(Boolean).map((n) => String(n).toLowerCase()))];
}

/** True when a payroll-entity override just restates the old entity. Those are
 *  cleared on a move — they were never a real override, only the default
 *  typed out — whereas any other value is HR's deliberate choice and stays. */
function isOldEntityName(value: string | null | undefined, from: Lean | null): boolean {
	return !!value && namesOf(from).includes(value.trim().toLowerCase());
}

export async function moveImpact(candidate: Lean, from: Lean | null, to: Lean): Promise<MoveNote[]> {
	const notes: MoveNote[] = [];
	const fromName = from?.name ?? 'the current entity';
	const toName = to.name;
	const track = candidate.track as Track;
	const offer = await OfferLetter.findOne({ candidateId: candidate._id }).lean<Lean>();

	notes.push({
		tone: 'info',
		text: `Same record and same onboarding link. The portal, documents list and offer letter switch to ${toName}'s branding.`
	});

	// Documents: entity overrides can make a slot mandatory or optional.
	const [before, after] = await Promise.all([
		checklistFor(String(candidate._id), track, from?.brandSlug),
		checklistFor(String(candidate._id), track, to.brandSlug)
	]);
	const missingBefore = new Set(missingMandatory(before).map((s) => s.type));
	for (const s of missingMandatory(after)) {
		if (!missingBefore.has(s.type))
			notes.push({ tone: 'todo', text: `${s.label} is mandatory at ${toName} and has not been uploaded. Request it from the candidate.` });
	}
	const missingAfter = new Set(missingMandatory(after).map((s) => s.type));
	for (const type of missingBefore) {
		if (!missingAfter.has(type)) {
			const label = after.find((s) => s.type === type)?.label ?? type;
			notes.push({ tone: 'info', text: `${label} is not required at ${toName}, so it no longer blocks this record.` });
		}
	}

	// Background verification runs for four entities, experienced track only.
	const bgvBefore = isBgvEligible(track, from?.brandSlug);
	const bgvAfter = isBgvEligible(track, to.brandSlug);
	if (!bgvBefore && bgvAfter)
		notes.push({ tone: 'todo', text: `${toName} runs background verification: previous-employment details become required, and the candidate appears under Verification.` });
	if (bgvBefore && !bgvAfter)
		notes.push({ tone: 'info', text: `${toName} does not run background verification, so this candidate leaves the Verification list. Anything already sent stays on record.` });

	// The offer letter.
	if (offer?.uploadedLetter?.fileId)
		notes.push({ tone: 'todo', text: `The directly uploaded offer letter is a fixed file and still names ${fromName}. Upload a ${toName} letter, or remove it to use the generated one.` });
	else notes.push({ tone: 'info', text: `The generated offer letter now prints on ${toName}'s letterhead with ${toName} in the body.` });

	if (offer?.status === 'sent')
		notes.push({ tone: 'todo', text: `An offer letter already went to the candidate${offer.sentAt ? ` on ${day(offer.sentAt)}` : ''} under ${fromName}. Send it again so they hold the ${toName} letter.` });

	const old = namesOf(from);
	const handWritten = [...(offer?.manualEdits ?? []), ...(offer?.manualAdditions ?? [])].filter((b: Lean) =>
		old.some((n) => String(b.text ?? '').toLowerCase().includes(n))
	);
	if (handWritten.length)
		notes.push({ tone: 'todo', text: `${handWritten.length} hand-edited block${handWritten.length > 1 ? 's' : ''} of the offer letter name${handWritten.length > 1 ? '' : 's'} ${fromName}. Correct ${handWritten.length > 1 ? 'them' : 'it'} in the offer editor.` });

	// IT and payroll.
	if (isOldEntityName(candidate.payrollEntity, from))
		notes.push({ tone: 'info', text: `The payroll entity was typed in as ${candidate.payrollEntity}; that is cleared, so the IT mail carries ${toName}.` });
	else if (candidate.payrollEntity)
		notes.push({ tone: 'todo', text: `The payroll entity is set by hand to "${candidate.payrollEntity}" and is left as it is. Change it under IT mail details if it should now be ${toName}.` });

	if (candidate.itSetupMailSentAt)
		notes.push({ tone: 'todo', text: `The IT setup mail went out on ${day(candidate.itSetupMailSentAt)} naming ${fromName}. Resend it.` });
	if (candidate.employeeId)
		notes.push({ tone: 'todo', text: `Employee code ${candidate.employeeId} was assigned under ${fromName}. Check it still holds at ${toName}.` });

	return notes;
}

/** Validates the target and returns both companies, or a refusal message. */
export async function resolveMove(candidate: Lean, toCompanyId: string) {
	if (!/^[a-f\d]{24}$/i.test(toCompanyId)) return { error: 'Pick the entity to move this candidate to.' } as const;
	const [from, to] = await Promise.all([
		Company.findById(candidate.companyId).lean<Lean>(),
		Company.findById(toCompanyId).lean<Lean>()
	]);
	if (!to || to.active === false) return { error: 'That entity no longer exists or has been archived.' } as const;
	if (String(to._id) === String(candidate.companyId)) return { error: `This candidate is already with ${to.name}.` } as const;
	return { from, to } as const;
}

export async function moveCandidate(candidate: Lean, from: Lean | null, to: Lean, actor: string, ip: string) {
	// Worked out before the write: the notes describe the state being left.
	const notes = await moveImpact(candidate, from, to);
	const patch: Record<string, unknown> = { companyId: to._id };
	if (isOldEntityName(candidate.payrollEntity, from)) patch.payrollEntity = null;
	await Candidate.findByIdAndUpdate(candidate._id, patch);
	await audit({
		candidateId: String(candidate._id),
		actor,
		action: 'entity_changed',
		field: 'companyId',
		oldValue: from?.name ?? String(candidate.companyId),
		newValue: to.name,
		ip
	});
	return notes;
}
