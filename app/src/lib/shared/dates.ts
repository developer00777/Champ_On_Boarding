// Conversions between the app's canonical "DD/MM/YYYY" storage strings (used
// for offer-letter dates) and the ISO "YYYY-MM-DD" a native <input type="date">
// speaks. Keeping the storage format unchanged means offer-letter document
// generation never has to care that the UI switched to a date picker.

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DAY_FIRST_RE = /^(\d{1,2})[/\-.](\d{1,2})[/\-.](\d{4})$/;

/** Parse a stored joining-date string into ISO "YYYY-MM-DD" for pre-filling a
 *  native date input, or null if unparseable. Accepts day-first D/M/YYYY with
 *  '/', '-', or '.' separators (this form's long-standing "DD/MM/YYYY"
 *  placeholder convention) and already-ISO "YYYY-MM-DD". Returns null rather
 *  than guessing on anything else (e.g. "5 July 2026" from old free-text
 *  entries), so legacy unparseable values show a blank picker instead of a
 *  wrong date. */
export function toIsoDate(value: string | null | undefined): string | null {
	const v = (value ?? '').trim();
	if (!v) return null;

	if (ISO_RE.test(v)) return v;

	const m = DAY_FIRST_RE.exec(v);
	if (!m) return null;
	const day = Number(m[1]);
	const month = Number(m[2]);
	const year = Number(m[3]);
	if (month < 1 || month > 12 || day < 1 || day > 31) return null;

	return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
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

/** Today's date as "DD/MM/YYYY", computed explicitly in IST rather than
 *  relying on the server process's local TZ (unset in Dockerfile/
 *  docker-compose.yml, defaults to UTC — a real day-boundary bug otherwise,
 *  since HR operates in IST). */
export function todayDDMMYYYYInIST(): string {
	return new Date().toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata' });
}
