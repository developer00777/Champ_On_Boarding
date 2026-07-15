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
