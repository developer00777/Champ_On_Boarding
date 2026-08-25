// The offboarding worklist: every exit in flight, and the form HR initiates a
// new one from.
//
// Filtering follows the candidate list exactly — URL search params only, filter
// in the query rather than the client, and the filter state echoed back so the
// page can rebuild its own links.
import { fail } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';
import { Company, Exit, ExitClearance } from '$lib/server/db/schema';
import { audit } from '$lib/server/audit';
import { isValidEmail, isValidMobile, titleCase } from '$lib/shared/validation';
import { isoToDDMMYYYY, toIsoDate } from '$lib/shared/dates';
import { RANGE_KEYS, rangeStart, type RangeKey } from '$lib/shared/ranges';
import { EXIT_STATUS_META } from '$lib/shared/offboarding';
import {
	clearanceProgress,
	findOnboardingMatch,
	gratuityApplicable,
	prefillFromOnboarding,
	serviceLabel
} from '$lib/server/offboarding/exit';

function requireInitiator(locals: App.Locals) {
	if (locals.admin?.role !== 'super_admin' && locals.admin?.role !== 'hr_admin')
		return fail(403, { message: 'Only HR or a super admin can initiate an offboarding.', initiateError: true });
	return null;
}

export const load: PageServerLoad = async ({ url, locals }) => {
	const range = (url.searchParams.get('range') ?? 'all') as RangeKey;
	const safeRange: RangeKey = RANGE_KEYS.includes(range) ? range : 'all';
	const status = url.searchParams.get('status') ?? '';
	const q = (url.searchParams.get('q') ?? '').trim();

	const where: Record<string, unknown> = {};
	const from = rangeStart(safeRange);
	if (from) where.createdAt = { $gte: from };
	if (status) where.status = status;
	if (q) {
		// Literal substring match (regex metacharacters escaped) against the three
		// things HR searches an exit by.
		const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
		where.$or = [{ fullName: rx }, { employeeId: rx }, { personalEmail: rx }];
	}

	const [rows, total, companies] = await Promise.all([
		Exit.find(where).sort({ createdAt: -1 }).lean(),
		// Unfiltered, deliberately: the page reads "Showing N of TOTAL", where
		// TOTAL is every exit on record, not the filtered subset.
		Exit.countDocuments({}),
		Company.find({ active: true }).sort({ name: 1 }).lean()
	]);

	// One query for every exit's clearances, joined in memory by id — the same
	// N+1 avoidance the BGV and candidate lists use.
	const clearances = await ExitClearance.find({ exitId: { $in: rows.map((r) => r._id) } })
		.select('exitId status')
		.lean();
	const byExit = new Map<string, { status: string }[]>();
	for (const c of clearances) {
		const key = String(c.exitId);
		byExit.set(key, [...(byExit.get(key) ?? []), { status: String(c.status) }]);
	}
	const companyName = new Map(companies.map((c) => [String(c._id), c.name]));

	return {
		exits: rows.map((e) => {
			const progress = clearanceProgress(byExit.get(String(e._id)) ?? []);
			return {
				id: String(e._id),
				employeeId: e.employeeId,
				fullName: e.fullName,
				personalEmail: e.personalEmail,
				company: companyName.get(String(e.companyId)) ?? '',
				designation: e.designation ?? null,
				resignationDate: e.resignationDate,
				lwd: e.lwd ?? null,
				status: e.status,
				service: serviceLabel(e.doj, e.lwd),
				clearances: progress,
				createdAt: (e as unknown as { createdAt: Date }).createdAt.toISOString()
			};
		}),
		total,
		range: safeRange,
		status,
		q,
		statuses: Object.keys(EXIT_STATUS_META),
		companies: companies.map((c) => ({ id: String(c._id), name: c.name })),
		canInitiate: locals.admin?.role === 'super_admin' || locals.admin?.role === 'hr_admin',
		// Deleting an exit is super-admin-only (see the deleteExit action), so the
		// control is hidden rather than shown-and-rejected for an hr_admin.
		canDelete: locals.admin?.role === 'super_admin'
	};
};

