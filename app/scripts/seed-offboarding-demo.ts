// Demo offboardings: one exit at every stage of the exit chain, so the map,
// the F&F card, the release card and the mail settings can be seen working
// without walking a real exit through by hand. Invented people only.
//
// Run:  node scripts/run-vite-node.mjs scripts/seed-offboarding-demo.ts
//
// Every row it creates has an employee ID starting "DEMO-"; running it again
// removes those first, so it always leaves exactly one set. Nothing is mailed —
// state is written directly, and clearance/handover links are minted so the
// map's "Copy link" opens a working approver page.
import mongoose from 'mongoose';
import { connectDb } from '$lib/server/db';
import { Admin, AuditLog, Company, Exit, ExitClearance, ExitToken } from '$lib/server/db/schema';
import { createExitToken } from '$lib/server/offboarding/exit';
import { NDC_SECTION_BY_DEPT, type ClearanceDept } from '$lib/shared/offboarding';

const DAY = 86_400_000;
const ago = (days: number) => new Date(Date.now() - days * DAY);
const ddmmyyyy = (d: Date) => d.toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata' });

await connectDb();
await new Promise((r) => setTimeout(r, 1500)); // let the company seed land

// ── Clear the previous demo set ──────────────────────────────────────────────
const old = await Exit.find({ employeeId: /^DEMO-/ }, '_id').lean();
const oldIds = old.map((o) => o._id);
await Promise.all([
	ExitClearance.deleteMany({ exitId: { $in: oldIds } }),
	ExitToken.deleteMany({ exitId: { $in: oldIds } }),
	Exit.deleteMany({ _id: { $in: oldIds } })
]);
console.log(`[demo] removed ${oldIds.length} previous demo exit(s)`);

const admin = await Admin.findOne({ role: 'super_admin' }).lean();
const company = async (slug: string) => {
	const c = await Company.findOne({ brandSlug: slug }).lean();
	if (!c) throw new Error(`company ${slug} not seeded`);
	return c._id;
};
const infometrics = await company('champion-infometrics');
const cirrologix = await company('cirrologix');
const infratech = await company('champion-infratech');

// ── Building blocks ──────────────────────────────────────────────────────────

const routing = (o: { manager?: string | null; salesforce?: boolean; payroll?: string | null } = {}) => ({
	manager: { email: o.manager === undefined ? 'priya.manager@example.com' : o.manager, name: 'Priya Nair, Product Head' },
	it: { email: 'ithelpdesk@example.com', name: 'IT Helpdesk' },
	salesforce: { email: 'sf.admin@example.com', name: 'Salesforce Admin', enabled: !!o.salesforce },
	hr: { email: 'hrd@example.com', name: 'HR desk' },
	payroll: { email: o.payroll === undefined ? 'payroll@example.com' : o.payroll, name: 'Payroll team' }
});

/** The employee's three forms, filled and submitted. */
const forms = (name: string, at: Date) => ({
	nda: {
		agreementDate: ddmmyyyy(at),
		fullName: name,
		permanentAddress: '42, 3rd Cross, HSR Layout, Bengaluru 560102',
		aadhaarLast4: '4821',
		acceptedAt: at,
		submittedAt: at
	},
	exitInterview: {
		supervisor: 'Priya Nair',
		jobTitle: 'Software Engineer',
		reasonForLeaving: 'Higher studies',
		q1DecideToLeave: 'Admission to a master’s programme abroad.',
		q2MostSatisfying: 'Ownership of real features and a supportive team.',
		q3LeastSatisfying: 'Occasional late releases.',
		q10Workload: 'about_right',
		q14bWouldRecommend: 'most_definitely',
		q15Suggestions: 'More structured onboarding for new joiners.',
		submittedAt: at
	},
	relievingFormalities: {
		resignationInWriting: 'yes',
		commitmentPeriodComplete: 'yes',
		newEmployerOfferSubmitted: 'yes',
		salesApproval: 'na',
		accountingCleared: 'yes',
		hrAlumniEnrolled: 'yes',
		itEmailBackedUp: 'yes',
		futureContactEmail: 'personal@example.com',
		futureContactMobile: '9876543210',
		submittedAt: at
	},
	submittedAt: at
});

