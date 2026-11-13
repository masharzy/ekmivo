#!/usr/bin/env bash
# Briofold: deploy AI payments v2 (branch ai-payments-v2) to the VPS.
#
#   sudo bash ai-payments-v2.sh <commit>            build, back up, migrate, switch the API, enable the flag
#   sudo bash ai-payments-v2.sh <commit> --flag-off same, but leave BRIOFOLD_AI_PAYMENTS_V2_ENABLED off
#   sudo bash ai-payments-v2.sh --rollback          put back the previous API image and settings
#
# Order of work, each step stops the script on failure:
#   1. checks: API healthy, Postgres reachable, enough disk
#   2. source at the exact commit, API binary built and its unit tests run in the pinned Go image
#   3. fresh dumps of all three databases, each verified readable
#   4. migrations (additive; the running API keeps working with them)
#   5. new image, API restarted, health watched for 30 s, logs scanned; automatic rollback of the API on failure
# Database rollback is never automatic: the migrations only add tables, columns and functions, and the dumps from
# step 3 are printed at the end.
set -euo pipefail
umask 077
cd /opt/briofold
exec 9>/opt/briofold/.ai-payments-v2.lock
flock -n 9 || { echo 'Another deploy is running.'; exit 1; }

compose=(docker compose --env-file briofold.env -f compose.json)
pg=briofold-postgres-1
state=/opt/briofold/ai-payments-v2
mkdir -p "$state" backups backup

