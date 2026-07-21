<script lang="ts">
	import { enhance } from '$app/forms';
	import GlassSelect from '$lib/components/GlassSelect.svelte';

	let { data, form } = $props();

	// GlassSelect is controlled: seed the "add company" brand to no-brand,
	// and keep a per-company map so each row's dropdown submits its own value.
	let newBrandSlug = $state('');
	let rowBrandSlug = $state<Record<string, string>>(
		Object.fromEntries(data.companies.map((c: { id: string; brandSlug: string | null }) => [c.id, c.brandSlug ?? '']))
	);

	/** Preview the chosen logo before it is uploaded, so a wrong file is caught
	 *  here rather than after it is live on a candidate's portal. */
	let newLogoPreview: string | null = $state(null);

	function previewLogo(e: Event) {
		const file = (e.target as HTMLInputElement).files?.[0];
		if (!file) {
			newLogoPreview = null;
			return;
		}
		const reader = new FileReader();
		reader.onload = () => (newLogoPreview = String(reader.result));
		reader.readAsDataURL(file);
	}

	/** A company's own uploaded logo wins; otherwise fall back to its brand's art. */
	function logoFor(c: { logoBase64: string | null; brandSlug: string | null }): string | null {
		if (c.logoBase64) return c.logoBase64;
		return data.brandOptions.find((b) => b.slug === c.brandSlug)?.logo ?? null;
	}

	function initials(name: string): string {
		return name
			.replace(/\b(pvt|ltd|private|limited|technologies|group)\b/gi, '')
			.trim()
			.split(/\s+/)
			.slice(0, 2)
			.map((w) => w[0])
			.join('')
			.toUpperCase();
	}
</script>

<h1 class="page-title">Entities</h1>
<p class="muted" style="margin:0 0 22px;font-size:14px">
	Companies you recruit for. Each company's brand theme styles the candidate portal, onboarding
	pages and emails.
</p>

