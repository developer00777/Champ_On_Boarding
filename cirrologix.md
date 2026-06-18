# Design System — Cirrologix (cirrologix.com)

## 1. Visual Theme & Atmosphere

Cirrologix's visual design projects authority and technological confidence through a dual-tone palette — a deep navy-black for hero and feature sections contrasted against an ice-blue-tinted white for content sections. The brand balances corporate trust (navy, structured grids) with approachable growth signals (grass green accents, rounded WhatsApp CTA). The overall experience feels enterprise-grade yet purposeful: every section drives the visitor toward a conversion action.

**Key Characteristics**
- Deep navy hero background (`#001431`) transitioning to airy ice-blue body (`#efFCFF`) for content zones.
- Single font family (DM Sans) across all type roles, with tight negative letter-spacing for headings.
- Two distinct CTA colors: electric blue (`#007aff`) for navbar/hero CTAs, and grass green (`#549F57`) for section-level action buttons.
- Full-bleed dark sections alternate with light sections to create strong visual rhythm.
- Minimal use of border-radius — buttons are sharp-edged (0px radius); only social icons and the WhatsApp pill use rounded treatment.
- Subtle card elevation using green-tinted borders and soft shadows.
- Motion confined to 0.3s ease transitions on color, background, and transform.

---

## 2. Color Palette & Roles

### Primary
- **#001431** — Hero background, dark section surfaces, deep navy for slide and ecosystem sections.
- **#007aff** — Primary CTA buttons (navbar hero), swiper/slider theme color, link highlights.
- **#549F57** — Section CTA buttons, text links, hover color for nav items; brand green accent.

### Heading Colors (contextual)
- **#254D94** (`rgb(37,77,148)`) — H1 on light backgrounds (e.g., services section headings).
- **#254E92** (`rgb(37,78,146)`) — H5 subheadings on light backgrounds.
- **#1C7B3C** (`rgb(28,123,60)`) — H3 on light backgrounds (e.g., "Four Core Engines" accent headings).
- **#FCFCFC** — Headings on dark/navy backgrounds.

### Surface & Background
- **#efFCFF** (`rgb(239,252,255)`) — Primary page body background; all light-section surfaces.
- **#FFFFFF** — Card surfaces, navbar background (transparent over hero, white on scroll).
- **#1E1D1D** (`rgb(30,29,29)`) — Footer background.
- **#030303** (`rgb(3,3,3)`) — Social icon circle background in footer.
- **#F6F9F2** — WordPress preset light green background (`--wp--preset--color--bg-color`).

### Text
- **#61666F** (`rgb(97,102,111)`) — Default body text color.
- **#9F9F9F** (`rgb(159,159,159)`) — Secondary/muted text (footer links, subdued copy).
- **#000000** — High-contrast text for inputs and critical labels.
- **#3C3F47** (`rgb(60,63,71)`) — Dark descriptive text.

### Accent & Interactive
- **#25D366** (`rgb(37,211,102)`) — WhatsApp floating CTA background.
- **#007E8F** (`rgb(0,126,143)`) — Teal accent (section tags, icon highlights).
- **#16A08B** (`rgb(22,160,139)`) — Teal/green accent variant.
- **#87B2FF** (`rgb(135,178,255)`) — Light blue accent for illustrated elements.
- **#65CDFF** (`rgb(101,205,255)`) — Sky blue highlight in diagrams.
- **#CDE0CB** (`rgb(205,224,203)`) — Light green surface for card backgrounds.
- **#7EB580** (`rgb(126,181,128)`) — Medium green for progress or highlight elements.

### Borders & Dividers
- **#E2E2E2** (`--wp--preset--color--bd-color`) — Default border color for cards and dividers.
- **#C1C1C1** — Textarea border.
- **#DDDDDD** (`rgb(221,221,221)`) — Light rule/separator.

---

## 3. Typography Rules

**Font Family**: `"DM Sans", sans-serif` — used universally across all text roles.
**Base body size**: 17px | **Line height**: ~28px (1.647em) | **Weight**: 400

### Type Scale

