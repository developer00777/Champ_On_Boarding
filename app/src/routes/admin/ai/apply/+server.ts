// Applying an access proposal.
//
// Deliberately a separate endpoint from the chat turn, with its own
// authorisation, taking its parameters from the request rather than from
// anything the model said. The model's proposal is a suggestion rendered on
// screen; this is the only thing that writes, and a human has to press it.
//
// That separation is the whole defence. Candidate-supplied text reaches the
// model, and no model reliably distinguishes data from instruction — so the
// model is never given a way to act. The worst a poisoned record can achieve
// is a card appearing that a super admin has to read and approve.
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { Admin } from '$lib/server/db/schema';
import { audit } from '$lib/server/audit';
import { CAPS, LEVELS, PRESETS, effectiveLevel, type Level } from '$lib/shared/access';

export const config = { runtime: 'nodejs24.x' };

export const POST: RequestHandler = async ({ request, locals, getClientAddress }) => {
	if (!locals.admin) error(401, 'Not authenticated');
	// Changing anyone's access is a super admin's call, the same rule the access
	// studio enforces. Re-checked here rather than inherited from whoever was
	// allowed to see the tool.
	if (locals.admin.role !== 'super_admin')
		error(403, 'Only a super admin can change access.');

	const body = (await request.json().catch(() => null)) as {
		email?: string;
		capability?: string;
		level?: Level;
	} | null;

	const email = String(body?.email ?? '').trim().toLowerCase();
	const capability = String(body?.capability ?? '');
	const level = String(body?.level ?? '') as Level;

	if (!CAPS[capability]) error(400, 'Unknown capability.');
	if (!LEVELS.includes(level)) error(400, 'Unknown level.');

	const target = await Admin.findOne({ email });
	if (!target) error(404, 'No login with that email.');

	const grantee = {
		preset: PRESETS[target.role] ? target.role : 'hr_admin',
		grants: {},
		checkers: {},
		population: 'all' as const,
		entities: 'all' as const,
		tracks: 'all' as const,
		status: 'active' as const
	};
	const before = effectiveLevel(grantee, capability);

	// Written to the studio's grant list, exactly as the studio writes it — a
	// list rather than a map because capability keys carry dots, which Mongo
	// treats as paths in a field name.
	const existing = (Array.isArray(target.grants) ? target.grants : []) as {
		cap?: string;
		level?: string;
	}[];
	const kept = existing.filter((g) => g.cap !== capability);
	const grants = [...kept, { cap: capability, level }];
	await Admin.findByIdAndUpdate(target._id, { $set: { grants } });

	await audit({
		actor: locals.admin.email,
		action: 'access_updated',
		field: `${target.email} · ${capability}`,
		oldValue: before,
		newValue: `${level} (proposed by the assistant, applied by hand)`,
		ip: getClientAddress()
	});

	return json({
		applied: true,
		email: target.email,
		capability,
		capabilityLabel: CAPS[capability].label,
		from: before,
		to: level,
		// Said plainly rather than left for someone to discover: the app still
		// decides access from `role`, so this is recorded intent until the
		// guards read from the capability model.
		enforced: false
	});
};
