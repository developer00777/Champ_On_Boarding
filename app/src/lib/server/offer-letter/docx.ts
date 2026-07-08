// Fills `[Placeholder]` tokens in a .docx template's word/document.xml.
// The template's placeholders were verified to each sit inside a single Word
// XML text run (no split runs), so a literal string replace is safe here —
// no need for a full templating engine like docxtemplater.
import PizZip from 'pizzip';

function escapeXml(value: string): string {
	return value
		.replace(/&/g, '&amp;')
		.replace(/</g, '&lt;')
		.replace(/>/g, '&gt;')
		.replace(/"/g, '&quot;')
		.replace(/'/g, '&apos;');
}

/** Replace every `[Key]` occurrence in the template with its mapped value. */
export function fillDocxTemplate(templateBuffer: Buffer, fields: Record<string, string>): Buffer {
	const zip = new PizZip(templateBuffer);
	const path = 'word/document.xml';
	const file = zip.file(path);
	if (!file) throw new Error(`${path} not found in docx template`);

	let xml = file.asText();
	for (const [key, value] of Object.entries(fields)) {
		xml = xml.split(`[${key}]`).join(escapeXml(value));
	}

	zip.file(path, xml);
	return zip.generate({ type: 'nodebuffer', compression: 'DEFLATE' });
}
