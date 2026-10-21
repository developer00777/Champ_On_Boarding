<script lang="ts">
	import { enhance } from '$app/forms';
	import { brandBySlug } from '$lib/shared/brands';
	import {
		WELCOME_ATTACHMENT_SLOTS,
		renderWelcomeHtml,
		renderWelcomeSubject,
		type WelcomeValues
	} from '$lib/shared/welcome-mail';

	let { data, form } = $props();

	/** The stored lists are arrays; the textareas edit them as one address per
	 *  line, which is how HR reads a recipient list. Seeded once — retyping is
	 *  in-progress user input the server round-trip must not clobber. */
	// A section this login has no access to arrives as null (see the load), so
	// every seed below tolerates a missing one.
	// svelte-ignore state_referenced_locally
	let to = $state(data.itSetupMail?.to.join('\n') ?? '');
	// svelte-ignore state_referenced_locally
	let cc = $state(data.itSetupMail?.cc.join('\n') ?? '');

	const isDefault = $derived(
		to.trim() === data.defaults.to.join('\n') && cc.trim() === data.defaults.cc.join('\n')
	);

	// Same seed-once treatment for the offboarding recipient lists.
	// svelte-ignore state_referenced_locally
	let itTo = $state(data.exitMail?.itTo.join('\n') ?? '');
	// svelte-ignore state_referenced_locally
	let itCc = $state(data.exitMail?.itCc.join('\n') ?? '');
	// svelte-ignore state_referenced_locally
	let hrCc = $state(data.exitMail?.hrCc.join('\n') ?? '');

	/** One textarea per fixed list, edited as one option per line. Seeded once for
	 *  the same reason the recipient boxes are: a server round-trip must not
	 *  clobber what HR is part-way through typing. */
	// svelte-ignore state_referenced_locally
	let listText: Record<string, string> = $state(
		Object.fromEntries(
			data.fixedListDefs.map((d: { key: string }) => [
				d.key,
				(data.fixedLists?.[d.key] ?? []).join('\n')
			])
		)
	);

	// svelte-ignore state_referenced_locally
	let ecTo = $state(data.employeeCodeMail?.to.join('\n') ?? '');
	// svelte-ignore state_referenced_locally
	let ecCc = $state(data.employeeCodeMail?.cc.join('\n') ?? '');

	// ── Welcome mail ─────────────────────────────────────────────────────────
	// Every field is bound so the preview beside the editor re-renders as HR
	// types — with the same renderer the send uses (shared/welcome-mail.ts), so
	// the preview is the mail, not an approximation of it.
	// svelte-ignore state_referenced_locally
	let wmCc = $state(data.welcomeMail?.cc.join('\n') ?? '');
	// svelte-ignore state_referenced_locally
	let wmSubject = $state(data.welcomeMail?.subject ?? '');
	// svelte-ignore state_referenced_locally
	let wmBody = $state(data.welcomeMail?.body ?? '');
	// svelte-ignore state_referenced_locally
	let wmSignoffName = $state(data.welcomeMail?.signoffName ?? '');
	// svelte-ignore state_referenced_locally
	let wmSignoffDesignation = $state(data.welcomeMail?.signoffDesignation ?? '');
	// svelte-ignore state_referenced_locally
	let wmPreviewBrand = $state(data.defaultPreviewBrand);

	// Reset rewrites the stored settings; pull the defaults back into the boxes
	// too, or the editor would keep showing what was just thrown away.
	$effect(() => {
		if (form?.welcomeMailReset) {
			wmCc = data.welcomeDefaults.cc.join('\n');
			wmSubject = data.welcomeDefaults.subject;
			wmBody = data.welcomeDefaults.body;
			wmSignoffName = data.welcomeDefaults.signoffName;
			wmSignoffDesignation = data.welcomeDefaults.signoffDesignation;
		}
	});

	const welcomeIsDefault = $derived(
		wmCc.trim() === data.welcomeDefaults.cc.join('\n') &&
			wmSubject.trim() === data.welcomeDefaults.subject &&
			wmBody === data.welcomeDefaults.body &&
			wmSignoffName.trim() === data.welcomeDefaults.signoffName &&
			wmSignoffDesignation.trim() === data.welcomeDefaults.signoffDesignation
	);

	/** A made-up joiner, so every token in the preview shows something. */
	const sampleBrand = $derived(brandBySlug(wmPreviewBrand));
	const sampleValues: WelcomeValues = $derived({
		name: 'K Sukumar',
		employeeId: 'CIPL3038',
		company: sampleBrand.name,
		reportingManager: 'Pushpa',
		designation: 'Associate',
		joiningDate: '20-Oct-2026',
		officialEmail: 'sukumar.k@championsmail.com'
	});
	/** Stands in for the joiner's passport photo: a 3:4 silhouette, so the frame
	 *  is previewed at the proportions a real one has. */
	const SAMPLE_PHOTO =
		'data:image/svg+xml;utf8,' +
		encodeURIComponent(
			'<svg xmlns="http://www.w3.org/2000/svg" width="300" height="400" viewBox="0 0 300 400">' +
				'<rect width="300" height="400" fill="#dfe6ee"/>' +
				'<circle cx="150" cy="150" r="70" fill="#9aa8b8"/>' +
				'<path d="M30 400c0-90 54-150 120-150s120 60 120 150z" fill="#9aa8b8"/></svg>'
		);
	const welcomePreviewHtml = $derived(
		renderWelcomeHtml({
			settings: { body: wmBody, signoffName: wmSignoffName, signoffDesignation: wmSignoffDesignation },
			values: sampleValues,
			brand: sampleBrand,
			logoUrl: sampleBrand.logo.src,
			photoSrc: SAMPLE_PHOTO
		})
	);
	const welcomePreviewSubject = $derived(renderWelcomeSubject(wmSubject, sampleValues));

	const nothingVisible = $derived(
		!data.itSetupMail &&
			!data.exitMail &&
			!data.fixedLists &&
			!data.employeeCodeMail &&
			!data.welcomeMail
	);

	const exitIsDefault = $derived(
		itTo.trim() === data.exitDefaults.itTo.join('\n') &&
			itCc.trim() === data.exitDefaults.itCc.join('\n') &&
			hrCc.trim() === data.exitDefaults.hrCc.join('\n')
	);
