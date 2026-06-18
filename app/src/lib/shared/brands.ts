// Brand registry — one entry per Champions Group property.
// Derived directly from the design-system .md files. This is the single source
// of truth for per-company theming: when HR picks a company, its `brandSlug`
// selects one of these themes, and every candidate-facing surface (portal,
// onboarding form, email) renders in that brand's colours, fonts and logo.
//
// To add a brand: add an entry here + seed a company row with its slug. To swap
// in a real logo: drop the file in static/brands/ and point `logo` at it.

export interface BrandTheme {
	slug: string;
	/** Display name shown to HR and candidates. */
	name: string;
	/** Short legal/sign-off name used in emails. */
	legalName: string;
	/** Brand one-liner, used in welcome hero subcopy fallback. */
	tagline: string;

	colors: {
		/** Primary brand colour — nav, primary buttons, key accents. */
		primary: string;
		/** Darker shade of primary for hover/pressed states. */
		primaryDark: string;
		/** Secondary accent — highlights, chips, icons. */
		accent: string;
		/** Deep surface colour — hero background, dark sections, appbar mark. */
		ink: string;
		/** Page background. */
		bg: string;
		/** Card / surface background. */
		surface: string;
		/** Primary body text. */
		text: string;
		/** Muted / secondary text. */
		muted: string;
		/** Border / divider colour. */
		border: string;
		/** Colour for text placed on top of `primary` / `ink` (usually #fff). */
		onPrimary: string;
		/** Hero gradient (CSS value) — falls back to ink if a brand is flat. */
		heroGradient: string;
	};

	fonts: {
		/** Heading typeface stack. */
		heading: string;
		/** Body typeface stack. */
		body: string;
		/** Google Fonts families to load (family names, space-encoded as +). */
		googleFamilies: string[];
	};

	/** Border radius for buttons/CTAs (px). 0 = sharp-edged brands (Cirrologix). */
	buttonRadius: number;
	/** Border radius for cards (px). */
	cardRadius: number;
	/** Whether CTA labels are uppercased. */
	uppercaseCta: boolean;

	logo: {
		/** Path under static/ to the brand logo. */
		src: string;
		/** Monogram fallback text rendered if the asset is missing. */
		monogram: string;
		/**
		 * True when the logo art is light/white (designed for dark backgrounds).
		 * The UI then places it on the brand's `ink` surface so it stays legible.
		 */
		onDark?: boolean;
	};
}

