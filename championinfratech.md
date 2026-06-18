# DESIGN.md — championinfratech.com

> Production-grade design context for AI coding workflows.
> Source: https://www.championinfratech.com/
> Generated: 2026-06-18

---

## 1. Visual Theme & Atmosphere

Champion Infratech presents a bold, coastal luxury aesthetic that communicates innovation, sustainability, and premium real estate development. The brand uses deep ocean blues and teal accents to directly evoke the beach lagoon product they sell — the visual identity and the product are one. Full-bleed imagery of crystal-blue lagoons dominates the hero, while white sections ground the layout in professionalism. The overall experience signals growth, aspiration, and eco-luxury.

**Key Characteristics**
- Full-viewport hero imagery (beach lagoons, lifestyle photography)
- Dark navy/teal navigation bar against transparent overlay on scroll
- High-contrast white text on deep blue/photo backgrounds
- Counter animations and stat callouts for social proof
- Elementor-based WordPress layout with modular sections
- Clean sans-serif typography with strong uppercase navigation labels
- Alternating white and light-blue section backgrounds

---

## 2. Color Palette & Roles

### Primary
- **#003863** (rgb(0, 56, 99)) — Primary dark navy; headings, CTA buttons, deep UI surfaces
- **#1E73BE** (rgb(30, 115, 190)) — Navigation bar background, primary interactive blue
- **#0066B3** (rgb(0, 102, 179)) — Secondary action links, hover states

### Accent
- **#26C0BE** (rgb(38, 192, 190)) — Teal brand accent; icons, highlights, feature callouts
- **rgba(22, 191, 191, 0.7)** — Translucent teal for overlays and animated elements
- **#B5EEFF** (rgb(181, 238, 255)) — Light aqua section background

### Surface
- **#FFFFFF** — Main page background, card surfaces
- **#EFEFEF** (rgb(239, 239, 239)) — Subtle separator and secondary surface

### Text
- **#191919** (rgb(25, 25, 25)) — Primary body text
- **#5C6872** (rgb(92, 104, 114)) — Secondary / muted text
- **#636363** (rgb(99, 99, 99)) — Caption and supporting text
- **#FFFFFF** — Text on dark/photo backgrounds

### Status
- **#DC3545** (rgb(220, 53, 69)) — Error/alert state (Bootstrap danger)

---

## 3. Typography Rules

**Font Families:**
- **Montserrat** — Primary typeface for all headings and body (Google Fonts)
- **Darker Grotesque** — Secondary / accent typeface
- **SFMono-Regular, Menlo, Monaco, Consolas** — Monospace fallback for code

**Type Scale:**

| Role    | Font       | Size | Weight | Line Height | Color     |
|---------|------------|------|--------|-------------|-----------|
| H1      | Montserrat | 40px | 600    | 50px        | #ffffff   |
| H2      | Montserrat | 32px | 600    | 40px        | #ffffff   |
| H3      | Montserrat | 28px | 600    | 28px        | varies    |
| H4      | Montserrat | 24px | 400    | 40px        | #191919   |
| H5      | Montserrat | 18px | 400    | 27px        | #191919   |
| Body    | Montserrat | 16px | 400    | 30px        | #191919   |
| Body LG | Montserrat | 18px | 400    | 32px        | #191919   |
| Small   | Montserrat | 14px | 400    | 21px        | #636363   |
| Nav     | Montserrat | 15px | 500    | 20px        | #003863   |
| CTA     | Montserrat | 18px | 500    | normal      | #ffffff   |

**Principles:**
- Uppercase used for navigation labels and section headers
- Consistent Montserrat across all contexts; no font mixing
- Hero text is white, high-contrast on photo backgrounds

---

## 4. Component Stylings

### Buttons

**Primary CTA Button**
```css
.button-primary {
  background-color: rgb(105, 114, 125);
  color: #ffffff;
  border: none;
  border-radius: 5px;
  padding: 20px 40px;
  font-size: 18px;
  font-weight: 500;
  font-family: Montserrat, sans-serif;
  text-transform: uppercase;
}
.button-primary:hover {
  background-color: #1E73BE;
}
```

**Ghost / Outline Button**
```css
.button-ghost {
  background-color: transparent;
  color: #ffffff;
  border: 1px solid #ffffff;
  border-radius: 4px;
  padding: 12px 30px;
  font-size: 16px;
  font-weight: 300;
  text-transform: uppercase;
}
.button-ghost:hover {
  background-color: rgba(255, 255, 255, 0.15);
}
```

### Navigation

