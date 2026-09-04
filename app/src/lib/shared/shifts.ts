// The three shifts the roster runs. HR picks one per candidate; the label is
// what IT reads in the System & VPN mail's Shift Timing column, so these
// strings are the stored value — not a code that needs translating later.
export const SHIFT_TIMINGS = ['Flexible', 'General', 'Night Shift'] as const;

export type ShiftTiming = (typeof SHIFT_TIMINGS)[number];

/** True for the three current options. Legacy records predate the fixed list
 *  and may hold free text ("2:00 PM - 11:00 PM IST"), which stays readable
 *  everywhere but no longer round-trips through the picker. */
export function isShiftTiming(v: string | null | undefined): v is ShiftTiming {
	return !!v && (SHIFT_TIMINGS as readonly string[]).includes(v);
}

/** Mode, as IT reads it in the System & VPN mail: how the person is engaged,
 *  which is what IT provisions against. Freshers and experienced hires are both
 *  simply full-time staff as far as IT is concerned, so both tracks map to the
 *  one value; the other three tracks are their own kind of engagement. HR can
 *  still override per candidate. */
export const TRACK_MODE: Record<string, string> = {
	intern: 'Intern',
	fresher: 'Full-time',
	experienced: 'Full-time',
	consultant: 'Consultant',
	contract: 'Contract'
};

/** The only Mode values HR can pick. Deliberately short: IT asked for the four
 *  engagement types and nothing else, so this is a closed dropdown rather than
 *  the free-text-with-suggestions it used to be. "Full-time" is spelt as
 *  EMPLOYMENT_TYPE_LABELS spells it, so the two never read differently. */
export const MODE_OPTIONS = ['Intern', 'Full-time', 'Consultant', 'Contract'] as const;

/** Values retired from MODE_OPTIONS, mapped onto their replacement. Records
 *  saved before the list was narrowed still carry these, and a dropdown that
 *  simply dropped them would blank the field on the next save. */
const RETIRED_MODES: Record<string, string> = {
	Fresher: 'Full-time',
	Experienced: 'Full-time',
	'Full Time': 'Full-time',
	Fulltime: 'Full-time'
};

/** The Mode to show for a stored value. Anything already valid passes through,
 *  a retired label is upgraded, and anything else HR typed back when the field
 *  was free text (New Joinee, Replacement, Rehire, Transfer) is returned as-is
 *  so the dropdown can offer it rather than silently discarding their entry. */
export function normaliseMode(stored: string | null | undefined): string {
	const v = (stored ?? '').trim();
	if (!v) return '';
	if ((MODE_OPTIONS as readonly string[]).includes(v)) return v;
	return RETIRED_MODES[v] ?? v;
}
