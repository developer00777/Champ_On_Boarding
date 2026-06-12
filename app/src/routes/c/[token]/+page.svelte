<script lang="ts">
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';

	let { data, form } = $props();

	let fields: Record<string, string> = $state({ ...data.candidate.fields, aadhaarNo: '' });
	let suggestions: Record<string, string> = $state({ ...data.candidate.suggestions });
	let uploading: Record<string, boolean> = $state({});
	let slotMessages: Record<string, string> = $state({});
	let saving = $state(false);

	// Pre-fill empty fields from OCR suggestions ("suggested, never authoritative").
	$effect(() => {
		for (const [k, v] of Object.entries(suggestions)) {
			if (k === 'aadhaarNo') {
				if (!fields.aadhaarNo && !data.candidate.hasAadhaar) fields.aadhaarNo = v;
			} else if (k in fields && !fields[k as keyof typeof fields]) {
				(fields as Record<string, string>)[k] = v;
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
			const presign = await fetch(`/c/${page.params.token}/upload`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					action: 'presign',
					docType: slotType,
					mime: file.type,
					size: file.size
				})
			});
			if (!presign.ok) throw new Error((await presign.json()).message ?? 'Upload rejected');
			const { docId, putUrl } = await presign.json();

			const put = await fetch(putUrl, {
				method: 'PUT',
				headers: { 'Content-Type': file.type },
				body: file
			});
			if (!put.ok) throw new Error('Storage upload failed — please retry');

			slotMessages[slotType] = 'Reading document…';
			const complete = await fetch(`/c/${page.params.token}/upload`, {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'complete', docId })
			});
			if (!complete.ok) throw new Error((await complete.json()).message ?? 'Processing failed');
			const result = await complete.json();

			if (result.ocrStatus === 'unreadable') {
				slotMessages[slotType] = result.message;
			} else {
				slotMessages[slotType] = '';
				suggestions = { ...suggestions, ...result.suggestions };
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

	const statusLabel: Record<string, string> = {
		parsed: 'Read ✓',
		store_only: 'Uploaded ✓',
		pending: 'Processing…',
		unreadable: 'Unreadable — re-upload',
		failed: 'Uploaded (auto-read failed — fill fields manually)'
	};
</script>

<main>
	<header class="card">
		<h1>Onboarding — {data.companyName}</h1>
		<p class="muted">
			Track: <span class="badge blue">{data.candidate.trackLabel}</span> · {data.candidate.email}
		</p>
	</header>

	{#if data.candidate.status === 'submitted' || data.candidate.status === 'approved' || data.candidate.status === 'complete'}
		<section class="card">
			<h2>✅ Submission received</h2>
			<p>
				Thank you! Your documents and details have been submitted and are
				{data.candidate.status === 'submitted' ? ' awaiting HR review.' : ' approved by HR.'}
			</p>
			<h3>On your joining day, please bring:</h3>
			<ul>
				{#each data.physicalItems as item}
					<li>{item}</li>
				{/each}
			</ul>
		</section>
	{:else if !data.candidate.consented}
		<section class="card">
			<h2>Before you begin</h2>
			<p>
				You will upload identity, education and bank documents and confirm your details. Please
				photograph documents on a flat surface, in good light, with all four corners visible and no
				glare.
			</p>
			<h3>Privacy notice & consent</h3>
			<p class="muted">
				Champions Group collects the documents and details on this page solely for your employment
				onboarding. Document images are processed by an AI service to pre-fill the form; you confirm
				every value before it is saved. Your data is stored securely, access is restricted to the HR
				team and every access is logged. Records are retained as employment records; you may request
				access, correction or deletion by contacting HR. This processing is governed by the Digital
				Personal Data Protection Act, 2023.
			</p>
			<h3>You will need ({data.checklist.length} documents)</h3>
			<ul>
				{#each data.checklist as slot}
					<li>{slot.label} <span class="muted">— {slot.hint}</span></li>
				{/each}
			</ul>
			<h3>Bring physically on joining day</h3>
			<ul>
				{#each data.physicalItems as item}
					<li>{item}</li>
				{/each}
			</ul>
			<form method="POST" action="?/consent" use:enhance>
				<label style="display:flex;gap:.5rem;align-items:flex-start;font-weight:400">
					<input type="checkbox" required style="width:auto;margin-top:.3rem" />
					<span>
						I have read the privacy notice and I consent to my documents and personal data being
						processed for employment onboarding.
					</span>
				</label>
				<button style="margin-top:1rem">Agree and continue</button>
			</form>
		</section>
	{:else}
		{#if data.candidate.status === 'changes_requested'}
			<section class="card" style="border-color:#f59e0b;background:#fffbeb">
				<strong>HR has requested changes.</strong> Please check the documents marked below, re-upload
				them, and submit again.
			</section>
		{/if}

		<section class="card">
			<h2>1 · Upload documents</h2>
			<p class="muted">
				JPG, PNG, WEBP or PDF, max 10 MB each. Documents marked ✨ auto-fill the form below — check
				every value before submitting.
			</p>
			{#each data.checklist as slot}
				<div class="slot" class:missing={errors.has(slot.type)}>
					<div>
						<strong>{slot.label}</strong>
						{#if slot.ocr}✨{/if}
						{#if slot.mandatory}<span class="badge red">required</span>{/if}
						<div class="muted">{slot.hint}</div>
						{#each slot.docs as doc}
							<div class="docrow">
								{#if doc.reviewStatus === 'reupload_requested'}
									<span class="badge amber">Re-upload requested{doc.reviewNote ? `: ${doc.reviewNote}` : ''}</span>
								{:else}
									<span class="badge green">{statusLabel[doc.ocrStatus] ?? doc.ocrStatus}</span>
								{/if}
								{#if data.editable && doc.reviewStatus !== 'reupload_requested'}
									<button type="button" class="secondary small" onclick={() => removeDoc(doc.id)}>
										Remove
									</button>
								{/if}
							</div>
						{/each}
						{#if slotMessages[slot.type]}<div class="error">{slotMessages[slot.type]}</div>{/if}
						{#if errors.has(slot.type)}<div class="error">{errors.get(slot.type)}</div>{/if}
					</div>
					{#if data.editable && slot.docs.filter((d) => d.reviewStatus !== 'reupload_requested').length < slot.maxFiles}
						<label class="btn secondary upload-btn">
							{uploading[slot.type] ? 'Uploading…' : slot.docs.length ? 'Add file' : 'Upload'}
							<input
								type="file"
								accept="image/jpeg,image/png,image/webp,application/pdf"
								disabled={uploading[slot.type]}
								onchange={(e) => uploadFile(slot.type, e.currentTarget)}
								style="display:none"
							/>
						</label>
					{/if}
				</div>
			{/each}
		</section>

		<form method="POST" action="?/submit" use:enhance={() => {
			saving = true;
			return async ({ update }) => {
				saving = false;
				await update({ reset: false });
			};
		}}>
			<section class="card">
				<h2>2 · Personal information</h2>
				<p class="muted">Fields with a ✨ were read from your documents — please verify them.</p>
				<div class="grid2">
					<div>
						<label for="fullName">Full name {#if suggestions.fullName}✨{/if}</label>
						<input id="fullName" name="fullName" bind:value={fields.fullName} required />
						{#if errors.has('fullName')}<div class="error">{errors.get('fullName')}</div>{/if}
					</div>
					<div>
						<label for="dob">Date of birth (DD/MM/YYYY) {#if suggestions.dob}✨{/if}</label>
						<input id="dob" name="dob" bind:value={fields.dob} placeholder="DD/MM/YYYY" required />
						{#if errors.has('dob')}<div class="error">{errors.get('dob')}</div>{/if}
					</div>
					<div>
						<label for="gender">Gender</label>
						<select id="gender" name="gender" bind:value={fields.gender}>
							<option value="">—</option>
							<option value="Female">Female</option>
							<option value="Male">Male</option>
							<option value="Other">Other</option>
						</select>
					</div>
					<div>
						<label for="mobile">Mobile number</label>
						<input id="mobile" name="mobile" bind:value={fields.mobile} required />
						{#if errors.has('mobile')}<div class="error">{errors.get('mobile')}</div>{/if}
					</div>
					<div>
						<label for="fatherName">Father's name {#if suggestions.fatherName}✨{/if}</label>
						<input id="fatherName" name="fatherName" bind:value={fields.fatherName} required />
						{#if errors.has('fatherName')}<div class="error">{errors.get('fatherName')}</div>{/if}
					</div>
					<div>
						<label for="fatherMobile">Father's mobile</label>
						<input id="fatherMobile" name="fatherMobile" bind:value={fields.fatherMobile} required />
						{#if errors.has('fatherMobile')}<div class="error">{errors.get('fatherMobile')}</div>{/if}
					</div>
					<div>
						<label for="motherName">Mother's name</label>
						<input id="motherName" name="motherName" bind:value={fields.motherName} required />
						{#if errors.has('motherName')}<div class="error">{errors.get('motherName')}</div>{/if}
					</div>
					<div>
						<label for="motherMobile">Mother's mobile</label>
						<input id="motherMobile" name="motherMobile" bind:value={fields.motherMobile} />
						{#if errors.has('motherMobile')}<div class="error">{errors.get('motherMobile')}</div>{/if}
					</div>
					<div>
						<label for="motherDob">Mother's DOB (DD/MM/YYYY)</label>
						<input id="motherDob" name="motherDob" bind:value={fields.motherDob} />
					</div>
					<div>
						<label for="maritalStatus">Marital status</label>
						<select id="maritalStatus" name="maritalStatus" bind:value={fields.maritalStatus}>
							<option value="single">Single</option>
							<option value="married">Married</option>
						</select>
					</div>
				</div>
				{#if fields.maritalStatus === 'married'}
					<div class="grid2">
						<div>
							<label for="spouseName">Spouse name</label>
							<input id="spouseName" name="spouseName" bind:value={fields.spouseName} />
							{#if errors.has('spouseName')}<div class="error">{errors.get('spouseName')}</div>{/if}
						</div>
						<div>
							<label for="spouseContact">Spouse contact</label>
							<input id="spouseContact" name="spouseContact" bind:value={fields.spouseContact} />
							{#if errors.has('spouseContact')}<div class="error">{errors.get('spouseContact')}</div>{/if}
						</div>
						<div>
							<label for="spouseDob">Spouse DOB (DD/MM/YYYY)</label>
							<input id="spouseDob" name="spouseDob" bind:value={fields.spouseDob} />
						</div>
					</div>
				{:else}
					<input type="hidden" name="spouseName" value="" />
					<input type="hidden" name="spouseContact" value="" />
					<input type="hidden" name="spouseDob" value="" />
				{/if}
			</section>

			<section class="card">
				<h2>3 · Address</h2>
				<label for="presentAddress">Present address {#if suggestions.presentAddress}✨{/if}</label>
				<textarea id="presentAddress" name="presentAddress" rows="2" bind:value={fields.presentAddress} required></textarea>
				{#if errors.has('presentAddress')}<div class="error">{errors.get('presentAddress')}</div>{/if}
				<div class="grid2">
					<div>
						<label for="presentHouseNo">House / flat no.</label>
						<input id="presentHouseNo" name="presentHouseNo" bind:value={fields.presentHouseNo} required />
						{#if errors.has('presentHouseNo')}<div class="error">{errors.get('presentHouseNo')}</div>{/if}
					</div>
					<div>
						<label for="presentPin">PIN code {#if suggestions.presentPin}✨{/if}</label>
						<input id="presentPin" name="presentPin" bind:value={fields.presentPin} required />
						{#if errors.has('presentPin')}<div class="error">{errors.get('presentPin')}</div>{/if}
					</div>
				</div>
				<label style="display:flex;gap:.5rem;align-items:center;font-weight:400;margin-top:.7rem">
					<input
						type="checkbox"
						style="width:auto"
						onchange={(e) => {
							if (e.currentTarget.checked) {
								fields.permanentAddress = fields.presentAddress;
								fields.permanentPin = fields.presentPin;
								fields.permanentHouseNo = fields.presentHouseNo;
							}
						}}
					/>
					Permanent address same as present
				</label>
				<label for="permanentAddress">Permanent address</label>
				<textarea id="permanentAddress" name="permanentAddress" rows="2" bind:value={fields.permanentAddress} required></textarea>
				{#if errors.has('permanentAddress')}<div class="error">{errors.get('permanentAddress')}</div>{/if}
				<div class="grid2">
					<div>
						<label for="permanentHouseNo">House / flat no.</label>
						<input id="permanentHouseNo" name="permanentHouseNo" bind:value={fields.permanentHouseNo} required />
						{#if errors.has('permanentHouseNo')}<div class="error">{errors.get('permanentHouseNo')}</div>{/if}
					</div>
					<div>
						<label for="permanentPin">PIN code</label>
						<input id="permanentPin" name="permanentPin" bind:value={fields.permanentPin} required />
						{#if errors.has('permanentPin')}<div class="error">{errors.get('permanentPin')}</div>{/if}
					</div>
				</div>
			</section>

			<section class="card">
				<h2>4 · Identification</h2>
				<div class="grid2">
					<div>
						<label for="aadhaarNo">
							Aadhaar number {#if suggestions.aadhaarNo}✨{/if}
							{#if data.candidate.hasAadhaar}<span class="muted">(saved: {data.candidate.aadhaarMasked})</span>{/if}
						</label>
						<input
							id="aadhaarNo"
							name="aadhaarNo"
							bind:value={fields.aadhaarNo}
							placeholder={data.candidate.hasAadhaar ? 'Leave blank to keep saved value' : '12 digits'}
							required={!data.candidate.hasAadhaar}
						/>
						{#if errors.has('aadhaarNo')}<div class="error">{errors.get('aadhaarNo')}</div>{/if}
					</div>
					<div>
						<label for="panNo">PAN number {#if suggestions.panNo}✨{/if}</label>
						<input id="panNo" name="panNo" bind:value={fields.panNo} required />
						{#if errors.has('panNo')}<div class="error">{errors.get('panNo')}</div>{/if}
					</div>
					<div>
						<label for="uanNo">UAN number (if available)</label>
						<input id="uanNo" name="uanNo" bind:value={fields.uanNo} />
					</div>
					<div>
						<label for="dlNo">Driving licence no. (if applicable)</label>
						<input id="dlNo" name="dlNo" bind:value={fields.dlNo} />
					</div>
					<div>
						<label for="passportNo">Passport no. (if applicable)</label>
						<input id="passportNo" name="passportNo" bind:value={fields.passportNo} />
					</div>
				</div>
			</section>

			<section class="card">
				<h2>5 · Bank details (salary account)</h2>
				<div class="grid2">
					<div>
						<label for="bankName">Bank name {#if suggestions.bankName}✨{/if}</label>
						<input id="bankName" name="bankName" bind:value={fields.bankName} required />
						{#if errors.has('bankName')}<div class="error">{errors.get('bankName')}</div>{/if}
					</div>
					<div>
						<label for="accountNo">Account number {#if suggestions.accountNo}✨{/if}</label>
						<input id="accountNo" name="accountNo" bind:value={fields.accountNo} required />
						{#if errors.has('accountNo')}<div class="error">{errors.get('accountNo')}</div>{/if}
					</div>
					<div>
						<label for="ifsc">IFSC code {#if suggestions.ifsc}✨{/if}</label>
						<input id="ifsc" name="ifsc" bind:value={fields.ifsc} required />
						{#if errors.has('ifsc')}<div class="error">{errors.get('ifsc')}</div>{/if}
					</div>
					<div>
						<label for="branch">Branch {#if suggestions.branch}✨{/if}</label>
						<input id="branch" name="branch" bind:value={fields.branch} required />
						{#if errors.has('branch')}<div class="error">{errors.get('branch')}</div>{/if}
					</div>
				</div>
			</section>

			<section class="card">
				{#if form?.errors?.length}
					<p class="error">
						Please fix the {form.errors.length} highlighted issue{form.errors.length > 1 ? 's' : ''} above.
					</p>
				{/if}
				{#if form?.saved}<p style="color:#166534">Progress saved ✓</p>{/if}
				<div style="display:flex;gap:.75rem;flex-wrap:wrap">
					<button formaction="?/save" class="secondary" disabled={saving}>Save progress</button>
					<button disabled={saving}>{saving ? 'Submitting…' : 'Submit for HR review'}</button>
				</div>
				<p class="muted" style="margin-top:.6rem">
					You can save and return to this link any time before submitting.
				</p>
			</section>
		</form>
	{/if}
</main>

<style>
	main {
		max-width: 760px;
		margin: 0 auto;
		padding: 1rem;
	}
	.slot {
		display: flex;
		justify-content: space-between;
		gap: 1rem;
		align-items: flex-start;
		padding: 0.75rem 0;
		border-bottom: 1px solid #f1f5f9;
	}
	.slot.missing {
		background: #fef2f2;
		margin: 0 -0.5rem;
		padding: 0.75rem 0.5rem;
		border-radius: 6px;
	}
	.docrow {
		display: flex;
		gap: 0.5rem;
		align-items: center;
		margin-top: 0.3rem;
	}
	.upload-btn {
		flex-shrink: 0;
	}
	button.small {
		padding: 0.15rem 0.5rem;
		font-size: 0.75rem;
	}
</style>
