// The assistant's chat turn.
//
// Any signed-in admin may talk to it; what it can see is decided per-caller by
// the capability gate in lib/server/ai/tools.ts, not here. That keeps one
// answer to "what may this person see" rather than two that can disagree.
import { json, error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';
import { chat, type ChatMessage } from '$lib/server/ai/chat';
import { audit } from '$lib/server/audit';

export const config = { runtime: 'nodejs24.x' };

/** A question long enough to be a paste of a whole document is a question the
 *  model will answer badly and the wallet will feel. Schemas are short. */
const MAX_QUESTION = 4000;

export const POST: RequestHandler = async ({ request, locals, getClientAddress }) => {
	if (!locals.admin) error(401, 'Not authenticated');

	const body = (await request.json().catch(() => null)) as {
		question?: string;
		history?: ChatMessage[];
	} | null;
	const question = String(body?.question ?? '').trim();
	if (!question) error(400, 'Ask a question.');
	if (question.length > MAX_QUESTION) error(400, 'That question is too long.');

	const history = Array.isArray(body?.history)
		? body!.history
				.filter((m) => (m?.role === 'user' || m?.role === 'assistant') && typeof m.content === 'string')
				.map((m) => ({ role: m.role, content: String(m.content).slice(0, MAX_QUESTION) }))
		: [];

	let result;
	try {
		result = await chat(locals.admin, history, question);
	} catch (e) {
		console.error('[ai] chat failed:', e);
		error(502, 'The assistant could not be reached. Try again in a moment.');
	}

	// The question is logged, not the answer: it records who asked what of the
	// data, which is the accountability that matters, without copying candidate
	// details into a second place.
	await audit({
		actor: locals.admin.email,
		action: 'ai_assistant_query',
		field: result.usedTools.join(',') || undefined,
		newValue: question.slice(0, 300),
		ip: getClientAddress()
	});

	return json(result);
};
