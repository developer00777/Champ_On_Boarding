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
