<script lang="ts">
	import { enhance } from '$app/forms';
	import GlassSelect from '$lib/components/GlassSelect.svelte';

	let { data, form } = $props();

	// GlassSelect is controlled: seed the "add company" brand to no-brand,
	// and keep a per-company map so each row's dropdown submits its own value.
	let newBrandSlug = $state('');
	// Deliberate seed-once: each row's dropdown is user-editable after this,
	// and re-deriving from `data.companies` on every reload (e.g. after this
	// same page's own createCompany/setCompanyBrand use:enhance refresh)
	// would wipe out an in-progress row edit before it's submitted.
	// svelte-ignore state_referenced_locally
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

	/** The entity whose logo is open in the preview, or null. Holds the resolved
	 *  art rather than the row, so the modal does not have to re-run logoFor. */
	let previewing: { name: string; logo: string | null; ink: string } | null = $state(null);

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
					<button
						type="button"
						class="logo-preview-btn"
						onclick={() =>
							(previewing = {
								name: c.name,
								logo,
								ink: data.brandOptions.find((b) => b.slug === c.brandSlug)?.primary ?? '#1a1a1a'
							})}
					>
						Preview logo
					</button>
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
	<details class="bin">
		<summary>
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18" /><path d="M8 6V4a1 1 0 0 1 1-1h6a1 1 0 0 1 1 1v2" /><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
			Recently deleted
			<span class="bin-count">{data.deactivated.length}</span>
		</summary>
		<div class="bin-body">
			{#each data.deactivated as c (c.id)}
				<div class="bin-row">
					<span class="mono">{initials(c.name)}</span>
					<div class="bin-main">
						<div class="ent-name">{c.name}</div>
						<div class="ent-sub">
							{c.candidateCount}
							{c.candidateCount === 1 ? 'candidate' : 'candidates'}
						</div>
					</div>
					<form method="POST" action="?/restoreCompany" use:enhance class="ent-form">
						<input type="hidden" name="companyId" value={c.id} />
						<button class="btn ghost small">Restore</button>
					</form>
				</div>
			{/each}
		</div>
	</details>
{/if}

<!-- Logo preview. Three grounds on purpose: white is how the offer letter and
     the portal show it, the brand colour exposes a white halo or a grey fringe
     left by a bad background removal, and the checkerboard shows exactly which
     pixels are actually transparent. A logo that looks fine on white and wrong
     on the other two has not really been cut out. -->
{#if previewing}
	<div
		class="lp-backdrop"
		role="button"
		tabindex="0"
		onclick={() => (previewing = null)}
		onkeydown={(e) => e.key === 'Escape' && (previewing = null)}
	>
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div
			class="lp-panel"
			role="dialog"
			aria-modal="true"
			tabindex="-1"
			aria-label="Logo preview"
			onclick={(e) => e.stopPropagation()}
			onkeydown={(e) => e.stopPropagation()}
		>
			<div class="lp-head">
				<strong>{previewing.name}</strong>
				<button type="button" class="lp-close" onclick={() => (previewing = null)}>Close</button>
			</div>
			{#if previewing.logo}
				<div class="lp-grid">
					<figure>
						<div class="lp-ground lp-white"><img src={previewing.logo} alt="" /></div>
						<figcaption>On white — offer letter &amp; portal</figcaption>
					</figure>
					<figure>
						<div class="lp-ground" style="background:{previewing.ink}">
							<img src={previewing.logo} alt="" />
						</div>
						<figcaption>On brand colour — shows any halo or fringe</figcaption>
					</figure>
					<figure>
						<div class="lp-ground lp-checker"><img src={previewing.logo} alt="" /></div>
						<figcaption>Transparency — chequers must show through</figcaption>
					</figure>
				</div>
			{:else}
				<p class="lp-none">No logo set for this entity — letters fall back to a text monogram.</p>
			{/if}
		</div>
	</div>
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
	/* Recently-deleted bin — collapsed by default so it never competes with the
	   live entities list above; a quiet affordance, not a second table. */
	.bin {
		margin-top: 26px;
	}
	.bin summary {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		cursor: pointer;
		list-style: none;
		font-size: 12.5px;
		font-weight: 500;
		color: var(--ae-muted);
		padding: 6px 2px;
		user-select: none;
	}
	.bin summary::-webkit-details-marker {
		display: none;
	}
	.bin summary:hover {
		color: var(--ae-text-2);
	}
	.bin summary svg {
		flex: none;
		opacity: 0.8;
	}
	.bin-count {
		font-family: var(--ae-font-mono);
		font-size: 10.5px;
		font-weight: 600;
		color: var(--ae-muted);
		background: var(--ae-input-bg);
		border: 1px solid var(--ae-line-strong);
		border-radius: 999px;
		padding: 1px 7px;
	}
	.bin[open] summary {
		color: var(--ae-text-2);
		margin-bottom: 8px;
	}
	.bin-body {
		border: 1px dashed var(--ae-line-strong);
		border-radius: 10px;
		overflow: hidden;
	}
	.bin-row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 9px 14px;
		border-bottom: 1px solid var(--ae-line-soft);
		opacity: 0.85;
	}
	.bin-row:last-child {
		border-bottom: none;
	}
	.bin-row .mono {
		width: 32px;
		height: 32px;
		flex: none;
		display: grid;
		place-items: center;
		border: 1px dashed var(--ae-line-strong);
		border-radius: 6px;
	}
	.bin-main {
		flex: 1;
		min-width: 140px;
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

	.logo-preview-btn {
		margin-left: 10px;
		background: none;
		border: 0;
		padding: 0;
		font: inherit;
		font-size: 11.5px;
		color: var(--ae-accent, #0b63ce);
		text-decoration: underline;
		cursor: pointer;
	}
	.lp-backdrop {
		position: fixed;
		inset: 0;
		background: rgba(0, 0, 0, 0.55);
		display: grid;
		place-items: center;
		padding: 24px;
		z-index: 60;
	}
	/* Uses the app's own card variables, and sets colour explicitly: a hardcoded
	   white panel inherits the dark theme's light text and the headings vanish. */
	.lp-panel {
		background: var(--ae-card-bg, #fff);
		color: var(--ae-text, #101828);
		border: 1px solid var(--ae-card-border, #e4e7ec);
		border-radius: var(--ae-card-radius, 12px);
		box-shadow: var(--ae-card-shadow, 0 18px 50px rgba(0, 0, 0, 0.35));
		backdrop-filter: blur(var(--ae-card-blur, 0));
		padding: 20px 22px;
		width: min(880px, 100%);
		max-height: 90vh;
		overflow: auto;
	}
	.lp-head {
		display: flex;
		align-items: center;
		gap: 12px;
		margin-bottom: 16px;
	}
	.lp-head strong {
		flex: 1;
		font-size: 15px;
	}
	.lp-close {
		border: 1px solid var(--ae-line-strong, #ccc);
		background: none;
		color: inherit;
		border-radius: 6px;
		padding: 5px 12px;
		font: inherit;
		font-size: 12.5px;
		cursor: pointer;
	}
	.lp-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(230px, 1fr));
		gap: 14px;
	}
	.lp-ground {
		height: 150px;
		display: grid;
		place-items: center;
		border: 1px solid var(--ae-line-strong, #ccc);
		border-radius: 8px;
		padding: 14px;
	}
	.lp-ground img {
		max-width: 100%;
		max-height: 122px;
		object-fit: contain;
	}
	.lp-white {
		background: #ffffff;
	}
	/* 10px chequers — anything the cutout missed reads as a solid patch. */
	.lp-checker {
		background-image:
			linear-gradient(45deg, #c9c9c9 25%, transparent 25%),
			linear-gradient(-45deg, #c9c9c9 25%, transparent 25%),
			linear-gradient(45deg, transparent 75%, #c9c9c9 75%),
			linear-gradient(-45deg, transparent 75%, #c9c9c9 75%);
		background-size: 20px 20px;
		background-position: 0 0, 0 10px, 10px -10px, -10px 0;
		background-color: #ffffff;
	}
	.lp-grid figcaption {
		margin-top: 6px;
		font-size: 11px;
		color: var(--ae-text-2, #475467);
		text-align: center;
	}
	.lp-grid figure {
		margin: 0;
	}
	.lp-none {
		font-size: 13px;
		opacity: 0.75;
	}
</style>
