import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { Candidate, Company } from '$lib/server/db/schema';
import { decrypt } from '$lib/server/crypto';
import { audit } from '$lib/server/audit';

/** One CSV cell.
 *
 *  Everything is quoted, so a comma, a semicolon or a newline inside an address
 *  stays inside its cell. The leading apostrophe guards the other half: Excel
 *  evaluates a cell opening with = + - or @ as a formula, so an address like
 *  "-12/3, 2nd Cross" arrives as a broken formula rather than an address. */
const esc = (v: unknown) => {
	const raw = String(v ?? '');
	const safe = /^[=+\-@]/.test(raw) ? `'${raw}` : raw;
	return `"${safe.replace(/"/g, '""')}"`;
};

export const GET: RequestHandler = async ({ locals, getClientAddress }) => {
	if (!locals.admin) error(401, 'Not authenticated');

	const candidates = await Candidate.find().sort({ createdAt: -1 }).lean();
	const companyIds = [...new Set(candidates.map((c) => String(c.companyId)))];
	const companies = await Company.find({ _id: { $in: companyIds } }).lean();
	const companyMap = Object.fromEntries(companies.map((c) => [String(c._id), c.name]));

	await audit({
		actor: locals.admin!.email,
		action: 'master_sheet_exported',
		newValue: `${candidates.length} rows`,
		ip: getClientAddress()
	});

	const header = [
		'Company', 'Track', 'Status', 'Full Name', 'DOB', 'Gender', 'Email', 'Mobile',
		'Father Name', 'Father Mobile', 'Father DOB', 'Mother Name', 'Mother Mobile', 'Mother DOB',
		'Marital Status', 'Spouse Name', 'Spouse Contact', 'Spouse DOB',
		'Emergency Contact Name', 'Emergency Contact Mobile', 'Emergency Contact Relation',
		'Present Address', 'Present House No', 'Present PIN',
		'Permanent Address', 'Permanent House No', 'Permanent PIN',
		'Aadhaar No', 'PAN No', 'UAN No', 'DL No', 'Passport No', 'LinkedIn ID',
		'Name As Per Passbook', 'Bank Name', 'Account No', 'IFSC', 'Branch',
		'Prev Company', 'Prev Employee ID', 'Prev DOJ', 'Prev DOL', 'Prev Designation',
		'Prev Remuneration PA', 'Prev Supervisor', 'Prev Reason For Leaving', 'Prev HR Email',
		'Submitted At', 'Reviewed At'
	];

	const lines = candidates.map((c) =>
		[
			companyMap[String(c.companyId)] ?? '',
			c.track, c.status, c.fullName, c.dob, c.gender, c.email, c.mobile,
			c.fatherName, c.fatherMobile, c.fatherDob, c.motherName, c.motherMobile, c.motherDob,
			c.maritalStatus, c.spouseName, c.spouseContact, c.spouseDob,
			c.emergencyContactName, c.emergencyContactMobile, c.emergencyContactRelation,
			c.presentAddress, c.presentHouseNo, c.presentPin,
			c.permanentAddress, c.permanentHouseNo, c.permanentPin,
			c.aadhaarNoEncrypted ? decrypt(c.aadhaarNoEncrypted) : '',
			c.panNo, c.uanNo, c.dlNo, c.passportNo, c.linkedinId,
			c.bankAccountName, c.bankName, c.accountNo, c.ifsc, c.branch,
			c.prevCompanyName, c.prevEmployeeId, c.prevDoj, c.prevDol, c.prevDesignation,
			c.prevRemuneration, c.prevSupervisor, c.prevReasonLeaving, c.prevHrEmail,
			c.submittedAt?.toISOString() ?? '',
			c.reviewedAt?.toISOString() ?? ''
		]
			.map(esc)
			.join(',')
	);

	// A UTF-8 BOM and an explicit separator hint, because this file is opened in
	// Excel, not parsed by a script. Without the BOM Excel guesses the codepage
	// and mangles anything non-ASCII in a name or address; without "sep=," it uses
	// the machine's list separator, which on an Indian or European install is a
	// semicolon — every row then lands in one column, and an address containing a
	// semicolon looks like it broke the export.
	const body = '\uFEFF' + ['sep=,', header.map(esc).join(','), ...lines].join('\r\n');

	return new Response(body, {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': 'attachment; filename="master-sheet.csv"'
		}
	});
};
