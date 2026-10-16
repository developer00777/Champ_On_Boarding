<script lang="ts">
	import '$lib/styles/analytics-kit.css';
	import GlassSelect from '$lib/components/GlassSelect.svelte';
	import { onMount } from 'svelte';
	import { fillPeriods } from './periods';

	let { data } = $props();

	/** Filters are URL params, matching /admin/candidates — shareable, survives
	 *  a refresh, and the back button behaves the way an HR admin expects. */
	function href(patch: Record<string, string>): string {
		const p = new URLSearchParams();
		const next = {
			range: data.range,
			bucket: data.bucket,
			company: data.companyId ?? '',
			track: data.track ?? '',
			...patch
		};
		for (const [k, v] of Object.entries(next)) if (v) p.set(k, v);
		const q = p.toString();
		return q ? `?${q}` : '?';
	}

	let activeTab = $state('graph');
	const TABS = [
		{ key: 'graph', label: 'Knowledge Graph', icon: 'M6 3.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 1 1 0-5zM18 5.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 1 1 0-5zM10 15.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 1 1 0-5zM8.4 6.4l7.2 1.2M6.8 8.4l2.4 7.2M16.5 10l-5 5.8' },
		{ key: 'trends', label: 'Trends', icon: 'M3 17l5-5 4 4 8-9M15 7h5v5' },
		{ key: 'funnel', label: 'Funnel', icon: 'M3 4h18l-7 8v6l-4 2v-8L3 4z' },
		{ key: 'docs', label: 'Documents & Quality', icon: 'M7 3h7l5 5v13H7zM14 3v5h5M10 14l2 2 4-4' },
		{ key: 'breakdown', label: 'Breakdown', icon: 'M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z' }
	];

	let chartsMod: typeof import('./charts') | null = $state(null);
	let themeVersion = $state(0);
	onMount(() => {
		// Charts are SVG/Canvas with colors baked in at render time, not CSS —
		// the theme toggle (see admin/+layout.svelte) flips instantly with no
		// reload, so without this every chart stays stuck in whichever theme
		// was active on first render. Bump a counter so the $effect below
		// treats every non-active tab as stale too, and re-renders on revisit.
		const root = document.querySelector('.aegis');
		if (!root) return;
		const observer = new MutationObserver(() => {
			rendered = {};
			themeVersion++;
		});
		observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
		return () => observer.disconnect();
	});
	onMount(async () => {
		chartsMod = await import('./charts');
	});

	function fmtDelta(cur: number, prev: number): { text: string; up: boolean } {
		if (prev === 0) return { text: cur > 0 ? 'new' : '—', up: cur > 0 };
		const pct = ((cur - prev) / prev) * 100;
		return { text: (pct >= 0 ? '↑ ' : '↓ ') + Math.abs(Math.round(pct)) + '%', up: pct >= 0 };
	}

	// The server's series skips quiet periods, so "this week" and "versus last
	// week" are read from the filled calendar — otherwise they would compare
	// against whichever week last had activity.
	const periods = $derived(fillPeriods(data.trend, data.bucket));
	const trendLast = $derived(periods[periods.length - 1]);
	const trendPrev = $derived(periods[periods.length - 2]);
	const periodWord = $derived(data.bucket === 'week' ? 'this week' : 'this ' + data.bucket);

	type Kpi = { label: string; value: string | null; hint: string; delta: { text: string; up: boolean } | null; tone: string; icon: string };
	const kpis = $derived<Kpi[]>([
		{
			label: 'Onboarded',
			value: String(trendLast?.approved ?? 0),
			hint: periodWord,
			delta: trendLast && trendPrev ? fmtDelta(trendLast.approved, trendPrev.approved) : null,
			tone: 'verdant',
			icon: 'M20 6 9 17l-5-5'
		},
		{
			label: 'Links created',
			value: String(trendLast?.created ?? 0),
			hint: periodWord,
			delta: trendLast && trendPrev ? fmtDelta(trendLast.created, trendPrev.created) : null,
			tone: 'ember',
			icon: 'M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7'
		},
		{
			label: 'In pipeline now',
			value: String(Math.max(0, data.funnel.opened - data.funnel.approved - data.funnel.revoked)),
			hint: 'opened, not yet approved',
			delta: null,
			tone: 'azure',
			icon: 'M4 6h16M4 12h10M4 18h6'
		},
		{
			label: 'Time to submit',
			value: data.stageDurations.sentToSubmitted != null ? data.stageDurations.sentToSubmitted.toFixed(1) + 'd' : null,
			hint: 'median, link to form',
			delta: null,
			tone: 'amber',
			icon: 'M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z'
		},
		{
			label: 'HR review time',
			value: data.stageDurations.submittedToApproved != null ? data.stageDurations.submittedToApproved.toFixed(1) + 'd' : null,
			hint: 'median, form to approval',
			delta: null,
			tone: 'violet',
			icon: 'M9 11l3 3 8-8M20 12v7a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h9'
		},
		{
			label: 'Verification pass',
			value: passRate(),
			hint: 'OCR scored 80 or more',
			delta: null,
			tone: 'azure',
			icon: 'M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z'
		},
		{
			label: 'Acceptance rate',
			value: data.hiringDecision.acceptanceRate != null ? data.hiringDecision.acceptanceRate + '%' : null,
			hint: 'of decided candidates',
			delta: null,
			tone: 'verdant',
			icon: 'M7 11v9H4v-9zM7 11l4-8a2 2 0 0 1 2 2v4h6a2 2 0 0 1 2 2.3l-1.4 7A2 2 0 0 1 17.6 20H7'
		}
	]);

	/** Share of cross-checked documents scoring 80 or above, or null when none
	 *  have been checked (shown as "No data yet", never as "—%"). */
	function passRate(): string | null {
		const total = data.verification.histogram.reduce((a, b) => a + b.n, 0);
		if (total === 0) return null;
		const passing = data.verification.histogram
			.filter((h) => h.bucket === '80-89' || h.bucket === '90-100')
			.reduce((a, b) => a + b.n, 0);
		return Math.round((passing / total) * 100) + '%';
	}

	function tabKey(e: KeyboardEvent, i: number) {
		if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
		e.preventDefault();
		const next = TABS[(i + (e.key === 'ArrowRight' ? 1 : TABS.length - 1)) % TABS.length];
		activeTab = next.key;
		(document.getElementById('tab-' + next.key) as HTMLElement | null)?.focus();
	}

	// Chart containers are populated imperatively (see charts.ts) once the
	// canvas/svg module loads and the relevant tab is visible — mirrors how
	// the candidate-detail journey widget avoids re-deriving DOM from state.
	let graphEl: HTMLDivElement | undefined = $state();
	let trendsEl: HTMLDivElement | undefined = $state();
	let funnelEl: HTMLDivElement | undefined = $state();
	let docsEl: HTMLDivElement | undefined = $state();
	let breakdownEl: HTMLDivElement | undefined = $state();

	let rendered: Record<string, boolean> = {};

	$effect(() => {
		if (!chartsMod) return;
		// Read so a theme flip (see the MutationObserver above) re-runs this
		// effect and repaints whichever tab is currently open.
		void themeVersion;
		if (activeTab === 'graph' && graphEl) {
			chartsMod.renderGraphTab(graphEl, data.graph, {
				docSlots: data.docSlots,
				stageDurations: data.stageDurations,
				verification: data.verification,
				adminWorkload: data.adminWorkload,
				conversion: data.conversion,
				funnel: data.funnel
			});
		} else if (activeTab === 'trends' && trendsEl && !rendered.trends) {
			chartsMod.renderTrendsTab(trendsEl, data.trend, data.bucket);
			rendered.trends = true;
		} else if (activeTab === 'funnel' && funnelEl && !rendered.funnel) {
			chartsMod.renderFunnelTab(funnelEl, data.funnel, data.stageDurations, data.hiringDecision);
			rendered.funnel = true;
		} else if (activeTab === 'docs' && docsEl && !rendered.docs) {
			chartsMod.renderDocsTab(docsEl, data.docSlots, data.verification);
			rendered.docs = true;
		} else if (activeTab === 'breakdown' && breakdownEl && !rendered.breakdown) {
			chartsMod.renderBreakdownTab(breakdownEl, data.breakdown, data.adminWorkload, data.conversion);
			rendered.breakdown = true;
		}
	});
