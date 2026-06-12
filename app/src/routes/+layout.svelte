<script lang="ts">
	import favicon from '$lib/assets/favicon.svg';

	let { children } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>ChampOnboard</title>
</svelte:head>

{@render children()}

<style>
	/* ====== LakeB2B design tokens (ChampOnboard design canvas) ====== */
	:global(:root) {
		--purple: #6d08be;
		--gold: #ffb703;
		--red: #e8033a;
		--teal: #0095a0;
		--ink: #0b0718;
		--ink-2: #1e1433;
		--fg-2: #3f355a;
		--smoke: #9a93a8;
		--fog: #d9d4e3;
		--mist: #f3f0f7;
		--paper: #fbfafd;
		--border: #ece7f3;
		--border-2: #e6e1ee;
		--grad-brand: linear-gradient(135deg, #6d08be 0%, #e8033a 100%);
	}
	:global(*) {
		box-sizing: border-box;
	}
	:global(body) {
		margin: 0;
		font-family: 'Montserrat', Arial, sans-serif;
		background: var(--paper);
		color: var(--ink);
		line-height: 1.5;
		-webkit-font-smoothing: antialiased;
	}
	:global(h1, h2, h3) {
		line-height: 1.15;
		letter-spacing: -0.02em;
	}
	:global(a) {
		color: var(--purple);
	}
	:global(input, select, textarea) {
		width: 100%;
		padding: 11px 13px;
		border: 1.5px solid var(--border-2);
		border-radius: 10px;
		font-family: 'Montserrat', Arial, sans-serif;
		font-size: 14px;
		color: var(--ink);
		background: #fff;
		outline: none;
		transition:
			border-color 0.16s,
			box-shadow 0.16s;
	}
	:global(input:focus, select:focus, textarea:focus) {
		border-color: var(--purple);
		box-shadow: 0 0 0 4px rgba(109, 8, 190, 0.16);
	}
	:global(button) {
		font-family: 'Montserrat', Arial, sans-serif;
		cursor: pointer;
	}
	:global(label) {
		display: block;
		font-size: 12.5px;
		font-weight: 600;
		color: var(--fg-2);
		margin: 0 0 6px;
	}

	/* ====== shared components ====== */
	:global(.btn) {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		gap: 8px;
		border: none;
		background: var(--red);
		color: #fff;
		font-weight: 700;
		font-size: 13.5px;
		letter-spacing: 0.02em;
		padding: 12px 22px;
		border-radius: 999px;
		box-shadow: 0 10px 28px -8px rgba(232, 3, 58, 0.55);
		transition:
			transform 0.18s,
			box-shadow 0.18s,
			background 0.18s;
		text-decoration: none;
		white-space: nowrap;
	}
	:global(.btn:hover:not(:disabled)) {
		transform: translateY(-1px);
	}
	:global(.btn:disabled) {
		opacity: 0.45;
		cursor: not-allowed;
		box-shadow: none;
	}
	:global(.btn.ghost) {
		background: #fff;
		color: var(--fg-2);
		border: 1.5px solid var(--border-2);
		box-shadow: none;
	}
	:global(.btn.ghost:hover) {
		border-color: var(--purple);
		color: var(--purple);
	}
	:global(.btn.teal) {
		background: var(--teal);
		box-shadow: 0 10px 28px -8px rgba(0, 149, 160, 0.5);
	}
	:global(.btn.grad) {
		background: var(--grad-brand);
		box-shadow: 0 12px 32px -8px rgba(109, 8, 190, 0.55);
	}
	:global(.btn.small) {
		padding: 6px 13px;
		font-size: 11.5px;
		box-shadow: none;
	}
	:global(.card) {
		background: #fff;
		border: 1px solid var(--border);
		border-radius: 20px;
		padding: 24px;
		box-shadow: 0 4px 12px rgba(11, 7, 24, 0.05);
	}
	:global(.eyebrow) {
		font-weight: 700;
		font-size: 12px;
		letter-spacing: 0.16em;
		text-transform: uppercase;
		color: var(--purple);
	}
	:global(.muted) {
		color: var(--smoke);
		font-size: 13px;
	}
	:global(.error) {
		color: var(--red);
		font-size: 12.5px;
		font-weight: 600;
		margin-top: 5px;
	}
	:global(.pill) {
		display: inline-block;
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.04em;
		padding: 5px 11px;
		border-radius: 999px;
		background: var(--mist);
		color: var(--fg-2);
		white-space: nowrap;
	}
	:global(.pill.purple) {
		background: rgba(109, 8, 190, 0.1);
		color: var(--purple);
	}
	:global(.pill.gold) {
		background: rgba(255, 183, 3, 0.18);
		color: #7a5800;
	}
	:global(.pill.teal) {
		background: rgba(0, 149, 160, 0.12);
		color: #00666e;
	}
	:global(.pill.red) {
		background: #fff1f3;
		color: var(--red);
	}
	:global(.logo-mark) {
		width: 30px;
		height: 30px;
		border-radius: 8px;
		background: var(--grad-brand);
		display: flex;
		align-items: center;
		justify-content: center;
		color: #fff;
		font-weight: 800;
		font-size: 15px;
		flex-shrink: 0;
	}
	:global(.divider) {
		height: 1px;
		background: var(--border);
		border: none;
	}

	@keyframes co_spin {
		to {
			transform: rotate(360deg);
		}
	}
	@keyframes co_pop {
		0% {
			transform: scale(0.6);
			opacity: 0;
		}
		60% {
			transform: scale(1.08);
		}
		100% {
			transform: scale(1);
			opacity: 1;
		}
	}
	@keyframes co_float {
		0%,
		100% {
			transform: translateY(0);
		}
		50% {
			transform: translateY(-8px);
		}
	}
	:global(.co-spin) {
		animation: co_spin 0.8s linear infinite;
	}
	:global(.co-pop) {
		animation: co_pop 0.5s ease;
	}
	:global(.co-float) {
		animation: co_float 2.6s ease-in-out infinite;
	}
</style>
