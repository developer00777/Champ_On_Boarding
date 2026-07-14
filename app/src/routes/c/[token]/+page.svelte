<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import { brandCssVars, brandFontsHref } from '$lib/shared/brands';
	import { EXP_LIKE_TRACKS, type Track } from '$lib/shared/matrix';
	import { untrack } from 'svelte';

	let { data, form } = $props();

	const brand = $derived(data.brand);
	const brandStyle = $derived(brandCssVars(brand));
	const fontsHref = $derived(brandFontsHref(brand));

	let fields: Record<string, string> = $state(
		untrack(() => ({ ...data.candidate.fields, aadhaarNo: '' }))
	);
	let suggestions: Record<string, string> = $state(untrack(() => ({ ...data.candidate.suggestions })));
	let autofilled: Record<string, boolean> = $state({});
	let uploading: Record<string, boolean> = $state({});
	let slotMessages: Record<string, string> = $state({});
	let saving = $state(false);

	// Pre-fill empty fields from OCR suggestions ("suggested, never authoritative").
	$effect(() => {
		for (const [k, v] of Object.entries(suggestions)) {
			if (k === 'aadhaarNo') {
				if (!fields.aadhaarNo && !data.candidate.hasAadhaar) {
					fields.aadhaarNo = v;
					autofilled.aadhaarNo = true;
				}
			} else if (k in fields && !fields[k]) {
				fields[k] = v;
				autofilled[k] = true;
			}
		}
	});

	const errors = $derived(
		new Map((form?.errors ?? []).map((e: { field: string; message: string }) => [e.field, e.message]))
	);

	async function uploadFile(slotType: string, input: HTMLInputElement) {
		const file = input.files?.[0];
		if (!file) return;
		uploading[slotType] = true;
		slotMessages[slotType] = '';
		try {
			const body = new FormData();
			body.append('docType', slotType);
			body.append('file', file);

			const res = await fetch(`/c/${page.params.token}/upload`, {
				method: 'POST',
				body
			});
			if (!res.ok) throw new Error((await res.json()).message ?? 'Upload failed');
			const result = await res.json();

			// Always keep extracted suggestions; the message reflects the standards check.
			if (result.suggestions) suggestions = { ...suggestions, ...result.suggestions };
			const c = result.conformance;
			if (result.ocrStatus === 'unreadable' || c?.status === 'fail') {
				slotMessages[slotType] = c?.reasons?.length
					? c.reasons.join(' ')
					: 'We could not read this image. Please retake it: flat surface, good light, all corners visible.';
			} else if (c?.status === 'warn') {
				slotMessages[slotType] = '⚠ ' + (c.reasons?.join(' ') ?? '');
			} else {
				slotMessages[slotType] = '';
			}
			await invalidateAll();
		} catch (e) {
			slotMessages[slotType] = e instanceof Error ? e.message : 'Upload failed';
		} finally {
			uploading[slotType] = false;
			input.value = '';
		}
	}

	async function removeDoc(docId: string) {
		await fetch(`/c/${page.params.token}/upload`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'remove', docId })
		});
		await invalidateAll();
	}

	const doneChip: Record<string, { text: string; cls: string }> = {
		parsed: { text: 'Auto-read ✓', cls: 'teal' },
		store_only: { text: 'Uploaded ✓', cls: 'mist' },
		pending: { text: 'Processing…', cls: 'mist' },
		unreadable: { text: 'Unreadable — replace', cls: 'red' },
		failed: { text: 'Uploaded · fill manually', cls: 'gold' }
	};

	// Standards-conformance chip (Indian govt document check).
	const stdChip: Record<string, { text: string; cls: string }> = {
		pass: { text: 'Standard ✓', cls: 'teal' },
		warn: { text: 'Please double-check', cls: 'gold' },
		fail: { text: "Doesn't meet standard", cls: 'red' }
	};

	const isSubmitted = $derived(
		['submitted', 'approved', 'complete'].includes(data.candidate.status)
	);

	// ----- progress (rail) -----
	const SECTIONS = [
		{ label: 'Personal', keys: ['fullName', 'dob', 'mobile', 'fatherName', 'motherName'] },
		{ label: 'Address', keys: ['presentAddress', 'presentPin', 'permanentAddress', 'permanentPin'] },
		{ label: 'Identification', keys: ['aadhaarNo', 'panNo'] },
		{ label: 'Bank', keys: ['bankName', 'accountNo', 'ifsc', 'branch'] }
	];
	const fieldsTotal = SECTIONS.reduce((a, s) => a + s.keys.length, 0);
	const docsDone = $derived(
		data.checklist.filter((s) =>
			// Optional slots (e.g. previous offer letters) count as done so the ring can reach 100%.
			!s.mandatory || s.docs.some((d) => d.reviewStatus !== 'reupload_requested')
		).length
	);
	const sectionStates = $derived(
		SECTIONS.map((sec) => {
			const done = sec.keys.filter((k) =>
				k === 'aadhaarNo' ? fields.aadhaarNo?.trim() || data.candidate.hasAadhaar : fields[k]?.trim()
			).length;
			return { label: sec.label, done, total: sec.keys.length, complete: done === sec.keys.length };
		})
	);
	const pct = $derived.by(() => {
		const fieldsDone = sectionStates.reduce((a, s) => a + s.done, 0);
		return Math.round((100 * (docsDone + fieldsDone)) / (data.checklist.length + fieldsTotal));
	});
	const RING = 213.6;

	const firstName = $derived((fields.fullName || '').split(' ')[0]);

