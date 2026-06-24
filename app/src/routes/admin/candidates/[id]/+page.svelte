<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	let reuploadFor: string | null = $state(null);

	const c = $derived(data.candidate);

	const statusMeta: Record<string, { label: string; cls: string }> = {
		created: { label: 'LINK SENT', cls: '' },
		opened: { label: 'OPENED', cls: 'purple' },
		in_progress: { label: 'IN PROGRESS', cls: 'purple' },
		submitted: { label: 'AWAITING REVIEW', cls: 'gold' },
		changes_requested: { label: 'CHANGES REQUESTED', cls: 'red' },
		approved: { label: 'APPROVED', cls: 'teal' },
		complete: { label: 'COMPLETE', cls: 'teal' },
		revoked: { label: 'REVOKED', cls: 'red' }
	};

	const stdPill: Record<string, { label: string; cls: string }> = {
		pass: { label: 'STANDARD ✓', cls: 'teal' },
		warn: { label: 'STANDARD ⚠', cls: 'gold' },
		fail: { label: 'NOT TO STANDARD', cls: 'red' }
	};

	const docPill: Record<string, { label: string; cls: string }> = {
		parsed: { label: 'AUTO-READ', cls: 'teal' },
		store_only: { label: 'STORED', cls: '' },
		pending: { label: 'PROCESSING', cls: '' },
		unreadable: { label: 'UNREADABLE', cls: 'red' },
		failed: { label: 'OCR FAILED', cls: 'gold' }
	};

	const verifStatusPill: Record<string, string> = {
		verified: 'teal',
		review: 'gold',
		mismatch: 'red',
		error: 'red'
	};
	const verdictPill: Record<string, string> = {
		match: 'teal',
		review: 'gold',
		mismatch: 'red',
		missing: 'gold',
		'missing-expected': ''
	};
	const verdictLabel: Record<string, string> = {
		match: 'match',
		review: 'review',
		mismatch: 'mismatch',
		missing: 'not found',
		'missing-expected': 'not entered'
	};
	const sourceLabel: Record<string, string> = {
		digilocker: 'DigiLocker',
		ocr_crosscheck: 'OCR cross-check'
	};

	const detailGroups = $derived([
		{
			title: 'Personal',
			rows: [
				['Full name', c.fullName],
				['Date of birth', c.dob],
				['Gender', c.gender],
				['Email', c.email],
				['Mobile', c.mobile],
				["Father's name", c.fatherName],
				["Father's mobile", c.fatherMobile],
				["Mother's name", c.motherName],
				["Mother's mobile", c.motherMobile],
				["Mother's DOB", c.motherDob],
				['Marital status', c.maritalStatus],
				...(c.maritalStatus === 'married'
					? [
							['Spouse name', c.spouseName],
							['Spouse contact', c.spouseContact],
							['Spouse DOB', c.spouseDob]
						]
					: [])
			]
		},
		{
			title: 'Address',
			rows: [
				['Present address', c.presentAddress],
				['Present house no.', c.presentHouseNo],
				['Present PIN', c.presentPin],
				['Permanent address', c.permanentAddress],
				['Permanent house no.', c.permanentHouseNo],
				['Permanent PIN', c.permanentPin]
			]
		},
		{
			title: 'Identification',
			rows: [
				['PAN', c.panNo],
				['UAN', c.uanNo],
				['Driving licence', c.dlNo],
				['Passport', c.passportNo]
			]
		},
		{
			title: 'Bank',
			rows: [
				['Bank name', c.bankName],
				['Account number', c.accountNo],
				['IFSC', c.ifsc],
				['Branch', c.branch]
			]
		}
	]);

	const docCount = $derived(data.checklist.reduce((a, s) => a + s.docs.length, 0));
	const initial = $derived((c.fullName || c.email)[0].toUpperCase());
</script>

<a href="/admin" class="backlink">
	<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M15 6l-6 6 6 6" /></svg>
	All candidates
</a>

