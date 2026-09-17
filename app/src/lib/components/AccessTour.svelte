<script lang="ts">
	// GUIDED TOUR for /admin/access.
	//
	// The studio is the one page where a wrong click is expensive and a right one
	// saves an HR desk a week, so it ships with the reasoning rather than leaving
	// a super admin to infer it from the controls. The steps teach the model —
	// preset first, reach second, sign-off instead of refusal — not the buttons.
	//
	// It drives the page: each step switches to the mode it is talking about and
	// rings the thing it is pointing at, so the reader is always looking at the
	// real screen with their real people on it, never at a screenshot.
	import { onDestroy } from 'svelte';

	let {
		open = $bindable(false),
		setView
	}: { open: boolean; setView: (v: 'org' | 'matrix' | 'sim') => void } = $props();

	interface Step {
		title: string;
		body: string;
		view?: 'org' | 'matrix' | 'sim';
		/** Ringed while the step is showing. Missing or absent from the DOM is
		 *  fine — the step still reads, it just has nothing to point at. */
		target?: string;
	}

	const STEPS: Step[] = [
		{
			title: 'Who can do what, and on whose records',
			body:
				'Two different questions, and most access mistakes come from answering only the first. This page keeps them apart: <b>capabilities</b> decide what someone may do, <b>reach</b> decides whose records they may do it to. A recruiter with the power to draft offers and a reach of only their own candidates is safe. The same recruiter with reach over the whole group is not.',
			view: 'matrix'
		},
		{
			title: 'Three ways to look at the same people',
			body:
				'<b>Permission matrix</b> for reading and editing access across everyone at once. <b>Simulate</b> for seeing one person’s screen before you commit to it. <b>Org chart</b> is coming; until it lands, reporting lines are set per person in the panel on the right.',
			view: 'matrix',
			target: '.modes'
		},
		{
			title: 'Start from a preset, not from a blank sheet',
			body:
				'A preset is the shape of a job — what a recruiter does, what a payroll lead does. Pick the closest one and change only what is genuinely different for this person. Every change you make on top shows as a dot, so a year from now you can still see which of someone’s powers were deliberate exceptions and which just came with the job.<br><br>The first three presets are marked <i>in force today</i>: they reproduce the access the app actually enforces right now, so you are editing from the truth.',
			view: 'matrix',
			target: '.insp'
		},
		{
			title: 'Read the matrix both ways',
			body:
				'Across a <b>row</b>: who in this company can unmask Aadhaar, or export the dataset? That is the question an auditor asks, and it used to take an afternoon.<br><br>Down a <b>column</b>: what can this one person actually do? That is the question you ask when someone joins, leaves, or changes desk.<br><br>Click any cell to cycle its level. Nothing is saved until you apply.',
			view: 'matrix',
			target: '.mscroll'
		},
		{
			title: 'Three levels, and why some are missing',
			body:
				'<b>View</b> sees it. <b>Act</b> does it. <b>Sign</b> authorises it. A capability only offers the levels that make sense for it — there is no “act” on reading the inbox, and no “view” on deleting a record, because looking at a deletion is not a thing. Greyed-out segments are not permissions you have been denied; they are levels that do not exist.',
			view: 'matrix',
			target: '.mscroll'
		},
		{
			title: 'Every row points at real code',
			body:
				'Under each capability is the key and the number of places it governs — hover it to see the actual routes and actions, like <code>::sendOfferLetterEmail</code>. This matters: a permission screen that describes a plausible app rather than <i>this</i> app is worse than none.<br><br>A few rows say <b>not wired</b>. Those are gates the business has asked for that nothing implements yet. They are shown rather than hidden so nobody assigns one and assumes it is holding.',
			view: 'matrix',
			target: '.mscroll'
		},
		{
			title: 'Reach is the biggest workflow lever here',
			body:
				'Setting reach to <b>only their own records</b> or <b>their whole reporting tree</b> means work divides itself. Two recruiters on the same entity stop seeing each other’s candidates without anyone assigning anything, and a manager sees their desk without being added to it one candidate at a time.<br><br>This is where the time is saved. Capabilities stop people doing the wrong thing; reach stops them having to wade through work that was never theirs.',
			view: 'matrix',
			target: '.insp'
		},
		{
			title: 'Reporting lines do double duty',
			body:
				'The line you draw under <b>Reports to</b> decides two things at once: whose records roll up under a manager’s reach, and where anything needing a second signature goes.<br><br>So managing your team here is mostly drawing that line correctly. Somebody with no manager and a capability routed for sign-off will stall, and the panel warns you when that is the case.',
			view: 'matrix',
			target: '.insp'
		},
		{
			title: 'When the same person does and approves',
			body:
				'The studio flags pairs one person should not hold together — drafting an offer and releasing it, issuing an employee code and approving it, settling an F&F and closing it.<br><br>The instinct is to take the power away. Usually the better move is the button offered instead: <b>send it for sign-off</b>. The person keeps doing their job, the step routes to their manager, and the work does not pile up on you. Refusing access slows a desk down; routing it keeps it honest and moving.',
			view: 'matrix',
			target: '.insp'
		},
		{
			title: 'Give access an end date',
			body:
				'Contractors, auditors, someone covering a maternity leave — set <b>access ends on</b> when you grant it, not when you remember. Access that expires by itself is the only kind that reliably goes away.<br><br>A lapsed person can still sign in and be told their access ended, which is a far better experience than a login that silently stops working.',
			view: 'matrix',
			target: '.insp'
		},
		{
			title: 'Look through their eyes before you commit',
			body:
				'Pick anyone and Simulate shows their left rail and the buttons on a candidate record, each with the reason it is open, read-only, routed for sign-off, or hidden.<br><br>Use it two ways: before granting, to check a change does what you meant; and when somebody says “I can’t do X”, to get the answer in seconds instead of guessing.',
			view: 'sim',
			target: '.sim'
		},
		{
			title: 'Review, apply, and leave a trail',
			body:
				'Changes collect at the bottom until you apply them, so you can move several people and read the whole thing as one decision. <b>Review changes</b> shows it as before → after, per person, and applying writes an audit entry for each.<br><br>A rhythm worth keeping: set preset, entities and reach when someone joins; skim the duty flags and expiring access once a month; and reach for Simulate before changing anything you are not sure about.',
			view: 'matrix',
			target: '.changebar'
		}
	];

	let i = $state(0);
	const step = $derived(STEPS[i]);
	const last = $derived(i === STEPS.length - 1);

	let ringed: Element | null = null;
	function clearRing() {
		ringed?.classList.remove('tour-ring');
		ringed = null;
	}

	// Switching the mode and ringing the target are side effects of the step, so
	// they belong here rather than in every next/back handler.
	$effect(() => {
		if (!open) {
			clearRing();
			return;
		}
		const s = STEPS[i];
		if (s.view) setView(s.view);
		clearRing();
		if (!s.target) return;
		// After the view switch has rendered.
		const t = setTimeout(() => {
			const el = document.querySelector(s.target!);
			if (!el) return;
			el.classList.add('tour-ring');
			ringed = el;
			el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
		}, 60);
		return () => clearTimeout(t);
	});

	onDestroy(clearRing);

	function close() {
		clearRing();
		open = false;
		try {
			localStorage.setItem('champ-access-tour-seen', '1');
		} catch {
			// Private windows and blocked site data: the tour simply offers itself
			// again next time, which is a smaller problem than failing to open.
		}
	}
	function next() {
		if (last) close();
		else i += 1;
	}
	function back() {
		if (i > 0) i -= 1;
	}
	function onKey(e: KeyboardEvent) {
		if (!open) return;
		if (e.key === 'Escape') close();
		if (e.key === 'ArrowRight') next();
		if (e.key === 'ArrowLeft') back();
	}
