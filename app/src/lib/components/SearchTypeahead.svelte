<!--
  SearchTypeahead — a search box that also shows a live "jump to" dropdown of
  best matches as you type, styled after GlassSelect's glass list so it reads
  as the same component family. The underlying GET form still submits on
  Enter/click (unchanged full-search behavior); this only adds a fast path
  that skips the round trip to the filtered list page.

  Must live inside a `.aegis` scope so the tokens resolve.
-->
<script lang="ts">
	interface Suggestion {
		id: string;
		primary: string;
		secondary?: string;
		href?: string;
	}
	interface Props {
		name: string;
		value?: string;
		placeholder: string;
		ariaLabel: string;
		/** Fetches suggestions for a query; return [] for no matches. */
		fetchSuggestions: (query: string) => Promise<Suggestion[]>;
		/** Called when a suggestion is chosen — return the href to navigate to. */
		onSelect: (s: Suggestion) => string;
		/** href for the clear (×) button, mirroring the other filters' href() helper. */
		clearHref: string;
	}

	let { name, value = $bindable(''), placeholder, ariaLabel, fetchSuggestions, onSelect, clearHref }: Props = $props();

	let open = $state(false);
	let activeIndex = $state(-1);
	let suggestions: Suggestion[] = $state([]);
	let loading = $state(false);
	let root: HTMLDivElement;
	let debounceTimer: ReturnType<typeof setTimeout> | undefined;
	let requestSeq = 0;

	function scheduleFetch(q: string) {
		clearTimeout(debounceTimer);
		if (!q.trim()) {
			suggestions = [];
			open = false;
			return;
		}
		debounceTimer = setTimeout(async () => {
			const seq = ++requestSeq;
			loading = true;
			try {
				const results = await fetchSuggestions(q);
				if (seq !== requestSeq) return; // a newer keystroke already superseded this
				suggestions = results;
				open = results.length > 0;
				activeIndex = -1;
			} finally {
				if (seq === requestSeq) loading = false;
			}
		}, 200);
	}

	function onInput(e: Event) {
		value = (e.target as HTMLInputElement).value;
		scheduleFetch(value);
	}

	function choose(s: Suggestion) {
		open = false;
		window.location.href = onSelect(s);
	}

	function onKeydown(e: KeyboardEvent) {
		if (!open || suggestions.length === 0) return;
		switch (e.key) {
			case 'ArrowDown':
				e.preventDefault();
				activeIndex = Math.min(suggestions.length - 1, activeIndex + 1);
				break;
			case 'ArrowUp':
				e.preventDefault();
				activeIndex = Math.max(0, activeIndex - 1);
				break;
			case 'Enter':
				if (activeIndex >= 0) {
					e.preventDefault();
					choose(suggestions[activeIndex]);
				}
				break;
			case 'Escape':
				open = false;
				break;
		}
	}

	function onWindowPointer(e: PointerEvent) {
		if (open && root && !root.contains(e.target as Node)) open = false;
	}
</script>

<svelte:window onpointerdown={onWindowPointer} />

<div class="st" bind:this={root}>
	<input
		type="search"
		{name}
		{value}
		{placeholder}
		aria-label={ariaLabel}
		autocomplete="off"
		oninput={onInput}
		onkeydown={onKeydown}
		onfocus={() => {
			if (suggestions.length) open = true;
		}}
	/>
	{#if value}
		<a class="qbtn" href={clearHref} aria-label="Clear search" title="Clear search">
			<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M18 6L6 18M6 6l12 12" /></svg>
		</a>
	{/if}
	<button type="submit" class="qbtn" aria-label="Search" title="Search">
		<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><circle cx="11" cy="11" r="7" /><path d="M21 21l-4.3-4.3" /></svg>
	</button>

	{#if open}
		<ul class="st-list" role="listbox" aria-label={ariaLabel}>
			{#each suggestions as s, i (s.id)}
				<li role="option" aria-selected={i === activeIndex} class:active={i === activeIndex} onpointerenter={() => (activeIndex = i)} onpointerdown={(e) => { e.preventDefault(); choose(s); }}>
					<span class="st-primary">{s.primary}</span>
					{#if s.secondary}<span class="st-secondary">{s.secondary}</span>{/if}
				</li>
			{/each}
		</ul>
	{/if}
</div>

<style>
	.st {
		position: relative;
		display: flex;
		align-items: center;
		gap: 2px;
		flex: 1;
	}
	.st input[type='search'] {
		flex: 1;
		min-width: 0;
		background: none;
		border: none;
		outline: none;
		color: var(--ae-text);
		font: inherit;
		font-size: 12.5px;
		font-weight: 500;
		padding: 8px 0;
		appearance: none;
		-webkit-appearance: none;
	}
	.st input::placeholder {
		color: var(--ae-muted);
	}
	.st input::-webkit-search-cancel-button {
		display: none;
	}
	.qbtn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border: none;
		border-radius: 6px;
		background: none;
		color: var(--ae-muted);
		cursor: pointer;
		transition: background 0.12s, color 0.12s;
		flex-shrink: 0;
	}
	.qbtn:hover {
		background: var(--ae-hover);
		color: var(--ae-text);
	}

	.st-list {
		position: absolute;
		z-index: 40;
		top: calc(100% + 6px);
		left: 0;
		right: 0;
		margin: 0;
		padding: 5px;
		list-style: none;
		max-height: 320px;
		overflow-y: auto;
		background: linear-gradient(150deg, rgba(255, 255, 255, 0.12), rgba(255, 255, 255, 0.04)),
			linear-gradient(180deg, rgba(23, 27, 40, 0.9), rgba(18, 21, 31, 0.92));
		border: 1px solid var(--ae-card-border);
		border-radius: 12px;
		box-shadow: var(--ae-card-shadow);
		backdrop-filter: blur(var(--ae-frost)) saturate(175%);
		-webkit-backdrop-filter: blur(var(--ae-frost)) saturate(175%);
		animation: st-in 0.14s var(--ae-spring);
	}
	@keyframes st-in {
		from {
			opacity: 0;
			transform: translateY(-4px);
		}
	}
	.st-list li {
		display: flex;
		flex-direction: column;
		gap: 2px;
		padding: 8px 10px;
		border-radius: 8px;
		cursor: pointer;
		transition: background 0.1s;
	}
	.st-list li.active {
		background: var(--ae-hover);
	}
	.st-primary {
		font-size: 12.5px;
		color: var(--ae-text);
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.st-secondary {
		font-size: 11px;
		color: var(--ae-muted);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
		.st-list {
			background: #1a1e2b;
		}
	}
	:global(.aegis[data-theme='light']) .st-list {
		background: linear-gradient(150deg, rgba(32, 36, 58, 0.04), rgba(32, 36, 58, 0.02)),
			linear-gradient(180deg, rgba(255, 255, 255, 0.92), rgba(255, 255, 255, 0.85));
	}
	@supports not ((backdrop-filter: blur(1px)) or (-webkit-backdrop-filter: blur(1px))) {
		:global(.aegis[data-theme='light']) .st-list {
			background: #ffffff;
		}
	}
</style>
