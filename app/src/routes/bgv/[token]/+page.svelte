<script lang="ts">
	import { enhance } from '$app/forms';

	let { data, form } = $props();

	let exitPending = $state('');
	let submitting = $state(false);
	const done = $derived(data.completed || !!form?.done);
</script>

<svelte:head><title>Employee BGV Form — {data.companyName}</title></svelte:head>

<main class="wrap">
	<header class="head">
		<div class="eyebrow">Background Verification Request</div>
		<h1>Employee BGV Form</h1>
		<p class="lede">
			<strong>{data.companyName}</strong> is verifying the past employment of
			<strong>{data.candidateName}</strong>, who has listed your organisation as a previous employer.
			Please confirm the particulars below with your verification inputs. It takes about 3 minutes,
			and your submission reaches our HR team instantly.
		</p>
	</header>

	{#if done}
		<section class="card center">
			<div class="tick">✓</div>
			<h2>Verification submitted — thank you!</h2>
			<p class="muted">
				Your inputs have been recorded and shared with the HR team at {data.companyName}.
				You can close this page.
			</p>
		</section>
	{:else}
		<form
			method="POST"
			action="?/submit"
			use:enhance={() => {
				submitting = true;
				return async ({ update }) => {
					submitting = false;
					await update({ reset: false });
				};
			}}
		>
			<section class="card">
				<div class="thead">
					<span>Candidate's Particulars</span>
					<span>Your Verification Inputs</span>
				</div>
				{#each data.particulars as row}
					<div class="frow">
						<div class="left">
							<div class="flabel">{row.label}</div>
							<div class="fvalue">{row.declared || '—'}</div>
						</div>
						<div class="right">
							<input name={row.key} placeholder="Confirm / correct" autocomplete="off" />
						</div>
					</div>
				{/each}

				<div class="frow">
					<div class="left"><div class="flabel">Integrity / Disciplinary / Personal issues if any</div></div>
					<div class="right"><input name="integrityIssues" placeholder="None / details" autocomplete="off" /></div>
				</div>

				<div class="frow">
					<div class="left"><div class="flabel">Eligibility for re-hire <span class="req">*</span></div></div>
					<div class="right radios">
						<label><input type="radio" name="rehireEligible" value="yes" required /> Yes</label>
						<label><input type="radio" name="rehireEligible" value="no" /> No</label>
					</div>
				</div>

				<div class="frow">
					<div class="left"><div class="flabel">Any Exit Formalities Pending <span class="req">*</span></div></div>
					<div class="right radios">
						<label><input type="radio" name="exitFormalitiesPending" value="yes" bind:group={exitPending} required /> Yes</label>
						<label><input type="radio" name="exitFormalitiesPending" value="no" bind:group={exitPending} /> No</label>
					</div>
				</div>

				{#if exitPending === 'yes'}
					<div class="frow">
						<div class="left"><div class="flabel">If yes, please give us some details <span class="req">*</span></div></div>
						<div class="right"><textarea name="exitFormalitiesDetails" rows="2" required></textarea></div>
					</div>
				{:else}
					<input type="hidden" name="exitFormalitiesDetails" value="" />
				{/if}

				<div class="frow">
					<div class="left"><div class="flabel">Additional HR Comments</div></div>
					<div class="right"><textarea name="additionalComments" rows="2"></textarea></div>
				</div>

				<div class="frow" style="border-bottom:none">
					<div class="left"><div class="flabel">Verifier's Name & Designation <span class="req">*</span></div></div>
					<div class="right"><input name="verifierName" placeholder="e.g. Priya Sharma, HR Manager" required autocomplete="off" /></div>
				</div>
			</section>

			{#if form?.message}<p class="error">{form.message}</p>{/if}

			<div class="submit-row">
				<button class="btn" disabled={submitting}>
					{submitting ? 'Submitting…' : 'Submit verification'}
				</button>
				<span class="muted small">Submitted securely to {data.companyName} HR. Fields marked * are required.</span>
			</div>
		</form>
	{/if}
</main>

<style>
	:global(body) {
		margin: 0;
		background: #f2f2f7;
		font-family: 'Segoe UI', system-ui, -apple-system, sans-serif;
		color: #1a1a22;
	}
	.wrap {
		max-width: 760px;
		margin: 0 auto;
		padding: 44px 20px 90px;
	}
	.eyebrow {
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: #8a63d2;
		margin-bottom: 8px;
	}
	h1 { margin: 0 0 10px; font-size: 30px; letter-spacing: -0.02em; }
	.lede { margin: 0 0 26px; color: #555; line-height: 1.65; font-size: 14.5px; max-width: 620px; }
	.card {
		background: #fff;
		border: 1px solid #e3e3ea;
		border-radius: 16px;
		box-shadow: 0 10px 34px -18px rgba(20, 12, 50, 0.25);
		padding: 6px 22px;
		overflow: hidden;
	}
	.thead {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
		padding: 14px 0 10px;
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: #888;
		border-bottom: 2px solid #ececf2;
	}
	.frow {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 16px;
		padding: 12px 0;
		border-bottom: 1px solid #f0f0f5;
		align-items: center;
	}
	.flabel { font-size: 12px; color: #777; margin-bottom: 3px; }
	.fvalue { font-size: 14px; font-weight: 600; }
	.req { color: #e8033a; }
	input:not([type='radio']), textarea {
		width: 100%;
		box-sizing: border-box;
		border: 1px solid #d9d9e3;
		border-radius: 9px;
		padding: 9px 11px;
		font: inherit;
		font-size: 13.5px;
		background: #fafaff;
	}
	input:focus, textarea:focus { outline: 2px solid #8a63d2; border-color: transparent; }
	textarea { resize: vertical; }
	.radios { display: flex; gap: 22px; font-size: 14px; }
	.radios label { display: flex; align-items: center; gap: 7px; cursor: pointer; }
	.submit-row {
		display: flex;
		align-items: center;
		gap: 16px;
		margin-top: 22px;
		flex-wrap: wrap;
	}
	.btn {
		background: #6d08be;
		color: #fff;
		border: none;
		border-radius: 10px;
		font: inherit;
		font-size: 15px;
		font-weight: 700;
		padding: 12px 26px;
		cursor: pointer;
	}
	.btn:hover { background: #5a06a0; }
	.btn:disabled { opacity: 0.6; cursor: default; }
	.muted { color: #777; }
	.small { font-size: 12px; }
	.error {
		background: #fdecef;
		border: 1px solid #f5b8c4;
		color: #b3123d;
		border-radius: 10px;
		padding: 10px 14px;
		font-size: 13px;
		margin: 16px 0 0;
	}
	.center { text-align: center; padding: 48px 26px; }
	.tick {
		width: 64px; height: 64px;
		border-radius: 50%;
		background: #0a7c5a;
		color: #fff;
		font-size: 32px;
		line-height: 64px;
		margin: 0 auto 16px;
	}
	.center h2 { margin: 0 0 8px; }
	@media (max-width: 620px) {
		.thead { display: none; }
		.frow { grid-template-columns: 1fr; gap: 8px; }
	}
</style>
