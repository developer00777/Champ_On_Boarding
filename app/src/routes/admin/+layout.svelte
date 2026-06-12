<script lang="ts">
	let { data, children } = $props();
</script>

<div class="shell">
	{#if data.admin}
		<nav>
			<a href="/admin" class="brand">ChampOnboard</a>
			<span class="muted">{data.admin.email} · {data.admin.role === 'super_admin' ? 'Super admin' : 'HR admin'}</span>
			<span style="flex:1"></span>
			<a href="/admin/export" data-sveltekit-preload-data="off">Export CSV</a>
			<form method="POST" action="/admin/logout">
				<button class="secondary">Log out</button>
			</form>
		</nav>
	{/if}
	<div class="content">
		{@render children()}
	</div>
</div>

<style>
	nav {
		display: flex;
		align-items: center;
		gap: 1rem;
		background: #fff;
		border-bottom: 1px solid #e2e8f0;
		padding: 0.6rem 1.25rem;
		flex-wrap: wrap;
	}
	.brand {
		font-weight: 700;
		color: #1a202c;
		text-decoration: none;
		font-size: 1.05rem;
	}
	.content {
		max-width: 1100px;
		margin: 0 auto;
		padding: 1.25rem 1rem;
	}
</style>
