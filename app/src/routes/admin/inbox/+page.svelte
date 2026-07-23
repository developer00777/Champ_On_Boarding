<script lang="ts">
	import { RANGE_KEYS, RANGE_LABELS } from '$lib/shared/ranges';
	import GlassSelect from '$lib/components/GlassSelect.svelte';

	let { data } = $props();

	const statusMeta: Record<string, { label: string; cls: string }> = {
		sent: { label: 'SENT', cls: '' },
		delivered: { label: 'DELIVERED', cls: 'teal' },
		opened: { label: 'OPENED', cls: 'teal' },
		clicked: { label: 'CLICKED', cls: 'teal' },
		bounced: { label: 'BOUNCED', cls: 'red' },
		complained: { label: 'COMPLAINED', cls: 'red' },
		delayed: { label: 'DELAYED', cls: 'gold' },
		failed: { label: 'FAILED', cls: 'red' },
		received: { label: 'REPLY', cls: 'purple' }
	};

	const DIRECTIONS = [
		{ value: '', label: 'All mail' },
		{ value: 'outbound', label: 'Sent' },
		{ value: 'inbound', label: 'Received' }
	];
	const MAILBOXES = [
		{ value: '', label: 'All mailboxes' },
		{ value: 'onboarding@', label: 'onboarding@' },
		{ value: 'offer@', label: 'offer@' }
	];

	function href(patch: Record<string, string>): string {
		const p = new URLSearchParams();
		const next = {
			range: data.range,
			direction: data.direction,
			mailbox: data.mailbox,
			...patch
		};
		for (const [k, v] of Object.entries(next)) if (v && v !== 'all') p.set(k, v);
		const q = p.toString();
		return q ? `?${q}` : '?';
	}

	const isFiltered = $derived(data.range !== 'all' || !!data.direction || !!data.mailbox);
	const totalPages = $derived(Math.max(1, Math.ceil(data.total / data.pageSize)));

	function when(iso: string): string {
		const d = new Date(iso);
		const mins = Math.round((Date.now() - d.getTime()) / 60000);
		if (mins < 60) return `${Math.max(mins, 1)}m ago`;
		if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
		const days = Math.round(mins / (60 * 24));
		if (days < 30) return `${days}d ago`;
		return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
	}

	let expanded: string | null = $state(null);
</script>