| Role      | Size             | Weight | Line Height | Letter Spacing | Transform  | Notes                          |
|-----------|------------------|--------|-------------|----------------|------------|--------------------------------|
| H1        | 3.353em (≈57px)  | 700    | 1em         | -1.8px         | none       | Hero and page-level headings   |
| H2        | 2.765em (≈47px)  | 700    | 1.021em     | -1.4px         | none       | Section titles                 |
| H3        | 2.059em (≈35px)  | 700    | 1.086em     | -1px           | none       | Sub-section and card headings  |
| H4        | 1.529em (≈26px)  | 700    | 1.214em     | -0.5px         | none       | Feature labels                 |
| H5        | 1.412em (≈24px)  | 700    | 1.208em     | -0.5px         | none       | Supporting sub-headings        |
| H6        | 1.118em (≈19px)  | 700    | 1.474em     | -0.6px         | none       | Small headings, card labels    |
| Body (p)  | 1rem (17px)      | 400    | 1.647em     | 0px            | none       | All paragraph/prose content    |
| Menu      | 14px             | 700    | 1.5em       | 1px            | uppercase  | Navigation links               |
| Submenu   | 15px             | 400    | 1.5em       | 0px            | none       | Dropdown menu items            |
| Button    | 15px             | 700    | 21px        | 0px            | none       | CTA button text                |
| Input     | 16px             | 400    | 1.5em       | 0.1px          | none       | Form field text                |
| Info/Caption | 13px          | 400    | 1.5em       | 0px            | none       | Small labels and meta text     |

### Principles
- Exclusively DM Sans — no secondary font family.
- Aggressive negative letter-spacing on headings (down to -1.8px) creates a tight, modern display feel.
- Menu items are uppercase with +1px tracking for visual distinction from body copy.
- Body line-height is generous (1.647em) for readability in dense enterprise content.

---

## 4. Component Stylings

### Buttons

**Primary CTA (Hero / Navbar)**
```css
.btn-primary {
  background-color: #007aff;
  color: #ffffff;
  border: none;
  border-radius: 0px;
  padding: 0px 36px;
  font-family: "DM Sans", sans-serif;
  font-size: 14px;
  font-weight: 700;
  text-transform: none;
  letter-spacing: 0px;
  line-height: 21px;
  min-height: 44px;
}
.btn-primary:hover {
  background-color: #0062cc;
  transition: background-color 0.3s;
}
```

**Section CTA (Green Action)**
```css
.btn-section {
  background-color: #549F57;
  color: #ffffff;
  border: none;
  border-radius: 0px;
  padding: 15px 36px;
  font-family: "DM Sans", sans-serif;
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 0px;
}
.btn-section:hover {
  background-color: #3A943E;
  transition: background-color 0.3s;
}
```

**WhatsApp Floating CTA**
```css
.btn-whatsapp {
  background-color: #25D366;
  color: #ffffff;
  border-radius: 50px;
  padding: 12px 18px;
  font-size: 16px;
  font-weight: 700;
  position: fixed;
}
```

### Navigation

**Top Bar (above main nav)**
```css
.topbar {
  background-color: #1E1D1D;
  color: #9F9F9F;
  font-size: 13px;
}
```

**Main Navigation**
```css
.navbar {
  background-color: transparent;
  position: absolute;
  font-family: "DM Sans", sans-serif;
}
.nav-link {
  font-size: 14px;
  font-weight: 700;
  letter-spacing: 1px;
  text-transform: uppercase;
  color: #ffffff;
  transition: color 0.3s;
}
.nav-link:hover {
  color: #549F57;
}
.dropdown-menu {
  background-color: #ffffff;
  font-size: 15px;
  font-weight: 400;
}
```

### Cards & Containers

**Service / Feature Card**
```css
.card {
  background-color: #ffffff;
  border-radius: 0px;
  border: 1px solid #E2E2E2;
  padding: 30px;
  box-shadow: 6px 6px 9px rgba(0, 0, 0, 0.2);
}
```

**Dark Section Container**
```css
.section-dark {
  background-color: #001431;
  color: #FCFCFC;
  padding: 0px 30px;
}
```

