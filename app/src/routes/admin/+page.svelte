<script lang="ts">
	import { enhance } from '$app/forms';
	import { TRACK_LABELS, type Track } from '$lib/shared/matrix';

	let { data, form } = $props();

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

	const stats = $derived([
		{ label: 'Total candidates', value: data.candidates.length, color: 'var(--ink)' },
		{
			label: 'Awaiting review',
			value: data.candidates.filter((c) => c.status === 'submitted').length,
			color: 'var(--gold)'
		},
		{
			label: 'In progress',
			value: data.candidates.filter((c) => ['created', 'opened', 'in_progress', 'changes_requested'].includes(c.status)).length,
			color: 'var(--purple)'
		},
		{
			label: 'Approved',
			value: data.candidates.filter((c) => ['approved', 'complete'].includes(c.status)).length,
			color: 'var(--teal)'
		}
	]);

	function copyLink(link: string) {
		navigator.clipboard.writeText(link);
	}

	const brandColor = (slug: string | null) =>
		data.brandOptions.find((b) => b.slug === slug)?.primary ?? 'var(--fog)';
</script>

<h1 class="page-title">Candidates</h1>
<p class="muted" style="margin:0 0 22px;font-size:14px">Generate onboarding links and review submissions.</p>

<div class="stats">
	{#each stats as s}
		<div class="stat-card">
			<div class="stat-label">{s.label}</div>
			<div class="stat-value" style:color={s.color}>{s.value}</div>
		</div>
	{/each}
</div>

<section class="card" style="margin-bottom:22px">
	<div style="font-weight:700;font-size:18px;margin-bottom:16px">Generate onboarding link</div>
	<form method="POST" action="?/generateLink" use:enhance>
		<div class="gen-grid">
			<div>
				<label for="candidateName">Candidate name</label>
				<input id="candidateName" name="candidateName" placeholder="As on offer letter" />
			</div>
			<div>
				<label for="email">Candidate email</label>
				<input id="email" name="email" type="email" placeholder="name@email.com" required />
			</div>
			<div>
				<label for="candidateMobile">Mobile (WhatsApp)</label>
				<input id="candidateMobile" name="candidateMobile" type="tel" placeholder="10-digit mobile" />
			</div>
			<div>
				<label for="track">Track</label>
				<select id="track" name="track" required>
					{#each data.tracks as track}
						<option value={track}>{TRACK_LABELS[track as Track]}</option>
					{/each}
				</select>
			</div>
			<div>
				<label for="companyId">Company</label>
				<select id="companyId" name="companyId" required>
					{#each data.companies as company}
						<option value={company.id}>{company.name}</option>
					{/each}
				</select>
			</div>
			<button class="btn">Generate &amp; email</button>
		</div>
	</form>
	{#if form?.message}<p class="error">{form.message}</p>{/if}
	{#if form?.link}
		<div class="linkbox">
			<div style="font-size:13px;color:var(--fg-2);margin-bottom:8px">
				Link created and emailed to <strong>{form.email}</strong>:
			</div>
			<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
				<code class="linkcode">{form.link}</code>
				<button type="button" class="teal-pill-btn" onclick={() => copyLink(form.link)}>Copy link</button>
				<a class="teal-pill-btn" href={form.waUrl} target="_blank" rel="noopener">Share on WhatsApp</a>
			</div>
		</div>
	{/if}
</section>

{#if data.isSuperAdmin}
	<section class="card" style="margin-bottom:22px">
		<div style="font-weight:700;font-size:18px;margin-bottom:4px">Companies &amp; brands</div>
		<p class="muted" style="margin:0 0 16px;font-size:13px">
			Each company's brand theme styles the candidate portal, onboarding pages and emails.
		</p>
		{#if form?.companyError}<p class="error">{form.companyError}</p>{/if}

		<div class="co-list">
			{#each data.companies as company}
				<form method="POST" action="?/setCompanyBrand" use:enhance class="co-row">
					<input type="hidden" name="companyId" value={company.id} />
					<div class="co-name">
						<span class="co-swatch" style:background={brandColor(company.brandSlug)}></span>
						{company.name}
					</div>
					<select name="brandSlug" value={company.brandSlug ?? ''}>
						<option value="">— No brand (default) —</option>
						{#each data.brandOptions as b}
							<option value={b.slug}>{b.name}</option>
						{/each}
					</select>
					<button class="btn" style="padding:9px 16px;font-size:13px">Save</button>
					{#if form?.brandSaved === company.id}<span class="saved-chip">Saved ✓</span>{/if}
				</form>
			{/each}
		</div>

		<div style="font-weight:700;font-size:14px;margin:20px 0 10px">Add a company</div>
		<form method="POST" action="?/createCompany" use:enhance class="add-co-grid">
			<input name="name" placeholder="Company name" required />
			<select name="brandSlug">
				<option value="">— No brand (default) —</option>
				{#each data.brandOptions as b}
					<option value={b.slug}>{b.name}</option>
				{/each}
			</select>
			<button class="btn">Add company</button>
		</form>
		{#if form?.companyCreated}
			<p class="muted" style="margin-top:8px">Added <strong>{form.companyCreated}</strong>.</p>
		{/if}
	</section>
{/if}

<section class="table-card">
	<div class="thead">
		<div>Candidate</div>
		<div>Company</div>
		<div>Track</div>
		<div>Status</div>
		<div>Submitted</div>
		<div></div>
	</div>
	{#if data.candidates.length === 0}
		<p class="muted" style="padding:16px 18px">No candidates yet — generate the first link above.</p>
	{:else}
		{#each data.candidates as c}
			<a class="trow" href="/admin/candidates/{c.id}">
				<div>
					<div style="font-weight:700;font-size:14px;color:var(--ink)">{c.fullName || c.email}</div>
					<div style="font-size:12px;color:var(--smoke)">{c.email}</div>
				</div>
				<div class="tcell">{c.company}</div>
				<div class="tcell">{TRACK_LABELS[c.track as Track]}</div>
				<div><span class="pill {statusMeta[c.status]?.cls}">{statusMeta[c.status]?.label ?? c.status}</span></div>
				<div class="tcell" style="color:var(--smoke)">
					{c.submittedAt ? new Date(c.submittedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : '—'}
				</div>
				<div class="review-cta">
					Review
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M9 6l6 6-6 6" /></svg>
				</div>
			</a>
		{/each}
	{/if}
</section>

<style>
	.page-title {
		font-size: 30px;
		font-weight: 800;
		margin: 0 0 4px;
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 14px;
		margin-bottom: 22px;
	}
	.stat-card {
		background: #fff;
		border: 1px solid var(--border);
		border-radius: 16px;
		padding: 18px 20px;
		box-shadow: 0 4px 12px rgba(11, 7, 24, 0.05);
	}
	.stat-label {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--smoke);
		margin-bottom: 8px;
	}
	.stat-value {
		font-size: 32px;
		font-weight: 800;
		letter-spacing: -0.02em;
	}
	.gen-grid {
		display: grid;
		grid-template-columns: 1.2fr 1.4fr 0.9fr 0.9fr 1fr auto;
		gap: 12px;
		align-items: end;
	}
	.linkbox {
		margin-top: 16px;
		background: #f6fcfc;
		border: 1px solid #cfebed;
		border-radius: 14px;
		padding: 15px 16px;
	}
	.linkcode {
		font-size: 12.5px;
		background: #fff;
		border: 1px solid #cfebed;
		border-radius: 8px;
		padding: 7px 11px;
		color: var(--teal);
		overflow-wrap: anywhere;
	}
	.teal-pill-btn {
		border: 1px solid #cfebed;
		background: #fff;
		color: var(--teal);
		font-family: 'Montserrat', Arial, sans-serif;
		font-weight: 700;
		font-size: 12px;
		padding: 7px 13px;
		border-radius: 999px;
		cursor: pointer;
		text-decoration: none;
	}
	.co-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.co-row {
		display: grid;
		grid-template-columns: 1.5fr 1fr auto auto;
		gap: 12px;
		align-items: center;
	}
	.co-name {
		display: flex;
		align-items: center;
		gap: 9px;
		font-weight: 700;
		font-size: 14px;
	}
	.co-swatch {
		width: 14px;
		height: 14px;
		border-radius: 4px;
		flex-shrink: 0;
		border: 1px solid var(--border);
	}
	.saved-chip {
		font-size: 12px;
		font-weight: 700;
		color: var(--teal);
	}
	.add-co-grid {
		display: grid;
		grid-template-columns: 1.5fr 1fr auto;
		gap: 12px;
		align-items: end;
	}
	.table-card {
		background: #fff;
		border: 1px solid var(--border);
		border-radius: 20px;
		padding: 8px 8px 6px;
		box-shadow: 0 4px 12px rgba(11, 7, 24, 0.05);
		overflow: hidden;
	}
	.thead,
	.trow {
		display: grid;
		grid-template-columns: 1.6fr 1fr 0.8fr 1.2fr 0.7fr auto;
		gap: 12px;
		padding: 14px 18px;
		align-items: center;
	}
	.thead {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--smoke);
	}
	.trow {
		border-top: 1px solid var(--mist);
		text-decoration: none;
		border-radius: 12px;
		transition: background 0.15s;
	}
	.trow:hover {
		background: #faf8fd;
	}
	.tcell {
		font-size: 13px;
		color: var(--fg-2);
	}
	.review-cta {
		color: var(--purple);
		font-weight: 700;
		font-size: 13px;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		justify-self: end;
	}
	@media (max-width: 900px) {
		.stats {
			grid-template-columns: repeat(2, 1fr);
		}
		.gen-grid {
			grid-template-columns: 1fr 1fr;
		}
		.co-row,
		.add-co-grid {
			grid-template-columns: 1fr;
		}
		.thead {
			display: none;
		}
		.trow {
			grid-template-columns: 1fr auto;
			row-gap: 4px;
		}
		.tcell {
			display: none;
		}
	}
</style>
