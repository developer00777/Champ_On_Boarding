// The exit details each offboarding mail prints, checked before it is sent.
//
// Kept apart from the mail settings on purpose: those say who a mail goes to,
// these are what it says about the employee (employee code, last working day,
// team…). A detail that is blank — or still holds a placeholder someone typed
// to get past a form, like "demo", "test", "xxx" or "0000" — stops the send,
// and the review dialog asks HR for it there and then (HR decision, Nov 2026).

export type ExitDetailField = 'fullName' | 'employeeId' | 'lwd' | 'department' | 'personalEmail' | 'refNo';

export const EXIT_DETAIL_LABELS: Record<ExitDetailField, string> = {
	fullName: 'Employee name',
	employeeId: 'Employee code',
	lwd: 'Last working day',
	department: 'Team / department',
	personalEmail: 'Personal email',
	refNo: 'Reference number'
};

/** The details each mail prints, keyed like the review dialog's steps.
 *  Personal email and reference number are optional on the exit itself and
 *  can be filled in any time; only the mails that need them ask for them. */
export const MAIL_DETAILS: Record<string, ExitDetailField[]> = {
	itblock: ['employeeId', 'fullName', 'lwd', 'department'],
	manager: ['employeeId', 'fullName', 'lwd'],
	it: ['employeeId', 'fullName', 'lwd'],
	salesforce: ['employeeId', 'fullName', 'lwd'],
	payroll: ['employeeId', 'fullName', 'lwd'],
	forms: ['fullName', 'personalEmail'],
	docs: ['fullName', 'personalEmail'],
	// The final release. With letters in it, the reference number they print
	// is needed too; a release of uploaded documents only ('handover') skips it.
	letters: ['fullName', 'personalEmail', 'employeeId', 'lwd', 'refNo'],
	handover: ['fullName', 'personalEmail', 'employeeId', 'lwd']
};

const PLACEHOLDER_WORDS = new Set([
	'demo', 'test', 'testing', 'sample', 'dummy', 'example', 'placeholder', 'temp', 'tmp', 'fake',
	'xxx', 'xx', 'x', 'na', 'n/a', 'nil', 'none', 'null', 'undefined', 'tbd', 'tba', 'tbc', 'pending',
	'abc', 'abcd', 'xyz', 'asdf', 'qwerty', 'lorem', 'lorem ipsum', 'foo', 'bar', 'name', 'employee',
	'-', '--', '—', '.', '?', '0', '00', '000', '123', '1234', '12345', '123456'
]);

/** Whether a filled-in value is really a stand-in. Deliberately narrow — a
 *  false alarm only asks HR to confirm, but it should still be rare. */
export function looksLikePlaceholder(raw: string | null | undefined): boolean {
	const v = String(raw ?? '').trim().toLowerCase();
	if (!v) return false;
	if (PLACEHOLDER_WORDS.has(v)) return true;
	// Words like "demo", "test" or "dummy" on their own or as a prefix:
	// "Test User", "demo123", "dummy-emp".
	if (/^(demo|test|dummy|sample|fake|placeholder|xxx+)\b|^(demo|test|dummy|sample|fake)\d*$/.test(v)) return true;
	// One character repeated: "0000", "aaaa", "xxxxx", "1111".
	if (v.length >= 3 && /^(.)\1+$/.test(v.replace(/[\s\-_/.]/g, ''))) return true;
	// A code that is only a prefix and zeros: "EMP0000", "CIPL-000".
	if (/^[a-z]{0,6}[-_/]?0{3,}$/.test(v)) return true;
	// Placeholder addresses.
	if (v.includes('@')) {
		const [local, domain = ''] = v.split('@');
		if (/^(example|test|demo|dummy|sample|mailinator)\./.test(domain) || ['test', 'demo', 'dummy', 'sample', 'abc', 'xyz'].includes(local))
			return true;
	}
	return false;
}

export interface DetailCheck {
	field: ExitDetailField;
	label: string;
	value: string;
	/** Why it stops the send, or null when it is fine. */
	problem: 'missing' | 'placeholder' | null;
}

/** The team the IT mail prints: the department, else the division. */
function valueOf(exit: Record<string, unknown>, field: ExitDetailField): string {
	if (field === 'department') return String(exit.department || exit.division || '').trim();
	if (field === 'refNo')
		return String(exit.refNo || (exit.letters as { refNo?: string } | undefined)?.refNo || '').trim();
	return String(exit[field] ?? '').trim();
}

export function checkMailDetails(exit: Record<string, unknown>, key: string): DetailCheck[] {
	return (MAIL_DETAILS[key] ?? []).map((field) => {
		const value = valueOf(exit, field);
		return {
			field,
			label: EXIT_DETAIL_LABELS[field],
			value,
			problem: !value ? 'missing' : looksLikePlaceholder(value) ? 'placeholder' : null
		};
	});
}

/** One line for the dialog and for a refused send, or null when all is well. */
export function detailsProblem(checks: DetailCheck[]): string | null {
	const bad = checks.filter((c) => c.problem);
	if (!bad.length) return null;
	return `Fill in before sending: ${bad
		.map((c) => (c.problem === 'placeholder' ? `${c.label} (“${c.value}” looks like a placeholder)` : c.label))
		.join(', ')}.`;
}
