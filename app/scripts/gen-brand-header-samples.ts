// One offer letter per brand, to compare the letterhead across entities.
//
// gen-offer-samples.ts varies the TRACK against a single brand; this varies the
// BRAND against a single track, which is what you need when the question is
// "does every entity's logo and name read correctly on the page".
//
// Uses the real production renderer, so these are what candidates receive.
// Candidate data is invented — no real employee's details appear here.
//
// Run:  npx vite-node scripts/gen-brand-header-samples.ts
import { writeFileSync, mkdirSync } from 'node:fs';
import { generateOfferLetterPdf } from '$lib/server/offer-letter/pdf';
import { BRANDS } from '$lib/shared/brands';
import type { OfferLetterInput } from '$lib/server/offer-letter/fields';

const OUT = '/home/hemang/Champ_On_Boarding/offer_samples/by-brand';
mkdirSync(OUT, { recursive: true });

const candidate = {
	fullName: 'Ravi Kumar',
	email: 'ravi.kumar@example.com',
	presentAddress: '14, 3rd Cross, Jayanagar, Bengaluru, Karnataka 560041',
	track: 'fresher',
	mobile: '9000000001'
};

const offer: OfferLetterInput = {
	jobTitle: 'Junior Software Engineer',
	department: 'Engineering',
	reportingManager: 'Anitha M S / Engineering Manager',
	officeLocation:
		'J S Tower, L32, 2nd A Main Road, Outer Ring Road, HSR Layout, 6th Sector, Bengaluru, Karnataka 560102',
	joiningDate: '03-Aug-2026',
	endDate: '',
	employmentType: 'full_time',
	ctcAmount: '360000',
	monthlyCompensation: '25000',
	noticePeriod: '30 days',
	confirmedNoticePeriod: '60 days',
	acceptanceDueDate: '25-Jul-2026',
	signatoryName: 'Anitha M S',
	signatoryDesignation: 'HR Manager',
	signatoryImageBase64: '',
	weeklyExpectation: '',
	keyResponsibilities: '',
	internCriteria: '',
	paymentClause: ''
};

for (const brand of BRANDS) {
	try {
		const bytes = await generateOfferLetterPdf(
			candidate as never,
			brand.legalName,
			offer,
			brand
		);
		const file = `${OUT}/${brand.slug}.pdf`;
		writeFileSync(file, bytes);
		console.log(`ok    ${brand.slug.padEnd(26)} -> ${(bytes.length / 1024).toFixed(0)} kB`);
	} catch (e) {
		console.log(`FAIL  ${brand.slug.padEnd(26)} -> ${(e as Error).message.slice(0, 60)}`);
	}
}
console.log(`\nWritten to ${OUT}`);
