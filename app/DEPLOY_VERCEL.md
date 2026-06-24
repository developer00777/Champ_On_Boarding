# Deploying ChampOnboard to Vercel

This is a **full-stack SvelteKit app** — the `src/routes/**/+server.ts` and
`+page.server.ts` files are the backend. The whole thing deploys to Vercel as one
project (static assets on the CDN + server routes as serverless functions). There is
no separate "frontend" to split out.

The repo is a monorepo. The deployable app lives in `app/`, so on Vercel you point the
project's **Root Directory** at `app`.

## How the build target is chosen

`vite.config.ts` switches adapters automatically:

- On Vercel (`VERCEL=1` is set during their build) → `@sveltejs/adapter-vercel`
  (serverless functions, `nodejs22.x`).
- Everywhere else (local dev, the Dockerised droplet) → `@sveltejs/adapter-node`
  (`build/index.js`).

`src/lib/server/db/index.ts` likewise detects `VERCEL` and uses a 1-connection,
no-prepared-statement pool suited to a transaction pooler (Neon pooled / Supabase
pgbouncer). One repo, both deploy paths — nothing to change to deploy.

## 1. Provision the backing services

Vercel can't run the droplet's local Postgres or MinIO (they're loopback-only). Use
hosted equivalents:

| Need            | Hosted option                                  | Env var(s)                          |
| --------------- | ---------------------------------------------- | ----------------------------------- |
| Postgres        | Neon, Supabase, or Vercel Postgres             | `DATABASE_URL` (use the **pooled** connection string) |
| S3-compatible   | AWS S3, DigitalOcean Spaces, Cloudflare R2     | `S3_*` (see below)                  |
| OCR             | OpenRouter                                     | `OPENROUTER_API_KEY`, `OPENROUTER_MODEL` |
| Email           | Resend (optional; empty → emails log)          | `RESEND_API_KEY`, `MAIL_FROM`       |

For S3 on a real cloud provider, set `S3_FORCE_PATH_STYLE=false` (MinIO needs `true`).
Make sure the bucket's CORS allows PUT/GET from your Vercel domain, since document
uploads are presigned and go browser → storage directly.

## 2. Import the project on Vercel

1. New Project → import `github.com/developer00777/Champ_On_Boarding`.
2. **Set Root Directory to `app`.** (Settings → General → Root Directory.)
3. Framework Preset: SvelteKit (auto-detected). Leave build/install commands default —
   `vite build` already emits the Vercel adapter output.

## 3. Set environment variables

In Project → Settings → Environment Variables, add every key from `.env.example`:

```
DATABASE_URL           # pooled Postgres connection string
OPENROUTER_API_KEY
OPENROUTER_MODEL       # e.g. google/gemini-3.5-flash
S3_ENDPOINT
S3_REGION
S3_BUCKET
S3_ACCESS_KEY
S3_SECRET_KEY
S3_FORCE_PATH_STYLE    # false for AWS S3 / DO Spaces / R2
ENCRYPTION_KEY         # 32-byte hex: openssl rand -hex 32
PUBLIC_BASE_URL        # your https://<project>.vercel.app (or custom domain)
RESEND_API_KEY         # optional
MAIL_FROM
```

Do **not** set `VERCEL` yourself — Vercel sets it during the build.

## 4. Run the database migration

The schema is managed by Drizzle. Vercel's build does not migrate the DB. From your
machine, pointed at the production database:

```sh
cd app
DATABASE_URL='<prod pooled url>' npm run db:push     # creates tables
DATABASE_URL='<prod url>' npm run db:seed            # seeds the admin user
```

Use the **direct** (non-pooled) connection string for `db:push`/`db:seed` if your
provider offers one — DDL and seeding behave better off the pooler.

## 5. Deploy

Push to the connected branch (or click Deploy). After it's live, update
`PUBLIC_BASE_URL` to the final domain and redeploy so candidate links and emails use it.

## Notes / gotchas

- **`@node-rs/argon2`** is a native module; it's marked `external` for the Vercel adapter
  in `vite.config.ts` and ships its prebuilt `.node` binaries, so password hashing works
  on `nodejs22.x`. If a future Vercel runtime change breaks it, swap to a WASM/pure-JS
  argon2 in `src/lib/server/auth.ts`.
- Presigned uploads must be same-origin-friendly: set bucket CORS, not an nginx unifier
  (that part of the droplet setup doesn't apply on Vercel).
- Serverless functions are stateless — there's no local disk; all documents live in S3.
