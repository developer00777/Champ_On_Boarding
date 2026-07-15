// Generates the 5 reference offer letters (one per track) using the REAL
// production renderer, so what HR reviews is identical to what the portal sends.
// Candidate data is invented — no real employee's details appear here.
//
// Run:  npx vite-node scripts/gen-offer-samples.ts
import { writeFileSync, mkdirSync } from 'node:fs';
import { generateOfferLetterPdf } from '$lib/server/offer-letter/pdf';
import { brandBySlug } from '$lib/shared/brands';
import type { OfferLetterInput } from '$lib/server/offer-letter/fields';

const OUT = '/home/hemang/Champ_On_Boarding/offer_samples';
mkdirSync(OUT, { recursive: true });

const brand = brandBySlug('champion-infometrics');
const COMPANY = 'Champion InfoMetrics Private Limited';
const ADDRESS =
	'J S Tower, L32, 2nd A Main Road, Outer Ring Road, HSR Layout, 6th Sector, Bengaluru, Karnataka 560102';

const base: OfferLetterInput = {
	jobTitle: '',
	department: '',
	reportingManager: '',
	officeLocation: ADDRESS,
	joiningDate: '',
	endDate: '',
	employmentType: '',
	ctcAmount: '',
	monthlyCompensation: '',
	noticePeriod: '',
	confirmedNoticePeriod: '',
	acceptanceDueDate: '',
	signatoryName: 'Anitha M S',
	signatoryDesignation: 'HR Manager',
	signatoryImageBase64: '',
	weeklyExpectation: '',
	keyResponsibilities: '',
	internCriteria: ''
};

const samples = [
	{
		file: '1-fresher-offer-of-appointment.pdf',
		candidate: {
			fullName: 'Ravi Kumar',
			email: 'ravi.kumar@example.com',
			presentAddress: '14, 3rd Cross, Jayanagar, Bengaluru, Karnataka 560041',
			track: 'fresher',
			mobile: '9000000001'
		},
		offer: {
			...base,
			jobTitle: 'Junior Software Engineer',
			department: 'Engineering',
			reportingManager: 'Anitha M S / Engineering Manager',
			joiningDate: '03-Aug-2026',
			employmentType: 'full_time' as const,
			ctcAmount: '360000',
			monthlyCompensation: '25000',
			noticePeriod: '30 days',
			confirmedNoticePeriod: '60 days',
			acceptanceDueDate: '25-Jul-2026'
		}
	},
	{
		file: '2-experienced-offer-of-appointment.pdf',
		candidate: {
			fullName: 'Priya Sharma',
			email: 'priya.sharma@example.com',
			presentAddress: '402, Green Meadows, Koramangala, Bengaluru, Karnataka 560034',
			track: 'experienced',
			mobile: '9000000002'
		},
		offer: {
			...base,
			jobTitle: 'SQL Developer',
			department: 'Data & Analytics',
			reportingManager: 'Anitha M S / Data Lead',
			joiningDate: '03-Aug-2026',
			employmentType: 'full_time' as const,
			ctcAmount: '850000',
			monthlyCompensation: '58000',
			noticePeriod: '30 days',
			confirmedNoticePeriod: '60 days',
			acceptanceDueDate: '25-Jul-2026'
		}
	},
	{
		file: '3-intern-internship-joining-agreement.pdf',
		candidate: {
			fullName: 'Sneha Rao',
			email: 'sneha.rao@example.com',
			presentAddress: '7, MG Road, Bengaluru, Karnataka 560001',
			track: 'intern',
			mobile: '9000000003'
		},
		offer: {
			...base,
			jobTitle: 'Process Associate Trainee',
			department: 'Operations',
			reportingManager: 'Ms. Anitha M S',
			officeLocation: 'HSR Layout, Bangalore',
			joiningDate: '03-Aug-2026',
			endDate: '02-Nov-2026',
			employmentType: 'full_time' as const,
			ctcAmount: '17000',
			noticePeriod: '1 day',
			acceptanceDueDate: '25-Jul-2026'
		}
	},
	{
		file: '4-consultant-agreement.pdf',
		candidate: {
			fullName: 'Arjun Menon',
			email: 'arjun.menon@example.com',
			presentAddress: '22, Indiranagar 100ft Road, Bengaluru, Karnataka 560038',
			track: 'consultant',
			mobile: '9000000004'
		},
		offer: {
			...base,
			jobTitle: 'Content Writer_Consultant',
			department: 'Marketing',
			reportingManager: 'Anitha M S / Marketing Head',
			joiningDate: '03-Aug-2026',
			employmentType: 'consultant' as const,
			ctcAmount: '40000',
			noticePeriod: '15 days',
			acceptanceDueDate: '25-Jul-2026',
			weeklyExpectation: 'Minimum 04 Content per Week',
			keyResponsibilities: [
				'Content Volume & Consistency: Publish 4 content pieces every week for 4 consecutive weeks & Deliver all 12 monthly content pieces by the last working day of each month',
				'Content Quality & Relevance: Score 90%+ on internal quality checklist for all 12 monthly pieces & Receive client approval on first submission for at least 10 of 12 pieces',
				'Content Performance & Engagement: Achieve a minimum average of 200 views/reads per content piece by month-end & Generate at least 15 shares, comments, or interactions across the 12 monthly pieces with Improve month-over-month content engagement rate by 10%',
				'Content Planning & Strategic Alignment: Map 100% of content topics to at least one business objective or campaign theme & Conduct 1 strategy alignment check-in with the client per week.',
				'Consultant Growth & Process Efficiency: Complete 1 up-skilling resource (course, article, or workshop) relevant to the industry per month'
			].join('\n')
		}
	},
	{
		file: '5-contract-offer-of-appointment.pdf',
		candidate: {
			fullName: 'Fatima Sheikh',
			email: 'fatima.sheikh@example.com',
			presentAddress: '9, Whitefield Main Road, Bengaluru, Karnataka 560066',
			track: 'contract',
			mobile: '9000000005'
		},
		offer: {
			...base,
			jobTitle: 'QA Engineer (Contract)',
			department: 'Quality Assurance',
			reportingManager: 'Anitha M S / QA Lead',
			joiningDate: '03-Aug-2026',
			endDate: '02-Aug-2027',
			employmentType: 'contract' as const,
			ctcAmount: '600000',
			monthlyCompensation: '45000',
			noticePeriod: '30 days',
			confirmedNoticePeriod: '60 days',
			acceptanceDueDate: '25-Jul-2026'
		}
	}
];

for (const s of samples) {
	const bytes = await generateOfferLetterPdf(s.candidate as never, COMPANY, s.offer, brand);
	writeFileSync(`${OUT}/${s.file}`, bytes);
	console.log(`wrote ${s.file}  (${(bytes.length / 1024).toFixed(1)} KB)`);
}
