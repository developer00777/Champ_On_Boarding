#!/bin/sh
# Run seed on every startup — idempotent, skips if admin already exists.
SEED_ADMIN_EMAIL="${SEED_ADMIN_EMAIL:-deep@championsmail.com}" \
SEED_ADMIN_PASSWORD="${SEED_ADMIN_PASSWORD:-champ-admin-2026}" \
node scripts/seed.mjs

exec node build/index.js
