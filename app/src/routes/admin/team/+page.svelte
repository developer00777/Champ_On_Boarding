<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	const roleLabel: Record<string, string> = {
		hr_admin: 'HR / Recruiter',
		super_admin: 'Super admin'
	};

	function copy(value: string) {
		navigator.clipboard.writeText(value);
	}

	// The one-time password to surface (from create or reset).
	const oneTimePassword = $derived(form?.password ?? null);
</script>

<h1 class="page-title">Team logins</h1>
<p class="muted" style="margin:0 0 22px;font-size:14px">
	Create and manage logins for HR and recruiters. New users sign in at the same admin login page.
</p>

<section class="card" style="margin-bottom:22px">
	<div style="font-weight:700;font-size:18px;margin-bottom:16px">Add a login</div>
	<form method="POST" action="?/createUser" use:enhance>
		<div class="gen-grid">
			<div>
				<label for="email">Email</label>
				<input id="email" name="email" type="email" placeholder="name@championsmail.com" required />
			</div>
			<div>
				<label for="role">Role</label>
				<select id="role" name="role" required>
					<option value="hr_admin">HR / Recruiter</option>
					<option value="super_admin">Super admin</option>
				</select>
			</div>
			<div>
				<label for="password">Temporary password</label>
				<input id="password" name="password" type="text" autocomplete="off" placeholder="Leave blank to auto-generate" />
			</div>
			<button class="btn">Create login</button>
		</div>
	</form>
	{#if form?.message}<p class="error">{form.message}</p>{/if}

	{#if form?.created}
		<div class="linkbox">
			<div style="font-size:13px;color:var(--fg-2);margin-bottom:8px">
				Login created for <strong>{form.email}</strong> ({roleLabel[form.role] ?? form.role}).
			</div>
			{#if oneTimePassword}
				<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
					<span style="font-size:12.5px;color:var(--smoke)">Temporary password:</span>
					<code class="linkcode">{oneTimePassword}</code>
					<button type="button" class="teal-pill-btn" onclick={() => copy(oneTimePassword)}>Copy</button>
				</div>
				<div style="font-size:12px;color:var(--smoke);margin-top:8px">
					Share this securely — it is shown only once. Ask the user to change it after first sign-in.
				</div>
			{:else}
				<div style="font-size:12.5px;color:var(--smoke)">Use the password you entered to share access.</div>
			{/if}
		</div>
	{/if}

	{#if form?.passwordReset}
		<div class="linkbox">
			<div style="font-size:13px;color:var(--fg-2);margin-bottom:8px">
				Password reset for <strong>{form.email}</strong>. Existing sessions were signed out.
			</div>
			<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
				<span style="font-size:12.5px;color:var(--smoke)">New password:</span>
				<code class="linkcode">{form.password}</code>
				<button type="button" class="teal-pill-btn" onclick={() => copy(form.password)}>Copy</button>
			</div>
		</div>
	{/if}

	{#if form?.statusChanged}
		<div class="linkbox">
			<div style="font-size:13px;color:var(--fg-2)">
				<strong>{form.email}</strong> is now {form.status === 'disabled' ? 'disabled' : 'active'}.
			</div>
		</div>
	{/if}
</section>

<section class="table-card">
	<div class="thead">
		<div>User</div>
		<div>Role</div>
		<div>Status</div>
		<div>Created</div>
		<div></div>
	</div>
	{#each data.admins as a}
		<div class="trow">
			<div>
				<div style="font-weight:700;font-size:14px;color:var(--ink)">{a.email}</div>
				{#if a.isSelf}<div style="font-size:12px;color:var(--smoke)">You</div>{/if}
			</div>
			<div class="tcell">{roleLabel[a.role] ?? a.role}</div>
			<div>
				<span class="pill {a.status === 'active' ? 'teal' : 'red'}">
					{a.status === 'active' ? 'ACTIVE' : 'DISABLED'}
				</span>
			</div>
			<div class="tcell" style="color:var(--smoke)">
				{new Date(a.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
			</div>
			<div class="row-actions">
				<form method="POST" action="?/resetPassword" use:enhance style="display:contents">
					<input type="hidden" name="id" value={a.id} />
					<button class="btn ghost small" type="submit">Reset password</button>
				</form>
				{#if !a.isSelf}
					<form method="POST" action="?/setStatus" use:enhance style="display:contents">
						<input type="hidden" name="id" value={a.id} />
						<input type="hidden" name="status" value={a.status === 'active' ? 'disabled' : 'active'} />
						<button class="btn ghost small" type="submit">
							{a.status === 'active' ? 'Disable' : 'Enable'}
						</button>
					</form>
				{/if}
			</div>
		</div>
	{/each}
</section>

<style>
	.page-title {
		font-family: var(--ae-font-display);
		font-size: 34px;
		font-weight: 600;
		margin: 0 0 4px;
		color: var(--ae-text);
	}
	.gen-grid {
		display: grid;
		grid-template-columns: 1.4fr 1fr 1.2fr auto;
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
		font-size: 13px;
		background: #0b0d12;
		border: 1px solid var(--ae-line-strong);
		border-radius: 7px;
		padding: 7px 11px;
		color: var(--ae-ember-glow);
		overflow-wrap: anywhere;
		font-weight: 400;
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
	.table-card {
		background: var(--ae-card-bg);
		border: 1px solid var(--ae-card-border);
		border-radius: var(--ae-card-radius);
		box-shadow: var(--ae-card-shadow);
		backdrop-filter: var(--ae-card-blur);
		-webkit-backdrop-filter: var(--ae-card-blur);
		overflow: hidden;
	}
	.thead,
	.trow {
		display: grid;
		grid-template-columns: 1.8fr 1fr 0.8fr 0.9fr auto;
		gap: 12px;
		padding: 14px 18px;
		align-items: center;
	}
	.thead {
		font-family: var(--ae-font-mono);
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--ae-muted);
		background: var(--ae-input-bg);
		border-bottom: 1px solid var(--ae-line-strong);
	}
	.trow {
		border-bottom: 1px solid var(--ae-line-soft);
	}
	.tcell {
		font-size: 13px;
		color: var(--ae-text-2);
	}
	.row-actions {
		display: flex;
		gap: 8px;
		justify-content: flex-end;
		flex-wrap: wrap;
	}
	@media (max-width: 900px) {
		.gen-grid {
			grid-template-columns: 1fr 1fr;
		}
		.thead {
			display: none;
		}
		.trow {
			grid-template-columns: 1fr auto;
			row-gap: 6px;
		}
		.tcell {
			display: none;
		}
	}
</style>
