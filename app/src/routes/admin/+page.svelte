<script lang="ts">
	import { enhance } from '$app/forms';
	import { TRACK_LABELS, type Track } from '$lib/shared/matrix';
	import GlassSelect from '$lib/components/GlassSelect.svelte';

	let { data, form } = $props();

	// GlassSelect is controlled, so the invite form needs its values in state.
	// Seed to the first option, matching how the native <select> defaulted.
	// Deliberate seed-once: the user picks a different track/company after
	// this, and re-deriving from `data` on every reload (e.g. after
	// generateLink's own use:enhance refresh) would reset their selection.
	// svelte-ignore state_referenced_locally
	let inviteTrack = $state<string>(data.tracks[0] ?? '');
	// svelte-ignore state_referenced_locally
	let inviteCompany = $state<string>(data.companies[0]?.id ?? '');

	const statusMeta: Record<string, { label: string; cls: string }> = {
		created: { label: 'Link sent', cls: '' },
		opened: { label: 'Opened', cls: 'purple' },
		in_progress: { label: 'In progress', cls: 'purple' },
		submitted: { label: 'Awaiting review', cls: 'gold' },
		changes_requested: { label: 'Changes requested', cls: 'red' },
		approved: { label: 'Approved', cls: 'teal' },
		complete: { label: 'Complete', cls: 'teal' },
		revoked: { label: 'Revoked', cls: 'red' }
	};

	// Greeting in IST, the same zone as every other date in the app, so the
	// server render and the browser agree.
	const hour = Number(
		new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hour12: false, timeZone: 'Asia/Kolkata' }).format(new Date())
	);
	const greeting = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
	const firstName = $derived.by(() => {
		const local = data.admin?.email.split('@')[0].split(/[._-]+/)[0] ?? '';
		return local ? local[0].toUpperCase() + local.slice(1) : '';
	});

	/** Headline cards. Every number is one the server already counts; a card
	 *  links only where the Candidates filter can reproduce it exactly. */
	const metrics = $derived([
		{
			label: 'Total candidates',
			value: data.stats.total,
			note: 'All onboarding records',
			icon: 'users',
			tone: 'indigo',
			href: '/admin/candidates'
		},
		{
			label: 'Onboarding in progress',
			value: data.stats.inProgress,
			note: 'Link sent to form filled',
			icon: 'progress',
			tone: 'blue',
			href: null
		},
		{
			label: 'Awaiting review',
			value: data.stats.awaitingReview,
			note: 'Needs HR sign-off',
			icon: 'review',
			tone: 'rose',
			href: '/admin/candidates?status=submitted'
		},
		{
			label: 'Offer yet to be released',
			value: data.stats.offerPending,
			note: 'Approved, letter unsent',
			icon: 'offer',
			tone: 'teal',
			href: data.pendingOffers.length > 0 ? '#offers-to-send' : null
		}
	]);

	/** Pipeline stages, in the order a candidate moves through them. These are
	 *  the server's own counts: "Approved" is approved + complete and "Offer
	 *  sent" is counted off the letter, exactly as on the old stat strip. */
	const stages = $derived([
		{ label: 'In progress', value: data.stats.inProgress, href: null },
		{ label: 'Awaiting review', value: data.stats.awaitingReview, href: '/admin/candidates?status=submitted' },
		{ label: 'Approved', value: data.stats.approved, href: null },
		{ label: 'Offer sent', value: data.stats.offerSent, href: null },
		{ label: 'Completed', value: data.stats.completed, href: '/admin/candidates?status=complete' }
	]);
	/** The stage holding the most people is where the queue is. */
	const busiest = $derived(
		stages.reduce((best, s, i) => (s.value > stages[best].value ? i : best), 0)
	);

	function initials(name: string): string {
		const parts = name.replace(/@.*/, '').split(/[\s._-]+/).filter(Boolean);
		return ((parts[0]?.[0] ?? '') + (parts[1]?.[0] ?? '')).toUpperCase() || '?';
	}
	/** A stable hue per person so avatars are told apart without photos.
	 *  Hashed off the name, not the id: ObjectIds made close together share
	 *  most of their characters and would all land on the same hue. */
	function hue(key: string): number {
		let h = 7;
		for (const ch of key) h = (h * 33 + ch.charCodeAt(0)) >>> 0;
		return h % 360;
	}

	function copyLink(link: string) {
		navigator.clipboard.writeText(link);
	}

	function startNewHire(e: MouseEvent) {
		e.preventDefault();
		document.getElementById('new-hire')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
		document.getElementById('candidateName')?.focus({ preventScroll: true });
	}

	// Show the "Joining today" popup once per calendar day per browser tab
	// session — re-showing it on every nav within the same day would just be
	// noise once HR has already seen and dismissed it.
	let showJoiningPopup = $state(false);
	$effect(() => {
		if (data.joiningToday.length === 0) return;
		const today = new Date().toLocaleDateString('en-GB');
		const dismissedKey = 'joiningTodayDismissed';
		if (sessionStorage.getItem(dismissedKey) === today) return;
		showJoiningPopup = true;
	});

	function dismissJoiningPopup() {
		showJoiningPopup = false;
		sessionStorage.setItem('joiningTodayDismissed', new Date().toLocaleDateString('en-GB'));
	}
