# Champion Group — Consolidated Design System
> Production-grade design context for AI coding workflows · designmd format
> Generated: 2026-06-18
> Covers 6 properties: championinfratech.com · champions.club · ipmomentum.com · championproducts.com · championinfometrics.com · championsyachtclub.com

---

## Table of Contents
1. [Champion Infratech](#1-champion-infratech--championinfratechcom)
2. [Champions Club](#2-champions-club--championsclubiobangalore)
3. [IP Momentum](#3-ip-momentum--ipmomentumcom)
4. [Champion Products](#4-champion-products--championproductscom)
5. [Champion Infometrics](#5-champion-infometrics--championinfometricscom)
6. [Champions Yacht Club](#6-champions-yacht-club--championsyachtclubcom)
7. [Cross-Brand Design Comparison](#7-cross-brand-design-comparison)

---

---

# 1. Champion Infratech · championinfratech.com

> Real estate & beach lagoon development brand. Coastal luxury, eco-premium.

## Visual Theme & Atmosphere
Bold coastal luxury aesthetic. Full-bleed beach lagoon photography dominates the hero. Deep ocean blues and teal accents directly evoke the product. Elementor/WordPress layout with modular sections. High-contrast white text on photo backgrounds. Counter-animated stats provide social proof. Alternating white and aqua section backgrounds ground the layout in professionalism.

## Color Palette

| Role | Hex | Usage |
|------|-----|-------|
| Primary Navy | #003863 | Headings, deep UI surfaces, CTA buttons |
| Nav Blue | #1E73BE | Navigation bar background |
| Link Blue | #0066B3 | Secondary links, hover states |
| Teal Accent | #26C0BE | Icons, highlights, feature callouts |
| Teal Translucent | rgba(22,191,191,0.7) | Overlays, animations |
| Aqua Surface | #B5EEFF | Light section backgrounds |
| White | #FFFFFF | Page bg, cards |
| Off-White | #EFEFEF | Separators, secondary surfaces |
| Body Text | #191919 | Primary text |
| Muted Text | #5C6872 | Secondary / captions |
| Error | #DC3545 | Alerts |

## Typography

**Fonts:** Montserrat (primary) · Darker Grotesque (accent)

| Role | Size | Weight | Line Height | Color |
|------|------|--------|-------------|-------|
| H1 | 40px | 600 | 50px | #ffffff |
| H2 | 32px | 600 | 40px | #ffffff |
| H3 | 28px | 600 | 28px | varies |
| H4 | 24px | 400 | 40px | #191919 |
| H5 | 18px | 400 | 27px | #191919 |
| Body | 16px | 400 | 30px | #191919 |
| Body LG | 18px | 400 | 32px | #191919 |
| Nav | 15px | 500 | 20px | #003863 |
| CTA | 18px | 500 | — | #ffffff |

## Components

**Primary CTA Button**
```css
.button-primary {
  background-color: #6a7279;
  color: #ffffff;
  border-radius: 5px;
  padding: 20px 40px;
  font-size: 18px;
  font-weight: 500;
  font-family: Montserrat, sans-serif;
  text-transform: uppercase;
}
```

**Ghost Button**
```css
.button-ghost {
  background: transparent;
  color: #ffffff;
  border: 1px solid #ffffff;
  border-radius: 4px;
  padding: 12px 30px;
  font-size: 16px;
  font-weight: 300;
}
```

**Navbar**
```css
.navbar { background-color: #1E73BE; }
.nav-link { color: #003863; font-size: 15px; font-weight: 500; text-transform: uppercase; }
.nav-link:hover { color: #26C0BE; }
```

## Layout & Spacing
- Max width: 1200px · 12-col Bootstrap grid · 30px gutter
- Breakpoints: 576px · 768px · 992px · 1200px
- Border radius: 3px (chips) · 4px (inputs) · 5px (CTA buttons)
- Spacing scale: 4 · 8 · 16 · 24 · 30 · 40 · 60px

## Agent Quick Reference
- Primary Blue: **#1E73BE** · Navy: **#003863** · Teal: **#26C0BE**
- Font: Montserrat, weight 600 headings / 400 body
- CTA: padding 20px 40px, radius 5px, uppercase

---

---

# 2. Champions Club · champions.club/location/bangalore

> Ultra-premium luxury lifestyle brand. Yachts, air charters, curated experiences.

## Visual Theme & Atmosphere
Dark, opulent, cinematic. Near-black deep navy header signals exclusivity. Rich gold (#DAA548) communicates wealth and prestige. Full-bleed nighttime architectural photography sets a glamorous mood. Utility topbar with contact info and currency toggle. Ubuntu Sans gives a modern, geometric, premium feel.

## Color Palette

| Role | Hex | Usage |
|------|-----|-------|
| Deep Navy | #1A2B48 | Topbar bg, headings, brand surface |
| Navbar Black | #000000 | Main navigation bg |
| Brand Gold | #DAA548 | Primary CTA buttons, accents |
| Amber | #FFC107 | Currency selector, highlights |
| White | #FFFFFF | Page bg, content sections |
| Body Text | #000000 | Primary text |
| Muted | #5E6D77 | Captions, secondary text |
| Login Blue | #5191FA | Login button |
| Facebook | #395899 | Social auth |
| WhatsApp | #4CAF50 | Floating Book Now |
| Alert | #F34A38 | Error states |

## Typography

**Font:** Ubuntu Sans (sole typeface)

| Role | Size | Weight | Line Height | Color |
|------|------|--------|-------------|-------|
| H1 | 30px | 500 | 39px | #1A2B48 |
| H2 | 28px | 500 | 33.6px | #000000 |
| H3 | 24px | 500 | 28.8px | #000000 |
| Body | 14px | 400 | 21px | #000000 |
| Body MD | 16px | 400 | 24px | #000000 |
| Nav | 14px | 600 | 21px | #ffffff |
| Caption | 13px | 400 | 19.5px | #5E6D77 |

## Components

**Primary CTA — Gold**
```css
.button-primary {
  background-color: #DAA548;
  color: #ffffff;
  border-radius: 3px;
  padding: 10px 20px;
  font-size: 16px;
  font-weight: 500;
  font-family: 'Ubuntu Sans', sans-serif;
}
```

**Topbar**
```css
.topbar { background-color: #1A2B48; color: #ffffff; font-size: 13px; }
```

**Navbar**
```css
.navbar { background-color: #000000; box-shadow: rgba(32,33,36,0.28) 0px 1px 15px 0px; }
.nav-link { color: #ffffff; font-size: 14px; font-weight: 600; text-transform: uppercase; }
.nav-link:hover { color: #DAA548; }
```

**Floating Book Now**
```css
.button-float { background-color: #4CAF50; color: #ffffff; border-radius: 30px; padding: 10px 20px; position: fixed; bottom: 20px; right: 20px; }
```

## Layout & Spacing
- Max width: 1200px · 12-col Bootstrap grid · 30px gutter
- Breakpoints: 576px · 768px · 992px · 1200px
- Border radius: 2px (social) · 3px (buttons/cards) · 30px (pill floater)
- Shadow: rgba(32,33,36,0.28) 0px 1px 15px 0px

## Agent Quick Reference
- Gold: **#DAA548** · Navy: **#1A2B48** · Navbar: **#000000**
- Font: Ubuntu Sans, weight 500 headings / 400 body
- CTA: gold bg, radius 3px, padding 10px 20px

---

---

# 3. IP Momentum · ipmomentum.com

> B2B VoIP products & solutions brand. Tech-forward, energetic, dark-hero layout.

## Visual Theme & Atmosphere
Dark deep-navy hero with electric lime-yellow (#D9FF43) highlight accent on headline text — bold, tech-startup energy. Product UI screenshots float alongside the hero copy. WhatsApp CTA anchored bottom-right. Clean white sections below hero for product listings. Government authorization badge (Dept. of Telecommunications) adds credibility. Multi-brand product catalog (IP Phones, IPBX, GSM Gateway).

## Color Palette

| Role | Hex | Usage |
|------|-----|-------|
| Deep Navy | #07294F | Hero background, primary dark surface |
| Forest Green | #003D2B | Section headings, accent dark |
| Lime Yellow | #D9FF43 | Hero headline highlight, key accent |
| Light Green | #BDE070 | Secondary accent, gradient highlight |
| Brand Green | #25D366 | WhatsApp CTA button |
| White | #FFFFFF | Page bg, body text on dark |
| Muted Body | #6B6B6B | Body text on white sections |
| Muted Para | #ABABAB | Paragraph text on dark bg |
| Light Gray | #E1E1E1 | Borders, dividers |
| Deep Blue (css) | #003796 | Accent blue (CSS var) |
| Light Cyan (css) | #00FCFA | Accent teal (CSS var) |
| Light Yellow (css) | #FFE34C | Accent yellow (CSS var) |

## Typography

**Fonts:** SuisseIntl SemiBold (headings) · DM Sans (body) · Be Vietnam Pro (accent)

| Role | Size | Weight | Line Height | Color |
|------|------|--------|-------------|-------|
| H1 | 66px | 500 | 72px | #ffffff |
| H2 | 48px | 600 | 58px | #003D2B |
| H3 | 22px | 500 | 22px | #ffffff |
| Body | 16px | 400 | 24px | #6B6B6B |
| Body LG | 20px | 500 | 32px | #ABABAB |
| Nav | 15px | 500 | — | #ffffff |

## Components

**Primary CTA**
```css
.button-primary {
  background-color: #D9FF43;
  color: #07294F;
  border-radius: 50px;
  padding: 14px 32px;
  font-size: 16px;
  font-weight: 600;
  font-family: 'DM Sans', sans-serif;
}
.button-primary:hover { background-color: #BDE070; }
```

**Navbar**
```css
.navbar { background-color: #07294F; }
.nav-link { color: #ffffff; font-size: 15px; font-weight: 500; }
.nav-link:hover { color: #D9FF43; }
```

**Card**
```css
.card {
  background-color: #ffffff;
  border-radius: 9px;
  box-shadow: rgba(0,0,0,0.1) 0px 20px 30px 0px;
  padding: 24px;
}
```

## Layout & Spacing
- Max width: 1200px · Bootstrap 5 grid
- Breakpoints: 576px · 768px · 992px · 1200px · 1400px (xxl)
- Border radius: 5px (inputs) · 9px (cards) · 50px (pill buttons)
- Shadows: rgba(0,0,0,0.1) 0px 20px 30px · rgba(0,0,0,0.3) 0px 4px 12px

## Agent Quick Reference
- Navy: **#07294F** · Lime Accent: **#D9FF43** · Green: **#003D2B**
- Fonts: SuisseIntl SemiBold (headings) / DM Sans (body)
- CTA: lime yellow bg (#D9FF43), dark text, pill radius 50px

---

---

# 4. Champion Products · championproducts.com

> B2B foodservice & janitorial supply e-commerce. Clean, functional, product-first.

## Visual Theme & Atmosphere
Clean, functional e-commerce design built on Shopify. Neutral off-white page background (#F4F3F3) creates warmth without harshness. Dark charcoal (#252F3D) primary buttons and headings convey reliability and professionalism. Gold (#C49931) accent for trust badges and featured labels. Topbar in near-black for utility links. Search bar is the hero UI element. The design is product-first with minimal decorative elements.

## Color Palette

| Role | Hex | Usage |
|------|-----|-------|
| Page Bg | #F4F3F3 | Body background (warm off-white) |
| White | #FFFFFF | Cards, product tiles, navbar |
| Charcoal | #252F3D | Primary buttons, headings, nav bg |
| Dark Charcoal | #141920 | Button hover, topbar bg |
| Gold Accent | #C49931 | Trust badges, featured highlights |
| Amber Alt | #C39931 | Secondary gold variant |
| Body Text | #040404 | Primary text |
| Secondary Text | #717171 | Captions, muted labels |
| Mid Gray | #CCCCCC | Borders, dividers |
| Brand Blue | #007AFF | Links, interactive elements |
| Error | #D41F4B | Error / sold-out badge |
| Sale | #2D8653 | Sale badge bg |

## Typography

**Fonts:** Poppins (all text — headings, body, buttons, nav, footer)

| Role | Size | Weight | Line Height | Color |
|------|------|--------|-------------|-------|
| H1 | 36px | 400 | — | #ffffff |
| H2 | 28px | 400 | 30.8px | #040404 |
| H3 | 15px | 600 | 22.5px | #040404 |
| Body | 16px | 400 | 20.8px | #040404 |
| Nav | 14px | 600 | — | #040404 |
| Button | — | 600 | — | #ffffff |
| Footer Link | 13px | 600 | — | varies |

## Components

**Primary Button**
```css
.button-primary {
  background-color: #252F3D;
  color: #ffffff;
  border-radius: 4px;
  padding: 12px 24px;
  font-family: Poppins, sans-serif;
  font-weight: 600;
  text-transform: none;
}
.button-primary:hover { background-color: #141920; }
```

**Search Bar**
```css
.search-input {
  background-color: #ffffff;
  border: 1px solid rgb(227,225,225);
  border-radius: 4px;
  padding: 12px 16px;
  font-family: Poppins, sans-serif;
  font-size: 16px;
  width: 100%;
}
.search-input:hover { border-color: #141920; }
```

**Topbar**
```css
.topbar { background-color: #141920; color: #ffffff; font-size: 13px; }
```

**Product Card**
```css
.product-card {
  background-color: #ffffff;
  border-radius: 4px;
  padding: 16px;
}
```

## Layout & Spacing
- Max width: ~1200px · Shopify grid
- Breakpoints: 576px · 768px · 992px · 1200px
- Border radius: 2px (icons) · 4px (buttons, cards, inputs) · 100% (avatars)
- Spaced sections: 5rem vertical rhythm
- Letter-spacing on headings: -0.2em (tight)

## Agent Quick Reference
- Charcoal: **#252F3D** · Page Bg: **#F4F3F3** · Gold: **#C49931**
- Font: Poppins, weight 400 headings / 600 buttons & nav
- Button: bg #252F3D, radius 4px, hover #141920

---

---

# 5. Champion Infometrics · championinfometrics.com

> B2B sales intelligence, marketing services & GCC solutions. Corporate, trustworthy, professional.

## Visual Theme & Atmosphere
Clean corporate identity with strong blue-and-orange branding. Royal blue (#00529C) is the primary brand colour used on buttons, icons, and accents. Vibrant orange (#F26522) provides an energetic contrast accent for CTAs and highlights. White background with generous whitespace. Slider-based hero with rotating content. "Great Place to Work" certification badge visible in header. Professional services positioning for enterprise clients.

## Color Palette

| Role | Hex | Usage |
|------|-----|-------|
| Brand Blue | #00529C | Primary buttons, icons, links, accents |
| Orange Accent | #F26522 | CTA highlights, icon accents |
| Orange Alt | #F36F31 | Secondary orange variant |
| White | #FFFFFF | Page bg, cards, surfaces |
| Body Text | #000000 | Primary text |
| H1 Text | #686868 | Light heading colour |
| H2 Text | #333333 | Section headings |
| Muted Text | #8F8F8F | Captions, secondary labels |
| Dark Text | #2E2E2E | Body emphasis |
| Mid Gray | #666666 | Supporting text |
| Border | #E5EDF5 | Dividers, card borders |

## Typography

**Font:** Poppins (sole typeface)

| Role | Size | Weight | Line Height | Color |
|------|------|--------|-------------|-------|
| H1 | 36px | 300 | 39.6px | #686868 |
| H2 | 30px | 700 | 33px | #333333 |
| H3 | 16px | 300 | 17.6px | #000000 |
| Body | 14px | 300 | 22px | #000000 |
| Para | 14px | 700 | 22px | #8F8F8F |
| Nav | 15px | 500 | — | #000000 |

## Components

**Primary Button — Blue**
```css
.button-primary {
  background-color: #00529C;
  color: #ffffff;
  border-radius: 4px;
  padding: 10px 24px;
  font-family: Poppins, sans-serif;
  font-weight: 500;
  font-size: 15px;
}
.button-primary:hover { background-color: #003d75; }
```

**Orange Accent Button**
```css
.button-accent {
  background-color: #F26522;
  color: #ffffff;
  border-radius: 4px;
  padding: 10px 24px;
  font-weight: 500;
}
```

**Navbar**
```css
.navbar { background-color: #ffffff; border-bottom: 1px solid #E5EDF5; }
.nav-link { color: #000000; font-size: 15px; font-weight: 500; }
.nav-link:hover { color: #00529C; }
```

## Layout & Spacing
- Max width: 1200px · Bootstrap-based grid
- Breakpoints: 576px · 768px · 992px · 1200px
- Border radius: 4px (buttons) · 50% (icon circles)
- No custom box shadows observed; flat design approach

## Agent Quick Reference
- Blue: **#00529C** · Orange: **#F26522** · White bg: **#FFFFFF**
- Font: Poppins, weight 300 body / 700 section headings / 500 nav
- Button: blue bg #00529C, radius 4px, font-weight 500

---

---

# 6. Champions Yacht Club · championsyachtclub.com

> Luxury yacht charter & experiences brand in Goa. Aspirational, nautical, premium.

## Visual Theme & Atmosphere
Aspirational nautical luxury with a cinematic dark hero (full-black on load, video-driven). Deep navy (#13172B) anchors the brand. Warm amber/gold (#D69551) serves as the primary accent replacing typical nautical blues — giving warmth and exclusivity. Work Sans handles all body text with excellent legibility; Bai Jamjuree creates distinct structural headings. WooCommerce-powered booking. WhatsApp floating CTA for instant inquiries.

## Color Palette

| Role | Hex | Usage |
|------|-----|-------|
| Dark Navy | #13172B | Headings, deep UI surfaces (--heading) |
| Primary Gold | #D69551 | Primary accent, H3, brand highlights (--primary) |
| Secondary Orange | #FF9933 | Secondary accent (--secondary) |
| Body Text | #6A7285 | Body paragraphs (--text) |
| White | #FFFFFF | Page bg, card surfaces |
| Dark Text | #222222 | High-contrast headings |
| Mid Gray | #696E7D | Supporting text |
| Light Gray | #ABABADB | Muted labels |
| WhatsApp | #25D366 | Floating CTA |
| Shadow | rgba(0,0,0,0.3) | Card shadows |

## Typography

**Fonts:** Bai Jamjuree (headings) · Work Sans (body, nav)

| Role | Font | Size | Weight | Line Height | Color |
|------|------|------|--------|-------------|-------|
| H1 | Bai Jamjuree | 32px | 700 | 38.72px | #13172B |
| H2 | Bai Jamjuree | 40px | 700 | 48px | #13172B |
| H3 | Bai Jamjuree | 30px | 400 | 30px | #D69551 |
| Body | Work Sans | 16px | 400 | 25.6px | #6A7285 |
| Nav | Work Sans | 15px | 600 | — | #222222 |
| Caption | Work Sans | 14px | 400 | — | #ABABADB |

## Components

**Book Now CTA**
```css
.button-book {
  background-color: #D69551;
  color: #ffffff;
  border-radius: 4px;
  padding: 12px 28px;
  font-family: 'Work Sans', sans-serif;
  font-weight: 600;
  font-size: 16px;
  border: none;
}
.button-book:hover { background-color: #c47e3a; }
```

**Navbar**
```css
.navbar { background-color: #ffffff; box-shadow: rgba(0,0,0,0.3) 0px 4px 12px 0px; }
.nav-link { color: #222222; font-size: 15px; font-weight: 600; }
.nav-link:hover { color: #D69551; }
```

**Floating WhatsApp**
```css
.whatsapp-float { background-color: #25D366; border-radius: 50px; padding: 12px 20px; position: fixed; bottom: 20px; right: 20px; }
```

**Yacht Card**
```css
.yacht-card {
  background-color: #ffffff;
  border-radius: 5px;
  box-shadow: rgba(0,0,0,0.3) 0px 4px 12px 0px;
  padding: 20px;
}
```

## Layout & Spacing
- Container width: 1290px (--container-width)
- Breakpoints: 576px · 768px · 992px · 1200px
- Border radius: 3px (chips) · 4px (buttons) · 5px (cards) · 50% (avatars) · 50px (pill)
- Shadow: rgba(0,0,0,0.3) 0px 4px 12px 0px
- Spacing scale: 0.44 · 0.67 · 1 · 1.5 · 2.25 · 3.38 · 5.06rem

## Agent Quick Reference
- Navy: **#13172B** · Gold: **#D69551** · Orange: **#FF9933**
- Fonts: Bai Jamjuree (headings, 700) / Work Sans (body, 400)
- CTA: gold bg #D69551, radius 4px, padding 12px 28px

---

---

# 7. Cross-Brand Design Comparison

## Font Summary

| Brand | Heading Font | Body Font | Style |
|-------|-------------|-----------|-------|
| Champion Infratech | Montserrat | Montserrat | Rounded, premium |
| Champions Club | Ubuntu Sans | Ubuntu Sans | Geometric, modern |
| IP Momentum | SuisseIntl SemiBold | DM Sans | Tech-editorial |
| Champion Products | Poppins | Poppins | Friendly, e-comm |
| Champion Infometrics | Poppins | Poppins | Corporate clean |
| Champions Yacht Club | Bai Jamjuree | Work Sans | Nautical, luxury |

## Brand Color Summary

| Brand | Primary | Accent | Bg |
|-------|---------|--------|-----|
| Champion Infratech | #1E73BE (blue) | #26C0BE (teal) | #FFFFFF |
| Champions Club | #000000 (black) | #DAA548 (gold) | #FFFFFF |
| IP Momentum | #07294F (navy) | #D9FF43 (lime) | #FFFFFF |
| Champion Products | #252F3D (charcoal) | #C49931 (gold) | #F4F3F3 |
| Champion Infometrics | #00529C (blue) | #F26522 (orange) | #FFFFFF |
| Champions Yacht Club | #13172B (navy) | #D69551 (amber) | #FFFFFF |

## Shared Design Patterns Across All 6 Brands
- Bootstrap or Bootstrap-inspired 12-column grid with 30px gutters
- Max container width: 1200–1290px
- Breakpoints consistently: 576px · 768px · 992px · 1200px
- WhatsApp floating CTA present on: Champions Club, IP Momentum, Champions Yacht Club
- All brands use photography-first hero sections
- All brands use a utility topbar for contact/nav utility links
- Poppins is the most shared typeface (Champion Products + Infometrics)
- All brands use white as primary surface colour; dark-navy/charcoal for header/nav

## Cross-Brand Do's
- Use the brand-specific primary colour for all interactive CTAs
- Always float a WhatsApp contact button on mobile-forward pages
- Keep body font weight at 400; use 600–700 only for headings and buttons
- Use full-bleed hero imagery where applicable
- Collapse navigation to hamburger below 768px on all properties

## Cross-Brand Don'ts
- Never mix heading and body typefaces from different brands
- Don't apply one brand's colour palette to another brand's UI
- Avoid using lime (#D9FF43) from IP Momentum on any other property
- Don't use border-radius above 16px on any non-pill/non-circle element
