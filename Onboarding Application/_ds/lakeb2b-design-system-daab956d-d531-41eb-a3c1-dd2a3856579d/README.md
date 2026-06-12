# LakeB2B Design System

> The single source of truth for designing with the LakeB2B brand — tokens, type, logos, components, and a reusable website UI kit.
> Every file here is copy-ready for Claude, Claude Code, Figma, Zeroheight, or any design tool that reads folders.

---

## 1 · Company context

**LakeB2B** (one word, no space — brand rule: small caps = no space; all caps = single space).

Category frame: **the B2B growth stack**. Not a point solution — an integrated platform across four verticals, all running on the same deep data foundation.

| Layer        | Value |
|--------------|-------|
| Category     | The B2B growth stack |
| Promise      | ENABLING GROWTH (always uppercase, wide tracking) |
| Proof        | Four integrated verticals |
| Foundation   | Deep data reservoirs (the "lake") |
| Outcome      | Pipeline, campaigns, talent, CXO strategy |

### The four verticals

| Vertical    | Tagline                                                    |
|-------------|------------------------------------------------------------|
| SalesTech   | Unleashing Data-Driven Lead Generation                     |
| MarTech     | Elevating Marketing Strategies with Data-Driven Insights   |
| RecruitTech | Revolutionizing Recruitment Processes                      |
| GrowthTech  | Bespoke Solutions for CXOs                                 |

Naming rule: small caps ⇒ no space (`SalesTech`). All caps ⇒ single space (`SALES TECH`).

### Sources used
- `assets/source_lake_b2b_brand_book.pdf` — 21-page brand book (story, logo rules, color primaries + secondaries, typography, imagery).
- `assets/source_logo_colour_variations.pdf` — 6-page logo colour variation sheet (images only; not text-extractable — see caveats).
- LakeB2B Design System Brief (2026-04-19) pasted into this project — strategic positioning, blurb alternates, voice lexicon, contrast guidance.
- `assets/lakeb2b-logo.png` — full-colour primary lockup (`Lake` in navy + gradient `B2B` + subline `ENABLING GROWTH`).

---

## 2 · Root index

| Path                             | What it is |
|----------------------------------|------------|
| `README.md`                      | This file |
| `SKILL.md`                       | Agent-SKILLs-compatible entrypoint |
| `colors_and_type.css`            | CSS custom properties for every brand token + base element styles |
| `assets/`                        | Logo (PNG), source brand PDFs |
| `preview/`                       | Design-system cards (one concept each) rendered for the Design System tab |
| `ui_kits/website/`               | LakeB2B marketing-site UI kit (React/JSX, interactive) |

### UI kits
- `ui_kits/website/index.html` — interactive marketing-site recreation: sticky header, gradient hero, four expandable verticals, proof stats, Alata pull-quote, gradient lead form with validation + success state, navy footer.

---

## 3 · Content fundamentals

**Voice.** Confident, enterprise-credible, partnership-led. Speaks to CXOs and revenue leaders. Avoids hype; leans on depth, precision, outcomes. Intelligent without jargon. Direct without blunt. Ambitious without arrogant. Warm without casual.

**Person.** Speaks about *the stack* in third person ("LakeB2B is…") and addresses the reader as *you* ("…scale your revenue motion…"). Avoid *we/us* on marketing surfaces; save it for internal comms.

**Casing.**
- `LakeB2B` — product surfaces, code, slugs, nav.
- `Lake B2B` — long-form prose and documents only.
- `LAKE B2B` — badges, lockups, banner type (all-caps with one space, per brand rule).
- `ENABLING GROWTH` — **always** uppercase when used as the brand promise; never Title-Cased.
- `SalesTech` / `MarTech` / `RecruitTech` / `GrowthTech` — no space when small-caps; one space when all-caps.

**Emoji.** Not in brand. Do not use emoji in product copy, nav, buttons, or marketing. Swap for Lucide icons or the in-house set when available.

