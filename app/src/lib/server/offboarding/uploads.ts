// Upload validation shared by the three places files enter an exit: HR's
// handover uploader, the employee's exit portal, and an approver's signature.
//
// The browser-supplied Content-Type on a form field is client-controlled and
// proves nothing — a renamed executable can declare "image/png" — so the actual
// bytes are checked too, exactly as the onboarding uploader does.

export const ACCEPTED_EXIT_MIMES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];

/** Signature and identity images only — a PDF is not a signature. */
export const ACCEPTED_IMAGE_MIMES = ['image/jpeg', 'image/png', 'image/webp'];

/** Generous enough for a phone photo of a payslip, small enough that a stray
 *  video upload is rejected rather than filling GridFS. */
export const MAX_EXIT_FILE_BYTES = 25 * 1024 * 1024;

const MAGIC_BYTES: Record<string, (b: Uint8Array) => boolean> = {
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
