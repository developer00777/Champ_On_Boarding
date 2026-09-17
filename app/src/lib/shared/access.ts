// ACCESS MODEL — what a person may do, and to whose records.
//
// The three fixed roles (super_admin / hr_admin / finance_team) answer "which
// of three buckets are you in". This answers "what can you do", one capability
// at a time, so an HR manager can be given offer approval without also being
// given the power to delete candidate records.
//
// ── Every capability here is mapped to real code ─────────────────────────────
// `surface` names the actual routes, form actions and endpoints a capability
// governs, written exactly as they appear in the codebase. It is not
// decoration: it is how you check that the matrix describes this app rather
// than a plausible-looking app. A capability with nothing real behind it
// carries `wired: false` and says so on screen, instead of quietly implying a
// control that does not exist.
//
// ── What this module does NOT do yet ────────────────────────────────────────
// Nothing here is enforced. The guards in +page.server.ts still decide who may
// do what, and they still read `role`. This module is the authoring surface and
// the single description of the app's permission surface; switching the guards
// over to it is a separate, larger change that touches every action, and doing
// it silently underneath a UI review would be the wrong order.

export const LEVELS = ['none', 'view', 'act', 'approve'] as const;
export type Level = (typeof LEVELS)[number];

/** What a capability is shaped like, which decides the levels it can offer.
 *  read  — looking only.              none | view
 *  write — doing the work.            none | view | act
 *  full  — doing it, or signing off.  none | view | act | approve
 *  gate  — pure authorisation.        none | approve
 *  A preset asking for `approve` on a read-only capability lands on `view`,
 *  never on a level the capability does not have. */
export type Kind = 'read' | 'write' | 'full' | 'gate';

export const KIND_LEVELS: Record<Kind, readonly Level[]> = {
	read: ['none', 'view'],
	write: ['none', 'view', 'act'],
	full: ['none', 'view', 'act', 'approve'],
	gate: ['none', 'approve']
};

export const LEVEL_LABEL: Record<Level, string> = {
	none: '—',
	view: 'View',
	act: 'Act',
	approve: 'Sign'
};

export interface Capability {
	key: string;
	label: string;
	kind: Kind;
	/** The real routes/actions this capability governs. `route::action` for a
	 *  form action, `METHOD route` for an endpoint, a bare path for a page. */
	surface: string[];
	/** False when the app has no such control yet — the row is a placeholder for
	 *  a gate the business has asked for, and the matrix labels it as one. */
	wired?: false;
}

export interface Module {
	key: string;
	name: string;
	tone: 'ember' | 'verdant' | 'azure' | 'amber' | 'crimson' | 'violet';
	caps: Capability[];
}

