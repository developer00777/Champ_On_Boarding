// The exit-document matrix: every row, question and rating option that appears
// on the four entity exit forms, in the order they are printed.
//
// This is the single source of truth shared by the employee's portal
// (/x/[token]), the approver clearance pages (/x/clearance/[token]), the
// generated PDFs (server/offboarding/pdf.ts) and HR's review screen. Adding a
// question to a printed form is an entry here, not a schema change — the
// answers live in Map fields on Exit (see db/schema.ts).
//
// Source documents (design/):
//   NO DUES CERTIFICATE Updated (1).pdf   → NDC_SECTIONS
//   EXIT INTERVIEW FORM.pdf               → EXIT_Q11/Q12/Q13 + EXIT_TEXT_QUESTIONS
//   Infometrics NDA (002)-Digital.pdf     → NDA_CLAUSES
//   Relieving Letter Formalities.pdf      → RELIEVING_ITEMS
//   Updated Exit process.pdf (the SOP)    → CLOSURE_CHECKLIST, ASSET_ITEMS, service rule

// ── Departments that clear an exit ───────────────────────────────────────────
// Keys match ExitClearance.department. `label` is the heading printed in the
// No-Dues certificate's "Dept. \ Section" column; `signatory` is the caption
// under its signature line. `optional` departments are only asked when HR ticks
// them — Salesforce clearance applies to sales staff only, per the SOP.
export type ClearanceDept =
	| 'manager' | 'department' | 'salesforce' | 'it' | 'hrd' | 'admin' | 'finance' | 'payroll';

export interface NdcRow {
	key: string;
	label: string;
	/** The four Employee's-Department rows already have the employee's free-text
	 *  answer on a dedicated `ndc.*` field — the certificate prints it and HR's
	 *  review screen lists it. Those rows reuse that field as their note instead
	 *  of storing a second copy that could drift out of step with it. Every
	 *  other row keeps its note in the generic `ndc.rowNotes` map. */
	noteField?: 'filesHandover' | 'loginsHandover' | 'leadsHandover' | 'deptOthers';
}

export interface NdcSection {
	dept: ClearanceDept;
	label: string;
	signatory: string;
	optional: boolean;
	/** Whether the employee is asked to declare these rows on their own exit
	 *  form, so the approver signs against a stated claim rather than from
	 *  memory. False for the sections whose rows are an internal computation the
	 *  employee has no way to answer — payroll's settlement total, finance's
	 *  recovery and tax checks. */
	employeeDeclares: boolean;
	/** The tick-rows this department owns, printed as No Dues / Dues / Sign. */
	rows: NdcRow[];
}

/** What the employee declares against a row they own, before any approver has
 *  looked at it. Deliberately not the approver's own no_dues/dues vocabulary:
 *  this is a claim, not a clearance, and the two must stay distinguishable on
 *  the approver's screen. */
export const NDC_EMPLOYEE_DECLARATIONS = [
	{ value: 'handed_over', label: 'Handed over / returned' },
	{ value: 'pending', label: 'Still with me' },
	{ value: 'na', label: 'Not applicable' }
] as const;

export type NdcEmployeeDeclaration = (typeof NDC_EMPLOYEE_DECLARATIONS)[number]['value'];

export const NDC_EMPLOYEE_DECLARATION_LABELS: Record<string, string> = Object.fromEntries(
	NDC_EMPLOYEE_DECLARATIONS.map((d) => [d.value, d.label])
);

