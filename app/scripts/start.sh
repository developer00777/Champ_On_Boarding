#!/bin/sh
# Run seed — non-fatal so a DB blip never prevents the app from starting.
SEED_ADMIN_EMAIL="${SEED_ADMIN_EMAIL:-deep@championsmail.com}" \
SEED_ADMIN_PASSWORD="${SEED_ADMIN_PASSWORD:-champ-admin-2026}" \
node scripts/seed.mjs || echo "[start] seed failed (non-fatal), continuing..."

exec node build/index.js
