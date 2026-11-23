#!/usr/bin/env bash
# Briofold: the one supported way to release the API and its database migrations on the VPS.
#
#   sudo bash release.sh <40-char commit> --dry-run     checks and plan only; changes nothing
#   sudo bash release.sh <40-char commit>               release
#   sudo bash release.sh --rollback                     put back the previous API image and settings
#
# Rules it enforces (docs/runbooks/vps-repo-stabilize.bn.md):
#   - the commit must be on origin/main
#   - production database functions must equal the recorded baseline before anything runs
#     (or the functions recorded after the last successful release on this server)
#     (deploy/vps/baseline/*.functions, taken from production 2026-11-14); any drift stops the release
#   - fresh, verified dumps of all three databases before any change
#   - migrations only through the repository coordinator (financial-migrate), which records them in the ledger
#   - with --expect-no-db-change (default for now) the functions after migrating must equal those before
#   - API switched only after the migrations, health watched, automatic API rollback on failure
# Database rollback is never automatic: restore from the dumps printed at the end.
set -euo pipefail
umask 077

root=/opt/briofold
repo=$root/rename-release/src
pg=briofold-postgres-1
state=$root/release
dbs=(ekmivo ekmivo_live_financial ekmivo_sandbox_financial)
go_image=golang:1.27.0-alpine

say() { printf '%s\n' "$*"; }
die() { printf 'STOP: %s\n' "$*" >&2; exit 1; }

cd "$root"
exec 9>"$root/.release.lock"
flock -n 9 || die 'another release is running'
compose=(docker compose --env-file briofold.env -f compose.json)
mkdir -p "$state" backup

health() { curl -fsS -o /dev/null --max-time 5 http://127.0.0.1:8080/healthz; }
wait_healthy() { for _ in $(seq 1 40); do health 2>/dev/null && return 0; sleep 1; done; return 1; }
sql() { docker exec -i "$pg" sh -c 'psql -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$0" -c "$1"' "$1" "$2"; }

fingerprints() { # db -> sorted name|args|md5, the same query as deploy/vps/inventory.sh
  sql "$1" "select p.proname||'|'||pg_get_function_identity_arguments(p.oid)||'|'||md5(pg_get_functiondef(p.oid)) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.prokind in ('f','p')" | LC_ALL=C sort
}

restore_api() {
  [ -f "$state/compose.before.json" ] || { say 'No saved configuration to roll back to.'; return 1; }
  cp "$state/compose.before.json" compose.json
  "${compose[@]}" up -d --no-deps --force-recreate api
  if wait_healthy; then say 'API rolled back to the previous image and settings; health OK.'
  else say 'CRITICAL: rollback started but the API is not healthy. Check: docker logs briofold-api-1' >&2; return 1; fi
}

if [ "${1:-}" = "--rollback" ]; then restore_api; exit $?; fi

commit="${1:-}"; shift || true
[[ "$commit" =~ ^[0-9a-f]{40}$ ]] || die 'usage: sudo bash release.sh <full 40-character commit> [--dry-run]'
dry=false; expect_same=true
for a in "$@"; do
  case "$a" in
    --dry-run) dry=true ;;
    --allow-db-change) expect_same=false ;;
    *) die "unknown option $a" ;;
  esac
done
$dry && say '*** DRY RUN: nothing will be changed ***'

say '== 1. checks'
health || die 'the API is not healthy now; not releasing on top of a broken service'
sql ekmivo 'select 1' >/dev/null || die 'Postgres is not reachable'
[ "$(df --output=avail -m "$root" | tail -1)" -gt 3000 ] || die 'less than 3 GB free disk'
cid=$("${compose[@]}" ps -q api); [ -n "$cid" ] || die 'API container not found'
base_image=$(docker inspect -f '{{.Config.Image}}' "$cid")
say "running image: $base_image ($(docker inspect -f '{{index .Config.Labels "org.opencontainers.image.revision"}}' "$cid"))"

say '== 2. commit'
[ -d "$repo/.git" ] || die "git clone not found at $repo"
g() { git -c safe.directory='*' -C "$repo" "$@"; }
g fetch -q origin '+refs/heads/main:refs/remotes/origin/main'
g cat-file -e "$commit^{commit}" 2>/dev/null || die 'that commit is not in the repository'
g merge-base --is-ancestor "$commit" origin/main || die 'that commit is not on main'
src="$state/src-$commit"
if [ ! -d "$src" ]; then
  mkdir -p "$src.tmp"
  g archive "$commit" backend infra/migrations deploy/vps/baseline | tar -x -C "$src.tmp"
  mv "$src.tmp" "$src"
fi
say "source: $src"

say '== 3. production database functions must equal the baseline'
mkdir -p "$state/check-$commit"
for db in "${dbs[@]}"; do
  fingerprints "$db" > "$state/check-$commit/$db.before"
  # Accepted: the baseline in the commit, or the functions this script recorded
  # after the last successful release on this server (owner 2026-11-23: no manual
  # baseline update after every database release). Anything else is drift.
  if cmp -s "$state/check-$commit/$db.before" "$src/deploy/vps/baseline/$db.functions"; then
    say "$db: $(wc -l < "$state/check-$commit/$db.before") functions equal the baseline"
  elif [ -f "$state/baseline/$db.functions" ] && cmp -s "$state/check-$commit/$db.before" "$state/baseline/$db.functions"; then
    say "$db: $(wc -l < "$state/check-$commit/$db.before") functions equal the state after the last release"
  else
    ref="$src/deploy/vps/baseline/$db.functions"; [ -f "$state/baseline/$db.functions" ] && ref="$state/baseline/$db.functions"
    diff "$ref" "$state/check-$commit/$db.before" | head -20 || true
    die "$db functions differ from the baseline (something changed outside a release). Nothing was changed."
  fi
