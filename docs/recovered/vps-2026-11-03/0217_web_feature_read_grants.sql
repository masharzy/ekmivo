-- Extend the audited 0156 web runtime allowlist for deployed feature reads.
-- These SECURITY DEFINER entry points enforce actor/workspace authorization.
-- No table access, role membership, write function, or BYPASSRLS is granted.
BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$
DECLARE fn text;
BEGIN
 IF current_database()<>'ekmivo' OR to_regclass('public.financial_realm') IS NOT NULL THEN
  RAISE EXCEPTION '0217 requires the control database';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='ekmivo_web_app'
  AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreaterole AND NOT rolcreatedb) THEN
  RAISE EXCEPTION 'Restricted web runtime required';
 END IF;
 FOREACH fn IN ARRAY ARRAY[
  'briofold_customers_search(uuid,text,uuid,integer,text,text,text,text,text)',
  'briofold_growth_export(uuid,text,uuid)',
  'briofold_growth_operations_read(uuid,text,uuid,text)',
  'briofold_growth_snapshot(uuid,text,uuid)',
  'briofold_linked_order_conversion(uuid,text,uuid,integer,integer)',
  'briofold_response_snapshot(uuid,text,uuid)',
  'briofold_unified_activity(uuid,text,uuid,text,text,integer)',
  'commerce_order_report(uuid,text,uuid,date,date,text,text,uuid)',
  'commerce_read(uuid,text,uuid,text,uuid,integer,text,text,text)',
  'pg13_capability_override(uuid,uuid,text)'
 ] LOOP
  IF NOT EXISTS(SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.'||fn)
   AND prosecdef AND provolatile='s') THEN
   RAISE EXCEPTION 'Missing reviewed stable read function: %',fn;
  END IF;
  EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO ekmivo_web_app',fn);
 END LOOP;
END $$;
COMMIT;
