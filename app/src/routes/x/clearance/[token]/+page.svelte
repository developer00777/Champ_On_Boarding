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
				<h1>Please clear this employee's exit</h1>
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
					<div class="bulk">
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
						<label class="f">
							<span>
								Your signature <b class="req">*</b>
								<em class="sub">
									A photo or scan on white paper. Printed onto the No Dues certificate.
								</em>
							</span>
							<input type="file" name="signature" accept="image/jpeg,image/png,image/webp" />
						</label>
					</div>

					<button class="cta" disabled={submitting}>
						{submitting ? 'Submitting…' : 'Sign clearance'}
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
</style>