**Top Navigation Bar**
```css
.navbar {
  background-color: rgb(30, 115, 190);
  padding: 0 15px;
}
.nav-link {
  color: rgb(0, 56, 99);
  font-size: 15px;
  font-weight: 500;
  padding: 0 15px;
  text-transform: uppercase;
}
.nav-link:hover {
  color: #26C0BE;
}
```

### Cards & Containers

**Standard Content Card**
```css
.card {
  background-color: #ffffff;
  border-radius: 4px;
  padding: 16px;
}
```

**Light Aqua Info Block**
```css
.info-block {
  background-color: rgb(181, 238, 255);
  padding: 24px;
}
```

### Forms & Inputs

**Text Input**
```css
.input-text {
  border: 1px solid #EFEFEF;
  border-radius: 4px;
  padding: 12px 16px;
  font-size: 16px;
  font-family: Montserrat, sans-serif;
  color: #191919;
}
.input-text:focus {
  border-color: #1E73BE;
  outline: none;
}
```

---

## 5. Layout Principles

**Spacing System** (Bootstrap-based, 4px base):
- 4px — micro spacing
- 8px — between inline elements
- 16px — between components
- 24px — between cards / grid items
- 30px — section horizontal padding
- 40px — button horizontal padding
- 60px — section vertical padding

**Grid & Container:**
- Max container width: **1200px**
- Columns: **12** (Bootstrap grid)
- Gutter: **30px**
- Section padding: **30px horizontal**

**Breakpoints (Bootstrap 4):**
- xs: 0
- sm: 576px
- md: 768px
- lg: 992px
- xl: 1200px

**Border Radius Scale:**
- 3px — small chips, tags
- 4px — inputs, small buttons
- 5px — primary CTA buttons

---

## 6. Depth & Elevation

| Level | Treatment | Use |
|-------|-----------|-----|
| z-0 | None | Base layer |
| z-1 | Natural shadow 6px 6px 9px rgba(0,0,0,0.2) | Cards, content blocks |
| z-2 | Deep shadow 12px 12px 50px rgba(0,0,0,0.4) | Dropdowns, modals |

No explicit box-shadows measured on primary components; depth is achieved via background-color contrast and full-bleed imagery.

---

## 7. Iconography & Imagery

- Full-bleed, full-viewport hero images of crystal-blue beach lagoons
- Photography-first design — imagery is the primary visual brand element
- Icons are minimal; WhatsApp/phone icons in navigation for CTA
- Swiper.js carousel used for gallery/showcase sections (--swiper-theme-color: #007aff)
- Stat counters (animated numbers) used as social proof

---

## 8. Motion & Interaction

- Counter animations on stat figures (JavaScript scroll-triggered)
- Swiper carousel transitions for imagery (default Swiper easing)
- Navigation dropdown menus on hover (Elementor nav widget)
- No explicit custom CSS transitions observed beyond defaults

---

## 9. Responsive Behavior

**Breakpoints:** 576px · 768px · 992px · 1200px (Bootstrap 4)

**Collapsing Strategy:**
- Navigation: Collapses to hamburger menu on mobile (Bootstrap navbar)
- Hero text: Scales down on mobile; stacks vertically
- Stat counters: Stack to single column
- Cards/sections: Stack vertically on mobile
- Padding: Reduce from 30px to 16px on mobile

**Touch Targets:** Minimum 44px x 44px for buttons (20px padding on CTAs)

---

## 10. Do's and Don'ts

**Do's**
- Use Montserrat for all typography
- Apply #1E73BE for navigation and primary interactive surfaces
- Use #26C0BE teal for accent icons and feature highlights
- Maintain uppercase labels for navigation and key headers
- Use full-bleed photography for hero sections
- Keep primary CTA padding at 20px 40px with border-radius 5px
- Maintain high-contrast white text (#ffffff) on dark/photo sections

**Don'ts**
- Never mix Montserrat with unrelated fonts
- Don't use the teal accent (#26C0BE) as a background for large areas
- Don't place dark text on the dark-navy (#003863) without sufficient contrast
- Avoid thin font weights (300) for body text at small sizes
- Don't use shadows heavier than 9px blur on cards — keep it subtle

---

## 11. Agent Prompt Guide

**Quick Color Reference:**
- Primary Blue: #1E73BE
- Dark Navy: #003863
- Teal Accent: #26C0BE
- Body Text: #191919
- Background: #FFFFFF

**Iteration Guide:**
- Always use Montserrat; weight 600 for headings, 400 for body
- CTA buttons: 20px 40px padding, border-radius 5px, font-weight 500
- Navigation bar: background #1E73BE, uppercase link labels
- Hero sections: full-width photography with white text overlay
- Accent color #26C0BE for icons, highlights, and interactive indicators
- Section backgrounds alternate between #FFFFFF and #B5EEFF
