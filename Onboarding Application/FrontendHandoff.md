# Champ On-Boarding — Frontend Handoff

21 Oct 2026 · Dyuthi T G · [live version](https://claude.ai/artifact/T6ZiiQuBN8jH8C4skMtF54)

## Overview

Nine commits on the `Dyuthi` branch, made 17–19 Oct 2026, redesigned the HR admin portal's frontend. Six areas changed: Access & org, Analytics, the candidate detail page, the Team page, the site-wide shell, and the light theme. Together they add about 9,000 lines and remove about 3,500 across 33 files.

The work was frontend only. It added no API routes, no database fields and no new dependencies. The three server-side files it touched (`analytics.ts`, `admin/+layout.server.ts`, `team/+page.server.ts`) only reshape data that was already loaded.

**Branch state.** All nine commits are on `main`, which matches `Dyuthi` at `608c0da`. Nothing is uncommitted apart from the untracked `.playwright-mcp/` folder, which holds browser-test screenshots and should not be committed.

**How to read this.** Sections 3–7 cover each area: what changed, how it was built, and why. Section 8 covers the working rules behind the decisions. Section 9 lists every commit. Section 10 lists what is still open.

## Stack, structure and running it

The frontend is one SvelteKit app in `app/`, with hand-written CSS and no UI or chart library. All the redesign work lives in three global stylesheets and the `routes/admin` tree.

| Piece | Version / detail |
| --- | --- |
| SvelteKit | `@sveltejs/kit` ^2.63 |
| Svelte | ^5.56, runes mode forced for all project files (`vite.config.ts`) |
| Build | Vite ^8, TypeScript ^6, `svelte-check` ^4.6 |
| Adapter | Vercel by default; Node when the `RAILWAY` env var is set |
| Data layer (untouched) | Mongoose + Redis. The README still says Postgres, which is out of date |
| Charts | Hand-rolled SVG/HTML in `admin/analytics/charts.ts`, no library |

**Files that matter for the frontend**

| Path | Role |
| --- | --- |
| `app/src/lib/styles/aegis.css` | Design tokens (colour, radius, shadow), light/dark themes, base elements |
| `app/src/lib/styles/aegis-kit.css` | Shared admin components: cards, tables, pills, buttons, tabs |
| `app/src/lib/styles/analytics-kit.css` | Everything for the Analytics page, including the compact-chart and fill-the-tab sections |
| `app/src/routes/admin/+layout.svelte` | Admin shell: sidebar, logo, theme toggle, the `.content` flex column |
| `app/src/routes/admin/+page.svelte` | Home dashboard |
| `app/src/routes/admin/access/+page.svelte`, `OrgChart.svelte` | Access & org page and its org chart |
| `app/src/routes/admin/analytics/+page.svelte`, `charts.ts`, `periods.ts` | Analytics tabs, chart drawing, period bucketing |
| `app/src/routes/admin/candidates/[id]/+page.svelte` | Candidate detail page with tabs |
| `app/src/routes/admin/team/+page.svelte`, `+page.server.ts` | Team page and its access panel |
| `app/src/lib/shared/access.ts` | Access levels and their labels |

**Running it locally**

1. Start MongoDB and Redis. `docker compose up -d` from the repo root runs the whole stack on `:3000`.
2. `cd app`, copy `.env.example` to `.env` and fill it in (`MONGODB_URI`, `REDIS_URL`, `ENCRYPTION_KEY`; mail keys can stay empty, mail is then logged).
3. `npm install`, then `npm run dev`. The app is at `http://localhost:5173/admin`.
4. Run `npm run check` (svelte-check) before you push.

All layout work was checked in a real browser at **1920×1080**, in both light and dark mode. The before/after screenshots are in `.playwright-mcp/` (198 files, untracked).

## Design system and theming

The admin theme is one token set scoped to `.aegis`, not `:root`, so the white-labelled candidate portal is untouched. It has two modes. Dark (the default) is indigo with orange accents. Light ("sunrise", `c1506b4`) is a warm cream with orange, indigo and rose washes. The tokens live in `lib/styles/aegis.css`, and the shared components in `aegis-kit.css`.

### How the theme switches

- The attribute `data-theme="light"` sits on the shell root `<div class="shell aegis" data-theme={theme}>` (`admin/+layout.svelte`). With no attribute, the theme is dark. No class or media query is involved.
- The server reads the `ae-theme` cookie in `admin/+layout.server.ts`, so the first paint is already in the right theme.
- `toggleTheme()` flips a `$state` and rewrites the cookie, which lasts one year. The toggles are in the topbar and the account menu.
- `color-scheme` is set per mode. `html` and `body` get the page colour via `:has(.aegis)`: `#050a18` dark, `#fbf5ef` light.
- Analytics charts follow the theme through a `MutationObserver` on `data-theme` (see Analytics).

### Tokens

| Group | Tokens | Notes |
| --- | --- | --- |
| Accents | `--ae-ember`, `--ae-orange`, `--ae-violet`, `--ae-verdant`, `--ae-amber`, `--ae-crimson`, `--ae-azure`, `--ae-on-accent` | Each has an `-rgb` twin, used as `rgba(var(--ae-x-rgb), a)`. The names are historical: `ember` is indigo `#6366f1` in dark and orange `#ea580c` in light, and `violet` is orange in dark |
| Text | `--ae-text`, `-text-2`, `-muted`, `-muted-2`, `-faint`, `-numeral` | Light ink is `#1b1838`, a warm navy rather than grey |
| Lines | `--ae-line`, `-line-soft`, `-line-strong` | Light: `#f0e6dc` / `#f7f0e9` / `#e9dccf` |
| Surfaces | `--ae-page-bg`, `-page-solid`, `-card-bg`, `-card-solid`, `-elevated`, `-sub-bg`, `-rail-bg`, `-input-bg`, `-hover`, `-modal-base`, `-frost` |  |
| Card | `--ae-card-border`, `-border-hover`, `-radius` (16px), `-shadow`, `-shadow-hover`, `-blur` | `.surface-clay` uses a 20px radius |
| Focus | `--ae-focus` | Light: `0 0 0 3px rgba(234,88,12,.2)` |
| Type | `--ae-font-display`, `-body`, `-mono`, `-accent` (all Inter), `--ae-font-code` (JetBrains Mono) | Before `e1968c0` these were Space Grotesk, JetBrains Mono labels and Fraunces |
| Motion | `--ae-ease`, `--ae-spring`, `--ae-dur` (180ms) |  |
| Legacy aliases | `--ae-accent`, `--ae-surface-2`, `--ink`, `--fg-2`, `--smoke`, `--border` | Remapped so older code follows the admin mode |

There are **no spacing tokens**. Spacing is literal px, and some panels hard-code a 14px radius.

### Light mode ("sunrise", `c1506b4`)

Light mode used to be flat white cards on a near-white page. The redesign:

- **Page.** Cream `#fbf5ef`, with four fixed radial washes: orange (top right), indigo (top left), rose (bottom left) and amber (bottom right). It uses `background-attachment: fixed`.
- **Cards.** A peach radial over a white gradient, now `.97→.9` opacity. Border `rgba(234,88,12,.12)`, or `.28` on hover. Warm shadow: `inset 0 1px 0 rgba(255,255,255,.95), 0 1px 2px rgba(124,45,18,.05), 0 16px 34px -20px rgba(234,88,12,.28)`.
- **Sidebar.** A white-to-peach gradient with an orange glow at the bottom left. The active nav item is a solid pill, `linear-gradient(135deg,#fb923c,#ea580c)`, with white text and a glow.
- **Tables.** Peach headers, `linear-gradient(90deg,#fff3e8,#fdf1f6)` at weight 600, and an orange row-hover wash.
- **Buttons.** `.btn` is an orange gradient with an orange glow shadow. Ghost buttons hover to `#fff4ea`, teal buttons are green, and active tabs and segments are white chips with a 2px orange underline.
- **Pills and selection.** The default `.pill` is indigo (`#4338ca`) and `::selection` is orange.
- **Home.** An indigo-to-orange banner, colour-coded metric cards and quick actions (see Admin pages).

Dark mode and the chart colours were left unchanged.

**Blur removed (`9ec47c3`).** `c1506b4` put `--ae-card-blur: blur(18px) saturate(160%)` on every card, tab bar and the sidebar, over the fixed page gradient. Every click that changed the page then re-blurred about a dozen layers, and the UI felt slow. At near-opaque white the blur hardly showed. Light mode now sets the blur to `none` (the rail too) and makes the cards a little more opaque instead. Dark mode still blurs: 18px on cards and 22px on the rail.

### Shared component classes (`aegis-kit.css`)

| Class | Purpose |
| --- | --- |
| `.card`, `.table-card` | Base surfaces. The generic `.card` never gets the blur, because a backdrop-filter breaks `position: fixed` modals inside it |
| `.panel`, `.chart-card`, `.kpi-tile`, `.metric`, `.tr-tile`, `.dq-tile`, `.tabbar`, `.seg` | Glass surfaces, with the blur token, a warm hover border and shadow, and a 1px hover lift on tiles |
| `.btn`, `.btn.ghost`, `.btn.teal`, `.btn.grad`, `.btn.small` | Buttons. The base is the orange gradient call to action |
| `.pill` (`.purple`, `.gold`, `.teal`, `.red`) | Status pills |
| `.eyebrow`, `.muted`, `.error`, `.page-title`, `.divider` | Text helpers |
| `:where(.aegis) :where(.thead,.trow)` | Default table grid at zero specificity, so a page's own template always wins |
| `.card:has(.gs.open)`, `.card:has(.st-list)` | Raise to z-index 30, so an open dropdown isn't hidden under the next card |
| Orange accents | A 3px bar before panel and chart titles, a 34px underline under `h1.page-title`, a 2px marker on row hover, orange scrollbar, focus and selection |
| `ae-shimmer`, `ae-rise` | Keyframes |

The common table chrome (`.page-title`, `.table-card`, `.thead`, `.trow`, `.tcell`, `.review-cta`) is defined once in `admin/+layout.svelte`, so Home, Candidates and Entities cannot drift apart.

### Site-wide clean-up (`e1968c0`)

- Labels lost their uppercase and letter-spacing across the app. Status words became sentence case.
- Hard-coded coral and hex colours in components became tokens: GlassSelect, DateRange, RequestCard, AskChamp, SearchTypeahead, login, entities and settings.
- GlassSelect's trigger now matches the inputs: 11px 13px padding, 9px radius, 13.5px at weight 500.
- In the root layout shared with the portal, inputs went from 11px 13px to 9px 12px padding, and `.card` from 24px to 18px padding.

## Admin shell, Home and other pages

The admin shell is now a collapsible sidebar, a topbar with one global search, and a content column that always reaches the bottom of the window. Home became a two-column dashboard. Everything is in `admin/+layout.svelte` and `admin/+page.svelte`. The server data for Home did not change: the redesign is presentation only.

### Sidebar

|  | Before `e1968c0` | Now |
| --- | --- | --- |
| Width | Fixed 216px | `--rail-w` is 232px, or 76px collapsed, with a 220ms transition |
| Grouping | "Workspace" and "Admin" headings in 9.5px mono caps | One hairline (`.rail-sep`) between the main and admin links |
| Item | 13px, 15px icons, 8px 9px padding, coral active state | At least 42px tall, 14px text, 19px icons, 9px radius |
| Active (dark) | Coral wash | Indigo wash, 3px orange left marker with glow, orange icon |
| Active (light) | Same | Solid orange gradient pill, white text, glow |
| Logo | `/championsgroup.png` at 42px | The same file at 64px (34px collapsed). It was briefly a "ChampHR" SVG mark, until `4374bb1` brought the logo back |
| Footer | Email, role, underlined Log out | Account block: initials avatar, name from the email, and a menu with email, Dark/Light toggle and Log out (POST `/admin/logout`) |

**Links.** The main links are Home, Candidates, BGV (if `nav.bgv`), Offboarding, Entities (if `nav.entities`), Analytics and Inbox. The admin links are Team (if `nav.team`), Access & org (super admin only) and Export CSV. Each link comes from a `navlink` snippet, which shows a tooltip when collapsed. Icons come from one `icon()` snippet.

**Collapse.** `toggleRail()` writes the `ae-rail` cookie, and the server reads it as `railCollapsed` (the only change to `+layout.server.ts`), so the rail never flickers. At 900px and narrower the rail becomes a 272px off-canvas drawer with a scrim. It closes on navigation or Esc.

### Topbar and global search

- **Not sticky, on purpose.** Detail pages pin their own panels.
- **Contents.** Padding 14px 24px 10px. It holds a hamburger (mobile only), the search box (460px maximum, 38px tall), a theme toggle, an Inbox icon and an IST date chip.
- **Shortcut.** `Ctrl K` / `⌘K` focuses search.
- **Scoped search** (`73a6f3d`). `SCOPES` points the one box at Inbox or Offboarding on those pages, and at Candidates everywhere else. It keeps the list's other query parameters as hidden inputs, drops `page`, and wraps `SearchTypeahead` in `{#key}`. The separate search boxes on Candidates, Inbox and Offboarding were removed.

### Density (`e1968c0`, then `73a6f3d`)

| Element | Before | Now |
| --- | --- | --- |
| Content padding | 28px 28px 80px | 0 24px 24px, no max-width |
| `.page-title` | 34px | 22px |
| Table rows | 14px 18px | 7px 16px, 12px gap |
| Table header | 10px mono caps | 12px Inter at weight 500, no caps |
| Cell text | — | 12.5px |
| Mobile | — | Content 4px 16px 72px, topbar 12px 16px |

### Filling the window

This is how the no-empty-space rule is enforced:

```text
+---------------+  +-----------------------------------------------+
| Sidebar (rail)|  | Topbar: search, theme, inbox (not sticky)     |
| 232px wide    |  +-----------------------------------------------+
| 76px collapsed|  | .content: flex column, flex: 1                |
| sticky, 100vh |  |  +-----------------------------------------+  |
|               |  |  | Page title                 flex: none   |  |
|               |  |  +-----------------------------------------+  |
|               |  |  | Filters, tabs, toolbars    flex: none   |  |
|               |  |  +-----------------------------------------+  |
|               |  |  | MAIN PANEL             flex: 1 0 auto   |  |
|               |  |  | .table-card:last-of-type, .dash,        |  |
|               |  |  | .tabpanel.on, .stage                    |  |
|               |  |  | grows to the window's bottom edge       |  |
|               |  |  +-----------------------------------------+  |
+---------------+  +-----------------------------------------------+
```

1. `.shell` has `min-height: 100vh`, and the rail is sticky at `height: 100vh`.
2. `.main` and `.content` are flex columns, and `.content` has `flex: 1`.
3. Children of `.content` get `flex: none`. Only the page's main panel grows (`flex: 1 0 auto`): `.table-card:last-of-type`, `.dash`, `.tabpanel.on` or `.stage`.
4. On Home, the last card in each column also grows, so both columns end level.

A new page must put its main panel in one of those classes, or add its class to that list.

### Home dashboard

`.dash` is a grid of `minmax(0,1fr) minmax(300px,370px)` with a 22px gap. It drops to one column below 1240px, metric cards go two-up below 1100px, and the pipeline turns vertical below 700px.

**Main column, top to bottom**

1. **Banner.** An IST greeting with the first name from the email, and "Here's where onboarding stands today." In dark mode it is an indigo gradient with an orange glow. In light mode it is `linear-gradient(115deg,#312e81,#5b3aa6 38%,#db5a3c 74%,#f97316)` with white type.
2. **Four metric cards**, each linked to its list:

   | Card | Tone | Links to |
   | --- | --- | --- |
   | Total candidates | indigo | `/admin/candidates` |
   | Onboarding in progress | blue (azure) | — |
   | Awaiting review | rose (crimson) | `?status=submitted` |
   | Offer yet to be released | teal (verdant) | `#offers-to-send` |

   Each card sets `--tone`. In light mode it gets a 3px top stripe, a corner wash, a gradient icon tile and a tinted shadow. `tone-indigo` resolves to `--ae-ember-rgb`, so it shows orange in light mode.
3. **Onboarding pipeline.** Five stages: In progress, Awaiting review, Approved, Offer sent and Completed. They sit on an indigo-to-orange track. A stage is `lit` when its count is above 0, the last one is `done` (teal), and the largest is ringed (`busiest`).
4. **Recent candidates.** The shared table, with avatars coloured from a name hash and status pills from `statusMeta`.
5. **Generate onboarding link** (`#new-hire`). An illustration, name, email and mobile fields, track and company `GlassSelect`s, `?/generateLink`, and a copy/WhatsApp link box.

**Side column**

- **Quick actions:** Add new hire (scrolls to the form and focuses it), Offboarding, All candidates and Export CSV. In light mode they are orange, violet, azure and green.
- **Joining today,** with a teal count badge.
- **Offer letter yet to be sent,** with an amber "Send offer" or "Review" tag (by `isApprover`), in a 320px scrolling list.
- **Joining today popup:** shown once per day, tracked with `sessionStorage`.

The data comes from `admin/+page.server.ts`: `stats`, `recent`, `pendingOffers`, `joiningToday`, `companies`, `tracks` and `isApprover`.

### Other pages touched

| Page | Change |
| --- | --- |
| Candidates list | Sentence-case pills, a `minmax` grid with an 84px action column, two columns under 900px, local search removed |
| Offboarding list | The same grid and mobile rule. The delete cell shares the row separator (`.trow:has(+ .delcell)`). Crimson danger button, local search removed. Status labels are sentence case |
| Inbox | Sentence-case statuses, popover on `--ae-modal-base`, local search removed |
| BGV, Entities, Settings | Labels not uppercase. Error and success boxes on crimson and verdant tokens |
| Login | Background glow on `--ae-ember-rgb` |

## Candidate page

The candidate detail page went from three stacked columns to a journey sidebar plus four tabs: **Documents**, **Details**, **Offer letter** and **Joining day**. Each tab lays its content out wide. Everything is in `admin/candidates/[id]/+page.svelte` (5,012 lines), and nothing after `b5f0e09` touches it.

### How the layout evolved

| Stage | Grid | What sat where |
| --- | --- | --- |
| Before `e1968c0` | `220px 1.1fr 0.9fr`, gap 22px | A sticky journey sidebar, then a Documents column, then a third column of verification, extracted details, offer letter, other documents and physical items |
| `e1968c0` (≤1500px) | `200px minmax(0,1fr)`, gap 16px | The third column moved under Documents as CSS `columns: 2 300px` with `break-inside: avoid`, so shorter cards leave no row gaps |
| `b5f0e09` (now) | `220px minmax(0,1fr)`, gap 18px (200px at ≤1500px, one column at ≤800px) | The journey sidebar, plus a tab strip and four panes |

### Journey sidebar

The sidebar holds the Onboarding journey, Entity, Track and Employee code. Shift timing, IT mail details and the IT and employee-code mail buttons moved into the Joining day tab. Spacing was tightened: gap 16 to 12px, `.journey-card` padding 14px 16px, step padding 14 to 10px. It keeps `align-self: start`, so it stays sticky.

### The four tabs

| Tab | Contents and layout | Badge |
| --- | --- | --- |
| Documents (`#pane-docs`) | The documents list as `columns: 2 360px`, each slot `break-inside: avoid`. Below it, a two-up grid (`.pane-2`) of Document verification and Other documents | "N missing" in crimson: mandatory checklist slots with no document |
| Details (`#pane-details`) | Extracted details as `.fgroups` in `columns: 4 230px`. Religion and Marital status share a group, as do UAN and Aadhaar | None |
| Offer letter (`#pane-offer`) | The offer letter card, with the form on an auto-fill grid | Always shown: "Sent" or "Draft" |
| Joining day (`#pane-joining`) | Shift timing and IT mail beside Physical items. The IT fields sit in `.it-grid` (`auto-fill, minmax(165px,1fr)`) | "N pending": physical items not received |

**How the tabs work**

- **State.** `let tab: CandTab = $state('docs')`, with `CandTab = 'docs' | 'details' | 'offer' | 'joining'` and labels in `CAND_TABS`. Badges are one `$derived.by` (`tabBadge`).
- **Panes stay mounted.** Each pane is `<div class="tabpane" role="tabpanel" hidden={tab !== key}>`, with no `{#if}`. Unsaved input therefore survives a tab switch. `bind:this` refs (`offerForm`, `sendForms.it/code`) stay valid, so the offer preview (`new FormData(offerForm)`) and the modal's `requestSubmit()` still work. The CSS `.tabpane[hidden] { display: none !important }` is needed because pane rules set `display: flex/grid`, which would beat the browser's own `[hidden]` style.
- **Remembering the tab.** It uses `sessionStorage`, key `cand-tab:${c.id}`. One `$effect` restores the tab: it reads only `tabKey`, uses `untrack` to read storage, checks the value against `CAND_TABS` and falls back to `docs`. A second `$effect` writes it. Both are wrapped in try/catch. The restore effect must be declared first, or the previous candidate's tab gets written under the new key. Being session storage, the choice is per browser tab.
- **Filling the window.** There is no `100vh` and no inner scroll. `.cols` stretches its items, `.cand-main` is a flex column, and the open pane plus its main card get `flex: 1 0 auto`. The pane is therefore at least as tall as the sidebar, so both columns end level. The page "fits" because content spreads wide across columns, not because height is capped. A long offer letter still scrolls the page.
- **Accessibility.** The strip is `role="tablist"` ("Candidate sections"), with native buttons carrying `role="tab"`, `aria-selected` and `aria-controls`. It scrolls sideways when narrow (`overflow-x: auto`).

### Offer-letter fields fix

The offer form's fields used to stack in one column, half the form wide. `fieldset.rbac` cannot be `display: contents`, because that breaks `disabled` propagation. It uses `display: inherit` instead, so inside the `.offer-form` grid it became a grid of its own, with a single implicit column, sitting in the form's first cell only. The fix:

- `.offer-form` uses `repeat(auto-fill, minmax(165px, 1fr))`, widened to 200px inside `#pane-offer`.
- `.offer-form > fieldset.rbac { grid-column: 1 / -1; grid-template-columns: inherit }`.
- The actions row spans the full width (`grid-column: 1 / -1`). The single-column rule at ≤700px is kept.

### Candidates list

- `e1968c0` changed labels to sentence case, moved colours onto tokens, and set the table to `minmax(0,1.4fr) minmax(0,1fr) minmax(0,0.8fr) minmax(0,1.1fr) minmax(0,0.9fr) minmax(0,0.7fr) 84px`. At ≤900px it collapses to two columns and hides the review button.
- `73a6f3d` removed the page's own search box. Search lives only in the global admin bar, which uses the same `/admin/candidates/search` endpoint and `name="q"`, so `?q=` filtering still works.

## Analytics and charts

All five Analytics tabs were rebuilt by hand in HTML and SVG, drawn at real pixel sizes. Charts are compact and fixed-size, and the spare height in each tab goes to data panels. The code is in `admin/analytics/+page.svelte` (634 lines), `charts.ts` (1,644), `periods.ts` (39, new) and `lib/styles/analytics-kit.css` (2,165). No chart library is used, before or after.

**What was replaced.** The old `charts.ts` drew fixed-viewBox SVGs stretched with `preserveAspectRatio="none"`, which squashed the text. The knowledge graph was a Canvas 2D force simulation: n² repulsion, springs, a requestAnimationFrame loop and a fixed 420px canvas.

### Tabs

| Tab | Cards and how each is drawn |
| --- | --- |
| Knowledge Graph (default) | A layered SVG flow of Companies → Tracks → Documents, health filter chips, a Details card (`explainKg`), and a "What this is telling you" findings list (`computeFindings`) |
| Trends | **Stage tiles**: total, latest period, delta and an SVG sparkline. **Onboarding activity**: an SVG multi-line chart with four series (created, opened, submitted, approved), never stacked, monotone-cubic smoothing, gradient washes, direct end labels with collision avoidance, and legend toggles that always keep one line. **Review backlog**: created vs approved with a hatched gap. With only one period, both fall back to HTML bars. **Period by period**: a table |
| Funnel | **Funnel snapshot**: an HTML funnel, each band tapered with `clip-path: polygon()`, a sunset colour ramp (`rampAt`), an end-to-end % headline, and drop-off chips with a "Biggest drop" tag. **Where candidates are now**: tiles. **Median time in stage**: bar rows. **Acceptance vs rejection**: a split bar |
| Documents & Quality | **Four tiles**: right first time (weighted by need), OCR pass rate, need attention, highest mismatch. **Which documents hold candidates up**: meter rows with ticks at 65% and 80%, health shown as an icon plus a word (never colour alone), first 10 rows then "Show all N". **OCR scores**: a column histogram. **Mismatch rate by company**: bars |
| Breakdown | **Volume by company and track**: a real `<table>` heat grid in one hue, power-0.8 scale through the `--k` var, with totals and empty tracks dropped. Hover lights the row and column, with a share tooltip. **Share of candidates**: bars. **Conversion rates**: two SVG rings. **Who is carrying the review queue**: avatars hashed from email, with speed chips (Quick ≤1d, Steady ≤3d, Slow >3d) |

Above the tabs, a **KPI row** of seven Svelte tiles (`73a6f3d`). Count tiles get an 8-period spark polyline, and share tiles get a meter bar.

### How `charts.ts` works

- **Mounting.** The page imports `charts.ts` dynamically in `onMount`, so it never enters the SSR bundle. "Loading charts…" shows until it arrives. Five `.tabpanel` divs are bound with `bind:this`. One `$effect` calls the active tab's `render*Tab(container, …)`.
- **Rendering.** Each tab sets `container.innerHTML` for its layout, then builds interactive parts with `document.createElement` or the SVG helper `el()` (`createElementNS`). A redraw is a full rebuild.
- **Responsiveness.** `responsive(host, draw)` watches the host with a `ResizeObserver` and redraws only when `W×H` changes. It returns a force-redraw callback, which the legend toggles use. `plotFrame` sets the svg width and height equal to its viewBox, so text is never scaled. It also does nice ticks (`niceScale`), gridlines and x labels thinned to about 64px each.
- **Tooltips.** One lazy `div.viz-tooltip` on `document.body`, which flips side to stay on screen. Line charts use `hoverLayer`: column-wide hit rects, a crosshair, ringed dots and one multi-row tooltip.
- **Colour.** SVG needs literal hex values, so `PALETTE` holds one palette per theme. `SERIES`, `ST` and `TXT` are Proxies that read the live `data-theme` on each access. Status colours go to CSS as `--dq-good/warn/crit`. A `MutationObserver` on `.aegis[data-theme]` resets `rendered` and bumps `themeVersion`, so a theme flip redraws.

### Calendar-true periods (`periods.ts`)

The server's `getTrendSeries` buckets with `$dateTrunc` (UTC, weeks starting Sunday) and returns only periods that had activity. So "this week" was really "the last week with activity", which could be months old. `fillPeriods(trend, bucket)` walks forward from the first active bucket in UTC steps (7 days, 1 month, 3 months or 1 year). It inserts a zero row for each quiet period and stops after the period containing today. A 520-step cap guards against bad dates. It does not back-fill before the first activity. The KPI row, tiles, lines and period table all read the filled series, so they agree.

### Other data fixes (`e1968c0`)

- **Mismatch chart cap.** Bars used to scale against a fixed `max: 30`, so any company above 30% ran off the card. `mismatchRows` now scales to `Math.max(10, …rates)`, with a 10% floor so tiny rates don't fill the track. Rows are sorted descending, the top row gets a "Highest" chip, and each row shows `mismatches / total`.
- **Graph volumes.** In `lib/server/analytics.ts`, `GraphEdge` gained an optional `n`, and company→track edges carry the candidate count. The graph uses it for node totals, node radius and link thickness. Track→document edges have no `n`, because they are requirements, not volumes.

### Knowledge graph

- **Layout.** Deterministic, with no simulation. There are three columns. Companies are sorted by total. Tracks are ordered by the barycentre of their companies, and documents by the barycentre of their tracks (worst rate first on ties), which reduces crossings. Width is `max(680, host)` and height is `44 + rows×26 + 16`. Column x positions come from the longest labels. Below 680px the graph scrolls sideways (`.kg-scroll`).
- **Drawing.** Links are cubic Béziers. Company→track links are `1.5 + 7·n/maxN` wide. Track→document links are 1.2px, coloured by document health. Each node is a `g[data-node]` with `tabindex=0`, `role=button`, an `aria-label` and a `<title>`. Company size scales with √total, tracks get pill labels, and documents show their rate, with ⚠ when critical. Labels are cut by `kgClip`.
- **Interaction.** Hover or focus traces every path through a node. Click, Enter or Space pins it and fills the Details card:
  - a company lists its tracks
  - a track lists its documents, worst first
  - a document shows a verdict and the tracks that need it

  Everything else dims: links to 0.05 opacity, nodes to 0.22. Esc or a background click unpins. The filter chips (Everything, Needs attention, Watch, Healthy) highlight one health tier.

### Compact charts, filled tabs (`981632a`)

Charts now draw at small fixed sizes:

| Element | Size |
| --- | --- |
| Trend plot | 160px, growing to 300px at most |
| Funnel cone | 28px |
| Docs histogram | 110px |
| Heat cell | 26px |
| Ring | 60px |
| Graph row | 26px (was 30) |

The minimum plot height dropped from 250 to 120. The old "Breathing room" block, the stretching funnel rows and the heat-grid row fitter were removed.

The "Fill the tab, charts stay compact" CSS block makes the tab a flex column. The last block, the last card in each `.an-stack` and each card's last child get `flex: 1 0 auto`, so spare height lands on a panel, never on a chart. It is switched off below 1100px. The four panels that take that height:

1. **Trends: Period by period.** Conversion bars (opened, submitted and approved as a % of links created, capped at 100), then a table newest-first: Period, Links, Opened, Submitted, Approved and Net (created − approved). Zero cells are muted, a positive Net is amber and a negative one green. The table scrolls inside its card, with a sticky header.
2. **Funnel: Where candidates are now.** Five tiles counting who is parked at each stage (`stage[i] − stage[i+1]`): "Have not opened the link", "Opened, not submitted", "Waiting for HR review", "Approved, not complete" and "Complete". Each shows a count, a % of started and a column scaled to the busiest stage.
3. **Breakdown: Share of candidates.** Two ranked bar lists, by track and by company, each with a count and a % of the total.
4. **Graph: at a glance.** With nothing pinned, the Details card shows the 3 busiest companies, the 3 busiest tracks and the 3 weakest documents.

### Two fixes in `608c0da`

**Plot drawing outside its card.** The generic rule `.aegis .tabpanel.on .chart-card > :last-child { flex: 1 0 auto }` has specificity 0,5,0. It beat the plot's own rule `.aegis .tabpanel.on .tr-plot` (0,4,0), while that rule's `height: auto` still applied. The plot box therefore had no height, because its only child, the svg, is absolutely positioned. `responsive()` read about 0, drew at the 120px floor, and the svg spilled over the card below. The fix is to make the selector `.aegis .tabpanel.on .chart-card > .tr-plot`. That ties at 0,5,0 and wins on source order, so `flex: 1 0 160px` applies.

**Tabs not redrawing on a range change.** The range buttons are plain links, so SvelteKit navigates client-side: the page stays mounted and only `data` changes. `rendered` used to be a `true` flag per tab, so the other tabs kept the old data. It now records the data object each tab was drawn from:

```ts
let rendered: Record<string, unknown> = {};
// …
} else if (activeTab === 'trends' && trendsEl && rendered.trends !== data) {
  chartsMod.renderTrendsTab(trendsEl, data.trend, data.bucket);
  rendered.trends = data;
}
```

A new `data` marks every tab stale, and each redraws when next opened. The company, track and bucket selects use `window.location.href`, a full reload, so they were never affected.

## Access & org and the Team page

Access & org now has a working org chart and a regrouped permission matrix, and the Team page shows each member's access. All edits stay local until **Apply access**, which posts the whole change set at once. The code is in `admin/access/+page.svelte`, the new `OrgChart.svelte` (750 lines), `lib/shared/access.ts` and `admin/team/`.

### Page structure

- A header with three mode tabs (`role=tablist`): **Org chart**, **Permission matrix** (the default) and **Simulate**, plus a "Take the tour" button.
- A `.stage` grid. The current view is on the left (`.main.card`). The person panel `aside.insp` is on the right, with five sections: Role & reporting, Whose records, Separation of duties, What they can do, and Sign-off & expiry.
- A changebar footer with Reset, Review changes and Apply. It floats only while there are unsaved changes (the `dirty` class).
- A review drawer with two tabs: Pending and Recent activity.
- Edits change a local `people` working copy, which is diffed against `saved`. Apply submits `POST ?/applyAccess` with a hidden `changes` JSON field, via `use:enhance`.

### Org chart (`OrgChart.svelte`)

The org chart is **pure HTML and CSS, not SVG**. It uses nested `<ul class="org"><li>` lists, drawn by a recursive snippet `node(p, d)`. The connector lines come from `li::before`, `li::after` and a `ul::before` stem, with no JavaScript layout. Cards are 184px wide. Children are grouped by `parentOf` and sorted by name. A `reportsTo` that points at a deleted login is treated as a root. The depth check `d < people.length` stops a cycle from recursing forever.

| Feature | How it works |
| --- | --- |
| Props | `people`, `saved`, `selectedId` (`$bindable`), `toneOf`, `initials`, `wouldLoop`, `onMove`, `entities`. The only output is `onMove`, wired to `setManager` in the page |
| Drag to re-parent | Native HTML5 drag and drop on each card. `canDrop` refuses dropping on yourself, on your current manager, or anything `wouldLoop` flags. Cards that can't take the drop are dimmed. A "Drop here to put X at the top" zone removes the manager. Moved cards get an amber dot, and the stats bar shows "N moved, not applied" |
| What a move saves | Nothing until Apply. `setManager` only edits the working copy. The server checks for loops against the whole proposed chart before it writes `reportsTo` |
| Sign-off route | `chain` walks up from the selected person. A route bar shows "Sign-offs from X → manager → …", and each name jumps to that card. People who route sign-offs but have no one above them are counted as "stalls": a warning chip, plus a red dot on the Sign-offs lens |
| Lenses | A radio group of Role, Reach and Sign-offs. Each recolours the card's left strip. Reach also highlights direct reports (`team`) or every descendant (`tree`) while someone is selected |
| Detail cards | Open on hover or focus after 260ms (60ms if another card is already open) and close 180ms after leaving. Click or Enter pins one. They are portalled into `.aegis` so the theme tokens still apply, positioned beside the node and clamped to the viewport, and follow scroll and resize. Esc or an outside click closes them. Contents: reports to, team, reach, entities, tracks, a powers bar, sign-offs, access end date, Fold team, and Edit access → |
| Search, fold, zoom | Search matches name, email, title or preset and keeps the ancestors of matches unfolded. Enter jumps to the first match. Folding uses a `collapsed` Set. Zoom uses CSS `zoom` from 0.4 to 1.5, and `fit()` runs once on mount |
| Accessibility | Cards are `role=button` with `aria-pressed` and an `aria-label`. The lenses are `role=radio`, and fold buttons carry `aria-expanded`. `prefers-reduced-motion` is respected. **Drag has no keyboard equivalent.** The keyboard path is the "Reports to" select in the person panel |

### Permission matrix

- **Candidate powers in one place.** `VIEW_GROUPS` regroups `MODULES` for display only. Powers in the `access` module labelled `"Candidates: …"` move into Candidate records, under two sub-headings: "Everyday" and "Sensitive · set per person". The prefix is stripped. Stored keys and preset ceilings are unchanged. The person panel's "What they can do" uses the same groups, with a None/View/Edit/Approve segmented control per power.
- **Folding** (`73a6f3d`). Modules fold into one summary row, which shows each person's count at each level (`levelMix`). Candidate records is open by default, and a module is forced open while you search. The buttons are "Open all" and "Fold all".
- **Columns.** An open module gets a `th.mod` cell spanning its rows. The power column reads "Power · what it does", with a plain-words description under each power (`CAP_DESC`). The key and the places a power is used moved into a hover title. Each person column is a fixed 132px.
- **Tags renamed.** "in force" became **live**, "super admin only" became **admin only**, and "not wired" became **coming soon**. The legend and the tour copy changed to match.
- **Candidate records board (removed).** `e1968c0` added a card board with one card per candidate power and per-person level switches. `73a6f3d` removed it again, after its descriptions moved into the matrix. It is gone from the code.

### Person panel fix (`7728025`)

The panel used to be `position: sticky` with `max-height: calc(100vh - 110px)`, so it followed the scroll. Now `.stage` stretches both columns, and `.stage > .insp` has `contain: size`. That gives the panel no height of its own, so it takes exactly the table card's height and grows when modules open. `.insp-body { overflow-y: auto; flex: 1; min-height: 0 }` scrolls inside it. At 1100px and narrower the page is a single column, and the body scrolls with the page.

### Access levels renamed (`access.ts`)

| Stored value | Old label | New label |
| --- | --- | --- |
| `none` | — | None |
| `view` | View | View |
| `act` | Act | Edit |
| `approve` | Sign | Approve |

Only `LEVEL_LABEL` changed. The stored values and `LEVELS` are untouched, so no migration is needed. Every reader picks up the new words, including the server's denial message ("You need Edit on …"). `TONE_HEX` was recoloured. Note that the key named `violet` now holds an orange (`#fb923c`) and `ember` holds an indigo (`#6366f1`).

### Team page access panel (`73a6f3d`)

- **Server.** `team/+page.server.ts` builds a `Grantee` for each admin (`granteeOf`, `scopeList`) and adds `access` to every row, plus `entityNames` for the page.
- **Client.** Each member's email is a button. Hovering or focusing it opens a 360×440px `role=dialog` panel, placed below the email, or above when there is less than 260px below. A click pins the panel, and an outside click, Esc or a window resize closes it. The panel shows the powers count, reach, entities, tracks, expiry, and the powers by module with level chips. Admins also see a link to change the access in Access & org.
- **How it agrees with Access & org.** Both pages compute levels with the shared `grantsFromRows` and `effectiveLevel`. However, `scopeList` and `granteeOf` are **copies** of the Access & org loader, not imports. Team's checker parsing also skips the `CAPS` name check. Levels shown are unaffected, but a fix in one loader will not reach the other (see Open items).
- Team groups powers by raw `MODULES`, not `VIEW_GROUPS`. So "Candidates: …" powers show under Access & org with their prefix, unlike on the matrix.

**Offboarding labels.** `EXIT_STATUS_META` in `lib/shared/offboarding.ts` went from capitals to sentence case ("AWAITING REVIEW" became "Awaiting review"). Status keys and colours are unchanged.

## Approach and conventions

The work followed five rules. Each one came from feedback during the redesign, so keep to them when you change these pages.

1. **Make changes you can see.** A request like "make it aesthetic" means a real change to layout and visual form: cards, controls and hierarchy. Relabelling or regrouping reads as "barely any change". That happened once, when the Access & org matrix was only regrouped. When the target is unclear, pick the most visible reasonable reading and build it rather than asking.
2. **Leave no empty space.** "White space" here means content stopping short: an empty band under a short table, a Home column that ends early, or rows padded by wrapped controls. In the admin shell, `.content` is a flex column. Each page's main panel (`.table-card:last-of-type`, `.dash`, `.tabpanel.on`, `.stage`) grows to the bottom of the window. A new admin page should put its main panel in one of those classes, or add its class to that list in `admin/+layout.svelte`.
3. **Keep Analytics charts compact, with no gaps.** Charts draw at small fixed sizes: trend plot 160px, heat cell 26px, ring 60px. Do not stretch them to the window again. The spare height goes to the last card in each column, a panel that reads well tall. Centring a small chart in a tall card only moves the gap.
4. **Agree with the source of truth.** The Team page computes levels with the same shared functions as Access & org (\`grantsFromRows\`, \`effectiveLevel\`), so the levels they show agree. Renamed access levels changed only their labels, not the stored values.
5. **Check it in the browser before calling it done.** Screenshot every changed tab at 1920×1080, in light and dark mode. Check that nothing overflows its card, nothing leaves a gap, and the console is clean.

**Other conventions**

- Use Svelte 5 runes (`$state`, `$derived`, `$effect`) everywhere. The compiler forces runes mode.
- Take colours from the CSS tokens in `aegis.css`, never hard-coded hex values in components. Light-mode changes stay scoped to the light theme, and dark mode is left unchanged unless you mean to change it.
- Avoid expensive effects. `backdrop-filter` was removed from light mode because every page change re-blurred a dozen layers over a fixed gradient (`9ec47c3`).
- Write commit messages that say what the user sees, in plain words, one topic per commit.

## Change log

All nine commits by Dyuthi T G, newest first. All nine are on `main`.

| Date (IST) | Commit | What it did | Files | +/− lines | On main |
| --- | --- | --- | --- | --- | --- |
| 19 Oct, 22:46 | `608c0da` | Trend plots stay inside their cards. Analytics tabs redraw when the date range changes | `analytics-kit.css`, `analytics/+page.svelte` | +15 / −10 | Yes |
| 19 Oct, 19:20 | `9ec47c3` | Removed the backdrop blur from light mode, for click speed, and made cards a touch more solid | `aegis.css`, `admin/+layout.svelte` | +11 / −6 | Yes |
| 19 Oct, 19:15 | `c1506b4` | Light mode got colour and depth: cream page with colour washes, glass cards, an indigo-to-orange banner, colour-coded cards, an orange nav pill, peach table headers | `aegis.css`, `aegis-kit.css`, `admin/+layout.svelte`, `admin/+page.svelte` | +160 / −67 | Yes |
| 19 Oct, 19:02 | `7728025` | Access & org person panel matches the table's height and scrolls inside it, instead of sticking to the window | `access/+page.svelte` | +6 / −6 | Yes |
| 19 Oct, 19:02 | `b5f0e09` | Candidate page split into Documents, Details, Offer letter and Joining day tabs, with badges, panes kept mounted, and the tab remembered per candidate. Offer-letter fields no longer squeeze into half the width | `candidates/[id]/+page.svelte` | +552 / −313 | Yes |
| 19 Oct, 19:02 | `4374bb1` | Champions Group logo in the admin sidebar | `admin/+layout.svelte` | +12 / −30 | Yes |
| 19 Oct, 19:02 | `981632a` | Analytics charts at small fixed sizes. Spare height filled with real panels on each tab | `analytics-kit.css`, `charts.ts`, `analytics/+page.svelte` | +496 / −174 | Yes |
| 19 Oct, 18:11 | `73a6f3d` | Team page shows each member's access. Levels renamed None/View/Edit/Approve. Matrix folds by module and gains plain-words descriptions. The candidate records board is removed. Global scoped search replaces per-page search boxes. Orange-glass dark mode, fill-the-viewport layout, and the analytics KPI row are added | 15 files | +1,331 / −825 | Yes |
| 17 Oct, 01:23 | `e1968c0` | Main redesign: org chart, candidate records board, rebuilt Analytics tabs and knowledge graph, calendar-true periods, mismatch-chart cap fix, denser shell, two-column candidate page | 33 files | +6,569 / −2,022 | Yes |

To see any of them in full, run `git show <commit> --stat`, then `git show <commit> -- <file>`.

## Open items and next steps

The branch type-checks clean: `svelte-check` reported 0 errors and 0 warnings across 743 files on 21 Oct. `main` and `Dyuthi` both point at `608c0da`. None of the items below is a known crash. They are rough edges found while writing this handoff, roughly in priority order.

**Ship what is done**

- [x] All nine commits merged to `main`.
- [ ] Add `.playwright-mcp/` to `.gitignore`. It holds 198 screenshots and logs that should not be committed.

**Candidate page**

- [ ] **No-JS access.** The server always renders the Documents tab, and the other panes arrive `hidden`. Without JavaScript, Details, Offer letter and Joining day cannot be reached. The code comment that claims a no-JS post returns to its tab is wrong.
- [ ] **Flash on reload.** Reloading on a saved non-Documents tab briefly shows Documents first. Consider putting the tab in the URL (`?tab=`) so the server renders the right pane.
- [ ] **Errors on hidden panes.** Native validation cannot focus a field in a hidden pane, so a submit can fail silently. A save result or error that lands in another pane is easy to miss.
- [ ] **Tab accessibility.** Missing: arrow, Home and End keys with a roving `tabindex`, tab `id`s, and `aria-labelledby` on the panels.
- [ ] **Effect order.** The restore `$effect` must stay declared before the write `$effect`. Add a comment saying so, or merge the two effects.
- [ ] **Badges.** Offer always shows Draft or Sent, and Details never shows anything. Re-upload requests, unsent IT mail and unset shift times are not counted.

**Access & org and Team**

- [ ] **Shared loader.** Move `scopeList` and `granteeOf` into one shared module used by both `access/+page.server.ts` and `team/+page.server.ts`. Today they are copies, and Team skips the `CAPS` check on checkers.
- [ ] **Team grouping.** Group the Team access panel by `VIEW_GROUPS`, so candidate powers appear under Candidate records as they do on the matrix.
- [ ] **Keyboard re-parenting.** The org chart has no keyboard alternative to drag. Only the "Reports to" select works without a mouse.
- [ ] **Colour names.** Rename the colour tokens to match their values. `TONE_HEX.violet` is orange and `ember` is indigo, and `--ae-ember` is indigo in dark mode but orange in light. Home's `tone-indigo` card therefore shows orange in light mode.

**Analytics**

- [ ] **Findings colours.** `SEVERITY_COLOR` reads `ST.*` once, when the module loads, so its border and tag colours stay in the theme that was active at import. Read the colours at render time instead.
- [ ] **Resize observers.** `responsive()` never disconnects its `ResizeObserver`. Each rebuild leaves an observer on a detached node. This is minor, but worth cleaning up.
- [ ] **Graph redraws.** The graph tab has no `rendered` guard and redraws on every effect pass. It could use the same data-identity check as the other tabs.
- [ ] **Week boundaries.** Server buckets are UTC with Sunday-start weeks. For IST users, a Monday 00:00–05:30 event lands in the previous week. `fillPeriods` also does not back-fill quiet periods before the first activity in range.

**General**

- [ ] **Viewport height.** The shell uses `100vh`. On mobile browsers with a collapsing address bar, `100dvh` would fit better.
- [ ] **Spacing tokens.** There are none, so px values are repeated across files. Add a small scale (4/8/12/16/24) before more pages are restyled.
- [ ] **README.** It still describes Postgres, but the app runs on MongoDB and Redis.

When picking up any of this, follow the conventions above: make changes you can see, leave no empty bands, keep charts compact, and screenshot at 1920×1080 in both themes before calling it done.
