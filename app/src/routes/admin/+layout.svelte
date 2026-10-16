<script lang="ts">
	import AskChamp from '$lib/components/AskChamp.svelte';
	import { page } from '$app/stores';
	import { afterNavigate } from '$app/navigation';
	import { onMount } from 'svelte';
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

	const ROLE_LABEL: Record<string, string> = {
		super_admin: 'Super admin',
		hr_admin: 'HR admin',
		finance_team: 'Finance team'
	};

	/** Admin records carry an email but no display name, so the shell shows the
	 *  mailbox part, title-cased: "harshil.k@…" → "Harshil K". */
	function displayName(email: string): string {
		return email
			.split('@')[0]
			.split(/[._-]+/)
			.filter(Boolean)
			.map((w) => w[0].toUpperCase() + w.slice(1))
			.join(' ');
	}
	function initials(email: string): string {
		const parts = displayName(email).split(' ');
		return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
	}

	// Fixed to IST like every other date in the app, so the server render and
	// the browser agree on the string and hydration doesn't flip it.
	const today = new Intl.DateTimeFormat('en-GB', {
		weekday: 'short',
		day: 'numeric',
		month: 'short',
		year: 'numeric',
		timeZone: 'Asia/Kolkata'
	}).format(new Date());

	// Theme starts from the server-read cookie (so the first paint is already
	// correct, no flash) and flips purely client-side after that — a UI
	// preference doesn't need a round trip through SvelteKit's data layer.
	// svelte-ignore state_referenced_locally -- deliberate seed-once: this
	// layout stays mounted across every admin navigation, and re-deriving from
	// `data.theme` on each reload would fight the toggle below, which is the
	// actual source of truth for theme after first paint.
	let theme = $state(data.theme);

	function toggleTheme() {
		theme = theme === 'light' ? 'dark' : 'light';
		document.cookie = `ae-theme=${theme}; path=/; max-age=31536000; samesite=lax`;
	}

	// Same seed-once pattern for the sidebar width.
	// svelte-ignore state_referenced_locally
	let collapsed = $state(data.railCollapsed);
	function toggleRail() {
		collapsed = !collapsed;
		document.cookie = `ae-rail=${collapsed ? 'collapsed' : 'expanded'}; path=/; max-age=31536000; samesite=lax`;
	}

	// Below 900px the sidebar is an off-canvas drawer instead.
	let navOpen = $state(false);
	let menuOpen = $state(false);
	afterNavigate(() => {
		navOpen = false;
		menuOpen = false;
	});

	let searchEl: HTMLInputElement | undefined = $state();
	let shortcut = $state('Ctrl K');
	onMount(() => {
		if (/Mac|iPhone|iPad/.test(navigator.platform)) shortcut = '⌘K';
	});

	function onKey(e: KeyboardEvent) {
		if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k' && searchEl) {
			e.preventDefault();
			searchEl.focus();
			searchEl.select();
		} else if (e.key === 'Escape') {
			menuOpen = false;
			navOpen = false;
		}
	}

	function onDocClick(e: MouseEvent) {
		if (menuOpen && !(e.target as HTMLElement).closest('.account')) menuOpen = false;
	}
</script>

<svelte:window onkeydown={onKey} onclick={onDocClick} />

<svelte:head>
	<!-- Admin-only: the candidate portal loads its own per-brand families. -->
	<link
		href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,300..700&family=JetBrains+Mono:wght@400;600&display=swap"
		rel="stylesheet"
	/>
</svelte:head>

