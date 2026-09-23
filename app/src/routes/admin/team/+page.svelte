<script lang="ts">
	import { enhance } from '$app/forms';
	import GlassSelect from '$lib/components/GlassSelect.svelte';

	let { data, form } = $props();

	const roleLabel: Record<string, string> = {
		hr_admin: 'HR / Recruiter',
		super_admin: 'Super admin',
		finance_team: 'Finance team'
	};

	// GlassSelect is controlled; seed to the first option like the native select.
	let newRole = $state('hr_admin');

	function copy(value: string) {
		navigator.clipboard.writeText(value);
	}

	// The activity panel: which row is open, and what has been loaded for it.
	// Fetched on demand rather than with the page — most visits here are to add
	// or disable someone, and nobody needs a hundred audit rows per login to do
	// that.
	type Entry = {
		at: string;
		action: string;
		subject: string | null;
		field: string | null;
		from: string | null;
		to: string | null;
		ip: string | null;
	};
	let logOpenFor = $state<string | null>(null);
	let logBusy = $state(false);
	let logError: string | null = $state(null);
	let logEntries = $state<Entry[]>([]);
	let logTruncated = $state(false);

	async function toggleLog(id: string) {
		if (logOpenFor === id) {
			logOpenFor = null;
			return;
		}
		logOpenFor = id;
		pwOpenFor = null;
		delOpenFor = null;
		logBusy = true;
		logError = null;
		logEntries = [];
		try {
			const res = await fetch(`/admin/team/activity?id=${id}`);
			if (!res.ok) {
				logError = `Could not load the activity (${res.status}).`;
				return;
			}
			const body = await res.json();
			logEntries = body.entries;
			logTruncated = body.truncated;
		} catch {
			logError = 'Could not load the activity — check your connection.';
		} finally {
			logBusy = false;
		}
	}

	/** `offer_letter_sent` reads as "Offer letter sent". Derived rather than
	 *  mapped: there are ~90 action names and new ones are added with each
	 *  feature, and a lookup table would silently fall back to raw keys. */
	function actionLabel(a: string): string {
		const words = a.replace(/_/g, ' ').trim();
		return words.charAt(0).toUpperCase() + words.slice(1);
	}

	function when(iso: string): string {
		const d = new Date(iso);
		const mins = Math.round((Date.now() - d.getTime()) / 60000);
		if (mins < 60) return `${Math.max(mins, 1)}m ago`;
		if (mins < 60 * 24) return `${Math.round(mins / 60)}h ago`;
		return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: '2-digit' });
	}

	// Which row has its set-password box open, and which has its delete
	// confirmation open. One at a time: these are the two destructive things on
	// the page, and having both hanging open on several rows invites the wrong
	// button.
	let pwOpenFor = $state<string | null>(null);
	let delOpenFor = $state<string | null>(null);

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
				<GlassSelect
					id="role"
					name="role"
					ariaLabel="Role"
					required
					bind:value={newRole}
					options={[
						{ value: 'hr_admin', label: 'HR / Recruiter' },
						{ value: 'super_admin', label: 'Super admin' },
						{ value: 'finance_team', label: 'Finance team' }
					]}
				/>
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

	{#if form?.deleted}
		<div class="notice">
			<div style="font-size:13px;color:var(--ink)">
				Login deleted: <b>{form.email}</b>. Their audit history is kept.
			</div>
		</div>
	{/if}

	{#if form?.passwordReset}
		<div class="linkbox">
			<div style="font-size:13px;color:var(--fg-2);margin-bottom:8px">
				Password reset for <strong>{form.email}</strong>. Existing sessions were signed out.
			</div>
			<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
				<span style="font-size:12.5px;color:var(--smoke)">New password:</span>
				{#if form.chosen}
					<span style="font-size:12.5px;color:var(--ink)">the one you set</span>
				{:else}
					<code class="linkcode">{form.password}</code>
					<button type="button" class="teal-pill-btn" onclick={() => copy(form.password)}>Copy</button>
				{/if}
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
				<button
					class="btn ghost small"
					type="button"
					onclick={() => toggleLog(a.id)}
				>{logOpenFor === a.id ? 'Hide activity' : 'Activity'}</button>
				<button
					class="btn ghost small"
					type="button"
					onclick={() => { pwOpenFor = pwOpenFor === a.id ? null : a.id; delOpenFor = null; logOpenFor = null; }}
				>Set password</button>
				{#if !a.isSelf}
					<form method="POST" action="?/setStatus" use:enhance style="display:contents">
						<input type="hidden" name="id" value={a.id} />
						<input type="hidden" name="status" value={a.status === 'active' ? 'disabled' : 'active'} />
						<button class="btn ghost small" type="submit">
							{a.status === 'active' ? 'Disable' : 'Enable'}
						</button>
					</form>
					<button
						class="btn ghost small danger"
						type="button"
						onclick={() => { delOpenFor = delOpenFor === a.id ? null : a.id; pwOpenFor = null; }}
					>Delete</button>
				{/if}
			</div>

			{#if logOpenFor === a.id}
				<div class="rowpanel log">
					<div class="log-h">
						<span>What {a.email} has done</span>
						{#if logEntries.length}
							<span class="log-count">
								last {logEntries.length}{logTruncated ? ' shown' : ''}
							</span>
						{/if}
					</div>
					{#if logBusy}
						<p class="rowpanel-hint">Loading…</p>
					{:else if logError}
						<p class="rowpanel-hint err">{logError}</p>
					{:else if !logEntries.length}
						<p class="rowpanel-hint">
							Nothing recorded against this login yet. Actions are logged from the moment someone
							starts working in the portal.
						</p>
					{:else}
						<div class="log-list">
							{#each logEntries as e, i (i)}
								<div class="log-row">
									<span class="log-when" title={new Date(e.at).toLocaleString('en-IN')}>{when(e.at)}</span>
									<span class="log-what">
										{actionLabel(e.action)}
										{#if e.subject}<span class="log-subj">· {e.subject}</span>{/if}
										{#if e.field}<span class="log-field">{e.field}</span>{/if}
										{#if e.from || e.to}
											<span class="log-delta">
												{#if e.from}<span class="log-from">{e.from}</span> → {/if}<b>{e.to ?? '—'}</b>
											</span>
										{/if}
									</span>
								</div>
							{/each}
						</div>
						{#if logTruncated}
							<p class="rowpanel-hint">Older entries exist beyond these.</p>
						{/if}
					{/if}
				</div>
			{/if}

			{#if pwOpenFor === a.id}
				<!-- Setting a password by hand, for when it is handed over in person
				     or over a channel the super admin picks rather than shown once on
				     this screen. Same action as Reset: blank still generates one. -->
				<form
					class="rowpanel"
					method="POST"
					action="?/resetPassword"
					use:enhance={() => async ({ update }) => { pwOpenFor = null; await update(); }}
				>
					<input type="hidden" name="id" value={a.id} />
					<label for="pw-{a.id}">New password for {a.email}</label>
					<div class="rowpanel-row">
						<input
							id="pw-{a.id}"
							name="password"
							type="text"
							autocomplete="off"
							minlength="8"
							required
							placeholder="At least 8 characters"
						/>
						<button class="btn small" type="submit">Set it</button>
						<button class="btn ghost small" type="button" onclick={() => (pwOpenFor = null)}>Cancel</button>
					</div>
					<p class="rowpanel-hint">
						Signs them out everywhere. They are not asked to change it, so share it the way you
						would any credential.
					</p>
				</form>
			{/if}

			{#if delOpenFor === a.id}
				<!-- Permanent. The email has to be typed because a confirm dialog is
				     muscle memory and this cannot be undone. -->
				<form
					class="rowpanel danger"
					method="POST"
					action="?/deleteUser"
					use:enhance={() => async ({ update }) => { delOpenFor = null; await update(); }}
				>
					<input type="hidden" name="id" value={a.id} />
					<label for="del-{a.id}">Delete this login permanently</label>
					<div class="rowpanel-row">
						<input
							id="del-{a.id}"
							name="confirmEmail"
							type="text"
							autocomplete="off"
							required
							placeholder="Type {a.email} to confirm"
						/>
						<button class="btn small danger-btn" type="submit">Delete login</button>
						<button class="btn ghost small" type="button" onclick={() => (delOpenFor = null)}>Cancel</button>
					</div>
					<p class="rowpanel-hint">
						They lose access immediately and the row is gone for good. What they did is kept — the
						audit trail records people by email, so their history outlives the login. Disable
						instead if you only want to block sign-in.
					</p>
				</form>
			{/if}
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
	@media (max-width: 480px) {
		.gen-grid {
			grid-template-columns: 1fr;
		}
	}

	/* The two per-row panels: set a password, or delete the login. They sit under
	   the row they belong to rather than in a dialog, so the email they are about
	   stays on screen while it is typed. */
	.rowpanel {
		grid-column: 1 / -1;
		margin: -2px 0 10px;
		padding: 11px 13px;
		border: 1px solid var(--line, rgba(0, 0, 0, 0.12));
		border-radius: 10px;
		background: rgba(0, 0, 0, 0.02);
	}
	.rowpanel.danger {
		border-color: rgba(228, 62, 62, 0.45);
		background: rgba(228, 62, 62, 0.05);
	}
	.rowpanel label {
		display: block;
		font-size: 12px;
		font-weight: 600;
		margin-bottom: 6px;
	}
	.rowpanel-row {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		align-items: center;
	}
	.rowpanel-row input {
		flex: 1;
		min-width: 220px;
		font-family: inherit;
		font-size: 13px;
		padding: 7px 9px;
		border: 1px solid var(--line-strong, rgba(0, 0, 0, 0.2));
		border-radius: 7px;
	}
	.rowpanel.log { background: rgba(0, 0, 0, 0.015); }
	.log-h {
		display: flex;
		align-items: baseline;
		gap: 9px;
		font-size: 12px;
		font-weight: 600;
		margin-bottom: 9px;
	}
	.log-count { font-size: 10.5px; font-weight: 400; color: var(--smoke); }
	.log-list { max-height: 320px; overflow-y: auto; }
	.log-row {
		display: flex;
		gap: 10px;
		padding: 6px 0;
		border-top: 1px solid var(--line, rgba(0, 0, 0, 0.08));
		font-size: 12px;
		line-height: 1.45;
	}
	.log-row:first-child { border-top: none; }
	.log-when {
		flex: none;
		width: 62px;
		color: var(--smoke);
		font-size: 11px;
	}
	.log-what { min-width: 0; overflow-wrap: anywhere; }
	.log-subj { color: var(--smoke); }
	.log-field {
		margin-left: 6px;
		padding: 1px 5px;
		border-radius: 4px;
		background: rgba(127, 127, 127, 0.14);
		font-size: 10.5px;
	}
	.log-delta { display: block; font-size: 11px; color: var(--smoke); margin-top: 1px; }
	.log-from { text-decoration: line-through; }
	.rowpanel-hint.err { color: #b42318; }
	.rowpanel-hint {
		margin: 8px 0 0;
		font-size: 11.5px;
		line-height: 1.5;
		color: var(--smoke);
	}
	.btn.danger {
		color: #b42318;
	}
	.btn.danger-btn {
		background: #b42318;
		color: #fff;
	}
</style>