<h1 class="page-title">Inbox</h1>
<p class="muted" style="margin:0 0 20px;font-size:14px">
	Every email sent from onboarding@ / offer@, and every reply candidates send back.
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
			ariaLabel="Direction"
			value={data.direction === 'all' ? '' : data.direction}
			options={DIRECTIONS}
			onChange={(v) => (window.location.href = href({ direction: v }))}
		/>
	</div>

	<div class="filter-select">
		<GlassSelect
			ariaLabel="Mailbox"
			value={data.mailbox}
			options={MAILBOXES}
			onChange={(v) => (window.location.href = href({ mailbox: v }))}
		/>
	</div>

	<span class="count">
		{#if isFiltered}
			Showing <b>{data.total}</b> matching
			<a href="?" class="clear">Clear</a>
		{:else}
			<b>{data.total}</b> total
		{/if}
	</span>
</div>

<section class="table-card">
	<div class="thead" style="grid-template-columns:70px 1.4fr 1.8fr 1fr 130px 90px">
		<div></div>
		<div>From / To</div>
		<div>Subject</div>
		<div>Candidate</div>
		<div>Status</div>
		<div>When</div>
	</div>
	{#if data.messages.length === 0}
		<p class="muted" style="padding:18px">
			{#if isFiltered}
				No mail in this range. <a href="?">Show all</a>.
			{:else}
				No mail sent or received yet.
			{/if}
		</p>
	{:else}
		{#each data.messages as m (m.id)}
			<div
				class="mrow"
				role="button"
				tabindex="0"
				onclick={() => (expanded = expanded === m.id ? null : m.id)}
				onkeydown={(e) => {
					if (e.key === 'Enter' || e.key === ' ') {
						e.preventDefault();
						expanded = expanded === m.id ? null : m.id;
					}
				}}
			>
				<div class="mrow-inner" style="grid-template-columns:70px 1.4fr 1.8fr 1fr 130px 90px">
					<div>
						<span class="pill {m.direction === 'inbound' ? 'purple' : ''}">
							{m.direction === 'inbound' ? 'IN' : 'OUT'}
						</span>
					</div>
					<div class="tcell mono">{m.direction === 'inbound' ? m.from : m.to}</div>
					<div class="tcell">{m.subject || '(no subject)'}</div>
					<div class="tcell">
						{#if m.candidateId}
							<a href="/admin/candidates/{m.candidateId}" onclick={(e) => e.stopPropagation()}>
								{m.candidateName ?? m.candidateId}
							</a>
						{:else}
							<span class="muted">—</span>
						{/if}
					</div>
					<div>
						<span class="pill {statusMeta[m.status]?.cls ?? ''}">{statusMeta[m.status]?.label ?? m.status}</span>
					</div>
					<div class="tcell nums" style="font-family:var(--ae-font-mono);font-size:12px;color:var(--ae-muted)">
						{when(m.createdAt)}
					</div>
				</div>
				{#if expanded === m.id}
					<div class="mrow-body">
						{#if m.statusDetail}
							<div class="muted" style="margin-bottom:8px;font-size:12.5px">{m.statusDetail}</div>
						{/if}
						{#if m.text}
							<pre class="mbody-text">{m.text}</pre>
						{:else}
							<p class="muted" style="margin:0">No body stored for this message.</p>
						{/if}
					</div>
				{/if}
			</div>
		{/each}
	{/if}
</section>

{#if totalPages > 1}
	<div class="pager">
		{#if data.page > 1}
			<a href={href({ page: String(data.page - 1) })} class="teal-pill-btn">← Newer</a>
		{/if}
		<span class="muted" style="font-size:12.5px">Page {data.page} of {totalPages}</span>
		{#if data.page < totalPages}
			<a href={href({ page: String(data.page + 1) })} class="teal-pill-btn">Older →</a>
		{/if}
	</div>
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
	.thead {
		display: grid;
		gap: 12px;
		padding: 10px 18px;
		font-family: var(--ae-font-mono);
		font-size: 10.5px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--ae-muted);
		border-bottom: 1px solid var(--ae-card-border);
	}
	.mrow {
		border-bottom: 1px solid var(--ae-card-border);
		cursor: pointer;
	}
	.mrow:last-child {
		border-bottom: none;
	}
	.mrow:hover .mrow-inner {
		background: rgba(255, 255, 255, 0.025);
	}
	.mrow-inner {
		display: grid;
		gap: 12px;
		align-items: center;
		padding: 12px 18px;
	}
	.mono {
		font-family: var(--ae-font-mono);
		font-size: 12px;
	}
	.nums {
		font-variant-numeric: tabular-nums;
	}
	.mrow-body {
		padding: 0 18px 16px 100px;
	}
	.mbody-text {
		white-space: pre-wrap;
		word-break: break-word;
		font-family: var(--ae-font-body);
		font-size: 13px;
		color: var(--ae-text-2);
		margin: 0;
		max-height: 320px;
		overflow-y: auto;
	}
	.pager {
		display: flex;
		align-items: center;
		gap: 12px;
		justify-content: center;
		margin-top: 16px;
	}
	.teal-pill-btn {
		border: 1px solid var(--ae-line-strong);
		background: var(--ae-input-bg);
		color: var(--ae-text-2);
		font-family: var(--ae-font-body);
		font-weight: 500;
		font-size: 12px;
		padding: 7px 13px;
		border-radius: 8px;
		cursor: pointer;
		text-decoration: none;
	}
</style>
