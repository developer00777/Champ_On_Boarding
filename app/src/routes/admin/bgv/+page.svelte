<script lang="ts">
	import { enhance } from '$app/forms';

	let { data } = $props();

	const statusMeta: Record<string, { label: string; cls: string }> = {
		pending: { label: 'Not started', cls: '' },
		sent: { label: 'Request sent', cls: 'gold' },
		completed: { label: 'Verified', cls: 'teal' }
	};

	function fmtDate(iso: string | null): string {
		if (!iso) return '';
		return new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
	}
</script>

<svelte:head><title>BGV verification — Admin</title></svelte:head>

<h1 class="page-title">BGV verification</h1>
<p class="page-sub">
	Background verification with previous employers — <strong>Experienced-track</strong> hires at
	{data.entityNames.join(', ')} only. The request email is auto-addressed to the HR contact each
	candidate declared; you can edit it before sending.
</p>

<div class="table-card">
	<div class="thead">
		<span>Candidate</span>
		<span>Entity</span>
		<span>Previous employer</span>
		<span>Status</span>
		<span></span>
		<span></span>
	</div>
	{#each data.rows as row}
		<div class="trow">
			<a class="row-main" href="/admin/bgv/{row.id}">{row.name}</a>
			<span class="tcell">{row.entity}</span>
			<span class="tcell">
				{#if row.prevCompany}
					{row.prevCompany}
					{#if row.prevHrEmail}<span class="sub-line">{row.prevHrEmail}</span>{/if}
				{:else}
					<span class="muted-cell">Awaiting candidate details</span>
				{/if}
			</span>
			<span class="tcell">
				<span class="pill {statusMeta[row.bgvStatus].cls}">{statusMeta[row.bgvStatus].label}</span>
				{#if row.bgvStatus === 'sent' && row.replyReceivedAt}
					<span class="sub-line">Reply received {fmtDate(row.replyReceivedAt)}</span>
				{:else if row.bgvStatus === 'sent'}
					<span class="sub-line">Sent {fmtDate(row.sentAt)}{row.sentCount > 1 ? ` · ×${row.sentCount}` : ''}</span>
				{:else if row.bgvStatus === 'completed'}
					<span class="sub-line">Completed {fmtDate(row.completedAt)}</span>
				{/if}
			</span>
			<a class="review-cta" href="/admin/bgv/{row.id}">
				{row.bgvStatus === 'pending' ? 'Start BGV' : 'Open'} →
			</a>
			<form
				method="POST"
				action="?/deleteBgv"
				use:enhance
				onsubmit={(e) => {
					if (!confirm(`Delete ${row.name} from BGV? Their verification data and form link are removed; the onboarding record is kept.`))
						e.preventDefault();
				}}
			>
				<input type="hidden" name="candidateId" value={row.id} />
				<button class="del-btn" title="Delete from BGV" aria-label="Delete {row.name} from BGV">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
				</button>
			</form>
		</div>
	{:else}
		<div class="empty">
			No BGV candidates yet. Generate an onboarding link with the <strong>Experienced</strong> track
			for {data.entityNames.join(' / ')} and they'll appear here.
		</div>
	{/each}
</div>

<style>
	.page-sub {
		color: var(--ae-muted-2);
		font-size: 13px;
		margin: 0 0 22px;
		max-width: 680px;
		line-height: 1.55;
	}
	/* Local grid: this table has its own column set (incl. the delete column),
	   so it overrides the shared .thead/.trow template from the layout. */
	.table-card .thead,
	.table-card .trow {
		grid-template-columns: 1.4fr 1.1fr 1.4fr 1.1fr auto auto;
	}
	.row-main {
		font-weight: 600;
		color: var(--ae-text);
		text-decoration: none;
	}
	.row-main:hover { text-decoration: underline; }
	.sub-line {
		display: block;
		font-size: 11px;
		color: var(--ae-muted);
		margin-top: 2px;
	}
	.muted-cell {
		color: var(--ae-muted);
		font-size: 12.5px;
	}
	.pill {
		display: inline-block;
		font-family: var(--ae-font-mono);
		font-size: 9.5px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		padding: 3px 8px;
		border-radius: 999px;
		border: 1px solid var(--ae-line-strong);
		color: var(--ae-muted-2);
	}
	.pill.gold {
		color: #b8860b;
		border-color: rgba(230, 167, 0, 0.45);
		background: rgba(230, 167, 0, 0.1);
	}
	.pill.teal {
		color: #0a7c5a;
		border-color: rgba(10, 124, 90, 0.4);
		background: rgba(10, 124, 90, 0.1);
	}
	.del-btn {
		background: none;
		border: 1px solid transparent;
		border-radius: 7px;
		color: var(--ae-muted);
		padding: 6px;
		cursor: pointer;
		display: grid;
		place-items: center;
		transition: color 0.15s, border-color 0.15s, background 0.15s;
	}
	.del-btn:hover {
		color: #e8033a;
		border-color: rgba(232, 3, 58, 0.4);
		background: rgba(232, 3, 58, 0.08);
	}
	.empty {
		padding: 34px 18px;
		text-align: center;
		color: var(--ae-muted);
		font-size: 13px;
	}
</style>