export const MODULES: Module[] = [
	{
		key: 'candidates',
		name: 'Candidate records',
		tone: 'ember',
		caps: [
			{ key: 'candidate.view', label: 'Open candidate records', kind: 'read',
				surface: ['/admin/candidates', '/admin/candidates/[id]', 'GET /admin/candidates/search', 'GET /admin/candidates/[id]/report'] },
			{ key: 'candidate.create', label: 'Generate an onboarding link', kind: 'write',
				surface: ['/admin::generateLink'] },
			{ key: 'candidate.edit', label: 'Correct a submitted profile', kind: 'write',
				surface: ['/admin/candidates/[id]::editProfile'] },
			{ key: 'candidate.shift', label: 'Set shift timing', kind: 'write',
				surface: ['/admin/candidates/[id]::setShiftTiming'] },
			{ key: 'candidate.approve', label: 'Approve a submitted form', kind: 'full',
				surface: ['/admin/candidates/[id]::approve'] },
			{ key: 'candidate.decision', label: 'Record the hiring decision', kind: 'full',
				surface: ['/admin/candidates/[id]::setHiringDecision'] },
			{ key: 'candidate.link', label: 'Revoke or regenerate the link', kind: 'write',
				surface: ['/admin/candidates/[id]::revoke', '/admin/candidates/[id]::regenerateLink'] },
			{ key: 'candidate.delete', label: 'Delete a candidate record', kind: 'gate',
				surface: ['/admin/candidates/[id]::deleteCandidate'] }
		]
	},
	{
		key: 'offer',
		name: 'Offer letters',
		tone: 'verdant',
		caps: [
			{ key: 'offer.draft', label: 'Draft the offer, CTC and annexure', kind: 'write',
				surface: ['/admin/candidates/[id]::saveOfferLetter'] },
			{ key: 'offer.preview', label: 'Preview or download the PDF', kind: 'read',
				surface: ['GET /admin/candidates/[id]/offer-letter', 'POST /admin/candidates/[id]/offer-letter'] },
			{ key: 'offer.manual', label: 'Hand-edit the letter’s wording', kind: 'write',
				surface: ['POST /admin/candidates/[id]/offer-letter/blocks'] },
			{ key: 'offer.upload', label: 'Upload a letter and place its signature', kind: 'write',
				surface: ['POST|PATCH|DELETE /admin/candidates/[id]/offer-letter/uploaded'] },
			{ key: 'offer.send', label: 'Email the offer to the candidate', kind: 'write',
				surface: ['/admin/candidates/[id]::sendOfferLetterEmail'] },
			{ key: 'offer.approve', label: 'Approve the offer before release', kind: 'gate',
				surface: [], wired: false }
		]
	},
	{
		key: 'docs',
		name: 'Documents & checks',
		tone: 'azure',
		caps: [
			{ key: 'docs.view', label: 'View uploaded documents', kind: 'read',
				surface: ['GET /admin/candidates/[id]/doc/[docId]', 'GET /admin/candidates/[id]/other-docs/[fileId]'] },
			{ key: 'docs.sync', label: 'Run the OCR cross-check', kind: 'write',
				surface: ['/admin/candidates/[id]::crosscheck'] },
			{ key: 'docs.review', label: 'Ask for a re-upload or re-confirmation', kind: 'write',
				surface: ['/admin/candidates/[id]::requestReupload', '/admin/candidates/[id]::requestUpload', '/admin/candidates/[id]::requestConfirmation'] },
			{ key: 'docs.physical', label: 'Mark physical copies collected', kind: 'write',
				surface: ['/admin/candidates/[id]::physical'] },
			{ key: 'docs.reference', label: 'Manage HR reference documents', kind: 'write',
				surface: ['POST /admin/candidates/[id]/other-docs', '/admin/candidates/[id]::removeReferenceFile'] },
			{ key: 'docs.reveal', label: 'Unmask Aadhaar and PAN', kind: 'gate',
				surface: ['/admin/candidates/[id]::reveal'] },
			{ key: 'docs.zip', label: 'Download the full document pack', kind: 'gate',
				surface: ['GET /admin/candidates/[id]/docs-zip'] }
		]
	},
	{
		key: 'it',
		name: 'IT provisioning',
		tone: 'violet',
		caps: [
			{ key: 'it.fields', label: 'Set asset, email ID and seat', kind: 'write',
				surface: ['/admin/candidates/[id]::setItMailFields'] },
			{ key: 'it.send', label: 'Send the setup mail to the helpdesk', kind: 'write',
				surface: ['/admin/candidates/[id]::sendItSetupMail', 'GET /admin/candidates/[id]/it-setup-preview'] },
			{ key: 'it.block', label: 'Send the exit block mail', kind: 'gate',
				surface: ['/admin/offboarding/[id]::sendItBlockMail'] },
			{ key: 'it.approve', label: 'Approve the IT setup request', kind: 'gate',
				surface: [], wired: false }
		]
	},
	{
		key: 'empid',
		name: 'Employee code',
		tone: 'amber',
		caps: [
			{ key: 'empid.assign', label: 'Assign the employee code', kind: 'write',
				surface: ['/admin/candidates/[id]::setEmployeeId'] },
			{ key: 'empid.notify', label: 'Send the employee code mail', kind: 'write',
				surface: ['/admin/candidates/[id]::sendEmployeeCodeMail', 'GET /admin/candidates/[id]/employee-code-preview'] },
			{ key: 'empid.uan', label: 'Record the UAN', kind: 'write',
				surface: ['/admin/candidates/[id]::setUan'] },
			{ key: 'empid.approve', label: 'Approve the code before release', kind: 'gate',
				surface: [], wired: false }
		]
	},
	{
		key: 'bgv',
		name: 'Background verification',
		tone: 'azure',
		caps: [
			{ key: 'bgv.view', label: 'Open BGV cases', kind: 'read',
				surface: ['/admin/bgv', '/admin/bgv/[id]'] },
			{ key: 'bgv.send', label: 'Send and chase a verification request', kind: 'write',
				surface: ['/admin/bgv/[id]::send', '/admin/bgv/[id]::remindNow', '/admin/bgv/[id]::saveReminderPlan'] },
			{ key: 'bgv.close', label: 'Delete a BGV case', kind: 'gate',
				surface: ['/admin/bgv::deleteBgv', '/admin/bgv/[id]::deleteBgv'] }
		]
	},
	{
		key: 'exit',
		name: 'Exit & clearance',
		tone: 'crimson',
		caps: [
			{ key: 'exit.initiate', label: 'Initiate an exit', kind: 'write',
				surface: ['/admin/offboarding::initiate'] },
			{ key: 'exit.particulars', label: 'Maintain exit particulars', kind: 'write',
				surface: ['/admin/offboarding/[id]::saveParticulars', '::sendFormsLink', '::revokeFormsLink', '::requestChanges', '::saveNdcInternal', '::acceptSubmission', '::requestReupload'] },
			{ key: 'exit.clearance', label: 'Send and chase department clearances', kind: 'write',
				surface: ['/admin/offboarding/[id]::sendClearances', '::remindClearance', '::removeClearance'] },
			{ key: 'exit.handover', label: 'Manage the handover pack', kind: 'write',
				surface: ['/admin/offboarding/[id]::sendHandover', '::removeHandoverFile', 'POST /admin/offboarding/[id]/upload', 'GET /admin/offboarding/[id]/pack-zip'] },
			{ key: 'exit.fnf', label: 'Prepare the full & final settlement', kind: 'full',
				surface: ['/admin/offboarding/[id]::saveFnf'] },
			{ key: 'exit.closure', label: 'Sign off the closure', kind: 'gate',
				surface: ['/admin/offboarding/[id]::saveClosure'] },
			{ key: 'exit.reopen', label: 'Reopen or delete a closed exit', kind: 'gate',
				surface: ['/admin/offboarding/[id]::reopen', '/admin/offboarding::deleteExit'] }
		]
	},
	{
		key: 'entities',
		name: 'Entities & branding',
		tone: 'ember',
		caps: [
			{ key: 'entity.view', label: 'View the entity list', kind: 'read', surface: ['/admin/entities'] },
			{ key: 'entity.create', label: 'Add a company', kind: 'write', surface: ['/admin/entities::createCompany'] },
			{ key: 'entity.brand', label: 'Set logo and brand theme', kind: 'write',
				surface: ['/admin/entities::setCompanyBrand', '/admin/entities::setCompanyLogo'] },
			{ key: 'entity.archive', label: 'Archive or restore a company', kind: 'gate',
				surface: ['/admin/entities::deleteCompany', '/admin/entities::restoreCompany'] }
		]
	},
	{
		key: 'comms',
		name: 'Mail & templates',
		tone: 'violet',
		caps: [
			{ key: 'inbox.view', label: 'Read the shared inbox', kind: 'read',
				surface: ['/admin/inbox', 'GET /admin/inbox/search'] },
			{ key: 'inbox.templates', label: 'Edit mail templates', kind: 'write',
				surface: ['/admin/settings::saveItSetupMail', '::resetItSetupMail', '::saveEmployeeCodeMail', '::saveExitMail', '::resetExitMail'] },
			{ key: 'inbox.lists', label: 'Edit fixed lists and defaults', kind: 'write',
				surface: ['/admin/settings::saveFixedLists'] }
		]
	},
	{
		key: 'data',
		name: 'Insights & export',
		tone: 'amber',
		caps: [
			{ key: 'analytics.view', label: 'Open the analytics board', kind: 'read', surface: ['/admin/analytics'] },
			{ key: 'export.run', label: 'Export the candidate dataset', kind: 'gate', surface: ['GET /admin/export'] },
			{ key: 'audit.view', label: 'Read the audit trail', kind: 'read',
				surface: [], wired: false }
		]
	},
	{
		key: 'access',
		name: 'Access & org',
		tone: 'crimson',
		caps: [
			{ key: 'team.view', label: 'See the team list', kind: 'read', surface: ['/admin/team'] },
			{ key: 'team.invite', label: 'Create and disable logins', kind: 'write',
				surface: ['/admin/team::createUser', '/admin/team::setStatus', '/admin/team::resetPassword'] },
			{ key: 'team.permissions', label: 'Change anyone’s access', kind: 'gate',
				surface: ['/admin/access'] },
			{ key: 'team.org', label: 'Redraw reporting lines', kind: 'gate',
				surface: [], wired: false }
		]
	}
];

