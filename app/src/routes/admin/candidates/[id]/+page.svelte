<script lang="ts">
	import { tick, untrack } from 'svelte';
	import { enhance } from '$app/forms';
	import { invalidateAll } from '$app/navigation';
	import {
		COMPENSATION_FIELD_BY_TRACK,
		CONSULTANT_LETTER_TRACKS,
		EXP_LIKE_TRACKS,
		TRACK_LABELS,
		type Track
	} from '$lib/shared/matrix';
	import { toIsoDate } from '$lib/shared/dates';
	import {
		balanceWithSpecialAllowances,
		computeAnnexureTotals,
		grossGap as annexureGrossGap,
		GROSS_RULES,
		structureFromGross
	} from '$lib/shared/annexure';
	import GlassSelect from '$lib/components/GlassSelect.svelte';
	import {
		SHIFT_TIMINGS,
		isShiftTiming,
		TRACK_MODE,
		MODE_OPTIONS,
		normaliseMode
	} from '$lib/shared/shifts';
	import { RELIGIONS, MOTHER_TONGUES } from '$lib/shared/demographics';

	let { data, form } = $props();

	let reuploadFor: string | null = $state(null);
	let uploadRequestFor: string | null = $state(null);

	// ── HR uploading on the candidate's behalf ───────────────────────────────
	// For the candidate who cannot manage the onboarding link: HR files their
	// papers straight into the slot. Lands exactly like a candidate upload (OCR,
	// checklist, cross-check). Keyed 'slot:<type>' for a new file, 'doc:<id>' to
	// replace one, so only one picker is open at a time.
	let hrUploadKey: string | null = $state(null);
	let hrUploadInput: HTMLInputElement | null = $state(null);
	let hrUploading = $state(false);
	let hrUploadError: string | null = $state(null);
	let hrUploadDone: string | null = $state(null);

	function toggleHrUpload(key: string) {
		hrUploadKey = hrUploadKey === key ? null : key;
		hrUploadError = null;
	}

	async function uploadForCandidate(docType: string, label: string, replaceDocId?: string) {
		const file = hrUploadInput?.files?.[0];
		if (!file || hrUploading) return;
		hrUploading = true;
		hrUploadError = null;
		hrUploadDone = null;
		try {
			const body = new FormData();
			body.set('docType', docType);
			body.set('file', file);
			if (replaceDocId) body.set('replaceDocId', replaceDocId);
			const res = await fetch(`/admin/candidates/${c.id}/doc-upload`, { method: 'POST', body });
			if (!res.ok) {
				let msg = 'Upload failed.';
				try {
					msg = (await res.json()).message ?? msg;
				} catch {}
				hrUploadError = msg;
				return;
			}
			const out: { ocrStatus: string } = await res.json();
			hrUploadDone =
				out.ocrStatus === 'unreadable'
					? `${label} uploaded, but it could not be read — check it, or replace it with a clearer scan.`
					: out.ocrStatus === 'failed'
						? `${label} uploaded. Auto-reading failed; the file is stored.`
						: `${label} uploaded ✓`;
			hrUploadKey = null;
			await invalidateAll();
		} catch {
			hrUploadError = 'Upload failed — check your connection and try again.';
		} finally {
			hrUploading = false;
		}
	}

	/** "asked 3× · 2 days ago". A document can be chased as often as it takes,
	 *  so the count is what tells HR whether this is a first ask or the fourth —
	 *  and the age is what tells them whether it is fair to ask again yet. */
	function askedLabel(count: number, at: string | null): string {
		const times = count > 1 ? `asked ${count}×` : 'asked';
		if (!at) return times;
		const days = Math.floor((Date.now() - new Date(at).getTime()) / 86_400_000);
		if (days <= 0) return `${times} · today`;
		if (days === 1) return `${times} · yesterday`;
		return `${times} · ${days} days ago`;
	}
	let editingProfile = $state(false);
	$effect(() => {
		if (form?.profileSaved) editingProfile = false;
	});

	const c = $derived(data.candidate);
	const ol = $derived(data.offerLetter);

	function copyLink(link: string) {
		navigator.clipboard.writeText(link);
	}

	// ── HR reference documents ───────────────────────────────────────────────
	// Optional uploads for HR's own use, distinct from the candidate's documents:
	// no slot, no OCR, no review verdict, any number of them. Uploaded over
	// fetch so the card can absorb a 150 MB scan without a page round trip.
	let refFileInput: HTMLInputElement | null = $state(null);
	let refLabel = $state('');
	let refNote = $state('');
	let refUploading = $state(false);
	let refError: string | null = $state(null);

	async function uploadReferenceFile() {
		const file = refFileInput?.files?.[0];
		if (!file || refUploading) return;
		refUploading = true;
		refError = null;
		try {
			const body = new FormData();
			body.set('file', file);
			if (refLabel.trim()) body.set('label', refLabel.trim());
			if (refNote.trim()) body.set('note', refNote.trim());
			const res = await fetch(`/admin/candidates/${c.id}/other-docs`, { method: 'POST', body });
			if (!res.ok) {
				refError = (await res.text()) || 'Upload failed.';
				return;
			}
			// Re-reads the list from the server rather than pushing the response
			// onto it, so the card shows what is actually stored.
			refLabel = '';
			refNote = '';
			if (refFileInput) refFileInput.value = '';
			await invalidateAll();
		} catch {
			refError = 'Upload failed — check your connection and try again.';
		} finally {
			refUploading = false;
		}
	}

	function prettySize(bytes: number): string {
		if (bytes < 1024) return `${bytes} B`;
		if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
		return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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

	// ── Manual edits (super admin only) ───────────────────────────────────────
	// The escape hatch for the offer that has to say something the fields above
	// cannot express: every block the renderer draws carries a stable key, and an
	// override replaces that block's text — or drops it, when left empty.
	//
	// The edits live here and ride along as hidden fields on the offer form, so
	// Save persists them and Preview renders them by the very same path as every
	// other field. There is deliberately no separate save: a letter whose wording
	// was stored by one route and previewed by another could disagree with
	// itself, which is the one thing this form must never do.
	type LetterBlock = {
		key: string;
		kind: 'heading' | 'subheading' | 'para' | 'clause' | 'bullet' | 'caption';
		marker?: string;
		page: number;
		defaultText: string;
		text: string;
		overridden: boolean;
		removed: boolean;
		added?: boolean;
		afterKey?: string;
	};
	type LetterAddition = {
		id: string;
		afterKey: string;
		kind: 'para' | 'clause' | 'bullet' | 'subheading';
		marker: string;
		text: string;
	};
	const ADD_KINDS: Array<{ value: LetterAddition['kind']; label: string }> = [
		{ value: 'para', label: 'Paragraph' },
		{ value: 'clause', label: 'Numbered clause' },
		{ value: 'bullet', label: 'Bullet' },
		{ value: 'subheading', label: 'Heading' }
	];

	const editsToMap = (list: Array<{ key: string; text: string }>) =>
		Object.fromEntries(list.map((e) => [e.key, e.text]));

	// Seeded the way the annexure is, and resynced on the same terms: after a
	// save, and when the page switches to another candidate.
	let manualEdits = $state<Record<string, string>>(
		untrack(() => editsToMap(data.offerLetter.manualEdits ?? []))
	);
	$effect(() => {
		manualEdits = editsToMap(ol.manualEdits ?? []);
	});
	let manualAdditions = $state<LetterAddition[]>(
		untrack(() => (data.offerLetter.manualAdditions ?? []).map((a) => ({ ...a })))
	);
	$effect(() => {
		manualAdditions = (ol.manualAdditions ?? []).map((a) => ({ ...a }));
	});
	const manualEditCount = $derived(Object.keys(manualEdits).length + manualAdditions.length);

	let meOpen = $state(false);
	let meLoading = $state(false);
	let meError: string | null = $state(null);
	let meBlocks: LetterBlock[] = $state([]);
	let meOrphans: string[] = $state([]);
	/** The modal's working copy — Cancel has to leave the form untouched, so
	 *  nothing is written back to `manualEdits` until Apply. */
	let meDraft: Record<string, string> = $state({});
	/** Working copy of the added blocks, on the same terms as meDraft. */
	let meAdds: LetterAddition[] = $state([]);
	let meOrphanAdds: string[] = $state([]);

	/** Opens the editor on the letter as it reads *right now*: the block list is
	 *  built by rendering the posted form, so a job title typed a moment ago
	 *  already appears in the paragraph that quotes it. */
	async function openManualEdits() {
		if (!offerForm || meLoading) return;
		meLoading = true;
		meError = null;
		meBlocks = [];
		meOrphans = [];
		meDraft = { ...manualEdits };
		meAdds = manualAdditions.map((a) => ({ ...a }));
		meOrphanAdds = [];
		meOpen = true;
		try {
			const res = await fetch(`/admin/candidates/${c.id}/offer-letter/blocks`, {
				method: 'POST',
				body: new FormData(offerForm)
			});
			if (!res.ok) {
				meError =
					res.status === 403
						? 'You need Act on “Offer letter: hand-edit the wording” in Access & org.'
						: `Could not read the letter (${res.status}). Try saving first.`;
				return;
			}
			const body = (await res.json()) as {
				blocks: LetterBlock[];
				orphans: string[];
				orphanAdditions: string[];
			};
			// Added blocks are rendered from meAdds, in place under their anchor, so
			// the server's copies of them are dropped from the template list here.
			meBlocks = body.blocks.filter((b) => !b.added);
			meOrphans = body.orphans;
			meOrphanAdds = body.orphanAdditions;
		} catch {
			meError = 'Could not read the letter — check your connection and try again.';
		} finally {
			meLoading = false;
		}
	}

	/** An override equal to the template's own text is not an override — storing
	 *  it would pin that block to today's wording, so the letter would silently
	 *  stop tracking a later change to the template. Typing the default back in
	 *  therefore clears the edit. */
	function setBlock(b: LetterBlock, value: string) {
		if (value === b.defaultText) delete meDraft[b.key];
		else meDraft[b.key] = value;
		meDraft = { ...meDraft };
	}
	function resetBlock(b: LetterBlock) {
		delete meDraft[b.key];
		meDraft = { ...meDraft };
	}
	/** Empty text means "leave this block out of the letter" — see `editable` in
	 *  offer-letter/pdf.ts. */
	function removeBlock(b: LetterBlock) {
		meDraft[b.key] = '';
		meDraft = { ...meDraft };
	}
	function applyManualEdits() {
		manualEdits = { ...meDraft };
		// An added block left completely blank was started and abandoned, not
		// written — it would render as nothing, so it is dropped on the way out
		// rather than saved as an empty row someone has to clean up later.
		manualAdditions = meAdds.filter((a) => a.text.trim()).map((a) => ({ ...a }));
		meOpen = false;
	}
	function clearAllManualEdits() {
		meDraft = {};
		meAdds = [];
	}
	function dropOrphans() {
		for (const key of meOrphans) delete meDraft[key];
		meDraft = { ...meDraft };
		meOrphans = [];
		meAdds = meAdds.filter((a) => !meOrphanAdds.includes(a.id));
		meOrphanAdds = [];
	}

	/** A new block under `b`. Numbered clauses are the fiddly case: the letter's
	 *  own numbering is fixed text, so a marker is suggested from the block it
	 *  follows and left editable — renumbering what comes after is the author's
	 *  call, and often not what they want. */
	function addBlockAfter(b: LetterBlock, existing: LetterAddition[]) {
		const isClause = b.kind === 'clause';
		const n = Number((b.marker ?? '').replace(/[^0-9]/g, ''));
		meAdds = [
			...meAdds,
			{
				id: `a${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`,
				afterKey: b.key,
				kind: isClause ? 'clause' : 'para',
				marker: isClause && n ? `${n + 1 + existing.length}.` : '',
				text: ''
			}
		];
	}
	function updateAdd(id: string, patch: Partial<LetterAddition>) {
		meAdds = meAdds.map((a) => (a.id === id ? { ...a, ...patch } : a));
	}
	function removeAdd(id: string) {
		meAdds = meAdds.filter((a) => a.id !== id);
	}
	const addsAfter = (key: string) => meAdds.filter((a) => a.afterKey === key);

	// ── Direct upload ─────────────────────────────────────────────────────────
	// The letter HR wrote themselves. Uploading one replaces the generated letter
	// for this candidate everywhere — preview, download and the emailed
	// attachment all serve the upload instead.
	//
	// The signature is not burnt into the stored file. The editor below renders
	// the uploaded PDF to a canvas and floats the signature over it, so dragging
	// it is only a coordinate change and the server stamps it on at read time.
	// That keeps the original recoverable, and lets the placement be corrected
	// after someone has looked at the letter — which is when placement problems
	// actually show up.
	type UploadedSig = {
		page: number;
		x: number;
		y: number;
		width: number;
		detected: boolean;
		anchorText: string;
		enabled: boolean;
	};
	type UploadedLetter = {
		filename: string;
		sizeBytes: number;
		pages: number;
		uploadedBy: string;
		uploadedAt: string | null;
		signature: UploadedSig;
	};

	let uploaded = $state<UploadedLetter | null>(untrack(() => data.offerLetter.uploaded ?? null));
	$effect(() => {
		uploaded = ol.uploaded ?? null;
	});

	let duOpen = $state(false);
	let duBusy = $state(false);
	let duError: string | null = $state(null);
	let duSig = $state<UploadedSig | null>(null);
	let duCanvas: HTMLCanvasElement | null = $state(null);
	let duStage: HTMLDivElement | null = $state(null);
	/** Page size in PDF points and the canvas scale, which together convert
	 *  between where the signature is stored and where it is drawn. */
	let duPage = $state({ w: 595.28, h: 841.89 });
	let duScale = $state(1);
	let duRendering = $state(false);
	let duSaved = $state(false);
	/** The raw upload, fetched once and re-rendered from memory as HR flips
	 *  pages — a 2 MB letter should not be refetched to look at page 3. */
	let duBytes: ArrayBuffer | null = null;

	const sigImage = $derived(ol.signatoryImageBase64 ?? '');
	/** Natural aspect ratio of the signature image, so the draggable overlay is
	 *  the shape the server will actually stamp rather than a guess. */
	let sigAspect = $state(3.2);
	// Annotated, not inferred: the drag handlers assign duSig and read this to
	// clamp against the page edge, so leaving it to inference makes the two
	// depend on each other and TypeScript gives up with `never`.
	const duSigHeight: number = $derived(duSig ? duSig.width / sigAspect : 0);
	const duDirty = $derived(
		!!duSig && !!uploaded && JSON.stringify(duSig) !== JSON.stringify(uploaded.signature)
	);

	async function openDirectUpload() {
		duOpen = true;
		duError = null;
		duSaved = false;
		duSig = uploaded ? { ...uploaded.signature } : null;
		duBytes = null;
		if (uploaded) await loadUploadedPdf();
	}

	function measureSignature() {
		if (!sigImage) return;
		const img = new Image();
		img.onload = () => {
			if (img.naturalWidth && img.naturalHeight) sigAspect = img.naturalWidth / img.naturalHeight;
		};
		img.src = sigImage;
	}

	async function loadUploadedPdf() {
		duRendering = true;
		duError = null;
		try {
			// ?raw=1: the stamped copy would show the signature twice — once burnt
			// into the page, once as the thing being dragged.
			const res = await fetch(`/admin/candidates/${c.id}/offer-letter/uploaded?raw=1`);
			if (!res.ok) throw new Error(String(res.status));
			duBytes = await res.arrayBuffer();
			measureSignature();
			await renderUploadedPage();
		} catch {
			duError = 'Could not open the uploaded letter.';
			duRendering = false;
		}
	}

	/** Renders the current page to the canvas. pdfjs is imported here rather than
	 *  at module scope so it never loads for the ninety-nine candidates whose
	 *  letter is generated, and never during SSR, where it has no DOM. */
	async function renderUploadedPage() {
		if (!duBytes || !duSig) return;
		duRendering = true;
		try {
			const pdfjs = await import('pdfjs-dist');
			const workerSrc = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
			pdfjs.GlobalWorkerOptions.workerSrc = workerSrc;

			// pdfjs transfers the buffer it is handed, so it gets a copy and the
			// original stays renderable for the next page flip.
			const doc = await pdfjs.getDocument({ data: new Uint8Array(duBytes.slice(0)) }).promise;
			const page = await doc.getPage(Math.min(duSig.page, doc.numPages));
			const base = page.getViewport({ scale: 1 });
			duPage = { w: base.width, h: base.height };
			const stageWidth = duStage?.clientWidth || 560;
			duScale = stageWidth / base.width;
			const viewport = page.getViewport({ scale: duScale });

			await tick();
			const canvas = duCanvas;
			const ctx = canvas?.getContext('2d');
			if (!canvas || !ctx) return;
			canvas.width = Math.floor(viewport.width);
			canvas.height = Math.floor(viewport.height);
			await page.render({ canvasContext: ctx, viewport }).promise;
			await doc.destroy();
		} catch {
			// The placement editor is the nicety, not the feature: the letter still
			// uploaded, still previews through the Preview button, and still sends.
			duError =
				'Could not draw the letter here — the position can still be saved, and Preview shows the result.';
		} finally {
			duRendering = false;
		}
	}

	async function onLetterChosen(e: Event) {
		const input = e.currentTarget as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;
		duBusy = true;
		duError = null;
		duSaved = false;
		try {
			const body = new FormData();
			body.append('file', file);
			const res = await fetch(`/admin/candidates/${c.id}/offer-letter/uploaded`, {
				method: 'POST',
				body
			});
			if (!res.ok) {
				const msg = (await res.json().catch(() => null)) as { message?: string } | null;
				duError = msg?.message ?? `Upload failed (${res.status}).`;
				return;
			}
			uploaded = (await res.json()) as UploadedLetter;
			duSig = { ...uploaded.signature };
			duBytes = null;
			await loadUploadedPdf();
			await invalidateAll();
		} catch {
			duError = 'Upload failed — check your connection and try again.';
		} finally {
			duBusy = false;
			input.value = '';
		}
	}

	/** Drag in canvas pixels, store in PDF points. The two y axes run opposite
	 *  ways — a canvas counts down from the top, a PDF counts up from the bottom
	 *  — so the conversion flips it and allows for the signature's own height,
	 *  because the stored point is the image's bottom-left corner. */
	function startSignatureDrag(e: PointerEvent) {
		if (!duSig || !duStage) return;
		e.preventDefault();
		const target = e.currentTarget as HTMLElement;
		target.setPointerCapture(e.pointerId);
		const startX = e.clientX;
		const startY = e.clientY;
		const originX = duSig.x;
		const originY = duSig.y;

		const move = (ev: PointerEvent) => {
			if (!duSig) return;
			const dx = (ev.clientX - startX) / duScale;
			const dy = (ev.clientY - startY) / duScale;
			duSig = {
				...duSig,
				x: Math.max(0, Math.min(originX + dx, duPage.w - duSig.width)),
				y: Math.max(0, Math.min(originY - dy, duPage.h - duSigHeight))
			};
		};
		const up = (ev: PointerEvent) => {
			target.releasePointerCapture(ev.pointerId);
			target.removeEventListener('pointermove', move);
			target.removeEventListener('pointerup', up);
		};
		target.addEventListener('pointermove', move);
		target.addEventListener('pointerup', up);
	}

	/** Arrow keys move the signature too: a wet-ink signature needs to line up
	 *  with a printed rule, and the last two points of that are easier to type
	 *  than to drag. Shift makes it a coarse move. */
	function nudgeSignature(e: KeyboardEvent) {
		if (!duSig) return;
		const step = e.shiftKey ? 10 : 1;
		const by: Record<string, [number, number]> = {
			ArrowLeft: [-step, 0],
			ArrowRight: [step, 0],
			ArrowUp: [0, step],
			ArrowDown: [0, -step]
		};
		const d = by[e.key];
		if (!d) return;
		e.preventDefault();
		duSig = {
			...duSig,
			x: Math.max(0, Math.min(duSig.x + d[0], duPage.w - duSig.width)),
			y: Math.max(0, Math.min(duSig.y + d[1], duPage.h - duSigHeight))
		};
	}

	async function saveSignaturePlacement() {
		if (!duSig) return;
		duBusy = true;
		duError = null;
		try {
			const res = await fetch(`/admin/candidates/${c.id}/offer-letter/uploaded`, {
				method: 'PATCH',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(duSig)
			});
			if (!res.ok) {
				duError = `Could not save the signature position (${res.status}).`;
				return;
			}
			const body = (await res.json()) as { signature: UploadedSig };
			if (uploaded) uploaded = { ...uploaded, signature: body.signature };
			duSig = { ...body.signature };
			duSaved = true;
			await invalidateAll();
		} catch {
			duError = 'Could not save the signature position.';
		} finally {
			duBusy = false;
		}
	}

	async function removeUploadedLetter() {
		if (!confirm('Remove the uploaded letter? This candidate goes back to the generated one.'))
			return;
		duBusy = true;
		try {
			await fetch(`/admin/candidates/${c.id}/offer-letter/uploaded`, { method: 'DELETE' });
			uploaded = null;
			duSig = null;
			duBytes = null;
			duOpen = false;
			await invalidateAll();
		} finally {
			duBusy = false;
		}
	}

	async function setSignaturePage(page: number) {
		if (!duSig) return;
		duSig = { ...duSig, page };
		await renderUploadedPage();
	}

	function prettyBytes(n: number): string {
		return n < 1024 * 1024 ? `${Math.round(n / 1024)} KB` : `${(n / (1024 * 1024)).toFixed(1)} MB`;
	}

	const meDirty = $derived(
		JSON.stringify(meDraft) !== JSON.stringify(manualEdits) ||
			JSON.stringify(meAdds.filter((a) => a.text.trim())) !== JSON.stringify(manualAdditions)
	);
	const meEditedCount = $derived(Object.keys(meDraft).length + meAdds.length);

	function blockLabel(b: LetterBlock): string {
		if (b.kind === 'clause') return b.marker?.trim() ? `Clause ${b.marker.replace(/[.)]$/, '')}` : 'Clause';
		if (b.kind === 'heading') return 'Title';
		if (b.kind === 'subheading') return b.marker?.trim() ? `Heading ${b.marker.replace(/[.)]$/, '')}` : 'Heading';
		if (b.kind === 'bullet') return 'Bullet';
		if (b.kind === 'caption') return 'Signature';
		return 'Paragraph';
	}

	/** Blocks grouped into the page they landed on, so the editor reads in the
	 *  same order as the printed letter. */
	const mePages = $derived(
		meBlocks.reduce<Array<{ page: number; blocks: LetterBlock[] }>>((acc, b) => {
			const last = acc[acc.length - 1];
			if (last && last.page === b.page) last.blocks.push(b);
			else acc.push({ page: b.page, blocks: [b] });
			return acc;
		}, [])
	);

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
	//
	// Seeded from the draft here rather than by the $effect below alone: effects
	// do not run during SSR, so a lazily-seeded `enabled` is false on the server
	// and anything keyed off it renders for the wrong branch until hydration —
	// which is what put the CTC field back on the page for a beat.
	let annexure = $state(untrack(() => ({ ...data.offerLetter.compensationAnnexure })));
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
	// Every subtotal comes from the same computeAnnexureTotals the PDF renderer
	// calls. This used to be four hand-written sums here, which is how the live
	// preview and page 4 could quietly disagree — and with recruiter-added rows
	// in three sections there is far too much arithmetic to keep in step twice.
	const annexureTotals = $derived(computeAnnexureTotals(annexure));
	const annexureCashPm = $derived(annexureTotals.cashTotalPm);
	const annexureNonCashPm = $derived(annexureTotals.nonCashTotalPm);
	const annexureCashWithVpPm = $derived(annexureTotals.cashWithVpTotalPm ?? annexureTotals.cashTotalPm);
	const annexureTotalPm = $derived(annexureTotals.grandTotalPm);
	const annexureTotalPa = $derived(annexureTotals.grandTotalPa);

	// Typing the gross fills the rows from HR's salary rules (GROSS_RULES in
	// shared/annexure.ts). It is a fill, not a lock: every row stays editable,
	// and a figure HR overrides stays overridden until the gross changes again.
	function fillFromGross(value: string) {
		annexure.grossPm = value;
		annexure = structureFromGross(annexure);
	}
	function setLta(on: boolean) {
		annexure.ltaEnabled = on;
		if (on && !n(annexure.ltaPm)) annexure.ltaPm = String(GROSS_RULES.ltaPm);
	}
	/** How far the cash rows are from the gross HR typed — what is left for
	 *  them to add as Special Allowances, or how far the floors on Basic and
	 *  HRA have already taken it past. Measured from the rows as they stand,
	 *  so a figure HR overrode by hand counts. The save refuses while this is
	 *  not zero; the same grossGap runs there. */
	const grossGap = $derived(annexureGrossGap(annexure));
	/** Whether the Special Allowances row can take up the whole gap — false
	 *  only when cash is past the gross by more than that row holds. */
	const canBalance = $derived(balanceWithSpecialAllowances(annexure) !== annexure);

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
		created: { label: 'Link sent', cls: '' },
		opened: { label: 'Opened', cls: 'purple' },
		in_progress: { label: 'In progress', cls: 'purple' },
		submitted: { label: 'Awaiting review', cls: 'gold' },
		changes_requested: { label: 'Changes requested', cls: 'red' },
		approved: { label: 'Approved', cls: 'teal' },
		complete: { label: 'Complete', cls: 'teal' },
		revoked: { label: 'Revoked', cls: 'red' }
	};

	const stdPill: Record<string, { label: string; cls: string }> = {
		pass: { label: 'Standard ✓', cls: 'teal' },
		warn: { label: 'Standard ⚠', cls: 'gold' },
		fail: { label: 'Not to standard', cls: 'red' }
	};

	const docPill: Record<string, { label: string; cls: string }> = {
		parsed: { label: 'Auto-read', cls: 'teal' },
		store_only: { label: 'Stored', cls: '' },
		pending: { label: 'Processing', cls: '' },
		unreadable: { label: 'Unreadable', cls: 'red' },
		failed: { label: 'OCR failed', cls: 'gold' }
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

	// The page's four tabs. The open one is remembered per candidate for this
	// browser tab, so a form that posts without JS and reloads the page comes
	// back to the tab it was sent from rather than to Documents.
	type CandTab = 'docs' | 'details' | 'offer' | 'joining';
	const CAND_TABS: { key: CandTab; label: string }[] = [
		{ key: 'docs', label: 'Documents' },
		{ key: 'details', label: 'Details' },
		{ key: 'offer', label: 'Offer letter' },
		{ key: 'joining', label: 'Joining day' }
	];
	let tab: CandTab = $state('docs');
	const tabKey = $derived(`cand-tab:${c.id}`);
	$effect(() => {
		const key = tabKey;
		untrack(() => {
			try {
				const saved = sessionStorage.getItem(key);
				if (saved && CAND_TABS.some((t) => t.key === saved)) tab = saved as CandTab;
				else tab = 'docs';
			} catch {
				tab = 'docs';
			}
		});
	});
	$effect(() => {
		const key = tabKey, value = tab;
		try {
			sessionStorage.setItem(key, value);
		} catch {
			// Storage blocked: the tab just is not remembered.
		}
	});
	// What is waiting in each tab, so nothing hides behind one unnoticed.
	const tabBadge = $derived.by(() => {
		const missing = data.checklist.filter((s) => s.mandatory && s.docs.length === 0).length;
		const pending = data.physical.filter((i) => !i.received).length;
		return {
			docs: missing ? { text: `${missing} missing`, warn: true } : null,
			details: null,
			offer: { text: ol.status === 'sent' ? 'Sent' : 'Draft', warn: false },
			joining: pending ? { text: `${pending} pending`, warn: false } : null
		} as Record<CandTab, { text: string; warn: boolean } | null>;
	});
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
	// Same server-echo preference for the welcome mail's two addresses.
	const officialEmail = $derived(
		form?.welcomeFieldsSaved ? (form.officialEmail ?? '') : (c.officialEmail ?? '')
	);
	const managerEmail = $derived(
		form?.welcomeFieldsSaved ? (form.reportingManagerEmail ?? '') : (c.reportingManagerEmail ?? '')
	);
	const shiftTiming = $derived(form?.shiftTimingSaved ? form.shiftTiming : (c.shiftTiming ?? ''));

	// GlassSelect is controlled, so mirror the stored shift into local state the
	// same way the offer letter's fields do. A record saved before the list was
	// fixed keeps its free-text value as an extra option, so re-saving the form
	// cannot silently drop what IT was already told.
	let shiftChoice = $state('');
	$effect(() => {
		shiftChoice = shiftTiming;
	});

	// Moving to another entity. The preview comes back from the action's first
	// press; it is only offered while the dropdown still names that entity, so
	// changing the choice drops a stale preview rather than confirming it.
	let entityChoice = $state('');
	const entityPreview = $derived(
		form?.entityPreview && form.entityPreview.toCompanyId === entityChoice ? form.entityPreview : null
	);
	$effect(() => {
		if (form?.entityMoved) entityChoice = '';
	});

	// Changing the hiring track: the same preview-then-confirm shape, with the
	// notes grouped so what is lost reads apart from what needs doing.
	let trackChoice = $state('');
	const trackPreview = $derived(
		form?.trackPreview && form.trackPreview.toTrack === trackChoice ? form.trackPreview : null
	);
	$effect(() => {
		if (form?.trackChanged) trackChoice = '';
	});
	const TRACK_NOTE_GROUPS = [
		{ tone: 'loss', title: 'Lost or stops applying' },
		{ tone: 'todo', title: 'Needs doing' },
		{ tone: 'info', title: 'Changes by itself' }
	] as const;
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
		joiningMode: form?.itMailFieldsSaved ? (form.joiningMode ?? '') : (c.joiningMode ?? ''),
		itRequestId: form?.itMailFieldsSaved ? (form.itRequestId ?? '') : (c.itRequestId ?? '')
	});

	// Both notice periods come from the same admin-editable list. They go into the
	// letter verbatim, so a value a letter already carries is kept rather than
	// snapped to the nearest option — same rule as office location.
	let noticePeriod = $state(untrack(() => data.offerLetter.noticePeriod ?? ''));
	let confirmedNoticePeriod = $state(
		untrack(() => data.offerLetter.confirmedNoticePeriod ?? '')
	);
	$effect(() => {
		noticePeriod = ol.noticePeriod ?? '';
		confirmedNoticePeriod = ol.confirmedNoticePeriod ?? '';
	});
	const noticePeriodOptions = (current: string) => [
		...data.noticePeriods.map((n: string) => ({ value: n, label: n })),
		...(current && !data.noticePeriods.includes(current)
			? [{ value: current, label: `${current} (not in list)` }]
			: [])
	];

	// Office location comes from the admin-editable list (settings → Dropdown
	// options). A letter saved before the list existed — or under an option since
	// removed — keeps its value as an extra entry, so opening the form never
	// quietly rewrites an address that is already on a sent letter.
	let officeLocation = $state(untrack(() => data.offerLetter.officeLocation ?? ''));
	$effect(() => {
		officeLocation = ol.officeLocation ?? '';
	});
	const officeLocationOptions = $derived([
		...data.officeLocations.map((o: string) => ({ value: o, label: o })),
		...(officeLocation && !data.officeLocations.includes(officeLocation)
			? [{ value: officeLocation, label: `${officeLocation} (not in list)` }]
			: [])
	]);

	// Mode is a closed dropdown now (IT asked for four engagement types), but a
	// record saved while it was free text may hold something else. That value is
	// appended as its own option so opening the page never silently rewrites it —
	// HR changes it deliberately or not at all.
	let joiningMode = $state(untrack(() => normaliseMode(data.candidate.joiningMode)));
	$effect(() => {
		joiningMode = normaliseMode(itFields.joiningMode);
	});
	const modeOptions = $derived([
		...MODE_OPTIONS.map((m) => ({ value: m, label: m })),
		...(joiningMode && !(MODE_OPTIONS as readonly string[]).includes(joiningMode)
			? [{ value: joiningMode, label: `${joiningMode} (retired)` }]
			: [])
	]);

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
		fields?: { label: string; value: string }[];
		missing: string[];
		/** Welcome mail only: what it encloses, and why it cannot go yet. */
		attachments?: { slot: string; label: string; filename: string; sizeBytes: number }[];
		blocker?: string | null;
		hasPhoto?: boolean;
	};
	/** The two mails that go out through the confirm modal. Both are built by
	 *  their own server-side builder and rendered by the same modal below —
	 *  a second near-identical modal would only drift from this one. */
	const MAIL_KINDS = {
		it: {
			title: 'IT setup mail preview',
			endpoint: 'it-setup-preview',
			action: '?/sendItSetupMail',
			send: 'Send to IT',
			resend: 'Resend to IT'
		},
		code: {
			title: 'Employee code mail preview',
			endpoint: 'employee-code-preview',
			action: '?/sendEmployeeCodeMail',
			send: 'Send to helpdesk',
			resend: 'Resend to helpdesk'
		},
		welcome: {
			title: 'Welcome mail preview',
			endpoint: 'welcome-mail-preview',
			action: '?/sendWelcomeMail',
			send: 'Send welcome mail',
			resend: 'Resend welcome mail'
		}
	} as const;
	type MailKind = keyof typeof MAIL_KINDS;

	let previewKind: MailKind = $state('it');
	let itPreview: ItMailPreview | null = $state(null);
	let itPreviewLoading = $state(false);
	let itPreviewError: string | null = $state(null);
	let itSending = $state(false);
	const previewSentAt = $derived(
		previewKind === 'it'
			? c.itSetupMailSentAt
			: previewKind === 'code'
				? c.employeeCodeMailSentAt
				: c.welcomeMailSentAt
	);
	/** The hidden form the modal's Send button submits — keeps the real
	 *  `use:enhance` POST (and its progressive-enhancement fallback) rather
	 *  than hand-rolling a fetch that would bypass the action's audit log. */
	let sendForms: Record<MailKind, HTMLFormElement | null> = $state({ it: null, code: null, welcome: null });

	// ── Welcome mail attachments ─────────────────────────────────────────────
	// Org-wide, not this candidate's: uploading here replaces the document for
	// every welcome mail from now on, which the card says in so many words.
	let welcomeBusy: string | null = $state(null);
	let welcomeAttachError: string | null = $state(null);

	/** SvelteKit answers a failed endpoint with {"message": …}; show the
	 *  message, not the JSON. */
	async function failureText(res: Response, fallback: string) {
		const raw = await res.text();
		try {
			return (JSON.parse(raw) as { message?: string }).message || fallback;
		} catch {
			return raw || fallback;
		}
	}

	async function uploadWelcomeAttachment(slot: string, input: HTMLInputElement) {
		const file = input.files?.[0];
		if (!file || welcomeBusy) return;
		welcomeBusy = slot;
		welcomeAttachError = null;
		try {
			const body = new FormData();
			body.set('file', file);
			const res = await fetch(`/admin/welcome-attachments/${slot}`, { method: 'POST', body });
			if (!res.ok) {
				welcomeAttachError = await failureText(res, 'Upload failed.');
				return;
			}
			await invalidateAll();
		} catch {
			welcomeAttachError = 'Upload failed — check your connection and try again.';
		} finally {
			welcomeBusy = null;
			input.value = '';
		}
	}

	async function removeWelcomeAttachment(slot: string, label: string) {
		if (welcomeBusy) return;
		if (!confirm(`Remove the ${label}? Welcome mails will go without it until a new one is uploaded.`)) return;
		welcomeBusy = slot;
		welcomeAttachError = null;
		try {
			const res = await fetch(`/admin/welcome-attachments/${slot}`, { method: 'DELETE' });
			if (!res.ok) {
				welcomeAttachError = await failureText(res, 'Could not remove it.');
				return;
			}
			await invalidateAll();
		} catch {
			welcomeAttachError = 'Could not remove it — check your connection and try again.';
		} finally {
			welcomeBusy = null;
		}
	}

	async function openItPreview(kind: MailKind = 'it') {
		previewKind = kind;
		itPreviewLoading = true;
		itPreviewError = null;
		itPreview = null;
		try {
			const res = await fetch(`/admin/candidates/${c.id}/${MAIL_KINDS[kind].endpoint}`);
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
		if (form?.itSetupMailSent || form?.employeeCodeMailSent || form?.welcomeMailSent) {
			itPreview = null;
			itSending = false;
		}
	});