**Light Section Container**
```css
.section-light {
  background-color: #efFCFF;
  color: #61666F;
  padding: 100px 70px;
}
```

### Forms & Inputs

**Text / Email / Tel Input**
```css
.form-input {
  background-color: transparent;
  color: #61666F;
  border-bottom: 1px solid #C1C1C1;
  border-radius: 0px;
  font-size: 16px;
  font-weight: 400;
  letter-spacing: 0.1px;
  line-height: 1.5em;
  padding: 8px 0;
  transition: border-color 0.3s;
}
.form-input:focus {
  border-color: #549F57;
  outline: none;
}
```

**Textarea**
```css
.form-textarea {
  background-color: transparent;
  border: 1px solid #C1C1C1;
  border-radius: 0px;
  color: #61666F;
  font-size: 16px;
  padding: 10px;
}
```

**Form Submit Button**
```css
.form-submit {
  background-color: #549F57;
  color: #ffffff;
  border: none;
  border-radius: 0px;
  padding: 15px 36px;
  font-size: 15px;
  font-weight: 700;
  cursor: pointer;
}
```

### Social Icons (Footer)
```css
.social-icon {
  background-color: #030303;
  color: #9F9F9F;
  border-radius: 50%;
  width: 36px;
  height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 18px;
  transition: background-color 0.3s, color 0.3s;
}
.social-icon:hover {
  background-color: #549F57;
  color: #ffffff;
}
```

### Carousel / Slider
- Uses Swiper.js; theme color `#007aff` for navigation dots and controls.
- Dot indicators: 8px circles, active = brand blue or green.
- Navigation arrows: transparent background, white icon.

---

## 5. Layout & Spacing

### Spacing System
Base grid token: `--theme-var-elm_gap_default: 20px`

| Token              | Value  | Use                                   |
|--------------------|--------|---------------------------------------|
| `--gap-narrow`     | 10px   | Tight inline spacing                  |
| `--gap-default`    | 20px   | Standard element gap                  |
| `--gap-extended`   | 30px   | Section-level padding, card gaps      |
| `--gap-wide`       | 40px   | Section side margins                  |
| `--gap-wider`      | 60px   | Large section separators              |
| `--space-tiny`     | 1rem   | Smallest vertical rhythm unit         |
| `--space-small`    | 2rem   | Compact vertical padding              |
| `--space-medium`   | 3.33rem| Mid-section spacing                   |
| `--space-large`    | 6.67rem| Hero and CTA section vertical padding |
| `--space-huge`     | 8.67rem| Full-bleed section heights            |

### Grid & Container
- Max page width: **1290px** (`--theme-var-page_width`)
- Full-wide max: **1920px**
- Content width (narrow): **840px** (`--wp--style--global--content-size`)
- Section padding (desktop): **100px 70px** (light sections), **0px 30px** (dark sections)
- Grid gap: **30px** (`--theme-var-grid_gap`)
- Columns: 12-column grid (Elementor layout)

### Border Radius Scale
- **0px** — All buttons, cards, form inputs (sharp-edged brand aesthetic)
- **50%** — Social icon circles, avatar elements
- **50px** — WhatsApp floating CTA pill

### Whitespace Philosophy
Generous top/bottom padding (100px) on content sections creates breathing room. Dark sections use compressed horizontal padding (30px) to feel immersive and full-bleed. Forms use transparent backgrounds with just bottom borders for a minimal, editorial feel.

---

## 6. Depth & Elevation

| Level | Treatment                                      | Use                              |
|-------|------------------------------------------------|----------------------------------|
| z-0   | No shadow                                      | Base content, body sections      |
| z-1   | `6px 6px 9px rgba(0,0,0,0.2)`                | Cards, service blocks            |
| z-2   | `12px 12px 50px rgba(0,0,0,0.4)`             | Modals, overlays                 |
| z-3   | `6px 6px 0px rgba(0,0,0,0.2)` (sharp)        | Sharp-edged card callouts        |

### Shadow Philosophy
Shadows are used sparingly. The site relies primarily on background-color contrast (dark vs. light sections) rather than floating card elevation. Shadows only appear on interactive cards and hero image overlays.

