<script lang="ts">
	import { enhance } from '$app/forms';
	import { untrack } from 'svelte';

	let { data, form } = $props();

	// Seed-once on purpose: this is a draft the recruiter edits freely, so a
	// reload must not stomp their in-progress text with server state.
	let to = $state(untrack(() => data.compose.to));
	let cc = $state(untrack(() => data.compose.cc));
	let subject = $state(untrack(() => data.compose.subject));
	let body = $state(untrack(() => data.compose.body));
	let sending = $state(false);

	const statusMeta: Record<string, { label: string; cls: string }> = {
		pending: { label: 'Not started', cls: '' },
		sent: { label: 'Request sent', cls: 'gold' },
		completed: { label: 'Verified', cls: 'teal' }
	};

	function fmt(iso: string | null): string {
		if (!iso) return '—';
		return new Date(iso).toLocaleString('en-IN', {
			day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit'
		});
	}

	const yesNo: Record<string, string> = { yes: 'Yes', no: 'No' };
</script>

<svelte:head><title>BGV — {data.candidate.name}</title></svelte:head>

<a href="/admin/bgv" class="back">← All BGV candidates</a>
<div class="head-row">
	<div>
		<h1 class="page-title">{data.candidate.name}</h1>
		<p class="page-sub">
			{data.candidate.trackLabel} · {data.companyName} · <a href="/admin/candidates/{data.candidate.id}">open candidate record →</a>
		</p>
	</div>
	<span class="pill big {statusMeta[data.bgv.status].cls}">{statusMeta[data.bgv.status].label}</span>
</div>

