// The compensation annexure's shape and its arithmetic.
//
// Lives in shared/ rather than server/offer-letter/ because two callers need
// the same answer: the admin form's live preview in the browser and the PDF
// renderer on the server. It used to be server-only, so the form re-implemented
// the sums by hand — which is exactly how clause 1 and page 4 end up
// disagreeing. Both now call computeAnnexureTotals.

/** A recruiter-added row. The fixed rows below match the signed reference and
 *  are not stored; these are the ones HR adds per offer, so each carries its
 *  own label alongside its amount. */
export interface AnnexureExtra {
	label: string;
	pm: string;
}

/** One row of the annexure is "P.M. figure, P.A. is derived" except the two
 *  rows whose component *name* also varies per offer (bonus scheme / shift
 *  pattern differ by role), so those carry an editable label alongside the
 *  editable amount. Every other fixed row's label is boilerplate matching the
 *  signed reference and is not stored. */
export interface CompensationAnnexure {
	enabled: boolean;
	basicPm: string;
	hraPm: string;
	bonusLabel: string;
	bonusPm: string;
	ltaPm: string;
	shiftLabel: string;
	shiftPm: string;
	specialPm: string;
	pfPm: string;
	gratuityPm: string;
	insurancePm: string;
	foodPm: string;
	/** Variable Pay is not every offer's structure, so it carries its own
	 *  enable flag independent of the annexure's overall `enabled` — HR adds
	 *  or removes it per offer without affecting the rest of the table. When
	 *  on, it renders both as its own cash-component row and as an extra
	 *  "Total Cash Compensation with VP" row (Total Cash Before PF + VP)
	 *  directly below the existing before-PF subtotal. */
	variablePayEnabled: boolean;
	variablePayPm: string;
	/** Rows HR adds beyond the fixed ones, per section. Every pay structure the
	 *  reference covers fits the fixed rows; these exist for the ones it does
	 *  not (a retention bonus, a second insurance, a car allowance) without
	 *  needing a schema change or a deploy each time. */
	extraCash: AnnexureExtra[];
	extraVariable: AnnexureExtra[];
	extraNonCash: AnnexureExtra[];
}

export const DEFAULT_BONUS_LABEL = 'Performance Bonus in Advance';
export const DEFAULT_SHIFT_LABEL = 'Shift Allowances';

export const EMPTY_COMPENSATION_ANNEXURE: CompensationAnnexure = {
	enabled: false,
	basicPm: '',
	hraPm: '',
	bonusLabel: DEFAULT_BONUS_LABEL,
	bonusPm: '',
	ltaPm: '',
	shiftLabel: DEFAULT_SHIFT_LABEL,
	shiftPm: '',
	specialPm: '',
	pfPm: '',
	gratuityPm: '',
	insurancePm: '',
	foodPm: '',
	variablePayEnabled: false,
	variablePayPm: '',
	extraCash: [],
	extraVariable: [],
	extraNonCash: []
};

/** A single computed annexure line: label, P.M. as typed, P.A. derived as
 *  P.M. x 12. Amounts that don't parse as a number are treated as 0 so a
 *  half-filled draft still renders a table instead of throwing. */
export interface AnnexureLine {
	label: string;
	pm: number;
	pa: number;
}

export function annexureNumber(raw: string): number {
	const n = parseFloat((raw ?? '').replace(/[^0-9.]/g, ''));
	return isNaN(n) ? 0 : n;
}

export interface AnnexureTotals {
	cash: AnnexureLine[];
	cashTotalPm: number;
	cashTotalPa: number;
	/** The Variable Pay rows — the fixed one plus anything HR added. Empty when
	 *  Variable Pay is off. Kept out of `cash` so "Total Cash Compensation
	 *  (Before PF)" stays VP-exclusive as its name promises, and "...with VP" is
	 *  a genuinely additional row rather than restating the same subtotal. */
	variablePay: AnnexureLine[];
	/** cashTotal + every variable-pay row — null when Variable Pay is off. */
	cashWithVpTotalPm: number | null;
	cashWithVpTotalPa: number | null;
	nonCash: AnnexureLine[];
	nonCashTotalPm: number;
	nonCashTotalPa: number;
	grandTotalPm: number;
	grandTotalPa: number;
}

/** Only rows with a label are counted. A half-typed extra — an amount with no
 *  name yet — would otherwise print as a nameless row on the certificate and
 *  silently move the totals. */
function extraLines(extras: AnnexureExtra[] | undefined, line: (l: string, p: string) => AnnexureLine) {
	return (extras ?? []).filter((e) => e.label?.trim()).map((e) => line(e.label.trim(), e.pm));
}

/** Derives every P.A. figure and both subtotal/grand-total rows from the P.M.
 *  values HR entered — pure, so the admin form and the PDF renderer compute
 *  from one source of truth and can never disagree. */
export function computeAnnexureTotals(a: CompensationAnnexure): AnnexureTotals {
	const line = (label: string, pmRaw: string): AnnexureLine => {
		const pm = annexureNumber(pmRaw);
		return { label, pm, pa: pm * 12 };
	};

	const cash: AnnexureLine[] = [
		line('Basic Salary', a.basicPm),
		line('House Rent Allowance', a.hraPm),
		line(a.bonusLabel?.trim() || DEFAULT_BONUS_LABEL, a.bonusPm),
		line('LTA', a.ltaPm),
		line(a.shiftLabel?.trim() || DEFAULT_SHIFT_LABEL, a.shiftPm),
		line('Special Allowances', a.specialPm),
		...extraLines(a.extraCash, line)
	];
	const nonCash: AnnexureLine[] = [
		line('PF- Employer Contribution', a.pfPm),
		line('Gratuity', a.gratuityPm),
		line('Insurance', a.insurancePm),
		line('Food, Recreation & Longevity Membership', a.foodPm),
		...extraLines(a.extraNonCash, line)
	];

	const sum = (lines: AnnexureLine[], key: 'pm' | 'pa') => lines.reduce((s, l) => s + l[key], 0);
	const cashTotalPm = sum(cash, 'pm');
	const cashTotalPa = sum(cash, 'pa');
	const nonCashTotalPm = sum(nonCash, 'pm');
	const nonCashTotalPa = sum(nonCash, 'pa');

	// The extra variable rows ride on the same enable flag as the fixed one:
	// Variable Pay is one section, and showing HR's additions while the section
	// is switched off would be a table that contradicts its own heading.
	const variablePay: AnnexureLine[] = a.variablePayEnabled
		? [line('Variable Pay', a.variablePayPm), ...extraLines(a.extraVariable, line)]
		: [];
	const vpPm = sum(variablePay, 'pm');
	const vpPa = sum(variablePay, 'pa');

	return {
		cash,
		cashTotalPm,
		cashTotalPa,
		variablePay,
		cashWithVpTotalPm: variablePay.length ? cashTotalPm + vpPm : null,
		cashWithVpTotalPa: variablePay.length ? cashTotalPa + vpPa : null,
		nonCash,
		nonCashTotalPm,
		nonCashTotalPa,
		grandTotalPm: cashTotalPm + nonCashTotalPm + vpPm,
		grandTotalPa: cashTotalPa + nonCashTotalPa + vpPa
	};
}
