#!/usr/bin/env bash
# Keeps a localtunnel bound to the FIXED name champonboarding.loca.lt -> 127.0.0.1:8090.
# loca.lt sometimes hands back a random subdomain when the requested one is in a
# post-release cooldown. We refuse the random name (exit 1) so systemd restarts us
# and retries until we get exactly champonboarding.loca.lt.
set -u
PORT=8090
SUB=champonboarding
NODE=/home/hemang/.nvm/versions/node/v20.20.2/bin/node
LT=/home/hemang/.nvm/versions/node/v20.20.2/bin/lt
LOG=$(mktemp)

"$NODE" "$LT" --port "$PORT" --subdomain "$SUB" --local-host 127.0.0.1 >"$LOG" 2>&1 &
LTPID=$!

# Wait up to 20s for the "your url is:" line.
for _ in $(seq 1 20); do
  grep -q 'your url is:' "$LOG" && break
  kill -0 "$LTPID" 2>/dev/null || break
  sleep 1
done

URL=$(grep -oE 'https://[a-zA-Z0-9.-]+\.loca\.lt' "$LOG" | head -1)
cat "$LOG"
rm -f "$LOG"

if ! printf '%s' "$URL" | grep -q "https://$SUB.loca.lt"; then
  echo "champonboard-tunnel: got '${URL:-none}', wanted https://$SUB.loca.lt -> restarting"
  kill "$LTPID" 2>/dev/null
  exit 1
fi

echo "champonboard-tunnel: bound $URL"
# Stay attached; when lt drops, exit with its code so systemd restarts us.
wait "$LTPID"
exit $?
