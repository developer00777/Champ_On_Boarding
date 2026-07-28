<script lang="ts">
	import { TRACK_LABELS, type Track } from '$lib/shared/matrix';
	import { RANGE_KEYS, RANGE_LABELS } from '$lib/shared/ranges';
	import GlassSelect from '$lib/components/GlassSelect.svelte';

	let { data } = $props();

	const statusMeta: Record<string, { label: string; cls: string }> = {
		created: { label: 'LINK SENT', cls: '' },
		opened: { label: 'OPENED', cls: 'purple' },
		in_progress: { label: 'IN PROGRESS', cls: 'purple' },
		submitted: { label: 'AWAITING REVIEW', cls: 'gold' },
		changes_requested: { label: 'CHANGES REQUESTED', cls: 'red' },
		approved: { label: 'APPROVED', cls: 'teal' },
		complete: { label: 'COMPLETE', cls: 'teal' },
		revoked: { label: 'REVOKED', cls: 'red' }
	};

	const STATUSES = Object.keys(statusMeta);

	/** Filters are URL params, so a filtered view is shareable and survives a
	 *  refresh. Build links rather than posting — this is a read. */
	function href(patch: Record<string, string>): string {
		const p = new URLSearchParams();
		const next = { range: data.range, track: data.track, status: data.status, q: data.q, ...patch };
		for (const [k, v] of Object.entries(next)) if (v && v !== 'all') p.set(k, v);
		const qs = p.toString();
		return qs ? `?${qs}` : '?';
	}

	const filtered = $derived(data.candidates.length);
	const isFiltered = $derived(data.range !== 'all' || !!data.track || !!data.status || !!data.q);

	function when(iso: string): string {
		const d = new Date(iso);
		const mins = Math.round((Date.now() - d.getTime()) / 60000);
		if (mins < 60) return `${Math.max(mins, 1)}m ago`;
		if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
		const days = Math.round(mins / (60 * 24));
		if (days < 30) return `${days}d ago`;
		return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
	}
</script>

<h1 class="page-title">Candidates</h1>
<p class="muted" style="margin:0 0 20px;font-size:14px">
	Everyone onboarding, by when their link was created.
</p>

