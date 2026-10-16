<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import AccessTour from '$lib/components/AccessTour.svelte';
	import GlassSelect from '$lib/components/GlassSelect.svelte';
	import OrgChart from './OrgChart.svelte';
	import {
		ALL_CAP_KEYS,
		CAPS,
		CAP_MODULE,
		LEVELS,
		LEVEL_LABEL,
		MODULES,
		POPULATIONS,
		PRESETS,
		PRESET_KEYS,
		TONE_HEX,
		capLevels,
		effectiveLevel,
		baselineLevel,
		checkedToday,
		isLocked,
		grantedCount,
		isOverride,
		levelIndex,
		presetLevel,
		sodConflicts,
		type Capability,
		type Grantee,
		type Level,
		type Population
	} from '$lib/shared/access';

	let { data, form } = $props();

	type Person = Grantee & {
		id: string;
		email: string;
		name: string;
		title: string;
		isSelf: boolean;
	};

	// Working copy and the baseline it is diffed against. Everything the studio
	// changes stays here until Apply — the matrix is a place to think, and a
	// half-finished thought should not be anyone's live access.
	let people = $state<Person[]>(untrack(() => structuredClone(data.people)) as Person[]);
	let saved = $state<Person[]>(untrack(() => structuredClone(data.people)) as Person[]);
	$effect(() => {
		people = structuredClone(data.people) as Person[];
		saved = structuredClone(data.people) as Person[];
	});

	let view = $state<'org' | 'matrix' | 'sim'>('matrix');
	let selectedId = $state<string | null>(untrack(() => data.people[0]?.id ?? null));
	let simWho = $state<string>(untrack(() => data.people[0]?.id ?? ''));
	let moduleFilter = $state<string>('all');
	let drawerOpen = $state(false);
	let drawerTab = $state<'pending' | 'log'>('pending');
	let applying = $state(false);

	// The tour opens itself once, for whoever has not seen it. It is the page
	// that decides everyone else's access, so learning it by poking at the
	// controls is the wrong way to find out what they do.
	let tourOpen = $state(false);
	$effect(() => {
		try {
			if (!localStorage.getItem('champ-access-tour-seen')) tourOpen = true;
		} catch {
			// Blocked site data: no auto-open, the button is still there.
		}
	});

	const byId = (id: string | null) => people.find((p) => p.id === id) ?? null;
	const selected = $derived(byId(selectedId));
	const simPerson = $derived(byId(simWho) ?? people[0] ?? null);

	const initials = (n: string) =>
		n.split(/[\s.@]+/).filter(Boolean).map((w) => w[0]).slice(0, 2).join('').toUpperCase();
	const toneOf = (p: Person) => TONE_HEX[PRESETS[p.preset]?.tone ?? 'azure'];

	/** Editing anything on a locked preset is refused rather than silently
	 *  ignored: a super admin holds every capability by definition, so a matrix
	 *  cell that looks clickable and does nothing would be a lie. */
	function setCap(p: Person, cap: string, level: Level) {
		// A super admin's rows and a reserved row are fixed (isLocked).
		if (isLocked(p, cap)) return;
		// On a row the app checks, the baseline is the role's real access, not
		// the preset — so an override is anything that differs from that.
		const base = baselineLevel(p, cap);
		if (level === base) delete p.grants[cap];
		else p.grants[cap] = level;
		// A capability nobody can act on cannot need a second signature.
		if (levelIndex(level) < levelIndex('act')) delete p.checkers[cap];
		people = [...people];
	}

	function cycleCap(p: Person, cap: string) {
		const allowed = capLevels(cap);
		const cur = effectiveLevel(p, cap);
		setCap(p, cap, allowed[(allowed.indexOf(cur) + 1) % allowed.length]);
	}

	function setPreset(p: Person, preset: string) {
		p.preset = preset;
		// The overrides described differences from the old preset; against a new
		// one they mean something else entirely, so they go — except on the rows
		// the app checks, which start from the role and not the preset, so a
		// grant there means the same whatever preset is picked. Dropping one
		// would quietly take away something the person can really do.
		p.grants = Object.fromEntries(Object.entries(p.grants).filter(([cap]) => checkedToday(cap)));
		people = [...people];
	}

	function toggleEntity(p: Person, slug: string) {
		const all = data.entities.map((e) => e.slug);
		let list = p.entities === 'all' ? [...all] : [...p.entities];
		list = list.includes(slug) ? list.filter((s) => s !== slug) : [...list, slug];
		if (!list.length) return;
		p.entities = list.length === all.length ? 'all' : list;
		people = [...people];
	}
	function toggleTrack(p: Person, track: string) {
		const all = data.tracks as string[];
		let list = p.tracks === 'all' ? [...all] : [...p.tracks];
		list = list.includes(track) ? list.filter((t) => t !== track) : [...list, track];
		if (!list.length) return;
		p.tracks = list.length === all.length ? 'all' : list;
		people = [...people];
	}

	/** A person cannot be put under someone who already sits beneath them. */
	function wouldLoop(p: Person, managerId: string): boolean {
		let cur: string | null = managerId;
		const seen = new Set<string>();
		while (cur) {
			if (cur === p.id) return true;
			if (seen.has(cur)) return true;
			seen.add(cur);
			cur = byId(cur)?.reportsTo ?? null;
		}
		return false;
	}
	function setManager(p: Person, id: string) {
		if (id && wouldLoop(p, id)) return;
		p.reportsTo = id || null;
		people = [...people];
	}

	const managerOf = (p: Person) => (p.reportsTo ? byId(p.reportsTo) : null);

	// ── diff ────────────────────────────────────────────────────────────────
	type Diff = { who: string; id: string; t: string; a: string; b: string; kind: string };
	const diffs = $derived.by<Diff[]>(() => {
		const out: Diff[] = [];
		const base = new Map(saved.map((s) => [s.id, s]));
		for (const p of people) {
			const s = base.get(p.id);
			if (!s) continue;
			const add = (t: string, a: string, b: string, kind: string) =>
				out.push({ who: p.name, id: p.id, t, a, b, kind });
			if (s.preset !== p.preset)
				add('Role preset', PRESETS[s.preset]?.name ?? s.preset, PRESETS[p.preset]?.name ?? p.preset, 'role');
			if (s.reportsTo !== p.reportsTo)
				add('Reports to', base.get(s.reportsTo ?? '')?.name ?? 'nobody', byId(p.reportsTo ?? null)?.name ?? 'nobody', 'org');
			if (s.population !== p.population)
				add('Reach', POPULATIONS.find((o) => o.k === s.population)?.t ?? s.population,
					POPULATIONS.find((o) => o.k === p.population)?.t ?? p.population, 'scope');
			const ents = (v: 'all' | string[]) => (v === 'all' ? 'all entities' : `${v.length} entities`);
			if (ents(s.entities) !== ents(p.entities)) add('Entities', ents(s.entities), ents(p.entities), 'scope');
			const trk = (v: 'all' | string[]) => (v === 'all' ? 'all tracks' : v.join(', '));
			if (trk(s.tracks) !== trk(p.tracks)) add('Hiring tracks', trk(s.tracks), trk(p.tracks), 'scope');
			if (s.status !== p.status) add('Login', s.status, p.status, 'status');
			if ((s.accessExpiresAt ?? '') !== (p.accessExpiresAt ?? ''))
				add('Access ends', s.accessExpiresAt ?? 'never', p.accessExpiresAt ?? 'never', 'time');
			for (const cap of ALL_CAP_KEYS) {
				const before = effectiveLevel(s, cap);
				const after = effectiveLevel(p, cap);
				if (before !== after)
					add(CAPS[cap].label, LEVEL_LABEL[before], LEVEL_LABEL[after],
						levelIndex(after) > levelIndex(before) ? 'grant' : 'revoke');
			}
			for (const cap of new Set([...Object.keys(s.checkers), ...Object.keys(p.checkers)])) {
				if (!!s.checkers[cap] !== !!p.checkers[cap])
					add(CAPS[cap]?.label ?? cap, s.checkers[cap] ? 'needs sign-off' : 'direct',
						p.checkers[cap] ? 'needs sign-off' : 'direct', 'check');
			}
		}
		return out;
	});
	const dirtyIds = $derived(new Set(diffs.map((d) => d.id)));
	const changePayload = $derived(JSON.stringify(people.filter((p) => dirtyIds.has(p.id))));

	function resetAll() {
		people = structuredClone($state.snapshot(saved)) as Person[];
	}

	// ── simulator ───────────────────────────────────────────────────────────
	// The left rail and the buttons on a candidate record, resolved for one
	// person. Both lists name real capabilities, so what this shows is what the
	// matrix says — not a second opinion about it.
	const SIM_NAV = [
		{ label: 'Overview', cap: null },
		{ label: 'Candidates', cap: 'candidate.view' },
		{ label: 'Verification', cap: 'bgv.view' },
		{ label: 'Exits', cap: 'exit.particulars' },
		{ label: 'Entities', cap: 'entity.view' },
		{ label: 'Analytics', cap: 'analytics.view' },
		{ label: 'Inbox', cap: 'inbox.view' },
		{ label: 'Access & org', cap: 'team.permissions' }
	];
	const SIM_ACTIONS = [
		'candidate.approve', 'offer.draft', 'offer.preview', 'offer.send', 'offer.upload',
		'docs.sync', 'docs.upload', 'docs.reveal', 'docs.zip', 'it.send', 'empid.assign', 'empid.notify',
		'exit.fnf', 'export.run', 'candidate.delete'
	];

	function simVerdict(p: Person, cap: string) {
		const lv = effectiveLevel(p, cap);
		const mgr = managerOf(p);
		const pop = POPULATIONS.find((o) => o.k === p.population);
		if (p.status === 'disabled') return { cls: 'no', label: 'Blocked', why: 'Login is disabled.' };
		if (p.accessExpiresAt && new Date(p.accessExpiresAt) < new Date())
			return { cls: 'no', label: 'Lapsed', why: `Access ended ${p.accessExpiresAt}.` };
		if (lv === 'none')
			return { cls: 'no', label: 'Hidden', why: `Not granted on the ${PRESETS[p.preset]?.name} preset.` };
		if (lv === 'view') return { cls: 'rev', label: 'Read only', why: 'Can see it, cannot change it.' };
		if (p.checkers[cap])
			return {
				cls: 'rev',
				label: 'Send for sign-off',
				why: mgr ? `Goes to ${mgr.name} before it takes effect.` : 'Needs a manager, and nobody is set above them.'
			};
		return {
			cls: 'ok',
			label: lv === 'approve' ? 'Sign off' : 'Do it',
			why: `Allowed on ${pop?.t.toLowerCase() ?? 'their records'}.`
		};
	}

	// ── how the capabilities are shown ──────────────────────────────────────
	// Display-only grouping: the stored keys, the module each capability
	// belongs to and every preset's module ceilings are untouched. The
	// candidate powers that sit in Access & org (handed out per person, and
	// labelled "Candidates: …" there) are shown with the rest of Candidate
	// records instead, so everything about a candidate's record is in one place.
	type ViewCap = Capability & { short: string };
	type ViewSub = { title: string | null; note?: string; caps: ViewCap[] };
	type ViewGroup = { key: string; name: string; tone: string; subs: ViewSub[]; caps: ViewCap[] };
	const CAND_PREFIX = 'Candidates: ';
	const isCandidateExtra = (m: (typeof MODULES)[number], c: Capability) => m.key === 'access' && c.label.startsWith(CAND_PREFIX);
	const plain = (c: Capability): ViewCap => ({ ...c, short: c.label });
	const VIEW_GROUPS: ViewGroup[] = MODULES.map((m) => {
		let subs: ViewSub[];
		if (m.key === 'candidates') {
			const extra = MODULES.flatMap((x) => x.caps.filter((c) => isCandidateExtra(x, c))).map((c) => {
				const rest = c.label.slice(CAND_PREFIX.length);
				return { ...c, short: rest[0].toUpperCase() + rest.slice(1) };
			});
			subs = [
				{ title: 'Everyday', caps: m.caps.map(plain) },
				{ title: 'Sensitive · set per person', note: 'Checked by the app today; a change takes effect on Apply.', caps: extra }
			];
		} else {
			subs = [{ title: null, caps: m.caps.filter((c) => !isCandidateExtra(m, c)).map(plain) }];
		}
		return { key: m.key, name: m.name, tone: m.tone, subs, caps: subs.flatMap((x) => x.caps) };
	});

	let capQuery = $state('');
	let shut = $state(new Set<string>());
	const cq = $derived(capQuery.trim().toLowerCase());
	const capHit = (c: ViewCap) => !cq || `${c.short} ${c.label} ${c.key}`.toLowerCase().includes(cq);
	const visibleGroups = $derived(
		VIEW_GROUPS.filter((g) => moduleFilter === 'all' || g.key === moduleFilter)
			.map((g) => {
				const subs = g.subs.map((x) => ({ ...x, caps: x.caps.filter(capHit) })).filter((x) => x.caps.length);
				return { ...g, subs, caps: subs.flatMap((x) => x.caps) };
			})
			.filter((g) => g.caps.length)
	);
	const groupOpen = (key: string) => !!cq || !shut.has(key);
	function toggleGroup(key: string) {
		const next = new Set(shut);
		if (next.has(key)) next.delete(key);
		else next.add(key);
		shut = next;
	}
	const grantedIn = (p: Person, caps: ViewCap[]) => caps.filter((c) => effectiveLevel(p, c.key) !== 'none').length;

	// ── candidate records board ─────────────────────────────────────────────
	// Candidate records is drawn as cards rather than table rows: one card per
	// power, saying in plain words what it does, with a direct level switch
	// for each person instead of a cell you click round and round.
	const CAND = VIEW_GROUPS.find((g) => g.key === 'candidates')!;
	const CAND_INFO: Record<string, { d: string; icon: string }> = {
		'candidate.view': { d: 'See the candidate list and open anyone’s file.', icon: 'M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z' },
		'candidate.create': { d: 'Create a new hire and email them their onboarding link.', icon: 'M10 14a4 4 0 0 0 6 .5l3-3a4 4 0 0 0-5.7-5.7l-1.5 1.5M14 10a4 4 0 0 0-6-.5l-3 3a4 4 0 0 0 5.7 5.7l1.5-1.5' },
		'candidate.shift': { d: 'Set the working hours shown on the offer and IT mail.', icon: 'M12 7v5l3 2M12 3a9 9 0 1 0 0 18 9 9 0 0 0 0-18z' },
		'candidate.approve': { d: 'Sign off a submitted form so onboarding moves on.', icon: 'M9 12l2 2 4-4M12 3l7 3v6c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6z' },
		'candidate.decision': { d: 'Mark a candidate as accepted or rejected.', icon: 'M7 11v9H4v-9zM7 11l4-8a2 2 0 0 1 2 2v4h6a2 2 0 0 1 2 2.3l-1.4 7A2 2 0 0 1 17.6 20H7' },
		'candidate.edit': { d: 'Fix mistakes in what the candidate typed in.', icon: 'M4 20h4L19 9l-4-4L4 16zM14 6l4 4' },
		'candidate.link': { d: 'Kill a leaked link, or send the candidate a fresh one.', icon: 'M4 12a8 8 0 0 1 14-5.3M20 12a8 8 0 0 1-14 5.3M18 3v4h-4M6 21v-4h4' },
		'empid.uan': { d: 'Record the candidate’s Universal Account Number.', icon: 'M4 6h16v12H4zM8 10h3M8 14h6M16 10h.01' },
		'candidate.delete': { d: 'Remove the whole record for good. Cannot be undone.', icon: 'M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3' },
		'candidate.entity': { d: 'Move the hire to another company; the offer is re-letterheaded.', icon: 'M4 21V5l8-2v18M12 9h8v12M8 9h.01M8 13h.01M16 13h.01M16 17h.01' },
		'candidate.track': { d: 'Switch the hiring track; documents and offer are re-ruled.', icon: 'M6 3v12a3 3 0 0 0 3 3h9M15 15l3 3-3 3M6 3l-3 3M6 3l3 3' },
		'docs.upload': { d: 'File documents for a candidate who cannot use their link.', icon: 'M12 16V4M7 9l5-5 5 5M4 20h16' }
	};
	const candStats = $derived.by(() => {
		const active = people.filter((p) => p.status !== 'disabled');
		const can = (k: string) => active.filter((p) => effectiveLevel(p, k) !== 'none').length;
		const sensitive = CAND.subs[1]?.caps ?? [];
		return {
			people: active.length,
			open: can('candidate.view'),
			approve: can('candidate.approve'),
			del: can('candidate.delete'),
			handed: active.reduce((a, p) => a + sensitive.filter((c) => effectiveLevel(p, c.key) !== 'none').length, 0)
		};
	});
	const showBoard = $derived(moduleFilter === 'all' || moduleFilter === 'candidates');
	const boardSubs = $derived(CAND.subs.map((sb) => ({ ...sb, caps: sb.caps.filter(capHit) })).filter((sb) => sb.caps.length));
	const entityLabel = (p: Person) =>
		p.entities === 'all' ? `All ${data.entities.length} entities` : `${p.entities.length} entities`;