done

say '== 4. build (pinned Go image, exact commit)'
out="$state/out-$commit"; mkdir -p "$out"
if [ ! -s "$out/api" ] || [ ! -s "$out/financial-migrate" ]; then
  docker run --rm -e CGO_ENABLED=0 -v "$src":/src:ro -v "$out":/out -v briofold-go-cache:/go -w /src/backend "$go_image" \
    sh -c 'go test ./cmd/financial-migrate -count=1 && go build -trimpath -o /out/api ./cmd/api && go build -trimpath -o /out/financial-migrate ./cmd/financial-migrate'
fi
[ -s "$out/api" ] && [ -s "$out/financial-migrate" ] || die 'build produced no binary'

# The coordinator connects as the Postgres superuser and switches to each database's owner role; the password is
# read inside the container and passed only through the environment.
migrate() { # extra env... ; runs the coordinator in the Postgres container's network namespace
  local pw; pw=$(docker exec "$pg" sh -c 'cat "$POSTGRES_PASSWORD_FILE"')
  local su; su=$(docker exec "$pg" sh -c 'printf %s "$POSTGRES_USER"')
  local base="postgresql://$su@127.0.0.1:5432"
  docker run --rm --network "container:$pg" -v "$out/financial-migrate":/financial-migrate:ro -v "$src/infra/migrations":/migrations:ro \
    -e PGPASSWORD="$pw" -e DASHBOARD_REFERENCE_ALLOW_MIGRATION=true -e DASHBOARD_REFERENCE_MIGRATION_DIR=/migrations "$@" \
    -e PG04_CONTROL_MIGRATION_DATABASE_URL="$base/ekmivo?sslmode=require&options=-c%20role%3Dekmivo_owner" \
    -e PG04_LIVE_MIGRATION_DATABASE_URL="$base/ekmivo_live_financial?sslmode=require&options=-c%20role%3Dekmivo_live_owner" \
    -e PG04_SANDBOX_MIGRATION_DATABASE_URL="$base/ekmivo_sandbox_financial?sslmode=require&options=-c%20role%3Dekmivo_sandbox_owner" \
    alpine:3.24 /financial-migrate
}

say '== 5. migration plan (read-only: checks ledger and checksums, applies nothing)'
migrate -e DASHBOARD_REFERENCE_PLAN_ONLY=true

if $dry; then
  say
  say 'DRY RUN finished: checks passed, plan printed above. Nothing was changed.'
  exit 0
fi

say '== 6. backups'
stamp=$(date -u +%Y%m%d-%H%M%S)
for db in "${dbs[@]}"; do
  f="backup/$db-pre-release-${commit:0:8}-$stamp.dump"
  docker exec "$pg" sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$0"' "$db" > "$f"
  n=$(docker exec -i "$pg" pg_restore -l < "$f" | wc -l)
  [ -s "$f" ] && [ "$n" -gt 50 ] || die "backup of $db is not usable; nothing was changed"
  say "backup ok: $f ($n objects)"
done

say '== 7. migrations'
migrate
for db in "${dbs[@]}"; do
  fingerprints "$db" > "$state/check-$commit/$db.after"
  if $expect_same && ! cmp -s "$state/check-$commit/$db.before" "$state/check-$commit/$db.after"; then
    diff "$state/check-$commit/$db.before" "$state/check-$commit/$db.after" | head -20 || true
    die "$db functions changed during a release marked as no database change. The API was NOT switched. Restore from backup/$db-pre-release-${commit:0:8}-$stamp.dump if needed."
  fi
done
say 'migrations recorded; functions as expected'

say '== 8. switch the API'
tag="briofold-api:release-${commit:0:8}"
printf 'FROM %s\nCOPY api /api\nLABEL org.opencontainers.image.revision=%s\n' "$base_image" "$commit" > "$out/Dockerfile"
docker build --pull=false -q -t "$tag" "$out" >/dev/null
cp -p compose.json "$state/compose.before.json"
cp -p compose.json "backups/compose-pre-release-${commit:0:8}-$stamp.json"
trap 'say "release failed; restoring the previous API." >&2; restore_api; exit 1' ERR
TAG="$tag" python3 - <<'PY'
import json, os, pathlib
p = pathlib.Path('compose.json'); cfg = json.loads(p.read_text())
cfg['services']['api']['image'] = os.environ['TAG']
tmp = p.with_suffix('.release.tmp'); tmp.write_text(json.dumps(cfg, indent=2) + '\n'); os.chmod(tmp, p.stat().st_mode & 0o777); os.replace(tmp, p)
PY
"${compose[@]}" up -d --no-deps --force-recreate api
wait_healthy
new=$("${compose[@]}" ps -q api); started=$(docker inspect -f '{{.State.StartedAt}}' "$new")
for _ in 1 2 3 4 5 6; do sleep 5; health; done
[ "$(docker inspect -f '{{.State.StartedAt}}' "$new")" = "$started" ]
errs=$(docker logs --since "$started" "$new" 2>&1 | grep -Eic 'panic|fatal|sqlstate=(42883|42P01|42501)' || true)
[ "$errs" = "0" ]
trap - ERR
mkdir -p "$state/baseline"
for db in "${dbs[@]}"; do cp "$state/check-$commit/$db.after" "$state/baseline/$db.functions"; done
say
say "RELEASED $tag (revision $commit)"
say "Backups: $root/backup/*-pre-release-${commit:0:8}-$stamp.dump"
say 'To go back to the previous API:  sudo bash release.sh --rollback'
