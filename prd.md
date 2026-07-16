# Candidate Onboarding Portal — PRD

| | |
|---|---|
| **Name** | ChampHR |
| **Organisation** | Champions Group |
| **Document** | PRD v3.0 — DigitalOcean revision (supersedes the Cloudflare draft v0.1 and Champ_HR_Portal v2.0) |
| **Date** | 12 June 2026 |
| **Status** | HR questions answered & locked (12 June 2026) — ready for implementation |
| **Owner** | Hemang Kashikar |
| **Stack** | SvelteKit (full-stack) on **DigitalOcean** · Spaces · Managed PostgreSQL · OpenRouter → Gemini Flash OCR |

A single-link, OCR-assisted portal that collects candidate documents and structured data in one pass. Built with **SvelteKit** (one app: candidate portal + admin dashboard) deployed on **DigitalOcean App Platform**, with **Gemini Flash doing OCR through OpenRouter**.

> **HR sign-off summary (12 June 2026):** document matrix is **final**; portal **tracks physical handover items**; v1 accepts **uploads of signed copies** (e-sign is v2); roles are **HR admin + Super admin**; retention is **permanent** (delete only on explicit request — see §9); **multi-company with shared branding**; link delivery via **both email and WhatsApp**.

---

## 1. Why we are building this

Today onboarding document collection is manual. HR sends a checklist, candidates email back a scatter of scans and photos, and someone keys the details (name, DOB, Aadhaar number, PAN, bank IFSC, addresses) into a master sheet by hand. That is slow, error-prone, and it puts sensitive identity documents into inboxes and chat threads with zero access control.

The portal collapses that into one flow: HR sends one link, the candidate uploads documents, OCR auto-fills every field it can read, the candidate fills the rest, and HR reviews a clean structured record in an admin dashboard. Documents and parsed data live in one access-controlled place instead of email.

### Problem statement

HR cannot reliably or quickly collect complete, verified onboarding paperwork from candidates. Manual transcription of ID documents into the master sheet is the bottleneck and the largest source of data-entry error and PII exposure.

### Goals

- One link per candidate. No account-creation friction for the candidate.
- Document upload with durable, access-controlled storage.
- OCR auto-fills master-sheet fields wherever the source document contains them.
- Candidate completes the rest. HR reviews and approves in an admin portal.
- Track physical handover items (photos, signed hard copies) to a single completion state.
- Eliminate ID documents living in email and chat.
- Ship a working MVP fast by keeping the app deliberately simple.

### Non-goals (MVP)

- Payroll / HRMS integration. Out of scope for v1.
- In-portal e-signature of NDA / Offer / BGC / BGV. **Decided: v1 accepts uploads of signed copies; e-sign is a v2 candidate.**
- Automated authenticity verification (no Aadhaar/PAN government API checks in v1).
- Multi-language candidate UI. English only for MVP (see §9).
- Per-company theming. **Decided: multiple group companies use the portal under one shared brand**; the company is a field on the candidate record, not a theme.
- Leave management (scoped in the earlier Champ_HR_Portal PRD) — parked entirely; this PRD covers the onboarding portal only.

### Success metrics

| Metric | Baseline (manual) | Target (v1) |
|---|---|---|
| Time from link sent to complete, reviewed record | Days | < 30 min candidate effort, same-day HR review |
| Fields auto-filled by OCR vs typed by hand | 0% | 70%+ of master-sheet fields |
| ID documents sitting in email/chat | Default | 0 |
| HR transcription time per candidate | 20–40 min | < 5 min (review only) |
| Onboardings approved with a missing mandatory item | — | 0 (system-enforced) |

---

## 2. Users and personas

| Persona | Who | Needs |
|---|---|---|
| **Candidate** | Intern, fresher, or experienced hire | Dead-simple mobile-first flow, no signup, clear instructions per document, fast |
| **HR admin** | HR team member | Generate links, track submissions, review parsed data vs the image, approve or request re-upload, tick off physical items, export the master sheet |
| **Super admin** | HR lead / Sreedeep | Everything HR admin can, plus manage HR accounts, see all candidates across companies, manage deletion requests |

**Decided:** two permission levels only — HR admin and Super admin. No finer roles in v1.