</script>

<svelte:head><title>Access &amp; reporting · ChampHR</title></svelte:head>

<div class="hd">
	<div>
		<div class="eyebrow">Access &amp; reporting</div>
		<h1>Who can do what, on whose records, and who signs it off.</h1>
	</div>
	<div class="modes" role="tablist" aria-label="Workspace mode">
		<button class="mode" role="tab" aria-selected={view === 'org'} onclick={() => (view = 'org')}>Org chart</button>
		<button class="mode" role="tab" aria-selected={view === 'matrix'} onclick={() => (view = 'matrix')}>Permission matrix</button>
		<button class="mode" role="tab" aria-selected={view === 'sim'} onclick={() => (view = 'sim')}>Simulate</button>
	</div>
	<button class="btn ghost small tourbtn" onclick={() => { tourOpen = true; }}>
		<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9" /><path d="M9.6 9.2a2.5 2.5 0 1 1 3.3 2.4c-.6.2-.9.7-.9 1.3v.4" /><path d="M12 17h.01" /></svg>
		Take the tour
	</button>
</div>

<div class="note">
	<strong>Authoring only, for now.</strong> Every capability below is mapped to the real routes and actions it
	governs, but the app still decides access from the three fixed roles it has always used. Applying saves the
	plan and writes an audit entry — it does not change what anyone can do today, and deliberately cannot: a
	preset saved here never overwrites the role the guards read, so nobody gets locked out of the live app by a
	reorganisation. The one exception is <b>Login enabled</b>, which takes effect immediately.
