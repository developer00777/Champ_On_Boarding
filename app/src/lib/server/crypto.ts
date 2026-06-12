import { createHash, randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';
import { env } from '$env/dynamic/private';

export function randomToken(bytes = 32): string {
	return randomBytes(bytes).toString('base64url');
}

export function sha256(value: string): string {
	return createHash('sha256').update(value).digest('hex');
}

function key(): Buffer {
	const k = env.ENCRYPTION_KEY;
	if (!k || k.length !== 64) throw new Error('ENCRYPTION_KEY must be 32 bytes hex');
	return Buffer.from(k, 'hex');
}

// AES-256-GCM, payload = iv.ciphertext.tag base64url — used for Aadhaar numbers (PRD §9)
export function encrypt(plain: string): string {
	const iv = randomBytes(12);
	const cipher = createCipheriv('aes-256-gcm', key(), iv);
	const enc = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
	return `${iv.toString('base64url')}.${enc.toString('base64url')}.${cipher.getAuthTag().toString('base64url')}`;
}

export function decrypt(payload: string): string {
	const [iv, data, tag] = payload.split('.');
	const decipher = createDecipheriv('aes-256-gcm', key(), Buffer.from(iv, 'base64url'));
	decipher.setAuthTag(Buffer.from(tag, 'base64url'));
	return Buffer.concat([
		decipher.update(Buffer.from(data, 'base64url')),
		decipher.final()
	]).toString('utf8');
}
