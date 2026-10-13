<script lang="ts">
	import { enhance } from '$app/forms';
	import { brandCssVars, brandFontsHref } from '$lib/shared/brands';

	let { data, form } = $props();

	const brand = $derived(data.brand);
	const brandStyle = $derived(brandCssVars(brand));
	const fontsHref = $derived(brandFontsHref(brand));

	let submitting = $state(false);
	// Ticking the top-level verdict fills every unanswered row, since the common
	// case by far is "nothing outstanding" across the board.
	let bulk = $state('');

	function applyBulk(value: string) {
		bulk = value;
		for (const row of data.rows) {
			const el = document.querySelector<HTMLInputElement>(
				`input[name="row_${row.key}"][value="${value}"]`
			);
			if (el) el.checked = true;
		}
	}

	const VERDICTS = [
		{ value: 'no_dues', label: 'No dues' },
		{ value: 'dues', label: 'Dues outstanding' }
	];

	function stamp(iso: string | null): string {
		if (!iso) return '';
		return new Date(iso).toLocaleString('en-IN', {
			day: 'numeric',
			month: 'short',
			year: 'numeric',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	// Payroll's figures, kept live so the summary above them adds up as they type.
	// svelte-ignore state_referenced_locally
	let fnf = $state<Record<string, string>>(Object.fromEntries(data.fnfFields.map((f) => [f.key, f.value])));
	// svelte-ignore state_referenced_locally
	let checks = $state<Record<string, boolean>>(
		Object.fromEntries((data.payroll?.checks ?? []).map((c) => [c.key, c.checked]))
	);
	const allChecked = $derived(Object.values(checks).every(Boolean));
	let picked = $state<Record<string, string>>({});

	const amount = (v: string | undefined) => {
		const n = Number(String(v ?? '').replace(/[^0-9.\-]/g, ''));
		return Number.isFinite(n) ? n : 0;
	};
	const rupees = (n: number) => `₹${n.toLocaleString('en-IN', { maximumFractionDigits: 2 })}`;
	const deductions = $derived(
		['noticePayRecovery', 'assetRecovery', 'loanRecovery', 'otherDeductions'].reduce((t, k) => t + amount(fnf[k]), 0)
	);

	function kb(bytes: number): string {
		return bytes > 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1024))} KB`;
	}

	function pick(key: string, input: HTMLInputElement) {
		picked[key] = input.files?.[0]?.name ?? '';
	}

	const declarationRows = $derived(
		[
			{ label: 'Files handed over', value: data.declaration.filesHandover },
			{ label: 'Logins / credentials', value: data.declaration.loginsHandover },
			{ label: 'Leads & client follow-up', value: data.declaration.leadsHandover },
			{ label: 'Other notes', value: data.declaration.deptOthers }
		].filter((r) => r.value)
	);
</script>

<svelte:head>
	<title>{data.departmentLabel} clearance · {data.companyName}</title>
	{#if fontsHref}<link rel="stylesheet" href={fontsHref} />{/if}
</svelte:head>

<div class="scope" style={brandStyle}>
	<main class="wrap">
		<div class="brand-row">
			<img class="logo" src={brand.logo.src} alt={brand.name} />
		</div>

		{#if data.clearance.completed && !form?.done}
			<div class="card done">
				<div class="tick">
					<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M20 6L9 17l-5-5" /></svg>
				</div>
				<h1>Clearance already signed</h1>
				<p>
					The {data.departmentLabel} clearance for <b>{data.employee.fullName}</b> was signed
					{#if data.clearance.completedAt}on {stamp(data.clearance.completedAt)}{/if}
					by {data.clearance.approverName || 'your department'}. Nothing further is needed from you.
				</p>
				<p class="fine">
					If something needs correcting, reply to the email that brought you here and HR will reopen
					it.
				</p>
			</div>
		{:else if form?.done}
			<div class="card done">
				<div class="tick">
					<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M20 6L9 17l-5-5" /></svg>
				</div>
				<h1>Thank you — clearance recorded</h1>
				<p>
					Your sign-off for <b>{data.employee.fullName}</b> has been added to their No Dues
					certificate. HR has been notified.
				</p>
			</div>
		{:else}
			<div class="card">
				<div class="eyebrow">{data.departmentLabel} clearance</div>
				<h1>{data.sendBack ? 'HR needs a little more on this clearance' : "Please clear this employee's exit"}</h1>
				{#if data.sendBack}
					<div class="sentback">
						<strong>Sent back by HR — please complete and sign again</strong>
						{#if data.sendBack.items.length || data.sendBack.uploads.length}
							<ul>
								{#each data.sendBack.items as i (i)}<li>{i}</li>{/each}
								{#each data.sendBack.uploads as u (u)}<li>Attach: <b>{u}</b></li>{/each}
							</ul>
						{/if}
						{#if data.sendBack.note}<p>“{data.sendBack.note}”</p>{/if}
						<p class="sb-fine">Your earlier answers are still filled in below.</p>
					</div>
				{/if}
				<p class="lede">
					{data.employee.fullName} is leaving {data.companyName}. Confirm what your section is owed
					or has recovered, then sign below. It takes a minute and needs no login.
				</p>

				<div class="emp">
					<div class="erow"><span>Employee</span><b>{data.employee.fullName}</b></div>
					<div class="erow"><span>Employee ID</span><b>{data.employee.employeeId}</b></div>
					{#if data.employee.designation}
						<div class="erow"><span>Designation</span><b>{data.employee.designation}</b></div>
					{/if}
					{#if data.employee.department}
						<div class="erow"><span>Team</span><b>{data.employee.department}</b></div>
					{/if}
					{#if data.employee.reportingManager}
						<div class="erow"><span>Reporting to</span><b>{data.employee.reportingManager}</b></div>
					{/if}
					{#if data.employee.doj}
						<div class="erow"><span>Date of joining</span><b>{data.employee.doj}</b></div>
					{/if}
					<div class="erow">
						<span>Last working day</span><b>{data.employee.lwd ?? data.employee.resignationDate}</b>
					</div>
					{#if data.employee.service}
						<div class="erow"><span>Service</span><b>{data.employee.service}</b></div>
					{/if}
				</div>

				{#if declarationRows.length}
					<details class="decl">
						<summary>What the employee says they handed over</summary>
						{#each declarationRows as r}
							<div class="drow">
								<span>{r.label}</span>
								<p>{r.value}</p>
							</div>
						{/each}
					</details>
				{/if}

				{#if form?.message}
					<p class="err banner">{form.message}</p>
				{/if}

				<form
					method="POST"
					action="?/submit"
					enctype="multipart/form-data"
					use:enhance={() => {
						submitting = true;
						return async ({ update }) => {
							await update({ reset: false });
							submitting = false;
						};
					}}
				>
					{#if data.payroll}
						{@const p = data.payroll}
						<!-- Payroll does the whole F&F here: no login, no portal. The
						     documents come as one zip; the figures, the checks, the
						     payslips and the signature are all on this page. -->
						<ol class="steps" aria-label="What this page asks of you">
							<li>Check the documents</li>
							<li>Confirm the F&amp;F</li>
							<li>Tick the checks</li>
							<li>Upload payslips</li>
							<li>Sign</li>
						</ol>

						<section class="pblock">
							<div class="phead"><span class="pnum">1</span>Exit documents</div>
							<div class="pack">
								<div>
									<b>Everything on file for {data.employee.fullName.split(' ')[0]}</b>
									<span>{p.pack.items.length} files in one zip — the forms, the No Dues certificate and every upload.</span>
								</div>
								<a class="dl" href={p.pack.href} download data-sveltekit-reload>
									<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12m0 0l-5-5m5 5l5-5M5 21h14" /></svg>
									Download zip
								</a>
							</div>
							{#if p.pack.items.length}
								<details class="packlist">
									<summary>What is in it</summary>
									<ul>{#each p.pack.items as it, i (i)}<li>{it}</li>{/each}</ul>
								</details>
							{/if}
							{#if p.details.bankAccountName || p.details.panNo || p.details.uanNo}
								<div class="emp pdetails">
									{#if p.details.bankAccountName}<div class="erow"><span>Name as per bank</span><b>{p.details.bankAccountName}</b></div>{/if}
									{#if p.details.panNo}<div class="erow"><span>PAN</span><b>{p.details.panNo}</b></div>{/if}
									{#if p.details.uanNo}<div class="erow"><span>UAN</span><b>{p.details.uanNo}</b></div>{/if}
								</div>
							{/if}
							<p class="hint">These are for reference — only the settlement below is yours to change.</p>
						</section>

						<section class="pblock">
							<div class="phead"><span class="pnum">2</span>Full &amp; final settlement</div>
							<p class="hint">
								{#if data.fnfPrefilled}
									Prefilled by HR. Check each figure, correct anything that needs it, and record any loan or
									salary advance being recovered. What you save is final.
								{:else}
									Your figures go straight onto the exit record and the settlement statement.
								{/if}
							</p>
							<div class="fnf-grid">
								{#each data.fnfFields as f (f.key)}
									<label class="f" class:wide={f.key === 'loanRemarks'} class:net={f.key === 'netAmount'}>
										<span>{f.label}{#if f.key === 'netAmount'} <b class="req">*</b>{/if}</span>
										{#if f.date}
											<input type="date" name={f.key} bind:value={fnf[f.key]} />
										{:else if f.money}
											<div class="money">
												<i>₹</i>
												<input
													name={f.key}
													bind:value={fnf[f.key]}
													inputmode="decimal"
													placeholder="0"
													required={f.key === 'netAmount'}
												/>
											</div>
										{:else}
											<input name={f.key} bind:value={fnf[f.key]} />
										{/if}
									</label>
								{/each}
							</div>
							<div class="sum">
								<div><span>Leave encashment</span><b>{rupees(amount(fnf.leaveEncashmentAmount))}</b></div>
								<div><span>Recoveries &amp; deductions</span><b>− {rupees(deductions)}</b></div>
								<div class="sum-net"><span>Net F&amp;F payable</span><b>{fnf.netAmount ? rupees(amount(fnf.netAmount)) : '—'}</b></div>
							</div>
						</section>

						<section class="pblock">
							<div class="phead">
								<span class="pnum">3</span>F&amp;F checks
								<button
									type="button"
									class="bulkbtn tick-all"
									onclick={() => {
										for (const k of Object.keys(checks)) checks[k] = !allChecked;
									}}
								>
									{allChecked ? 'Untick all' : 'Tick all'}
								</button>
							</div>
							<p class="hint">Confirm each one before you sign. All are required.</p>
							<div class="checks">
								{#each p.checks as c (c.key)}
									<label class="chk" class:on={checks[c.key]}>
										<input type="checkbox" name="check_{c.key}" bind:checked={checks[c.key]} />
										<span>{c.label}</span>
									</label>
								{/each}
							</div>
						</section>

						<section class="pblock">
							<div class="phead"><span class="pnum">4</span>Payslips</div>
							<p class="hint">
								The last three months' payslips. They go to {data.employee.fullName.split(' ')[0]} with the final
								documents. PDF, JPG, PNG or WEBP, up to 25 MB each.
							</p>
							<div class="slips">
								{#each p.payslips as s, i (s.docType)}
									<div class="slip" class:has={s.file || picked[s.docType]}>
										<div class="slip-top">
											<b>{s.month ?? `Month ${i + 1}`}</b>
											{#if s.required && !s.file}<em class="req">required</em>{:else if !s.required}<em>if applicable</em>{/if}
										</div>
										{#if s.file}
											<a class="onfile" href={s.file.href} target="_blank" rel="noopener">On file · {kb(s.file.sizeBytes)}</a>
										{/if}
										<label class="pickfile">
											<input
												type="file"
												name={s.docType}
												accept="application/pdf,image/jpeg,image/png,image/webp"
												onchange={(ev) => pick(s.docType, ev.currentTarget)}
											/>
											<span>{picked[s.docType] || (s.file ? 'Replace…' : 'Choose file…')}</span>
										</label>
									</div>
								{/each}
								<div class="slip" class:has={p.worksheet || picked.fnf_statement}>
									<div class="slip-top"><b>F&amp;F worksheet</b><em>optional</em></div>
									{#if p.worksheet}
										<a class="onfile" href={p.worksheet.href} target="_blank" rel="noopener">On file · {kb(p.worksheet.sizeBytes)}</a>
									{/if}
									<label class="pickfile">
										<input
											type="file"
											name="fnf_statement"
											accept="application/pdf,image/jpeg,image/png,image/webp"
											onchange={(ev) => pick('fnf_statement', ev.currentTarget)}
										/>
										<span>{picked.fnf_statement || (p.worksheet ? 'Replace…' : 'Choose file…')}</span>
									</label>
								</div>
							</div>
						</section>

						<div class="phead last"><span class="pnum">5</span>No dues &amp; sign-off</div>
					{/if}

					<div class="bulk" class:hidden={data.rows.length < 2}>
						<span>Mark everything as</span>
						{#each VERDICTS as v}
							<button
								type="button"
								class="bulkbtn"
								class:on={bulk === v.value}
								onclick={() => applyBulk(v.value)}
							>
								{v.label}
							</button>
						{/each}
					</div>

					<div class="rows">
						{#each data.rows as row}
							<div class="row">
								<div class="rlabel">{row.label}</div>
								<!-- Shown only when a declaration actually exists. It used to fall
								     back to "not answered yet", which made sense while someone was
								     expected to fill it in; now that this side is the only place the
								     position is recorded, that line would sit there for ever telling
								     an approver to wait for an answer nobody is going to give. -->
								{#if row.employeeSaid}
									<p class="declared" class:pending={row.employeeSaidValue === 'pending'}>
										<span class="dtag">Employee says</span>
										<span class="dval">{row.employeeSaid}</span>
										{#if row.employeeNote}<span class="dnote">— {row.employeeNote}</span>{/if}
									</p>
								{/if}
								<div class="ropts">
									{#each VERDICTS as v}
										<label class="radio">
											<input type="radio" name={`row_${row.key}`} value={v.value} checked={row.verdict === v.value} />
											<span>{v.label}</span>
										</label>
									{/each}
								</div>
								<input
									class="rremark"
									name={`remark_${row.key}`}
									value={row.remark}
									placeholder="Remarks (optional)"
								/>
							</div>
						{/each}
					</div>

					{#if data.verifiesAssets && data.assets.length}
						<div class="block">
							<div class="eyebrow small">Company assets recovered</div>
							<p class="hint">
								Tick what you have physically received. This updates the employee's asset record.
							</p>
							{#each data.assets as a}
								<label class="acheck">
									<input type="hidden" name={`assetseen_${a.item}`} value="1" />
									<input type="checkbox" name={`asset_${a.item}`} checked={a.returned} />
									<span>{a.item}</span>
									{#if a.note}<em>{a.note}</em>{/if}
								</label>
							{/each}
						</div>
					{/if}

					<div class="block">
						<div class="eyebrow small">Your sign-off</div>
						<div class="fgrid">
							<label class="f">
								<span>Your name <b class="req">*</b></span>
								<input name="approverName" required value={data.clearance.approverName} />
							</label>
							<label class="f">
								<span>Designation</span>
								<input name="approverDesignation" value={data.clearance.approverDesignation} />
							</label>
						</div>
						<div class="qblock">
							<div class="qlabel">Overall, for {data.departmentLabel} <b class="req">*</b></div>
							<div class="radios">
								{#each VERDICTS as v}
									<label class="radio">
										<input type="radio" name="verdict" value={v.value} checked={data.clearance.verdict === v.value} required />
										<span>{v.label}</span>
									</label>
								{/each}
							</div>
						</div>
						<label class="f">
							<span>Remarks</span>
							<textarea name="remarks" rows="2" value={data.clearance.remarks}></textarea>
						</label>
						{#if data.sendBack}
							{#each data.sendBack.uploads as u, i (i)}
								<label class="f">
									<span>
										{u} <b class="req">*</b>
										<em class="sub">Asked for by HR. PDF, JPG, PNG or WEBP, up to 25 MB.</em>
									</span>
									<input type="file" name="requested_{i}" accept="application/pdf,image/jpeg,image/png,image/webp" required />
								</label>
							{/each}
						{/if}
						<label class="f">
							<span>
								Your signature {#if !data.clearance.hasSignature}<b class="req">*</b>{/if}
								<em class="sub">
									A photo or scan on white paper. Printed onto the No Dues certificate.
								</em>
							</span>
							<input type="file" name="signature" accept="image/jpeg,image/png,image/webp" />
						</label>
					</div>

					{#if data.payroll && !allChecked}
						<p class="hint warn">Tick every F&amp;F check above before you sign.</p>
					{/if}
					<button class="cta" disabled={submitting}>
						{submitting
							? 'Submitting…'
							: data.sendBack
								? 'Update & sign again'
								: data.payroll
									? 'Save F&F and sign'
									: 'Sign clearance'}
					</button>
				</form>
			</div>
		{/if}

		<p class="foot">{brand.legalName} · exit clearance</p>
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
		max-width: 720px;
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
	.card {
		background: var(--brand-surface, #fff);
		border: 1px solid var(--brand-border, #e6e6ee);
		border-radius: var(--brand-card-radius, 16px);
		padding: 28px 28px 30px;
	}
	.eyebrow {
		font-size: 11px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--brand-primary, #6b4cf6);
		font-weight: 600;
		margin-bottom: 10px;
	}
	.eyebrow.small {
		margin-bottom: 8px;
	}
	h1 {
		margin: 0 0 12px;
		font-size: 22px;
		font-weight: 700;
		line-height: 1.28;
	}
	.lede {
		margin: 0 0 22px;
		font-size: 14px;
		line-height: 1.68;
		color: var(--brand-muted, #71717f);
	}
	.emp {
		border: 1px solid var(--brand-border, #e6e6ee);
		border-radius: 11px;
		overflow: hidden;
		margin-bottom: 18px;
	}
	.erow {
		display: flex;
		justify-content: space-between;
		gap: 14px;
		padding: 9px 14px;
		font-size: 13px;
		border-bottom: 1px solid var(--brand-border, #e6e6ee);
	}
	.erow:last-child {
		border-bottom: none;
	}
	.erow span {
		color: var(--brand-muted, #71717f);
	}
	.decl {
		margin-bottom: 20px;
		font-size: 13px;
	}
	.decl summary {
		cursor: pointer;
		color: var(--brand-primary, #6b4cf6);
		font-weight: 500;
	}
	.drow {
		margin-top: 11px;
	}
	.drow span {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.07em;
		color: var(--brand-muted, #71717f);
		font-weight: 600;
	}
	.drow p {
		margin: 3px 0 0;
		font-size: 13px;
		line-height: 1.6;
		white-space: pre-wrap;
	}
	.bulk {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
		font-size: 12.5px;
		color: var(--brand-muted, #71717f);
		margin-bottom: 14px;
	}
	.bulkbtn {
		font: inherit;
		font-size: 12px;
		font-weight: 600;
		background: none;
		border: 1px solid var(--brand-border, #e6e6ee);
		border-radius: 7px;
		padding: 6px 12px;
		cursor: pointer;
		color: inherit;
		box-shadow: none;
	}
	.bulkbtn.on,
	.bulkbtn:hover {
		border-color: var(--brand-primary, #6b4cf6);
		color: var(--brand-primary, #6b4cf6);
	}
	.rows {
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.row {
		padding: 13px 0;
		border-top: 1px solid var(--brand-border, #e6e6ee);
	}
	/* The employee's own claim for this row, so the approver confirms or
	   contradicts something specific rather than ticking from memory. */
	.declared {
		margin: 6px 0 8px;
		font-size: 12px;
		line-height: 1.5;
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		align-items: baseline;
	}
	.dtag {
		font-weight: 800;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		font-size: 10px;
		opacity: 0.6;
	}
	.dval {
		font-weight: 700;
	}
	/* "Still with me" is the answer the approver most needs to notice. */
	.declared.pending .dval {
		color: #b42318;
	}
	.dnote {
		opacity: 0.8;
	}

	.rlabel {
		font-size: 13px;
		font-weight: 500;
		line-height: 1.55;
		margin-bottom: 8px;
	}
	.ropts {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		margin-bottom: 8px;
	}
	.radio {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 12.5px;
		border: 1px solid var(--brand-border, #e6e6ee);
		border-radius: 8px;
		padding: 6px 11px;
		cursor: pointer;
	}
	.radio input {
		accent-color: var(--brand-primary, #6b4cf6);
	}
	.radio:has(input:checked) {
		border-color: var(--brand-primary, #6b4cf6);
		background: color-mix(in srgb, var(--brand-primary, #6b4cf6) 7%, transparent);
	}
	.rremark,
	.f input,
	.f textarea {
		font: inherit;
		font-size: 13px;
		padding: 8px 11px;
		border: 1px solid var(--brand-border, #e6e6ee);
		border-radius: 8px;
		background: #fff;
		color: inherit;
		width: 100%;
		box-sizing: border-box;
	}
	.f textarea {
		resize: vertical;
	}
	.rremark:focus,
	.f input:focus,
	.f textarea:focus {
		outline: none;
		border-color: var(--brand-primary, #6b4cf6);
		box-shadow: 0 0 0 3px var(--brand-focus-ring, rgba(107, 76, 246, 0.18));
	}
	.block {
		margin-top: 26px;
		padding-top: 20px;
		border-top: 1px solid var(--brand-border, #e6e6ee);
	}
	.sentback {
		margin: 4px 0 18px;
		padding: 12px 16px;
		border-left: 4px solid #f79009;
		background: #fffaeb;
		border-radius: 0 10px 10px 0;
		font-size: 13.5px;
		color: #1d2939;
	}
	.sentback ul {
		margin: 6px 0;
		padding-left: 20px;
		line-height: 1.6;
	}
	.sentback p {
		margin: 6px 0 0;
	}
	.sb-fine {
		font-size: 12px;
		color: #667085;
	}
	.hint {
		font-size: 12px;
		line-height: 1.6;
		color: var(--brand-muted, #71717f);
		margin: 0 0 12px;
	}
	.acheck {
		display: flex;
		align-items: center;
		gap: 9px;
		font-size: 13px;
		padding: 6px 0;
		cursor: pointer;
	}
	.acheck input[type='checkbox'] {
		accent-color: var(--brand-primary, #6b4cf6);
	}
	.acheck em {
		font-style: normal;
		font-size: 11.5px;
		color: var(--brand-muted, #71717f);
	}
	.fgrid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
		gap: 13px 16px;
	}
	.f {
		display: flex;
		flex-direction: column;
		gap: 5px;
		margin-bottom: 14px;
		min-width: 0;
	}
	.f > span {
		font-size: 12px;
		font-weight: 500;
		line-height: 1.5;
	}
	.sub {
		display: block;
		font-style: normal;
		font-weight: 400;
		font-size: 11.5px;
		color: var(--brand-muted, #71717f);
		margin-top: 2px;
	}
	.req {
		color: #c0392b;
	}
	.qblock {
		margin-bottom: 16px;
	}
	.qlabel {
		font-size: 12.5px;
		font-weight: 600;
		margin-bottom: 7px;
	}
	.radios {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.cta {
		background: var(--brand-primary, #6b4cf6);
		color: var(--brand-on-primary, #fff);
		border: none;
		border-radius: var(--brand-btn-radius, 9px);
		padding: 13px 26px;
		font: inherit;
		font-size: 14px;
		font-weight: 600;
		text-transform: var(--brand-cta-transform, none);
		box-shadow: var(--brand-btn-shadow);
		cursor: pointer;
		margin-top: 8px;
	}
	.cta:disabled {
		opacity: 0.6;
		cursor: default;
	}
	.err {
		color: #c0392b;
		font-size: 12.5px;
		line-height: 1.55;
	}
	.err.banner {
		margin: 0 0 16px;
		padding: 11px 14px;
		background: rgba(192, 57, 43, 0.07);
		border: 1px solid rgba(192, 57, 43, 0.2);
		border-radius: 9px;
	}
	.done {
		text-align: center;
		padding: 40px 30px;
	}
	.tick {
		width: 58px;
		height: 58px;
		border-radius: 50%;
		background: rgba(62, 190, 130, 0.14);
		color: #1c7d55;
		display: grid;
		place-items: center;
		margin: 0 auto 20px;
	}
	.done p {
		margin: 0 0 14px;
		font-size: 14px;
		line-height: 1.7;
		color: var(--brand-muted, #71717f);
	}
	.fine {
		font-size: 12px;
	}
	.foot {
		text-align: center;
		font-size: 11.5px;
		color: var(--brand-muted, #71717f);
		margin: 22px 0 0;
	}
	@media (max-width: 560px) {
		.card {
			padding: 22px 18px 24px;
		}
	}

	/* ── Payroll: the whole F&F on this page ── */
	.hidden {
		display: none;
	}
	.steps {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
		list-style: none;
		counter-reset: step;
		margin: 0 0 18px;
		padding: 0;
	}
	.steps li {
		counter-increment: step;
		font-size: 11.5px;
		font-weight: 600;
		padding: 5px 10px 5px 6px;
		border-radius: 999px;
		background: color-mix(in srgb, var(--brand-primary, #6b4cf6) 7%, transparent);
		color: var(--brand-primary, #6b4cf6);
		display: inline-flex;
		align-items: center;
		gap: 6px;
	}
	.steps li::before {
		content: counter(step);
		width: 17px;
		height: 17px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		font-size: 10px;
		background: var(--brand-primary, #6b4cf6);
		color: var(--brand-on-primary, #fff);
	}
	.pblock {
		padding: 18px 0 6px;
		border-top: 1px solid var(--brand-border, #e6e6ee);
	}
	.phead {
		display: flex;
		align-items: center;
		gap: 9px;
		font-size: 14.5px;
		font-weight: 700;
		margin-bottom: 8px;
	}
	.phead.last {
		padding-top: 18px;
		border-top: 1px solid var(--brand-border, #e6e6ee);
		margin-bottom: 12px;
	}
	.pnum {
		width: 22px;
		height: 22px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		font-size: 11.5px;
		background: var(--brand-primary, #6b4cf6);
		color: var(--brand-on-primary, #fff);
		flex-shrink: 0;
	}
	.tick-all {
		margin-left: auto;
	}
	.pack {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 14px;
		padding: 14px 16px;
		border: 1px solid var(--brand-border, #e6e6ee);
		border-radius: 12px;
		background: color-mix(in srgb, var(--brand-primary, #6b4cf6) 4%, transparent);
	}
	.pack b {
		display: block;
		font-size: 13.5px;
	}
	.pack span {
		font-size: 12px;
		color: var(--brand-muted, #71717f);
	}
	.dl {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		flex-shrink: 0;
		padding: 9px 15px;
		border-radius: var(--brand-btn-radius, 9px);
		background: var(--brand-primary, #6b4cf6);
		color: var(--brand-on-primary, #fff);
		font-size: 13px;
		font-weight: 600;
		text-decoration: none;
	}
	.dl:hover {
		filter: brightness(1.08);
	}
	.packlist {
		margin: 10px 0 0;
		font-size: 12.5px;
	}
	.packlist summary {
		cursor: pointer;
		color: var(--brand-primary, #6b4cf6);
		font-weight: 500;
	}
	.packlist ul {
		margin: 8px 0 0;
		padding-left: 18px;
		columns: 2 220px;
		line-height: 1.7;
		color: var(--brand-muted, #71717f);
	}
	.pdetails {
		margin: 12px 0 8px;
	}
	.fnf-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
		gap: 0 14px;
	}
	.f.wide {
		grid-column: 1 / -1;
	}
	.money {
		position: relative;
	}
	.money i {
		position: absolute;
		left: 11px;
		top: 50%;
		transform: translateY(-50%);
		font-style: normal;
		font-size: 13px;
		color: var(--brand-muted, #71717f);
		pointer-events: none;
	}
	.f .money input {
		padding-left: 24px;
	}
	.f.net input {
		font-weight: 700;
		border-color: color-mix(in srgb, var(--brand-primary, #6b4cf6) 45%, transparent);
	}
	.sum {
		display: grid;
		grid-template-columns: repeat(3, 1fr);
		border: 1px solid var(--brand-border, #e6e6ee);
		border-radius: 12px;
		overflow: hidden;
		margin: 2px 0 12px;
	}
	.sum div {
		padding: 10px 14px;
		display: flex;
		flex-direction: column;
		gap: 2px;
	}
	.sum div + div {
		border-left: 1px solid var(--brand-border, #e6e6ee);
	}
	.sum span {
		font-size: 11px;
		text-transform: uppercase;
		letter-spacing: 0.06em;
		color: var(--brand-muted, #71717f);
		font-weight: 600;
	}
	.sum b {
		font-size: 15px;
	}
	.sum-net {
		background: color-mix(in srgb, var(--brand-primary, #6b4cf6) 7%, transparent);
	}
	.sum-net b {
		color: var(--brand-primary, #6b4cf6);
	}
	.checks {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
		gap: 8px;
		margin-bottom: 12px;
	}
	.chk {
		display: flex;
		align-items: flex-start;
		gap: 9px;
		padding: 10px 12px;
		border: 1px solid var(--brand-border, #e6e6ee);
		border-radius: 10px;
		font-size: 12.5px;
		line-height: 1.45;
		cursor: pointer;
		transition: border-color 0.12s, background 0.12s;
	}
	/* The root layout gives every input full width and padding; a tick box
	   or radio must keep its own size. */
	.chk input,
	.radio input,
	.acheck input[type='checkbox'] {
		width: auto;
		padding: 0;
		margin: 0;
		box-shadow: none;
	}
	.chk input {
		margin-top: 2px;
		accent-color: var(--brand-primary, #6b4cf6);
		flex-shrink: 0;
	}
	.chk.on {
		border-color: var(--brand-primary, #6b4cf6);
		background: color-mix(in srgb, var(--brand-primary, #6b4cf6) 6%, transparent);
	}
	.slips {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
		gap: 10px;
		margin-bottom: 12px;
	}
	.slip {
		border: 1.5px dashed var(--brand-border, #d9d9e3);
		border-radius: 12px;
		padding: 12px;
		display: flex;
		flex-direction: column;
		gap: 8px;
		min-width: 0;
	}
	.slip.has {
		border-style: solid;
		border-color: color-mix(in srgb, #1c7d55 50%, transparent);
		background: rgba(62, 190, 130, 0.06);
	}
	.slip-top {
		display: flex;
		justify-content: space-between;
		align-items: baseline;
		gap: 6px;
		font-size: 13px;
	}
	.slip-top em {
		font-style: normal;
		font-size: 10.5px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--brand-muted, #71717f);
	}
	.slip-top em.req {
		color: #c0392b;
	}
	.onfile {
		font-size: 12px;
		color: #1c7d55;
		font-weight: 600;
		text-decoration: none;
	}
	.onfile::before {
		content: '✓ ';
	}
	.pickfile {
		position: relative;
		display: block;
		font-size: 12px;
		padding: 7px 10px;
		border-radius: 8px;
		border: 1px solid var(--brand-border, #e6e6ee);
		background: var(--brand-surface, #fff);
		cursor: pointer;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		text-align: center;
	}
	.pickfile:hover {
		border-color: var(--brand-primary, #6b4cf6);
		color: var(--brand-primary, #6b4cf6);
	}
	.pickfile input {
		position: absolute;
		inset: 0;
		opacity: 0;
		cursor: pointer;
	}
	.hint.warn {
		color: #b54708;
		margin: 6px 0 0;
	}
	@media (max-width: 560px) {
		.fnf-grid,
		.sum {
			grid-template-columns: 1fr;
		}
		.sum div + div {
			border-left: none;
			border-top: 1px solid var(--brand-border, #e6e6ee);
		}
		.pack {
			flex-direction: column;
			align-items: stretch;
		}
		.dl {
			justify-content: center;
		}
	}
</style>