</script>

<h1 class="page-title">Settings</h1>
<p class="muted" style="margin:0 0 22px;font-size:14px">
	Org-wide operational settings. Every field ships with a working default and only needs changing
	when the desk behind it changes.
</p>

{#if nothingVisible}
	<p class="muted" style="font-size:14px">
		You have no access to any settings. A super admin can give it in Access &amp; org.
	</p>
{/if}

{#if form?.error}
	<p class="flash err">{form.error}</p>
{:else if form?.saved}
	<p class="flash ok">Settings saved.</p>
{:else if form?.reset || form?.exitReset}
	<p class="flash ok">Reset to defaults.</p>
{:else if form?.exitSaved}
	<p class="flash ok">Offboarding mail settings saved.</p>
{/if}

{#if data.itSetupMail}
<section class="card">
	<h2 class="card-title">IT &amp; VPN setup mail</h2>
	<p class="muted" style="margin:-8px 0 18px;font-size:13px">
		Sent automatically when a candidate is marked <strong>Accepted</strong>, and re-sendable from
		the candidate page. Carries the system-enablement table (name, DOJ, designation, team,
		reporting head, shift timing, gender, mobile, payroll entity) under the hiring entity's logo.
	</p>

	<form method="POST" action="?/saveItSetupMail" use:enhance={() => async ({ update }) => update({ reset: false })}>
		<fieldset class="rbac" disabled={!data.canEdit.itMail}>
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
					<span>Subject line</span>
					<input
						name="subject"
						value={data.itSetupMail!.subject}
						maxlength="200"
						placeholder={data.defaults.subject}
					/>
					<small>
						Used for every IT setup mail.
						{#each data.subjectTokens as t, i}<code>{t.token}</code> becomes {t.means}{i < data.subjectTokens.length - 1
							? ', '
							: '. '}{/each}Leave blank to use the default:
						<code>{data.defaults.subject}</code>
					</small>
				</label>
				<label class="field">
					<span>Sign-off name</span>
					<input name="signoffName" value={data.itSetupMail!.signoffName} maxlength="80" />
				</label>
				<label class="field">
					<span>Sign-off designation</span>
					<input
						name="signoffDesignation"
						value={data.itSetupMail!.signoffDesignation}
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

	{#if !data.canEdit.itMail}
		<p class="muted" style="font-size:12px;margin:12px 0 0">
			View-only — to change this you need Act on “{data.capLabel['settings.itMail']}” in Access &amp; org. A super admin can
			give it to you there, or ask Champ to request it.
		</p>
	{/if}
</section>
{/if}

{#if data.exitMail}
<section class="card" style="margin-top:18px">
	<h2 class="card-title">Offboarding mail</h2>
	<p class="muted" style="margin:-8px 0 18px;font-size:13px">
		Who the exit process writes to. The IT list receives the
		<strong>&ldquo;block system access&rdquo;</strong> request on an employee's last working day; the
		HR list is copied on the employee's exit-forms invitation and their final document handover.
	</p>

	<form method="POST" action="?/saveExitMail" use:enhance={() => async ({ update }) => update({ reset: false })}>
		<fieldset class="rbac" disabled={!data.canEdit.exitMail}>
			<div class="grid">
				<label class="field">
					<span>IT team — To</span>
					<textarea name="itTo" bind:value={itTo} rows="3" placeholder="one address per line"></textarea>
					<small>Receives the access-revocation request.</small>
				</label>
				<label class="field">
					<span>IT team — Cc</span>
					<textarea name="itCc" bind:value={itCc} rows="3" placeholder="one address per line"></textarea>
					<small>Leave empty to copy no one.</small>
				</label>
				<label class="field">
					<span>HR desk — Cc</span>
					<textarea name="hrCc" bind:value={hrCc} rows="3" placeholder="one address per line"></textarea>
					<small>Copied on every mail sent to the exiting employee.</small>
				</label>
				<label class="field">
					<span>Sign-off name</span>
					<input name="exitSignoffName" value={data.exitMail!.signoffName} maxlength="80" />
				</label>
				<label class="field">
					<span>Sign-off designation</span>
					<input
						name="exitSignoffDesignation"
						value={data.exitMail!.signoffDesignation}
						maxlength="80"
					/>
				</label>
			</div>
			<div class="actions">
				<button class="btn teal">Save</button>
				{#if !exitIsDefault}
					<button class="btn ghost small" formaction="?/resetExitMail">Reset to defaults</button>
				{/if}
			</div>
		</fieldset>
	</form>

	{#if !data.canEdit.exitMail}
		<p class="muted" style="font-size:12px;margin:12px 0 0">
			View-only — to change this you need Act on “{data.capLabel['settings.exitMail']}” in Access &amp; org. A super admin can
			give it to you there, or ask Champ to request it.
		</p>
	{/if}
</section>
{/if}

<!-- Fixed dropdown lists. Deliberately generic: each entry in FIXED_LIST_DEFS
     renders its own box here, so adding a future dropdown needs no new UI. -->
{#if data.fixedLists}
<section class="card" style="margin-top:18px">
	<h2 class="card-title">Dropdown options</h2>
	<p class="muted" style="margin:-8px 0 18px;font-size:13px">
		Short fixed lists the forms offer as dropdowns. Editing one changes what everyone can pick
		from next time they open the form; a value already saved on a record is never rewritten.
	</p>

	<form method="POST" action="?/saveFixedLists" use:enhance={() => async ({ update }) => update({ reset: false })}>
		<fieldset class="rbac" disabled={!data.canEdit.lists}>
			{#each data.fixedListDefs as def (def.key)}
				<label class="field">
					<span>{def.label}</span>
					<textarea name={def.key} bind:value={listText[def.key]} rows="4"></textarea>
					<small>
						{def.help} One per line, in the order they should appear. Default:
						<code>{def.defaults.join(', ')}</code>
					</small>
				</label>
			{/each}
			<button class="btn">Save dropdown options</button>
			{#if form?.fixedListsSaved}<span class="saved">Saved ✓</span>{/if}
		</fieldset>
	</form>

	{#if !data.canEdit.lists}
		<p class="muted" style="font-size:12px;margin:12px 0 0">
			View-only — to change this you need Act on “{data.capLabel['settings.lists']}” in Access &amp; org. A super admin can
			give it to you there, or ask Champ to request it.
		</p>
	{/if}
</section>
{/if}

<!-- Employee code mail. Same shape as the IT & VPN setup mail above: the desk
     is admin-editable, the subject is a template, and the mail itself is only
     ever sent by hand from the candidate page. -->
{#if data.employeeCodeMail}
<section class="card" style="margin-top:18px">
	<h2 class="card-title">New joinee employee code mail</h2>
	<p class="muted" style="margin:-8px 0 18px;font-size:13px">
		Sent by hand from the candidate page once an employee code is assigned. Carries the
		six-column table the helpdesk works from — Sl, EmpCode, Team, Full Name, DOJ, Designation —
		and replies into the helpdesk thread when the candidate has a request ID.
	</p>

	<form method="POST" action="?/saveEmployeeCodeMail" use:enhance={() => async ({ update }) => update({ reset: false })}>
		<fieldset class="rbac" disabled={!data.canEdit.empCodeMail}>
			<label class="field">
				<span>To</span>
				<textarea name="ecTo" bind:value={ecTo} rows="3" placeholder="one address per line"></textarea>
				<small>One address per line. Semicolons and commas work too.</small>
			</label>
			<label class="field">
				<span>Cc</span>
				<textarea name="ecCc" bind:value={ecCc} rows="7" placeholder="one address per line"></textarea>
				<small>Leave empty to copy no one.</small>
			</label>
			<label class="field">
				<span>Subject line</span>
				<input
					name="ecSubject"
					value={data.employeeCodeMail!.subject}
					maxlength="200"
					placeholder={data.employeeCodeDefaults.subject}
				/>
				<small>
					{#each data.employeeCodeTokens as t, i}<code>{t.token}</code> becomes {t.means}{i <
					data.employeeCodeTokens.length - 1
						? ', '
						: '. '}{/each}With no request ID set, the whole
					<code>[Request ID :## ##] :</code> prefix drops out. Default:
					<code>{data.employeeCodeDefaults.subject}</code>
				</small>
			</label>
			<label class="field">
				<span>Sign-off name</span>
				<input name="ecSignoffName" value={data.employeeCodeMail!.signoffName} maxlength="80" />
			</label>
			<label class="field">
				<span>Sign-off designation</span>
				<input
					name="ecSignoffDesignation"
					value={data.employeeCodeMail!.signoffDesignation}
					maxlength="80"
					placeholder="optional"
				/>
			</label>
			<button class="btn">Save employee code mail</button>
			{#if form?.employeeCodeMailSaved}<span class="saved">Saved ✓</span>{/if}
		</fieldset>
	</form>

	{#if !data.canEdit.empCodeMail}
		<p class="muted" style="font-size:12px;margin:12px 0 0">
			View-only — to change this you need Act on “{data.capLabel['settings.empCodeMail']}” in Access &amp; org. A super admin can
			give it to you there, or ask Champ to request it.
		</p>
	{/if}
</section>
{/if}

<!-- Welcome mail. The editor on the left, the mail as a joiner would see it on
     the right, re-rendered on every keystroke. -->
{#if data.welcomeMail}
<section class="card" id="welcome-mail" style="margin-top:18px">
	<h2 class="card-title">Welcome mail</h2>
	<p class="muted" style="margin:-8px 0 18px;font-size:13px">
		Sent by hand from the candidate page to the joiner's <strong>official email</strong>, once IT has
		created it, with the Core Values and Holiday Calendar attached. Always addressed to the joiner;
		their reporting manager is copied when the candidate page has the manager's email.
	</p>

	<div class="wm-grid">
		<form method="POST" action="?/saveWelcomeMail" use:enhance={() => async ({ update }) => update({ reset: false })}>
			<fieldset class="rbac" disabled={!data.canEdit.welcomeMail}>
				<label class="field">
					<span>Cc</span>
					<textarea name="wmCc" bind:value={wmCc} rows="2" placeholder="one address per line"></textarea>
					<small>Copied on every welcome mail. Leave empty to copy no one.</small>
				</label>
				<label class="field" style="margin-top:12px">
					<span>Subject line</span>
					<input name="wmSubject" bind:value={wmSubject} maxlength="200" placeholder={data.welcomeDefaults.subject} />
				</label>
				<label class="field" style="margin-top:12px">
					<span>Body</span>
					<textarea name="wmBody" bind:value={wmBody} rows="24" class="wm-body"></textarea>
					<small>
						{#each data.welcomeTokens as t, i}<code>{t.token}</code> becomes {t.means}{i < data.welcomeTokens.length - 1
								? ', '
								: '. '}{/each}
						<code>**text**</code> is bold, a line of <code>===</code> is a divider, and a line starting
						<code>* </code> is a bullet. A blank line starts a new paragraph.
					</small>
				</label>
				<div class="grid" style="margin-top:12px">
					<label class="field">
						<span>Sign-off name</span>
						<input name="wmSignoffName" bind:value={wmSignoffName} maxlength="80" />
					</label>
					<label class="field">
						<span>Sign-off designation</span>
						<input name="wmSignoffDesignation" bind:value={wmSignoffDesignation} maxlength="80" placeholder="optional" />
					</label>
				</div>
				<div class="actions">
					<button class="btn teal">Save welcome mail</button>
					{#if !welcomeIsDefault}
						<button class="btn ghost small" formaction="?/resetWelcomeMail">Reset to defaults</button>
					{/if}
					{#if form?.welcomeMailSaved}<span class="saved">Saved ✓</span>{/if}
					{#if form?.welcomeMailReset}<span class="saved">Reset to defaults ✓</span>{/if}
				</div>
			</fieldset>
		</form>

		<div class="wm-preview">
			<div class="wm-preview-head">
				<span class="wm-preview-k">Preview</span>
				<label class="wm-brand">
					as
					<select bind:value={wmPreviewBrand} aria-label="Preview as entity">
						{#each data.previewBrands as b (b.slug)}
							<option value={b.slug}>{b.name}</option>
						{/each}
					</select>
				</label>
			</div>
			<div class="wm-meta"><span>Subject</span>{welcomePreviewSubject}</div>
			<div class="wm-meta">
				<span>Attached</span>
				{#each WELCOME_ATTACHMENT_SLOTS as s, i}
					{#if data.welcomeAttachmentNames[s.key]}
						{data.welcomeAttachmentNames[s.key]}
					{:else}
						<em class="wm-missing">{s.label} — not uploaded</em>
					{/if}{i < WELCOME_ATTACHMENT_SLOTS.length - 1 ? ' · ' : ''}
				{/each}
			</div>
			<!-- Sandboxed like the candidate page's preview: the body is rendered
			     markup and must not style the settings page. -->
			<iframe class="wm-frame" title="Welcome mail preview" sandbox="" srcdoc={welcomePreviewHtml}></iframe>
			<small class="muted" style="font-size:11.5px">
				Shown with a sample joiner. The real mail opens with the joiner's own passport photo from
				their onboarding form, exactly as they uploaded it (their initials if there is none). The two
				attachments are uploaded and replaced from any candidate's Welcome mail card.
			</small>
		</div>
	</div>

	{#if !data.canEdit.welcomeMail}
		<p class="muted" style="font-size:12px;margin:12px 0 0">
			View-only — to change this you need Act on “{data.capLabel['settings.welcomeMail']}” in Access &amp; org. A super admin can
			give it to you there, or ask Champ to request it.
		</p>
	{/if}
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
		background: rgba(var(--ae-crimson-rgb), 0.12);
		border: 1px solid rgba(var(--ae-crimson-rgb), 0.3);
		color: var(--ae-crimson);
	}
	.flash.ok {
		background: rgba(var(--ae-verdant-rgb), 0.08);
		border: 1px solid rgba(var(--ae-verdant-rgb), 0.25);
		color: var(--ae-verdant);
	}
	.wm-grid {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 20px;
		align-items: start;
	}
	.wm-body {
		min-height: 420px;
	}
	.wm-preview {
		display: flex;
		flex-direction: column;
		gap: 8px;
		position: sticky;
		top: 16px;
	}
	.wm-preview-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
	}
	.wm-preview-k {
		font-size: 12px;
		font-weight: 500;
		color: var(--ae-text-2);
	}
	.wm-brand {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12px;
		color: var(--ae-muted);
	}
	.wm-brand select {
		font-size: 12px;
		padding: 4px 6px;
	}
	.wm-meta {
		font-size: 12px;
		color: var(--ae-text);
		word-break: break-word;
	}
	.wm-meta > span {
		display: inline-block;
		min-width: 64px;
		color: var(--ae-muted);
	}
	.wm-missing {
		color: var(--ae-amber);
	}
	.wm-frame {
		width: 100%;
		height: 640px;
		border: 1px solid var(--ae-line-strong);
		border-radius: 10px;
		/* The mail paints its own light background; keep it so the preview
		   matches an inbox rather than the admin theme. */
		background: #f2f4f7;
	}
	@media (max-width: 1100px) {
		.wm-grid {
			grid-template-columns: 1fr;
		}
		.wm-preview {
			position: static;
		}
	}
	@media (max-width: 640px) {
		.grid {
			grid-template-columns: 1fr;
		}
	}
</style>
