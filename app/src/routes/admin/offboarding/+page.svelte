<script lang="ts">
	import { enhance } from '$app/forms';
	import { goto } from '$app/navigation';
	import { RANGE_KEYS, RANGE_LABELS } from '$lib/shared/ranges';
	import { EXIT_STATUS_META } from '$lib/shared/offboarding';
	import GlassSelect from '$lib/components/GlassSelect.svelte';

	let { data, form } = $props();

	let showInitiate = $state(false);
	let initiating = $state(false);
	// Deleting an exit is irreversible and cascades to its files, so the button
	// arms a per-row confirm rather than firing on the first click.
	let confirming = $state<string | null>(null);
	let deleting = $state<string | null>(null);

	/** Filters are URL params, so a filtered view is shareable and survives a
	 *  refresh. Build links rather than posting — this is a read. */
	function href(patch: Record<string, string>): string {
		const p = new URLSearchParams();
		const next = { range: data.range, status: data.status, q: data.q, ...patch };
		for (const [k, v] of Object.entries(next)) if (v && v !== 'all') p.set(k, v);
		const qs = p.toString();
		return qs ? `?${qs}` : '?';
	}

	const filtered = $derived(data.exits.length);
	const isFiltered = $derived(data.range !== 'all' || !!data.status || !!data.q);

	// A freshly initiated exit goes straight to its workspace — HR's next move is
	// always to check the prefilled particulars and send the link.
	$effect(() => {
		if (form?.initiated && form.exitId) goto(`/admin/offboarding/${form.exitId}`);
	});

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