</div>

{#if form?.applied}
	<p class="saved-chip">Applied to {form.applied} {form.applied === 1 ? 'person' : 'people'} ✓</p>
{/if}
{#if form?.message}<p class="error">{form.message}</p>{/if}

<div class="stage">
	<div class="main card">
		{#if view === 'org'}
			<OrgChart {people} {saved} bind:selectedId {toneOf} {initials} {wouldLoop} onMove={setManager} entities={data.entities} />
		{:else if view === 'matrix'}
			<div class="mbar">
				<div class="picks">
					<button class="pick" aria-pressed={moduleFilter === 'all'} onclick={() => (moduleFilter = 'all')}>All modules</button>
					{#each VIEW_GROUPS as g (g.key)}
						<button class="pick" aria-pressed={moduleFilter === g.key} onclick={() => (moduleFilter = g.key)} style="--g:{TONE_HEX[g.tone as keyof typeof TONE_HEX]}"><span class="pick-dot"></span>{g.name}</button>
					{/each}
				</div>
				<div class="mtools">
					<label class="capfind">
						<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
						<input type="search" placeholder="Find a power…" bind:value={capQuery} aria-label="Find a capability" />
					</label>
					<button class="pick" onclick={() => (shut = new Set())}>Expand all</button>
					<button class="pick" onclick={() => (shut = new Set(VIEW_GROUPS.map((g) => g.key)))}>Collapse all</button>
					<span class="hint">Click a cell to change the level. A dot marks an override on top of the preset.</span>
				</div>
			</div>
			{#if showBoard && boardSubs.length}
				<section class="crec" aria-label="Candidate records">
					<header class="crec-h">
						<span class="crec-ic"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM19 8v6M22 11h-6" /></svg></span>
						<div class="crec-t">
							<h2>Candidate records</h2>
							<p>Every power over a candidate’s onboarding file, in one place. Pick a level for each person right on the card.</p>
						</div>
						<div class="crec-stats">
							<span><b>{candStats.open}</b>/{candStats.people} can open records</span>
							<span><b>{candStats.approve}</b> can approve</span>
							<span class:warn={candStats.del > 1}><b>{candStats.del}</b> can delete</span>
							<span><b>{candStats.handed}</b> sensitive grants</span>
						</div>
					</header>
					{#each boardSubs as sb (sb.title)}
						<div class="crec-band" class:sens={sb.title?.startsWith('Sensitive')}>
							<div class="crec-band-h">
								<span>{sb.title}</span>
								{#if sb.note}<small>{sb.note}</small>{/if}
							</div>
							<div class="crec-grid">
								{#each sb.caps as c (c.key)}
									{@const info = CAND_INFO[c.key]}
									<article class="pcard">
										<div class="pcard-top">
											<span class="pcard-ic"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d={info?.icon ?? 'M12 3v18M3 12h18'} /></svg></span>
											<div class="pcard-t">
												<h3>{c.short}</h3>
												<p>{info?.d ?? c.label}</p>
											</div>
										</div>
										<div class="pcard-tags">
											{#if c.enforced}<span class="inforce" title="The app checks this today — a change takes effect on Apply">in force</span>{/if}
											{#if c.reserved}<span class="reserved">super admin only</span>{/if}
											{#if c.wired === false}<span class="notwired">not wired</span>{/if}
											<span class="pcard-k" title={c.surface.join(' · ')}>{c.key}</span>
										</div>
										<ul class="pcard-people">
											{#each people as p (p.id)}
												{@const lv = effectiveLevel(p, c.key)}
												{@const locked = isLocked(p, c.key)}
												<li class:off={p.status === 'disabled'}>
													<button class="pp" onclick={() => (selectedId = p.id)} title="Open {p.name} in the panel">
														<span class="avatar tiny" style="background:{toneOf(p)}">{initials(p.name)}</span>
														<span class="pp-n">{p.name}</span>
														{#if isOverride(p, c.key)}<span class="od-key" title="Personal override on top of the preset"></span>{/if}
													</button>
													<div class="lvseg" role="radiogroup" aria-label="{c.short} for {p.name}">
														{#each LEVELS.filter((l) => capLevels(c.key).includes(l)) as l (l)}
															<button
																role="radio"
																data-lv={l}
																aria-checked={lv === l}
																disabled={locked}
																title={locked ? 'Super admins hold everything' : `${LEVEL_LABEL[l]} for ${p.name}`}
																onclick={() => setCap(p, c.key, l)}
															>{l === 'none' ? 'Off' : LEVEL_LABEL[l]}</button>
														{/each}
													</div>
												</li>
											{/each}
										</ul>
									</article>
								{/each}
							</div>
						</div>
					{/each}
				</section>
			{/if}
			{#if moduleFilter !== 'candidates'}
			<div class="mscroll">
				<table class="matrix">
					<thead>
						<tr>
							<th class="corner">Capability</th>
							{#each people as p (p.id)}
								<th>
									<button class="mh" onclick={() => (selectedId = p.id)} title="Edit {p.name}">
										<span class="avatar" style="background:{toneOf(p)}">{initials(p.name)}</span>
										<span class="mn">{p.name}</span>
										<span class="mr">{PRESETS[p.preset]?.name ?? p.preset}</span>
									</button>
								</th>
							{/each}
						</tr>
					</thead>
					<tbody>
						{#each visibleGroups.filter((x) => x.key !== 'candidates') as g (g.key)}
							{@const open = groupOpen(g.key)}
							<tr class="grouprow" style="--g:{TONE_HEX[g.tone as keyof typeof TONE_HEX]}">
								<th>
									<button class="gh" aria-expanded={open} onclick={() => toggleGroup(g.key)}>
										<svg class="chev" width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" aria-hidden="true"><path d="m6 9 6 6 6-6" /></svg>
										<span class="gdot"></span>{g.name}<span class="gcount">{g.caps.length}</span>
									</button>
								</th>
								{#each people as p (p.id)}
									<td><span class="gbadge" title="{p.name} has {grantedIn(p, g.caps)} of {g.caps.length} in {g.name}">{grantedIn(p, g.caps)}/{g.caps.length}</span></td>
								{/each}
							</tr>
							{#if open}
							{#each g.subs as sb (sb.title ?? 'all')}
							{#if sb.title && g.subs.length > 1}
								<tr class="subrow" style="--g:{TONE_HEX[g.tone as keyof typeof TONE_HEX]}">
									<th>{sb.title}{#if sb.note}<small>{sb.note}</small>{/if}</th>
									{#each people as p (p.id)}<td></td>{/each}
								</tr>
							{/if}
							{#each sb.caps as c (c.key)}
								<tr class="caprow-m">
									<th>
										<div class="cap-l">
											{c.short}
											{#if c.wired === false}<span class="notwired" title="No such control exists in the app yet">not wired</span>{/if}
										{#if c.enforced}<span class="inforce" title="The app checks this today — a change here takes effect as soon as it is applied">in force</span>{/if}
										{#if c.reserved}<span class="reserved" title="Kept for super admins: whoever holds it could make themselves a super admin, so it cannot be handed out">super admin only</span>{/if}
										</div>
										<div class="cap-k" title={c.surface.length ? c.surface.join('\n') : 'Nothing in the app implements this yet.'}>
											{c.key}{c.surface.length ? ` · ${c.surface.length} place${c.surface.length === 1 ? '' : 's'}` : ''}
										</div>
									</th>
									{#each people as p (p.id)}
										{@const lv = effectiveLevel(p, c.key)}
										{@const locked = isLocked(p, c.key)}
										<td>
											<button
												class="cell"
												data-lv={lv}
												class:locked
												disabled={locked}
												title={locked
													? c.reserved && p.role !== 'super_admin'
														? 'Kept for super admins — cannot be handed out'
														: 'Super admins hold everything'
													: checkedToday(c.key)
														? `${p.name} · ${c.label} — starts from their role (${p.role}), not the preset`
														: `${p.name} · ${c.label}`}
												onclick={() => cycleCap(p, c.key)}
											>
												{LEVEL_LABEL[lv]}{#if isOverride(p, c.key)}<span class="od"></span>{/if}
											</button>
										</td>
									{/each}
								</tr>
							{/each}
							{/each}
							{/if}
						{/each}
						{#if !visibleGroups.some((x) => x.key !== 'candidates')}
							<tr><td class="nomatch" colspan={people.length + 1}>No power matches “{capQuery}”.</td></tr>
						{/if}
					</tbody>
				</table>
			</div>
			{/if}
			<!-- What the cells mean, in the matrix's own chips so each line sits beside
			     the thing it explains. Not every capability offers every level: a
			     read-only one stops at View, a pure gate is — or Sign. -->
			<section class="legend" aria-label="What the access levels mean">
				<h3>What the levels mean</h3>
				<dl>
					<div><dt><span class="cell" data-lv="none">{LEVEL_LABEL.none}</span></dt><dd><b>No access.</b> Can’t see or use it.</dd></div>
					<div><dt><span class="cell" data-lv="view">{LEVEL_LABEL.view}</span></dt><dd><b>Read-only.</b> Can look, but not change anything.</dd></div>
					<div><dt><span class="cell" data-lv="act">{LEVEL_LABEL.act}</span></dt><dd><b>Can do it</b> — edit, save, send.</dd></div>
					<div><dt><span class="cell" data-lv="approve">{LEVEL_LABEL.approve}</span></dt><dd><b>Can sign it off.</b> Only on rows that need an approval.</dd></div>
					<div><dt><span class="inforce">in force</span></dt><dd>The app checks this row today; a change takes effect on Apply. It starts from the person’s role, not their preset.</dd></div>
				<div><dt><span class="reserved">super admin only</span></dt><dd>Stays with super admins. Whoever held it could make themselves one, so it can’t be handed out.</dd></div>
					<div><dt><span class="notwired">not wired</span></dt><dd>Nothing in the app implements it yet, so a level here does nothing.</dd></div>
					<div><dt><span class="od-key"></span></dt><dd>A dot is a personal override on top of the person’s preset.</dd></div>
				</dl>
				<p>Rows with neither tag are recorded here but still decided by the person’s role elsewhere in the app.</p>
			</section>
		{:else}
			<div class="sim">
				<div class="simhead">
					<label for="simwho">Preview as</label>
					<div class="simpick">
						<GlassSelect
							id="simwho"
							ariaLabel="Preview as"
							bind:value={simWho}
							options={people.map((p) => ({ value: p.id, label: `${p.name} — ${PRESETS[p.preset]?.name ?? ''}` }))}
						/>
					</div>
					<span class="hint">Exactly what this person sees and can press, before you apply.</span>
				</div>
				{#if simPerson}
					<div class="scope">
						<strong>{simPerson.name}</strong> can reach:
						{POPULATIONS.find((o) => o.k === simPerson.population)?.t.toLowerCase()} ·
						{entityLabel(simPerson)} ·
						{simPerson.tracks === 'all' ? 'all hiring tracks' : simPerson.tracks.join(', ')}
						{#if simPerson.accessExpiresAt}· access ends {simPerson.accessExpiresAt}{/if}
						{#if simPerson.status === 'disabled'}· <b class="bad">login disabled</b>{/if}
					</div>
					<div class="simgrid">
						<div class="simnav">
							<div class="sec-t">Their left rail</div>
							{#each SIM_NAV as item (item.label)}
								{@const ok = !item.cap || effectiveLevel(simPerson, item.cap) !== 'none'}
								<div class="navrow" class:blocked={!ok}>
									<span>{item.label}</span>
									{#if !ok}<span class="tiny">hidden</span>{/if}
								</div>
							{/each}
						</div>
						<div class="simrec">
							<div class="sec-t">On a candidate record</div>
							{#each SIM_ACTIONS as cap (cap)}
								{@const v = simVerdict(simPerson, cap)}
								<div class="simact">
									<div class="sa-n">
										{CAPS[cap].label}
										<div class="sa-why">{v.why}</div>
									</div>
									<span class="pillbtn {v.cls}">{v.label}</span>
								</div>
							{/each}
						</div>
					</div>
				{/if}
			</div>
		{/if}
	</div>

	<aside class="insp card">
		{#if selected}
			{@const p = selected}
			{@const conflicts = sodConflicts(p)}
			{@const locked = !!PRESETS[p.preset]?.locked}
			<div class="insp-head">
				<span class="avatar big" style="background:{toneOf(p)}">{initials(p.name)}</span>
				<div style="min-width:0">
					<div class="insp-name">{p.name}</div>
					<div class="insp-title">{p.title || PRESETS[p.preset]?.name}</div>
					<div class="insp-mail">{p.email}</div>
				</div>
			</div>
			<div class="chips">
				<span class="chip" style="color:{toneOf(p)};border-color:{toneOf(p)}">{PRESETS[p.preset]?.name}</span>
				<span class="chip">{grantedCount(p)} of {ALL_CAP_KEYS.length} powers</span>
				{#if p.isSelf}<span class="chip">You</span>{/if}
			</div>

			<div class="insp-body">
				<div class="sec">
					<div class="sec-t">Role &amp; reporting</div>
					<label class="fld">
						<span>Role preset</span>
						<GlassSelect
							ariaLabel="Role preset"
							value={p.preset}
							disabled={locked || p.isSelf}
							onChange={(v) => setPreset(p, v)}
							options={PRESET_KEYS.map((k) => ({
								value: k,
								label: `${PRESETS[k].name}${PRESETS[k].legacy ? ' (in force today)' : ''}`
							}))}
						/>
						<small>{PRESETS[p.preset]?.note ?? ''}</small>
					</label>
					<label class="fld">
						<span>Reports to</span>
						<GlassSelect
							ariaLabel="Reports to"
							value={p.reportsTo ?? ''}
							onChange={(v) => setManager(p, v)}
							options={[
								{ value: '', label: '— Nobody (top of the chart)' },
								...people.filter((o) => o.id !== p.id && !wouldLoop(p, o.id)).map((o) => ({ value: o.id, label: o.name }))
							]}
						/>
						<small>
							{#if managerOf(p)}Sign-offs route to <b>{managerOf(p)!.name}</b>.{:else}Nobody above them, so anything needing sign-off will stall.{/if}
						</small>
					</label>
				</div>

				<div class="sec">
					<div class="sec-t">Whose records</div>
					<div class="fld">
						<span>Entities</span>
						<div class="picks">
							{#each data.entities as e (e.slug)}
								<button class="pick mini" aria-pressed={p.entities === 'all' || p.entities.includes(e.slug)} onclick={() => toggleEntity(p, e.slug)}>{e.name}</button>
							{/each}
						</div>
					</div>
					<div class="fld">
						<span>Hiring tracks</span>
						<div class="picks">
							{#each data.tracks as t (t)}
								<button class="pick mini" aria-pressed={p.tracks === 'all' || p.tracks.includes(t)} onclick={() => toggleTrack(p, t)}>{t}</button>
							{/each}
						</div>
					</div>
					<div class="fld">
						<span>Reach</span>
						<div class="radios">
							{#each POPULATIONS as o (o.k)}
								<button class="radio" aria-checked={p.population === o.k} role="radio" onclick={() => { p.population = o.k as Population; people = [...people]; }}>
									<span class="bullet"></span>
									<span><span class="rt">{o.t}</span><span class="rd">{o.d}</span></span>
								</button>
							{/each}
						</div>
					</div>
				</div>

				<div class="sec">
					<div class="sec-t">Separation of duties</div>
					{#if locked}
						<div class="sod ok">Super admins sit outside these checks. Keep the count of them low.</div>
					{:else if conflicts.length}
						{#each conflicts as c (c.a + c.b)}
							<div class="sod">
								<div class="st">{c.t}</div>
								<div class="sd">{c.d}</div>
								<button class="btn ghost small" onclick={() => { p.checkers[c.b] = true; people = [...people]; }}>
									Send “{CAPS[c.b].label.toLowerCase()}” for sign-off
								</button>
							</div>
						{/each}
					{:else}
						<div class="sod ok">No maker-and-checker clashes on this person.</div>
					{/if}
				</div>

				<div class="sec">
					<div class="sec-t">
						What they can do
						{#if Object.keys(p.grants).length && !locked}
							<button class="pick mini" onclick={() => { p.grants = {}; people = [...people]; }}>Back to preset</button>
						{/if}
					</div>
					{#each VIEW_GROUPS as g (g.key)}
						{@const on = grantedIn(p, g.caps)}
						<details class="grp" style="--g:{TONE_HEX[g.tone as keyof typeof TONE_HEX]}" open={g.key === 'candidates'}>
							<summary>
								<span class="gdot"></span>
								<span class="gn">{g.name}</span>
								<span class="gc">{on}/{g.caps.length}</span>
							</summary>
							{#each g.subs as sb (sb.title ?? 'all')}
							{#if sb.title && g.subs.length > 1}<div class="grp-sub">{sb.title}</div>{/if}
							{#each sb.caps as c (c.key)}
								<div class="caprow">
									<div class="cap-id">
										<div class="cap-l">{c.short}{#if c.enforced}<span class="inforce" title="The app checks this today — a change here takes effect as soon as it is applied">in force</span>{/if}{#if c.reserved}<span class="reserved" title="Kept for super admins — cannot be handed out">super admin only</span>{/if}{#if isOverride(p, c.key)}<span class="ovr"></span>{/if}</div>
										<div class="cap-k">{c.surface.length ? c.surface[0] : 'not wired yet'}{c.surface.length > 1 ? ` +${c.surface.length - 1}` : ''}{p.checkers[c.key] ? ' · needs sign-off' : ''}</div>
									</div>
									<div class="seg">
										{#each LEVELS as l (l)}
											{@const allowed = capLevels(c.key).includes(l)}
											<button
												data-lv={l}
												aria-pressed={effectiveLevel(p, c.key) === l}
												disabled={!allowed || isLocked(p, c.key)}
												onclick={() => setCap(p, c.key, l)}
											>{LEVEL_LABEL[l]}</button>
										{/each}
									</div>
								</div>
							{/each}
							{/each}
						</details>
					{/each}
				</div>

				<div class="sec">
					<div class="sec-t">Sign-off &amp; expiry</div>
					{#if Object.keys(p.checkers).filter((k) => p.checkers[k]).length}
						<div class="picks">
							{#each Object.keys(p.checkers).filter((k) => p.checkers[k]) as cap (cap)}
								<button class="pick mini" aria-pressed="true" onclick={() => { delete p.checkers[cap]; people = [...people]; }}>{CAPS[cap]?.label ?? cap} ×</button>
							{/each}
						</div>
					{:else}
						<small>Nothing routed for a second signature yet.</small>
					{/if}
					<label class="fld">
						<span>Access ends on</span>
						<input type="date" value={p.accessExpiresAt ?? ''} onchange={(e) => { p.accessExpiresAt = e.currentTarget.value || null; people = [...people]; }} />
						<small>Blank is permanent. Contractors and stand-ins should always carry a date.</small>
					</label>
					<label class="tog">
						<input type="checkbox" checked={p.status === 'active'} disabled={p.isSelf} onchange={(e) => { p.status = e.currentTarget.checked ? 'active' : 'disabled'; people = [...people]; }} />
						<span>Login enabled{p.isSelf ? ' — you cannot disable your own' : ''}</span>
					</label>
				</div>
			</div>
		{:else}
			<div class="insp-empty">Pick a person from the matrix to set what they can do.</div>
		{/if}
	</aside>
</div>

<AccessTour bind:open={tourOpen} setView={(v) => (view = v)} />

<footer class="changebar">
	<span class="cb-dot" class:hot={diffs.length}></span>
	<span>
		{#if diffs.length}
			<b>{diffs.length}</b> unsaved change{diffs.length === 1 ? '' : 's'} across {dirtyIds.size}
			{dirtyIds.size === 1 ? 'person' : 'people'}
		{:else}No unsaved changes{/if}
	</span>
	<span style="flex:1"></span>
	<button class="btn ghost small" onclick={resetAll} disabled={!diffs.length}>Reset</button>
	<button class="btn ghost small" onclick={() => { drawerOpen = true; drawerTab = 'pending'; }}>Review changes</button>
	<form
		method="POST"
		action="?/applyAccess"
		use:enhance={() => { applying = true; return async ({ update }) => { await update({ reset: false }); applying = false; drawerOpen = false; }; }}
	>
		<input type="hidden" name="changes" value={changePayload} />
		<button class="btn small" disabled={!diffs.length || applying}>{applying ? 'Applying…' : 'Apply access'}</button>
	</form>
</footer>

{#if drawerOpen}
	<div class="scrim" role="button" tabindex="-1" onclick={() => (drawerOpen = false)} onkeydown={(e) => e.key === 'Escape' && (drawerOpen = false)}>
		<!-- svelte-ignore a11y_click_events_have_key_events -- click-catcher only -->
		<div class="drawer" role="dialog" aria-modal="true" tabindex="-1" aria-label="Review access changes" onclick={(e) => e.stopPropagation()}>
			<div class="drawer-h">
				<h2>Review access changes</h2>
				<button class="btn ghost small" onclick={() => (drawerOpen = false)}>Close</button>
			</div>
			<div class="dtabs" role="tablist" aria-label="Change review">
				<button role="tab" aria-selected={drawerTab === 'pending'} onclick={() => (drawerTab = 'pending')}>Pending</button>
				<button role="tab" aria-selected={drawerTab === 'log'} onclick={() => (drawerTab = 'log')}>Recent activity</button>
			</div>
			<div class="drawer-b">
				{#if drawerTab === 'log'}
					{#each data.recent as l (l.when + l.who)}
						<div class="diff"><div class="dt">{l.what}</div><div class="dm">{new Date(l.when).toLocaleString('en-IN')} · {l.who}</div></div>
					{:else}
						<p class="empty">Nothing applied from this page yet.</p>
					{/each}
				{:else if diffs.length}
					{#each [...new Set(diffs.map((d) => d.who))] as who (who)}
						<div class="dgroup">
							<div class="sec-t">{who}</div>
							{#each diffs.filter((d) => d.who === who) as d (d.t + d.a + d.b)}
								<div class="diff">
									<div class="dt">{d.t}</div>
									<div class="dm"><b>{d.a}</b> → <b>{d.b}</b></div>
								</div>
							{/each}
						</div>
					{/each}
				{:else}
					<p class="empty">Nothing to apply. Change a preset, a reach or a capability and it will be listed here first.</p>
				{/if}
			</div>
			<div class="drawer-f">
				<span class="hint">Applying writes an audit entry per person.</span>
			</div>
		</div>
	</div>
{/if}

<style>
	.hd { display: flex; align-items: flex-start; gap: 16px; flex-wrap: wrap; margin-bottom: 12px; }
	.hd h1 { font-size: 18px; margin: 2px 0 0; letter-spacing: -0.01em; }
	.modes { display: flex; gap: 2px; padding: 3px; border-radius: 11px; background: var(--ae-line); border: 1px solid var(--ae-line-strong); margin-left: auto; }
	.mode { padding: 6px 13px; border-radius: 8px; font-size: 12.5px; font-weight: 500; color: var(--ae-muted); background: none; border: 0; cursor: pointer; }
	.mode[aria-selected='true'] { background: var(--ae-card-bg); color: var(--ae-text); }
	.tourbtn { align-self: center; }
	/* Ringed by the tour while it is talking about this part of the page. Global
	   because the tour toggles the class on elements it does not own. */
	:global(.tour-ring) {
		outline: 2px solid var(--ae-amber);
		outline-offset: 3px;
		border-radius: 12px;
		transition: outline-color 0.2s ease;
	}
	.note { font-size: 11.5px; line-height: 1.55; color: var(--ae-text-2); border: 1px solid rgba(var(--ae-azure-rgb), 0.3); background: rgba(var(--ae-azure-rgb), 0.09); border-radius: 10px; padding: 10px 13px; margin-bottom: 14px; }
	.stage { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 14px; align-items: start; }
	.main { padding: 0; overflow: hidden; min-height: 460px; }
	.insp { padding: 16px; max-height: 78vh; display: flex; flex-direction: column; }

	.mbar { display: flex; align-items: center; gap: 12px; padding: 11px 14px; border-bottom: 1px solid var(--ae-line); flex-wrap: wrap; }
	.picks { display: flex; flex-wrap: wrap; gap: 5px; }
	.pick { padding: 5px 9px; border-radius: 7px; border: 1px solid var(--ae-line-strong); background: transparent; font-size: 11.5px; color: var(--ae-muted); cursor: pointer; }
	.pick[aria-pressed='true'] { background: rgba(var(--ae-ember-rgb), 0.16); border-color: rgba(var(--ae-ember-rgb), 0.5); color: var(--ae-text); }
	.pick.mini { padding: 4px 8px; font-size: 11px; }
	.hint { font-size: 11px; color: var(--ae-muted); }

	.mscroll { overflow: auto; max-height: 70vh; }
	table.matrix { border-collapse: separate; border-spacing: 0; font-size: 12px; min-width: 100%; }
	.matrix th, .matrix td { padding: 0; text-align: left; }
	.matrix thead th { position: sticky; top: 0; z-index: 3; background: var(--ae-modal-base); border-bottom: 1px solid var(--ae-line-strong); padding: 8px 10px; }
	.matrix thead th.corner { left: 0; z-index: 4; min-width: 260px; font-family: var(--ae-font-mono); font-size: 9.5px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ae-muted); }
	.mh { display: flex; flex-direction: column; align-items: center; gap: 4px; width: 104px; background: none; border: 0; cursor: pointer; color: inherit; }
	.mn { font-size: 11px; font-weight: 600; text-align: center; line-height: 1.2; }
	.mr { font-family: var(--ae-font-mono); font-size: 8.5px; text-transform: uppercase; color: var(--ae-muted); }
	.matrix tbody th { position: sticky; left: 0; z-index: 2; background: var(--ae-modal-base); border-right: 1px solid var(--ae-line-strong); border-bottom: 1px solid var(--ae-line); padding: 7px 12px; font-weight: 400; }
	.matrix tbody td { border-bottom: 1px solid var(--ae-line); padding: 5px 8px; text-align: center; }
	/* Section headers: the module's own colour, a count, and how many of its
	   powers each person holds — collapsible, so a long matrix stays navigable. */
	tr.grouprow th, tr.grouprow td { background: color-mix(in srgb, var(--g) 9%, var(--ae-modal-base)); border-top: 1px solid color-mix(in srgb, var(--g) 30%, transparent); }
	tr.grouprow th { padding: 0; }
	.gh { display: flex; align-items: center; gap: 8px; width: 100%; padding: 9px 12px; border: 0; background: none; cursor: pointer; text-align: left; font: inherit; font-size: 12.5px; font-weight: 600; color: var(--ae-text); }
	.gh .chev { color: var(--ae-muted); transition: transform 0.15s ease; }
	.gh[aria-expanded='false'] .chev { transform: rotate(-90deg); }
	.gdot { width: 8px; height: 8px; border-radius: 50%; background: var(--g); flex: none; box-shadow: 0 0 0 3px color-mix(in srgb, var(--g) 22%, transparent); }
	.gcount { margin-left: 2px; font-family: var(--ae-font-mono); font-size: 10px; font-weight: 600; padding: 1px 6px; border-radius: 999px; color: var(--ae-muted); background: var(--ae-line); }
	.gbadge { display: inline-block; font-family: var(--ae-font-mono); font-size: 10px; font-weight: 600; padding: 2px 7px; border-radius: 999px; color: var(--ae-text-2); border: 1px solid color-mix(in srgb, var(--g) 40%, transparent); }
	tr.subrow th { padding: 7px 12px 5px 30px; font-family: var(--ae-font-mono); font-size: 9.5px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--g); background: var(--ae-modal-base); border-bottom: 1px solid var(--ae-line); }
	tr.subrow th small { display: block; margin-top: 2px; font-family: var(--ae-font-body); font-size: 10.5px; letter-spacing: 0; text-transform: none; color: var(--ae-muted); }
	tr.subrow td { background: var(--ae-modal-base); border-bottom: 1px solid var(--ae-line); }
	tr.caprow-m th { padding-left: 30px; }
	tr.caprow-m:hover th, tr.caprow-m:hover td { background: color-mix(in srgb, var(--ae-text) 3%, var(--ae-modal-base)); }
	.nomatch { padding: 22px; text-align: center; color: var(--ae-muted); font-size: 12px; }
	.mtools { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; width: 100%; }
	.capfind { display: flex; align-items: center; gap: 7px; padding: 5px 10px; border: 1px solid var(--ae-line-strong); border-radius: 8px; color: var(--ae-muted); min-width: 200px; }
	.capfind:focus-within { border-color: rgba(var(--ae-ember-rgb), 0.6); }
	.capfind input { border: 0; background: none; outline: none; padding: 0; min-height: 0; box-shadow: none; color: var(--ae-text); font: inherit; font-size: 12px; width: 100%; }
	.pick-dot { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--g); margin-right: 6px; vertical-align: 1px; }
	.grp summary .gdot { width: 7px; height: 7px; }
	.grp-sub { padding: 7px 10px 4px; border-top: 1px solid var(--ae-line); font-family: var(--ae-font-mono); font-size: 9px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--g); }
	.cap-l { font-size: 12px; }
	.cap-k { font-family: var(--ae-font-mono); font-size: 9px; color: var(--ae-muted); margin-top: 1px; opacity: 0.8; }
	.reserved { font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; border: 1px solid rgba(var(--ae-crimson-rgb), 0.45); border-radius: 5px; padding: 1px 4px; margin-left: 6px; color: var(--ae-crimson); }
	.legend dt .reserved { margin-left: 0; }
	.inforce { font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; border: 1px solid rgba(var(--ae-verdant-rgb), 0.45); border-radius: 5px; padding: 1px 4px; margin-left: 6px; color: var(--ae-verdant); }
	.notwired { font-size: 9px; text-transform: uppercase; letter-spacing: 0.06em; border: 1px solid var(--ae-line-strong); border-radius: 5px; padding: 1px 4px; margin-left: 6px; color: var(--ae-muted); }
	.cell { width: 68px; padding: 4px 0; border-radius: 7px; font-family: var(--ae-font-mono); font-size: 9px; font-weight: 600; text-transform: uppercase; border: 1px solid transparent; cursor: pointer; }
	.cell[data-lv='none'] { background: var(--ae-line); color: var(--ae-muted); }
	.cell[data-lv='view'] { background: rgba(var(--ae-azure-rgb), 0.18); color: var(--ae-azure); }
	.cell[data-lv='act'] { background: rgba(var(--ae-ember-rgb), 0.2); color: var(--ae-ember); }
	.cell[data-lv='approve'] { background: rgba(var(--ae-verdant-rgb), 0.2); color: var(--ae-verdant); }
	.cell.locked { opacity: 0.5; cursor: not-allowed; }
	.legend { margin-top: 14px; padding: 14px 16px; border: 1px solid var(--ae-line); border-radius: 12px; max-width: 760px; }
	.legend h3 { margin: 0 0 10px; font-size: 12px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; color: var(--ae-text-2); }
	.legend dl { margin: 0; display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 8px 20px; }
	.legend dl > div { display: flex; align-items: center; gap: 10px; }
	.legend dt { flex: 0 0 76px; display: flex; justify-content: center; }
	.legend dt .cell { display: inline-block; text-align: center; cursor: default; }
	.legend dt .inforce, .legend dt .notwired { margin-left: 0; }
	.legend dd { margin: 0; font-size: 12px; color: var(--ae-muted); line-height: 1.4; }
	.legend dd b { color: var(--ae-text); font-weight: 600; }
	.legend p { margin: 10px 0 0; font-size: 11.5px; color: var(--ae-muted); }
	.od-key { display: inline-block; width: 6px; height: 6px; border-radius: 50%; background: var(--ae-muted); }
	.od { display: inline-block; width: 4px; height: 4px; border-radius: 50%; background: currentColor; margin-left: 4px; vertical-align: middle; }

	.avatar { width: 26px; height: 26px; border-radius: 8px; display: grid; place-items: center; font-size: 10px; font-weight: 600; color: #fff; }
	.avatar.big { width: 40px; height: 40px; border-radius: 12px; font-size: 14px; }

	.insp-head { display: flex; gap: 11px; align-items: flex-start; }
	.insp-name { font-size: 15px; font-weight: 600; }
	.insp-title { font-size: 11.5px; color: var(--ae-muted); margin-top: 2px; }
	.insp-mail { font-family: var(--ae-font-mono); font-size: 10px; color: var(--ae-muted); margin-top: 3px; word-break: break-all; }
	.chips { display: flex; gap: 6px; flex-wrap: wrap; margin: 10px 0 4px; }
	.chip { font-size: 10px; padding: 2px 7px; border-radius: 999px; border: 1px solid var(--ae-line-strong); color: var(--ae-muted); }
	.insp-body { overflow-y: auto; flex: 1; min-height: 0; padding-right: 4px; }
	.insp-empty { color: var(--ae-muted); font-size: 12px; padding: 30px 6px; text-align: center; }
	.sec { padding: 14px 0; border-bottom: 1px solid var(--ae-line); }
	.sec:last-child { border-bottom: none; }
	.sec-t { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-family: var(--ae-font-mono); font-size: 9.5px; letter-spacing: 0.14em; text-transform: uppercase; color: var(--ae-muted); margin-bottom: 9px; }
	.fld { display: flex; flex-direction: column; gap: 5px; margin-bottom: 11px; font-size: 11.5px; color: var(--ae-text-2); font-weight: 600; }
	.fld small { font-weight: 400; color: var(--ae-muted); font-size: 10.5px; line-height: 1.45; }
	.fld input[type='date'] { font-family: inherit; font-size: 12.5px; padding: 7px 9px; border: 1px solid var(--ae-line-strong); border-radius: 8px; background: transparent; color: var(--ae-text-2); }
	.radios { display: flex; flex-direction: column; gap: 3px; }
	.radio { display: flex; gap: 9px; align-items: flex-start; padding: 7px 9px; border-radius: 9px; border: 1px solid transparent; background: none; text-align: left; cursor: pointer; color: inherit; }
	.radio[aria-checked='true'] { background: rgba(var(--ae-ember-rgb), 0.1); border-color: rgba(var(--ae-ember-rgb), 0.34); }
	.radio .bullet { width: 13px; height: 13px; border-radius: 50%; border: 1.5px solid var(--ae-muted); flex: none; margin-top: 2px; }
	.radio[aria-checked='true'] .bullet { border-color: var(--ae-ember); background: var(--ae-ember); }
	.rt { font-size: 12px; font-weight: 500; display: block; }
	.rd { font-size: 10.5px; color: var(--ae-muted); display: block; margin-top: 2px; line-height: 1.4; }
	.sod { border: 1px solid rgba(var(--ae-crimson-rgb), 0.4); background: rgba(var(--ae-crimson-rgb), 0.09); border-radius: 10px; padding: 10px 11px; margin-bottom: 7px; }
	.sod.ok { border-color: rgba(var(--ae-verdant-rgb), 0.32); background: rgba(var(--ae-verdant-rgb), 0.08); font-size: 11.5px; color: var(--ae-text-2); }
	.sod .st { font-size: 12px; font-weight: 600; color: var(--ae-crimson); }
	.sod .sd { font-size: 11px; color: var(--ae-text-2); margin: 4px 0 8px; line-height: 1.45; }
	.grp { border: 1px solid var(--ae-line); border-radius: 10px; margin-bottom: 7px; }
	.grp summary { display: flex; align-items: center; gap: 8px; padding: 8px 10px; cursor: pointer; font-size: 12.5px; list-style: none; }
	.grp summary::-webkit-details-marker { display: none; }
	.gn { flex: 1; }
	.gc { font-family: var(--ae-font-mono); font-size: 10px; color: var(--ae-muted); }
	.caprow { display: flex; align-items: center; gap: 8px; padding: 6px 10px; border-top: 1px solid var(--ae-line); }
	.cap-id { flex: 1; min-width: 0; }
	.ovr { display: inline-block; width: 5px; height: 5px; border-radius: 50%; background: var(--ae-ember); margin-left: 5px; vertical-align: middle; }
	.seg { display: flex; gap: 1px; padding: 2px; border-radius: 8px; background: var(--ae-line-strong); flex: none; }
	.seg button { padding: 3px 7px; border-radius: 6px; font-family: var(--ae-font-mono); font-size: 9px; text-transform: uppercase; font-weight: 600; color: var(--ae-muted); background: none; border: 0; cursor: pointer; }
	.seg button:disabled { opacity: 0.25; cursor: not-allowed; }
	.seg button[aria-pressed='true'] { background: var(--ae-card-bg); color: var(--ae-text); }
	.tog { display: flex; align-items: center; gap: 8px; font-size: 11.5px; color: var(--ae-text-2); }

	.sim { padding: 16px 18px 22px; }
	.simhead { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 12px; font-size: 11.5px; }
	.simpick { min-width: 260px; font-size: 12.5px; }
	.scope { font-size: 11.5px; line-height: 1.5; color: var(--ae-text-2); border: 1px solid rgba(var(--ae-azure-rgb), 0.3); background: rgba(var(--ae-azure-rgb), 0.09); border-radius: 10px; padding: 10px 12px; margin-bottom: 14px; }
	.bad { color: var(--ae-crimson); }
	.simgrid { display: grid; grid-template-columns: 210px minmax(0, 1fr); gap: 16px; align-items: start; }
	.simnav, .simrec { border: 1px solid var(--ae-line); border-radius: 12px; padding: 12px 14px; }
	.navrow { display: flex; align-items: center; justify-content: space-between; padding: 7px 0; font-size: 12.5px; border-bottom: 1px solid var(--ae-line); }
	.navrow:last-child { border-bottom: none; }
	.navrow.blocked { opacity: 0.35; }
	.tiny { font-size: 9.5px; text-transform: uppercase; letter-spacing: 0.08em; color: var(--ae-muted); }
	.simact { display: flex; align-items: center; gap: 11px; padding: 9px 0; border-bottom: 1px solid var(--ae-line); }
	.simact:last-child { border-bottom: none; }
	.sa-n { flex: 1; font-size: 12.5px; }
	.sa-why { font-size: 10.5px; color: var(--ae-muted); margin-top: 3px; }
	.pillbtn { padding: 4px 10px; border-radius: 7px; font-size: 11px; font-weight: 500; border: 1px solid transparent; flex: none; }
	.pillbtn.ok { background: rgba(var(--ae-ember-rgb), 0.16); border-color: rgba(var(--ae-ember-rgb), 0.42); color: var(--ae-ember); }
	.pillbtn.rev { background: rgba(var(--ae-azure-rgb), 0.14); border-color: rgba(var(--ae-azure-rgb), 0.36); color: var(--ae-azure); }
	.pillbtn.no { background: var(--ae-line); color: var(--ae-muted); text-decoration: line-through; }

	.changebar { position: sticky; bottom: 0; display: flex; align-items: center; gap: 12px; padding: 11px 14px; margin-top: 14px; border: 1px solid var(--ae-line-strong); border-radius: 12px; background: var(--ae-card-bg); font-size: 12.5px; }
	.changebar form { display: contents; }
	.cb-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--ae-line-strong); }
	.cb-dot.hot { background: var(--ae-ember); }

	.scrim { position: fixed; inset: 0; z-index: 200; background: rgba(8, 9, 14, 0.72); backdrop-filter: blur(6px); }
	.drawer { position: absolute; right: 0; top: 0; bottom: 0; width: min(520px, 94vw); background: var(--ae-modal-base); border-left: 1px solid var(--ae-line-strong); display: flex; flex-direction: column; }
	.drawer-h { display: flex; align-items: center; gap: 12px; padding: 16px 18px; border-bottom: 1px solid var(--ae-line); }
	.drawer-h h2 { font-size: 15px; flex: 1; margin: 0; }
	.dtabs { display: flex; gap: 2px; padding: 3px; margin: 12px 18px 0; border-radius: 9px; background: var(--ae-line); }
	.dtabs button { flex: 1; padding: 6px 10px; border-radius: 7px; font-size: 12px; border: 0; background: none; color: var(--ae-muted); cursor: pointer; }
	.dtabs button[aria-selected='true'] { background: var(--ae-card-bg); color: var(--ae-text); }
	.drawer-b { flex: 1; overflow-y: auto; padding: 14px 18px; }
	.dgroup { margin-bottom: 16px; }
	.diff { padding: 8px 0; border-bottom: 1px solid var(--ae-line); }
	.dt { font-size: 12.5px; }
	.dm { font-size: 10.5px; color: var(--ae-muted); font-family: var(--ae-font-mono); margin-top: 3px; }
	.drawer-f { padding: 12px 18px; border-top: 1px solid var(--ae-line); }
	.empty { color: var(--ae-muted); font-size: 12px; text-align: center; padding: 30px 10px; line-height: 1.6; }

	/* ── Candidate records board ──────────────────────────────────────────── */
	.crec { padding: 16px; border-bottom: 1px solid var(--ae-line); background:
		radial-gradient(120% 80% at 0% 0%, rgba(var(--ae-ember-rgb), 0.10), transparent 60%); }
	.crec-h { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; margin-bottom: 14px; }
	.crec-ic { width: 44px; height: 44px; border-radius: 13px; display: grid; place-items: center; color: #fff; flex: none;
		background: linear-gradient(135deg, var(--ae-ember), #a78bfa); box-shadow: 0 8px 22px -8px rgba(var(--ae-ember-rgb), 0.7); }
	.crec-t { flex: 1; min-width: 220px; }
	.crec-t h2 { margin: 0; font-size: 17px; letter-spacing: -0.01em; }
	.crec-t p { margin: 3px 0 0; font-size: 12px; color: var(--ae-muted); }
	.crec-stats { display: flex; flex-wrap: wrap; gap: 6px; }
	.crec-stats span { font-size: 11.5px; color: var(--ae-text-2); padding: 5px 10px; border-radius: 999px; border: 1px solid var(--ae-line-strong); background: var(--ae-modal-base); }
	.crec-stats b { font-family: var(--ae-font-mono); color: var(--ae-text); margin-right: 2px; }
	.crec-stats span.warn { border-color: rgba(var(--ae-crimson-rgb), 0.45); color: var(--ae-crimson); }
	.crec-stats span.warn b { color: var(--ae-crimson); }
	.crec-band { border-radius: 14px; padding: 12px; border: 1px solid var(--ae-line); background: var(--ae-modal-base); }
	.crec-band + .crec-band { margin-top: 12px; }
	.crec-band.sens { border-color: rgba(var(--ae-amber-rgb), 0.35);
		background: linear-gradient(0deg, rgba(var(--ae-amber-rgb), 0.05), rgba(var(--ae-amber-rgb), 0.05)), var(--ae-modal-base); }
	.crec-band-h { display: flex; align-items: baseline; gap: 10px; flex-wrap: wrap; margin: 0 2px 10px; }
	.crec-band-h span { font-family: var(--ae-font-mono); font-size: 10px; font-weight: 600; letter-spacing: 0.12em; text-transform: uppercase; color: var(--ae-ember-glow); }
	.crec-band.sens .crec-band-h span { color: var(--ae-amber); }
	.crec-band-h small { font-size: 11px; color: var(--ae-muted); }
	.crec-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 10px; }
	.pcard { display: flex; flex-direction: column; gap: 8px; padding: 12px; border-radius: 12px; border: 1px solid var(--ae-line-strong); background: var(--ae-card-bg);
		transition: border-color 0.15s ease, transform 0.15s ease, box-shadow 0.15s ease; }
	.pcard:hover { border-color: rgba(var(--ae-ember-rgb), 0.45); transform: translateY(-1px); box-shadow: 0 10px 24px -14px rgba(0, 0, 0, 0.6); }
	.crec-band.sens .pcard:hover { border-color: rgba(var(--ae-amber-rgb), 0.55); }
	.pcard-top { display: flex; gap: 10px; align-items: flex-start; }
	.pcard-ic { width: 32px; height: 32px; border-radius: 9px; flex: none; display: grid; place-items: center; color: var(--ae-ember-glow); background: rgba(var(--ae-ember-rgb), 0.14); }
	.crec-band.sens .pcard-ic { color: var(--ae-amber); background: rgba(var(--ae-amber-rgb), 0.14); }
	.pcard-t { min-width: 0; }
	.pcard-t h3 { margin: 0; font-size: 13px; font-weight: 600; color: var(--ae-text); line-height: 1.3; }
	.pcard-t p { margin: 2px 0 0; font-size: 11.5px; line-height: 1.4; color: var(--ae-muted); }
	.pcard-tags { display: flex; align-items: center; flex-wrap: wrap; gap: 4px; }
	.pcard-tags .inforce, .pcard-tags .reserved, .pcard-tags .notwired { margin-left: 0; }
	.pcard-k { margin-left: auto; font-family: var(--ae-font-mono); font-size: 9.5px; color: var(--ae-muted); opacity: 0.8; }
	.pcard-people { list-style: none; margin: 0; padding: 8px 0 0; border-top: 1px solid var(--ae-line); display: flex; flex-direction: column; gap: 6px; }
	.pcard-people li { display: flex; align-items: center; gap: 8px; }
	.pcard-people li.off { opacity: 0.45; }
	.pp { display: flex; align-items: center; gap: 7px; min-width: 0; flex: 1; padding: 0; border: 0; background: none; cursor: pointer; color: inherit; text-align: left; }
	.pp-n { font-size: 12px; color: var(--ae-text-2); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.pp:hover .pp-n { color: var(--ae-text); }
	.avatar.tiny { width: 24px; height: 24px; border-radius: 7px; font-size: 9.5px; font-weight: 700; color: #fff; text-shadow: 0 1px 2px rgba(0, 0, 0, 0.35); flex: none; }
	.lvseg { display: flex; gap: 2px; padding: 2px; border-radius: 9px; background: var(--ae-line); flex: none; }
	.lvseg button { padding: 4px 8px; border-radius: 7px; border: 0; background: none; cursor: pointer; font-family: var(--ae-font-mono); font-size: 9.5px; font-weight: 600; text-transform: uppercase; color: var(--ae-muted); transition: background 0.12s ease, color 0.12s ease; }
	.lvseg button:hover:not(:disabled) { color: var(--ae-text); }
	.lvseg button:disabled { cursor: not-allowed; }
	.lvseg button[aria-checked='true'][data-lv='none'] { background: var(--ae-card-bg); color: var(--ae-text-2); }
	.lvseg button[aria-checked='true'][data-lv='view'] { background: rgba(var(--ae-azure-rgb), 0.22); color: var(--ae-azure); }
	.lvseg button[aria-checked='true'][data-lv='act'] { background: rgba(var(--ae-ember-rgb), 0.24); color: var(--ae-ember-glow); }
	.lvseg button[aria-checked='true'][data-lv='approve'] { background: rgba(var(--ae-verdant-rgb), 0.22); color: var(--ae-verdant); }
	.lvseg button:disabled[aria-checked='false'] { opacity: 0.35; }
	@media (max-width: 1100px) {
		.stage { grid-template-columns: minmax(0, 1fr); }
		.insp { max-height: none; }
		.simgrid { grid-template-columns: minmax(0, 1fr); }
	}
</style>
