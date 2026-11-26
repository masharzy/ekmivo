#!/usr/bin/env bash
# Briofold: turn one API feature flag on or off on the VPS. Nothing else changes (same image, same database).
#
#   sudo bash set-flag.sh BRIOFOLD_AI_PROMPT_FIX_ENABLED on
#   sudo bash set-flag.sh BRIOFOLD_AI_PROMPT_FIX_ENABLED off
#
# The API is restarted with the new value and watched for 30 s; on any failure the previous settings are restored.
set -euo pipefail
umask 077
cd /opt/briofold
exec 9>/opt/briofold/.set-flag.lock
flock -n 9 || { echo 'Another flag change is running.'; exit 1; }

allowed=(BRIOFOLD_AI_PROMPT_FIX_ENABLED BRIOFOLD_AI_SELLING_FIXES_ENABLED BRIOFOLD_SERVICE_STATUS_ENABLED BRIOFOLD_AI_FREE_CREDIT_ENABLED BRIOFOLD_AI_TOPUPS_ENABLED BRIOFOLD_ANY_RETURN_URL_ENABLED BRIOFOLD_OFFLINE_CHECKOUT_ENABLED BRIOFOLD_PAYMENT_PROOFS_ENABLED BRIOFOLD_NAGAD_MONEY_RECEIVED_ENABLED BRIOFOLD_SMS_FLEX_ENABLED BRIOFOLD_PAYMENT_GATEWAYS_ENABLED)
name=${1:-}; mode=${2:-}
ok=false; for a in "${allowed[@]}"; do [ "$name" = "$a" ] && ok=true; done
$ok || { echo "usage: sudo bash set-flag.sh <flag> on|off   (flags: ${allowed[*]})"; exit 1; }
case "$mode" in on) value=true ;; off) value=false ;; *) echo 'second argument must be on or off'; exit 1 ;; esac

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
cp -p compose.json "backups/compose-pre-flag-$name-$stamp.json"
trap 'echo "Flag change failed at line $LINENO; restoring the previous settings." >&2; restore; exit 1' ERR
NAME="$name" VALUE="$value" python3 - <<'PY'
import json, os, pathlib
p = pathlib.Path('compose.json'); cfg = json.loads(p.read_text())
api = cfg['services']['api']; env = api.get('environment', {})
n, v = os.environ['NAME'], os.environ['VALUE']
if isinstance(env, list):
    api['environment'] = [e for e in env if not e.startswith(n + '=')] + [n + '=' + v]
else:
    env[n] = v; api['environment'] = env
tmp = p.with_suffix('.flag.tmp'); tmp.write_text(json.dumps(cfg, indent=2) + '\n'); os.chmod(tmp, p.stat().st_mode & 0o777); os.replace(tmp, p)
PY
"${compose[@]}" up -d --no-deps --force-recreate api
wait_healthy
new=$("${compose[@]}" ps -q api); started=$(docker inspect -f '{{.State.StartedAt}}' "$new")
for _ in 1 2 3 4 5 6; do sleep 5; health; done
[ "$(docker inspect -f '{{.State.StartedAt}}' "$new")" = "$started" ]
errs=$(docker logs --since "$started" "$new" 2>&1 | grep -Eic 'panic|fatal|sqlstate=(42883|42P01|42501)' || true)
[ "$errs" = "0" ]
# The API image has no shell tools; read the value from the container configuration instead.
docker inspect -f '{{range .Config.Env}}{{println .}}{{end}}' "$new" | grep -qx "$name=$value"
trap - ERR
echo "DONE: $name=$value, API healthy. Undo: sudo bash set-flag.sh $name $([ "$value" = true ] && echo off || echo on)"
