-- Read-only acceptance for control-plane API privileges after 0155.
-- Run on an isolated Neon branch first, then on production after migration.
DO $subscription_runtime_check$
DECLARE
 function_signature text;
 protected_table text;
 worker_only text;
 safe_role pg_roles;
BEGIN
 IF current_database()<>'ekmivo' OR to_regclass('public.financial_realm') IS NOT NULL
 THEN RAISE EXCEPTION 'subscription runtime check requires control database'; END IF;
 SELECT * INTO safe_role FROM pg_roles WHERE rolname='ekmivo_financial_runtime';
 IF NOT FOUND OR NOT safe_role.rolcanlogin OR safe_role.rolbypassrls
  OR safe_role.rolsuper OR safe_role.rolcreaterole OR safe_role.rolcreatedb
  OR EXISTS (
   SELECT 1 FROM pg_auth_members m JOIN pg_roles p ON p.oid=m.roleid
   WHERE m.member=safe_role.oid AND p.rolname='neon_superuser'
  )
 THEN RAISE EXCEPTION 'API runtime is elevated or missing'; END IF;

 FOREACH function_signature IN ARRAY ARRAY[
  'platform_subscription_coupon_quote(uuid,uuid,uuid,bigint,text)',
  'platform_subscription_coupon_current_quote(uuid,uuid)',
  'platform_subscription_coupon_history(uuid,uuid,integer)',
  'platform_subscription_intent_command(text,uuid,text,text,jsonb)',
  'platform_subscription_order_request(uuid,uuid,uuid,text,jsonb)',
  'platform_subscription_payment_bind(uuid,uuid,uuid,uuid,uuid,uuid,text)',
  'platform_subscription_payment_read(uuid,uuid,uuid)',
  'platform_subscription_tax_admin(uuid,text,jsonb)',
  'platform_subscription_admin_operations(uuid)',
  'platform_subscription_admin_export(uuid,text,text)',
  'platform_subscription_payment_capability(uuid,text)',
  'platform_subscription_offers_public()'
 ] LOOP
  IF to_regprocedure(function_signature) IS NULL OR
   NOT has_function_privilege('ekmivo_financial_runtime',function_signature,'EXECUTE')
  THEN RAISE EXCEPTION 'Missing API execution grant: %',function_signature; END IF;
 END LOOP;

 FOREACH protected_table IN ARRAY ARRAY[
  'platform_subscription_coupon_commands',
  'platform_subscription_order_confirmations',
  'platform_subscription_payment_handoffs',
  'platform_subscription_payment_recovery_cases'
 ] LOOP
  IF to_regclass('public.'||protected_table) IS NULL
   OR has_table_privilege('ekmivo_financial_runtime',protected_table,'SELECT')
   OR has_table_privilege('ekmivo_financial_runtime',protected_table,'INSERT')
   OR has_table_privilege('ekmivo_financial_runtime',protected_table,'UPDATE')
   OR has_table_privilege('ekmivo_financial_runtime',protected_table,'DELETE')
  THEN RAISE EXCEPTION 'Raw subscription table is accessible to API: %',protected_table; END IF;
 END LOOP;

 FOREACH worker_only IN ARRAY ARRAY[
  'platform_subscription_payment_pending()',
  'platform_subscription_payment_recover(uuid,uuid,text)',
  'platform_subscription_payment_settle(uuid,uuid,bigint,timestamptz,uuid)',
  'platform_subscription_payment_terminal(uuid,text)'
 ] LOOP
  IF to_regprocedure(worker_only) IS NULL
   OR has_function_privilege('ekmivo_financial_runtime',worker_only,'EXECUTE')
  THEN RAISE EXCEPTION 'Worker-only function exposed to HTTP runtime: %',worker_only; END IF;
 END LOOP;
END $subscription_runtime_check$;