{#snippet icon(name: string)}
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
		{#if name === 'home'}
			<path d="M3 10.5 12 3l9 7.5" /><path d="M5 9.5V20a1 1 0 0 0 1 1h4v-6h4v6h4a1 1 0 0 0 1-1V9.5" />
		{:else if name === 'candidates'}
			<circle cx="9" cy="8" r="3.2" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" /><path d="M16 5.5a3 3 0 0 1 0 5.6" /><path d="M17.5 20a5 5 0 0 0-2-4" />
		{:else if name === 'bgv'}
			<path d="M12 2.5l7.5 3.4v5.4c0 4.7-3.2 8.9-7.5 10.2-4.3-1.3-7.5-5.5-7.5-10.2V5.9L12 2.5Z" /><path d="M9 12l2 2 4-4.2" />
		{:else if name === 'offboarding'}
			<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
		{:else if name === 'entities'}
			<path d="M3 21h18" /><path d="M5 21V6l7-3v18" /><path d="M12 9h7v12" /><path d="M8 9h1M8 13h1M8 17h1M15.5 13h1M15.5 17h1" />
		{:else if name === 'analytics'}
			<path d="M3 3v18h18" /><path d="M7 15l4-6 4 3 5-8" />
		{:else if name === 'inbox'}
			<path d="M22 12h-6l-2 3h-4l-2-3H2" /><path d="M5.45 5.11 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.45-6.89A2 2 0 0 0 16.76 4H7.24a2 2 0 0 0-1.79 1.11z" />
		{:else if name === 'team'}
			<circle cx="12" cy="8" r="3.2" /><path d="M6 20a6 6 0 0 1 12 0" />
		{:else if name === 'access'}
			<rect x="4" y="3" width="7" height="6" rx="1.6" /><rect x="13" y="15" width="7" height="6" rx="1.6" /><rect x="4" y="15" width="7" height="6" rx="1.6" /><path d="M7.5 9v3.5h9V15M7.5 12.5V15" />
		{:else if name === 'export'}
			<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" />
		{:else if name === 'search'}
			<circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
		{:else if name === 'sun'}
			<circle cx="12" cy="12" r="4.2" /><path d="M12 2.5v2.4M12 19.1v2.4M4.9 4.9l1.7 1.7M17.4 17.4l1.7 1.7M2.5 12h2.4M19.1 12h2.4M4.9 19.1l1.7-1.7M17.4 6.6l1.7-1.7" />
		{:else if name === 'moon'}
			<path d="M20.5 14.2a8.5 8.5 0 1 1-9.7-11.7 7 7 0 0 0 9.7 11.7Z" />
		{:else if name === 'collapse'}
			<path d="m11 17-5-5 5-5" /><path d="m18 17-5-5 5-5" />
		{:else if name === 'menu'}
			<path d="M4 6h16M4 12h16M4 18h16" />
		{:else if name === 'chevron'}
			<path d="m6 9 6 6 6-6" />
		{:else if name === 'logout'}
			<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" />
		{/if}
	</svg>
{/snippet}

{#snippet navlink(href: string, label: string, name: string)}
	<a
		{href}
		class="navitem"
		class:on={active(href)}
		aria-current={active(href) ? 'page' : undefined}
		title={collapsed ? label : undefined}
	>
		{@render icon(name)}
		<span class="nav-label">{label}</span>
	</a>
{/snippet}

<div class="shell aegis" class:signed-in={!!data.admin} class:collapsed data-theme={theme}>
	{#if !data.admin}
		<button
			class="theme-toggle icon-btn"
			type="button"
			onclick={toggleTheme}
			aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
			title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
		>
			{@render icon(theme === 'light' ? 'sun' : 'moon')}
		</button>
	{/if}

	{#if data.admin}
		{#if navOpen}
			<button class="scrim" type="button" aria-label="Close navigation" onclick={() => (navOpen = false)}></button>
		{/if}
		<nav class="rail" class:open={navOpen} aria-label="Admin sections">
			<div class="rail-top">
				<a href="/admin" class="brand" aria-label="ChampHR home">
					<span class="brand-mark" aria-hidden="true">
						<svg viewBox="0 0 32 32">
							<defs>
								<linearGradient id="bm" x1="0" y1="0" x2="1" y2="1">
									<stop offset="0" stop-color="#9b8cff" />
									<stop offset="1" stop-color="#5a4cf0" />
								</linearGradient>
							</defs>
							<path d="M16 3a13 13 0 1 0 13 13h-6.5A6.5 6.5 0 1 1 16 9.5Z" fill="url(#bm)" />
							<circle cx="23.5" cy="8.5" r="4" fill="#55a6ff" />
						</svg>
					</span>
					<span class="brand-word">ChampHR</span>
				</a>
				<button
					class="collapse-btn"
					type="button"
					onclick={toggleRail}
					aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
					title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
					aria-expanded={!collapsed}
				>
					{@render icon('collapse')}
				</button>
			</div>

			<div class="rail-scroll">
				{@render navlink('/admin', 'Home', 'home')}
				{@render navlink('/admin/candidates', 'Candidates', 'candidates')}
				{#if data.nav.bgv}
					{@render navlink('/admin/bgv', 'BGV verification', 'bgv')}
				{/if}
				{@render navlink('/admin/offboarding', 'Offboarding', 'offboarding')}
				{#if data.nav.entities}
					{@render navlink('/admin/entities', 'Entities', 'entities')}
				{/if}
				{@render navlink('/admin/analytics', 'Analytics', 'analytics')}
				{@render navlink('/admin/inbox', 'Inbox', 'inbox')}

				<div class="rail-sep" role="separator"></div>
				{#if data.nav.team}
					<!-- Seeing the team is given per person; managing it is not. -->
					{@render navlink('/admin/team', 'Team', 'team')}
				{/if}
				{#if data.admin.role === 'super_admin'}
					<!-- The page that decides who may use every other page, so it is the
					     one link that must never appear for anyone but a super admin. -->
					{@render navlink('/admin/access', 'Access & org', 'access')}
				{/if}
				<!-- A file download, not a page: never preloaded, never "active". -->
				<a href="/admin/export" class="navitem" data-sveltekit-preload-data="off" title={collapsed ? 'Export CSV' : undefined}>
					{@render icon('export')}
					<span class="nav-label">Export CSV</span>
				</a>
			</div>

			<svg class="rail-glow" viewBox="0 0 280 200" preserveAspectRatio="xMinYMax meet" aria-hidden="true">
				<defs>
					<linearGradient id="rw-c" x1="0" y1="1" x2="1" y2="0">
						<stop offset="0" stop-color="#8f7bff" stop-opacity="0.2" />
						<stop offset="0.6" stop-color="#d9ccff" />
						<stop offset="1" stop-color="#8f7bff" stop-opacity="0" />
					</linearGradient>
					<linearGradient id="rw-l" x1="0" y1="1" x2="1" y2="0">
						<stop offset="0" stop-color="#6d55f2" stop-opacity="0.15" />
						<stop offset="0.6" stop-color="#9d88ff" />
						<stop offset="1" stop-color="#6d55f2" stop-opacity="0" />
					</linearGradient>
					<linearGradient id="rw-p" x1="0" y1="1" x2="1" y2="0">
						<stop offset="0" stop-color="#f0a6ff" stop-opacity="0" />
						<stop offset="0.6" stop-color="#f0a6ff" />
						<stop offset="1" stop-color="#f0a6ff" stop-opacity="0" />
					</linearGradient>
					<linearGradient id="rw-sheet" x1="0" y1="0" x2="0" y2="1">
						<stop offset="0" stop-color="#7a5cf5" stop-opacity="0.45" />
						<stop offset="1" stop-color="#2c2192" stop-opacity="0" />
					</linearGradient>
					<filter id="rw-blur" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="10" /></filter>
				</defs>
				<path d="M0 150 C 40 128, 74 96, 104 74 C 124 60, 138 56, 146 66 C 158 82, 162 120, 182 152 C 196 176, 214 192, 240 200" transform="translate(4 8)" fill="none" stroke="#5a43e6" stroke-width="14" opacity="0.45" filter="url(#rw-blur)" />
				<path d="M0 150 C 40 128, 74 96, 104 74 C 124 60, 138 56, 146 66 C 158 82, 162 120, 182 152 C 196 176, 214 192, 240 200 L 240 200 L 0 200 Z" fill="url(#rw-sheet)" />
				<path d="M0 150 C 40 128, 74 96, 104 74 C 124 60, 138 56, 146 66 C 158 82, 162 120, 182 152 C 196 176, 214 192, 240 200" transform="translate(0.0 0)" fill="none" stroke="url(#rw-c)" stroke-width="1.5" opacity="1" />
				<path d="M0 150 C 40 128, 74 96, 104 74 C 124 60, 138 56, 146 66 C 158 82, 162 120, 182 152 C 196 176, 214 192, 240 200" transform="translate(2.4000000000000004 6)" fill="none" stroke="url(#rw-l)" stroke-width="1" opacity="0.85" />
				<path d="M0 150 C 40 128, 74 96, 104 74 C 124 60, 138 56, 146 66 C 158 82, 162 120, 182 152 C 196 176, 214 192, 240 200" transform="translate(5.2 13)" fill="none" stroke="url(#rw-l)" stroke-width="0.9" opacity="0.6" />
				<path d="M0 150 C 40 128, 74 96, 104 74 C 124 60, 138 56, 146 66 C 158 82, 162 120, 182 152 C 196 176, 214 192, 240 200" transform="translate(8.8 22)" fill="none" stroke="url(#rw-l)" stroke-width="0.8" opacity="0.4" />
				<path d="M0 150 C 40 128, 74 96, 104 74 C 124 60, 138 56, 146 66 C 158 82, 162 120, 182 152 C 196 176, 214 192, 240 200" transform="translate(-2.8000000000000003 -7)" fill="none" stroke="url(#rw-p)" stroke-width="0.8" opacity="0.7" />
			</svg>

			<div class="account">
				<button
					class="account-btn"
					type="button"
					aria-haspopup="menu"
					aria-expanded={menuOpen}
					onclick={() => (menuOpen = !menuOpen)}
					title={collapsed ? data.admin.email : undefined}
				>
					<span class="avatar">{initials(data.admin.email)}</span>
					<span class="acct-text">
						<span class="acct-name">{displayName(data.admin.email)}</span>
						<span class="acct-role">{ROLE_LABEL[data.admin.role] ?? data.admin.role}</span>
					</span>
					<span class="acct-chev">{@render icon('chevron')}</span>
				</button>
				{#if menuOpen}
					<div class="account-menu" role="menu">
						<div class="menu-email">{data.admin.email}</div>
						<button class="menu-item" type="button" role="menuitem" onclick={toggleTheme}>
							{@render icon(theme === 'light' ? 'moon' : 'sun')}
							{theme === 'light' ? 'Dark mode' : 'Light mode'}
						</button>
						<form method="POST" action="/admin/logout">
							<button class="menu-item danger" role="menuitem">
								{@render icon('logout')}
								Log out
							</button>
						</form>
					</div>
				{/if}
			</div>
		</nav>
	{/if}

	<div class="main">
		{#if data.admin}
			<header class="topbar">
				<button class="icon-btn nav-toggle" type="button" aria-label="Open navigation" onclick={() => (navOpen = true)}>
					{@render icon('menu')}
				</button>
				<!-- Plain GET into the Candidates page's own `q` filter, so this is the
				     same search as there, not a second one. -->
				<form class="search" method="GET" action="/admin/candidates" role="search">
					{@render icon('search')}
					<input
						bind:this={searchEl}
						name="q"
						type="search"
						placeholder="Search candidates by name or employee ID…"
						aria-label="Search candidates"
						autocomplete="off"
					/>
					<kbd>{shortcut}</kbd>
				</form>
				<div class="top-right">
					<button
						class="icon-btn"
						type="button"
						onclick={toggleTheme}
						aria-label={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
						title={theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode'}
					>
						{@render icon(theme === 'light' ? 'sun' : 'moon')}
					</button>
					<a class="icon-btn" href="/admin/inbox" aria-label="Inbox" title="Inbox">{@render icon('inbox')}</a>
					<div class="date-chip"><span class="dot" aria-hidden="true"></span>{today}</div>
				</div>
			</header>
		{/if}

		<div class="content">
			{@render children()}
			<!-- The assistant. Every admin page carries it; what it can see is decided
			     per person by the capability gate on the server, not here. -->
			{#if data.admin}
				<AskChamp admin={data.admin} />
			{/if}
		</div>
	</div>
</div>

<style>
	/* ---------- shell grid ---------- */
	.shell.signed-in {
		--rail-w: 232px;
		display: grid;
		grid-template-columns: var(--rail-w) minmax(0, 1fr);
		min-height: 100vh;
		transition: grid-template-columns 220ms var(--ae-ease);
	}
	.shell.signed-in.collapsed {
		--rail-w: 76px;
	}
	.main {
		min-width: 0;
		display: flex;
		flex-direction: column;
	}

	/* ---------- icon buttons ---------- */
	.icon-btn {
		width: 34px;
		height: 34px;
		display: grid;
		place-items: center;
		flex: none;
		border-radius: 9px;
		background: transparent;
		border: 1px solid transparent;
		color: var(--ae-muted-2);
		cursor: pointer;
		transition:
			background var(--ae-dur) var(--ae-ease),
			color var(--ae-dur) var(--ae-ease);
	}
	.icon-btn:hover {
		background: var(--ae-elevated);
		color: var(--ae-text);
	}
	.icon-btn :global(svg) {
		width: 18px;
		height: 18px;
	}
	.theme-toggle {
		position: fixed;
		top: 16px;
		right: 20px;
		z-index: 100;
		border-color: var(--ae-line-strong);
		background: var(--ae-card-solid);
	}

	/* ---------- sidebar ---------- */
	.rail {
		position: sticky;
		top: 0;
		height: 100vh;
		display: flex;
		flex-direction: column;
		background: var(--ae-rail-bg);
		border-right: 1px solid var(--ae-line);
		overflow: hidden;
		z-index: 40;
	}
	.rail-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 20px 16px 18px 22px;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 10px;
		text-decoration: none;
		min-width: 0;
	}
	.brand-mark {
		width: 28px;
		height: 28px;
		flex: none;
	}
	.brand-mark svg {
		width: 100%;
		height: 100%;
	}
	.brand-word {
		font-size: 18px;
		font-weight: 600;
		letter-spacing: -0.02em;
		color: var(--ae-text);
		white-space: nowrap;
	}
	.collapse-btn {
		width: 28px;
		height: 28px;
		display: grid;
		place-items: center;
		flex: none;
		border-radius: 7px;
		border: 0;
		background: transparent;
		color: var(--ae-muted);
		cursor: pointer;
		transition: all var(--ae-dur) var(--ae-ease);
	}
	.collapse-btn:hover {
		background: var(--ae-elevated);
		color: var(--ae-text);
	}
	.collapse-btn :global(svg) {
		width: 16px;
		height: 16px;
		transition: transform 220ms var(--ae-ease);
	}
	.rail-scroll {
		flex: 1;
		overflow-y: auto;
		overflow-x: hidden;
		padding: 0 18px 12px;
		display: flex;
		flex-direction: column;
		gap: 3px;
		position: relative;
		z-index: 1;
	}
	.rail-sep {
		height: 1px;
		margin: 10px 12px;
		background: var(--ae-line);
	}
	.navitem {
		position: relative;
		display: flex;
		align-items: center;
		gap: 14px;
		min-height: 42px;
		padding: 0 14px;
		border-radius: 9px;
		color: var(--ae-text-2);
		text-decoration: none;
		font-size: 14px;
		font-weight: 400;
		white-space: nowrap;
		transition:
			background var(--ae-dur) var(--ae-ease),
			color var(--ae-dur) var(--ae-ease);
	}
	.navitem :global(svg) {
		width: 19px;
		height: 19px;
		flex: none;
		color: var(--ae-muted-2);
	}
	.navitem:hover {
		background: rgba(148, 163, 220, 0.06);
		color: var(--ae-text);
	}
	.navitem.on {
		background: linear-gradient(90deg, rgba(var(--ae-ember-rgb), 0.24), rgba(var(--ae-ember-rgb), 0.12));
		color: var(--ae-text);
		font-weight: 500;
	}
	.navitem.on :global(svg) {
		color: var(--ae-text);
	}
	.navitem:focus-visible {
		outline: 2px solid var(--ae-ember);
		outline-offset: 1px;
	}

	/* Decorative ribbon at the foot of the rail, as in the reference. */
	.rail-glow {
		position: absolute;
		left: 0;
		bottom: 88px;
		width: 100%;
		height: 190px;
		pointer-events: none;
	}
	:global(.aegis[data-theme='light']) .rail-glow {
		opacity: 0.3;
	}

	/* ---------- account ---------- */
	.account {
		position: relative;
		z-index: 2;
		border-top: 1px solid var(--ae-line);
		padding: 16px 18px 20px;
		background: var(--ae-rail-bg);
	}
	.account-btn {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 6px 8px;
		border-radius: 9px;
		border: 0;
		background: transparent;
		color: var(--ae-text);
		cursor: pointer;
		text-align: left;
		transition: background var(--ae-dur) var(--ae-ease);
	}
	.account-btn:hover,
	.account-btn[aria-expanded='true'] {
		background: var(--ae-elevated);
	}
	.avatar {
		width: 34px;
		height: 34px;
		flex: none;
		border-radius: 50%;
		display: grid;
		place-items: center;
		font-size: 12px;
		font-weight: 500;
		color: #e9e6ff;
		background: linear-gradient(140deg, #3a3290, #241e66);
		border: 1px solid rgba(var(--ae-ember-rgb), 0.4);
	}
	.acct-text {
		display: flex;
		flex-direction: column;
		min-width: 0;
		flex: 1;
		line-height: 1.35;
	}
	.acct-name {
		font-size: 13px;
		font-weight: 500;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.acct-role {
		font-size: 11.5px;
		color: var(--ae-muted);
	}
	.acct-chev :global(svg) {
		display: block;
		width: 15px;
		height: 15px;
		color: var(--ae-muted);
		transition: transform var(--ae-dur) var(--ae-ease);
	}
	.account-btn[aria-expanded='true'] .acct-chev :global(svg) {
		transform: rotate(180deg);
	}
	.account-menu {
		position: absolute;
		left: 18px;
		right: 18px;
		bottom: calc(100% - 8px);
		min-width: 210px;
		padding: 5px;
		border-radius: 10px;
		background: var(--ae-modal-base);
		border: 1px solid var(--ae-line-strong);
		box-shadow: 0 24px 48px -16px rgba(0, 0, 0, 0.7);
		animation: ae-rise 160ms var(--ae-ease);
	}
	.menu-email {
		font-size: 12px;
		color: var(--ae-muted);
		padding: 8px 10px 9px;
		border-bottom: 1px solid var(--ae-line);
		margin-bottom: 4px;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.menu-item {
		width: 100%;
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 10px;
		border: 0;
		border-radius: 7px;
		background: transparent;
		color: var(--ae-text-2);
		font-size: 13px;
		cursor: pointer;
		text-align: left;
	}
	.menu-item :global(svg) {
		width: 16px;
		height: 16px;
	}
	.menu-item:hover {
		background: var(--ae-elevated);
		color: var(--ae-text);
	}
	.menu-item.danger:hover {
		color: var(--ae-crimson);
	}

	/* ---------- collapsed rail ---------- */
	.collapsed .rail-top {
		flex-direction: column;
		padding: 24px 0 18px;
		gap: 14px;
	}
	.collapsed .brand-word,
	.collapsed .nav-label,
	.collapsed .acct-text,
	.collapsed .acct-chev,
	.collapsed .rail-glow {
		display: none;
	}
	.collapsed .collapse-btn :global(svg) {
		transform: rotate(180deg);
	}
	.collapsed .rail-scroll {
		padding: 0 14px 12px;
	}
	.collapsed .navitem {
		justify-content: center;
		padding: 0;
	}
	.collapsed .account {
		padding: 14px 10px;
	}
	.collapsed .account-btn {
		justify-content: center;
		padding: 6px 0;
	}
	.collapsed .account-menu {
		left: 10px;
		right: auto;
	}

	/* ---------- top bar ---------- */
	/* Scrolls with the page rather than sticking: the candidate and exit detail
	   pages pin their own side panels at the top of the viewport, and a sticky
	   bar here would sit on top of them. */
	.topbar {
		position: relative;
		z-index: 30;
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 14px 24px 10px;
	}
	.nav-toggle {
		display: none;
	}
	.search {
		position: relative;
		display: flex;
		align-items: center;
		flex: 0 1 400px;
		min-width: 0;
	}
	.search > :global(svg) {
		position: absolute;
		left: 13px;
		width: 16px;
		height: 16px;
		color: var(--ae-muted-2);
		pointer-events: none;
		z-index: 1;
	}
	.search input {
		height: 38px;
		padding: 0 56px 0 38px;
		border-radius: 10px;
		background: var(--ae-card-solid);
		border-color: var(--ae-line);
		font-size: 12.5px;
	}
	.search input::placeholder {
		color: var(--ae-muted);
	}
	.search input::-webkit-search-cancel-button {
		display: none;
	}
	.search kbd {
		position: absolute;
		right: 9px;
		font-family: var(--ae-font-body);
		font-size: 10.5px;
		font-weight: 500;
		color: var(--ae-muted-2);
		padding: 2px 6px;
		border-radius: 5px;
		background: var(--ae-elevated);
		pointer-events: none;
	}
	.top-right {
		margin-left: auto;
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.date-chip {
		display: flex;
		align-items: center;
		gap: 9px;
		margin-left: 14px;
		font-size: 12.5px;
		color: var(--ae-text-2);
		white-space: nowrap;
	}
	.date-chip .dot {
		width: 9px;
		height: 9px;
		border-radius: 50%;
		background: radial-gradient(circle at 35% 35%, #9ff5e6, var(--ae-verdant) 60%);
		box-shadow: 0 0 0 3px rgba(var(--ae-verdant-rgb), 0.14);
	}

	.content {
		padding: 0 24px 40px;
		width: 100%;
		max-width: 1720px;
		min-width: 0;
	}
	.shell:not(.signed-in) .content {
		max-width: none;
		padding: 28px;
	}

	/* ---------- shared admin chrome ----------
	   These live here rather than in each page's scoped <style> because Home,
	   Candidates and Entities all render the same table and headings —
	   duplicating them per page is how they silently drift apart. */
	.content :global(.page-title) {
		font-family: var(--ae-font-display);
		font-size: 22px;
		font-weight: 600;
		margin: 2px 0 2px;
		letter-spacing: -0.022em;
		color: var(--ae-text);
	}
	.content :global(.table-card) {
		background: var(--ae-card-bg);
		border: 1px solid var(--ae-card-border);
		border-radius: var(--ae-card-radius);
		box-shadow: var(--ae-card-shadow);
		overflow: hidden;
	}
	/* The default column template lives in aegis-kit.css under :where(), at
	   zero specificity, so a page's own scoped template always wins over it
	   rather than depending on which stylesheet happened to load last. */
	.content :global(.thead),
	.content :global(.trow) {
		display: grid;
		gap: 12px;
		padding: 7px 16px;
		align-items: center;
	}
	.content :global(.thead) {
		font-family: var(--ae-font-body);
		font-size: 12px;
		font-weight: 500;
		letter-spacing: 0;
		text-transform: none;
		color: var(--ae-text-2);
		background: transparent;
		border-bottom: 1px solid var(--ae-line);
		padding-top: 9px;
		padding-bottom: 8px;
	}
	.content :global(.trow) {
		border-bottom: 1px solid var(--ae-line-soft);
		text-decoration: none;
		transition: background var(--ae-dur) var(--ae-ease);
	}
	.content :global(.trow:last-child) {
		border-bottom: 0;
	}
	.content :global(.trow:hover) {
		background: var(--ae-hover);
	}
	.content :global(.tcell) {
		font-size: 12.5px;
		color: var(--ae-text-2);
	}
	.content :global(.review-cta) {
		color: var(--ae-ember-glow);
		font-weight: 500;
		font-size: 12.5px;
		display: inline-flex;
		align-items: center;
		gap: 4px;
		justify-self: end;
		transition: gap var(--ae-dur) var(--ae-ease);
	}
	.content :global(.trow:hover .review-cta) {
		gap: 7px;
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

	/* ---------- responsive: drawer navigation ---------- */
	@media (max-width: 900px) {
		.shell.signed-in,
		.shell.signed-in.collapsed {
			grid-template-columns: minmax(0, 1fr);
		}
		.rail {
			position: fixed;
			left: 0;
			top: 0;
			bottom: 0;
			width: 272px;
			height: auto;
			transform: translateX(-100%);
			transition: transform 220ms var(--ae-ease);
			box-shadow: 24px 0 60px -20px rgba(0, 0, 0, 0.7);
			z-index: 60;
		}
		.rail.open {
			transform: none;
		}
		/* The drawer is always shown expanded, whatever the desktop preference. */
		.collapsed .rail .brand-word,
		.collapsed .rail .nav-label,
		.collapsed .rail .acct-chev,
		.collapsed .rail .rail-glow {
			display: revert;
		}
		.collapsed .rail .acct-text {
			display: flex;
		}
		.collapsed .rail .navitem {
			justify-content: flex-start;
			padding: 0 14px;
		}
		.collapsed .rail .rail-top {
			flex-direction: row;
			padding: 26px 22px 24px 26px;
		}
		.collapse-btn {
			display: none;
		}
		.scrim {
			position: fixed;
			inset: 0;
			z-index: 55;
			border: 0;
			background: rgba(2, 5, 14, 0.6);
			backdrop-filter: blur(2px);
		}
		.nav-toggle {
			display: grid;
			border-color: var(--ae-line-strong);
			background: var(--ae-card-solid);
		}
		.topbar {
			padding: 12px 16px;
			gap: 10px;
		}
		.search {
			flex: 1;
		}
		.search kbd,
		.date-chip {
			display: none;
		}
		.content {
			padding: 4px 16px 72px;
		}
	}
	@media (max-width: 480px) {
		.top-right .icon-btn:not(:first-child) {
			display: none;
		}
	}
</style>
