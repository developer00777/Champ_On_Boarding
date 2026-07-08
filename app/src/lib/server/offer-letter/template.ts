import { OFFER_LETTER_TEMPLATE_BASE64 } from './template-data';

export function offerLetterTemplateBuffer(): Buffer {
	return Buffer.from(OFFER_LETTER_TEMPLATE_BASE64, 'base64');
}
