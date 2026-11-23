#!/usr/bin/env bash
# Briofold: give the API its private object storage (Cloudflare R2) for payment
# receipt photos (owner decision 2026-11-22). Nothing else changes.
#
#   sudo bash set-r2.sh
#
# Reads /opt/briofold/r2.env (mode 600, never in git or chat):
#   R2_ACCOUNT_ID=<32 hex characters from the Cloudflare dashboard>
#   R2_BUCKET=briofold-private
#   R2_ACCESS_KEY_ID=<from the R2 API token>
#   R2_SECRET_ACCESS_KEY=<from the R2 API token>
# and sets PRIVATE_S3_ENDPOINT/REGION/BUCKET/ACCESS_KEY/SECRET_KEY on the API.
# The API is restarted and watched for 30 s; on any failure the previous settings are restored.
set -euo pipefail
umask 077
cd /opt/briofold
exec 9>/opt/briofold/.set-flag.lock
flock -n 9 || { echo 'Another settings change is running.'; exit 1; }
src=/opt/briofold/r2.env
[ -f "$src" ] || { echo "STOP: $src is missing"; exit 1; }
[ "$(stat -c %a "$src")" = 600 ] || { echo "STOP: run: sudo chmod 600 $src"; exit 1; }
compose=(docker compose --env-file briofold.env -f compose.json)
state=/opt/briofold/flags; mkdir -p "$state" backups
stamp=$(date -u +%Y%m%d-%H%M%S)
health() { curl -fsS -o /dev/null --max-time 5 http://127.0.0.1:8080/healthz; }
wait_healthy() { for _ in $(seq 1 40); do health 2>/dev/null && return 0; sleep 1; done; return 1; }
restore() {
  cp "$state/compose.before.json" compose.json
  "${compose[@]}" up -d --no-deps --force-recreate api
  if wait_healthy; then echo 'Previous settings restored; health OK.'
  else echo 'CRITICAL: restore started but the API is not healthy. Check: docker logs briofold-api-1' >&2; fi
}

health || { echo 'STOP: the API is not healthy now; nothing was changed.'; exit 1; }
cp -p compose.json "$state/compose.before.json"
cp -p compose.json "backups/compose-pre-r2-$stamp.json"
trap 'echo "Flag change failed at line $LINENO; restoring the previous settings." >&2; restore; exit 1' ERR
SRC="$src" python3 - <<'PY'
import json, os, pathlib, re
vals = {}
for line in pathlib.Path(os.environ['SRC']).read_text().splitlines():
    line = line.strip()
    if line and not line.startswith('#') and '=' in line:
        k, v = line.split('=', 1); vals[k.strip()] = v.strip().strip('"').strip("'")
need = ['R2_ACCOUNT_ID', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']
missing = [k for k in need if not vals.get(k)]
if missing: raise SystemExit('missing in r2.env: ' + ', '.join(missing))
if not re.fullmatch(r'[0-9a-f]{32}', vals['R2_ACCOUNT_ID']): raise SystemExit('R2_ACCOUNT_ID must be 32 hex characters')
if not re.fullmatch(r'[a-z0-9][a-z0-9-]{1,61}[a-z0-9]', vals['R2_BUCKET']): raise SystemExit('R2_BUCKET is not a valid bucket name')
new = {'PRIVATE_S3_ENDPOINT': 'https://' + vals['R2_ACCOUNT_ID'] + '.r2.cloudflarestorage.com',
       'PRIVATE_S3_REGION': 'auto', 'PRIVATE_S3_BUCKET': vals['R2_BUCKET'],
       'PRIVATE_S3_ACCESS_KEY': vals['R2_ACCESS_KEY_ID'], 'PRIVATE_S3_SECRET_KEY': vals['R2_SECRET_ACCESS_KEY']}
p = pathlib.Path('compose.json'); cfg = json.loads(p.read_text())
api = cfg['services']['api']; env = api.get('environment', {})
if isinstance(env, list):
    env = [e for e in env if e.split('=', 1)[0] not in new] + [k + '=' + v for k, v in new.items()]
else:
    env.update(new)
api['environment'] = env
tmp = p.with_suffix('.r2.tmp'); tmp.write_text(json.dumps(cfg, indent=2) + '\n'); os.chmod(tmp, p.stat().st_mode & 0o777); os.replace(tmp, p)
PY
"${compose[@]}" up -d --no-deps --force-recreate api
wait_healthy
new=$("${compose[@]}" ps -q api); started=$(docker inspect -f '{{.State.StartedAt}}' "$new")
for _ in 1 2 3 4 5 6; do sleep 5; health; done
[ "$(docker inspect -f '{{.State.StartedAt}}' "$new")" = "$started" ]
errs=$(docker logs --since "$started" "$new" 2>&1 | grep -Eic 'panic|fatal|sqlstate=(42883|42P01|42501)' || true)
[ "$errs" = "0" ]
docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$new" | grep -q '^PRIVATE_S3_REGION=auto$'
trap - ERR
echo "DONE: R2 storage settings are on the API (bucket and endpoint set; keys not printed). API healthy."
echo "Undo: restore $state/compose.before.json to compose.json and recreate the api."
