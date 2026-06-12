import { error, redirect } from '@sveltejs/kit';
import { and, eq } from 'drizzle-orm';
import type { RequestHandler } from './$types';
import { db, t } from '$lib/server/db';
import { presignGet } from '$lib/server/storage';
import { audit } from '$lib/server/audit';

// Documents are never public — this issues a short-lived presigned URL after RBAC (PRD §9).
export const GET: RequestHandler = async ({ params, locals, getClientAddress }) => {
	const [doc] = await db
		.select()
		.from(t.documents)
		.where(and(eq(t.documents.id, params.docId), eq(t.documents.candidateId, params.id)));
	if (!doc) error(404, 'Document not found');

	await audit({
		candidateId: params.id,
		actor: locals.admin!.email,
		action: 'document_viewed',
		field: doc.docType,
		ip: getClientAddress()
	});
	redirect(302, await presignGet(doc.spacesKey));
};
