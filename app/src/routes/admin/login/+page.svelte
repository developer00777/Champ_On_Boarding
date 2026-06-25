<script lang="ts">
	import { enhance } from '$app/forms';

	let { form } = $props();
</script>

<main class="login">
	<div class="login-card">
		<div class="login-hero">
			<div class="hero-dots"></div>
			<img src="/championsgroup.png" alt="Champions Group" style="height:52px;width:auto;object-fit:contain;position:relative" />
			<div style="position:relative">
				<div style="font-size:12.5px;color:rgba(255,255,255,.75)">HR admin sign in</div>
			</div>
		</div>
		<form method="POST" use:enhance class="login-body">
			<label for="email">Email</label>
			<input id="email" name="email" type="email" required autocomplete="username" placeholder="you@championsmail.com" />
			<label for="password" style="margin-top:14px">Password</label>
			<input id="password" name="password" type="password" required autocomplete="current-password" />
			{#if form?.message}<p class="error">{form.message}</p>{/if}
			<button class="btn grad" style="margin-top:20px;width:100%;padding:14px">Sign in</button>
		</form>
	</div>
</main>

<style>
	.login {
		min-height: 100vh;
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 24px;
	}
	.login-card {
		width: 100%;
		max-width: 400px;
		border-radius: 24px;
		overflow: hidden;
		background: #fff;
		box-shadow: 0 24px 60px -12px rgba(11, 7, 24, 0.22);
		border: 1px solid var(--border);
	}
	.login-hero {
		position: relative;
		padding: 28px 28px 26px;
		background: linear-gradient(135deg, #6d08be 0%, #7a2bd0 42%, #e8033a 100%);
		display: flex;
		align-items: center;
		gap: 14px;
		overflow: hidden;
	}
	.hero-dots {
		position: absolute;
		inset: 0;
		background-image: radial-gradient(rgba(255, 255, 255, 0.22) 1.4px, transparent 1.5px);
		background-size: 20px 20px;
		mix-blend-mode: overlay;
		opacity: 0.55;
	}
	.login-body {
		padding: 26px 28px 30px;
	}
</style>
