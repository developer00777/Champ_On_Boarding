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

/** Mode, as IT reads it in the System & VPN mail, follows the candidate's
 *  hiring track — a consultant is onboarded differently from a fresher, and
 *  IT provisions accordingly. HR can still override per candidate (a fresher
 *  filling a vacated seat is a Replacement, not a New Joinee). */
export const TRACK_MODE: Record<string, string> = {
	intern: 'Intern',
	fresher: 'Fresher',
	experienced: 'Experienced',
	consultant: 'Consultant',
	contract: 'Contract'
};

/** The Mode values HR picks from: the five tracks plus the joining reasons
 *  that are independent of track. */
export const MODE_OPTIONS = [
	'Fresher', 'Experienced', 'Consultant', 'Contract', 'Intern',
	'New Joinee', 'Replacement', 'Rehire', 'Transfer'
] as const;