<div class="head">
	<div class="avatar">{initial}</div>
	<div style="flex:1;min-width:200px">
		<div style="display:flex;align-items:center;gap:11px;flex-wrap:wrap">
			<h1 style="font-size:26px;font-weight:800;margin:0">{c.fullName || c.email}</h1>
			<span class="pill {statusMeta[c.status]?.cls}">{statusMeta[c.status]?.label ?? c.status}</span>
			<img
				src={data.brand.logo.src}
				alt={data.brand.name}
				title="Recruiting for {data.brand.name}"
				style="height:26px;width:auto;max-width:200px;object-fit:contain;margin-left:auto;border-radius:8px;{data.brand.logo.onDark ? `background:${data.brand.colors.ink};padding:6px 10px` : ''}"
			/>
		</div>
		<div class="muted" style="margin-top:4px;font-size:13.5px">
			{c.email} · <span style="text-transform:capitalize">{c.track}</span> · {data.companyName}
			{#if c.submittedAt}· Submitted {new Date(c.submittedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}{/if}
			{#if c.consentAt}· Consent recorded{/if}
		</div>
	</div>
	<div style="display:flex;gap:10px;flex-wrap:wrap">
		{#if c.status === 'submitted'}
			<form method="POST" action="?/approve" use:enhance>
				<button class="btn teal">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20 6L9 17l-5-5" /></svg>
					Approve candidate
				</button>
			</form>
		{/if}
		{#if !['approved', 'complete', 'revoked'].includes(c.status)}
			<form method="POST" action="?/revoke" use:enhance onsubmit={(e) => {
				if (!confirm('Revoke this onboarding link?')) e.preventDefault();
			}}>
				<button class="btn ghost danger-hover">Revoke link</button>
			</form>
		{/if}
	</div>
</div>

{#if form?.message}<p class="error">{form.message}</p>{/if}
{#if data.flags.length}
	<div class="flagbox">
		<strong>Review flags ({data.flags.length})</strong>
		<ul style="margin:6px 0 0;padding-left:18px">
			{#each data.flags as flag}<li>{flag}</li>{/each}
		</ul>
	</div>
{/if}

<div class="cols">
	<!-- documents -->
	<section class="card">
		<div class="eyebrow" style="margin-bottom:16px">Documents · {docCount}</div>
		<div>
			{#each data.checklist as slot}
				{#if slot.docs.length === 0}
					<div class="docrow">
						<span class="doc-ico empty">
							<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
						</span>
						<div style="flex:1">
							<div class="doc-name" style="color:var(--smoke)">{slot.label}</div>
							<div class="doc-sub">Not uploaded</div>
						</div>
						{#if slot.mandatory}<span class="pill red">MISSING</span>{/if}
					</div>
				{:else}
					{#each slot.docs as doc}
						<div class="docrow">
							<span class="doc-ico">
								<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
							</span>
							<div style="flex:1;min-width:0">
								<div class="doc-name">{slot.label}</div>
								<div class="doc-sub">
									{doc.mime === 'application/pdf' ? 'PDF' : 'Image'} · {(doc.sizeBytes / 1024).toFixed(0)} KB
									{#if doc.reviewNote}· {doc.reviewNote}{/if}
								</div>
								{#if stdPill[doc.standardStatus]}
									<div style="margin-top:5px">
										<span class="pill {stdPill[doc.standardStatus].cls}">{stdPill[doc.standardStatus].label}</span>
										{#if doc.standardStatus !== 'pass' && doc.standardReasons?.length}
											<span class="muted" style="font-size:11.5px"> {doc.standardReasons.join(' ')}</span>
										{/if}
									</div>
								{/if}
								{#if doc.ocrTranscript}
									<details>
										<summary class="muted" style="cursor:pointer;font-size:11.5px">OCR transcript</summary>
										<pre>{doc.ocrTranscript}</pre>
									</details>
								{/if}
							</div>
							{#if doc.reviewStatus === 'reupload_requested'}
								<span class="pill red">RE-UPLOAD ASKED</span>
							{:else}
								<span class="pill {docPill[doc.ocrStatus]?.cls}">{docPill[doc.ocrStatus]?.label ?? doc.ocrStatus}</span>
							{/if}
							<a class="btn ghost small" href="/admin/candidates/{c.id}/doc/{doc.id}" target="_blank" rel="noopener">View</a>
							{#if c.status === 'submitted' && doc.reviewStatus !== 'reupload_requested'}
								<button type="button" class="btn ghost small" onclick={() => (reuploadFor = reuploadFor === doc.id ? null : doc.id)}>
									Re-upload
								</button>
							{/if}
						</div>
						{#if reuploadFor === doc.id}
							<form method="POST" action="?/requestReupload" use:enhance class="reupload">
								<input type="hidden" name="docId" value={doc.id} />
								<input name="note" placeholder="Reason shown to the candidate (e.g. glare on the number)" />
								<button class="btn small">Send</button>
							</form>
						{/if}
					{/each}
				{/if}
			{/each}
		</div>
	</section>

	<!-- details -->
	<div style="display:flex;flex-direction:column;gap:18px">
		<!-- verification -->
		<section class="card">
			<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
				<div class="eyebrow">Document verification</div>
				<div style="flex:1"></div>
				<form method="POST" action="?/crosscheck" use:enhance>
					<button class="btn ghost small">Run OCR cross-check</button>
				</form>
			</div>
			<p class="muted" style="font-size:11.5px;margin:0 0 12px">
				{#if data.digilockerEnabled}
					Candidate can self-verify via DigiLocker (authoritative). OCR cross-check compares read
					values against the typed master sheet.
				{:else}
					DigiLocker not configured — cross-check compares OCR-read values against the typed master
					sheet. Names use fuzzy matching; treat 60–82% as a manual-review band.
				{/if}
			</p>
			{#if form?.crosschecked !== undefined}
				<p class="muted" style="font-size:12px;margin:0 0 12px">
					Cross-check complete ({form.crosschecked} document{form.crosschecked === 1 ? '' : 's'}).
				</p>
			{/if}
			{#if data.verifications.length === 0}
				<p class="muted" style="font-size:13px;margin:0">No verifications yet.</p>
			{:else}
				{#each data.verifications as v}
					<div class="verif">
						<div class="verif-head">
							<span class="verif-name">{v.label}</span>
							<span class="src-badge">{sourceLabel[v.source] ?? v.source}</span>
							<div style="flex:1"></div>
							<span class="pill {verifStatusPill[v.status] ?? ''}">{v.status.toUpperCase()} · {v.score}%</span>
						</div>
						{#if v.note}
							<div class="muted" style="font-size:11.5px;margin-top:4px">{v.note}</div>
						{/if}
						{#each v.fieldResults as f}
							<div class="frow" style="padding:6px 0">
								<span class="flabel">{f.label}</span>
								<span class="fvalue" style="max-width:42%">
									<span class="muted" style="font-weight:400">typed:</span> {f.expected || '—'}
									&nbsp;·&nbsp;
									<span class="muted" style="font-weight:400">found:</span> {f.found || '—'}
								</span>
								<span class="pill {verdictPill[f.verdict] ?? ''}" style="flex:0 0 auto">
									{verdictLabel[f.verdict] ?? f.verdict}
								</span>
							</div>
						{/each}
					</div>
				{/each}
			{/if}
		</section>

		<section class="card">
			<div class="eyebrow" style="margin-bottom:10px">Extracted details</div>
			{#each detailGroups as group}
				<div class="group-title">{group.title}</div>
				{#each group.rows as [label, value]}
					<div class="frow">
						<span class="flabel">{label}</span>
						<span class="fvalue">{value || '—'}</span>
					</div>
				{/each}
			{/each}
			<div class="group-title">Aadhaar</div>
			<div class="frow" style="border-bottom:none">
				<span class="flabel">Aadhaar number</span>
				<span class="fvalue mono">{form?.aadhaar ?? c.aadhaarMasked}</span>
				{#if !form?.aadhaar && c.aadhaarMasked !== '—'}
					<form method="POST" action="?/reveal" use:enhance style="display:inline">
						<button class="btn ghost small">Reveal</button>
					</form>
				{/if}
			</div>
			<div class="lock-hint">
				<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
				Encrypted at rest. Every reveal is audit-logged.
			</div>
		</section>

		<section class="card">
			<div class="eyebrow red-eyebrow" style="margin-bottom:14px">Physical items · joining day</div>
			{#each data.physical as item}
				<form method="POST" action="?/physical" use:enhance class="physrow">
					<input type="hidden" name="itemId" value={item.id} />
					<input type="hidden" name="received" value={item.received ? 'false' : 'true'} />
					<button class="phys-check" class:on={item.received} aria-label="Toggle received">
						{#if item.received}
							<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><path d="M20 6L9 17l-5-5" /></svg>
						{/if}
					</button>
					<span style="flex:1;font-size:13.5px;font-weight:600;color:var(--fg-2)">{item.label}</span>
					<span class="phys-status" class:got={item.received}>
						{item.received
							? `Received${item.receivedAt ? ' · ' + new Date(item.receivedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}`
							: 'Pending'}
					</span>
				</form>
			{/each}
			<p class="muted" style="font-size:11.5px;margin:10px 0 0">
				Record reaches <em>complete</em> only when approved and all items are received.
			</p>
		</section>
	</div>
</div>

<style>
	.backlink {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-weight: 700;
		font-size: 13px;
		color: var(--purple);
		text-decoration: none;
		margin-bottom: 18px;
	}
	.head {
		display: flex;
		align-items: flex-start;
		gap: 18px;
		flex-wrap: wrap;
		margin-bottom: 22px;
	}
	.avatar {
		width: 60px;
		height: 60px;
		border-radius: 16px;
		background: linear-gradient(135deg, #6d08be 0%, #7a2bd0 100%);
		display: flex;
		align-items: center;
		justify-content: center;
		color: #fff;
		font-weight: 800;
		font-size: 24px;
		flex-shrink: 0;
	}
	.danger-hover:hover {
		border-color: var(--red) !important;
		color: var(--red) !important;
	}
	.flagbox {
		background: #fffbeb;
		border: 1px solid #fcd34d;
		border-radius: 16px;
		padding: 14px 18px;
		margin-bottom: 20px;
		font-size: 13px;
		color: var(--fg-2);
	}
	.cols {
		display: grid;
		grid-template-columns: 1.1fr 0.9fr;
		gap: 22px;
		align-items: start;
	}
	.docrow {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 11px 0;
		border-bottom: 1px solid var(--mist);
	}
	.doc-ico {
		width: 36px;
		height: 36px;
		border-radius: 9px;
		background: var(--mist);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		color: var(--purple);
	}
	.doc-ico.empty {
		color: var(--fog);
	}
	.doc-name {
		font-weight: 700;
		font-size: 13.5px;
	}
	.doc-sub {
		font-size: 11.5px;
		color: var(--smoke);
	}
	pre {
		white-space: pre-wrap;
		font-size: 11px;
		background: var(--paper);
		padding: 8px 10px;
		border-radius: 8px;
		max-height: 180px;
		overflow: auto;
		margin: 6px 0 0;
	}
	.reupload {
		display: flex;
		gap: 8px;
		padding: 8px 0 12px 48px;
		border-bottom: 1px solid var(--mist);
	}
	.group-title {
		font-weight: 800;
		font-size: 11px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--fog);
		margin: 14px 0 4px;
	}
	.frow {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 0;
		border-bottom: 1px solid var(--mist);
	}
	.flabel {
		flex: 1;
		font-size: 12.5px;
		color: var(--smoke);
	}
	.fvalue {
		font-size: 13.5px;
		font-weight: 600;
		text-align: right;
		max-width: 60%;
	}
	.mono {
		font-family: ui-monospace, monospace;
	}
	.lock-hint {
		font-size: 11px;
		color: var(--smoke);
		margin-top: 8px;
		display: flex;
		align-items: center;
		gap: 5px;
	}
	.red-eyebrow {
		color: var(--red);
	}
	.verif {
		border: 1px solid var(--mist);
		border-radius: 12px;
		padding: 12px 14px;
		margin-bottom: 12px;
	}
	.verif-head {
		display: flex;
		align-items: center;
		gap: 9px;
	}
	.verif-name {
		font-weight: 700;
		font-size: 13.5px;
	}
	.src-badge {
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--smoke);
		background: var(--mist);
		padding: 2px 7px;
		border-radius: 999px;
	}
	.physrow {
		display: flex;
		align-items: center;
		gap: 11px;
		padding: 8px 0;
	}
	.phys-check {
		width: 22px;
		height: 22px;
		border-radius: 7px;
		border: 1.5px solid var(--fog);
		background: #fff;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		padding: 0;
	}
	.phys-check.on {
		border-color: var(--teal);
		background: var(--teal);
	}
	.phys-status {
		font-size: 11.5px;
		font-weight: 700;
		color: var(--smoke);
	}
	.phys-status.got {
		color: var(--teal);
	}
	@media (max-width: 900px) {
		.cols {
			grid-template-columns: 1fr;
		}
	}
</style>
