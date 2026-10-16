<script lang="ts">
	/** Joins a recipient list one per line, as the textareas show it. */
	const NL = '\n';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import { page } from '$app/state';
	import {
		CLOSURE_CHECKLIST,
		EXIT_Q11_ROWS,
		EXIT_Q11_SCALE,
		EXIT_Q12_ROWS,
		EXIT_Q12_SCALE,
		EXIT_Q13_ROWS,
		EXIT_Q13_SCALE,
		EXIT_RECOMMEND_OPTIONS,
		EXIT_STATUS_META,
		EXIT_TEXT_QUESTIONS,
		EXIT_WORKLOAD_OPTIONS,
		NDC_EMPLOYEE_DECLARATION_LABELS,
		NDC_EMPLOYEE_SECTIONS,
		LETTER_SALUTATIONS,
		RELIEVING_ITEMS,
		ROUTING_KEYS,
		ROUTING_LABELS
	} from '$lib/shared/offboarding';
	import { TRACKS, TRACK_LABELS, type Track } from '$lib/shared/matrix';
	import GlassSelect from '$lib/components/GlassSelect.svelte';

	let { data, form } = $props();

	const e = $derived(data.exit);
	const statusMeta = $derived(EXIT_STATUS_META[e.status] ?? { label: e.status, cls: '' });
	const forms = $derived(data.documents.filter((d) => !d.letter));
	const letters = $derived(data.documents.filter((d) => d.letter));
	const isIntern = $derived(e.track === 'intern');

	// In-flight flags per section, so each button reports its own progress rather
	// than the page going quiet on a slow mail send.
	let sending = $state<Record<string, boolean>>({});
	let uploading = $state<Record<string, boolean>>({});
	let uploadError = $state<Record<string, string>>({});
	let copied = $state('');

	// Which review items HR has ticked to send back to the employee.
	let changeFields = $state<string[]>([]);

	// Polls for changes made elsewhere — an approver signing a clearance, the
	// employee submitting their forms — so the live-documents rail and every
	// status on this page update on their own rather than waiting on HR to
	// hit refresh. Paused while the tab is in the background.
	$effect(() => {
		const tick = () => {
			if (document.visibilityState === 'visible') invalidateAll();
		};
		const interval = setInterval(tick, 20_000);
		return () => clearInterval(interval);
	});

	function track(key: string) {
		return () => {
			sending[key] = true;
			return async ({ update }: { update: (o?: { reset?: boolean }) => Promise<void> }) => {
				await update({ reset: false });
				sending[key] = false;
			};
		};
	}

	async function copy(text: string, key: string) {
		try {
			await navigator.clipboard.writeText(text);
			copied = key;
			setTimeout(() => (copied = ''), 1800);
		} catch {
			copied = '';
		}
	}

	// ── Review & send ───────────────────────────────────────────────────────
	// No mail on this page goes out on one click: each Send opens the mail as
	// it will be sent — recipients, subject, body, attachments — and only the
	// Send inside that dialog posts it.
	interface MailDraft {
		key: string;
		label: string;
		to: string[];
		cc: string[];
		subject: string;
		html: string;
		reminder: boolean;
		sendable: boolean;
		why: string | null;
		attachments: { name: string; href: string }[];
	}
	/** Which form action sends each previewable mail. */
	const SEND_ACTION: Record<string, string> = {
		manager: 'resendStep',
		it: 'resendStep',
		salesforce: 'resendStep',
		payroll: 'resendStep',
		letters: 'sendHandover',
		forms: 'sendFormsLink',
		itblock: 'sendItBlockMail'
	};
	/** A re-request is composed in the same window: `back` sends a signed
	 *  approver back, `docs` asks the employee for documents. */
	type ComposeMode = 'back' | 'docs' | null;
	let review = $state<{
		step: string;
		previewOnly: boolean;
		mode: ComposeMode;
		draft: MailDraft | null;
		error: string;
		/** What is happening while there is no draft yet — shown in the loader. */
		stage: string | null;
		/** The preview query last asked for, so one change fetches once. */
		query: string | null;
	} | null>(null);
	let reviewSent = $state('');
	let compose = $state({ items: [] as string[], uploads: [''] as string[], note: '', docs: [] as string[] });
	const reviewStep = $derived(review ? data.steps.find((s) => s.key === review!.step) : undefined);
	/** The dialog's title before the draft arrives, so it never reads "Loading…". */
	const OTHER_LABELS: Record<string, string> = {
		forms: 'Employee exit forms',
		itblock: 'IT — block system access',
		docs: 'Ask the employee for documents'
	};
	const reviewTitle = $derived(
		review
			? (review.draft?.label ??
					(review.mode === 'docs' ? OTHER_LABELS.docs : (reviewStep?.label ?? OTHER_LABELS[review.step] ?? 'Mail')))
			: ''
	);

	// Drafts are fetched as soon as HR points at a button, so the dialog
	// usually opens with the mail already there. Kept briefly, and dropped
	// whenever the page's data changes (a send, a signature, new settings).
	const draftCache = new Map<string, { at: number; p: Promise<MailDraft> }>();
	$effect(() => {
		void data;
		draftCache.clear();
	});
	function loadDraft(url: string): Promise<MailDraft> {
		const hit = draftCache.get(url);
		if (hit && Date.now() - hit.at < 20_000) return hit.p;
		const p = fetch(url).then(async (res) => {
			if (!res.ok) throw new Error((await res.json().catch(() => null))?.message ?? 'Could not build the preview.');
			return (await res.json()) as MailDraft;
		});
		p.catch(() => draftCache.delete(url));
		draftCache.set(url, { at: Date.now(), p });
		return p;
	}
	/** The first mail the chain will ask HR to send — what Start opens. */
	const firstMailStep = $derived(
		data.steps.find((s) => MAIL_STEPS.has(s.key) && s.status !== 'done' && s.status !== 'skipped')?.key ?? 'manager'
	);
	function prefetch(step: string) {
		loadDraft(`/admin/offboarding/${e.id}/mail-preview/${step}`).catch(() => {});
	}

	function previewQuery(mode: ComposeMode) {
		const p = new URLSearchParams();
		if (mode === 'back') {
			p.set('back', '1');
			for (const i of compose.items) p.append('item', i);
			for (const u of compose.uploads) if (u.trim()) p.append('upload', u.trim());
		}
		if (mode === 'docs') for (const d of compose.docs) p.append('doc', d);
		if (mode && compose.note.trim()) p.set('note', compose.note.trim());
		const s = p.toString();
		return s ? `?${s}` : '';
	}

	async function fetchDraft() {
		const r = review;
		if (!r) return;
		const step = r.mode === 'docs' ? 'docs' : r.step;
		const query = previewQuery(r.mode);
		if (r.query === query) return;
		r.query = query;
		const url = `/admin/offboarding/${e.id}/mail-preview/${step}${query}`;
		try {
			// A re-request changes with every tick, so only the plain mail is cached.
			const draft = r.mode ? await loadDraft(url).finally(() => draftCache.delete(url)) : await loadDraft(url);
			if (review === r && r.query === query) {
				review.draft = draft;
				review.error = '';
			}
		} catch (err) {
			if (review === r) review.error = err instanceof Error ? err.message : 'Could not build the preview.';
		}
	}

	async function openReview(step: string, previewOnly = false, mode: ComposeMode = null, stage: string | null = null) {
		compose = { items: [], uploads: [''], note: '', docs: [] };
		review = { step, previewOnly, mode, draft: null, error: '', stage, query: null };
		if (!stage) await fetchDraft();
	}

	/** The two hand-offs that ready a mail — accepting the submission (or
	 *  starting the chain) and handing the F&F to payroll — open the mail's
	 *  dialog the moment HR presses the button, with the loader saying what is
	 *  happening, and fetch the draft as soon as the server has finished,
	 *  alongside the page refresh rather than after it. */
	function handoff(
		key: string,
		step: string,
		stage: string,
		opens: (submitter: HTMLElement | null) => boolean,
		done: (data: Record<string, unknown> | undefined) => boolean
	) {
		return ({ submitter }: { submitter: HTMLElement | null }) => {
			sending[key] = true;
			const open = opens(submitter);
			if (open) openReview(step, false, null, stage);
			return async ({
				result,
				update
			}: {
				result: { type: string; data?: Record<string, unknown> };
				update: (o?: { reset?: boolean }) => Promise<void>;
			}) => {
				const mine = () => open && review?.step === step && !review.draft;
				if (mine() && result.type === 'success' && done(result.data)) {
					review!.stage = 'Composing the mail…';
					await Promise.all([update({ reset: false }), fetchDraft()]);
				} else {
					if (mine()) review = null;
					await update({ reset: false });
				}
				sending[key] = false;
			};
		};
	}

	// While composing a re-request, the preview follows what HR ticks and types.
	$effect(() => {
		if (!review?.mode) return;
		JSON.stringify(compose);
		const t = setTimeout(fetchDraft, 350);
		return () => clearTimeout(t);
	});

	/** Uploads the employee has been asked for and not yet sent. */
	const docsAsked = $derived(e.requestedFields.filter((r: { field: string; label: string }) => r.field.startsWith('upload.')));
	const canAskDocs = $derived(data.isHr && e.status !== 'initiated' && e.status !== 'completed');

	function sendReviewed() {
		sending['review'] = true;
		return async ({ result, update }: { result: { type: string }; update: (o?: { reset?: boolean }) => Promise<void> }) => {
			await update({ reset: false });
			sending['review'] = false;
			if (result.type === 'success' && review?.draft) {
				reviewSent = `${
					review.mode === 'back' ? 'Sent back' : review.mode === 'docs' ? 'Asked' : review.draft.reminder ? 'Reminder sent' : 'Sent'
				} to ${review.draft.to.join(', ')} ✓`;
				review = null;
				setTimeout(() => (reviewSent = ''), 6000);
			}
		};
	}


	async function uploadHandover(docType: string, input: HTMLInputElement) {
		const file = input.files?.[0];
		if (!file) return;
		uploading[docType] = true;
		uploadError[docType] = '';
		try {
			const body = new FormData();
			body.append('docType', docType);
			body.append('file', file);
			const res = await fetch(`/admin/offboarding/${page.params.id}/upload`, { method: 'POST', body });
			if (!res.ok) {
				const text = await res.text();
				throw new Error(text.slice(0, 200) || 'Upload failed');
			}
			await invalidateAll();
		} catch (err) {
			uploadError[docType] = err instanceof Error ? err.message : 'Upload failed';
		} finally {
			uploading[docType] = false;
			input.value = '';
		}
	}

	function stamp(iso: string | null): string {
		if (!iso) return '';
		return new Date(iso).toLocaleString('en-IN', {
			day: 'numeric',
			month: 'short',
			year: '2-digit',
			hour: '2-digit',
			minute: '2-digit'
		});
	}

	function kb(bytes: number): string {
		return bytes > 1024 * 1024
			? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
			: `${Math.max(1, Math.round(bytes / 1024))} KB`;
	}

	const VERDICT_LABEL: Record<string, string> = { no_dues: 'No dues', dues: 'Dues outstanding' };

	const scaleLabel = (scale: readonly { value: string; label: string }[], v: string | null) =>
		scale.find((s) => s.value === v)?.label ?? '—';

	// The employee's answers, flattened into the review list HR ticks items from.
	// `field` is the dotted path the re-request action stores and the mail names.
	const reviewGroups = $derived([
		{
			title: 'NDA & Non-Compete',
			items: [
				{ field: 'nda.agreementDate', label: 'Agreement date', value: e.nda?.agreementDate },
				{ field: 'nda.fullName', label: 'Full name', value: e.nda?.fullName },
				{ field: 'nda.permanentAddress', label: 'Permanent address', value: e.nda?.permanentAddress },
				{
					field: 'nda.aadhaarNo',
					label: 'Aadhaar',
					value: e.nda?.aadhaarLast4 ? `XXXX XXXX ${e.nda.aadhaarLast4}` : ''
				}
			]
		},
		{
			title: 'Relieving Formalities',
			items: [
				...RELIEVING_ITEMS.map((item) => ({
					field: `relievingFormalities.${item.field}`,
					label: `${item.n}. ${item.label}`,
					value: e.relievingFormalities?.[item.field]
				})),
				{
					field: 'relievingFormalities.futureContactEmail',
					label: 'Future contact email',
					value: e.relievingFormalities?.futureContactEmail
				},
				{
					field: 'relievingFormalities.futureContactMobile',
					label: 'Future contact mobile',
					value: e.relievingFormalities?.futureContactMobile
				},
				{
					field: 'relievingFormalities.emergencyContactName',
					label: 'Emergency contact',
					value: e.relievingFormalities?.emergencyContactName
				}
			]
		}
	]);

	// ── The exit-chain map ──────────────────────────────────────────────────
	/** Steps that send a clearance mail, and so offer Send / Remind / Copy link. */
	const MAIL_STEPS = new Set(['manager', 'it', 'salesforce', 'payroll']);
	const hrStep = $derived(data.steps.find((s) => s.key === 'hr'));

	/** The employee's own forms, drawn as the map's first node. */
	const formsNode = $derived.by(() => {
		if (e.reviewedAt) return { status: 'done', detail: `Accepted ${stamp(e.reviewedAt)}` };
		if (e.submittedAt) return { status: 'active', detail: 'Submitted — review and accept below' };
		if (e.status === 'initiated') return { status: 'active', detail: 'Send the employee their forms link' };
		return { status: 'active', detail: 'Employee is filling their forms' };
	});

	/** Share of the chain finished, counting the forms and every step not skipped. */
	const chainPct = $derived.by(() => {
		const counted = data.steps.filter((s) => s.status !== 'skipped');
		const done = counted.filter((s) => s.status === 'done').length + (formsNode.status === 'done' ? 1 : 0);
		return Math.round((done / (counted.length + 1)) * 100);
	});

	// Mirrors the Salesforce tick in the mail settings, so its row dims as it is
	// switched off rather than only after a save.
	let salesforceOn = $state(false);
	$effect(() => {
		salesforceOn = data.salesforceEnabled;
	});