</script>

<svelte:window onkeydown={onKey} />

{#if open}
	<!-- Deliberately not a scrim: the point of each step is the live page behind
	     it, so the card sits in a corner and leaves the screen readable. -->
	<div class="tour" role="dialog" aria-modal="false" aria-label="Access studio tour" tabindex="-1">
		<div class="tour-top">
			<span class="tour-count">{i + 1} of {STEPS.length}</span>
			<button class="tour-x" onclick={close} aria-label="Close the tour">Skip</button>
		</div>
		<h2>{step.title}</h2>
		<!-- eslint-disable-next-line svelte/no-at-html-tags -- fixed copy in this file, no user input -->
		<p>{@html step.body}</p>
		<div class="tour-dots" aria-hidden="true">
			{#each STEPS as _, n (n)}
				<span class="dot" class:on={n === i} class:past={n < i}></span>
			{/each}
		</div>
		<div class="tour-foot">
			<button class="btn ghost small" onclick={back} disabled={i === 0}>Back</button>
			<button class="btn small" onclick={next}>{last ? 'Finish' : 'Next'}</button>
		</div>
	</div>
{/if}

<style>
	.tour {
		position: fixed;
		right: 20px;
		bottom: 20px;
		z-index: 300;
		width: min(420px, calc(100vw - 40px));
		padding: 16px 18px 14px;
		border-radius: 14px;
		border: 1px solid var(--ae-line-strong);
		background: var(--ae-card-bg), var(--ae-modal-base, rgba(13, 16, 26, 0.97));
		box-shadow: 0 26px 60px -20px rgba(0, 0, 0, 0.65);
		backdrop-filter: blur(16px) saturate(160%);
		-webkit-backdrop-filter: blur(16px) saturate(160%);
	}
	:global(.aegis[data-theme='light']) .tour {
		--ae-modal-base: rgba(252, 253, 255, 0.98);
	}
	.tour-top {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-bottom: 8px;
	}
	.tour-count {
		font-family: var(--ae-font-mono);
		font-size: 9.5px;
		letter-spacing: 0.12em;
		text-transform: uppercase;
		color: var(--ae-muted);
		flex: 1;
	}
	.tour-x {
		background: none;
		border: 0;
		font: inherit;
		font-size: 11px;
		font-weight: 600;
		color: var(--ae-muted);
		text-decoration: underline;
		text-underline-offset: 2px;
		cursor: pointer;
	}
	.tour-x:hover {
		color: var(--ae-text);
	}
	.tour h2 {
		font-size: 15px;
		margin: 0 0 7px;
		letter-spacing: -0.01em;
	}
	.tour p {
		margin: 0;
		font-size: 12.5px;
		line-height: 1.6;
		color: var(--ae-text-2);
	}
	.tour p :global(code) {
		font-family: var(--ae-font-mono);
		font-size: 11px;
		padding: 1px 4px;
		border-radius: 4px;
		background: var(--ae-line);
	}
	.tour-dots {
		display: flex;
		gap: 4px;
		margin: 14px 0 12px;
	}
	.dot {
		width: 5px;
		height: 5px;
		border-radius: 50%;
		background: var(--ae-line-strong);
	}
	.dot.past {
		background: var(--ae-muted);
	}
	.dot.on {
		width: 16px;
		border-radius: 3px;
		background: var(--ae-amber);
	}
	.tour-foot {
		display: flex;
		justify-content: flex-end;
		gap: 8px;
	}
	@media (max-width: 560px) {
		.tour {
			right: 10px;
			left: 10px;
			bottom: 10px;
			width: auto;
		}
	}
</style>
