<!--
  DateRange — the From/To calendar beside a list's Today/Week/… buttons.
  Filters stay URL params (see listWindow in shared/ranges.ts), so this only
  builds the link: `hrefFor` is the page's own href(), which keeps every other
  filter as it is. Applying a window replaces the button range; Clear goes
  back to the page's default.
-->
<script lang="ts">
	import { goto } from '$app/navigation';

	interface Props {
		fromDay: string;
		toDay: string;
		/** True when From/To, not a button, decide what the list shows. */
		active: boolean;
		hrefFor: (patch: Record<string, string>) => string;
	}
	let { fromDay, toDay, active, hrefFor }: Props = $props();

	let from = $state('');
	let to = $state('');
	$effect(() => {
		from = fromDay;
		to = toDay;
	});

	function apply(e: SubmitEvent) {
		e.preventDefault();
		if (!from && !to) return;
		goto(hrefFor({ range: '', from, to }), { noScroll: true });
	}
</script>

<form class="dr" class:on={active} onsubmit={apply} aria-label="Custom date range">
	<label>
		<span>From</span>
		<input type="date" bind:value={from} max={to || undefined} />
	</label>
	<label>
		<span>To</span>
		<input type="date" bind:value={to} min={from || undefined} />
	</label>
	<button type="submit" class="dr-b" disabled={!from && !to}>Apply</button>
	{#if active}
		<a class="dr-b" href={hrefFor({ range: '', from: '', to: '' })} data-sveltekit-noscroll>Clear</a>
	{/if}
</form>

<style>
	.dr {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		background: #14171f;
		border: 1px solid var(--ae-line-strong);
		border-radius: 9px;
		padding: 2px 4px 2px 10px;
	}
	.dr.on {
		border-color: rgba(255, 125, 85, 0.5);
		background: rgba(255, 125, 85, 0.08);
	}
	label {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 11.5px;
		color: var(--ae-muted);
	}
	input {
		font: inherit;
		font-size: 12.5px;
		color: var(--ae-text);
		background: transparent;
		border: none;
		padding: 4px 2px;
		/* The native calendar picks its colours from this; without it the
		   picker icon is black on the dark bar. */
		color-scheme: dark;
	}
	:global([data-theme='light']) input {
		color-scheme: light;
	}
	.dr-b {
		font: inherit;
		font-size: 12.5px;
		font-weight: 500;
		color: var(--ae-muted);
		background: none;
		border: none;
		padding: 6px 10px;
		border-radius: 7px;
		cursor: pointer;
		text-decoration: none;
	}
	.dr-b:hover:not(:disabled) {
		color: var(--ae-text);
	}
	.dr.on .dr-b[type='submit'] {
		color: var(--ae-ember-glow);
	}
	.dr-b:disabled {
		opacity: 0.45;
		cursor: default;
	}
	@media (max-width: 640px) {
		.dr {
			flex-wrap: wrap;
		}
	}
</style>
