<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { brandCssVars, brandFontsHref } from '$lib/shared/brands';
	import {
		EXIT_Q11_ROWS,
		EXIT_Q11_SCALE,
		EXIT_Q12_ROWS,
		EXIT_Q12_SCALE,
		EXIT_Q13_ROWS,
		EXIT_Q13_SCALE,
		EXIT_RECOMMEND_OPTIONS,
		EXIT_TEXT_QUESTIONS,
		EXIT_WORKLOAD_OPTIONS,
		NDA_CLAUSES,
		NDA_REGISTERED_OFFICE,
		RELIEVING_ITEMS
	} from '$lib/shared/offboarding';

	let { data, form } = $props();

	const brand = $derived(data.brand);
	const brandStyle = $derived(brandCssVars(brand));
	const fontsHref = $derived(brandFontsHref(brand));
	const e = $derived(data.exit);

	// Which form section is open. Only one at a time — five long forms stacked
	// open is unusable on a phone, which is where most people will do this.
	let open = $state<string | null>(null);
	let saving = $state<Record<string, boolean>>({});
	let uploading = $state<Record<string, boolean>>({});
	let uploadMsg = $state<Record<string, string>>({});

	// Fields HR sent back, as a set of dotted paths, so a re-requested section
	// can be flagged and opened first.
	const requested = $derived(
		new Set<string>(data.requestedFields.map((r: { field: string }) => r.field))
	);
	const requestedIn = (prefix: string) =>
		[...requested].some((f) => f.startsWith(`${prefix}.`));

	// Open the first thing that needs attention: a re-requested section, else the
	// first unfinished form.
	$effect(() => {
		if (open !== null) return;
		const flagged = ['ndc', 'nda', 'exitInterview', 'relievingFormalities', 'gratuity'].find((k) =>
			requestedIn(k)
		);
		if (flagged) {
			open = flagged;
			return;
		}
		const next = data.forms.find((f) => f.applicable && !f.submitted);
		if (next) open = next.key;
	});

	function toggle(key: string) {
		open = open === key ? null : key;
	}

	function track(key: string) {
		return () => {
			saving[key] = true;
			return async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => {
				await update({ reset: false });
				saving[key] = false;
			};
		};
	}

	async function upload(docType: string, input: HTMLInputElement) {
		const file = input.files?.[0];
		if (!file) return;
		uploading[docType] = true;
		uploadMsg[docType] = '';
		try {
			const body = new FormData();
			body.append('docType', docType);
			body.append('file', file);
			const res = await fetch(`/x/${page.params.token}/upload`, { method: 'POST', body });
			if (!res.ok) throw new Error((await res.text()).slice(0, 200) || 'Upload failed');
			await invalidateAll();
		} catch (err) {
			uploadMsg[docType] = err instanceof Error ? err.message : 'Upload failed';
		} finally {
			uploading[docType] = false;
			input.value = '';
		}
	}

	async function removeFile(fileId: string) {
		await fetch(`/x/${page.params.token}/upload`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'remove', fileId })
		});
		await invalidateAll();
	}

	function kb(bytes: number): string {
		return bytes > 1024 * 1024
			? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
			: `${Math.max(1, Math.round(bytes / 1024))} KB`;
	}

	const YES_NO = [
		{ value: 'yes', label: 'Yes' },
		{ value: 'no', label: 'No' }
	];

	const applicable = $derived(data.forms.filter((f) => f.applicable));
	const done = $derived(applicable.filter((f) => f.submitted).length);
	const pct = $derived(Math.round((done / Math.max(applicable.length, 1)) * 100));
	const signature = $derived(data.files.find((f) => f.docType === 'signature'));
	const fileFor = (docType: string) => data.files.find((f) => f.docType === docType);
	const offerFile = $derived(fileFor('new_employer_offer'));
</script>