</script>

<!-- The "this went out" line under a send button. Drawn from what the record
     says was sent, not from the click, so it is still there for whoever opens
     the page next — the same reasoning as the offer letter's note. -->
{#snippet sentNote(what: string, at: string, to: string[], by: string | null, justNow: boolean, again: string)}
	<p class="sent-note">
		<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M4 12.5l5 5L20 6.5" /></svg>
		<span>
			<!-- The IT lists run to nine addresses and this sits in a narrow column,
			     so two are named and the rest are on hover. -->
			{what} sent{#if to.length}{' to '}<strong title={to.join(', ')}>{to.slice(0, 2).join(', ')}</strong>{#if to.length > 2}{' '}and {to.length - 2} more{/if}{/if}
			on {new Date(at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}{#if by}{' by '}{by}{/if}.
			{justNow ? 'Just now.' : again}
		</span>
	</p>
{/snippet}

<a href="/admin" class="backlink">
	<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M15 6l-6 6 6 6" /></svg>
	All candidates
</a>

<!-- IT/VPN mail confirm — the mail rendered as IT will receive it, with the
     recipient list and a warning for any column that would go out blank. -->
<!-- ── Direct upload (Act on offer.upload in the access studio) ─────────────
     Upload a finished letter and it replaces the generated one for this
     candidate. The signature is not burnt into the stored file: the page is
     drawn to a canvas here with the signature floating over it, so placing it
     is a coordinate change and the server stamps it on when the letter is
     read. Outside the offer <form>, like every other dialog on this page. -->
{#if duOpen}
	<div
		class="it-modal-overlay"
		role="button"
		tabindex="-1"
		onclick={() => (duOpen = false)}
		onkeydown={(e) => e.key === 'Escape' && (duOpen = false)}
	>
		<!-- svelte-ignore a11y_click_events_have_key_events -- click-catcher only, stops the overlay's dismiss-on-click from firing; not itself interactive -->
		<div
			class="it-modal du-modal"
			role="dialog"
			aria-modal="true"
			aria-labelledby="du-title"
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
		>
			<div class="it-modal-head">
				<div>
					<div class="it-modal-eyebrow">Super admin only</div>
					<h2 id="du-title">Direct upload</h2>
				</div>
				<button class="it-modal-x" type="button" onclick={() => (duOpen = false)} aria-label="Close">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
				</button>
			</div>

			{#if duError}
				<p class="error" style="margin:0 0 10px">{duError}</p>
			{/if}

			{#if !uploaded}
				<p class="me-intro">
					Upload the finished offer letter for {c.fullName || c.email} and it becomes their letter:
					Preview, Download and Send all serve it instead of the one built from the fields. The
					signature on file is stamped on automatically — this reads the letter to find where its
					signature line is, and you can drag it from there.
				</p>
				<label class="du-drop">
					<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
					<span class="du-drop-main">{duBusy ? 'Reading the letter…' : 'Choose a PDF'}</span>
					<span class="du-drop-sub">PDF only · up to 25 MB</span>
					<input type="file" accept="application/pdf" onchange={onLetterChosen} disabled={duBusy} />
				</label>
			{:else}
				<div class="it-modal-meta">
					<div class="it-meta-row"><span class="it-meta-k">File</span><span class="it-meta-v">{uploaded.filename} · {uploaded.pages} {uploaded.pages === 1 ? 'page' : 'pages'} · {prettyBytes(uploaded.sizeBytes)}</span></div>
					<div class="it-meta-row"><span class="it-meta-k">Uploaded</span><span class="it-meta-v">{uploaded.uploadedBy}{uploaded.uploadedAt ? ' · ' + new Date(uploaded.uploadedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit' }) : ''}</span></div>
				</div>

				{#if !sigImage}
					<div class="it-modal-warn">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.3 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.3a2 2 0 0 0-3.4 0Z"/></svg>
						<span>No signature image is on file, so this letter will go out unsigned. Add one under
							<strong>Signature image</strong> on the offer form, then reopen this.</span>
					</div>
				{:else if duSig?.detected}
					<p class="du-found">
						Signature line found — <span class="du-anchor">“{duSig.anchorText}”</span>. Drag it if it
						needs nudging, or use the arrow keys.
					</p>
				{:else if duSig}
					<p class="du-found du-notfound">
						No signature line recognised in this letter, so it is parked at the foot of the last page.
						Drag it where it belongs.
					</p>
				{/if}

				<div class="du-body">
					<div class="du-stage" bind:this={duStage}>
						<canvas bind:this={duCanvas} class="du-canvas"></canvas>
						{#if duRendering}
							<div class="du-loading">Drawing page…</div>
						{/if}
						{#if duSig && sigImage && duSig.enabled}
							<!-- Positioned from the stored PDF point, which is the image's
							     bottom-left corner, so the top is measured from the far side
							     of the page. -->
							<div
								class="du-sig"
								style="left:{duSig.x * duScale}px; top:{(duPage.h - duSig.y - duSigHeight) * duScale}px; width:{duSig.width * duScale}px;"
								onpointerdown={startSignatureDrag}
								onkeydown={nudgeSignature}
								role="button"
								tabindex="0"
								aria-label="Signature — drag or use the arrow keys to position"
							>
								<img src={sigImage} alt="" draggable="false" />
							</div>
						{/if}
					</div>

					<div class="du-side">
						{#if duSig}
							{#if uploaded.pages > 1}
								<label class="du-control">
									<span>Page</span>
									<GlassSelect
										ariaLabel="Signature page"
										value={String(duSig.page)}
										onChange={(v) => setSignaturePage(Number(v))}
										options={Array.from({ length: uploaded.pages }, (_, i) => ({ value: String(i + 1), label: String(i + 1) }))}
									/>
								</label>
							{/if}
							<label class="du-control">
								<span>Size</span>
								<input
									type="range"
									min="40"
									max="300"
									step="5"
									value={duSig.width}
									oninput={(e) => (duSig = duSig && { ...duSig, width: Number(e.currentTarget.value) })}
								/>
							</label>
							<label class="du-check">
								<input
									type="checkbox"
									checked={duSig.enabled}
									onchange={(e) => (duSig = duSig && { ...duSig, enabled: e.currentTarget.checked })}
								/>
								<span>Stamp the signature</span>
							</label>
							<p class="du-hint">Off if the PDF you uploaded is already signed.</p>
							<div class="du-coords">x {Math.round(duSig.x)} · y {Math.round(duSig.y)} pt</div>
						{/if}

						<div class="du-side-actions">
							<label class="du-replace">
								Replace PDF
								<input type="file" accept="application/pdf" onchange={onLetterChosen} disabled={duBusy} />
							</label>
							<a class="me-link" href="/admin/candidates/{c.id}/offer-letter/uploaded" target="_blank" rel="noopener">Open signed PDF</a>
							<button type="button" class="me-link me-link-danger" onclick={removeUploadedLetter} disabled={duBusy}>
								Remove upload
							</button>
						</div>
					</div>
				</div>
			{/if}

			<div class="it-modal-actions">
				{#if duSaved && !duDirty}
					<span class="saved-chip" style="margin:0">Signature placed ✓</span>
				{/if}
				<span style="flex:1"></span>
				<button class="btn small ghost" type="button" onclick={() => (duOpen = false)}>Close</button>
				{#if uploaded}
					<button class="btn small teal" type="button" disabled={!duDirty || duBusy} onclick={saveSignaturePlacement}>
						{duBusy ? 'Saving…' : duDirty ? 'Save position' : 'Saved'}
					</button>
				{/if}
			</div>
		</div>
	</div>
{/if}

<!-- ── Manual edits (super admin only) ──────────────────────────────────────
     Lists every block this candidate's letter actually draws, in printed order,
     with the template's own text as the starting point. Deliberately outside the
     offer <form>: a textarea nested in it would post itself on Save. -->
{#if meOpen}
	<div
		class="it-modal-overlay"
		role="button"
		tabindex="-1"
		onclick={() => (meOpen = false)}
		onkeydown={(e) => e.key === 'Escape' && (meOpen = false)}
	>
		<!-- svelte-ignore a11y_click_events_have_key_events -- click-catcher only, stops the overlay's dismiss-on-click from firing; not itself interactive -->
		<div
			class="it-modal me-modal"
			role="dialog"
			aria-modal="true"
			aria-labelledby="me-title"
			tabindex="-1"
			onclick={(e) => e.stopPropagation()}
		>
			<div class="it-modal-head">
				<div>
					<div class="it-modal-eyebrow">Super admin only</div>
					<h2 id="me-title">Manual edits</h2>
				</div>
				<button class="it-modal-x" type="button" onclick={() => (meOpen = false)} aria-label="Close">
					<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 6 6 18M6 6l12 12"/></svg>
				</button>
			</div>

			<p class="me-intro">
				Every part of {c.fullName || c.email}'s letter, in the order it prints. Edit any block to
				change what that letter says — this candidate's only. <strong>+ Add below</strong> puts a new
				clause, paragraph, bullet or heading in at that exact point. Clearing a block's text leaves
				it out of the letter altogether. Wrap text in <code>**stars**</code> to set it bold.
			</p>

			{#if meError}
				<p class="error" style="margin:0 0 10px">{meError}</p>
			{/if}

			{#if meLoading}
				<p class="muted" style="font-size:12px">Reading the letter…</p>
			{:else if meBlocks.length}
				{#if meOrphans.length || meOrphanAdds.length}
					<div class="it-modal-warn">
						<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.3 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.3a2 2 0 0 0-3.4 0Z"/></svg>
						<span>
							{meOrphans.length + meOrphanAdds.length}
							{meOrphans.length + meOrphanAdds.length === 1 ? 'saved change is' : 'saved changes are'}
							anchored to a block this letter no longer has — kept from another track's template,
							most likely. They change nothing while they sit here.
							<button type="button" class="me-link" onclick={dropOrphans}>Clear them</button>
						</span>
					</div>
				{/if}

				<div class="me-list">
					{#each mePages as group (group.page)}
						<div class="me-page">Page {group.page}</div>
						{#each group.blocks as b (b.key)}
							{@const edited = b.key in meDraft}
							{@const removed = edited && !meDraft[b.key].trim()}
							<div class="me-block" class:me-edited={edited} class:me-removed={removed}>
								<div class="me-block-head">
									<span class="me-kind">{blockLabel(b)}</span>
									{#if removed}
										<span class="me-badge me-badge-out">Left out</span>
									{:else if edited}
										<span class="me-badge">Edited</span>
									{/if}
									<span style="flex:1"></span>
									{#if edited}
										<button type="button" class="me-link" onclick={() => resetBlock(b)}>Reset</button>
									{/if}
									{#if !removed}
										<button type="button" class="me-link" onclick={() => removeBlock(b)}>Leave out</button>
									{/if}
								</div>
								{#if removed}
									<p class="me-removed-note">
										Left out of the letter. <span class="me-orig">{b.defaultText}</span>
									</p>
								{:else}
									<textarea
										class="kra-textarea me-textarea"
										rows={Math.min(8, Math.max(2, Math.ceil((meDraft[b.key] ?? b.defaultText).length / 78)))}
										value={meDraft[b.key] ?? b.defaultText}
										oninput={(e) => setBlock(b, e.currentTarget.value)}
									></textarea>
								{/if}
							</div>

							<!-- Blocks added under this one, then the control that adds
							     another. Rendered here rather than from the server's block
							     list so a block just added appears without a round trip. -->
							{#each addsAfter(b.key) as a (a.id)}
								<div class="me-block me-added">
									<div class="me-block-head">
										<span class="me-badge me-badge-new">Added</span>
										<span class="me-kind-select">
											<GlassSelect
												ariaLabel="Block type"
												value={a.kind}
												onChange={(v) => updateAdd(a.id, { kind: v as LetterAddition['kind'] })}
												options={ADD_KINDS.map((k) => ({ value: k.value, label: k.label }))}
											/>
										</span>
										{#if a.kind === 'clause'}
											<input
												class="me-marker"
												value={a.marker}
												placeholder="11."
												maxlength="12"
												aria-label="Clause number"
												oninput={(e) => updateAdd(a.id, { marker: e.currentTarget.value })}
											/>
										{/if}
										<span style="flex:1"></span>
										<button type="button" class="me-link" onclick={() => removeAdd(a.id)}>Remove</button>
									</div>
									<textarea
										class="kra-textarea me-textarea"
										rows={Math.min(8, Math.max(2, Math.ceil(a.text.length / 78)))}
										placeholder="What this block should say…"
										value={a.text}
										oninput={(e) => updateAdd(a.id, { text: e.currentTarget.value })}
									></textarea>
								</div>
							{/each}

							<button
								type="button"
								class="me-add-here"
								onclick={() => addBlockAfter(b, addsAfter(b.key))}
								title="Add a new block here"
							>+ Add below</button>
						{/each}
					{/each}
				</div>
			{:else if !meError}
				<p class="muted" style="font-size:12px">This letter has no editable text yet — fill in the fields above first.</p>
			{/if}

			<div class="it-modal-actions">
				{#if meEditedCount}
					<button type="button" class="me-link me-link-danger" onclick={clearAllManualEdits}>
						Reset all {meEditedCount}
					</button>
				{/if}
				<span style="flex:1"></span>
				<button class="btn small ghost" type="button" onclick={() => (meOpen = false)}>Cancel</button>
				<button class="btn small teal" type="button" disabled={!meDirty} onclick={applyManualEdits}>
					{meDirty ? 'Apply' : 'No changes'}
				</button>
			</div>
			<p class="me-foot">
				Apply puts the edits on the form — they reach the letter when you <strong>Save</strong>, and
				Preview shows them straight away.
			</p>
		</div>
	</div>
{/if}

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
					<h2 id="it-preview-title">{MAIL_KINDS[previewKind].title}</h2>
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
				{#if itPreview.attachments}
					<div class="it-meta-row">
						<span class="it-meta-k">Attached</span>
						<span class="it-meta-v">
							{#if itPreview.attachments.length}
								{#each itPreview.attachments as a, i}{a.filename} <span class="muted">({prettySize(a.sizeBytes)})</span>{i < itPreview.attachments.length - 1 ? ', ' : ''}{/each}
							{:else}
								<span class="muted">Nothing</span>
							{/if}
						</span>
					</div>
					<div class="it-meta-row">
						<span class="it-meta-k">Photo</span>
						<span class="it-meta-v">
							{itPreview.hasPhoto
								? 'Their passport photo from the onboarding form, shown as uploaded'
								: 'None usable — the mail shows their initials'}
						</span>
					</div>
				{/if}
			</div>

			{#if itPreview.blocker}
				<div class="it-modal-warn">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M4.9 4.9l14.2 14.2"/></svg>
					<span><strong>{itPreview.blocker}</strong></span>
				</div>
			{/if}

			{#if itPreview.missing.length}
				<div class="it-modal-warn">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 9v4"/><path d="M12 17h.01"/><path d="M10.3 3.3 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.3a2 2 0 0 0-3.4 0Z"/></svg>
					{#if previewKind === 'welcome'}
						<span>
							{itPreview.missing.length === 1 ? 'This is missing' : 'These are missing'}:
							<strong>{itPreview.missing.join(', ')}</strong>. The joiner will see a blank where a value
							goes — fill it in on this page and reopen the preview, or send as-is.
						</span>
					{:else}
						<span>
							{itPreview.missing.length === 1 ? 'This column is blank' : 'These columns are blank'}:
							<strong>{itPreview.missing.join(', ')}</strong>. The desk will have to chase it — fill it in
							above and reopen this preview, or send as-is.
						</span>
					{/if}
				</div>
			{/if}

			<!-- srcdoc, sandboxed: the mail body is rendered markup, so showing it
			     inline would let its styles leak into the admin page. -->
			<iframe class="it-modal-frame" title="{MAIL_KINDS[previewKind].title} body" sandbox="" srcdoc={itPreview.html}></iframe>

			<div class="it-modal-actions">
				<button class="btn small ghost" type="button" onclick={closeItPreview} disabled={itSending}>Cancel</button>
				<button
					class="btn small teal"
					type="button"
					disabled={itSending || !data.isApprover || !!itPreview.blocker}
					onclick={() => sendForms[previewKind]?.requestSubmit()}
				>
					{itSending
						? 'Sending…'
						: previewSentAt
							? MAIL_KINDS[previewKind].resend
							: MAIL_KINDS[previewKind].send}
				</button>
			</div>
		</div>
	</div>
{/if}

{#if !data.isSuperAdmin}
	<div class="readonly-banner">
		<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
		<!-- Lists what HR can actually do. It used to name only approvals and the
		     offer letter, which read as the complete list and had HR believing the
		     employee code and its mails were out of their hands — they are
		     requireApprover, not super-admin-only, and always have been. A banner
		     that undersells the role is the same problem as one that oversells it. -->
		{data.isApprover
			? 'HR access — you can approve candidates, manage the offer letter, and assign and announce the employee code. Other edits are given per person by a super admin, in Access & org.'
			: 'View-only — editing candidate records needs HR access, or a power a super admin gives you in Access & org.'}
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
				<span class="pill teal">Accepted</span>
			{:else if c.hiringDecision === 'rejected'}
				<span class="pill red">Rejected</span>
			{/if}
			<!-- Who took the decision and when. A decision is one click that the
			     whole team then works from, so it should never read as though the
			     record decided itself. -->
			{#if c.hiringDecision && (c.hiringDecisionBy || c.hiringDecisionAt)}
				<span class="decided-by">
					{#if c.hiringDecisionBy}by {c.hiringDecisionBy}{/if}
					{#if c.hiringDecisionAt}
						· {new Date(c.hiringDecisionAt).toLocaleString('en-IN', {
							day: 'numeric',
							month: 'short',
							hour: 'numeric',
							minute: '2-digit'
						})}
					{/if}
				</span>
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
				<fieldset class="rbac" disabled={!data.can.link}>
					<button class="btn ghost danger-hover">Revoke link</button>
				</fieldset>
			</form>
		{/if}
		{#if data.can.delete}
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
					<fieldset class="rbac" disabled={!data.can.link}>
						<button type="submit" class="teal-pill-btn">Regenerate link</button>
					</fieldset>
				</form>
			</div>
		{:else}
			<div style="display:flex;align-items:center;gap:14px;flex-wrap:wrap">
				<div style="font-size:13px;color:var(--ae-text-2)">
					No active onboarding link for this candidate.
				</div>
				<form method="POST" action="?/regenerateLink" use:enhance>
					<fieldset class="rbac" disabled={!data.can.link}>
						<button type="submit" class="teal-pill-btn">Generate link</button>
					</fieldset>
				</form>
			</div>
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

		<!-- Entity: which company this person is joining, and moving them when
		     that changes late. Same record and link, so no second onboarding. -->
		<section class="card emp-card">
			<div class="eyebrow" style="margin-bottom:10px">Entity</div>
			<div class="shift-display">{data.companyName || '—'}</div>
			{#if data.lastEntityMove}
				<p class="it-link-note" style="margin-top:-4px">
					Moved from {data.lastEntityMove.fromName} ·
					{new Date(data.lastEntityMove.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
					· {data.lastEntityMove.by}
				</p>
			{/if}

			{#if form?.entityMoved}
				<p class="saved-chip" style="margin:0 0 8px">Moved to {form.entityMoved.toName} ✓</p>
				<ul class="move-notes">
					{#each form.entityMoved.notes as n}<li class={n.tone}>{n.text}</li>{/each}
				</ul>
			{/if}

			{#if data.can.entity}
				{#if data.entityOptions.length}
					<form method="POST" action="?/moveEntity" use:enhance={() => async ({ update }) => update({ reset: false })} class="emp-form">
						<GlassSelect
							name="toCompanyId"
							ariaLabel="Move to entity"
							placeholder="Move to…"
							bind:value={entityChoice}
							options={data.entityOptions}
						/>
						<button class="btn small ghost" disabled={!entityChoice}>Review</button>
					</form>
				{:else}
					<p class="muted" style="font-size:11.5px;margin:0">No other live entity to move to.</p>
				{/if}

				{#if entityPreview}
					<div class="move-preview">
						<div class="move-title">Moving to {entityPreview.toName}</div>
						<ul class="move-notes">
							{#each entityPreview.notes as n}<li class={n.tone}>{n.text}</li>{/each}
						</ul>
						<form method="POST" action="?/moveEntity" use:enhance={() => async ({ update }) => update({ reset: false })}>
							<input type="hidden" name="toCompanyId" value={entityPreview.toCompanyId} />
							<input type="hidden" name="confirm" value="1" />
							<button class="btn small teal" style="width:100%">Move to {entityPreview.toName}</button>
						</form>
					</div>
				{/if}
			{:else}
				<p class="it-link-note">Moving to another entity needs “Candidates: move to another entity” in Access &amp; org.</p>
			{/if}
		</section>

		<!-- Track: what kind of hire this is, and changing it when that changes
		     late. Same record and link, so no second onboarding. -->
		<section class="card emp-card">
			<div class="eyebrow" style="margin-bottom:10px">Track</div>
			<div class="shift-display">{TRACK_LABELS[c.track as Track] ?? c.track}</div>
			{#if data.lastTrackChange}
				<p class="it-link-note" style="margin-top:-4px">
					Changed from {data.lastTrackChange.fromName} ·
					{new Date(data.lastTrackChange.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
					· {data.lastTrackChange.by}
				</p>
			{/if}

			{#if form?.trackChanged}
				<p class="saved-chip" style="margin:0 0 8px">Changed to {form.trackChanged.toName} ✓</p>
				{@render trackNotes(form.trackChanged.notes)}
			{/if}

			{#if data.can.track}
				<form method="POST" action="?/changeTrack" use:enhance={() => async ({ update }) => update({ reset: false })} class="emp-form">
					<GlassSelect
						name="toTrack"
						ariaLabel="Change track"
						placeholder="Change to…"
						bind:value={trackChoice}
						options={data.trackOptions}
					/>
					<button class="btn small ghost" disabled={!trackChoice}>Review</button>
				</form>
				{#if form?.trackChangeError && form?.message}<p class="it-link-note" style="color:var(--ae-ember)">{form.message}</p>{/if}

				{#if trackPreview}
					<div class="move-preview">
						<div class="move-title">{TRACK_LABELS[c.track as Track]} → {trackPreview.toName}</div>
						{@render trackNotes(trackPreview.notes)}
						<form method="POST" action="?/changeTrack" use:enhance={() => async ({ update }) => update({ reset: false })}>
							<input type="hidden" name="toTrack" value={trackPreview.toTrack} />
							<input type="hidden" name="confirm" value="1" />
							<button class="btn small teal" style="width:100%">Change to {trackPreview.toName}</button>
						</form>
					</div>
				{/if}
			{:else}
				<p class="it-link-note">Changing the track needs “Candidates: change the hiring track” in Access &amp; org.</p>
			{/if}
		</section>

		{#snippet trackNotes(notes: { tone: string; text: string }[])}
			{#each TRACK_NOTE_GROUPS as g (g.tone)}
				{@const items = notes.filter((n) => n.tone === g.tone)}
				{#if items.length}
					<div class="move-group {g.tone}">{g.title}</div>
					<ul class="move-notes">
						{#each items as n}<li class={n.tone}>{n.text}</li>{/each}
					</ul>
				{/if}
			{/each}
		{/snippet}

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
			<form method="POST" action="?/setEmployeeId" use:enhance={() => async ({ update }) => update({ reset: false })} class="emp-form">
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

	</aside>

	<!-- The candidate's work in four tabs beside the journey, each sized to
	     fit the window, so nothing on this page needs scrolling to reach. -->
	<div class="cand-main">
	<div class="ctabs" role="tablist" aria-label="Candidate sections">
		{#each CAND_TABS as t (t.key)}
			<button
				type="button"
				role="tab"
				class="ctab"
				class:on={tab === t.key}
				aria-selected={tab === t.key}
				aria-controls="pane-{t.key}"
				onclick={() => (tab = t.key)}
			>
				{t.label}
				{#if tabBadge[t.key]}<span class="ctab-n" class:warn={tabBadge[t.key]?.warn}>{tabBadge[t.key]?.text}</span>{/if}
			</button>
		{/each}
	</div>

	<!-- Every pane stays mounted and is only hidden, so a half-filled offer
	     letter or IT form keeps its values when you switch tabs. -->
	<div class="tabpane pane-docs" id="pane-docs" role="tabpanel" hidden={tab !== 'docs'}>
	<!-- documents -->
	<section class="card">
		<div class="eyebrow" style="margin-bottom:16px">Documents · {docCount}</div>
		<div class="doc-list">
			{#each data.checklist as slot}
			<div class="docslot">
				{#if slot.docs.length === 0}
					<div class="docrow">
						<span class="doc-ico empty">
							<svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /></svg>
						</span>
						<div style="flex:1">
							<div class="doc-name" style="color:var(--ae-muted)">{slot.label}</div>
							<div class="doc-sub">
								Not uploaded
								{#if slot.uploadRequested}· {askedLabel(slot.uploadRequested.count, slot.uploadRequested.requestedAt)}{slot.uploadRequested.note ? `: ${slot.uploadRequested.note}` : ''}{/if}
							</div>
						</div>
						{#if slot.mandatory}
							<span class="pill red">Missing</span>
						{:else if slot.uploadRequested}
							<span class="pill gold">Upload asked</span>
						{/if}
						{#if data.can.docUpload && !['approved', 'complete', 'revoked'].includes(c.status)}
							<button type="button" class="btn ghost small" onclick={() => toggleHrUpload(`slot:${slot.type}`)}>
								Upload
							</button>
						{/if}
						{#if data.isApprover && !['approved', 'complete', 'revoked'].includes(c.status)}
							<button type="button" class="btn ghost small" onclick={() => (uploadRequestFor = uploadRequestFor === slot.type ? null : slot.type)}>
								{slot.uploadRequested ? 'Ask again' : 'Request upload'}
							</button>
						{/if}
					</div>
					{#if hrUploadKey === `slot:${slot.type}`}
						{@render hrUploadForm(slot.type, slot.label)}
					{/if}
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
									{doc.mime === 'application/pdf' ? 'PDF' : 'Image'} · {prettySize(doc.sizeBytes)}
									{#if doc.uploadedBy}· uploaded by HR ({doc.uploadedBy}){/if}
									{#if doc.reuploadCount}· {askedLabel(doc.reuploadCount, doc.reuploadRequestedAt)}{/if}
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
								<span class="pill red">Re-upload asked</span>
							{:else}
								<span class="pill {docPill[doc.ocrStatus]?.cls}">{docPill[doc.ocrStatus]?.label ?? doc.ocrStatus}</span>
							{/if}
							<a class="btn ghost small" href="/admin/candidates/{c.id}/doc/{doc.id}" target="_blank" rel="noopener">View</a>
							<!-- Same gate as "Request upload" above, and repeatable for the same
							     reason. It used to require status === 'submitted', but asking for
							     one re-upload sets the record to changes_requested — which then hid
							     the button on every other document, capping HR at one request per
							     submission. -->
							{#if data.can.docUpload && !['approved', 'complete', 'revoked'].includes(c.status)}
								<button type="button" class="btn ghost small" onclick={() => toggleHrUpload(`doc:${doc.id}`)}>
									Replace
								</button>
							{/if}
							{#if data.isApprover && !['approved', 'complete', 'revoked'].includes(c.status)}
								<button type="button" class="btn ghost small" onclick={() => (reuploadFor = reuploadFor === doc.id ? null : doc.id)}>
									{doc.reviewStatus === 'reupload_requested' ? 'Ask again' : 'Ask re-upload'}
								</button>
							{/if}
						</div>
						{#if hrUploadKey === `doc:${doc.id}`}
							{@render hrUploadForm(slot.type, slot.label, doc.id)}
						{/if}
						{#if data.isApprover && reuploadFor === doc.id}
							<form method="POST" action="?/requestReupload" use:enhance class="reupload">
								<input type="hidden" name="docId" value={doc.id} />
								<input name="note" placeholder="Reason shown to the candidate (e.g. glare on the number)" />
								<button class="btn small">Send</button>
							</form>
						{/if}
					{/each}
					{#if data.can.docUpload && !['approved', 'complete', 'revoked'].includes(c.status) && slot.docs.filter((d) => d.reviewStatus !== 'reupload_requested').length < slot.maxFiles}
						<div class="add-file">
							<button type="button" class="btn ghost small" onclick={() => toggleHrUpload(`slot:${slot.type}`)}>
								+ Add another file
							</button>
						</div>
						{#if hrUploadKey === `slot:${slot.type}`}
							{@render hrUploadForm(slot.type, slot.label)}
						{/if}
					{/if}
				{/if}
			</div>
			{/each}
		</div>
		{#if hrUploadDone}<p class="saved-chip" style="margin-top:10px">{hrUploadDone}</p>{/if}
	</section>

	<div class="pane-2">
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

		<!-- HR's own reference uploads. Deliberately not part of the document
		     matrix above: nothing here is required, nothing is OCR'd, and the
		     candidate never sees it. -->
		<section class="card">
			<div class="eyebrow" style="margin-bottom:6px">Other documents</div>
			<p class="muted" style="font-size:11.5px;margin:0 0 14px">
				Optional. Anything HR wants kept against this candidate for reference — an interview
				note, a signed scan, a background report. Not requested from the candidate and not
				shown to them.
			</p>

			{#if data.referenceFiles.length}
				<div class="ref-list">
					{#each data.referenceFiles as f (f.id)}
						<div class="ref-row">
							<a class="ref-name" href="/admin/candidates/{c.id}/other-docs/{f.id}" target="_blank" rel="noopener">
								<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/></svg>
								<span>{f.label}</span>
							</a>
							<span class="ref-meta">
								{prettySize(f.sizeBytes)} ·
								{new Date(f.uploadedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
							</span>
							<form method="POST" action="?/removeReferenceFile" use:enhance={() => async ({ update }) => update({ reset: false })}>
								<fieldset class="rbac" disabled={!data.isApprover}>
									<input type="hidden" name="fileId" value={f.id} />
									<button class="ref-del" aria-label={`Remove ${f.label}`} title="Remove">×</button>
								</fieldset>
							</form>
							{#if f.note}<p class="ref-note">{f.note}</p>{/if}
						</div>
					{/each}
				</div>
			{:else}
				<p class="muted" style="font-size:12.5px;margin:0 0 14px">Nothing uploaded yet.</p>
			{/if}

			<fieldset class="rbac ref-add" disabled={!data.isApprover}>
				<input class="emp-input" bind:value={refLabel} placeholder="Name it (optional — defaults to the filename)" maxlength="120" />
				<input class="emp-input" bind:value={refNote} placeholder="Note (optional)" maxlength="300" />
				<input bind:this={refFileInput} type="file" accept="image/jpeg,image/png,application/pdf" />
				<button class="btn small" type="button" onclick={uploadReferenceFile} disabled={refUploading}>
					{refUploading ? 'Uploading…' : 'Upload document'}
				</button>
				<small class="muted" style="font-size:10.5px">JPG, PNG or PDF · max 150 MB</small>
			</fieldset>
			{#if refError}<p class="error" style="margin-top:8px">{refError}</p>{/if}
			{#if form?.referenceFileRemoved}
				<p class="saved-chip" style="margin-top:8px">Document removed ✓</p>
			{/if}
		</section>
	</div>
	</div>

	{#snippet hrUploadForm(docType: string, label: string, replaceDocId?: string)}
		<div class="reupload hr-upload">
			<input bind:this={hrUploadInput} type="file" accept="image/jpeg,image/png,application/pdf" />
			<button class="btn small" type="button" disabled={hrUploading} onclick={() => uploadForCandidate(docType, label, replaceDocId)}>
				{hrUploading ? 'Uploading…' : replaceDocId ? 'Replace file' : 'Upload'}
			</button>
			<small class="muted">
				{replaceDocId ? 'The current file is deleted once the new one is stored.' : 'Filed for the candidate — read and checked like their own upload.'}
				JPG, PNG or PDF · max 150 MB
			</small>
			{#if hrUploadError}<p class="error" style="margin:0;flex-basis:100%">{hrUploadError}</p>{/if}
		</div>
	{/snippet}

	<div class="tabpane" id="pane-details" role="tabpanel" hidden={tab !== 'details'}>
		<section class="card">
			<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">
				<div class="eyebrow">Extracted details</div>
				<div style="flex:1"></div>
				{#if data.can.edit}
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
			<div class="fgroups">
			<form
				id="edit-profile-form"
				method="POST"
				action="?/editProfile"
				use:enhance={() => async ({ update }) => update({ reset: false })}
			>
				{#each detailGroups as group}
					<div class="fgroup">
					<div class="group-title">{group.title}</div>
					<div class="fgrid">
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
					</div>
					</div>
				{/each}
				<datalist id="mother-tongues">
					{#each MOTHER_TONGUES as t}<option value={t}></option>{/each}
				</datalist>
				<div class="fgroup">
				<div class="group-title">Religion &amp; marital status</div>
				<div class="fgrid">
				<div class="frow">
					<span class="flabel">Religion</span>
					{#if editingProfile}
						<!-- `required` with a disabled empty option: a legacy row with no
						     religion still opens on the placeholder rather than silently
						     preselecting the first faith on the list, but the form will not
						     submit until a real one is picked. The server rejects a blank
						     regardless — see validateProfileEdit. -->
						<!-- Legacy rows may hold a value the list no longer offers (e.g. the
						     retired "Prefer not to say"). Keep it selectable so opening the
						     editor to fix an unrelated field does not silently blank it. -->
						<span class="fedit-gs">
							<GlassSelect
								name="religion"
								ariaLabel="Religion"
								placeholder="— select —"
								required
								value={c.religion ?? ''}
								options={[
									...RELIGIONS.map((r) => ({ value: r, label: r })),
									...(c.religion && !RELIGIONS.includes(c.religion as (typeof RELIGIONS)[number])
										? [{ value: c.religion, label: c.religion }]
										: [])
								]}
							/>
						</span>
					{:else}
						<span class="fvalue">{c.religion || '—'}</span>
					{/if}
				</div>
				<div class="frow">
					<span class="flabel">Marital status</span>
					{#if editingProfile}
						<span class="fedit-gs">
							<GlassSelect
								name="maritalStatus"
								ariaLabel="Marital status"
								value={c.maritalStatus ?? ''}
								options={[
									{ value: '', label: '—' },
									{ value: 'single', label: 'Single' },
									{ value: 'married', label: 'Married' }
								]}
							/>
						</span>
					{:else}
						<span class="fvalue">{c.maritalStatus || '—'}</span>
					{/if}
				</div>
				</div>
				</div>
			</form>
			<div class="fgroup">
			<div class="group-title">UAN &amp; Aadhaar</div>
			<div class="fgrid">
			<div class="frow">
				<span class="flabel">UAN number</span>
				{#if EXP_LIKE_TRACKS.includes(c.track as Track)}
					<span class="fvalue">{c.uanNo || '—'}</span>
				{:else}
					<form method="POST" action="?/setUan" use:enhance={() => async ({ update }) => update({ reset: false })} class="uan-form">
						<fieldset class="rbac" disabled={!data.can.uan}>
							<input name="uanNo" value={form?.uanSaved ? form.uanNo : (c.uanNo ?? '')} placeholder="12 digits" class="uan-input" />
							<button class="btn ghost small">Save</button>
						</fieldset>
					</form>
					{#if form?.uanSaved}<span class="saved-chip">Saved ✓</span>{/if}
				{/if}
			</div>
			<div class="frow">
				<span class="flabel">Aadhaar number</span>
				<span class="fvalue mono">{form?.aadhaar ?? c.aadhaarMasked}</span>
				{#if !form?.aadhaar && c.aadhaarMasked !== '—'}
					<form method="POST" action="?/reveal" use:enhance style="display:inline">
						<button class="btn ghost small">Reveal</button>
					</form>
				{/if}
			</div>
			</div>
			</div>
			</div>
			<div class="lock-hint">
				<svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="4" y="10" width="16" height="11" rx="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" /></svg>
				Encrypted at rest. Every reveal is audit-logged.
			</div>
		</section>
	</div>

	<div class="tabpane" id="pane-offer" role="tabpanel" hidden={tab !== 'offer'}>
		<section class="card">
			<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">
				<div class="eyebrow">Offer letter</div>
				<div style="flex:1"></div>
				{#if uploaded}
					<span class="pill purple" title="A directly-uploaded letter replaces the generated one">
						Uploaded
					</span>
				{/if}
				{#if manualEditCount}
					<span class="pill gold" title="This letter's wording has been hand-edited">
						{manualEditCount} HAND-EDITED
					</span>
				{/if}
				{#if ol.status === 'sent'}
					<span class="pill teal">SENT{ol.sentAt ? ' · ' + new Date(ol.sentAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : ''}</span>
				{:else}
					<span class="pill">Draft</span>
				{/if}
			</div>
			{#if uploaded}
				<div class="du-banner">
					<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6"/></svg>
					<span>
						This candidate gets the uploaded letter <strong>{uploaded.filename}</strong>, not the one
						built from the fields below. Preview, Download and Send all serve it.
					</span>
				</div>
			{:else}
				<p class="muted" style="font-size:11.5px;margin:0 0 14px">
					Name, address and company are pulled in automatically. Fill in the rest, then download or send it as
					an attachment on {c.fullName || c.email}'s onboarding email.
				</p>
			{/if}
			{#if (form as { offerLetterError?: true; message?: string } | undefined)?.offerLetterError}
				<p class="error">{(form as { message: string }).message}</p>
			{/if}
			<form
				bind:this={offerForm}
				method="POST"
				action="?/saveOfferLetter"
				use:enhance={() => async ({ update }) => update({ reset: false })}
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
				<div class="offer-field">
					<span>Office location</span>
					<GlassSelect
						name="officeLocation"
						ariaLabel="Office location"
						bind:value={officeLocation}
						options={officeLocationOptions}
					/>
				</div>
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
				<!-- The same stored figure is rendered as a monthly stipend, annual CTC
				     or a monthly fee depending on the track — ask for the one this
				     candidate's letter will actually quote. Not shown at all with the
				     annexure on: the annexure's Total Yearly Cost to Company already
				     states it, and the form parse derives ctcAmount from those rows
				     (offer-letter/form.ts), so clause 1 still quotes the right figure
				     without anyone entering it twice. -->
				{#if !(showAnnexure && annexure.enabled)}
					<label class="offer-field">
						<span>{compField.label}</span>
						<input name="ctcAmount" value={ol.ctcAmount} placeholder={compField.placeholder} />
						<small>{compField.hint}</small>
					</label>
				{/if}
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
					<div class="offer-field">
						<span>Notice period {#if !isConsultantLetter}<em>(during probation)</em>{/if}</span>
						<GlassSelect
							name="noticePeriod"
							ariaLabel="Notice period"
							bind:value={noticePeriod}
							placeholder={isConsultantLetter ? '15 days' : '30 days'}
							options={noticePeriodOptions(noticePeriod)}
						/>
						<small>
							{#if isConsultantLetter}
								Clause 9. Defaults to 15 days if left blank.
							{:else}
								Clause 5, during probation. Defaults to 30 days if left blank.
							{/if}
						</small>
					</div>
				{/if}
				{#if c.track !== 'intern' && !isConsultantLetter}
					<div class="offer-field">
						<span>Notice period <em>(after confirmation)</em></span>
						<GlassSelect
							name="confirmedNoticePeriod"
							ariaLabel="Notice period after confirmation"
							bind:value={confirmedNoticePeriod}
							placeholder="60 days"
							options={noticePeriodOptions(confirmedNoticePeriod)}
						/>
						<small>Clause 5. Defaults to 60 days if left blank.</small>
					</div>
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
						<span>Expectation (clause 3)</span>
						<input name="weeklyExpectation" value={ol.weeklyExpectation ?? ''} placeholder="e.g. commit a minimum of 3 hours per day for 10 days" />
						<small>Printed as “You are expected to …”. Type what follows, or a full sentence starting with “You” — either reads correctly.</small>
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

									<div class="annexure-row annexure-gross">
										<span>Gross salary <em>(fills the rows below)</em></span>
										<input
											name="annexureGrossPm"
											type="text"
											inputmode="decimal"
											value={annexure.grossPm ?? ''}
											oninput={(e) => fillFromGross(e.currentTarget.value)}
											placeholder="e.g. 40000"
										/>
										<span class="annexure-pa">{money(n(annexure.grossPm ?? '') * 12)}</span>
									</div>
									<p class="annexure-gross-note">
										Basic is half the gross (min ₹15,000), HRA half of Basic (min ₹7,500), LTA ₹1,250;
										PF, gratuity, insurance and longevity follow. Any figure can still be edited.
									</p>
									{#if grossGap > 0}
										<p class="annexure-gross-left">
											₹{money(grossGap)} left to reach the gross —
											{uploaded
												? 'not checked while the uploaded letter is in use, but needed before the generated letter can be sent.'
												: 'total cash components must equal the gross before the letter can be saved.'}
											<button type="button" class="row-add" onclick={() => (annexure = balanceWithSpecialAllowances(annexure))}>
												Add as Special Allowances
											</button>
										</p>
									{:else if grossGap < 0}
										<p class="annexure-gross-warn">
											Cash components come to ₹{money(annexureCashPm)}, which is ₹{money(-grossGap)}
											more than the gross entered{n(annexure.grossPm ?? '') < GROSS_RULES.basicMinPm + GROSS_RULES.hraMinPm + GROSS_RULES.ltaPm
												? ' — this gross is below the minimum Basic, HRA and LTA'
												: ''}. {uploaded
													? 'Not checked while the uploaded letter is in use, but they must match before the generated letter can be sent.'
													: 'They must match before the letter can be saved.'}
											{#if canBalance}
												<button type="button" class="row-add" onclick={() => (annexure = balanceWithSpecialAllowances(annexure))}>
													Take it off Special Allowances
												</button>
											{/if}
										</p>
									{/if}

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
									<input type="hidden" name="annexureLtaEnabled" value={annexure.ltaEnabled === false ? 'off' : 'on'} />
									{#if annexure.ltaEnabled !== false}
										<div class="annexure-row">
											<span>LTA</span>
											<input name="annexureLtaPm" type="text" inputmode="decimal" bind:value={annexure.ltaPm} placeholder="0.00" />
											<span class="annexure-pa extra-pa">
												{money(n(annexure.ltaPm) * 12)}
												<button type="button" class="row-del" aria-label="Remove LTA from this offer" title="Remove LTA from this offer" onclick={() => setLta(false)}>×</button>
											</span>
										</div>
									{:else}
										<div class="annexure-row annexure-add">
											<button type="button" class="row-add" onclick={() => setLta(true)}>+ Add LTA back</button>
											<span></span><span></span>
										</div>
									{/if}
									<!-- Recruiter-added rows for this section. Repeated field names
									     rather than indexed ones, so removing a row in the middle needs
									     no renumbering (see extraRows in offer-letter/form.ts). -->
									{#each annexure.extraCash as row, i}
										<div class="annexure-row annexure-extra">
											<input
												name="extraCashLabel"
												bind:value={row.label}
												placeholder="e.g. Retention Bonus"
												maxlength="60"
											/>
											<input
												name="extraCashPm"
												type="text"
												inputmode="decimal"
												bind:value={row.pm}
												placeholder="0.00"
											/>
											<span class="annexure-pa extra-pa">
												{money(n(row.pm) * 12)}
												<button
													type="button"
													class="row-del"
													aria-label="Remove this component"
													onclick={() => (annexure.extraCash = annexure.extraCash.filter((_, j) => j !== i))}
												>×</button>
											</span>
										</div>
									{/each}
									<div class="annexure-row annexure-add">
										<button
											type="button"
											class="row-add"
											onclick={() => (annexure.extraCash = [...annexure.extraCash, { label: '', pm: '' }])}
										>+ Add component</button>
										<span></span><span></span>
									</div>
									<div class="annexure-row annexure-subtotal">
										<span>Total Cash Compensation (Before PF)</span>
										<span class="annexure-pa">{money(annexureCashPm)}</span>
										<span class="annexure-pa">{money(annexureCashPm * 12)}</span>
									</div>

									<div class="annexure-row">
										<div class="annexure-vp-cell">
											<label class="annexure-vp-toggle">
												<input type="checkbox" name="annexureVariablePayEnabled" bind:checked={annexure.variablePayEnabled} />
												<span>Variable Pay</span>
											</label>
											<!-- Printed in brackets after the name on page 4, so HR can say
											     what it is for: "Variable Pay (Quarterly sales target)". -->
											<input
												class="annexure-vp-reason"
												name="annexureVariablePayReason"
												bind:value={annexure.variablePayReason}
												placeholder="Reason, e.g. Quarterly target"
												maxlength="80"
												disabled={!annexure.variablePayEnabled}
												aria-label="Variable pay reason"
											/>
										</div>
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
									<!-- Recruiter-added rows for this section. Repeated field names
									     rather than indexed ones, so removing a row in the middle needs
									     no renumbering (see extraRows in offer-letter/form.ts). -->
									{#each annexure.extraVariable as row, i}
										<div class="annexure-row annexure-extra">
											<input
												name="extraVariableLabel"
												bind:value={row.label}
												placeholder="e.g. Quarterly Incentive"
												maxlength="60"
											/>
											<input
												name="extraVariablePm"
												type="text"
												inputmode="decimal"
												bind:value={row.pm}
												placeholder="0.00"
											/>
											<span class="annexure-pa extra-pa">
												{money(n(row.pm) * 12)}
												<button
													type="button"
													class="row-del"
													aria-label="Remove this component"
													onclick={() => (annexure.extraVariable = annexure.extraVariable.filter((_, j) => j !== i))}
												>×</button>
											</span>
										</div>
									{/each}
									<div class="annexure-row annexure-add">
										<button
											type="button"
											class="row-add"
											onclick={() => (annexure.extraVariable = [...annexure.extraVariable, { label: '', pm: '' }])}
										>+ Add component</button>
										<span></span><span></span>
									</div>
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
									<!-- Recruiter-added rows for this section. Repeated field names
									     rather than indexed ones, so removing a row in the middle needs
									     no renumbering (see extraRows in offer-letter/form.ts). -->
									{#each annexure.extraNonCash as row, i}
										<div class="annexure-row annexure-extra">
											<input
												name="extraNonCashLabel"
												bind:value={row.label}
												placeholder="e.g. Car Allowance"
												maxlength="60"
											/>
											<input
												name="extraNonCashPm"
												type="text"
												inputmode="decimal"
												bind:value={row.pm}
												placeholder="0.00"
											/>
											<span class="annexure-pa extra-pa">
												{money(n(row.pm) * 12)}
												<button
													type="button"
													class="row-del"
													aria-label="Remove this component"
													onclick={() => (annexure.extraNonCash = annexure.extraNonCash.filter((_, j) => j !== i))}
												>×</button>
											</span>
										</div>
									{/each}
									<div class="annexure-row annexure-add">
										<button
											type="button"
											class="row-add"
											onclick={() => (annexure.extraNonCash = [...annexure.extraNonCash, { label: '', pm: '' }])}
										>+ Add component</button>
										<span></span><span></span>
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

				{#if data.can.manual}
					<!-- The manual edits ride along as ordinary form fields, so Save
					     persists them and Preview renders them through exactly the same
					     parse as every other field on this form. Rendered only for a
					     super admin: for anyone else the server carries the saved edits
					     forward rather than reading them from the post. -->
					{#each Object.entries(manualEdits) as [key, text] (key)}
						<input type="hidden" name="manualEditKey" value={key} />
						<input type="hidden" name="manualEditText" value={text} />
					{/each}
					{#each manualAdditions as a (a.id)}
						<input type="hidden" name="manualAddId" value={a.id} />
						<input type="hidden" name="manualAddAfter" value={a.afterKey} />
						<input type="hidden" name="manualAddKind" value={a.kind} />
						<input type="hidden" name="manualAddMarker" value={a.marker} />
						<input type="hidden" name="manualAddText" value={a.text} />
					{/each}
				{/if}

				<div style="grid-column:1 / -1;display:flex;gap:10px;flex-wrap:wrap;align-items:center;margin-top:6px">
					<button class="btn small">Save</button>
					<button
						type="button"
						class="btn ghost small"
						onclick={previewOfferLetter}
						disabled={previewing}
					>
						{previewing ? 'Building preview…' : 'Preview'}
					</button>
					{#if data.can.upload && data.isApprover}
						<!-- Replacing the letter wholesale is given per person: Act on
						     "Direct upload of the offer letter" in the access studio. The
						     upload endpoint re-checks the same capability server-side. -->
						<button type="button" class="btn ghost small" onclick={openDirectUpload}>
							{uploaded ? 'Uploaded letter' : 'Direct upload'}
						</button>
					{/if}
					<a class="btn ghost small" href="/admin/candidates/{c.id}/offer-letter" download>Download PDF</a>
					{#if previewError}
						<span class="error" style="margin:0">{previewError}</span>
					{:else}
						<span class="muted" style="font-size:11px">Preview opens the letter as it reads right now, including unsaved edits.</span>
					{/if}
				</div>
				</fieldset>
			</form>
			{#if data.can.upload && !data.isApprover}
				<!-- The form above is read-only for this login, which would disable a
				     button inside it — but Direct upload was given to them on its own. -->
				<div style="margin-top:8px">
					<button type="button" class="btn ghost small" onclick={openDirectUpload}>
						{uploaded ? 'Uploaded letter' : 'Direct upload'}
					</button>
				</div>
			{/if}
			<!-- The letter reached the candidate but the portal did not record it —
			     the send failed after the mail went out, or it was sent by hand.
			     Without this the only ways to correct the status were to press Send,
			     which emails a duplicate to fix a bookkeeping error, or to edit the
			     database. Super admin only; the audit entry says it was set by hand. -->
			{#if data.can.markSent && ol.status !== 'sent'}
				<details class="mark-sent">
					<summary>Already sent outside the portal?</summary>
					<form
						method="POST"
						action="?/markOfferLetterSent"
						use:enhance
						onsubmit={(e) => {
							if (!confirm('Record this letter as sent? No email goes out.')) e.preventDefault();
						}}
					>
						<p class="muted" style="font-size:11px;margin:0 0 8px">
							Records it as sent without emailing anything. Give the date it actually went out if
							you know it.
						</p>
						<div class="mark-sent-row">
							<input type="datetime-local" name="sentAt" aria-label="When it was sent" />
							<button class="btn ghost small">Record as sent</button>
						</div>
					</form>
				</details>
			{/if}
			{#if form?.offerLetterMarkedSent}
				<p class="saved-chip" style="margin-top:8px">Recorded as sent ✓</p>
			{/if}

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
					<button class="btn teal">{ol.status === 'sent' ? 'Resend offer letter' : 'Send offer letter'}</button>
				</fieldset>
			</form>
			<!-- Sent is a fact about the record, not a reaction to the click that
			     sent it: the old chip came from `form` and vanished on the next
			     navigation, so anyone arriving later could not tell whether the
			     letter had gone out without opening the audit log. This reads the
			     draft's own status, so it is there every time the page is. -->
			{#if ol.status === 'sent'}
				<p class="sent-note">
					<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M4 12.5l5 5L20 6.5" /></svg>
					<span>
						Offer letter sent to <strong>{c.email}</strong>{ol.sentAt
							? ' on ' + new Date(ol.sentAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })
							: ''}.
						{#if form?.offerLetterSent}Just now.{:else}Sending again replaces it with a fresh copy.{/if}
					</span>
				</p>
			{/if}
		</section>
	</div>

	<div class="tabpane pane-2" id="pane-joining" role="tabpanel" hidden={tab !== 'joining'}>
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
				<form method="POST" action="?/setItMailFields" use:enhance={() => async ({ update }) => update({ reset: false })}>
					<fieldset class="rbac it-grid" disabled={!data.isApprover}>
						<div class="it-pair">
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
						</div>
						<div class="it-pair">
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
						</div>
						<div class="it-pair">
							<label class="it-label" for="it-entity">Payroll entity</label>
							<input
								id="it-entity"
								name="payrollEntity"
								value={itFields.payrollEntity}
								placeholder={data.companyName || 'Payroll entity'}
								class="emp-input"
								maxlength="120"
							/>
						</div>
						<div class="it-pair">
							<label class="it-label" for="it-mode">Mode</label>
							<GlassSelect
								id="it-mode"
								name="joiningMode"
								ariaLabel="Mode"
								bind:value={joiningMode}
								placeholder={TRACK_MODE[c.track] ?? 'Select…'}
								options={modeOptions}
							/>
						</div>
						<div class="it-pair">
							<label class="it-label" for="it-reqid">IT helpdesk request ID</label>
							<input
								id="it-reqid"
								name="itRequestId"
								value={itFields.itRequestId}
								placeholder="e.g. RE-22464"
								class="emp-input"
								maxlength="60"
							/>
							<p class="it-link-note">
								From the helpdesk's reply to the IT setup mail. The employee code mail replies into
								that thread; leave blank and it goes out without the request-ID prefix.
							</p>
						</div>
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
					bind:this={sendForms.it}
				>
					<fieldset class="rbac" disabled={!data.isApprover}>
						<button
							class="btn small ghost"
							style="width:100%"
							type="button"
							onclick={() => openItPreview('it')}
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
				{#if c.itSetupMailSentAt}
					{@render sentNote(
						'IT setup mail',
						c.itSetupMailSentAt,
						data.mailSends.it?.to ?? [],
						data.mailSends.it?.by ?? null,
						!!form?.itSetupMailSent,
						'Sending again mails the helpdesk a fresh copy.'
					)}
				{/if}
				<!-- The employee code mail. Same confirm-then-send flow, its own
				     builder and recipients. Gated on the code existing: a mail
				     announcing a code that has not been assigned is worse than none. -->
				<form
					method="POST"
					action="?/sendEmployeeCodeMail"
					use:enhance={() => {
						itSending = true;
						return async ({ update }) => {
							await update();
							itSending = false;
						};
					}}
					bind:this={sendForms.code}
					style="margin-top:9px"
				>
					<fieldset class="rbac" disabled={!data.isApprover}>
						<button
							class="btn small ghost"
							style="width:100%"
							type="button"
							onclick={() => openItPreview('code')}
							disabled={itPreviewLoading || !c.employeeId}
							title={c.employeeId ? '' : 'Assign the employee code first'}
						>
							<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 6 10-6"/></svg>
							{#if itPreviewLoading}
								Building preview…
							{:else}
								{c.employeeCodeMailSentAt
									? 'Review & resend employee code'
									: 'Review & send employee code'}
							{/if}
						</button>
					</fieldset>
				</form>
				{#if !c.employeeId}
					<p class="emp-hint" style="margin-top:4px">
						Assign the employee code above to enable this.
					</p>
				{/if}
				{#if c.employeeCodeMailSentAt}
					{@render sentNote(
						'Employee code mail',
						c.employeeCodeMailSentAt,
						data.mailSends.code?.to ?? [],
						data.mailSends.code?.by ?? null,
						!!form?.employeeCodeMailSent,
						'Sending again mails a fresh copy with the current code.'
					)}
				{/if}

				<div class="emp-hint">
					<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
					Sent manually when you're ready · recipients in
					<a href="/admin/settings" style="color:inherit;text-decoration:underline">settings</a>
				</div>
			</div>
		</section>

		<!-- Physical items and the welcome mail share the second column, so the
		     two-up grid keeps two columns of even height. -->
		<div class="pane-col">
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
									{item.requestCount > 1 ? `Asked ${item.requestCount}×, last on` : 'Asked the candidate on'}
									{new Date(item.requestedAt).toLocaleDateString('en-IN', {
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

			<!-- Welcome mail to the joiner's official mailbox. The official email is
			     set here once IT has created it — from then on it is also what the
			     Master Tracker and the export carry. -->
			<section class="card emp-card">
				<div class="eyebrow" style="margin-bottom:10px">Welcome mail</div>
				<form
					method="POST"
					action="?/setWelcomeFields"
					use:enhance={() => async ({ update }) => update({ reset: false })}
					class="it-fields-flat"
				>
					<fieldset class="rbac" disabled={!data.isApprover}>
						<label class="it-label" for="wm-official">Official email</label>
						<input
							id="wm-official"
							name="officialEmail"
							type="email"
							value={officialEmail}
							placeholder="e.g. firstname.l@championsmail.com"
							class="emp-input"
							maxlength="160"
						/>
						<p class="it-link-note">
							The mailbox IT created. Also fills the Master Tracker's Official E Mail column and the
							export.
						</p>
						<label class="it-label" for="wm-manager">Reporting manager's email</label>
						<input
							id="wm-manager"
							name="reportingManagerEmail"
							type="email"
							value={managerEmail}
							placeholder="optional — copied on the mail"
							class="emp-input"
							maxlength="160"
						/>
						<p class="it-link-note">
							Copied on the welcome mail{#if data.offerLetter.reportingManager}{' '}— the offer letter names
								<strong>{data.offerLetter.reportingManager}</strong>{/if}.
						</p>
						<button class="btn small teal" style="width:100%;margin-top:4px">Save</button>
					</fieldset>
				</form>
				{#if form?.welcomeFieldsSaved}
					<p class="saved-chip" style="margin-top:6px">Saved ✓</p>
				{:else if (form as { welcomeFieldsError?: true; message?: string } | undefined)?.welcomeFieldsError}
					<p class="it-preview-err">{(form as { message: string }).message}</p>
				{/if}

				<div class="it-mail">
					<div class="it-label">Attachments</div>
					<p class="it-link-note" style="margin-top:0">
						Shared by every welcome mail — replacing one here replaces it for all joiners from now on.
					</p>
					{#each data.welcomeAttachments as a (a.slot)}
						<div class="wa-row">
							<div class="wa-main">
								<span class="wa-label">{a.label}</span>
								{#if a.file}
									<a class="wa-file" href="/admin/welcome-attachments/{a.slot}" target="_blank" rel="noopener" title={a.file.filename}>
										{a.file.filename}
									</a>
									<span class="ref-meta">
										{prettySize(a.file.sizeBytes)} ·
										{new Date(a.file.uploadedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
									</span>
								{:else}
									<span class="wa-none">Not uploaded</span>
								{/if}
							</div>
							<fieldset class="rbac wa-actions" disabled={!data.isApprover || welcomeBusy !== null}>
								<label class="btn small ghost wa-pick">
									{welcomeBusy === a.slot ? 'Uploading…' : a.file ? 'Replace' : 'Upload'}
									<input
										type="file"
										accept=".pdf,.docx,.xlsx,.pptx,.jpg,.jpeg,.png"
										onchange={(e) => uploadWelcomeAttachment(a.slot, e.currentTarget)}
										hidden
									/>
								</label>
								{#if a.file}
									<button
										class="ref-del"
										type="button"
										aria-label={`Remove ${a.label}`}
										title="Remove"
										onclick={() => removeWelcomeAttachment(a.slot, a.label)}>×</button
									>
								{/if}
							</fieldset>
						</div>
					{/each}
					<small class="muted" style="font-size:10.5px">PDF, Word, Excel, PowerPoint, JPG or PNG · max 10 MB</small>
					{#if welcomeAttachError}<p class="it-preview-err">{welcomeAttachError}</p>{/if}
				</div>

				<div class="it-mail">
					<form
						method="POST"
						action="?/sendWelcomeMail"
						use:enhance={() => {
							itSending = true;
							return async ({ update }) => {
								await update();
								itSending = false;
							};
						}}
						bind:this={sendForms.welcome}
					>
						<fieldset class="rbac" disabled={!data.isApprover}>
							<button
								class="btn small ghost"
								style="width:100%"
								type="button"
								onclick={() => openItPreview('welcome')}
								disabled={itPreviewLoading || !officialEmail}
								title={officialEmail ? '' : 'Save the official email first'}
							>
								<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="2" y="4" width="20" height="16" rx="2"/><path d="m2 7 10 6 10-6"/></svg>
								{#if itPreviewLoading}
									Building preview…
								{:else}
									{c.welcomeMailSentAt ? 'Review & resend welcome mail' : 'Review & send welcome mail'}
								{/if}
							</button>
						</fieldset>
					</form>
					{#if !officialEmail}
						<p class="emp-hint" style="margin-top:4px">Save the official email above to enable this.</p>
					{/if}
					{#if c.welcomeMailSentAt}
						{@render sentNote(
							'Welcome mail',
							c.welcomeMailSentAt,
							data.mailSends.welcome?.to ?? [],
							data.mailSends.welcome?.by ?? null,
							!!form?.welcomeMailSent,
							'Sending again mails the joiner a fresh copy.'
						)}
					{/if}
					<div class="emp-hint">
						<svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
						Wording, Cc and sign-off in
						<a href="/admin/settings#welcome-mail" style="color:inherit;text-decoration:underline">settings</a>
					</div>
				</div>
			</section>
		</div>
	</div>
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
		background: linear-gradient(135deg, var(--ae-ember), var(--ae-violet));
		box-shadow: 0 0 20px rgba(var(--ae-ember-rgb), 0.3);
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
		background: rgba(var(--ae-amber-rgb), .08);
		border: 1px solid rgba(var(--ae-amber-rgb), .3);
		border-radius: 16px;
		padding: 14px 18px;
		margin-bottom: 20px;
		font-size: 13px;
		color: var(--ae-text-2);
	}
	/* The open tab runs at least as far down as the journey beside it, so
	   neither column ends early over bare page. */
	.cols {
		display: grid;
		grid-template-columns: 220px minmax(0, 1fr);
		gap: 18px;
		align-items: stretch;
	}
	.cols > .status-sidebar {
		align-self: start;
	}
	/* ── Tabs beside the journey ──────────────────────────────────────────
	   One section at a time, each laid out wide so it fits the window. */
	.cand-main {
		display: flex;
		flex-direction: column;
		gap: 14px;
		min-width: 0;
	}
	.ctabs {
		display: flex;
		gap: 4px;
		padding: 4px;
		border-radius: 14px;
		border: 1px solid var(--ae-line);
		background: var(--ae-sub-bg);
		align-self: flex-start;
		max-width: 100%;
		overflow-x: auto;
	}
	.ctab {
		display: inline-flex;
		align-items: center;
		gap: 8px;
		padding: 8px 16px;
		border: 1px solid transparent;
		border-radius: 10px;
		background: transparent;
		color: var(--ae-text-2);
		font: inherit;
		font-size: 13px;
		font-weight: 600;
		white-space: nowrap;
		cursor: pointer;
	}
	.ctab:hover {
		color: var(--ae-text);
	}
	.ctab.on {
		color: var(--ae-ember-glow);
		border-color: rgba(var(--ae-ember-rgb), 0.55);
		background: rgba(var(--ae-ember-rgb), 0.1);
	}
	.ctab-n {
		font-size: 10.5px;
		font-weight: 700;
		padding: 1px 7px;
		border-radius: 999px;
		color: var(--ae-muted);
		background: var(--ae-line);
	}
	.ctab-n.warn {
		color: var(--ae-crimson);
		background: rgba(var(--ae-crimson-rgb), 0.14);
	}
	.tabpane {
		flex: 1 0 auto;
	}
	#pane-details,
	#pane-offer {
		display: flex;
		flex-direction: column;
	}
	#pane-details > .card,
	#pane-offer > .card,
	.pane-docs > :last-child {
		flex: 1 0 auto;
	}
	.tabpane[hidden] {
		display: none !important;
	}
	/* A grid cell holding more than one card, stacked. */
	.pane-col {
		display: flex;
		flex-direction: column;
		gap: 18px;
		min-width: 0;
	}
	/* Two cards side by side that end on the same line. */
	.pane-2 {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		gap: 18px;
		align-items: stretch;
	}
	/* Documents: the list two-up across the full width, each slot (with any
	   upload form it has open) kept whole in one column; the cross-check and
	   HR's own uploads side by side under it. */
	.pane-docs {
		display: flex;
		flex-direction: column;
		gap: 18px;
	}
	.doc-list {
		columns: 2 360px;
		column-gap: 32px;
	}
	.docslot {
		break-inside: avoid;
	}
	/* Wide panes: details three-up, offer letter fields up to six across. */
	/* Details: whole groups flow into columns, one value per line inside
	   each, so no group leaves half a row empty. */
	#pane-details .fgroups {
		columns: 4 230px;
		column-gap: 32px;
	}
	#pane-details .fgroup {
		break-inside: avoid;
	}
	#pane-details .fgrid {
		grid-template-columns: minmax(0, 1fr);
	}
	#pane-details .group-title {
		margin-top: 0;
		padding-top: 12px;
	}
	#pane-details .frow {
		padding: 6px 0;
	}
	#pane-offer .offer-form {
		grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
	}
	.status-sidebar {
		display: flex;
		flex-direction: column;
		gap: 12px;
		position: sticky;
		top: 20px;
	}

	/* Journey tracker */
	.journey-card { padding: 14px 16px; }
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
		padding: 1px 0 10px;
		font-size: 12px;
		font-weight: 600;
		color: var(--ae-muted);
	}
	.journey-step.done .j-label  { color: var(--ae-text); }
	.journey-step.active .j-label { color: var(--ae-ember-glow); font-weight: 800; }
	.j-icon { font-size: 13px; line-height: 1.3; flex-shrink: 0; }

	/* Employee code widget */
	.emp-card { padding: 14px 16px; }
	.emp-id-display {
		display: flex;
		align-items: center;
		gap: 7px;
		font-family: ui-monospace, monospace;
		font-size: 14px;
		font-weight: 800;
		color: var(--ae-verdant);
		background: rgba(var(--ae-verdant-rgb), .08);
		border: 1.5px solid rgba(var(--ae-verdant-rgb), .3);
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
		/* Deeper and blurrier than a plain scrim: the dialog opens over the
		   densest part of the page (document list, extracted details), and at
		   0.55/4px that text stayed legible straight through the panel. */
		background: rgba(8, 9, 14, 0.72);
		backdrop-filter: blur(10px) saturate(120%);
		-webkit-backdrop-filter: blur(10px) saturate(120%);
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
		/* The card wash is 4-10% white — it works for a card sitting on the page
		   background, but a dialog floats over content and that much
		   transparency let the page read through it. The wash keeps the frosted
		   look; the base underneath makes it translucent rather than
		   see-through. */
		background: var(--ae-card-bg), var(--ae-modal-base, rgba(13, 16, 26, 0.94));
		border: 1px solid var(--ae-card-border);
		border-radius: var(--ae-card-radius);
		box-shadow: var(--ae-card-shadow);
		backdrop-filter: var(--ae-card-blur);
		-webkit-backdrop-filter: var(--ae-card-blur);
		padding: 22px;
		text-align: left;
	}
	/* Light theme needs a light base, or the panel goes near-black. */
	:global(.aegis[data-theme='light']) .it-modal {
		--ae-modal-base: rgba(252, 253, 255, 0.95);
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
		letter-spacing: 0;
		text-transform: none;
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
		letter-spacing: 0;
		text-transform: none;
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
		background: rgba(var(--ae-amber-rgb), 0.12);
		border: 1px solid rgba(var(--ae-amber-rgb), 0.35);
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
	/* ── Direct upload dialog ──────────────────────────────────────────────── */
	.du-banner {
		display: flex;
		align-items: flex-start;
		gap: 8px;
		margin: 0 0 14px;
		padding: 9px 11px;
		border: 1px solid rgba(var(--ae-azure-rgb), 0.3);
		background: rgba(var(--ae-azure-rgb), 0.1);
		border-radius: 9px;
		font-size: 11.5px;
		line-height: 1.5;
		color: var(--ae-text-2);
	}
	.du-banner svg {
		flex: none;
		margin-top: 1px;
		color: var(--ae-azure);
	}
	.du-modal {
		max-width: 940px;
	}
	.du-drop {
		display: flex;
		flex-direction: column;
		align-items: center;
		gap: 4px;
		padding: 28px 20px;
		border: 1.5px dashed var(--ae-line-strong);
		border-radius: 12px;
		cursor: pointer;
		color: var(--ae-muted);
		transition: border-color 0.12s ease, color 0.12s ease;
	}
	.du-drop:hover {
		border-color: var(--ae-verdant);
		color: var(--ae-text-2);
	}
	.du-drop input {
		display: none;
	}
	.du-drop-main {
		font-size: 13px;
		font-weight: 600;
		color: var(--ae-text-2);
	}
	.du-drop-sub {
		font-size: 11px;
	}
	.du-found {
		margin: 10px 0 8px;
		font-size: 11.5px;
		line-height: 1.5;
		color: var(--ae-verdant);
	}
	.du-found.du-notfound {
		color: var(--ae-amber);
	}
	.du-anchor {
		font-family: var(--ae-font-mono);
		font-size: 11px;
	}
	/* The page and its controls sit side by side, and stack on a narrow screen
	   so the page never gets squeezed to a thumbnail. */
	.du-body {
		flex: 1;
		display: flex;
		gap: 14px;
		min-height: 0;
		overflow-y: auto;
	}
	.du-stage {
		position: relative;
		flex: 1;
		min-width: 0;
		align-self: flex-start;
		border: 1px solid var(--ae-line-strong);
		border-radius: 8px;
		overflow: hidden;
		/* The page paints its own white; keep it that way so the letter reads as
		   paper rather than as part of the admin theme. */
		background: #fff;
		line-height: 0;
	}
	.du-canvas {
		display: block;
		width: 100%;
		height: auto;
	}
	.du-loading {
		position: absolute;
		inset: 0;
		display: grid;
		place-items: center;
		font-size: 11.5px;
		line-height: 1.4;
		color: var(--ae-muted);
		background: rgba(255, 255, 255, 0.72);
	}
	/* The draggable signature. Outlined only on hover/focus: it has to read as
	   part of the letter to be judged as part of the letter. */
	.du-sig {
		position: absolute;
		cursor: grab;
		touch-action: none;
		border: 1px dashed transparent;
		border-radius: 2px;
	}
	.du-sig:hover,
	.du-sig:focus-visible {
		border-color: var(--ae-verdant);
		outline: none;
	}
	.du-sig:active {
		cursor: grabbing;
	}
	.du-sig img {
		display: block;
		width: 100%;
		height: auto;
		pointer-events: none;
		user-select: none;
	}
	.du-side {
		flex: none;
		width: 190px;
		display: flex;
		flex-direction: column;
		gap: 10px;
	}
	.du-control {
		display: flex;
		flex-direction: column;
		gap: 3px;
		font-size: 11px;
		font-weight: 600;
		color: var(--ae-muted);
	}
	.du-control :global(.gs-trigger) {
		padding: 5px 8px;
		font-size: 12px;
	}
	.du-control input[type='range'] {
		width: 100%;
		font-family: inherit;
		font-size: 12px;
		color: var(--ae-text-2);
	}
	.du-check {
		display: flex;
		align-items: center;
		gap: 7px;
		font-size: 11.5px;
		color: var(--ae-text-2);
	}
	.du-hint,
	.du-coords {
		margin: -4px 0 0;
		font-size: 10.5px;
		color: var(--ae-muted);
	}
	.du-coords {
		font-family: var(--ae-font-mono);
		margin-top: 2px;
	}
	.du-side-actions {
		display: flex;
		flex-direction: column;
		align-items: flex-start;
		gap: 7px;
		margin-top: auto;
		padding-top: 10px;
		border-top: 1px solid var(--ae-line);
	}
	.du-replace {
		font-size: 11px;
		font-weight: 600;
		color: var(--ae-text-2);
		text-decoration: underline;
		text-underline-offset: 2px;
		cursor: pointer;
	}
	.du-replace input {
		display: none;
	}
	@media (max-width: 720px) {
		.du-body {
			flex-direction: column;
		}
		.du-side {
			width: auto;
		}
		.du-side-actions {
			flex-direction: row;
			flex-wrap: wrap;
			align-items: center;
			margin-top: 4px;
		}
	}

	/* ── Manual edits dialog ───────────────────────────────────────────────── */
	.me-modal {
		max-width: 860px;
	}
	.me-intro {
		margin: 0 0 12px;
		font-size: 12px;
		line-height: 1.55;
		color: var(--ae-muted);
	}
	.me-intro code {
		font-family: var(--ae-font-mono);
		font-size: 11px;
		padding: 1px 4px;
		border-radius: 4px;
		background: var(--ae-line);
	}
	/* The list is the dialog's body: it takes the room the header and footer
	   leave, and scrolls on its own so the actions stay reachable. */
	.me-list {
		flex: 1;
		overflow-y: auto;
		min-height: 180px;
		padding-right: 4px;
		display: flex;
		flex-direction: column;
		gap: 8px;
	}
	.me-page {
		position: sticky;
		top: 0;
		z-index: 1;
		margin-top: 6px;
		padding: 5px 0 4px;
		font-family: var(--ae-font-mono);
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0;
		text-transform: none;
		color: var(--ae-muted);
		background: var(--ae-modal-base, rgba(13, 16, 26, 0.94));
		border-bottom: 1px solid var(--ae-line);
	}
	.me-block {
		border: 1px solid var(--ae-line);
		border-radius: 9px;
		padding: 8px 10px 10px;
	}
	.me-block.me-edited {
		border-color: var(--ae-amber);
		background: color-mix(in srgb, var(--ae-amber) 7%, transparent);
	}
	.me-block.me-removed {
		opacity: 0.72;
	}
	.me-block-head {
		display: flex;
		align-items: center;
		gap: 7px;
		margin-bottom: 5px;
	}
	.me-kind {
		font-family: var(--ae-font-mono);
		font-size: 10px;
		font-weight: 600;
		letter-spacing: 0;
		text-transform: none;
		color: var(--ae-muted);
	}
	.me-badge {
		font-size: 9.5px;
		font-weight: 700;
		letter-spacing: 0;
		text-transform: none;
		padding: 1px 6px;
		border-radius: 999px;
		border: 1px solid var(--ae-amber);
		color: var(--ae-amber);
	}
	.me-badge-out {
		border-color: var(--ae-muted);
		color: var(--ae-muted);
	}
	.me-textarea {
		width: 100%;
		font-size: 12px;
		line-height: 1.5;
	}
	.me-removed-note {
		margin: 0;
		font-size: 11.5px;
		color: var(--ae-muted);
	}
	.me-orig {
		display: block;
		margin-top: 3px;
		text-decoration: line-through;
		opacity: 0.65;
	}
	.me-block.me-added {
		border-color: var(--ae-verdant);
		background: color-mix(in srgb, var(--ae-verdant) 7%, transparent);
	}
	.me-badge-new {
		border-color: var(--ae-verdant);
		color: var(--ae-verdant);
	}
	.me-kind-select {
		display: inline-block;
		width: 130px;
		font-size: 11px;
	}
	.me-kind-select :global(.gs-trigger) {
		padding: 2px 8px;
		border-radius: 6px;
	}
	.me-marker {
		font-family: inherit;
		font-size: 11px;
		padding: 2px 6px;
		border: 1px solid var(--ae-line-strong);
		border-radius: 6px;
		background: transparent;
		color: var(--ae-text-2);
	}
	.me-marker {
		width: 58px;
	}
	/* Sits between two blocks and stays quiet until hovered: there is one of
	   these after every block in the letter, so at full strength the list would
	   read as a column of buttons with the letter squeezed between them. */
	.me-add-here {
		align-self: flex-start;
		margin: -2px 0 0 2px;
		padding: 1px 0;
		background: none;
		border: 0;
		font: inherit;
		font-size: 10.5px;
		font-weight: 600;
		color: var(--ae-muted);
		opacity: 0.55;
		cursor: pointer;
		transition: opacity 0.12s ease, color 0.12s ease;
	}
	.me-add-here:hover,
	.me-add-here:focus-visible {
		opacity: 1;
		color: var(--ae-verdant);
	}
	.me-link {
		background: none;
		border: 0;
		padding: 0;
		font: inherit;
		font-size: 11px;
		font-weight: 600;
		color: var(--ae-text-2);
		text-decoration: underline;
		text-underline-offset: 2px;
		cursor: pointer;
	}
	.me-link:hover {
		color: var(--ae-text);
	}
	.me-link-danger {
		color: var(--ae-muted);
	}
	.me-foot {
		margin: 8px 0 0;
		font-size: 11px;
		color: var(--ae-muted);
	}
	@media (max-width: 560px) {
		.me-list {
			min-height: 140px;
		}
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

	/* These labels are long ("Review & resend employee code mail") and the card
	   column is narrow, so the text has to be allowed to wrap and the button to
	   grow with it — at a fixed height it spilled past the border. */
	.it-mail button,
	.it-mail form button {
		white-space: normal;
		height: auto;
		min-height: 30px;
		line-height: 1.35;
		padding-block: 7px;
		text-align: center;
	}

	/* HR's reference uploads. A grid so the name, size and remove control line
	   up down the list, with the optional note spanning underneath. */
	.ref-list {
		display: flex;
		flex-direction: column;
		gap: 2px;
		margin-bottom: 14px;
	}
	.ref-row {
		display: grid;
		grid-template-columns: 1fr auto auto;
		align-items: center;
		gap: 10px;
		padding: 7px 0;
		border-bottom: 1px solid var(--ae-line-soft);
	}
	.ref-name {
		display: flex;
		align-items: center;
		gap: 7px;
		font-size: 13px;
		font-weight: 600;
		color: inherit;
		text-decoration: none;
		min-width: 0;
	}
	.ref-name span {
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.ref-name:hover span {
		text-decoration: underline;
	}
	.ref-meta {
		font-size: 10.5px;
		color: var(--ae-text-2);
		white-space: nowrap;
	}
	.ref-del {
		border: 0;
		background: none;
		color: var(--ae-text-2);
		font-size: 16px;
		line-height: 1;
		padding: 0 2px;
		cursor: pointer;
	}
	.ref-del:hover {
		color: #b42318;
	}
	.ref-note {
		grid-column: 1 / -1;
		margin: 2px 0 0;
		font-size: 11.5px;
		color: var(--ae-text-2);
		line-height: 1.5;
	}
	.ref-add {
		display: flex;
		flex-direction: column;
		gap: 8px;
		border: 0;
		margin: 0;
		padding: 0;
	}
	.ref-add input[type='file'] {
		font-size: 11.5px;
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
	.it-fields .emp-input,
	.it-fields-flat .emp-input {
		width: 100%;
		margin-bottom: 8px;
	}
	/* IT mail fields two-up; the save button runs the full width. */
	fieldset.it-grid {
		display: grid;
		grid-template-columns: repeat(auto-fill, minmax(165px, 1fr));
		column-gap: 14px;
		align-items: start;
	}
	fieldset.it-grid > button {
		grid-column: 1 / -1;
	}

	/* Welcome mail attachments: the slot's name over what is stored in it, with
	   the upload/replace control and remove beside. */
	.wa-row {
		display: flex;
		align-items: center;
		gap: 8px;
		padding: 7px 0;
		border-bottom: 1px solid var(--ae-line-soft);
	}
	.wa-main {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 1px;
	}
	.wa-label {
		font-size: 12.5px;
		font-weight: 600;
	}
	.wa-file {
		font-size: 11.5px;
		color: inherit;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.wa-none {
		font-size: 11.5px;
		color: var(--ae-amber);
	}
	/* fieldset.rbac's `display: inherit` would otherwise win on specificity. */
	fieldset.rbac.wa-actions {
		display: flex;
		align-items: center;
		gap: 4px;
	}
	.wa-pick {
		cursor: pointer;
		white-space: nowrap;
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
		letter-spacing: 0;
		text-transform: none;
		color: var(--ae-muted);
		margin-bottom: 4px;
	}
	.move-preview {
		margin-top: 10px;
		padding: 10px;
		border: 1px solid rgba(var(--ae-amber-rgb), .3);
		background: rgba(var(--ae-amber-rgb), .08);
		border-radius: 10px;
	}
	.move-title {
		font-size: 12px;
		font-weight: 800;
		color: var(--ae-text);
		margin-bottom: 6px;
	}
	.move-notes {
		margin: 0 0 10px;
		padding-left: 16px;
		font-size: 11px;
		line-height: 1.45;
		color: var(--ae-text-2);
	}
	.move-notes li { margin-bottom: 4px; }
	.move-notes li.todo { color: var(--ae-text); font-weight: 600; }
	.move-notes li.loss { color: var(--ae-ember); }
	.move-group {
		font-size: 10px;
		font-weight: 800;
		letter-spacing: 0;
		text-transform: none;
		color: var(--ae-muted);
		margin: 8px 0 4px;
	}
	.move-group.loss { color: var(--ae-ember); }
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
		padding: 7px 0;
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
	.hr-upload {
		flex-wrap: wrap;
		align-items: center;
	}
	.hr-upload small {
		font-size: 10.5px;
	}
	.add-file {
		padding: 6px 0 8px 48px;
		border-bottom: 1px solid var(--ae-line-soft);
	}
	.group-title {
		font-weight: 800;
		font-size: 11px;
		letter-spacing: 0;
		text-transform: none;
		color: var(--ae-faint);
		margin: 14px 0 4px;
	}
	/* Extracted details two-up, so the card is half as tall. */
	.fgrid {
		display: grid;
		grid-template-columns: repeat(2, minmax(0, 1fr));
		column-gap: 28px;
	}
	@media (max-width: 700px) {
		.fgrid {
			grid-template-columns: minmax(0, 1fr);
		}
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
		/* A profile URL or a long address has no spaces to break at, so without
		   these it ignored max-width and ran out past the edge of the card.
		   min-width:0 lets the flex item shrink below its content; break-anywhere
		   gives the browser permission to break mid-token when there is no
		   kinder place to do it. */
		min-width: 0;
		overflow-wrap: anywhere;
		word-break: break-word;
	}
	.fedit-gs {
		width: 55%;
		font-size: 13px;
	}
	.fedit-gs :global(.gs-trigger) {
		padding: 6px 9px;
		border-radius: 7px;
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
		grid-template-columns: repeat(auto-fill, minmax(165px, 1fr));
		gap: 10px 12px;
	}
	/* The read-only gate's fieldset wraps every field: it spans the form and
	   carries the form's columns, or the fields all stack in its first cell. */
	.offer-form > fieldset.rbac {
		grid-column: 1 / -1;
		grid-template-columns: inherit;
	}
	.mark-sent {
		margin-top: 10px;
		font-size: 11.5px;
	}
	.mark-sent summary {
		cursor: pointer;
		color: var(--ae-muted);
		font-size: 11px;
	}
	.mark-sent summary:hover {
		color: var(--ae-text-2);
	}
	.mark-sent form {
		margin-top: 8px;
		padding: 10px 11px;
		border: 1px solid var(--ae-line-strong);
		border-radius: 9px;
	}
	.mark-sent-row {
		display: flex;
		gap: 8px;
		flex-wrap: wrap;
		align-items: center;
	}
	.mark-sent-row input {
		font-family: inherit;
		font-size: 12px;
		padding: 6px 8px;
		border: 1px solid var(--ae-line-strong);
		border-radius: 7px;
		background: transparent;
		color: var(--ae-text-2);
	}
	.sent-note {
		display: flex;
		align-items: flex-start;
		gap: 7px;
		margin: 10px 0 0;
		padding: 8px 11px;
		border: 1px solid rgba(var(--ae-verdant-rgb), 0.32);
		background: rgba(var(--ae-verdant-rgb), 0.08);
		border-radius: 9px;
		font-size: 11.5px;
		line-height: 1.5;
		color: var(--ae-text-2);
	}
	/* Addresses are one unbreakable word each, and the IT notes sit in the
	   narrow side column — without this they run out of the card. */
	.annexure-gross { background: rgba(var(--ae-ember-rgb), 0.07); border-radius: 8px; }
	.annexure-gross em { font-style: normal; color: var(--ae-muted); font-weight: 400; }
	.annexure-gross-note,
	.annexure-gross-left,
	.annexure-gross-warn {
		margin: 2px 0 8px;
		font-size: 11px;
		line-height: 1.5;
		color: var(--ae-muted);
	}
	.annexure-gross-left { color: var(--ae-text-2); }
	.annexure-gross-warn { color: var(--ae-amber); }
	.sent-note span {
		min-width: 0;
		overflow-wrap: anywhere;
	}
	.sent-note svg {
		flex: none;
		margin-top: 2px;
		color: var(--ae-verdant);
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
		background: rgba(var(--ae-ember-rgb), .08);
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
	.annexure-vp-cell {
		display: flex;
		flex-direction: column;
		gap: 5px;
		min-width: 0;
	}
	.annexure-vp-reason {
		width: 100%;
		font-size: 11.5px;
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
	.annexure-pa {
		text-align: right;
		font-variant-numeric: tabular-nums;
	}
	.annexure-head {
		font-weight: 700;
		background: rgba(255, 255, 255, 0.04);
		text-transform: none;
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
	/* Recruiter-added rows: a name field where a fixed row has a printed label,
	   and a small remove control tucked against its P.A. figure. */
	.annexure-extra input:first-child {
		font-weight: 600;
	}
	.extra-pa {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 8px;
	}
	.row-del {
		border: 0;
		background: none;
		color: var(--ae-text-2, #667085);
		font-size: 15px;
		line-height: 1;
		padding: 0 2px;
		cursor: pointer;
	}
	.row-del:hover {
		color: #b42318;
	}
	.annexure-add {
		padding-top: 2px;
		padding-bottom: 2px;
	}
	.row-add {
		border: 1px dashed var(--ae-line-strong, #ccc);
		background: none;
		color: inherit;
		border-radius: 6px;
		padding: 5px 12px;
		font: inherit;
		font-size: 11.5px;
		cursor: pointer;
	}
	.row-add:hover {
		border-style: solid;
	}

	.annexure-subtotal {
		font-weight: 700;
		background: rgba(255, 255, 255, 0.05);
	}
	.annexure-total {
		font-weight: 800;
		background: rgba(var(--ae-ember-rgb), 0.1);
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
		margin: 0 0 14px;
		background: rgba(var(--ae-verdant-rgb), 0.06);
		border: 1px solid rgba(var(--ae-verdant-rgb), 0.2);
		border-radius: 10px;
		padding: 10px 14px;
	}
	.linkcode {
		font-family: var(--ae-font-mono);
		font-size: 12.5px;
		background: var(--ae-sub-bg);
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
		letter-spacing: 0;
		text-transform: none;
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
	@media (max-width: 1500px) {
		.cols,
		.pane-2 {
			gap: 16px;
		}
		.cols {
			grid-template-columns: 200px minmax(0, 1fr);
		}
	}
	/* Below this two cards side by side would squeeze the documents list
	   until each name wraps over several lines, so they stack. */
	@media (max-width: 1100px) {
		.pane-2 {
			grid-template-columns: minmax(0, 1fr);
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
		background: linear-gradient(135deg, rgba(var(--ae-verdant-rgb), .08) 0%, rgba(var(--ae-verdant-rgb), .1) 100%);
		border: 1.5px solid rgba(var(--ae-verdant-rgb), .3);
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

	.decided-by {
		font-size: 11.5px;
		color: var(--ae-muted);
		white-space: nowrap;
	}
</style>