---

## 7. Iconography & Imagery

- **Icon style**: Outline-weight icon font (custom icon set), rendered as pseudo-elements or `<i>` tags. Social icons use a circular dark container.
- **Illustration**: Custom circular wheel/ecosystem diagram (Salesforce CRM, AI-flavored ATS, VoIP, workforce automation quadrants) in the hero section. Uses brand green, blue, and orange segments.
- **Logo**: Typographic wordmark "CIRROLOGIX" with "CL" icon mark. White version on dark backgrounds, color version on light.
- **Client logos**: Grayscale/color client logo carousel (14 logos) in a horizontal marquee.
- **Imagery**: Full-bleed abstract texture/fiber-optic dark background for hero slider.

---

## 8. Motion & Interaction

| Property        | Duration | Easing                          | Trigger          |
|-----------------|----------|---------------------------------|------------------|
| Color/BG change | 0.3s     | ease                            | hover            |
| Transform       | 0.3s     | ease                            | hover, active    |
| Border-radius   | 0.3s     | ease                            | hover            |
| Box-shadow      | 0.3s     | ease                            | hover            |
| Menu expand     | 0.3s     | ease                            | click/hover      |
| Nav mobile open | 0.45s    | cubic-bezier(0.5,1,0.89,1)     | hamburger click  |
| Padding shifts  | 0.2s     | ease                            | focus/expand     |

- Carousel auto-advances (Swiper.js); no easing override detected.
- Parallax attributes present on hero section (`--trx-addons-parallax`).
- Scroll-triggered sticky header transition (transparent → solid white on scroll).

---

## 9. Responsive Behavior

### Measured Breakpoints

| Name           | Width         | Key Changes                                          |
|----------------|---------------|------------------------------------------------------|
| Mobile         | ≤479px        | Single column, reduced font sizes, stacked sections  |
| Mobile Large   | 480px–575px   | Adjusted padding, single-column cards                |
| Tablet Small   | 576px–767px   | 2-column grid, compressed navigation                 |
| Tablet         | 768px–1023px  | Side-by-side layouts introduced, hamburger nav       |
| Desktop Small  | 1024px–1199px | Full desktop layout with minor adjustments           |
| Desktop        | ≥1200px       | Full multi-column, extended section padding          |
| Desktop Large  | ≥1280px       | Maximum content width enforced (1290px)              |

### Touch Targets
- Minimum button height: **44px** (implied from 15px padding × 2 + 14px text).
- Floating WhatsApp CTA: always visible, 50px pill height.

### Collapsing Strategy
- Navigation collapses to hamburger menu on tablet and below.
- Slider/carousel becomes touch-swipeable on mobile.
- Section padding reduces from `100px 70px` to `40px 20px` on mobile.
- Typography scales down proportionally; H1 from ~57px to ~32px on mobile.
- Two/three column service cards stack to single column on mobile.

---

## 10. Agent Prompt Guide

**Quick Color Reference**
- Dark hero/nav surface: `#001431`
- Primary action (blue): `#007aff`
- Brand green accent + section CTAs: `#549F57`
- Body background: `#efFCFF`
- Body text: `#61666F`
- Footer background: `#1E1D1D`
- Heading on light: `#254D94` (blue) or `#1C7B3C` (green)
- Heading on dark: `#FCFCFC`

**Iteration Guide**
1. Always use `"DM Sans", sans-serif` for all text — no exceptions.
2. Apply `border-radius: 0` to all buttons, cards, and inputs (zero-radius brand aesthetic).
3. Use `#007aff` for primary CTAs in header/hero zones; `#549F57` for in-page section CTAs.
4. Hero and alternating feature sections use `background: #001431` with white text.
5. Content sections use `background: #efFCFF` with `color: #61666F` body text.
6. Maintain 0.3s ease transitions on all interactive states.
7. Navigation links are uppercase, 14px, 700 weight, 1px letter-spacing.
8. Section vertical padding on desktop: 100px top/bottom for light sections.
9. Max content container width: 1290px centered.
10. Never use border-radius on action buttons; only pill-shape (50px) for floating CTAs.
