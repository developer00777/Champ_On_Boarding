# Deploying ChampHR to Vercel

This is a **full-stack SvelteKit app** — the `src/routes/**/+server.ts` and
`+page.server.ts` files are the backend. The whole thing deploys as one project
(static assets on the CDN + server routes as serverless functions). There is no
separate "frontend" to split out.

The repo is a monorepo. The deployable app lives in `app/`, so on Vercel the
project's **Root Directory** must be `app`.

> Vercel and Railway both run this same app against the **same Railway-hosted
> MongoDB**. The app is stateless, so that is safe — but every env var below has
> to be set in both places, and the two must agree.

## How the build target is chosen

`vite.config.ts` picks the adapter — there is no `svelte.config.js` in this repo:

```js
const adapter = process.env.RAILWAY ? adapterNode() : adapterVercel();
```

- **Railway** builds via `app/Dockerfile`, which sets `ENV RAILWAY=true` →
  `@sveltejs/adapter-node` (`build/index.js`).
- **Vercel** (and any other build) → `@sveltejs/adapter-vercel`.

Note the switch is on `RAILWAY`, not `VERCEL`: anything that is not explicitly a
Railway build produces a Vercel-shaped build. Don't set `RAILWAY` on Vercel.

## 1. Import the project

1. New Project → import `github.com/developer00777/Champ_On_Boarding`.
2. **Set Root Directory to `app`** (Settings → General → Root Directory). Vercel
   then reads `app/vercel.json`; anything at the repo root is outside the build
   context and is ignored.
3. Framework Preset: SvelteKit (auto-detected). Leave build/install commands
   default — `vite build` already emits the Vercel adapter output.

## 2. Set environment variables

Settings → Environment Variables, for the **Production** environment. Take the
full list from `.env.example` — it is the source of truth and includes the
Twilio WhatsApp keys not repeated here. The ones that matter most:

```
MONGODB_URI            # the LITERAL connection string — see below
MONGODB_DB             # champonboard
REDIS_URL              # the LITERAL connection string — see below
OPENROUTER_API_KEY
OPENROUTER_MODEL       # google/gemini-3.5-flash
ENCRYPTION_KEY         # 32-byte hex: openssl rand -hex 32
PUBLIC_BASE_URL        # the host CANDIDATES use — see below
RESEND_API_KEY
MAIL_FROM
```

**`${{MongoDB.MONGO_URL}}` will not work here.** That is Railway template syntax
and only resolves inside Railway. On Vercel it is passed through as a literal
string and the app cannot connect. Copy the resolved value out of Railway's
MongoDB service (Connect → public URL, since Vercel is outside Railway's private
network) and paste that. Same for `REDIS_URL`.

**`ENCRYPTION_KEY` must be byte-identical to Railway's.** It decrypts stored
Aadhaar numbers; a different key on a deployment sharing the same database makes
those records unreadable on that deployment. To change it, use
`scripts/rotate-encryption-key.mjs` — swapping the variable alone strands the data.

Do **not** set `VERCEL` yourself — Vercel sets it during the build.

If env vars are missing, the Vercel runtime fails before the app starts and every
request 500s with `failed to load env vars: EnvFileReadError` — including
`/favicon.ico`. That error means the deployment has no env vars, not that the app
crashed.

## 3. PUBLIC_BASE_URL decides where candidates land

`PUBLIC_BASE_URL` builds the links in candidate onboarding emails and offer
letters (`lib/server/mailer.ts`, `lib/server/offer-letter/send.ts`). Whatever it
points at is where candidates go, regardless of which deployment sent the mail.

With two deployments live, set it to the **one host you want candidates on**, in
both Vercel and Railway. Pointing it at a broken or stale deployment sends every
candidate to a dead page.

## 4. Seed the database

The database is shared with Railway, so it is normally already seeded. A fresh
one needs:

```sh
cd app
MONGODB_URI='<prod uri>' npm run db:seed
```

Companies are also seeded on boot by `connectDb()` (`lib/server/db/index.ts`).
There is no migration step — Mongoose has no DDL.

## Notes / gotchas

- **Upload size.** `BODY_SIZE_LIMIT=150M` applies to the Node adapter (Railway).
  Vercel caps serverless request bodies at ~4.5MB, and a phone-camera Aadhaar scan
  is easily 3MB+. Large document uploads that succeed on Railway can fail on
  Vercel.
- **OCR latency.** A single Gemini Flash call on an Aadhaar image takes ~4–10s
  (`lib/server/ocr.ts`), and the upload route waits for it. Keep an eye on the
  function's max duration.
- **Document bytes live in GridFS**, inside MongoDB — not on disk and not in S3.
  Serverless statelessness is therefore fine, but every upload and download streams
  through the function.
- **`@node-rs/argon2`** is a native module used for password hashing
  (`lib/server/auth.ts`). It ships prebuilt binaries; if a future Vercel runtime
  breaks it, swap to a WASM/pure-JS argon2.
