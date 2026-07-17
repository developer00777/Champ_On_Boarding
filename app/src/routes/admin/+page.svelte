<script lang="ts">
	import { enhance } from '$app/forms';
	import { TRACK_LABELS, type Track } from '$lib/shared/matrix';
	import GlassSelect from '$lib/components/GlassSelect.svelte';

	let { data, form } = $props();

	// GlassSelect is controlled, so the invite form needs its values in state.
	// Seed to the first option, matching how the native <select> defaulted.
	let inviteTrack = $state<string>(data.tracks[0] ?? '');
	let inviteCompany = $state<string>(data.companies[0]?.id ?? '');

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
		{ label: 'Total candidates', value: data.stats.total, color: 'var(--ae-text)' },
		{ label: 'Awaiting review', value: data.stats.awaitingReview, color: 'var(--ae-ember-glow)' },
		{ label: 'In progress', value: data.stats.inProgress, color: 'var(--ae-azure)' },
		{ label: 'Approved', value: data.stats.approved, color: 'var(--ae-verdant)' }
	]);

	function copyLink(link: string) {
		navigator.clipboard.writeText(link);
	}
</script>

<h1 class="page-title">Home</h1>
<p class="muted" style="margin:0 0 22px;font-size:14px">
	Where onboarding stands, and the link you send to start one.
</p>

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
				<GlassSelect
					id="track"
					name="track"
					ariaLabel="Track"
					required
					bind:value={inviteTrack}
					options={data.tracks.map((t: Track) => ({ value: t, label: TRACK_LABELS[t] }))}
				/>
			</div>
			<div>
				<label for="companyId">Company</label>
				<GlassSelect
					id="companyId"
					name="companyId"
					ariaLabel="Company"
					required
					bind:value={inviteCompany}
					options={data.companies.map((c: { id: string; name: string }) => ({ value: c.id, label: c.name }))}
				/>
			</div>
			<button class="btn">Generate &amp; email</button>
		</div>
	</form>
	{#if form?.message}<p class="error">{form.message}</p>{/if}
	{#if form?.link}
		<div class="linkbox">
			<div style="font-size:13px;color:var(--ae-text-2);margin-bottom:9px">
				Link created and emailed to <strong style="color:var(--ae-text);font-weight:500">{form.email}</strong>
			</div>
			<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
				<code class="linkcode">{form.link}</code>
				<button type="button" class="teal-pill-btn" onclick={() => copyLink(form.link)}>Copy link</button>
				<a class="teal-pill-btn" href={form.waUrl} target="_blank" rel="noopener">Share on WhatsApp</a>
			</div>
		</div>
	{/if}
</section>

<section class="table-card recent-card">
	<div class="recent-head">
		<span>Recent candidates</span>
		<a href="/admin/candidates" class="seeall">See all {data.total} →</a>
	</div>
	{#if data.recent.length === 0}
		<p class="muted" style="padding:16px 18px">No candidates yet — generate the first link above.</p>
	{:else}
		{#each data.recent as c (c.id)}
			<a class="trow" href="/admin/candidates/{c.id}">
				<div>
					<div style="font-weight:500;font-size:14px;color:var(--ae-text)">{c.fullName || c.email}</div>
					<div style="font-family:var(--ae-font-mono);font-size:11px;color:var(--ae-muted)">{c.email}</div>
				</div>
				<div class="tcell">{c.company}</div>
				<div class="tcell">{TRACK_LABELS[c.track as Track]}</div>
				<div><span class="pill {statusMeta[c.status]?.cls}">{statusMeta[c.status]?.label ?? c.status}</span></div>
				<div class="review-cta">
					Review
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M9 6l6 6-6 6" /></svg>
				</div>
			</a>
		{/each}
	{/if}
</section>

<style>
	.recent-head {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
		gap: 12px;
		padding: 12px 18px 10px;
		font-family: var(--ae-font-display);
		font-size: 14px;
		font-weight: 600;
		color: var(--ae-text);
	}
	.seeall {
		font-size: 12.5px;
		font-weight: 500;
		color: var(--ae-ember-glow);
		text-decoration: none;
	}
	.seeall:hover {
		text-decoration: underline;
	}
	.stats {
		display: grid;
		grid-template-columns: repeat(4, 1fr);
		gap: 13px;
		margin-bottom: 20px;
	}
	.stat-card {
		background: var(--ae-card-bg);
		border: 1px solid var(--ae-card-border);
		border-radius: var(--ae-card-radius);
		box-shadow: var(--ae-card-shadow);
		backdrop-filter: var(--ae-card-blur);
		-webkit-backdrop-filter: var(--ae-card-blur);
		padding: 18px 20px;
	}
	.stat-label {
		font-family: var(--ae-font-mono);
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--ae-muted);
		margin-bottom: 10px;
	}
	.stat-value {
		font-family: var(--ae-font-display);
		font-size: 30px;
		font-weight: 600;
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
		background: rgba(62, 207, 154, 0.06);
		border: 1px solid rgba(62, 207, 154, 0.2);
		border-radius: 10px;
		padding: 15px 16px;
	}
	.linkcode {
		font-family: var(--ae-font-mono);
		font-size: 12.5px;
		background: #0b0d12;
		border: 1px solid var(--ae-line-strong);
		border-radius: 7px;
		padding: 7px 11px;
		color: var(--ae-ember-glow);
		overflow-wrap: anywhere;
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
	@media (max-width: 900px) {
		.stats {
			grid-template-columns: repeat(2, 1fr);
		}
		.gen-grid {
			grid-template-columns: 1fr 1fr;
		}
	}
</style>