/** The No-Dues certificate, section by section, exactly as the form prints it. */
export const NDC_SECTIONS: NdcSection[] = [
	{
		dept: 'department',
		label: "Employee's Department",
		signatory: 'Departmental Head',
		optional: false,
		employeeDeclares: true,
		rows: [
			{ key: 'files_handover', label: 'To handover files handled by him/her (soft & hard copies) (List should be attached)', noteField: 'filesHandover' },
			{ key: 'login_credentials', label: 'User Name/Password for all his official logins', noteField: 'loginsHandover' },
			{ key: 'leads_followup', label: 'Leads & Client follow up details', noteField: 'leadsHandover' },
			{ key: 'dept_others', label: 'Others', noteField: 'deptOthers' }
		]
	},
	{
		dept: 'salesforce',
		label: 'Sales Force Team',
		signatory: 'Sales Force Team',
		optional: true,
		employeeDeclares: true,
		rows: [
			{ key: 'sf_thirdparty', label: 'SalesForce / Third party Applications' },
			{ key: 'sf_gotomeeting', label: 'Lead Portal Username' },
			{ key: 'sf_linkpoint', label: 'Link point 360 Login' },
			{ key: 'sf_others', label: 'Others' }
		]
	},
	{
		dept: 'it',
		label: 'IT Section (PC & any other tools provided)',
		signatory: 'IT Section',
		optional: false,
		employeeDeclares: true,
		rows: [
			{ key: 'it_system_logins', label: 'System / Project Central / Skype / LinkedIn login' },
			{ key: 'it_datasources', label: 'Infocheckpoint / Data sources login' },
			{ key: 'it_gmail', label: 'Official Gmail Id' },
			{ key: 'it_hardware', label: 'Laptop / iPad / Phone / Head Set' },
			{ key: 'it_others', label: 'Others' }
		]
	},
	{
		dept: 'hrd',
		label: 'HRD',
		signatory: 'HRD',
		optional: false,
		employeeDeclares: true,
		rows: [
			{ key: 'hrd_company_property', label: 'Company Car / Cheque / LED TV / Loan' },
			{ key: 'hrd_edu_declaration', label: 'Educational Declaration, if any' },
			{ key: 'hrd_cards', label: 'ID, Access & Health Insurance Card' },
			{ key: 'hrd_others', label: 'Others' }
		]
	},
	{
		dept: 'admin',
		label: 'Administration',
		signatory: 'Administration',
		optional: false,
		employeeDeclares: true,
		rows: [
			{ key: 'admin_locker_books', label: 'Locker Key / Library Books' },
			{ key: 'admin_others', label: 'Others' }
		]
	},
	{
		dept: 'payroll',
		label: 'Payroll',
		signatory: 'Payroll In-Charge',
		optional: false,
		employeeDeclares: false,
		rows: [
			{
				key: 'payroll_total',
				label:
					'Total Payment (Salary, Termination Benefits, Balance Leave, Vacation Tickets, etc.) ' +
					'Detailed worksheet shall be attached'
			}
		]
	},
	{
		dept: 'manager',
		label: 'Reporting Manager — Knowledge Transfer',
		signatory: 'Reporting Manager',
		optional: false,
		employeeDeclares: true,
		// SOP step 4: the KT confirmations the reporting manager signs off.
		rows: [
			{ key: 'kt_project_handover', label: 'Project handover completed' },
			{ key: 'kt_documents', label: 'Documents transferred' },
			{ key: 'kt_credentials', label: 'Credentials shared' },
			{ key: 'kt_pending_tasks', label: 'Pending tasks reassigned' },
			{ key: 'kt_complete', label: 'Knowledge Transfer completed successfully' }
		]
	},
	{
		dept: 'finance',
		label: 'Finance',
		signatory: 'Finance Team',
		optional: false,
		employeeDeclares: false,
		rows: [
			{ key: 'fin_recoveries', label: 'Recoveries verified (notice pay, asset, other deductions)' },
			{ key: 'fin_advances', label: 'Loans / advances cleared' },
			{ key: 'fin_tax', label: 'Tax and PF paperwork complete' }
		]
	}
];

export const NDC_SECTION_BY_DEPT = new Map(NDC_SECTIONS.map((s) => [s.dept, s]));

/** The sections the employee self-declares, in printed order — what the exit
 *  form renders and what the approver pages cross-check against. */