<div class="head-row">
	<div>
		<h1 class="page-title">Offboarding</h1>
		<p class="muted" style="margin:0;font-size:14px">
			Employee separations in flight, from resignation through to final settlement.
		</p>
	</div>
	{#if data.canInitiate}
		<button class="btn" type="button" onclick={() => (showInitiate = !showInitiate)}>
			{showInitiate ? 'Cancel' : 'Initiate offboarding'}
		</button>
	{/if}
</div>

{#if showInitiate}
	<section class="card initiate">
		<div class="eyebrow" style="margin-bottom:4px">Step 1 — Resignation received</div>
		<p class="muted" style="margin:0 0 18px;font-size:13px">
			Enter what you have from the resignation email. If this person was onboarded through this
			portal, their joining date, designation, manager and bank details are filled in automatically.
		</p>
		<form
			method="POST"
			action="?/initiate"
			use:enhance={() => {
				initiating = true;
				return async ({ update }) => {
					await update({ reset: false });
					initiating = false;
				};
			}}
		>
			<div class="fgrid">
				<label class="f">
					<span>Employee ID <b class="req">*</b></span>
					<input name="employeeId" required placeholder="e.g. CIPL1042" />
				</label>
				<label class="f">
					<span>Employee name <b class="req">*</b></span>
					<input name="fullName" required placeholder="Full name as per records" />
				</label>
				<label class="f">
					<span>Personal email <b class="req">*</b></span>
					<input name="personalEmail" type="email" required placeholder="their own address, not work" />
				</label>
				<label class="f">
					<span>Personal mobile</span>
					<input name="personalMobile" inputmode="numeric" placeholder="10 digits" />
				</label>
				<label class="f">
					<span>Date of resignation <b class="req">*</b></span>
					<input name="resignationDate" type="date" required />
				</label>
				<label class="f">
					<span>Last working day</span>
					<input name="lwd" type="date" />
				</label>
				<label class="f">
					<span>Entity <b class="req">*</b></span>
					<select name="companyId" required>
						<option value="">Select entity…</option>
						{#each data.companies as c}
							<option value={c.id}>{c.name}</option>
						{/each}
					</select>
				</label>
				<label class="f">
					<span>Separation type</span>
					<select name="separationType">
						<option value="voluntary">Voluntary (resignation)</option>
						<option value="involuntary">Involuntary (termination)</option>
					</select>
				</label>
			</div>
			<p class="hint">
				The last working day can be added later — it is confirmed at resignation approval, and the
				exit forms link is sent once it is known.
			</p>
			{#if form?.initiateError && form?.message}
				<p class="error">{form.message}</p>
			{/if}
			<div class="actions">
				<button class="btn grad" disabled={initiating}>
					{initiating ? 'Creating…' : 'Create exit record'}
				</button>
			</div>
		</form>
	</section>
{/if}

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
			ariaLabel="Status"
			value={data.status ?? ''}
			options={[
				{ value: '', label: 'All statuses' },
				...data.statuses.map((s: string) => ({ value: s, label: EXIT_STATUS_META[s].label }))
			]}
			onChange={(v) => (window.location.href = href({ status: v }))}
		/>
	</div>

	<!-- GET form keeps the search in the URL like the other filters; hidden
	     inputs carry the active filters so a search doesn't silently drop them. -->
	<form
		class="searchbox"
		method="GET"
		action="/admin/offboarding"
		role="search"
		data-sveltekit-noscroll
		data-sveltekit-keepfocus
	>
		{#if data.range !== 'all'}<input type="hidden" name="range" value={data.range} />{/if}
		{#if data.status}<input type="hidden" name="status" value={data.status} />{/if}
		<input
			name="q"
			value={data.q ?? ''}
			placeholder="Search name, employee ID or email"
			aria-label="Search exits"
			class="sinput"
		/>
		<button class="sbtn" type="submit" aria-label="Search">
			<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><circle cx="11" cy="11" r="7" /><path d="M20 20l-4.2-4.2" /></svg>
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

{#if form?.message && !form?.initiateError}
	<p class="error" style="margin-bottom:12px">{form.message}</p>
{/if}

<section class="table-card">
	<div class="thead">
		<div>Employee</div>
		<div>Entity</div>
		<div>Resigned</div>
		<div>Last working day</div>
		<div>Status</div>
		<div>Clearances</div>
		<div></div>
	</div>
	{#if filtered === 0}
		<p class="muted" style="padding:18px">
			{#if data.q}
				No exits matching “{data.q}”. <a href={href({ q: '' })}>Clear search</a> or
				<a href="?">show all {data.total}</a>.
			{:else if isFiltered}
				No exits in this range. <a href="?">Show all {data.total}</a>.
			{:else}
				No offboardings yet — initiate the first one above.
			{/if}
		</p>
	{:else}
		{#each data.exits as e (e.id)}
			<a class="trow" href="/admin/offboarding/{e.id}">
				<div>
					<div style="font-weight:500;font-size:14px;color:var(--ae-text)">{e.fullName}</div>
					<div style="font-family:var(--ae-font-mono);font-size:11px;color:var(--ae-muted)">
						{e.employeeId}{e.designation ? ` · ${e.designation}` : ''}
					</div>
				</div>
				<div class="tcell">{e.company}</div>
				<div class="tcell nums mono">{e.resignationDate}</div>
				<div class="tcell nums mono">{e.lwd ?? '—'}</div>
				<div>
					<span class="pill {EXIT_STATUS_META[e.status]?.cls ?? ''}">
						{EXIT_STATUS_META[e.status]?.label ?? e.status}
					</span>
				</div>
				<div class="tcell nums mono">
					{#if e.clearances.total}
						{e.clearances.done}/{e.clearances.total}
					{:else}
						—
					{/if}
				</div>
				<div class="review-cta">
					Open
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M9 6l6 6-6 6" /></svg>
				</div>
			</a>
			{#if data.canDelete}
				<!-- Outside the <a> above: a form inside an anchor is invalid markup,
				     and a nested button would swallow the row's own click. -->
				<form
					method="POST"
					action="?/deleteExit"
					class="delcell"
					use:enhance={() => {
						deleting = e.id;
						return async ({ update }) => {
							await update();
							deleting = null;
							confirming = null;
						};
					}}
				>
					<input type="hidden" name="exitId" value={e.id} />
					{#if confirming === e.id}
						<button type="submit" class="del confirm" disabled={deleting === e.id}>
							{deleting === e.id ? 'Deleting…' : 'Confirm'}
						</button>
						<button type="button" class="del cancel" onclick={() => (confirming = null)}>Cancel</button>
					{:else}
						<button
							type="button"
							class="del"
							title="Delete this offboarding record"
							aria-label="Delete offboarding for {e.fullName}"
							onclick={() => (confirming = e.id)}
						>
							<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2">
								<path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13" />
							</svg>
						</button>
					{/if}
				</form>
			{/if}
		{/each}
	{/if}
</section>

<style>
	.head-row {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 20px;
		flex-wrap: wrap;
	}
	.initiate {
		margin-bottom: 18px;
	}
	.fgrid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(210px, 1fr));
		gap: 14px 18px;
	}
	.f {
		display: flex;
		flex-direction: column;
		gap: 5px;
	}
	.f > span {
		font-size: 12px;
		font-weight: 500;
		color: var(--ae-text-2);
	}
	.req {
		color: var(--ae-crimson);
		font-weight: 600;
	}
	.hint {
		margin: 14px 0 0;
		font-size: 12px;
		color: var(--ae-muted);
		line-height: 1.6;
	}
	.actions {
		margin-top: 16px;
	}
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
		min-width: 160px;
		font-size: 12.5px;
		font-weight: 500;
	}
	.searchbox {
		display: flex;
		align-items: center;
		gap: 2px;
		background: var(--ae-input-bg);
		border: 1px solid var(--ae-line-strong);
		border-radius: 8px;
		padding: 0 4px 0 12px;
		min-width: 250px;
		transition: border-color 0.12s, box-shadow 0.12s, background 0.12s;
	}
	.searchbox:hover {
		background: var(--ae-hover);
	}
	.searchbox:focus-within {
		border-color: var(--ae-ember);
		box-shadow: 0 0 0 3px rgba(255, 125, 85, 0.25);
	}
	.sinput {
		border: none;
		background: none;
		box-shadow: none;
		padding: 8px 0;
		font-size: 13px;
		flex: 1;
		min-width: 0;
	}
	.sinput:focus {
		outline: none;
		box-shadow: none;
	}
	.sbtn {
		background: none;
		border: none;
		color: var(--ae-muted);
		padding: 6px;
		display: grid;
		place-items: center;
		cursor: pointer;
		box-shadow: none;
	}
	.sbtn:hover {
		color: var(--ae-ember-glow);
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
	.mono {
		font-family: var(--ae-font-mono);
		font-size: 12px;
		color: var(--ae-muted);
	}
	/* This table has its own column set, so it overrides the shared template
	   from the admin layout. */
	.thead,
	.trow {
		grid-template-columns: 1.5fr 1fr 0.8fr 0.9fr 1.2fr 0.7fr auto;
	}

	/* Sits in the row's own grid track so the button lines up under the header,
	   and stays quiet until hovered — destructive, so never the loud control. */
	.delcell {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 6px;
		padding: 0 14px 12px;
		margin-top: -8px;
	}
	.del {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		background: none;
		border: 1px solid transparent;
		border-radius: 7px;
		padding: 5px 8px;
		font: inherit;
		font-size: 12px;
		color: var(--ae-muted);
		cursor: pointer;
		opacity: 0.65;
		transition: opacity 0.14s, color 0.14s, border-color 0.14s, background 0.14s;
	}
	.del:hover {
		opacity: 1;
		color: #b42318;
		border-color: #fda29b;
		background: #fef3f2;
	}
	.del:focus-visible {
		outline: 2px solid #b42318;
		outline-offset: 1px;
		opacity: 1;
	}
	.del.confirm {
		opacity: 1;
		color: #fff;
		background: #b42318;
		border-color: #b42318;
		font-weight: 600;
	}
	.del.confirm:hover {
		background: #912018;
		color: #fff;
	}
	.del.confirm:disabled {
		opacity: 0.6;
		cursor: default;
	}
	.del.cancel {
		opacity: 1;
	}
</style>
