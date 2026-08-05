<script lang="ts">
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
	Background verification with previous employers — experienced, consultant and contract hires only.
	The request email is auto-addressed to the HR contact each candidate declared; you can edit it before sending.
</p>

<div class="table-card">
	<div class="thead">
		<span>Candidate</span>
		<span>Entity</span>
		<span>Track</span>
		<span>Previous employer</span>
		<span>Status</span>
		<span></span>
	</div>
	{#each data.rows as row}
		<a class="trow" href="/admin/bgv/{row.id}">
			<span style="font-weight:600">{row.name}</span>
			<span class="tcell">{row.entity}</span>
			<span class="tcell">{row.trackLabel}</span>
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
			<span class="review-cta">
				{row.bgvStatus === 'pending' ? 'Start BGV' : 'Open'} →
			</span>
		</a>
	{:else}
		<div class="empty">No experienced-track candidates yet. Generate an onboarding link with the Experienced, Consultant or Contract track and they'll appear here.</div>
	{/each}
</div>

<style>
	.page-sub {
		color: var(--ae-muted-2);
		font-size: 13px;
		margin: 0 0 22px;
		max-width: 640px;
		line-height: 1.55;
	}
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
	.empty {
		padding: 34px 18px;
		text-align: center;
		color: var(--ae-muted);
		font-size: 13px;
	}
</style>
