// The trend series as the server sends it only has periods with activity in
// them. Anything that reads "this week" or "versus last week" from it needs the
// quiet periods put back first, or it compares against whichever week last
// had activity — possibly months ago. Shared by the headline tiles on the page
// and the Trends tab, so both read the same calendar.
export interface PeriodRow {
	bucketStart: string;
	created: number;
	opened: number;
	submitted: number;
	approved: number;
}

/** Every period from the first one with activity up to the one containing
 *  today, with zeros for the quiet ones. */
export function fillPeriods<T extends PeriodRow>(trend: T[], bucket: string): PeriodRow[] {
	if (!trend.length) return trend;
	const byKey = new Map<number, PeriodRow>(trend.map((t) => [new Date(t.bucketStart).getTime(), t]));
	const step = (d: Date) => {
		const n = new Date(d);
		if (bucket === 'week') n.setUTCDate(n.getUTCDate() + 7);
		else if (bucket === 'month') n.setUTCMonth(n.getUTCMonth() + 1);
		else if (bucket === 'quarter') n.setUTCMonth(n.getUTCMonth() + 3);
		else n.setUTCFullYear(n.getUTCFullYear() + 1);
		return n;
	};
	const out: PeriodRow[] = [];
	const now = Date.now();
	const lastData = new Date(trend[trend.length - 1].bucketStart).getTime();
	let d = new Date(trend[0].bucketStart);
	// A hard cap keeps a bad date from looping for ever.
	while (out.length < 520) {
		const t = d.getTime();
		if (t > now && t > lastData) break;
		out.push(byKey.get(t) ?? { bucketStart: d.toISOString(), created: 0, opened: 0, submitted: 0, approved: 0 });
		d = step(d);
	}
	return out;
}