export const actions: Actions = {
	/** SOP steps 1-2: HR records a resignation. Only the four things they know
	 *  at this point are required; everything else is prefilled from the
	 *  onboarding record where one exists, or filled in later on the exit page. */
	initiate: async ({ request, locals, getClientAddress }) => {
		const forbidden = requireInitiator(locals);
		if (forbidden) return forbidden;

		const form = await request.formData();
		const get = (k: string) => String(form.get(k) ?? '').trim();

		const employeeId = get('employeeId');
		const fullName = titleCase(get('fullName'));
		const personalEmail = get('personalEmail').toLowerCase();
		const personalMobile = get('personalMobile');
		const resignationDate = isoToDDMMYYYY(get('resignationDate'));
		const lwd = isoToDDMMYYYY(get('lwd'));
		const dojInput = isoToDDMMYYYY(get('doj'));
		const companyId = get('companyId');
		const separationType = get('separationType') === 'involuntary' ? 'involuntary' : 'voluntary';

		const errors: string[] = [];
		if (!employeeId) errors.push('Employee ID is required.');
		if (!fullName) errors.push('Employee name is required.');
		if (!personalEmail) errors.push('Personal email is required.');
		else if (!isValidEmail(personalEmail)) errors.push('Enter a valid personal email address.');
		if (personalMobile && !isValidMobile(personalMobile))
			errors.push('Mobile number must be 10 digits starting 6-9.');
		if (!resignationDate) errors.push('Date of resignation is required.');
		if (!companyId) errors.push('Select the entity this employee belongs to.');
		if (errors.length) return fail(400, { message: errors.join(' '), initiateError: true });

		// An exit already open for this employee code is almost always a
		// double-submit or a second attempt, not a genuine second resignation.
		const existing = await Exit.findOne({
			employeeId,
			status: { $nin: ['completed'] }
		}).lean();
		if (existing)
			return fail(409, {
				message: `An offboarding is already in progress for employee ${employeeId}.`,
				initiateError: true
			});

		const match = await findOnboardingMatch(employeeId, personalEmail);
		const prefill = prefillFromOnboarding(
			match?.candidate as Record<string, unknown> | null,
			match?.offer as Record<string, unknown> | null
		);

		// HR's own entry always wins over the onboarding record's default —
		// either because they are looking at the resignation email, or because
		// this employee predates the portal and has no onboarding record at all.
		const doj = dojInput || prefill.doj || null;
		const applicable = gratuityApplicable(doj, lwd || null);

		const exit = await Exit.create({
			companyId,
			candidateId: match?.candidate?._id ?? null,
			employeeId,
			fullName,
			personalEmail,
			resignationDate,
			lwd: lwd || null,
			separationType,
			...prefill,
			personalMobile: personalMobile || prefill.personalMobile || null,
			doj,
			gratuity: { applicable: applicable === true },
			status: 'initiated',
			createdBy: locals.admin!.id
		});

		await audit({
			candidateId: match?.candidate ? String(match.candidate._id) : null,
			actor: locals.admin!.email,
			action: 'exit_initiated',
			field: employeeId,
			newValue: fullName,
			ip: getClientAddress()
		});

		return { initiated: true, exitId: String(exit._id), linked: !!match?.candidate };
	},

	/** Deletes an exit outright. Unlike a candidate — whose record is the
	 *  company's hiring history — an exit created by mistake has no value, and
	 *  the underlying onboarding record is never touched. */
	deleteExit: async ({ request, locals, getClientAddress }) => {
		if (locals.admin?.role !== 'super_admin')
			return fail(403, { message: 'Only a super admin can delete an offboarding record.', initiateError: false });

		const form = await request.formData();
		const exitId = String(form.get('exitId') ?? '');
		const exit = await Exit.findById(exitId).lean();
		if (!exit) return fail(404, { message: 'Offboarding record not found.', initiateError: false });

		const { deleteExitCascade } = await import('$lib/server/offboarding/cascade');
		await deleteExitCascade(exitId);

		await audit({
			actor: locals.admin!.email,
			action: 'exit_deleted',
			field: exit.employeeId,
			oldValue: exit.fullName,
			ip: getClientAddress()
		});
		return { deleted: true };
	}
};
