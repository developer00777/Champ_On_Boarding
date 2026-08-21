// Religion and mother tongue option lists.
//
// Both are mandatory Master Tracker columns (see validation.ts), so both the
// candidate form and HR's profile editor pick from the same lists here — HR
// correcting a value should produce a string the sheet already contains, not a
// second spelling of it.
//
// Religion is a closed select: the sheet is filtered and counted on it, and
// free text there becomes "Hindu"/"hindu"/"Hinduism" in three rows. `Other`
// covers everything the list misses. Now that the field is required there is
// deliberately no "Prefer not to say" — an optional field with an opt-out and a
// mandatory field are different promises, and HR chose the latter.
export const RELIGIONS = [
	'Hindu',
	'Muslim',
	'Christian',
	'Sikh',
	'Buddhist',
	'Jain',
	'Parsi',
	'Jewish',
	'Other'
] as const;

// Mother tongue stays a free-text input with this as a datalist: India has far
// more languages than any list HR would maintain, so the suggestions cover the
// common answers and typing your own still works. Values are Title Cased on
// save (see formToFields), which keeps hand-typed answers matching these.
export const MOTHER_TONGUES = [
	'Assamese',
	'Bengali',
	'Bhojpuri',
	'English',
	'Gujarati',
	'Hindi',
	'Kannada',
	'Kashmiri',
	'Konkani',
	'Maithili',
	'Malayalam',
	'Marathi',
	'Meitei',
	'Nepali',
	'Odia',
	'Punjabi',
	'Rajasthani',
	'Sanskrit',
	'Santali',
	'Sindhi',
	'Tamil',
	'Telugu',
	'Tulu',
	'Urdu'
] as const;