---

## 3. Candidate tracks and document matrix — FINAL

**HR has confirmed this matrix is complete and current.** The portal branches the checklist on the track chosen when HR generates the link.

| # | Document | Intern | Fresher | Exp. | OCR target? |
|---|---|:---:|:---:|:---:|---|
| 1 | Aadhaar Card (Front & Back) | ✅ | ✅ | ✅ | Yes: Aadhaar no., name, DOB, address |
| 2 | PAN Card | ✅ | ✅ | ✅ | Yes: PAN no., name, father's name |
| 3 | Bank Passbook / Cheque front | ✅ | ✅ | ✅ | Yes: bank, A/C, IFSC, branch |
| 4 | 10th Marks Sheet | ✅ | ✅ | ✅ | Partial: name, board, year |
| 5 | 12th Marks Sheet | ✅ | ✅ | ✅ | Partial |
| 6 | Degree Certificate | ✅ | ✅ | ✅ | Partial |
| 7 | Resume | ✅ | ✅ | ✅ | Optional: parse to summary |
| 8 | Test Results (IQ, GRIT, Growth Mindset screenshots) | ✅ | ✅ | ✅ | No (store only) |
| 9 | Last Internship Certificate | ✅ | – | – | No |
| 10 | Previous Employer Relieving Letter | – | – | ✅ | Partial |
| 11 | Last 3 Months Bank Statement | – | – | ✅ | No (store only) |
| 12 | Last 3 Months Payslips | – | – | ✅ | No (store only) |
| 13 | BGC Form (filled) | – | – | ✅ | No |
| 14 | BGV Form (filled) | – | – | ✅ | No |
| 15 | NDA Form (signed, scanned upload) | ✅ | ✅ | ✅ | No |
| 16 | Offer Letter (hard copy, signed) | ✅ | ✅ | ✅ | No — physical item |
| 17 | Passport-size photos — 4 physical + 1 soft copy | ✅ | ✅ | ✅ | No |

**Physical handover items — DECIDED: tracked in the portal.** The 4 physical photos and the hard-copy signed Offer Letter are modelled as a physical-item checklist on the candidate record. HR ticks each item (date + receiver) at handover; the candidate record reaches `complete` only when both the soft-copy review is approved **and** all physical items are received. The candidate portal shows these as a day-one reminder.

### Master data sheet (fields to capture)

From the *Master Sheet — Important Checkpoints* page. OCR pre-fills, candidate confirms or completes.

| Group | Fields | Source |
|---|---|---|
| Personal | Name (title case), DOB, Father name + mobile, Mother name + mobile + DOB, Spouse name + contact + DOB (if married) | Name/DOB/Father OCR from Aadhaar/PAN; rest typed |
| Address | Present + Permanent (full address, PIN, house no.) | OCR from Aadhaar, candidate confirms |
| Identification | Aadhaar no., PAN no., UAN (opt), DL (opt), Passport (opt) | Aadhaar/PAN OCR; rest typed |
| Bank (mandatory) | Bank name, Account no., IFSC, Branch | OCR from passbook/cheque |
| Company | Group company the candidate is joining | Set by HR at link generation |

### Validation rules (auto-enforced)