<svelte:head>
	<title>Exit formalities · {data.companyName}</title>
	{#if fontsHref}<link rel="stylesheet" href={fontsHref} />{/if}
</svelte:head>

<div class="scope" style={brandStyle}>
	{#if data.submitted && !data.editable}
		<!-- Closed: submitted and accepted by HR. -->
		<main class="done-wrap">
			<div class="done-card">
				<div class="tick-big">
					<svg width="34" height="34" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M20 6L9 17l-5-5" /></svg>
				</div>
				<h1>Your exit documents are with HR</h1>
				<p>
					Thank you, {e.fullName.split(' ')[0]}. Everything you submitted has been received and is
					being processed. Your relieving letter, experience letter and final settlement will be
					emailed to <b>{e.personalEmail}</b> once your full and final settlement is complete —
					usually within 30 to 45 days of your last working day.
				</p>
				{#if data.documents.length}
					<div class="dl-block">
						<div class="dl-title">Download your copies</div>
						{#each data.documents as d}
							<a class="dl" href="/x/{page.params.token}/doc/{d.key}" data-sveltekit-preload-data="off">
								<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
								{d.label}
							</a>
						{/each}
					</div>
				{/if}
				<p class="fine">
					If anything needs correcting, reply to the email that brought you here and HR will reopen
					your forms.
				</p>
			</div>
		</main>
	{:else if !e.consented}
		<!-- Welcome + acknowledgement, before any data is asked for. -->
		<main class="welcome">
			<div class="brand-row">
				<img class="logo" src={brand.logo.src} alt={brand.name} />
			</div>
			<div class="hero-card">
				<div class="hero">
					<div class="hero-eyebrow">Exit formalities</div>
					<h1>Thank you for your time at {data.companyName}</h1>
					<p class="lede">
						{e.fullName}, we need a few documents completed to close your exit and release your
						final settlement. It takes about ten minutes.
					</p>
					<div class="chips">
						<span class="chip">{e.employeeId}</span>
						{#if e.designation}<span class="chip">{e.designation}</span>{/if}
						{#if e.lwd}<span class="chip">Last working day {e.lwd}</span>{/if}
					</div>
				</div>
				<div class="hero-body">
					<div class="eyebrow">What you will complete</div>
					<div class="doclist">
						{#each applicable as f}
							<div class="docline">
								<span class="tick">
									<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5" /></svg>
								</span>
								{f.label}
							</div>
						{/each}
						<div class="docline">
							<span class="tick">
								<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M20 6L9 17l-5-5" /></svg>
							</span>
							A photo or scan of your signature
						</div>
					</div>
					<hr />
					<p class="dpdp">
						The details you enter are used only to complete your exit formalities, your No Dues
						certificate and your full and final settlement, and are stored securely. Your Aadhaar
						number is encrypted and is never shown back to you or to anyone outside HR and payroll.
					</p>
					<form method="POST" action="?/consent" use:enhance>
						<label class="consent">
							<input type="checkbox" required />
							<span>
								I understand, and I confirm the information I provide will be true to the best of
								my knowledge.
							</span>
						</label>
						<button class="cta">Start my exit formalities</button>
					</form>
				</div>
			</div>
		</main>
	{:else}
		<!-- The forms. -->
		<div class="appbar">
			<div class="appbar-in">
				<img class="logo small" src={brand.logo.src} alt={brand.name} />
				<span class="ab-name">{e.fullName}</span>
				<span class="ab-id">{e.employeeId}</span>
				<div class="ab-prog">
					<div class="bar"><div class="fill" style="width:{pct}%"></div></div>
					<span>{done}/{applicable.length}</span>
				</div>
			</div>
		</div>

		<main class="portal">
			{#if data.requestedFields.length}
				<div class="rework">
					<strong>HR has asked you to revisit a few things</strong>
					<ul>
						{#each data.requestedFields as r}
							<li>{r.field.split('.').pop()}{r.note ? ` — ${r.note}` : ''}</li>
						{/each}
					</ul>
				</div>
			{/if}

			{#if form?.message}
				<p class="err banner">{form.message}</p>
			{/if}

			<!-- ── Signature: needed by every document, so it comes first ── -->
			<section class="card">
				<div class="card-head">
					<h2>Your signature</h2>
					<span class="state" class:ok={!!signature}>
						{signature ? 'Uploaded' : 'Required'}
					</span>
				</div>
				<p class="hint">
					Sign on a clean sheet of white paper and photograph it, or upload a scan. This is printed
					onto your exit documents, so please make sure it is sharp and well lit.
				</p>
				{#if signature}
					<div class="sig-preview">
						<img src="/x/{page.params.token}/upload" alt="" hidden />
						<div class="sig-meta">
							<span>{signature.label} · {kb(signature.sizeBytes)}</span>
							{#if signature.reviewStatus === 'reupload_requested'}
								<span class="err">
									HR asked for a new one{signature.reviewNote ? `: ${signature.reviewNote}` : ''}
								</span>
							{/if}
						</div>
						<button class="linkish" type="button" onclick={() => removeFile(signature.id)}>Remove</button>
					</div>
				{/if}
				<label class="upload" class:busy={uploading['signature']}>
					{uploading['signature'] ? 'Uploading…' : signature ? 'Replace signature' : 'Upload signature'}
					<input
						type="file"
						accept="image/jpeg,image/png,image/webp"
						disabled={uploading['signature']}
						onchange={(ev) => upload('signature', ev.currentTarget)}
					/>
				</label>
				{#if uploadMsg['signature']}<p class="err">{uploadMsg['signature']}</p>{/if}
			</section>

			<!-- ── 1. No Dues details ── -->
			<section class="card" class:flagged={requestedIn('ndc')}>
				<button class="card-head as-btn" type="button" onclick={() => toggle('ndc')}>
					<h2>No Dues &amp; handover details</h2>
					<span class="state" class:ok={e.ndc.submitted}>{e.ndc.submitted ? 'Saved' : 'To do'}</span>
					<svg class="chev" class:up={open === 'ndc'} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M6 9l6 6 6-6" /></svg>
				</button>
				{#if open === 'ndc'}
					<form method="POST" action="?/saveNdc" use:enhance={track('ndc')}>
						<p class="hint">
							What you are handing over, so each department can confirm it. Your manager, IT, admin,
							finance and HR each sign off against these.
						</p>
						<div class="fgrid">
							<label class="f"><span>Team / department</span><input name="team" value={e.ndc.team} /></label>
							<label class="f">
								<span>Name as printed on your bank passbook</span>
								<input name="nameAsPerBank" value={e.ndc.nameAsPerBank || e.bankAccountName || ''} />
							</label>
						</div>
						<label class="f">
							<span>Files you are handing over (soft &amp; hard copies)</span>
							<textarea name="filesHandover" rows="2" value={e.ndc.filesHandover}></textarea>
						</label>
						<label class="f">
							<span>Official logins / credentials handed over</span>
							<textarea name="loginsHandover" rows="2" value={e.ndc.loginsHandover}></textarea>
						</label>
						<label class="f">
							<span>Leads &amp; client follow-up details handed over</span>
							<textarea name="leadsHandover" rows="2" value={e.ndc.leadsHandover}></textarea>
						</label>
						<label class="f">
							<span>Anything else worth noting</span>
							<textarea name="deptOthers" rows="2" value={e.ndc.deptOthers}></textarea>
						</label>

						<div class="eyebrow" style="margin:20px 0 8px">Company assets</div>
						<p class="hint" style="margin-top:0">
							Tick what you have returned. IT and admin verify these before signing.
						</p>
						<div class="assets">
							{#each e.assets as a}
								<div class="asset">
									<label class="acheck">
										<input type="checkbox" name={`asset_${a.item}`} checked={a.returned} />
										<span>{a.item}</span>
									</label>
									<input
										class="anote"
										name={`assetnote_${a.item}`}
										value={a.note}
										placeholder="note (optional)"
									/>
								</div>
							{/each}
						</div>

						<button class="cta small" disabled={saving['ndc']}>
							{saving['ndc'] ? 'Saving…' : 'Save this section'}
						</button>
						{#if form?.ndcSaved}<span class="saved">Saved ✓</span>{/if}
					</form>
				{/if}
			</section>

			<!-- ── 2. NDA ── -->
			<section class="card" class:flagged={requestedIn('nda')}>
				<button class="card-head as-btn" type="button" onclick={() => toggle('nda')}>
					<h2>Non-Disclosure &amp; Non-Compete Agreement</h2>
					<span class="state" class:ok={e.nda.submitted}>{e.nda.submitted ? 'Signed' : 'To sign'}</span>
					<svg class="chev" class:up={open === 'nda'} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M6 9l6 6 6-6" /></svg>
				</button>
				{#if open === 'nda'}
					<form method="POST" action="?/saveNda" use:enhance={track('nda')}>
						<div class="agreement">
							<p class="ag-parties">
								This agreement is between <b>{brand.legalName}</b>, whose registered office is at
								{NDA_REGISTERED_OFFICE}, and you.
							</p>
							{#each NDA_CLAUSES as c}
								<div class="clause">
									<div class="ch">{c.n}. {c.heading}</div>
									<p>{c.body}</p>
								</div>
							{/each}
						</div>
						<div class="fgrid">
							<label class="f"><span>Date</span><input name="agreementDate" type="date" value={e.nda.agreementDateIso ?? data.todayIso ?? ''} /></label>
							<label class="f"><span>Your full name</span><input name="fullName" value={e.nda.fullName} required /></label>
						</div>
						<label class="f">
							<span>Permanent address</span>
							<textarea name="permanentAddress" rows="2" required value={e.nda.permanentAddress}></textarea>
						</label>
						<label class="f">
							<span>
								Aadhaar number
								{#if e.hasAadhaar}
									<em class="on-file">on file — XXXX XXXX {e.aadhaarLast4}; leave blank to keep it</em>
								{/if}
							</span>
							<input name="aadhaarNo" inputmode="numeric" placeholder="12 digits" />
						</label>
						<label class="consent inline">
							<input type="checkbox" name="accept" required />
							<span>
								I have read and understood this agreement and accept its terms. I understand my
								uploaded signature will be applied to it.
							</span>
						</label>
						{#if form?.ndaError && form?.message}<p class="err">{form.message}</p>{/if}
						<button class="cta small" disabled={saving['nda']}>
							{saving['nda'] ? 'Saving…' : 'Accept & sign agreement'}
						</button>
						{#if form?.ndaSaved}<span class="saved">Signed ✓</span>{/if}
					</form>
				{/if}
			</section>

			<!-- ── 3. Exit interview ── -->
			<section class="card" class:flagged={requestedIn('exitInterview')}>
				<button class="card-head as-btn" type="button" onclick={() => toggle('exitInterview')}>
					<h2>Exit interview</h2>
					<span class="state" class:ok={e.exitInterview.submitted}>
						{e.exitInterview.submitted ? 'Saved' : 'To do'}
					</span>
					<svg class="chev" class:up={open === 'exitInterview'} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M6 9l6 6 6-6" /></svg>
				</button>
				{#if open === 'exitInterview'}
					<form method="POST" action="?/saveExitInterview" use:enhance={track('exitInterview')}>
						<p class="hint">
							Your candid answers help us fix what is not working. Every question is optional — skip
							anything you would rather not answer.
						</p>
						<div class="fgrid">
							<label class="f"><span>Supervisor</span><input name="supervisor" value={e.exitInterview.supervisor} /></label>
							<label class="f"><span>Division</span><input name="division" value={e.exitInterview.division} /></label>
							<label class="f"><span>Job title</span><input name="jobTitle" value={e.exitInterview.jobTitle} /></label>
						</div>
						<label class="f">
							<span>Reason for leaving the organisation</span>
							<textarea name="reasonForLeaving" rows="2" value={e.exitInterview.reasonForLeaving}></textarea>
						</label>

						{#each EXIT_TEXT_QUESTIONS.slice(0, 9) as q}
							<label class="f">
								<span>{q.n}. {q.label}</span>
								<textarea name={q.field} rows="2" value={e.exitInterview.answers[q.field]}></textarea>
							</label>
						{/each}

						<div class="qblock">
							<div class="qlabel">10. Was your workload usually</div>
							<div class="radios">
								{#each EXIT_WORKLOAD_OPTIONS as o}
									<label class="radio">
										<input type="radio" name="q10Workload" value={o.value} checked={e.exitInterview.q10Workload === o.value} />
										<span>{o.label}</span>
									</label>
								{/each}
							</div>
						</div>

						<!-- The three rating grids. Radio per row, scrollable on a phone. -->
						{#each [
							{ field: 'q11Supervisor', title: '11. What did you think of your supervisor', rows: EXIT_Q11_ROWS, scale: EXIT_Q11_SCALE, answers: e.exitInterview.q11Supervisor },
							{ field: 'q12Ratings', title: '12. How would you rate the following', rows: EXIT_Q12_ROWS, scale: EXIT_Q12_SCALE, answers: e.exitInterview.q12Ratings },
							{ field: 'q13Benefits', title: '13. Employee benefits', rows: EXIT_Q13_ROWS, scale: EXIT_Q13_SCALE, answers: e.exitInterview.q13Benefits }
						] as grid}
							<div class="qblock">
								<div class="qlabel">{grid.title}</div>
								<div class="gridscroll">
									<table class="rgrid">
										<thead>
											<tr>
												<th></th>
												{#each grid.scale as s}<th>{s.label}</th>{/each}
											</tr>
										</thead>
										<tbody>
											{#each grid.rows as row}
												<tr>
													<td class="rowlabel">{row.label}</td>
													{#each grid.scale as s}
														<td>
															<label class="cell">
																<input
																	type="radio"
																	name={`${grid.field}_${row.key}`}
																	value={s.value}
																	checked={grid.answers?.[row.key] === s.value}
																/>
															</label>
														</td>
													{/each}
												</tr>
											{/each}
										</tbody>
									</table>
								</div>
							</div>
						{/each}

						<label class="f">
							<span>Comments on the ratings above</span>
							<textarea name="q12Comments" rows="2" value={e.exitInterview.q12Comments}></textarea>
						</label>

						<label class="f">
							<span>14. A) What advice would you pass on to the next person in your role?</span>
							<textarea name="q14aAdviceToSuccessor" rows="2" value={e.exitInterview.answers.q14aAdviceToSuccessor}></textarea>
						</label>
						<div class="qblock">
							<div class="qlabel">B) Would you recommend the company to a friend?</div>
							<div class="radios">
								{#each EXIT_RECOMMEND_OPTIONS as o}
									<label class="radio">
										<input type="radio" name="q14bWouldRecommend" value={o.value} checked={e.exitInterview.q14bWouldRecommend === o.value} />
										<span>{o.label}</span>
									</label>
								{/each}
							</div>
						</div>
						<label class="f">
							<span>15. What would make {data.companyName} a better place to work?</span>
							<textarea name="q15Suggestions" rows="3" value={e.exitInterview.answers.q15Suggestions}></textarea>
						</label>

						<button class="cta small" disabled={saving['exitInterview']}>
							{saving['exitInterview'] ? 'Saving…' : 'Save this section'}
						</button>
						{#if form?.exitInterviewSaved}<span class="saved">Saved ✓</span>{/if}
					</form>
				{/if}
			</section>

			<!-- ── 4. Relieving formalities ── -->
			<section class="card" class:flagged={requestedIn('relievingFormalities')}>
				<button class="card-head as-btn" type="button" onclick={() => toggle('relievingFormalities')}>
					<h2>Relieving formalities</h2>
					<span class="state" class:ok={e.relievingFormalities.submitted}>
						{e.relievingFormalities.submitted ? 'Saved' : 'To do'}
					</span>
					<svg class="chev" class:up={open === 'relievingFormalities'} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M6 9l6 6 6-6" /></svg>
				</button>
				{#if open === 'relievingFormalities'}
					<form method="POST" action="?/saveRelieving" use:enhance={track('relievingFormalities')}>
						<div class="fgrid">
							<label class="f"><span>Job title</span><input name="jobTitle" value={e.relievingFormalities.jobTitle} /></label>
							<label class="f"><span>Division</span><input name="division" value={e.relievingFormalities.division} /></label>
						</div>
						{#each RELIEVING_ITEMS as item}
							<div class="qblock">
								<div class="qlabel">{item.n}. {item.label}</div>
								{#if item.note}<p class="qnote">{item.note}</p>{/if}
								<div class="radios">
									{#each item.allowNa ? [...YES_NO, { value: 'na', label: 'Not applicable' }] : YES_NO as o}
										<label class="radio">
											<input
												type="radio"
												name={item.field}
												value={o.value}
												checked={e.relievingFormalities.answers[item.field] === o.value}
											/>
											<span>{o.label}</span>
										</label>
									{/each}
								</div>
							</div>
						{/each}

						<div class="eyebrow" style="margin:20px 0 4px">Alumni forum &amp; future contact</div>
						<p class="hint" style="margin-top:0">
							So we can reach you after your company email is closed.
						</p>
						<div class="fgrid">
							<label class="f"><span>Future email</span><input name="futureContactEmail" type="email" value={e.relievingFormalities.futureContactEmail} /></label>
							<label class="f"><span>Future mobile</span><input name="futureContactMobile" inputmode="numeric" value={e.relievingFormalities.futureContactMobile} /></label>
							<label class="f"><span>Emergency contact name</span><input name="emergencyContactName" value={e.relievingFormalities.emergencyContactName} /></label>
							<label class="f"><span>Emergency contact mobile</span><input name="emergencyContactMobile" inputmode="numeric" value={e.relievingFormalities.emergencyContactMobile} /></label>
						</div>
						<label class="f">
							<span>Future address</span>
							<textarea name="futureContactAddress" rows="2" value={e.relievingFormalities.futureContactAddress}></textarea>
						</label>
						<label class="f">
							<span>Anything else</span>
							<textarea name="notes" rows="2" value={e.relievingFormalities.notes}></textarea>
						</label>

						<!-- Item 3 asks for the new employer's offer letter. -->
						<div class="upload-row">
							<div>
								<div class="ul-label">New employer's offer letter</div>
								<div class="ul-hint">
									{#if offerFile}
										Uploaded · {kb(offerFile.sizeBytes)}
									{:else}
										Asked for by item 3 above. Optional if you are not joining another company.
									{/if}
								</div>
							</div>
							<div class="ul-acts">
								<label class="upload small" class:busy={uploading['new_employer_offer']}>
									{uploading['new_employer_offer'] ? 'Uploading…' : offerFile ? 'Replace' : 'Upload'}
									<input
										type="file"
										accept="application/pdf,image/jpeg,image/png,image/webp"
										disabled={uploading['new_employer_offer']}
										onchange={(ev) => upload('new_employer_offer', ev.currentTarget)}
									/>
								</label>
								{#if offerFile}
									<button class="linkish" type="button" onclick={() => removeFile(offerFile.id)}>Remove</button>
								{/if}
							</div>
						</div>
						{#if uploadMsg['new_employer_offer']}<p class="err">{uploadMsg['new_employer_offer']}</p>{/if}

						{#if form?.relievingError && form?.message}<p class="err">{form.message}</p>{/if}
						<button class="cta small" disabled={saving['relievingFormalities']}>
							{saving['relievingFormalities'] ? 'Saving…' : 'Save this section'}
						</button>
						{#if form?.relievingSaved}<span class="saved">Saved ✓</span>{/if}
					</form>
				{/if}
			</section>

			<!-- ── 5. Gratuity, only when service qualifies ── -->
			{#if e.gratuity.applicable}
				<section class="card" class:flagged={requestedIn('gratuity')}>
					<button class="card-head as-btn" type="button" onclick={() => toggle('gratuity')}>
						<h2>Gratuity — Form I</h2>
						<span class="state" class:ok={e.gratuity.submitted}>
							{e.gratuity.submitted ? 'Saved' : 'To do'}
						</span>
						<svg class="chev" class:up={open === 'gratuity'} width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M6 9l6 6 6-6" /></svg>
					</button>
					{#if open === 'gratuity'}
						<form method="POST" action="?/saveGratuity" use:enhance={track('gratuity')}>
							<p class="hint">
								Your service{e.service ? ` of ${e.service}` : ''} qualifies you for gratuity under the
								Payment of Gratuity Act. This is your formal application.
							</p>
							<div class="fgrid">
								<label class="f"><span>Total period of service</span><input name="totalService" value={e.gratuity.totalService} /></label>
								<label class="f"><span>Nominee name</span><input name="nomineeName" value={e.gratuity.nomineeName} /></label>
								<label class="f"><span>Relationship with nominee</span><input name="nomineeRelation" value={e.gratuity.nomineeRelation} /></label>
							</div>
							<label class="f">
								<span>Address for correspondence</span>
								<textarea name="addressForCorrespondence" rows="2" value={e.gratuity.addressForCorrespondence}></textarea>
							</label>
							{#if form?.gratuityError && form?.message}<p class="err">{form.message}</p>{/if}
							<button class="cta small" disabled={saving['gratuity']}>
								{saving['gratuity'] ? 'Saving…' : 'Save this section'}
							</button>
							{#if form?.gratuitySaved}<span class="saved">Saved ✓</span>{/if}
						</form>
					{/if}
				</section>
			{/if}

			<!-- ── Submit everything ── -->
			<section class="card submit-card">
				<h2>Send to HR</h2>
				<p class="hint">
					Once you submit, HR reviews everything and will come back to you if anything needs
					changing. You can download a copy of any document below at any time.
				</p>
				{#if data.documents.length}
					<div class="dl-inline">
						{#each data.documents as d}
							<a class="dl small" href="/x/{page.params.token}/doc/{d.key}" data-sveltekit-preload-data="off">
								{d.label}
							</a>
						{/each}
					</div>
				{/if}
				{#if form?.submitError && form?.message}<p class="err">{form.message}</p>{/if}
				<form method="POST" action="?/submitAll" use:enhance={track('submit')}>
					<button class="cta" disabled={saving['submit']}>
						{saving['submit'] ? 'Submitting…' : 'Submit my exit documents'}
					</button>
				</form>
				{#if !data.complete || !signature}
					<p class="fine">
						{applicable.length - done > 0
							? `${applicable.length - done} section${applicable.length - done === 1 ? '' : 's'} still to save`
							: ''}{!signature ? `${applicable.length - done > 0 ? ' · ' : ''}signature not uploaded` : ''}
					</p>
				{/if}
			</section>
		</main>
	{/if}
</div>

<style>
	.scope {
		--bg: var(--brand-bg, #f7f7fb);
		background: var(--bg);
		min-height: 100vh;
		font-family: var(--brand-font-body, system-ui, sans-serif);
		color: var(--brand-text, #23232b);
	}
	.scope :global(h1),
	.scope :global(h2) {
		font-family: var(--brand-font-heading, inherit);
	}
	.logo {
		height: 34px;
		width: auto;
		display: block;
		background: var(--brand-logo-bg);
		padding: var(--brand-logo-pad);
		border-radius: 6px;
	}
	.logo.small {
		height: 26px;
	}

	/* welcome */
	.welcome {
		max-width: 760px;
		margin: 0 auto;
		padding: 34px 18px 70px;
	}
	.brand-row {
		margin-bottom: 22px;
	}
	.hero-card {
		background: var(--brand-surface, #fff);
		border: 1px solid var(--brand-border, #e6e6ee);
		border-radius: var(--brand-card-radius, 16px);
		overflow: hidden;
	}
	.hero {
		background: var(--brand-hero, linear-gradient(135deg, #2b2b40, #14141f));
		color: #fff;
		padding: 38px 32px 32px;
	}
	.hero-eyebrow {
		font-size: 11px;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		opacity: 0.75;
		margin-bottom: 12px;
	}
	.hero h1 {
		margin: 0 0 12px;
		font-size: 27px;
		line-height: 1.22;
		font-weight: 700;
	}
	.lede {
		margin: 0;
		font-size: 15px;
		line-height: 1.65;
		opacity: 0.9;
		max-width: 52ch;
	}
	.chips {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		margin-top: 20px;
	}
	.chip {
		background: rgba(255, 255, 255, 0.14);
		border-radius: 999px;
		padding: 5px 12px;
		font-size: 12px;
	}
	.hero-body {
		padding: 28px 32px 32px;
	}
	.eyebrow {
		font-size: 11px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--brand-primary, #6b4cf6);
		font-weight: 600;
		margin-bottom: 12px;
	}
	.doclist {
		display: flex;
		flex-direction: column;
		gap: 9px;
	}
	.docline {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 14px;
	}
	.tick {
		width: 19px;
		height: 19px;
		border-radius: 50%;
		background: color-mix(in srgb, var(--brand-primary, #6b4cf6) 15%, transparent);
		color: var(--brand-primary, #6b4cf6);
		display: grid;
		place-items: center;
		flex: none;
	}
	hr {
		border: none;
		height: 1px;
		background: var(--brand-border, #e6e6ee);
		margin: 26px 0 20px;
	}
	.dpdp {
		font-size: 12.5px;
		line-height: 1.7;
		color: var(--brand-muted, #71717f);
		margin: 0 0 20px;
	}
	.consent {
		display: flex;
		align-items: flex-start;
		gap: 10px;
		font-size: 13.5px;
		line-height: 1.6;
		margin-bottom: 20px;
		cursor: pointer;
	}
	.consent.inline {
		margin: 16px 0;
	}
	.consent input {
		margin-top: 3px;
		width: 17px;
		height: 17px;
		flex: none;
		accent-color: var(--brand-primary, #6b4cf6);
	}
	.cta {
		background: var(--brand-primary, #6b4cf6);
		color: var(--brand-on-primary, #fff);
		border: none;
		border-radius: var(--brand-btn-radius, 9px);
		padding: 14px 28px;
		font-size: 14.5px;
		font-weight: 600;
		text-transform: var(--brand-cta-transform, none);
		box-shadow: var(--brand-btn-shadow);
		cursor: pointer;
		font-family: inherit;
	}
	.cta.small {
		padding: 11px 20px;
		font-size: 13.5px;
	}
	.cta:disabled {
		opacity: 0.6;
		cursor: default;
	}

	/* app bar */
	.appbar {
		background: var(--brand-surface, #fff);
		border-bottom: 1px solid var(--brand-border, #e6e6ee);
		position: sticky;
		top: 0;
		z-index: 5;
	}
	.appbar-in {
		max-width: 860px;
		margin: 0 auto;
		padding: 12px 18px;
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.ab-name {
		font-size: 13.5px;
		font-weight: 600;
	}
	.ab-id {
		font-size: 11.5px;
		color: var(--brand-muted, #71717f);
	}
	.ab-prog {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 9px;
		font-size: 11.5px;
		color: var(--brand-muted, #71717f);
	}
	.bar {
		width: 84px;
		height: 5px;
		border-radius: 99px;
		background: var(--brand-border, #e6e6ee);
		overflow: hidden;
	}
	.fill {
		height: 100%;
		background: var(--brand-primary, #6b4cf6);
		transition: width 0.3s;
	}

	/* portal */
	.portal {
		max-width: 860px;
		margin: 0 auto;
		padding: 22px 18px 80px;
		display: flex;
		flex-direction: column;
		gap: 14px;
	}
	.card {
		background: var(--brand-surface, #fff);
		border: 1px solid var(--brand-border, #e6e6ee);
		border-radius: var(--brand-card-radius, 16px);
		padding: 20px 22px;
	}
	.card.flagged {
		border-color: #e0a63c;
		box-shadow: 0 0 0 3px rgba(224, 166, 60, 0.13);
	}
	.card-head {
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.card-head.as-btn {
		width: 100%;
		background: none;
		border: none;
		padding: 0;
		cursor: pointer;
		text-align: left;
		font-family: inherit;
		color: inherit;
		box-shadow: none;
	}
	.card-head h2 {
		margin: 0;
		font-size: 15.5px;
		font-weight: 600;
		flex: 1;
	}
	.state {
		font-size: 10.5px;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		font-weight: 700;
		color: #b07d1f;
		background: rgba(224, 166, 60, 0.14);
		padding: 4px 9px;
		border-radius: 999px;
		flex: none;
	}
	.state.ok {
		color: #1c7d55;
		background: rgba(62, 190, 130, 0.15);
	}
	.chev {
		color: var(--brand-muted, #71717f);
		transition: transform 0.18s;
		flex: none;
	}
	.chev.up {
		transform: rotate(180deg);
	}
	.hint {
		font-size: 12.5px;
		line-height: 1.65;
		color: var(--brand-muted, #71717f);
		margin: 12px 0 16px;
	}
	.fgrid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
		gap: 13px 16px;
		margin-bottom: 13px;
	}
	.f {
		display: flex;
		flex-direction: column;
		gap: 5px;
		margin-bottom: 13px;
		min-width: 0;
	}
	.f > span {
		font-size: 12px;
		font-weight: 500;
		color: var(--brand-text, #23232b);
		line-height: 1.5;
	}
	.on-file {
		font-style: normal;
		font-size: 11px;
		color: var(--brand-muted, #71717f);
		font-weight: 400;
	}
	.f input,
	.f textarea,
	.anote {
		font: inherit;
		font-size: 13.5px;
		padding: 9px 11px;
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
	.f input:focus,
	.f textarea:focus {
		outline: none;
		border-color: var(--brand-primary, #6b4cf6);
		box-shadow: 0 0 0 3px var(--brand-focus-ring, rgba(107, 76, 246, 0.18));
	}
	.qblock {
		margin: 0 0 18px;
	}
	.qlabel {
		font-size: 12.5px;
		font-weight: 600;
		line-height: 1.55;
		margin-bottom: 6px;
	}
	.qnote {
		font-size: 11.5px;
		line-height: 1.6;
		color: var(--brand-muted, #71717f);
		margin: 0 0 8px;
	}
	.radios {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.radio {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-size: 13px;
		border: 1px solid var(--brand-border, #e6e6ee);
		border-radius: 8px;
		padding: 7px 12px;
		cursor: pointer;
	}
	.radio input {
		accent-color: var(--brand-primary, #6b4cf6);
	}
	.radio:has(input:checked) {
		border-color: var(--brand-primary, #6b4cf6);
		background: color-mix(in srgb, var(--brand-primary, #6b4cf6) 7%, transparent);
	}
	.gridscroll {
		overflow-x: auto;
		border: 1px solid var(--brand-border, #e6e6ee);
		border-radius: 10px;
	}
	.rgrid {
		border-collapse: collapse;
		width: 100%;
		min-width: 440px;
		font-size: 12.5px;
	}
	.rgrid th {
		font-size: 10.5px;
		font-weight: 600;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: var(--brand-muted, #71717f);
		padding: 9px 6px;
		text-align: center;
		background: color-mix(in srgb, var(--brand-primary, #6b4cf6) 5%, transparent);
		white-space: nowrap;
	}
	.rgrid td {
		padding: 8px 6px;
		text-align: center;
		border-top: 1px solid var(--brand-border, #e6e6ee);
	}
	.rowlabel {
		text-align: left !important;
		padding-left: 11px !important;
		line-height: 1.45;
		min-width: 160px;
	}
	.cell {
		display: block;
		cursor: pointer;
	}
	.cell input {
		accent-color: var(--brand-primary, #6b4cf6);
	}
	.assets {
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.asset {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
		gap: 10px;
		align-items: center;
	}
	.acheck {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 13px;
		cursor: pointer;
	}
	.acheck input {
		accent-color: var(--brand-primary, #6b4cf6);
	}
	.agreement {
		max-height: 300px
		;overflow-y: auto;
		border: 1px solid var(--brand-border, #e6e6ee);
		border-radius: 10px;
		padding: 16px 18px;
		margin-bottom: 18px;
		background: color-mix(in srgb, var(--brand-primary, #6b4cf6) 3%, transparent);
	}
	.ag-parties {
		font-size: 12.5px;
		line-height: 1.7;
		margin: 0 0 14px;
	}
	.clause {
		margin-bottom: 14px;
	}
	.ch {
		font-size: 11.5px;
		font-weight: 700;
		letter-spacing: 0.04em;
		margin-bottom: 4px;
	}
	.clause p {
		margin: 0;
		font-size: 11.5px;
		line-height: 1.65;
		color: var(--brand-muted, #71717f);
	}
	.upload {
		display: inline-block;
		font-size: 13px;
		font-weight: 600;
		color: var(--brand-primary, #6b4cf6);
		border: 1px solid color-mix(in srgb, var(--brand-primary, #6b4cf6) 35%, transparent);
		border-radius: 8px;
		padding: 9px 16px;
		cursor: pointer;
	}
	.upload.small {
		font-size: 12px;
		padding: 7px 13px;
	}
	.upload.busy {
		opacity: 0.6;
		cursor: default;
	}
	.upload input {
		display: none;
	}
	.upload-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 14px;
		padding: 12px 0;
		border-top: 1px solid var(--brand-border, #e6e6ee);
		margin: 6px 0 14px;
		flex-wrap: wrap;
	}
	.ul-label {
		font-size: 12.5px;
		font-weight: 600;
	}
	.ul-hint {
		font-size: 11.5px;
		color: var(--brand-muted, #71717f);
		margin-top: 2px;
	}
	.ul-acts {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.sig-preview {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 11px 13px;
		border: 1px solid var(--brand-border, #e6e6ee);
		border-radius: 9px;
		margin-bottom: 12px;
		flex-wrap: wrap;
	}
	.sig-meta {
		display: flex;
		flex-direction: column;
		gap: 2px;
		font-size: 12px;
		flex: 1;
	}
	.linkish {
		background: none;
		border: none;
		padding: 0;
		font: inherit;
		font-size: 12px;
		color: #c0392b;
		cursor: pointer;
		box-shadow: none;
	}
	.saved {
		margin-left: 10px;
		font-size: 12px;
		font-weight: 600;
		color: #1c7d55;
	}
	.err {
		color: #c0392b;
		font-size: 12.5px;
		margin: 8px 0 0;
		line-height: 1.55;
	}
	.err.banner {
		margin: 0 0 4px;
		padding: 11px 14px;
		background: rgba(192, 57, 43, 0.07);
		border: 1px solid rgba(192, 57, 43, 0.2);
		border-radius: 9px;
	}
	.rework {
		background: rgba(224, 166, 60, 0.1);
		border-left: 3px solid #e0a63c;
		border-radius: 0 10px 10px 0;
		padding: 13px 16px;
		font-size: 13px;
	}
	.rework strong {
		display: block;
		margin-bottom: 5px;
		font-size: 12.5px;
	}
	.rework ul {
		margin: 0;
		padding-left: 18px;
		line-height: 1.7;
		color: var(--brand-muted, #71717f);
	}
	.submit-card h2 {
		margin: 0;
		font-size: 15.5px;
	}
	.dl-inline {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		margin-bottom: 16px;
	}
	.dl {
		display: inline-flex;
		align-items: center;
		gap: 7px;
		font-size: 13px;
		color: var(--brand-primary, #6b4cf6);
		text-decoration: none;
		border: 1px solid color-mix(in srgb, var(--brand-primary, #6b4cf6) 28%, transparent);
		border-radius: 8px;
		padding: 8px 13px;
	}
	.dl.small {
		font-size: 12px;
		padding: 6px 11px;
	}
	.dl:hover {
		background: color-mix(in srgb, var(--brand-primary, #6b4cf6) 7%, transparent);
	}
	.fine {
		font-size: 11.5px;
		color: var(--brand-muted, #71717f);
		margin: 12px 0 0;
	}

	/* done */
	.done-wrap {
		max-width: 620px;
		margin: 0 auto;
		padding: 70px 18px;
	}
	.done-card {
		background: var(--brand-surface, #fff);
		border: 1px solid var(--brand-border, #e6e6ee);
		border-radius: var(--brand-card-radius, 16px);
		padding: 42px 34px;
		text-align: center;
	}
	.tick-big {
		width: 66px;
		height: 66px;
		border-radius: 50%;
		background: rgba(62, 190, 130, 0.14);
		color: #1c7d55;
		display: grid;
		place-items: center;
		margin: 0 auto 22px;
	}
	.done-card h1 {
		margin: 0 0 14px;
		font-size: 22px;
		font-weight: 700;
	}
	.done-card p {
		margin: 0 0 18px;
		font-size: 14px;
		line-height: 1.7;
		color: var(--brand-muted, #71717f);
	}
	.dl-block {
		text-align: left;
		border-top: 1px solid var(--brand-border, #e6e6ee);
		padding-top: 20px;
		margin-top: 6px;
	}
	.dl-title {
		font-size: 11px;
		letter-spacing: 0.14em;
		text-transform: uppercase;
		color: var(--brand-primary, #6b4cf6);
		font-weight: 600;
		margin-bottom: 11px;
	}
	.dl-block .dl {
		display: flex;
		margin-bottom: 7px;
	}
	@media (max-width: 560px) {
		.asset {
			grid-template-columns: minmax(0, 1fr);
			gap: 5px;
		}
		.hero,
		.hero-body {
			padding-left: 20px;
			padding-right: 20px;
		}
		.card {
			padding: 17px 16px;
		}
	}
</style>