</script>

<a href="/admin/offboarding" class="back">
	<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M15 18l-6-6 6-6" /></svg>
	All offboardings
</a>

<div class="head">
	<div>
		<h1 class="page-title" style="margin-bottom:6px">{e.fullName}</h1>
		<div class="submeta">
			<span class="pill {statusMeta.cls}">{statusMeta.label}</span>
			<span class="mono">{e.employeeId}</span>
			{#if e.refNo}<span>·</span><span class="mono">{e.refNo}</span>{/if}
			<span>·</span>
			<span>{e.companyName}</span>
			{#if e.designation}<span>·</span><span>{e.designation}</span>{/if}
			{#if e.service}<span>·</span><span>{e.service} of service</span>{/if}
		</div>
	</div>
	<div class="head-actions">
		<a class="btn ghost" href="/admin/offboarding/{e.id}/pack-zip" data-sveltekit-preload-data="off">
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><path d="M7 10l5 5 5-5" /><path d="M12 15V3" /></svg>
			Download full pack
		</a>
		{#if e.candidateId}
			<a class="btn ghost" href="/admin/candidates/{e.candidateId}">Onboarding record</a>
		{/if}
	</div>
</div>

{#if form?.message}
	<p class="error banner">{form.message}</p>
{/if}

<div class="cols">
	<!-- ─────────────── Far left: the exit chain, as a map ─────────────── -->
	<aside class="flowmap">
		<section class="card mapcard">
			<div class="map-head">
				<div class="eyebrow">Exit chain</div>
				<span class="map-pct">{chainPct}%</span>
			</div>
			<div class="map-bar"><span style="width:{chainPct}%"></span></div>
			{#if e.refNo}<div class="map-ref">{e.refNo}</div>{/if}

			<ol class="map">
				<li class="node {formsNode.status}">
					<span class="dot">
						{#if formsNode.status === 'done'}
							<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4"><path d="M20 6L9 17l-5-5" /></svg>
						{:else}
							<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
						{/if}
					</span>
					<div class="nbody">
						<div class="nlabel">Employee exit forms</div>
						<div class="nto">{e.personalEmail}</div>
						<div class="ndetail">{formsNode.detail}</div>
						{#if docsAsked.length}
							<div class="nwait">Waiting on: {docsAsked.map((r: { label: string }) => r.label.replace(/^Upload: /, '')).join(', ')}</div>
						{/if}
						{#if canAskDocs}
							<button class="nact quiet" type="button" onclick={() => openReview('docs', false, 'docs')}>
								Ask for documents
							</button>
						{/if}
					</div>
				</li>
				{#each data.steps as s, i (s.key)}
					<li class="node {s.status}">
						<span class="dot">
							{#if s.status === 'done'}
								<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3.4"><path d="M20 6L9 17l-5-5" /></svg>
							{:else if s.status === 'skipped'}
								<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3"><path d="M5 12h14" /></svg>
							{:else if s.status === 'blocked'}
								!
							{:else}
								{i + 1}
							{/if}
						</span>
						<div class="nbody">
							<div class="nlabel">
								{s.label}
								{#if s.key === 'salesforce'}<span class="opt">optional</span>{/if}
							</div>
							{#if s.to && s.status !== 'skipped'}<div class="nto">{s.to}</div>{/if}
							<div class="ndetail">
								{#if s.status === 'done' && s.doneAt}{s.detail} · {stamp(s.doneAt)}{:else}{s.detail ?? s.hint}{/if}
							</div>
							{#if s.sendBack}
								<div class="nwait">
									Asked for: {[...s.sendBack.items, ...s.sendBack.uploads.map((u: string) => `attach ${u}`)].join(', ') ||
										s.sendBack.note}
								</div>
							{/if}
							{#each s.files as f (f.id)}
								<a class="nfile" href="/admin/offboarding/{e.id}/file/{f.id}" target="_blank" rel="noreferrer">📎 {f.label}</a>
							{/each}

							{#if s.status === 'blocked'}
								<a class="nact" href="#mail-settings">Set the email ↓</a>
							{:else if s.status === 'active' && MAIL_STEPS.has(s.key)}
								<div class="nacts">
									<button
										class="nact {s.ready ? 'go' : ''}"
										type="button"
										disabled={!data.isHr}
										onpointerenter={() => prefetch(s.key)} onfocus={() => prefetch(s.key)} onclick={() => openReview(s.key)}
									>
										{s.ready ? 'Review & send' : 'Review reminder'}
									</button>
									{#if s.link}
										<button class="nact" type="button" onclick={() => copy(s.link!, `link-${s.key}`)}>
											{copied === `link-${s.key}` ? 'Copied ✓' : 'Copy link'}
										</button>
									{/if}
								</div>
							{:else if s.status === 'active' && s.key === 'hr'}
								<a class="nact" href="#fnf">Fill the F&amp;F ↓</a>
							{:else if s.status === 'active' && s.key === 'letters'}
								<div class="nacts">
									<button class="nact" type="button" disabled={!data.isHr} onpointerenter={() => prefetch('letters')} onfocus={() => prefetch('letters')} onclick={() => openReview('letters')}>
										Review &amp; release
									</button>
									<a class="nact" href="#release">Settings ↓</a>
								</div>
							{:else if s.status === 'waiting' && data.flow.startedAt && (MAIL_STEPS.has(s.key) || s.key === 'letters')}
								<button class="nact quiet" type="button" onpointerenter={() => prefetch(s.key)} onfocus={() => prefetch(s.key)} onclick={() => openReview(s.key, true)}>Preview mail</button>
							{/if}
							{#if s.status === 'done' && MAIL_STEPS.has(s.key) && e.status !== 'completed' && data.isHr}
								<button class="nact quiet" type="button" onclick={() => openReview(s.key, false, 'back')}>
									Send back — something missing
								</button>
							{/if}
						</div>
					</li>
				{/each}
			</ol>

			{#if !data.flow.startedAt}
				{#if e.reviewedAt}
					<form
						method="POST"
						action="?/startChain"
						use:enhance={handoff(
							'chain',
							firstMailStep,
							'Starting the chain…',
							() => true,
							() => true
						)}
					>
						<button class="btn small teal" style="width:100%" disabled={!data.isHr || sending['chain']}>
							{sending['chain'] ? 'Starting…' : 'Start the chain'}
						</button>
					</form>
				{:else}
					<p class="map-note">The chain starts when you accept the employee's submission.</p>
				{/if}
			{/if}
			{#if data.flow.lastError}<p class="map-err">{data.flow.lastError.message}</p>{/if}
			{#if reviewSent}<p class="map-ok">{reviewSent}</p>{/if}
			<a class="map-settings" href="#mail-settings">Mail settings ↓</a>
		</section>
	</aside>

	<!-- ─────────────── Left: the flow, step by step ─────────────── -->
	<div class="main">
		<!-- 1. Particulars -->
		<section class="card">
			<div class="sec-head">
				<span class="section-num">01</span>
				<div>
					<h2>Employment particulars</h2>
					<p class="muted">
						What the exit documents print. {#if e.candidateId}Prefilled from their onboarding
							record — correct anything that has changed.{:else}This employee has no onboarding
							record in the portal, so these are yours to fill in.{/if}
					</p>
				</div>
				{#if form?.particularsSaved}<span class="saved">Saved ✓</span>{/if}
			</div>

			<form method="POST" action="?/saveParticulars" use:enhance={track('particulars')}>
				<fieldset class="rbac" disabled={!data.isHr}>
					<div class="fgrid">
						<label class="f"><span>Reference no.</span><input name="refNo" required value={e.refNo ?? ''} placeholder="Ref\2026\RL\CIPL-00239" /></label>
						<label class="f"><span>Employee name</span><input name="fullName" value={e.fullName} /></label>
						<label class="f"><span>Personal email</span><input name="personalEmail" type="email" value={e.personalEmail} /></label>
						<label class="f"><span>Personal mobile</span><input name="personalMobile" value={e.personalMobile ?? ''} /></label>
						<label class="f"><span>Designation</span><input name="designation" value={e.designation ?? ''} /></label>
						<label class="f"><span>Department</span><input name="department" value={e.department ?? ''} /></label>
						<label class="f"><span>Team <small>(No Dues header)</small></span><input name="team" value={e.team ?? e.ndc?.team ?? ''} /></label>
						<label class="f"><span>Division</span><input name="division" value={e.division ?? ''} /></label>
						<label class="f"><span>Reporting manager</span><input name="reportingManager" value={e.reportingManager ?? ''} /></label>
						<label class="f"><span>Notice period</span><input name="noticePeriod" value={e.noticePeriod ?? ''} placeholder="e.g. 60 days" /></label>
						<label class="f"><span>Date of joining</span><input name="doj" type="date" value={e.dojIso ?? ''} /></label>
						<label class="f"><span>Date of resignation</span><input name="resignationDate" type="date" value={e.resignationDateIso ?? ''} /></label>
						<label class="f">
							<span>Last working day</span>
							<input name="lwd" type="date" value={e.lwdIso ?? ''} />
						</label>
						<label class="f">
							<span>Separation type</span>
							<GlassSelect
								name="separationType"
								ariaLabel="Separation type"
								value={e.separationType === 'involuntary' ? 'involuntary' : 'voluntary'}
								options={[
									{ value: 'voluntary', label: 'Voluntary' },
									{ value: 'involuntary', label: 'Involuntary' }
								]}
							/>
						</label>
						<label class="f">
							<span>Track <small>(decides the exit letters)</small></span>
							<GlassSelect
								name="track"
								ariaLabel="Track"
								value={e.track ?? ''}
								options={[{ value: '', label: 'Not set' }, ...TRACKS.map((t) => ({ value: t, label: TRACK_LABELS[t] }))]}
							/>
						</label>
						<label class="f"><span>UAN</span><input name="uanNo" value={e.uanNo ?? ''} /></label>
						<label class="f"><span>PAN</span><input name="panNo" value={e.panNo ?? ''} /></label>
						<label class="f"><span>Name as per bank</span><input name="bankAccountName" value={e.bankAccountName ?? ''} /></label>
						<label class="f">
							<span>
								Gratuity applicable
								{#if data.gratuityComputed !== null}
									<em class="computed">
										service says {data.gratuityComputed ? 'yes' : 'no'}
									</em>
								{/if}
							</span>
							<GlassSelect
								name="gratuityApplicable"
								ariaLabel="Gratuity applicable"
								value={e.gratuity?.applicable === true ? 'yes' : e.gratuity?.applicable === false ? 'no' : ''}
								options={[
									{
										value: '',
										label: `Use computed (${data.gratuityComputed === null ? 'unknown' : data.gratuityComputed ? 'yes' : 'no'})`
									},
									{ value: 'yes', label: 'Yes — ask for Form I' },
									{ value: 'no', label: 'No' }
								]}
							/>
						</label>
					</div>
					{#if form?.particularsError && form?.message}<p class="error">{form.message}</p>{/if}
					<div class="row-actions">
						<button class="btn" disabled={sending['particulars']}>
							{sending['particulars'] ? 'Saving…' : 'Save particulars'}
						</button>
					</div>
				</fieldset>
			</form>
		</section>

		<!-- 2. Exit forms link -->
		<section class="card">
			<div class="sec-head">
				<span class="section-num">02</span>
				<div>
					<h2>Exit documents link</h2>
					<p class="muted">
						Sends the employee a private link to complete the NDA, Exit Interview
						and Relieving Formalities — plus Gratuity Form I when it applies.
					</p>
				</div>
			</div>

			<div class="linkbox">
				{#if data.formsLink}
					<div class="linkrow">
						<code>{data.formsLink}</code>
						<button class="btn small ghost" type="button" onclick={() => copy(data.formsLink!, 'forms')}>
							{copied === 'forms' ? 'Copied ✓' : 'Copy'}
						</button>
					</div>
					<p class="muted tiny">
						Expires {stamp(data.formsLinkExpires)}
						{#if data.formsLinkOpened}· opened {stamp(data.formsLinkOpened)}{:else}· not opened yet{/if}
					</p>
				{:else}
					<p class="muted tiny">No live link — send one below.</p>
				{/if}
			</div>

			<div class="btn-row">
				<button class="btn grad" type="button" disabled={!data.isHr} onpointerenter={() => prefetch('forms')} onfocus={() => prefetch('forms')} onclick={() => openReview('forms')}>
					{data.formsLink ? 'Review & resend link' : 'Review & send forms link'}
				</button>
				{#if data.formsLink}
					<form
						method="POST"
						action="?/revokeFormsLink"
						use:enhance={track('revoke')}
						onsubmit={(ev) => {
							if (!confirm('Revoke this link? The employee will no longer be able to open their forms.'))
								ev.preventDefault();
						}}
					>
						<button class="btn ghost small" disabled={!data.isHr}>Revoke</button>
					</form>
				{/if}
				<button class="btn ghost" type="button" disabled={!data.isHr} onpointerenter={() => prefetch('itblock')} onfocus={() => prefetch('itblock')} onclick={() => openReview('itblock')}>
					{e.itAccessRevokedMailSentAt ? 'Review & resend IT access-block mail' : 'Review & mail IT to block access'}
				</button>
			</div>
			{#if e.itAccessRevokedMailSentAt}
				<p class="muted tiny">
					IT notified {stamp(e.itAccessRevokedMailSentAt)} — to {data.itMailRecipients.to.join(', ')}
				</p>
			{/if}
			{#if form?.formsLinkSent}<p class="ok">Link emailed to {e.personalEmail}.</p>{/if}
			{#if form?.itMailSent}<p class="ok">IT has been asked to block system access.</p>{/if}
		</section>

		<!-- 3. Review the submission -->
		<section class="card">
			<div class="sec-head">
				<span class="section-num">03</span>
				<div>
					<h2>Review submission</h2>
					<p class="muted">
						{#if e.submittedAt}
							Submitted {stamp(e.submittedAt)}. Confirm it, or tick anything that needs redoing and
							send it back.
						{:else}
							Nothing submitted yet. Progress on each form is shown below as the employee fills it in.
						{/if}
					</p>
				</div>
			</div>

			<div class="formrail">
				{#each data.forms as f}
					{#if f.applicable}
						<div class="frow" class:done={f.submitted}>
							<span class="fring" class:complete={f.submitted}>
								{#if f.submitted}
									<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.4"><path d="M20 6L9 17l-5-5" /></svg>
								{/if}
							</span>
							<span class="flabel">{f.label}</span>
							<span class="fstate">{f.submitted ? 'Submitted' : 'Pending'}</span>
						</div>
					{/if}
				{/each}
			</div>

			{#if e.requestedFields.length}
				<div class="callout">
					<strong>Waiting on the employee</strong>
					<ul>
						{#each e.requestedFields as r (r.field)}
							<li>
								{r.label}{r.note ? ` — ${r.note}` : ''}
								<span class="muted tiny">· asked {r.count > 1 ? `${r.count}× · ` : ''}{stamp(r.askedAt)}</span>
							</li>
						{/each}
					</ul>
				</div>
			{/if}

			<!-- The answers, with a tick box per item to send back. -->
			<form
				method="POST"
				action="?/requestChanges"
				use:enhance={() => {
					sending['changes'] = true;
					return async ({ result, update }) => {
						await update({ reset: false });
						sending['changes'] = false;
						// Sent: clear the ticks, so the next round starts fresh.
						if (result.type === 'success') changeFields = [];
					};
				}}
			>
				<fieldset class="rbac" disabled={!data.isHr}>
					{#each reviewGroups as group}
						<div class="rgroup">
							<div class="eyebrow">{group.title}</div>
							{#each group.items as item (item.field)}
								{@render askRow(item.field, item.label, item.value ?? '')}
							{/each}
						</div>
					{/each}

					<!-- Exit interview answers are long-form; shown read-only with the
					     same tick-to-resend affordance on the free-text questions. -->
					<div class="rgroup">
						<div class="eyebrow">Exit interview</div>
						{#each EXIT_TEXT_QUESTIONS as q (q.field)}
							{@render askRow(`exitInterview.${q.field}`, `${q.n}. ${q.label}`, e.exitInterview?.[q.field] ?? '')}
						{/each}
						{@render askRow(
							'exitInterview.q10Workload',
							'10. Workload',
							e.exitInterview?.q10Workload ? scaleLabel(EXIT_WORKLOAD_OPTIONS, e.exitInterview.q10Workload) : ''
						)}
						{@render askRow(
							'exitInterview.q14bWouldRecommend',
							'14B. Would recommend',
							e.exitInterview?.q14bWouldRecommend
								? scaleLabel(EXIT_RECOMMEND_OPTIONS, e.exitInterview.q14bWouldRecommend)
								: ''
						)}
						<details class="grids">
							<summary>Rating grids (11, 12, 13)</summary>
							<div class="gridwrap">
								<div class="eyebrow tiny-eyebrow">11. Supervisor</div>
								{#each EXIT_Q11_ROWS as r}
									<div class="gridrow">
										<span>{r.label}</span>
										<b>{scaleLabel(EXIT_Q11_SCALE, e.exitInterview?.q11Supervisor?.[r.key] ?? null)}</b>
									</div>
								{/each}
								<div class="eyebrow tiny-eyebrow">12. Organisation</div>
								{#each EXIT_Q12_ROWS as r}
									<div class="gridrow">
										<span>{r.label}</span>
										<b>{scaleLabel(EXIT_Q12_SCALE, e.exitInterview?.q12Ratings?.[r.key] ?? null)}</b>
									</div>
								{/each}
								<div class="eyebrow tiny-eyebrow">13. Benefits</div>
								{#each EXIT_Q13_ROWS as r}
									<div class="gridrow">
										<span>{r.label}</span>
										<b>{scaleLabel(EXIT_Q13_SCALE, e.exitInterview?.q13Benefits?.[r.key] ?? null)}</b>
									</div>
								{/each}
							</div>
						</details>
					</div>

					{#if e.assets.length}
						<div class="rgroup">
							<div class="eyebrow">Assets declared</div>
							{#each e.assets as a}
								<div class="rrow static">
									<span class="rlabel">{a.item}</span>
									<span class="rvalue" class:empty={!a.returned}>
										{a.returned ? 'Returned' : 'Not returned'}{a.note ? ` — ${a.note}` : ''}
									</span>
								</div>
							{/each}
						</div>
					{/if}

					{#if data.employeeFiles.length || canAskDocs}
						<div class="rgroup">
							<div class="eyebrow up-head">
								Employee uploads
								{#if canAskDocs}
									<button class="nact" type="button" onclick={() => openReview('docs', false, 'docs')}>
										Ask for a document →
									</button>
								{/if}
							</div>
							{#each data.employeeFiles as f}
								<div class="filerow">
									<a href="/admin/offboarding/{e.id}/file/{f.id}" target="_blank" rel="noreferrer">
										{f.label}
									</a>
									<span class="muted tiny">{kb(f.sizeBytes)} · {stamp(f.createdAt)}</span>
									{#if f.reviewStatus === 'reupload_requested'}
										<span class="pill red">Re-upload asked</span>
									{/if}
								</div>
							{/each}
						</div>
					{/if}

					{#if form?.changesError && form?.message}<p class="error">{form.message}</p>{/if}
					<div class="btn-row">
						<span class="muted tiny" style="margin-right:auto">
							Tick what is wrong and say why. The employee is mailed each item with your note and what
							they entered. Repeat as often as needed.
						</span>
						<button class="btn ghost" disabled={!changeFields.length || sending['changes']}>
							{sending['changes'] ? 'Sending…' : `Ask again for ${changeFields.length || ''} item${changeFields.length === 1 ? '' : 's'}`}
						</button>
					</div>
				</fieldset>
			</form>

			<form
				method="POST"
				action="?/acceptSubmission"
				use:enhance={handoff(
					'accept',
					'manager',
					'Accepting the submission and starting the chain…',
					() => true,
					(d) => !!d?.accepted
				)}
			>
				<div class="btn-row" style="margin-top:4px">
					<button class="btn teal" disabled={!data.isHr || sending['accept']}>
						{sending['accept'] ? 'Accepting…' : 'Accept & start the exit chain'}
					</button>
					{#if !data.formsComplete}
						<span class="muted tiny">
							Not every form is submitted yet — accepting now moves straight to clearances.
						</span>
					{/if}
				</div>
			</form>
			{#if form?.accepted}<p class="ok">Submission accepted — the chain has started with the reporting manager (see the map).</p>{/if}
			{#if form?.changesRequested}
				<p class="ok">
					Asked {e.personalEmail} again for {form.changesRequested} item{form.changesRequested === 1 ? '' : 's'}, with
					your notes and what they entered.
				</p>
			{/if}
		</section>

		<!-- 5. HR's step: F&F, leave and loans -->
		<section class="card" id="fnf">
			<div class="sec-head">
				<span class="section-num">05</span>
				<div>
					<h2>F&amp;F, leave &amp; loans</h2>
					<p class="muted">
						HR's step in the chain. Fill in the settlement and the leave position, then hand it to
						payroll — you review their mail before it goes. They get it prefilled with every exit
						document attached, can correct any figure and record loan recovery, and their sign-off is final.
					</p>
				</div>
				{#if form?.handedToPayroll}
					<span class="saved">Payroll mail ready ✓</span>
				{:else if form?.fnfSaved}
					<span class="saved">Saved ✓</span>
				{/if}
			</div>

			<form
				method="POST"
				action="?/saveFnf"
				use:enhance={handoff(
					'fnf',
					'payroll',
					'Saving the F&F and handing it to payroll…',
					(b) => b?.getAttribute('name') === 'handToPayroll',
					(d) => !!d?.handedToPayroll
				)}
			>
				<fieldset class="rbac" disabled={!data.isHr}>
					{#if data.payrollSigned}
						<div class="fnf-read">
							<div class="fnf-read-h">
								<span>Final figures</span>
								<span class="fnf-src">
									signed by payroll{e.fnf?.submittedByPayrollName ? ' — ' + e.fnf.submittedByPayrollName : ''} ·
									{stamp(e.fnf?.submittedByPayrollAt ?? null)}
								</span>
							</div>
							<div class="fnf-read-grid">
								{#each data.fnfForm as f (f.key)}
									<div class="fnf-cell">
										<span class="fnf-k">{f.label}</span>
										<span class="fnf-v">{f.display || '—'}</span>
									</div>
								{/each}
							</div>
						</div>
					{:else}
						<div class="fgrid">
							{#each data.fnfForm as f (f.key)}
								<label class="f">
									<span>{f.label}</span>
									{#if f.date}
										<input type="date" name={f.key} value={f.value} />
									{:else}
										<input
											name={f.key}
											value={f.value}
											inputmode={f.money ? 'decimal' : undefined}
											placeholder={f.money ? 'e.g. 1,42,300' : ''}
										/>
									{/if}
								</label>
							{/each}
						</div>
						{#if hrStep?.status === 'done'}
							<p class="muted tiny" style="margin:10px 0 0">
								With payroll since {stamp(data.flow.hrDoneAt)}. Changes saved here show on their page
								until they sign.
							</p>
						{/if}
					{/if}

					<div class="subblock">
						<label class="check">
							<input type="checkbox" name="pfExitProcessed" checked={e.fnf?.pfExitProcessed} />
							<span>PF exit processed on the EPFO portal</span>
						</label>
						<div class="fgrid">
							<label class="f"><span>EPFO date of exit</span><input name="pfDateOfExit" type="date" value={e.fnf?.pfDateOfExitIso ?? ''} /></label>
							<label class="f"><span>PF remarks</span><input name="pfRemarks" value={e.fnf?.pfRemarks ?? ''} /></label>
						</div>
					</div>

					<div class="subblock">
						<label class="check">
							<input type="checkbox" name="taxationApplicable" checked={e.fnf?.taxationApplicable} />
							<span>Taxation details apply (Form 16 / TDS)</span>
						</label>
						<label class="f"><span>Taxation remarks</span><input name="taxationRemarks" value={e.fnf?.taxationRemarks ?? ''} /></label>
					</div>

					{#if form?.fnfError && form?.message}<p class="error">{form.message}</p>{/if}
					<div class="row-actions">
						<button class="btn" disabled={sending['fnf']}>
							{sending['fnf'] ? 'Saving…' : 'Save'}
						</button>
						{#if !data.payrollSigned && hrStep?.status !== 'done'}
							<button
								class="btn teal"
								name="handToPayroll"
								value="1"
								disabled={sending['fnf'] || hrStep?.status !== 'active'}
							>
								Save &amp; hand to payroll
							</button>
							{#if hrStep?.status !== 'active'}
								<span class="muted tiny">Opens once the clearances before it are signed.</span>
							{/if}
						{/if}
					</div>
				</fieldset>
			</form>
		</section>

		<!-- 5b. Exit letters -->
		<section class="card">
			<div class="sec-head">
				<span class="section-num">05b</span>
				<div>
					<h2>Exit letters</h2>
					<p class="muted">
						{#if e.track}
							{TRACK_LABELS[e.track as Track]} track —
							{isIntern
								? 'the bonafide letter (internship completed) or the internship status certificate (ongoing).'
								: 'the relieving & experience letter.'}
						{:else}
							Track not set, so this is the relieving & experience letter. Set the track in
							<b>Employment particulars</b> if this is an intern.
						{/if}
						Reference number, name, code, designation, dates and supervisor come from the particulars
						above. Which letters go out, and when, is set under <b>Release</b> below.
					</p>
				</div>
				{#if form?.lettersSaved}<span class="saved">Saved ✓</span>{/if}
			</div>

			<form method="POST" action="?/saveLetters" use:enhance={track('letters')}>
				<fieldset class="rbac" disabled={!data.isHr}>
					<div class="fgrid">
						<label class="f">
							<span>Salutation <small>(sets he / she)</small></span>
							<GlassSelect
								name="salutation"
								ariaLabel="Salutation"
								value={e.letters.salutation ?? ''}
								options={[{ value: '', label: 'None — reads "they"' }, ...LETTER_SALUTATIONS.map((s) => ({ value: s, label: s }))]}
							/>
						</label>
						{#if isIntern}
							<label class="f"><span>USN</span><input name="usn" value={e.letters.usn ?? ''} placeholder="ENG22CT0005" /></label>
							<label class="f">
								<span>Internship period</span>
								<input name="internshipPeriod" value={e.letters.internshipPeriod ?? ''} placeholder="six months" />
							</label>
						{/if}
					</div>
					{#if isIntern}
						<label class="f" style="margin-top:13px">
							<span>Work summary <small>— completes "During his internship, he has been actively involved in …"</small></span>
							<textarea
								name="workSummary"
								rows="2"
								placeholder="working on the Ampliz platform, contributing to frontend development, API integration, and system enhancements"
							>{e.letters.workSummary ?? ''}</textarea>
						</label>
					{:else}
						<!-- Kept so saving from the employee view never wipes intern details
						     entered while the track was still set to intern. -->
						<input type="hidden" name="usn" value={e.letters.usn ?? ''} />
						<input type="hidden" name="internshipPeriod" value={e.letters.internshipPeriod ?? ''} />
						<input type="hidden" name="workSummary" value={e.letters.workSummary ?? ''} />
					{/if}
					{#if form?.lettersError && form?.message}<p class="error">{form.message}</p>{/if}
					<div class="row-actions">
						<button class="btn" disabled={sending['letters']}>
							{sending['letters'] ? 'Saving…' : 'Save letter details'}
						</button>
						{#each letters as d (d.key)}
							<a
								class="btn ghost small"
								href="/admin/offboarding/{e.id}/doc/{d.key}"
								data-sveltekit-preload-data="off"
							>
								{d.label}
							</a>
						{/each}
					</div>
				</fieldset>
			</form>
		</section>

		<!-- 6. Release to the employee -->
		<section class="card" id="release">
			<div class="sec-head">
				<span class="section-num">06</span>
				<div>
					<h2>Release to the employee</h2>
					<p class="muted">
						The last step. The letters ticked here go to {e.personalEmail} with their handover link —
						automatically, the set number of days after payroll signs off, or now by hand.
					</p>
				</div>
				{#if form?.releaseSaved}<span class="saved">Saved ✓</span>{/if}
			</div>

			<form method="POST" action="?/saveRelease" use:enhance={track('release')}>
				<fieldset class="rbac" disabled={!data.isHr || e.status === 'completed'}>
					<div class="tiny-eyebrow" style="margin-bottom:8px">Letters to send</div>
					<div class="pk-list">
						{#each data.releaseOptions as o (o.key)}
							<label class="pk-row">
								<input type="checkbox" name="letterKey" value={o.key} checked={data.flow.letterKeys.includes(o.key)} />
								<span>
									{o.label}
									<small class="muted" style="display:block;font-weight:400">Generated from “{o.source}”</small>
								</span>
								<a class="pk-tag" href="/admin/offboarding/{e.id}/doc/{o.key}" data-sveltekit-preload-data="off">preview</a>
							</label>
						{/each}
					</div>

					<div class="cadence">
						<label class="check">
							<input type="checkbox" name="autoRelease" checked={data.flow.autoRelease} />
							<span>Send automatically</span>
						</label>
						<label class="f days">
							<span>Days after payroll signs off</span>
							<input name="releaseAfterDays" type="number" min="0" max="365" value={data.flow.releaseAfterDays} />
						</label>
						<label class="check">
							<input type="checkbox" name="saveDefault" />
							<span>Use this cadence for new offboardings</span>
						</label>
					</div>

					<p class="release-state">
						{#if data.flow.releasedAt}
							Sent {stamp(data.flow.releasedAt)}{data.flow.releasedBy ? ` · ${data.flow.releasedBy}` : ''}.
						{:else if !data.flow.autoRelease}
							Manual — nothing goes out until you review it and press <b>Release now</b>.
						{:else if data.flow.scheduledAt}
							Scheduled for <b>{stamp(data.flow.scheduledAt)}</b>.
						{:else}
							Will be scheduled {data.flow.releaseAfterDays} days after payroll signs off.
						{/if}
					</p>

					{#if form?.releaseError && form?.message}<p class="error">{form.message}</p>{/if}
					<div class="row-actions">
						<button class="btn" disabled={sending['release']}>
							{sending['release'] ? 'Saving…' : 'Save release settings'}
						</button>
					</div>
				</fieldset>
			</form>

			<div class="subblock">
				<div class="tiny-eyebrow" style="margin-bottom:4px">Other handover documents (optional)</div>
				<p class="muted tiny" style="margin:0 0 10px">
					Payslips, the F&amp;F statement, PF and tax papers. Anything uploaded here is listed on the
					employee's handover link.
				</p>
				<div class="slots">
					{#each data.handoverSlots.filter((s) => !s.legacy || data.handoverFiles.some((f) => f.docType === s.docType)) as slot}
						{@const uploaded = data.handoverFiles.find((f) => f.docType === slot.docType)}
						{@const gated =
							slot.applicableWhen === 'pfExitProcessed'
								? !!e.fnf?.pfExitProcessed
								: slot.applicableWhen === 'taxationApplicable'
									? !!e.fnf?.taxationApplicable
									: true}
						<div class="slot" class:muted-slot={!gated}>
							<div class="slot-main">
								<div class="slot-label">
									{slot.label}
									{#if !gated}<span class="opt">not applicable</span>{/if}
								</div>
								{#if uploaded}
									<div class="slot-file">
										<a href="/admin/offboarding/{e.id}/file/{uploaded.id}" target="_blank" rel="noreferrer">View</a>
										<span class="muted tiny">{kb(uploaded.sizeBytes)} · {stamp(uploaded.createdAt)}</span>
									</div>
								{:else if uploadError[slot.docType]}
									<div class="slot-file"><span class="error tiny">{uploadError[slot.docType]}</span></div>
								{/if}
							</div>
							<div class="slot-actions">
								<label class="upload" class:busy={uploading[slot.docType]}>
									{uploading[slot.docType] ? 'Uploading…' : uploaded ? 'Replace' : 'Upload'}
									<input
										type="file"
										accept="application/pdf,image/jpeg,image/png,image/webp"
										disabled={!data.isHr || uploading[slot.docType]}
										onchange={(ev) => uploadHandover(slot.docType, ev.currentTarget)}
									/>
								</label>
								{#if uploaded}
									<form method="POST" action="?/removeHandoverFile" use:enhance={track(`rmf-${uploaded.id}`)}>
										<input type="hidden" name="fileId" value={uploaded.id} />
										<button class="btn small ghost" disabled={!data.isHr}>Remove</button>
									</form>
								{/if}
							</div>
						</div>
					{/each}
				</div>
			</div>

			{#if data.handoverLink}
				<div class="linkbox" style="margin-top:14px">
					<div class="linkrow">
						<code>{data.handoverLink}</code>
						<button class="btn small ghost" type="button" onclick={() => copy(data.handoverLink!, 'handover')}>
							{copied === 'handover' ? 'Copied ✓' : 'Copy'}
						</button>
					</div>
					<p class="muted tiny">
						{#if e.handoverMailSentAt}Sent {stamp(e.handoverMailSentAt)}.{/if} Valid for six months.
					</p>
				</div>
			{/if}

			{#if form?.handoverError && form?.message}<p class="error">{form.message}</p>{/if}
			<div class="btn-row">
				{#if e.status !== 'completed'}
					<button class="btn grad" type="button" disabled={!data.isHr} onpointerenter={() => prefetch('letters')} onfocus={() => prefetch('letters')} onclick={() => openReview('letters')}>
						Review &amp; release now
					</button>
				{/if}
				{#if e.status === 'completed' && data.canReopen}
					<form
						method="POST"
						action="?/reopen"
						use:enhance={track('reopen')}
						onsubmit={(ev) => {
							if (!confirm('Reopen this closed exit? Its release will then only go out when you press Release now.'))
								ev.preventDefault();
						}}
					>
						<button class="btn ghost small">Reopen exit</button>
					</form>
				{/if}
			</div>
			{#if form?.handoverSent}<p class="ok">Sent to {e.personalEmail}. Exit closed.</p>{/if}
		</section>

		<!-- 7. Mail settings: who each step of the chain emails -->
		<section class="card" id="mail-settings">
			<div class="sec-head">
				<span class="section-num">07</span>
				<div>
					<h2>Mail settings</h2>
					<p class="muted">
						Who each step of the chain emails, in order, and who gets the IT "block system access"
						mail. The name and designation prefill the approver's clearance page and print on the No
						Dues certificate. These start from the saved defaults — change them here for this person
						alone, or tick the box to make them the default for new offboardings.
					</p>
				</div>
				{#if form?.routingSaved}
					<span class="saved">Saved{form.routingDefaulted ? ' · default updated' : ''} ✓</span>
				{/if}
				{#if form?.itDefaultSkipped}
					<span class="opt">IT block mail default not changed — needs the exit mail row in Access & org</span>
				{/if}
			</div>

			<form method="POST" action="?/saveRouting" use:enhance={track('routing')}>
				<fieldset class="rbac" disabled={!data.isHr}>
					<div class="routes">
						{#each ROUTING_KEYS as k, i (k)}
							<div class="route" class:off={k === 'salesforce' && !salesforceOn}>
								<div class="route-h">
									<span class="route-n">{i + 1}</span>
									<span class="route-l">{ROUTING_LABELS[k]}</span>
									{#if k === 'salesforce'}
										<label class="check inline">
											<input type="checkbox" name="salesforce_enabled" bind:checked={salesforceOn} />
											<span>Include in this exit</span>
										</label>
									{/if}
									{#if k !== 'manager' && data.routing[k].email !== (data.routingDefaults[k as Exclude<typeof k, 'manager'>].email ?? '')}
										<span class="opt">differs from default</span>
									{/if}
								</div>
								<div class="arow arow3">
									<input
										name="{k}_email"
										type="email"
										placeholder={k === 'manager' ? 'manager@championsmail.com' : `${k}@championsmail.com`}
										value={data.routing[k].email}
									/>
									<input name="{k}_name" placeholder="Name" value={data.routing[k].name} />
									<input
										name="{k}_designation"
										placeholder="Designation"
										maxlength="80"
										value={data.routing[k].designation}
									/>
								</div>
							</div>
						{/each}
						<div class="route">
							<div class="route-h">
								<span class="route-n">IT</span>
								<span class="route-l">IT — block system access mail</span>
								{#if data.itMailRecipients.to.join(',') !== data.itMailDefaults.to.join(',') || data.itMailRecipients.cc.join(',') !== data.itMailDefaults.cc.join(',')}
									<span class="opt">differs from default</span>
								{/if}
							</div>
							<div class="arow">
								<label class="f">
									<span>To</span>
									<textarea name="itblock_to" rows="2" placeholder="one address per line" value={data.itMailRecipients.to.join(NL)}></textarea>
								</label>
								<label class="f">
									<span>Cc</span>
									<textarea name="itblock_cc" rows="2" placeholder="one address per line" value={data.itMailRecipients.cc.join(NL)}></textarea>
								</label>
							</div>
						</div>
					</div>
					<label class="check">
						<input type="checkbox" name="saveDefault" />
						<span>
							Also use these as the default for new offboardings
							<small class="muted">(the reporting manager is never saved — it differs for every employee)</small>
						</span>
					</label>
					{#if form?.routingError && form?.message}<p class="error">{form.message}</p>{/if}
					<div class="row-actions">
						<button class="btn" disabled={sending['routing']}>
							{sending['routing'] ? 'Saving…' : 'Save mail settings'}
						</button>
					</div>
				</fieldset>
			</form>
		</section>
	</div>

	<!-- ─────────────── Right rail: live documents + closure ─────────────── -->
	<aside class="rail">
		<section class="card">
			<div class="eyebrow" style="margin-bottom:12px">Live documents</div>
			<p class="muted tiny" style="margin:0 0 14px">
				Generated fresh on every download, so a clearance signed a minute ago is already in the PDF —
				and this list refreshes on its own as things change.
			</p>
			<div class="doclist">
				{#each forms as d}
					<a
						class="doclink"
						href="/admin/offboarding/{e.id}/doc/{d.key}"
						data-sveltekit-preload-data="off"
					>
						<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
						{d.label}
					</a>
				{/each}
			</div>
			{#if letters.length}
				<div class="tiny-eyebrow" style="margin:14px 0 8px">Letters</div>
				<div class="doclist">
					{#each letters as d}
						<a
							class="doclink"
							href="/admin/offboarding/{e.id}/doc/{d.key}"
							data-sveltekit-preload-data="off"
						>
							<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9"><path d="M4 4h16v16H4z" /><path d="m4 6 8 7 8-7" /></svg>
							{d.label}
						</a>
					{/each}
				</div>
			{/if}
			<a
				class="btn ghost small"
				style="margin-top:12px;width:100%;justify-content:center"
				href="/admin/offboarding/{e.id}/pack-zip"
				data-sveltekit-preload-data="off"
			>
				Download all as ZIP
			</a>
		</section>

		<section class="card">
			<div class="eyebrow" style="margin-bottom:12px">No Dues status</div>
			<div class="ndclist">
				{#each data.ndcState as s}
					<div class="ndcrow">
						<span class="ndclabel">{s.deptLabel}</span>
						<span class="pill {s.signed ? (s.verdict === 'dues' ? 'gold' : 'teal') : ''}">
							{s.signed ? (s.verdict ? VERDICT_LABEL[s.verdict] : 'Signed') : 'Pending'}
						</span>
					</div>
				{/each}
				{#if !data.ndcState.length}
					<p class="muted tiny">No clearances requested yet.</p>
				{/if}
			</div>
		</section>

		<section class="card">
			<div class="eyebrow" style="margin-bottom:12px">Exit closure checklist</div>
			<form method="POST" action="?/saveClosure" use:enhance={track('closure')}>
				<fieldset class="rbac" disabled={!data.isHr}>
					{#each CLOSURE_CHECKLIST as group}
						<div class="cgroup">
							<div class="cgroup-title">{group.group}</div>
							{#each group.items as item}
								<label class="crow">
									<input
										type="checkbox"
										name="checklist"
										value={item.key}
										checked={e.closureChecklist?.[item.key]}
									/>
									<span>{item.label}</span>
								</label>
							{/each}
						</div>
					{/each}
					<button class="btn small" style="width:100%;margin-top:6px" disabled={sending['closure']}>
						{sending['closure'] ? 'Saving…' : 'Save checklist'}
					</button>
					{#if form?.closureSaved}<p class="ok tiny" style="text-align:center">Saved ✓</p>{/if}
				</fieldset>
			</form>
		</section>
	</aside>
</div>

<svelte:window onkeydown={(ev) => ev.key === 'Escape' && review && !sending['review'] && (review = null)} />

<!-- One answer in Review submission: tick it to ask again, with its own
     note. The label and value go along so the mail can quote them back. -->
{#snippet askRow(field: string, label: string, value: string)}
	{@const pending = e.requestedFields.find((r: { field: string }) => r.field === field)}
	{@const times = e.requestCounts?.[field] ?? 0}
	<label class="rrow" class:asked={!!pending}>
		<input type="checkbox" name="field" value={field} bind:group={changeFields} />
		<span class="rlabel">
			{label}
			{#if pending}
				<span class="pill gold">ASKED{times > 1 ? ` ${times}×` : ''}</span>
				<span class="muted tiny">{stamp(pending.askedAt)}{pending.note ? ` — ${pending.note}` : ''}</span>
			{:else if times}
				<span class="muted tiny">asked {times}× before</span>
			{/if}
		</span>
		<span class="rvalue" class:empty={!value}>{value || 'Not answered'}</span>
	</label>
	{#if changeFields.includes(field)}
		<div class="rnote">
			<input type="hidden" name="label:{field}" value={label} />
			<input type="hidden" name="value:{field}" value={value} />
			<input
				name="note:{field}"
				maxlength="500"
				placeholder="What is wrong — shown to the employee (e.g. the address is missing the PIN code)"
			/>
		</div>
	{/if}
{/snippet}

{#if review}
	<div class="rv-back" role="presentation" onclick={() => !sending['review'] && (review = null)}></div>
	<div class="rv" role="dialog" aria-modal="true" aria-label="Review mail" aria-busy={!review.draft && !review.error}>
		<div class="rv-head">
			<div class="rv-icon" class:busy={!review.draft && !review.error} aria-hidden="true">
				<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="5" width="18" height="14" rx="2.5" /><path d="M3.5 6.5l8.5 6 8.5-6" /></svg>
			</div>
			<div class="rv-title">
				<div class="eyebrow">
					{review.previewOnly
						? 'Preview'
						: review.mode === 'back'
							? 'Send back'
							: review.mode === 'docs'
								? 'Ask again'
								: 'Review before sending'}
				</div>
				<h2>
					{reviewTitle}
					{#if review.draft?.reminder}<span class="rv-pill">Reminder</span>{/if}
				</h2>
			</div>
			<button class="rv-x" type="button" aria-label="Close" onclick={() => (review = null)}>
				<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
			</button>
		</div>

		{#if review.mode === 'back' && reviewStep}
			<div class="rv-compose">
				<div class="tiny-eyebrow">What is missing from the {reviewStep.label}'s clearance?</div>
				<div class="rv-ticks">
					{#each reviewStep.sendBackItems as item (item)}
						<label class="check"><input type="checkbox" value={item} bind:group={compose.items} /><span>{item}</span></label>
					{/each}
				</div>
				<div class="tiny-eyebrow" style="margin-top:10px">Ask them to attach</div>
				{#each compose.uploads as _, i (i)}
					<input class="rv-in" placeholder="e.g. Asset handover sheet signed by the employee" bind:value={compose.uploads[i]} />
				{/each}
				{#if compose.uploads.length < 5}
					<button class="nact" type="button" onclick={() => (compose.uploads = [...compose.uploads, ''])}>+ another document</button>
				{/if}
				<textarea class="rv-in" rows="2" placeholder="Note to them (optional)" bind:value={compose.note}></textarea>
				{#if reviewStep.key === 'payroll'}
					<p class="muted tiny">Sending payroll back un-signs the settlement and stops the scheduled release until they sign again.</p>
				{/if}
			</div>
		{:else if review.mode === 'docs'}
			<div class="rv-compose">
				<div class="tiny-eyebrow">Which documents do you need from {e.fullName.split(' ')[0]}?</div>
				<div class="rv-ticks">
					{#each data.uploadDocs as d (d.docType)}
						<label class="check">
							<input type="checkbox" value={d.docType} bind:group={compose.docs} />
							<span>
								{d.label}
								<small class="muted">
									{d.requested ? '· already asked' : d.fileId ? '· uploaded — ask to re-upload' : '· not uploaded yet'}
								</small>
							</span>
						</label>
					{/each}
				</div>
				<textarea class="rv-in" rows="2" placeholder="Note to the employee, e.g. the signature photo is too dark to print" bind:value={compose.note}></textarea>
				<p class="muted tiny">Only these uploads reopen on their page — their forms and the signatures already collected are untouched.</p>
			</div>
		{/if}

		{#if review.error}
			<div class="rv-error">
				<b>The mail could not be built.</b>
				<span>{review.error}</span>
				<button
					class="btn ghost small"
					type="button"
					onclick={() => {
						if (!review) return;
						review.error = '';
						review.query = null;
						fetchDraft();
					}}>Try again</button
				>
			</div>
		{:else if !review.draft}
			<div class="rv-loading" aria-live="polite">
				<div class="rv-stage"><span class="rv-spin"></span>{review.stage ?? 'Composing the mail…'}</div>
				<div class="sk-meta">
					{#each [62, 48, 74] as w, i (i)}
						<div class="sk-row"><span class="sk sk-k"></span><span class="sk" style="width:{w}%"></span></div>
					{/each}
				</div>
				<div class="sk-mail">
					<span class="sk sk-logo"></span>
					<span class="sk sk-h"></span>
					{#each [92, 86, 95, 60] as w, i (i)}<span class="sk sk-line" style="width:{w}%"></span>{/each}
					<span class="sk sk-btn"></span>
					{#each [80, 70] as w, i (i)}<span class="sk sk-line" style="width:{w}%"></span>{/each}
				</div>
			</div>
		{:else}
			{@const d = review.draft}
			<dl class="rv-meta">
				<dt>To</dt>
				<dd>
					{#if d.to.length}
						<span class="rv-chips">{#each d.to as a (a)}<span class="rv-chip">{a}</span>{/each}</span>
					{:else}<span class="rv-none">No address set</span>{/if}
				</dd>
				{#if d.cc.length}
					<dt>Cc</dt>
					<dd><span class="rv-chips">{#each d.cc as a (a)}<span class="rv-chip soft">{a}</span>{/each}</span></dd>
				{/if}
				<dt>Subject</dt>
				<dd><b>{d.subject}</b></dd>
				<dt>Attached</dt>
				<dd>
					{#if d.attachments.length}
						<span class="rv-atts">
							{#each d.attachments as a (a.href)}
								<a class="rv-att" href={a.href} target="_blank" rel="noopener" data-sveltekit-preload-data="off">{a.name}</a>
							{/each}
						</span>
					{:else}
						<span class="muted">Nothing</span>
					{/if}
				</dd>
			</dl>
			{#if d.why}<p class="rv-why">{d.why}</p>{/if}
			<div class="rv-frame">
				<iframe class="rv-body" title="Mail body" sandbox="" srcdoc={d.html}></iframe>
			</div>
		{/if}

		{#if form?.message && !sending['review'] && review.draft}<p class="error" style="margin:0 20px 10px">{form.message}</p>{/if}
		<div class="rv-actions">
			<p class="rv-foot">
				The link in the mail is created when you press Send. Wrong address?
				<a href="#mail-settings" onclick={() => (review = null)}>Mail settings</a>
			</p>
			<button class="btn ghost" type="button" onclick={() => (review = null)} disabled={sending['review']}>
				{review.previewOnly ? 'Close' : 'Cancel'}
			</button>
			{#if !review.previewOnly}
				<form
					method="POST"
					action="?/{review.mode === 'back' ? 'sendBackStep' : review.mode === 'docs' ? 'requestUploads' : SEND_ACTION[review.step]}"
					use:enhance={sendReviewed}
				>
					<input type="hidden" name="step" value={review.step} />
					{#if review.mode}
						{#each compose.items as i (i)}<input type="hidden" name="item" value={i} />{/each}
						{#each compose.uploads.filter((u) => u.trim()) as u, n (n)}<input type="hidden" name="upload" value={u} />{/each}
						{#each compose.docs as d (d)}<input type="hidden" name="doc" value={d} />{/each}
						<input type="hidden" name="note" value={compose.note} />
					{/if}
					<button class="btn grad" disabled={!data.isHr || !review.draft?.sendable || sending['review']}>
						{sending['review']
							? 'Sending…'
							: review.mode === 'back'
								? 'Send back'
								: review.mode === 'docs'
									? 'Send request'
									: review.step === 'letters'
								? 'Release & close the exit'
								: review.draft?.reminder
									? 'Send reminder'
									: 'Send'}
					</button>
				</form>
			{/if}
		</div>
	</div>
{/if}

<style>
	/* ── Review & send dialog ── */
	.rv-back {
		position: fixed;
		inset: 0;
		background: rgb(6 8 14 / 0.62);
		backdrop-filter: blur(6px);
		-webkit-backdrop-filter: blur(6px);
		z-index: 50;
		animation: rv-fade 0.16s ease-out;
	}
	.rv {
		position: fixed;
		z-index: 51;
		top: 50%;
		left: 50%;
		transform: translate(-50%, -50%);
		width: min(780px, calc(100vw - 32px));
		height: min(860px, calc(100vh - 40px));
		display: flex;
		flex-direction: column;
		background: var(--ae-card-bg), var(--ae-modal-base, #12151f);
		border: 1px solid var(--ae-card-border);
		border-radius: 18px;
		box-shadow: 0 30px 80px -20px rgb(0 0 0 / 0.6), inset 0 1px 0 rgb(255 255 255 / 0.08);
		overflow: hidden;
		animation: rv-in 0.22s var(--ae-spring);
	}
	@keyframes rv-fade {
		from {
			opacity: 0;
		}
	}
	@keyframes rv-in {
		from {
			opacity: 0;
			transform: translate(-50%, calc(-50% + 14px)) scale(0.98);
		}
	}
	.rv-head {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 16px 18px 14px 20px;
		border-bottom: 1px solid var(--ae-line);
	}
	.rv-icon {
		width: 38px;
		height: 38px;
		flex-shrink: 0;
		border-radius: 11px;
		display: grid;
		place-items: center;
		color: var(--ae-ember);
		background: rgb(255 125 85 / 0.12);
		border: 1px solid rgb(255 125 85 / 0.25);
	}
	.rv-icon.busy svg {
		animation: rv-bob 1.1s ease-in-out infinite;
	}
	@keyframes rv-bob {
		50% {
			transform: translateY(-2px);
		}
	}
	.rv-title {
		flex: 1;
		min-width: 0;
	}
	.rv-title .eyebrow {
		margin: 0;
	}
	.rv-head h2 {
		margin: 2px 0 0;
		font-size: 17px;
		display: flex;
		align-items: center;
		gap: 8px;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}
	.rv-pill {
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0;
		text-transform: none;
		padding: 2px 8px;
		border-radius: 999px;
		color: var(--ae-amber);
		background: rgb(242 177 92 / 0.14);
	}
	.rv-x {
		width: 32px;
		height: 32px;
		flex-shrink: 0;
		display: grid;
		place-items: center;
		border: 1px solid var(--ae-line);
		border-radius: 9px;
		background: none;
		color: var(--ae-muted);
		cursor: pointer;
		transition: background 0.12s, color 0.12s;
	}
	.rv-x:hover {
		background: var(--ae-hover);
		color: var(--ae-text);
	}
	.rv-meta {
		display: grid;
		grid-template-columns: 72px 1fr;
		gap: 9px 12px;
		align-items: center;
		margin: 0;
		padding: 14px 20px;
		font-size: 13px;
		border-bottom: 1px solid var(--ae-line);
		background: var(--ae-sub-bg);
	}
	.rv-meta dt {
		color: var(--ae-muted);
		font-size: 11px;
		font-weight: 700;
		text-transform: none;
		letter-spacing: 0;
	}
	.rv-meta dd {
		margin: 0;
		color: var(--ae-text);
		word-break: break-word;
		min-width: 0;
	}
	.rv-chips,
	.rv-atts {
		display: flex;
		flex-wrap: wrap;
		gap: 6px;
	}
	.rv-chip {
		font-size: 12px;
		padding: 2px 10px;
		border-radius: 999px;
		background: rgb(123 167 240 / 0.14);
		border: 1px solid rgb(123 167 240 / 0.3);
		color: var(--ae-text);
	}
	.rv-chip.soft {
		background: var(--ae-hover);
		border-color: var(--ae-line-strong);
		color: var(--ae-text-2);
	}
	.rv-none {
		color: var(--ae-crimson);
		font-weight: 600;
	}
	.rv-att {
		font-size: 12px;
		padding: 2px 10px 2px 8px;
		border: 1px solid var(--ae-line-strong);
		border-radius: 999px;
		color: var(--ae-azure);
		text-decoration: none;
	}
	.rv-att::before {
		content: '📎 ';
	}
	.rv-att:hover {
		background: var(--ae-hover);
	}
	.rv-why {
		margin: 12px 20px 0;
		padding: 9px 12px;
		font-size: 12.5px;
		border-radius: 10px;
		border: 1px solid rgb(242 177 92 / 0.3);
		background: rgb(242 177 92 / 0.1);
		color: var(--ae-text-2);
	}
	.rv-frame {
		flex: 1;
		min-height: 0;
		margin: 12px 20px 0;
		padding: 10px;
		border-radius: 12px;
		background: rgb(0 0 0 / 0.18);
		border: 1px solid var(--ae-line);
		display: flex;
	}
	.rv-body {
		flex: 1;
		width: 100%;
		min-height: 260px;
		border: none;
		border-radius: 8px;
		background: #f2f4f7;
	}
	.rv-error {
		margin: 18px 20px;
		padding: 14px 16px;
		border-radius: 12px;
		border: 1px solid rgb(240 117 117 / 0.35);
		background: rgb(240 117 117 / 0.08);
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 6px;
		font-size: 13px;
		color: var(--ae-text-2);
	}
	.rv-error b {
		color: var(--ae-crimson);
	}
	/* The loader: the dialog's own shape, shimmering, so it opens at its final
	   size and the mail settles into place instead of the box jumping. */
	.rv-loading {
		flex: 1;
		min-height: 0;
		display: flex;
		flex-direction: column;
	}
	.rv-stage {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 12px 20px;
		font-size: 13px;
		font-weight: 500;
		color: var(--ae-text-2);
		border-bottom: 1px solid var(--ae-line);
	}
	.rv-spin {
		width: 15px;
		height: 15px;
		border-radius: 50%;
		border: 2px solid rgb(255 125 85 / 0.25);
		border-top-color: var(--ae-ember);
		animation: rv-rot 0.7s linear infinite;
	}
	@keyframes rv-rot {
		to {
			transform: rotate(360deg);
		}
	}
	.sk-meta {
		padding: 14px 20px;
		display: grid;
		gap: 11px;
		border-bottom: 1px solid var(--ae-line);
		background: var(--ae-sub-bg);
	}
	.sk-row {
		display: flex;
		gap: 12px;
		align-items: center;
	}
	.sk {
		display: block;
		height: 10px;
		border-radius: 6px;
		background: linear-gradient(90deg, var(--ae-hover) 0%, var(--ae-line-strong) 45%, var(--ae-hover) 90%);
		background-size: 220% 100%;
		animation: sk-shine 1.2s ease-in-out infinite;
	}
	@keyframes sk-shine {
		from {
			background-position: 120% 0;
		}
		to {
			background-position: -120% 0;
		}
	}
	.sk-k {
		width: 60px;
		flex-shrink: 0;
	}
	.sk-mail {
		flex: 1;
		margin: 12px 20px 0;
		padding: 26px 28px;
		border-radius: 12px;
		border: 1px solid var(--ae-line);
		background: rgb(0 0 0 / 0.14);
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.sk-logo {
		width: 110px;
		height: 22px;
		margin-bottom: 8px;
	}
	.sk-h {
		width: 55%;
		height: 16px;
		margin-bottom: 4px;
	}
	.sk-btn {
		width: 150px;
		height: 34px;
		border-radius: 9px;
		margin: 8px 0;
	}
	.rv-actions {
		display: flex;
		justify-content: flex-end;
		align-items: center;
		gap: 10px;
		padding: 14px 20px;
		margin-top: 12px;
		border-top: 1px solid var(--ae-line);
		background: var(--ae-sub-bg);
	}
	.rv-foot {
		margin: 0 auto 0 0;
		font-size: 11.5px;
		line-height: 1.45;
		color: var(--ae-muted);
		max-width: 340px;
	}
	@media (max-width: 640px) {
		.rv {
			height: calc(100vh - 24px);
			width: calc(100vw - 16px);
		}
		.rv-foot {
			display: none;
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.rv,
		.rv-back,
		.sk,
		.rv-icon.busy svg {
			animation: none;
		}
	}
	.rv-actions form {
		display: contents;
	}
	.nact.go {
		padding: 3px 10px;
		border-radius: 999px;
		background: var(--ae-azure);
		color: #fff;
	}
	.nact.quiet {
		color: var(--ae-muted);
		display: block;
	}
	.nwait {
		margin-top: 3px;
		font-size: 11px;
		color: var(--ae-amber);
		line-height: 1.4;
	}
	.nfile {
		display: block;
		margin-top: 3px;
		font-size: 11px;
		color: var(--ae-azure);
		text-decoration: none;
	}
	.up-head {
		display: flex;
		justify-content: space-between;
		align-items: center;
	}
	.up-head .nact {
		margin-top: 0;
		text-transform: none;
		letter-spacing: 0;
	}
	.rv-compose {
		padding: 12px 20px;
		border-bottom: 1px solid var(--ae-line-soft);
		display: flex;
		flex-direction: column;
		gap: 6px;
		max-height: 34vh;
		overflow-y: auto;
	}
	.rv-ticks {
		display: grid;
		gap: 4px;
		font-size: 13px;
	}
	.rv-ticks .check {
		display: flex;
		gap: 8px;
		align-items: flex-start;
	}
	.rv-in {
		width: 100%;
		font: inherit;
		font-size: 13px;
		padding: 7px 9px;
		border: 1px solid var(--ae-line);
		border-radius: 8px;
		background: var(--ae-card-bg);
		color: var(--ae-text);
		box-sizing: border-box;
	}
	.back {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 12.5px;
		color: var(--ae-muted);
		margin-bottom: 12px;
		text-decoration: none;
	}
	.back:hover {
		color: var(--ae-ember-glow);
	}
	.head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 16px;
		margin-bottom: 18px;
		flex-wrap: wrap;
	}
	.head-actions {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
	}
	.submeta {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
		font-size: 12.5px;
		color: var(--ae-muted);
	}
	.mono {
		font-family: var(--ae-font-mono);
	}
	.banner {
		margin: 0 0 14px;
		padding: 10px 14px;
		background: rgba(var(--ae-crimson-rgb), 0.1);
		border: 1px solid rgba(var(--ae-crimson-rgb), 0.3);
		border-radius: 8px;
	}
	.cols {
		display: grid;
		grid-template-columns: 250px minmax(0, 1fr) 300px;
		gap: 18px;
		align-items: start;
	}
	@media (max-width: 1400px) {
		.cols {
			grid-template-columns: 240px minmax(0, 1fr);
		}
		.cols > .rail {
			grid-column: 2;
		}
	}

	/* ── The exit-chain map ─────────────────────────────────────────── */
	.flowmap {
		position: sticky;
		top: 18px;
		min-width: 0;
	}
	.mapcard {
		padding: 16px 14px 14px;
	}
	.map-head {
		display: flex;
		align-items: center;
		justify-content: space-between;
	}
	.map-pct {
		font-family: var(--ae-font-mono);
		font-size: 12px;
		font-weight: 700;
		color: var(--ae-verdant);
	}
	.map-bar {
		height: 5px;
		border-radius: 99px;
		background: var(--ae-line-soft);
		overflow: hidden;
		margin: 10px 0 8px;
	}
	.map-bar span {
		display: block;
		height: 100%;
		border-radius: inherit;
		background: linear-gradient(90deg, var(--ae-verdant), var(--ae-azure));
		transition: width 0.5s ease;
	}
	.map-ref {
		font-family: var(--ae-font-mono);
		font-size: 10.5px;
		color: var(--ae-muted);
		margin-bottom: 6px;
		word-break: break-all;
	}
	.map {
		list-style: none;
		margin: 12px 0 0;
		padding: 0;
	}
	.node {
		position: relative;
		display: grid;
		grid-template-columns: 26px minmax(0, 1fr);
		gap: 10px;
		padding-bottom: 16px;
	}
	/* The connector to the next node: solid once this step is done. */
	.node:not(:last-child)::before {
		content: '';
		position: absolute;
		left: 12px;
		top: 26px;
		bottom: 0;
		width: 2px;
		background: var(--ae-line-soft);
	}
	.node.done:not(:last-child)::before {
		background: var(--ae-verdant);
	}
	.node.skipped:not(:last-child)::before {
		background: repeating-linear-gradient(var(--ae-line-soft) 0 3px, transparent 3px 6px);
	}
	.dot {
		width: 26px;
		height: 26px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		font-size: 11px;
		font-weight: 800;
		font-family: var(--ae-font-mono);
		border: 2px solid var(--ae-line);
		color: var(--ae-muted);
		background: var(--ae-card-bg);
		position: relative;
		z-index: 1;
	}
	.node.done .dot {
		background: var(--ae-verdant);
		border-color: var(--ae-verdant);
		color: #fff;
	}
	.node.active .dot {
		border-color: var(--ae-amber);
		color: var(--ae-amber);
		box-shadow: 0 0 0 4px rgba(var(--ae-amber-rgb), 0.16);
		animation: map-pulse 2s ease-in-out infinite;
	}
	.node.blocked .dot {
		border-color: var(--ae-ember);
		background: var(--ae-ember);
		color: #fff;
	}
	.node.skipped .dot {
		border-style: dashed;
	}
	@keyframes map-pulse {
		50% {
			box-shadow: 0 0 0 7px rgba(var(--ae-amber-rgb), 0.06);
		}
	}
	@media (prefers-reduced-motion: reduce) {
		.node.active .dot {
			animation: none;
		}
	}
	.nbody {
		min-width: 0;
		padding-top: 3px;
	}
	.nlabel {
		font-size: 12.5px;
		font-weight: 700;
		color: var(--ae-text);
		display: flex;
		align-items: center;
		gap: 6px;
		flex-wrap: wrap;
	}
	.node.waiting .nlabel,
	.node.skipped .nlabel {
		color: var(--ae-muted);
	}
	.nto {
		font-size: 10.5px;
		font-family: var(--ae-font-mono);
		color: var(--ae-text-2);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		margin-top: 2px;
	}
	.ndetail {
		font-size: 11px;
		color: var(--ae-muted);
		margin-top: 2px;
		line-height: 1.35;
	}
	.node.blocked .ndetail {
		color: var(--ae-ember);
	}
	.nacts {
		display: flex;
		gap: 10px;
		margin-top: 5px;
	}
	.nact {
		display: inline-block;
		margin-top: 5px;
		padding: 0;
		border: none;
		background: none;
		font: inherit;
		font-size: 11px;
		font-weight: 700;
		color: var(--ae-azure);
		cursor: pointer;
		text-decoration: none;
	}
	.nacts .nact {
		margin-top: 0;
	}
	.nact:disabled {
		opacity: 0.5;
		cursor: default;
	}
	.map-note,
	.map-err,
	.map-ok {
		font-size: 11px;
		margin: 4px 0 8px;
		line-height: 1.4;
	}
	.map-note {
		color: var(--ae-muted);
	}
	.map-err {
		color: var(--ae-ember);
	}
	.map-ok {
		color: var(--ae-verdant);
	}
	.map-settings {
		display: block;
		margin-top: 6px;
		font-size: 11px;
		font-weight: 700;
		color: var(--ae-text-2);
		text-decoration: none;
	}

	/* ── Release & mail settings ────────────────────────────────────── */
	.cadence {
		display: flex;
		align-items: flex-end;
		gap: 18px;
		flex-wrap: wrap;
		margin-top: 12px;
	}
	.cadence .check {
		margin-top: 0;
		padding-bottom: 9px;
	}
	.cadence .days {
		width: 190px;
	}
	.release-state {
		font-size: 12.5px;
		color: var(--ae-text-2);
		margin: 12px 0 0;
	}
	.routes {
		display: flex;
		flex-direction: column;
		gap: 12px;
	}
	.route {
		border: 1px solid var(--ae-line-soft);
		border-radius: 10px;
		padding: 10px 12px;
		transition: opacity 0.2s;
	}
	.route.off .arow {
		opacity: 0.45;
	}
	.route-h {
		display: flex;
		align-items: center;
		gap: 8px;
		flex-wrap: wrap;
		margin-bottom: 8px;
	}
	.route-n {
		width: 20px;
		height: 20px;
		border-radius: 50%;
		display: grid;
		place-items: center;
		font-size: 10.5px;
		font-weight: 800;
		font-family: var(--ae-font-mono);
		background: var(--ae-sub-bg, rgba(255, 255, 255, 0.05));
		border: 1px solid var(--ae-line);
	}
	.route-l {
		font-size: 12.5px;
		font-weight: 700;
	}
	.check.inline {
		margin-top: 0;
		margin-left: auto;
		font-size: 11.5px;
	}
	.main {
		display: flex;
		flex-direction: column;
		gap: 18px;
		min-width: 0;
	}
	.rail {
		display: flex;
		flex-direction: column;
		gap: 18px;
		position: sticky;
		top: 18px;
	}
	@media (max-width: 960px) {
		.cols {
			grid-template-columns: minmax(0, 1fr);
		}
		.cols > .rail {
			grid-column: auto;
		}
		.rail,
		.flowmap {
			position: static;
		}
	}
	.sec-head {
		display: flex;
		align-items: flex-start;
		gap: 12px;
		margin-bottom: 18px;
	}
	.sec-head h2 {
		margin: 0 0 3px;
		font-size: 15.5px;
		font-weight: 600;
	}
	.sec-head .muted {
		margin: 0;
		font-size: 12.5px;
		line-height: 1.6;
	}
	.section-num {
		font-family: var(--ae-font-mono);
		font-size: 11px;
		color: var(--ae-ember);
		border: 1px solid rgba(var(--ae-ember-rgb), 0.3);
		border-radius: 6px;
		padding: 3px 7px;
		flex: none;
	}
	.saved {
		margin-left: auto;
		font-size: 11.5px;
		color: var(--ae-verdant);
		font-weight: 600;
		flex: none;
	}
	.fgrid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
		gap: 13px 16px;
	}
	.f {
		display: flex;
		flex-direction: column;
		gap: 5px;
		min-width: 0;
	}
	.f > span {
		font-size: 11.5px;
		font-weight: 500;
		color: var(--ae-text-2);
	}
	.computed {
		font-style: normal;
		font-family: var(--ae-font-mono);
		font-size: 10px;
		color: var(--ae-muted);
		margin-left: 5px;
	}
	.check {
		display: flex;
		align-items: center;
		gap: 8px;
		margin-top: 14px;
		font-size: 12.5px;
		color: var(--ae-text-2);
	}
	.check input {
		width: auto;
	}
	.row-actions,
	.btn-row {
		display: flex;
		align-items: center;
		gap: 10px;
		margin-top: 16px;
		flex-wrap: wrap;
	}
	.btn-row form {
		display: contents;
	}
	.rbac {
		border: none;
		padding: 0;
		margin: 0;
		min-width: 0;
	}
	.linkbox {
		background: var(--ae-sub-bg, rgba(255, 255, 255, 0.03));
		border: 1px solid var(--ae-line-soft);
		border-radius: 10px;
		padding: 12px 14px;
		margin-bottom: 14px;
	}
	.linkrow {
		display: flex;
		align-items: center;
		gap: 10px;
	}
	.linkrow code {
		flex: 1;
		min-width: 0;
		overflow-x: auto;
		white-space: nowrap;
		font-size: 11.5px;
		padding: 5px 8px;
		border-radius: 6px;
	}
	.tiny {
		font-size: 11.5px;
	}
	.ok {
		margin: 12px 0 0;
		font-size: 12.5px;
		color: var(--ae-verdant);
	}
	.formrail {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin-bottom: 16px;
	}
	.frow {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 7px 0;
		font-size: 13px;
		border-bottom: 1px solid var(--ae-line-soft);
	}
	.fring {
		width: 17px;
		height: 17px;
		border-radius: 50%;
		border: 1.6px solid var(--ae-line-strong);
		display: grid;
		place-items: center;
		flex: none;
	}
	.fring.complete {
		background: var(--ae-verdant);
		border-color: var(--ae-verdant);
	}
	.flabel {
		flex: 1;
		color: var(--ae-text-2);
	}
	.frow.done .flabel {
		color: var(--ae-text);
	}
	.fstate {
		font-family: var(--ae-font-mono);
		font-size: 10.5px;
		color: var(--ae-muted);
		text-transform: none;
		letter-spacing: 0;
	}
	.callout {
		background: rgba(var(--ae-amber-rgb), 0.08);
		border-left: 3px solid var(--ae-amber);
		border-radius: 0 8px 8px 0;
		padding: 11px 14px;
		margin-bottom: 16px;
		font-size: 12.5px;
	}
	.callout strong {
		display: block;
		margin-bottom: 4px;
		color: var(--ae-amber);
		font-size: 11.5px;
		text-transform: none;
		letter-spacing: 0;
	}
	.callout ul {
		margin: 0;
		padding-left: 18px;
		color: var(--ae-text-2);
		line-height: 1.7;
	}
	.rgroup {
		margin-bottom: 18px;
	}
	.rrow {
		display: grid;
		grid-template-columns: 18px minmax(0, 1fr) minmax(0, 1.2fr);
		gap: 10px;
		align-items: start;
		padding: 7px 0;
		border-bottom: 1px solid var(--ae-line-soft);
		font-size: 12.5px;
		cursor: pointer;
	}
	.rrow.asked {
		background: rgb(224 166 60 / 0.07);
	}
	.rrow .pill {
		margin-left: 6px;
	}
	.rnote {
		padding: 6px 0 10px 28px;
		border-bottom: 1px solid var(--ae-line-soft);
	}
	.rnote input {
		width: 100%;
	}
	.rrow.static {
		grid-template-columns: minmax(0, 1fr) minmax(0, 1.2fr);
		cursor: default;
	}
	.rrow input {
		width: auto;
		margin-top: 2px;
	}
	.rlabel {
		color: var(--ae-text-2);
		line-height: 1.5;
	}
	.rvalue {
		color: var(--ae-text);
		line-height: 1.5;
		word-break: break-word;
	}
	.rvalue.empty {
		color: var(--ae-faint, var(--ae-muted));
		font-style: italic;
	}
	.grids {
		margin-top: 10px;
		font-size: 12.5px;
	}
	.grids summary {
		cursor: pointer;
		color: var(--ae-ember-glow);
		font-size: 12px;
	}
	.gridwrap {
		margin-top: 10px;
	}
	.tiny-eyebrow {
		font-size: 10px;
		margin: 12px 0 5px;
	}
	.gridrow {
		display: flex;
		justify-content: space-between;
		gap: 12px;
		padding: 4px 0;
		border-bottom: 1px solid var(--ae-line-soft);
		color: var(--ae-muted);
	}
	.gridrow b {
		color: var(--ae-text-2);
		font-weight: 500;
		flex: none;
	}
	.filerow {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 6px 0;
		border-bottom: 1px solid var(--ae-line-soft);
		font-size: 12.5px;
		flex-wrap: wrap;
	}
	.opt {
		font-family: var(--ae-font-mono);
		font-size: 9.5px;
		color: var(--ae-muted);
		text-transform: none;
		letter-spacing: 0;
		margin-left: 6px;
	}
	.arow {
		display: grid;
		grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr);
		gap: 8px;
	}
	.arow.arow3 {
		grid-template-columns: minmax(0, 1.4fr) minmax(0, 1fr) minmax(0, 1fr);
	}
	@media (max-width: 720px) {
		.arow,
		.arow.arow3 {
			grid-template-columns: minmax(0, 1fr);
		}
		.rrow,
		.rrow.static {
			grid-template-columns: minmax(0, 1fr);
		}
	}
	.subblock {
		margin-top: 18px;
		padding-top: 14px;
		border-top: 1px solid var(--ae-line-soft);
	}
	.subblock .fgrid {
		margin-top: 12px;
	}
	.slots {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin-bottom: 16px;
	}
	.slot {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 12px;
		padding: 9px 0;
		border-bottom: 1px solid var(--ae-line-soft);
		flex-wrap: wrap;
	}
	.slot.muted-slot {
		opacity: 0.5;
	}
	.slot-label {
		font-size: 12.5px;
		color: var(--ae-text-2);
	}
	.slot-file {
		display: flex;
		gap: 8px;
		align-items: center;
		margin-top: 3px;
		font-size: 11.5px;
	}
	.slot-actions {
		display: flex;
		align-items: center;
		gap: 6px;
	}
	.upload {
		font-size: 11.5px;
		font-weight: 500;
		color: var(--ae-ember-glow);
		border: 1px solid rgba(var(--ae-ember-rgb), 0.3);
		border-radius: 7px;
		padding: 5px 11px;
		cursor: pointer;
	}
	.upload.busy {
		opacity: 0.6;
		cursor: default;
	}
	.upload input {
		display: none;
	}
	.doclist {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.doclink {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 8px 0;
		font-size: 12.5px;
		color: var(--ae-text-2);
		text-decoration: none;
		border-bottom: 1px solid var(--ae-line-soft);
	}
	.doclink:hover {
		color: var(--ae-ember-glow);
	}
	/* Document picker for the payroll send. Employee uploads start unticked:
	   they were given to HR, and forwarding them should be a deliberate tick. */
	.pk-list {
		display: flex;
		flex-direction: column;
		border: 1px solid var(--ae-line);
		border-radius: 10px;
		overflow: hidden;
	}
	.pk-row {
		display: flex;
		align-items: center;
		gap: 9px;
		padding: 8px 12px;
		font-size: 12.5px;
		border-bottom: 1px solid var(--ae-line-soft);
		cursor: pointer;
	}
	.pk-row:last-child {
		border-bottom: none;
	}
	.pk-row:hover {
		background: var(--ae-hover, rgba(255, 255, 255, 0.04));
	}
	.pk-row > span:nth-of-type(1) {
		flex: 1;
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.pk-tag {
		font-family: var(--ae-font-mono);
		font-size: 9px;
		letter-spacing: 0;
		text-transform: none;
		color: var(--ae-muted);
		border: 1px solid var(--ae-line-strong);
		border-radius: 5px;
		padding: 1px 5px;
		flex: none;
	}
	.fnf-read {
		border: 1px solid var(--ae-line);
		border-radius: 10px;
		padding: 11px 13px 13px;
		margin-bottom: 4px;
	}
	.fnf-read-h {
		display: flex;
		align-items: baseline;
		gap: 9px;
		flex-wrap: wrap;
		margin-bottom: 10px;
	}
	.fnf-read-h > span:first-child {
		font-size: 12.5px;
		font-weight: 600;
		color: var(--ae-text-2);
	}
	.fnf-src {
		font-size: 10.5px;
		color: var(--ae-verdant);
	}
	.fnf-src.waiting {
		color: var(--ae-amber);
	}
	.fnf-read-grid {
		display: grid;
		grid-template-columns: repeat(auto-fit, minmax(160px, 1fr));
		gap: 9px 16px;
	}
	.fnf-cell {
		display: flex;
		flex-direction: column;
		gap: 2px;
		min-width: 0;
	}
	.fnf-k {
		font-size: 10.5px;
		color: var(--ae-muted);
	}
	.fnf-v {
		font-size: 13px;
		font-weight: 600;
		overflow-wrap: anywhere;
	}
	.ndclist {
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.ndcrow {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 8px;
		padding: 7px 0;
		border-bottom: 1px solid var(--ae-line-soft);
	}
	.ndclabel {
		font-size: 12px;
		color: var(--ae-text-2);
		line-height: 1.4;
	}
	.cgroup {
		margin-bottom: 14px;
	}
	.cgroup-title {
		font-family: var(--ae-font-mono);
		font-size: 10px;
		text-transform: none;
		letter-spacing: 0;
		color: var(--ae-muted);
		margin-bottom: 6px;
	}
	.crow {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		padding: 4px 0;
		font-size: 12px;
		color: var(--ae-text-2);
		cursor: pointer;
		line-height: 1.45;
	}
	.crow input {
		width: auto;
		margin-top: 2px;
		flex: none;
	}
</style>