</script>

<!-- Title and filters share one row: the filters already say what the page
     covers, so there is no separate scope line or labelled filter box. -->
<header class="an-head">
	<div class="an-title">
		<h1 class="page-title"><span class="an-live" title="Live from the pipeline"></span>Onboarding Analytics</h1>
		<p class="an-sub">Where candidates are, what slows them down, and how each company and track is doing.</p>
	</div>

<div class="filterbar">
	<div class="seg" role="group" aria-label="Date range">
		{#each data.rangeOptions as opt}
			<a href={href({ range: opt.value })} class="seg-b" class:on={data.range === opt.value} data-sveltekit-noscroll>
				{opt.label}
			</a>
		{/each}
	</div>

	<div class="filter-select">
		<GlassSelect
			ariaLabel="Company"
			value={data.companyId ?? ''}
			options={[{ value: '', label: 'All companies' }, ...data.companies]}
			onChange={(v) => (window.location.href = href({ company: v }))}
		/>
	</div>

	<div class="filter-select">
		<GlassSelect
			ariaLabel="Track"
			value={data.track ?? ''}
			options={[{ value: '', label: 'All tracks' }, ...data.tracks]}
			onChange={(v) => (window.location.href = href({ track: v }))}
		/>
	</div>

	<div class="filter-select narrow" title="Group trends by">
		<GlassSelect
			ariaLabel="Group trends by"
			value={data.bucket}
			options={data.bucketOptions}
			onChange={(v) => (window.location.href = href({ bucket: v }))}
		/>
	</div>

	{#if data.companyId || data.track}
		<a href="?" class="clear">
			<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12" /></svg>
			Clear
		</a>
	{/if}
</div>
</header>

<div class="kpi-row">
	{#each kpis as k (k.label)}
		<div class="kpi-tile" style="--t: var(--ae-{k.tone}); --t-rgb: var(--ae-{k.tone}-rgb)" title="{k.label}: {k.hint}">
			<span class="kpi-ic"><svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={k.icon} /></svg></span>
			<div class="kpi-body">
				<span class="kpi-label">{k.label}</span>
				<div class="kpi-value-row">
					{#if k.value != null}
						<span class="kpi-value">{k.value}</span>
						{#if k.delta}
							<span class="kpi-delta" class:up={k.delta.up} class:down={!k.delta.up}>{k.delta.text}</span>
						{/if}
					{:else}
						<span class="kpi-none">No data yet</span>
					{/if}
				</div>
			</div>
		</div>
	{/each}
</div>

<div class="tabbar" role="tablist" aria-label="Analytics views">
	{#each TABS as t, i (t.key)}
		<button
			id="tab-{t.key}"
			class="tabbtn"
			class:on={activeTab === t.key}
			role="tab"
			aria-selected={activeTab === t.key}
			aria-controls="panel-{t.key}"
			tabindex={activeTab === t.key ? 0 : -1}
			onclick={() => (activeTab = t.key)}
			onkeydown={(e) => tabKey(e, i)}
		>
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={t.icon} /></svg>
			{t.label}
		</button>
	{/each}
</div>

<div class="tabpanel" id="panel-graph" role="tabpanel" aria-labelledby="tab-graph" class:on={activeTab === 'graph'} bind:this={graphEl}></div>
<div class="tabpanel" id="panel-trends" role="tabpanel" aria-labelledby="tab-trends" class:on={activeTab === 'trends'} bind:this={trendsEl}></div>
<div class="tabpanel" id="panel-funnel" role="tabpanel" aria-labelledby="tab-funnel" class:on={activeTab === 'funnel'} bind:this={funnelEl}></div>
<div class="tabpanel" id="panel-docs" role="tabpanel" aria-labelledby="tab-docs" class:on={activeTab === 'docs'} bind:this={docsEl}></div>
<div class="tabpanel" id="panel-breakdown" role="tabpanel" aria-labelledby="tab-breakdown" class:on={activeTab === 'breakdown'} bind:this={breakdownEl}></div>

{#if !chartsMod}
	<p class="muted" style="padding:24px;text-align:center">Loading charts…</p>
{/if}

<style>
	.an-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px 16px;
		flex-wrap: wrap;
		margin-bottom: 12px;
	}
	.an-title {
		min-width: 0;
	}
	.an-head .page-title {
		display: flex;
		align-items: center;
		gap: 9px;
		margin: 0;
	}
	.an-live {
		flex: none;
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--ae-verdant);
		box-shadow: 0 0 0 0 rgba(var(--ae-verdant-rgb), 0.5);
		animation: an-pulse 2.4s ease-out infinite;
	}
	@keyframes an-pulse {
		70% { box-shadow: 0 0 0 7px rgba(var(--ae-verdant-rgb), 0); }
		100% { box-shadow: 0 0 0 0 rgba(var(--ae-verdant-rgb), 0); }
	}
	.an-sub {
		margin: 2px 0 0;
		font-size: 12.5px;
		color: var(--ae-muted);
	}

	.filterbar {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
	}
	.seg {
		display: inline-flex;
		align-items: center;
		/* Same height as the dropdowns beside it. */
		height: 44px;
		box-sizing: border-box;
		background: var(--ae-modal-base);
		border: 1px solid var(--ae-line-strong);
		border-radius: 10px;
		padding: 3px;
		gap: 2px;
	}
	.seg-b {
		font-size: 12.5px;
		font-weight: 500;
		color: var(--ae-muted);
		padding: 6px 11px;
		border-radius: 7px;
		text-decoration: none;
		transition: background 0.12s, color 0.12s;
	}
	.seg-b:hover {
		color: var(--ae-text);
	}
	.seg-b.on {
		background: rgba(var(--ae-ember-rgb), 0.16);
		color: var(--ae-ember-glow);
		box-shadow: inset 0 0 0 1px rgba(var(--ae-ember-rgb), 0.35);
	}
	.filter-select {
		width: auto;
		min-width: 160px;
		font-size: 12.5px;
		font-weight: 500;
	}
	.filter-select.narrow {
		min-width: 110px;
		max-width: 130px;
	}
	.clear {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		padding: 6px 11px;
		border-radius: 999px;
		border: 1px solid rgba(var(--ae-ember-rgb), 0.35);
		color: var(--ae-ember-glow);
		font-weight: 500;
		font-size: 12px;
		text-decoration: none;
	}
	.clear:hover {
		background: rgba(var(--ae-ember-rgb), 0.12);
	}

	/* Compact tiles: the icon beside the number rather than above it, and the
	   explanation on the label line, so each tile is one short row. */
	/* Wrapping flex rather than a fixed grid: whatever the width, each row of
	   tiles stretches to fill it, so a short last row never leaves a gap. */
	.kpi-row {
		display: flex;
		flex-wrap: wrap;
		gap: 8px;
		margin-bottom: 12px;
	}
	/* Seven across when there is room, otherwise four then three, otherwise
	   two — set per width, because letting flex choose gives a lopsided 5 + 2. */
	.kpi-row > .kpi-tile {
		flex: 1 1 calc((100% - 48px) / 7);
		min-width: 0;
	}
	@media (max-width: 1450px) {
		.kpi-row > .kpi-tile {
			flex-basis: calc((100% - 24px) / 4);
		}
	}
	@media (max-width: 760px) {
		.kpi-row > .kpi-tile {
			flex-basis: calc((100% - 8px) / 2);
		}
	}
	.kpi-tile {
		position: relative;
		overflow: hidden;
		display: flex;
		align-items: center;
		gap: 10px;
		background: var(--ae-sub-bg);
		border: 1px solid var(--ae-line-strong);
		border-radius: 12px;
		padding: 9px 11px;
		transition: border-color 0.15s ease;
	}
	.kpi-tile:hover {
		border-color: rgba(var(--t-rgb), 0.5);
	}
	.kpi-ic {
		flex: none;
		width: 32px;
		height: 32px;
		border-radius: 9px;
		display: grid;
		place-items: center;
		color: var(--t);
		background: rgba(var(--t-rgb), 0.14);
	}
	.kpi-body {
		min-width: 0;
		flex: 1;
	}
	.kpi-label {
		display: block;
		font-size: 11px;
		font-weight: 500;
		color: var(--ae-text-2);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.kpi-value-row {
		display: flex;
		align-items: baseline;
		gap: 6px;
		min-height: 24px;
	}
	.kpi-value {
		font-family: var(--ae-font-display);
		font-size: 20px;
		font-weight: 700;
		line-height: 1.15;
		font-variant-numeric: tabular-nums;
		color: var(--ae-text);
	}
	.kpi-none {
		align-self: center;
		font-size: 11.5px;
		color: var(--ae-muted);
	}
	.kpi-delta {
		font-family: var(--ae-font-mono);
		font-size: 10px;
		font-weight: 600;
		padding: 1px 6px;
		border-radius: 5px;
	}
	.kpi-delta.up {
		color: var(--ae-verdant);
		background: rgba(var(--ae-verdant-rgb), 0.12);
	}
	.kpi-delta.down {
		color: var(--ae-crimson);
		background: rgba(var(--ae-crimson-rgb), 0.12);
	}

	.tabbar {
		display: flex;
		gap: 4px;
		padding: 4px;
		margin-bottom: 12px;
		border-radius: 13px;
		border: 1px solid var(--ae-line-strong);
		background: var(--ae-sub-bg);
		overflow-x: auto;
		width: fit-content;
		max-width: 100%;
	}
	.tabbtn {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		background: none;
		border: none;
		color: var(--ae-muted);
		font-family: var(--ae-font-body);
		font-size: 13px;
		font-weight: 500;
		padding: 8px 14px;
		border-radius: 9px;
		cursor: pointer;
		white-space: nowrap;
		transition: background 0.15s ease, color 0.15s ease;
	}
	.tabbtn:hover {
		color: var(--ae-text);
		background: var(--ae-line);
	}
	.tabbtn:focus-visible {
		outline: 2px solid var(--ae-ember);
		outline-offset: 1px;
	}
	.tabbtn.on {
		color: var(--ae-text);
		background: rgba(var(--ae-ember-rgb), 0.18);
		box-shadow: inset 0 0 0 1px rgba(var(--ae-ember-rgb), 0.4);
	}
	.tabbtn.on svg {
		color: var(--ae-ember-glow);
	}
	.tabpanel {
		display: none;
	}
	.tabpanel.on {
		display: block;
		animation: an-in 0.25s ease-out;
	}
	@keyframes an-in {
		from { opacity: 0; transform: translateY(4px); }
	}
	@media (prefers-reduced-motion: reduce) {
		.an-live,
		.tabpanel.on {
			animation: none;
		}
		.kpi-tile:hover {
			transform: none;
		}
	}
</style>
