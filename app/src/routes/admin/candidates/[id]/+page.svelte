<script lang="ts">
	import { untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import {
		COMPENSATION_FIELD_BY_TRACK,
		CONSULTANT_LETTER_TRACKS,
		EXP_LIKE_TRACKS,
		TRACK_LABELS,
		type Track
	} from '$lib/shared/matrix';
	import { toIsoDate } from '$lib/shared/dates';
	import GlassSelect from '$lib/components/GlassSelect.svelte';
	import { SHIFT_TIMINGS, isShiftTiming, TRACK_MODE, MODE_OPTIONS } from '$lib/shared/shifts';
	import { RELIGIONS, MOTHER_TONGUES } from '$lib/shared/demographics';

	let { data, form } = $props();

	let reuploadFor: string | null = $state(null);
	let uploadRequestFor: string | null = $state(null);
	let editingProfile = $state(false);
	$effect(() => {
		if (form?.profileSaved) editingProfile = false;
	});

	const c = $derived(data.candidate);
	const ol = $derived(data.offerLetter);

	function copyLink(link: string) {
		navigator.clipboard.writeText(link);
	}

	// ── Offer letter preview ──────────────────────────────────────────────────
	// Posts the offer-letter form exactly as it stands to the preview endpoint,
	// which renders it with the production renderer and returns the PDF without
	// saving anything. Going through the form (rather than linking to the
	// download URL) is the point: HR sees the edits they have on screen, not the
	// last saved draft, so a typo is caught before the letter is sent.
	let offerForm: HTMLFormElement | null = $state(null);
	let previewing = $state(false);
	let previewError: string | null = $state(null);
	let previewUrl: string | null = null;

	async function previewOfferLetter() {
		if (!offerForm || previewing) return;
		previewing = true;
		previewError = null;
		try {
			const res = await fetch(`/admin/candidates/${c.id}/offer-letter`, {
				method: 'POST',
				body: new FormData(offerForm)
			});
			if (!res.ok) {
				previewError = `Preview failed (${res.status}). Try saving first.`;
				return;
			}
			// One object URL per candidate page, revoked before it is replaced —
			// each preview is a ~600 KB blob and HR previews repeatedly while
			// editing, so holding them all would leak the tab's memory.
			const blob = await res.blob();
			if (previewUrl) URL.revokeObjectURL(previewUrl);
			previewUrl = URL.createObjectURL(blob);
			if (!window.open(previewUrl, '_blank')) {
				previewError = 'Allow pop-ups for this site to open the preview.';
			}
		} catch {
			previewError = 'Preview failed — check your connection and try again.';
		} finally {
			previewing = false;
		}
	}

	/** Consultant and contract share the Consultant Agreement, so they take its
	 *  clause-3/4/5 inputs and its monthly compensation reading — and skip the
	 *  appointment letter's probation/confirmation notice fields. */
	const isConsultantLetter = $derived(CONSULTANT_LETTER_TRACKS.includes(c.track as Track));

	/** How this track's letter quotes `ctcAmount` (monthly stipend / annual CTC /
	 *  monthly fee) — drives the label, placeholder and hint. */
	const compField = $derived(COMPENSATION_FIELD_BY_TRACK[c.track as Track]);

	/** Only the Offer of Appointment (fresher/experienced) carries a page-4
	 *  compensation annexure — consultants/contract are paid a flat fee via
	 *  clause 5, interns a flat stipend via clause 1. Matches
	 *  APPOINTMENT_PINNED_TRACKS in pdf.ts. */
	const showAnnexure = $derived(c.track === 'fresher' || c.track === 'experienced');

	// The annexure's PM inputs are bound to local state (not just `value=`) so the
	// P.A./total columns can recompute live as HR types, mirroring exactly what
	// computeAnnexureTotals() will derive server-side at PDF-render time.
	let annexure = $state({
		enabled: false,
		basicPm: '',
		hraPm: '',
		bonusLabel: 'Performance Bonus in Advance',
		bonusPm: '',
		ltaPm: '',
		shiftLabel: 'Shift Allowances',
		shiftPm: '',
		specialPm: '',
		pfPm: '',
		gratuityPm: '',
		insurancePm: '',
		foodPm: '',
		variablePayEnabled: false,
		variablePayPm: ''
	});
	$effect(() => {
		annexure = { ...ol.compensationAnnexure };
	});

	function n(raw: string): number {
		const v = parseFloat((raw ?? '').replace(/[^0-9.]/g, ''));
		return isNaN(v) ? 0 : v;
	}
	function money(v: number): string {
		return v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
	}
	const annexureCashPm = $derived(
		n(annexure.basicPm) + n(annexure.hraPm) + n(annexure.bonusPm) + n(annexure.ltaPm) + n(annexure.shiftPm) + n(annexure.specialPm)
	);
	const annexureNonCashPm = $derived(
		n(annexure.pfPm) + n(annexure.gratuityPm) + n(annexure.insurancePm) + n(annexure.foodPm)
	);
	// Variable Pay is excluded from annexureCashPm on purpose — "Total Cash
	// Compensation (Before PF)" stays VP-exclusive, and "...with VP" is this
	// extra row layered on top, not a restatement of the same subtotal.
	const annexureCashWithVpPm = $derived(annexureCashPm + n(annexure.variablePayPm));
	const annexureTotalPm = $derived(
		annexureCashPm + annexureNonCashPm + (annexure.variablePayEnabled ? n(annexure.variablePayPm) : 0)
	);
	const annexureTotalPa = $derived(annexureTotalPm * 12);

	const employmentTypeOptions = [
		{ value: '', label: 'Select…' },
		{ value: 'full_time', label: 'Full-time' },
		{ value: 'part_time', label: 'Part-time' },
		{ value: 'contract', label: 'Contract' }
	];

	// GlassSelect is controlled; mirror the offer letter's stored value and keep
	// it in sync when a different offer letter loads.
	let employmentType = $state('');
	$effect(() => {
		employmentType = ol.employmentType ?? '';
	});

	const statusMeta: Record<string, { label: string; cls: string }> = {
		created: { label: 'LINK SENT', cls: '' },
		opened: { label: 'OPENED', cls: 'purple' },
		in_progress: { label: 'IN PROGRESS', cls: 'purple' },
		submitted: { label: 'AWAITING REVIEW', cls: 'gold' },
		changes_requested: { label: 'CHANGES REQUESTED', cls: 'red' },
		approved: { label: 'APPROVED', cls: 'teal' },
		complete: { label: 'COMPLETE', cls: 'teal' },
		revoked: { label: 'REVOKED', cls: 'red' }
	};

	const stdPill: Record<string, { label: string; cls: string }> = {
		pass: { label: 'STANDARD ✓', cls: 'teal' },
		warn: { label: 'STANDARD ⚠', cls: 'gold' },
		fail: { label: 'NOT TO STANDARD', cls: 'red' }
	};

	const docPill: Record<string, { label: string; cls: string }> = {
		parsed: { label: 'AUTO-READ', cls: 'teal' },
		store_only: { label: 'STORED', cls: '' },
		pending: { label: 'PROCESSING', cls: '' },
		unreadable: { label: 'UNREADABLE', cls: 'red' },
		failed: { label: 'OCR FAILED', cls: 'gold' }
	};

	const verifStatusPill: Record<string, string> = {
		verified: 'teal',
		review: 'gold',
		mismatch: 'red',
		error: 'red'
	};
	const verdictPill: Record<string, string> = {
		match: 'teal',
		review: 'gold',
		mismatch: 'red',
		missing: 'gold',
		'missing-expected': ''
	};
	const verdictLabel: Record<string, string> = {
		match: 'match',
		review: 'review',
		mismatch: 'mismatch',
		missing: 'not found',
		'missing-expected': 'not entered'
	};
	const sourceLabel: Record<string, string> = {
		ocr_crosscheck: 'OCR cross-check'
	};

	// Third element is the field key editProfile saves under — omitted (undefined)
	// for the two fields that are never HR-editable here: email is an identity
	// key other records are keyed against, and marital status is edited via the
	// select below (its own row) rather than as one of the plain-text inputs.
	const detailGroups = $derived([
		{
			title: 'Personal',
			rows: [
				['Full name', c.fullName, 'fullName'],
				['Date of birth', c.dob, 'dob'],
				['Gender', c.gender, 'gender'],
				['Email', c.email, undefined],
				['Mobile', c.mobile, 'mobile'],
				["Father's name", c.fatherName, 'fatherName'],
				["Father's mobile", c.fatherMobile, 'fatherMobile'],
				["Father's DOB", c.fatherDob, 'fatherDob'],
				["Mother's name", c.motherName, 'motherName'],
				["Mother's mobile", c.motherMobile, 'motherMobile'],
				["Mother's DOB", c.motherDob, 'motherDob'],
				['Mother tongue', c.motherTongue, 'motherTongue'],
				...(c.maritalStatus === 'married' || editingProfile
					? [
							['Spouse name', c.spouseName, 'spouseName'],
							['Spouse contact', c.spouseContact, 'spouseContact'],
							['Spouse DOB', c.spouseDob, 'spouseDob']
						]
					: []),
				['Emergency contact name', c.emergencyContactName, 'emergencyContactName'],
				['Emergency contact mobile', c.emergencyContactMobile, 'emergencyContactMobile'],
				['Emergency contact relation', c.emergencyContactRelation, 'emergencyContactRelation']
			]
		},
		{
			title: 'Address',
			rows: [
				['Present address', c.presentAddress, 'presentAddress'],
				['Present house no.', c.presentHouseNo, 'presentHouseNo'],
				['Present PIN', c.presentPin, 'presentPin'],
				['Permanent address', c.permanentAddress, 'permanentAddress'],
				['Permanent house no.', c.permanentHouseNo, 'permanentHouseNo'],
				['Permanent PIN', c.permanentPin, 'permanentPin']
			]
		},
		{
			title: 'Identification',
			rows: [
				['PAN', c.panNo, 'panNo'],
				['Driving licence', c.dlNo, 'dlNo'],
				['Passport', c.passportNo, 'passportNo'],
				['LinkedIn', c.linkedinId, 'linkedinId']
			]
		},
		// Only BGV-eligible candidates (experienced track at a BGV entity)
		// declare a previous employer; rendering the inputs for them (even
		// mid-edit) also keeps ?/editProfile from blanking fields that were
		// never on screen.
		...(c.bgvEligible
			? [{
					title: 'Previous employment (BGV)',
					rows: [
						['Company name', c.prevCompanyName, 'prevCompanyName'],
						['Employee ID', c.prevEmployeeId, 'prevEmployeeId'],
						['Date of joining', c.prevDoj, 'prevDoj'],
						['Date of leaving', c.prevDol, 'prevDol'],
						['Designation', c.prevDesignation, 'prevDesignation'],
						['Remuneration p.a.', c.prevRemuneration, 'prevRemuneration'],
						['Supervisor', c.prevSupervisor, 'prevSupervisor'],
						['Reason for leaving', c.prevReasonLeaving, 'prevReasonLeaving'],
						['Previous-company HR email', c.prevHrEmail, 'prevHrEmail']
					]
				}]
			: []),
		{
			title: 'Bank',
			rows: [
				['Name as per passbook', c.bankAccountName, 'bankAccountName'],
				['Bank name', c.bankName, 'bankName'],
				['Account number', c.accountNo, 'accountNo'],
				['IFSC', c.ifsc, 'ifsc'],
				['Branch', c.branch, 'branch']
			]
		}
	]);

	const docCount = $derived(data.checklist.reduce((a, s) => a + s.docs.length, 0));
	const initial = $derived((c.fullName || c.email)[0].toUpperCase());

	// Journey steps for the left status widget
	const JOURNEY = [
		{ key: 'created',            label: 'Link sent',          icon: '🔗' },
		{ key: 'opened',             label: 'Link opened',        icon: '👁️' },
		{ key: 'in_progress',        label: 'Filling form',       icon: '📝' },
		{ key: 'submitted',          label: 'Submitted',          icon: '📤' },
		{ key: 'changes_requested',  label: 'Changes requested',  icon: '🔄' },
		{ key: 'approved',           label: 'Approved by HR',     icon: '✅' },
		{ key: 'complete',           label: 'Complete',           icon: '🎉' }
	];

	const STATUS_ORDER = ['created','opened','in_progress','submitted','changes_requested','approved','complete'];

	function stepState(stepKey: string): 'done' | 'active' | 'pending' {
		if (c.status === 'revoked') return 'pending';
		const cur = STATUS_ORDER.indexOf(c.status);
		const idx = STATUS_ORDER.indexOf(stepKey);
		if (idx < cur) return 'done';
		if (idx === cur) return 'active';
		return 'pending';
	}

	// Employee ID: prefer server-echoed value after save, else candidate field
	const empId = $derived(form?.employeeIdSaved ? form.employeeId : (c.employeeId ?? ''));
	const shiftTiming = $derived(form?.shiftTimingSaved ? form.shiftTiming : (c.shiftTiming ?? ''));

	// GlassSelect is controlled, so mirror the stored shift into local state the
	// same way the offer letter's fields do. A record saved before the list was
	// fixed keeps its free-text value as an extra option, so re-saving the form
	// cannot silently drop what IT was already told.
	let shiftChoice = $state('');
	$effect(() => {
		shiftChoice = shiftTiming;
	});
	const shiftOptions = $derived([
		...SHIFT_TIMINGS.map((s) => ({ value: s, label: s })),
		...(shiftTiming && !isShiftTiming(shiftTiming)
			? [{ value: shiftTiming, label: `${shiftTiming} (legacy)` }]
			: [])
	]);

	// The four HR-filled IT-mail columns. Team Name and Payroll Entity show the
	// derived value (offer department / company) when HR has not overridden it,
	// so the input always previews exactly what the mail will carry.
	const itFields = $derived({
		teamName: form?.itMailFieldsSaved ? (form.teamName ?? '') : (c.teamName ?? ''),
		payrollEntity: form?.itMailFieldsSaved ? (form.payrollEntity ?? '') : (c.payrollEntity ?? ''),
		workLocationMode: form?.itMailFieldsSaved ? (form.workLocationMode ?? '') : (c.workLocationMode ?? ''),
		joiningMode: form?.itMailFieldsSaved ? (form.joiningMode ?? '') : (c.joiningMode ?? '')
	});

	// ── Department ⇄ Team Name ───────────────────────────────────────────────
	// The offer letter's Department and the IT mail's Team Name are the same
	// fact asked for by two different forms, so typing either one fills the
	// other here and the save mirrors it server-side. They stop tracking each
	// other the moment HR makes them differ — the IT mail's team is sometimes
	// narrower than the letter's department — and never overwrite a value that
	// is already there.
	// Seeded eagerly rather than from the $effect alone: effects do not run
	// during SSR, so a lazily-seeded box renders empty and only fills in on
	// hydration — a visible flash, and wrong entirely without JS.
	// untrack, not a bare read: the initial value is exactly what is wanted here,
	// and saying so keeps the compiler from warning that this captures only the
	// first value — the $effect below is what keeps them current.
	let teamName = $state(
		untrack(() => data.candidate.teamName || data.offerLetter.department || '')
	);
	let department = $state(
		untrack(() => data.offerLetter.department || data.candidate.teamName || '')
	);

	// Re-seeds when the persisted values change (a save round-trip); typing
	// writes to these same signals, which does not re-trigger it.
	$effect(() => {
		const savedTeam = itFields.teamName;
		const savedDept = data.offerLetter.department ?? '';
		teamName = savedTeam || savedDept;
		department = savedDept || savedTeam;
	});

	const linked = () => teamName === department || !teamName || !department;

	function onTeamNameInput(value: string) {
		if (linked()) department = value;
		teamName = value;
	}
	function onDepartmentInput(value: string) {
		if (linked()) teamName = value;
		department = value;
	}

	// ── IT setup mail preview ────────────────────────────────────────────────
	// Sending to IT is a one-way door — a blank Shift Timing column is a phone
	// call from the helpdesk — so the button opens the mail as IT will receive
	// it and the send only fires from inside the modal. The HTML comes from the
	// same builder the send uses, so what HR approves here is what goes out.
	type ItMailPreview = {
		to: string[];
		cc: string[];
		subject: string;
		html: string;
		fields: { label: string; value: string }[];
		missing: string[];
	};
	let itPreview: ItMailPreview | null = $state(null);
	let itPreviewLoading = $state(false);
	let itPreviewError: string | null = $state(null);
	let itSending = $state(false);
	/** The hidden form the modal's Send button submits — keeps the real
	 *  `use:enhance` POST (and its progressive-enhancement fallback) rather
	 *  than hand-rolling a fetch that would bypass the action's audit log. */
	let itSendForm: HTMLFormElement | null = $state(null);

	async function openItPreview() {
		itPreviewLoading = true;
		itPreviewError = null;
		itPreview = null;
		try {
			const res = await fetch(`/admin/candidates/${c.id}/it-setup-preview`);
			if (!res.ok) throw new Error(await res.text());
			itPreview = await res.json();
		} catch {
			itPreviewError = 'Could not build the preview. Please try again.';
		} finally {
			itPreviewLoading = false;
		}
	}

	function closeItPreview() {
		if (itSending) return;
		itPreview = null;
		itPreviewError = null;
		itPreviewLoading = false;
	}

	// Close the modal once the send round-trips, so the "sent ✓" chip on the
	// page is what HR sees next rather than a stale preview.
	$effect(() => {
		if (form?.itSetupMailSent) {
			itPreview = null;
			itSending = false;
		}
	});
</script>

<a href="/admin" class="backlink">
	<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M15 6l-6 6 6 6" /></svg>
	All candidates
</a>

<!-- IT/VPN mail confirm — the mail rendered as IT will receive it, with the
     recipient list and a warning for any column that would go out blank. -->
{#if itPreview}
	<div
		class="it-modal-overlay"
		role="button"
		tabindex="-1"
		onclick={closeItPreview}
		onkeydown={(e) => e.key === 'Escape' && closeItPreview()}
	>
		<!-- svelte-ignore a11y_click_events_have_key_events -- click-catcher only, stops the overlay's dismiss-on-click from firing; not itself interactive -->
		<div
			class="it-modal"
			role="dialog"
			aria-modal="true"
			aria-labelledby="it-preview-title"
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
		>
			<div class="it-modal-head">
				<div>
					<div class="it-modal-eyebrow">Before it goes out</div>
					<h2 id="it-preview-title">IT setup mail preview</h2>
				</div>
				<button class="it-modal-x" type="button" onclick={closeItPreview} aria-label="Close preview">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
				</button>
			</div>

			<div class="it-modal-meta">
				<div class="it-meta-row"><span class="it-meta-k">To</span><span class="it-meta-v">{itPreview.to.join(', ')}</span></div>
				{#if itPreview.cc.length}
					<div class="it-meta-row"><span class="it-meta-k">Cc</span><span class="it-meta-v">{itPreview.cc.join(', ')}</span></div>
				{/if}
				<div class="it-meta-row"><span class="it-meta-k">Subject</span><span class="it-meta-v">{itPreview.subject}</span></div>
			</div>

			{#if itPreview.missing.length}
				<div class="it-modal-warn">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.3 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.3a2 2 0 0 0-3.4 0Z"/></svg>
					<span>
						{itPreview.missing.length === 1 ? 'This column is blank' : 'These columns are blank'}:
						<strong>{itPreview.missing.join(', ')}</strong>. IT will have to chase it — fill it in above and
						reopen this preview, or send as-is.
					</span>
				</div>
			{/if}

			<!-- srcdoc, sandboxed: the mail body is rendered markup, so showing it
			     inline would let its styles leak into the admin page. -->
			<iframe class="it-modal-frame" title="IT setup mail body" sandbox="" srcdoc={itPreview.html}></iframe>

			<div class="it-modal-actions">
				<button class="btn small ghost" type="button" onclick={closeItPreview} disabled={itSending}>Cancel</button>
				<button
					class="btn small teal"
					type="button"
					disabled={itSending || !data.isApprover}
					onclick={() => itSendForm?.requestSubmit()}
				>
					{itSending ? 'Sending…' : c.itSetupMailSentAt ? 'Resend to IT' : 'Send to IT'}
				</button>
			</div>
		</div>
	</div>
{/if}

{#if !data.isSuperAdmin}
	<div class="readonly-banner">
		<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
		{data.isApprover
			? 'HR access — you can approve candidates and manage the offer letter. Other edits require a super admin login.'
			: 'View-only — editing candidate records requires a super admin login.'}
		Running the OCR cross-check is open to everyone.
	</div>
{/if}

<div class="head">
	<div class="avatar">{initial}</div>
	<div style="flex:1 1 320px;min-width:260px">
		<div style="display:flex;align-items:center;gap:11px;flex-wrap:wrap">
			<h1 style="font-family:var(--ae-font-display);font-size:26px;font-weight:600;margin:0;white-space:nowrap">
				{c.fullName || c.email}
			</h1>
			<span class="pill {statusMeta[c.status]?.cls}">{statusMeta[c.status]?.label ?? c.status}</span>
			{#if c.hiringDecision === 'accepted'}
				<span class="pill teal">ACCEPTED</span>
			{:else if c.hiringDecision === 'rejected'}
				<span class="pill red">REJECTED</span>
			{/if}
			<!-- On the Aegis dark chrome the plating inverts: white logo art needs no
			     plate at all, while dark art needs a light one to stay legible. -->
			<img
				src={data.brand.logo.src}
				alt={data.brand.name}
				title="Recruiting for {data.brand.name}"
				style="height:26px;width:auto;max-width:200px;object-fit:contain;margin-left:auto;border-radius:8px;{data
					.brand.logo.onDark
					? ''
					: 'background:#F4F4F0;padding:6px 10px'}"
			/>
		</div>
		<div class="muted" style="margin-top:5px;font-family:var(--ae-font-mono);font-size:11.5px">
			{c.email} · <span>{TRACK_LABELS[c.track as Track]}</span> · {data.companyName}
			{#if c.submittedAt}· Submitted {new Date(c.submittedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}{/if}
			{#if c.consentAt}· Consent recorded{/if}
		</div>
	</div>
	<div style="display:flex;gap:10px;flex-wrap:wrap">
		<!-- Approval is HR's call, so this stays live at every stage rather than
		     only at 'submitted' — asking for a re-upload (which moves the record to
		     'changes_requested') must not take the button away. Hidden only where
		     approving is contradictory: already approved/complete, or revoked. -->
		{#if !['approved', 'complete', 'revoked'].includes(c.status)}
			<form method="POST" action="?/approve" use:enhance onsubmit={(e) => {
				if (c.status !== 'submitted' && !confirm(
					'This candidate has not submitted their onboarding form yet. Approve anyway?'
				)) e.preventDefault();
			}}>
				<fieldset class="rbac" disabled={!data.isApprover}>
					<button class="btn teal">
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20 6L9 17l-5-5" /></svg>
						Approve candidate
					</button>
				</fieldset>
			</form>
		{/if}
		{#if c.hiringDecision}
			<form method="POST" action="?/setHiringDecision" use:enhance>
				<input type="hidden" name="decision" value="clear" />
				<fieldset class="rbac" disabled={!data.isApprover}>
					<button class="btn ghost">Undo decision</button>
				</fieldset>
			</form>
		{:else}
			<form method="POST" action="?/setHiringDecision" use:enhance>
				<input type="hidden" name="decision" value="accepted" />
				<fieldset class="rbac" disabled={!data.isApprover}>
					<button class="btn teal">
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M20 6L9 17l-5-5" /></svg>
						Accept
					</button>
				</fieldset>
			</form>
			<form method="POST" action="?/setHiringDecision" use:enhance>
				<input type="hidden" name="decision" value="rejected" />
				<fieldset class="rbac" disabled={!data.isApprover}>
					<button class="btn ghost danger-hover">
						<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M18 6L6 18M6 6l12 12" /></svg>
						Reject
					</button>
				</fieldset>
			</form>
		{/if}
		{#if docCount > 0}
			<a class="btn ghost" href="/admin/candidates/{c.id}/docs-zip" download>
				<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
				Download all docs
			</a>
		{/if}
		<a class="btn ghost" href="/admin/candidates/{c.id}/report" download>
			<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
			Download report
		</a>
		{#if !['approved', 'complete', 'revoked'].includes(c.status)}
			<form method="POST" action="?/revoke" use:enhance onsubmit={(e) => {
				if (!confirm('Revoke this onboarding link?')) e.preventDefault();
			}}>
				<fieldset class="rbac" disabled={!data.isSuperAdmin}>
					<button class="btn ghost danger-hover">Revoke link</button>
				</fieldset>
			</form>
		{/if}
		{#if data.isSuperAdmin}
			<form method="POST" action="?/deleteCandidate" use:enhance onsubmit={(e) => {
				if (!confirm(`Permanently delete ${c.fullName || c.email}? This removes their profile, uploaded documents, and offer letter. This cannot be undone.`)) e.preventDefault();
			}}>
				<button class="btn ghost danger-hover">Delete candidate</button>
			</form>
		{/if}
	</div>
</div>

{#if form?.message}<p class="error">{form.message}</p>{/if}

{#if data.onboardingLink || !['revoked', 'complete'].includes(c.status)}
	<div class="linkbox">
		{#if data.onboardingLink}
			{@const link = data.onboardingLink}
			<div style="font-size:13px;color:var(--ae-text-2);margin-bottom:9px">
				Onboarding link
				{#if link.openedAt}
					· <span style="color:var(--ae-text)">opened {new Date(link.openedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
				{:else}
					· <span style="color:var(--ae-text)">not opened yet</span>
				{/if}
				· expires {new Date(link.expiresAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
			</div>
			<div style="display:flex;align-items:center;gap:10px;flex-wrap:wrap">
				<code class="linkcode">{link.url}</code>
				<button type="button" class="teal-pill-btn" onclick={() => copyLink(link.url)}>Copy link</button>
				<a class="teal-pill-btn" href={link.url} target="_blank" rel="noopener">Open link</a>
				<form method="POST" action="?/regenerateLink" use:enhance onsubmit={(e) => {
					if (!confirm('Regenerate this onboarding link? The current link will stop working immediately.')) e.preventDefault();
				}}>
					<fieldset class="rbac" disabled={!data.isSuperAdmin}>
						<button type="submit" class="teal-pill-btn">Regenerate link</button>
					</fieldset>
				</form>
			</div>
		{:else}
			<div style="font-size:13px;color:var(--ae-text-2);margin-bottom:9px">
				No active onboarding link for this candidate.
			</div>
			<form method="POST" action="?/regenerateLink" use:enhance>
				<fieldset class="rbac" disabled={!data.isSuperAdmin}>
					<button type="submit" class="teal-pill-btn">Generate link</button>
				</fieldset>
			</form>
		{/if}
		{#if form?.linkRegenerated}
			<p class="saved-chip" style="margin-top:8px">Link regenerated ✓ — the previous link no longer works.</p>
		{/if}
	</div>
{/if}

{#if c.status === 'submitted'}
	<div class="approval-widget">
		<div class="approval-icon">
			<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>
		</div>
		<div style="flex:1">
			<div style="font-weight:800;font-size:15px;color:var(--ae-text)">Ready for review</div>
			<div style="font-size:12.5px;color:var(--ae-muted);margin-top:2px">
				{c.fullName || c.email} has submitted all documentation. Review below and approve or request changes.
			</div>
		</div>
		<form method="POST" action="?/approve" use:enhance>
			<fieldset class="rbac" disabled={!data.isApprover}>
				<button class="btn teal" style="font-size:14px;padding:11px 22px">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M20 6L9 17l-5-5"/></svg>
					Approve &amp; notify
				</button>
			</fieldset>
		</form>
	</div>
{/if}

{#if data.flags.length}
	<div class="flagbox">
		<strong>Review flags ({data.flags.length})</strong>
		<ul style="margin:6px 0 0;padding-left:18px">
			{#each data.flags as flag}<li>{flag}</li>{/each}
		</ul>
	</div>
{/if}

<div class="cols">

	<!-- ── Left: Status journey + Employee ID widget ── -->
	<aside class="status-sidebar">
		<!-- Journey tracker -->
		<section class="card journey-card">
			<div class="eyebrow" style="margin-bottom:14px">Onboarding journey</div>
			<div class="journey">
				{#each JOURNEY as step}
					{@const state = stepState(step.key)}
					<div class="journey-step {state}">
						<div class="j-dot">
							{#if state === 'done'}
								<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3.5"><path d="M20 6L9 17l-5-5"/></svg>
							{:else if state === 'active'}
								<div class="j-pulse"></div>
							{/if}
						</div>
						<div class="j-line"></div>
						<div class="j-label">
							<span class="j-icon">{step.icon}</span>
							<span>{step.label}</span>
						</div>
					</div>
				{/each}
				{#if c.status === 'revoked'}
					<div class="journey-step active" style="--step-color:var(--ae-crimson)">
						<div class="j-dot" style="background:var(--ae-crimson)"></div>
						<div class="j-line" style="display:none"></div>
						<div class="j-label"><span class="j-icon">🚫</span><span>Revoked</span></div>
					</div>
				{/if}
			</div>
			{#if c.submittedAt}
				<div class="muted" style="font-size:11px;margin-top:10px;padding-top:10px;border-top:1px solid var(--ae-line-soft)">
					Submitted {new Date(c.submittedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
				</div>
			{/if}
			{#if c.reviewedAt}
				<div class="muted" style="font-size:11px;margin-top:4px">
					Reviewed {new Date(c.reviewedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
				</div>
			{/if}
		</section>

		<!-- Employee ID widget -->
		<section class="card emp-card">
			<div class="eyebrow" style="margin-bottom:10px">Employee code</div>
			{#if empId}
				<div class="emp-id-display">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="7" width="20" height="14" rx="2"/><path d="M16 7V5a2 2 0 0 0-4 0v2"/><line x1="12" y1="12" x2="12" y2="16"/></svg>
					{empId}
				</div>
			{:else if ['approved','complete'].includes(c.status)}
				<p class="muted" style="font-size:11.5px;margin:0 0 10px">Candidate approved — assign employee code.</p>
			{:else}
				<p class="muted" style="font-size:11.5px;margin:0 0 10px">Available after approval.</p>
			{/if}
			<form method="POST" action="?/setEmployeeId" use:enhance class="emp-form">
				<fieldset class="rbac" disabled={!data.isApprover}>
					<input
						name="employeeId"
						value={empId}
						placeholder={['approved','complete'].includes(c.status) ? 'e.g. EMP-0042' : '—'}
						class="emp-input"
						disabled={!['approved','complete'].includes(c.status) && !empId}
					/>
					<button
						class="btn small teal"
						disabled={!['approved','complete'].includes(c.status) && !empId}
					>
						{empId ? 'Update' : 'Assign'}
					</button>
				</fieldset>
			</form>
			{#if form?.employeeIdSaved}
				<p class="saved-chip" style="margin-top:6px">Saved ✓</p>
			{/if}
			{#if empId}
				<div class="emp-hint">
					<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
					Code assigned · audit-logged
				</div>
			{/if}
		</section>

		<!-- Shift timing + IT/VPN setup mail -->
		<section class="card emp-card">
			<div class="eyebrow" style="margin-bottom:10px">Shift timing</div>
			{#if shiftTiming}
				<div class="shift-display">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></svg>
					{shiftTiming}
				</div>
			{:else}
				<p class="muted" style="font-size:11.5px;margin:0 0 10px">
					Not set — goes to the Master Tracker and the IT setup mail.
				</p>
			{/if}
			<form method="POST" action="?/setShiftTiming" use:enhance class="emp-form">
				<fieldset class="rbac" disabled={!data.isApprover}>
					<GlassSelect
						name="shiftTiming"
						ariaLabel="Shift timing"
						placeholder="Select shift…"
						bind:value={shiftChoice}
						options={shiftOptions}
						disabled={!data.isApprover}
					/>
					<button class="btn small teal">{shiftTiming ? 'Update' : 'Save'}</button>
				</fieldset>
			</form>
			{#if form?.shiftTimingSaved}
				<p class="saved-chip" style="margin-top:6px">Saved ✓</p>
			{/if}

			<!-- The remaining IT-mail columns. Team Name and Payroll Entity are
			     pre-filled from the offer letter / entity and stay editable; the
			     placeholder shows what the mail would carry if left blank. -->
			<div class="it-fields">
				<div class="eyebrow" style="margin-bottom:10px">IT mail details</div>
				<form method="POST" action="?/setItMailFields" use:enhance>
					<fieldset class="rbac" disabled={!data.isApprover}>
						<label class="it-label" for="it-team">Team name</label>
						<input
							id="it-team"
							name="teamName"
							value={teamName}
							oninput={(e) => onTeamNameInput(e.currentTarget.value)}
							placeholder="e.g. Inside Sales"
							class="emp-input"
							maxlength="120"
						/>
						<p class="it-link-note">Shared with the offer letter's Department.</p>
						<label class="it-label" for="it-wfh">WFH/WFO</label>
						<input
							id="it-wfh"
							name="workLocationMode"
							value={itFields.workLocationMode}
							placeholder="e.g. WFO"
							class="emp-input"
							list="wfh-options"
							maxlength="120"
						/>
						<datalist id="wfh-options">
							<option value="WFO"></option>
							<option value="WFH"></option>
							<option value="Hybrid"></option>
						</datalist>
						<label class="it-label" for="it-entity">Payroll entity</label>
						<input
							id="it-entity"
							name="payrollEntity"
							value={itFields.payrollEntity}
							placeholder={data.companyName || 'Payroll entity'}
							class="emp-input"
							maxlength="120"
						/>
						<label class="it-label" for="it-mode">Mode</label>
						<input
							id="it-mode"
							name="joiningMode"
							value={itFields.joiningMode}
							placeholder={TRACK_MODE[c.track] ?? 'e.g. New Joinee'}
							class="emp-input"
							list="mode-options"
							maxlength="120"
						/>
						<datalist id="mode-options">
							{#each MODE_OPTIONS as m}
								<option value={m}></option>
							{/each}
						</datalist>
						<button class="btn small teal" style="width:100%;margin-top:9px">Save IT mail details</button>
					</fieldset>
				</form>
				{#if form?.itMailFieldsSaved}
					<p class="saved-chip" style="margin-top:6px">Saved ✓</p>
				{/if}
			</div>

			<div class="it-mail">
				<!-- The send lives in the preview modal; this only opens it. The form
				     stays a real POST so the modal's Send keeps the action's audit
				     log and its no-JS fallback. -->
				<form
					method="POST"
					action="?/sendItSetupMail"
					use:enhance={() => {
						itSending = true;
						return async ({ update }) => {
							await update();
							itSending = false;
						};
					}}
					bind:this={itSendForm}
				>
					<fieldset class="rbac" disabled={!data.isApprover}>
						<button
							class="btn small ghost"
							style="width:100%"
							type="button"
							onclick={openItPreview}
							disabled={itPreviewLoading}
						>
							<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 6 10-6"/></svg>
							{#if itPreviewLoading}
								Building preview…
							{:else}
								{c.itSetupMailSentAt ? 'Review & resend IT mail' : 'Review & send IT mail'}
							{/if}
						</button>
					</fieldset>
				</form>
				{#if itPreviewError}
					<p class="it-preview-err">{itPreviewError}</p>
				{/if}
				{#if form?.itSetupMailSent}
					<p class="saved-chip" style="margin-top:6px">IT setup mail sent ✓</p>
				{/if}
				<div class="emp-hint">
					<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
					{#if c.itSetupMailSentAt}
						Sent {new Date(c.itSetupMailSentAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} · recipients in
					{:else}
						Sent manually when you're ready · recipients in
					{/if}
					<a href="/admin/settings" style="color:inherit;text-decoration:underline">settings</a>
				</div>
			</div>
		</section>
	</aside>

	<!-- documents -->
	<section class="card">
		<div class="eyebrow" style="margin-bottom:16px">Documents · {docCount}</div>
		<div>
			{#each data.checklist as slot}
				{#if slot.docs.length === 0}
					<div class="docrow">
						<span class="doc-ico empty">
							<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
						</span>
						<div style="flex:1">
							<div class="doc-name" style="color:var(--ae-muted)">{slot.label}</div>
							<div class="doc-sub">
								Not uploaded
								{#if slot.uploadRequested}· requested{slot.uploadRequested.note ? `: ${slot.uploadRequested.note}` : ''}{/if}
							</div>
						</div>
						{#if slot.mandatory}
							<span class="pill red">MISSING</span>
						{:else if slot.uploadRequested}
							<span class="pill gold">UPLOAD ASKED</span>
						{/if}
						{#if data.isApprover && !['approved', 'complete', 'revoked'].includes(c.status) && !slot.uploadRequested}
							<button type="button" class="btn ghost small" onclick={() => (uploadRequestFor = uploadRequestFor === slot.type ? null : slot.type)}>
								Request upload
							</button>
						{/if}
					</div>
					{#if data.isApprover && uploadRequestFor === slot.type}
						<form method="POST" action="?/requestUpload" use:enhance class="reupload">
							<input type="hidden" name="docType" value={slot.type} />
							<input name="note" placeholder="Reason shown to the candidate (e.g. please attach your degree certificate)" />
							<button class="btn small">Send</button>
						</form>
					{/if}
				{:else}
					{#each slot.docs as doc}
						<div class="docrow">
							<span class="doc-ico">
								<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
							</span>
							<div style="flex:1;min-width:0">
								<div class="doc-name">{slot.label}</div>
								<div class="doc-sub">
									{doc.mime === 'application/pdf' ? 'PDF' : 'Image'} · {(doc.sizeBytes / 1024).toFixed(0)} KB
									{#if doc.reviewNote}· {doc.reviewNote}{/if}
								</div>
								{#if doc.standardStatus && stdPill[doc.standardStatus]}
									<div style="margin-top:5px">
										<span class="pill {stdPill[doc.standardStatus].cls}">{stdPill[doc.standardStatus].label}</span>
										{#if doc.standardStatus !== 'pass' && doc.standardReasons?.length}
											<span class="muted" style="font-size:11.5px"> {doc.standardReasons.join(' ')}</span>
										{/if}
									</div>
								{/if}
								{#if doc.ocrTranscript}
									<details>
										<summary class="muted" style="cursor:pointer;font-size:11.5px">OCR transcript</summary>
										<pre>{doc.ocrTranscript}</pre>
									</details>
								{/if}
							</div>
							{#if doc.reviewStatus === 'reupload_requested'}
								<span class="pill red">RE-UPLOAD ASKED</span>
							{:else}
								<span class="pill {docPill[doc.ocrStatus]?.cls}">{docPill[doc.ocrStatus]?.label ?? doc.ocrStatus}</span>
							{/if}
							<a class="btn ghost small" href="/admin/candidates/{c.id}/doc/{doc.id}" target="_blank" rel="noopener">View</a>
							{#if data.isApprover && c.status === 'submitted' && doc.reviewStatus !== 'reupload_requested'}
								<button type="button" class="btn ghost small" onclick={() => (reuploadFor = reuploadFor === doc.id ? null : doc.id)}>
									Re-upload
								</button>
							{/if}
						</div>
						{#if data.isApprover && reuploadFor === doc.id}
							<form method="POST" action="?/requestReupload" use:enhance class="reupload">
								<input type="hidden" name="docId" value={doc.id} />
								<input name="note" placeholder="Reason shown to the candidate (e.g. glare on the number)" />
								<button class="btn small">Send</button>
							</form>
						{/if}
					{/each}
				{/if}
			{/each}
		</div>
	</section>

	<!-- details -->
	<div style="display:flex;flex-direction:column;gap:18px">
		<!-- verification -->
		<section class="card">
			<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
				<div class="eyebrow">Document verification</div>
				<div style="flex:1"></div>
				<form method="POST" action="?/crosscheck" use:enhance>
					<!-- No rbac fieldset: the cross-check is ungated for every signed-in
					     role, so the button is always live. Matches ?/crosscheck, which
					     asks only for a session. -->
					<button class="btn ghost small">Run OCR cross-check</button>
				</form>
			</div>
			<p class="muted" style="font-size:11.5px;margin:0 0 12px">
				Cross-check compares OCR-read values against the typed master sheet. Names use fuzzy matching; treat 60–82% as a manual-review band.
			</p>
			{#if form?.crosschecked !== undefined}
				<p class="muted" style="font-size:12px;margin:0 0 12px">
					Cross-check complete ({form.crosschecked} document{form.crosschecked === 1 ? '' : 's'}).
				</p>
			{/if}
			{#if data.verifications.length === 0}
				<p class="muted" style="font-size:13px;margin:0">No verifications yet.</p>
			{:else}
				{#each data.verifications as v}
					<div class="verif">
						<div class="verif-head">
							<span class="verif-name">{v.label}</span>
							<span class="src-badge">{sourceLabel[v.source] ?? v.source}</span>
							<div style="flex:1"></div>
							<span class="pill {verifStatusPill[v.status] ?? ''}">{v.status.toUpperCase()} · {v.score}%</span>
						</div>
						{#if v.note}
							<div class="muted" style="font-size:11.5px;margin-top:4px">{v.note}</div>
						{/if}
						{#each v.fieldResults as f}
							<div class="frow" style="padding:6px 0">
								<span class="flabel">{f.label}</span>
								<span class="fvalue" style="max-width:42%">
									<span class="muted" style="font-weight:400">typed:</span> {f.expected || '—'}
									&nbsp;·&nbsp;
									<span class="muted" style="font-weight:400">found:</span> {f.found || '—'}
								</span>
								<span class="pill {verdictPill[f.verdict] ?? ''}" style="flex:0 0 auto">
									{verdictLabel[f.verdict] ?? f.verdict}
								</span>
							</div>
						{/each}
					</div>
				{/each}
			{/if}
		</section>

		<section class="card">
			<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
				<div class="eyebrow">Extracted details</div>
				<div style="flex:1"></div>
				{#if data.isSuperAdmin}
					{#if editingProfile}
						<button type="button" class="btn ghost small" onclick={() => (editingProfile = false)}>Cancel</button>
						<button type="submit" form="edit-profile-form" class="btn small">Save changes</button>
					{:else}
						<button type="button" class="btn ghost small" onclick={() => (editingProfile = true)}>Edit details</button>
					{/if}
				{/if}
			</div>
			{#if (form as { profileEditError?: true; message?: string } | undefined)?.profileEditError}<p class="error">{(form as { message: string }).message}</p>{/if}
			{#if form?.profileSaved}<p class="saved-chip" style="margin-bottom:8px">Saved ✓</p>{/if}
			<form
				id="edit-profile-form"
				method="POST"
				action="?/editProfile"
				use:enhance={() => async ({ update }) => update({ reset: false })}
			>
				{#each detailGroups as group}
					<div class="group-title">{group.title}</div>
					{#each group.rows as [label, value, field]}
						<div class="frow">
							<span class="flabel">{label}</span>
							{#if editingProfile && field}
								<!-- Mother tongue offers the same suggestions the candidate form
								     does (demographics.ts) so both sides spell it the same way. -->
								<input class="fedit" name={field} value={value ?? ''} list={field === 'motherTongue' ? 'mother-tongues' : undefined} />
							{:else}
								<span class="fvalue">{value || '—'}</span>
							{/if}
						</div>
					{/each}
				{/each}
				<datalist id="mother-tongues">
					{#each MOTHER_TONGUES as t}<option value={t}></option>{/each}
				</datalist>
				<div class="group-title">Religion</div>
				<div class="frow">
					<span class="flabel">Religion</span>
					{#if editingProfile}
						<select class="fedit" name="religion" value={c.religion ?? ''}>
							<option value="">—</option>
							{#each RELIGIONS as r}<option value={r}>{r}</option>{/each}
							<!-- Legacy rows may hold a value the list no longer offers (e.g. the
							     retired "Prefer not to say"). Keep it selectable so opening the
							     editor to fix an unrelated field does not silently blank it. -->
							{#if c.religion && !RELIGIONS.includes(c.religion as (typeof RELIGIONS)[number])}
								<option value={c.religion}>{c.religion}</option>
							{/if}
						</select>
					{:else}
						<span class="fvalue">{c.religion || '—'}</span>
					{/if}
				</div>
				<div class="group-title">Marital status</div>
				<div class="frow">
					<span class="flabel">Marital status</span>
					{#if editingProfile}
						<select class="fedit" name="maritalStatus" value={c.maritalStatus ?? ''}>
							<option value="">—</option>
							<option value="single">Single</option>
							<option value="married">Married</option>
						</select>
					{:else}
						<span class="fvalue">{c.maritalStatus || '—'}</span>
					{/if}
				</div>
			</form>
			<div class="group-title">UAN</div>
			<div class="frow">
				<span class="flabel">UAN number</span>
				{#if EXP_LIKE_TRACKS.includes(c.track as Track)}
					<span class="fvalue">{c.uanNo || '—'}</span>
				{:else}
					<form method="POST" action="?/setUan" use:enhance class="uan-form">
						<fieldset class="rbac" disabled={!data.isSuperAdmin}>
							<input name="uanNo" value={form?.uanSaved ? form.uanNo : (c.uanNo ?? '')} placeholder="12 digits" class="uan-input" />
							<button class="btn ghost small">Save</button>
						</fieldset>
					</form>
					{#if form?.uanSaved}<span class="saved-chip">Saved ✓</span>{/if}
				{/if}
			</div>
			<div class="group-title">Aadhaar</div>
			<div class="frow" style="border-bottom:none">
				<span class="flabel">Aadhaar number</span>
				<span class="fvalue mono">{form?.aadhaar ?? c.aadhaarMasked}</span>
				{#if !form?.aadhaar && c.aadhaarMasked !== '—'}
					<form method="POST" action="?/reveal" use:enhance style="display:inline">
						<button class="btn ghost small">Reveal</button>
					</form>
				{/if}
			</div>
			<div class="lock-hint">
				<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
				Encrypted at rest. Every reveal is audit-logged.
			</div>
		</section>

		<section class="card">
			<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
				<div class="eyebrow">Offer letter</div>
				<div style="flex:1"></div>
				{#if ol.status === 'sent'}
					<span class="pill teal">SENT{ol.sentAt ? ' · ' + new Date(ol.sentAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</span>
				{:else}
					<span class="pill">DRAFT</span>
				{/if}
			</div>
			<p class="muted" style="font-size:11.5px;margin:0 0 14px">
				Name, address and company are pulled in automatically. Fill in the rest, then download or send it as
				an attachment on {c.fullName || c.email}'s onboarding email.
			</p>
			{#if (form as { offerLetterError?: true; message?: string } | undefined)?.offerLetterError}
				<p class="error">{(form as { message: string }).message}</p>
			{/if}
			<form
				bind:this={offerForm}
				method="POST"
				action="?/saveOfferLetter"
				use:enhance
				class="offer-form"
				enctype="multipart/form-data"
			>
				<fieldset class="rbac" disabled={!data.isApprover}>
				<label class="offer-field">
					<span>Job title</span>
					<input name="jobTitle" value={ol.jobTitle} />
				</label>
				<label class="offer-field">
					<span>Department</span>
					<input
						name="department"
						value={department}
						oninput={(e) => onDepartmentInput(e.currentTarget.value)}
					/>
					<small class="field-hint">Shared with the IT mail's Team name.</small>
				</label>
				<label class="offer-field">
					<span>Reporting manager (name/designation)</span>
					<input name="reportingManager" value={ol.reportingManager} />
				</label>
				<label class="offer-field">
					<span>Office location</span>
					<input name="officeLocation" value={ol.officeLocation} />
				</label>
				<label class="offer-field">
					<span>{c.track === 'intern' ? 'Internship start date' : 'Joining date'}</span>
					<input type="date" name="joiningDate" value={toIsoDate(ol.joiningDate) ?? ''} />
				</label>
				{#if c.track === 'intern'}
					<label class="offer-field">
						<span>Internship end date</span>
						<input type="date" name="endDate" value={toIsoDate(ol.endDate) ?? ''} />
						<small>Clause 1: "scheduled to start effective from &lt;start&gt; to &lt;end&gt;".</small>
					</label>
				{/if}
				<div class="offer-field">
					<span>Employment type</span>
					<GlassSelect
						name="employmentType"
						ariaLabel="Employment type"
						bind:value={employmentType}
						options={employmentTypeOptions}
					/>
				</div>
				<label class="offer-field">
					<!-- The same stored figure is rendered as a monthly stipend, annual CTC
					     or a monthly fee depending on the track — ask for the one this
					     candidate's letter will actually quote. -->
					<span>{compField.label}</span>
					<input name="ctcAmount" value={ol.ctcAmount} placeholder={compField.placeholder} />
					<small>{compField.hint}</small>
				</label>
				{#if c.track !== 'intern' && !isConsultantLetter}
					<label class="offer-field">
						<span>Monthly compensation <em>(optional)</em></span>
						<input
							name="monthlyCompensation"
							value={ol.monthlyCompensation}
							placeholder="e.g. 20,000"
						/>
						<small>Shown in clause 1 beside annual CTC. Leave blank to omit.</small>
					</label>
				{/if}
				<!-- The internship agreement terminates "without any notice" and never
				     quotes a notice period, so the field is not shown for interns. -->
				{#if c.track !== 'intern'}
					<label class="offer-field">
						<span>Notice period {#if !isConsultantLetter}<em>(during probation)</em>{/if}</span>
						<input
							name="noticePeriod"
							value={ol.noticePeriod}
							placeholder={isConsultantLetter ? 'e.g. 15 days' : 'e.g. 30 days'}
						/>
						<small>
							{#if isConsultantLetter}
								Clause 9. Defaults to 15 days if left blank.
							{:else}
								Clause 5, during probation. Defaults to 30 days if left blank.
							{/if}
						</small>
					</label>
				{/if}
				{#if c.track !== 'intern' && !isConsultantLetter}
					<label class="offer-field">
						<span>Notice period <em>(after confirmation)</em></span>
						<input
							name="confirmedNoticePeriod"
							value={ol.confirmedNoticePeriod}
							placeholder="e.g. 60 days"
						/>
						<small>Clause 5. Defaults to 60 days if left blank.</small>
					</label>
				{/if}
				<label class="offer-field">
					<span>Acceptance due date</span>
					<input type="date" name="acceptanceDueDate" value={toIsoDate(ol.acceptanceDueDate) ?? ''} />
				</label>
				<label class="offer-field">
					<span>Authorized signatory name</span>
					<input name="signatoryName" value={ol.signatoryName} />
				</label>
				<label class="offer-field">
					<span>Signatory's designation</span>
					<input name="signatoryDesignation" value={ol.signatoryDesignation} />
				</label>

				{#if isConsultantLetter}
					<!-- Consultant Agreement (consultant + contract): clause 3/4/5 inputs -->
					<label class="offer-field sig-field">
						<span>Weekly expectation (clause 3)</span>
						<input name="weeklyExpectation" value={ol.weeklyExpectation ?? ''} placeholder="e.g. Minimum 04 Content per Week" />
					</label>
					<label class="offer-field sig-field">
						<span>Key responsibilities (one per line — becomes bullets in clause 4)</span>
						<textarea name="keyResponsibilities" rows="6" class="kra-textarea" placeholder={"Content Volume & Consistency: Publish 4 pieces every week\nContent Quality: Score 90%+ on internal checklist\nContent Performance: Achieve 200+ views per piece"}>{ol.keyResponsibilities ?? ''}</textarea>
					</label>
					<label class="offer-field sig-field">
						<span>Payment clause (clause 5)</span>
						<textarea name="paymentClause" rows="3" class="kra-textarea">{ol.paymentClause ?? ''}</textarea>
						<small>Write <code>{'{amount}'}</code> where the fee should appear — it is filled in from the CTC amount above.</small>
					</label>
				{/if}

				{#if c.track === 'intern'}
					<!-- Intern-only: the Intern Agreement evaluation criteria bullets -->
					<label class="offer-field sig-field">
						<span>Evaluation criteria (one per line — becomes the bullets in the Intern Agreement)</span>
						<textarea name="internCriteria" rows="5" class="kra-textarea">{ol.internCriteria ?? ''}</textarea>
					</label>
				{/if}

				<!-- Signature image upload — spans full width -->
				<div class="offer-field sig-field">
					<span>Signature image</span>
					<!-- preserve existing base64 so re-saving other fields doesn't wipe it -->
					<input type="hidden" name="signatoryImageBase64Existing" value={ol.signatoryImageBase64 ?? ''} />
					{#if ol.signatoryImageBase64}
						<div class="sig-preview">
							<img src={ol.signatoryImageBase64} alt="Signature preview" class="sig-img" />
							<label class="sig-replace-btn">
								<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
								Replace
								<input type="file" name="signatoryImage" accept="image/png,image/jpeg,image/webp" class="sig-file-hidden" />
							</label>
						</div>
					{:else}
						<label class="sig-upload-btn">
							<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
							Upload signature
							<input type="file" name="signatoryImage" accept="image/png,image/jpeg,image/webp" class="sig-file-hidden" />
						</label>
						<span class="muted" style="font-size:10.5px;margin-top:4px">PNG, JPG or WebP · max 2 MB · will appear above signatory name in PDF</span>
					{/if}
				</div>

					{#if showAnnexure}
						<div class="offer-field sig-field annexure-block">
							<label class="annexure-toggle">
								<input type="checkbox" name="annexureEnabled" bind:checked={annexure.enabled} />
								<span>Include compensation annexure (page 4)</span>
							</label>
							<small>
								P.A. columns and every total below are calculated automatically as P.M. x 12 —
								only enter the monthly (P.M.) figures.
							</small>

							{#if annexure.enabled}
								<div class="annexure-table">
									<div class="annexure-row annexure-head">
										<span>Component</span>
										<span>P.M.</span>
										<span>P.A. (auto)</span>
									</div>

									<div class="annexure-row">
										<span>Basic Salary</span>
										<input name="annexureBasicPm" type="text" inputmode="decimal" bind:value={annexure.basicPm} placeholder="0.00" />
										<span class="annexure-pa">{money(n(annexure.basicPm) * 12)}</span>
									</div>
									<div class="annexure-row">
										<span>House Rent Allowance</span>
										<input name="annexureHraPm" type="text" inputmode="decimal" bind:value={annexure.hraPm} placeholder="0.00" />
										<span class="annexure-pa">{money(n(annexure.hraPm) * 12)}</span>
									</div>
									<div class="annexure-row annexure-editable-label">
										<input name="annexureBonusLabel" type="text" bind:value={annexure.bonusLabel} placeholder="Performance Bonus in Advance" />
										<input name="annexureBonusPm" type="text" inputmode="decimal" bind:value={annexure.bonusPm} placeholder="0.00" />
										<span class="annexure-pa">{money(n(annexure.bonusPm) * 12)}</span>
									</div>
									<div class="annexure-row">
										<span>LTA</span>
										<input name="annexureLtaPm" type="text" inputmode="decimal" bind:value={annexure.ltaPm} placeholder="0.00" />
										<span class="annexure-pa">{money(n(annexure.ltaPm) * 12)}</span>
									</div>
									<div class="annexure-row annexure-editable-label">
										<input name="annexureShiftLabel" type="text" bind:value={annexure.shiftLabel} placeholder="Shift Allowances" />
										<input name="annexureShiftPm" type="text" inputmode="decimal" bind:value={annexure.shiftPm} placeholder="0.00" />
										<span class="annexure-pa">{money(n(annexure.shiftPm) * 12)}</span>
									</div>
									<div class="annexure-row">
										<span>Special Allowances</span>
										<input name="annexureSpecialPm" type="text" inputmode="decimal" bind:value={annexure.specialPm} placeholder="0.00" />
										<span class="annexure-pa">{money(n(annexure.specialPm) * 12)}</span>
									</div>
									<div class="annexure-row annexure-subtotal">
										<span>Total Cash Compensation (Before PF)</span>
										<span class="annexure-pa">{money(annexureCashPm)}</span>
										<span class="annexure-pa">{money(annexureCashPm * 12)}</span>
									</div>

									<div class="annexure-row">
										<label class="annexure-vp-toggle">
											<input type="checkbox" name="annexureVariablePayEnabled" bind:checked={annexure.variablePayEnabled} />
											<span>Variable Pay</span>
										</label>
										<input
											name="annexureVariablePayPm"
											type="text"
											inputmode="decimal"
											bind:value={annexure.variablePayPm}
											placeholder="0.00"
											disabled={!annexure.variablePayEnabled}
										/>
										<span class="annexure-pa">{annexure.variablePayEnabled ? money(n(annexure.variablePayPm) * 12) : '—'}</span>
									</div>
									{#if annexure.variablePayEnabled}
										<div class="annexure-row annexure-subtotal">
											<span>Total Cash Compensation with VP</span>
											<span class="annexure-pa">{money(annexureCashWithVpPm)}</span>
											<span class="annexure-pa">{money(annexureCashWithVpPm * 12)}</span>
										</div>
									{/if}

									<div class="annexure-row annexure-section">
										<span>Other Non-Cash Components</span><span></span><span></span>
									</div>
									<div class="annexure-row">
										<span>PF - Employer Contribution</span>
										<input name="annexurePfPm" type="text" inputmode="decimal" bind:value={annexure.pfPm} placeholder="0.00" />
										<span class="annexure-pa">{money(n(annexure.pfPm) * 12)}</span>
									</div>
									<div class="annexure-row">
										<span>Gratuity</span>
										<input name="annexureGratuityPm" type="text" inputmode="decimal" bind:value={annexure.gratuityPm} placeholder="0.00" />
										<span class="annexure-pa">{money(n(annexure.gratuityPm) * 12)}</span>
									</div>
									<div class="annexure-row">
										<span>Insurance</span>
										<input name="annexureInsurancePm" type="text" inputmode="decimal" bind:value={annexure.insurancePm} placeholder="0.00" />
										<span class="annexure-pa">{money(n(annexure.insurancePm) * 12)}</span>
									</div>
									<div class="annexure-row">
										<span>Food, Recreation &amp; Longevity Membership</span>
										<input name="annexureFoodPm" type="text" inputmode="decimal" bind:value={annexure.foodPm} placeholder="0.00" />
										<span class="annexure-pa">{money(n(annexure.foodPm) * 12)}</span>
									</div>
									<div class="annexure-row annexure-subtotal">
										<span>Total Non-Cash Components</span>
										<span class="annexure-pa">{money(annexureNonCashPm)}</span>
										<span class="annexure-pa">{money(annexureNonCashPm * 12)}</span>
									</div>
									<div class="annexure-row annexure-total">
										<span>Total Yearly Cost to Company</span>
										<span class="annexure-pa">{money(annexureTotalPm)}</span>
										<span class="annexure-pa">{money(annexureTotalPa)}</span>
									</div>
								</div>
								<small>CTC: {(annexureTotalPa / 100000).toFixed(2)} Lakhs+</small>
							{/if}
						</div>
					{/if}

				<div style="display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:6px">
					<button class="btn small">Save</button>
					<button
						type="button"
						class="btn ghost small"
						onclick={previewOfferLetter}
						disabled={previewing}
					>
						{previewing ? 'Building preview…' : 'Preview'}
					</button>
					<a class="btn ghost small" href="/admin/candidates/{c.id}/offer-letter" download>Download PDF</a>
					{#if previewError}
						<span class="error" style="margin:0">{previewError}</span>
					{:else}
						<span class="muted" style="font-size:11px">Preview opens the letter as it reads right now, including unsaved edits.</span>
					{/if}
				</div>
				</fieldset>
			</form>
			{#if form?.offerLetterSaved}
				<p class="saved-chip" style="margin-top:8px">Saved ✓</p>
			{/if}
			<form
				method="POST"
				action="?/sendOfferLetterEmail"
				use:enhance
				style="margin-top:12px"
				onsubmit={(e) => {
					if (!confirm(`Send the offer letter to ${c.email}?`)) e.preventDefault();
				}}
			>
				<fieldset class="rbac" disabled={!data.isApprover}>
					<button class="btn teal">Send offer letter</button>
				</fieldset>
			</form>
			{#if form?.offerLetterSent}
				<p class="saved-chip" style="margin-top:8px">Offer letter sent ✓</p>
			{/if}
		</section>

		<section class="card">
			<div class="eyebrow red-eyebrow" style="margin-bottom:14px">Physical items · joining day</div>
			{#each data.physical as item}
				<form method="POST" action="?/physical" use:enhance class="physrow">
					<fieldset class="rbac" disabled={!data.isApprover}>
						<input type="hidden" name="itemId" value={item.id} />
						<input type="hidden" name="received" value={item.received ? 'false' : 'true'} />
						<button class="phys-check" class:on={item.received} aria-label="Toggle received">
							{#if item.received}
								<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="3"><path d="M20 6L9 17l-5-5" /></svg>
							{/if}
						</button>
						<span style="flex:1;font-size:13.5px;font-weight:600;color:var(--ae-text-2)">{item.label}</span>
						<span class="phys-status" class:got={item.received}>
							{item.received
								? `Received${item.receivedAt ? ' · ' + new Date(item.receivedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : ''}`
								: 'Pending'}
						</span>
					</fieldset>
				</form>
				<!-- Confirmation items read back a detail rather than take an object,
				     so they show the value being confirmed and can ask the candidate
				     to check it. Independent of approval: this form is outside the
				     rbac fieldset's status logic and never moves the record. -->
				{#if item.confirms}
					<div class="confirm-detail">
						<div class="cd-value" class:cd-empty={!item.currentValue}>
							{item.currentValue || 'Nothing on record yet'}
						</div>
						{#if item.candidateConfirmedAt}
							<p class="cd-note cd-ok">
								Candidate confirmed on {new Date(item.candidateConfirmedAt).toLocaleDateString('en-IN', {
									day: 'numeric',
									month: 'short'
								})}{item.candidateConfirmedValue && item.candidateConfirmedValue !== item.currentValue
									? ` as "${item.candidateConfirmedValue}"`
									: ''}
							</p>
						{:else if item.requestedAt}
							<p class="cd-note cd-wait">
								Asked the candidate on {new Date(item.requestedAt).toLocaleDateString('en-IN', {
									day: 'numeric',
									month: 'short'
								})} — waiting for their reply{item.requestNote ? ` · "${item.requestNote}"` : ''}
							</p>
						{/if}
						<form method="POST" action="?/requestConfirmation" use:enhance class="cd-form">
							<fieldset class="rbac" disabled={!data.isApprover}>
								<input type="hidden" name="field" value={item.confirms} />
								<input name="note" placeholder="Optional note to the candidate" />
								<button class="btn ghost small">
									{item.requestedAt ? 'Ask again' : 'Ask candidate to confirm'}
								</button>
							</fieldset>
						</form>
					</div>
				{/if}
			{/each}
			{#if form?.confirmationRequested}
				<p class="saved-chip" style="margin-top:8px">
					Asked the candidate to confirm their {form.confirmationRequested} ✓
				</p>
			{/if}
			<p class="muted" style="font-size:11.5px;margin:10px 0 0">
				Record reaches <em>complete</em> only when approved and all items are received.
				Asking the candidate to confirm a detail is independent — it needs no approval
				and never sends the record back a stage.
			</p>
		</section>
	</div>
</div>

<style>
	/* Reset so a disabling <fieldset> (hr_admin read-only gate) doesn't add its
	   own border/padding/display around the form controls it wraps. */
	/* `display: contents` on a fieldset stops browsers propagating its
	   `disabled` state to the controls inside — the fieldset generates no box,
	   so the whole set silently stays interactive. Keep it boxless via margin/
	   border/padding resets instead, which preserves the disabling. */
	fieldset.rbac {
		border: 0;
		margin: 0;
		padding: 0;
		min-width: 0;
		/* Inherit whatever layout the parent form used to apply directly to
		   these controls, so removing `display: contents` does not reflow the
		   rows it used to be transparent in. */
		display: inherit;
		gap: inherit;
		align-items: inherit;
		flex-wrap: inherit;
	}
	fieldset.rbac:disabled {
		opacity: 0.55;
		cursor: not-allowed;
	}
	.readonly-banner {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 12.5px;
		font-weight: 600;
		color: var(--ae-muted);
		background: var(--ae-surface-2, rgba(127, 127, 127, 0.08));
		border: 1px solid var(--ae-line-soft, rgba(127, 127, 127, 0.2));
		border-radius: 10px;
		padding: 9px 14px;
		margin-bottom: 16px;
	}
	.backlink {
		display: inline-flex;
		align-items: center;
		gap: 6px;
		font-weight: 700;
		font-size: 13px;
		color: var(--ae-ember-glow);
		text-decoration: none;
		margin-bottom: 18px;
	}
	.head {
		display: flex;
		align-items: flex-start;
		gap: 18px;
		flex-wrap: wrap;
		margin-bottom: 22px;
	}
	.avatar {
		width: 60px;
		height: 60px;
		border-radius: 14px;
		background: linear-gradient(135deg, #ff7d55, #d85a35);
		box-shadow: 0 0 20px rgba(255, 125, 85, 0.3);
		display: flex;
		align-items: center;
		justify-content: center;
		color: #fff;
		font-family: var(--ae-font-display);
		font-weight: 600;
		font-size: 24px;
		flex-shrink: 0;
	}
	.danger-hover:hover {
		border-color: var(--ae-crimson) !important;
		color: var(--ae-crimson) !important;
	}
	.flagbox {
		background: rgba(242,177,92,.08);
		border: 1px solid rgba(242,177,92,.3);
		border-radius: 16px;
		padding: 14px 18px;
		margin-bottom: 20px;
		font-size: 13px;
		color: var(--ae-text-2);
	}
	.cols {
		display: grid;
		grid-template-columns: 220px 1.1fr 0.9fr;
		gap: 22px;
		align-items: start;
	}
	.status-sidebar {
		display: flex;
		flex-direction: column;
		gap: 16px;
		position: sticky;
		top: 20px;
	}

	/* Journey tracker */
	.journey-card { padding: 18px 16px; }
	.journey { display: flex; flex-direction: column; gap: 0; }
	.journey-step {
		display: grid;
		grid-template-columns: 18px 1fr;
		grid-template-rows: auto auto;
		column-gap: 10px;
		--step-color: var(--ae-verdant);
	}
	.journey-step.pending { --step-color: var(--ae-faint); }
	.journey-step.active  { --step-color: var(--ae-ember-glow); }
	.j-dot {
		grid-column: 1;
		grid-row: 1;
		width: 18px;
		height: 18px;
		border-radius: 50%;
		background: var(--step-color);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		position: relative;
		z-index: 1;
		transition: background 0.2s;
	}
	.journey-step.pending .j-dot {
		background: var(--ae-line-soft);
		border: 2px solid var(--ae-faint);
	}
	.j-pulse {
		width: 8px;
		height: 8px;
		border-radius: 50%;
		background: var(--ae-sub-bg);
	}
	.j-line {
		grid-column: 1;
		grid-row: 2;
		width: 2px;
		min-height: 18px;
		background: var(--ae-line-soft);
		margin: 0 auto;
	}
	.journey-step:last-child .j-line { display: none; }
	.j-label {
		grid-column: 2;
		grid-row: 1 / 3;
		display: flex;
		align-items: flex-start;
		gap: 6px;
		padding: 1px 0 14px;
		font-size: 12px;
		font-weight: 600;
		color: var(--ae-muted);
	}
	.journey-step.done .j-label  { color: var(--ae-text); }
	.journey-step.active .j-label { color: var(--ae-ember-glow); font-weight: 800; }
	.j-icon { font-size: 13px; line-height: 1.3; flex-shrink: 0; }

	/* Employee code widget */
	.emp-card { padding: 16px; }
	.emp-id-display {
		display: flex;
		align-items: center;
		gap: 7px;
		font-family: ui-monospace, monospace;
		font-size: 14px;
		font-weight: 800;
		color: var(--ae-verdant);
		background: rgba(62,207,154,.08);
		border: 1.5px solid rgba(62,207,154,.3);
		border-radius: 9px;
		padding: 8px 11px;
		margin-bottom: 10px;
	}
	.emp-form {
		display: flex;
		gap: 6px;
		align-items: center;
	}
	/* GlassSelect brings its own wrapper rather than accepting .emp-input, so
	   the flex row has to be told to let it take the free space. */
	.emp-form :global(.gs) {
		flex: 1;
		min-width: 0;
	}
	.emp-input {
		flex: 1;
		min-width: 0;
		font-size: 13px;
		font-family: ui-monospace, monospace;
		padding: 7px 9px;
		border: 1px solid var(--ae-line-strong);
		border-radius: 8px;
		color: var(--ae-text);
	}
	.emp-input:disabled {
		background: var(--ae-sub-bg);
		color: var(--ae-faint);
		cursor: not-allowed;
	}
	.shift-display {
		display: flex;
		align-items: center;
		gap: 7px;
		font-size: 13px;
		font-weight: 700;
		color: var(--ae-text);
		background: var(--ae-sub-bg);
		border: 1.5px solid var(--ae-line-strong);
		border-radius: 9px;
		padding: 8px 11px;
		margin-bottom: 10px;
	}
	.it-preview-err {
		margin: 7px 0 0;
		font-size: 11.5px;
		color: var(--ae-crimson, #e5636b);
	}

	/* IT mail confirm modal */
	.it-modal-overlay {
		position: fixed;
		inset: 0;
		z-index: 200;
		background: rgba(8, 9, 14, 0.55);
		backdrop-filter: blur(4px);
		-webkit-backdrop-filter: blur(4px);
		display: grid;
		place-items: center;
		padding: 20px;
	}
	.it-modal {
		width: 100%;
		max-width: 780px;
		/* The mail body is the point of the dialog, so the card takes the height
		   it can and the body iframe absorbs the rest. */
		max-height: min(88vh, 900px);
		display: flex;
		flex-direction: column;
		background: var(--ae-card-bg);
		border: 1px solid var(--ae-card-border);
		border-radius: var(--ae-card-radius);
		box-shadow: var(--ae-card-shadow);
		backdrop-filter: var(--ae-card-blur);
		-webkit-backdrop-filter: var(--ae-card-blur);
		padding: 22px;
		text-align: left;
	}
	.it-modal-head {
		display: flex;
		align-items: flex-start;
		justify-content: space-between;
		gap: 12px;
		margin-bottom: 14px;
	}
	.it-modal-eyebrow {
		font-family: var(--ae-font-mono);
		font-size: 10.5px;
		font-weight: 600;
		letter-spacing: 0.09em;
		text-transform: uppercase;
		color: var(--ae-muted);
		margin-bottom: 4px;
	}
	.it-modal h2 {
		font-family: var(--ae-font-display);
		font-size: 19px;
		font-weight: 600;
		margin: 0;
		color: var(--ae-text);
	}
	.it-modal-x {
		flex: none;
		display: grid;
		place-items: center;
		width: 30px;
		height: 30px;
		border-radius: 8px;
		border: 1px solid var(--ae-line-strong);
		background: var(--ae-sub-bg);
		color: var(--ae-muted);
		cursor: pointer;
	}
	.it-modal-x:hover {
		color: var(--ae-text);
	}
	.it-modal-meta {
		background: var(--ae-sub-bg);
		border: 1px solid var(--ae-line-strong);
		border-radius: 10px;
		padding: 10px 12px;
		margin-bottom: 12px;
	}
	.it-meta-row {
		display: flex;
		gap: 10px;
		font-size: 12px;
		line-height: 1.55;
	}
	.it-meta-k {
		flex: none;
		width: 52px;
		font-family: var(--ae-font-mono);
		font-size: 10.5px;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--ae-muted);
		padding-top: 2px;
	}
	.it-meta-v {
		color: var(--ae-text);
		word-break: break-word;
	}
	.it-modal-warn {
		display: flex;
		align-items: flex-start;
		gap: 9px;
		font-size: 12px;
		line-height: 1.55;
		color: var(--ae-text);
		background: rgba(242, 177, 92, 0.12);
		border: 1px solid rgba(242, 177, 92, 0.35);
		border-radius: 10px;
		padding: 10px 12px;
		margin-bottom: 12px;
	}
	.it-modal-warn svg {
		flex: none;
		margin-top: 2px;
		color: var(--ae-amber);
	}
	.it-modal-frame {
		flex: 1;
		min-height: 260px;
		width: 100%;
		border: 1px solid var(--ae-line-strong);
		border-radius: 10px;
		/* The mail body paints its own light background; keep it that way so the
		   preview matches an inbox rather than the admin theme. */
		background: #f2f4f7;
	}
	.it-modal-actions {
		display: flex;
		justify-content: flex-end;
		gap: 9px;
		margin-top: 14px;
	}
	@media (max-width: 560px) {
		.it-modal {
			padding: 16px;
			max-height: 92vh;
		}
		.it-meta-row {
			flex-direction: column;
			gap: 1px;
		}
		.it-meta-k {
			width: auto;
		}
	}

	.it-mail {
		margin-top: 12px;
		padding-top: 12px;
		border-top: 1px solid var(--ae-line-soft);
	}
	.it-fields {
		margin-top: 12px;
		padding-top: 12px;
		border-top: 1px solid var(--ae-line-soft);
	}
	.it-fields .emp-input {
		width: 100%;
		margin-bottom: 8px;
	}
	.it-link-note,
	.field-hint {
		margin: 3px 0 8px;
		font-size: 10.5px;
		line-height: 1.4;
		opacity: 0.55;
		display: block;
	}

	.it-label {
		display: block;
		font-size: 10.5px;
		font-weight: 700;
		letter-spacing: 0.04em;
		text-transform: uppercase;
		color: var(--ae-muted);
		margin-bottom: 4px;
	}
	.emp-hint {
		display: flex;
		align-items: center;
		gap: 4px;
		font-size: 10.5px;
		color: var(--ae-muted);
		margin-top: 6px;
	}
	.docrow {
		display: flex;
		align-items: center;
		gap: 12px;
		padding: 11px 0;
		border-bottom: 1px solid var(--ae-line-soft);
	}
	.doc-ico {
		width: 36px;
		height: 36px;
		border-radius: 9px;
		background: var(--ae-line-soft);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		color: var(--ae-ember-glow);
	}
	.doc-ico.empty {
		color: var(--ae-faint);
	}
	.doc-name {
		font-weight: 700;
		font-size: 13.5px;
	}
	.doc-sub {
		font-size: 11.5px;
		color: var(--ae-muted);
	}
	pre {
		white-space: pre-wrap;
		font-size: 11px;
		background: var(--ae-sub-bg);
		padding: 8px 10px;
		border-radius: 8px;
		max-height: 180px;
		overflow: auto;
		margin: 6px 0 0;
	}
	.reupload {
		display: flex;
		gap: 8px;
		padding: 8px 0 12px 48px;
		border-bottom: 1px solid var(--ae-line-soft);
	}
	.group-title {
		font-weight: 800;
		font-size: 11px;
		letter-spacing: 0.1em;
		text-transform: uppercase;
		color: var(--ae-faint);
		margin: 14px 0 4px;
	}
	.frow {
		display: flex;
		align-items: center;
		gap: 10px;
		padding: 8px 0;
		border-bottom: 1px solid var(--ae-line-soft);
	}
	.flabel {
		flex: 1;
		font-size: 12.5px;
		color: var(--ae-muted);
	}
	.fvalue {
		font-size: 13.5px;
		font-weight: 600;
		text-align: right;
		max-width: 60%;
	}
	.fedit {
		font-size: 13px;
		padding: 6px 9px;
		border: 1px solid var(--ae-line-strong);
		border-radius: 7px;
		font-family: inherit;
		color: var(--ae-text-2);
		width: 55%;
		text-align: right;
	}
	.mono {
		font-family: ui-monospace, monospace;
	}
	.lock-hint {
		font-size: 11px;
		color: var(--ae-muted);
		margin-top: 8px;
		display: flex;
		align-items: center;
		gap: 5px;
	}
	.red-eyebrow {
		color: var(--ae-crimson);
	}
	.offer-form {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 10px 12px;
	}
	.offer-field {
		display: flex;
		flex-direction: column;
		gap: 4px;
		font-size: 11.5px;
		color: var(--ae-muted);
		font-weight: 600;
	}
	/* Match the compact offer-field inputs. */
	.offer-field :global(.gs-trigger) {
		padding: 7px 9px;
		font-size: 13px;
	}
	.offer-field input {
		font-size: 13px;
		padding: 7px 9px;
		border: 1px solid var(--ae-line-strong);
		border-radius: 8px;
		font-family: inherit;
		color: var(--ae-text-2);
	}
	.sig-field {
		grid-column: 1 / -1;
	}
	.kra-textarea {
		font-size: 12.5px;
		padding: 8px 10px;
		border: 1px solid var(--ae-line-strong);
		border-radius: 8px;
		font-family: inherit;
		color: var(--ae-text-2);
		resize: vertical;
		line-height: 1.5;
	}
	.sig-upload-btn {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 9px 16px;
		border: 1.5px dashed var(--ae-line-strong);
		border-radius: 10px;
		font-size: 13px;
		font-weight: 700;
		color: var(--ae-ember-glow);
		background: rgba(255,255,255,.03);
		cursor: pointer;
		transition: border-color 0.15s, background 0.15s;
		width: fit-content;
	}
	.sig-upload-btn:hover {
		border-color: var(--ae-ember-glow);
		background: rgba(255,125,85,.08);
	}
	.sig-file-hidden {
		display: none;
	}
	.sig-preview {
		display: flex;
		align-items: center;
		gap: 14px;
		padding: 10px 14px;
		border: 1px solid var(--ae-line-strong);
		border-radius: 10px;
		background: var(--ae-sub-bg);
		width: fit-content;
	}
	.sig-img {
		height: 48px;
		max-width: 160px;
		object-fit: contain;
		border-radius: 4px;
		background: var(--ae-sub-bg);
	}
	.sig-replace-btn {
		display: inline-flex;
		align-items: center;
		gap: 5px;
		font-size: 11.5px;
		font-weight: 700;
		color: var(--ae-ember-glow);
		cursor: pointer;
		padding: 5px 10px;
		border: 1px solid var(--ae-line-strong);
		border-radius: 7px;
		background: var(--ae-sub-bg);
		white-space: nowrap;
	}
	.sig-replace-btn:hover {
		border-color: var(--ae-ember-glow);
	}
	@media (max-width: 700px) {
		.offer-form {
			grid-template-columns: 1fr;
		}
	}
	.annexure-block {
		border: 1px solid var(--ae-line-strong);
		border-radius: 10px;
		padding: 12px 14px;
		background: var(--ae-sub-bg);
	}
	.annexure-toggle {
		display: flex;
		align-items: center;
		gap: 8px;
		font-size: 12.5px;
		font-weight: 700;
		color: var(--ae-text-2);
		cursor: pointer;
	}
	.annexure-toggle input {
		width: 15px;
		height: 15px;
	}
	.annexure-vp-toggle {
		display: flex;
		align-items: center;
		gap: 6px;
		cursor: pointer;
	}
	.annexure-vp-toggle input {
		width: 14px;
		height: 14px;
	}
	.annexure-table {
		display: flex;
		flex-direction: column;
		margin-top: 10px;
		border: 1px solid var(--ae-line-strong);
		border-radius: 8px;
		overflow: hidden;
	}
	.annexure-row {
		display: grid;
		grid-template-columns: 1fr 110px 110px;
		gap: 8px;
		align-items: center;
		padding: 5px 10px;
		border-bottom: 1px solid var(--ae-line-soft);
		font-size: 12px;
		color: var(--ae-text-2);
	}
	.annexure-row:last-child {
		border-bottom: none;
	}
	.annexure-row input {
		font-size: 12px;
		padding: 5px 7px;
		border: 1px solid var(--ae-line-strong);
		border-radius: 6px;
		font-family: inherit;
		color: var(--ae-text-2);
		width: 100%;
		box-sizing: border-box;
		text-align: right;
	}
	.annexure-editable-label input:first-child {
		text-align: left;
	}
	.annexure-pa {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.annexure-head {
		font-weight: 700;
		background: rgba(255, 255, 255, 0.04);
		text-transform: uppercase;
		font-size: 10.5px;
		letter-spacing: 0.03em;
	}
	.annexure-head span:not(:first-child) {
		text-align: right;
	}
	.annexure-section {
		font-weight: 700;
		background: rgba(255, 255, 255, 0.03);
	}
	.annexure-subtotal {
		font-weight: 700;
		background: rgba(255, 255, 255, 0.05);
	}
	.annexure-total {
		font-weight: 800;
		background: rgba(255, 125, 85, 0.1);
	}
	.uan-form {
		display: flex;
		align-items: center;
		gap: 8px;
		flex: 1;
		justify-content: flex-end;
	}
	.uan-input {
		width: 140px;
		font-size: 13px;
		padding: 5px 9px;
		border: 1px solid var(--ae-line-strong);
		border-radius: 8px;
		font-family: ui-monospace, monospace;
	}
	.saved-chip {
		font-size: 12px;
		font-weight: 700;
		color: var(--ae-verdant);
	}
	.linkbox {
		margin: 0 0 16px;
		background: rgba(62, 207, 154, 0.06);
		border: 1px solid rgba(62, 207, 154, 0.2);
		border-radius: 10px;
		padding: 15px 16px;
	}
	.linkcode {
		font-family: var(--ae-font-mono);
		font-size: 12.5px;
		background: #0b0d12;
		border: 1px solid var(--ae-line-strong);
		border-radius: 7px;
		padding: 7px 11px;
		color: var(--ae-ember-glow);
		overflow-wrap: anywhere;
	}
	.teal-pill-btn {
		border: 1px solid var(--ae-line-strong);
		background: var(--ae-input-bg);
		color: var(--ae-text-2);
		font-family: var(--ae-font-body);
		font-weight: 500;
		font-size: 12px;
		padding: 7px 13px;
		border-radius: 8px;
		cursor: pointer;
		text-decoration: none;
	}
	.verif {
		border: 1px solid var(--ae-line-soft);
		border-radius: 12px;
		padding: 12px 14px;
		margin-bottom: 12px;
	}
	.verif-head {
		display: flex;
		align-items: center;
		gap: 9px;
	}
	.verif-name {
		font-weight: 700;
		font-size: 13.5px;
	}
	.src-badge {
		font-size: 10px;
		font-weight: 700;
		letter-spacing: 0.06em;
		text-transform: uppercase;
		color: var(--ae-muted);
		background: var(--ae-line-soft);
		padding: 2px 7px;
		border-radius: 999px;
	}
	/* Joining-day confirmation rows: the value being read back, its request
	   state, and the ask-the-candidate control. Indented under its item so it
	   reads as detail of that row rather than a row of its own. */
	.confirm-detail {
		margin: -2px 0 10px 30px;
		padding: 8px 10px;
		border-left: 2px solid var(--ae-line, #e4e7ec);
		display: flex;
		flex-direction: column;
		gap: 6px;
	}
	.cd-value {
		font-size: 12.5px;
		line-height: 1.5;
		color: var(--ae-text-2);
		word-break: break-word;
	}
	.cd-empty {
		opacity: 0.55;
		font-style: italic;
	}
	.cd-note {
		margin: 0;
		font-size: 11.5px;
		line-height: 1.5;
	}
	.cd-ok {
		color: #0f7b3f;
	}
	.cd-wait {
		opacity: 0.7;
	}
	.cd-form fieldset {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		align-items: center;
		border: 0;
		margin: 0;
		padding: 0;
	}
	.cd-form input {
		flex: 1 1 200px;
		min-width: 0;
	}

	.physrow {
		display: flex;
		align-items: center;
		gap: 11px;
		padding: 8px 0;
	}
	.phys-check {
		width: 22px;
		height: 22px;
		border-radius: 7px;
		border: 1.5px solid var(--ae-faint);
		background: var(--ae-sub-bg);
		display: flex;
		align-items: center;
		justify-content: center;
		flex-shrink: 0;
		padding: 0;
	}
	.phys-check.on {
		border-color: var(--ae-verdant);
		background: var(--ae-verdant);
	}
	.phys-status {
		font-size: 11.5px;
		font-weight: 700;
		color: var(--ae-muted);
	}
	.phys-status.got {
		color: var(--ae-verdant);
	}
	@media (max-width: 1100px) {
		.cols {
			grid-template-columns: 200px 1fr 0.9fr;
		}
	}
	@media (max-width: 800px) {
		.cols {
			grid-template-columns: 1fr;
		}
		.status-sidebar {
			position: static;
			flex-direction: row;
			flex-wrap: wrap;
		}
		.journey-card, .emp-card {
			flex: 1;
			min-width: 200px;
		}
	}
	.approval-widget {
		display: flex;
		align-items: center;
		gap: 16px;
		background: linear-gradient(135deg, rgba(62,207,154,.08) 0%, rgba(62,207,154,.1) 100%);
		border: 1.5px solid rgba(62,207,154,.3);
		border-radius: 18px;
		padding: 18px 22px;
		margin-bottom: 20px;
		flex-wrap: wrap;
	}
	.approval-icon {
		width: 52px;
		height: 52px;
		border-radius: 14px;
		background: var(--ae-verdant);
		display: flex;
		align-items: center;
		justify-content: center;
		/* Dark glyph on the green fill: #fff on #3ECF9A is only ~1.8:1. */
		color: #06231a;
		flex-shrink: 0;
	}
</style>
