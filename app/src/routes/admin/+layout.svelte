<script lang="ts">
	import { page } from '$app/stores';

	let { data, children } = $props();

	/** Nav highlight: `/admin` only matches exactly, or every route would light it
	 *  up; the rest match their subtree so `/admin/candidates/<id>` keeps
	 *  Candidates active. */
	function active(href: string): boolean {
		const path = $page.url.pathname;
		return href === '/admin' ? path === '/admin' : path.startsWith(href);
	}
</script>

<div class="shell" class:signed-in={!!data.admin}>
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
	.shell.signed-in {
		display: grid;
		grid-template-columns: 216px minmax(0, 1fr);
		min-height: 100vh;
	}
	.rail {
		background: var(--ink);
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
		font-size: 10.5px;
		text-transform: uppercase;
		letter-spacing: 0.09em;
		color: #6c6480;
		font-weight: 700;
		padding: 14px 8px 5px;
	}
	.navitem {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 9px;
		border-radius: 8px;
		color: #b9b2c7;
		text-decoration: none;
		font-size: 13.5px;
		font-weight: 600;
		transition: background 0.13s, color 0.13s;
	}
	.navitem svg {
		width: 15px;
		height: 15px;
		flex: none;
		opacity: 0.9;
	}
	.navitem:hover {
		background: rgba(255, 255, 255, 0.06);
		color: #fff;
	}
	.navitem.on {
		background: var(--purple);
		color: #fff;
	}
	.navitem:focus-visible {
		outline: 2px solid var(--gold);
		outline-offset: 1px;
	}
	.rail-foot {
		margin-top: auto;
		border-top: 1px solid rgba(255, 255, 255, 0.09);
		padding: 10px 8px 0;
		font-size: 11.5px;
		color: #6c6480;
	}
	.who {
		color: #b9b2c7;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.role {
		margin-bottom: 6px;
	}
	.logout {
		background: none;
		border: none;
		color: #6c6480;
		font: inherit;
		font-size: 11.5px;
		font-weight: 650;
		padding: 0;
		cursor: pointer;
		text-decoration: underline;
	}
	.logout:hover {
		color: #fff;
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
		font-size: 26px;
		font-weight: 800;
		margin: 0 0 4px;
		letter-spacing: -0.02em;
	}
	.content :global(.table-card) {
		background: #fff;
		border: 1px solid var(--border);
		border-radius: 20px;
		padding: 8px 8px 6px;
		box-shadow: 0 4px 12px rgba(11, 7, 24, 0.05);
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
		font-size: 11px;
		font-weight: 700;
		letter-spacing: 0.08em;
		text-transform: uppercase;
		color: var(--smoke);
	}
	.content :global(.trow) {
		border-top: 1px solid var(--mist);
		text-decoration: none;
		border-radius: 12px;
		transition: background 0.15s;
	}
	.content :global(.trow:hover) {
		background: #faf8fd;
	}
	.content :global(.tcell) {
		font-size: 13px;
		color: var(--fg-2);
	}
	.content :global(.review-cta) {
		color: var(--purple);
		font-weight: 700;
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
