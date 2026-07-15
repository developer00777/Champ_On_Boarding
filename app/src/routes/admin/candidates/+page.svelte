<script lang="ts">
	import { TRACK_LABELS, type Track } from '$lib/shared/matrix';
	import { RANGE_KEYS, RANGE_LABELS } from '$lib/shared/ranges';

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
		const next = { range: data.range, track: data.track, status: data.status, ...patch };
		for (const [k, v] of Object.entries(next)) if (v && v !== 'all') p.set(k, v);
		const q = p.toString();
		return q ? `?${q}` : '?';
	}

	const filtered = $derived(data.candidates.length);
	const isFiltered = $derived(data.range !== 'all' || !!data.track || !!data.status);

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

	<select
		aria-label="Track"
		onchange={(e) => (window.location.href = href({ track: e.currentTarget.value }))}
	>
		<option value="" selected={!data.track}>All tracks</option>
		{#each data.tracks as t}
			<option value={t} selected={data.track === t}>{TRACK_LABELS[t as Track]}</option>
		{/each}
	</select>

	<select
		aria-label="Status"
		onchange={(e) => (window.location.href = href({ status: e.currentTarget.value }))}
	>
		<option value="" selected={!data.status}>All statuses</option>
		{#each STATUSES as s}
			<option value={s} selected={data.status === s}>{statusMeta[s].label}</option>
		{/each}
	</select>

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
			{#if isFiltered}
				No candidates in this range. <a href="?">Show all {data.total}</a>.
			{:else}
				No candidates yet — generate the first link from Home.
			{/if}
		</p>
	{:else}
		{#each data.candidates as c (c.id)}
			<a class="trow" href="/admin/candidates/{c.id}">
				<div>
					<div style="font-weight:700;font-size:14px;color:var(--ink)">{c.fullName || c.email}</div>
					<div style="font-size:12px;color:var(--smoke)">{c.email}</div>
				</div>
				<div class="tcell">{c.company}</div>
				<div class="tcell">{TRACK_LABELS[c.track as Track]}</div>
				<div>
					<span class="pill {statusMeta[c.status]?.cls}">
						{statusMeta[c.status]?.label ?? c.status}
					</span>
				</div>
				<div class="tcell nums" style="color:var(--smoke)">{when(c.createdAt)}</div>
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
		background: #fff;
		border: 1px solid var(--border-2);
		border-radius: 9px;
		padding: 2px;
		gap: 2px;
	}
	.seg-b {
		font-size: 12.5px;
		font-weight: 650;
		color: var(--smoke);
		padding: 6px 12px;
		border-radius: 7px;
		text-decoration: none;
		transition: background 0.12s, color 0.12s;
	}
	.seg-b:hover {
		color: var(--ink);
	}
	.seg-b.on {
		background: var(--purple);
		color: #fff;
	}
	.filterbar select {
		border: 1px solid var(--border-2);
		border-radius: 9px;
		padding: 7px 10px;
		font-size: 12.5px;
		font-weight: 600;
		background: #fff;
		color: var(--ink);
	}
	.count {
		margin-left: auto;
		font-size: 12.5px;
		color: var(--smoke);
		font-variant-numeric: tabular-nums;
	}
	.count b {
		color: var(--ink);
	}
	.clear {
		margin-left: 8px;
		color: var(--purple);
		font-weight: 650;
	}
	.nums {
		font-variant-numeric: tabular-nums;
	}
</style>
