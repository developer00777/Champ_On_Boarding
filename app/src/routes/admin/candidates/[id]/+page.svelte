<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	let reuploadFor: string | null = $state(null);

	const c = $derived(data.candidate);

	const personalRows = $derived([
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
		['Spouse name', c.spouseName],
		['Spouse contact', c.spouseContact],
		['Spouse DOB', c.spouseDob]
	]);
	const addressRows = $derived([
		['Present address', c.presentAddress],
		['Present house no.', c.presentHouseNo],
		['Present PIN', c.presentPin],
		['Permanent address', c.permanentAddress],
		['Permanent house no.', c.permanentHouseNo],
		['Permanent PIN', c.permanentPin]
	]);
	const idRows = $derived([
		['Aadhaar', form?.aadhaar ?? c.aadhaarMasked],
		['PAN', c.panNo],
		['UAN', c.uanNo],
		['Driving licence', c.dlNo],
		['Passport', c.passportNo]
	]);
	const bankRows = $derived([
		['Bank name', c.bankName],
		['Account number', c.accountNo],
		['IFSC', c.ifsc],
		['Branch', c.branch]
	]);
</script>

<p><a href="/admin">← All candidates</a></p>

<section class="card">
	<div style="display:flex;justify-content:space-between;gap:1rem;flex-wrap:wrap;align-items:center">
		<div>
			<h1 style="margin:.2rem 0">{c.fullName || c.email}</h1>
			<p class="muted" style="margin:0">
				{data.companyName} · {c.track} · <span class="badge blue">{c.status.replace('_', ' ')}</span>
				{#if c.consentAt}· consent {new Date(c.consentAt).toLocaleString('en-IN')}{/if}
			</p>
		</div>
		<div style="display:flex;gap:.5rem;flex-wrap:wrap">
			{#if c.status === 'submitted'}
				<form method="POST" action="?/approve" use:enhance>
					<button>Approve</button>
				</form>
			{/if}
			{#if !['approved', 'complete', 'revoked'].includes(c.status)}
				<form
					method="POST"
					action="?/revoke"
					use:enhance
					onsubmit={(e) => {
						if (!confirm('Revoke this onboarding link?')) e.preventDefault();
					}}
				>
					<button class="danger">Revoke link</button>
				</form>
			{/if}
		</div>
	</div>
	{#if form?.message}<p class="error">{form.message}</p>{/if}
	{#if data.flags.length}
		<div class="flagbox">
			<strong>Review flags ({data.flags.length})</strong>
			<ul style="margin:.3rem 0 0">
				{#each data.flags as flag}<li>{flag}</li>{/each}
			</ul>
		</div>
	{/if}
</section>

<div class="cols">
	<div>
		<section class="card">
			<h2>Documents</h2>
			{#each data.checklist as slot}
				<div class="docslot">
					<div style="display:flex;justify-content:space-between;align-items:baseline;gap:.5rem">
						<strong>{slot.label}</strong>
						{#if slot.mandatory && !slot.satisfied}<span class="badge red">missing</span>{/if}
					</div>
					{#each slot.docs as doc}
						<div class="docline">
							<a href="/admin/candidates/{c.id}/doc/{doc.id}" target="_blank" rel="noopener">
								View {doc.mime === 'application/pdf' ? 'PDF' : 'image'} ↗
							</a>
							<span class="badge {doc.ocrStatus === 'parsed' ? 'green' : doc.ocrStatus === 'unreadable' || doc.ocrStatus === 'failed' ? 'red' : ''}">
								{doc.ocrStatus}
							</span>
							{#if doc.reviewStatus === 'reupload_requested'}
								<span class="badge amber">re-upload requested</span>
							{:else if c.status === 'submitted'}
								<button type="button" class="secondary small" onclick={() => (reuploadFor = reuploadFor === doc.id ? null : doc.id)}>
									Request re-upload
								</button>
							{/if}
						</div>
						{#if reuploadFor === doc.id}
							<form method="POST" action="?/requestReupload" use:enhance class="reupload">
								<input type="hidden" name="docId" value={doc.id} />
								<input name="note" placeholder="Reason shown to the candidate (e.g. glare on the number)" />
								<button class="small">Send</button>
							</form>
						{/if}
						{#if doc.ocrTranscript}
							<details>
								<summary class="muted">OCR transcript</summary>
								<pre>{doc.ocrTranscript}</pre>
							</details>
						{/if}
					{/each}
					{#if slot.docs.length === 0}<p class="muted" style="margin:.2rem 0">Not uploaded</p>{/if}
				</div>
			{/each}
		</section>

		<section class="card">
			<h2>Physical handover</h2>
			<p class="muted">Record reaches <em>complete</em> only when approved and all items are received.</p>
			{#each data.physical as item}
				<form method="POST" action="?/physical" use:enhance class="physrow">
					<input type="hidden" name="itemId" value={item.id} />
					<input type="hidden" name="received" value={item.received ? 'false' : 'true'} />
					<span>
						{item.received ? '✅' : '⬜'}
						{item.label}
						{#if item.receivedAt}<span class="muted"> — {new Date(item.receivedAt).toLocaleDateString('en-IN')}</span>{/if}
					</span>
					<button class="secondary small">{item.received ? 'Mark not received' : 'Mark received'}</button>
				</form>
			{/each}
		</section>
	</div>

	<div>
		<section class="card">
			<h2>Master sheet</h2>
			<h3>Personal</h3>
			<table>
				<tbody>
					{#each personalRows as [label, value]}
						<tr><th style="width:42%">{label}</th><td>{value || '—'}</td></tr>
					{/each}
				</tbody>
			</table>
			<h3>Address</h3>
			<table>
				<tbody>
					{#each addressRows as [label, value]}
						<tr><th style="width:42%">{label}</th><td>{value || '—'}</td></tr>
					{/each}
				</tbody>
			</table>
			<h3>Identification</h3>
			<table>
				<tbody>
					{#each idRows as [label, value]}
						<tr>
							<th style="width:42%">{label}</th>
							<td>
								{value || '—'}
								{#if label === 'Aadhaar' && !form?.aadhaar && c.aadhaarMasked !== '—'}
									<form method="POST" action="?/reveal" use:enhance style="display:inline">
										<button class="secondary small">Reveal (logged)</button>
									</form>
								{/if}
							</td>
						</tr>
					{/each}
				</tbody>
			</table>
			<h3>Bank</h3>
			<table>
				<tbody>
					{#each bankRows as [label, value]}
						<tr><th style="width:42%">{label}</th><td>{value || '—'}</td></tr>
					{/each}
				</tbody>
			</table>
		</section>
	</div>
</div>

<style>
	.cols {
		display: grid;
		grid-template-columns: 1.1fr 1fr;
		gap: 1rem;
		align-items: start;
	}
	@media (max-width: 900px) {
		.cols {
			grid-template-columns: 1fr;
		}
	}
	.docslot {
		padding: 0.6rem 0;
		border-bottom: 1px solid #f1f5f9;
	}
	.docline {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		margin-top: 0.25rem;
		flex-wrap: wrap;
	}
	.reupload {
		display: flex;
		gap: 0.5rem;
		margin-top: 0.4rem;
	}
	.physrow {
		display: flex;
		justify-content: space-between;
		align-items: center;
		gap: 0.5rem;
		padding: 0.4rem 0;
	}
	.flagbox {
		margin-top: 0.75rem;
		padding: 0.6rem 0.8rem;
		background: #fffbeb;
		border: 1px solid #fcd34d;
		border-radius: 8px;
	}
	pre {
		white-space: pre-wrap;
		font-size: 0.75rem;
		background: #f8fafc;
		padding: 0.5rem;
		border-radius: 6px;
		max-height: 200px;
		overflow: auto;
	}
	button.small {
		padding: 0.15rem 0.5rem;
		font-size: 0.75rem;
	}
	h3 {
		margin: 1rem 0 0.25rem;
		font-size: 0.95rem;
	}
</style>
