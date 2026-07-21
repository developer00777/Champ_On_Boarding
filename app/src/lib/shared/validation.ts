// PRD §3 validation rules — pure, individually testable functions.

const VERHOEFF_D = [
	[0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
	[1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
	[2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
	[3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
	[4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
	[5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
	[6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
	[7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
	[8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
	[9, 8, 7, 6, 5, 4, 3, 2, 1, 0]
];
const VERHOEFF_P = [
	[0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
	[1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
	[5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
	[8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
	[9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
	[4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
	[2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
	[7, 0, 4, 6, 9, 1, 3, 2, 5, 8]
];

export function isValidAadhaar(value: string): boolean {
	const digits = value.replace(/\s/g, '');
	if (!/^\d{12}$/.test(digits)) return false;
	let c = 0;
	digits
		.split('')
		.reverse()
		.forEach((ch, i) => {
			c = VERHOEFF_D[c][VERHOEFF_P[i % 8][Number(ch)]];
		});
	return c === 0;
}

export const isValidPan = (v: string) => /^[A-Z]{5}[0-9]{4}[A-Z]$/.test(v.trim().toUpperCase());
export const isValidIfsc = (v: string) => /^[A-Z]{4}0[A-Z0-9]{6}$/.test(v.trim().toUpperCase());
export const isValidPin = (v: string) => /^\d{6}$/.test(v.trim());
export const isValidMobile = (v: string) => /^[6-9]\d{9}$/.test(v.replace(/\D/g, ''));

/** "First letter capital only" — Title Case normalisation per the master sheet. */
export function titleCase(v: string): string {
	return v
		.trim()
		.replace(/\s+/g, ' ')
		.toLowerCase()
		.replace(/(^|[\s.'-])\p{L}/gu, (m) => m.toUpperCase());
}

export interface FieldError {
	field: string;
	message: string;
}

/** Validate the master-sheet fields a candidate submits. Returns blocking errors. */
export function validateMasterSheet(f: Record<string, string>): FieldError[] {
	const errors: FieldError[] = [];
	const req = (field: string, label: string) => {
		if (!f[field]?.trim()) errors.push({ field, message: `${label} is required` });
	};

	req('fullName', 'Full name');
	req('dob', 'Date of birth');
	req('mobile', 'Mobile number');
	req('fatherName', "Father's name");
	req('fatherMobile', "Father's mobile");
	req('motherName', "Mother's name");
	req('presentAddress', 'Present address');
	req('presentPin', 'Present PIN code');
	req('presentHouseNo', 'Present house number');
	req('permanentAddress', 'Permanent address');
	req('permanentPin', 'Permanent PIN code');
	req('permanentHouseNo', 'Permanent house number');
	req('aadhaarNo', 'Aadhaar number');
	req('panNo', 'PAN number');
	req('bankAccountName', 'Employee name as per bank passbook');
	req('bankName', 'Bank name');
	req('accountNo', 'Account number');
	req('accountNoConfirm', 'Reconfirm account number');
	req('ifsc', 'IFSC code');
	req('branch', 'Branch name');
	req('emergencyContactName', 'Emergency contact name');
	req('emergencyContactMobile', 'Emergency contact mobile');
	req('emergencyContactRelation', 'Emergency contact relation');

	if (f.aadhaarNo?.trim() && !isValidAadhaar(f.aadhaarNo))
		errors.push({ field: 'aadhaarNo', message: 'Aadhaar must be 12 digits with a valid checksum' });
	if (f.panNo?.trim() && !isValidPan(f.panNo))
		errors.push({ field: 'panNo', message: 'PAN must match AAAAA9999A' });
	if (f.ifsc?.trim() && !isValidIfsc(f.ifsc))
		errors.push({ field: 'ifsc', message: 'IFSC must match AAAA0XXXXXX' });
	// The reconfirm field exists to catch a mistyped account number at entry, so
	// it is compared and then dropped — never stored. Two copies of the same
	// number in the record could drift apart, leaving neither trustworthy.
	// Spaces are ignored: passbooks print account numbers in groups.
	if (f.accountNo?.trim() && f.accountNoConfirm?.trim()) {
		const strip = (v: string) => v.replace(/\s/g, '');
		if (strip(f.accountNo) !== strip(f.accountNoConfirm))
			errors.push({ field: 'accountNoConfirm', message: 'Account numbers do not match' });
	}
	for (const [field, label] of [
		['presentPin', 'Present PIN'],
		['permanentPin', 'Permanent PIN']
	] as const) {
		if (f[field]?.trim() && !isValidPin(f[field]))
			errors.push({ field, message: `${label} must be 6 digits` });
	}
	for (const [field, label] of [
		['mobile', 'Mobile'],
		['fatherMobile', "Father's mobile"],
		['motherMobile', "Mother's mobile"],
		['emergencyContactMobile', 'Emergency contact mobile']
	] as const) {
		if (f[field]?.trim() && !isValidMobile(f[field]))
			errors.push({ field, message: `${label} must be a 10-digit number starting 6–9` });
	}
	if (f.maritalStatus === 'married') {
		req('spouseName', 'Spouse name');
		req('spouseContact', 'Spouse contact');
	}
	return errors;
}

export function maskAadhaar(last4: string | null): string {
	return last4 ? `XXXX XXXX ${last4}` : '—';
}
