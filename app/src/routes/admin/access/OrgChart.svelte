<script lang="ts">
	// The reporting tree, drawn from `reportsTo` and nothing else. It edits the
	// same working copy as the matrix and the inspector — a drag here is a pending
	// change like any other, listed in Review changes and saved by Apply access.
	//
	// Picking a person lights up the two things the chart actually drives: who
	// their sign-offs route to (everyone above them) and, for team or tree reach,
	// whose records they can open (the people below them).
	import { ALL_CAP_KEYS, CAPS, POPULATIONS, PRESETS, TONE_HEX, grantedCount, type Grantee } from '$lib/shared/access';

	type Person = Grantee & { id: string; email: string; name: string; title: string; isSelf: boolean };

	let {
		people,
		saved,
		selectedId = $bindable(),
		toneOf,
		initials,
		wouldLoop,
		onMove,
		entities
	}: {
		people: Person[];
		saved: Person[];
		selectedId: string | null;
		toneOf: (p: Person) => string;
		initials: (n: string) => string;
		wouldLoop: (p: Person, managerId: string) => boolean;
		onMove: (p: Person, managerId: string) => void;
		entities: { slug: string; name: string }[];
	} = $props();

	type Lens = 'role' | 'reach' | 'signoff';
	let lens = $state<Lens>('role');
	let query = $state('');
	let zoom = $state(1);
	let collapsed = $state(new Set<string>());
	let dragId = $state<string | null>(null);
	let overId = $state<string | null>(null);
	let canvas = $state<HTMLDivElement>();
	let inner = $state<HTMLDivElement>();

	const byId = $derived(new Map(people.map((p) => [p.id, p])));
	const savedParent = $derived(new Map(saved.map((s) => [s.id, s.reportsTo ?? null])));
	/** A reporting line that points at a deleted login counts as the top. */
	const parentOf = (p: Person) => (p.reportsTo && byId.has(p.reportsTo) ? p.reportsTo : null);
	const kids = $derived.by(() => {
		const m = new Map<string | null, Person[]>();
		for (const p of people) {
			const k = parentOf(p);
			if (!m.has(k)) m.set(k, []);
			m.get(k)!.push(p);
		}
		for (const list of m.values()) list.sort((a, b) => a.name.localeCompare(b.name));
		return m;
	});
	const roots = $derived(kids.get(null) ?? []);
	const childrenOf = (id: string) => kids.get(id) ?? [];

	function descendants(id: string, out = new Set<string>()): Set<string> {
		for (const k of childrenOf(id)) {
			if (out.has(k.id)) continue;
			out.add(k.id);
			descendants(k.id, out);
		}
		return out;
	}
	const subtreeSize = (id: string) => descendants(id).size;

	const depth = $derived.by(() => {
		let max = 0;
		const walk = (id: string, d: number) => {
			if (d > people.length) return;
			max = Math.max(max, d);
			for (const k of childrenOf(id)) walk(k.id, d + 1);
		};
		for (const r of roots) walk(r.id, 1);
		return max;
	});

	// ── what the selection lights up ────────────────────────────────────────
	const selected = $derived(selectedId ? byId.get(selectedId) ?? null : null);
	/** Manager, their manager, and so on — the order a sign-off climbs. */
	const chain = $derived.by<Person[]>(() => {
		const out: Person[] = [];
		let cur = selected ? parentOf(selected) : null;
		while (cur && out.length < people.length) {
			const p = byId.get(cur)!;
			out.push(p);
			cur = parentOf(p);
		}
		return out;
	});
	const chainIds = $derived(new Set(chain.map((p) => p.id)));
	const reachIds = $derived.by(() => {
		if (!selected) return new Set<string>();
		if (selected.population === 'team') return new Set(childrenOf(selected.id).map((k) => k.id));
		if (selected.population === 'tree') return descendants(selected.id);
		return new Set<string>();
	});
	const focusing = $derived(!!selected && !dragId);

	// ── search ──────────────────────────────────────────────────────────────
	const q = $derived(query.trim().toLowerCase());
	const hits = $derived(
		q
			? new Set(
					people
						.filter((p) => `${p.name} ${p.email} ${p.title} ${PRESETS[p.preset]?.name ?? ''}`.toLowerCase().includes(q))
						.map((p) => p.id)
				)
			: null
	);
	/** Ancestors of a hit stay open while searching, so a hit is never folded away. */
	const hitPath = $derived.by(() => {
		const s = new Set<string>();
		if (!hits) return s;
		for (const id of hits) {
			let cur = parentOf(byId.get(id)!);
			while (cur && !s.has(cur)) {
				s.add(cur);
				cur = parentOf(byId.get(cur)!);
			}
		}
		return s;
	});
	const isOpen = (id: string) => !collapsed.has(id) || hitPath.has(id);

	function jumpToFirstHit() {
		const first = people.find((p) => hits?.has(p.id));
		if (!first) return;
		selectedId = first.id;
		requestAnimationFrame(() =>
			canvas?.querySelector(`[data-node="${first.id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' })
		);
	}

	function toggle(id: string) {
		const next = new Set(collapsed);
		if (next.has(id)) next.delete(id);
		else next.add(id);
		collapsed = next;
	}
	const collapseAll = () => (collapsed = new Set(people.filter((p) => childrenOf(p.id).length).map((p) => p.id)));
	const expandAll = () => (collapsed = new Set());

	function fit() {
		if (!canvas || !inner) return;
		// The rendered width over the current zoom is the chart's natural width,
		// whatever the browser reports for scrollWidth under `zoom`.
		const tree = inner.firstElementChild as HTMLElement | null;
		if (!tree) return;
		const natural = tree.getBoundingClientRect().width / zoom;
		zoom = Math.floor(Math.max(0.4, Math.min(1, (canvas.clientWidth - 24) / natural)) * 100) / 100;
	}
	// Open fitted when the whole chart would not otherwise fit across, once —
	// after that the zoom is the reader's.
	let fitted = false;
	$effect(() => {
		if (fitted || !canvas || !inner || !people.length) return;
		fitted = true;
		// After layout settles (fonts, the inspector beside it), not before.
		requestAnimationFrame(() => requestAnimationFrame(fit));
	});
	const step = (d: number) => (zoom = Math.round(Math.max(0.4, Math.min(1.5, zoom + d)) * 10) / 10);

	// ── drag to re-parent ───────────────────────────────────────────────────
	const dragging = $derived(dragId ? byId.get(dragId) ?? null : null);
	function canDrop(target: Person | null): boolean {
		if (!dragging) return false;
		if (!target) return parentOf(dragging) !== null;
		if (target.id === dragging.id || target.id === parentOf(dragging)) return false;
		return !wouldLoop(dragging, target.id);
	}
	function drop(target: Person | null) {
		if (dragging && canDrop(target)) {
			onMove(dragging, target?.id ?? '');
			// Open the new manager so the person lands where you can see them.
			if (target && collapsed.has(target.id)) toggle(target.id);
			selectedId = dragging.id;
		}
		dragId = null;
		overId = null;
	}

	// ── per-person facts ────────────────────────────────────────────────────
	const REACH: Record<string, { short: string; color: string }> = {
		own: { short: 'Own', color: '#8e9ab6' },
		team: { short: 'Team', color: TONE_HEX.azure },
		tree: { short: 'Tree', color: TONE_HEX.violet },
		entity: { short: 'Entity', color: TONE_HEX.verdant },
		all: { short: 'All', color: TONE_HEX.crimson }
	};
	const routed = (p: Person) => Object.keys(p.checkers).filter((k) => p.checkers[k]).length;
	const lapsed = (p: Person) => !!p.accessExpiresAt && new Date(p.accessExpiresAt) < new Date();
	const moved = (p: Person) => (savedParent.get(p.id) ?? null) !== (p.reportsTo ?? null);
	const stalls = (p: Person) => routed(p) > 0 && !parentOf(p);

	function stripColor(p: Person) {
		if (lens === 'reach') return REACH[p.population]?.color ?? '#8e9ab6';
		if (lens === 'signoff') return stalls(p) ? TONE_HEX.crimson : routed(p) ? TONE_HEX.amber : 'transparent';
		return toneOf(p);
	}

	const stalledCount = $derived(people.filter(stalls).length);
	const movedCount = $derived(people.filter(moved).length);
	const selReach = $derived(selected ? POPULATIONS.find((o) => o.k === selected.population) : null);

	// ── details card ────────────────────────────────────────────────────────
	// Hovering a card (or tabbing to it) opens its details after a beat; clicking
	// pins them open until Escape or a click elsewhere. Rendered on the app shell so the
	// chart's scroll box and the page's glass cards never clip it.
	const POP_W = 300;
	let pop = $state<{ id: string; x: number; y: number; side: 'left' | 'right'; pinned: boolean } | null>(null);
	let popEl = $state<HTMLDivElement>();
	let showT: ReturnType<typeof setTimeout> | undefined;
	let hideT: ReturnType<typeof setTimeout> | undefined;
	const popPerson = $derived(pop ? byId.get(pop.id) ?? null : null);

	function place(id: string, pinned: boolean) {
		const el = canvas?.querySelector<HTMLElement>(`[data-node="${id}"]`);
		if (!el) return (pop = null);
		const r = el.getBoundingClientRect();
		const right = r.right + 12 + POP_W < window.innerWidth;
		const h = popEl?.offsetHeight ?? 360;
		pop = {
			id,
			pinned,
			side: right ? 'right' : 'left',
			x: right ? r.right + 10 : Math.max(8, r.left - 10 - POP_W),
			y: Math.max(8, Math.min(r.top - 6, window.innerHeight - h - 8))
		};
	}
	function hoverIn(id: string) {
		if (dragId || (pop?.pinned && pop.id !== id)) return;
		clearTimeout(hideT);
		clearTimeout(showT);
		showT = setTimeout(() => place(id, false), pop ? 60 : 260);
	}
	function hoverOut() {
		clearTimeout(showT);
		if (pop && !pop.pinned) hideT = setTimeout(() => (pop = null), 180);
	}
	function pin(id: string) {
		clearTimeout(showT);
		clearTimeout(hideT);
		place(id, true);
	}
	const closePop = () => {
		clearTimeout(showT);
		pop = null;
	};
	// Re-measure once the card has rendered, so a tall card near the bottom of
	// the screen moves up instead of running off it.
	$effect(() => {
		if (pop && popEl && pop.y + popEl.offsetHeight > window.innerHeight - 8) place(pop.id, pop.pinned);
	});

	function portal(node: HTMLElement) {
		// Into the app shell rather than <body>: the theme's colour tokens are
		// defined on .aegis, and outside it the card would render without them.
		(document.querySelector('.aegis') ?? document.body).appendChild(node);
		return { destroy: () => node.remove() };
	}
	function onWindowDown(e: PointerEvent) {
		if (!pop?.pinned) return;
		const t = e.target as Element;
		if (popEl?.contains(t) || t.closest?.('[data-node]')) return;
		closePop();
	}
	const follow = () => pop && place(pop.id, pop.pinned);

	const signOffs = (p: Person) => Object.keys(p.checkers).filter((k) => p.checkers[k]);
	function entityText(p: Person) {
		if (p.entities === 'all') return `All ${entities.length} entities`;
		const names = p.entities.map((s) => entities.find((e) => e.slug === s)?.name ?? s);
		return names.length > 3 ? `${names.slice(0, 3).join(', ')} +${names.length - 3}` : names.join(', ');
	}
	function editAccess(p: Person) {
		selectedId = p.id;
		closePop();
		document.querySelector('aside.insp')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
	}
	function jumpTo(id: string) {
		selectedId = id;
		const p = byId.get(id);
		// Unfold everyone above them, so the card is on screen to anchor to.
		let cur = p ? parentOf(p) : null;
		const next = new Set(collapsed);
		while (cur) {
			next.delete(cur);
			cur = parentOf(byId.get(cur)!);
		}
		collapsed = next;
		requestAnimationFrame(() => {
			canvas?.querySelector(`[data-node="${id}"]`)?.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
			setTimeout(() => pin(id), 320);
		});
	}
</script>

<svelte:window
	onpointerdown={onWindowDown}
	onkeydown={(e) => e.key === 'Escape' && pop && closePop()}
	onresize={follow}
/>

<div class="oc">
	<div class="bar">
		<label class="find">
			<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
			<input
				type="search"
				placeholder="Find a person…"
				bind:value={query}
				onkeydown={(e) => e.key === 'Enter' && jumpToFirstHit()}
				aria-label="Find a person on the chart"
			/>
			{#if hits}<span class="hitn">{hits.size}</span>{/if}
		</label>

		<div class="seg" role="radiogroup" aria-label="Colour the chart by">
			<button role="radio" aria-checked={lens === 'role'} onclick={() => (lens = 'role')}>Role</button>
			<button role="radio" aria-checked={lens === 'reach'} onclick={() => (lens = 'reach')}>Reach</button>
			<button role="radio" aria-checked={lens === 'signoff'} onclick={() => (lens = 'signoff')}>
				Sign-offs{#if stalledCount}<span class="warn-dot" title="{stalledCount} stalled"></span>{/if}
			</button>
		</div>

		<span style="flex:1"></span>

		<div class="tools">
			<button class="ic" onclick={expandAll} title="Expand all">
				<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m7 15 5 5 5-5M7 9l5-5 5 5" /></svg>
			</button>
			<button class="ic" onclick={collapseAll} title="Collapse all">
				<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m7 20 5-5 5 5M7 4l5 5 5-5" /></svg>
			</button>
			<span class="sep"></span>
			<button class="ic" onclick={() => step(-0.1)} title="Zoom out" aria-label="Zoom out">−</button>
			<button class="zl" onclick={fit} title="Fit to width">{Math.round(zoom * 100)}%</button>
			<button class="ic" onclick={() => step(0.1)} title="Zoom in" aria-label="Zoom in">+</button>
		</div>
	</div>

	<div class="stats">
		<span><b>{people.length}</b> people</span>
		<span><b>{depth}</b> level{depth === 1 ? '' : 's'} deep</span>
		<span><b>{roots.length}</b> at the top</span>
		{#if stalledCount}
			<button class="stat-warn" onclick={() => (lens = 'signoff')}>
				<b>{stalledCount}</b> with sign-offs and nobody above
			</button>
		{/if}
		{#if movedCount}<span class="stat-moved"><b>{movedCount}</b> moved, not applied</span>{/if}
	</div>

	<div class="route" class:drag={!!dragging}>
		{#if dragging}
			Drop <b>{dragging.name}</b> on their new manager. Greyed-out cards would create a loop.
		{:else if selected}
			<span class="r-k">Sign-offs from {selected.name}</span>
			{#if chain.length}
				<span class="r-chain">
					<span class="r-p me">{selected.name}</span>
					{#each chain as c, i (c.id)}
						<svg width="14" height="10" viewBox="0 0 14 10"><path d="M1 5h11M8 1l4 4-4 4" fill="none" stroke="currentColor" stroke-width="1.5" /></svg>
						<button class="r-p" class:first={i === 0} onclick={() => jumpTo(c.id)}>{c.name}</button>
					{/each}
				</span>
			{:else}
				<span class="r-none">{routed(selected) ? 'stall: nobody is above them.' : 'have nowhere to go, as nobody is above them.'}</span>
			{/if}
			<span class="r-k reach">
				Reach: <b style="color:{REACH[selected.population]?.color}">{selReach?.t.toLowerCase()}</b>
				{#if selected.population === 'team' || selected.population === 'tree'}· {reachIds.size} on this chart{/if}
			</span>
		{:else}
			<span class="r-k">Pick a person to trace where their sign-offs go</span>
		{/if}
	</div>

	<div class="canvas" bind:this={canvas} onscroll={follow}>
		{#if dragging && parentOf(dragging)}
			<div class="topwrap"><div
				class="topzone"
				class:over={overId === '__top'}
				role="region"
				aria-label="Drop to put at the top of the chart"
				ondragover={(e) => { e.preventDefault(); overId = '__top'; }}
				ondragleave={() => overId === '__top' && (overId = null)}
				ondrop={(e) => { e.preventDefault(); drop(null); }}
			>
				Drop here to put {dragging.name} at the top of the chart
			</div></div>
		{/if}
		<div class="inner" bind:this={inner} style="zoom:{zoom}">
			<ul class="org">
				{#each roots as r (r.id)}
					{@render node(r, 0)}
				{/each}
			</ul>
		</div>
	</div>

	<div class="keys">
		{#if lens === 'reach'}
			{#each POPULATIONS as o (o.k)}<span class="key"><i style="background:{REACH[o.k].color}"></i>{o.t}</span>{/each}
		{:else if lens === 'signoff'}
			<span class="key"><i style="background:{TONE_HEX.amber}"></i>Routes sign-offs to their manager</span>
			<span class="key"><i style="background:{TONE_HEX.crimson}"></i>Routes sign-offs, but nobody is above them</span>
		{:else}
			<span class="key">Strip colour is the role preset.</span>
		{/if}
		<span class="key dim">Drag a card onto someone to change who they report to. Click to edit in the panel.</span>
	</div>
</div>

{#if pop && popPerson}
	{@const p = popPerson}
	{@const mgr = parentOf(p) ? byId.get(parentOf(p)!) : null}
	{@const was = savedParent.get(p.id) ?? null}
	{@const ks = childrenOf(p.id)}
	{@const sos = signOffs(p)}
	<div
		use:portal
		bind:this={popEl}
		id="oc-pop"
		class="pop {pop.side}"
		class:pinned={pop.pinned}
		role="dialog"
		tabindex="-1"
		aria-label="{p.name} details"
		style="left:{pop.x}px; top:{pop.y}px; width:{POP_W}px; --tone:{toneOf(p)}"
		onmouseenter={() => clearTimeout(hideT)}
		onmouseleave={hoverOut}
	>
		<div class="p-head">
			<span class="p-av">{initials(p.name)}</span>
			<div class="p-id">
				<div class="p-name">{p.name}</div>
				<div class="p-title">{p.title || PRESETS[p.preset]?.name}</div>
				<a class="p-mail" href="mailto:{p.email}">{p.email}</a>
			</div>
			{#if pop.pinned}
				<button class="p-x" onclick={closePop} aria-label="Close details">×</button>
			{/if}
		</div>
		<div class="p-chips">
			<span class="p-chip tone">{PRESETS[p.preset]?.name ?? p.preset}</span>
			{#if p.isSelf}<span class="p-chip">You</span>{/if}
			{#if p.status === 'disabled'}<span class="p-chip bad">Login disabled</span>
			{:else if lapsed(p)}<span class="p-chip bad">Access lapsed</span>
			{:else}<span class="p-chip ok">Active</span>{/if}
			{#if moved(p)}<span class="p-chip warn">Moved · not applied</span>{/if}
		</div>
		<dl class="p-rows">
			<div>
				<dt>Reports to</dt>
				<dd>
					{#if mgr}<button class="p-link" onclick={() => jumpTo(mgr.id)}>{mgr.name}</button>
					{:else}<span class="p-muted">Nobody, top of the chart</span>{/if}
					{#if moved(p)}<span class="p-was">was {was && byId.get(was) ? byId.get(was)!.name : 'nobody'}</span>{/if}
				</dd>
			</div>
			<div>
				<dt>Team</dt>
				<dd>
					{#if ks.length}
						{ks.length} direct{subtreeSize(p.id) > ks.length ? ` · ${subtreeSize(p.id)} in total` : ''}
						<span class="p-kids">
							{#each ks.slice(0, 5) as k (k.id)}
								<button class="p-mini" style="background:{toneOf(k)}" title={k.name} onclick={() => jumpTo(k.id)}>{initials(k.name)}</button>
							{/each}
							{#if ks.length > 5}<span class="p-muted">+{ks.length - 5}</span>{/if}
						</span>
					{:else}<span class="p-muted">No one reports to them</span>{/if}
				</dd>
			</div>
			<div>
				<dt>Reach</dt>
				<dd><b style="color:{REACH[p.population]?.color}">{POPULATIONS.find((o) => o.k === p.population)?.t}</b></dd>
			</div>
			<div><dt>Entities</dt><dd>{entityText(p)}</dd></div>
			<div><dt>Tracks</dt><dd>{p.tracks === 'all' ? 'All hiring tracks' : p.tracks.join(', ')}</dd></div>
			<div>
				<dt>Powers</dt>
				<dd>
					{grantedCount(p)} of {ALL_CAP_KEYS.length}
					<span class="p-bar"><i style="width:{(grantedCount(p) / ALL_CAP_KEYS.length) * 100}%"></i></span>
				</dd>
			</div>
			<div>
				<dt>Sign-off</dt>
				<dd>
					{#if sos.length}
						<span class:p-bad={!mgr}>{sos.length} action{sos.length === 1 ? '' : 's'} {mgr ? `go to ${mgr.name}` : 'stall, nobody above'}</span>
						<ul class="p-list">
							{#each sos.slice(0, 4) as k (k)}<li>{CAPS[k]?.label ?? k}</li>{/each}
							{#if sos.length > 4}<li class="p-muted">+{sos.length - 4} more</li>{/if}
						</ul>
					{:else}<span class="p-muted">Acts directly, nothing routed</span>{/if}
				</dd>
			</div>
			<div>
				<dt>Access ends</dt>
				<dd>{#if p.accessExpiresAt}<span class:p-bad={lapsed(p)}>{new Date(p.accessExpiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>{:else}<span class="p-muted">Permanent</span>{/if}</dd>
			</div>
		</dl>
		<div class="p-foot">
			{#if ks.length}
				<button class="p-btn ghost" onclick={() => { toggle(p.id); follow(); }}>{isOpen(p.id) ? 'Fold team' : 'Show team'}</button>
			{/if}
			<span style="flex:1"></span>
			<button class="p-btn" onclick={() => editAccess(p)}>Edit access →</button>
		</div>
		{#if !pop.pinned}<div class="p-hint">Click the card to keep this open</div>{/if}
	</div>
{/if}

{#snippet node(p: Person, d: number)}
	{@const ks = childrenOf(p.id)}
	{@const open = isOpen(p.id)}
	{@const isSel = selectedId === p.id}
	{@const up = focusing && chainIds.has(p.id)}
	{@const reach = focusing && reachIds.has(p.id)}
	{@const dimmed = (hits && !hits.has(p.id)) || (dragging && !canDrop(p) && dragging.id !== p.id)}
	<li class:up class:reach>
		<div
			class="card"
			data-node={p.id}
			class:sel={isSel}
			class:up
			class:reach
			class:dim={dimmed}
			class:off={p.status === 'disabled'}
			class:lapsed={lapsed(p)}
			class:over={overId === p.id}
			class:ghost={dragId === p.id}
			class:hit={hits?.has(p.id)}
			role="button"
			tabindex="0"
			draggable="true"
			aria-pressed={isSel}
			aria-label="{p.name}, {PRESETS[p.preset]?.name}{ks.length ? `, ${ks.length} direct reports` : ''}"
			aria-describedby={pop?.id === p.id ? 'oc-pop' : undefined}
			onclick={() => { selectedId = p.id; pin(p.id); }}
			onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); selectedId = p.id; pin(p.id); } }}
			onmouseenter={() => hoverIn(p.id)}
			onmouseleave={hoverOut}
			onfocus={() => hoverIn(p.id)}
			onblur={hoverOut}
			ondragstart={(e) => { closePop(); dragId = p.id; e.dataTransfer?.setData('text/plain', p.id); if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move'; }}
			ondragend={() => { dragId = null; overId = null; }}
			ondragover={(e) => { if (canDrop(p)) { e.preventDefault(); overId = p.id; } }}
			ondragleave={() => overId === p.id && (overId = null)}
			ondrop={(e) => { e.preventDefault(); drop(p); }}
		>
			<span class="strip" style="background:{stripColor(p)}"></span>
			<div class="c-top">
				<span class="av" style="background:{toneOf(p)}">{initials(p.name)}</span>
				<div class="c-id">
					<div class="c-name">{p.name}{#if p.isSelf}<span class="you">You</span>{/if}</div>
					<div class="c-title">{p.title || PRESETS[p.preset]?.name}</div>
				</div>
				{#if moved(p)}<span class="mv" title="Reporting line changed — not applied yet"></span>{/if}
			</div>
			<div class="c-foot">
				<span class="tag" style="--t:{REACH[p.population]?.color}" title={POPULATIONS.find((o) => o.k === p.population)?.t}>
					{REACH[p.population]?.short}
				</span>
				{#if routed(p)}
					<span class="tag sign" class:bad={stalls(p)} title="{routed(p)} action{routed(p) === 1 ? '' : 's'} sent for sign-off">
						✎ {routed(p)}
					</span>
				{/if}
				{#if p.status === 'disabled'}<span class="tag quiet">Disabled</span>{:else if lapsed(p)}<span class="tag quiet">Lapsed</span>{/if}
				{#if up}<span class="tag step">Signs off</span>{/if}
				<span style="flex:1"></span>
				{#if ks.length}
					<button
						class="kids"
						class:shut={!open}
						onclick={(e) => { e.stopPropagation(); toggle(p.id); }}
						title={open ? 'Fold this team' : `Show ${subtreeSize(p.id)} beneath`}
						aria-expanded={open}
					>
						{open ? ks.length : `+${subtreeSize(p.id)}`}
						<svg width="9" height="9" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="m6 9 6 6 6-6" /></svg>
					</button>
				{/if}
			</div>
		</div>
		{#if ks.length && open && d < people.length}
			<ul class:lit={up || isSel}>
				{#each ks as k (k.id)}
					{@render node(k, d + 1)}
				{/each}
			</ul>
		{/if}
	</li>
{/snippet}

<style>
	.oc { display: flex; flex-direction: column; min-height: 460px; }
	.bar { display: flex; align-items: center; gap: 10px; padding: 11px 14px; border-bottom: 1px solid var(--ae-line); flex-wrap: wrap; }
	.find { display: flex; align-items: center; gap: 7px; padding: 5px 10px; border: 1px solid var(--ae-line-strong); border-radius: 9px; color: var(--ae-muted); min-width: 200px; }
	.find input { padding: 0; min-height: 0; box-shadow: none; border: 0; background: none; outline: none; color: var(--ae-text); font: inherit; font-size: 12.5px; width: 100%; }
	.find:focus-within { border-color: rgba(var(--ae-ember-rgb), 0.6); }
	.hitn { font-family: var(--ae-font-mono); font-size: 10px; padding: 1px 6px; border-radius: 999px; background: rgba(var(--ae-ember-rgb), 0.18); color: var(--ae-text); }
	.seg { display: flex; gap: 2px; padding: 3px; border-radius: 9px; background: var(--ae-line); }
	.seg button { position: relative; padding: 4px 10px; border-radius: 7px; font-size: 11.5px; border: 0; background: none; color: var(--ae-muted); cursor: pointer; }
	.seg button[aria-checked='true'] { background: var(--ae-card-bg); color: var(--ae-text); }
	.warn-dot { position: absolute; top: 3px; right: 3px; width: 5px; height: 5px; border-radius: 50%; background: var(--ae-crimson); }
	.tools { display: flex; align-items: center; gap: 3px; }
	.ic, .zl { height: 26px; min-width: 26px; display: grid; place-items: center; border-radius: 7px; border: 1px solid var(--ae-line-strong); background: none; color: var(--ae-text-2); cursor: pointer; font-size: 13px; }
	.zl { font-family: var(--ae-font-mono); font-size: 10px; padding: 0 7px; }
	.ic:hover, .zl:hover { border-color: rgba(var(--ae-ember-rgb), 0.5); }
	.sep { width: 1px; height: 18px; background: var(--ae-line-strong); margin: 0 4px; }

	.stats { display: flex; gap: 14px; flex-wrap: wrap; align-items: center; padding: 8px 14px; font-size: 11.5px; color: var(--ae-muted); border-bottom: 1px solid var(--ae-line); }
	.stats b { color: var(--ae-text); font-weight: 600; }
	.stat-warn { font: inherit; font-size: 11.5px; color: var(--ae-crimson); background: rgba(var(--ae-crimson-rgb), 0.1); border: 1px solid rgba(var(--ae-crimson-rgb), 0.35); border-radius: 999px; padding: 2px 9px; cursor: pointer; }
	.stat-warn b { color: inherit; }
	.stat-moved { color: var(--ae-amber); }
	.stat-moved b { color: inherit; }

	.route { min-height: 40px; box-sizing: border-box; display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 9px 14px; font-size: 11.5px; color: var(--ae-text-2); background: rgba(var(--ae-ember-rgb), 0.07); border-bottom: 1px solid var(--ae-line); }
	.route.drag { background: rgba(var(--ae-amber-rgb), 0.1); }
	.r-k { font-family: var(--ae-font-mono); font-size: 9.5px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ae-muted); }
	.r-k.reach { margin-left: auto; text-transform: none; letter-spacing: 0; font-family: inherit; font-size: 11.5px; }
	.r-chain { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; color: var(--ae-ember); }
	.r-p { font: inherit; font-size: 11.5px; padding: 2px 8px; border-radius: 6px; border: 1px solid rgba(var(--ae-ember-rgb), 0.35); background: none; color: var(--ae-text); cursor: pointer; }
	.r-p.me { cursor: default; background: rgba(var(--ae-ember-rgb), 0.18); }
	.r-p.first { border-color: var(--ae-ember); }
	.r-none { color: var(--ae-crimson); }

	.canvas { position: relative; flex: 1; overflow: auto; max-height: 68vh; min-height: 380px; padding: 22px 12px 30px;
		background-image: radial-gradient(var(--ae-line) 1px, transparent 1px); background-size: 18px 18px; }
	.inner { width: max-content; min-width: 100%; }
	.topwrap { position: sticky; top: 0; left: 0; z-index: 5; height: 0; display: flex; justify-content: center; }
	.topzone { margin-top: -14px; width: min(420px, 90%); box-shadow: 0 8px 24px rgba(0, 0, 0, 0.3); text-align: center; padding: 10px; font-size: 12px; color: var(--ae-amber); border: 1.5px dashed rgba(var(--ae-amber-rgb), 0.6); border-radius: 12px; background: var(--ae-modal-base); }
	.topzone.over { background: rgba(var(--ae-amber-rgb), 0.18); }

	/* ── tree ─────────────────────────────────────────────────────────── */
	.org, .org ul { list-style: none; margin: 0; padding: 0; display: flex; justify-content: center; }
	.org { gap: 28px; }
	.org ul { position: relative; padding-top: 22px; }
	.org li { position: relative; display: flex; flex-direction: column; align-items: center; padding: 22px 7px 0; }
	.org > li { padding-top: 0; }
	.org li::before, .org li::after { content: ''; position: absolute; top: 0; right: 50%; width: 50%; height: 22px; border-top: 1.5px solid var(--ae-line-strong); }
	.org li::after { right: auto; left: 50%; border-left: 1.5px solid var(--ae-line-strong); }
	.org > li::before, .org > li::after, .org li:only-child::before, .org li:only-child::after { display: none; }
	.org li:only-child { padding-top: 0; }
	.org li:first-child::before, .org li:last-child::after { border: 0 none; }
	.org li:last-child::before { border-right: 1.5px solid var(--ae-line-strong); border-radius: 0 10px 0 0; }
	.org li:first-child::after { border-radius: 10px 0 0 0; }
	.org ul::before { content: ''; position: absolute; top: 0; left: 50%; height: 22px; border-left: 1.5px solid var(--ae-line-strong); }
	/* The selected person's line upwards, lit all the way to the top. */
	.org li.up::after, .org li.up:last-child::before { border-left-color: var(--ae-ember); border-right-color: var(--ae-ember); }
	.org li.reach::after, .org li.reach:last-child::before { border-left-color: var(--ae-azure); border-right-color: var(--ae-azure); }
	.org ul.lit::before { border-left-color: var(--ae-ember); }

	/* ── card ─────────────────────────────────────────────────────────── */
	.card { position: relative; width: 184px; padding: 10px 10px 8px 13px; border-radius: 12px; border: 1px solid var(--ae-line-strong); background: var(--ae-modal-base); text-align: left; cursor: grab; overflow: hidden;
		transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease, border-color 0.15s ease; }
	.card:hover { transform: translateY(-2px); box-shadow: 0 8px 22px rgba(0, 0, 0, 0.25); }
	.card:focus-visible { outline: 2px solid var(--ae-ember); outline-offset: 2px; }
	.card:active { cursor: grabbing; }
	.card.sel { border-color: var(--ae-ember); box-shadow: 0 0 0 3px rgba(var(--ae-ember-rgb), 0.22), 0 10px 26px rgba(0, 0, 0, 0.28); }
	.card.up { border-color: rgba(var(--ae-ember-rgb), 0.65); }
	.card.reach { border-color: rgba(var(--ae-azure-rgb), 0.6); background: linear-gradient(0deg, rgba(var(--ae-azure-rgb), 0.07), rgba(var(--ae-azure-rgb), 0.07)), var(--ae-modal-base); }
	.card.hit { box-shadow: 0 0 0 2px rgba(var(--ae-amber-rgb), 0.7); }
	.card.off { filter: grayscale(0.9); opacity: 0.6; }
	.card.lapsed { border-style: dashed; }
	.card.dim { opacity: 0.28; }
	.card.ghost { opacity: 0.4; transform: scale(0.97); }
	.card.over { border-color: var(--ae-amber); box-shadow: 0 0 0 4px rgba(var(--ae-amber-rgb), 0.25); transform: scale(1.04); }
	.strip { position: absolute; left: 0; top: 0; bottom: 0; width: 4px; }
	.c-top { display: flex; gap: 9px; align-items: center; }
	.av { width: 30px; height: 30px; border-radius: 9px; flex: none; display: grid; place-items: center; font-size: 11px; font-weight: 600; color: #fff; }
	.c-id { min-width: 0; flex: 1; }
	.c-name { font-size: 12.5px; font-weight: 600; color: var(--ae-text); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.c-title { font-size: 10.5px; color: var(--ae-muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; margin-top: 1px; }
	.you { font-size: 8.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.06em; margin-left: 5px; padding: 1px 4px; border-radius: 4px; background: rgba(var(--ae-ember-rgb), 0.2); color: var(--ae-ember); vertical-align: 1px; }
	.mv { width: 7px; height: 7px; border-radius: 50%; background: var(--ae-amber); flex: none; box-shadow: 0 0 0 3px rgba(var(--ae-amber-rgb), 0.2); align-self: flex-start; }
	.c-foot { display: flex; align-items: center; gap: 4px; margin-top: 8px; flex-wrap: wrap; }
	.tag { font-family: var(--ae-font-mono); font-size: 8.5px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; padding: 2px 5px; border-radius: 5px; color: var(--t, var(--ae-muted)); border: 1px solid color-mix(in srgb, var(--t, var(--ae-muted)) 40%, transparent); }
	.tag.sign { --t: var(--ae-amber); }
	.tag.sign.bad { --t: var(--ae-crimson); }
	.tag.quiet { --t: var(--ae-muted); }
	.tag.step { --t: var(--ae-ember); background: rgba(var(--ae-ember-rgb), 0.14); }
	.kids { display: flex; align-items: center; gap: 3px; font-family: var(--ae-font-mono); font-size: 9.5px; font-weight: 600; padding: 2px 6px; border-radius: 999px; border: 1px solid var(--ae-line-strong); background: var(--ae-line); color: var(--ae-text-2); cursor: pointer; }
	.kids svg { transition: transform 0.15s ease; }
	.kids.shut { color: var(--ae-amber); border-color: rgba(var(--ae-amber-rgb), 0.45); }
	.kids.shut svg { transform: rotate(-90deg); }

	.keys { display: flex; flex-wrap: wrap; gap: 6px 16px; padding: 10px 14px; border-top: 1px solid var(--ae-line); font-size: 11px; color: var(--ae-text-2); }
	.key { display: inline-flex; align-items: center; gap: 6px; }
	.key i { width: 9px; height: 9px; border-radius: 3px; }
	.key.dim { color: var(--ae-muted); margin-left: auto; }

	/* ── details card ─────────────────────────────────────────────────── */
	.pop { position: fixed; z-index: 400; padding: 14px 14px 10px; border-radius: 14px; border: 1px solid var(--ae-line-strong); background: var(--ae-modal-base); color: var(--ae-text);
		box-shadow: 0 18px 48px rgba(0, 0, 0, 0.42); font-size: 12px; animation: pop-in 0.14s ease-out; }
	.pop::before { content: ''; position: absolute; top: 0; left: 0; right: 0; height: 3px; border-radius: 14px 14px 0 0; background: var(--tone); }
	.pop.pinned { border-color: color-mix(in srgb, var(--tone) 55%, var(--ae-line-strong)); }
	@keyframes pop-in { from { opacity: 0; transform: translateY(4px) scale(0.98); } }
	.p-head { display: flex; gap: 10px; align-items: flex-start; }
	.p-av { width: 40px; height: 40px; border-radius: 12px; flex: none; display: grid; place-items: center; font-size: 14px; font-weight: 600; color: #fff; background: var(--tone); }
	.p-id { min-width: 0; flex: 1; }
	.p-name { font-size: 14.5px; font-weight: 600; }
	.p-title { font-size: 11.5px; color: var(--ae-muted); margin-top: 1px; }
	.p-mail { display: block; font-family: var(--ae-font-mono); font-size: 10px; color: var(--ae-azure); margin-top: 3px; text-decoration: none; word-break: break-all; }
	.p-mail:hover { text-decoration: underline; }
	.p-x { width: 24px; height: 24px; border-radius: 7px; border: 1px solid var(--ae-line-strong); background: none; color: var(--ae-muted); cursor: pointer; font-size: 15px; line-height: 1; flex: none; }
	.p-x:hover { color: var(--ae-text); }
	.p-chips { display: flex; flex-wrap: wrap; gap: 5px; margin: 10px 0 4px; }
	.p-chip { font-size: 10px; padding: 2px 8px; border-radius: 999px; border: 1px solid var(--ae-line-strong); color: var(--ae-muted); }
	.p-chip.tone { color: var(--tone); border-color: color-mix(in srgb, var(--tone) 50%, transparent); }
	.p-chip.ok { color: var(--ae-verdant); border-color: rgba(var(--ae-verdant-rgb), 0.4); }
	.p-chip.bad { color: var(--ae-crimson); border-color: rgba(var(--ae-crimson-rgb), 0.45); }
	.p-chip.warn { color: var(--ae-amber); border-color: rgba(var(--ae-amber-rgb), 0.45); }
	.p-rows { margin: 8px 0 0; display: flex; flex-direction: column; }
	.p-rows > div { display: grid; grid-template-columns: 80px minmax(0, 1fr); gap: 10px; padding: 6px 0; border-top: 1px solid var(--ae-line); }
	.p-rows dt { font-family: var(--ae-font-mono); font-size: 9px; letter-spacing: 0.1em; text-transform: uppercase; color: var(--ae-muted); padding-top: 2px; }
	.p-rows dd { margin: 0; color: var(--ae-text-2); line-height: 1.45; }
	.p-muted { color: var(--ae-muted); }
	.p-bad { color: var(--ae-crimson); }
	.p-was { display: block; font-size: 10.5px; color: var(--ae-amber); }
	.p-link { font: inherit; padding: 0; border: 0; background: none; color: var(--ae-text); font-weight: 600; cursor: pointer; text-decoration: underline; text-decoration-color: var(--ae-line-strong); text-underline-offset: 3px; }
	.p-link:hover { text-decoration-color: currentColor; }
	.p-kids { display: flex; align-items: center; gap: 3px; margin-top: 5px; }
	.p-mini { width: 22px; height: 22px; padding: 0; border-radius: 7px; border: 0; color: #fff; font-size: 8.5px; font-weight: 600; cursor: pointer; }
	.p-mini:hover { outline: 2px solid var(--ae-text); outline-offset: 1px; }
	.p-bar { display: block; height: 4px; border-radius: 4px; background: var(--ae-line); margin-top: 5px; overflow: hidden; }
	.p-bar i { display: block; height: 100%; background: var(--tone); border-radius: 4px; }
	.p-list { margin: 4px 0 0; padding-left: 14px; font-size: 11px; color: var(--ae-muted); }
	.p-foot { display: flex; align-items: center; gap: 6px; margin-top: 10px; padding-top: 10px; border-top: 1px solid var(--ae-line); }
	.p-btn { font: inherit; font-size: 11.5px; font-weight: 500; padding: 5px 11px; border-radius: 8px; border: 1px solid color-mix(in srgb, var(--tone) 55%, transparent); background: color-mix(in srgb, var(--tone) 18%, transparent); color: var(--ae-text); cursor: pointer; }
	.p-btn.ghost { border-color: var(--ae-line-strong); background: none; color: var(--ae-text-2); }
	.p-btn:hover { filter: brightness(1.15); }
	.p-hint { margin-top: 8px; font-size: 10px; color: var(--ae-muted); text-align: center; }

	@media (prefers-reduced-motion: reduce) {
		.pop { animation: none; }
		.card, .kids svg { transition: none; }
		.card:hover { transform: none; }
	}
</style>
