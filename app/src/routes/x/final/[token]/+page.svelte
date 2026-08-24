<script lang="ts">
	import { page } from '$app/state';
	import { brandCssVars, brandFontsHref } from '$lib/shared/brands';

	let { data } = $props();

	const brand = $derived(data.brand);
	const brandStyle = $derived(brandCssVars(brand));
	const fontsHref = $derived(brandFontsHref(brand));
	const s = $derived(data.settlement);

	function kb(bytes: number): string {
		return bytes > 1024 * 1024
			? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
			: `${Math.max(1, Math.round(bytes / 1024))} KB`;
	}

	const summary = $derived(
		[
			{ label: 'Full & final settlement', value: s.netAmount },
			{ label: 'Settlement date', value: s.settlementDate },
			{ label: 'Leave encashment', value: s.leaveEncashment }
		].filter((r) => r.value)
	);
</script>

<svelte:head>
	<title>Your exit documents · {data.companyName}</title>
	{#if fontsHref}<link rel="stylesheet" href={fontsHref} />{/if}
</svelte:head>

<div class="scope" style={brandStyle}>
	<main class="wrap">
		<div class="brand-row">
			<img class="logo" src={brand.logo.src} alt={brand.name} />
		</div>

		<div class="hero-card">
			<div class="hero">
				<div class="hero-eyebrow">Exit complete</div>
				<h1>Your documents are ready, {data.employee.fullName.split(' ')[0]}</h1>
				<p class="lede">
					Thank you for everything you brought to {data.companyName}. Your closing documents are
					below — please download and keep them, as you may need them for your next employer or for
					tax filing.
				</p>
				<div class="chips">
					<span class="chip">{data.employee.employeeId}</span>
					{#if data.employee.designation}<span class="chip">{data.employee.designation}</span>{/if}
					{#if data.employee.service}<span class="chip">{data.employee.service}</span>{/if}
					{#if data.employee.lwd}<span class="chip">Last day {data.employee.lwd}</span>{/if}
				</div>
			</div>

			<div class="body">
				{#if summary.length}
					<div class="eyebrow">Settlement</div>
					<div class="summary">
						{#each summary as row}
							<div class="srow">
								<span>{row.label}</span>
								<b>{row.value}</b>
							</div>
						{/each}
					</div>
				{/if}

				{#if data.files.length}
					<div class="eyebrow">Your documents</div>
					<div class="dl-list">
						{#each data.files as f}
							<a class="dl" href="/x/final/{page.params.token}/file/{f.id}" data-sveltekit-preload-data="off">
								<span class="dl-ico">
									<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
								</span>
								<span class="dl-main">
									<b>{f.label}</b>
									<em>{kb(f.sizeBytes)}</em>
								</span>
								<span class="dl-arrow">
									<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3v12" /><path d="M7 10l5 5 5-5" /><path d="M4 21h16" /></svg>
								</span>
							</a>
						{/each}
					</div>
				{:else}
					<p class="note">
						Your documents are being finalised and will appear here shortly. This link stays valid,
						so you can come back to it.
					</p>
				{/if}

				{#if s.pfProcessed}
					<div class="block">
						<div class="eyebrow">Provident fund</div>
						<div class="summary">
							{#if s.uanNo}
								<div class="srow"><span>UAN</span><b>{s.uanNo}</b></div>
							{/if}
							{#if s.pfDateOfExit}
								<div class="srow"><span>Date of exit (EPFO)</span><b>{s.pfDateOfExit}</b></div>
							{/if}
						</div>
						<p class="note">
							{s.pfRemarks ??
								'Your date of exit has been updated with the EPFO. You can now withdraw or transfer your PF from the EPFO member portal using your UAN.'}
						</p>
					</div>
				{/if}

				{#if s.taxationApplicable}
					<div class="block">
						<div class="eyebrow">Taxation</div>
						<p class="note">
							{s.taxationRemarks ??
								'Your Form 16 / tax deduction details are included above or will be issued separately for the relevant financial year.'}
						</p>
					</div>
				{/if}

				{#if data.documents.length}
					<div class="block">
						<div class="eyebrow">Your signed exit forms</div>
						<p class="note" style="margin-top:0">
							Copies of what you completed during your exit, for your own records.
						</p>
						<div class="dl-inline">
							{#each data.documents as d}
								<a class="dl small" href="/x/final/{page.params.token}/doc/{d.key}" data-sveltekit-preload-data="off">
									{d.label}
								</a>
							{/each}
						</div>
					</div>
				{/if}

				<hr />
				<p class="fine">
					Questions about anything here? Reply to the email that brought you to this page and our HR
					desk will pick it up. We wish you every success ahead.
				</p>
			</div>
		</div>

		<p class="foot">{brand.legalName}</p>
	</main>
</div>

<style>
	.scope {
		background: var(--brand-bg, #f7f7fb);
		min-height: 100vh;
		font-family: var(--brand-font-body, system-ui, sans-serif);
		color: var(--brand-text, #23232b);
	}
	.scope :global(h1) {
		font-family: var(--brand-font-heading, inherit);
	}
	.wrap {
		max-width: 700px;
		margin: 0 auto;
		padding: 32px 18px 70px;
	}
	.brand-row {
		margin-bottom: 20px;
	}
	.logo {
		height: 32px;
		width: auto;
		display: block;
		background: var(--brand-logo-bg);
		padding: var(--brand-logo-pad);
		border-radius: 6px;
	}
	.hero-card {
		background: var(--brand-surface, #fff);
		border: 1px solid var(--brand-border, #e6e6ee);
		border-radius: var(--brand-card-radius, 16px);
		overflow: hidden;
	}
	.hero {
		background: var(--brand-hero, linear-gradient(135deg, #2b2b40, #14141f));
		color: #fff;
		padding: 36px 30px 30px;
	}
	.hero-eyebrow {
		font-size: 11px;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		opacity: 0.75;
		margin-bottom: 12px;
	}
	.hero h1 {
		margin: 0 0 12px;
		font-size: 25px;
		font-weight: 700;
		line-height: 1.24;
	}
	.lede {
		margin: 0;
		font-size: 14.5px;
		line-height: 1.68;
		opacity: 0.9;
		max-width: 52ch;
	}
	.chips {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		margin-top: 20px;
	}
	.chip {
		background: rgba(255, 255, 255, 0.14);
		border-radius: 999px;
		padding: 5px 12px;
		font-size: 12px;
	}
	.body {
		padding: 26px 30px 30px;
	}
	.eyebrow {
		font-size: 11px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--brand-primary, #6b4cf6);
		font-weight: 600;
		margin-bottom: 11px;
	}
	.summary {
		border: 1px solid var(--brand-border, #e6e6ee);
		border-radius: 11px;
		overflow: hidden;
		margin-bottom: 22px;
	}
	.srow {
		display: flex;
		justify-content: space-between;
		gap: 14px;
		padding: 11px 15px;
		font-size: 13.5px;
		border-bottom: 1px solid var(--brand-border, #e6e6ee);
	}
	.srow:last-child {
		border-bottom: none;
	}
	.srow span {
		color: var(--brand-muted, #71717f);
	}
	.dl-list {
		display: flex;
		flex-direction: column;
		gap: 8px;
		margin-bottom: 4px;
	}
	.dl {
		display: flex;
		align-items: center;
		gap: 12px;
		border: 1px solid var(--brand-border, #e6e6ee);
		border-radius: 10px;
		padding: 12px 15px;
		text-decoration: none;
		color: inherit;
		transition: border-color 0.14s, background 0.14s;
	}
	.dl:hover {
		border-color: var(--brand-primary, #6b4cf6);
		background: color-mix(in srgb, var(--brand-primary, #6b4cf6) 4%, transparent);
	}
	.dl-ico {
		color: var(--brand-primary, #6b4cf6);
		display: grid;
		place-items: center;
		flex: none;
	}
	.dl-main {
		flex: 1;
		display: flex;
		flex-direction: column;
		gap: 1px;
		min-width: 0;
	}
	.dl-main b {
		font-size: 13.5px;
		font-weight: 600;
	}
	.dl-main em {
		font-style: normal;
		font-size: 11.5px;
		color: var(--brand-muted, #71717f);
	}
	.dl-arrow {
		color: var(--brand-muted, #71717f);
		flex: none;
	}
	.dl.small {
		display: inline-flex;
		padding: 7px 12px;
		font-size: 12.5px;
		color: var(--brand-primary, #6b4cf6);
		border-color: color-mix(in srgb, var(--brand-primary, #6b4cf6) 28%, transparent);
	}
	.dl-inline {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.block {
		margin-top: 24px;
	}
	.note {
		font-size: 12.5px;
		line-height: 1.7;
		color: var(--brand-muted, #71717f);
		margin: 10px 0 0;
	}
	hr {
		border: none;
		height: 1px;
		background: var(--brand-border, #e6e6ee);
		margin: 26px 0 18px;
	}
	.fine {
		font-size: 12.5px;
		line-height: 1.7;
		color: var(--brand-muted, #71717f);
		margin: 0;
	}
	.foot {
		text-align: center;
		font-size: 11.5px;
		color: var(--brand-muted, #71717f);
		margin: 22px 0 0;
	}
	@media (max-width: 560px) {
		.hero,
		.body {
			padding-left: 20px;
			padding-right: 20px;
		}
	}
</style>