/** HR's F&F, as handed to payroll. */
const fnf = (o: { net: string; loan?: boolean; payrollSigned?: Date }) => ({
	salaryDueFrom: '01/10/2026',
	salaryDueTo: '31/10/2026',
	leaveBalanceDays: '6',
	leaveEncashmentAmount: '12,400',
	noticePayRecovery: '0',
	assetRecovery: '0',
	loanOutstanding: o.loan ? '25,000' : null,
	loanRecovery: o.loan ? '25,000' : null,
	loanRemarks: o.loan ? 'Salary advance, Aug 2026' : null,
	otherDeductions: '0',
	netAmount: o.net,
	settlementDate: '15/11/2026',
	approvedBy: 'Finance Controller',
	...(o.payrollSigned
		? { submittedByPayrollAt: o.payrollSigned, submittedByPayrollName: 'Ravi (Payroll)' }
		: {})
});

interface Seed {
	tag: string;
	name: string;
	track: string;
	companyId: unknown;
	designation: string;
	salutation: string;
	status: string;
	submitted?: boolean;
	accepted?: boolean;
	chain?: boolean;
	signed?: ClearanceDept[];
	sent?: ClearanceDept | null;
	hrDone?: boolean;
	payrollSigned?: boolean;
	route?: Parameters<typeof routing>[0];
	fnf?: ReturnType<typeof fnf>;
	flow?: Record<string, unknown>;
	letters?: Record<string, unknown>;
	released?: string[];
	/** The `sent` step was signed, then HR sent it back asking for these. */
	sentBack?: { items: string[]; uploads: string[]; note: string };
	/** HR has asked the employee for these documents again (EXIT_UPLOAD_DOCS keys). */
	askDocs?: string[];
}

let n = 0;
async function seed(s: Seed) {
	n++;
	const employeeId = `DEMO-${String(n).padStart(2, '0')}`;
	const at = ago(12 - Math.min(n, 10));
	const exit = await Exit.create({
		companyId: s.companyId,
		employeeId,
		refNo: `Ref\\2026\\RL\\DEMO-${String(100 + n)}`,
		fullName: s.name,
		personalEmail: `${s.name.toLowerCase().replace(/[^a-z]+/g, '.')}@example.com`,
		personalMobile: '9876543210',
		resignationDate: ddmmyyyy(ago(40)),
		lwd: ddmmyyyy(ago(5)),
		doj: s.track === 'intern' ? ddmmyyyy(ago(185)) : '25/03/2024',
		designation: s.designation,
		department: 'Technology',
		team: 'Platform',
		reportingManager: 'Priya Nair, Product Head',
		track: s.track,
		letters: { salutation: s.salutation, ...(s.letters ?? {}) },
		routing: routing(s.route),
		flow: {
			releaseAfterDays: 30,
			autoRelease: true,
			...(s.chain ? { startedAt: at } : {}),
			...(s.hrDone ? { hrNotifiedAt: at, hrDoneAt: at, hrDoneBy: admin?.email ?? 'hr@example.com' } : {}),
			...(s.flow ?? {})
		},
		...(s.submitted ? forms(s.name, at) : {}),
		...(s.accepted ? { reviewedAt: at, reviewedBy: admin?._id ?? null } : {}),
		...(s.fnf ? { fnf: s.fnf } : {}),
		status: s.status,
		createdBy: admin?._id ?? null
	});
	const id = String(exit._id);

	// Signed clearances, every row answered "no dues".
	for (const dept of s.signed ?? []) {
		const section = NDC_SECTION_BY_DEPT.get(dept);
		const r = (s.route ?? {}) as Record<string, string | null | undefined>;
		await ExitClearance.create({
			exitId: exit._id,
			department: dept,
			approverEmail: (dept === 'manager' ? r.manager : null) ?? `${dept}@example.com`,
			approverName: `${dept === 'it' ? 'IT' : dept[0].toUpperCase() + dept.slice(1)} approver`,
			rows: Object.fromEntries((section?.rows ?? []).map((row) => [row.key, 'no_dues'])),
			verdict: 'no_dues',
			status: 'completed',
			sentAt: at,
			sentCount: 1,
			completedAt: new Date(at.getTime() + 2 * 3600_000)
		});
	}
	// The step currently with someone: mailed, not yet signed, with a live link.
	if (s.sent) {
		const row = await ExitClearance.create({
			exitId: exit._id,
			department: s.sent,
			approverEmail: `${s.sent}@example.com`,
			approverName: null,
			status: 'sent',
			sentAt: ago(1),
			sentCount: s.sentBack ? 2 : 1,
			...(s.sentBack
				? {
						approverName: 'Manager approver',
						rows: Object.fromEntries(
							(NDC_SECTION_BY_DEPT.get(s.sent)?.rows ?? []).map((row) => [row.key, 'no_dues'])
						),
						verdict: 'no_dues',
						sendBack: { ...s.sentBack, at: ago(1), by: admin?.email ?? 'hr@example.com' }
					}
				: {})
		});
		await createExitToken(id, 'clearance', String(row._id));
	}
	if (s.askDocs?.length) {
		await Exit.findByIdAndUpdate(id, {
			requestedFields: s.askDocs.map((d) => ({
				field: `upload.${d}`,
				note: d === 'signature' ? 'The signature photo is too dark to print — please retake it on white paper.' : null
			}))
		});
		await createExitToken(id, 'forms');
	}
	if (s.released) {
		await createExitToken(id, 'handover');
		await Exit.findByIdAndUpdate(id, {
			'flow.releasedAt': ago(1),
			'flow.releasedBy': 'Scheduled release',
			'flow.letterKeys': s.released,
			completedAt: ago(1),
			handoverMailSentAt: ago(1)
		});
	}
	console.log(`[demo] ${employeeId}  ${s.tag}`);
}

