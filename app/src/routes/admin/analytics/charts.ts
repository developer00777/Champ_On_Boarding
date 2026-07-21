// Client-only chart rendering for /admin/analytics. Plain DOM/SVG/Canvas, no
// charting library — dynamically imported from +page.svelte so this never
// ships in the SSR bundle. Palette validated against the Aegis dark surface
// (#171430) with scripts/validate_palette.js from the dataviz skill: all
// eight categorical hues pass lightness band, chroma floor, CVD separation
// (adjacent 8.4 protan / 8.7 tritan), normal-vision floor (19.3), contrast.
const SERIES = ['#3987e5', '#199e70', '#9085e9', '#d95926', '#c98500', '#d55181', '#e66767', '#6b7690'];
const ST = { good: '#3ecf9a', warn: '#f2b15c', crit: '#f07575', info: '#7ba7f0' };
const TXT = { primary: '#fafaf7', secondary: '#cbd1de', muted: '#8a91a5', faint: '#4b5160', mono: "'JetBrains Mono', ui-monospace, monospace" };
const SURFACE = '#171430';

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
	t.style.left = x + 14 + 'px';
	t.style.top = y + 14 + 'px';
	t.classList.add('show');
}
function hideTooltip() {
	tooltip().classList.remove('show');
}

function legendHTML(items: { color: string; label: string }[]): string {
	return items
		.map((it) => '<span class="legend-item"><span class="legend-swatch" style="background:' + it.color + '"></span>' + it.label + '</span>')
		.join('');
}

// ============================================================
// Trends tab — stacked area + line
// ============================================================
export interface TrendPoint {
	bucketStart: string;
	created: number;
	opened: number;
	submitted: number;
	approved: number;
}

type TrendNumericKey = 'created' | 'opened' | 'submitted' | 'approved';
function numAt(row: TrendPoint, key: TrendNumericKey): number {
	return row[key];
}

function bucketLabel(iso: string, bucket: string): string {
	const d = new Date(iso);
	if (bucket === 'week') return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
	if (bucket === 'month') return d.toLocaleDateString('en-IN', { month: 'short', year: '2-digit' });
	if (bucket === 'quarter') return 'Q' + (Math.floor(d.getMonth() / 3) + 1) + " '" + String(d.getFullYear()).slice(2);
	return String(d.getFullYear());
}

