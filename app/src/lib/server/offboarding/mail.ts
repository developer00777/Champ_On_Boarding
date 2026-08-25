// Every email the offboarding flow sends, composed in one place.
//
// Four kinds, matching the SOP:
//   1. exit-forms invitation  → the employee's personal address, carries /x/<token>
//   2. clearance request      → one per approver, carries /x/clearance/<token>
//   3. IT access-revocation   → the "block the system access" table (SOP step 5)
//   4. handover               → the employee, ~30-45 days after LWD, carries /x/final/<token>
//
// Recipients for (3) are admin-configurable the same way the IT/VPN setup mail's
// are (see settings.ts): the desk that fields these changes without a deploy.
import { AppSetting } from '$lib/server/db/schema';
import { brandLogoUrl, escapeHtml, sendBrandedMail, sendMail, brandFromHeader } from '$lib/server/mailer';
import type { BrandTheme } from '$lib/shared/brands';
import type { MailAttachment } from '$lib/server/mailer';
import { CLEARANCE_DEPT_LABELS, type ClearanceDept } from '$lib/shared/offboarding';

// ── Settings ─────────────────────────────────────────────────────────────────

export interface ExitMailSettings {
	/** Recipients of the "block system access" mail (SOP step 5). */
	itTo: string[];
	itCc: string[];
	/** Copied on every exit-forms invitation and handover mail, so the HR desk
	 *  has a record even when an individual recruiter sent it. */
	hrCc: string[];
	signoffName: string;
	signoffDesignation: string;
}

export const EXIT_MAIL_KEY = 'exit_mail';

export const EXIT_MAIL_DEFAULTS: ExitMailSettings = {
	itTo: ['ithelpdesk@championsmail.com'],
	itCc: ['hrd.jst@championsmail.com'],
	hrCc: ['hrd.jst@championsmail.com'],
	signoffName: 'Bhavana setty',
	signoffDesignation: 'HR Coordinator'
};

export async function getExitMailSettings(): Promise<ExitMailSettings> {
	const row = await AppSetting.findOne({ key: EXIT_MAIL_KEY }).lean();
	const v = (row?.value ?? {}) as Partial<ExitMailSettings>;
	return {
		// A saved-but-empty To would send the mail nowhere, so it falls back to
		// the default just as an absent one does. Cc lists are legitimately
		// clearable — HR may want nobody copied.
		itTo: v.itTo?.length ? v.itTo : EXIT_MAIL_DEFAULTS.itTo,
		itCc: Array.isArray(v.itCc) ? v.itCc : EXIT_MAIL_DEFAULTS.itCc,
		hrCc: Array.isArray(v.hrCc) ? v.hrCc : EXIT_MAIL_DEFAULTS.hrCc,
		signoffName: v.signoffName?.trim() || EXIT_MAIL_DEFAULTS.signoffName,
		signoffDesignation: v.signoffDesignation?.trim() || EXIT_MAIL_DEFAULTS.signoffDesignation
	};
}

export async function saveExitMailSettings(value: ExitMailSettings, adminId: string) {
	await AppSetting.findOneAndUpdate(
		{ key: EXIT_MAIL_KEY },
		{ key: EXIT_MAIL_KEY, value, updatedBy: adminId },
		{ upsert: true }
	);
}

// ── Shared HTML shell ────────────────────────────────────────────────────────

interface ShellOpts {
	brand: BrandTheme;
	heading: string;
	intro: string[];
	/** Optional call-to-action button. */
	cta?: { label: string; url: string } | null;
	/** Raw HTML dropped between the intro and the sign-off (tables, lists). */
	bodyHtml?: string;
	/** Boxed aside under the CTA. */
	note?: { title: string; text: string } | null;
	signoffName: string;
	signoffDesignation: string;
	footer?: string;
}