- Aadhaar: 12 digits, Verhoeff checksum · PAN: `[A-Z]{5}[0-9]{4}[A-Z]` · IFSC: `[A-Z]{4}0[A-Z0-9]{6}`
- PIN: 6 digits · Mobile: 10 digits starting 6–9 · Name: title case ("first letter capital only")
- DOB consistency: form vs Aadhaar vs PAN OCR values (flag, don't block)
- Checklist completeness per track before submit; physical items before `complete`

---

## 4. Core workflow

```
HR admin                          Candidate                      System
|-- pick track + company + email ->|                              |
|-- generate single link -------------------------------> create record + token
|-- send: email (auto) and/or      |                              |
|   WhatsApp (copy link) --------->|<- receives link ------------|
|                                  |-- opens link -------------->| validate token, show track checklist
|                                  |-- uploads Aadhaar --------->| store original in Spaces
|                                  |                             |-- OCR via OpenRouter (Gemini Flash)
|                                  |<- form auto-fills ----------|   parse -> JSON + transcript
|                                  |-- confirms / edits / adds ->| validate, save to Postgres
|                                  |-- submits ----------------->| status: submitted
|<- notified: ready for review --- |                              |
|-- review data vs image --------->|                              |
|-- approve / request re-upload -->|                              | approved / changes-requested
|-- tick physical items received ->|                              | complete (all soft + physical done)
|-- export master sheet ---------->|                              | CSV / XLSX
```

**Link delivery — DECIDED: both email and WhatsApp.** v1 sends the link by transactional email automatically and shows a one-click "Copy link / Share on WhatsApp" (`wa.me` deep link with prefilled message) for HR. WhatsApp Business API automation is a v2 candidate.

### OCR sub-flow

1. Candidate uploads a document. Original lands in **DigitalOcean Spaces** immediately (presigned PUT, §5).
2. The SvelteKit server route sends the image to **OpenRouter targeting Gemini 3 Flash** (or 3.1 Flash Lite for cost) with a structured prompt: extract fields as JSON, plus a clean plain-text transcript.
3. Model returns (a) structured field JSON mapped to master-sheet keys, (b) a transcript/summary of the document.
4. Server writes the fields into the record as **suggested values** (not yet confirmed), stores the transcript, pre-fills the form.
5. Candidate confirms or corrects each field. **Confirmed values are the source of truth. We never trust raw OCR as final.**

Gemini Flash is multimodal, so OCR + parse + transcript happen in one model call per document. No separate OCR engine.

---

## 5. Architecture (DigitalOcean + SvelteKit)

Everything runs on **DigitalOcean** plus one external AI call. One vendor for infra, one bill, standard primitives (Postgres + S3 API) with no proprietary bindings — the app is portable by construction.

```
                       ┌────────────────────────────────────────────────┐
                       │              DigitalOcean (region: BLR1)       │
                       │                                                │
 Candidate / HR ──────▶│  ┌──────────────────────────────────────────┐  │
   HTTPS               │  │ App Platform                             │  │
                       │  │  SvelteKit app (adapter-node, Node 22)   │  │
                       │  │  • /c/<token>  candidate portal (SSR)    │  │
                       │  │  • /admin      HR dashboard (SSR)        │  │
                       │  │  • /api/*      server routes             │  │
                       │  └───────┬──────────────────┬───────────────┘  │
                       │          │                  │                  │
                       │          ▼                  ▼                  │
                       │  ┌───────────────┐   ┌─────────────────────┐   │
                       │  │ Spaces (S3)   │   │ Managed PostgreSQL  │   │
                       │  │ documents     │   │ records, sessions,  │   │
                       │  │ private bucket│   │ tokens, audit log   │   │
                       │  └───────────────┘   └─────────────────────┘   │
                       └────────────────────────────────────────────────┘
                                  │ (server-side only)              │
                                  ▼                                 ▼
                       ┌────────────────────┐            ┌──────────────────┐
                       │ OpenRouter →       │            │ Resend (email)   │
                       │ Gemini 3 Flash OCR │            │ link delivery +  │
                       └────────────────────┘            │ notifications    │
                                                         └──────────────────┘
```

| Layer | Choice | Role |
|---|---|---|
| Frontend + backend (both portals) | **SvelteKit + `@sveltejs/adapter-node`** | Candidate portal + admin dashboard + all API routes in one app; SSR; form actions for the candidate flow |
| Hosting / compute | **DO App Platform** (basic instance, autodeploy from GitHub) | Runs the Node server; zero-ops TLS, health checks, rollbacks. Scale path: bigger instance or 2× instances behind DO's built-in LB |
| Object storage | **DO Spaces** (S3-compatible), private bucket `champ-onboard-docs`, region **blr1** (Bangalore — data stays in India) | Original document images/PDFs. Browser uploads via short-lived **presigned PUT** URLs; admin views via presigned GET (10-min expiry). CDN disabled — documents are private |
| Database | **DO Managed PostgreSQL** (basic 1 GB node to start) | Candidate records, parsed fields, statuses, physical items, link tokens, sessions, audit log. Daily automated backups + PITR |
| Sessions / tokens | **PostgreSQL tables** (no Redis at MVP) | Candidate upload tokens (hashed, expiring, single-candidate scope); HR admin sessions (httpOnly cookies). Managed Valkey/Redis only if session load ever justifies it |
| AI / OCR | **OpenRouter → Gemini 3 Flash / 3.1 Flash Lite** | Multimodal OCR + parse + transcript in one call; model id is config |
| Email | **Resend** (or SES) | Candidate link delivery, HR notifications. DO has no transactional-email product |
| WhatsApp delivery | `wa.me` share link (v1) → WhatsApp Business API (v2) | Second delivery channel, per HR decision |
| DNS / domain | DigitalOcean DNS (free) | Subdomain e.g. `onboard.<domain>` |
| Secrets | App Platform encrypted environment variables | OpenRouter key, Spaces keys, DB URL, session secret — never in the client bundle |
| CI/CD | GitHub → App Platform autodeploy (build on push to `main`) | Optionally a GitHub Action running checks before deploy |
| Network security | DO Cloud Firewall on the DB (App-Platform-only access), App Platform managed TLS/DDoS, app-level rate limiting on token + auth routes | No Cloudflare WAF — rate limiting moves into the app (SvelteKit hook) |

### What changes vs the Cloudflare draft

| Cloudflare draft | DigitalOcean build | Consequence |
|---|---|---|
| Workers + adapter-cloudflare | App Platform + **adapter-node** | Plain Node runtime — no Worker CPU-time limits, large PDF uploads are fine |
| R2 (zero egress) | **Spaces** ($5/mo incl. 250 GiB + 1 TiB transfer) | Egress is no longer free but the included 1 TiB dwarfs review traffic |
| D1 (SQLite) | **Managed PostgreSQL** | A real relational DB with backups/PITR; standard drivers (`postgres.js` + Drizzle) |
| KV tokens/sessions | **Postgres tables** | One less moving part; token lookup volume is trivial |
| Cloudflare Access for /admin | **Custom session auth** (email + password, argon2, httpOnly cookie, 2-role RBAC) | We own the auth code; rate-limited login, no SSO dependency |
| Wrangler secrets | App Platform env vars | Same hygiene, different console |
| Free tier ≈ $0 | ≈ **$22–32/mo** (§6) | Real but small fixed cost; in exchange: India region, standard primitives, no platform lock-in |

### Dual portal

| Portal | Path | Auth |
|---|---|---|
| Candidate | `onboard.<domain>/c/<token>` | Tokenised link, no login. Token hashed in Postgres, single-candidate scope, expiring (default 7 days), revocable |
| Admin | `onboard.<domain>/admin` | Email + password session auth (argon2, httpOnly secure cookie), roles `hr_admin` / `super_admin`, login rate-limited |

### Data model (PostgreSQL, first cut)

```sql
companies   ( id, name, active )                    -- group companies, shared branding

admins      ( id, email, password_hash, role,       -- 'hr_admin' | 'super_admin'
              status, created_at )

sessions    ( id, admin_id FK, token_hash, expires_at, created_at )

candidates  ( id, company_id FK, track,             -- 'intern' | 'fresher' | 'experienced'
              full_name, dob, gender, email, mobile,
              father_name, father_mobile,
              mother_name, mother_mobile, mother_dob,
              marital_status, spouse_name, spouse_contact, spouse_dob,
              present_address, present_pin, present_house_no,
              permanent_address, permanent_pin, permanent_house_no,
              aadhaar_no_encrypted, pan_no, uan_no, dl_no, passport_no,
              bank_name, account_no, ifsc, branch,
              status,                               -- created|opened|in_progress|submitted|
                                                    -- changes_requested|approved|complete|revoked
              created_by FK, created_at, submitted_at, reviewed_at, reviewed_by FK )

link_tokens ( id, candidate_id FK, token_hash, expires_at,
              opened_at, revoked, created_at )

documents   ( id, candidate_id FK, doc_type, spaces_key, mime, size_bytes,
              ocr_status,                           -- pending|parsed|unreadable|store_only
              ocr_json, ocr_transcript,
              confirmed,                            -- candidate confirmed OCR suggestions
              review_status,                        -- uploaded|flagged|accepted|reupload_requested
              uploaded_at )

physical_items ( id, candidate_id FK,
                 item_type,                         -- 'passport_photos_x4' | 'offer_letter_signed'
                 received, received_at, received_by FK, note )

audit_log   ( id, candidate_id FK NULL, actor, action, field,
              old_value, new_value, ip, at )        -- doubles as the DPDP processing log
```

### Design principles (binding for implementation)

The SvelteKit codebase keeps the SOLID discipline from the previous PRD, scaled to this app's size:

- **Single responsibility:** server logic lives in `src/lib/server/` modules — `tokens.ts`, `checklist.ts`, `ocr.ts`, `validation.ts`, `review.ts`, `audit.ts` — and `+server.ts`/form actions stay thin.
- **Open/closed:** the track → document matrix is **data** (a `DOC_MATRIX` config / DB seed), and each OCR-able document type registers an extraction schema in a registry. New track or document = new config entry, not new branches.
- **Substitutable providers:** `StorageProvider` (Spaces via S3 API — MinIO in dev), `OcrProvider` (OpenRouter — stub in dev/tests), `Mailer` (Resend — console in dev) are small interfaces injected at the edge; the whole flow runs locally with Docker Compose (Postgres + MinIO) and no external keys.
- **Validation rules** (§3) are pure, individually testable functions composed into one pipeline.

---

## 6. Technical viability, risks & cost

**Verdict: viable, low risk, well matched.** Every requested capability maps to a boring, first-party DigitalOcean primitive plus one external AI call.

| Requirement | Stack answer | Confidence |
|---|---|---|
| Single-link workflow | Hashed expiring tokens in Postgres + SvelteKit route guard | High |
| Document upload + image storage | Presigned PUT direct to Spaces (S3 API) | High |
| OCR auto-fill | OpenRouter → Gemini 3 Flash (multimodal, PDF + image native) | High |
| Manual completion | SvelteKit form actions + Postgres | High |
| Admin dashboard + dual portals | SvelteKit routes + session auth + RBAC | High |
| Backend processing | Node server on App Platform (no CPU-time ceilings) | High |
| DNS / TLS | DO DNS + App Platform managed certs | High |

### Known risks and mitigations

| Risk | Severity | Mitigation |
|---|---|---|
| OCR misreads Aadhaar/PAN/IFSC (wrong A/C = wrong salary) | High | Human-in-the-loop confirm. Checksum/regex validation. Parsed value shown beside the source image at review |
| Sensitive PII through a third-party model | High | §9: send minimum image, confirm OpenRouter/Gemini zero-data-retention routing in writing before real data; documented data flow; HR sign-off |
| Permanent retention vs DPDP erasure rights | Medium | Retention is permanent **by policy**, but the build ships a Super-admin "delete candidate + all objects + rows" action so erasure requests can be honoured (§9) |
| Large PDFs (statements, payslips) | Low | Store-only (no OCR); presigned direct-to-Spaces upload bypasses the app server entirely |
| SvelteKit learning curve on a deadline | Low/Med | Tight MVP scope; adapter-node is the most documented path; no platform-specific APIs to learn beyond S3 |
| Gemini "Flash Preview" model churn | Low | Pin a GA model (3.1 Flash Lite is GA); model id is config |
| App Platform single instance restart | Low | Stateless app — sessions/tokens in Postgres; App Platform health-checks and restarts automatically |

### Indicative cost (MVP, low volume)

| Item | Choice | Monthly |
|---|---|---|
| App Platform | basic (512 MB / 1 vCPU) | $5 |
| Managed PostgreSQL | basic 1 GB single node | $15 |
| Spaces | 250 GiB storage + 1 TiB outbound included | $5 |
| Resend | free tier (3k emails/mo) | $0 |
| OpenRouter (Gemini Flash) | ~$0.50/M input tokens; a few thousand tokens per document → fractions of a cent per candidate | < $1 |
| DO DNS, TLS, firewall | included | $0 |
| **Total** | | **≈ $25–26/mo** + cents of AI |

Scale path: bump App Platform to professional ($12+) and Postgres to 2 GB ($30) only when usage demands; Spaces absorbs years of documents at dozens of candidates/month (~15 docs × 5 MB ≈ 75 MB per candidate). Budget guardrail: DO billing alert at $40/mo; OpenRouter limit at $10/mo.

---

## 7. MVP scope

"Nothing too crazy, simple frontend and simple backend." Target a thin but end-to-end slice first.

### In scope for the MVP slice

- HR generates a single link for one track (start with **Fresher**), choosing the group company; link goes out by email + a WhatsApp share button.
- Candidate uploads Aadhaar + PAN + Bank proof (the three high-value OCR docs).
- OCR auto-fills: name, DOB, Aadhaar no., PAN no., father's name, bank/IFSC/branch/account.
- Candidate confirms/edits, fills the remaining master-sheet fields, uploads the other docs (store-only).
- Candidate submits.
- Admin dashboard: login, list candidates, open one, parsed fields beside images, approve / request re-upload.
- Physical-items checklist (photos ×4, signed offer letter) tick-off.
- Export master sheet to CSV.

### Deferred past the MVP slice

- All three tracks branching live (MVP demos one; the data model and matrix support all three from day one).
- In-portal e-signature (v2, per HR decision), WhatsApp Business API sending, notification emails on every state change.
- Resume parse-to-summary; light extraction on marksheets/certificates.
- Full DPDP consent-notice legal text (MVP ships a real consent checkbox + draft notice; final text needs legal review).

### Build sequence

1. Scaffold SvelteKit (adapter-node) + Drizzle + Postgres schema; Docker Compose dev stack (Postgres + MinIO); deploy hello-world to App Platform on `onboard.<domain>` — **de-risk the pipeline first**.
2. Link generation + tokenised candidate route + presigned Spaces upload.
3. OCR route: Spaces object → OpenRouter → suggested fields JSON → form pre-fill.
4. Candidate confirm/edit + validation pipeline + submit.
5. Admin: auth, list, detail (image beside fields), approve / request re-upload, physical items, CSV export.
6. Audit log on every mutation; demo polish.

---

## 8. Open questions — resolved with HR (12 June 2026)

| # | Question | **Answer** |
|---|---|---|
| 1 | Is the Section 3 document matrix complete and current for all three tracks? | **Yes — final.** Build to it |
| 2 | Track physical handover items, or soft copies only? | **Track in portal** (received date + receiver; gates `complete`) |
| 3 | In-portal e-signature in v1? | **No — upload of signed copy in v1**; e-sign is v2 |
| 4 | HR admin users / permission levels? | **Two levels: HR admin + Super admin** |
| 5 | Retention policy for Aadhaar/PAN/bank documents? | **Permanent retention** — no automatic deletion; Super admin can delete on explicit request (see §9 caveat) |
| 6 | Which companies use this — per-company branding? | **Multiple group companies, one shared brand**; company is a field on the candidate |
| 7 | Link delivery channel? | **Both email and WhatsApp** (v1: auto-email + WhatsApp share link) |

### Remaining for us (stack decisions)

- **OpenRouter ZDR:** confirm OpenRouter + Gemini zero-data-retention routing **in writing** before the first real Aadhaar flows. Fallback: call Gemini API directly with data-retention controls, or a self-hosted OCR path.
- Final domain/subdomain for `onboard.<domain>`.
- Default Gemini tier: 3 Flash (accuracy) vs 3.1 Flash Lite (cost) — ship configurable, benchmark on real samples during M2.
- Postgres: DO Managed basic node ($15) vs App Platform dev database ($7) for the first weeks — managed node recommended from day one (backups/PITR).

---

## 9. Compliance and security

This portal collects government IDs (Aadhaar, PAN, passport), financial data (bank account, payslips, statements), and family contacts. That is the most sensitive data the org handles. Compliance is a first-class requirement.

### Regulatory context: DPDP Act 2023 + DPDP Rules 2025

- The Digital Personal Data Protection Act, 2023 governs. The DPDP Rules, 2025 were notified 13 Nov 2025. Core consent/notice/rights obligations enforce from **13 May 2027**; consent-manager provisions from 13 Nov 2026. **Build to the standard now, do not retrofit.**
- The Act does not carve out a separate "sensitive personal data" class — all personal data is treated uniformly, so we hold IDs and financials at the highest bar regardless.
- **Purpose limitation on Aadhaar:** data collected for onboarding cannot be reused for another purpose (e.g. attendance) without fresh, separate consent.

### Retention — decided, with a caveat

HR's decision is **permanent retention** (employment records kept indefinitely). Implementation:

- No automatic purge job; documents and records persist in Spaces/Postgres.
- The build still ships a **Super-admin erasure action** ("delete candidate + all Spaces objects + DB rows", itself audit-logged), because the DPDP Act gives data principals a right to erasure where data is no longer necessary — permanent *default* retention does not remove the obligation to honour valid erasure requests. ⚠️ **Flag for legal review:** indefinite retention of rejected/withdrawn candidates' Aadhaar data is the weakest point of this policy; recommend legal confirms at least a purge rule for *non-joiners*.
- Processing (audit) logs kept a minimum of one year regardless.

### Consent and notice

- Candidate sees a clear, plain-language privacy notice **before** upload: what we collect, why, how long (permanent, per policy), who sees it, how to request deletion.
- Consent must be free, specific, informed, unconditional, affirmative action (an unticked checkbox the candidate actively ticks; timestamp + IP stored).
- Launch should provide the notice in English plus relevant scheduled language(s); MVP ships English with the real checkbox.

### Data handling matrix

| Control | Implementation |
|---|---|
| Encryption in transit | TLS everywhere (App Platform managed certs; DB connections over TLS) |
| Encryption at rest | Spaces and Managed PostgreSQL encrypt at rest by default; Aadhaar numbers additionally app-level encrypted (AES-256-GCM, key in App Platform env) |
| Access control | Candidate token scoped to one candidate, expiring, single-purpose, hashed at rest. Admin behind session auth + RBAC. **No public bucket** — Spaces objects served only via short-lived presigned URLs issued by the server after an RBAC check |
| Network | Managed Postgres firewalled to the App Platform app only; no public DB access |
| Least exposure to AI | Send only the specific image needed. Confirm OpenRouter/Gemini no-retention routing before real data flows. Document the path |
| Audit log | Every read-reveal/edit/approve/export/delete logged (actor, action, field, old/new, IP, time). Doubles as the DPDP processing log |
| Data-principal rights | Candidate can request access, correction, erasure via a contact path in the privacy notice; Super-admin erasure action executes it |
| PII in logs & UI | Never log raw Aadhaar/PAN/account numbers. Mask everywhere (last 4) except the candidate's explicit confirm step and the audit-logged HR reveal |

### Hard security rules for the build

- OpenRouter key and all secrets live in App Platform encrypted env vars — never in the client bundle or repo.
- No Spaces bucket is public. All access through presigned, expiring URLs issued server-side.
- Raw OCR is "suggested", never authoritative until a human confirms.
- Mask sensitive numbers on every UI surface except the explicit confirm step.
- Verify OpenRouter + Gemini data-retention terms **in writing** before the first real Aadhaar. If zero-retention cannot be confirmed, fall back to direct Gemini API with retention controls or an alternative OCR path.
- Login and token routes rate-limited in the SvelteKit hook; argon2 password hashing; httpOnly/secure/SameSite cookies.

---

## 10. Appendix: sources

- HR requirements: *Onboarding Required Documents* (3 tracks + master sheet + general instructions), supplied by HR — confirmed final 12 June 2026.
- Baseline document: *HR Onboarding Portal PRD* (Cloudflare draft v0.1, 2026-06-11) — this revision replaces its Cloudflare architecture with DigitalOcean per the deployment decision.
- HR open-questions sit-down: answered 12 June 2026 (see §8).
- Stack research: DigitalOcean App Platform / Spaces / Managed PostgreSQL pricing, SvelteKit `adapter-node`, OpenRouter Gemini 3 / 3.1 Flash model cards, India DPDP Act 2023 + DPDP Rules 2025.

*PRD v3.0 · 2026-06-12 · Prepared for Sreedeep Surapaneni, Champions Group. Next step: M1 of the build sequence (§7) — scaffold, dev stack, first deploy.*
