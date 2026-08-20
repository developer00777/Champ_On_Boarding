<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	/** The stored lists are arrays; the textareas edit them as one address per
	 *  line, which is how HR reads a recipient list. Seeded once — retyping is
	 *  in-progress user input the server round-trip must not clobber. */
	// svelte-ignore state_referenced_locally
	let to = $state(data.itSetupMail.to.join('\n'));
	// svelte-ignore state_referenced_locally
	let cc = $state(data.itSetupMail.cc.join('\n'));

	const isDefault = $derived(
		to.trim() === data.defaults.to.join('\n') && cc.trim() === data.defaults.cc.join('\n')
	);
</script>

<h1 class="page-title">Settings</h1>
<p class="muted" style="margin:0 0 22px;font-size:14px">
	Org-wide operational settings. Every field ships with a working default and only needs changing
	when the desk behind it changes.
</p>

{#if form?.error}
	<p class="flash err">{form.error}</p>
{:else if form?.saved}
	<p class="flash ok">Settings saved.</p>
{:else if form?.reset}
	<p class="flash ok">Reset to defaults.</p>
{/if}

<section class="card">
	<h2 class="card-title">IT &amp; VPN setup mail</h2>
	<p class="muted" style="margin:-8px 0 18px;font-size:13px">
		Sent automatically when a candidate is marked <strong>Accepted</strong>, and re-sendable from
		the candidate page. Carries the system-enablement table (name, DOJ, designation, team,
		reporting head, shift timing, gender, mobile, payroll entity) under the hiring entity's logo.
	</p>

	<form method="POST" action="?/saveItSetupMail" use:enhance>
		<fieldset class="rbac" disabled={!data.isSuperAdmin}>
			<div class="grid">
				<label class="field">
					<span>To</span>
					<textarea name="to" bind:value={to} rows="3" placeholder="one address per line"></textarea>
					<small>One address per line. Semicolons and commas work too.</small>
				</label>
				<label class="field">
					<span>Cc</span>
					<textarea name="cc" bind:value={cc} rows="3" placeholder="one address per line"></textarea>
					<small>Leave empty to copy no one.</small>
				</label>
				<label class="field">
					<span>Sign-off name</span>
					<input name="signoffName" value={data.itSetupMail.signoffName} maxlength="80" />
				</label>
				<label class="field">
					<span>Sign-off designation</span>
					<input
						name="signoffDesignation"
						value={data.itSetupMail.signoffDesignation}
						maxlength="80"
					/>
				</label>
			</div>
			<div class="actions">
				<button class="btn teal">Save</button>
				{#if !isDefault}
					<button class="btn ghost small" formaction="?/resetItSetupMail">Reset to defaults</button>
				{/if}
			</div>
		</fieldset>
	</form>

	{#if !data.isSuperAdmin}
		<p class="muted" style="font-size:12px;margin:12px 0 0">
			View-only — changing these requires a super admin login.
		</p>
	{/if}
</section>

<style>
	.card-title {
		font-family: var(--ae-font-display);
		font-size: 18px;
		font-weight: 600;
		margin: 0 0 16px;
		color: var(--ae-text);
	}
	/* Reset so the read-only gate's <fieldset> adds no border/padding of its own
	   around the fields it wraps (same pattern as the candidate page). */
	fieldset.rbac {
		all: unset;
		display: contents;
	}
	fieldset.rbac:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}
	.grid {
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
	.field small {
		font-size: 11.5px;
		color: var(--ae-muted);
	}
	.field textarea {
		resize: vertical;
		font-family: ui-monospace, monospace;
		font-size: 12.5px;
	}
	.actions {
		display: flex;
		gap: 10px;
		align-items: center;
		margin-top: 18px;
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
		.grid {
			grid-template-columns: 1fr;
		}
	}
</style>
