// The exit letters HR issues, typeset from the exit record.
//
// Each generator reproduces the wording of one of HR's Word templates (listed
// beside ExitLetterKey in shared/offboarding.ts), tidied where the original's
// grammar slipped, with every particular read from the exit rather than retyped
// into a copy of the last person's letter. Anything the record does not hold
// yet prints as a blank rule, so an incomplete letter is obvious on the page
// rather than quietly carrying someone else's date.
//
// These are letters, not forms: the kit's letter mode gives them the
// letterhead without the form chrome, and they are HR-only drafts — printed,
// signed by the signatory, and handed over as an upload (HANDOVER_DOCS).
import { LETTER_HR_CONTACT, LETTER_SALUTATIONS, LETTER_SIGNATORY } from '$lib/shared/offboarding';
import { parseStoredDate, todayDDMMYYYYInIST, todayInIST } from '$lib/shared/dates';
import { BLACK, createDoc, ensure, finish, gap, para, sanitize, title, type DocCtx } from './pdf-kit';
import type { ExitPdfInput } from './pdf';

const SIZE = 11;
const BLANK = '__________';
const MONTHS = [
	'January', 'February', 'March', 'April', 'May', 'June',
	'July', 'August', 'September', 'October', 'November', 'December'
];

const str = (v: unknown): string => String(v ?? '').trim();

function ordinal(n: number): string {
	const teen = n % 100;
	if (teen >= 11 && teen <= 13) return `${n}th`;
	return `${n}${{ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] ?? 'th'}`;
}

/** "25th March 2024" — the form the templates use in their body text. */
function longDate(value: string | null | undefined): string {
	const p = parseStoredDate(value);
	return p ? `${ordinal(p.day)} ${MONTHS[p.month - 1]} ${p.year}` : BLANK;
}

/** The pronouns a salutation implies. No salutation reads "they", which keeps
 *  a letter correct rather than guessing a gender off a name. */
function voice(salutation: string | null) {
	if (salutation === 'Mr.') return { sub: 'he', obj: 'him', pos: 'his', is: 'is', has: 'has', was: 'was' };
	if (salutation === 'Ms.' || salutation === 'Mrs.')
		return { sub: 'she', obj: 'her', pos: 'her', is: 'is', has: 'has', was: 'was' };
	return { sub: 'they', obj: 'them', pos: 'their', is: 'are', has: 'have', was: 'were' };
}

const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);
const article = (word: string) => (/^[aeiou]/i.test(word) ? 'an' : 'a');

/** What every letter reads off the exit, resolved once. */
function particulars(input: ExitPdfInput) {
	const e = input.exit;
	const raw = str(e.letters?.salutation);
	const salutation = (LETTER_SALUTATIONS as readonly string[]).includes(raw) ? raw : null;
	return {
		e,
		v: voice(salutation),
		name: [salutation, str(e.fullName)].filter(Boolean).join(' '),
		company: input.brand.legalName || input.companyName,
		designation: str(e.designation) || BLANK,
		doj: longDate(e.doj),
		lwd: longDate(e.lwd)
	};
}

type Particulars = ReturnType<typeof particulars>;

/** A letter with its opening line drawn: the reference on the left and the
 *  issue date on the right, as every template opens. The date is today's —
 *  the letter is generated when HR pulls it to sign. */
async function begin(input: ExitPdfInput, docTitle: string): Promise<DocCtx> {
	const ctx = await createDoc(input.brand, input.companyName, docTitle, todayDDMMYYYYInIST(), {
		letter: true
	});
	const today = todayInIST();
	// The exit's own reference number; older exits kept it with the letters.
	const ref = sanitize(str(input.exit.refNo) || str(input.exit.letters?.refNo) || `Ref: ${BLANK}`);
	const date = sanitize(`Date: ${ordinal(today.day)} ${MONTHS[today.month - 1]}, ${today.year}`);

	ctx.y -= 8;
	ctx.page.drawText(ref, { x: ctx.M, y: ctx.y - SIZE, size: SIZE, font: ctx.fontR, color: BLACK });
	const dw = ctx.fontR.widthOfTextAtSize(date, SIZE);
	ctx.page.drawText(date, { x: ctx.M + ctx.CW - dw, y: ctx.y - SIZE, size: SIZE, font: ctx.fontR, color: BLACK });
	ctx.y -= SIZE + 34;
	return ctx;
}

function body(ctx: DocCtx, text: string) {
	para(ctx, text, { size: SIZE, gapAfter: 11 });
}

/** "With Best Wishes," and the signatory block, kept on one page with room
 *  above the name for the wet signature. */
function signOff(ctx: DocCtx, company: string) {
	ensure(ctx, 130);
	gap(ctx, 12);
	para(ctx, 'With Best Wishes,', { size: SIZE, gapAfter: 46 });
	para(ctx, LETTER_SIGNATORY.name, { size: SIZE, font: ctx.fontB, gapAfter: 1 });
	para(ctx, LETTER_SIGNATORY.title, { size: SIZE, gapAfter: 1 });
	para(ctx, company, { size: SIZE, gapAfter: 0 });
}

