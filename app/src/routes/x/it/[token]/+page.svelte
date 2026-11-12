<script lang="ts">
	import { enhance } from '$app/forms';
	import { brandCssVars, brandFontsHref } from '$lib/shared/brands';

	let { data, form } = $props();

	const brand = $derived(data.brand);
	const brandStyle = $derived(brandCssVars(brand));
	const fontsHref = $derived(brandFontsHref(brand));
	const emp = $derived(data.employee);
	let sending = $state(false);

	function stamp(iso: string): string {
		return new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
	}
</script>

<svelte:head>
	<title>Confirm access blocked · {data.companyName}</title>
	{#if fontsHref}<link rel="stylesheet" href={fontsHref} />{/if}
</svelte:head>

<div class="scope" style={brandStyle}>
	<main class="wrap">
		<div class="brand-row">
			<img class="logo" src={brand.logo.src} alt={brand.name} />
		</div>

		<div class="card">
			<div class="hero">
				<div class="hero-eyebrow">IT · employee exit</div>
				<h1>Block system access</h1>
				<p class="lede">
					HR has asked the IT desk to block this employee's system access and official logins. Once it is
					done, confirm it here — HR sees it on the exit straight away.
				</p>
			</div>

			<div class="body">
				<div class="summary">
					<div class="srow"><span>Employee ID</span><b>{emp.employeeId || '—'}</b></div>
					<div class="srow"><span>Employee name</span><b>{emp.fullName || '—'}</b></div>
					<div class="srow"><span>Last working day</span><b>{emp.lwd || '—'}</b></div>
					<div class="srow"><span>Team</span><b>{emp.team || '—'}</b></div>
				</div>

				{#if data.confirmed}
					<div class="done">
						<b>Access blocked — confirmed ✓</b>
						<p>
							{stamp(data.confirmed.at)}{#if data.confirmed.by} · {data.confirmed.by}{/if}
						</p>
						{#if data.confirmed.note}<p class="muted">“{data.confirmed.note}”</p>{/if}
						<p class="muted">Nothing more is needed. You can close this page.</p>
					</div>
				{:else}
					<form
						method="POST"
						action="?/confirm"
						use:enhance={() => {
							sending = true;
							return async ({ update }) => {
								await update({ reset: false });
								sending = false;
							};
						}}
					>
						<label class="f">
							<span>Your name</span>
							<input name="name" required maxlength="80" autocomplete="name" value={form?.name ?? ''} />
						</label>
						<label class="f">
							<span>Note for HR <small>(optional)</small></span>
							<textarea name="note" rows="3" maxlength="500" placeholder="e.g. AD account disabled, mail forwarding set to the manager">{form?.note ?? ''}</textarea>
						</label>
						{#if form?.message}<p class="err">{form.message}</p>{/if}
						<button class="btn" disabled={sending}>{sending ? 'Confirming…' : 'Confirm access is blocked'}</button>
					</form>
				{/if}
			</div>
		</div>
		<p class="foot">{data.companyName} · offboarding</p>
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
		max-width: 620px;
		margin: 0 auto;
		padding: 32px 16px 70px;
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
	.card {
		background: var(--brand-surface, #fff);
		border: 1px solid var(--brand-border, #e6e6ee);
		border-radius: var(--brand-card-radius, 16px);
		overflow: hidden;
	}
	.hero {
		background: var(--brand-hero, linear-gradient(135deg, #2b2b40, #14141f));
		color: #fff;
		padding: 30px 28px 26px;
	}
	.hero-eyebrow {
		font-size: 11px;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		opacity: 0.75;
		margin-bottom: 10px;
	}
	.hero h1 {
		margin: 0 0 10px;
		font-size: 23px;
		font-weight: 700;
	}
	.lede {
		margin: 0;
		font-size: 14px;
		line-height: 1.65;
		opacity: 0.9;
	}
	.body {
		padding: 24px 28px 28px;
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
		padding: 10px 15px;
		font-size: 13.5px;
		border-bottom: 1px solid var(--brand-border, #e6e6ee);
	}
	.srow:last-child {
		border-bottom: none;
	}
	.srow span,
	.muted {
		color: var(--brand-muted, #71717f);
	}
	form {
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.f {
		display: flex;
		flex-direction: column;
		gap: 6px;
		font-size: 13px;
		font-weight: 600;
	}
	.f small {
		font-weight: 400;
		color: var(--brand-muted, #71717f);
	}
	.f input,
	.f textarea {
		font: inherit;
		font-weight: 400;
		font-size: 14px;
		padding: 10px 12px;
		border: 1px solid var(--brand-border, #d0d5dd);
		border-radius: 9px;
		background: #fff;
		color: inherit;
	}
	.btn {
		align-self: flex-start;
		background: var(--brand-primary, #6b4cf6);
		color: var(--brand-on-primary, #fff);
		border: none;
		border-radius: var(--brand-btn-radius, 10px);
		padding: 12px 22px;
		font: inherit;
		font-weight: 700;
		font-size: 14px;
		cursor: pointer;
	}
	.btn:disabled {
		opacity: 0.6;
		cursor: default;
	}
	.err {
		margin: 0;
		color: #c0392b;
		font-size: 13px;
	}
	.done {
		border: 1px solid color-mix(in srgb, #12a37b 40%, transparent);
		background: color-mix(in srgb, #12a37b 8%, transparent);
		border-radius: 11px;
		padding: 14px 16px;
	}
	.done b {
		color: #0e8a68;
	}
	.done p {
		margin: 6px 0 0;
		font-size: 13px;
	}
	.foot {
		text-align: center;
		font-size: 11.5px;
		color: var(--brand-muted, #71717f);
		margin: 20px 0 0;
	}
	@media (max-width: 560px) {
		.hero,
		.body {
			padding-left: 18px;
			padding-right: 18px;
		}
	}
</style>
