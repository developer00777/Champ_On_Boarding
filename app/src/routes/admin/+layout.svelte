<script lang="ts">
	import { page } from '$app/stores';
	import '$lib/styles/aegis.css';
	import '$lib/styles/aegis-kit.css';

	let { data, children } = $props();

	/** Nav highlight: `/admin` only matches exactly, or every route would light it
	 *  up; the rest match their subtree so `/admin/candidates/<id>` keeps
	 *  Candidates active. */
	function active(href: string): boolean {
		const path = $page.url.pathname;
		return href === '/admin' ? path === '/admin' : path.startsWith(href);
	}

	// Theme starts from the server-read cookie (so the first paint is already
	// correct, no flash) and flips purely client-side after that — a UI
	// preference doesn't need a round trip through SvelteKit's data layer.
	let theme = $state(data.theme);

	function toggleTheme() {
		theme = theme === 'light' ? 'dark' : 'light';
		document.cookie = `ae-theme=${theme}; path=/; max-age=31536000; samesite=lax`;
	}
</script>

<svelte:head>
	<!-- Admin-only: the candidate portal loads its own per-brand families. -->
	<link
		href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;500;600&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;600&family=Fraunces:ital,opsz,wght@1,9..144,400&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

<div class="shell aegis" class:signed-in={!!data.admin} data-theme={theme}>
	<button
		class="theme-toggle"
		type="button"
		onclick={toggleTheme}
		aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
		title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
	>
		{#if theme === 'light'}
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2.4M12 19.1v2.4M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.9 19.1l1.7-1.7M17.4 6.6l1.7-1.7" /></svg>
		{:else}
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 14.2a8.5 8.5 0 1 1-9.7-11.7 7 7 0 0 0 9.7 11.7Z" /></svg>
		{/if}
	</button>

	{#if data.admin}
		<nav class="rail" aria-label="Admin sections">
			<a href="/admin" class="rail-brand">
				<img src="/championsgroup.png" alt="Champions Group" />
			</a>

			<div class="rail-sec">Workspace</div>
			<a href="/admin" class="navitem" class:on={active('/admin')} aria-current={active('/admin') ? 'page' : undefined}>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 10.5L12 3l9 7.5" /><path d="M5 9.5V21h14V9.5" /></svg>
				Home
			</a>
			<a
				href="/admin/candidates"
				class="navitem"
				class:on={active('/admin/candidates')}
				aria-current={active('/admin/candidates') ? 'page' : undefined}
			>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="9" cy="8" r="3.2" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" /><path d="M16 5.5a3 3 0 0 1 0 5.6" /><path d="M17.5 20a5 5 0 0 0-2-4" /></svg>
				Candidates
			</a>
			<a
				href="/admin/entities"
				class="navitem"
				class:on={active('/admin/entities')}
				aria-current={active('/admin/entities') ? 'page' : undefined}
			>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 21h18" /><path d="M5 21V6l7-3v18" /><path d="M12 9h7v12" /></svg>
				Entities
			</a>
			<a
				href="/admin/analytics"
				class="navitem"
				class:on={active('/admin/analytics')}
				aria-current={active('/admin/analytics') ? 'page' : undefined}
			>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3v18h18" /><path d="M7 15l4-6 4 3 5-8" /></svg>
				Analytics
			</a>
			<a
				href="/admin/inbox"
				class="navitem"
				class:on={active('/admin/inbox')}
				aria-current={active('/admin/inbox') ? 'page' : undefined}
			>
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11L2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" /></svg>
				Inbox
			</a>

			<div class="rail-sec">Admin</div>
			{#if data.admin.role === 'super_admin'}
				<a href="/admin/team" class="navitem" class:on={active('/admin/team')}>
					<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="8" r="3.2" /><path d="M6 20a6 6 0 0 1 12 0" /></svg>
					Team
				</a>
			{/if}
			<a href="/admin/export" class="navitem" data-sveltekit-preload-data="off">
				<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></svg>
				Export CSV
			</a>

			<div class="rail-foot">
				<div class="who">{data.admin.email}</div>
				<div class="role">{data.admin.role === 'super_admin' ? 'Super admin' : 'HR admin'}</div>
				<form method="POST" action="/admin/logout">
					<button class="logout">Log out</button>
				</form>
			</div>
		</nav>
	{/if}

	<div class="content">
		{@render children()}
	</div>
</div>

<style>
	.theme-toggle {
		position: fixed;
		top: 16px;
		right: 20px;
		z-index: 100;
		width: 34px;
		height: 34px;
		display: grid;
		place-items: center;
		border-radius: 999px;
		background: var(--ae-input-bg);
		border: 1px solid var(--ae-line-strong);
		color: var(--ae-text-2);
		cursor: pointer;
		backdrop-filter: blur(12px);
		-webkit-backdrop-filter: blur(12px);
		transition: background 0.15s, color 0.15s, border-color 0.15s;
	}
	.theme-toggle:hover {
		background: var(--ae-hover);
		color: var(--ae-text);
		border-color: var(--ae-ember);
	}
	.theme-toggle:focus-visible {
		outline: 2px solid var(--ae-ember);
		outline-offset: 2px;
	}
	.theme-toggle svg {
		width: 16px;
		height: 16px;
	}

	.shell.signed-in {
		display: grid;
		grid-template-columns: 216px minmax(0, 1fr);
		min-height: 100vh;
	}
	.rail {
		background: var(--ae-rail-bg);
		backdrop-filter: blur(20px) saturate(160%);
		-webkit-backdrop-filter: blur(20px) saturate(160%);
		border-right: 1px solid var(--ae-line);
		padding: 16px 12px;
		display: flex;
		flex-direction: column;
		gap: 2px;
		position: sticky;
		top: 0;
		height: 100vh;
		overflow-y: auto;
	}
	.rail-brand {
		display: block;
		padding: 4px 8px 18px;
	}
	.rail-brand img {
		height: 32px;
		width: auto;
		object-fit: contain;
	}
	.rail-sec {
		font-family: var(--ae-font-mono);
		font-size: 9.5px;
		text-transform: uppercase;
		letter-spacing: 0.14em;
		color: var(--ae-faint);
		font-weight: 600;
		padding: 14px 8px 5px;
	}
	.navitem {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 9px;
		border-radius: 8px;
		color: var(--ae-muted-2);
		text-decoration: none;
		font-size: 13px;
		font-weight: 500;
		transition: background 0.15s, color 0.15s;
	}
	.navitem svg {
		width: 15px;
		height: 15px;
		flex: none;
		opacity: 0.9;
	}
	.navitem:hover {
		background: rgba(255, 255, 255, 0.06);
		color: var(--ae-text);
	}
	.navitem.on {
		background: rgba(255, 125, 85, 0.14);
		color: var(--ae-ember-glow);
	}
	.navitem:focus-visible {
		outline: 2px solid var(--ae-ember);
		outline-offset: 1px;
	}
	.rail-foot {
		margin-top: auto;
		border-top: 1px solid rgba(255, 255, 255, 0.08);
		padding: 12px 8px 0;
		font-size: 11px;
		color: var(--ae-muted);
	}
	.who {
		font-family: var(--ae-font-mono);
		font-size: 10.5px;
		color: var(--ae-muted-2);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.role {
		margin: 3px 0 8px;
	}
	.logout {
		background: none;
		border: none;
		color: var(--ae-muted);
		font: inherit;
		font-family: var(--ae-font-body);
		font-size: 11.5px;
		font-weight: 500;
		padding: 0;
		cursor: pointer;
		text-decoration: underline;
		text-underline-offset: 2px;
	}
	.logout:hover {
		color: var(--ae-text);
	}
	.content {
		padding: 28px 28px 80px;
		width: 100%;
		min-width: 0;
	}

	/* Shared admin chrome. These live here rather than in each page's scoped
	   <style> because Home, Candidates and Entities all render the same table and
	   headings — duplicating them per page is how they silently drift apart. */
	.content :global(.page-title) {
		font-family: var(--ae-font-display);
		font-size: 34px;
		font-weight: 600;
		margin: 0 0 4px;
		letter-spacing: -0.02em;
		color: var(--ae-text);
	}
	/* No inner padding: the header row is a full-bleed tinted band in Aegis,
	   so it must reach the card edge. */
	.content :global(.table-card) {
		background: var(--ae-card-bg);
		border: 1px solid var(--ae-card-border);
		border-radius: var(--ae-card-radius);
		box-shadow: var(--ae-card-shadow);
		backdrop-filter: var(--ae-card-blur);
		-webkit-backdrop-filter: var(--ae-card-blur);
		overflow: hidden;
	}
	.content :global(.thead),
	.content :global(.trow) {
		display: grid;
		grid-template-columns: 1.6fr 1fr 0.8fr 1.2fr 0.7fr auto;
		gap: 12px;
		padding: 14px 18px;
		align-items: center;
	}
	.content :global(.thead) {
		font-family: var(--ae-font-mono);
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--ae-muted);
		background: var(--ae-input-bg);
		border-bottom: 1px solid var(--ae-line-strong);
	}
	.content :global(.trow) {
		border-bottom: 1px solid var(--ae-line-soft);
		text-decoration: none;
		transition: background 0.15s;
	}
	.content :global(.trow:hover) {
		background: var(--ae-hover);
	}
	.content :global(.tcell) {
		font-size: 13px;
		color: var(--ae-text-2);
	}
	.content :global(.review-cta) {
		color: var(--ae-ember-glow);
		font-weight: 500;
		font-size: 13px;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		justify-self: end;
	}
	@media (max-width: 900px) {
		.content :global(.thead) {
			display: none;
		}
		.content :global(.trow) {
			grid-template-columns: 1fr auto;
			row-gap: 4px;
		}
		.content :global(.tcell) {
			display: none;
		}
	}

	@media (max-width: 820px) {
		.shell.signed-in {
			grid-template-columns: 1fr;
		}
		.rail {
			position: static;
			height: auto;
			flex-direction: row;
			align-items: center;
			gap: 4px;
			overflow-x: auto;
			padding: 8px 10px;
		}
		.rail-brand {
			padding: 0 10px 0 4px;
		}
		.rail-brand img {
			height: 24px;
		}
		.rail-sec,
		.rail-foot {
			display: none;
		}
		.navitem {
			white-space: nowrap;
		}
	}
</style>