export const CAPS: Record<string, Capability> = {};
export const CAP_MODULE: Record<string, Module> = {};
for (const m of MODULES) {
	for (const c of m.caps) {
		CAPS[c.key] = c;
		CAP_MODULE[c.key] = m;
	}
}
export const ALL_CAP_KEYS = Object.keys(CAPS);
export const WIRED_CAP_KEYS = ALL_CAP_KEYS.filter((k) => CAPS[k].wired !== false);

export interface Preset {
	name: string;
	tone: Module['tone'];
	/** Super admin: every capability at its maximum, and not editable. */
	locked?: boolean;
	all?: 'max';
	/** Ceiling per module. */
	mods?: Record<string, Level | 'max'>;
	/** Pins that beat the module ceiling. */
	over?: Record<string, Level | 'max'>;
	/** True for the three roles the app enforces today, so the matrix can show
	 *  today's reality before anyone starts redesigning it. */
	legacy?: boolean;
	note?: string;
}

/** The first three mirror the guards in the app as they stand right now —
 *  requireSuperAdmin, requireApprover and requireAnyAdmin — so the matrix opens
 *  on the truth rather than on an aspiration. The rest are the shapes the
 *  business asked for, ready to be assigned once the guards read from here. */
export const PRESETS: Record<string, Preset> = {
	super_admin: { name: 'Super admin', tone: 'ember', locked: true, all: 'max', legacy: true,
		note: 'Every capability, by definition. Keep the count of these low.' },

	hr_admin: { name: 'HR admin', tone: 'verdant', legacy: true,
		note: 'What requireApprover allows today: the onboarding job end to end, minus the destructive and settings-level actions.',
		mods: { candidates: 'act', offer: 'act', docs: 'act', it: 'act', empid: 'act', bgv: 'act',
			exit: 'act', entities: 'view', comms: 'view', data: 'view', access: 'view' },
		over: { 'candidate.approve': 'approve', 'candidate.decision': 'approve',
			'candidate.edit': 'none', 'candidate.link': 'none', 'candidate.delete': 'none',
			'offer.manual': 'none', 'offer.upload': 'none', 'offer.approve': 'none',
			'docs.reveal': 'none', 'docs.zip': 'none', 'empid.uan': 'none',
			'exit.fnf': 'act', 'exit.closure': 'none', 'exit.reopen': 'none',
			'entity.create': 'none', 'entity.brand': 'none', 'entity.archive': 'none',
			'inbox.templates': 'none', 'inbox.lists': 'none', 'export.run': 'none',
			'team.invite': 'none', 'team.permissions': 'none' } },

	finance_team: { name: 'Finance team', tone: 'amber', legacy: true,
		note: 'What the app gives this role today: it passes requireAnyAdmin only, so it can look and run the cross-check.',
		mods: { candidates: 'view', offer: 'view', docs: 'view', it: 'view', empid: 'view', bgv: 'view',
			exit: 'view', entities: 'view', comms: 'view', data: 'view', access: 'none' },
		over: { 'docs.sync': 'act', 'docs.reveal': 'none', 'docs.zip': 'none', 'export.run': 'none' } },

	hr_manager: { name: 'HR manager', tone: 'verdant',
		note: 'Runs a desk. Signs off the things their executives should not sign off themselves.',
		mods: { candidates: 'max', offer: 'max', docs: 'act', it: 'act', empid: 'max', bgv: 'act',
			exit: 'act', entities: 'view', comms: 'act', data: 'view', access: 'view' },
		over: { 'docs.reveal': 'approve', 'docs.zip': 'approve', 'exit.closure': 'approve',
			'candidate.delete': 'none', 'export.run': 'approve', 'offer.upload': 'none', 'offer.manual': 'none' } },

	hr_exec: { name: 'HR executive', tone: 'azure',
		note: 'Does the onboarding work. Everything that needs a second pair of eyes routes upwards.',
		mods: { candidates: 'act', offer: 'act', docs: 'act', it: 'act', empid: 'act', bgv: 'act',
			exit: 'act', entities: 'view', comms: 'view', data: 'none', access: 'none' },
		over: { 'candidate.approve': 'view', 'candidate.decision': 'none', 'candidate.delete': 'none',
			'offer.approve': 'none', 'offer.manual': 'none', 'offer.upload': 'none',
			'docs.reveal': 'none', 'docs.zip': 'none', 'it.approve': 'none', 'empid.approve': 'none',
			'exit.fnf': 'view', 'exit.closure': 'none', 'exit.reopen': 'none' } },

	recruiter: { name: 'Recruiter', tone: 'amber',
		note: 'Owns the candidates they bring in, up to the point the offer goes out.',
		mods: { candidates: 'act', offer: 'act', docs: 'view', it: 'none', empid: 'none', bgv: 'view',
			exit: 'none', entities: 'view', comms: 'view', data: 'none', access: 'none' },
		over: { 'candidate.approve': 'none', 'candidate.decision': 'none', 'candidate.delete': 'none',
			'offer.approve': 'none', 'offer.send': 'none', 'offer.manual': 'none', 'offer.upload': 'none',
			'docs.review': 'act' } },

	it_coord: { name: 'IT coordinator', tone: 'violet',
		note: 'Provisioning and nothing else, but across every entity.',
		mods: { candidates: 'view', offer: 'none', docs: 'none', it: 'max', empid: 'view', bgv: 'none',
			exit: 'view', entities: 'view', comms: 'view', data: 'none', access: 'none' },
		over: { 'empid.notify': 'act', 'exit.clearance': 'act' } },

	finance: { name: 'Finance & payroll', tone: 'amber',
		note: 'Settles the money. Cannot close what it settles.',
		mods: { candidates: 'view', offer: 'view', docs: 'none', it: 'none', empid: 'view', bgv: 'none',
			exit: 'act', entities: 'view', comms: 'none', data: 'view', access: 'none' },
		over: { 'empid.uan': 'act', 'exit.fnf': 'approve', 'exit.closure': 'none', 'export.run': 'approve' } },

	auditor: { name: 'Auditor', tone: 'azure',
		note: 'Reads everything, changes nothing, and cannot take the data out.',
		mods: { candidates: 'view', offer: 'view', docs: 'view', it: 'view', empid: 'view', bgv: 'view',
			exit: 'view', entities: 'view', comms: 'view', data: 'view', access: 'view' },
		over: { 'docs.reveal': 'none', 'docs.zip': 'none', 'export.run': 'none' } }
};
export const PRESET_KEYS = Object.keys(PRESETS);

