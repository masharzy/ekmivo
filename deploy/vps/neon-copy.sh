#!/usr/bin/env bash
# Copy the three production databases from the VPS into the Neon project
# "Briofold VPS copy" (owner request 2026-11-23), so they can be inspected and
# checked without touching production.
#
# Production is only READ (pg_dump). Nothing on the VPS database changes.
# Each Neon database is restored as <name>__next and swapped in at the end, so
# the copy is never half-filled. Run it again any time to refresh.
#
#   sudo bash neon-copy.sh                 copy now
#   sudo bash neon-copy.sh --install-cron  copy now, then refresh every hour
#   sudo bash neon-copy.sh --remove-cron   stop the hourly refresh
#
# Needs /opt/briofold/neon-copy.env (mode 600) with one line:
#   NEON_URL=postgresql://neondb_owner:...@ep-....aws.neon.tech/neondb?sslmode=require
# The password never goes into this file, the repository or the chat.
#
# Limits of the copy (it is a copy, not a production replacement):
# * objects are owned by neondb_owner (Neon has no superuser); grants to the
#   app roles are kept, the roles exist as NOLOGIN.
# * role attributes such as BYPASSRLS do not exist on Neon, so FORCE ROW LEVEL
#   SECURITY is turned off on the copy (list kept in neon_copy.forced_rls);
#   otherwise neondb_owner could not read those tables.
set -euo pipefail
umask 077

root=/opt/briofold
pg=briofold-postgres-1
dbs=(ekmivo ekmivo_live_financial ekmivo_sandbox_financial)
work=$root/backup/neon-copy
envfile=$root/neon-copy.env
cronfile=/etc/cron.d/briofold-neon-copy

say() { printf '%s\n' "$*"; }
die() { printf 'STOP: %s\n' "$*" >&2; exit 1; }

case "${1:-}" in
  --remove-cron) rm -f "$cronfile"; say 'Hourly refresh removed.'; exit 0;;
  --install-cron|'') ;;
  *) die 'usage: sudo bash neon-copy.sh [--install-cron|--remove-cron]';;
esac

[ "$(id -u)" = 0 ] || die 'run with sudo'
[ -f "$envfile" ] || die "$envfile is missing (see the top of this script)"
[ "$(stat -c %a "$envfile")" = 600 ] || die "$envfile must be mode 600: sudo chmod 600 $envfile"
# shellcheck disable=SC1090
. "$envfile"
re='^postgres(ql)?://([^:]+):([^@]+)@([^/:?]+)(:([0-9]+))?/([^?]+)'
[[ "${NEON_URL:-}" =~ $re ]] || die 'NEON_URL is not a postgresql://user:password@host/db URL'
neon_env=(-e PGUSER="${BASH_REMATCH[2]}" -e PGPASSWORD="${BASH_REMATCH[3]}" -e PGHOST="${BASH_REMATCH[4]}"
  -e PGPORT="${BASH_REMATCH[6]:-5432}" -e PGSSLMODE=require)
admin_db=${BASH_REMATCH[7]}
case "${BASH_REMATCH[4]}" in *-pooler.*) die 'use the direct connection string (Neon: Connect, turn "Connection pooling" off)';; esac