</script>

<svelte:head>
	<title>{brand.name} — Onboarding</title>
	<link rel="icon" href={brand.logo.src} />
	{#if fontsHref}<link rel="stylesheet" href={fontsHref} />{/if}
</svelte:head>

{#if isSubmitted}
	<!-- ============ SUCCESS ============ -->
	<div class="brand-scope" style={brandStyle}>
	<main class="success">
		<div class="success-inner">
			<div class="success-mark">
				<div class="success-circle co-pop">
					<svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2.4"><path d="M20 6L9 17l-5-5" /></svg>
				</div>
				<div class="dot gold co-float"></div>
				<div class="dot teal co-float" style="animation-delay:.3s"></div>
			</div>
			<div class="eyebrow" style="letter-spacing:.18em;margin-bottom:12px">Submission received</div>
			<h1>You're all set{firstName ? `, ${firstName}` : ''}.</h1>
			<p class="lede">
				Your documents and details are
				{data.candidate.status === 'submitted'
					? 'submitted and now awaiting HR review. We’ll email you the moment they’re approved.'
					: 'approved by HR. See you on joining day!'}
			</p>
			{#if data.offerLetterSent}
				<a
					class="offer-dl-btn"
					href="/c/{page.params.token}/offer-letter"
					download
				>
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
					Download your offer letter (PDF)
				</a>
			{/if}

			<div class="card bring">
				<div class="eyebrow red-eyebrow">Bring on your joining day</div>
				{#each data.physicalItems as item}
					<div class="bring-row">
						<span class="bring-ico">
							<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#E8033A" stroke-width="2.2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
						</span>{item}
					</div>
				{/each}
			</div>
			<div class="lock-note">
				<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0095A0" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" /><path d="M22 4L12 14.01l-3-3" /></svg>
				Details locked &amp; encrypted
			</div>
		</div>
	</main>
	</div>
{:else if !data.candidate.consented}
	<!-- ============ WELCOME / CONSENT ============ -->
	<div class="brand-scope" style={brandStyle}>
	<main class="welcome">
		<div class="brand-row">
			<img class="brand-logo" src={brand.logo.src} alt={brand.name} />
		</div>

		<div class="hero-card">
			<div class="hero">
				<div class="hero-dots"></div>
				<div class="hero-ring r1"></div>
				<div class="hero-ring r2"></div>
				<div class="hero-content">
					<div class="hero-eyebrow">Welcome to {data.companyName}</div>
					<h1>Let's get you onboarded{firstName ? `, ${firstName}` : ''}.</h1>
					<p>A single link to share your documents and details. We read them for you, so you mostly just confirm.</p>
					<div class="hero-chips">
						<span class="hero-chip">
							<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><rect x="3" y="4" width="18" height="18" rx="2" /><path d="M16 2v4M8 2v4M3 10h18" /></svg>
							{data.candidate.trackLabel} track
						</span>
						<span class="hero-chip">
							<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg>
							About 20 minutes
						</span>
						<span class="hero-chip">
							<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M12 3l1.9 5.8H20l-4.9 3.6 1.9 5.8-5-3.6-5 3.6 1.9-5.8L4 8.8h6.1z" /></svg>
							Documents auto-read
						</span>
					</div>
				</div>
			</div>

			<div class="welcome-body">
				<div class="welcome-cols">
					<div>
						<div class="eyebrow" style="margin-bottom:14px">
							You'll need these {data.checklist.length} documents
						</div>
						<div class="doc-list">
							{#each data.checklist as slot}
								<div class="doc-line">
									<span class="tick purple">
										<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#6D08BE" stroke-width="2.4"><path d="M20 6L9 17l-5-5" /></svg>
									</span>{slot.label}
								</div>
							{/each}
						</div>
					</div>
					<div>
						<div class="eyebrow red-eyebrow" style="margin-bottom:14px">Bring physically on joining day</div>
						<div class="doc-list" style="margin-bottom:24px">
							{#each data.physicalItems as item}
								<div class="doc-line">
									<span class="tick red">
										<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#E8033A" stroke-width="2.2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
									</span>{item}
								</div>
							{/each}
						</div>
						<div class="shield-note">
							<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#0095A0" stroke-width="1.8" style="flex-shrink:0;margin-top:1px"><path d="M12 2l8 4v6c0 5-3.5 8-8 10-4.5-2-8-5-8-10V6z" /><path d="M9 12l2 2 4-4" /></svg>
							<div>
								<strong style="color:var(--ink)">Your data is protected.</strong> Documents are encrypted
								(AES-256), only the HR team can see them, and every access is logged.
							</div>
						</div>
					</div>
				</div>

				<hr class="divider" style="margin:30px 0 22px" />

				<p class="dpdp">
					{data.companyName} collects these documents solely for your employment onboarding. Images are
					processed by an AI service to pre-fill the form; you confirm every value before it is saved.
					Processing is governed by the Digital Personal Data Protection Act, 2023.
				</p>

				<form method="POST" action="?/consent" use:enhance>
					<label class="consent-row">
						<input type="checkbox" required class="consent-box" />
						<span>
							I have read the privacy notice and consent to my documents and personal data being
							processed for employment onboarding.
						</span>
					</label>
					<button class="btn grad" style="padding:15px 30px;font-size:15px">
						Agree and continue
						<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
					</button>
				</form>
			</div>
		</div>
	</main>
	</div>
{:else}
	<!-- ============ PORTAL ============ -->
	<div class="brand-scope" style={brandStyle}>
	<div class="appbar">
		<div class="appbar-inner">
			<img class="brand-logo small" src={brand.logo.src} alt={brand.name} />
			<div style="flex:1"></div>
			<span class="pill purple" style="text-transform:uppercase;letter-spacing:.1em">{data.candidate.trackLabel}</span>
			<span class="appbar-name">{fields.fullName || data.candidate.email}</span>
			{#if form?.saved}
				<span class="saved">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#0095A0" stroke-width="2.4"><path d="M20 6L9 17l-5-5" /></svg>
					Saved
				</span>
			{/if}
		</div>
		<div class="appbar-line"></div>
	</div>

	<main class="portal">
		{#if data.candidate.status === 'changes_requested'}
			<div class="changes-banner">
				<strong>HR has requested changes.</strong> Replace the documents marked in red below and submit again.
			</div>
		{/if}

		<div class="portal-grid">
			<!-- RAIL -->
			<aside class="rail">
				<div class="card" style="padding:22px">
					<div class="ring-row">
						<div class="ring-wrap">
							<svg width="78" height="78" viewBox="0 0 78 78" style="transform:rotate(-90deg)">
								<circle cx="39" cy="39" r="34" fill="none" stroke="#F0ECF6" stroke-width="8" />
								<circle cx="39" cy="39" r="34" fill="none" stroke="url(#cograd)" stroke-width="8" stroke-linecap="round" stroke-dasharray={RING} stroke-dashoffset={(RING * (1 - pct / 100)).toFixed(1)} style="transition:stroke-dashoffset .5s ease" />
								<defs><linearGradient id="cograd" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color={brand.colors.primary} /><stop offset="1" stop-color={brand.colors.accent} /></linearGradient></defs>
							</svg>
							<div class="ring-pct">{pct}%</div>
						</div>
						<div>
							<div style="font-weight:700;font-size:14px;margin-bottom:3px">
								{pct === 100 ? 'Ready to submit' : 'Keep going'}
							</div>
							<div class="muted" style="font-size:12px;line-height:1.4">
								{pct === 100 ? 'Everything looks complete.' : 'Upload documents and confirm your details.'}
							</div>
						</div>
					</div>
					<hr class="divider" style="margin:18px 0" />
					<div class="rail-list">
						<div class="rail-item">
							<span class="rail-ring" class:complete={docsDone === data.checklist.length}>
								{#if docsDone === data.checklist.length}<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><path d="M20 6L9 17l-5-5" /></svg>{/if}
							</span>
							<span class="rail-label" class:done-label={docsDone === data.checklist.length}>Documents</span>
							<span class="rail-count">{docsDone}/{data.checklist.length}</span>
						</div>
						{#each sectionStates as sec}
							<div class="rail-item">
								<span class="rail-ring" class:complete={sec.complete}>
									{#if sec.complete}<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><path d="M20 6L9 17l-5-5" /></svg>{/if}
								</span>
								<span class="rail-label" class:done-label={sec.complete}>{sec.label}</span>
								<span class="rail-count">{sec.done}/{sec.total}</span>
							</div>
						{/each}
					</div>
				</div>
				<div class="shield-note small-note">
					<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#0095A0" stroke-width="1.8" style="flex-shrink:0;margin-top:1px"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
					<div>Encrypted &amp; private. Only HR can view your files. You can close this and return any time.</div>
				</div>
			</aside>

			<!-- CONTENT -->
			<div class="content">
				<!-- documents -->
				<section class="card" style="padding:26px 26px 28px">
					<div class="section-head">
						<span class="section-num">01</span>
						<div class="eyebrow">Upload documents</div>
					</div>
					<p class="muted" style="margin:0 0 20px;line-height:1.55">
						JPG, PNG or PDF, max 10&nbsp;MB each. Cards marked
						<span style="color:#E6A700">✨</span> are read automatically and fill the form below.
						Photograph on a flat surface, good light, all corners visible.
					</p>
					<div class="doc-grid">
						{#each data.checklist as slot}
							{@const active = slot.docs.filter((d) => d.reviewStatus !== 'reupload_requested')}
							{@const reup = slot.docs.filter((d) => d.reviewStatus === 'reupload_requested')}
							<div class="doc-card" class:missing={errors.has(slot.type)} class:reup={reup.length > 0}>
								<div>
									<div class="doc-title">
										<span>{slot.label}</span>
										{#if slot.ocr}<span style="font-size:12px">✨</span>{/if}
									</div>
									<div class="doc-hint">{slot.hint}</div>
								</div>
								<div style="margin-top:auto;display:flex;flex-direction:column;gap:7px">
									{#each reup as doc}
										<div class="chip red">Re-upload requested{doc.reviewNote ? `: ${doc.reviewNote}` : ''}</div>
									{/each}
									{#each active as doc}
										<div class="done-row">
											<span class="chip {doneChip[doc.ocrStatus]?.cls ?? 'mist'}">
												<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6"><path d="M20 6L9 17l-5-5" /></svg>
												{doneChip[doc.ocrStatus]?.text ?? doc.ocrStatus}
											</span>
											{#if data.editable}
												<button type="button" class="trash" title="Remove" onclick={() => removeDoc(doc.id)} aria-label="Remove file">
													<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" /></svg>
												</button>
											{/if}
										</div>
										{#if stdChip[doc.standardStatus]}
											<span class="chip {stdChip[doc.standardStatus].cls}">{stdChip[doc.standardStatus].text}</span>
											{#if doc.standardStatus !== 'pass' && doc.standardReasons?.length}
												<div class="error">{doc.standardReasons.join(' ')}</div>
											{/if}
										{/if}
									{/each}
									{#if uploading[slot.type]}
										<div class="uploading">
											<svg class="co-spin" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#E6A700" stroke-width="2.2"><path d="M21 12a9 9 0 1 1-6.2-8.5" /></svg>
											Reading document…
										</div>
									{:else if data.editable && active.length < slot.maxFiles}
										<label class="upload-btn">
											<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 16V4M7 9l5-5 5 5" /><path d="M5 20h14" /></svg>
											{active.length ? 'Add another file' : 'Click to upload'}
											<input type="file" accept="image/jpeg,image/png,application/pdf" onchange={(e) => uploadFile(slot.type, e.currentTarget)} style="display:none" />
										</label>
									{/if}
									{#if slotMessages[slot.type]}<div class="error">{slotMessages[slot.type]}</div>{/if}
									{#if errors.has(slot.type)}<div class="error">{errors.get(slot.type)}</div>{/if}
								</div>
							</div>
						{/each}
					</div>
				</section>

	
				<form method="POST" action="?/submit" use:enhance={() => {
					saving = true;
					return async ({ update }) => {
						saving = false;
						await update({ reset: false });
					};
				}}>
					{#snippet field(key: string, label: string, opts: { placeholder?: string; full?: boolean; required?: boolean } = {})}
						<div style:grid-column={opts.full ? '1 / -1' : 'auto'}>
							<label for={key}>
								{label}
								{#if autofilled[key]}<span class="autotag">✨ auto-filled</span>{/if}
							</label>
							<input id={key} name={key} bind:value={fields[key]} placeholder={opts.placeholder ?? ''} required={opts.required ?? false} class:auto={autofilled[key]} />
							{#if errors.has(key)}<div class="error">{errors.get(key)}</div>{/if}
						</div>
					{/snippet}
					<!-- personal -->
					<section class="card form-card">
						<div class="section-head">
							<span class="section-num">02</span>
							<div class="eyebrow">Personal information</div>
						</div>
						<h3>Tell us about you</h3>
						<div class="form-grid">
							{@render field('fullName', 'Full name', { required: true })}
							{@render field('dob', 'Date of birth', { placeholder: 'DD/MM/YYYY', required: true })}
							<div>
								<label for="gender">Gender</label>
								<select id="gender" name="gender" bind:value={fields.gender}>
									<option value="">—</option>
									<option value="Female">Female</option>
									<option value="Male">Male</option>
									<option value="Other">Other</option>
								</select>
							</div>
							{@render field('mobile', 'Mobile number', { placeholder: '10 digits', required: true })}
							{@render field('fatherName', "Father's name", { required: true })}
							{@render field('fatherMobile', "Father's mobile", { required: true })}
							{@render field('motherName', "Mother's name", { required: true })}
							{@render field('motherMobile', "Mother's mobile")}
							{@render field('motherDob', "Mother's DOB", { placeholder: 'DD/MM/YYYY' })}
							<div>
								<label for="maritalStatus">Marital status</label>
								<select id="maritalStatus" name="maritalStatus" bind:value={fields.maritalStatus}>
									<option value="single">Single</option>
									<option value="married">Married</option>
								</select>
							</div>
							{#if fields.maritalStatus === 'married'}
								{@render field('spouseName', 'Spouse name')}
								{@render field('spouseContact', 'Spouse contact')}
								{@render field('spouseDob', 'Spouse DOB', { placeholder: 'DD/MM/YYYY' })}
							{:else}
								<input type="hidden" name="spouseName" value="" />
								<input type="hidden" name="spouseContact" value="" />
								<input type="hidden" name="spouseDob" value="" />
							{/if}
							{@render field('emergencyContactName', 'Emergency contact name (optional)')}
							{@render field('emergencyContactMobile', 'Emergency contact mobile (optional)')}
							{@render field('emergencyContactRelation', 'Emergency contact relation (optional)')}
						</div>
					</section>

					<!-- address -->
					<section class="card form-card">
						<div class="section-head">
							<span class="section-num">03</span>
							<div class="eyebrow">Address</div>
						</div>
						<h3>Where you live</h3>
						<div class="form-grid">
							<div style="grid-column:1 / -1">
								<label for="presentAddress">
									Present address
									{#if autofilled.presentAddress}<span class="autotag">✨ auto-filled</span>{/if}
								</label>
								<textarea id="presentAddress" name="presentAddress" rows="2" bind:value={fields.presentAddress} required class:auto={autofilled.presentAddress}></textarea>
								{#if errors.has('presentAddress')}<div class="error">{errors.get('presentAddress')}</div>{/if}
							</div>
							{@render field('presentHouseNo', 'House / flat no.', { required: true })}
							{@render field('presentPin', 'PIN code', { placeholder: '6 digits', required: true })}
							<div style="grid-column:1 / -1">
								<label class="same-row">
									<input type="checkbox" class="same-box" onchange={(e) => {
										if (e.currentTarget.checked) {
											fields.permanentAddress = fields.presentAddress;
											fields.permanentPin = fields.presentPin;
											fields.permanentHouseNo = fields.presentHouseNo;
										}
									}} />
									<span>Permanent address same as present</span>
								</label>
							</div>
							<div style="grid-column:1 / -1">
								<label for="permanentAddress">Permanent address</label>
								<textarea id="permanentAddress" name="permanentAddress" rows="2" bind:value={fields.permanentAddress} required></textarea>
								{#if errors.has('permanentAddress')}<div class="error">{errors.get('permanentAddress')}</div>{/if}
							</div>
							{@render field('permanentHouseNo', 'House / flat no.', { required: true })}
							{@render field('permanentPin', 'PIN code', { placeholder: '6 digits', required: true })}
						</div>
					</section>

					<!-- identification -->
					<section class="card form-card">
						<div class="section-head">
							<span class="section-num">04</span>
							<div class="eyebrow">Identification</div>
						</div>
						<h3>Your IDs</h3>
						<div class="form-grid">
							<div>
								<label for="aadhaarNo">
									Aadhaar number
									{#if autofilled.aadhaarNo}<span class="autotag">✨ auto-filled</span>{/if}
								</label>
								<input id="aadhaarNo" name="aadhaarNo" bind:value={fields.aadhaarNo} placeholder={data.candidate.hasAadhaar ? `Saved: ${data.candidate.aadhaarMasked} — leave blank to keep` : '12 digits'} required={!data.candidate.hasAadhaar} class:auto={autofilled.aadhaarNo} />
								{#if errors.has('aadhaarNo')}<div class="error">{errors.get('aadhaarNo')}</div>{/if}
								<div class="lock-hint">
									<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#0095A0" stroke-width="2"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
									Encrypted at rest · masked everywhere
								</div>
							</div>
							{@render field('panNo', 'PAN number', { placeholder: 'AAAAA9999A', required: true })}
							{#if EXP_LIKE_TRACKS.includes(data.candidate.track as Track)}
								{@render field('uanNo', 'UAN number (if available)')}
							{/if}
							{@render field('dlNo', 'Driving licence no. (if applicable)')}
							{@render field('passportNo', 'Passport no. (if applicable)')}
							{@render field('linkedinId', 'LinkedIn profile URL (optional)')}
						</div>
					</section>

					<!-- bank -->
					<section class="card form-card">
						<div class="section-head">
							<span class="section-num">05</span>
							<div class="eyebrow">Bank details</div>
						</div>
						<h3>Salary account</h3>
						<div class="form-grid">
							{@render field('bankName', 'Bank name', { required: true })}
							{@render field('accountNo', 'Account number', { required: true })}
							{@render field('ifsc', 'IFSC code', { placeholder: 'AAAA0XXXXXX', required: true })}
							{@render field('branch', 'Branch', { required: true })}
						</div>
					</section>

					<!-- submit -->
					<section class="submit-bar">
						<div style="flex:1;min-width:220px">
							<div style="font-weight:700;font-size:17px;color:#fff;margin-bottom:3px">
								{#if form?.errors?.length}
									Fix {form.errors.length} highlighted issue{form.errors.length > 1 ? 's' : ''} above
								{:else}
									Ready when you are
								{/if}
							</div>
							<div style="font-size:13px;color:rgba(255,255,255,.6)">
								You can save and return to this link any time before submitting.
							</div>
						</div>
						<button formaction="?/save" class="save-ghost" disabled={saving}>Save progress</button>
						<button class="btn" disabled={saving}>
							{saving ? 'Submitting…' : 'Submit for HR review'}
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
						</button>
					</section>
				</form>
			</div>
		</div>
	</main>
	</div>
{/if}

<style>
	/* ---------- brand theming ---------- */
	.brand-logo {
		height: 40px;
		width: auto;
		max-width: 230px;
		object-fit: contain;
		display: block;
		/* White logos sit on the brand's dark surface so they stay legible. */
		background: var(--brand-logo-bg, transparent);
		padding: var(--brand-logo-pad, 0);
		border-radius: 10px;
		box-sizing: content-box;
	}
	.brand-logo.small {
		height: 26px;
		max-width: 180px;
	}
	/* Paint the full page in the brand colour on every candidate view. */
	.brand-scope {
		background: var(--brand-bg, var(--paper));
		min-height: 100vh;
	}

	/* ---------- welcome ---------- */
	.welcome {
		max-width: 960px;
		margin: 0 auto;
		padding: 32px 24px 80px;
	}
	.brand-row {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 26px;
	}
	.hero-card {
		border-radius: 28px;
		overflow: hidden;
		box-shadow: 0 24px 60px -12px rgba(11, 7, 24, 0.22);
		background: #fff;
	}
	.hero {
		position: relative;
		padding: 54px 48px 60px;
		background: var(--brand-hero, linear-gradient(135deg, #6d08be 0%, #7a2bd0 42%, #e8033a 100%));
		overflow: hidden;
	}
	.hero-dots {
		position: absolute;
		inset: 0;
		background-image: radial-gradient(rgba(255, 255, 255, 0.22) 1.4px, transparent 1.5px);
		background-size: 20px 20px;
		mix-blend-mode: overlay;
		opacity: 0.55;
	}
	.hero-ring {
		position: absolute;
		border: 1.5px solid rgba(255, 255, 255, 0.18);
		border-radius: 50%;
	}
	.hero-ring.r1 {
		right: -60px;
		top: -60px;
		width: 280px;
		height: 280px;
	}
	.hero-ring.r2 {
		right: 30px;
		top: 40px;
		width: 170px;
		height: 170px;
		border-color: rgba(255, 255, 255, 0.14);
	}
	.hero-content {
		position: relative;
	}
	.hero-eyebrow {
		font-weight: 700;
		font-size: 12.5px;
		letter-spacing: 0.2em;
		text-transform: uppercase;
		color: rgba(255, 255, 255, 0.82);
		margin-bottom: 16px;
	}
	.hero h1 {
		font-size: clamp(30px, 5vw, 46px);
		line-height: 1.04;
		font-weight: 800;
		color: #fff;
		margin: 0 0 14px;
		max-width: 560px;
	}
	.hero p {
		font-family: 'Alata', sans-serif;
		font-size: 19px;
		line-height: 1.5;
		color: rgba(255, 255, 255, 0.9);
		margin: 0;
		max-width: 500px;
	}
	.hero-chips {
		display: flex;
		gap: 10px;
		flex-wrap: wrap;
		margin-top: 26px;
	}
	.hero-chip {
		display: flex;
		align-items: center;
		gap: 7px;
		background: rgba(255, 255, 255, 0.14);
		border: 1px solid rgba(255, 255, 255, 0.22);
		padding: 8px 14px;
		border-radius: 999px;
		color: #fff;
		font-size: 13px;
		font-weight: 600;
	}
	.welcome-body {
		padding: 40px 48px 46px;
	}
	.welcome-cols {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 36px;
	}
	.red-eyebrow {
		color: var(--red);
	}
	.doc-list {
		display: flex;
		flex-direction: column;
		gap: 9px;
	}
	.doc-line {
		display: flex;
		align-items: center;
		gap: 10px;
		font-size: 13.5px;
		color: var(--fg-2);
	}
	.tick {
		width: 18px;
		height: 18px;
		border-radius: 5px;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}
	.tick.purple {
		background: var(--mist);
	}
	.tick.red {
		background: #fff1f3;
	}
	.shield-note {
		display: flex;
		gap: 11px;
		align-items: flex-start;
		background: #f6fcfc;
		border: 1px solid #cfebed;
		border-radius: 14px;
		padding: 14px 15px;
		font-size: 12.5px;
		line-height: 1.5;
		color: var(--fg-2);
	}
	.dpdp {
		font-size: 12px;
		line-height: 1.6;
		color: var(--smoke);
		margin: 0 0 18px;
		max-width: 760px;
	}
	.consent-row {
		display: flex;
		gap: 11px;
		align-items: flex-start;
		cursor: pointer;
		margin-bottom: 22px;
		font-size: 13.5px;
		line-height: 1.5;
		color: var(--fg-2);
		font-weight: 400;
	}
	.consent-box {
		width: 20px;
		height: 20px;
		accent-color: var(--brand-primary, var(--purple));
		cursor: pointer;
		margin-top: 1px;
		flex-shrink: 0;
	}

	/* ---------- portal ---------- */
	.appbar {
		position: sticky;
		top: 0;
		z-index: 50;
		background: rgba(255, 255, 255, 0.86);
		backdrop-filter: saturate(180%) blur(14px);
		border-bottom: 1px solid var(--border);
	}
	.appbar-inner {
		max-width: 1180px;
		margin: 0 auto;
		padding: 13px 24px;
		display: flex;
		align-items: center;
		gap: 12px;
	}
	.appbar-name {
		font-size: 13px;
		color: var(--fg-2);
		font-weight: 600;
	}
	.appbar-line {
		height: 3px;
		background: var(--brand-hero, linear-gradient(90deg, #ffb703 0%, #e8033a 50%, #6d08be 100%));
	}
	.saved {
		display: flex;
		align-items: center;
		gap: 6px;
		font-size: 12.5px;
		font-weight: 600;
		color: var(--teal);
	}
	.portal {
		max-width: 1180px;
		margin: 0 auto;
		padding: 28px 24px 80px;
	}
	.changes-banner {
		background: #fffbeb;
		border: 1px solid #fcd34d;
		border-radius: 16px;
		padding: 14px 18px;
		margin-bottom: 20px;
		font-size: 13.5px;
		color: var(--fg-2);
	}
	.portal-grid {
		display: grid;
		grid-template-columns: 288px 1fr;
		gap: 32px;
		align-items: start;
	}
	.rail {
		position: sticky;
		top: 88px;
		display: flex;
		flex-direction: column;
		gap: 16px;
	}
	.ring-row {
		display: flex;
		align-items: center;
		gap: 16px;
	}
	.ring-wrap {
		position: relative;
		width: 78px;
		height: 78px;
		flex-shrink: 0;
	}
	.ring-pct {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		font-weight: 800;
		font-size: 19px;
	}
	.rail-list {
		display: flex;
		flex-direction: column;
		gap: 3px;
	}
	.rail-item {
		display: flex;
		align-items: center;
		gap: 11px;
		padding: 7px 0;
	}
	.rail-ring {
		width: 22px;
		height: 22px;
		border-radius: 999px;
		border: 1.5px solid var(--fog);
		background: #fff;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}
	.rail-ring.complete {
		border-color: var(--teal);
		background: var(--teal);
	}
	.rail-label {
		flex: 1;
		font-size: 13.5px;
		font-weight: 600;
		color: var(--fg-2);
	}
	.rail-label.done-label {
		color: var(--ink);
	}
	.rail-count {
		font-size: 12px;
		color: var(--smoke);
		font-weight: 600;
	}
	.small-note {
		border-radius: 16px;
		font-size: 12px;
	}
	.content {
		display: flex;
		flex-direction: column;
		gap: 22px;
	}
	.content form {
		display: flex;
		flex-direction: column;
		gap: 22px;
	}
	.section-head {
		display: flex;
		align-items: baseline;
		gap: 12px;
		margin-bottom: 6px;
	}
	.section-num {
		font-weight: 800;
		font-size: 13px;
		color: var(--fog);
	}
	.form-card h3 {
		margin: 0 0 18px;
		font-size: 21px;
		font-weight: 700;
	}
	.doc-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 13px;
	}
	.doc-card {
		border: 1.5px solid var(--border);
		border-radius: 14px;
		padding: 14px;
		background: #fff;
		display: flex;
		flex-direction: column;
		gap: 11px;
		min-height: 118px;
		transition:
			border-color 0.2s,
			background 0.2s;
	}
	.doc-card.missing {
		border-color: #f5c2cd;
		background: #fffafb;
	}
	.doc-card.reup {
		border-color: var(--red);
		background: #fff8f9;
	}
	.doc-title {
		display: flex;
		align-items: center;
		gap: 6px;
		font-weight: 700;
		font-size: 13.5px;
	}
	.doc-hint {
		font-size: 11.5px;
		color: var(--smoke);
		line-height: 1.4;
		margin-top: 3px;
	}
	.upload-btn {
		width: 100%;
		border: 1.5px dashed #cfc7dc;
		background: #fff;
		border-radius: 11px;
		padding: 11px;
		cursor: pointer;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		font-weight: 700;
		font-size: 12.5px;
		color: var(--brand-primary, var(--purple));
		transition: all 0.18s;
		margin: 0;
	}
	.upload-btn:hover {
		border-color: var(--brand-primary, var(--purple));
		background: #faf6fe;
	}
	.uploading {
		width: 100%;
		border: 1.5px solid #fce9b8;
		background: #fffbf0;
		border-radius: 11px;
		padding: 11px;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 9px;
		font-weight: 700;
		font-size: 12.5px;
		color: #7a5800;
	}
	.done-row {
		display: flex;
		align-items: center;
		gap: 8px;
	}
	.chip {
		flex: 1;
		display: flex;
		align-items: center;
		gap: 7px;
		border-radius: 10px;
		padding: 8px 11px;
		font-weight: 700;
		font-size: 12px;
	}
	.chip.teal {
		background: rgba(0, 149, 160, 0.12);
		color: #00666e;
	}
	.chip.mist {
		background: var(--mist);
		color: var(--fg-2);
	}
	.chip.gold {
		background: rgba(255, 183, 3, 0.18);
		color: #7a5800;
	}
	.chip.red {
		background: #fff1f3;
		color: var(--red);
	}
	.trash {
		border: 1px solid var(--border);
		background: #fff;
		border-radius: 9px;
		width: 32px;
		height: 32px;
		display: flex;
		align-items: center;
		justify-content: center;
		color: var(--smoke);
		flex-shrink: 0;
		transition: all 0.15s;
	}
	.trash:hover {
		color: var(--red);
		border-color: #f5c2cd;
	}
	.form-grid {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 14px 18px;
	}
	.autotag {
		font-size: 9.5px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: #7a5800;
		background: rgba(255, 183, 3, 0.2);
		padding: 2px 6px;
		border-radius: 999px;
		margin-left: 6px;
	}
	:global(.form-grid input.auto),
	:global(.form-grid textarea.auto) {
		border-color: #e6a700;
		background: #fffcf2;
	}
	.same-row {
		display: flex;
		gap: 10px;
		align-items: center;
		cursor: pointer;
		padding: 4px 0;
		font-size: 13.5px;
		font-weight: 600;
		margin: 0;
	}
	.same-box {
		width: 18px;
		height: 18px;
		accent-color: var(--brand-primary, var(--purple));
		cursor: pointer;
	}
	.lock-hint {
		font-size: 11px;
		color: var(--smoke);
		margin-top: 5px;
		display: flex;
		align-items: center;
		gap: 5px;
	}
	.submit-bar {
		background: var(--brand-ink, #1e1433);
		border-radius: 20px;
		padding: 26px;
		display: flex;
		align-items: center;
		gap: 14px;
		flex-wrap: wrap;
	}
	.save-ghost {
		border: 1.5px solid rgba(255, 255, 255, 0.3);
		background: transparent;
		color: #fff;
		font-weight: 700;
		font-size: 14px;
		padding: 13px 22px;
		border-radius: 999px;
		transition: background 0.18s;
	}
	.save-ghost:hover {
		background: rgba(255, 255, 255, 0.1);
	}

	/* ---------- success ---------- */
	.success {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 32px 24px;
	}
	.success-inner {
		max-width: 560px;
		width: 100%;
		text-align: center;
	}
	.success-mark {
		position: relative;
		width: 104px;
		height: 104px;
		margin: 0 auto 28px;
	}
	.success-circle {
		position: absolute;
		inset: 0;
		border-radius: 50%;
		background: var(--brand-hero, var(--grad-brand));
		box-shadow: 0 16px 48px -12px rgba(0, 0, 0, 0.28);
		display: flex;
		align-items: center;
		justify-content: center;
	}
	.dot {
		position: absolute;
		border-radius: 50%;
	}
	.dot.gold {
		top: -6px;
		right: -2px;
		width: 14px;
		height: 14px;
		background: var(--gold);
	}
	.dot.teal {
		bottom: 4px;
		left: -10px;
		width: 9px;
		height: 9px;
		background: var(--teal);
	}
	.success h1 {
		font-size: clamp(28px, 5vw, 38px);
		font-weight: 800;
		margin: 0 0 12px;
	}
	.lede {
		font-family: 'Alata', sans-serif;
		font-size: 17px;
		line-height: 1.55;
		color: var(--fg-2);
		margin: 0 0 32px;
	}
	.offer-dl-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 10px;
		width: 100%;
		padding: 14px 20px;
		margin-bottom: 18px;
		background: var(--brand-primary, #1E73BE);
		color: #fff;
		font-weight: 800;
		font-size: 15px;
		border-radius: 12px;
		text-decoration: none;
		box-shadow: 0 4px 18px -4px rgba(0,0,0,0.22);
		transition: opacity 0.15s, transform 0.1s;
	}
	.offer-dl-btn:hover {
		opacity: 0.9;
		transform: translateY(-1px);
	}
	.offer-dl-btn:active {
		transform: translateY(0);
		opacity: 1;
	}
	.bring {
		text-align: left;
		margin-bottom: 18px;
	}
	.bring .eyebrow {
		margin-bottom: 14px;
	}
	.bring-row {
		display: flex;
		align-items: center;
		gap: 11px;
		font-size: 14px;
		color: var(--fg-2);
		padding: 5px 0;
	}
	.bring-ico {
		width: 22px;
		height: 22px;
		border-radius: 7px;
		background: #fff1f3;
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
	}
	.lock-note {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 7px;
		font-size: 12.5px;
		color: var(--smoke);
		font-weight: 600;
	}

	/* ---------- responsive ---------- */
	@media (max-width: 900px) {
		.portal-grid {
			grid-template-columns: 1fr;
		}
		.rail {
			position: static;
		}
		.welcome-cols {
			grid-template-columns: 1fr;
		}
		.hero,
		.welcome-body {
			padding-left: 26px;
			padding-right: 26px;
		}
	}
	@media (max-width: 640px) {
		.doc-grid,
		.form-grid {
			grid-template-columns: 1fr;
		}
		.appbar-name {
			display: none;
		}
	}
</style>
