# ChampHR — Live Deployment (droplet 64.227.154.215)

Deployed 2026-06-12. Live, masked URL: **https://champonboarding.loca.lt**
Admin login: email `deep@championsmail.com`, password set via `SEED_ADMIN_PASSWORD` in the (gitignored) `.env` — not stored in this repo.

## How traffic flows (IP never exposed)

```
candidate browser ──HTTPS──> champonboarding.loca.lt   (localtunnel edge)
                                     │
                                     ▼  tunnel client (systemd)
                          127.0.0.1:8090  nginx front
                            ├── /champ-onboard-docs/* ─> 127.0.0.1:9000  MinIO (S3 docs)
                            └── /*                    ─> 127.0.0.1:3100  SvelteKit app
```

The app builds candidate links from `PUBLIC_BASE_URL` → every shared link is
`https://champonboarding.loca.lt/c/<token>`. Document upload/download use presigned
URLs against `S3_PUBLIC_ENDPOINT=https://champonboarding.loca.lt` (path-style), so
they are same-origin HTTPS — no mixed-content blocks, no server IP anywhere.

## Ports (all bound to 127.0.0.1 — nothing new exposed publicly; :80/:8080/:3003/:9090 untouched)

| Service        | Local bind        | Purpose                          |
|----------------|-------------------|----------------------------------|
| app (SvelteKit)| 127.0.0.1:3100    | candidate portal + admin         |
| MinIO S3       | 127.0.0.1:9000    | document storage (private)       |
| MinIO console  | 127.0.0.1:9001    | minioadmin / minioadmin          |
| Postgres       | 127.0.0.1:5433    | champ / champ / champonboard     |
| nginx front    | 127.0.0.1:8090    | unifies app + S3 for the tunnel  |

## Managed pieces

- **Docker stack** (`docker-compose.yml`, project `champonboard-dev`): postgres, minio,
  app — all `restart: unless-stopped`. `migrate` + `createbucket` are one-shot.
- **nginx** vhost `/etc/nginx/sites-available/champonboarding` (enabled). System nginx, starts on boot.
- **Tunnel**: `champonboarding-tunnel.service` (systemd, enabled). Runs `tunnel.sh`, which
  insists on the `champonboarding` subdomain and restarts until loca.lt grants it.

## Common ops

```bash
cd ~/Champ_On_Boarding
docker compose ps                       # stack status
docker compose logs -f app              # app logs (with RESEND_API_KEY empty, emails/links print here)
docker compose restart app              # restart app after .env change
docker compose up -d --build app        # rebuild after code pull

sudo systemctl status champonboarding-tunnel   # tunnel status / current URL
sudo journalctl -u champonboarding-tunnel -f   # watch tunnel (logs the bound URL)
sudo systemctl restart champonboarding-tunnel  # reconnect tunnel
```

## Config knobs (`.env` in repo root)

- `OPENROUTER_API_KEY` — set (OCR auto-fill of Aadhaar/PAN works). Model `google/gemini-3.5-flash`.
- `ENCRYPTION_KEY` — generated 32-byte hex (AES-256-GCM for Aadhaar at rest). **Do not rotate** or existing encrypted data is unreadable.
- `RESEND_API_KEY` — empty → onboarding emails are printed to `docker compose logs app`
  instead of sent. Add a Resend key + verified `MAIL_FROM` to actually email candidates.

## Caveats

- **loca.lt interstitial**: first-time browser visitors may see a localtunnel reminder page
  (it shows the tunnel's public IP and a "click to continue"). For a clean, permanent,
  no-interstitial URL, point a real domain (DNS A → 64.227.154.215) at nginx + Let's Encrypt.
- The tunnel depends on the loca.lt service being up; the systemd unit auto-reconnects on drop.
