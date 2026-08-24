<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import {
		CLOSURE_CHECKLIST,
		EXIT_Q11_ROWS,
		EXIT_Q11_SCALE,
		EXIT_Q12_ROWS,
		EXIT_Q12_SCALE,
		EXIT_Q13_ROWS,
		EXIT_Q13_SCALE,
		EXIT_RECOMMEND_OPTIONS,
		EXIT_STATUS_META,
		EXIT_TEXT_QUESTIONS,
		EXIT_WORKLOAD_OPTIONS,
		RELIEVING_ITEMS
	} from '$lib/shared/offboarding';

	let { data, form } = $props();

	const e = $derived(data.exit);
	const statusMeta = $derived(EXIT_STATUS_META[e.status] ?? { label: e.status, cls: '' });

	// In-flight flags per section, so each button reports its own progress rather
	// than the page going quiet on a slow mail send.
	let sending = $state<Record<string, boolean>>({});
	let uploading = $state<Record<string, boolean>>({});
	let uploadError = $state<Record<string, string>>({});
	let copied = $state('');

	// Which review items HR has ticked to send back to the employee.
	let changeFields = $state<string[]>([]);

	function track(key: string) {
		return () => {
			sending[key] = true;
			return async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => {
				await update({ reset: false });
				sending[key] = false;
			};
		};
	}

	async function copy(text: string, key: string) {
		try {
			await navigator.clipboard.writeText(text);
			copied = key;
			setTimeout(() => (copied = ''), 1800);
		} catch {
			copied = '';
		}
	}

	async function uploadHandover(docType: string, input: HTMLInputElement) {
		const file = input.files?.[0];
		if (!file) return;
		uploading[docType] = true;
		uploadError[docType] = '';
		try {
			const body = new FormData();
			body.append('docType', docType);
			body.append('file', file);
			const res = await fetch(`/admin/offboarding/${page.params.id}/upload`, { method: 'POST', body });
			if (!res.ok) {
				const text = await res.text();
				throw new Error(text.slice(0, 200) || 'Upload failed');
			}
			await invalidateAll();
		} catch (err) {
			uploadError[docType] = err instanceof Error ? err.message : 'Upload failed';
		} finally {
			uploading[docType] = false;
			input.value = '';
		}
	}

	function stamp(iso: string | null): string {
		if (!iso) return '';
		return new Date(iso).toLocaleString('en-IN', {
			day: 'numeric',
			month: 'short',
			year: '2-digit',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function kb(bytes: number): string {
		return bytes > 1024 * 1024
			? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
			: `${Math.max(1, Math.round(bytes / 1024))} KB`;
	}

	const VERDICT_LABEL: Record<string, string> = { no_dues: 'No dues', dues: 'Dues outstanding' };

	const scaleLabel = (scale: readonly { value: string; label: string }[], v: string | null) =>
		scale.find((s) => s.value === v)?.label ?? '—';

	// The employee's answers, flattened into the review list HR ticks items from.
	// `field` is the dotted path the re-request action stores and the mail names.
	const reviewGroups = $derived([
		{
			title: 'No Dues details',
			items: [
				{ field: 'ndc.team', label: 'Team / department', value: e.ndc?.team },
				{ field: 'ndc.nameAsPerBank', label: 'Name as per bank', value: e.ndc?.nameAsPerBank },
				{ field: 'ndc.filesHandover', label: 'Files handed over', value: e.ndc?.filesHandover },
				{ field: 'ndc.loginsHandover', label: 'Logins handed over', value: e.ndc?.loginsHandover },
				{ field: 'ndc.leadsHandover', label: 'Leads & client follow-up', value: e.ndc?.leadsHandover },
				{ field: 'ndc.deptOthers', label: 'Other remarks', value: e.ndc?.deptOthers }
			]
		},
		{
			title: 'NDA & Non-Compete',
			items: [
				{ field: 'nda.agreementDate', label: 'Agreement date', value: e.nda?.agreementDate },
				{ field: 'nda.fullName', label: 'Full name', value: e.nda?.fullName },
				{ field: 'nda.permanentAddress', label: 'Permanent address', value: e.nda?.permanentAddress },
				{
					field: 'nda.aadhaarNo',
					label: 'Aadhaar',
					value: e.nda?.aadhaarLast4 ? `XXXX XXXX ${e.nda.aadhaarLast4}` : ''
				}
			]
		},
		{
			title: 'Relieving Formalities',
			items: [
				...RELIEVING_ITEMS.map((item) => ({
					field: `relievingFormalities.${item.field}`,
					label: `${item.n}. ${item.label}`,
					value: e.relievingFormalities?.[item.field]
				})),
				{
					field: 'relievingFormalities.futureContactEmail',
					label: 'Future contact email',
					value: e.relievingFormalities?.futureContactEmail
				},
				{
					field: 'relievingFormalities.futureContactMobile',
					label: 'Future contact mobile',
					value: e.relievingFormalities?.futureContactMobile
				},
				{
					field: 'relievingFormalities.emergencyContactName',
					label: 'Emergency contact',
					value: e.relievingFormalities?.emergencyContactName
				}
			]
		}
	]);

	const pendingClearances = $derived(data.clearances.filter((c) => c.status !== 'completed'));
</script>

<a href="/admin/offboarding" class="back">
	<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M15 18l-6-6 6-6" /></svg>
	All offboardings
</a>

<div class="head">
	<div>
		<h1 class="page-title" style="margin-bottom:6px">{e.fullName}</h1>
		<div class="submeta">
			<span class="pill {statusMeta.cls}">{statusMeta.label}</span>
			<span class="mono">{e.employeeId}</span>
			<span>·</span>
			<span>{e.companyName}</span>
			{#if e.designation}<span>·</span><span>{e.designation}</span>{/if}
			{#if e.service}<span>·</span><span>{e.service} of service</span>{/if}
		</div>
	</div>
	<div class="head-actions">
		<a class="btn ghost" href="/admin/offboarding/{e.id}/pack-zip" data-sveltekit-preload-data="off">
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></svg>
			Download full pack
		</a>
		{#if e.candidateId}
			<a class="btn ghost" href="/admin/candidates/{e.candidateId}">Onboarding record</a>
		{/if}
	</div>
</div>

{#if form?.message}
	<p class="error banner">{form.message}</p>
{/if}

<div class="cols">
	<!-- ─────────────── Left: the flow, step by step ─────────────── -->
	<div class="main">
		<!-- 1. Particulars -->
		<section class="card">
			<div class="sec-head">
				<span class="section-num">01</span>
				<div>
					<h2>Employment particulars</h2>
					<p class="muted">
						What the exit documents print. {#if e.candidateId}Prefilled from their onboarding
							record — correct anything that has changed.{:else}This employee has no onboarding
							record in the portal, so these are yours to fill in.{/if}
					</p>
				</div>
				{#if form?.particularsSaved}<span class="saved">Saved ✓</span>{/if}
			</div>

			<form method="POST" action="?/saveParticulars" use:enhance={track('particulars')}>
				<fieldset class="rbac" disabled={!data.isHr}>
					<div class="fgrid">
						<label class="f"><span>Employee name</span><input name="fullName" value={e.fullName} /></label>
						<label class="f"><span>Personal email</span><input name="personalEmail" type="email" value={e.personalEmail} /></label>
						<label class="f"><span>Personal mobile</span><input name="personalMobile" value={e.personalMobile ?? ''} /></label>
						<label class="f"><span>Designation</span><input name="designation" value={e.designation ?? ''} /></label>
						<label class="f"><span>Team / department</span><input name="department" value={e.department ?? ''} /></label>
						<label class="f"><span>Division</span><input name="division" value={e.division ?? ''} /></label>
						<label class="f"><span>Reporting manager</span><input name="reportingManager" value={e.reportingManager ?? ''} /></label>
						<label class="f"><span>Notice period</span><input name="noticePeriod" value={e.noticePeriod ?? ''} placeholder="e.g. 60 days" /></label>
						<label class="f"><span>Date of joining</span><input name="doj" type="date" value={e.dojIso ?? ''} /></label>
						<label class="f"><span>Date of resignation</span><input name="resignationDate" type="date" value={e.resignationDateIso ?? ''} /></label>
						<label class="f">
							<span>Last working day</span>
							<input name="lwd" type="date" value={e.lwdIso ?? ''} />
						</label>
						<label class="f">
							<span>Separation type</span>
							<select name="separationType">
								<option value="voluntary" selected={e.separationType === 'voluntary'}>Voluntary</option>
								<option value="involuntary" selected={e.separationType === 'involuntary'}>Involuntary</option>
							</select>
						</label>
						<label class="f"><span>UAN</span><input name="uanNo" value={e.uanNo ?? ''} /></label>
						<label class="f"><span>PAN</span><input name="panNo" value={e.panNo ?? ''} /></label>
						<label class="f"><span>Name as per bank</span><input name="bankAccountName" value={e.bankAccountName ?? ''} /></label>
						<label class="f">
							<span>
								Gratuity applicable
								{#if data.gratuityComputed !== null}
									<em class="computed">
										service says {data.gratuityComputed ? 'yes' : 'no'}
									</em>
								{/if}
							</span>
							<select name="gratuityApplicable">
								<option value="">Use computed ({data.gratuityComputed === null ? 'unknown' : data.gratuityComputed ? 'yes' : 'no'})</option>
								<option value="yes" selected={e.gratuity?.applicable === true}>Yes — ask for Form I</option>
								<option value="no" selected={e.gratuity?.applicable === false}>No</option>
							</select>
						</label>
					</div>
					<label class="check">
						<input type="checkbox" name="recommendationApplicable" checked={e.recommendationApplicable} />
						<span>Issue a recommendation letter for this employee</span>
					</label>
					{#if form?.particularsError && form?.message}<p class="error">{form.message}</p>{/if}
					<div class="row-actions">
						<button class="btn" disabled={sending['particulars']}>
							{sending['particulars'] ? 'Saving…' : 'Save particulars'}
						</button>
					</div>
				</fieldset>
			</form>
		</section>

		<!-- 2. Exit forms link -->
		<section class="card">
			<div class="sec-head">
				<span class="section-num">02</span>
				<div>
					<h2>Exit documents link</h2>
					<p class="muted">
						Sends the employee a private link to complete the No Dues details, NDA, Exit Interview
						and Relieving Formalities — plus Gratuity Form I when it applies.
					</p>
				</div>
			</div>

			<div class="linkbox">
				{#if data.formsLink}
					<div class="linkrow">
						<code>{data.formsLink}</code>
						<button class="btn small ghost" type="button" onclick={() => copy(data.formsLink!, 'forms')}>
							{copied === 'forms' ? 'Copied ✓' : 'Copy'}
						</button>
					</div>
					<p class="muted tiny">
						Expires {stamp(data.formsLinkExpires)}
						{#if data.formsLinkOpened}· opened {stamp(data.formsLinkOpened)}{:else}· not opened yet{/if}
					</p>
				{:else}
					<p class="muted tiny">No live link — send one below.</p>
				{/if}
			</div>

			<div class="btn-row">
				<form method="POST" action="?/sendFormsLink" use:enhance={track('formsLink')}>
					<button class="btn grad" disabled={!data.isHr || sending['formsLink']}>
						{sending['formsLink'] ? 'Sending…' : data.formsLink ? 'Resend link' : 'Send exit forms link'}
					</button>
				</form>
				{#if data.formsLink}
					<form
						method="POST"
						action="?/revokeFormsLink"
						use:enhance={track('revoke')}
						onsubmit={(ev) => {
							if (!confirm('Revoke this link? The employee will no longer be able to open their forms.'))
								ev.preventDefault();
						}}
					>
						<button class="btn ghost small" disabled={!data.isHr}>Revoke</button>
					</form>
				{/if}
				<form method="POST" action="?/sendItBlockMail" use:enhance={track('itMail')}>
					<button class="btn ghost" disabled={!data.isHr || sending['itMail']}>
						{sending['itMail']
							? 'Sending…'
							: e.itAccessRevokedMailSentAt
								? 'Resend IT access-block mail'
								: 'Mail IT to block access'}
					</button>
				</form>
			</div>
			{#if e.itAccessRevokedMailSentAt}
				<p class="muted tiny">
					IT notified {stamp(e.itAccessRevokedMailSentAt)} — to {data.itMailRecipients.to.join(', ')}
				</p>
			{/if}
			{#if form?.formsLinkSent}<p class="ok">Link emailed to {e.personalEmail}.</p>{/if}
			{#if form?.itMailSent}<p class="ok">IT has been asked to block system access.</p>{/if}
		</section>

		<!-- 3. Review the submission -->
		<section class="card">
			<div class="sec-head">
				<span class="section-num">03</span>
				<div>
					<h2>Review submission</h2>
					<p class="muted">
						{#if e.submittedAt}
							Submitted {stamp(e.submittedAt)}. Confirm it, or tick anything that needs redoing and
							send it back.
						{:else}
							Nothing submitted yet. Progress on each form is shown below as the employee fills it in.
						{/if}
					</p>
				</div>
			</div>

			<div class="formrail">
				{#each data.forms as f}
					{#if f.applicable}
						<div class="frow" class:done={f.submitted}>
							<span class="fring" class:complete={f.submitted}>
								{#if f.submitted}
									<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.4"><path d="M20 6L9 17l-5-5" /></svg>
								{/if}
							</span>
							<span class="flabel">{f.label}</span>
							<span class="fstate">{f.submitted ? 'Submitted' : 'Pending'}</span>
						</div>
					{/if}
				{/each}
			</div>

			{#if e.requestedFields.length}
				<div class="callout">
					<strong>Waiting on the employee</strong>
					<ul>
						{#each e.requestedFields as r}
							<li>{r.field}{r.note ? ` — ${r.note}` : ''}</li>
						{/each}
					</ul>
				</div>
			{/if}

			<!-- The answers, with a tick box per item to send back. -->
			<form method="POST" action="?/requestChanges" use:enhance={track('changes')}>
				<fieldset class="rbac" disabled={!data.isHr}>
					{#each reviewGroups as group}
						<div class="rgroup">
							<div class="eyebrow">{group.title}</div>
							{#each group.items as item}
								<label class="rrow">
									<input type="checkbox" name="field" value={item.field} bind:group={changeFields} />
									<span class="rlabel">{item.label}</span>
									<span class="rvalue" class:empty={!item.value}>{item.value || 'Not answered'}</span>
								</label>
							{/each}
						</div>
					{/each}

					<!-- Exit interview answers are long-form; shown read-only with the
					     same tick-to-resend affordance on the free-text questions. -->
					<div class="rgroup">
						<div class="eyebrow">Exit interview</div>
						{#each EXIT_TEXT_QUESTIONS as q}
							<label class="rrow">
								<input type="checkbox" name="field" value={`exitInterview.${q.field}`} bind:group={changeFields} />
								<span class="rlabel">{q.n}. {q.label}</span>
								<span class="rvalue" class:empty={!e.exitInterview?.[q.field]}>
									{e.exitInterview?.[q.field] || 'Not answered'}
								</span>
							</label>
						{/each}
						<div class="rrow static">
							<span class="rlabel">10. Workload</span>
							<span class="rvalue" class:empty={!e.exitInterview?.q10Workload}>
								{scaleLabel(EXIT_WORKLOAD_OPTIONS, e.exitInterview?.q10Workload ?? null)}
							</span>
						</div>
						<div class="rrow static">
							<span class="rlabel">14B. Would recommend</span>
							<span class="rvalue" class:empty={!e.exitInterview?.q14bWouldRecommend}>
								{scaleLabel(EXIT_RECOMMEND_OPTIONS, e.exitInterview?.q14bWouldRecommend ?? null)}
							</span>
						</div>
						<details class="grids">
							<summary>Rating grids (11, 12, 13)</summary>
							<div class="gridwrap">
								<div class="eyebrow tiny-eyebrow">11. Supervisor</div>
								{#each EXIT_Q11_ROWS as r}
									<div class="gridrow">
										<span>{r.label}</span>
										<b>{scaleLabel(EXIT_Q11_SCALE, e.exitInterview?.q11Supervisor?.[r.key] ?? null)}</b>
									</div>
								{/each}
								<div class="eyebrow tiny-eyebrow">12. Organisation</div>
								{#each EXIT_Q12_ROWS as r}
									<div class="gridrow">
										<span>{r.label}</span>
										<b>{scaleLabel(EXIT_Q12_SCALE, e.exitInterview?.q12Ratings?.[r.key] ?? null)}</b>
									</div>
								{/each}
								<div class="eyebrow tiny-eyebrow">13. Benefits</div>
								{#each EXIT_Q13_ROWS as r}
									<div class="gridrow">
										<span>{r.label}</span>
										<b>{scaleLabel(EXIT_Q13_SCALE, e.exitInterview?.q13Benefits?.[r.key] ?? null)}</b>
									</div>
								{/each}
							</div>
						</details>
					</div>

					{#if e.assets.length}
						<div class="rgroup">
							<div class="eyebrow">Assets declared</div>
							{#each e.assets as a}
								<div class="rrow static">
									<span class="rlabel">{a.item}</span>
									<span class="rvalue" class:empty={!a.returned}>
										{a.returned ? 'Returned' : 'Not returned'}{a.note ? ` — ${a.note}` : ''}
									</span>
								</div>
							{/each}
						</div>
					{/if}

					{#if data.employeeFiles.length}
						<div class="rgroup">
							<div class="eyebrow">Employee uploads</div>
							{#each data.employeeFiles as f}
								<div class="filerow">
									<a href="/admin/offboarding/{e.id}/file/{f.id}" target="_blank" rel="noreferrer">
										{f.label}
									</a>
									<span class="muted tiny">{kb(f.sizeBytes)} · {stamp(f.createdAt)}</span>
									{#if f.reviewStatus === 'reupload_requested'}
										<span class="pill red">RE-UPLOAD ASKED</span>
									{/if}
								</div>
							{/each}
						</div>
					{/if}

					{#if changeFields.length}
						<label class="f" style="margin-top:14px">
							<span>Note to the employee (applies to every ticked item)</span>
							<textarea name="note" rows="2" placeholder="e.g. Your signature image is too dark to print — please retake it on white paper."></textarea>
						</label>
					{/if}
					<div class="btn-row">
						<button class="btn ghost" disabled={!changeFields.length || sending['changes']}>
							{sending['changes'] ? 'Sending…' : `Send back ${changeFields.length || ''} item${changeFields.length === 1 ? '' : 's'}`}
						</button>
					</div>
				</fieldset>
			</form>

			<form method="POST" action="?/acceptSubmission" use:enhance={track('accept')}>
				<div class="btn-row" style="margin-top:4px">
					<button class="btn teal" disabled={!data.isHr || sending['accept']}>
						{sending['accept'] ? 'Accepting…' : 'Accept & request clearances'}
					</button>
					{#if !data.formsComplete}
						<span class="muted tiny">
							Not every form is submitted yet — accepting now moves straight to clearances.
						</span>
					{/if}
				</div>
			</form>
			{#if form?.accepted}<p class="ok">Submission accepted. Request the departmental clearances below.</p>{/if}
			{#if form?.changesRequested}<p class="ok">Sent back to {e.personalEmail}.</p>{/if}
		</section>

		<!-- 4. Clearances -->
		<section class="card">
			<div class="sec-head">
				<span class="section-num">04</span>
				<div>
					<h2>Departmental clearances</h2>
					<p class="muted">
						Each approver gets their own link — no login needed. They tick their No Dues rows, add
						remarks and upload a signature, which lands on the live certificate.
					</p>
				</div>
				{#if data.clearanceProgress.total}
					<span class="pill {data.clearanceProgress.allDone ? 'teal' : 'gold'}">
						{data.clearanceProgress.done}/{data.clearanceProgress.total} SIGNED
					</span>
				{/if}
			</div>

			<form method="POST" action="?/sendClearances" use:enhance={track('clearances')}>
				<fieldset class="rbac" disabled={!data.isHr}>
					<div class="approvers">
						{#each data.ndcSections as section}
							{@const existing = data.clearances.find((c) => c.department === section.dept)}
							<div class="approver" class:signed={existing?.status === 'completed'}>
								<div class="atop">
									<div class="alabel">
										{section.label}
										{#if section.optional}<span class="opt">optional</span>{/if}
									</div>
									{#if existing}
										<span class="pill {existing.status === 'completed' ? 'teal' : existing.status === 'sent' ? 'gold' : ''}">
											{existing.status === 'completed'
												? (existing.verdict ? VERDICT_LABEL[existing.verdict] : 'SIGNED')
												: existing.status === 'sent'
													? 'AWAITING'
													: 'NOT SENT'}
										</span>
									{/if}
								</div>
								<div class="arow">
									<input
										name={`email_${section.dept}`}
										type="email"
										placeholder="approver@championsmail.com"
										value={existing?.approverEmail ?? ''}
									/>
									<input
										name={`name_${section.dept}`}
										placeholder="Name"
										value={existing?.approverName ?? ''}
									/>
									<input
										name={`designation_${section.dept}`}
										placeholder="Designation"
										value={existing?.approverDesignation ?? ''}
									/>
								</div>
								{#if existing}
									<div class="ameta">
										{#if existing.completedAt}
											<span>Signed {stamp(existing.completedAt)}</span>
											{#if existing.hasSignature}<span>· signature on file</span>{/if}
											{#if existing.remarks}<span class="rem">“{existing.remarks}”</span>{/if}
										{:else if existing.sentAt}
											<span>Sent {stamp(existing.sentAt)}{existing.sentCount > 1 ? ` · ${existing.sentCount} times` : ''}</span>
										{/if}
										{#if existing.link}
											<button class="linkbtn" type="button" onclick={() => copy(existing.link!, existing.id)}>
												{copied === existing.id ? 'Copied ✓' : 'Copy link'}
											</button>
										{/if}
									</div>
								{/if}
							</div>
						{/each}
					</div>
					{#if form?.clearanceError && form?.message}<p class="error">{form.message}</p>{/if}
					<div class="btn-row">
						<button class="btn" disabled={sending['clearances']}>
							{sending['clearances'] ? 'Sending…' : 'Save & send clearance requests'}
						</button>
						<span class="muted tiny">Leave an address blank to skip that department.</span>
					</div>
				</fieldset>
			</form>

			{#if typeof form?.clearancesSent === 'number'}
				<p class="ok">
					Sent {form.clearancesSent} clearance request{form.clearancesSent === 1 ? '' : 's'}.
					{#if form.clearancesFailed?.length}
						Failed: {form.clearancesFailed.join(', ')}.
					{/if}
				</p>
			{/if}

			{#if pendingClearances.length}
				<div class="reminders">
					<div class="eyebrow">Still outstanding</div>
					{#each pendingClearances as c}
						<div class="remrow">
							<span>{c.label} — {c.approverEmail}</span>
							<div class="remacts">
								<form method="POST" action="?/remindClearance" use:enhance={track(`remind-${c.id}`)}>
									<input type="hidden" name="clearanceId" value={c.id} />
									<button class="btn small ghost" disabled={!data.isHr || sending[`remind-${c.id}`]}>
										{sending[`remind-${c.id}`] ? 'Sending…' : 'Remind'}
									</button>
								</form>
								<form
									method="POST"
									action="?/removeClearance"
									use:enhance={track(`rm-${c.id}`)}
									onsubmit={(ev) => {
										if (!confirm(`Remove the ${c.label} clearance from this exit?`)) ev.preventDefault();
									}}
								>
									<input type="hidden" name="clearanceId" value={c.id} />
									<button class="btn small ghost" disabled={!data.isHr}>Remove</button>
								</form>
							</div>
						</div>
					{/each}
				</div>
			{/if}
		</section>

		<!-- 5. F&F -->
		<section class="card">
			<div class="sec-head">
				<span class="section-num">05</span>
				<div>
					<h2>Payroll & full and final settlement</h2>
					<p class="muted">
						What payroll settles and what the employee sees on their closing statement.
					</p>
				</div>
				{#if form?.fnfSaved}<span class="saved">Saved ✓</span>{/if}
			</div>

			<form method="POST" action="?/saveFnf" use:enhance={track('fnf')}>
				<fieldset class="rbac" disabled={!data.isHr}>
					<div class="fgrid">
						<label class="f"><span>Salary due from</span><input name="salaryDueFrom" type="date" value={e.fnf?.salaryDueFromIso ?? ''} /></label>
						<label class="f"><span>Salary due to</span><input name="salaryDueTo" type="date" value={e.fnf?.salaryDueToIso ?? ''} /></label>
						<label class="f"><span>Leave balance (days)</span><input name="leaveBalanceDays" value={e.fnf?.leaveBalanceDays ?? ''} /></label>
						<label class="f"><span>Leave encashment</span><input name="leaveEncashmentAmount" value={e.fnf?.leaveEncashmentAmount ?? ''} placeholder="e.g. 24,500" /></label>
						<label class="f"><span>Notice pay recovery</span><input name="noticePayRecovery" value={e.fnf?.noticePayRecovery ?? ''} /></label>
						<label class="f"><span>Asset recovery</span><input name="assetRecovery" value={e.fnf?.assetRecovery ?? ''} /></label>
						<label class="f"><span>Other deductions</span><input name="otherDeductions" value={e.fnf?.otherDeductions ?? ''} /></label>
						<label class="f"><span>Net F&F payable</span><input name="netAmount" value={e.fnf?.netAmount ?? ''} placeholder="e.g. 1,42,300" /></label>
						<label class="f"><span>Settlement date</span><input name="settlementDate" type="date" value={e.fnf?.settlementDateIso ?? ''} /></label>
						<label class="f"><span>Approved by</span><input name="approvedBy" value={e.fnf?.approvedBy ?? ''} /></label>
					</div>

					<div class="subblock">
						<label class="check">
							<input type="checkbox" name="pfExitProcessed" checked={e.fnf?.pfExitProcessed} />
							<span>PF exit processed on the EPFO portal</span>
						</label>
						<div class="fgrid">
							<label class="f"><span>EPFO date of exit</span><input name="pfDateOfExit" type="date" value={e.fnf?.pfDateOfExitIso ?? ''} /></label>
							<label class="f"><span>PF remarks</span><input name="pfRemarks" value={e.fnf?.pfRemarks ?? ''} /></label>
						</div>
					</div>

					<div class="subblock">
						<label class="check">
							<input type="checkbox" name="taxationApplicable" checked={e.fnf?.taxationApplicable} />
							<span>Taxation details apply (Form 16 / TDS)</span>
						</label>
						<label class="f"><span>Taxation remarks</span><input name="taxationRemarks" value={e.fnf?.taxationRemarks ?? ''} /></label>
					</div>

					<div class="row-actions">
						<button class="btn" disabled={sending['fnf']}>
							{sending['fnf'] ? 'Saving…' : 'Save settlement'}
						</button>
					</div>
				</fieldset>
			</form>
		</section>

		<!-- 6. Handover -->
		<section class="card">
			<div class="sec-head">
				<span class="section-num">06</span>
				<div>
					<h2>Final document handover</h2>
					<p class="muted">
						Upload the closing documents, then send the employee their download link — usually 30-45
						days after the last working day.
					</p>
				</div>
			</div>

			<div class="slots">
				{#each data.handoverSlots as slot}
					{@const uploaded = data.handoverFiles.find((f) => f.docType === slot.docType)}
					{@const gated =
						slot.applicableWhen === 'recommendationApplicable'
							? e.recommendationApplicable
							: slot.applicableWhen === 'pfExitProcessed'
								? !!e.fnf?.pfExitProcessed
								: slot.applicableWhen === 'taxationApplicable'
									? !!e.fnf?.taxationApplicable
									: true}
					<div class="slot" class:muted-slot={!gated}>
						<div class="slot-main">
							<div class="slot-label">
								{slot.label}
								{#if !gated}<span class="opt">not applicable</span>{/if}
							</div>
							{#if uploaded}
								<div class="slot-file">
									<a href="/admin/offboarding/{e.id}/file/{uploaded.id}" target="_blank" rel="noreferrer">
										View
									</a>
									<span class="muted tiny">{kb(uploaded.sizeBytes)} · {stamp(uploaded.createdAt)}</span>
								</div>
							{:else if uploadError[slot.docType]}
								<div class="slot-file"><span class="error tiny">{uploadError[slot.docType]}</span></div>
							{/if}
						</div>
						<div class="slot-actions">
							<label class="upload" class:busy={uploading[slot.docType]}>
								{uploading[slot.docType] ? 'Uploading…' : uploaded ? 'Replace' : 'Upload'}
								<input
									type="file"
									accept="application/pdf,image/jpeg,image/png,image/webp"
									disabled={!data.isHr || uploading[slot.docType]}
									onchange={(ev) => uploadHandover(slot.docType, ev.currentTarget)}
								/>
							</label>
							{#if uploaded}
								<form method="POST" action="?/removeHandoverFile" use:enhance={track(`rmf-${uploaded.id}`)}>
									<input type="hidden" name="fileId" value={uploaded.id} />
									<button class="btn small ghost" disabled={!data.isHr}>Remove</button>
								</form>
							{/if}
						</div>
					</div>
				{/each}
			</div>

			{#if data.handoverLink}
				<div class="linkbox">
					<div class="linkrow">
						<code>{data.handoverLink}</code>
						<button class="btn small ghost" type="button" onclick={() => copy(data.handoverLink!, 'handover')}>
							{copied === 'handover' ? 'Copied ✓' : 'Copy'}
						</button>
					</div>
					<p class="muted tiny">
						{#if e.handoverMailSentAt}Sent {stamp(e.handoverMailSentAt)}.{/if} Valid for six months.
					</p>
				</div>
			{/if}

			{#if form?.handoverError && form?.message}<p class="error">{form.message}</p>{/if}
			<div class="btn-row">
				<form method="POST" action="?/sendHandover" use:enhance={track('handover')}>
					<button class="btn grad" disabled={!data.isHr || sending['handover']}>
						{sending['handover']
							? 'Sending…'
							: e.handoverMailSentAt
								? 'Resend handover link'
								: 'Send handover link & close exit'}
					</button>
				</form>
				{#if e.status === 'completed' && data.isSuperAdmin}
					<form
						method="POST"
						action="?/reopen"
						use:enhance={track('reopen')}
						onsubmit={(ev) => {
							if (!confirm('Reopen this closed exit?')) ev.preventDefault();
						}}
					>
						<button class="btn ghost small">Reopen exit</button>
					</form>
				{/if}
			</div>
			{#if form?.handoverSent}<p class="ok">Handover link emailed to {e.personalEmail}. Exit closed.</p>{/if}
		</section>
	</div>

	<!-- ─────────────── Right rail: live documents + closure ─────────────── -->
	<aside class="rail">
		<section class="card">
			<div class="eyebrow" style="margin-bottom:12px">Live documents</div>
			<p class="muted tiny" style="margin:0 0 14px">
				Generated fresh on every download, so a clearance signed a minute ago is already in the PDF.
			</p>
			<div class="doclist">
				{#each data.documents as d}
					<a
						class="doclink"
						href="/admin/offboarding/{e.id}/doc/{d.key}"
						data-sveltekit-preload-data="off"
					>
						<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
						{d.label}
					</a>
				{/each}
			</div>
			<a
				class="btn ghost small"
				style="margin-top:12px;width:100%;justify-content:center"
				href="/admin/offboarding/{e.id}/pack-zip"
				data-sveltekit-preload-data="off"
			>
				Download all as ZIP
			</a>
		</section>

		<section class="card">
			<div class="eyebrow" style="margin-bottom:12px">No Dues status</div>
			<div class="ndclist">
				{#each data.ndcState as s}
					<div class="ndcrow">
						<span class="ndclabel">{s.deptLabel}</span>
						<span class="pill {s.signed ? (s.verdict === 'dues' ? 'gold' : 'teal') : ''}">
							{s.signed ? (s.verdict ? VERDICT_LABEL[s.verdict] : 'SIGNED') : 'PENDING'}
						</span>
					</div>
				{/each}
				{#if !data.ndcState.length}
					<p class="muted tiny">No clearances requested yet.</p>
				{/if}
			</div>
		</section>

		<section class="card">
			<div class="eyebrow" style="margin-bottom:12px">Exit closure checklist</div>
			<form method="POST" action="?/saveClosure" use:enhance={track('closure')}>
				<fieldset class="rbac" disabled={!data.isHr}>
					{#each CLOSURE_CHECKLIST as group}
						<div class="cgroup">
							<div class="cgroup-title">{group.group}</div>
							{#each group.items as item}
								<label class="crow">
									<input
										type="checkbox"
										name="checklist"
										value={item.key}
										checked={e.closureChecklist?.[item.key]}
									/>
									<span>{item.label}</span>
								</label>
							{/each}
						</div>
					{/each}
					<button class="btn small" style="width:100%;margin-top:6px" disabled={sending['closure']}>
						{sending['closure'] ? 'Saving…' : 'Save checklist'}
					</button>
					{#if form?.closureSaved}<p class="ok tiny" style="text-align:center">Saved ✓</p>{/if}
				</fieldset>
			</form>
		</section>
	</aside>
</div>

<style>
	.back {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 12.5px;
		color: var(--ae-muted);
		margin-bottom: 12px;
		text-decoration: none;
	}
	.back:hover {
		color: var(--ae-ember-glow);
	}
	.head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 18px;
		flex-wrap: wrap;
	}
	.head-actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.submeta {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
		font-size: 12.5px;
		color: var(--ae-muted);
	}
	.mono {
		font-family: var(--ae-font-mono);
	}
	.banner {
		margin: 0 0 14px;
		padding: 10px 14px;
		background: rgba(240, 117, 117, 0.1);
		border: 1px solid rgba(240, 117, 117, 0.3);
		border-radius: 8px;
	}
	.cols {
		display: grid;
		grid-template-columns: minmax(0, 1fr) 300px;
		gap: 18px;
		align-items: start;
	}
	.main {
		display: flex;
		flex-direction: column;
		gap: 18px;
		min-width: 0;
	}
	.rail {
		display: flex;
		flex-direction: column;
		gap: 18px;
		position: sticky;
		top: 18px;
	}
	@media (max-width: 1080px) {
		.cols {
			grid-template-columns: minmax(0, 1fr);
		}
		.rail {
			position: static;
		}
	}
	.sec-head {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		margin-bottom: 18px;
	}
	.sec-head h2 {
		margin: 0 0 3px;
		font-size: 15.5px;
		font-weight: 600;
	}
	.sec-head .muted {
		margin: 0;
		font-size: 12.5px;
		line-height: 1.6;
	}
	.section-num {
		font-family: var(--ae-font-mono);
		font-size: 11px;
		color: var(--ae-ember);
		border: 1px solid rgba(255, 125, 85, 0.3);
		border-radius: 6px;
		padding: 3px 7px;
		flex: none;
	}
	.saved {
		margin-left: auto;
		font-size: 11.5px;
		color: var(--ae-verdant);
		font-weight: 600;
		flex: none;
	}
	.fgrid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
		gap: 13px 16px;
	}
	.f {
		display: flex;
		flex-direction: column;
		gap: 5px;
		min-width: 0;
	}
	.f > span {
		font-size: 11.5px;
		font-weight: 500;
		color: var(--ae-text-2);
	}
	.computed {
		font-style: normal;
		font-family: var(--ae-font-mono);
		font-size: 10px;
		color: var(--ae-muted);
		margin-left: 5px;
	}
	.check {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 14px;
		font-size: 12.5px;
		color: var(--ae-text-2);
	}
	.check input {
		width: auto;
	}
	.row-actions,
	.btn-row {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-top: 16px;
		flex-wrap: wrap;
	}
	.btn-row form {
		display: contents;
	}
	.rbac {
		border: none;
		padding: 0;
		margin: 0;
		min-width: 0;
	}
	.linkbox {
		background: var(--ae-sub-bg, rgba(255, 255, 255, 0.03));
		border: 1px solid var(--ae-line-soft);
		border-radius: 10px;
		padding: 12px 14px;
		margin-bottom: 14px;
	}
	.linkrow {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.linkrow code {
		flex: 1;
		min-width: 0;
		overflow-x: auto;
		white-space: nowrap;
		font-size: 11.5px;
		padding: 5px 8px;
		border-radius: 6px;
	}
	.tiny {
		font-size: 11.5px;
	}
	.ok {
		margin: 12px 0 0;
		font-size: 12.5px;
		color: var(--ae-verdant);
	}
	.formrail {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin-bottom: 16px;
	}
	.frow {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 7px 0;
		font-size: 13px;
		border-bottom: 1px solid var(--ae-line-soft);
	}
	.fring {
		width: 17px;
		height: 17px;
		border-radius: 50%;
		border: 1.6px solid var(--ae-line-strong);
		display: grid;
		place-items: center;
		flex: none;
	}
	.fring.complete {
		background: var(--ae-verdant);
		border-color: var(--ae-verdant);
	}
	.flabel {
		flex: 1;
		color: var(--ae-text-2);
	}
	.frow.done .flabel {
		color: var(--ae-text);
	}
	.fstate {
		font-family: var(--ae-font-mono);
		font-size: 10.5px;
		color: var(--ae-muted);
		text-transform: uppercase;
		letter-spacing: 0.06em;
	}
	.callout {
		background: rgba(242, 177, 92, 0.08);
		border-left: 3px solid var(--ae-amber);
		border-radius: 0 8px 8px 0;
		padding: 11px 14px;
		margin-bottom: 16px;
		font-size: 12.5px;
	}
	.callout strong {
		display: block;
		margin-bottom: 4px;
		color: var(--ae-amber);
		font-size: 11.5px;
		text-transform: uppercase;
		letter-spacing: 0.07em;
	}
	.callout ul {
		margin: 0;
		padding-left: 18px;
		color: var(--ae-text-2);
		line-height: 1.7;
	}
	.rgroup {
		margin-bottom: 18px;
	}
	.rrow {
		display: grid;
		grid-template-columns: 18px minmax(0, 1fr) minmax(0, 1.2fr);
		gap: 10px;
		align-items: start;
		padding: 7px 0;
		border-bottom: 1px solid var(--ae-line-soft);
		font-size: 12.5px;
		cursor: pointer;
	}
	.rrow.static {
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
		cursor: default;
	}
	.rrow input {
		width: auto;
		margin-top: 2px;
	}
	.rlabel {
		color: var(--ae-text-2);
		line-height: 1.5;
	}
	.rvalue {
		color: var(--ae-text);
		line-height: 1.5;
		word-break: break-word;
	}
	.rvalue.empty {
		color: var(--ae-faint, var(--ae-muted));
		font-style: italic;
	}
	.grids {
		margin-top: 10px;
		font-size: 12.5px;
	}
	.grids summary {
		cursor: pointer;
		color: var(--ae-ember-glow);
		font-size: 12px;
	}
	.gridwrap {
		margin-top: 10px;
	}
	.tiny-eyebrow {
		font-size: 10px;
		margin: 12px 0 5px;
	}
	.gridrow {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		padding: 4px 0;
		border-bottom: 1px solid var(--ae-line-soft);
		color: var(--ae-muted);
	}
	.gridrow b {
		color: var(--ae-text-2);
		font-weight: 500;
		flex: none;
	}
	.filerow {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 0;
		border-bottom: 1px solid var(--ae-line-soft);
		font-size: 12.5px;
		flex-wrap: wrap;
	}
	.approvers {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.approver {
		border: 1px solid var(--ae-line-soft);
		border-radius: 10px;
		padding: 12px 14px;
	}
	.approver.signed {
		border-color: rgba(62, 207, 154, 0.3);
		background: rgba(62, 207, 154, 0.04);
	}
	.atop {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		margin-bottom: 9px;
	}
	.alabel {
		font-size: 12.5px;
		font-weight: 500;
		color: var(--ae-text);
	}
	.opt {
		font-family: var(--ae-font-mono);
		font-size: 9.5px;
		color: var(--ae-muted);
		text-transform: uppercase;
		letter-spacing: 0.07em;
		margin-left: 6px;
	}
	.arow {
		display: grid;
		grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr) minmax(0, 1fr);
		gap: 8px;
	}
	@media (max-width: 720px) {
		.arow {
			grid-template-columns: minmax(0, 1fr);
		}
		.rrow,
		.rrow.static {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	.ameta {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 8px;
		font-size: 11.5px;
		color: var(--ae-muted);
		flex-wrap: wrap;
	}
	.rem {
		font-style: italic;
		color: var(--ae-text-2);
	}
	.linkbtn {
		background: none;
		border: none;
		box-shadow: none;
		padding: 0;
		font-size: 11.5px;
		color: var(--ae-ember-glow);
		cursor: pointer;
		margin-left: auto;
	}
	.reminders {
		margin-top: 18px;
		padding-top: 14px;
		border-top: 1px solid var(--ae-line-soft);
	}
	.remrow {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 7px 0;
		font-size: 12.5px;
		color: var(--ae-text-2);
		flex-wrap: wrap;
	}
	.remacts {
		display: flex;
		gap: 6px;
	}
	.subblock {
		margin-top: 18px;
		padding-top: 14px;
		border-top: 1px solid var(--ae-line-soft);
	}
	.subblock .fgrid {
		margin-top: 12px;
	}
	.slots {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin-bottom: 16px;
	}
	.slot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 9px 0;
		border-bottom: 1px solid var(--ae-line-soft);
		flex-wrap: wrap;
	}
	.slot.muted-slot {
		opacity: 0.5;
	}
	.slot-label {
		font-size: 12.5px;
		color: var(--ae-text-2);
	}
	.slot-file {
		display: flex;
		gap: 8px;
		align-items: center;
		margin-top: 3px;
		font-size: 11.5px;
	}
	.slot-actions {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.upload {
		font-size: 11.5px;
		font-weight: 500;
		color: var(--ae-ember-glow);
		border: 1px solid rgba(255, 125, 85, 0.3);
		border-radius: 7px;
		padding: 5px 11px;
		cursor: pointer;
	}
	.upload.busy {
		opacity: 0.6;
		cursor: default;
	}
	.upload input {
		display: none;
	}
	.doclist {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.doclink {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 0;
		font-size: 12.5px;
		color: var(--ae-text-2);
		text-decoration: none;
		border-bottom: 1px solid var(--ae-line-soft);
	}
	.doclink:hover {
		color: var(--ae-ember-glow);
	}
	.ndclist {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.ndcrow {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 7px 0;
		border-bottom: 1px solid var(--ae-line-soft);
	}
	.ndclabel {
		font-size: 12px;
		color: var(--ae-text-2);
		line-height: 1.4;
	}
	.cgroup {
		margin-bottom: 14px;
	}
	.cgroup-title {
		font-family: var(--ae-font-mono);
		font-size: 10px;
		text-transform: uppercase;
		letter-spacing: 0.1em;
		color: var(--ae-muted);
		margin-bottom: 6px;
	}
	.crow {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		padding: 4px 0;
		font-size: 12px;
		color: var(--ae-text-2);
		cursor: pointer;
		line-height: 1.45;
	}
	.crow input {
		width: auto;
		margin-top: 2px;
		flex: none;
	}
</style>
