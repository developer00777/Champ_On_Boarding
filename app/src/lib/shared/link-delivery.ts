// How an Admin-track (HR-filed) hire is handed their onboarding link — HR's
// call, case by case (HR decision, Nov 2026). Every other track always has
// the link emailed.
//   email  mailed to the address on record
//   copy   HR copies it and sends it themselves (usually WhatsApp); nothing
//          is mailed or messaged from the portal
//   none   no link at all: HR fills the record in by hand

export const LINK_DELIVERIES = ['email', 'copy', 'none'] as const;
export type LinkDelivery = (typeof LINK_DELIVERIES)[number];

/** A WhatsApp share link with the message filled in. With a mobile number it
 *  opens that person's chat straight away; without one WhatsApp asks HR to
 *  pick a chat. A bare 10-digit number is taken as Indian, the same reading
 *  the Twilio sender gives it. */
export function waShareUrl(mobile: string | null | undefined, text: string): string {
	let digits = String(mobile ?? '').replace(/\D/g, '').replace(/^0+/, '');
	if (digits.length === 10) digits = `91${digits}`;
	return `https://wa.me/${digits.length >= 11 ? digits : ''}?text=${encodeURIComponent(text)}`;
}
