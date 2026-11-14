#!/usr/bin/env bash
# Read-only inventory of the production VPS. Changes nothing: no restart, no write to any database.
# Run with: sudo bash inventory.sh
# Output: /tmp/briofold-inventory-<date>.tar.gz (schema only, no row data, no env values except *_ENABLED flags).
# Do NOT commit the output to the repository: function bodies in a schema dump can contain connection strings.
set -uo pipefail
pg=briofold-postgres-1
api=briofold-api-1
root=/opt/briofold
out=/tmp/briofold-inventory-$(date +%Y%m%d-%H%M)
mkdir -p "$out"
r="$out/inventory.txt"
h() { printf '\n===== %s =====\n' "$1" >> "$r"; }
q() { docker exec -i "$pg" sh -c 'psql -At -F " | " -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d "$0" -c "$1"' "$1" "$2" >> "$r" 2>&1; }

h "host"; { date -u; uname -r; nproc; free -m | sed -n 1,3p; df -h / "$root" 2>/dev/null; uptime; } >> "$r" 2>&1
h "docker containers"; docker ps -a --format '{{.Names}} | {{.Image}} | {{.Status}} | {{.Ports}}' >> "$r" 2>&1
h "docker images"; docker images --format '{{.Repository}}:{{.Tag}} | {{.ID}} | {{.CreatedSince}} | {{.Size}}' >> "$r" 2>&1
h "api image labels"; docker inspect "$api" --format '{{.Config.Image}} {{json .Config.Labels}}' >> "$r" 2>&1
h "docker volumes"; docker volume ls >> "$r" 2>&1
h "docker disk"; docker system df >> "$r" 2>&1

h "compose services (env NAMES only; values shown only for *_ENABLED)"
python3 - "$root/compose.json" >> "$r" 2>&1 <<'PY'
import json, sys
c = json.load(open(sys.argv[1]))
for name, s in c.get('services', {}).items():
    print(f"[{name}] image={s.get('image')} ports={s.get('ports')} restart={s.get('restart')} volumes={len(s.get('volumes', []))}")
    env = s.get('environment', {})
    if isinstance(env, list):
        env = dict((e.split('=', 1) + [''])[:2] for e in env)
    for k in sorted(env):
        print('   ', k + ('=' + str(env[k]) if k.endswith('_ENABLED') else ''))
PY
h "env file variable NAMES only"; sed -n 's/^\([A-Za-z_][A-Za-z0-9_]*\)=.*/\1/p' "$root/briofold.env" 2>/dev/null | sort >> "$r"

h "files in $root (2 levels)"; find "$root" -maxdepth 2 -printf '%M %u %s %TY-%Tm-%Td %p\n' 2>/dev/null | sort -k5 >> "$r"
h "backups"; ls -la "$root"/backup "$root"/backups 2>&1 | tail -n 60 >> "$r"
h "source checkout"; git -C "$root/rename-release/src" log -1 --format='%H %cs %s' >> "$r" 2>&1; git -C "$root/rename-release/src" status --short 2>&1 | head -20 >> "$r"

h "nginx"; { command -v nginx && nginx -v; ls /etc/nginx/sites-enabled /etc/nginx/conf.d; } >> "$r" 2>&1
grep -rhoE 'server_name [^;]+|proxy_pass [^;]+|listen [^;]+' /etc/nginx/sites-enabled /etc/nginx/conf.d 2>/dev/null | sort | uniq -c >> "$r"
h "tls certificates"; { ls /etc/letsencrypt/live 2>/dev/null; for c in /etc/letsencrypt/live/*/cert.pem; do [ -f "$c" ] && openssl x509 -in "$c" -noout -subject -enddate; done; } >> "$r" 2>&1
h "timers and cron"; { systemctl list-timers --all --no-pager | head -30; crontab -l; ls /etc/cron.d /etc/cron.daily; } >> "$r" 2>&1
h "firewall and listening ports"; { ufw status; ss -ltnp | awk '{print $1,$4,$6}'; } >> "$r" 2>&1
h "api health"; curl -fsS -m 5 http://127.0.0.1:8080/healthz >> "$r" 2>&1
h "api errors, last 24h (count only)"; docker logs --since 24h "$api" 2>&1 | grep -ciE 'error|panic' >> "$r"

h "postgres"; q postgres "select version()"
h "databases and sizes"; q postgres "select datname, pg_size_pretty(pg_database_size(datname)) from pg_database where not datistemplate order by 1"
h "roles (no passwords)"; q postgres "select rolname, rolsuper, rolcanlogin, rolbypassrls from pg_roles where rolname !~ '^pg_' order by 1"

for db in ekmivo ekmivo_live_financial ekmivo_sandbox_financial; do
  h "$db: extensions"; q "$db" "select extname, extversion from pg_extension order by 1"
  h "$db: object counts"; q "$db" "select 'tables', count(*) from pg_tables where schemaname='public' union all select 'functions', count(*) from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' union all select 'indexes', count(*) from pg_indexes where schemaname='public' union all select 'policies', count(*) from pg_policies where schemaname='public'"
  h "$db: migration ledger (all rows)"; q "$db" "select filename, sha256, applied_at from dashboard_reference_migrations order by filename"
  h "$db: function fingerprints"; q "$db" "select p.proname, pg_get_function_identity_arguments(p.oid), md5(pg_get_functiondef(p.oid)), r.rolname, p.prosecdef from pg_proc p join pg_namespace n on n.oid=p.pronamespace join pg_roles r on r.oid=p.proowner where n.nspname='public' and p.prokind in ('f','p') order by 1,2"
  h "$db: largest tables"; q "$db" "select relname, n_live_tup from pg_stat_user_tables order by n_live_tup desc limit 15"
  docker exec -i "$pg" sh -c 'pg_dump --schema-only --no-owner -U "$POSTGRES_USER" -d "$0"' "$db" > "$out/schema-$db.sql" 2>> "$r" || echo "schema dump failed for $db" >> "$r"
done

tar -czf "$out.tar.gz" -C /tmp "$(basename "$out")" && chmod 644 "$out.tar.gz"
echo "DONE: $out.tar.gz ($(du -h "$out.tar.gz" | cut -f1)). Nothing on the server was changed."
