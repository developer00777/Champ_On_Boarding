// Client-only chart rendering for /admin/analytics. Plain DOM/SVG/Canvas, no
// charting library — dynamically imported from +page.svelte so this never
// ships in the SSR bundle. SVG/Canvas need literal color values, not CSS
// custom properties, so the palette is duplicated here rather than read from
// aegis.css — both dark and light are validated with
// scripts/validate_palette.js from the dataviz skill against this tab's
// actual chart surface in each theme (#171430 dark / #f6f7fc light — the
// light one is .aegis[data-theme='light']'s --ae-sub-bg card tint blended
// over its page gradient, computed once and treated as the flat reference
// the same way #171430 already was for dark):
//   dark:  all 8 categorical hues pass lightness band, chroma floor, CVD
//          separation (adjacent 8.4 protan / 8.7 tritan), normal-vision
//          floor (19.3), contrast — this is the palette already shipped.
//   light: reference palette (dataviz skill's palette.md) light column —
//          passes lightness band, chroma floor, CVD (9.1 protan), normal-
//          vision floor (19.6); contrast WARNs on 4 of 8 hues (2.0–3.0:1),
//          which is why every chart also value-labels its marks (the
//          relief rule: WARN is legal only with visible direct labels).
//   status (good/warn/crit/info): dark values are aegis.css's mode-
//          invariant --ae-verdant/amber/crimson/azure; light values are
//          deepened steps of the same hues (verdant/amber/crimson/azure
//          all fail contrast on the light surface as shipped, 1.75–2.6:1),
//          re-validated as their own 4-slot set (CVD 8.3 protan, contrast
//          all >=3:1).
//   text (primary/secondary/muted): light values are aegis.css's own
//          --ae-text/--ae-text-2/--ae-muted light tokens (already used by
//          every non-chart element on this page) — 14.3:1 / 9.0:1 / 4.5:1
//          against the light chart surface, all comfortably above WCAG AA.
import { computeFindings, type InsightsInput, type Finding, type Severity } from './insights';
import { fillPeriods } from './periods';

const PALETTE = {
	dark: {
		series: ['#3987e5', '#199e70', '#9085e9', '#d95926', '#c98500', '#d55181', '#e66767', '#6b7690'],
		status: { good: '#5eead4', warn: '#fbbf69', crit: '#fb7185', info: '#55a6ff' },
		text: { primary: '#f4f6ff', secondary: '#c8d0e6', muted: '#8e9ab6', faint: '#4b5876' },
		surface: '#0a1227'
	},
	light: {
		series: ['#2a78d6', '#1baf7a', '#4a3aa7', '#eb6834', '#eda100', '#e87ba4', '#e34948', '#5a6178'],
		status: { good: '#0f9d6e', warn: '#c08300', crit: '#d1355c', info: '#3c6fd1' },
		text: { primary: '#0d1430', secondary: '#36405e', muted: '#646f8c', faint: '#b5bdd1' },
		surface: '#f6f7fc'
	}
};

function currentTheme(): 'dark' | 'light' {
	return document.querySelector('.aegis')?.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

// SERIES/ST/TXT/SURFACE stay as the call sites' existing names (SERIES[i],
// ST.good, TXT.muted, …) but resolve against the live theme on every read —
// a Proxy rather than threading a theme param through every chart function.
const SERIES = new Proxy([] as string[], {
	get(_t, prop) {
		const arr = PALETTE[currentTheme()].series;
		return (arr as unknown as Record<PropertyKey, unknown>)[prop];
	}
}) as unknown as string[];
const ST = new Proxy(
	{},
	{
		get(_t, prop) {
			return (PALETTE[currentTheme()].status as Record<PropertyKey, string>)[prop as string];
		}
	}
) as { good: string; warn: string; crit: string; info: string };
const TXT = new Proxy(
	{},
	{
		get(_t, prop) {
			if (prop === 'mono') return "'JetBrains Mono', ui-monospace, monospace";
			return (PALETTE[currentTheme()].text as Record<PropertyKey, string>)[prop as string];
		}
	}
) as { primary: string; secondary: string; muted: string; faint: string; mono: string };
function SURFACE(): string {
	return PALETTE[currentTheme()].surface;
}

const NS = 'http://www.w3.org/2000/svg';
function el<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number> = {}): SVGElementTagNameMap[K] {
	const e = document.createElementNS(NS, tag) as SVGElementTagNameMap[K];
	for (const k in attrs) e.setAttribute(k, String(attrs[k]));
	return e;
}
function fmtNum(n: number): string {
	return n.toLocaleString('en-IN');
}

let tooltipEl: HTMLDivElement | null = null;
function tooltip(): HTMLDivElement {
	if (tooltipEl) return tooltipEl;
	tooltipEl = document.createElement('div');
	tooltipEl.className = 'viz-tooltip';
	document.body.appendChild(tooltipEl);
	return tooltipEl;
}
function showTooltip(x: number, y: number, html: string) {
	const t = tooltip();
	t.innerHTML = html;
	// Default to the cursor's bottom-right, then flip to whichever side keeps
	// the tooltip on screen — offsetWidth/Height are only correct once the
	// content above is set and the element isn't display:none, which is why
	// this reads them after innerHTML and relies on opacity (not display) to hide it.
	let left = x + 14;
	let top = y + 14;
	if (left + t.offsetWidth > window.innerWidth) left = x - t.offsetWidth - 14;
	if (top + t.offsetHeight > window.innerHeight) top = y - t.offsetHeight - 14;
	t.style.left = Math.max(4, left) + 'px';
	t.style.top = Math.max(4, top) + 'px';
	t.classList.add('show');
}
function hideTooltip() {
	tooltip().classList.remove('show');
}

// ============================================================
// Trends tab — stage tiles, activity lines, review backlog
// ============================================================
export interface TrendPoint {
	bucketStart: string;
	created: number;
	opened: number;
	submitted: number;
	approved: number;
}

type TrendNumericKey = 'created' | 'opened' | 'submitted' | 'approved';

function bucketLabel(iso: string, bucket: string): string {
	const d = new Date(iso);
	if (bucket === 'week') return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
	if (bucket === 'month') return d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
	if (bucket === 'quarter') return 'Q' + (Math.floor(d.getMonth() / 3) + 1) + " '" + String(d.getFullYear()).slice(2);
	return String(d.getFullYear());
}

// Each series counts EVENTS in its period — links created, opened, submitted,
// approved — and one candidate shows up in several of them. They are not
// parts of a whole, so they are never stacked (a stacked total would add the
// same person up to four times); they are drawn as separate lines on one
// shared count axis instead.
//
// The four hues run warm to cool in stage order, echoing the funnel's sunset
// ramp, and each stage keeps its colour whatever is toggled off. Validated with
// the dataviz skill's validate_palette.js against this file's chart surfaces:
//   dark  (#0a1227): all checks pass — worst adjacent CVD ΔE 12.3 deutan,
//                    normal-vision 15.7, contrast all >= 3:1.
//   light (#f6f7fc): all checks pass — worst adjacent CVD ΔE 14.1 deutan,
//                    normal-vision 17.6; tritan 6.1 is in the 6–8 floor band,
//                    legal here because every line is also direct-labelled
//                    at its end and named in the legend.
const TREND_STAGES: { key: TrendNumericKey; label: string }[] = [
	{ key: 'created', label: 'Links created' },
	{ key: 'opened', label: 'Opened' },
	{ key: 'submitted', label: 'Submitted' },
	{ key: 'approved', label: 'Approved' }
];
const TREND_COLORS = {
	dark: ['#d9680a', '#d6408c', '#7c5cf0', '#1a9aae'],
	light: ['#c75a0a', '#c2257a', '#6741d9', '#00909f']
};
const trendColor = (i: number) => TREND_COLORS[currentTheme()][i];