export const TONE_HEX: Record<Module['tone'], string> = {
	ember: '#ff7d55', verdant: '#3ecf9a', azure: '#7ba7f0',
	amber: '#f2b15c', crimson: '#f07575', violet: '#9278ff'
};

/** Whose records, as distinct from what may be done to them. */
export type Population = 'own' | 'team' | 'tree' | 'entity' | 'all';
export const POPULATIONS: Array<{ k: Population; t: string; d: string }> = [
	{ k: 'own', t: 'Only their own records', d: 'Candidates and exits they created.' },
	{ k: 'team', t: 'Their direct reports’ records', d: 'Their own, plus everyone reporting straight to them.' },
	{ k: 'tree', t: 'Their whole reporting tree', d: 'Every level beneath them on the org chart.' },
	{ k: 'entity', t: 'Everything in their entities', d: 'All records for the entities ticked above.' },
	{ k: 'all', t: 'Every record in the group', d: 'No entity or ownership limit. Use sparingly.' }
];

/** Pairs one person should not hold at once. */
export const SOD_RULES: Array<{ a: string; b: string; t: string; d: string }> = [
	{ a: 'offer.draft', b: 'offer.approve', t: 'Drafts and approves the same offer',
		d: 'The person setting the CTC also releases it. Route approval to their reporting manager instead.' },
	{ a: 'empid.assign', b: 'empid.approve', t: 'Issues and approves employee codes',
		d: 'A code can reach payroll without a second pair of eyes.' },
	{ a: 'candidate.create', b: 'candidate.approve', t: 'Creates and approves the same candidate',
		d: 'A record can pass onboarding end to end with no review.' },
	{ a: 'exit.fnf', b: 'exit.closure', t: 'Settles and closes the same F&F',
		d: 'Full & final figures go out unchecked.' },
	{ a: 'docs.reveal', b: 'export.run', t: 'Can unmask PII and bulk-export it',
		d: 'Aadhaar and PAN in the clear, downloadable in one file.' }
];

