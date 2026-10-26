-- CONTROL only: MFA verification/recovery lock the administrator identity row.
-- PostgreSQL SELECT ... FOR UPDATE requires UPDATE on at least one column.
-- 0156 granted SELECT/INSERT/DELETE but omitted this row-lock prerequisite.
-- Limit the additive grant to user_id; do not grant UPDATE on role.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $mfa_lock$
BEGIN
  IF current_database() <> 'ekmivo'
     OR to_regclass('public.financial_realm') IS NOT NULL
     OR to_regclass('public.platform_admin_mfa') IS NULL
     OR to_regclass('public.platform_administrators') IS NULL
  THEN RAISE EXCEPTION '0214 requires the control database with administrator MFA'; END IF;
  IF NOT EXISTS (
    SELECT 1 FROM pg_roles WHERE rolname='ekmivo_web_app' AND rolcanlogin
      AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole
      AND NOT rolcreatedb AND NOT rolreplication
  ) THEN RAISE EXCEPTION 'Restricted ekmivo_web_app role required'; END IF;
END;
$mfa_lock$;
GRANT UPDATE (user_id) ON TABLE public.platform_administrators TO ekmivo_web_app;
COMMIT;
