#!/usr/bin/env bash
# Switches the api service to the image built by build.sh, with auto-rollback.
# Run with: sudo bash deploy.sh
set -euo pipefail
cd /opt/briofold
stage=/opt/briofold/rename-release
[ -f "$stage/briofold-rename-api" ] || { echo "run build.sh first"; exit 1; }
compose=(docker compose --env-file /opt/briofold/briofold.env -f /opt/briofold/compose.json)
backup=$(mktemp /opt/briofold/backups/rename-compose.XXXXXX)
cp compose.json "$backup"
docker tag briofold-api:meta-preview briofold-api:pre-rename
docker build --pull=false -t briofold-api:rename-1 "$stage"
rollback() { cp "$backup" compose.json; "${compose[@]}" up -d --no-deps api; }
trap rollback ERR
python3 - <<'PY'
import json
c = json.load(open('compose.json')); c['services']['api']['image'] = 'briofold-api:rename-1'
json.dump(c, open('compose.json', 'w'), indent=2)
PY
"${compose[@]}" up -d --no-deps api
for i in {1..30}; do
  if curl -fsS http://127.0.0.1:8080/healthz | grep -q briofold-api; then echo 'HEALTHY briofold-api'; exit 0; fi
  sleep 1
done
trap - ERR
rollback
echo 'FAILED health check, rolled back to previous image'
exit 1