export const NDC_EMPLOYEE_SECTIONS: NdcSection[] = NDC_SECTIONS.filter((s) => s.employeeDeclares);

/** Every row key the employee may answer. Used to bound what the exit form is
 *  allowed to write, so a hand-crafted POST cannot invent rows. */
export const NDC_EMPLOYEE_ROW_KEYS: ReadonlySet<string> = new Set(
	NDC_EMPLOYEE_SECTIONS.flatMap((s) => s.rows.map((r) => r.key))
);

export const CLEARANCE_DEPT_LABELS: Record<ClearanceDept, string> = Object.fromEntries(
	NDC_SECTIONS.map((s) => [s.dept, s.label])
) as Record<ClearanceDept, string>;

/** Departments asked for clearance on every exit. Salesforce is opt-in. */
export const DEFAULT_CLEARANCE_DEPTS: ClearanceDept[] = NDC_SECTIONS.filter((s) => !s.optional).map(
	(s) => s.dept
);

// ── Exit Interview Form ──────────────────────────────────────────────────────

/** Q1-Q9 + Q14A + Q15 — free-text questions, in printed order. `field` is the
 *  Exit.exitInterview key. `rows` sizes the textarea and the PDF's answer box. */
export const EXIT_TEXT_QUESTIONS = [
	{ n: '1', field: 'q1DecideToLeave', label: 'What made you decide to leave the organisation?' },
	{ n: '2', field: 'q2MostSatisfying', label: 'What did you find most satisfying about working for this company?' },
	{ n: '3', field: 'q3LeastSatisfying', label: 'What did you find least satisfying about working for this company?' },
	{ n: '4', field: 'q4MostFrustrating', label: 'What did you find most frustrating about your job?' },
	{ n: '5', field: 'q5SupportLevel', label: 'How would you rate the level of support you received to perform your job duties?' },
	{ n: '6', field: 'q6PoliciesInhibited', label: 'Did any company policies or procedures inhibit you from performing your job duties to the best of your ability? Which one(s)?' },
	{ n: '7', field: 'q7PerformanceFeedback', label: 'What kind of performance feedback did you receive and how regularly?' },
	{ n: '8', field: 'q8SalarySatisfied', label: 'Were you satisfied with your salary and benefit package?' },
	{ n: '9', field: 'q9QualitiesNeeded', label: 'What qualities and characteristics do you think a person should have to be successful in this organisation?' },
	{ n: '14A', field: 'q14aAdviceToSuccessor', label: 'What advice would you pass on to the next person selected to perform your job duties?' },
	{ n: '15', field: 'q15Suggestions', label: 'What suggestions do you have to make the company a better place to work?' }
] as const;

/** Q10 — workload. */
export const EXIT_WORKLOAD_OPTIONS = [
	{ value: 'too_heavy', label: 'Too heavy' },
	{ value: 'about_right', label: 'About right' },
	{ value: 'too_light', label: 'Too light' }
] as const;

/** Q11 — "What did you think of your supervisor on the following points". */
export const EXIT_Q11_SCALE = [
	{ value: 'almost_always', label: 'Almost Always' },
	{ value: 'usually', label: 'Usually' },
	{ value: 'sometimes', label: 'Sometimes' },
	{ value: 'never', label: 'Never' }
] as const;

export const EXIT_Q11_ROWS = [
	{ key: 'consistently_fair', label: 'Was consistently fair' },
	{ key: 'provided_recognition', label: 'Provided recognition' },
	{ key: 'resolved_complaints', label: 'Resolved complaints' },
	{ key: 'sensitive_to_needs', label: "Was sensitive to employees' needs" },
	{ key: 'feedback_on_performance', label: 'Provided feedback on performance' },
	{ key: 'open_communication', label: 'Was receptive to open communication' },
	{ key: 'followed_policies', label: 'Followed the company policies' }
] as const;

