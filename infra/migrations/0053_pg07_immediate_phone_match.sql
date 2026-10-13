-- 0053: permit synchronous signed-phone receipt matching by the restricted API role.
-- Matching is still SECURITY DEFINER, uses immutable candidate/authority checks,
-- and never permits an API caller to mark an arbitrary payment paid.
BEGIN;
DO $preflight$ BEGIN
 IF to_regclass('public.auth_sessions') IS NOT NULL OR
    to_regclass('public.financial_realm') IS NULL OR
    to_regprocedure('public.pg07_match(uuid,bigint)') IS NULL OR
    NOT EXISTS(SELECT 1 FROM pg_class c WHERE c.oid='public.financial_realm'::regclass
      AND c.relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user))
 THEN RAISE EXCEPTION '0053 requires owner of isolated financial realm'; END IF;
END $preflight$;
GRANT EXECUTE ON FUNCTION public.pg07_match(uuid,bigint) TO ekmivo_finance_reader;
COMMIT;
