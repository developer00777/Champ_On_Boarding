<!--
  GlassSelect — a dropdown whose open list actually matches the Aegis glass
  theme. Native <select> can't: the browser draws its option popup with the OS,
  so no blur, gradient or hover reaches it, and it renders as a white/OS list.
  This renders the list in the DOM instead, styled with the same tokens as the
  cards (var(--ae-*)).

  Drop-in for the admin <select>s. Two usage shapes are supported:
    • Form field  — pass `name`; a hidden <input> carries the value so the
      surrounding <form> POSTs it exactly as the native select did.
    • Navigation  — pass `onChange`; fires with the new value on selection.

  Must live inside a `.aegis` scope so the tokens resolve.
-->
<script lang="ts">
	interface Option {
		value: string;
		label: string;
	}
	interface Props {
		options: Option[];
		value?: string;
		/** Form field name — emits a hidden input so a parent <form> submits it. */
		name?: string;
		/** Accessible label for the trigger button. */
		ariaLabel?: string;
		id?: string;
		placeholder?: string;
		required?: boolean;
		disabled?: boolean;
		/** Called with the selected value on change (navigation-style selects). */
		onChange?: (value: string) => void;
	}

	let {
		options,
		value = $bindable(''),
		name,
		ariaLabel,
		id,
		placeholder = 'Select…',
		required = false,
		disabled = false,
		onChange
	}: Props = $props();

	let open = $state(false);
	let activeIndex = $state(-1);
	let root: HTMLDivElement;

	const selected = $derived(options.find((o) => o.value === value));
	const label = $derived(selected?.label ?? placeholder);

	function choose(v: string) {
		value = v;
		open = false;
		onChange?.(v);
	}

	function toggle() {
		if (disabled) return;
		open = !open;
		if (open) activeIndex = Math.max(0, options.findIndex((o) => o.value === value));
	}

	function onKeydown(e: KeyboardEvent) {
		if (disabled) return;
		if (!open) {
			if (e.key === 'Enter' || e.key === ' ' || e.key === 'ArrowDown') {
				e.preventDefault();
				toggle();
			}
			return;
		}
		switch (e.key) {
			case 'Escape':
				e.preventDefault();
				open = false;
				break;
			case 'ArrowDown':
				e.preventDefault();
				activeIndex = Math.min(options.length - 1, activeIndex + 1);
				break;
			case 'ArrowUp':
				e.preventDefault();
				activeIndex = Math.max(0, activeIndex - 1);
				break;
			case 'Enter':
			case ' ':
				e.preventDefault();
				if (options[activeIndex]) choose(options[activeIndex].value);
				break;
		}
	}

	// Close when focus or a click leaves the component.
	function onWindowPointer(e: PointerEvent) {
		if (open && root && !root.contains(e.target as Node)) open = false;
	}
</script>

<svelte:window onpointerdown={onWindowPointer} />

<div class="gs" class:open bind:this={root}>
	{#if name}
		<input type="hidden" {name} {value} {required} />
	{/if}
	<button
		type="button"
		class="gs-trigger"
		class:placeholder={!selected}
		{id}
		aria-haspopup="listbox"
		aria-expanded={open}
		aria-label={ariaLabel}
		{disabled}
		onclick={toggle}
		onkeydown={onKeydown}
	>
		<span class="gs-label">{label}</span>
		<svg class="gs-chevron" width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
			<path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
		</svg>
	</button>

	{#if open}
		<ul class="gs-list" role="listbox" aria-label={ariaLabel} tabindex="-1">
			{#each options as opt, i}
				<li
					role="option"
					aria-selected={opt.value === value}
					class:active={i === activeIndex}
					class:selected={opt.value === value}
					onpointerenter={() => (activeIndex = i)}
					onpointerdown={(e) => {
						e.preventDefault();
						choose(opt.value);
					}}
				>
					<span>{opt.label}</span>
					{#if opt.value === value}
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
							<path d="M20 6L9 17l-5-5" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" />
						</svg>
					{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.gs {
		position: relative;
		display: inline-block;
		width: 100%;
	}

	.gs-trigger {
		width: 100%;
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 9px 12px;
		background: var(--ae-input-bg);
		border: 1px solid var(--ae-line-strong);
		border-radius: 8px;
		color: var(--ae-text);
		font: inherit;
		text-align: left;
		cursor: pointer;
		transition: border-color 0.12s, box-shadow 0.12s, background 0.12s;
	}
	.gs-trigger:hover:not(:disabled) {
		background: var(--ae-hover);
	}
	.gs-trigger:focus-visible {
		outline: none;
		border-color: var(--ae-ember);
		box-shadow: 0 0 0 3px rgba(255, 125, 85, 0.25);
	}
	.gs-trigger:disabled {
		opacity: 0.5;
		cursor: not-allowed;
	}
	.gs-trigger.placeholder .gs-label {
		color: var(--ae-muted);
	}
	.gs-label {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.gs-chevron {
		flex-shrink: 0;
		color: var(--ae-muted-2);
		transition: transform 0.18s var(--ae-spring);
	}
	.gs.open .gs-chevron {
		transform: rotate(180deg);
	}

	.gs-list {
		position: absolute;
		z-index: 40;
		top: calc(100% + 6px);
		left: 0;
		right: 0;
		margin: 0;
		padding: 5px;
		list-style: none;
		max-height: 280px;
		overflow-y: auto;
		/* The glass, matching the cards. */
		background: linear-gradient(150deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.05));
		border: 1px solid var(--ae-card-border);
		border-radius: 12px;
		box-shadow: var(--ae-card-shadow);
		backdrop-filter: blur(var(--ae-frost)) saturate(175%);
		-webkit-backdrop-filter: blur(var(--ae-frost)) saturate(175%);
		animation: gs-in 0.14s var(--ae-spring);
	}
	@keyframes gs-in {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
	}

	.gs-list li {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 8px 10px;
		border-radius: 8px;
		color: var(--ae-text-2);
		cursor: pointer;
		transition: background 0.1s, color 0.1s;
	}
	.gs-list li.active {
		background: var(--ae-hover);
		color: var(--ae-text);
	}
	.gs-list li.selected {
		color: var(--ae-ember);
	}
	.gs-list li svg {
		flex-shrink: 0;
		color: var(--ae-ember);
	}

	/* Opaque fallback where backdrop-filter is unsupported (matches aegis.css). */
	@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
		.gs-list {
			background: #1a1e2b;
		}
	}
</style>
