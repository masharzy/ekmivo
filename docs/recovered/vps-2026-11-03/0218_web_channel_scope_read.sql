-- Overview embeds this reviewed channel-scope predicate in its count queries.
-- Preserve channel/actor authorization; add no table or write privileges.
BEGIN;
DO $$
BEGIN
 IF current_database()<>'ekmivo' OR to_regclass('public.financial_realm') IS NOT NULL THEN
  RAISE EXCEPTION '0218 requires the control database';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_proc
  WHERE oid=to_regprocedure('public.briofold_channel_allowed(uuid,uuid,uuid,text)')
  AND prosecdef AND provolatile='s') THEN
  RAISE EXCEPTION 'Reviewed channel scope predicate required';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='ekmivo_web_app'
  AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb) THEN
  RAISE EXCEPTION 'Restricted web runtime required';
 END IF;
 GRANT EXECUTE ON FUNCTION public.briofold_channel_allowed(uuid,uuid,uuid,text) TO ekmivo_web_app;
END $$;
COMMIT;
