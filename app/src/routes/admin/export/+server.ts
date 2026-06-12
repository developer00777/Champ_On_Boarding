import { desc, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db, t } from '$lib/server/db';
import { decrypt } from '$lib/server/crypto';
import { audit } from '$lib/server/audit';

const esc = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;

// Master-sheet CSV — replaces the manual master sheet, so it carries full values.
// The export itself is audit-logged (PRD §9).
export const GET: RequestHandler = async ({ locals, getClientAddress }) => {
	const rows = await db
		.select({ c: t.candidates, company: t.companies })
		.from(t.candidates)
		.innerJoin(t.companies, eq(t.candidates.companyId, t.companies.id))
		.orderBy(desc(t.candidates.createdAt));

	await audit({
		actor: locals.admin!.email,
		action: 'master_sheet_exported',
		newValue: `${rows.length} rows`,
		ip: getClientAddress()
	});

	const header = [
		'Company', 'Track', 'Status', 'Full Name', 'DOB', 'Gender', 'Email', 'Mobile',
		'Father Name', 'Father Mobile', 'Mother Name', 'Mother Mobile', 'Mother DOB',
		'Marital Status', 'Spouse Name', 'Spouse Contact', 'Spouse DOB',
		'Present Address', 'Present House No', 'Present PIN',
		'Permanent Address', 'Permanent House No', 'Permanent PIN',
		'Aadhaar No', 'PAN No', 'UAN No', 'DL No', 'Passport No',
		'Bank Name', 'Account No', 'IFSC', 'Branch',
		'Submitted At', 'Reviewed At'
	];

	const lines = rows.map(({ c, company }) =>
		[
			company.name, c.track, c.status, c.fullName, c.dob, c.gender, c.email, c.mobile,
			c.fatherName, c.fatherMobile, c.motherName, c.motherMobile, c.motherDob,
			c.maritalStatus, c.spouseName, c.spouseContact, c.spouseDob,
			c.presentAddress, c.presentHouseNo, c.presentPin,
			c.permanentAddress, c.permanentHouseNo, c.permanentPin,
			c.aadhaarNoEncrypted ? decrypt(c.aadhaarNoEncrypted) : '',
			c.panNo, c.uanNo, c.dlNo, c.passportNo,
			c.bankName, c.accountNo, c.ifsc, c.branch,
			c.submittedAt?.toISOString() ?? '', c.reviewedAt?.toISOString() ?? ''
		]
			.map(esc)
			.join(',')
	);

	return new Response([header.map(esc).join(','), ...lines].join('\r\n'), {
		headers: {
			'Content-Type': 'text/csv; charset=utf-8',
			'Content-Disposition': 'attachment; filename="master-sheet.csv"'
		}
	});
};