// ── resolution ───────────────────────────────────────────────────────────────

export function levelIndex(l: Level): number {
	return LEVELS.indexOf(l);
}
export function capLevels(cap: string): readonly Level[] {
	return KIND_LEVELS[CAPS[cap]?.kind ?? 'read'];
}
export function capMax(cap: string): Level {
	const ls = capLevels(cap);
	return ls[ls.length - 1];
}

/** A capability only offers the levels its kind defines, so a preset asking for
 *  `approve` on a read-only capability lands on `view`, not on a level that
 *  does not exist. Clamping downwards keeps a broad preset safe. */
export function clampLevel(cap: string, wanted: Level | 'max'): Level {
	const allowed = capLevels(cap);
	if (wanted === 'max') return allowed[allowed.length - 1];
	if (allowed.includes(wanted)) return wanted;
	for (let i = LEVELS.indexOf(wanted); i >= 0; i--) {
		if (allowed.includes(LEVELS[i])) return LEVELS[i];
	}
	return 'none';
}

export function presetLevel(presetKey: string, cap: string): Level {
	const p = PRESETS[presetKey];
	if (!p) return 'none';
	if (p.all) return clampLevel(cap, p.all);
	if (p.over && p.over[cap] !== undefined) return clampLevel(cap, p.over[cap]);
	const mod = CAP_MODULE[cap]?.key ?? '';
	return clampLevel(cap, p.mods?.[mod] ?? 'none');
}