// ── The cases, in chain order ────────────────────────────────────────────────

await seed({ tag: 'Just created — forms link not sent', name: 'Aarav Mehta', track: 'experienced', companyId: infometrics, designation: 'Software Engineer', salutation: 'Mr.', status: 'initiated' });
await seed({ tag: 'Employee filling their forms', name: 'Diya Sharma', track: 'fresher', companyId: infometrics, designation: 'Associate Analyst', salutation: 'Ms.', status: 'in_progress' });
await seed({ tag: 'Submitted — waiting for HR to accept', name: 'Kabir Rao', track: 'experienced', companyId: cirrologix, designation: 'QA Engineer', salutation: 'Mr.', status: 'submitted', submitted: true });
await seed({ tag: 'Chain: manager mail ready — review & send', name: 'Farhan Ali', track: 'experienced', companyId: infometrics, designation: 'Research Analyst', salutation: 'Mr.', status: 'clearances', submitted: true, accepted: true, chain: true });
await seed({ tag: 'Chain: with the reporting manager', name: 'Ananya Iyer', track: 'experienced', companyId: infometrics, designation: 'Data Analyst', salutation: 'Ms.', status: 'clearances', submitted: true, accepted: true, chain: true, sent: 'manager' });
await seed({ tag: 'Chain: held — no manager email set', name: 'Rohan Gupta', track: 'contract', companyId: infratech, designation: 'Site Engineer', salutation: 'Mr.', status: 'clearances', submitted: true, accepted: true, chain: true, route: { manager: null } });
await seed({ tag: 'Sent back: manager asked for a KT document', name: 'Neha Verma', track: 'experienced', companyId: infometrics, designation: 'Account Manager', salutation: 'Ms.', status: 'clearances', submitted: true, accepted: true, chain: true, sent: 'manager', sentBack: { items: ['Knowledge Transfer completed successfully'], uploads: ['KT handover sheet'], note: 'Please attach the KT sheet the team signed.' } });
await seed({ tag: 'Employee asked to re-upload signature (mid-chain)', name: 'Rahul Shetty', track: 'experienced', companyId: cirrologix, designation: 'Support Engineer', salutation: 'Mr.', status: 'clearances', submitted: true, accepted: true, chain: true, signed: ['manager'], askDocs: ['signature', 'new_employer_offer'] });
await seed({ tag: 'Chain: with IT (manager signed)', name: 'Meera Pillai', track: 'experienced', companyId: infometrics, designation: 'UI Designer', salutation: 'Ms.', status: 'clearances', submitted: true, accepted: true, chain: true, signed: ['manager'], sent: 'it' });
await seed({ tag: 'Chain: with Salesforce (sales hire)', name: 'Vikram Singh', track: 'experienced', companyId: infometrics, designation: 'Lead Generation Executive', salutation: 'Mr.', status: 'clearances', submitted: true, accepted: true, chain: true, route: { salesforce: true }, signed: ['manager', 'it'], sent: 'salesforce' });
await seed({ tag: "Chain: HR's turn — fill the F&F", name: 'Ishita Bose', track: 'experienced', companyId: cirrologix, designation: 'Business Analyst', salutation: 'Ms.', status: 'cleared', submitted: true, accepted: true, chain: true, signed: ['manager', 'it'], flow: { hrNotifiedAt: ago(1) } });
await seed({ tag: 'Chain: intern at HR’s turn', name: 'Nikhil Joshi', track: 'intern', companyId: infometrics, designation: 'Software Developer Intern', salutation: 'Mr.', status: 'cleared', submitted: true, accepted: true, chain: true, signed: ['manager', 'it'], flow: { hrNotifiedAt: ago(1) }, letters: { usn: 'ENG22CT0099', internshipPeriod: 'six months', workSummary: 'working on the Ampliz platform, contributing to frontend development and API integration' } });
await seed({ tag: 'Chain: with payroll (HR filled F&F + loan)', name: 'Sneha Kulkarni', track: 'experienced', companyId: infometrics, designation: 'Senior Engineer', salutation: 'Mrs.', status: 'fnf', submitted: true, accepted: true, chain: true, signed: ['manager', 'it'], hrDone: true, sent: 'payroll', fnf: fnf({ net: '84,200', loan: true }) });
await seed({ tag: 'Chain: payroll email missing', name: 'Arjun Nair', track: 'fresher', companyId: infratech, designation: 'Graduate Engineer Trainee', salutation: 'Mr.', status: 'fnf', submitted: true, accepted: true, chain: true, signed: ['manager', 'it'], hrDone: true, route: { payroll: null }, fnf: fnf({ net: '31,500' }) });
await seed({ tag: 'Payroll signed — letters scheduled in 29 days', name: 'Pooja Reddy', track: 'experienced', companyId: infometrics, designation: 'Product Analyst', salutation: 'Ms.', status: 'fnf', submitted: true, accepted: true, chain: true, signed: ['manager', 'it', 'payroll'], hrDone: true, fnf: fnf({ net: '62,750', loan: true, payrollSigned: ago(1) }), flow: { scheduledAt: new Date(Date.now() + 29 * DAY) } });
await seed({ tag: 'Payroll signed — manual release (auto off)', name: 'Karan Malhotra', track: 'consultant', companyId: cirrologix, designation: 'Consultant — Cloud', salutation: 'Mr.', status: 'fnf', submitted: true, accepted: true, chain: true, signed: ['manager', 'it', 'payroll'], hrDone: true, fnf: fnf({ net: '40,000', payrollSigned: ago(2) }), flow: { autoRelease: false } });
await seed({ tag: 'Chain: IT mail failed to send (error shown)', name: 'Tanvi Desai', track: 'experienced', companyId: infometrics, designation: 'DevOps Engineer', salutation: 'Ms.', status: 'clearances', submitted: true, accepted: true, chain: true, signed: ['manager'], flow: { lastError: { step: 'it', message: 'The IT team mail to ithelpdesk@example.com could not be sent. Check the address, then Review & send again.', at: ago(0) } } });
await seed({ tag: 'Released — relieving letter sent, exit closed', name: 'Siddharth Menon', track: 'experienced', companyId: infometrics, designation: 'Lead Generation Executive', salutation: 'Mr.', status: 'completed', submitted: true, accepted: true, chain: true, signed: ['manager', 'it', 'payroll'], hrDone: true, fnf: fnf({ net: '71,900', payrollSigned: ago(31) }), flow: { scheduledAt: ago(1) }, released: ['relieving_sales'] });
await seed({ tag: 'Released — intern, bonafide letter sent', name: 'Riya Kapoor', track: 'intern', companyId: infometrics, designation: 'Process Automation Intern', salutation: 'Ms.', status: 'completed', submitted: true, accepted: true, chain: true, signed: ['manager', 'it', 'payroll'], hrDone: true, fnf: fnf({ net: '17,000', payrollSigned: ago(31) }), flow: { scheduledAt: ago(1) }, released: ['internship_bonafide'] });

await AuditLog.deleteMany({ field: /^DEMO-/ });
console.log(`[demo] created ${n} demo offboardings — open /admin/offboarding`);
await mongoose.disconnect();