function shell(o: ShellOpts): string {
	const { brand } = o;
	const logoBg = brand.logo.onDark ? brand.colors.ink : '#ffffff';
	const intro = o.intro
		.map((p) => `<p style="margin:0 0 14px;font-size:14.5px;line-height:1.7">${escapeHtml(p)}</p>`)
		.join('\n');
	const cta = o.cta
		? `<div style="margin:22px 0 6px">
			<a href="${o.cta.url}" style="display:inline-block;background:${brand.colors.primary};color:${brand.colors.onPrimary};
				text-decoration:none;padding:13px 26px;border-radius:${brand.buttonRadius}px;font-weight:700;font-size:14.5px">
				${escapeHtml(o.cta.label)}</a>
			<p style="margin:12px 0 0;font-size:12px;color:#667085;word-break:break-all">
				Or paste this link into your browser:<br>${escapeHtml(o.cta.url)}</p>
		</div>`
		: '';
	const note = o.note
		? `<div style="background:${brand.colors.primary}12;border-left:4px solid ${brand.colors.primary};
			border-radius:0 8px 8px 0;padding:13px 17px;margin:20px 0 4px">
			<p style="margin:0;font-size:13px;color:${brand.colors.ink};font-weight:700">${escapeHtml(o.note.title)}</p>
			<p style="margin:4px 0 0;font-size:12.5px;color:#475467;line-height:1.6">${escapeHtml(o.note.text)}</p>
		</div>`
		: '';

	return `<!doctype html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:24px;background:#f2f4f7;font-family:Arial,Helvetica,sans-serif;color:#101828">
	<div style="max-width:620px;margin:0 auto;background:#ffffff;border:1px solid #e4e7ec;border-radius:${brand.cardRadius}px;overflow:hidden">
		<div style="background:${logoBg};padding:18px 26px">
			<img src="${brandLogoUrl(brand)}" alt="${escapeHtml(brand.name)}" height="34" style="height:34px;width:auto;display:block" />
		</div>
		<div style="background:${brand.colors.primary};height:4px;font-size:0;line-height:0">&nbsp;</div>
		<div style="padding:26px">
			<h1 style="margin:0 0 16px;font-size:19px;font-weight:800;color:${brand.colors.ink};letter-spacing:-0.3px">
				${escapeHtml(o.heading)}</h1>
			${intro}
			${o.bodyHtml ?? ''}
			${cta}
			${note}
			<p style="margin:24px 0 4px;font-size:14.5px">Regards,</p>
			<p style="margin:0;font-size:14.5px;font-weight:700">${escapeHtml(o.signoffName)}</p>
			<p style="margin:0;font-size:13px;color:#475467">${escapeHtml(o.signoffDesignation)}</p>
			<p style="margin:2px 0 0;font-size:13px;color:#475467">${escapeHtml(brand.legalName)}</p>
		</div>
		<div style="background:${brand.colors.ink};padding:13px 26px;text-align:center">
			<p style="margin:0;font-size:11px;color:#aaa">${escapeHtml(
				o.footer ?? `Sent by ${brand.legalName}'s HR desk. Reply to this email and HR will see it.`
			)}</p>
		</div>
	</div>
