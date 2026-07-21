<script lang="ts">
	import '$lib/styles/analytics-kit.css';
	import GlassSelect from '$lib/components/GlassSelect.svelte';
	import { onMount } from 'svelte';

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
		{ key: 'graph', label: 'Knowledge Graph' },
		{ key: 'trends', label: 'Trends' },
		{ key: 'funnel', label: 'Funnel' },
		{ key: 'docs', label: 'Documents & Quality' },
		{ key: 'breakdown', label: 'Breakdown' }
	];

	let chartsMod: typeof import('./charts') | null = $state(null);
	onMount(async () => {
		chartsMod = await import('./charts');
	});

	function fmtDelta(cur: number, prev: number): { text: string; up: boolean } {
		if (prev === 0) return { text: cur > 0 ? 'new' : '—', up: cur > 0 };
		const pct = ((cur - prev) / prev) * 100;
		return { text: (pct >= 0 ? '↑ ' : '↓ ') + Math.abs(Math.round(pct)) + '%', up: pct >= 0 };
	}

	const trendLast = $derived(data.trend[data.trend.length - 1]);
	const trendPrev = $derived(data.trend[data.trend.length - 2]);
	const kpis = $derived(
		trendLast
			? [
					{
						label: 'Onboarded (' + data.bucket + ')',
						value: String(trendLast.approved),
						delta: trendPrev ? fmtDelta(trendLast.approved, trendPrev.approved) : null
					},
					{
						label: 'Links created',
						value: String(trendLast.created),
						delta: trendPrev ? fmtDelta(trendLast.created, trendPrev.created) : null
					},
					{
						label: 'Time to submit (median)',
						value: data.stageDurations.sentToSubmitted != null ? data.stageDurations.sentToSubmitted.toFixed(1) + 'd' : '—',
						delta: null
					},
					{
						label: 'HR review latency (median)',
						value: data.stageDurations.submittedToApproved != null ? data.stageDurations.submittedToApproved.toFixed(1) + 'd' : '—',
						delta: null
					},
					{
						label: 'In pipeline now',
						value: String(data.funnel.opened - data.funnel.approved - data.funnel.revoked),
						delta: null
					},
					{
						label: 'Verification pass rate',
						value: passRate() + '%',
						delta: null
					}
				]
			: []
	);

	function passRate(): string {
		const total = data.verification.histogram.reduce((a, b) => a + b.n, 0);
		if (total === 0) return '—';
		const passing = data.verification.histogram
			.filter((h) => h.bucket === '80-89' || h.bucket === '90-100')
			.reduce((a, b) => a + b.n, 0);
		return String(Math.round((passing / total) * 100));
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
			chartsMod.renderFunnelTab(funnelEl, data.funnel, data.stageDurations);
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

<h1 class="page-title">Onboarding Analytics</h1>
<p class="muted" style="margin:0 0 20px;font-size:14px">
	Trends, bottlenecks, and the document-requirement graph, computed from the live pipeline.
</p>

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

	<div class="filter-select" style="max-width:130px">
		<GlassSelect
			ariaLabel="Group trends by"
			value={data.bucket}
			options={data.bucketOptions}
			onChange={(v) => (window.location.href = href({ bucket: v }))}
		/>
	</div>

	{#if data.companyId || data.track}
		<a href="?" class="clear">Clear filters</a>
	{/if}
</div>

<div class="kpi-row">
	{#each kpis as k}
		<div class="kpi-tile">
			<div class="kpi-label">{k.label}</div>
			<div class="kpi-value-row">
				<span class="kpi-value">{k.value}</span>
				{#if k.delta}
					<span class="kpi-delta" class:up={k.delta.up} class:down={!k.delta.up}>{k.delta.text}</span>
				{/if}
			</div>
		</div>
	{/each}
</div>

<div class="tabbar" role="tablist">
	{#each TABS as t}
		<button class="tabbtn" class:on={activeTab === t.key} onclick={() => (activeTab = t.key)}>{t.label}</button>
	{/each}
</div>

<div class="tabpanel" class:on={activeTab === 'graph'} bind:this={graphEl}></div>
<div class="tabpanel" class:on={activeTab === 'trends'} bind:this={trendsEl}></div>
<div class="tabpanel" class:on={activeTab === 'funnel'} bind:this={funnelEl}></div>
<div class="tabpanel" class:on={activeTab === 'docs'} bind:this={docsEl}></div>
<div class="tabpanel" class:on={activeTab === 'breakdown'} bind:this={breakdownEl}></div>

{#if !chartsMod}
	<p class="muted" style="padding:24px;text-align:center">Loading charts…</p>
{/if}

<style>
	.filterbar {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 14px;
		flex-wrap: wrap;
	}
	.seg {
		display: inline-flex;
		background: #14171f;
		border: 1px solid var(--ae-line-strong);
		border-radius: 9px;
		padding: 2px;
		gap: 2px;
	}
	.seg-b {
		font-size: 12.5px;
		font-weight: 500;
		color: var(--ae-muted);
		padding: 6px 12px;
		border-radius: 7px;
		text-decoration: none;
		transition: background 0.12s, color 0.12s;
	}
	.seg-b:hover {
		color: var(--ae-text);
	}
	.seg-b.on {
		background: rgba(255, 125, 85, 0.14);
		color: var(--ae-ember-glow);
	}
	.filter-select {
		width: auto;
		min-width: 150px;
		font-size: 12.5px;
		font-weight: 500;
	}
	.clear {
		margin-left: auto;
		color: var(--ae-ember-glow);
		font-weight: 500;
		font-size: 12.5px;
	}

	.kpi-row {
		display: grid;
		grid-template-columns: repeat(6, 1fr);
		gap: 10px;
		margin-bottom: 20px;
	}
	.kpi-tile {
		background: var(--ae-sub-bg);
		border: 1px solid var(--ae-line-strong);
		border-radius: 12px;
		padding: 13px 14px;
	}
	.kpi-label {
		font-family: var(--ae-font-mono);
		font-size: 9.5px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--ae-muted);
		margin-bottom: 7px;
	}
	.kpi-value-row {
		display: flex;
		align-items: baseline;
		gap: 7px;
	}
	.kpi-value {
		font-family: var(--ae-font-display);
		font-size: 20px;
		font-weight: 600;
		font-variant-numeric: tabular-nums;
		color: var(--ae-text);
	}
	.kpi-delta {
		font-family: var(--ae-font-mono);
		font-size: 10.5px;
		font-weight: 600;
	}
	.kpi-delta.up {
		color: var(--ae-verdant);
	}
	.kpi-delta.down {
		color: var(--ae-crimson);
	}
	@media (max-width: 1180px) {
		.kpi-row {
			grid-template-columns: repeat(3, 1fr);
		}
	}
	@media (max-width: 640px) {
		.kpi-row {
			grid-template-columns: repeat(2, 1fr);
		}
	}

	.tabbar {
		display: flex;
		gap: 4px;
		border-bottom: 1px solid var(--ae-line-strong);
		margin-bottom: 20px;
		overflow-x: auto;
	}
	.tabbtn {
		background: none;
		border: none;
		color: var(--ae-muted);
		font-family: var(--ae-font-body);
		font-size: 13px;
		font-weight: 500;
		padding: 10px 15px;
		cursor: pointer;
		border-bottom: 2px solid transparent;
		white-space: nowrap;
		margin-bottom: -1px;
	}
	.tabbtn:hover {
		color: var(--ae-text);
	}
	.tabbtn.on {
		color: var(--ae-ember-glow);
		border-bottom-color: var(--ae-ember);
	}
	.tabpanel {
		display: none;
	}
	.tabpanel.on {
		display: block;
	}
</style>
