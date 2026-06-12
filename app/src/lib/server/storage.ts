// StorageProvider — DO Spaces in prod, MinIO in dev. Both speak S3.
import {
	S3Client,
	PutObjectCommand,
	GetObjectCommand,
	HeadObjectCommand,
	DeleteObjectCommand
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { env } from '$env/dynamic/private';

const s3 = new S3Client({
	endpoint: env.S3_ENDPOINT,
	region: env.S3_REGION ?? 'blr1',
	credentials: { accessKeyId: env.S3_ACCESS_KEY, secretAccessKey: env.S3_SECRET_KEY },
	forcePathStyle: env.S3_FORCE_PATH_STYLE === 'true'
});

const BUCKET = env.S3_BUCKET ?? 'champ-onboard-docs';
const PRESIGN_SECONDS = 600; // 10 min (PRD §9)

export function objectKey(candidateId: string, docType: string, ext: string): string {
	return `candidates/${candidateId}/${docType}/${crypto.randomUUID()}.${ext}`;
}

export function presignPut(key: string, mime: string) {
	return getSignedUrl(s3, new PutObjectCommand({ Bucket: BUCKET, Key: key, ContentType: mime }), {
		expiresIn: PRESIGN_SECONDS
	});
}

export function presignGet(key: string) {
	return getSignedUrl(s3, new GetObjectCommand({ Bucket: BUCKET, Key: key }), {
		expiresIn: PRESIGN_SECONDS
	});
}

export async function objectExists(key: string): Promise<number | null> {
	try {
		const head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
		return head.ContentLength ?? 0;
	} catch {
		return null;
	}
}

export async function getObjectBytes(key: string): Promise<Uint8Array> {
	const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
	return res.Body!.transformToByteArray();
}

export async function deleteObject(key: string) {
	await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
}