</body>
</html>`;
}

function textBody(lines: string[], signoffName: string, signoffDesignation: string, legalName: string): string {
	return [...lines, '', 'Regards,', signoffName, signoffDesignation, legalName].join('\n');
}

// ── 1. Exit-forms invitation ─────────────────────────────────────────────────

export async function sendExitFormsMail(opts: {
	exitId: string;
	to: string;
	employeeName: string;
	lwd: string | null;
	brand: BrandTheme;
	url: string;
	/** Set when HR is re-requesting specific fields rather than inviting fresh. */
	changesRequested?: { field: string; note: string | null }[] | null;
}) {
	const s = await getExitMailSettings();
	const isRework = !!opts.changesRequested?.length;

	const intro = isRework
		? [
				`Hello ${opts.employeeName},`,
				'Thank you for submitting your exit documents. We need a few details corrected or completed before we can proceed.',
				'Please reopen your exit forms using the link below and update the items listed here:'
			]
		: [
				`Hello ${opts.employeeName},`,
				`We have received your resignation${opts.lwd ? ` and your last working day is confirmed as ${opts.lwd}` : ''}. ` +
					'To complete your exit formalities, please fill in your exit documents using the secure link below.',
				'You will be asked to complete the No Dues details, the Non-Disclosure & Non-Compete Agreement, the Exit ' +
					'Interview and the Relieving Formalities form, and to upload an image of your signature. Everything is ' +
					'saved as you go, so you can complete it in more than one sitting.'
			];

	const changeList = isRework
		? `<ul style="margin:0 0 14px;padding-left:20px;font-size:13.5px;color:#475467;line-height:1.7">${opts
				.changesRequested!.map(
					(c) => `<li><strong>${escapeHtml(prettyField(c.field))}</strong>${c.note ? ` — ${escapeHtml(c.note)}` : ''}</li>`
				)
				.join('')}</ul>`
		: '';

	const html = shell({
		brand: opts.brand,
		heading: isRework ? 'A few exit details need your attention' : 'Complete your exit formalities',
		intro,
		bodyHtml: changeList,
		cta: { label: isRework ? 'Update my exit forms' : 'Open my exit forms', url: opts.url },
		note: {
			title: 'Please complete this on or before your last working day',
			text:
				'The link is private to you — please do not forward it. Once you submit, our HR desk reviews your ' +
				'submission and will come back to you if anything else is needed.'
		},
		signoffName: s.signoffName,
		signoffDesignation: s.signoffDesignation
	});

	const text = textBody(
		[
			...intro,
			...(isRework
				? opts.changesRequested!.map((c) => `- ${prettyField(c.field)}${c.note ? `: ${c.note}` : ''}`)
				: []),
			'',
			`Open your exit forms: ${opts.url}`,
			'',
			'The link is private to you — please do not forward it.'
		],
		s.signoffName,
		s.signoffDesignation,
		opts.brand.legalName
	);

	await sendBrandedMail(
		opts.to,
		isRework
			? `Action needed: your exit documents — ${opts.brand.name}`
			: `Your exit formalities — ${opts.brand.name}`,
		text,
		opts.brand,
		undefined,
		'exit',
		undefined,
		{ cc: s.hrCc.length ? s.hrCc : undefined, tagPurpose: isRework ? 'exit_changes' : 'exit_forms', html }
	);
}

/** 'ndc.nameAsPerBank' → 'Name as per bank' — a dotted field path rendered for
 *  a human, so a re-request email names the field the way the form labels it. */
export function prettyField(path: string): string {
	const leaf = path.split('.').pop() ?? path;
	const spaced = leaf.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/^q\d+[a-z]?/i, '').trim();
	const label = spaced || leaf;
	return label.charAt(0).toUpperCase() + label.slice(1).toLowerCase();
}

// ── 2. Clearance request ─────────────────────────────────────────────────────

export async function sendClearanceMail(opts: {
	to: string;
	approverName: string | null;
	department: ClearanceDept;
	employeeName: string;
	employeeId: string;
	lwd: string | null;
	brand: BrandTheme;
	url: string;
	attachments?: MailAttachment[];
	reminder?: boolean;
}) {
	const s = await getExitMailSettings();
	const deptLabel = CLEARANCE_DEPT_LABELS[opts.department] ?? opts.department;

	const rows: [string, string][] = [
		['Employee Name', opts.employeeName],
		['Employee ID', opts.employeeId],
		['Last Working Day', opts.lwd ?? '—'],
		['Your clearance section', deptLabel]
	];
	const table = `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;margin:4px 0 6px">
		${rows
			.map(
				([k, v]) =>
					`<tr>
						<td style="border:1px solid #d0d5dd;padding:8px 10px;background:#f9fafb;font-size:12.5px;font-weight:700;width:40%">${escapeHtml(k)}</td>
						<td style="border:1px solid #d0d5dd;padding:8px 10px;font-size:13px">${escapeHtml(v)}</td>
					</tr>`
			)
			.join('')}
	</table>`;

	const intro = [
		`Hello${opts.approverName ? ` ${opts.approverName}` : ''},`,
		opts.reminder
			? `This is a reminder that the ${deptLabel} clearance for the exit below is still pending.`
			: `${opts.employeeName} is leaving the organisation and we need your departmental clearance to close their exit.`,
		'Please open the link below to review the items your section owns, mark each one as cleared or outstanding, ' +
			'add any remarks, and sign off. It takes a couple of minutes and needs no login.'
	];

	const html = shell({
		brand: opts.brand,
		heading: opts.reminder ? `Reminder: ${deptLabel} clearance pending` : `${deptLabel} clearance requested`,
		intro,
		bodyHtml: table,
		cta: { label: 'Review & sign clearance', url: opts.url },
		note: {
			title: 'What you are signing',
			text:
				'Your sign-off is recorded against the No Dues Certificate for this employee. A copy of the certificate ' +
				'as it currently stands is attached for reference.'
		},
		signoffName: s.signoffName,
		signoffDesignation: s.signoffDesignation
	});

	const text = textBody(
		[
			...intro,
			'',
			...rows.map(([k, v]) => `${k}: ${v}`),
			'',
			`Review & sign: ${opts.url}`
		],
		s.signoffName,
		s.signoffDesignation,
		opts.brand.legalName
	);

	await sendBrandedMail(
		opts.to,
		`${opts.reminder ? 'Reminder: ' : ''}Exit clearance needed — ${opts.employeeName} (${opts.employeeId})`,
		text,
		opts.brand,
		opts.attachments,
		'exit',
		undefined,
		{ tagPurpose: 'exit_clearance', html }
	);
}

// ── 3. IT access-revocation mail (SOP step 5) ────────────────────────────────

const IT_COLUMNS = ['Employee ID', 'Employee Name', 'LWD', 'Team'] as const;

/** Builds the "block the system access" mail exactly as the SOP writes it —
 *  the same four-column table IT already works from. Split build/send like
 *  it-setup-mail.ts so HR's preview and the actual send cannot drift. */
export async function buildItExitMail(opts: {
	brand: BrandTheme;
	employeeId: string;
	employeeName: string;
	lwd: string | null;
	team: string | null;
}) {
	const s = await getExitMailSettings();
	const cells = [opts.employeeId, opts.employeeName, opts.lwd ?? '', opts.team ?? ''];
	const border = '1px solid #d0d5dd';
	const th = IT_COLUMNS.map(
		(c) =>
			`<th style="border:${border};padding:7px 9px;background:${opts.brand.colors.ink};color:#fff;` +
			`font-size:11.5px;font-weight:700;text-align:left">${escapeHtml(c)}</th>`
	).join('');
	const td = cells
		.map(
			(v) =>
				`<td style="border:${border};padding:7px 9px;font-size:12.5px;color:#101828">${v ? escapeHtml(v) : '&nbsp;'}</td>`
		)
		.join('');
	const table = `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;table-layout:fixed">
		<tr>${th}</tr>
		<tr>${td}</tr>
	</table>`;

	const intro = [
		'Hello IT Team,',
		'Requesting you to block the system access for the below employee.'
	];

	const html = shell({
		brand: opts.brand,
		heading: 'Block system access — employee exit',
		intro,
		bodyHtml: `<div style="overflow-x:auto;margin:6px 0">${table}</div>`,
		note: {
			title: 'Kindly support and do the needful',
			text:
				'Please also confirm recovery of the IT assets issued to this employee — a separate clearance request ' +
				'has been sent for the No Dues Certificate.'
		},
		signoffName: s.signoffName,
		signoffDesignation: s.signoffDesignation
	});

	const text = textBody(
		[...intro, '', ...IT_COLUMNS.map((c, i) => `${c}: ${cells[i] || '—'}`), '', 'Kindly support and do the needful.'],
		s.signoffName,
		s.signoffDesignation,
		opts.brand.legalName
	);

	return {
		to: s.itTo,
		cc: s.itCc,
		subject: `Block system access — ${opts.employeeName} (${opts.employeeId})`,
		html,
		text,
		fields: IT_COLUMNS.map((label, i) => ({ label, value: cells[i] ?? '' })),
		missing: IT_COLUMNS.filter((_, i) => !cells[i]).map((c) => c)
	};
}