/** Q12 — "How would you rate the following". */
export const EXIT_Q12_SCALE = [
	{ value: 'excellent', label: 'Excellent' },
	{ value: 'good', label: 'Good' },
	{ value: 'fair', label: 'Fair' },
	{ value: 'poor', label: 'Poor' }
] as const;

export const EXIT_Q12_ROWS = [
	{ key: 'coop_within_division', label: 'Cooperation within your division' },
	{ key: 'coop_other_divisions', label: 'Cooperation with other divisions' },
	{ key: 'personal_job_training', label: 'Personal job training' },
	{ key: 'equipment_provided', label: 'Equipment provided (resources, facilities, materials)' },
	{ key: 'performance_review_system', label: "Company's performance review system" },
	{ key: 'orientation_program', label: "Company's new employee orientation program" },
	{ key: 'rate_of_pay', label: 'Rate of pay for your job' },
	{ key: 'career_development', label: 'Career development opportunities' },
	{ key: 'working_conditions', label: 'Physical working conditions' }
] as const;

/** Q13 — employee benefits. Same scale as Q12 plus "No opinion". */
export const EXIT_Q13_SCALE = [
	...EXIT_Q12_SCALE,
	{ value: 'no_opinion', label: 'No opinion' }
] as const;

export const EXIT_Q13_ROWS = [
	{ key: 'paid_holidays', label: 'Paid Holidays' },
	{ key: 'medical_plan', label: 'Medical plan' },
	{ key: 'sick_leave', label: 'Sick Leave' },
	{ key: 'food_allowance', label: 'Food Allowance' }
] as const;

/** Q14B — would you recommend the company. */
export const EXIT_RECOMMEND_OPTIONS = [
	{ value: 'most_definitely', label: 'Most definitely' },
	{ value: 'with_reservations', label: 'With reservations' },
	{ value: 'no', label: 'No' }
] as const;

// ── Relieving Formalities Form ───────────────────────────────────────────────
// Each printed item is a Yes/No the employee answers. `note` is the explanatory
// paragraph the form prints under the item — shown to the employee and printed
// into the PDF, because several of these items are commitments, not questions.
export const RELIEVING_ITEMS = [
	{
		n: '1',
		field: 'resignationInWriting',
		label: 'Submit your Resignation Letter in writing with the required notice period.',
		note: null,
		allowNa: false
	},
	{
		n: '2',
		field: 'commitmentPeriodComplete',
		label: 'Commitment period of two years from the date of signing your agreement is completed.',
		note:
			'Please do not request to be relieved in advance of the date on your agreement, or for a bonus. ' +
			'You are required to refund the bonus amount or the training fee — whichever is greater — if the ' +
			'commitment period is not completed.',
		allowNa: false
	},
	{
		n: '3',
		field: 'newEmployerOfferSubmitted',
		label:
			"Submit your new employer's offer letter and sign the non-solicitation and non-compete agreement.",
		note:
			'You may not discuss our process or employee contact details with anyone outside this firm after leaving.',
		allowNa: false
	},
	{
		n: '4a',
		field: 'salesApproval',
		label:
			'SALES: Approval from your next level authority in Sales regarding the transfer of all existing contacts and possible prospects.',
		note: null,
		allowNa: true
	},
	{
		n: '4b',
		field: 'accountingCleared',
		label:
			'ACCOUNTING: Tax is paid up and PF paperwork is complete for your contributions. Loans or advances, if any, are cleared prior to your last date.',
		note: null,
		allowNa: false
	},
	{
		n: '4c',
		field: 'hrAlumniEnrolled',
		label:
			'HR: Enrolled in the Alumni Forum, future and emergency contact details provided, and the Exit Interview completed.',
		note: null,
		allowNa: false
	},
	{
		n: '4d',
		field: 'itEmailBackedUp',
		label:
			'IT: All your email has been backed up, and no information has been deleted from your computer.',
		note: null,
		allowNa: false
	}
] as const;

