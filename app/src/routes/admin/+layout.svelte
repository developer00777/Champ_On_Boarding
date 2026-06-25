<script lang="ts">
	let { data, children } = $props();
</script>

<div>
	{#if data.admin}
		<nav class="topnav">
			<div class="topnav-inner">
				<a href="/admin" class="brand">
					<img src="/championsgroup.png" alt="Champions Group" style="height:36px;width:auto;object-fit:contain" />
				</a>
				<span class="role-tag">{data.admin.role === 'super_admin' ? 'Super admin' : 'HR Admin'}</span>
				<div style="flex:1"></div>
				<span class="who">{data.admin.email} · {data.admin.role === 'super_admin' ? 'Super admin' : 'HR admin'}</span>
				{#if data.admin.role === 'super_admin'}
					<a href="/admin/team" class="btn ghost small">Team</a>
				{/if}
				<a href="/admin/export" class="btn ghost small" data-sveltekit-preload-data="off">Export CSV</a>
				<form method="POST" action="/admin/logout" style="display:contents">
					<button class="btn ghost small">Log out</button>
				</form>
			</div>
		</nav>
	{/if}
	<div class="content">
		{@render children()}
	</div>
</div>

<style>
	.topnav {
		background: #fff;
		border-bottom: 1px solid var(--border);
	}
	.topnav-inner {
		max-width: 1180px;
		margin: 0 auto;
		padding: 14px 24px;
		display: flex;
		align-items: center;
		gap: 12px;
		flex-wrap: wrap;
	}
	.brand {
		display: flex;
		align-items: center;
		gap: 10px;
		text-decoration: none;
	}
	.role-tag {
		font-size: 12px;
		color: var(--smoke);
		font-weight: 600;
		margin-left: 4px;
	}
	.who {
		font-size: 12.5px;
		color: var(--smoke);
	}
	.content {
		max-width: 1180px;
		margin: 0 auto;
		padding: 28px 24px 80px;
	}
	@media (max-width: 640px) {
		.who {
			display: none;
		}
	}
</style>