export const BRANDS: BrandTheme[] = [
	{
		slug: 'champion-infratech',
		name: 'Champion Infratech',
		legalName: 'Champion Infratech',
		tagline: 'Coastal luxury real estate & beach-lagoon development.',
		colors: {
			primary: '#1E73BE',
			primaryDark: '#003863',
			accent: '#26C0BE',
			ink: '#003863',
			bg: '#FFFFFF',
			surface: '#FFFFFF',
			text: '#191919',
			muted: '#5C6872',
			border: '#E3E9EF',
			onPrimary: '#FFFFFF',
			heroGradient: 'linear-gradient(135deg, #003863 0%, #1E73BE 55%, #26C0BE 100%)'
		},
		fonts: {
			heading: "'Montserrat', Arial, sans-serif",
			body: "'Montserrat', Arial, sans-serif",
			googleFamilies: ['Montserrat:wght@400;500;600;700;800']
		},
		buttonRadius: 5,
		cardRadius: 14,
		uppercaseCta: true,
		logo: { src: '/brands/champion-infratech.png', monogram: 'CI', onDark: true }
	},
	{
		slug: 'champions-club',
		name: 'Champions Club',
		legalName: 'Champions Club',
		tagline: 'Ultra-premium luxury lifestyle — yachts, air charters, curated experiences.',
		colors: {
			primary: '#DAA548',
			primaryDark: '#b8893a',
			accent: '#FFC107',
			ink: '#1A2B48',
			bg: '#FFFFFF',
			surface: '#FFFFFF',
			text: '#000000',
			muted: '#5E6D77',
			border: '#E4E7EC',
			onPrimary: '#FFFFFF',
			heroGradient: 'linear-gradient(135deg, #000000 0%, #1A2B48 70%, #2c4775 100%)'
		},
		fonts: {
			heading: "'Ubuntu Sans', 'Ubuntu', Arial, sans-serif",
			body: "'Ubuntu Sans', 'Ubuntu', Arial, sans-serif",
			googleFamilies: ['Ubuntu:wght@400;500;700']
		},
		buttonRadius: 3,
		cardRadius: 10,
		uppercaseCta: true,
		logo: { src: '/brands/champions-club.png', monogram: 'CC', onDark: true }
	},
	{
		slug: 'ip-momentum',
		name: 'IP Momentum',
		legalName: 'IP Momentum',
		tagline: 'B2B VoIP products & solutions — tech-forward and energetic.',
		colors: {
			primary: '#07294F',
			primaryDark: '#03182f',
			accent: '#D9FF43',
			ink: '#07294F',
			bg: '#FFFFFF',
			surface: '#FFFFFF',
			text: '#1b1b1b',
			muted: '#6B6B6B',
			border: '#E1E1E1',
			onPrimary: '#FFFFFF',
			heroGradient: 'linear-gradient(135deg, #07294F 0%, #003D2B 100%)'
		},
		fonts: {
			heading: "'DM Sans', Arial, sans-serif",
			body: "'DM Sans', Arial, sans-serif",
			googleFamilies: ['DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,600;9..40,700']
		},
		buttonRadius: 50,
		cardRadius: 9,
		uppercaseCta: false,
		logo: { src: '/brands/ip-momentum.png', monogram: 'IP' }
	},
	{
		slug: 'champion-products',
		name: 'Champion Products',
		legalName: 'Champion Products',
		tagline: 'B2B foodservice & janitorial supply — clean, functional, product-first.',
		colors: {
			primary: '#252F3D',
			primaryDark: '#141920',
			accent: '#C49931',
			ink: '#252F3D',
			bg: '#F4F3F3',
			surface: '#FFFFFF',
			text: '#040404',
			muted: '#717171',
			border: '#E3E1E1',
			onPrimary: '#FFFFFF',
			heroGradient: 'linear-gradient(135deg, #141920 0%, #252F3D 100%)'
		},
		fonts: {
			heading: "'Poppins', Arial, sans-serif",
			body: "'Poppins', Arial, sans-serif",
			googleFamilies: ['Poppins:wght@400;500;600;700']
		},
		buttonRadius: 4,
		cardRadius: 8,
		uppercaseCta: false,
		logo: { src: '/brands/champion-products.webp', monogram: 'CP', onDark: true }
	},
	{
		slug: 'champion-infometrics',
		name: 'Champion Infometrics',
		legalName: 'Champion Infometrics',
		tagline: 'B2B sales intelligence, marketing services & GCC solutions.',
		colors: {
			primary: '#00529C',
			primaryDark: '#003d75',
			accent: '#F26522',
			ink: '#00529C',
			bg: '#FFFFFF',
			surface: '#FFFFFF',
			text: '#000000',
			muted: '#8F8F8F',
			border: '#E5EDF5',
			onPrimary: '#FFFFFF',
			heroGradient: 'linear-gradient(135deg, #00529C 0%, #0066c4 60%, #F26522 100%)'
		},
		fonts: {
			heading: "'Poppins', Arial, sans-serif",
			body: "'Poppins', Arial, sans-serif",
			googleFamilies: ['Poppins:wght@300;400;500;700']
		},
		buttonRadius: 4,
		cardRadius: 10,
		uppercaseCta: false,
		logo: { src: '/brands/champion-infometrics.png', monogram: 'CIM' }
	},
	{
		slug: 'champions-yacht-club',
		name: 'Champions Yacht Club',
		legalName: 'Champions Yacht Club',
		tagline: 'Luxury yacht charter & experiences in Goa — aspirational, nautical.',
		colors: {
			primary: '#D69551',
			primaryDark: '#c47e3a',
			accent: '#FF9933',
			ink: '#13172B',
			bg: '#FFFFFF',
			surface: '#FFFFFF',
			text: '#3a3f4d',
			muted: '#696E7D',
			border: '#E5E6EA',
			onPrimary: '#FFFFFF',
			heroGradient: 'linear-gradient(135deg, #13172B 0%, #2a3052 70%, #D69551 130%)'
		},
		fonts: {
			heading: "'Bai Jamjuree', Arial, sans-serif",
			body: "'Work Sans', Arial, sans-serif",
			googleFamilies: ['Bai+Jamjuree:wght@400;500;700', 'Work+Sans:wght@400;500;600']
		},
		buttonRadius: 4,
		cardRadius: 5,
		uppercaseCta: false,
		logo: { src: '/brands/champions-yacht-club.png', monogram: 'CYC' }
	},
	{
		slug: 'cirrologix',
		name: 'Cirrologix',
		legalName: 'Cirrologix',
		tagline: 'Enterprise CRM, ATS, VoIP & workforce automation.',
		colors: {
			primary: '#007aff',
			primaryDark: '#0062cc',
			accent: '#549F57',
			ink: '#001431',
			bg: '#efFCFF',
			surface: '#FFFFFF',
			text: '#61666F',
			muted: '#9F9F9F',
			border: '#E2E2E2',
			onPrimary: '#FFFFFF',
			heroGradient: 'linear-gradient(135deg, #001431 0%, #002a5c 100%)'
		},
		fonts: {
			heading: "'DM Sans', Arial, sans-serif",
			body: "'DM Sans', Arial, sans-serif",
			googleFamilies: ['DM+Sans:opsz,wght@9..40,400;9..40,500;9..40,700']
		},
		buttonRadius: 0,
		cardRadius: 0,
		uppercaseCta: true,
		logo: { src: '/brands/cirrologix.png', monogram: 'CL' }
	}
];

