// Time ranges for the candidates list. Shared so the server filters on exactly
// the window the buttons name.

export const RANGE_KEYS = ['day', 'week', 'month', 'quarter', 'year', 'all'] as const;
export type RangeKey = (typeof RANGE_KEYS)[number];

export const RANGE_LABELS: Record<RangeKey, string> = {
	day: 'Today',
	week: 'Week',
	month: 'Month',
	quarter: 'Quarter',
	year: 'Year',
	all: 'All'
};

/** Start of the window, or null for "all". Rolling windows (last 7/30/90/365
 *  days) rather than calendar periods — on the 1st of a month a calendar filter
 *  would show an almost-empty list and read as data loss. `day` is the exception:
 *  "Today" means today, from midnight, which is what that word means to a reader. */
export function rangeStart(range: RangeKey, now: Date = new Date()): Date | null {
	if (range === 'all') return null;
	if (range === 'day') {
		const d = new Date(now);
		d.setHours(0, 0, 0, 0);
		return d;
	}
	const days = { week: 7, month: 30, quarter: 90, year: 365 }[range];
	return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

// ── Custom From/To ───────────────────────────────────────────────────────────
// `?from=YYYY-MM-DD&to=YYYY-MM-DD` picks an exact window instead of one of the
// buttons. Both ends are whole days and inclusive — "to 8 Oct" means up to the
// end of 8 Oct — read in India time, which is where everyone using these lists
// sits, whatever timezone the server happens to run in. Either end may be left
// off for an open-ended window. A from after the to is taken as swapped.

const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Midnight IST at the start of a YYYY-MM-DD day, or null if it is not one. */
function istMidnight(day: string): Date | null {
	if (!ISO_DAY.test(day)) return null;
	const d = new Date(`${day}T00:00:00+05:30`);
	if (isNaN(d.getTime())) return null;
	// Shifted back into IST, a real day reads as itself; 2026-02-31 does not.
	const ist = new Date(d.getTime() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
	return ist === day ? d : null;
}

export interface ListWindow {
	/** The button that is on, or 'custom' when From/To decide the window. */
	range: RangeKey | 'custom';
	/** The From/To as typed (YYYY-MM-DD), echoed back to fill the inputs. */
	fromDay: string;
	toDay: string;
	/** Inclusive start and exclusive end, either null for open-ended. */
	start: Date | null;
	end: Date | null;
}

export function listWindow(params: URLSearchParams, fallback: RangeKey = 'all', now: Date = new Date()): ListWindow {
	let fromDay = params.get('from') ?? '';
	let toDay = params.get('to') ?? '';
	let start = istMidnight(fromDay);
	let endDay = istMidnight(toDay);
	if (!start) fromDay = '';
	if (!endDay) toDay = '';
	if (start && endDay && start > endDay) {
		[start, endDay] = [endDay, start];
		[fromDay, toDay] = [toDay, fromDay];
	}
	if (start || endDay)
		return { range: 'custom', fromDay, toDay, start, end: endDay ? new Date(endDay.getTime() + DAY_MS) : null };

	const raw = params.get('range') as RangeKey | null;
	const range: RangeKey = raw && RANGE_KEYS.includes(raw) ? raw : fallback;
	return { range, fromDay: '', toDay: '', start: rangeStart(range, now), end: null };
}

/** The Mongo condition on a date field for a window, or null for no limit. */
export function windowFilter(w: Pick<ListWindow, 'start' | 'end'>): Record<string, Date> | null {
	if (!w.start && !w.end) return null;
	return { ...(w.start ? { $gte: w.start } : {}), ...(w.end ? { $lt: w.end } : {}) };
}