function lineChart(
	data: TrendPoint[],
	keys: TrendNumericKey[],
	colors: string[],
	opts: { keyLabels: string[]; xLabel: (i: number) => string }
): SVGSVGElement {
	const w = 620,
		h = 260,
		pad = { t: 14, r: 14, b: 26, l: 44 };
	const iw = w - pad.l - pad.r,
		ih = h - pad.t - pad.b;
	const svg = el('svg', { width: '100%', viewBox: `0 0 ${w} ${h}`, preserveAspectRatio: 'none', style: 'overflow:visible' });

	let maxVal = 0;
	keys.forEach((k) => data.forEach((d) => { if (numAt(d, k) > maxVal) maxVal = numAt(d, k); }));
	maxVal = Math.ceil(maxVal / 10) * 10 || 10;

	const ySteps = 4;
	for (let s = 0; s <= ySteps; s++) {
		const gy = pad.t + ih - (s / ySteps) * ih;
		svg.appendChild(el('line', { x1: pad.l, x2: pad.l + iw, y1: gy, y2: gy, class: 'axis-line' }));
		const lbl = el('text', { x: pad.l - 8, y: gy + 3, 'text-anchor': 'end', class: 'tick-label' });
		lbl.textContent = fmtNum(Math.round((maxVal * s) / ySteps));
		svg.appendChild(lbl);
	}

	const n = Math.max(data.length - 1, 1);
	const xAt = (i: number) => pad.l + (i / n) * iw;
	const yAt = (v: number) => pad.t + ih - (v / maxVal) * ih;

	const everyN = Math.max(1, Math.round(data.length / 8));
	data.forEach((_, i) => {
		if (i % everyN !== 0 && i !== data.length - 1) return;
		const t = el('text', { x: xAt(i), y: h - 6, 'text-anchor': 'middle', class: 'tick-label' });
		t.textContent = opts.xLabel(i);
		svg.appendChild(t);
	});

	keys.forEach((k, ki) => {
		const d = data.map((row, i) => (i === 0 ? 'M' : 'L') + xAt(i).toFixed(1) + ',' + yAt(numAt(row, k)).toFixed(1)).join(' ');
		svg.appendChild(el('path', { d, fill: 'none', stroke: colors[ki], 'stroke-width': '2', 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
	});

	const hitLayer = el('g');
	data.forEach((row, i) => {
		const hx = xAt(i);
		const hit = el('rect', { x: hx - iw / data.length / 2, y: pad.t, width: Math.max(4, iw / data.length), height: ih, fill: 'transparent', style: 'cursor:pointer' });
		hit.addEventListener('mousemove', (evt) => {
			svg.querySelectorAll('.crosshair,.hover-dot').forEach((nd) => nd.remove());
			svg.appendChild(el('line', { x1: hx, x2: hx, y1: pad.t, y2: pad.t + ih, class: 'crosshair', stroke: TXT.faint, 'stroke-width': '1' }));
			let rows = '';
			keys.forEach((k, ki) => {
				const cy = yAt(numAt(row, k));
				svg.appendChild(el('circle', { cx: hx, cy, r: '4', fill: colors[ki], stroke: SURFACE, 'stroke-width': '2', class: 'hover-dot' }));
				rows += `<div class="tt-row"><span class="tt-swatch" style="background:${colors[ki]}"></span>${opts.keyLabels[ki]}<span class="tt-val">${fmtNum(numAt(row, k))}</span></div>`;
			});
			showTooltip(evt.clientX, evt.clientY, `<div class="tt-title">${opts.xLabel(i)}</div>${rows}`);
		});
		hit.addEventListener('mouseleave', () => {
			svg.querySelectorAll('.crosshair,.hover-dot').forEach((nd) => nd.remove());
			hideTooltip();
		});
		hitLayer.appendChild(hit);
	});
	svg.appendChild(hitLayer);
	return svg;
}

function stackedAreaChart(data: TrendPoint[], keys: TrendNumericKey[], colors: string[], keyLabels: string[], xLabel: (i: number) => string): SVGSVGElement {
	const w = 620,
		h = 260,
		pad = { t: 14, r: 14, b: 26, l: 44 };
	const iw = w - pad.l - pad.r,
		ih = h - pad.t - pad.b;
	const svg = el('svg', { width: '100%', viewBox: `0 0 ${w} ${h}`, preserveAspectRatio: 'none', style: 'overflow:visible' });

	let maxTotal = 0;
	data.forEach((d) => {
		const t = keys.reduce((a, k) => a + numAt(d, k), 0);
		if (t > maxTotal) maxTotal = t;
	});
	maxTotal = Math.ceil(maxTotal / 10) * 10 || 10;

	const ySteps = 4;
	for (let s = 0; s <= ySteps; s++) {
		const gy = pad.t + ih - (s / ySteps) * ih;
		svg.appendChild(el('line', { x1: pad.l, x2: pad.l + iw, y1: gy, y2: gy, class: 'axis-line' }));
		const lbl = el('text', { x: pad.l - 8, y: gy + 3, 'text-anchor': 'end', class: 'tick-label' });
		lbl.textContent = fmtNum(Math.round((maxTotal * s) / ySteps));
		svg.appendChild(lbl);
	}

	const n = Math.max(data.length - 1, 1);
	const xAt = (i: number) => pad.l + (i / n) * iw;

	let cum = data.map(() => 0);
	keys.forEach((k, ki) => {
		const topPts = data.map((row, i) => {
			cum[i] += numAt(row, k);
			return [xAt(i), pad.t + ih - (cum[i] / maxTotal) * ih];
		});
		const baseline = cum.map((c, i) => pad.t + ih - ((c - numAt(data[i], k)) / maxTotal) * ih);
		let d = 'M' + topPts.map((p) => p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' L');
		for (let i = baseline.length - 1; i >= 0; i--) d += ' L' + xAt(i).toFixed(1) + ',' + baseline[i].toFixed(1);
		d += ' Z';
		svg.appendChild(el('path', { d, fill: colors[ki], opacity: '0.82' }));
	});
	cum = data.map(() => 0);
	keys.forEach((k) => {
		const pts = data.map((row, i) => {
			cum[i] += numAt(row, k);
			return [xAt(i), pad.t + ih - (cum[i] / maxTotal) * ih];
		});
		const d = pts.map((p, i) => (i === 0 ? 'M' : 'L') + p[0].toFixed(1) + ',' + p[1].toFixed(1)).join(' ');
		svg.appendChild(el('path', { d, fill: 'none', stroke: SURFACE, 'stroke-width': '2' }));
	});

	const everyN = Math.max(1, Math.round(data.length / 8));
	data.forEach((_, i) => {
		if (i % everyN !== 0 && i !== data.length - 1) return;
		const t = el('text', { x: xAt(i), y: h - 6, 'text-anchor': 'middle', class: 'tick-label' });
		t.textContent = xLabel(i);
		svg.appendChild(t);
	});

	const hitLayer = el('g');
	data.forEach((row, i) => {
		const hx = xAt(i);
		const hit = el('rect', { x: hx - iw / data.length / 2, y: pad.t, width: Math.max(4, iw / data.length), height: ih, fill: 'transparent', style: 'cursor:pointer' });
		hit.addEventListener('mousemove', (evt) => {
			let rows = '';
			keys.forEach((k, ki) => {
				rows += `<div class="tt-row"><span class="tt-swatch" style="background:${colors[ki]}"></span>${keyLabels[ki]}<span class="tt-val">${fmtNum(numAt(row, k))}</span></div>`;
			});
			showTooltip(evt.clientX, evt.clientY, `<div class="tt-title">${xLabel(i)}</div>${rows}`);
		});
		hit.addEventListener('mouseleave', hideTooltip);
		hitLayer.appendChild(hit);
	});
	svg.appendChild(hitLayer);
	return svg;
}

export function renderTrendsTab(container: HTMLElement, trend: TrendPoint[], bucket: string) {
	if (trend.length === 0) {
		container.innerHTML = '<div class="chart-card"><p class="muted">No data in this range.</p></div>';
		return;
	}
	container.innerHTML =
		'<div class="chart-grid wide">' +
		'<div class="chart-card">' +
		'<div class="chart-card-head"><span class="chart-title">Funnel volume over time</span><span class="legend" id="stackLegend"></span></div>' +
		`<div class="chart-note">Stacked — how many candidates were at each stage, per ${bucket}. Hover a column for exact counts.</div>` +
		'<div id="stackChart"></div>' +
		'</div>' +
		'<div class="chart-card">' +
		'<div class="chart-card-head"><span class="chart-title">Created vs. Approved</span><span class="legend" id="lineLegend"></span></div>' +
		'<div class="chart-note">The gap between the two lines is where candidates are currently sitting in review.</div>' +
		'<div id="lineChart"></div>' +
		'</div>' +
		'</div>';

	const stackKeys: TrendNumericKey[] = ['created', 'opened', 'submitted', 'approved'];
	const stackColors = [SERIES[0], SERIES[1], SERIES[2], ST.good];
	const stackLabels = ['Created', 'Opened', 'Submitted', 'Approved'];
	container.querySelector('#stackLegend')!.innerHTML = legendHTML(stackKeys.map((k, i) => ({ color: stackColors[i], label: stackLabels[i] })));
	container.querySelector('#stackChart')!.appendChild(stackedAreaChart(trend, stackKeys, stackColors, stackLabels, (i) => bucketLabel(trend[i].bucketStart, bucket)));

	container.querySelector('#lineLegend')!.innerHTML = legendHTML([
		{ color: SERIES[0], label: 'Created' },
		{ color: ST.good, label: 'Approved' }
	]);
	container.querySelector('#lineChart')!.appendChild(
		lineChart(trend, ['created', 'approved'], [SERIES[0], ST.good], {
			keyLabels: ['Created', 'Approved'],
			xLabel: (i) => bucketLabel(trend[i].bucketStart, bucket)
		})
	);
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

function funnelChart(stages: { label: string; value: number; color: string }[]): SVGSVGElement {
	const w = 560,
		rowH = 46,
		gap = 6,
		h = stages.length * (rowH + gap);
	const pad = { l: 130, r: 60 };
	const iw = w - pad.l - pad.r;
	const maxV = stages[0]?.value || 1;
	const svg = el('svg', { width: '100%', viewBox: `0 0 ${w} ${h}`, preserveAspectRatio: 'none', style: 'overflow:visible' });

	stages.forEach((s, i) => {
		const y = i * (rowH + gap);
		const barW = (s.value / maxV) * iw;
		const label = el('text', { x: pad.l - 10, y: y + rowH / 2 + 4, 'text-anchor': 'end', style: `font-size:12px;fill:${TXT.secondary}` });
		label.textContent = s.label;
		svg.appendChild(label);

		const bar = el('rect', { x: pad.l, y: y + 3, width: Math.max(4, barW), height: rowH - 6, rx: '6', fill: s.color, opacity: '0.88', style: 'cursor:pointer' });
		bar.addEventListener('mousemove', (evt) => {
			const pct = i === 0 ? 100 : Math.round((s.value / stages[0].value) * 100);
			const dropoff = i === 0 ? '' : `<div class="tt-row" style="margin-top:3px;color:${ST.crit}">Drop-off from prev.<span class="tt-val">${100 - Math.round((s.value / stages[i - 1].value || 1) * 100)}%</span></div>`;
			showTooltip(evt.clientX, evt.clientY, `<div class="tt-title">${s.label}</div><div class="tt-row">Candidates<span class="tt-val">${fmtNum(s.value)}</span></div><div class="tt-row">% of top<span class="tt-val">${pct}%</span></div>${dropoff}`);
		});
		bar.addEventListener('mouseleave', hideTooltip);
		svg.appendChild(bar);

		const valLabel = el('text', { x: pad.l + Math.max(4, barW) + 8, y: y + rowH / 2 + 4, style: `font-size:12px;font-family:${TXT.mono};fill:${TXT.primary};font-weight:600` });
		valLabel.textContent = fmtNum(s.value);
		svg.appendChild(valLabel);
	});
	return svg;
}

function stageDurationChart(sd: StageDurations): SVGSVGElement {
	const stages: { label: string; days: number | null; n: number }[] = [
		{ label: 'Sent → Opened', days: sd.sentToOpened, n: sd.sampleSizes.sentToOpened },
		{ label: 'Sent → Submitted', days: sd.sentToSubmitted, n: sd.sampleSizes.sentToSubmitted },
		{ label: 'Submitted → Approved', days: sd.submittedToApproved, n: sd.sampleSizes.submittedToApproved }
	];
	const w = 560,
		h = 150,
		pad = { t: 10, r: 60, b: 30, l: 160 };
	const rowH = 34,
		gap = 10;
	const iw = w - pad.l - pad.r;
	const known = stages.filter((s) => s.days != null).map((s) => s.days as number);
	const maxD = (known.length ? Math.max(...known) : 1) * 1.15;
	const svg = el('svg', { width: '100%', viewBox: `0 0 ${w} ${h}`, preserveAspectRatio: 'none', style: 'overflow:visible' });

	stages.forEach((s, i) => {
		const y = pad.t + i * (rowH + gap);
		const label = el('text', { x: pad.l - 10, y: y + rowH / 2 + 4, 'text-anchor': 'end', style: `font-size:11.5px;fill:${TXT.secondary}` });
		label.textContent = s.label;
		svg.appendChild(label);

		if (s.days == null) {
			const t = el('text', { x: pad.l + 6, y: y + rowH / 2 + 4, style: `font-size:11.5px;fill:${TXT.muted}` });
			t.textContent = 'Not enough data yet';
			svg.appendChild(t);
			return;
		}
		const barW = (s.days / maxD) * iw;
		const bar = el('rect', { x: pad.l, y: y + 4, width: Math.max(4, barW), height: rowH - 8, rx: '5', fill: ST.info, opacity: '0.85', style: 'cursor:pointer' });
		bar.addEventListener('mousemove', (evt) => {
			showTooltip(evt.clientX, evt.clientY, `<div class="tt-title">${s.label}</div><div class="tt-row">Median<span class="tt-val">${(s.days as number).toFixed(1)}d</span></div><div style="margin-top:4px;font-size:10.5px;color:${TXT.muted}">Based on ${s.n} candidate${s.n === 1 ? '' : 's'} with both timestamps recorded</div>`);
		});
		bar.addEventListener('mouseleave', hideTooltip);
		svg.appendChild(bar);

		const valLabel = el('text', { x: pad.l + Math.max(4, barW) + 8, y: y + rowH / 2 + 4, style: `font-size:11.5px;font-family:${TXT.mono};fill:${TXT.primary};font-weight:600` });
		valLabel.textContent = s.days.toFixed(1) + 'd';
		svg.appendChild(valLabel);
	});
	return svg;
}

export function renderFunnelTab(container: HTMLElement, funnel: FunnelData, stageDurations: StageDurations) {
	const stages = [
		{ label: 'Link sent', value: funnel.sent, color: SERIES[0] },
		{ label: 'Opened', value: funnel.opened, color: SERIES[1] },
		{ label: 'Submitted', value: funnel.submitted, color: SERIES[4] },
		{ label: 'Approved', value: funnel.approved, color: ST.good },
		{ label: 'Complete', value: funnel.complete, color: ST.info }
	];
	container.innerHTML =
		'<div class="chart-grid">' +
		'<div class="chart-card">' +
		'<div class="chart-card-head"><span class="chart-title">Funnel snapshot</span></div>' +
		'<div class="chart-note">All candidates in the selected filters, by how far they\'ve reached. Hover a bar for drop-off from the previous stage.</div>' +
		'<div id="funnelChart"></div>' +
		'</div>' +
		'<div class="chart-card">' +
		'<div class="chart-card-head"><span class="chart-title">Median time in stage</span></div>' +
		'<div class="chart-note">From real timestamps (Candidate.createdAt / submittedAt / reviewedAt, LinkToken.openedAt). Blank rows mean too few candidates have both timestamps yet.</div>' +
		'<div id="stageDurChart"></div>' +
		'</div>' +
		'</div>';
	container.querySelector('#funnelChart')!.appendChild(funnelChart(stages));
	container.querySelector('#stageDurChart')!.appendChild(stageDurationChart(stageDurations));
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

function hbarChart(rows: { label: string; value: number; note?: string }[], opts: { labelW?: number; max?: number } = {}): SVGSVGElement {
	const w = 560,
		rowH = 26,
		gap = 8,
		h = rows.length * (rowH + gap) + 10;
	const pad = { l: opts.labelW || 150, r: 46 };
	const iw = w - pad.l - pad.r;
	const svg = el('svg', { width: '100%', viewBox: `0 0 ${w} ${h}`, preserveAspectRatio: 'none', style: 'overflow:visible' });

	rows.forEach((r, i) => {
		const y = i * (rowH + gap);
		const barW = (r.value / (opts.max || 100)) * iw;
		const label = el('text', { x: pad.l - 10, y: y + rowH / 2 + 4, 'text-anchor': 'end', style: `font-size:11px;fill:${TXT.secondary}` });
		label.textContent = r.label;
		svg.appendChild(label);

		const color = r.value < 65 ? ST.crit : r.value < 80 ? ST.warn : ST.good;
		const bar = el('rect', { x: pad.l, y: y + 3, width: Math.max(3, barW), height: rowH - 6, rx: '4', fill: color, opacity: '0.85', style: 'cursor:pointer' });
		bar.addEventListener('mousemove', (evt) => {
			showTooltip(evt.clientX, evt.clientY, `<div class="tt-title">${r.label}</div><div class="tt-row">Value<span class="tt-val">${r.value}%</span></div>` + (r.note ? `<div style="margin-top:3px;font-size:10.5px;color:${TXT.muted}">${r.note}</div>` : ''));
		});
		bar.addEventListener('mouseleave', hideTooltip);
		svg.appendChild(bar);

		const valLabel = el('text', { x: pad.l + Math.max(3, barW) + 7, y: y + rowH / 2 + 4, style: `font-size:11px;font-family:${TXT.mono};fill:${TXT.primary};font-weight:600` });
		valLabel.textContent = r.value + '%';
		svg.appendChild(valLabel);
	});
	return svg;
}

function verificationHistogram(histogram: { bucket: string; n: number }[]): SVGSVGElement {
	const w = 560,
		h = 200,
		pad = { t: 10, r: 14, b: 30, l: 40 };
	const iw = w - pad.l - pad.r,
		ih = h - pad.t - pad.b;
	const maxC = Math.max(...histogram.map((b) => b.n), 1) * 1.1;
	const svg = el('svg', { width: '100%', viewBox: `0 0 ${w} ${h}`, preserveAspectRatio: 'none', style: 'overflow:visible' });

	const ySteps = 4;
	for (let s = 0; s <= ySteps; s++) {
		const gy = pad.t + ih - (s / ySteps) * ih;
		svg.appendChild(el('line', { x1: pad.l, x2: pad.l + iw, y1: gy, y2: gy, class: 'axis-line' }));
		const lbl = el('text', { x: pad.l - 8, y: gy + 3, 'text-anchor': 'end', class: 'tick-label' });
		lbl.textContent = fmtNum(Math.round((maxC * s) / ySteps));
		svg.appendChild(lbl);
	}

	const slotW = iw / histogram.length;
	const barW = Math.min(24, slotW * 0.55);
	histogram.forEach((b, i) => {
		const cx = pad.l + slotW * i + slotW / 2;
		const barH = (b.n / maxC) * ih;
		const color = i < 2 ? ST.crit : i < 3 ? ST.warn : ST.good;
		const bar = el('rect', { x: cx - barW / 2, y: pad.t + ih - barH, width: barW, height: barH, rx: '4', fill: color, opacity: '0.85', style: 'cursor:pointer' });
		bar.addEventListener('mousemove', (evt) => {
			showTooltip(evt.clientX, evt.clientY, `<div class="tt-title">Score ${b.bucket}</div><div class="tt-row">Documents<span class="tt-val">${fmtNum(b.n)}</span></div>`);
		});
		bar.addEventListener('mouseleave', hideTooltip);
		svg.appendChild(bar);
		const t = el('text', { x: cx, y: h - 8, 'text-anchor': 'middle', class: 'tick-label' });
		t.textContent = b.bucket;
		svg.appendChild(t);
	});
	return svg;
}

export function renderDocsTab(container: HTMLElement, docSlots: DocSlotStat[], verification: VerificationStats) {
	const sorted = docSlots.filter((s) => s.rate != null).sort((a, b) => (a.rate as number) - (b.rate as number));
	const hasVerification = verification.histogram.some((h) => h.n > 0);

	container.innerHTML =
		'<div class="chart-grid wide">' +
		'<div class="chart-card">' +
		'<div class="chart-card-head"><span class="chart-title">Which document blocks completion most often</span></div>' +
		'<div class="chart-note">% of candidates who needed this document and supplied a usable copy without a re-upload request, lowest first.</div>' +
		(sorted.length ? '<div id="slotChart"></div>' : '<p class="muted">No documents uploaded yet in this range.</p>') +
		'</div></div>' +
		'<div class="chart-grid" style="margin-top:14px">' +
		'<div class="chart-card">' +
		'<div class="chart-card-head"><span class="chart-title">OCR verification score distribution</span></div>' +
		'<div class="chart-note">Verification.score across all cross-checked documents (Aadhaar, PAN, 10th/12th marksheets).</div>' +
		(hasVerification ? '<div id="vHist"></div>' : '<p class="muted">No verifications run yet in this range.</p>') +
		'</div>' +
		'<div class="chart-card">' +
		'<div class="chart-card-head"><span class="chart-title">Mismatch rate by company</span></div>' +
		'<div class="chart-note">Share of verifications landing status = mismatch, not just review.</div>' +
		(verification.mismatchByCompany.length ? '<div id="mismatchChart"></div>' : '<p class="muted">Not enough data yet.</p>') +
		'</div>' +
		'</div>';

	if (sorted.length) {
		container.querySelector('#slotChart')!.appendChild(
			hbarChart(
				sorted.map((s) => ({ label: s.label, value: s.rate as number, note: s.mandatory ? undefined : 'Optional slot' })),
				{ labelW: 190 }
			)
		);
	}
	if (hasVerification) container.querySelector('#vHist')!.appendChild(verificationHistogram(verification.histogram));
	if (verification.mismatchByCompany.length) {
		container.querySelector('#mismatchChart')!.appendChild(
			hbarChart(
				verification.mismatchByCompany.map((r) => ({ label: r.company, value: r.rate })),
				{ labelW: 150, max: 30 }
			)
		);
	}
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

function heatmap(rows: BreakdownRow[]): SVGSVGElement {
	const cellW = 62,
		cellH = 30,
		labelW = 170,
		labelH = 26;
	const trackLabels = rows[0]?.tracks.map((t) => t.label) ?? [];
	const w = labelW + cellW * trackLabels.length + 10;
	const h = labelH + cellH * rows.length + 10;
	const svg = el('svg', { width: '100%', viewBox: `0 0 ${w} ${h}`, preserveAspectRatio: 'none', style: 'overflow:visible' });

	const maxV = Math.max(...rows.flatMap((r) => r.tracks.map((t) => t.n)), 1);

	trackLabels.forEach((label, ti) => {
		const tx = labelW + ti * cellW + cellW / 2;
		const lbl = el('text', { x: tx, y: 16, 'text-anchor': 'middle', class: 'tick-label' });
		lbl.textContent = label;
		svg.appendChild(lbl);
	});

	rows.forEach((row, ci) => {
		const ly = labelH + ci * cellH + cellH / 2 + 4;
		const lbl = el('text', { x: labelW - 10, y: ly, 'text-anchor': 'end', style: `font-size:11px;fill:${TXT.secondary}` });
		lbl.textContent = row.company;
		svg.appendChild(lbl);

		row.tracks.forEach((t, ti) => {
			const t01 = t.n / maxV;
			const alpha = t.n > 0 ? (0.12 + t01 * 0.78).toFixed(2) : '0.04';
			const x = labelW + ti * cellW,
				y = labelH + ci * cellH;
			const cell = el('rect', { x: x + 1, y: y + 1, width: cellW - 2, height: cellH - 2, rx: '5', fill: SERIES[0], opacity: alpha, style: 'cursor:pointer' });
			cell.addEventListener('mousemove', (evt) => {
				showTooltip(evt.clientX, evt.clientY, `<div class="tt-title">${row.company} · ${t.label}</div><div class="tt-row">Candidates<span class="tt-val">${t.n}</span></div>`);
			});
			cell.addEventListener('mouseleave', hideTooltip);
			svg.appendChild(cell);
			if (t.n > 0) {
				const vt = el('text', { x: x + cellW / 2, y: y + cellH / 2 + 4, 'text-anchor': 'middle', style: `font-size:11px;font-family:${TXT.mono};fill:${t01 > 0.5 ? TXT.primary : TXT.secondary};pointer-events:none` });
				vt.textContent = String(t.n);
				svg.appendChild(vt);
			}
		});
	});
	return svg;
}

function meterRow(label: string, pct: number | null): string {
	if (pct == null) return `<div><div style="font-size:12px;color:${TXT.muted}">${label} — not enough data yet</div></div>`;
	const color = pct >= 75 ? ST.good : pct >= 55 ? ST.warn : ST.crit;
	return (
		`<div><div style="display:flex;justify-content:space-between;font-size:12px;color:${TXT.secondary};margin-bottom:6px"><span>${label}</span><span style="font-family:${TXT.mono};font-weight:700;color:${TXT.primary}">${pct}%</span></div>` +
		`<div style="height:8px;border-radius:5px;background:rgba(255,255,255,0.07);overflow:hidden"><div style="height:100%;width:${pct}%;background:${color};border-radius:5px"></div></div></div>`
	);
}

export function renderBreakdownTab(container: HTMLElement, breakdown: BreakdownRow[], adminWorkload: AdminWorkloadRow[], conversion: ConversionRates) {
	container.innerHTML =
		'<div class="chart-grid wide">' +
		'<div class="chart-card">' +
		'<div class="chart-card-head"><span class="chart-title">Volume by company × track</span></div>' +
		'<div class="chart-note">Candidate count in the selected period. Darker = more volume.</div>' +
		(breakdown.length ? '<div id="heatmapChart" style="overflow-x:auto"></div>' : '<p class="muted">No candidates in this range.</p>') +
		'</div></div>' +
		'<div class="chart-grid" style="margin-top:14px">' +
		'<div class="chart-card">' +
		'<div class="chart-card-head"><span class="chart-title">Admin review workload</span></div>' +
		'<div class="chart-note">Who is carrying the review queue.</div>' +
		(adminWorkload.length ? '<div id="adminTable"></div>' : '<p class="muted">No reviews recorded in this range.</p>') +
		'</div>' +
		'<div class="chart-card">' +
		'<div class="chart-card-head"><span class="chart-title">Conversion rates</span></div>' +
		'<div class="chart-note">Offer letters and physical handover items, draft/pending → done.</div>' +
		'<div style="display:flex;flex-direction:column;gap:16px;margin-top:6px">' +
		meterRow('Offer letter: draft → sent', conversion.offerLetterConversion) +
		meterRow('Physical items received', conversion.physicalItemConversion) +
		'</div>' +
		'</div>' +
		'</div>';

	if (breakdown.length) container.querySelector('#heatmapChart')!.appendChild(heatmap(breakdown));
	if (adminWorkload.length) {
		let tbl = `<table style="width:100%;border-collapse:collapse;font-size:12px"><thead><tr style="text-align:left;color:${TXT.muted};font-family:${TXT.mono};font-size:10px;text-transform:uppercase;letter-spacing:0.05em"><th style="padding:6px 8px;border-bottom:1px solid rgba(255,255,255,0.1)">Admin</th><th style="padding:6px 8px;border-bottom:1px solid rgba(255,255,255,0.1);text-align:right">Reviewed</th><th style="padding:6px 8px;border-bottom:1px solid rgba(255,255,255,0.1);text-align:right">Avg latency</th></tr></thead><tbody>`;
		adminWorkload.forEach((a) => {
			tbl += `<tr><td style="padding:8px;border-bottom:1px solid rgba(255,255,255,0.05);font-family:${TXT.mono};font-size:11px;color:${TXT.secondary}">${a.email}</td><td style="padding:8px;border-bottom:1px solid rgba(255,255,255,0.05);text-align:right;font-variant-numeric:tabular-nums;font-weight:600;color:${TXT.primary}">${a.reviewed}</td><td style="padding:8px;border-bottom:1px solid rgba(255,255,255,0.05);text-align:right;font-variant-numeric:tabular-nums;color:${TXT.secondary}">${a.avgLatencyDays != null ? a.avgLatencyDays.toFixed(1) + 'd' : '—'}</td></tr>`;
		});
		tbl += '</tbody></table>';
		container.querySelector('#adminTable')!.innerHTML = tbl;
	}
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
}

interface SimNode extends GraphNodeData {
	r: number;
	x: number;
	y: number;
	vx: number;
	vy: number;
}
interface SimEdge {
	a: SimNode;
	b: SimNode;
	color: string;
}

function nodeColor(n: SimNode): string {
	if (n.kind === 'company') return SERIES[0];
	if (n.kind === 'track') return SERIES[2];
	const rate = n.rate ?? 100;
	if (rate < 65) return ST.crit;
	if (rate < 80) return ST.warn;
	return ST.good;
}

interface GraphSimState {
	running: boolean;
	canvas: HTMLCanvasElement | null;
	ctx: CanvasRenderingContext2D | null;
	dragging: SimNode | null;
	hoverNode: SimNode | null;
	dpr: number;
	kindFilter: { type: string; tier?: string } | null;
}

function nodeMatchesFilter(n: SimNode, filter: GraphSimState['kindFilter']): boolean {
	if (!filter) return true;
	if (filter.type === 'company') return n.kind === 'company';
	if (filter.type === 'track') return n.kind === 'track';
	if (filter.type === 'tier') {
		if (n.kind !== 'slot') return false;
		const rate = n.rate ?? 100;
		if (filter.tier === 'crit') return rate < 65;
		if (filter.tier === 'warn') return rate >= 65 && rate < 80;
		return rate >= 80;
	}
	return true;
}

function isNeighbor(a: SimNode, b: SimNode, edges: SimEdge[]): boolean {
	return edges.some((e) => (e.a === a && e.b === b) || (e.a === b && e.b === a));
}

/** Auto-generated, plain-English reading of the document satisfaction data —
 *  the same numbers driving the graph's node colors, restated as sentences. */
function graphInsights(slotNodes: SimNode[]): { tone: 'crit' | 'warn' | 'good'; html: string }[] {
	const mandatory = slotNodes.filter((n) => n.rate != null).sort((a, b) => (a.rate as number) - (b.rate as number));
	if (mandatory.length === 0) return [{ tone: 'good', html: 'Not enough document data yet in this range to surface a bottleneck.' }];
	const items: { tone: 'crit' | 'warn' | 'good'; html: string }[] = [];
	const worst = mandatory[0];
	items.push({
		tone: 'crit',
		html: `<strong>${worst.label}</strong> is the biggest blocker right now — only <strong>${worst.rate}%</strong> of candidates who need it get it right on the first try. Everyone else needs a re-upload request, which is what actually slows a file down.`
	});
	if (mandatory[1] && (mandatory[1].rate as number) < 75 && mandatory[2]) {
		items.push({
			tone: 'warn',
			html: `<strong>${mandatory[1].label}</strong> and <strong>${mandatory[2].label}</strong> are also below the healthy range (${mandatory[1].rate}% and ${mandatory[2].rate}%) — worth a look if you're updating the instructions candidates see before uploading.`
		});
	}
	const healthyCount = mandatory.filter((n) => (n.rate as number) >= 80).length;
	items.push({ tone: 'good', html: `${healthyCount} of ${mandatory.length} document types are already healthy (80%+ first-try success) — no action needed there.` });
	return items;
}

export function renderGraphTab(container: HTMLElement, graph: { nodes: GraphNodeData[]; edges: GraphEdgeData[] }) {
	if (graph.nodes.length === 0) {
		container.innerHTML = '<div class="chart-card"><p class="muted">No candidates in this range — nothing to graph yet.</p></div>';
		return;
	}

	const simNodes: SimNode[] = graph.nodes.map((n) => ({
		...n,
		r: n.kind === 'company' ? 15 : n.kind === 'track' ? 12 : 7 + (100 - (n.rate ?? 100)) / 12,
		x: 0,
		y: 0,
		vx: 0,
		vy: 0
	}));
	const byId = new Map(simNodes.map((n) => [n.id, n]));
	const simEdges: SimEdge[] = graph.edges
		.map((e) => {
			const a = byId.get(e.a),
				b = byId.get(e.b);
			if (!a || !b) return null;
			let color = 'rgba(123,167,240,0.35)';
			if (b.kind === 'slot') color = (b.rate ?? 100) < 65 ? 'rgba(240,117,117,0.5)' : (b.rate ?? 100) < 80 ? 'rgba(242,177,92,0.4)' : 'rgba(62,207,154,0.28)';
			return { a, b, color };
		})
		.filter((e): e is SimEdge => e !== null);

	const companyNodes = simNodes.filter((n) => n.kind === 'company');
	const trackNodes = simNodes.filter((n) => n.kind === 'track');
	const slotNodes = simNodes.filter((n) => n.kind === 'slot');
	const cx = 300,
		cy = 210;
	companyNodes.forEach((n, i) => {
		const a = (i / (companyNodes.length || 1)) * Math.PI * 2;
		n.x = cx + Math.cos(a) * 210;
		n.y = cy + Math.sin(a) * 150;
	});
	trackNodes.forEach((n, i) => {
		const a = (i / (trackNodes.length || 1)) * Math.PI * 2;
		n.x = cx + Math.cos(a) * 90;
		n.y = cy + Math.sin(a) * 60;
	});
	slotNodes.forEach((n, i) => {
		const a = (i / (slotNodes.length || 1)) * Math.PI * 2;
		n.x = cx + Math.cos(a) * 260;
		n.y = cy + Math.sin(a) * 200;
	});

	const insights = graphInsights(slotNodes);
	const insightsHTML = insights
		.map((it) => {
			const color = it.tone === 'crit' ? ST.crit : it.tone === 'warn' ? ST.warn : ST.good;
			return `<li style="border-left-color:${color}">${it.html}</li>`;
		})
		.join('');

	container.innerHTML =
		'<div class="howto-strip">' +
		'<div class="howto-step"><span class="howto-num">1</span><div><strong>Circles are companies, tracks, and documents.</strong> Bigger and redder circles are documents more candidates get stuck on.</div></div>' +
		'<div class="howto-step"><span class="howto-num">2</span><div><strong>Lines show real requirements</strong> — which company hires for which track, and which track needs which document. Nothing here is decorative.</div></div>' +
		'<div class="howto-step"><span class="howto-num">3</span><div><strong>Click any circle</strong> to pin a plain-English explanation below. Drag to rearrange; it won\'t change the data.</div></div>' +
		'</div>' +
		'<div class="chart-grid" style="grid-template-columns: 2fr 1fr; align-items: start;">' +
		'<div class="chart-card">' +
		'<div class="chart-card-head"><span class="chart-title">Company → Track → Document requirement graph</span>' +
		'<span class="legend legend-filterable" id="graphLegend">' +
		`<button type="button" class="legend-item" data-filter-type="company"><span class="legend-swatch" style="background:${SERIES[0]}"></span>Company</button>` +
		`<button type="button" class="legend-item" data-filter-type="track"><span class="legend-swatch" style="background:${SERIES[2]}"></span>Track</button>` +
		`<button type="button" class="legend-item" data-filter-type="tier" data-filter-tier="good"><span class="legend-swatch" style="background:${ST.good}"></span>Document — healthy</button>` +
		`<button type="button" class="legend-item" data-filter-type="tier" data-filter-tier="warn"><span class="legend-swatch" style="background:${ST.warn}"></span>Document — watch</button>` +
		`<button type="button" class="legend-item" data-filter-type="tier" data-filter-tier="crit"><span class="legend-swatch" style="background:${ST.crit}"></span>Document — bottleneck</button>` +
		'</span></div>' +
		'<div class="chart-note">Every line is a real relationship from the document matrix (track → required document) or a hiring link (company → track). A bigger, redder document circle needs a re-upload more often — start there. <strong>Click a legend item</strong> to highlight just that group; click it again to clear.</div>' +
		'<div id="graphCanvasWrap" style="border-radius:10px;overflow:hidden;background:rgba(0,0,0,0.15)"></div>' +
		'</div>' +
		'<div style="display:flex;flex-direction:column;gap:12px">' +
		'<div class="chart-card">' +
		'<div class="chart-card-head"><span class="chart-title">Selected node</span></div>' +
		'<div id="graphExplain"><div class="explain-empty">Click any circle in the graph — a company, a track, or a document — to see a plain-English explanation here.</div></div>' +
		'</div>' +
		'<div class="chart-card">' +
		'<div class="chart-card-head"><span class="chart-title">What this is telling you</span></div>' +
		'<div class="chart-note">Read automatically off the graph — no interaction needed.</div>' +
		`<ul class="insight-list">${insightsHTML}</ul>` +
		'</div>' +
		'</div>' +
		'</div>';

	initGraphCanvas(container, simNodes, simEdges);
	wireLegendFilter(container);
}

function explainNode(container: HTMLElement, edges: SimEdge[], n: SimNode | null) {
	const box = container.querySelector('#graphExplain');
	if (!box) return;
	if (!n) {
		box.innerHTML = '<div class="explain-empty">Click any circle in the graph — a company, a track, or a document — to see a plain-English explanation here.</div>';
		return;
	}
	let html = '';
	if (n.kind === 'company') {
		const tracksFor = edges.filter((e) => (e.a === n || e.b === n) && (e.a.kind === 'track' || e.b.kind === 'track')).map((e) => (e.a === n ? e.b.label : e.a.label));
		html =
			`<div class="explain-head"><span class="explain-dot" style="background:${SERIES[0]}"></span>${n.label} <span class="explain-kind">— company</span></div>` +
			`<p>${n.label} currently recruits across <strong>${tracksFor.length} track${tracksFor.length === 1 ? '' : 's'}</strong>: ${tracksFor.join(', ') || 'none in this range'}. Each connected line below leads to the documents candidates on that track must submit.</p>`;
	} else if (n.kind === 'track') {
		const companiesFor = edges.filter((e) => (e.a === n || e.b === n) && (e.a.kind === 'company' || e.b.kind === 'company')).map((e) => (e.a === n ? e.b.label : e.a.label));
		const slotsFor = edges.filter((e) => (e.a === n || e.b === n) && (e.a.kind === 'slot' || e.b.kind === 'slot')).map((e) => (e.a === n ? e.b : e.a));
		const worstSlot = [...slotsFor].sort((a, b) => (a.rate ?? 100) - (b.rate ?? 100))[0];
		html =
			`<div class="explain-head"><span class="explain-dot" style="background:${SERIES[2]}"></span>${n.label} <span class="explain-kind">— track</span></div>` +
			`<p>Candidates on the <strong>${n.label}</strong> track need <strong>${slotsFor.length} documents</strong>, and are hired by ${companiesFor.length} compan${companiesFor.length === 1 ? 'y' : 'ies'} (${companiesFor.join(', ') || 'none in this range'}).` +
			(worstSlot ? ` The one most likely to slow this track down is <strong>${worstSlot.label}</strong>, satisfied on the first try only ${worstSlot.rate}% of the time.` : '') +
			'</p>';
	} else {
		const tracksUsing = edges.filter((e) => (e.a === n || e.b === n) && (e.a.kind === 'track' || e.b.kind === 'track')).map((e) => (e.a === n ? e.b.label : e.a.label));
		const rate = n.rate ?? 100;
		const verdict = rate < 65 ? 'a real bottleneck — worth a closer look at why it fails so often' : rate < 80 ? 'worth watching, but not urgent' : 'in good shape';
		const color = rate < 65 ? ST.crit : rate < 80 ? ST.warn : ST.good;
		html =
			`<div class="explain-head"><span class="explain-dot" style="background:${color}"></span>${n.label} <span class="explain-kind">— document</span></div>` +
			`<p><strong>${rate}%</strong> of candidates who needed this document supplied a usable copy without HR having to request a re-upload. Required for: ${tracksUsing.join(', ') || 'this track selection'}. That makes it <strong>${verdict}</strong>.</p>`;
	}
	box.innerHTML = html;
}

function wireLegendFilter(container: HTMLElement) {
	const sim = graphSimByContainer.get(container);
	if (!sim) return;
	sim.kindFilter = null;
	const legend = container.querySelector('#graphLegend');
	if (!legend) return;
	legend.querySelectorAll('.legend-item').forEach((btn) => {
		btn.addEventListener('click', () => {
			const type = (btn as HTMLElement).dataset.filterType;
			const tier = (btn as HTMLElement).dataset.filterTier;
			const isSame = sim.kindFilter && sim.kindFilter.type === type && sim.kindFilter.tier === tier;
			legend.querySelectorAll('.legend-item').forEach((b) => b.classList.remove('active'));
			if (isSame) {
				sim.kindFilter = null;
			} else {
				sim.kindFilter = { type: type as string, tier };
				btn.classList.add('active');
			}
		});
	});
}

const graphSimByContainer = new WeakMap<HTMLElement, GraphSimState>();

function initGraphCanvas(container: HTMLElement, nodes: SimNode[], edges: SimEdge[]) {
	const wrap = container.querySelector('#graphCanvasWrap') as HTMLElement;
	wrap.innerHTML = '';
	const canvas = document.createElement('canvas');
	canvas.style.width = '100%';
	canvas.style.height = '420px';
	canvas.style.display = 'block';
	canvas.style.cursor = 'grab';
	wrap.appendChild(canvas);

	const dpr = window.devicePixelRatio || 1;
	const rect = { width: wrap.clientWidth || 600, height: 420 };
	canvas.width = rect.width * dpr;
	canvas.height = rect.height * dpr;
	const ctx = canvas.getContext('2d')!;
	ctx.scale(dpr, dpr);

	const sim: GraphSimState = { running: true, canvas, ctx, dragging: null, hoverNode: null, dpr, kindFilter: null };
	graphSimByContainer.set(container, sim);

	function simTick() {
		for (let i = 0; i < nodes.length; i++) {
			for (let j = i + 1; j < nodes.length; j++) {
				const a = nodes[i],
					b = nodes[j];
				const dx = a.x - b.x,
					dy = a.y - b.y;
				const d2 = dx * dx + dy * dy || 0.01;
				const d = Math.sqrt(d2);
				const force = Math.min(600 / d2, 3);
				const fx = (dx / d) * force,
					fy = (dy / d) * force;
				a.vx += fx;
				a.vy += fy;
				b.vx -= fx;
				b.vy -= fy;
			}
		}
		edges.forEach((e) => {
			const dx = e.b.x - e.a.x,
				dy = e.b.y - e.a.y;
			const d = Math.sqrt(dx * dx + dy * dy) || 0.01;
			const target = e.a.kind === 'company' ? 130 : 95;
			const force = (d - target) * 0.012;
			const fx = (dx / d) * force,
				fy = (dy / d) * force;
			e.a.vx += fx;
			e.a.vy += fy;
			e.b.vx -= fx;
			e.b.vy -= fy;
		});
		const cx = canvas.width / dpr / 2,
			cy = canvas.height / dpr / 2;
		nodes.forEach((n) => {
			if (n === sim.dragging) return;
			n.vx += (cx - n.x) * 0.0025;
			n.vy += (cy - n.y) * 0.0025;
			n.vx *= 0.82;
			n.vy *= 0.82;
			n.x += n.vx;
			n.y += n.vy;
		});
	}

	function draw() {
		const w = canvas.width / dpr,
			h = canvas.height / dpr;
		ctx.clearRect(0, 0, w, h);
		const filterActive = !!sim.kindFilter;

		edges.forEach((e) => {
			const hoverDim = sim.hoverNode && sim.hoverNode !== e.a && sim.hoverNode !== e.b;
			const filterDim = filterActive && !nodeMatchesFilter(e.a, sim.kindFilter) && !nodeMatchesFilter(e.b, sim.kindFilter);
			const dim = hoverDim || filterDim;
			ctx.beginPath();
			ctx.moveTo(e.a.x, e.a.y);
			ctx.lineTo(e.b.x, e.b.y);
			ctx.strokeStyle = e.color;
			ctx.globalAlpha = dim ? 0.12 : 1;
			ctx.lineWidth = 1.2;
			ctx.stroke();
			ctx.globalAlpha = 1;
		});

		nodes.forEach((n) => {
			const hoverDim = sim.hoverNode && sim.hoverNode !== n && !isNeighbor(sim.hoverNode, n, edges);
			const filterDim = filterActive && !nodeMatchesFilter(n, sim.kindFilter);
			const dim = hoverDim || filterDim;
			ctx.globalAlpha = dim ? 0.2 : 1;
			ctx.beginPath();
			ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
			ctx.fillStyle = nodeColor(n);
			ctx.fill();
			ctx.lineWidth = filterActive && !dim ? 3 : 2;
			ctx.strokeStyle = filterActive && !dim ? TXT.primary : SURFACE;
			ctx.stroke();
			if (n.kind === 'company' || n.kind === 'track' || n === sim.hoverNode || (filterActive && !dim)) {
				ctx.globalAlpha = dim ? 0.25 : 1;
				ctx.fillStyle = TXT.primary;
				ctx.font = (n.kind === 'company' ? '600 ' : '500 ') + '10.5px Inter, sans-serif';
				ctx.textAlign = 'center';
				ctx.fillText(n.label, n.x, n.y + n.r + 12);
			}
			ctx.globalAlpha = 1;
		});
	}

	function loop() {
		if (!sim.running) return;
		simTick();
		draw();
		requestAnimationFrame(loop);
	}

	function toLocal(evt: MouseEvent) {
		const b = canvas.getBoundingClientRect();
		return { x: evt.clientX - b.left, y: evt.clientY - b.top };
	}
	function nodeAt(pt: { x: number; y: number }): SimNode | null {
		for (let i = nodes.length - 1; i >= 0; i--) {
			const n = nodes[i];
			const dx = n.x - pt.x,
				dy = n.y - pt.y;
			if (dx * dx + dy * dy <= (n.r + 4) * (n.r + 4)) return n;
		}
		return null;
	}

	let dragMoved = false;
	canvas.addEventListener('mousedown', (evt) => {
		const n = nodeAt(toLocal(evt));
		dragMoved = false;
		if (n) {
			sim.dragging = n;
			canvas.style.cursor = 'grabbing';
		}
	});
	window.addEventListener('mousemove', (evt) => {
		const pt = toLocal(evt);
		if (sim.dragging) {
			dragMoved = true;
			sim.dragging.x = pt.x;
			sim.dragging.y = pt.y;
			sim.dragging.vx = 0;
			sim.dragging.vy = 0;
		} else {
			const n = nodeAt(pt);
			sim.hoverNode = n;
			canvas.style.cursor = n ? 'pointer' : 'grab';
			if (n) {
				const extra =
					n.kind === 'slot'
						? `<div class="tt-row">Satisfaction rate<span class="tt-val">${n.rate}%</span></div>`
						: `<div class="tt-row">Connections<span class="tt-val">${edges.filter((e) => e.a === n || e.b === n).length}</span></div>`;
				showTooltip(evt.clientX, evt.clientY, `<div class="tt-title">${n.label} · ${n.kind}</div>${extra}<div style="margin-top:5px;font-size:10px;color:${TXT.muted}">Click to pin an explanation below</div>`);
			} else hideTooltip();
		}
	});
	window.addEventListener('mouseup', () => {
		if (sim.dragging) {
			sim.dragging = null;
			canvas.style.cursor = 'grab';
		}
	});
	canvas.addEventListener('click', (evt) => {
		if (dragMoved) return;
		explainNode(container, edges, nodeAt(toLocal(evt)));
	});
	canvas.addEventListener('mouseleave', () => {
		if (!sim.dragging) hideTooltip();
	});

	loop();
}