export async function sendItExitMail(opts: Parameters<typeof buildItExitMail>[0]) {
	const draft = await buildItExitMail(opts);
	await sendBrandedMail(
		draft.to,
		draft.subject,
		draft.text,
		opts.brand,
		undefined,
		'exit',
		undefined,
		{ cc: draft.cc.length ? draft.cc : undefined, tagPurpose: 'exit_it_block', html: draft.html }
	);
	return { to: draft.to, cc: draft.cc };
}

// ── 4. Final handover mail ───────────────────────────────────────────────────

export async function sendHandoverMail(opts: {
	to: string;
	employeeName: string;
	brand: BrandTheme;
	url: string;
	fnfAmount: string | null;
	fnfDate: string | null;
	documents: string[];
	attachments?: MailAttachment[];
}) {
	const s = await getExitMailSettings();

	const intro = [
		`Hello ${opts.employeeName},`,
		'Your full and final settlement and exit documentation are now complete. Thank you for your contribution to ' +
			'the organisation — we wish you every success ahead.',
		'You can view and download your closing documents from the secure link below.'
	];

	const summaryRows: [string, string][] = [];
	if (opts.fnfAmount) summaryRows.push(['Full & Final settlement', opts.fnfAmount]);
	if (opts.fnfDate) summaryRows.push(['Settlement date', opts.fnfDate]);
	const summary = summaryRows.length
		? `<table cellpadding="0" cellspacing="0" style="border-collapse:collapse;width:100%;margin:4px 0 14px">
			${summaryRows
				.map(
					([k, v]) =>
						`<tr>
							<td style="border:1px solid #d0d5dd;padding:8px 10px;background:#f9fafb;font-size:12.5px;font-weight:700;width:45%">${escapeHtml(k)}</td>
							<td style="border:1px solid #d0d5dd;padding:8px 10px;font-size:13px">${escapeHtml(v)}</td>
						</tr>`
				)
				.join('')}
		</table>`
		: '';

	const docList = opts.documents.length
		? `<p style="margin:0 0 6px;font-size:13.5px;font-weight:700;color:${opts.brand.colors.ink}">Available to download</p>
			<ul style="margin:0 0 14px;padding-left:20px;font-size:13.5px;color:#475467;line-height:1.75">
				${opts.documents.map((d) => `<li>${escapeHtml(d)}</li>`).join('')}
			</ul>`
		: '';

	const html = shell({
		brand: opts.brand,
		heading: 'Your exit documents are ready',
		intro,
		bodyHtml: summary + docList,
		cta: { label: 'View & download my documents', url: opts.url },
		note: {
			title: 'Keep this link',
			text:
				'The link stays valid for six months. Please download and save your documents — you may need them for ' +
				'your next employer or for tax filing.'
		},
		signoffName: s.signoffName,
		signoffDesignation: s.signoffDesignation
	});

	const text = textBody(
		[
			...intro,
			'',
			...summaryRows.map(([k, v]) => `${k}: ${v}`),
			...(opts.documents.length ? ['', 'Available to download:', ...opts.documents.map((d) => `- ${d}`)] : []),
			'',
			`View & download: ${opts.url}`
		],
		s.signoffName,
		s.signoffDesignation,
		opts.brand.legalName
	);

	await sendBrandedMail(
		opts.to,
		`Your exit documents & final settlement — ${opts.brand.name}`,
		text,
		opts.brand,
		opts.attachments,
		'exit',
		undefined,
		{ cc: s.hrCc.length ? s.hrCc : undefined, tagPurpose: 'exit_handover', html }
	);
}

// ── 5. Internal alerts ───────────────────────────────────────────────────────

/** Tells the HR desk an employee has submitted, or an approver has signed.
 *  Best-effort: callers must not let an alert failure roll back the event. */
export async function sendExitAlert(opts: {
	to: string[];
	subject: string;
	lines: string[];
	brand: BrandTheme;
	url: string;
}) {
	if (!opts.to.length) return;
	const s = await getExitMailSettings();
	const html = shell({
		brand: opts.brand,
		heading: opts.subject,
		intro: opts.lines,
		cta: { label: 'Open the exit record', url: opts.url },
		signoffName: s.signoffName,
		signoffDesignation: s.signoffDesignation,
		footer: 'Automated notification from the ChampHR offboarding workspace.'
	});
	await sendBrandedMail(
		opts.to,
		opts.subject,
		textBody([...opts.lines, '', opts.url], s.signoffName, s.signoffDesignation, opts.brand.legalName),
		opts.brand,
		undefined,
		'exit',
		undefined,
		{ tagPurpose: 'exit_alert', html }
	);
}
