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
		border-radius: 20px;
		overflow: hidden;
		background: var(--ae-card-bg);
		border: 1px solid var(--ae-card-border);
		box-shadow: var(--ae-card-shadow);
		backdrop-filter: var(--ae-card-blur);
		-webkit-backdrop-filter: var(--ae-card-blur);
	}
	.login-hero {
		position: relative;
		padding: 28px 28px 26px;
		background: linear-gradient(140deg, rgba(146, 120, 255, 0.2) 0%, rgba(22, 25, 40, 0.5) 52%),
			radial-gradient(circle at 85% 10%, rgba(255, 125, 85, 0.22), transparent 55%);
		border-bottom: 1px solid var(--ae-line);
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
