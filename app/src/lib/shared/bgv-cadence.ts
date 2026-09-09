// How hard to chase one previous employer for a BGV reply.
//
// The cadence is per candidate, not org-wide: a former employer who answers
// within a day and one who needs weekly nudging for a month are the same
// screen but not the same problem, and the recruiter working the case is the
// only person who knows which is which. So these are defaults a fresh request
// starts from, not a policy — HR changes them on the BGV record itself.
//
// Pure constants, no server imports: the schema seeds new requests from them,
// the reminder engine resolves against them, and the BGV page renders its
// number inputs from the same bounds.

export interface BgvCadence {
	/** Whether this candidate's request is chased automatically at all. */
	enabled: boolean;
	/** Days between reminders, counted from the last mail actually sent. */
	everyDays: number;
	/** Reminders this request may send before it gives up and waits for HR.
	 *  The original request is not a reminder and does not count. */
	maxReminders: number;
}

export const BGV_CADENCE_DEFAULTS: BgvCadence = {
	enabled: true,
	// Three days: long enough that a busy HR desk has had a working day or two
	// to answer, short enough that a 5-reminder run still finishes inside three
	// weeks — the window a joining date usually leaves for verification.
	everyDays: 3,
	maxReminders: 5
};

/** A 0-day cadence would mail the employer on every sweep, and an unbounded
 *  run would never stop chasing someone who has decided not to answer. */
export const BGV_CADENCE_BOUNDS = {
	everyDays: { min: 1, max: 30 },
	maxReminders: { min: 1, max: 20 }
} as const;

export function clampCadenceInt(value: unknown, fallback: number, min: number, max: number): number {
	const n = Math.round(Number(value));
	if (!Number.isFinite(n)) return fallback;
	return Math.min(max, Math.max(min, n));
}

/** The cadence actually in force for a request. Stored values are nullable so
 *  a request created before per-candidate cadence existed — or one HR has
 *  never touched — still resolves to the defaults rather than to zero. */
export function resolveCadence(bgv: {
	remindersEnabled?: boolean | null;
	reminderEveryDays?: number | null;
	reminderMaxCount?: number | null;
}): BgvCadence {
	return {
		enabled: bgv.remindersEnabled !== false,
		everyDays: clampCadenceInt(
			bgv.reminderEveryDays ?? BGV_CADENCE_DEFAULTS.everyDays,
			BGV_CADENCE_DEFAULTS.everyDays,
			BGV_CADENCE_BOUNDS.everyDays.min,
			BGV_CADENCE_BOUNDS.everyDays.max
		),
		maxReminders: clampCadenceInt(
			bgv.reminderMaxCount ?? BGV_CADENCE_DEFAULTS.maxReminders,
			BGV_CADENCE_DEFAULTS.maxReminders,
			BGV_CADENCE_BOUNDS.maxReminders.min,
			BGV_CADENCE_BOUNDS.maxReminders.max
		)
	};
}
