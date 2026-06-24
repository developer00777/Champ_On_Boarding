// StorageProvider — MongoDB GridFS. Files are stored directly in the Railway MongoDB instance.
import { GridFSBucket, ObjectId } from 'mongodb';
import { mongoose } from './db';
import type { Readable } from 'node:stream';

function bucket(): GridFSBucket {
	const db = mongoose.connection.db;
	if (!db) throw new Error('MongoDB not connected');
	return new GridFSBucket(db, { bucketName: 'documents' });
}

export async function uploadToGridFS(
	stream: Readable,
	filename: string,
	mime: string
): Promise<ObjectId> {
	return new Promise((resolve, reject) => {
		const uploadStream = bucket().openUploadStream(filename, {
			contentType: mime
		});
		stream.pipe(uploadStream);
		uploadStream.on('finish', () => resolve(uploadStream.id as ObjectId));
		uploadStream.on('error', reject);
		stream.on('error', reject);
	});
}

export async function uploadBytesToGridFS(
	bytes: Uint8Array,
	filename: string,
	mime: string
): Promise<ObjectId> {
	const { Readable } = await import('node:stream');
	const stream = Readable.from(Buffer.from(bytes));
	return uploadToGridFS(stream, filename, mime);
}

export async function getGridFSBytes(id: ObjectId): Promise<Uint8Array> {
	const chunks: Buffer[] = [];
	const downloadStream = bucket().openDownloadStream(id);
	return new Promise((resolve, reject) => {
		downloadStream.on('data', (chunk: Buffer) => chunks.push(chunk));
		downloadStream.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))));
		downloadStream.on('error', reject);
	});
}

export async function getGridFSStream(id: ObjectId) {
	return bucket().openDownloadStream(id);
}

export async function deleteFromGridFS(id: ObjectId): Promise<void> {
	await bucket().delete(id);
}

export async function gridFSFileSize(id: ObjectId): Promise<number | null> {
	try {
		const files = await bucket().find({ _id: id }).toArray();
		return files[0]?.length ?? null;
	} catch {
		return null;
	}
}
