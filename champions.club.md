# DESIGN.md — champions.club (Bangalore)

> Production-grade design context for AI coding workflows.
> Source: https://www.champions.club/location/bangalore
> Generated: 2026-06-18

---

## 1. Visual Theme & Atmosphere

Champions Club presents an ultra-premium luxury lifestyle brand targeting high-net-worth individuals seeking exclusive experiences — yachts, air charters, accommodations, and curated experiences. The visual tone is dark, opulent, and cinematic. A near-black (#1a2b48) deep navy header anchors the brand in exclusivity, while a rich gold (#DAA548) accent communicates wealth and prestige. Full-bleed nighttime photography of illuminated venues sets a glamorous, aspirational mood. The Bangalore location page targets urban elites.

**Key Characteristics**
- Dark navy/black header bar with gold brand accent
- Full-width hero with nighttime architectural photography
- Gold (#DAA548) used exclusively for CTAs and brand accents
- Clean, minimal layout with generous whitespace below hero
- Ubuntu Sans typeface — modern, geometric, friendly-yet-premium
- Utility topbar with contact info, currency toggle, login/sign-up

---

## 2. Color Palette & Roles

### Primary
- **#1A2B48** (rgb(26, 43, 72)) — Deep navy; topbar background, primary headings, brand surface
- **#1A2B50** (rgb(26, 43, 80)) — Slightly brighter navy for header/navbar

### Accent / Brand Gold
- **#DAA548** (rgb(218, 165, 72)) — Primary brand gold; CTA buttons, hover accents, "View More" buttons
- **#FFC107** (rgb(255, 193, 7)) — Brighter amber; currency selector, interactive highlights

### Surface
- **#FFFFFF** — Page background, content sections
- **#000000** — Navigation overlay background (hero area)

### Text
- **#000000** — Primary body text on white backgrounds
- **#1A2B48** — Headings (deep navy)
- **#5E6D77** (rgb(94, 109, 119)) — Secondary / muted text, captions

### Status / Utility
- **#5191FA** (rgb(81, 145, 250)) — Login button (blue)
- **#3958 99** (rgb(57, 88, 153)) — Facebook blue (social auth)
- **#4CAF50** (rgb(76, 175, 80)) — WhatsApp Book Now button
- **#F34A38** (rgb(243, 74, 56)) — Alert / error state
- **#0B6156** (rgb(11, 97, 86)) — WhatsApp icon button bg

---

## 3. Typography Rules

**Font Family:**
- **Ubuntu Sans** — Sole typeface across all text elements
- Fallback: system-ui, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif

**Type Scale:**

| Role     | Font       | Size | Weight | Line Height | Color   |
|----------|------------|------|--------|-------------|---------|
| H1       | Ubuntu Sans | 30px | 500    | 39px        | #1A2B48 |
| H2       | Ubuntu Sans | 28px | 500    | 33.6px      | #000000 |
| H3       | Ubuntu Sans | 24px | 500    | 28.8px      | #000000 |
| H4       | Ubuntu Sans | 24px | 500    | 28.8px      | #000000 |
| Body     | Ubuntu Sans | 14px | 400    | 21px        | #000000 |
| Body MD  | Ubuntu Sans | 16px | 400    | 24px        | #000000 |
| Small    | Ubuntu Sans | 12px | 400    | 18px        | #5E6D77 |
| Nav Link | Ubuntu Sans | 14px | 600    | 21px        | #ffffff |
| Button   | Ubuntu Sans | 16px | 500    | normal      | #ffffff |
| Caption  | Ubuntu Sans | 13px | 400    | 19.5px      | #5E6D77 |

**Principles:**
- Single font family (Ubuntu Sans) for all text
- Weight 500 for all headings, 400 for body and captions
- No italic or decorative typefaces used

---

## 4. Component Stylings

### Buttons

**Primary CTA — Gold**
```css
.button-primary {
  background-color: #DAA548;
  color: #ffffff;
  border: none;
  border-radius: 3px;
  padding: 10px 20px;
  font-size: 16px;
  font-weight: 500;
  font-family: 'Ubuntu Sans', sans-serif;
}
.button-primary:hover {
  background-color: #c4913c;
}
```

**Login Button — Blue**
```css
.button-login {
  background-color: #5191FA;
  color: #ffffff;
  border: none;
  border-radius: 3px;
  padding: 10px 20px;
  font-size: 14px;
  font-weight: 600;
}
```

**Subscribe / Form Submit**
```css
.button-subscribe {
  background-color: #1A2B48;
  color: #ffffff;
  border: none;
  border-radius: 0px 5px 5px 0px;
  padding: 1px 25px;
  font-size: 14px;
  font-weight: 600;
}
```

**Book Now — WhatsApp**
```css
.button-book {
  background-color: #4CAF50;
  color: #ffffff;
  border: none;
  border-radius: 30px;
  padding: 10px 20px;
  font-size: 16px;
}
```

**Social Login — Facebook**
```css
.button-facebook {
  background-color: #395899;
  color: #ffffff;
  border: none;
  border-radius: 2px;
  padding: 10px 20px;
  font-size: 16px;
  font-weight: 500;
}
```

### Navigation

**Utility Topbar**
```css
.topbar {
  background-color: #1A2B48;
  color: #ffffff;
  font-size: 13px;
  padding: 6px 0;
}
```

**Main Navigation Bar**
```css
.navbar {
  background-color: #000000;
  padding: 10px 24px;
  box-shadow: rgba(32, 33, 36, 0.28) 0px 1px 15px 0px;
}
.nav-link {
  color: #ffffff;
  font-size: 14px;
  font-weight: 600;
  text-transform: uppercase;
  padding: 8px 16px;
}
.nav-link:hover {
  color: #DAA548;
}
```

### Cards & Containers

**Standard Content Card**
```css
.card {
  background-color: #ffffff;
  border-radius: 3px;
  box-shadow: rgba(32, 33, 36, 0.28) 0px 1px 15px 0px;
  padding: 16px;
}
```

### Forms & Inputs

**Email / Newsletter Input**
```css
.input-email {
  border: 1px solid #e0e0e0;
  border-radius: 3px 0px 0px 3px;
  padding: 8px 14px;
  font-size: 14px;
  font-family: 'Ubuntu Sans', sans-serif;
  color: #000000;
}
.input-email:focus {
  outline: none;
  border-color: #DAA548;
}
```

---

## 5. Layout Principles

**Spacing System** (Bootstrap-based, 4px base):
- 4px — micro spacing
- 8px — between inline elements
- 16px — between components
- 20px — button horizontal padding
- 24px — section horizontal padding
- 30px — section vertical rhythm

**Grid & Container:**
- Max container width: **1200px**
- Columns: **12** (Bootstrap grid)
- Gutter: **30px**

**Breakpoints (Bootstrap 4):**
- xs: 0
- sm: 576px
- md: 768px
- lg: 992px
- xl: 1200px

**Border Radius Scale:**
- 2px — Facebook/social buttons
- 3px — primary buttons, cards
- 5px — rounded form combos
- 30px — pill-shaped floating buttons (Book Now)

---

## 6. Depth & Elevation

| Level | Treatment | Use |
|-------|-----------|-----|
| z-0 | None | Base content |
| z-1 | rgba(32, 33, 36, 0.28) 0px 1px 15px | Navbar, cards |
| z-2 | Elevated overlay | Modals, dropdowns |

**Shadow Philosophy:** Single consistent shadow across all elevated surfaces. Soft, wide-radius shadow adds subtle depth without drama.

---

## 7. Iconography & Imagery

- Full-width hero images: nighttime architectural photography, warm golden lighting
- Social media icons (Facebook, LinkedIn, YouTube, Twitter, Instagram) in topbar
- Service icons in navigation: emoji/icon prefixes for Yachts (⛵), Air Charters (✈️), Accommodations (🛏), Curated Xperiences (🧭)
- WhatsApp floating action button (green circle, bottom-right)
- Logo: gold shield/wing mark + "CHAMPIONS CLUB" wordmark in caps

---

## 8. Motion & Interaction

- Dropdown navigation menus on hover
- WhatsApp floating button: always-visible, fixed bottom-right
- Box shadow on navbar: rgba(32, 33, 36, 0.28) 0px 1px 15px 0px on scroll
- No explicit CSS animation keyframes observed; motion is minimal/functional

---

## 9. Responsive Behavior

**Breakpoints:** 576px · 768px · 992px · 1200px

**Collapsing Strategy:**
- Navigation: Collapses to hamburger on mobile
- Topbar: Simplifies to icons only on mobile
- Hero image: Maintains full-width, scales height
- Content sections: Stack vertically on mobile
- Floating Book Now button: Remains fixed on all viewports

**Touch Targets:** Book Now CTA is 44px+ (radius 30px pill); all primary buttons meet 44px minimum

---

## 10. Do's and Don'ts

**Do's**
- Use Ubuntu Sans for all typography; weight 500 for headings, 400 for body
- Use #DAA548 gold for all primary CTAs and brand accents
- Keep navigation background as #000000 for premium contrast
- Use #1A2B48 deep navy for topbar and section headers
- Apply box-shadow rgba(32, 33, 36, 0.28) 0px 1px 15px 0px on all elevated surfaces
- Use border-radius 3px for buttons and 30px only for floating pill buttons
- Always include WhatsApp floating CTA on all pages

**Don'ts**
- Never use gold (#DAA548) as a background for large content areas
- Don't mix multiple font families — Ubuntu Sans only
- Avoid bright or saturated colors beyond the gold accent; keep palette restrained
- Don't use weight 700 for navigation; 600 is the max for nav labels
- Never omit the topbar contact info on desktop layouts

---

## 11. Agent Prompt Guide

**Quick Color Reference:**
- Brand Gold: #DAA548
- Deep Navy: #1A2B48
- Navbar: #000000
- Body Text: #000000
- Background: #FFFFFF
- Muted Text: #5E6D77

**Iteration Guide:**
- Font: Ubuntu Sans everywhere; 500 for headings, 400 for body
- CTA buttons: background #DAA548, border-radius 3px, padding 10px 20px
- Navbar: black background, white uppercase links, gold on hover
- Topbar: #1A2B48 background, small 13px text, white color
- Cards: white bg, border-radius 3px, box-shadow rgba(32,33,36,0.28) 0 1px 15px
- Floating CTA: green (#4CAF50) pill button, border-radius 30px, always fixed
- Spacing: 16px between components, 20-24px section padding
