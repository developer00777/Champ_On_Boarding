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
	:global(*) {
		box-sizing: border-box;
	}
	:global(body) {
		margin: 0;
		font-family:
			system-ui,
			-apple-system,
			'Segoe UI',
			Roboto,
			sans-serif;
		background: #f4f5f7;
		color: #1a202c;
		line-height: 1.5;
	}
	:global(h1, h2, h3) {
		line-height: 1.25;
	}
	:global(a) {
		color: #2563eb;
	}
	:global(input, select, textarea) {
		width: 100%;
		padding: 0.55rem 0.7rem;
		border: 1px solid #cbd5e1;
		border-radius: 6px;
		font: inherit;
		background: #fff;
	}
	:global(input:focus, select:focus, textarea:focus) {
		outline: 2px solid #93c5fd;
		border-color: #2563eb;
	}
	:global(button, .btn) {
		display: inline-block;
		padding: 0.55rem 1rem;
		border: none;
		border-radius: 6px;
		background: #2563eb;
		color: #fff;
		font: inherit;
		font-weight: 600;
		cursor: pointer;
		text-decoration: none;
	}
	:global(button:disabled) {
		opacity: 0.5;
		cursor: not-allowed;
	}
	:global(button.secondary, .btn.secondary) {
		background: #e2e8f0;
		color: #1a202c;
	}
	:global(button.danger) {
		background: #dc2626;
	}
	:global(.card) {
		background: #fff;
		border: 1px solid #e2e8f0;
		border-radius: 10px;
		padding: 1.25rem;
		margin-bottom: 1rem;
	}
	:global(.muted) {
		color: #64748b;
		font-size: 0.875rem;
	}
	:global(.error) {
		color: #b91c1c;
		font-size: 0.875rem;
	}
	:global(.badge) {
		display: inline-block;
		padding: 0.1rem 0.55rem;
		border-radius: 999px;
		font-size: 0.75rem;
		font-weight: 600;
		background: #e2e8f0;
		color: #334155;
		white-space: nowrap;
	}
	:global(.badge.green) {
		background: #dcfce7;
		color: #166534;
	}
	:global(.badge.amber) {
		background: #fef3c7;
		color: #92400e;
	}
	:global(.badge.red) {
		background: #fee2e2;
		color: #991b1b;
	}
	:global(.badge.blue) {
		background: #dbeafe;
		color: #1e40af;
	}
	:global(table) {
		width: 100%;
		border-collapse: collapse;
	}
	:global(th, td) {
		text-align: left;
		padding: 0.55rem 0.6rem;
		border-bottom: 1px solid #e2e8f0;
		vertical-align: top;
	}
	:global(th) {
		font-size: 0.8rem;
		text-transform: uppercase;
		letter-spacing: 0.03em;
		color: #64748b;
	}
	:global(label) {
		display: block;
		font-size: 0.85rem;
		font-weight: 600;
		margin: 0.65rem 0 0.2rem;
	}
	:global(.grid2) {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0 1rem;
	}
	@media (max-width: 640px) {
		:global(.grid2) {
			grid-template-columns: 1fr;
		}
	}
</style>
