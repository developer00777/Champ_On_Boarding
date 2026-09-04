// Conversions between the app's canonical "DD/MM/YYYY" storage strings (used
// for offer-letter dates) and the ISO "YYYY-MM-DD" a native <input type="date">
// speaks. Keeping the storage format unchanged means offer-letter document
// generation never has to care that the UI switched to a date picker.
//
// joiningDate was free text before the native date picker landed, so
// pre-existing records may still hold whatever HR typed — "03-Aug-26",
// "30 July 2026", etc. — instead of the canonical format. Every reader of
// this field (the date-picker prefill below, and the "joining today" match
// in admin/+page.server.ts) goes through parseStoredDate so old records
// keep working without a one-off data migration.

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_FIRST_RE = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/;
const MONTH_NAME_RE = /^(\d{1,2})[\s\-](jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*[\s\-](\d{2}|\d{4})$/i;
const MONTH_INDEX: Record<string, number> = {
	jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
	jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12
};

/** Parse any stored joining-date string into a {year, month, day} triple
 *  (month 1-12), or null if unparseable. Handles the canonical zero-padded
 *  "DD/MM/YYYY", already-ISO "YYYY-MM-DD", and legacy free-text formats this
 *  field held before the native date picker existed: day-first with '/', '-'
 *  or '.' separators, and day-month-name-year ("03-Aug-26", "30 July 2026")
 *  with 2- or 4-digit years. A 2-digit year is assumed 20xx — this field only
 *  ever holds near-term onboarding dates. */
export function parseStoredDate(
	value: string | null | undefined
): { year: number; month: number; day: number } | null {
	const v = (value ?? '').trim();
	if (!v) return null;

	const iso = ISO_RE.exec(v);
	if (iso) {
		const [, year, month, day] = iso;
		return { year: Number(year), month: Number(month), day: Number(day) };
	}

	const dayFirst = DAY_FIRST_RE.exec(v);
	if (dayFirst) {
		const day = Number(dayFirst[1]);
		const month = Number(dayFirst[2]);
		const year = Number(dayFirst[3]);
		if (month < 1 || month > 12 || day < 1 || day > 31) return null;
		return { year, month, day };
	}

	const monthName = MONTH_NAME_RE.exec(v);
	if (monthName) {
		const day = Number(monthName[1]);
		const month = MONTH_INDEX[monthName[2].toLowerCase()];
		const yearRaw = monthName[3];
		const year = yearRaw.length === 2 ? 2000 + Number(yearRaw) : Number(yearRaw);
		if (day < 1 || day > 31) return null;
		return { year, month, day };
	}

	return null;
}

/** Parse a stored joining-date string into ISO "YYYY-MM-DD" for pre-filling a
 *  native date input, or null if unparseable. */
export function toIsoDate(value: string | null | undefined): string | null {
	const parsed = parseStoredDate(value);
	if (!parsed) return null;
	return `${parsed.year}-${String(parsed.month).padStart(2, '0')}-${String(parsed.day).padStart(2, '0')}`;
}

/** Format an ISO "YYYY-MM-DD" (what a native date input submits) into the
 *  canonical zero-padded "DD/MM/YYYY" storage string this app has always
 *  used. Returns '' for empty/invalid input. */
export function isoToDDMMYYYY(iso: string | null | undefined): string {
	const v = (iso ?? '').trim();
	const m = ISO_RE.exec(v);
	if (!m) return v; // not ISO — leave whatever was submitted untouched
	const [, year, month, day] = m;
	return `${day}/${month}/${year}`;
}

const MONTH_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** A stored date as "2-Sep-2026" — day unpadded, month abbreviated. The shape
 *  HR writes in mail subjects and IT reads at a glance. Returns '' when the
 *  stored value cannot be parsed, so a caller can decide what to do about it
 *  rather than printing something misleading. */
export function toDayMonYear(value: string | null | undefined): string {
	const p = parseStoredDate(value);
	if (!p) return '';
	return `${p.day}-${MONTH_SHORT[p.month - 1] ?? p.month}-${p.year}`;
}

/** Today's date as "DD/MM/YYYY", computed explicitly in IST rather than
 *  relying on the server process's local TZ (unset in Dockerfile/
 *  docker-compose.yml, defaults to UTC — a real day-boundary bug otherwise,
 *  since HR operates in IST). */
export function todayDDMMYYYYInIST(): string {
	return new Date().toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata' });
}

/** Today's {year, month, day} in IST, month 1-12 — the same triple shape
 *  parseStoredDate returns, so a joiningDate can be compared against "today"
 *  regardless of which format it was originally stored in. */
export function todayInIST(): { year: number; month: number; day: number } {
	const parts = new Intl.DateTimeFormat('en-CA', {
		timeZone: 'Asia/Kolkata',
		year: 'numeric',
		month: '2-digit',
		day: '2-digit'
	}).formatToParts(new Date());
	const get = (type: string) => Number(parts.find((p) => p.type === type)?.value);
	return { year: get('year'), month: get('month'), day: get('day') };
}

/** True if a stored joiningDate string (in any format parseStoredDate
 *  accepts) falls on today, IST. Unparseable values never match. */
export function isJoiningDateToday(value: string | null | undefined): boolean {
	const parsed = parseStoredDate(value);
	if (!parsed) return false;
	const today = todayInIST();
	return parsed.year === today.year && parsed.month === today.month && parsed.day === today.day;
}