// ── NDA ──────────────────────────────────────────────────────────────────────
// The Non-Disclosure & Non-Compete Agreement is signed, not filled: the
// employee supplies only date, name, permanent address, Aadhaar and signature.
// The clause text is printed verbatim into the PDF from here, so the agreement
// the employee accepts on screen and the PDF that lands in the exit file are
// the same document.
export const NDA_CLAUSES: { n: number; heading: string; body: string }[] = [
	{
		n: 1,
		heading: 'PURPOSE AND DEFINITIONS',
		body:
			'"Confidential Information" means all information of the Company, regardless of the form in which it is maintained ' +
			'(whether electronically on computer disk, in written records, material, photograph, audio or video recording, or any ' +
			'other medium), including, but not limited to, client identities and sensitive client information; the Company\'s prices, ' +
			'pricing policies, revenue, profit margins, projections, and any other financial information of the Company and its ' +
			'Clients; the commercial terms and business arrangements with Clients, including prospective business dealings; all ' +
			'Intellectual Property, existing and contemplated; products, services, and information pertaining to any of these items; ' +
			'and any additional information about the Company, its products, or services acquired as a result of the Employee\'s ' +
			'employment with the Company. "Intellectual Property" means all innovations, technology, engineering, trade secrets, ' +
			'trademarks, patents, copyrights to any copyrightable material, software systems, designs, programs, improvements, ' +
			'modifications, new ideas, concepts, work products, and developments; publications, manuals, business procedures, ' +
			'business developments, operational and marketing plans, programs, processes, policies, techniques, and methods of ' +
			'operations of the Company, including any such items developed, conceived, or originated, either individually or jointly ' +
			'with others by the Employee during the course of the Employee\'s employment by the Company. The definition of ' +
			'"Intellectual Property" is intended to have the broadest meaning as permitted under Indian law.'
	},
	{
		n: 2,
		heading: 'CONFIDENTIALITY OBLIGATIONS DURING EMPLOYMENT',
		body:
			'During employment, Employee shall hold all Confidential Information in strictest confidence and shall not disclose, ' +
			'share, transfer, divulge, or communicate it to any third party without Company\'s prior written authorization. Employee ' +
			'shall not copy, download, electronically transfer, extract, or remove Confidential Information from Company premises or ' +
			'systems without explicit written authorization. Employee shall not use Confidential Information for personal gain, ' +
			'competitive advantage, or any unauthorized purpose and shall implement all reasonable security measures to protect it ' +
			'from unauthorized access, loss, or theft. Employee shall immediately report any suspected breach, unauthorized access, ' +
			'security incident, or potential compromise of Confidential Information to Company management.'
	},
	{
		n: 3,
		heading: 'CONFIDENTIALITY OBLIGATIONS AFTER TERMINATION',
		body:
			'Upon termination of employment for any reason (voluntary, involuntary, with or without cause), Employee shall maintain ' +
			'all Confidential Information in strictest confidence indefinitely and perpetually for trade secrets. Employee shall not ' +
			'share, disclose, use, or transfer Confidential Information for any purpose whatsoever and shall immediately return or ' +
			'securely delete all Confidential Information, records, files, credentials, and Company property within twenty-four (24) ' +
			'hours of termination. Employee shall communicate confirmation of complete deletion and shall not retain any copies, ' +
			'summaries, excerpts, notes, or derivatives in any form or medium. All access credentials, passwords, and authentication ' +
			'tokens shall be immediately reset and disabled.'
	},
	{
		n: 4,
		heading: 'AUTHORIZED ACCESS AND SYSTEM USAGE ONLY',
		body:
			'Employee shall access, process, store, analyse, and transmit all Confidential Information exclusively through official ' +
			'Company email accounts, Company-approved tools and platforms, Company-approved devices only, and Company-controlled ' +
			'networks. Employee shall use only Company-approved devices, immediately report any lost or compromised devices to ' +
			'Company, and strictly comply with all Company security and device management policies as determined and enforced solely ' +
			'by Company.'
	},
	{
		n: 5,
		heading: 'PERSONAL EMAIL AND AI TOOLS PROHIBITION',
		body:
			'The Employee shall not use personal email IDs or non-company-approved communication channels for any official purpose. ' +
			'The use of company data, client data, material, information or intellectual property on any personal or external AI ' +
			'tools, platforms, or applications outside the Company\'s authorised environment is strictly prohibited. Any such act ' +
			'shall be considered a wilful violation of the Company\'s confidentiality, data security, and compliance policies and ' +
			'shall invite immediate and strict disciplinary action, including termination and legal proceedings, without prior ' +
			'notice. Any violation of this policy shall be treated as a serious breach of confidentiality, data security, and ' +
			'company policy. Such breach will result in immediate termination of employment without notice, and the employee shall ' +
			'not be eligible for gratuity, full-and-final settlement (F&F), or any post-employment benefits, subject to applicable ' +
			'law. The Company reserves the right to initiate legal action and recover damages arising from such violation.'
	},
	{
		n: 6,
		heading: 'INTELLECTUAL PROPERTY OWNERSHIP',
		body:
			'All Intellectual Property created, developed, conceived, or originated by Employee during employment including all ' +
			'AI-generated output using Company data, resources, or Confidential Information shall be the exclusive property of ' +
			'Company. Employee hereby assigns all rights, title, and interest in such Intellectual Property to Company and waives ' +
			'all moral rights and claims of ownership, attribution, or compensation therein.'
	},
	{
		n: 7,
		heading: 'RETURN OF COMPANY PROPERTY',
		body:
			'Upon termination or the Company\'s request, Employee shall immediately return all Confidential Information, internal ' +
			'records, material, files, devices, credentials, and Company property and securely delete all data from personal ' +
			'devices, email, or cloud storage. Employee shall communicate confirmation of deletion within twenty-four (24) hours ' +
			'and shall not retain any copies in any form.'
	},
	{
		n: 8,
		heading: 'FINANCIAL AND LEGAL CONSEQUENCES FOR BREACHES',
		body:
			'For any breach of this Agreement, Employee shall be liable to pay all losses and damages suffered by the Company, ' +
			'including but not limited to lost business, reputational harm, investigation costs, data recovery expenses, client ' +
			'damages, legal fees, and court costs. The Company shall have the right to recover such losses and damages. The Company ' +
			'may seek immediate injunctive relief, restraining orders, and specific performance without proving actual damages, and ' +
			'reserves the right to notify affected clients of breach details, including Employee identity, and take such legal ' +
			'actions as it deems necessary under applicable provisions of law.'
	},
	{
		n: 9,
		heading: 'NON-COMPETITION AND NON-SOLICITATION',
		body:
			'For two (2) years following termination, Employee shall not directly or indirectly engage in, consult for, or provide ' +
			'services to any business competitive with any of the Company\'s businesses, including but not limited to IT solutions ' +
			'and technology services, nor solicit Company clients or employees. Employee shall notify Company in writing of ' +
			'subsequent employment within 30 days and disclose this Agreement to future employers. Thereafter, for any future ' +
			'engagement in a competitive business, Employee shall seek written confirmation from Company prior to joining such ' +
			'business. This obligation shall continue perpetually, subject to the requirement that Employee obtains written ' +
			'confirmation from Company before joining any competitive business, and provided that such restrictions remain ' +
			'permissible under applicable law.'
	},
	{
		n: 10,
		heading: 'GOVERNING LAW AND SURVIVAL',
		body:
			'This Agreement shall be governed exclusively by the laws of India, with exclusive jurisdiction in the courts of ' +
			'Bangalore. All confidentiality, non-disclosure, non-competition, non-solicitation, intellectual property, return of ' +
			'property, and liability obligations shall survive termination indefinitely for Confidential Information and perpetually ' +
			'for trade secrets. The headings used in this Agreement are for convenience and reference only and shall not affect the ' +
			'interpretation or construction of the terms and conditions contained herein. The substance and meaning of the clauses ' +
			'shall prevail over the headings.'
	},
	{
		n: 11,
		heading: 'ACKNOWLEDGEMENT',
		body:
			'Employee confirms having read, understood, and voluntarily accepted all terms without duress. Employee acknowledges the ' +
			'zero-tolerance policy, immediate termination consequences, including ineligibility for gratuity, Full and Final ' +
			'Settlement (F&F), and all benefits, the Company\'s right to recover losses and damages, client notification rights, ' +
			'perpetual trade secret protection, and consent to all monitoring systems.'
	},
	{
		n: 12,
		heading: 'EXECUTION',
		body:
			'This Agreement constitutes the entire understanding between the parties with respect to the subject matter hereof and ' +
			'supersedes all prior agreements, arrangements, communications, representations, negotiations, and understandings, ' +
			'whether oral or written, relating to such subject matter. In the event of any discrepancy or conflict between this ' +
			'Agreement and any prior or contemporaneous documents, communications, or understandings, the terms of this Agreement ' +
			'shall prevail and govern.'
	}
];

