<script lang="ts">
	import { enhance } from '$app/forms';

	let { form } = $props();
</script>

<main>
	<div class="card" style="max-width:380px;margin:10vh auto">
		<h1>ChampOnboard</h1>
		<p class="muted">HR admin sign in</p>
		<form method="POST" use:enhance>
			<label for="email">Email</label>
			<input id="email" name="email" type="email" required autocomplete="username" />
			<label for="password">Password</label>
			<input id="password" name="password" type="password" required autocomplete="current-password" />
			{#if form?.message}<p class="error">{form.message}</p>{/if}
			<button style="margin-top:1rem;width:100%">Sign in</button>
		</form>
	</div>
</main>