<div class="cols">
	<div class="col">
		<!-- Candidate's particulars vs verification inputs -->
		<section class="card">
			<div class="eyebrow">Candidate's particulars · verification inputs</div>
			<p class="hint">
				Left column: what the candidate declared in onboarding. Right column: the previous employer's
				verification inputs — filled in automatically when they reply to the BGV email (their reply is
				read by AI and mapped here).
			</p>
			<div class="vrow vhead">
				<span>Candidate's Particulars</span>
				<span>Your Verification Inputs</span>
			</div>
			{#each data.particulars as row}
				<div class="vrow">
					<span>
						<span class="vlabel">{row.label}</span>
						<span class="vvalue">{row.declared || '—'}</span>
					</span>
					<span class="vverify" class:filled={!!row.verified}>{row.verified || (data.bgv.status === 'completed' ? '—' : 'Awaiting employer')}</span>
				</div>
			{/each}
			{#each data.extras as row}
				<div class="vrow">
					<span><span class="vlabel">{row.label}</span></span>
					<span class="vverify" class:filled={!!row.verified}>
						{(row.verified && (yesNo[row.verified] ?? row.verified)) || (data.bgv.status === 'completed' ? '—' : 'Awaiting employer')}
					</span>
				</div>
			{/each}
			{#if data.bgv.status === 'completed'}
				<div class="done-note">
					✓ Verification completed {fmt(data.bgv.completedAt)}{data.bgv.verifierName ? ` by ${data.bgv.verifierName}` : ''}.
				</div>
			{/if}
		</section>

		<!-- Mail thread -->
		<section class="card">
			<div class="eyebrow">BGV mail thread</div>
			{#if data.messages.length === 0}
				<p class="hint" style="margin-bottom:0">Nothing sent yet. The request you send and every reply from the previous employer will appear here (and in the Inbox).</p>
			{/if}
			{#each data.messages as m}
				<div class="msg" class:inbound={m.direction === 'inbound'}>
					<div class="msg-head">
						<span class="msg-dir">{m.direction === 'inbound' ? '↩ Reply' : '↗ Sent'}</span>
						<span class="msg-meta">{m.direction === 'inbound' ? `from ${m.from}` : `to ${m.to}`} · {fmt(m.at)} · {m.status}</span>
					</div>
					<div class="msg-subject">{m.subject || '(no subject)'}</div>
					{#if m.text}<pre class="msg-body">{m.text}</pre>{/if}
				</div>
			{/each}
		</section>
	</div>

	<div class="col">
		<!-- Compose -->
		<section class="card">
			<div class="eyebrow">BGV request email</div>
			<p class="hint">
				Pre-addressed to the previous-company HR contact the candidate declared
				{#if data.candidate.prevHrEmail}(<strong>{data.candidate.prevHrEmail}</strong>){/if}
				— edit anything before sending. The verification table is embedded in the email body
				itself (plus a printable PDF copy attached); the employer just hits Reply and their
				answers are mapped into the table automatically. You can re-send at any time.
			</p>
			{#if !data.candidate.prevHrEmail && !to}
				<p class="warn">The candidate hasn't submitted their previous-employment details yet — no HR email to auto-address. You can still enter one manually.</p>
			{/if}
			<form
				method="POST"
				action="?/send"
				use:enhance={() => {
					sending = true;
					return async ({ update }) => {
						sending = false;
						await update({ reset: false });
					};
				}}
			>
				<fieldset disabled={!data.canSend || sending} style="border:none;padding:0;margin:0">
					<label class="cfield">
						<span>To (previous employer)</span>
						<input name="to" bind:value={to} placeholder="hr@previous-company.com" required />
					</label>
					<label class="cfield">
						<span>Cc — HRD, department manager (optional, comma-separated)</span>
						<input name="cc" bind:value={cc} placeholder="hrd@company.com, manager@company.com" />
					</label>
					<label class="cfield">
						<span>Subject</span>
						<input name="subject" bind:value={subject} required />
					</label>
					<label class="cfield">
						<span>Body</span>
						<textarea name="body" rows="14" bind:value={body} required></textarea>
					</label>
					<div class="attach-note">
						📋 Added automatically on send: the <strong>Candidate's Particulars · Your Verification Inputs</strong>
						table inside the email body, plus a printable <strong>BGV form (PDF)</strong> attachment.
						🤖 The employer's email reply is read by AI and filled into the verification column here.
					</div>
					{#if form?.message}<p class="error">{form.message}</p>{/if}
					{#if form?.sent}<p class="sent-ok">Sent ✓ — it's now tracked in the thread and the Inbox.</p>{/if}
					{#if data.canSend}
						<button class="btn" disabled={sending}>
							{sending ? 'Sending…' : data.bgv.sentCount > 0 ? 'Re-send BGV request' : 'Send BGV request'}
						</button>
						{#if data.bgv.sentAt}
							<span class="sent-meta">Last sent {fmt(data.bgv.sentAt)} · {data.bgv.sentCount}×</span>
						{/if}
					{:else}
						<p class="warn">Your role can view BGV but not send requests.</p>
					{/if}
				</fieldset>
			</form>
		</section>
	</div>
</div>

<style>
	.back {
		display: inline-block;
		font-size: 12.5px;
		color: var(--ae-muted-2);
		text-decoration: none;
		margin-bottom: 8px;
	}
	.back:hover { color: var(--ae-text); }
	.head-row {
		display: flex;
		align-items: flex-start;
		gap: 16px;
		margin-bottom: 20px;
	}
	.head-row > div { flex: 1; }
	.page-sub {
		color: var(--ae-muted-2);
		font-size: 13px;
		margin: 0;
	}
	.page-sub a { color: var(--ae-ember-glow); text-decoration: none; }
	.cols {
		display: grid;
		grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
		gap: 18px;
		align-items: start;
	}
	@media (max-width: 1100px) { .cols { grid-template-columns: 1fr; } }
	.col { display: flex; flex-direction: column; gap: 18px; min-width: 0; }
	.card {
		background: var(--ae-card-bg);
		border: 1px solid var(--ae-card-border);
		border-radius: var(--ae-card-radius);
		box-shadow: var(--ae-card-shadow);
		backdrop-filter: var(--ae-card-blur);
		-webkit-backdrop-filter: var(--ae-card-blur);
		padding: 20px;
	}
	.eyebrow {
		font-family: var(--ae-font-mono);
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--ae-muted);
		margin-bottom: 10px;
	}
	.hint {
		font-size: 12px;
		color: var(--ae-muted-2);
		line-height: 1.55;
		margin: 0 0 14px;
	}
	.warn {
		font-size: 12px;
		color: #b8860b;
		background: rgba(230, 167, 0, 0.1);
		border: 1px solid rgba(230, 167, 0, 0.35);
		border-radius: 8px;
		padding: 8px 10px;
		margin: 0 0 12px;
	}
	.pill {
		display: inline-block;
		font-family: var(--ae-font-mono);
		font-size: 9.5px;
		font-weight: 600;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		padding: 3px 8px;
		border-radius: 999px;
		border: 1px solid var(--ae-line-strong);
		color: var(--ae-muted-2);
	}
	.pill.big { font-size: 10.5px; padding: 6px 12px; margin-top: 10px; }
	.pill.gold { color: #b8860b; border-color: rgba(230, 167, 0, 0.45); background: rgba(230, 167, 0, 0.1); }
	.pill.teal { color: #0a7c5a; border-color: rgba(10, 124, 90, 0.4); background: rgba(10, 124, 90, 0.1); }

	/* particulars table */
	.vrow {
		display: grid;
		grid-template-columns: 1.2fr 1fr;
		gap: 12px;
		padding: 9px 0;
		border-bottom: 1px solid var(--ae-line-soft);
		font-size: 13px;
	}
	.vrow.vhead {
		font-family: var(--ae-font-mono);
		font-size: 9.5px;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--ae-muted);
		border-bottom: 1px solid var(--ae-line-strong);
	}
	.vlabel {
		display: block;
		font-size: 11px;
		color: var(--ae-muted);
		margin-bottom: 2px;
	}
	.vvalue { color: var(--ae-text); font-weight: 500; }
	.vverify { color: var(--ae-muted); font-size: 12.5px; align-self: center; }
	.vverify.filled { color: var(--ae-text); font-weight: 600; }
	.done-note {
		margin-top: 12px;
		font-size: 12.5px;
		color: #0a7c5a;
		font-weight: 600;
	}

	/* compose */
	.cfield { display: block; margin-bottom: 12px; }
	.cfield span {
		display: block;
		font-size: 11px;
		color: var(--ae-muted);
		margin-bottom: 4px;
	}
	.cfield input, .cfield textarea {
		width: 100%;
		box-sizing: border-box;
		background: var(--ae-input-bg);
		border: 1px solid var(--ae-line-strong);
		border-radius: 8px;
		color: var(--ae-text);
		font: inherit;
		font-size: 13px;
		padding: 8px 10px;
	}
	.cfield textarea { resize: vertical; line-height: 1.5; }
	.attach-note {
		font-size: 11.5px;
		color: var(--ae-muted-2);
		background: var(--ae-input-bg);
		border: 1px dashed var(--ae-line-strong);
		border-radius: 8px;
		padding: 8px 10px;
		margin-bottom: 12px;
		word-break: break-all;
	}
	.btn {
		background: var(--ae-ember, #e8033a);
		color: #fff;
		border: none;
		border-radius: 8px;
		font: inherit;
		font-size: 13px;
		font-weight: 600;
		padding: 9px 16px;
		cursor: pointer;
	}
	.btn:disabled { opacity: 0.6; cursor: default; }
	.sent-meta { font-size: 11.5px; color: var(--ae-muted); margin-left: 10px; }
	.sent-ok { color: #0a7c5a; font-size: 12.5px; font-weight: 600; margin: 0 0 10px; }
	.error {
		color: #c22;
		font-size: 12.5px;
		margin: 0 0 10px;
	}

	/* thread */
	.msg {
		border: 1px solid var(--ae-line-soft);
		border-radius: 10px;
		padding: 10px 12px;
		margin-top: 10px;
	}
	.msg.inbound { border-color: rgba(10, 124, 90, 0.4); background: rgba(10, 124, 90, 0.05); }
	.msg-head { display: flex; gap: 8px; align-items: baseline; flex-wrap: wrap; }
	.msg-dir { font-size: 11px; font-weight: 700; color: var(--ae-text-2); }
	.msg.inbound .msg-dir { color: #0a7c5a; }
	.msg-meta { font-size: 11px; color: var(--ae-muted); }
	.msg-subject { font-size: 13px; font-weight: 600; margin-top: 4px; color: var(--ae-text); }
	.msg-body {
		font: 12px/1.5 var(--ae-font-body, inherit);
		white-space: pre-wrap;
		word-break: break-word;
		color: var(--ae-text-2);
		background: var(--ae-input-bg);
		border-radius: 8px;
		padding: 8px 10px;
		margin: 8px 0 0;
		max-height: 260px;
		overflow: auto;
	}
</style>