exec 9>"$root/.neon-copy.lock"
flock -n 9 || die 'another copy is running'
mkdir -p "$work"
rm -f "$work"/*.dump
docker ps --format '{{.Names}}' | grep -qx "$pg" || die "container $pg is not running"

vps() { docker exec -i "$pg" sh -c 'psql -At -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$0" -c "$1"' "$1" "$2"; }
neon() { docker exec -i "${neon_env[@]}" "$pg" psql -At -v ON_ERROR_STOP=1 -d "$1" -c "$2"; }

say "== 1. versions"
say "VPS:  $(vps postgres 'show server_version')"
v=$(neon "$admin_db" 'show server_version') || die 'cannot connect to Neon (check NEON_URL, and that the VPS can reach the internet)'
say "Neon: $v"

say "== 2. roles used by grants (created on Neon as NOLOGIN when missing)"
roles=$(vps postgres "select string_agg(quote_literal(rolname),',') from pg_roles where rolname !~ '^pg_' and not rolsuper and rolname not in ('neondb_owner','cloud_admin')")
if [ -n "$roles" ]; then
  neon "$admin_db" "DO \$\$DECLARE r text; BEGIN FOREACH r IN ARRAY ARRAY[$roles]::text[] LOOP
    IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname=r) THEN EXECUTE format('CREATE ROLE %I NOLOGIN',r); END IF; END LOOP; END\$\$" >/dev/null
fi
say "$(neon "$admin_db" "select count(*) from pg_roles where rolname !~ '^pg_'") roles on Neon"

for db in "${dbs[@]}"; do
  say "== 3. $db"
  docker exec -i "$pg" sh -c 'pg_dump -Fc -U "$POSTGRES_USER" -d "$0"' "$db" > "$work/$db.dump"
  say "dump $(du -h "$work/$db.dump" | cut -f1)"
  next="${db}__next"
  neon "$admin_db" "DROP DATABASE IF EXISTS \"$next\" WITH (FORCE)" >/dev/null
  neon "$admin_db" "CREATE DATABASE \"$next\"" >/dev/null
  # Errors are expected for a few superuser-only statements; they are counted and kept in the log.
  set +e
  docker exec -i "${neon_env[@]}" "$pg" pg_restore --no-owner --no-subscriptions --no-publications \
    -d "$next" < "$work/$db.dump" > "$work/$db.restore.log" 2>&1
  set -e
  errors=$(grep -c '^pg_restore: error' "$work/$db.restore.log" || true)
  say "restore errors: $errors (log: $work/$db.restore.log)"
  grep '^pg_restore: error' "$work/$db.restore.log" | cut -c1-200 | sort | uniq -c | sort -rn | head -8 || true
  tables_vps=$(vps "$db" "select count(*) from pg_tables where schemaname='public'")
  tables_neon=$(neon "$next" "select count(*) from pg_tables where schemaname='public'")
  funcs_vps=$(vps "$db" "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'")
  funcs_neon=$(neon "$next" "select count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public'")
  say "tables VPS $tables_vps / Neon $tables_neon, functions VPS $funcs_vps / Neon $funcs_neon"
  [ "$tables_vps" = "$tables_neon" ] || die "$db: table count differs; the previous Neon copy is left as it was"
  # FORCE ROW LEVEL SECURITY would hide every row from neondb_owner (Neon has no BYPASSRLS),
  # so the copy turns it off and records which tables had it in neon_copy.forced_rls.
  forced=$(neon "$next" "CREATE SCHEMA IF NOT EXISTS neon_copy;
    CREATE TABLE IF NOT EXISTS neon_copy.forced_rls(table_name text primary key, copied_at timestamptz not null default now());
    WITH f AS (SELECT c.oid::regclass::text AS t FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
      WHERE n.nspname='public' AND c.relkind IN ('r','p') AND c.relforcerowsecurity)
    INSERT INTO neon_copy.forced_rls(table_name) SELECT t FROM f ON CONFLICT DO NOTHING;
    DO \$\$DECLARE t text; BEGIN FOR t IN SELECT table_name FROM neon_copy.forced_rls LOOP
      EXECUTE format('ALTER TABLE %s NO FORCE ROW LEVEL SECURITY',t); END LOOP; END\$\$;
    SELECT count(*) FROM neon_copy.forced_rls" | tail -1)
  say "FORCE RLS turned off on the copy for $forced tables (list: neon_copy.forced_rls)"
  neon "$admin_db" "DROP DATABASE IF EXISTS \"$db\" WITH (FORCE)" >/dev/null
  neon "$admin_db" "ALTER DATABASE \"$next\" RENAME TO \"$db\"" >/dev/null
  rm -f "$work/$db.dump"
  say "$db copied"
done

say "== 4. done $(date -u +%FT%TZ)"
if [ "${1:-}" = --install-cron ]; then
  install -m 700 "$0" "$root/neon-copy.sh"
  printf '%s\n' 'MAILTO=""' "17 * * * * root bash $root/neon-copy.sh > $work/last.log 2>&1" > "$cronfile"
  chmod 644 "$cronfile"
  say "Hourly refresh installed ($cronfile, at minute 17). Last run log: $work/last.log"
fi