health() { curl -fsS -o /dev/null --max-time 5 http://127.0.0.1:8080/healthz; }
wait_healthy() { for _ in $(seq 1 40); do health 2>/dev/null && return 0; sleep 1; done; return 1; }
psql_as() { # role db file
  docker exec -i -e PGOPTIONS="-c role=$1" "$pg" sh -c 'psql -q -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$0"' "$2" < "$3"
}
sql() { docker exec -i "$pg" sh -c 'psql -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$0" -c "$1"' "$1" "$2"; }

restore_api() {
  [ -f "$state/compose.before.json" ] || { echo 'No saved configuration to roll back to.'; return 1; }
  cp "$state/compose.before.json" compose.json
  "${compose[@]}" up -d --no-deps --force-recreate api
  if wait_healthy; then echo 'API rolled back to the previous image and settings; health OK.'
  else echo 'CRITICAL: rollback started but the API is not healthy. Check: docker logs briofold-api-1' >&2; return 1; fi
}

if [ "${1:-}" = "--rollback" ]; then restore_api; exit $?; fi

commit="${1:-}"
[[ "$commit" =~ ^[0-9a-f]{40}$ ]] || { echo 'Usage: sudo bash ai-payments-v2.sh <full 40-character commit> [--flag-off]'; exit 1; }
flag=true; [ "${2:-}" = "--flag-off" ] && flag=false

echo '== 1/5 checks'
health || { echo 'The API is not healthy now; not deploying on top of a broken service.'; exit 1; }
sql ekmivo 'select 1' >/dev/null
[ "$(df --output=avail -m /opt/briofold | tail -1)" -gt 3000 ] || { echo 'Less than 3 GB free disk.'; exit 1; }
cid=$("${compose[@]}" ps -q api); [ -n "$cid" ]
base_image=$(docker inspect -f '{{.Config.Image}}' "$cid")
echo "running image: $base_image"

echo '== 2/5 source and build'
repo=/opt/briofold/rename-release/src
[ -d "$repo/.git" ] || { echo "Git clone not found at $repo"; exit 1; }
git -c safe.directory='*' -C "$repo" fetch -q origin "+refs/heads/ai-payments-v2:refs/remotes/origin/ai-payments-v2"
git -c safe.directory='*' -C "$repo" cat-file -e "$commit^{commit}" || { echo 'That commit is not on the ai-payments-v2 branch.'; exit 1; }
src="$state/src-$commit"
if [ ! -d "$src" ]; then
  mkdir -p "$src"
  git -c safe.directory='*' -C "$repo" archive "$commit" backend infra/migrations | tar -x -C "$src"
fi
for f in 0247_briofold_order_payments 0248_briofold_ai_receipts_by_payer 0249_briofold_ai_payment_settle 0250_briofold_ai_payment_tool \
         0251_briofold_production_baseline 0252_briofold_ai_advance_rule_setting; do
  [ -s "$src/infra/migrations/$f.sql" ] || { echo "Missing migration $f"; exit 1; }
done
out="$state/out-$commit"; mkdir -p "$out"
docker run --rm -e CGO_ENABLED=0 -v "$src/backend":/src -v "$out":/out -v briofold-go-cache:/go -w /src golang:1.27.0-alpine \
  sh -c "go test ./internal/checkout -run 'TestAIToolPromptV2|TestAIPaymentsV2Flag' -count=1 && go build -trimpath -o /out/api ./cmd/api"
[ -s "$out/api" ] || { echo 'Build produced no binary.'; exit 1; }

echo '== 3/5 backups'
stamp=$(date -u +%Y%m%d-%H%M%S)
for db in ekmivo ekmivo_live_financial ekmivo_sandbox_financial; do
  f="backup/$db-pre-payments-v2-$stamp.dump"
  docker exec "$pg" sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$0"' "$db" > "$f"
  n=$(docker exec -i "$pg" pg_restore -l < "$f" | wc -l)
  [ -s "$f" ] && [ "$n" -gt 50 ] || { echo "Backup of $db is not usable; stopping before any change."; exit 1; }
  echo "backup ok: $f ($n objects)"
done

echo '== 4/5 migrations'
m="$src/infra/migrations"
psql_as ekmivo_owner ekmivo "$m/0247_briofold_order_payments.sql"
psql_as ekmivo_live_owner ekmivo_live_financial "$m/0248_briofold_ai_receipts_by_payer.sql"
psql_as ekmivo_sandbox_owner ekmivo_sandbox_financial "$m/0248_briofold_ai_receipts_by_payer.sql"
psql_as ekmivo_owner ekmivo "$m/0249_briofold_ai_payment_settle.sql"
psql_as ekmivo_owner ekmivo "$m/0250_briofold_ai_payment_tool.sql"
psql_as ekmivo_owner ekmivo "$m/0251_briofold_production_baseline.sql"
psql_as ekmivo_owner ekmivo "$m/0252_briofold_ai_advance_rule_setting.sql"
# Every order's paid amount must equal its ledger, and every verified AI order must be fully in the ledger.
bad=$(sql ekmivo "select count(*) from commerce_orders o where o.paid_minor<>(select coalesce(sum(p.amount_minor),0) from commerce_order_payments p where p.order_id=o.id and p.voided_at is null)")
[ "$bad" = "0" ] || { echo "Ledger check failed for $bad orders; the API was NOT changed."; exit 1; }
[ "$(sql ekmivo "select to_regprocedure('briofold_ai_payment_tool(uuid,uuid,integer,text,jsonb,jsonb)') is not null")" = "t" ]
[ "$(sql ekmivo_live_financial "select to_regprocedure('pg248_ai_receipts_by_payer(uuid,text,text,timestamptz)') is not null")" = "t" ]
echo 'migrations applied; ledger consistent'

echo '== 5/5 switch the API'
tag="briofold-api:payments-v2-${commit:0:8}"
printf 'FROM %s\nCOPY api /api\nLABEL org.opencontainers.image.revision=%s\n' "$base_image" "$commit" > "$out/Dockerfile"
docker build --pull=false -q -t "$tag" "$out" >/dev/null
cp -p compose.json "$state/compose.before.json"
cp -p compose.json "backups/compose-pre-payments-v2-$stamp.json"
trap 'echo "Deploy failed; restoring the previous API." >&2; restore_api; exit 1' ERR
TAG="$tag" FLAG="$flag" python3 - <<'PY'
import json,os,pathlib
p=pathlib.Path('compose.json');cfg=json.loads(p.read_text())
api=cfg['services']['api'];api['image']=os.environ['TAG']
env=api['environment']
if isinstance(env,list):
    env=[e for e in env if not e.startswith('BRIOFOLD_AI_PAYMENTS_V2_ENABLED=')]+['BRIOFOLD_AI_PAYMENTS_V2_ENABLED='+os.environ['FLAG']]
    api['environment']=env
else:
    env['BRIOFOLD_AI_PAYMENTS_V2_ENABLED']=os.environ['FLAG']
tmp=p.with_suffix('.payments.tmp');tmp.write_text(json.dumps(cfg,indent=2)+'\n');os.chmod(tmp,p.stat().st_mode&0o777);os.replace(tmp,p)
PY
"${compose[@]}" up -d --no-deps --force-recreate api
wait_healthy
new=$("${compose[@]}" ps -q api); started=$(docker inspect -f '{{.State.StartedAt}}' "$new")
for _ in 1 2 3 4 5 6; do sleep 5; health; done
[ "$(docker inspect -f '{{.State.StartedAt}}' "$new")" = "$started" ]   # it did not restart
errs=$(docker logs --since "$started" "$new" 2>&1 | grep -Eic 'panic|fatal|sqlstate=(42883|42P01|42501)' || true)
[ "$errs" = "0" ]
trap - ERR
echo
echo "DEPLOYED $tag  (payments v2 flag: $flag)"
echo "Backups: /opt/briofold/backup/*-pre-payments-v2-$stamp.dump"
echo 'To go back to the previous API:  sudo bash ai-payments-v2.sh --rollback'