// ── Relieving & Experience Letter ────────────────────────────────────────────
// The Sales & Data format: for anyone who gained experience here.

export async function relievingSalesPdf(input: ExitPdfInput): Promise<Uint8Array> {
	const p = particulars(input);
	const { e, v } = p;
	const ctx = await begin(input, 'Relieving & Experience Letter');
	title(ctx, 'TO WHOMSOEVER IT MAY CONCERN', SIZE + 1);
	gap(ctx, 10);
	body(
		ctx,
		`${p.name} (Emp. Code: ${str(e.employeeId) || BLANK}) ${v.has} worked in our company from ${p.doj}. ` +
			`${cap(v.pos)} last day with our company was on ${p.lwd}.`
	);
	// The template is written for a resignation. A termination keeps the same
	// letter but must not say the employee resigned.
	body(
		ctx,
		e.separationType === 'involuntary'
			? `${cap(v.sub)} served as "${p.designation}" at "${p.company}", and the company has relieved ` +
					`${v.obj} of ${v.pos} services effective closing business hours of ${p.lwd}.`
			: `${cap(v.sub)} resigned from ${v.pos} services as "${p.designation}" at "${p.company}" due to ` +
					`${v.pos} personal reasons, and the company has relieved ${v.obj} effective closing business ` +
					`hours of ${p.lwd}.`
	);
	body(
		ctx,
		`${cap(p.v.sub)} ${p.v.has} a Non-Compete Agreement which precludes ${p.v.obj} from working for an ` +
			`Email List Provider. You can contact us if you need any additional details at ` +
			`"${LETTER_HR_CONTACT.phone}" or ${LETTER_HR_CONTACT.email}.`
	);
	signOff(ctx, p.company);
	return finish(ctx);
}

// ── Intern letters ───────────────────────────────────────────────────────────

/** Tenure paragraph both intern letters close on. */
function tenureClose(ctx: DocCtx, p: Particulars) {
	const { v } = p;
	body(
		ctx,
		`During ${v.pos} tenure with us ${v.sub} ${v.was} found to be sincere, professional and dedicated to ` +
			`the assigned responsibilities. ${cap(v.sub)} contributed significantly to the organization and ` +
			`maintained a positive attitude throughout ${v.pos} service.`
	);
	body(ctx, `We wish ${v.obj} all the best in ${v.pos} future career.`);
}

/** Internship Status Certificate — issued while the internship is still on,
 *  for the intern's college. */
export async function internshipStatusPdf(input: ExitPdfInput): Promise<Uint8Array> {
	const p = particulars(input);
	const { e, v } = p;
	const usn = str(e.letters?.usn);
	const period = str(e.letters?.internshipPeriod);
	const summary = str(e.letters?.workSummary).replace(/[.\s]+$/, '');
	const supervisor = str(e.reportingManager);

	const ctx = await begin(input, 'Internship Status Certificate');
	title(ctx, 'INTERNSHIP STATUS CERTIFICATE', SIZE + 1);
	gap(ctx, 10);
	body(
		ctx,
		`This is to certify that ${p.name}${usn ? ` (USN: ${usn})` : ''} ${v.is} currently working as ` +
			`${article(p.designation)} ${p.designation} at ${p.company}` +
			`${period ? ` for a period of ${period}` : ''}.`
	);

	const involvement = [
		summary ? `During ${v.pos} internship, ${v.sub} ${v.has} been actively involved in ${summary}.` : '',
		supervisor ? `${cap(v.sub)} ${v.is} working under the direct supervision and guidance of ${supervisor}.` : ''
	]
		.filter(Boolean)
		.join(' ');
	if (involvement) body(ctx, involvement);

	body(
		ctx,
		`Throughout ${v.pos} internship tenure, ${v.sub} ${v.has} demonstrated a strong ability to learn, adapt, ` +
			`and apply technical knowledge effectively. ${cap(v.sub)} ${v.has} exhibited good analytical skills, ` +
			`problem-solving abilities, and dedication towards ${v.pos} assigned responsibilities.`
	);
	body(ctx, `This certificate is being issued upon ${v.pos} request for academic purposes.`);
	tenureClose(ctx, p);
	signOff(ctx, p.company);
	return finish(ctx);
}

/** Bonafide Letter — confirms a completed internship, start to end. */
export async function internshipBonafidePdf(input: ExitPdfInput): Promise<Uint8Array> {
	const p = particulars(input);
	const ctx = await begin(input, 'Bonafide Letter');
	title(ctx, 'TO WHOMSOEVER IT MAY CONCERN', SIZE + 1);
	gap(ctx, 10);
	body(
		ctx,
		`This is to certify that ${p.name} ${p.v.was} employed with ${p.company} as ` +
			`${article(p.designation)} ${p.designation} from ${p.doj} to ${p.lwd}.`
	);
	tenureClose(ctx, p);
	signOff(ctx, p.company);
	return finish(ctx);
}