/** The shape the matrix and the simulator both read. Kept deliberately plain so
 *  it can come from a Mongo document or from unsaved edits in the browser. */
export interface Grantee {
	preset: string;
	grants: Record<string, Level>;
	checkers: Record<string, boolean>;
	population: Population;
	entities: 'all' | string[];
	tracks: 'all' | string[];
	status: 'active' | 'disabled';
	accessExpiresAt?: string | null;
	reportsTo?: string | null;
}

/** Effective level = personal override if set, else the preset, clamped to what
 *  the capability offers. Super admin short-circuits to the maximum. */
export function effectiveLevel(g: Grantee, cap: string): Level {
	if (PRESETS[g.preset]?.locked) return capMax(cap);
	const o = g.grants?.[cap];
	return o !== undefined ? clampLevel(cap, o) : presetLevel(g.preset, cap);
}

export function isOverride(g: Grantee, cap: string): boolean {
	if (PRESETS[g.preset]?.locked) return false;
	const o = g.grants?.[cap];
	return o !== undefined && o !== presetLevel(g.preset, cap);
}

export function grantedCount(g: Grantee): number {
	return ALL_CAP_KEYS.filter((k) => effectiveLevel(g, k) !== 'none').length;
}

/** Clashes where the same person both does a thing and signs it off, with no
 *  second signature routed. A capability sent to a manager for sign-off is not
 *  a clash — that is exactly the remedy. */
export function sodConflicts(g: Grantee) {
	return SOD_RULES.filter(
		(r) =>
			levelIndex(effectiveLevel(g, r.a)) >= levelIndex('act') &&
			levelIndex(effectiveLevel(g, r.b)) >= levelIndex('act') &&
			!g.checkers?.[r.a] &&
			!g.checkers?.[r.b]
	);
}

/** Access that has lapsed is not the same as a disabled login: the person can
 *  still sign in and be told their access ended, rather than bouncing off a
 *  login screen with no explanation. */
export function accessLapsed(g: Grantee, now = new Date()): boolean {
	if (!g.accessExpiresAt) return false;
	const t = new Date(g.accessExpiresAt);
	return !isNaN(t.getTime()) && t.getTime() < now.getTime();
}
