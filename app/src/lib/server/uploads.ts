// Upload validation shared by the onboarding side: the candidate's own
// uploader and HR's reference-document uploader.
//
// The browser-supplied Content-Type on a form field is client-controlled and
// proves nothing — a renamed executable can declare "image/png" — so the actual
// bytes are checked too. The offboarding side keeps its own copy alongside its
// exit-specific MIME lists (server/offboarding/uploads.ts).

const MAGIC_BYTES: Record<string, (bytes: Uint8Array) => boolean> = {
	'image/jpeg': (b) => b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
	'image/png': (b) =>
		b.length >= 8 &&
		b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
		b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a,
	'application/pdf': (b) =>
		b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d
};

export function matchesMagicBytes(mime: string, bytes: Uint8Array): boolean {
	const check = MAGIC_BYTES[mime];
	// No signature defined (webp) — skip, the MIME allowlist still applies.
	return check ? check(bytes) : true;
}

/** File extension for a stored object, so a download lands with a name the OS
 *  will open rather than an extensionless blob. */
export function extFor(mime: string): string {
	if (mime === 'application/pdf') return 'pdf';
	if (mime === 'image/png') return 'png';
	if (mime === 'image/webp') return 'webp';
	return 'jpg';
}

/** A filename safe to put in a Content-Disposition header and on a filesystem.
 *  Falls back rather than returning an empty string, so a download is never
 *  offered with no name at all. */
export function safeFilename(name: string, fallback = 'document'): string {
	const cleaned = name
		.replace(/[\r\n"]/g, '')
		.replace(/[^a-zA-Z0-9 _.\-()]/g, '')
		.trim()
		.replace(/\s+/g, '_')
		.slice(0, 120);
	return cleaned || fallback;
}