/** Registered office printed in the NDA's "BY AND BETWEEN" block. */
export const NDA_REGISTERED_OFFICE =
	'Champions Square, Opp Decathlon, Sarjapur Main Road, Carmelaram, Bangalore-560035';

// ── Asset return (SOP step 6) ────────────────────────────────────────────────
export const ASSET_ITEMS = [
	'Laptop',
	'Charger',
	'ID Card',
	'Access Card',
	'Mouse',
	'Headset',
	'SIM Card (if applicable)',
	'Storage Devices',
	'Other Company Property'
] as const;

// ── Gratuity eligibility (SOP 5.5) ───────────────────────────────────────────
/** "4 years and 7 months or more of continuous service" — the SOP's rule, in
 *  months, so the check is one comparison rather than a date-arithmetic puzzle. */
export const GRATUITY_MIN_SERVICE_MONTHS = 4 * 12 + 7;

// ── Exit completion checklist (SOP 10.7) ─────────────────────────────────────
// HR's closing checklist. Grouped so the review page can render it in the same
// order and headings the SOP uses.
export const CLOSURE_CHECKLIST: { group: string; items: { key: string; label: string }[] }[] = [
	{
		group: 'Exit formalities',
		items: [
			{ key: 'resignation_approved', label: 'Resignation approved' },
			{ key: 'lwd_confirmed', label: 'Last Working Day confirmed' },
			{ key: 'kt_completed', label: 'Knowledge Transfer completed' },
			{ key: 'exit_interview_completed', label: 'Exit Interview completed' },
			{ key: 'nda_signed', label: 'NDA signed' },
			{ key: 'ndc_approved', label: 'No Dues Certificate approved' },
			{ key: 'assets_returned', label: 'Assets returned' }
		]
	},
	{
		group: 'Clearances',
		items: [
			{ key: 'it_clearance', label: 'IT clearance completed' },
			{ key: 'admin_clearance', label: 'Admin clearance completed' },
			{ key: 'finance_clearance', label: 'Finance clearance completed' },
			{ key: 'hr_clearance', label: 'HR clearance completed' }
		]
	},
	{
		group: 'Payroll',
		items: [
			{ key: 'payroll_docs_shared', label: 'Payroll documents shared' },
			{ key: 'fnf_initiated', label: 'Full & Final settlement initiated' },
			{ key: 'leave_encashment_verified', label: 'Leave encashment verified' },
			{ key: 'recoveries_verified', label: 'Recoveries verified' }
		]
	},
	{
		group: 'System updates',
		items: [
			{ key: 'hrms_updated', label: 'HRMS updated' },
			{ key: 'employee_portal_updated', label: 'Employee Portal updated' },
			{ key: 'easytime_updated', label: 'EasyTime Pro updated' },
			{ key: 'epfo_doe_updated', label: 'EPFO Date of Exit updated' },
			{ key: 'access_disabled', label: 'Official email & system access disabled' },
			{ key: 'master_tracker_updated', label: 'Master Tracker updated' },
			{ key: 'exit_tracker_updated', label: 'Exit Tracker updated' }
		]
	},
	{
		group: 'Documents',
		items: [
			{ key: 'documents_archived', label: 'Documents archived' },
			{ key: 'relieving_letter_prepared', label: 'Relieving Letter prepared' },
			{ key: 'experience_letter_prepared', label: 'Experience Letter prepared' }
		]
	}
];