const BY_SLUG = new Map(BRANDS.map((b) => [b.slug, b]));

/** The brand used when a company has no brandSlug (or an unknown one). */
export const DEFAULT_BRAND_SLUG = 'champion-infratech';

export function brandBySlug(slug: string | null | undefined): BrandTheme {
	return (slug && BY_SLUG.get(slug)) || BY_SLUG.get(DEFAULT_BRAND_SLUG)!;
}

/** Convert a #rrggbb hex to an rgba() string with the given alpha. */
function hexToRgba(hex: string, alpha: number): string {
	const h = hex.replace('#', '');
	const r = parseInt(h.slice(0, 2), 16);
	const g = parseInt(h.slice(2, 4), 16);
	const b = parseInt(h.slice(4, 6), 16);
	return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** CSS custom-property block for a brand, for inlining in <svelte:head> / email. */
export function brandCssVars(b: BrandTheme): string {
	const c = b.colors;
	return [
		`--brand-primary:${c.primary}`,
		`--brand-primary-dark:${c.primaryDark}`,
		`--brand-accent:${c.accent}`,
		`--brand-ink:${c.ink}`,
		`--brand-bg:${c.bg}`,
		`--brand-surface:${c.surface}`,
		`--brand-text:${c.text}`,
		`--brand-muted:${c.muted}`,
		`--brand-border:${c.border}`,
		`--brand-on-primary:${c.onPrimary}`,
		`--brand-hero:${c.heroGradient}`,
		`--brand-font-heading:${b.fonts.heading}`,
		`--brand-font-body:${b.fonts.body}`,
		`--brand-btn-radius:${b.buttonRadius}px`,
		`--brand-card-radius:${b.cardRadius}px`,
		`--brand-cta-transform:${b.uppercaseCta ? 'uppercase' : 'none'}`,
		// Button drop-shadow tinted to the brand primary (replaces the default purple glow).
		`--brand-btn-shadow:0 10px 28px -8px ${hexToRgba(c.primary, 0.45)}`,
		`--brand-focus-ring:${hexToRgba(c.primary, 0.18)}`,
		// Background behind the logo: dark ink for white logos, transparent otherwise.
		`--brand-logo-bg:${b.logo.onDark ? c.ink : 'transparent'}`,
		`--brand-logo-pad:${b.logo.onDark ? '8px 14px' : '0'}`
	].join(';');
}

/** Google Fonts <link> href for a brand, or '' if none. */
export function brandFontsHref(b: BrandTheme): string {
	const fams = b.fonts.googleFamilies;
	if (!fams.length) return '';
	return 'https://fonts.googleapis.com/css2?' + fams.map((f) => `family=${f}`).join('&') + '&display=swap';
}
