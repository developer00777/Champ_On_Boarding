// Deleting an exit: its tokens, clearances, and every file it owns.
//
// Separate module because both the list page and the detail page delete, and
// the GridFS blobs must go with the rows — an orphaned blob is invisible and
// unreclaimable once its metadata row is gone.
import { ObjectId } from 'mongodb';
import { Exit, ExitClearance, ExitDocument, ExitToken } from '$lib/server/db/schema';
import { deleteFromGridFS } from '$lib/server/storage';

export async function deleteExitCascade(exitId: string) {
	const [files, clearances] = await Promise.all([
		ExitDocument.find({ exitId }).lean(),
		ExitClearance.find({ exitId }).lean()
	]);

	// Blobs first, best-effort per file: a missing blob must not block the row
	// deletions that follow.
	for (const f of files) {
		await deleteFromGridFS(f.gridfsId as ObjectId).catch(() => {});
	}
	for (const c of clearances) {
		if (c.signatureGridfsId) await deleteFromGridFS(c.signatureGridfsId as ObjectId).catch(() => {});
	}

	await Promise.all([
		ExitDocument.deleteMany({ exitId }),
		ExitClearance.deleteMany({ exitId }),
		ExitToken.deleteMany({ exitId })
	]);
	await Exit.findByIdAndDelete(exitId);
}