<div class="filterbar">
	<div class="seg" role="group" aria-label="Time range">
		{#each RANGE_KEYS as k}
			<a href={href({ range: k })} class="seg-b" class:on={data.range === k} data-sveltekit-noscroll>
				{RANGE_LABELS[k]}
			</a>
		{/each}
	</div>

	<div class="filter-select">
		<GlassSelect
			ariaLabel="Track"
			value={data.track ?? ''}
			options={[
				{ value: '', label: 'All tracks' },
				...data.tracks.map((t: Track) => ({ value: t, label: TRACK_LABELS[t] }))
			]}
			onChange={(v) => (window.location.href = href({ track: v }))}
		/>
	</div>

	<div class="filter-select">
		<GlassSelect
			ariaLabel="Status"
			value={data.status ?? ''}
			options={[
				{ value: '', label: 'All statuses' },
				...STATUSES.map((s) => ({ value: s, label: statusMeta[s].label }))
			]}
			onChange={(v) => (window.location.href = href({ status: v }))}
		/>
	</div>

	<!-- GET form keeps the search in the URL like the other filters; hidden
	     inputs carry the active filters so a search doesn't silently drop them. -->
	<form class="searchbox" method="GET" action="/admin/candidates" role="search" data-sveltekit-noscroll data-sveltekit-keepfocus>
		{#if data.range !== 'all'}<input type="hidden" name="range" value={data.range} />{/if}
		{#if data.track}<input type="hidden" name="track" value={data.track} />{/if}
		{#if data.status}<input type="hidden" name="status" value={data.status} />{/if}
		<input
			type="search"
			name="q"
			value={data.q ?? ''}
			placeholder="Search name or employee code"
			aria-label="Search candidates by name or employee code"
			autocomplete="off"
		/>
		{#if data.q}
			<a class="qbtn" href={href({ q: '' })} aria-label="Clear search" title="Clear search">
				<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
			</a>
		{/if}
		<button type="submit" class="qbtn" aria-label="Search" title="Search">
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
		</button>
	</form>

	<span class="count">
		{#if isFiltered}
			Showing <b>{filtered}</b> of {data.total}
			<a href="?" class="clear">Clear</a>
		{:else}
			<b>{data.total}</b> total
		{/if}
	</span>
</div>

<section class="table-card">
	<div class="thead">
		<div>Candidate</div>
		<div>Company</div>
		<div>Track</div>
		<div>Status</div>
		<div>Created</div>
		<div></div>
	</div>
	{#if filtered === 0}
		<p class="muted" style="padding:18px">
			{#if data.q}
				No candidates matching “{data.q}”. <a href={href({ q: '' })}>Clear search</a> or <a href="?">show all {data.total}</a>.
			{:else if isFiltered}
				No candidates in this range. <a href="?">Show all {data.total}</a>.
			{:else}
				No candidates yet — generate the first link from Home.
			{/if}
		</p>
	{:else}
		{#each data.candidates as c (c.id)}
			<a class="trow" href="/admin/candidates/{c.id}">
				<div>
					<div style="font-weight:500;font-size:14px;color:var(--ae-text)">{c.fullName || c.email}</div>
					<div style="font-family:var(--ae-font-mono);font-size:11px;color:var(--ae-muted)">{c.email}</div>
				</div>
				<div class="tcell">{c.company}</div>
				<div class="tcell">{TRACK_LABELS[c.track as Track]}</div>
				<div>
					<span class="pill {statusMeta[c.status]?.cls}">
						{statusMeta[c.status]?.label ?? c.status}
					</span>
				</div>
				<div class="tcell nums" style="font-family:var(--ae-font-mono);font-size:12px;color:var(--ae-muted)">{when(c.createdAt)}</div>
				<div class="review-cta">
					Review
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M9 6l6 6-6 6" /></svg>
				</div>
			</a>
		{/each}
	{/if}
</section>

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
	/* Filter dropdowns are content-width, not the full toolbar row. */
	.filter-select {
		width: auto;
		min-width: 150px;
		font-size: 12.5px;
		font-weight: 500;
	}
	/* Search box matches the GlassSelect trigger chrome. */
	.searchbox {
		display: flex;
		align-items: center;
		gap: 2px;
		background: var(--ae-input-bg);
		border: 1px solid var(--ae-line-strong);
		border-radius: 8px;
		padding: 0 4px 0 12px;
		min-width: 230px;
		transition: border-color 0.12s, box-shadow 0.12s, background 0.12s;
	}
	.searchbox:hover {
		background: var(--ae-hover);
	}
	.searchbox:focus-within {
		border-color: var(--ae-ember);
		box-shadow: 0 0 0 3px rgba(255, 125, 85, 0.25);
	}
	.searchbox input[type='search'] {
		flex: 1;
		min-width: 0;
		background: none;
		border: none;
		outline: none;
		color: var(--ae-text);
		font: inherit;
		font-size: 12.5px;
		font-weight: 500;
		padding: 8px 0;
		appearance: none;
		-webkit-appearance: none;
	}
	.searchbox input::placeholder {
		color: var(--ae-muted);
	}
	/* Native clear button replaced by our own (the × next to the icon). */
	.searchbox input::-webkit-search-cancel-button {
		display: none;
	}
	.qbtn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: none;
		border-radius: 6px;
		background: none;
		color: var(--ae-muted);
		cursor: pointer;
		transition: background 0.12s, color 0.12s;
	}
	.qbtn:hover {
		background: var(--ae-hover);
		color: var(--ae-text);
	}
	.count {
		margin-left: auto;
		font-family: var(--ae-font-mono);
		font-size: 11.5px;
		color: var(--ae-muted);
		font-variant-numeric: tabular-nums;
	}
	.count b {
		color: var(--ae-text);
		font-weight: 600;
	}
	.clear {
		margin-left: 8px;
		color: var(--ae-ember-glow);
		font-weight: 500;
	}
	.nums {
		font-variant-numeric: tabular-nums;
	}
</style>