export const CLOSURE_CHECKLIST_KEYS = CLOSURE_CHECKLIST.flatMap((g) => g.items.map((i) => i.key));

// ── Handover documents (SOP step 9 + the final link) ─────────────────────────
// What HR uploads for the employee's final document handover, ~30-45 days after
// LWD. `applicableWhen` names the Exit flag that gates it — a document is only
// offered to the employee when its condition holds, so an exit with no PF exit
// processed simply does not show a PF section.
export const HANDOVER_DOCS = [
	{ docType: 'payslip_1', label: 'Payslip — month 1', applicableWhen: null },
	{ docType: 'payslip_2', label: 'Payslip — month 2', applicableWhen: null },
	{ docType: 'payslip_3', label: 'Payslip — month 3', applicableWhen: null },
	{ docType: 'fnf_statement', label: 'Full & Final settlement statement', applicableWhen: null },
	{ docType: 'relieving_letter', label: 'Relieving Letter', applicableWhen: null },
	{ docType: 'experience_letter', label: 'Experience Letter', applicableWhen: null },
	{ docType: 'recommendation_letter', label: 'Recommendation Letter', applicableWhen: 'recommendationApplicable' },
	{ docType: 'pf_statement', label: 'PF withdrawal / transfer details', applicableWhen: 'pfExitProcessed' },
	{ docType: 'form_16', label: 'Form 16 / taxation details', applicableWhen: 'taxationApplicable' }
] as const;

