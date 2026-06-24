# ChampOnboard — Candidate Onboarding Portal

Single-link, OCR-assisted onboarding for Champions Group. One SvelteKit app serves both the
candidate portal (`/c/<token>`) and the HR admin dashboard (`/admin`). Documents go to
S3-compatible object storage, structured data to Postgres, OCR via OpenRouter → Gemini Flash.
See `prd.md` for the full product spec.

## Run the whole stack locally (dockerised)

```bash
# root .env must contain OPENROUTER_API_KEY and ENCRYPTION_KEY (openssl rand -hex 32)
docker compose up -d --build
```

That brings up Postgres (:5432), MinIO (:9000, console :9001 — `minioadmin`/`minioadmin`),
a one-shot migrate+seed job, and the app at **http://localhost:3000**.
Default admin email: `deep@championsmail.com`. Set the password via
`SEED_ADMIN_PASSWORD` (and optionally `SEED_ADMIN_EMAIL`) in the root `.env`
before first start — credentials are not stored in this repo.

MinIO stands in for DO Spaces locally — same S3 API, so storage code is identical in
dev and prod; only `S3_ENDPOINT` changes. With `RESEND_API_KEY` empty, outgoing email
(incl. candidate links) is printed to the app logs: `docker compose logs app | grep /c/`.

## Local development (hot reload)

```bash
docker compose up -d postgres minio createbucket
cd app
cp .env.example .env              # fill OPENROUTER_API_KEY + ENCRYPTION_KEY
npm install
export $(grep -v '^#' .env | xargs) && npm run db:push
npm run db:seed
npm run dev                       # http://localhost:5173
```

## Deploying to DigitalOcean

1. **Managed PostgreSQL** (basic 1 GB, region `blr1`). Restrict access to the App Platform app.
2. **Spaces** bucket `champ-onboard-docs` (region `blr1`, CDN off). Create a Spaces access key.
3. **App Platform**: create an app from this repo, source dir `app/`, using `.do/app.yaml` as a
   starting spec. Set the secret env vars (everything in `.env.example`); `S3_ENDPOINT` is
   `https://blr1.digitaloceanspaces.com`, `S3_FORCE_PATH_STYLE=false`.
4. Run once from a console (or locally against the prod DB):
   `npm run db:push && npm run db:seed`.
5. Point `onboard.<domain>` at the app (DO DNS) and set `PUBLIC_BASE_URL` + `ORIGIN` to it.

## Layout

```
app/src/lib/shared/matrix.ts      track → document matrix (data, not code) + physical items
app/src/lib/shared/validation.ts  Aadhaar/PAN/IFSC/PIN/mobile rules, title-case, master-sheet check
app/src/lib/server/               auth, tokens, storage (S3), ocr (OpenRouter), mailer, audit, checklist
app/src/routes/c/[token]/         candidate portal: consent → uploads (presigned) → form → submit
app/src/routes/admin/             HR dashboard: links, review, physical items, CSV export
app/scripts/seed.ts               idempotent seed (companies + super admin)
```

Security posture (PRD §9): Aadhaar AES-256-GCM encrypted at rest and masked in UI (reveal is
audit-logged); private bucket with 10-min presigned URLs only; OCR calls send
`provider.data_collection=deny`; every privileged action lands in `audit_log`.