{#if form?.companyError}
	<p class="flash err">{form.companyError}</p>
{:else if form?.companyCreated}
	<p class="flash ok">Added {form.companyCreated}.</p>
{:else if form?.companyDeleted}
	<p class="flash ok">Removed {form.companyDeleted}.</p>
{:else if form?.companyRestored}
	<p class="flash ok">Restored {form.companyRestored}.</p>
{/if}

{#if data.isSuperAdmin}
	<section class="card" style="margin-bottom:22px">
		<h2 class="card-title">Add a company</h2>
		<form
			method="POST"
			action="?/createCompany"
			enctype="multipart/form-data"
			use:enhance={() => {
				return async ({ update }) => {
					newLogoPreview = null;
					await update();
				};
			}}
		>
			<div class="add-grid">
				<label class="field">
					<span>Company name</span>
					<input name="name" placeholder="e.g. Champion Ventures Pvt Ltd" required />
				</label>

				<label class="field">
					<span>Brand theme <em>(optional)</em></span>
					<GlassSelect
						name="brandSlug"
						ariaLabel="Brand theme"
						bind:value={newBrandSlug}
						options={[
							{ value: '', label: '— No brand (default) —' },
							...data.brandOptions.map((b: { slug: string; name: string }) => ({ value: b.slug, label: b.name }))
						]}
					/>
					<small>Sets the colours and fonts of the candidate portal.</small>
				</label>

				<div class="field logo-field">
					<span>Logo</span>
					<div class="logo-row">
						<div class="logo-prev" class:empty={!newLogoPreview}>
							{#if newLogoPreview}
								<img src={newLogoPreview} alt="Logo preview" />
							{:else}
								<span>No logo</span>
							{/if}
						</div>
						<div>
							<input
								type="file"
								name="logo"
								accept="image/png,image/jpeg,image/webp,image/svg+xml"
								onchange={previewLogo}
							/>
							<small>PNG, JPG, WebP or SVG, under 512 KB.</small>
						</div>
					</div>
				</div>
			</div>
			<button class="btn" style="margin-top:14px">Add company</button>
		</form>
	</section>
{/if}

<section class="table-card">
	<div class="ent-head">
		<span>{data.companies.length} companies</span>
	</div>

	{#each data.companies as c (c.id)}
		{@const logo = logoFor(c)}
		<div class="ent">
			<div class="ent-logo">
				{#if logo}
					<img src={logo} alt="" />
				{:else}
					<span class="mono">{initials(c.name)}</span>
				{/if}
			</div>

			<div class="ent-main">
				<div class="ent-name">{c.name}</div>
				<div class="ent-sub">
					{c.candidateCount}
					{c.candidateCount === 1 ? 'candidate' : 'candidates'}
				</div>
			</div>

			{#if data.isSuperAdmin}
				<form method="POST" action="?/setCompanyBrand" use:enhance class="ent-form">
					<input type="hidden" name="companyId" value={c.id} />
					<GlassSelect
						name="brandSlug"
						ariaLabel="Brand theme"
						bind:value={rowBrandSlug[c.id]}
						options={[
							{ value: '', label: '— No brand —' },
							...data.brandOptions.map((b: { slug: string; name: string }) => ({ value: b.slug, label: b.name }))
						]}
					/>
					<button class="btn ghost small">Save</button>
				</form>

				<form
					method="POST"
					action="?/setCompanyLogo"
					enctype="multipart/form-data"
					use:enhance
					class="ent-form"
				>
					<input type="hidden" name="companyId" value={c.id} />
					<label class="filebtn">
						Logo
						<input
							type="file"
							name="logo"
							accept="image/png,image/jpeg,image/webp,image/svg+xml"
							onchange={(e) => (e.currentTarget.form as HTMLFormElement).requestSubmit()}
						/>
					</label>
				</form>

				<form
					method="POST"
					action="?/deleteCompany"
					use:enhance
					class="ent-form"
					onsubmit={(e) => {
						if (!confirm(`Remove ${c.name}? This cannot be undone.`)) e.preventDefault();
					}}
				>
					<input type="hidden" name="companyId" value={c.id} />
					<button
						class="btn ghost small danger-hover"
						type="submit"
						disabled={c.candidateCount > 0}
						title={c.candidateCount > 0 ? `Has ${c.candidateCount} candidate${c.candidateCount === 1 ? '' : 's'} — move or delete those first` : ''}
					>
						Delete
					</button>
				</form>
			{:else}
				<span class="ent-brand">
					{data.brandOptions.find((b) => b.slug === c.brandSlug)?.name ?? 'No brand'}
				</span>
			{/if}
		</div>
	{/each}
</section>

{#if data.isSuperAdmin && data.deactivated.length}
	<section class="table-card deactivated-card">
		<div class="ent-head">
			<span>{data.deactivated.length} removed {data.deactivated.length === 1 ? 'entity' : 'entities'}</span>
		</div>
		{#each data.deactivated as c (c.id)}
			<div class="ent">
				<div class="ent-logo ent-logo-off">
					<span class="mono">{initials(c.name)}</span>
				</div>
				<div class="ent-main">
					<div class="ent-name">{c.name}</div>
					<div class="ent-sub">
						{c.candidateCount}
						{c.candidateCount === 1 ? 'candidate' : 'candidates'} · removed
					</div>
				</div>
				<form method="POST" action="?/restoreCompany" use:enhance class="ent-form">
					<input type="hidden" name="companyId" value={c.id} />
					<button class="btn ghost small">Restore</button>
				</form>
			</div>
		{/each}
	</section>
{/if}

<style>
	.card-title {
		font-family: var(--ae-font-display);
		font-size: 18px;
		font-weight: 600;
		margin: 0 0 16px;
		color: var(--ae-text);
	}
	.add-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 14px;
	}
	.field {
		display: flex;
		flex-direction: column;
		gap: 5px;
	}
	.field > span {
		font-size: 12px;
		font-weight: 500;
		color: var(--ae-text-2);
	}
	.field em {
		font-style: normal;
		font-weight: 500;
	}
	.field small {
		font-size: 11.5px;
		color: var(--ae-muted);
	}
	.logo-field {
		grid-column: 1 / -1;
	}
	.logo-row {
		display: flex;
		align-items: center;
		gap: 14px;
		flex-wrap: wrap;
	}
	.logo-prev {
		width: 84px;
		height: 52px;
		border: 1px solid var(--border);
		border-radius: 8px;
		display: grid;
		place-items: center;
		overflow: hidden;
		background: #f4f4f0;
		border-color: var(--ae-line-strong);
		flex: none;
	}
	.logo-prev.empty {
		border-style: dashed;
		font-size: 11px;
		color: var(--ae-muted);
		background: var(--ae-sub-bg);
	}
	.logo-prev img {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
	}

	.ent-head {
		padding: 12px 18px;
		background: var(--ae-input-bg);
		border-bottom: 1px solid var(--ae-line-strong);
		font-family: var(--ae-font-mono);
		font-size: 10px;
		font-weight: 600;
		color: var(--ae-muted);
		text-transform: uppercase;
		letter-spacing: 0.1em;
	}
	.deactivated-card {
		margin-top: 22px;
		opacity: 0.82;
	}
	.deactivated-card .ent-name {
		color: var(--ae-text-2);
	}
	.ent-logo-off {
		background: transparent;
		border-style: dashed;
	}
	.ent {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 11px 16px;
		border-bottom: 1px solid var(--ae-line-soft);
		flex-wrap: wrap;
	}
	.ent:last-child {
		border-bottom: none;
	}
	.ent-logo {
		width: 44px;
		height: 32px;
		flex: none;
		display: grid;
		place-items: center;
		border: 1px solid var(--ae-line-strong);
		border-radius: 6px;
		background: #f4f4f0;
		overflow: hidden;
	}
	.ent-logo img {
		max-width: 100%;
		max-height: 100%;
		object-fit: contain;
	}
	.mono {
		font-family: var(--ae-font-mono);
		font-size: 11px;
		font-weight: 600;
		color: var(--ae-muted);
	}
	.ent-main {
		flex: 1;
		min-width: 160px;
	}
	.ent-name {
		font-weight: 500;
		font-size: 14px;
		color: var(--ae-text);
	}
	.ent-sub {
		font-family: var(--ae-font-mono);
		font-size: 11px;
		color: var(--ae-muted);
		font-variant-numeric: tabular-nums;
	}
	.ent-brand {
		font-size: 12.5px;
		color: var(--ae-muted);
	}
	.ent-form {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	/* Keep the inline-row dropdown compact — GlassSelect fills its container. */
	.ent-form :global(.gs) {
		width: auto;
		min-width: 180px;
	}
	.ent-form :global(.gs-trigger) {
		padding: 7px 10px;
		font-size: 12.5px;
	}
	.danger-hover:hover:not(:disabled) {
		border-color: var(--ae-crimson) !important;
		color: var(--ae-crimson) !important;
	}
	.filebtn {
		position: relative;
		overflow: hidden;
		display: inline-flex;
		align-items: center;
		border: 1px solid var(--ae-line-strong);
		border-radius: 8px;
		padding: 6px 11px;
		font-size: 12.5px;
		font-weight: 500;
		cursor: pointer;
		background: var(--ae-input-bg);
		color: var(--ae-text-2);
	}
	.filebtn input {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
	}
	.flash {
		border-radius: 8px;
		padding: 9px 12px;
		font-size: 13px;
		margin: 0 0 16px;
	}
	.flash.err {
		background: rgba(240, 117, 117, 0.12);
		border: 1px solid rgba(240, 117, 117, 0.3);
		color: var(--ae-crimson);
	}
	.flash.ok {
		background: rgba(62, 207, 154, 0.08);
		border: 1px solid rgba(62, 207, 154, 0.25);
		color: var(--ae-verdant);
	}
	@media (max-width: 640px) {
		.add-grid {
			grid-template-columns: 1fr;
		}
	}
</style>