/** Files the EMPLOYEE uploads in their exit portal. */
export const EXIT_UPLOAD_DOCS = [
	{
		docType: 'signature',
		label: 'Your signature',
		hint: 'A photo or scan of your signature on white paper. Printed onto your exit documents.',
		mandatory: true
	},
	{
		docType: 'new_employer_offer',
		label: "New employer's offer letter",
		hint: 'Asked for by item 3 of the Relieving Formalities form.',
		mandatory: false
	},
	{
		docType: 'asset_return_proof',
		label: 'Asset handover acknowledgement',
		hint: 'Optional — a photo of the assets handed over, or a signed acknowledgement.',
		mandatory: false
	}
] as const;

// ── Status labels ────────────────────────────────────────────────────────────
export const EXIT_STATUS_META: Record<string, { label: string; cls: string }> = {
	initiated: { label: 'INITIATED', cls: '' },
	link_sent: { label: 'LINK SENT', cls: 'purple' },
	in_progress: { label: 'IN PROGRESS', cls: 'purple' },
	submitted: { label: 'AWAITING REVIEW', cls: 'gold' },
	changes_requested: { label: 'CHANGES REQUESTED', cls: 'red' },
	clearances: { label: 'CLEARANCES PENDING', cls: 'gold' },
	cleared: { label: 'CLEARED', cls: 'teal' },
	fnf: { label: 'F&F IN PROGRESS', cls: 'purple' },
	completed: { label: 'COMPLETED', cls: 'teal' }
};