</script>

{#snippet glyph(name: string)}
	<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
		{#if name === 'users'}
			<circle cx="9" cy="8" r="3.2" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" /><path d="M16 5.5a3 3 0 0 1 0 5.6" /><path d="M17.5 20a5 5 0 0 0-2-4" />
		{:else if name === 'progress'}
			<circle cx="12" cy="8" r="3.4" /><path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
		{:else if name === 'review'}
			<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h4" />
		{:else if name === 'offer'}
			<rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" />
		{:else if name === 'arrow'}
			<path d="M5 12h14" /><path d="m13 6 6 6-6 6" />
		{:else if name === 'plus'}
			<circle cx="9" cy="8" r="3.2" /><path d="M3.5 20a5.5 5.5 0 0 1 11 0" /><path d="M19 8v6M16 11h6" />
		{:else if name === 'exit'}
			<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" />
		{:else if name === 'list'}
			<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8Z" /><path d="M14 3v5h5" /><path d="M9 13h6M9 17h6" />
		{:else if name === 'download'}
			<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" />
		{:else if name === 'calendar'}
			<rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" />
		{:else if name === 'link'}
			<path d="M10 13a5 5 0 0 0 7.5.5l3-3a5 5 0 0 0-7-7l-1.7 1.7" /><path d="M14 11a5 5 0 0 0-7.5-.5l-3 3a5 5 0 0 0 7 7l1.7-1.7" />
		{/if}
	</svg>
{/snippet}

{#snippet person(c: { id: string; fullName: string | null; email: string }, size = 24)}
	<span class="av" style:--h={hue(c.fullName || c.email)} style:--s="{size}px" aria-hidden="true">{initials(c.fullName || c.email)}</span>
{/snippet}

{#if showJoiningPopup}
	<div
		class="popup-overlay"
		role="button"
		tabindex="-1"
		onclick={dismissJoiningPopup}
		onkeydown={(e) => e.key === 'Escape' && dismissJoiningPopup()}
	>
		<!-- svelte-ignore a11y_click_events_have_key_events -- click-catcher only, stops the overlay's dismiss-on-click from firing; not itself interactive -->
		<div
			class="popup-card"
			role="dialog"
			aria-modal="true"
			aria-labelledby="joining-today-title"
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
		>
			<div class="popup-badge">🎉 Joining today</div>
			<h2 id="joining-today-title">
				{data.joiningToday.length === 1 ? '1 candidate joins' : `${data.joiningToday.length} candidates join`} today
			</h2>
			<div class="popup-list">
				{#each data.joiningToday as c (c.id)}
					<a class="popup-row" href="/admin/candidates/{c.id}">
						<div class="who-cell">
							{@render person(c, 32)}
							<div class="who-text">
								<div class="who-name">{c.fullName || c.email}</div>
								<div class="who-sub">{c.company} · {TRACK_LABELS[c.track as Track]}</div>
							</div>
						</div>
						<span class="pill teal">Joining today</span>
					</a>
				{/each}
			</div>
			<button class="btn" style="width:100%;margin-top:6px" onclick={dismissJoiningPopup}>Got it</button>
		</div>
	</div>
{/if}

<h1 class="sr-only">Home</h1>

<div class="dash">
	<div class="dash-main">
		<section class="overview" aria-labelledby="hero-title">
			<div class="hero-copy">
				<h2 id="hero-title">{greeting}{firstName ? `, ${firstName}` : ''}</h2>
				<p>Here's where onboarding stands today.</p>
			</div>

			<div class="metrics">
				{#each metrics as m (m.label)}
					<svelte:element
						this={m.href ? 'a' : 'div'}
						href={m.href ?? undefined}
						class="metric tone-{m.tone}"
						class:link={!!m.href}
					>
						<div class="metric-top">
							<span class="metric-ico">{@render glyph(m.icon)}</span>
							{#if m.href}<span class="metric-go">{@render glyph('arrow')}</span>{/if}
						</div>
						<div class="metric-label">{m.label}</div>
						<div class="metric-value">{m.value}</div>
						<div class="metric-note">{m.note}</div>
					</svelte:element>
				{/each}
			</div>
		</section>

		<section class="panel" aria-labelledby="pipe-title">
			<header class="panel-head">
				<div>
					<h2 id="pipe-title">Onboarding pipeline</h2>
					<p>Where every candidate stands right now</p>
				</div>
				<a class="panel-link" href="/admin/candidates">View all {@render glyph('arrow')}</a>
			</header>
			<ol class="pipeline">
				{#each stages as s, i (s.label)}
					<li class="stage" class:lit={s.value > 0} class:busiest={i === busiest && s.value > 0} class:done={i === stages.length - 1}>
						<svelte:element this={s.href ? 'a' : 'div'} href={s.href ?? undefined} class="stage-inner">
							<span class="node" aria-hidden="true"></span>
							<span class="stage-label">{s.label}</span>
							<span class="stage-value">{s.value}</span>
						</svelte:element>
					</li>
				{/each}
			</ol>
		</section>

		<section class="panel flush" aria-labelledby="recent-title">
			<header class="panel-head">
				<div>
					<h2 id="recent-title">Recent candidates</h2>
					<p>Latest onboarding links</p>
				</div>
				<a class="panel-link" href="/admin/candidates">See all {data.total} {@render glyph('arrow')}</a>
			</header>
			{#if data.recent.length === 0}
				<div class="empty">
					<span class="empty-ico">{@render glyph('users')}</span>
					<div>
						<div class="empty-title">No candidates yet</div>
						<div class="empty-sub">Generate the first onboarding link below to get started.</div>
					</div>
				</div>
			{:else}
				<div class="thead recent-grid">
					<div>Name</div>
					<div>Company</div>
					<div>Track</div>
					<div>Status</div>
					<div></div>
				</div>
				{#each data.recent as c (c.id)}
					<a class="trow recent-grid" href="/admin/candidates/{c.id}" title={c.email}>
						<div class="who-cell">
							{@render person(c)}
							<span class="who-name">{c.fullName || c.email}</span>
						</div>
						<div class="tcell clip" title={c.company}>{c.company}</div>
						<div class="tcell">{TRACK_LABELS[c.track as Track]}</div>
						<div><span class="pill {statusMeta[c.status]?.cls}">{statusMeta[c.status]?.label ?? c.status}</span></div>
						<div class="review-cta">
							Review
							<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 6l6 6-6 6" /></svg>
						</div>
					</a>
				{/each}
			{/if}
		</section>

		<section class="panel newhire" id="new-hire" aria-labelledby="gen-title">
			<div class="newhire-head">
				<svg class="newhire-art" viewBox="0 0 120 84" aria-hidden="true">
					<defs>
						<linearGradient id="nh-card" x1="0" y1="0" x2="1" y2="1">
							<stop offset="0" stop-color="#2b2f78" />
							<stop offset="1" stop-color="#1a1d4f" />
						</linearGradient>
					</defs>
					<rect x="6" y="22" width="22" height="40" rx="5" fill="#141842" opacity="0.8" />
					<rect x="24" y="8" width="72" height="68" rx="9" fill="url(#nh-card)" stroke="#4b47b8" stroke-opacity="0.6" />
					<circle cx="42" cy="28" r="8" fill="#6366f1" />
					<circle cx="42" cy="25.5" r="2.6" fill="#e6e3ff" />
					<path d="M37 32.5a5 5 0 0 1 10 0" fill="#e6e3ff" />
					<rect x="34" y="44" width="48" height="5" rx="2.5" fill="#5f5ad6" opacity="0.85" />
					<rect x="34" y="54" width="36" height="5" rx="2.5" fill="#3b3a8f" />
					<circle cx="96" cy="58" r="11" fill="#55a6ff" />
					<path d="m91 58 3.5 3.5 6.5-7" fill="none" stroke="#fff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
				</svg>
				<div>
					<h2 id="gen-title">Generate onboarding link</h2>
					<p>One link starts a new hire — the candidate uploads documents and fills in their details from it.</p>
				</div>
			</div>
			<form method="POST" action="?/generateLink" use:enhance>
				<div class="gen-grid">
					<div>
						<label for="candidateName">Candidate name</label>
						<input id="candidateName" name="candidateName" placeholder="As on offer letter" />
					</div>
					<div>
						<label for="email">Candidate email</label>
						<input id="email" name="email" type="email" placeholder="name@email.com" required />
					</div>
					<div>
						<label for="candidateMobile">Mobile (WhatsApp)</label>
						<input id="candidateMobile" name="candidateMobile" type="tel" placeholder="10-digit mobile" />
					</div>
					<div>
						<label for="track">Track</label>
						<GlassSelect
							id="track"
							name="track"
							ariaLabel="Track"
							required
							bind:value={inviteTrack}
							options={data.tracks.map((t: Track) => ({ value: t, label: TRACK_LABELS[t] }))}
						/>
					</div>
					<div>
						<label for="companyId">Company</label>
						<GlassSelect
							id="companyId"
							name="companyId"
							ariaLabel="Company"
							required
							bind:value={inviteCompany}
							options={data.companies.map((c: { id: string; name: string }) => ({ value: c.id, label: c.name }))}
						/>
					</div>
					<button class="btn">Generate &amp; email {@render glyph('arrow')}</button>
				</div>
			</form>
			{#if form?.message}<p class="error">{form.message}</p>{/if}
			{#if form?.link}
				<div class="linkbox">
					<div style="font-size:12.5px;color:var(--ae-text-2);margin-bottom:9px">
						Link created and emailed to <strong style="color:var(--ae-text);font-weight:500">{form.email}</strong>
					</div>
					<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
						<code class="linkcode">{form.link}</code>
						<button type="button" class="teal-pill-btn" onclick={() => copyLink(form.link)}>Copy link</button>
						<a class="teal-pill-btn" href={form.waUrl} target="_blank" rel="noopener">Share on WhatsApp</a>
					</div>
				</div>
			{/if}
		</section>
	</div>

	<aside class="dash-rail" aria-label="Shortcuts and lists">
		<section class="panel qa">
			<header class="panel-head tight">
				<div>
					<h2>Quick actions</h2>
					<p>Common HR tasks, one click away.</p>
				</div>
			</header>
			<div class="qa-grid">
				<a class="qa-item" href="#new-hire" onclick={startNewHire}>
					<span class="qa-ico">{@render glyph('plus')}</span>
					<span>Add new hire</span>
					<span class="qa-go">{@render glyph('arrow')}</span>
				</a>
				<a class="qa-item" href="/admin/offboarding">
					<span class="qa-ico">{@render glyph('exit')}</span>
					<span>Offboarding</span>
					<span class="qa-go">{@render glyph('arrow')}</span>
				</a>
				<a class="qa-item" href="/admin/candidates">
					<span class="qa-ico">{@render glyph('list')}</span>
					<span>All candidates</span>
					<span class="qa-go">{@render glyph('arrow')}</span>
				</a>
				<a class="qa-item" href="/admin/export" data-sveltekit-preload-data="off">
					<span class="qa-ico">{@render glyph('download')}</span>
					<span>Export CSV</span>
					<span class="qa-go">{@render glyph('arrow')}</span>
				</a>
			</div>
		</section>

		<section class="panel" aria-labelledby="today-title">
			<header class="panel-head tight">
				<div>
					<h2 id="today-title">Joining today</h2>
				</div>
				{#if data.joiningToday.length > 0}
					<span class="count teal">{data.joiningToday.length} starting</span>
				{/if}
			</header>
			{#if data.joiningToday.length === 0}
				<div class="empty compact">
					<span class="empty-ico">{@render glyph('calendar')}</span>
					<div class="empty-sub">Nobody is due to join today.</div>
				</div>
			{:else}
				<ul class="list">
					{#each data.joiningToday as c (c.id)}
						<li>
							<a class="list-row" href="/admin/candidates/{c.id}">
								{@render person(c, 34)}
								<div class="who-text">
									<div class="who-name">{c.fullName || c.email}</div>
									<div class="who-sub">{c.company} · {TRACK_LABELS[c.track as Track]}</div>
								</div>
								<span class="tag blue">Today</span>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</section>

		<section class="panel" id="offers-to-send" aria-labelledby="offers-title">
			<header class="panel-head tight">
				<div>
					<h2 id="offers-title">Offer letter yet to be sent</h2>
				</div>
				{#if data.pendingOffers.length > 0}
					<span class="count">{data.pendingOffers.length} waiting</span>
				{/if}
			</header>
			{#if data.pendingOffers.length === 0}
				<div class="empty compact">
					<span class="empty-ico">{@render glyph('offer')}</span>
					<div class="empty-sub">Every approved candidate has their offer.</div>
				</div>
			{:else}
				<ul class="list scroll">
					{#each data.pendingOffers as c (c.id)}
						<li>
							<a class="list-row" href="/admin/candidates/{c.id}">
								{@render person(c, 34)}
								<div class="who-text">
									<div class="who-name">{c.fullName || c.email}</div>
									<div class="who-sub">{c.company} · {TRACK_LABELS[c.track as Track]}</div>
								</div>
								<span class="tag amber">{data.isApprover ? 'Send offer' : 'Review'}</span>
							</a>
						</li>
					{/each}
				</ul>
			{/if}
		</section>
	</aside>
</div>

<style>
	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		overflow: hidden;
		clip: rect(0 0 0 0);
		white-space: nowrap;
	}

	/* ---------- layout ---------- */
	.dash {
		display: grid;
		grid-template-columns: minmax(0, 1fr) minmax(300px, 370px);
		gap: 22px;
		align-items: stretch;
	}
	.dash-main,
	.dash-rail {
		display: flex;
		flex-direction: column;
		gap: 22px;
		min-width: 0;
	}
	/* Both columns end on the same line: the last card in each takes up the
	   slack instead of leaving the shorter column hanging. */
	.dash-main > :last-child,
	.dash-rail > :last-child {
		flex: 1 0 auto;
	}

	/* ---------- panels ---------- */
	.panel {
		position: relative;
		background: var(--ae-card-bg);
		border: 1px solid var(--ae-card-border);
		border-radius: 14px;
		box-shadow: var(--ae-card-shadow);
		padding: 22px 24px;
		overflow: hidden;
	}
	.panel.flush {
		padding: 0;
	}
	.panel.flush .panel-head {
		padding: 22px 24px 14px;
		margin: 0;
	}
	/* The form's dropdowns must be able to open past the card edge. */
	.panel.newhire {
		overflow: visible;
	}
	.panel-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 22px;
	}
	.panel-head.tight {
		margin-bottom: 16px;
	}
	.panel-head h2,
	.newhire-head h2 {
		font-size: 16.5px;
		font-weight: 600;
		margin: 0 0 5px;
		letter-spacing: -0.01em;
	}
	.panel-head p,
	.newhire-head p {
		margin: 0;
		font-size: 13px;
		color: var(--ae-muted-2);
	}
	.panel-link {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 13px;
		color: var(--ae-azure);
		text-decoration: none;
		white-space: nowrap;
		padding-top: 2px;
	}
	.panel-link :global(svg) {
		width: 13px;
		height: 13px;
		transition: transform var(--ae-dur) var(--ae-ease);
	}
	.panel-link:hover :global(svg) {
		transform: translateX(2px);
	}

	/* ---------- overview: hero + metrics ---------- */
	.overview {
		position: relative;
		padding: 34px 0 0;
		isolation: isolate;
	}
	/* A dark indigo panel with a soft orange glow, fading out behind the metric
	   cards. No wave artwork: the brand colour carries it. */
	.overview::before {
		content: '';
		position: absolute;
		inset: 0 0 92px 0;
		border-radius: 16px;
		background:
			radial-gradient(560px 240px at 100% 0%, rgba(251, 146, 60, 0.2), transparent 70%),
			linear-gradient(115deg, #0b1230 0%, #0e1640 55%, #121a4a 100%);
		border: 1px solid #1c2550;
		z-index: -2;
		/* Fades out behind the metric cards instead of ending on a hard edge. */
		-webkit-mask-image: linear-gradient(180deg, #000 72%, transparent 100%);
		mask-image: linear-gradient(180deg, #000 72%, transparent 100%);
	}
	/* Light mode: the banner is a white card with one soft orange glow in
	   its corner and dark type. */
	:global(.aegis[data-theme='light']) .overview::before {
		background:
			radial-gradient(420px 220px at 100% 0%, rgba(251, 146, 60, 0.16), transparent 70%),
			#ffffff;
		border-color: #eceef2;
		box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04), 0 6px 18px -10px rgba(16, 24, 40, 0.1);
		-webkit-mask-image: none;
		mask-image: none;
	}
	.hero-copy {
		padding: 0 32px;
		margin-bottom: 30px;
	}
	.hero-copy h2 {
		font-size: 32px;
		font-weight: 600;
		letter-spacing: -0.028em;
		line-height: 1.15;
		margin: 0 0 8px;
	}
	.hero-copy p {
		margin: 0;
		color: var(--ae-text-2);
		font-size: 15px;
	}

	/* ---------- metrics ---------- */
	.metrics {
		display: grid;
		grid-template-columns: repeat(4, minmax(0, 1fr));
		gap: 18px;
	}
	.metric {
		--tone: var(--ae-ember-rgb);
		position: relative;
		display: flex;
		flex-direction: column;
		padding: 20px 22px 20px;
		border-radius: 14px;
		background: var(--ae-card-bg);
		border: 1px solid var(--ae-card-border);
		box-shadow: var(--ae-card-shadow);
		text-decoration: none;
		color: var(--ae-text);
		transition:
			border-color var(--ae-dur) var(--ae-ease),
			transform var(--ae-dur) var(--ae-ease);
	}
	/* Light mode: plain white number cards; each icon sits on a pale tile
	   of its own colour. */
	:global(.aegis[data-theme='light']) .metric {
		background: #ffffff;
		border-color: #eceef2;
		box-shadow: 0 1px 2px rgba(16, 24, 40, 0.04), 0 6px 18px -10px rgba(16, 24, 40, 0.1);
	}
	:global(.aegis[data-theme='light']) .metric .metric-ico {
		color: rgb(var(--tone));
		background: rgba(var(--tone), 0.1);
		border: 0;
		box-shadow: none;
	}
	:global(.aegis[data-theme='light']) .metric .metric-value {
		color: #111827;
	}
	.metric.tone-blue {
		--tone: var(--ae-azure-rgb);
	}
	.metric.tone-rose {
		--tone: var(--ae-crimson-rgb);
	}
	.metric.tone-teal {
		--tone: var(--ae-verdant-rgb);
	}
	.metric.link:hover {
		border-color: rgba(var(--tone), 0.4);
		transform: translateY(-1px);
	}
	.metric-top {
		display: flex;
		align-items: center;
		justify-content: space-between;
		margin-bottom: 18px;
	}
	.metric-ico {
		width: 40px;
		height: 40px;
		display: grid;
		place-items: center;
		border-radius: 8px;
		color: #f1f0ff;
		background: linear-gradient(150deg, rgba(var(--tone), 0.62), rgba(var(--tone), 0.3));
		border: 1px solid rgba(var(--tone), 0.45);
		box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.03) inset;
	}
	.metric.tone-teal .metric-ico {
		color: #e6fffb;
		background: linear-gradient(150deg, rgba(var(--tone), 0.42), rgba(var(--tone), 0.18));
	}
	.metric-ico :global(svg) {
		width: 19px;
		height: 19px;
	}
	.metric-go :global(svg) {
		display: block;
		width: 13px;
		height: 13px;
		color: var(--ae-muted);
		transition: transform var(--ae-dur) var(--ae-ease);
	}
	.metric.link:hover .metric-go :global(svg) {
		color: var(--ae-text-2);
		transform: translateX(2px);
	}
	.metric-label {
		font-size: 14px;
		color: var(--ae-text-2);
		margin-bottom: 6px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.metric-value {
		font-size: 34px;
		font-weight: 550;
		letter-spacing: -0.03em;
		line-height: 1.1;
		margin-bottom: 8px;
		font-variant-numeric: tabular-nums;
	}
	.metric-note {
		font-size: 12.5px;
		color: var(--ae-muted-2);
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	/* ---------- pipeline ---------- */
	.pipeline {
		list-style: none;
		margin: 10px 0 6px;
		padding: 0;
		display: grid;
		grid-template-columns: repeat(5, minmax(0, 1fr));
		position: relative;
	}
	/* The track runs node-centre to node-centre. */
	.pipeline::before {
		content: '';
		position: absolute;
		top: 10px;
		left: 10%;
		right: 10%;
		height: 1.5px;
		background: linear-gradient(90deg, #6366f1, #8b6cf0 45%, #f97316);
	}
	.stage-inner {
		position: relative;
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 3px;
		text-decoration: none;
		color: inherit;
	}
	a.stage-inner:hover .stage-label {
		color: var(--ae-text);
	}
	.node {
		width: 21px;
		height: 21px;
		border-radius: 50%;
		margin-bottom: 9px;
		background: radial-gradient(circle, #c9c6ff 0 30%, #3a3794 34% 100%);
		box-shadow:
			0 0 0 3px var(--ae-card-solid),
			0 0 0 4px #2a3060;
	}
	.stage:not(.lit) .node {
		background: radial-gradient(circle, #59607e 0 28%, #1f2747 32% 100%);
	}
	.stage.lit .node {
		background: radial-gradient(circle, #ffffff 0 28%, #6366f1 32% 100%);
	}
	.stage.done.lit .node {
		background: radial-gradient(circle, #e6fffb 0 28%, #2fbfa8 32% 100%);
		box-shadow:
			0 0 0 3px var(--ae-card-solid),
			0 0 0 4px rgba(var(--ae-verdant-rgb), 0.35),
			0 0 14px rgba(var(--ae-verdant-rgb), 0.45);
	}
	.stage.busiest .node {
		box-shadow:
			0 0 0 3px var(--ae-card-solid),
			0 0 0 4px rgba(var(--ae-ember-rgb), 0.55),
			0 0 16px rgba(var(--ae-ember-rgb), 0.75);
	}
	.stage-label {
		font-size: 13px;
		color: var(--ae-text);
		text-align: center;
		transition: color var(--ae-dur) var(--ae-ease);
	}
	.stage-value {
		font-size: 18px;
		font-weight: 600;
		margin-top: 2px;
		color: var(--ae-text);
		font-variant-numeric: tabular-nums;
	}

	/* ---------- recent table ---------- */
	.recent-grid {
		grid-template-columns: minmax(0, 1.5fr) minmax(0, 1.4fr) minmax(0, 0.9fr) minmax(0, 1.1fr) 70px;
		padding-left: 24px;
		padding-right: 24px;
	}
	.panel :global(.thead.recent-grid) {
		border-bottom: 0;
		padding-top: 0;
		padding-bottom: 10px;
		font-size: 12.5px;
		color: var(--ae-muted-2);
	}
	.panel :global(.trow.recent-grid) {
		padding-top: 12px;
		padding-bottom: 12px;
		border-bottom: 1px solid var(--ae-line-soft);
	}
	.panel :global(.trow.recent-grid .tcell) {
		font-size: 13px;
	}
	.panel :global(.trow.recent-grid:last-child) {
		border-bottom: 0;
		margin-bottom: 12px;
	}
	.clip {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	/* ---------- people ---------- */
	.who-cell {
		display: flex;
		align-items: center;
		gap: 10px;
		min-width: 0;
	}
	.who-text {
		min-width: 0;
		flex: 1;
	}
	.who-name {
		display: block;
		font-size: 13.5px;
		color: var(--ae-text);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.who-sub {
		font-size: 11.5px;
		color: var(--ae-muted-2);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		margin-top: 2px;
	}
	.av {
		width: var(--s);
		height: var(--s);
		flex: none;
		border-radius: 50%;
		display: grid;
		place-items: center;
		font-size: calc(var(--s) * 0.36);
		font-weight: 500;
		color: hsl(var(--h) 70% 88%);
		background: linear-gradient(140deg, hsl(var(--h) 38% 32%), hsl(calc(var(--h) + 30) 40% 20%));
		box-shadow: 0 0 0 1.5px rgba(255, 255, 255, 0.08);
	}
	:global(.aegis[data-theme='light']) .av {
		color: hsl(var(--h) 55% 30%);
		background: hsl(var(--h) 60% 92%);
	}

	/* ---------- empty states ---------- */
	.empty {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 4px 18px 18px;
	}
	.empty.compact {
		padding: 2px 0 0;
	}
	.empty-ico {
		width: 34px;
		height: 34px;
		flex: none;
		display: grid;
		place-items: center;
		border-radius: 9px;
		background: var(--ae-elevated);
		color: var(--ae-muted-2);
	}
	.empty-ico :global(svg) {
		width: 16px;
		height: 16px;
	}
	.empty-title {
		font-size: 13px;
		font-weight: 500;
	}
	.empty-sub {
		font-size: 12px;
		color: var(--ae-muted-2);
	}

	/* ---------- new hire panel ---------- */
	.newhire {
		background:
			radial-gradient(70% 140% at 100% 100%, rgba(var(--ae-orange-rgb), 0.16), transparent 60%),
			var(--ae-card-bg);
		border-color: var(--ae-card-border);
		scroll-margin-top: 24px;
	}
	:global(.aegis[data-theme='light']) .newhire {
		background:
			radial-gradient(70% 140% at 100% 100%, rgba(var(--ae-orange-rgb), 0.12), transparent 60%),
			var(--ae-card-bg);
	}
	.newhire-head {
		display: flex;
		align-items: center;
		gap: 22px;
		margin-bottom: 24px;
	}
	.newhire-art {
		width: 96px;
		height: 66px;
		flex: none;
	}
	.gen-grid {
		/* Name · email · mobile, then track · company · submit. */
		display: grid;
		grid-template-columns: repeat(3, minmax(0, 1fr));
		gap: 18px 20px;
		align-items: end;
	}
	.gen-grid label {
		font-size: 12.5px;
		margin-bottom: 7px;
	}
	.gen-grid input {
		padding: 11px 14px;
	}
	.gen-grid .btn {
		height: 44px;
	}
	.gen-grid .btn :global(svg) {
		width: 14px;
		height: 14px;
	}
	.newhire :global(.gs-trigger) {
		padding: 11px 14px;
	}
	.linkbox {
		margin-top: 14px;
		background: rgba(var(--ae-verdant-rgb), 0.06);
		border: 1px solid rgba(var(--ae-verdant-rgb), 0.2);
		border-radius: 10px;
		padding: 13px 14px;
	}
	.linkcode {
		font-family: var(--ae-font-code);
		font-size: 12px;
		background: var(--ae-sub-bg);
		border: 1px solid var(--ae-line-strong);
		border-radius: 7px;
		padding: 6px 10px;
		color: var(--ae-ember-glow);
		overflow-wrap: anywhere;
	}
	.teal-pill-btn {
		border: 1px solid var(--ae-line-strong);
		background: var(--ae-input-bg);
		color: var(--ae-text-2);
		font-family: var(--ae-font-body);
		font-size: 12px;
		padding: 6px 12px;
		border-radius: 7px;
		cursor: pointer;
		text-decoration: none;
		transition: all var(--ae-dur) var(--ae-ease);
	}
	.teal-pill-btn:hover {
		border-color: rgba(var(--ae-ember-rgb), 0.45);
		color: var(--ae-text);
	}

	/* ---------- right rail ---------- */
	.qa-grid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 12px;
	}
	.qa-item {
		position: relative;
		display: flex;
		flex-direction: column;
		gap: 12px;
		padding: 18px 16px;
		border-radius: 12px;
		background: rgba(255, 255, 255, 0.03);
		border: 1px solid rgba(var(--ae-orange-rgb), 0.16);
		color: var(--ae-text);
		font-size: 13px;
		text-decoration: none;
		transition:
			border-color var(--ae-dur) var(--ae-ease),
			background var(--ae-dur) var(--ae-ease);
	}
	:global(.aegis[data-theme='light']) .qa-item {
		background: var(--ae-elevated);
		border-color: var(--ae-card-border);
	}
	.qa-item:hover {
		border-color: rgba(var(--ae-ember-rgb), 0.45);
		background: rgba(var(--ae-ember-rgb), 0.08);
	}
	.qa-ico :global(svg) {
		display: block;
		width: 18px;
		height: 18px;
		color: var(--ae-text);
	}
	.qa-go {
		position: absolute;
		right: 12px;
		top: 50%;
		transform: translateY(-50%);
	}
	.qa-go :global(svg) {
		display: block;
		width: 13px;
		height: 13px;
		color: var(--ae-muted-2);
		transition: transform var(--ae-dur) var(--ae-ease);
	}
	.qa-item:hover .qa-go :global(svg) {
		transform: translateX(2px);
	}
	.count {
		flex: none;
		font-size: 11.5px;
		padding: 3px 9px;
		border-radius: 6px;
		color: var(--ae-amber);
		background: rgba(var(--ae-amber-rgb), 0.12);
	}
	.count.teal {
		color: var(--ae-verdant);
		background: rgba(var(--ae-verdant-rgb), 0.12);
	}
	.list {
		list-style: none;
		margin: 0 -8px;
		padding: 0;
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.list.scroll {
		max-height: 320px;
		overflow-y: auto;
	}
	.list-row {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 10px 8px;
		border-radius: 10px;
		text-decoration: none;
		transition: background var(--ae-dur) var(--ae-ease);
	}
	.list-row:hover {
		background: var(--ae-hover);
	}
	.list-row .who-name {
		font-size: 13px;
	}
	.tag {
		flex: none;
		font-size: 11.5px;
		padding: 3px 9px;
		border-radius: 6px;
		white-space: nowrap;
	}
	.tag.blue {
		color: #9fc8ff;
		background: rgba(var(--ae-azure-rgb), 0.16);
	}
	.tag.amber {
		color: var(--ae-amber);
		background: rgba(var(--ae-amber-rgb), 0.12);
	}
	:global(.aegis[data-theme='light']) .tag.blue {
		color: var(--ae-azure);
	}

	/* ---------- responsive ---------- */
	@media (max-width: 1240px) {
		.dash {
			grid-template-columns: minmax(0, 1fr);
		}
		.dash-rail {
			display: grid;
			grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
			align-items: start;
		}
	}
	@media (max-width: 1100px) {
		.metrics {
			grid-template-columns: repeat(2, minmax(0, 1fr));
		}
		.overview::before {
			bottom: auto;
			height: 150px;
		}
	}
	@media (max-width: 900px) {
		/* Company and Track hide here (shared .tcell rule), leaving name · status · link. */
		.recent-grid {
			grid-template-columns: minmax(0, 1fr) auto auto;
			padding-left: 16px;
			padding-right: 16px;
		}
	}
	@media (max-width: 700px) {
		.hero-copy {
			padding: 0 20px;
		}
		.hero-copy h2 {
			font-size: 23px;
		}
		.pipeline {
			grid-template-columns: 1fr;
			gap: 6px;
		}
		.pipeline::before {
			left: 10px;
			right: auto;
			top: 10px;
			bottom: 10px;
			width: 1.5px;
			height: auto;
		}
		.stage-inner {
			flex-direction: row;
			gap: 12px;
		}
		.node {
			margin: 0;
		}
		.stage-label {
			flex: 1;
			text-align: left;
		}
		.gen-grid {
			grid-template-columns: 1fr;
		}
		.newhire-art {
			display: none;
		}
	}
	@media (max-width: 480px) {
		.metrics {
			gap: 10px;
		}
		.metric {
			padding: 14px;
		}
		.metric-top {
			margin-bottom: 12px;
		}
		.metric-value {
			font-size: 24px;
		}
	}

	/* ---------- joining-today popup ---------- */
	.popup-overlay {
		position: fixed;
		inset: 0;
		z-index: 200;
		background: rgba(2, 5, 14, 0.62);
		backdrop-filter: blur(4px);
		-webkit-backdrop-filter: blur(4px);
		display: grid;
		place-items: center;
		padding: 20px;
	}
	.popup-card {
		width: 100%;
		max-width: 420px;
		background: var(--ae-modal-base);
		border: 1px solid var(--ae-line-strong);
		border-radius: 14px;
		box-shadow: 0 30px 70px -20px rgba(0, 0, 0, 0.8);
		padding: 22px;
		animation: ae-rise 200ms var(--ae-ease);
	}
	.popup-badge {
		display: inline-block;
		font-size: 11.5px;
		color: var(--ae-verdant);
		background: rgba(var(--ae-verdant-rgb), 0.12);
		border-radius: 6px;
		padding: 3px 9px;
		margin-bottom: 12px;
	}
	.popup-card h2 {
		font-size: 19px;
		font-weight: 600;
		margin: 0 0 14px;
		color: var(--ae-text);
	}
	.popup-list {
		display: flex;
		flex-direction: column;
		gap: 6px;
		max-height: 260px;
		overflow-y: auto;
		margin-bottom: 14px;
	}
	.popup-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 10px;
		padding: 9px 11px;
		border-radius: 10px;
		background: var(--ae-elevated);
		text-decoration: none;
		transition: background var(--ae-dur) var(--ae-ease);
	}
	.popup-row .who-cell {
		flex: 1;
	}
	.popup-row .pill {
		flex: none;
	}
	.popup-row:hover {
		background: var(--ae-hover);
	}
</style>
