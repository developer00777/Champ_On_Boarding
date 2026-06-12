# ChampOnboard — Candidate Onboarding Portal

Single-link, OCR-assisted onboarding for Champions Group. One SvelteKit app serves both the
candidate portal (`/c/<token>`) and the HR admin dashboard (`/admin`). Documents go to
S3-compatible object storage, structured data to Postgres, OCR via OpenRouter → Gemini Flash.
See `prd.md` for the full product spec.

## Local development

```bash
docker compose up -d              # Postgres :5432 + MinIO :9000 (console :9001)
cd app
cp .env.example .env              # fill OPENROUTER_API_KEY + ENCRYPTION_KEY (openssl rand -hex 32)
npm install
npm run db:push                   # apply schema (drizzle-kit push; needs DATABASE_URL exported)
npm run db:seed                   # creates company + super admin (prints the password once)
npm run dev                       # http://localhost:5173
```

Seed overrides: `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` env vars.

With `RESEND_API_KEY` empty, outgoing email (incl. candidate links) is printed to the console.

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