/** A "nice" axis ceiling and step: 1, 2 or 5 times a power of ten. */
function niceScale(max: number, ticks = 5): { top: number; step: number } {
	if (max <= 0) return { top: ticks, step: 1 };
	const raw = max / ticks;
	const mag = Math.pow(10, Math.floor(Math.log10(raw)));
	const step = [1, 2, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? 10 * mag;
	return { top: Math.max(step, Math.ceil(max / step) * step), step: Math.max(1, step) };
}

/** Monotone cubic through the points (Fritsch–Carlson): smooth, but never
 *  overshoots a data point — a count curve must not dip below zero or bulge
 *  above a peak that never happened. */
function smoothPath(pts: [number, number][]): string {
	const n = pts.length;
	if (n === 0) return '';
	if (n === 1) return `M${pts[0][0]},${pts[0][1]}`;
	if (n === 2) return `M${pts[0][0]},${pts[0][1]} L${pts[1][0]},${pts[1][1]}`;
	const dx: number[] = [], m: number[] = [];
	for (let i = 0; i < n - 1; i++) {
		dx.push(pts[i + 1][0] - pts[i][0]);
		m.push((pts[i + 1][1] - pts[i][1]) / (dx[i] || 1));
	}
	const t: number[] = [m[0]];
	for (let i = 1; i < n - 1; i++) t.push(m[i - 1] * m[i] <= 0 ? 0 : (m[i - 1] + m[i]) / 2);
	t.push(m[n - 2]);
	for (let i = 0; i < n - 1; i++) {
		if (m[i] === 0) { t[i] = 0; t[i + 1] = 0; continue; }
		const a = t[i] / m[i], b = t[i + 1] / m[i], h = a * a + b * b;
		if (h > 9) { const s = 3 / Math.sqrt(h); t[i] = s * a * m[i]; t[i + 1] = s * b * m[i]; }
	}
	let d = `M${pts[0][0].toFixed(1)},${pts[0][1].toFixed(1)}`;
	for (let i = 0; i < n - 1; i++) {
		const h = dx[i] / 3;
		d += ` C${(pts[i][0] + h).toFixed(1)},${(pts[i][1] + t[i] * h).toFixed(1)} ${(pts[i + 1][0] - h).toFixed(1)},${(pts[i + 1][1] - t[i + 1] * h).toFixed(1)} ${pts[i + 1][0].toFixed(1)},${pts[i + 1][1].toFixed(1)}`;
	}
	return d;
}

/** Draws at the container's real pixel width and redraws when that changes —
 *  never a fixed viewBox stretched with preserveAspectRatio="none", which
 *  squashes the text along with the plot. */
function responsive(host: HTMLElement, draw: (width: number, height: number) => void): () => void {
	let last = '';
	const run = () => {
		const w = Math.round(host.clientWidth), h = Math.round(host.clientHeight);
		if (w && `${w}x${h}` !== last) { last = `${w}x${h}`; draw(w, h); }
	};
	run();
	if (typeof ResizeObserver !== 'undefined') new ResizeObserver(run).observe(host);
	// Force a redraw at the same width, for when the data shown changes.
	return () => {
		last = '';
		run();
	};
}

interface PlotFrame {
	svg: SVGSVGElement;
	xAt: (i: number) => number;
	yAt: (v: number) => number;
	pad: { t: number; r: number; b: number; l: number };
	iw: number;
	ih: number;
}

/** Shared chrome: recessive gridlines, count ticks, period ticks. */
function plotFrame(width: number, height: number, n: number, maxV: number, xLabel: (i: number) => string, padR: number): PlotFrame {
	const pad = { t: 12, r: padR, b: 28, l: 40 };
	const iw = Math.max(40, width - pad.l - pad.r), ih = height - pad.t - pad.b;
	const svg = el('svg', { width, height, viewBox: `0 0 ${width} ${height}`, role: 'img' });
	const { top, step } = niceScale(maxV);
	const xAt = (i: number) => pad.l + (n <= 1 ? iw / 2 : (i / (n - 1)) * iw);
	const yAt = (v: number) => pad.t + ih - (v / top) * ih;
	for (let v = 0; v <= top + 1e-9; v += step) {
		const gy = yAt(v);
		svg.appendChild(el('line', { x1: pad.l, x2: pad.l + iw, y1: gy, y2: gy, class: v === 0 ? 'axis-line base' : 'axis-line grid' }));
		const lbl = el('text', { x: pad.l - 8, y: gy + 3, 'text-anchor': 'end', class: 'tick-label' });
		lbl.textContent = fmtNum(Math.round(v));
		svg.appendChild(lbl);
	}
	// As many period labels as fit at ~64px each, always including the last.
	const every = Math.max(1, Math.ceil(n / Math.max(2, Math.floor(iw / 64))));
	for (let i = 0; i < n; i++) {
		if (i % every !== 0 && i !== n - 1) continue;
		if (i !== n - 1 && n - 1 - i < every / 2) continue; // keep clear of the last label
		const t = el('text', { x: xAt(i), y: height - 8, 'text-anchor': 'middle', class: 'tick-label' });
		t.textContent = xLabel(i);
		svg.appendChild(t);
	}
	return { svg, xAt, yAt, pad, iw, ih };
}

/** A column-wide hover target per period, with a crosshair, a ringed dot on
 *  each visible line and one tooltip listing every value. */
function hoverLayer(f: PlotFrame, n: number, onHover: (i: number) => { y: number; color: string }[], tip: (i: number) => string) {
	const g = el('g');
	const marks = el('g', { 'pointer-events': 'none' });
	const colW = n <= 1 ? f.iw : f.iw / (n - 1);
	for (let i = 0; i < n; i++) {
		const hx = f.xAt(i);
		const hit = el('rect', { x: hx - colW / 2, y: f.pad.t, width: colW, height: f.ih, fill: 'transparent' });
		hit.addEventListener('mousemove', (evt) => {
			marks.replaceChildren();
			marks.appendChild(el('line', { x1: hx, x2: hx, y1: f.pad.t, y2: f.pad.t + f.ih, class: 'crosshair' }));
			for (const d of onHover(i)) marks.appendChild(el('circle', { cx: hx, cy: d.y, r: 4.5, fill: d.color, stroke: SURFACE(), 'stroke-width': 2 }));
			showTooltip(evt.clientX, evt.clientY, tip(i));
		});
		hit.addEventListener('mouseleave', () => { marks.replaceChildren(); hideTooltip(); });
		g.appendChild(hit);
	}
	f.svg.appendChild(marks);
	f.svg.appendChild(g);
}

/** Small fixed-size trend line for a stat tile. */
function sparkline(values: number[], color: string): SVGSVGElement {
	const w = 96, h = 30;
	// No text inside, so it may stretch to fill a narrow tile; the strokes keep
	// their weight with non-scaling-stroke.
	const svg = el('svg', { width: w, height: h, viewBox: `0 0 ${w} ${h}`, preserveAspectRatio: 'none', 'aria-hidden': 'true', class: 'tr-spark' });
	const max = Math.max(1, ...values);
	const pts = values.map((v, i) => [values.length <= 1 ? w / 2 : (i / (values.length - 1)) * (w - 4) + 2, h - 3 - (v / max) * (h - 6)] as [number, number]);
	const gid = 'sp' + Math.random().toString(36).slice(2, 8);
	const defs = el('defs');
	const grad = el('linearGradient', { id: gid, x1: 0, x2: 0, y1: 0, y2: 1 });
	grad.appendChild(el('stop', { offset: '0%', 'stop-color': color, 'stop-opacity': 0.32 }));
	grad.appendChild(el('stop', { offset: '100%', 'stop-color': color, 'stop-opacity': 0 }));
	defs.appendChild(grad);
	svg.appendChild(defs);
	const line = smoothPath(pts);
	if (pts.length > 1) svg.appendChild(el('path', { d: `${line} L${pts[pts.length - 1][0]},${h} L${pts[0][0]},${h} Z`, fill: `url(#${gid})` }));
	svg.appendChild(el('path', { d: line, fill: 'none', stroke: color, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', 'vector-effect': 'non-scaling-stroke' }));
	return svg;
}

function deltaHTML(cur: number, prev: number | undefined): string {
	if (prev === undefined) return '';
	if (prev === 0) return cur > 0 ? '<span class="tr-delta up">new</span>' : '<span class="tr-delta flat">—</span>';
	const pct = Math.round(((cur - prev) / prev) * 100);
	if (pct === 0) return '<span class="tr-delta flat">± 0%</span>';
	return `<span class="tr-delta ${pct > 0 ? 'up' : 'down'}">${pct > 0 ? '▲' : '▼'} ${Math.abs(pct)}%</span>`;
}

/** Labels at the right end of each line: the latest value and the series
 *  name. Series ending on the same value share one label — the value once,
 *  their names stacked beneath it — instead of piling up copies; the groups
 *  are pushed apart by their real heights, then pulled back inside the plot so
 *  none spills below the axis. */
function endLabels(f: PlotFrame, x: number, items: { v: number; label: string; color: string }[]) {
	const groups = new Map<number, { v: number; labels: string[]; colors: string[] }>();
	for (const it of items) {
		const g = groups.get(it.v) ?? { v: it.v, labels: [], colors: [] };
		g.labels.push(it.label);
		g.colors.push(it.color);
		groups.set(it.v, g);
	}
	// y is the value's baseline; each name takes a 12px line below it.
	const LINE = 12, PAD = 6;
	const height = (n: number) => 4 + LINE * n + PAD;
	const top = f.pad.t + 4, bottom = f.pad.t + f.ih + 4;
	const ends = [...groups.values()].map((g) => ({ ...g, y: f.yAt(g.v) })).sort((a, b) => a.y - b.y);
	for (let i = 1; i < ends.length; i++) ends[i].y = Math.max(ends[i].y, ends[i - 1].y + height(ends[i - 1].labels.length));
	const last = ends[ends.length - 1];
	if (last && last.y + LINE * last.labels.length > bottom) {
		last.y = bottom - LINE * last.labels.length;
		for (let i = ends.length - 2; i >= 0; i--) ends[i].y = Math.min(ends[i].y, ends[i + 1].y - height(ends[i].labels.length));
	}
	for (const e of ends) e.y = Math.max(top, e.y);
	for (const e of ends) {
		e.colors.forEach((c) => f.svg.appendChild(el('circle', { cx: x, cy: f.yAt(e.v), r: 3.5, fill: c, stroke: SURFACE(), 'stroke-width': 2 })));
		const v = el('text', { x: x + 10, y: e.y + 1, class: 'tr-end-v' });
		v.textContent = fmtNum(e.v);
		f.svg.appendChild(v);
		e.labels.forEach((name, k) => {
			const n = el('text', { x: x + 10, y: e.y + 13 + k * LINE, class: 'tr-end-n' });
			n.textContent = name;
			f.svg.appendChild(n);
		});
	}
}

function activityChart(host: HTMLElement, data: TrendPoint[], xLabel: (i: number) => string, hidden: Set<TrendNumericKey>): () => void {
	return responsive(host, (width, height) => {
		const shown = TREND_STAGES.map((s, i) => ({ ...s, color: trendColor(i) })).filter((s) => !hidden.has(s.key));
		const maxV = Math.max(1, ...shown.flatMap((s) => data.map((d) => d[s.key])));
		const f = plotFrame(width, Math.max(250, height), data.length, maxV, xLabel, 96);
		f.svg.setAttribute('aria-label', 'Onboarding activity per period: ' + shown.map((s) => s.label).join(', '));
		const defs = el('defs');
		f.svg.appendChild(defs);
		shown.forEach((s) => {
			const pts = data.map((d, i) => [f.xAt(i), f.yAt(d[s.key])] as [number, number]);
			const line = smoothPath(pts);
			// A faint wash under each line, fading to nothing, so the lines read
			// as shapes without the fills piling up into mud.
			const gid = 'ta' + s.key + Math.random().toString(36).slice(2, 6);
			const grad = el('linearGradient', { id: gid, x1: 0, x2: 0, y1: 0, y2: 1 });
			grad.appendChild(el('stop', { offset: '0%', 'stop-color': s.color, 'stop-opacity': shown.length === 1 ? 0.28 : 0.12 }));
			grad.appendChild(el('stop', { offset: '100%', 'stop-color': s.color, 'stop-opacity': 0 }));
			defs.appendChild(grad);
			if (pts.length > 1) {
				const base = f.yAt(0);
				f.svg.appendChild(el('path', { d: `${line} L${pts[pts.length - 1][0]},${base} L${pts[0][0]},${base} Z`, fill: `url(#${gid})` }));
			}
			f.svg.appendChild(el('path', { d: line, fill: 'none', stroke: s.color, 'stroke-width': 2.25, 'stroke-linecap': 'round', 'stroke-linejoin': 'round', class: 'tr-line' }));
		});
		const lastRow = data[data.length - 1];
		endLabels(f, f.xAt(data.length - 1), shown.map((s) => ({ v: lastRow[s.key], label: s.label, color: s.color })));
		hoverLayer(
			f,
			data.length,
			(i) => shown.map((s) => ({ y: f.yAt(data[i][s.key]), color: s.color })),
			(i) =>
				`<div class="tt-title">${xLabel(i)}</div>` +
				shown.map((s) => `<div class="tt-row"><span class="tt-swatch" style="background:${s.color}"></span>${s.label}<span class="tt-val">${fmtNum(data[i][s.key])}</span></div>`).join('')
		);
		host.replaceChildren(f.svg);
	});
}

function backlogChart(host: HTMLElement, data: TrendPoint[], xLabel: (i: number) => string) {
	responsive(host, (width, height) => {
		const cIn = trendColor(0), cOut = trendColor(3);
		const maxV = Math.max(1, ...data.flatMap((d) => [d.created, d.approved]));
		const f = plotFrame(width, Math.max(250, height), data.length, maxV, xLabel, 96);
		f.svg.setAttribute('aria-label', 'Links created against candidates approved, per period');
		const pin = data.map((d, i) => [f.xAt(i), f.yAt(d.created)] as [number, number]);
		const pout = data.map((d, i) => [f.xAt(i), f.yAt(d.approved)] as [number, number]);
		// The gap between the two lines, hatched: where candidates are sitting.
		if (data.length > 1) {
			const pid = 'bk' + Math.random().toString(36).slice(2, 8);
			const defs = el('defs');
			const pat = el('pattern', { id: pid, width: 6, height: 6, patternUnits: 'userSpaceOnUse', patternTransform: 'rotate(45)' });
			pat.appendChild(el('line', { x1: 0, y1: 0, x2: 0, y2: 6, stroke: cIn, 'stroke-width': 1.6, 'stroke-opacity': 0.35 }));
			defs.appendChild(pat);
			f.svg.appendChild(defs);
			const top = smoothPath(pin);
			const back = smoothPath([...pout].reverse()).replace(/^M/, 'L');
			f.svg.appendChild(el('path', { d: `${top} ${back} Z`, fill: `url(#${pid})` }));
		}
		f.svg.appendChild(el('path', { d: smoothPath(pin), fill: 'none', stroke: cIn, 'stroke-width': 2.25, 'stroke-linecap': 'round' }));
		f.svg.appendChild(el('path', { d: smoothPath(pout), fill: 'none', stroke: cOut, 'stroke-width': 2.25, 'stroke-linecap': 'round' }));
		const last = data[data.length - 1];
		endLabels(f, f.xAt(data.length - 1), [
			{ v: last.created, label: 'Created', color: cIn },
			{ v: last.approved, label: 'Approved', color: cOut }
		]);
		hoverLayer(
			f,
			data.length,
			(i) => [{ y: f.yAt(data[i].created), color: cIn }, { y: f.yAt(data[i].approved), color: cOut }],
			(i) => {
				const gap = data[i].created - data[i].approved;
				return (
					`<div class="tt-title">${xLabel(i)}</div>` +
					`<div class="tt-row"><span class="tt-swatch" style="background:${cIn}"></span>Links created<span class="tt-val">${fmtNum(data[i].created)}</span></div>` +
					`<div class="tt-row"><span class="tt-swatch" style="background:${cOut}"></span>Approved<span class="tt-val">${fmtNum(data[i].approved)}</span></div>` +
					`<div class="tt-row" style="margin-top:3px">${gap >= 0 ? 'Added to the queue' : 'Queue shrank by'}<span class="tt-val">${fmtNum(Math.abs(gap))}</span></div>`
				);
			}
		);
		host.replaceChildren(f.svg);
	});
}

/** With a single period there is no line to draw, so show that period's
 *  numbers plainly instead of an empty plot with labels piled on one point. */
function singlePeriodBars(row: TrendPoint, label: string): string {
	const max = Math.max(1, ...TREND_STAGES.map((s) => row[s.key]));
	return (
		'<div class="tr-single">' +
		TREND_STAGES.map(
			(s, i) =>
				`<div class="tr-single-row" style="--c:${trendColor(i)}"><span class="tr-single-k"><span class="tr-dot"></span>${s.label}</span>` +
				`<span class="tr-single-track"><span class="tr-single-bar" style="width:${row[s.key] ? Math.max(2, (row[s.key] / max) * 100) : 0}%"></span></span>` +
				`<b>${fmtNum(row[s.key])}</b></div>`
		).join('') +
		`<div class="tr-single-note">Only one ${esc(label)} of activity so far. The lines over time appear once there are two or more.</div>` +
		'</div>'
	);
}

export function renderTrendsTab(container: HTMLElement, rawTrend: TrendPoint[], bucket: string) {
	// A redraw (theme flip, revisit) replaces the plot under the cursor without
	// a mouseleave, so drop any tooltip the old one left open.
	hideTooltip();
	if (rawTrend.length === 0) {
		container.innerHTML = '<div class="chart-card"><div class="tr-empty">No onboarding activity in this range yet.</div></div>';
		return;
	}
	const trend = fillPeriods(rawTrend, bucket);
	const single = trend.length < 2;
	const xLabel = (i: number) => bucketLabel(trend[i].bucketStart, bucket);
	const last = trend[trend.length - 1];
	const prev = trend[trend.length - 2];
	const totals = TREND_STAGES.map((s) => trend.reduce((a, d) => a + d[s.key], 0));
	const totalCreated = totals[0];
	const totalApproved = totals[3];
	const net = totalCreated - totalApproved;

	container.innerHTML =
		'<div class="tr-tiles" id="trTiles"></div>' +
		'<div class="an-split trends">' +
		'<div class="chart-card">' +
		'<div class="chart-card-head"><span class="chart-title">Onboarding activity</span><span class="legend tr-toggles" id="trToggles"></span></div>' +
		(single
			? `<div class="chart-note">What happened in the ${bucket} of ${xLabel(0)}: links sent, opened, forms submitted and approved.</div>` + singlePeriodBars(trend[0], bucket)
			: `<div class="chart-note">What happened each ${bucket}: links sent, opened, forms submitted and approved. Click a name above to hide or show its line; hover for exact counts.</div>` +
				'<div class="tr-plot" id="trActivity"></div>') +
		'</div>' +
		'<div class="chart-card">' +
		'<div class="chart-card-head"><span class="chart-title">Review backlog</span>' +
		`<span class="tr-net ${net > 0 ? 'up' : 'down'}"><b>${net > 0 ? '+' : ''}${fmtNum(net)}</b> ${net > 0 ? 'more created than approved' : net < 0 ? 'more approved than created' : 'created and approved match'}</span>` +
		'</div>' +
		(single
			? `<div class="chart-note">Links created against candidates approved in the ${bucket} of ${xLabel(0)}.</div>` +
				`<div class="tr-vs"><div style="--c:${trendColor(0)}"><span class="tr-dot"></span><b>${fmtNum(trend[0].created)}</b><small>links created</small></div>` +
				`<span class="tr-vs-sep">vs</span>` +
				`<div style="--c:${trendColor(3)}"><span class="tr-dot"></span><b>${fmtNum(trend[0].approved)}</b><small>approved</small></div></div>`
			: `<div class="chart-note">Links created against candidates approved, per ${bucket}. The hatched gap is the work still in flight — wider means the queue is growing.</div>` +
				'<div class="tr-plot" id="trBacklog"></div>') +
		'</div>' +
		'</div>';

	// Stage tiles: total in range, the latest period and its change.
	const tiles = container.querySelector<HTMLElement>('#trTiles')!;
	TREND_STAGES.forEach((s, i) => {
		const c = trendColor(i);
		const tile = document.createElement('div');
		tile.className = 'tr-tile';
		tile.style.setProperty('--c', c);
		tile.innerHTML =
			`<div class="tr-tile-k"><span class="tr-dot"></span>${s.label}</div>` +
			`<div class="tr-tile-v">${fmtNum(totals[i])}</div>` +
			`<div class="tr-tile-sub">${fmtNum(last[s.key])} ${bucket === 'week' ? 'this week' : 'latest ' + bucket} ${deltaHTML(last[s.key], prev?.[s.key])}</div>`;
		if (!single) tile.appendChild(sparkline(trend.map((d) => d[s.key]), c));
		tile.title = `${s.label}: ${fmtNum(totals[i])} in range; ${fmtNum(last[s.key])} in ${xLabel(trend.length - 1)}` + (prev ? ` against ${fmtNum(prev[s.key])} the period before` : '');
		tiles.appendChild(tile);
	});

	// Legend that doubles as series toggles. Colours follow the stage, never
	// its position, so hiding one never repaints the others.
	if (single) return;
	const hidden = new Set<TrendNumericKey>();
	const toggles = container.querySelector<HTMLElement>('#trToggles')!;
	const redraw = activityChart(container.querySelector<HTMLElement>('#trActivity')!, trend, xLabel, hidden);
	TREND_STAGES.forEach((s, i) => {
		const b = document.createElement('button');
		b.type = 'button';
		b.className = 'tr-toggle';
		b.style.setProperty('--c', trendColor(i));
		b.setAttribute('aria-pressed', 'true');
		b.innerHTML = `<span class="tr-dot"></span>${s.label}`;
		b.addEventListener('click', () => {
			if (hidden.has(s.key)) hidden.delete(s.key);
			else if (hidden.size < TREND_STAGES.length - 1) hidden.add(s.key); // always keep one line
			b.setAttribute('aria-pressed', String(!hidden.has(s.key)));
			redraw();
		});
		toggles.appendChild(b);
	});
	backlogChart(container.querySelector<HTMLElement>('#trBacklog')!, trend, xLabel);
}

// ============================================================
// Funnel tab
// ============================================================
export interface FunnelData {
	sent: number;
	opened: number;
	submitted: number;
	approved: number;
	complete: number;
}
export interface StageDurations {
	sentToOpened: number | null;
	sentToSubmitted: number | null;
	submittedToApproved: number | null;
	sampleSizes: { sentToOpened: number; sentToSubmitted: number; submittedToApproved: number };
}

interface FunnelStage { label: string; value: number }

/** The step between two stages, as the funnel reads it: how many carried on,
 *  and how many were lost on the way. */
function funnelSteps(stages: FunnelStage[]) {
	return stages.slice(1).map((s, i) => {
		const prev = stages[i].value;
		const lost = Math.max(0, prev - s.value);
		return { from: stages[i].label, to: s.label, lost, keep: prev ? Math.round((s.value / prev) * 100) : null };
	});
}

const pctOf = (n: number, of: number) => (of ? Math.round((n / of) * 100) : 0);

/** End-to-end conversion, shown as the card's headline number. */
function funnelHeadline(stages: FunnelStage[]): string {
	const first = stages[0]?.value ?? 0;
	const last = stages[stages.length - 1];
	if (!first || !last) return '';
	return (
		'<span class="fnl-hero"><b>' + pctOf(last.value, first) + '%</b> ' +
		stages[0].label.toLowerCase() + ' → ' + last.label.toLowerCase() + '</span>'
	);
}

// The funnel's colour ramp: an ordered sunset run, burnt orange → raspberry →
// indigo, one step per
// stage. It encodes stage order (top of the funnel to the bottom), the way a
// sequential ramp does, so it is never colour by rank — every filter keeps the
// same stages and the same colours. Anchors are deep enough per theme for the
// white percentage inside each band; the band's own gradient runs into the
// next stage's colour, so the funnel reads as one continuous piece.
const FUNNEL_RAMP = {
	dark: ['#d9480f', '#c2255c', '#7048e8'],
	light: ['#c2410c', '#be185d', '#6d28d9']
};
function hexToRgb(h: string): [number, number, number] {
	const n = parseInt(h.slice(1), 16);
	return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}
function rampAt(t: number): string {
	const stops = FUNNEL_RAMP[currentTheme()];
	const x = Math.min(1, Math.max(0, t)) * (stops.length - 1);
	const i = Math.min(stops.length - 2, Math.floor(x));
	const a = hexToRgb(stops[i]);
	const b = hexToRgb(stops[i + 1]);
	const f = x - i;
	return '#' + a.map((v, k) => Math.round(v + (b[k] - v) * f).toString(16).padStart(2, '0')).join('');
}

// A real funnel: each stage is a centred band that narrows from its own count
// to the next stage's, so the shape itself is the drop-off. The last stage
// keeps its width, the spout. HTML with clip-path rather than an SVG, so the
// labels stay crisp at any card width — the old chart was an SVG stretched
// with preserveAspectRatio="none", which squashed its own text.
//
// Colour steps down the ramp above, stage by stage. Under the funnel, one chip per step
// says how many were lost there; the worst is flagged with an icon and a
// label, never colour alone.
function funnelChart(stages: FunnelStage[]): HTMLElement {
	const root = document.createElement('div');
	root.className = 'fnl';
	const top = stages[0]?.value ?? 0;
	if (!top) {
		root.innerHTML = '<div class="fnl-empty">No onboarding links in this filter yet.</div>';
		return root;
	}
	// A later stage should never exceed the first, but scale to the largest
	// anyway so a bad count can never draw past the track. A floor keeps a
	// tiny stage visible as a sliver rather than vanishing.
	const maxV = Math.max(top, ...stages.map((s) => s.value));
	const widthOf = (v: number) => Math.max(6, (v / maxV) * 100);
	const steps = funnelSteps(stages);
	const worst = steps.reduce<number>((w, s, i) => (s.lost > (steps[w]?.lost ?? -1) ? i : w), -1);
	root.style.setProperty('--fnl', rampAt(0));
	root.style.setProperty('--fnl-bad', ST.crit);

	const rows = document.createElement('div');
	rows.className = 'fnl-rows';
	stages.forEach((s, i) => {
		const t = widthOf(s.value);
		const b = i < stages.length - 1 ? widthOf(stages[i + 1].value) : t;
		const prev = i > 0 ? stages[i - 1].value : s.value;
		const lost = Math.max(0, prev - s.value);
		const row = document.createElement('div');
		row.className = 'fnl-row';
		const last = stages.length - 1;
		const c = rampAt(last ? i / last : 0);
		row.style.setProperty('--c', c);
		row.style.setProperty('--c2', i < last ? rampAt((i + 1) / last) : c);
		row.tabIndex = 0;
		row.setAttribute(
			'aria-label',
			`${s.label}: ${fmtNum(s.value)} candidates, ${pctOf(s.value, top)}% of ${stages[0].label.toLowerCase()}` +
				(i > 0 ? `, ${fmtNum(lost)} lost since ${stages[i - 1].label.toLowerCase()}` : '')
		);
		const poly = `polygon(${50 - t / 2}% 0, ${50 + t / 2}% 0, ${50 + b / 2}% 100%, ${50 - b / 2}% 100%)`;
		row.innerHTML =
			'<span class="fnl-name"><span class="fnl-ix">' + (i + 1) + '</span>' + s.label + '</span>' +
			'<span class="fnl-cone"><span class="fnl-band" style="clip-path:' + poly + '"></span>' +
			'<span class="fnl-in">' + pctOf(s.value, top) + '%</span></span>' +
			'<span class="fnl-num"><b>' + fmtNum(s.value) + '</b>' +
			(i > 0 ? '<small>−' + fmtNum(lost) + '</small>' : '<small>started</small>') +
			'</span>';
		row.addEventListener('mousemove', (evt) => {
			showTooltip(
				evt.clientX,
				evt.clientY,
				`<div class="tt-title">${s.label}</div>` +
					`<div class="tt-row">Candidates<span class="tt-val">${fmtNum(s.value)}</span></div>` +
					`<div class="tt-row">Share of ${stages[0].label.toLowerCase()}<span class="tt-val">${pctOf(s.value, top)}%</span></div>` +
					(i > 0
						? `<div class="tt-row">Carried on from ${stages[i - 1].label.toLowerCase()}<span class="tt-val">${pctOf(s.value, prev)}%</span></div>` +
							`<div class="tt-row">Lost at this step<span class="tt-val">${fmtNum(lost)}</span></div>`
						: '')
			);
		});
		row.addEventListener('mouseleave', hideTooltip);
		rows.appendChild(row);
	});
	root.appendChild(rows);

	// Where people fall out, one chip per step, in funnel order.
	const leaks = document.createElement('div');
	leaks.className = 'fnl-leaks';
	leaks.innerHTML =
		'<span class="fnl-leaks-k">Drop-off</span>' +
		steps
			.map((st, i) => {
				const bad = i === worst && st.lost > 0;
				return (
					'<span class="fnl-leak' + (bad ? ' bad' : '') + '" title="' + st.from + ' → ' + st.to + ': ' + (st.keep ?? 0) + '% carried on">' +
					(bad
						? '<svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 21h20L12 3Z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><path d="M12 10v5M12 18h.01" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>'
						: '') +
					'<span class="fnl-leak-n">' + st.from + ' → ' + st.to + '</span>' +
					'<b>−' + (100 - (st.keep ?? 100)) + '%</b>' +
					(bad ? '<span class="fnl-leak-tag">Biggest drop</span>' : '') +
					'</span>'
				);
			})
			.join('');
	root.appendChild(leaks);
	return root;
}

export interface HiringDecisionData {
	accepted: number;
	rejected: number;
	undecided: number;
	acceptanceRate: number | null;
}

/** Median days between two timestamps, one compact row per stage. Rows with
 *  too few candidates say so in place of a bar, rather than drawing nothing. */
function stageDurationRows(sd: StageDurations): string {
	const stages = [
		{ label: 'Sent → Opened', days: sd.sentToOpened, n: sd.sampleSizes.sentToOpened },
		{ label: 'Sent → Submitted', days: sd.sentToSubmitted, n: sd.sampleSizes.sentToSubmitted },
		{ label: 'Submitted → Approved', days: sd.submittedToApproved, n: sd.sampleSizes.submittedToApproved }
	];
	const max = Math.max(1, ...stages.map((s) => s.days ?? 0));
	return (
		'<div class="fx-dur">' +
		stages
			.map(
				(s) =>
					`<div class="fx-dur-row" title="${s.days == null ? 'Too few candidates have both timestamps yet' : `Median of ${s.n} candidate${s.n === 1 ? '' : 's'}`}">` +
					`<span class="fx-dur-k">${s.label}</span>` +
					(s.days == null
						? '<span class="fx-dur-none">Not enough data yet</span>'
						: `<span class="fx-dur-track"><span class="fx-dur-bar" style="width:${Math.max(3, (s.days / max) * 100)}%"></span></span><b>${s.days.toFixed(1)}d</b>`) +
					'</div>'
			)
			.join('') +
		'</div>'
	);
}

/** Accepted against rejected, as one split bar with the counts beside it. */
function decisionBar(d: HiringDecisionData): string {
	const decided = d.accepted + d.rejected;
	const pending = d.undecided ? `<div class="fx-dec-note">${fmtNum(d.undecided)} candidate${d.undecided === 1 ? '' : 's'} still without a decision ${d.undecided === 1 ? 'is' : 'are'} left out of the rate.</div>` : '';
	if (!decided) return `<div class="fx-dec-empty">No hiring decisions recorded yet for this filter.</div>${pending}`;
	const a = Math.round((d.accepted / decided) * 100);
	return (
		`<div class="fx-dec-bar"><span class="acc" style="width:${a}%">${a >= 12 ? a + '%' : ''}</span><span class="rej" style="width:${100 - a}%">${100 - a >= 12 ? 100 - a + '%' : ''}</span></div>` +
		`<div class="fx-dec-keys"><span><i class="acc"></i>Accepted <b>${fmtNum(d.accepted)}</b></span><span><i class="rej"></i>Rejected <b>${fmtNum(d.rejected)}</b></span></div>` +
		pending
	);
}

export function renderFunnelTab(
	container: HTMLElement,
	funnel: FunnelData,
	stageDurations: StageDurations,
	hiringDecision?: HiringDecisionData
) {
	hideTooltip();
	container.style.setProperty('--dq-good', ST.good);
	container.style.setProperty('--dq-crit', ST.crit);
	container.style.setProperty('--dq-info', ST.info);
	const stages: FunnelStage[] = [
		{ label: 'Link sent', value: funnel.sent },
		{ label: 'Opened', value: funnel.opened },
		{ label: 'Submitted', value: funnel.submitted },
		{ label: 'Approved', value: funnel.approved },
		{ label: 'Complete', value: funnel.complete }
	];
	// The funnel takes the wide column; the two smaller read-outs stack beside
	// it instead of each claiming a full-width row of their own.
	container.innerHTML =
		'<div class="an-split">' +
		'<div class="chart-card">' +
		'<div class="chart-card-head"><span class="chart-title">Funnel snapshot</span>' + funnelHeadline(stages) + '</div>' +
		'<div class="chart-note">Every candidate in the selected filters, by the furthest stage they reached. Each band narrows to the next stage, so the shape is the drop-off.</div>' +
		'<div id="funnelChart"></div>' +
		'</div>' +
		'<div class="an-stack">' +
		'<div class="chart-card">' +
		'<div class="chart-card-head"><span class="chart-title">Median time in stage</span></div>' +
		'<div class="chart-note">From the real timestamps on each candidate and link.</div>' +
		stageDurationRows(stageDurations) +
		'</div>' +
		(hiringDecision
			? '<div class="chart-card">' +
				'<div class="chart-card-head"><span class="chart-title">Acceptance vs. rejection</span>' +
				(hiringDecision.acceptanceRate != null ? `<span class="dq-hero"><b>${hiringDecision.acceptanceRate}%</b> accepted</span>` : '') +
				'</div>' +
				'<div class="chart-note">The hiring decision HR records on each candidate’s profile.</div>' +
				decisionBar(hiringDecision) +
				'</div>'
			: '') +
		'</div>' +
		'</div>';
	container.querySelector('#funnelChart')!.appendChild(funnelChart(stages));
}

// ============================================================
// Documents & Quality tab
// ============================================================
export interface DocSlotStat {
	type: string;
	label: string;
	mandatory: boolean;
	needed: number;
	rate: number | null;
}
export interface VerificationStats {
	histogram: { bucket: string; n: number }[];
	mismatchByCompany: { company: string; rate: number; total: number }[];
}

// Built as HTML rather than SVG: rows are one per document slot or company,
// so the count is unbounded and the labels are long ("Relieving Letter /
// Resignation Acceptance Email") — HTML wraps and ellipsises them properly,
// and nothing is stretched with preserveAspectRatio="none".
//
// Health uses the reserved status colours, always with an icon and a word
// beside them (Needs attention / Watch / Healthy), never colour alone. The
// thresholds are the ones this tab has always used: below 65 needs attention,
// 65–79 is worth watching, 80 and up is healthy.
const DOC_BANDS = { crit: 65, warn: 80 };
type Health = 'crit' | 'warn' | 'good';
const healthOf = (pct: number): Health => (pct < DOC_BANDS.crit ? 'crit' : pct < DOC_BANDS.warn ? 'warn' : 'good');
const HEALTH_LABEL: Record<Health, string> = { crit: 'Needs attention', warn: 'Watch', good: 'Healthy' };
const HEALTH_ICON: Record<Health, string> = {
	crit: '<svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 2 21h20L12 3Z" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linejoin="round"/><path d="M12 10v5M12 18h.01" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
	warn: '<svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="M12 7v6M12 16.5h.01" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"/></svg>',
	good: '<svg width="11" height="11" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2.4"/><path d="m8 12.5 2.8 2.8L16.5 9.5" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg>'
};
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c] as string);
const healthChip = (h: Health) => `<span class="dq-chip ${h}">${HEALTH_ICON[h]}${HEALTH_LABEL[h]}</span>`;

/** One document slot: name, tags, a meter with the two threshold ticks, the
 *  rate, and how many candidates that rate is out of. */
function docSlotRow(s: DocSlotStat): HTMLElement {
	const pct = s.rate as number;
	const h = healthOf(pct);
	const ok = Math.round((pct / 100) * s.needed);
	const row = document.createElement('div');
	row.className = `dq-slot ${h}`;
	row.tabIndex = 0;
	row.setAttribute('aria-label', `${s.label}: ${pct}% right first time, ${ok} of ${s.needed} candidates. ${HEALTH_LABEL[h]}.`);
	row.innerHTML =
		`<div class="dq-slot-id"><span class="dq-slot-name" title="${esc(s.label)}">${esc(s.label)}</span>` +
		`<span class="dq-tag${s.mandatory ? ' req' : ''}">${s.mandatory ? 'Mandatory' : 'Optional'}</span></div>` +
		`<div class="dq-meter"><span class="dq-fill" style="width:${Math.max(1.5, pct)}%"></span>` +
		`<i class="dq-tick" style="left:${DOC_BANDS.crit}%"></i><i class="dq-tick" style="left:${DOC_BANDS.warn}%"></i></div>` +
		// The status as its icon beside the rate (the legend above names the
		// three icons), rather than a full chip repeated on every row.
		`<div class="dq-slot-v" title="${HEALTH_LABEL[h]}"><b><span class="dq-ic ${h}">${HEALTH_ICON[h]}</span>${pct}%</b><small>${fmtNum(ok)} / ${fmtNum(s.needed)}</small></div>`;
	row.addEventListener('mousemove', (evt) =>
		showTooltip(
			evt.clientX,
			evt.clientY,
			`<div class="tt-title">${esc(s.label)}</div>` +
				`<div class="tt-row">Right first time<span class="tt-val">${pct}%</span></div>` +
				`<div class="tt-row">Candidates who needed it<span class="tt-val">${fmtNum(s.needed)}</span></div>` +
				`<div class="tt-row">Sent a usable copy<span class="tt-val">${fmtNum(ok)}</span></div>` +
				`<div class="tt-row">Asked to re-upload or missing<span class="tt-val">${fmtNum(s.needed - ok)}</span></div>`
		)
	);
	row.addEventListener('mouseleave', hideTooltip);
	return row;
}

function scoreColumns(histogram: { bucket: string; n: number }[]): HTMLElement {
	const total = histogram.reduce((a, b) => a + b.n, 0);
	const max = Math.max(1, ...histogram.map((b) => b.n));
	const wrap = document.createElement('div');
	wrap.className = 'dq-cols';
	histogram.forEach((b) => {
		const lo = parseInt(b.bucket, 10);
		const h: Health = lo < 60 ? 'crit' : lo < 80 ? 'warn' : 'good';
		const col = document.createElement('div');
		col.className = `dq-col ${h}`;
		col.tabIndex = 0;
		const share = total ? Math.round((b.n / total) * 100) : 0;
		col.setAttribute('aria-label', `Score ${b.bucket}: ${b.n} documents, ${share}%`);
		col.innerHTML =
			`<span class="dq-col-v">${fmtNum(b.n)}</span>` +
			`<span class="dq-col-track"><span class="dq-col-bar" style="height:${b.n ? Math.max(3, (b.n / max) * 100) : 0}%"></span></span>` +
			`<span class="dq-col-k">${b.bucket}</span>`;
		col.addEventListener('mousemove', (evt) =>
			showTooltip(
				evt.clientX,
				evt.clientY,
				`<div class="tt-title">Score ${b.bucket}</div><div class="tt-row">Documents<span class="tt-val">${fmtNum(b.n)}</span></div><div class="tt-row">Share<span class="tt-val">${share}%</span></div>`
			)
		);
		col.addEventListener('mouseleave', hideTooltip);
		wrap.appendChild(col);
	});
	return wrap;
}

function mismatchRows(rows: { company: string; rate: number; total: number }[]): HTMLElement {
	const sorted = [...rows].sort((a, b) => b.rate - a.rate);
	// Scale to the data, with a 10% floor so a set of tiny rates does not
	// fill the track and look alarming. (This used to be a fixed 30% cap,
	// which drew any higher rate straight off the edge of the card.)
	const top = Math.max(10, ...sorted.map((r) => r.rate));
	const wrap = document.createElement('div');
	wrap.className = 'dq-mm';
	sorted.forEach((r, i) => {
		const mism = Math.round((r.rate / 100) * r.total);
		const worst = i === 0 && r.rate > 0 && sorted.length > 1;
		const row = document.createElement('div');
		row.className = 'dq-mm-row' + (worst ? ' worst' : '');
		row.tabIndex = 0;
		row.setAttribute('aria-label', `${r.company}: ${r.rate}% mismatch, ${mism} of ${r.total} verifications`);
		row.innerHTML =
			`<span class="dq-mm-name" title="${esc(r.company)}">${esc(r.company)}</span>` +
			`<span class="dq-mm-track"><span class="dq-mm-bar" style="width:${r.rate ? Math.max(1.5, (r.rate / top) * 100) : 0}%"></span></span>` +
			`<span class="dq-mm-v"><b>${r.rate}%</b><small>${fmtNum(mism)} / ${fmtNum(r.total)}</small></span>` +
			(worst ? `<span class="dq-chip crit">${HEALTH_ICON.crit}Highest</span>` : '<span></span>');
		row.addEventListener('mousemove', (evt) =>
			showTooltip(
				evt.clientX,
				evt.clientY,
				`<div class="tt-title">${esc(r.company)}</div><div class="tt-row">Mismatch rate<span class="tt-val">${r.rate}%</span></div><div class="tt-row">Mismatches<span class="tt-val">${fmtNum(mism)}</span></div><div class="tt-row">Verifications<span class="tt-val">${fmtNum(r.total)}</span></div>`
			)
		);
		row.addEventListener('mouseleave', hideTooltip);
		wrap.appendChild(row);
	});
	return wrap;
}

export function renderDocsTab(container: HTMLElement, docSlots: DocSlotStat[], verification: VerificationStats) {
	hideTooltip();
	// Status colours as literals from the theme palette, for the CSS to use.
	container.style.setProperty('--dq-good', ST.good);
	container.style.setProperty('--dq-warn', ST.warn);
	container.style.setProperty('--dq-crit', ST.crit);
	const sorted = docSlots.filter((s) => s.rate != null).sort((a, b) => (a.rate as number) - (b.rate as number) || b.needed - a.needed);
	const totalVerified = verification.histogram.reduce((a, b) => a + b.n, 0);
	const passing = verification.histogram.filter((h) => parseInt(h.bucket, 10) >= 80).reduce((a, b) => a + b.n, 0);
	const passRate = totalVerified ? Math.round((passing / totalVerified) * 100) : null;

	// Right first time across every mandatory slot, weighted by how many
	// candidates needed each — a slot nobody needed does not move the figure.
	const mand = sorted.filter((s) => s.mandatory);
	const needAll = mand.reduce((a, s) => a + s.needed, 0);
	const okAll = mand.reduce((a, s) => a + ((s.rate as number) / 100) * s.needed, 0);
	const firstTime = needAll ? Math.round((okAll / needAll) * 100) : null;
	const attention = sorted.filter((s) => healthOf(s.rate as number) === 'crit');
	const worstCo = [...verification.mismatchByCompany].sort((a, b) => b.rate - a.rate)[0];

	const tile = (h: Health | 'none', k: string, v: string, sub: string) =>
		`<div class="dq-tile ${h}"><div class="dq-tile-k">${k}</div><div class="dq-tile-v">${v}</div><div class="dq-tile-sub">${sub}</div></div>`;

	container.innerHTML =
		'<div class="dq-tiles">' +
		tile(firstTime == null ? 'none' : healthOf(firstTime), 'Right first time', firstTime == null ? '—' : firstTime + '%',
			firstTime == null ? 'No mandatory documents yet' : `across ${fmtNum(needAll)} required uploads`) +
		tile(passRate == null ? 'none' : healthOf(passRate), 'OCR pass rate', passRate == null ? '—' : passRate + '%',
			passRate == null ? 'No cross-checks run yet' : `${fmtNum(passing)} of ${fmtNum(totalVerified)} scored 80+`) +
		tile(attention.length ? 'crit' : sorted.length ? 'good' : 'none', 'Need attention', String(attention.length),
			attention.length ? `document${attention.length === 1 ? '' : 's'} below ${DOC_BANDS.crit}% right first time` : sorted.length ? 'Every document is at 65% or better' : 'Nothing uploaded yet') +
		tile(worstCo && worstCo.rate >= 10 ? 'crit' : worstCo ? 'good' : 'none', 'Highest mismatch', worstCo ? worstCo.rate + '%' : '—',
			worstCo ? esc(worstCo.company) : 'Not enough data yet') +
		'</div>' +
		'<div class="an-split" style="margin-top:12px">' +
		'<div class="chart-card">' +
		'<div class="chart-card-head"><span class="chart-title">Which documents hold candidates up</span>' +
		`<span class="dq-legend">${healthChip('crit')}<span>under ${DOC_BANDS.crit}%</span>${healthChip('warn')}<span>${DOC_BANDS.crit}–${DOC_BANDS.warn - 1}%</span>${healthChip('good')}<span>${DOC_BANDS.warn}%+</span></span></div>` +
		'<div class="chart-note">Of the candidates who needed each document, the share who sent a usable copy without being asked to re-upload. Worst first; the two ticks on each bar mark 65% and 80%.</div>' +
		(sorted.length ? '<div class="dq-slots" id="dqSlots"></div>' : '<div class="dq-empty">No documents uploaded yet in this range.</div>') +
		'</div>' +
		'<div class="an-stack">' +
		'<div class="chart-card">' +
		'<div class="chart-card-head"><span class="chart-title">OCR verification scores</span>' +
		(passRate != null ? `<span class="dq-hero"><b>${passRate}%</b> scored 80 or above</span>` : '') +
		'</div>' +
		'<div class="chart-note">How closely each cross-checked document (Aadhaar, PAN, 10th and 12th marksheets) matched what the candidate typed in.</div>' +
		(totalVerified ? '<div id="dqScores"></div>' : '<div class="dq-empty">No verifications run yet in this range.</div>') +
		'</div>' +
		'<div class="chart-card">' +
		'<div class="chart-card-head"><span class="chart-title">Mismatch rate by company</span></div>' +
		'<div class="chart-note">Share of each company’s verifications that came back as a mismatch, not just flagged for review. Highest first.</div>' +
		(verification.mismatchByCompany.length ? '<div id="dqMismatch"></div>' : '<div class="dq-empty">Not enough data yet.</div>') +
		'</div>' +
		'</div>' +
		'</div>';

	if (sorted.length) {
		const list = container.querySelector<HTMLElement>('#dqSlots')!;
		const FIRST = 10;
		sorted.slice(0, FIRST).forEach((s) => list.appendChild(docSlotRow(s)));
		if (sorted.length > FIRST) {
			const more = document.createElement('button');
			more.type = 'button';
			more.className = 'dq-more';
			more.textContent = `Show all ${sorted.length} documents`;
			more.addEventListener('click', () => {
				sorted.slice(FIRST).forEach((s) => list.insertBefore(docSlotRow(s), more));
				more.remove();
			});
			list.appendChild(more);
		}
	}
	if (totalVerified) container.querySelector('#dqScores')!.appendChild(scoreColumns(verification.histogram));
	if (verification.mismatchByCompany.length) container.querySelector('#dqMismatch')!.appendChild(mismatchRows(verification.mismatchByCompany));
}

// ============================================================
// Breakdown tab
// ============================================================
export interface BreakdownRow {
	company: string;
	tracks: { track: string; label: string; n: number }[];
	total: number;
}
export interface AdminWorkloadRow {
	email: string;
	reviewed: number;
	avgLatencyDays: number | null;
}
export interface ConversionRates {
	offerLetterConversion: number | null;
	physicalItemConversion: number | null;
}

// The company × track grid as an HTML table rather than a fixed-size SVG: full
// names (ellipsised with a title, never truncated mid-word by a glyph
// estimate), row and column totals, and colours from theme tokens instead of
// hard-coded white overlays that vanished on the light theme.
//
// Volume is magnitude, so it is one hue, light to dark — a sequential ramp.
// The indigo is the funnel's own end colour, so the tabs read as one set. A
// gentle power scale (0.8) keeps one very large cell from washing every other
// cell out, while still leaving the busiest cells clearly the deepest.
const HEAT_HUE = { dark: '#7048e8', light: '#6d28d9' };

function heatTable(rows: BreakdownRow[]): HTMLElement {
	// Tracks nobody in this filter is on would only add a column of zeros.
	const cols = (rows[0]?.tracks ?? [])
		.map((t, i) => ({ ...t, i, total: rows.reduce((a, r) => a + r.tracks[i].n, 0) }))
		.filter((c) => c.total > 0);
	const grand = rows.reduce((a, r) => a + r.total, 0);
	const maxCell = Math.max(1, ...rows.flatMap((r) => cols.map((c) => r.tracks[c.i].n)));
	const maxRow = Math.max(1, ...rows.map((r) => r.total));

	const wrap = document.createElement('div');
	wrap.className = 'bd-scroll';
	wrap.style.setProperty('--rows', String(rows.length));
	const table = document.createElement('table');
	table.className = 'bd-heat';
	table.style.setProperty('--hm', HEAT_HUE[currentTheme()]);
	table.innerHTML =
		'<thead><tr><th class="bd-corner" scope="col">Company</th>' +
		cols.map((c) => `<th scope="col" data-col="${c.i}" title="${esc(c.label)}">${esc(c.label)}</th>`).join('') +
		'<th scope="col" class="bd-tot-h">Total</th></tr></thead>' +
		'<tbody>' +
		rows
			.map(
				(r, ri) =>
					`<tr data-row="${ri}"><th scope="row" class="bd-co" title="${esc(r.company)}">${esc(r.company)}</th>` +
					cols
						.map((c) => {
							const n = r.tracks[c.i].n;
							const k = n ? 6 + 94 * Math.pow(n / maxCell, 0.8) : 0;
							return `<td class="bd-cell${k > 50 ? ' hot' : ''}${n ? '' : ' zero'}" data-col="${c.i}" data-n="${n}" style="--k:${k.toFixed(1)}%">${n ? fmtNum(n) : '·'}</td>`;
						})
						.join('') +
					`<td class="bd-tot"><span class="bd-tot-bar" style="width:${(r.total / maxRow) * 100}%"></span><b>${fmtNum(r.total)}</b></td></tr>`
			)
			.join('') +
		'</tbody>' +
		'<tfoot><tr><th scope="row" class="bd-co">All companies</th>' +
		cols.map((c) => `<td data-col="${c.i}">${fmtNum(c.total)}<small>${grand ? Math.round((c.total / grand) * 100) : 0}%</small></td>`).join('') +
		`<td class="bd-tot"><b>${fmtNum(grand)}</b></td></tr></tfoot>`;

	// The company rows share whatever height the card gives the grid (CSS sizes
	// the wrapper, not the table), between the 36px floor and a height where a
	// cell stops reading as a cell. A table hands all of its extra height to
	// one row on its own, so the share is set here.
	const fit = () => {
		const head = table.tHead?.offsetHeight ?? 0, foot = table.tFoot?.offsetHeight ?? 0;
		const free = wrap.clientHeight - head - foot - 3 * (rows.length + 3);
		const h = Math.max(36, Math.min(120, Math.floor(free / Math.max(1, rows.length))));
		table.style.setProperty('--row-h', `${h}px`);
	};
	if (typeof ResizeObserver !== 'undefined') new ResizeObserver(fit).observe(wrap);

	// Crosshair: hovering a cell lights its row and its column, and the
	// tooltip says what share of each that cell is.
	const clear = () => table.querySelectorAll('.x-row,.x-col').forEach((n) => n.classList.remove('x-row', 'x-col'));
	table.querySelectorAll<HTMLTableCellElement>('td.bd-cell').forEach((td) => {
		td.addEventListener('mousemove', (evt) => {
			clear();
			const tr = td.parentElement as HTMLTableRowElement;
			tr.classList.add('x-row');
			table.querySelectorAll(`[data-col="${td.dataset.col}"]`).forEach((n) => n.classList.add('x-col'));
			const r = rows[Number(tr.dataset.row)];
			const c = cols.find((x) => String(x.i) === td.dataset.col)!;
			const n = Number(td.dataset.n);
			showTooltip(
				evt.clientX,
				evt.clientY,
				`<div class="tt-title">${esc(r.company)} · ${esc(c.label)}</div>` +
					`<div class="tt-row">Candidates<span class="tt-val">${fmtNum(n)}</span></div>` +
					`<div class="tt-row">Share of ${esc(r.company)}<span class="tt-val">${r.total ? Math.round((n / r.total) * 100) : 0}%</span></div>` +
					`<div class="tt-row">Share of ${esc(c.label)}<span class="tt-val">${c.total ? Math.round((n / c.total) * 100) : 0}%</span></div>`
			);
		});
	});
	table.addEventListener('mouseleave', () => {
		clear();
		hideTooltip();
	});
	wrap.appendChild(table);
	return wrap;
}

/** A ring gauge at a fixed pixel size — a circle must never be stretched. */
function ringGauge(label: string, pct: number | null, detail: string): string {
	if (pct == null)
		return `<div class="bd-gauge none"><div class="bd-ring"><span class="bd-ring-v">—</span></div><div class="bd-gauge-k">${label}</div><div class="bd-gauge-sub">Not enough data yet</div></div>`;
	// Thresholds kept from the meters this replaces: 75 and up is good, 55–74
	// is worth watching, below 55 needs attention.
	const h: Health = pct >= 75 ? 'good' : pct >= 55 ? 'warn' : 'crit';
	const r = 34, c = 2 * Math.PI * r;
	return (
		`<div class="bd-gauge ${h}">` +
		`<div class="bd-ring"><svg width="88" height="88" viewBox="0 0 88 88" aria-hidden="true">` +
		`<circle cx="44" cy="44" r="${r}" fill="none" class="bd-ring-track" stroke-width="8"/>` +
		// No arc at all at 0%: a zero-length arc with round caps still draws a dot.
		(pct > 0 ? `<circle cx="44" cy="44" r="${r}" fill="none" class="bd-ring-fill" stroke-width="8" stroke-linecap="round" stroke-dasharray="${((pct / 100) * c).toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 44 44)"/>` : '') +
		`</svg><span class="bd-ring-v">${pct}%</span></div>` +
		`<div class="bd-gauge-k">${label}</div>` +
		`<div class="bd-gauge-sub">${detail}</div>` +
		healthChip(h) +
		`</div>`
	);
}

function workloadList(rows: AdminWorkloadRow[]): HTMLElement {
	const total = rows.reduce((a, r) => a + r.reviewed, 0);
	const max = Math.max(1, ...rows.map((r) => r.reviewed));
	const wrap = document.createElement('div');
	wrap.className = 'bd-team';
	rows.forEach((a, i) => {
		const local = a.email.split('@')[0];
		const name = local.split(/[._-]+/).filter(Boolean).map((w) => w[0].toUpperCase() + w.slice(1)).join(' ') || a.email;
		const ini = name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
		const share = total ? Math.round((a.reviewed / total) * 100) : 0;
		// The avatar colour follows the person, not their rank, so it stays put
		// when the order changes.
		const hue = [...a.email].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7) % 4;
		// Review speed, labelled in words as well as colour: within a day is
		// quick, up to three days is steady, beyond that is slow.
		const lat = a.avgLatencyDays;
		const h: Health | null = lat == null ? null : lat <= 1 ? 'good' : lat <= 3 ? 'warn' : 'crit';
		const speed = h ? `<span class="dq-chip ${h}">${HEALTH_ICON[h]}${lat!.toFixed(1)}d · ${h === 'good' ? 'Quick' : h === 'warn' ? 'Steady' : 'Slow'}</span>` : '<span class="bd-muted">No timing yet</span>';
		const row = document.createElement('div');
		row.className = 'bd-mate';
		row.innerHTML =
			`<span class="bd-rank">${i + 1}</span>` +
			`<span class="bd-av" style="--a:${trendColor(hue)}">${esc(ini)}</span>` +
			`<span class="bd-who"><b>${esc(name)}</b><small>${esc(a.email)}</small></span>` +
			`<span class="bd-load"><span class="bd-load-track"><span class="bd-load-bar" style="width:${(a.reviewed / max) * 100}%"></span></span>` +
			`<span class="bd-load-v"><b>${fmtNum(a.reviewed)}</b><small>${share}% of reviews</small></span></span>` +
			speed;
		wrap.appendChild(row);
	});
	return wrap;
}

export function renderBreakdownTab(container: HTMLElement, breakdown: BreakdownRow[], adminWorkload: AdminWorkloadRow[], conversion: ConversionRates) {
	hideTooltip();
	container.style.setProperty('--dq-good', ST.good);
	container.style.setProperty('--dq-warn', ST.warn);
	container.style.setProperty('--dq-crit', ST.crit);
	const grand = breakdown.reduce((a, r) => a + r.total, 0);
	const top = breakdown[0];

	container.innerHTML =
		'<div class="an-split">' +
		'<div class="chart-card">' +
		'<div class="chart-card-head"><span class="chart-title">Volume by company and track</span>' +
		(top ? `<span class="dq-hero"><b>${fmtNum(grand)}</b> candidates · ${esc(top.company)} leads with ${grand ? Math.round((top.total / grand) * 100) : 0}%</span>` : '') +
		'</div>' +
		'<div class="chart-note">Candidates in the selected period. Deeper colour is more volume; hover a cell to see its share of the company and of the track.</div>' +
		(breakdown.length ? '<div id="bdHeat"></div>' : '<div class="dq-empty">No candidates in this range.</div>') +
		'</div>' +
		'<div class="an-stack">' +
		'<div class="chart-card">' +
		'<div class="chart-card-head"><span class="chart-title">Who is carrying the review queue</span></div>' +
		'<div class="chart-note">Approvals per admin in this period, and how long each takes on average from submission to decision.</div>' +
		(adminWorkload.length ? '<div id="bdTeam"></div>' : '<div class="dq-empty">No reviews recorded in this range.</div>') +
		'</div>' +
		'<div class="chart-card">' +
		'<div class="chart-card-head"><span class="chart-title">Conversion rates</span></div>' +
		'<div class="chart-note">How much of each hand-off has actually gone out or come back.</div>' +
		'<div class="bd-gauges">' +
		ringGauge('Offer letters sent', conversion.offerLetterConversion, 'of drafted offer letters') +
		ringGauge('Physical items received', conversion.physicalItemConversion, 'of handover items asked for') +
		'</div>' +
		'</div>' +
		'</div>' +
		'</div>';

	if (breakdown.length) container.querySelector('#bdHeat')!.appendChild(heatTable(breakdown));
	if (adminWorkload.length) container.querySelector('#bdTeam')!.appendChild(workloadList(adminWorkload));
}

// ============================================================
// Knowledge Graph tab — Company -> Track -> DocSlot
// ============================================================
export interface GraphNodeData {
	id: string;
	label: string;
	kind: 'company' | 'track' | 'slot';
	rate?: number | null;
}
export interface GraphEdgeData {
	a: string;
	b: string;
	/** Candidates on a company → track link. */
	n?: number;
}

const SEVERITY_COLOR: Record<Severity, string> = { critical: ST.crit, warning: ST.warn, info: ST.info, good: ST.good };
const SEVERITY_TAG_LABEL: Record<Severity, string> = { critical: 'Critical', warning: 'Watch', info: 'Info', good: 'Healthy' };

function findingsListHTML(findings: Finding[]): string {
	if (findings.length === 0) {
		return '<li style="border-left-color:' + TXT.faint + '">Not enough data yet in this range to surface a finding.</li>';
	}
	return findings
		.map((f) => {
			const color = SEVERITY_COLOR[f.severity];
			return (
				`<li style="border-left-color:${color}">` +
				`<div class="finding-meta"><span class="finding-tag" style="color:${color};border-color:${color}">${SEVERITY_TAG_LABEL[f.severity]}</span><span class="finding-category">${f.category}</span></div>` +
				`<div class="finding-text">${f.text}</div>` +
				'</li>'
			);
		})
		.join('');
}

// The graph is drawn as a flow, not a force simulation: companies on the left,
// the tracks they hire for in the middle, the documents each track requires on
// the right. The data has exactly that shape, so a layered layout shows it
// without the old simulation's failure mode — nodes settling on top of each
// other and labels colliding in the middle. Every name is always visible, and
// rows are ordered to keep crossings down: tracks sit near the companies that
// hire for them, documents near the tracks that need them.
//
// Company → track links are as thick as the candidates on them. Track →
// document links are requirements, not volumes, so they are all one weight,
// coloured by the document's health (with an icon and a word wherever the
// health is named, never colour alone).
type KgNode = GraphNodeData & { x: number; y: number; total: number };

const KG_ROW = 30;
const KG_TOP = 44;
const KG_BOTTOM = 16;

function kgClip(label: string, maxPx: number, fontPx: number): string {
	const max = Math.max(3, Math.floor(maxPx / (fontPx * 0.56)));
	return label.length <= max ? label : label.slice(0, max - 1).trimEnd() + '…';
}

function kgHealth(rate: number | null | undefined): Health {
	return healthOf(rate ?? 100);
}

export function renderGraphTab(container: HTMLElement, graph: { nodes: GraphNodeData[]; edges: GraphEdgeData[] }, insightsInput: InsightsInput) {
	hideTooltip();
	if (graph.nodes.length === 0) {
		container.innerHTML = '<div class="chart-card"><div class="dq-empty">No candidates in this range — nothing to map yet.</div></div>';
		return;
	}
	container.style.setProperty('--dq-good', ST.good);
	container.style.setProperty('--dq-warn', ST.warn);
	container.style.setProperty('--dq-crit', ST.crit);

	const nodes: KgNode[] = graph.nodes.map((n) => ({ ...n, x: 0, y: 0, total: 0 }));
	const byId = new Map(nodes.map((n) => [n.id, n]));
	const edges = graph.edges.filter((e) => byId.has(e.a) && byId.has(e.b));
	const nbrs = new Map<string, Set<string>>(nodes.map((n) => [n.id, new Set()]));
	for (const e of edges) {
		nbrs.get(e.a)!.add(e.b);
		nbrs.get(e.b)!.add(e.a);
		if (e.n) {
			byId.get(e.a)!.total += e.n;
			byId.get(e.b)!.total += e.n;
		}
	}
	const ofKind = (k: GraphNodeData['kind']) => nodes.filter((n) => n.kind === k);
	const companies = ofKind('company').sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
	const tracks = ofKind('track');
	const slots = ofKind('slot');

	// Order each column by the average row of what it connects to on its left
	// (a barycentre pass), which is what keeps the links from criss-crossing.
	const rank = new Map<string, number>();
	companies.forEach((n, i) => rank.set(n.id, i));
	const bary = (n: KgNode, left: KgNode[]) => {
		const ids = [...nbrs.get(n.id)!].filter((id) => left.some((l) => l.id === id));
		return ids.length ? ids.reduce((a, id) => a + rank.get(id)!, 0) / ids.length : Infinity;
	};
	tracks.sort((a, b) => bary(a, companies) - bary(b, companies) || b.total - a.total);
	tracks.forEach((n, i) => rank.set(n.id, i * (companies.length / Math.max(1, tracks.length))));
	slots.sort((a, b) => bary(a, tracks) - bary(b, tracks) || (a.rate ?? 100) - (b.rate ?? 100));

	/** Everything on a path through this node: for a company, its tracks and
	 *  those tracks' documents; for a document, its tracks and their companies. */
	function related(id: string): Set<string> {
		const n = byId.get(id)!;
		const out = new Set([id]);
		const add = (ids: Iterable<string>, kind: GraphNodeData['kind']) => {
			const got: string[] = [];
			for (const x of ids) if (byId.get(x)!.kind === kind && !out.has(x)) { out.add(x); got.push(x); }
			return got;
		};
		if (n.kind === 'company') add(add(nbrs.get(id)!, 'track').flatMap((t) => [...nbrs.get(t)!]), 'slot');
		else if (n.kind === 'track') { add(nbrs.get(id)!, 'company'); add(nbrs.get(id)!, 'slot'); }
		else add(add(nbrs.get(id)!, 'track').flatMap((t) => [...nbrs.get(t)!]), 'company');
		return out;
	}

	const findings = computeFindings(insightsInput);
	const crit = slots.filter((s) => kgHealth(s.rate) === 'crit').length;
	const warn = slots.filter((s) => kgHealth(s.rate) === 'warn').length;
	const good = slots.length - crit - warn;
	const chip = (tier: Health | 'all', label: string, n?: number) =>
		`<button type="button" class="kg-filter${tier === 'all' ? ' on' : ''}" data-tier="${tier}" aria-pressed="${tier === 'all'}">` +
		(tier === 'all' ? '' : HEALTH_ICON[tier]) + label + (n === undefined ? '' : ` <b>${n}</b>`) + '</button>';

	container.innerHTML =
		'<div class="chart-card kg-card">' +
		'<div class="chart-card-head"><span class="chart-title">How onboarding connects</span>' +
		`<span class="kg-stats"><b>${companies.length}</b> compan${companies.length === 1 ? 'y' : 'ies'} · <b>${tracks.length}</b> track${tracks.length === 1 ? '' : 's'} · <b>${slots.length}</b> document${slots.length === 1 ? '' : 's'}</span></div>` +
		'<div class="chart-note">Each company links to the tracks it is hiring for (thicker means more candidates), and each track to the documents it requires. Hover anything to trace its path; click to pin it and read the details below.</div>' +
		`<div class="kg-filters" role="group" aria-label="Highlight documents by health">${chip('all', 'Everything')}${chip('crit', 'Needs attention', crit)}${chip('warn', 'Watch', warn)}${chip('good', 'Healthy', good)}</div>` +
		'<div class="kg-scroll"><div class="kg-plot" id="kgPlot"></div></div>' +
		'</div>' +
		'<div class="chart-grid kg-below" style="margin-top:14px">' +
		'<div class="chart-card"><div class="chart-card-head"><span class="chart-title">Details</span></div><div id="graphExplain"></div></div>' +
		'<div class="chart-card">' +
		'<div class="chart-card-head"><span class="chart-title">What this is telling you</span></div>' +
		'<div class="chart-note">Fixed rules against the real numbers in this filter, worst first. No AI, nothing to re-run.</div>' +
		`<ul class="insight-list">${findingsListHTML(findings)}</ul>` +
		'</div>' +
		'</div>';

	const explain = container.querySelector<HTMLElement>('#graphExplain')!;
	let pinned: string | null = null;
	let hover: string | null = null;
	let tier: Health | 'all' = 'all';
	let svg: SVGSVGElement | null = null;

	function focusSet(): Set<string> | null {
		const id = hover ?? pinned;
		if (id) return related(id);
		if (tier === 'all') return null;
		const out = new Set<string>();
		for (const s of slots) if (kgHealth(s.rate) === tier) related(s.id).forEach((x) => out.add(x));
		return out;
	}
	function paint() {
		if (!svg) return;
		const set = focusSet();
		svg.classList.toggle('kg-focus', !!set);
		svg.querySelectorAll<SVGGElement>('[data-node]').forEach((g) => {
			g.classList.toggle('lit', !!set && set.has(g.dataset.node!));
			g.classList.toggle('pinned', g.dataset.node === pinned);
		});
		svg.querySelectorAll<SVGPathElement>('[data-a]').forEach((p) => p.classList.toggle('lit', !!set && set.has(p.dataset.a!) && set.has(p.dataset.b!)));
	}
	function select(id: string | null) {
		pinned = id;
		explainKg(explain, id ? byId.get(id)! : null, byId, nbrs);
		paint();
	}

	const host = container.querySelector<HTMLElement>('#kgPlot')!;
	responsive(host, (width) => {
		const W = Math.max(680, width);
		const rows = Math.max(companies.length, tracks.length, slots.length, 3);
		const H = KG_TOP + rows * KG_ROW + KG_BOTTOM;
		// Side columns sized to their longest name (within limits), so names are
		// cut only when they truly cannot fit.
		const longest = (col: KgNode[]) => Math.max(0, ...col.map((n) => n.label.length));
		const xC = Math.round(Math.min(280, Math.max(150, 40 + longest(companies) * 7)));
		const right = Math.round(Math.min(340, Math.max(220, 90 + longest(slots) * 6.6)));
		const xS = W - right, xT = Math.round((xC + xS) / 2);
		const place = (col: KgNode[], x: number) => {
			const step = (H - KG_TOP - KG_BOTTOM) / Math.max(1, col.length);
			col.forEach((n, i) => { n.x = x; n.y = KG_TOP + step * (i + 0.5); });
		};
		place(companies, xC);
		place(tracks, xT);
		place(slots, xS);

		const s = el('svg', { width: W, height: H, viewBox: `0 0 ${W} ${H}`, class: 'kg-svg', role: 'img', 'aria-label': 'Companies, the tracks they hire for, and the documents each track requires' });
		[['Companies', xC, 'end'], ['Tracks', xT, 'middle'], ['Documents', xS, 'start']].forEach(([t, x, anchor]) => {
			const h = el('text', { x: Number(x) + (anchor === 'end' ? 12 : anchor === 'start' ? -12 : 0), y: 16, 'text-anchor': String(anchor), class: 'kg-col' });
			h.textContent = String(t);
			s.appendChild(h);
		});

		// Links first, so nodes and labels sit on top of them.
		const maxN = Math.max(1, ...edges.map((e) => e.n ?? 0));
		const links = el('g');
		for (const e of edges) {
			const a = byId.get(e.a)!, b = byId.get(e.b)!;
			const [l, r] = a.x <= b.x ? [a, b] : [b, a];
			const mx = (l.x + r.x) / 2;
			const toSlot = r.kind === 'slot';
			const color = toSlot ? ST[kgHealth(r.rate)] : SERIES[0];
			links.appendChild(
				el('path', {
					d: `M${l.x},${l.y} C${mx},${l.y} ${mx},${r.y} ${r.x},${r.y}`,
					fill: 'none',
					stroke: color,
					'stroke-width': e.n ? (2 + 10 * (e.n / maxN)).toFixed(1) : 1.4,
					class: 'kg-link' + (toSlot ? '' : ' flow'),
					'data-a': e.a,
					'data-b': e.b
				})
			);
		}
		s.appendChild(links);

		const nodeG = el('g');
		const maxT = Math.max(1, ...nodes.map((n) => n.total));
		for (const n of nodes) {
			const g = el('g', { 'data-node': n.id, class: `kg-node ${n.kind}`, tabindex: 0, role: 'button' });
			const h = n.kind === 'slot' ? kgHealth(n.rate) : null;
			const color = n.kind === 'company' ? SERIES[0] : n.kind === 'track' ? SERIES[2] : ST[h!];
			const r = n.kind === 'slot' ? 6 : 7 + 5 * Math.sqrt(n.total / maxT);
			g.appendChild(el('circle', { cx: n.x, cy: n.y, r: r + 7, class: 'kg-halo', fill: color }));
			g.appendChild(el('circle', { cx: n.x, cy: n.y, r, fill: color, stroke: SURFACE(), 'stroke-width': 2.5, class: 'kg-dot' }));
			if (n.kind === 'company') {
				const t = el('text', { x: n.x - r - 10, y: n.y - 1, 'text-anchor': 'end', class: 'kg-name' });
				t.textContent = kgClip(n.label, xC - r - 18, 12.5);
				const sub = el('text', { x: n.x - r - 10, y: n.y + 12, 'text-anchor': 'end', class: 'kg-sub' });
				sub.textContent = `${fmtNum(n.total)} candidate${n.total === 1 ? '' : 's'}`;
				g.append(t, sub);
				g.setAttribute('aria-label', `${n.label}, company, ${n.total} candidates`);
			} else if (n.kind === 'track') {
				// A pill behind the track name, so it reads cleanly over the links.
				const label = `${n.label} · ${fmtNum(n.total)}`;
				const w = label.length * 6.7 + 18;
				g.appendChild(el('rect', { x: n.x - w / 2, y: n.y - r - 26, width: w, height: 19, rx: 9.5, class: 'kg-pill' }));
				const t = el('text', { x: n.x, y: n.y - r - 13, 'text-anchor': 'middle', class: 'kg-name track' });
				t.textContent = label;
				g.appendChild(t);
				g.setAttribute('aria-label', `${n.label}, track, ${n.total} candidates`);
			} else {
				const pct = n.rate == null ? '—' : n.rate + '%';
				const t = el('text', { x: n.x + 14, y: n.y + 4, class: 'kg-name' });
				t.textContent = kgClip(n.label, W - xS - 82, 12);
				const v = el('text', { x: W - 8, y: n.y + 4, 'text-anchor': 'end', class: `kg-rate ${h}` });
				v.textContent = (h === 'crit' ? '⚠ ' : '') + pct;
				g.append(t, v);
				g.setAttribute('aria-label', `${n.label}, document, ${pct} right first time, ${HEALTH_LABEL[h!]}`);
			}
			const title = el('title');
			title.textContent = n.label;
			g.appendChild(title);
			g.addEventListener('mouseenter', () => { hover = n.id; paint(); });
			g.addEventListener('mouseleave', () => { hover = null; paint(); });
			g.addEventListener('focus', () => { hover = n.id; paint(); });
			g.addEventListener('blur', () => { hover = null; paint(); });
			g.addEventListener('click', (ev) => { ev.stopPropagation(); select(pinned === n.id ? null : n.id); });
			g.addEventListener('keydown', (ev) => {
				if (ev.key === 'Enter' || ev.key === ' ') { ev.preventDefault(); select(pinned === n.id ? null : n.id); }
				if (ev.key === 'Escape') select(null);
			});
			nodeG.appendChild(g);
		}
		s.appendChild(nodeG);
		s.addEventListener('click', () => select(null));
		host.replaceChildren(s);
		svg = s;
		paint();
	});

	container.querySelectorAll<HTMLButtonElement>('.kg-filter').forEach((b) =>
		b.addEventListener('click', () => {
			tier = b.dataset.tier as Health | 'all';
			container.querySelectorAll<HTMLButtonElement>('.kg-filter').forEach((x) => {
				const on = x === b;
				x.classList.toggle('on', on);
				x.setAttribute('aria-pressed', String(on));
			});
			pinned = null;
			explainKg(explain, null, byId, nbrs);
			paint();
		})
	);
	explainKg(explain, null, byId, nbrs);
}

function explainKg(box: HTMLElement, n: KgNode | null, byId: Map<string, KgNode>, nbrs: Map<string, Set<string>>) {
	if (!n) {
		box.innerHTML =
			'<div class="explain-empty">Click a company, a track or a document in the map to pin it here. Hovering traces its path without pinning.</div>';
		return;
	}
	const linked = (kind: GraphNodeData['kind']) => [...nbrs.get(n.id)!].map((id) => byId.get(id)!).filter((x) => x.kind === kind);
	const list = (items: KgNode[], fmt: (x: KgNode) => string) =>
		items.length ? '<ul class="kg-list">' + items.map((x) => `<li>${fmt(x)}</li>`).join('') + '</ul>' : '<p class="kg-none">None in this filter.</p>';
	const rateLi = (x: KgNode) => {
		const h = kgHealth(x.rate);
		return `<span>${esc(x.label)}</span><span class="dq-chip ${h}">${HEALTH_ICON[h]}${x.rate ?? '—'}%</span>`;
	};
	let html = '';
	if (n.kind === 'company') {
		const tracks = linked('track');
		html =
			`<div class="explain-head"><span class="explain-dot" style="background:${SERIES[0]}"></span>${esc(n.label)} <span class="explain-kind">company</span></div>` +
			`<p><strong>${fmtNum(n.total)}</strong> candidate${n.total === 1 ? '' : 's'} across <strong>${tracks.length}</strong> track${tracks.length === 1 ? '' : 's'}.</p>` +
			list(tracks.sort((a, b) => b.total - a.total), (t) => `<span>${esc(t.label)}</span><b>${fmtNum(t.total)}</b>`);
	} else if (n.kind === 'track') {
		const docs = linked('slot').sort((a, b) => (a.rate ?? 100) - (b.rate ?? 100));
		const cos = linked('company');
		const worst = docs[0];
		html =
			`<div class="explain-head"><span class="explain-dot" style="background:${SERIES[2]}"></span>${esc(n.label)} <span class="explain-kind">track</span></div>` +
			`<p><strong>${fmtNum(n.total)}</strong> candidate${n.total === 1 ? '' : 's'} from ${cos.length} compan${cos.length === 1 ? 'y' : 'ies'}, each asked for <strong>${docs.length}</strong> documents.` +
			(worst && kgHealth(worst.rate) !== 'good' ? ` The one most likely to hold them up is <strong>${esc(worst.label)}</strong>, right first time only ${worst.rate}% of the time.` : '') +
			'</p>' +
			list(docs, rateLi);
	} else {
		const h = kgHealth(n.rate);
		const verdict = h === 'crit' ? 'a real bottleneck — worth finding out why it fails so often' : h === 'warn' ? 'worth watching, but not urgent' : 'in good shape';
		html =
			`<div class="explain-head"><span class="explain-dot" style="background:${ST[h]}"></span>${esc(n.label)} <span class="explain-kind">document</span>${healthChip(h)}</div>` +
			`<p><strong>${n.rate ?? '—'}%</strong> of the candidates who needed this document sent a usable copy without being asked to re-upload. That makes it <strong>${verdict}</strong>.</p>` +
			'<div class="kg-list-k">Required on</div>' +
			list(linked('track'), (t) => `<span>${esc(t.label)}</span><b>${fmtNum(t.total)}</b>`);
	}
	box.innerHTML = html;
}
