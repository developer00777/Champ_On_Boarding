import type { RequestHandler } from './$types';
import { error } from '@sveltejs/kit';
import { Candidate, Company } from '$lib/server/db/schema';
import { decrypt } from '$lib/server/crypto';
import { audit } from '$lib/server/audit';
import ExcelJS from 'exceljs';

export const GET: RequestHandler = async ({ params, locals, getClientAddress }) => {
	const candidate = await Candidate.findById(params.id).lean();
	if (!candidate) error(404, 'Candidate not found');

	const company = await Company.findById(candidate.companyId).lean();
	const companyName = company?.name ?? '';

	const aadhaarPlain = candidate.aadhaarNoEncrypted ? decrypt(candidate.aadhaarNoEncrypted) : '';

	await audit({
		candidateId: params.id,
		actor: locals.admin!.email,
		action: 'report_downloaded',
		newValue: candidate.fullName ?? candidate.email,
		ip: getClientAddress()
	});

	const wb = new ExcelJS.Workbook();
	wb.creator = 'Champions Group HR';
	wb.created = new Date();

	// ── Helper styles ─────────────────────────────────────────────────────────
	const sectionFill: ExcelJS.Fill = {
		type: 'pattern',
		pattern: 'solid',
		fgColor: { argb: 'FF1A0533' }
	};
	const sectionFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
	const headerFill: ExcelJS.Fill = {
		type: 'pattern',
		pattern: 'solid',
		fgColor: { argb: 'FF4A0E8F' }
	};
	const headerFont: Partial<ExcelJS.Font> = { bold: true, color: { argb: 'FFFFFFFF' }, size: 9 };
	const dataFont: Partial<ExcelJS.Font> = { size: 9 };
	const thinBorder: Partial<ExcelJS.Borders> = {
		top: { style: 'thin', color: { argb: 'FFD0D0D0' } },
		left: { style: 'thin', color: { argb: 'FFD0D0D0' } },
		bottom: { style: 'thin', color: { argb: 'FFD0D0D0' } },
		right: { style: 'thin', color: { argb: 'FFD0D0D0' } }
	};

	function styleHeader(cell: ExcelJS.Cell, isSection = false) {
		cell.fill = isSection ? sectionFill : headerFill;
		cell.font = isSection ? sectionFont : headerFont;
		cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
		cell.border = thinBorder;
	}

	function styleData(cell: ExcelJS.Cell) {
		cell.font = dataFont;
		cell.alignment = { vertical: 'middle', wrapText: true };
		cell.border = thinBorder;
	}

	// ── Sheet 1: Payroll Tracker ──────────────────────────────────────────────
	const payroll = wb.addWorksheet('Payroll Tracker');

	// Section header row (row 1) — merges matching original layout
	const payrollSections: Array<{ label: string; startCol: number; endCol: number }> = [
		{ label: '', startCol: 1, endCol: 23 },
		{ label: 'Present Address', startCol: 24, endCol: 30 },
		{ label: 'Permanent Address', startCol: 31, endCol: 37 }
	];

	payroll.addRow([]); // row 1 placeholder

	// Row 2 — field headers (61 columns matching original)
	const payrollHeaders = [
		'Sl No.', 'Emp ID', 'Salutation', 'Employee Name', '', '', 'Short Name',
		'Fathers Name', 'Mothers Name', 'Date of Birth', 'Sex', 'Marital Status',
		'Spouse Name', 'Designation', 'Occupation', 'Department', 'Grade', 'Branch',
		'Division', 'Bank Account No.', 'Bank Name', 'Sal Structure', 'Attendance',
		'Res.', 'Res. Name', 'Road/Street', 'Locality/Area', 'City/District', 'State', 'Pincode',
		'Res.', 'Res. Name', 'Road/Street', 'Locality/Area', 'City/District', 'State', 'Pincode',
		'E-Mail ID', 'STD Code', 'Phone', 'Mobile',
		'Date of Joining', 'Salary calculate from', 'Date of leaving', 'Reason for leaving',
		'ESI Applicable', 'ESI No', 'ESI Dispensary',
		'PF Applicable', 'PF No', 'PF No for Dept File', 'Restrict PF', 'Zero Pension', 'Zero PT',
		'PAN', 'Ward/Circle', 'Director', 'UAN NO', 'IFSC Code', 'Aadhar No.', 'Remarks'
	];

	const headerRow = payroll.addRow(payrollHeaders);
	headerRow.height = 30;
	headerRow.eachCell((cell) => styleHeader(cell));

	// Row 3 — candidate data
	const presentAddrParts = (candidate.presentAddress ?? '').split(',');
	const permAddrParts = (candidate.permanentAddress ?? '').split(',');

	const payrollData = [
		1, '', '', candidate.fullName ?? '', '', '', '',
		candidate.fatherName ?? '', candidate.motherName ?? '', candidate.dob ?? '',
		candidate.gender ?? '', candidate.maritalStatus ?? '', candidate.spouseName ?? '',
		'', '', '', '', '', '',
		candidate.accountNo ?? '', candidate.bankName ?? '', '', '',
		// Present address (cols 24-30)
		'', '', presentAddrParts[0]?.trim() ?? '', presentAddrParts[1]?.trim() ?? '',
		presentAddrParts[2]?.trim() ?? '', '', candidate.presentPin ?? '',
		// Permanent address (cols 31-37)
		'', '', permAddrParts[0]?.trim() ?? '', permAddrParts[1]?.trim() ?? '',
		permAddrParts[2]?.trim() ?? '', '', candidate.permanentPin ?? '',
		// Contact
		candidate.email ?? '', '', '', candidate.mobile ?? '',
		'', '', '', '',
		'', '', '',
		'', '', '', '', '', '',
		candidate.panNo ?? '', '', '', candidate.uanNo ?? '', candidate.ifsc ?? '', aadhaarPlain, ''
	];

	const dataRow = payroll.addRow(payrollData);
	dataRow.height = 22;
	dataRow.eachCell((cell) => styleData(cell));

	// Apply section headers to row 1 with merges
	for (const sec of payrollSections) {
		if (sec.label) {
			const cell = payroll.getCell(1, sec.startCol);
			cell.value = sec.label;
			styleHeader(cell, true);
			payroll.mergeCells(1, sec.startCol, 1, sec.endCol);
		}
	}
	payroll.getRow(1).height = 22;

	// Column widths
	payroll.columns.forEach((col, i) => {
		col.width = [4, 8, 8, 22, 8, 8, 16, 20, 20, 14, 8, 14, 20, 18, 14, 16, 8, 14, 14, 18, 18, 14, 12, 6, 14, 20, 16, 18, 8, 10, 6, 14, 20, 16, 18, 8, 10, 24, 8, 14, 14, 14, 14, 14, 22, 6, 14, 16, 6, 14, 16, 10, 10, 10, 14, 14, 10, 14, 14, 16, 14][i] ?? 14;
	});

	payroll.views = [{ state: 'frozen', xSplit: 0, ySplit: 2 }];

	// ── Sheet 2: Master Tracker ───────────────────────────────────────────────
	const master = wb.addWorksheet('Master Tracker');

	const masterHeaders = [
		'Sl.No', 'CIPL Emp Code', 'Emp Code', 'Name Of the Employee', 'Designation',
		'Team and Floor', 'Sub Process / Department', 'Date of Joining', 'Gender',
		'Contact Number', 'Personal E Mail', 'Office Timings', 'Type of Shift',
		'Direct Reporting Authority', 'Dotted Line Reporting Authority', 'Official E Mail',
		'LinkedIn ID', 'Blood Group', 'Date of Birth as per Documents', 'Actual DOB',
		'Father Name', 'DOB', 'Father Contact', 'Mother Name', 'DOB', 'Mother Contact',
		'Religion', 'Mother Tongue', 'Marital Status', 'Spouse Name', 'Spouse D.O.B',
		'Spouse Contact #', 'Date of anniversary',
		'Kids Name#1', 'Date of Birth', 'Kids Name#2', 'Date of Birth', 'Kids Name#3', 'Date of Birth',
		'Present address', 'Permanent Address', 'Date of Confirmation', 'Completed Years at Champions',
		'Contact Name in case of Emergency', 'Contact Number', 'Relation',
		'Under Graduate', 'Graduate', 'Masters', 'Diploma/Others', 'Total Experience in Years',
		'Aadhar Number', 'PAN No', 'UAN Number', 'DL #', 'Voters ID #', 'Passport No',
		'Source/ Referred By', 'Mobile #', 'Personal Bank Account #', 'Name as per bank',
		'Bank Name', 'Bank-IFSC code', 'weekoff'
	];

	const mHeaderRow = master.addRow(masterHeaders);
	mHeaderRow.height = 30;
	mHeaderRow.eachCell((cell) => styleHeader(cell));

	const masterData = [
		1, '', '', candidate.fullName ?? '', '',
		'', '', '', candidate.gender ?? '',
		candidate.mobile ?? '', candidate.email ?? '', '', '',
		'', '', '',
		'', '', candidate.dob ?? '', candidate.dob ?? '',
		candidate.fatherName ?? '', '', candidate.fatherMobile ?? '',
		candidate.motherName ?? '', candidate.motherDob ?? '', candidate.motherMobile ?? '',
		'', '', candidate.maritalStatus ?? '', candidate.spouseName ?? '', candidate.spouseDob ?? '',
		candidate.spouseContact ?? '', '',
		'', '', '', '', '', '',
		candidate.presentAddress ?? '', candidate.permanentAddress ?? '', '', '',
		'', '', '',
		'', '', '', '', '',
		aadhaarPlain, candidate.panNo ?? '', candidate.uanNo ?? '',
		candidate.dlNo ?? '', '', candidate.passportNo ?? '',
		companyName, candidate.mobile ?? '',
		candidate.accountNo ?? '', '', candidate.bankName ?? '', candidate.ifsc ?? '', ''
	];

	const mDataRow = master.addRow(masterData);
	mDataRow.height = 22;
	mDataRow.eachCell((cell) => styleData(cell));

	// Column widths
	master.columns.forEach((col, i) => {
		col.width = [6, 12, 12, 24, 18, 18, 22, 14, 8, 14, 24, 14, 14, 22, 22, 24, 20, 10, 18, 14, 20, 12, 14, 20, 12, 14, 14, 14, 14, 20, 14, 14, 16, 18, 12, 18, 12, 18, 12, 30, 30, 14, 18, 24, 14, 14, 14, 14, 14, 14, 16, 16, 14, 14, 14, 14, 14, 22, 14, 20, 16, 16, 16, 12][i] ?? 14;
	});

	master.views = [{ state: 'frozen', xSplit: 0, ySplit: 1 }];

	// ── Summary sheet ─────────────────────────────────────────────────────────
	const summary = wb.addWorksheet('Summary');
	summary.views = [{ showGridLines: false }];

	const summaryRows: Array<[string, string]> = [
		['Field', 'Value'],
		['Full Name', candidate.fullName ?? ''],
		['Email', candidate.email],
		['Mobile', candidate.mobile ?? ''],
		['Track', candidate.track],
		['Company', companyName],
		['Status', candidate.status],
		['Date of Birth', candidate.dob ?? ''],
		['Gender', candidate.gender ?? ''],
		['Marital Status', candidate.maritalStatus ?? ''],
		['Father Name', candidate.fatherName ?? ''],
		['Father Mobile', candidate.fatherMobile ?? ''],
		['Mother Name', candidate.motherName ?? ''],
		['Mother Mobile', candidate.motherMobile ?? ''],
		['Mother DOB', candidate.motherDob ?? ''],
		['Spouse Name', candidate.spouseName ?? ''],
		['Spouse Contact', candidate.spouseContact ?? ''],
		['Spouse DOB', candidate.spouseDob ?? ''],
		['Present Address', candidate.presentAddress ?? ''],
		['Present House No.', candidate.presentHouseNo ?? ''],
		['Present PIN', candidate.presentPin ?? ''],
		['Permanent Address', candidate.permanentAddress ?? ''],
		['Permanent House No.', candidate.permanentHouseNo ?? ''],
		['Permanent PIN', candidate.permanentPin ?? ''],
		['Aadhaar No.', aadhaarPlain],
		['PAN No.', candidate.panNo ?? ''],
		['UAN No.', candidate.uanNo ?? ''],
		['DL No.', candidate.dlNo ?? ''],
		['Passport No.', candidate.passportNo ?? ''],
		['Bank Name', candidate.bankName ?? ''],
		['Account No.', candidate.accountNo ?? ''],
		['IFSC', candidate.ifsc ?? ''],
		['Bank Branch', candidate.branch ?? ''],
		['Submitted At', candidate.submittedAt?.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) ?? ''],
		['Reviewed At', candidate.reviewedAt?.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) ?? ''],
		['Report Generated', new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })]
	];

	for (const [i, [label, value]] of summaryRows.entries()) {
		const row = summary.addRow([label, value]);
		row.height = 22;
		const labelCell = row.getCell(1);
		const valueCell = row.getCell(2);
		if (i === 0) {
			styleHeader(labelCell);
			styleHeader(valueCell);
		} else {
			labelCell.font = { bold: true, size: 10, color: { argb: 'FF4A0E8F' } };
			labelCell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF5F0FF' } };
			labelCell.border = thinBorder;
			labelCell.alignment = { vertical: 'middle' };
			valueCell.font = { size: 10 };
			valueCell.border = thinBorder;
			valueCell.alignment = { vertical: 'middle', wrapText: true };
		}
	}

	summary.getColumn(1).width = 28;
	summary.getColumn(2).width = 45;

	// ── Serialize ─────────────────────────────────────────────────────────────
	const buffer = await wb.xlsx.writeBuffer();
	const safeName = (candidate.fullName ?? candidate.email).replace(/[^a-zA-Z0-9 ]/g, '').trim().replace(/\s+/g, '_');
	const filename = `${safeName}_onboarding_report.xlsx`;

	return new Response(buffer as ArrayBuffer, {
		headers: {
			'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
			'Content-Disposition': `attachment; filename="${filename}"`,
			'Cache-Control': 'no-store'
		}
	});
};
