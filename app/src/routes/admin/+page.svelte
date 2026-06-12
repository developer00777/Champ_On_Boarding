<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	const statusBadge: Record<string, string> = {
		created: '',
		opened: 'blue',
		in_progress: 'blue',
		submitted: 'amber',
		changes_requested: 'red',
		approved: 'green',
		complete: 'green',
		revoked: 'red'
	};

	function copyLink(link: string) {
		navigator.clipboard.writeText(link);
	}
</script>

<section class="card">
	<h2>Generate onboarding link</h2>
	<form method="POST" action="?/generateLink" use:enhance>
		<div class="row">
			<div>
				<label for="candidateName">Candidate name (optional)</label>
				<input id="candidateName" name="candidateName" placeholder="As on offer letter" />
			</div>
			<div>
				<label for="email">Candidate email</label>
				<input id="email" name="email" type="email" required />
			</div>
			<div>
				<label for="track">Track</label>
				<select id="track" name="track" required>
					{#each data.tracks as track}
						<option value={track}>{track[0].toUpperCase() + track.slice(1)}</option>
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
			<div style="align-self:end">
				<button>Generate & email link</button>
			</div>
		</div>
	</form>
	{#if form?.message}<p class="error">{form.message}</p>{/if}
	{#if form?.link}
		<div class="linkbox">
			<p>Link created and emailed to <strong>{form.email}</strong>:</p>
			<code>{form.link}</code>
			<div style="display:flex;gap:.5rem;margin-top:.5rem">
				<button type="button" class="secondary" onclick={() => copyLink(form.link)}>Copy link</button>
				<a class="btn secondary" href={form.waUrl} target="_blank" rel="noopener">Share on WhatsApp</a>
			</div>
		</div>
	{/if}
</section>

<section class="card">
	<h2>Candidates ({data.candidates.length})</h2>
	{#if data.candidates.length === 0}
		<p class="muted">No candidates yet — generate the first link above.</p>
	{:else}
		<table>
			<thead>
				<tr>
					<th>Candidate</th>
					<th>Company</th>
					<th>Track</th>
					<th>Status</th>
					<th>Created</th>
					<th>Submitted</th>
				</tr>
			</thead>
			<tbody>
				{#each data.candidates as c}
					<tr>
						<td>
							<a href="/admin/candidates/{c.id}">{c.fullName || c.email}</a>
							{#if c.fullName}<div class="muted">{c.email}</div>{/if}
						</td>
						<td>{c.company}</td>
						<td>{c.track}</td>
						<td><span class="badge {statusBadge[c.status]}">{c.status.replace('_', ' ')}</span></td>
						<td class="muted">{new Date(c.createdAt).toLocaleDateString('en-IN')}</td>
						<td class="muted">{c.submittedAt ? new Date(c.submittedAt).toLocaleDateString('en-IN') : '—'}</td>
					</tr>
				{/each}
			</tbody>
		</table>
	{/if}
</section>

<style>
	.row {
		display: grid;
		grid-template-columns: 1.2fr 1.2fr 0.8fr 1fr auto;
		gap: 0 1rem;
		align-items: start;
	}
	@media (max-width: 860px) {
		.row {
			grid-template-columns: 1fr 1fr;
		}
	}
	.linkbox {
		margin-top: 1rem;
		padding: 0.75rem;
		background: #f0fdf4;
		border: 1px solid #bbf7d0;
		border-radius: 8px;
		overflow-wrap: anywhere;
	}
</style>