**Punctuation rule (hard).** **Never use em dashes.** Use periods, commas, colons, or restructure the sentence. This is an explicit "Do Not" in the brief.

**Lexicon.**
- *Use:* growth stack, stack, integrated, platform, scale, depth, precision, intelligence, pipeline, outcomes, partnership, enterprise, reservoir, revenue motion, full lifecycle.
- *Avoid:* disrupt, revolutionary, game changer, synergy, ideate, circle back, best-in-class (when unsupported), point solution, vendor.

**Specific copy examples (pulled from primary blurb + alternates).**
- Hero H1: "LakeB2B is the B2B growth stack."
- Subhead: "One integrated platform across data intelligence, marketing technology, sales enablement, and talent, built on a single promise."
- Proof line: "Four integrated verticals — SalesTech, MarTech, RecruitTech, and GrowthTech — built on deep data reservoirs."
- Eyebrow convention: short, ALL CAPS, 0.18em tracking. e.g. `THE B2B GROWTH STACK`, `ENTERPRISE PARTNERSHIP`, `PROOF`.
- Button language: verb-first, outcome-oriented. e.g. `Book a demo →`, `Explore the stack`, `See the data`, `Talk to sales`. No "Learn more" unless paired with a specific noun.

---

## 4 · Visual foundations

### Color
Three primaries + six secondaries + derived neutrals. Rule of thumb: 80% primary palette (Purple 60 / Gold 20 / Red 20), 20% secondary. Everything lives on `:root` in `colors_and_type.css` under `--lakeb2b-*`.

- **Purple `#6D08BE`** — anchor. Hero backgrounds, primary surfaces, brand moments.
- **Gold `#FFB703`** — accent / highlight. Never use for body text on white (fails WCAG AA).
- **Red `#E8033A`** — emphasis / primary CTA. Never on purple (vibrates).
- Neutrals run `Ink → Ink-2 → Graphite → Slate → Smoke → Fog → Mist → Paper → White`, tinted slightly purple to stay harmonious with the primary palette.

### Type
- **Primary:** Montserrat (Light 300, Regular 400, Bold 700, Extra Bold 800). Hero H1 = Extra Bold; H2/H3 = Bold; body = Regular.
- **Accent:** Alata (Regular) for pull quotes, display copy, vertical subtitles.
- **Fallback:** Arial (brand-approved) then system-ui.
- Tracking: display + H1 at `-0.02em`, body at `0`, eyebrows + brand promise at `0.18em+`.
- Line-height: display 0.95–1.05, body 1.55–1.6, text-wrap: pretty/balance as appropriate.

### Backgrounds
- White and `Mist #F3F0F7` for content.
- `Navy #011A6B` for high-contrast enterprise treatments (footer, dark hero).
- `Ink #0B0718` for full-dark stat bands.
- **Gradients** are the signature — the logo itself is gradient. Named tokens: `--gradient-logo` (yellow→red→purple, 90°), `--gradient-hero` (purple→magenta→red, 135°), `--gradient-neon`, `--gradient-data`, `--gradient-soft`. Use for hero washes, CTA backgrounds, and large number treatments (stat band, hero callouts).
- **Dot patterns** (radial-gradient grid at `mix-blend-mode: overlay`) simulate the "data reservoir" motif from the brand book.
- **Curved lines / geometric overlays** on imagery — white strokes at ~0.5 opacity on gradient backgrounds. Documented in the brand book and echoed in `preview/imagery.html`.

### Animation & state
- **Easing:** `cubic-bezier(0.22, 0.61, 0.36, 1)` (standard out). Durations 120 / 200 / 320 / 600 ms.
- **Hover:** primary/secondary buttons lift 1px (`translateY(-1px)`); cards lift 2px and gain `shadow-3`.
- **Press:** no shrink — we rely on shadow reduction. Keep it subtle; enterprise brand.
- **Focus:** 4px ring at `rgba(109,8,190,0.32)` (purple at 32%). Always visible, never removed.
- No bounce easings. No spring physics. Motion is brisk and linear-ish, not playful.

