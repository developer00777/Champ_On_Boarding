export async function offerLetterTemplateBuffer(): Promise<Buffer> {
	const { OFFER_LETTER_TEMPLATE_BASE64 } = await import('./template-data');
	return Buffer.from(OFFER_LETTER_TEMPLATE_BASE64, 'base64');
}