### Borders, shadows, radii
- **Borders:** 1.5px on interactive inputs (focus to purple); 1px on static cards (`--border` = Fog).
- **Inner shadows:** never — too skeuomorphic for this brand.
- **Outer shadows:** 5-step ramp (`--shadow-1..4` + `--shadow-brand`, `--shadow-cta`). Brand/CTA shadows are tinted (purple/red glow) and used sparingly on hero CTAs and featured cards.
- **Radii:** `xs 4 · sm 8 · md 12 · lg 20 · xl 28 · pill 999`. Cards use `lg`; pills for all buttons.

### Transparency / blur
- Sticky headers use `rgba(255,255,255,0.82)` + `backdrop-filter: saturate(180%) blur(16px)` — the single place we lean on glass.
- On gradient backgrounds, ambient "glow" is `radial-gradient(…, transparent 60%)` at low opacity, never a blurred blob.

### Layout rules
- Content max-width 1180px with 40px gutters on desktop.
- 4pt spacing scale (`--space-1..10`). Section pad is typically 96px vertical.
- Sticky header at top; sections full-bleed when background color carries meaning (stat band ink, CTA gradient).
- Imagery tone: warm-but-saturated. Brand color tints on people photos (per brand book "People images with a tint of brand colors"). No desaturated / greyscale / film-grain treatments.

---

## 5 · Iconography

**Current state.** The brand book does not ship an icon set. We use **Lucide** from CDN (`https://unpkg.com/lucide@latest/dist/umd/lucide.min.js`) at **1.75 stroke width** — clean, geometric, matches the wordmark's weight.

This is a **flagged substitution**. When the in-house icon set arrives, drop it into `assets/icons/` and update `preview/iconography.html` + `ui_kits/website/*.jsx`.

- Icons render at 20–28px; stroke weight consistent at 1.75.
- Use for: data, growth, campaigns, talent, enterprise, workflow, bar/chart, zap (speed).
- **No emoji**, per content fundamentals. **No Unicode character "icons"** (●, ▶, etc) except as small accent dots inside feature-lists — never as primary nav affordance.
- SVG over PNG wherever possible; inline Lucide components stay crisp and can inherit `currentColor`.

---

## 6 · Caveats + open questions

1. **Font files not shipped.** We pull Montserrat + Alata from Google Fonts. If production requires self-hosted TTFs, drop them in `fonts/` and update the `@import` in `colors_and_type.css`.
2. **Logo colour variations PDF** (6 pages) could not be rendered to PNG in this environment. The primary full-colour lockup is preserved as `assets/lakeb2b-logo.png`; mono-white on purple/navy is produced via CSS `filter: brightness(0) invert(1)` as a stand-in. **Please attach the mono-white / mono-black / single-colour variations as separate PNGs or SVGs** so we can stop filtering.
3. **Icon set is substituted** (Lucide). Swap when in-house set is available.
4. **No screenshots of existing website / app UIs** were provided, so the website UI kit is composed from the brand book's voice, colour, and imagery rules — not reverse-engineered from live product. Expect cosmetic drift from www.lakeb2b.com.
5. **Derived neutrals.** The brand book has no neutral ramp; we derived ink→mist with a purple warmth so neutrals harmonise with the primary. Flag if Brand has an official neutral scale.

---

## 7 · Quick-start

```html
<!-- 1. include tokens -->
<link rel="stylesheet" href="./colors_and_type.css">

<!-- 2. use them -->
<h1>Enterprise data, activated.</h1>
<p>LakeB2B is the B2B growth stack…</p>
<button style="background:var(--lakeb2b-red);color:#fff;border-radius:var(--radius-pill);
               padding:13px 24px;font-weight:700">Book a demo →</button>

<!-- 3. promise treatment -->
<div class="brand-promise">ENABLING GROWTH</div>
```

For agents: start at `SKILL.md`.
