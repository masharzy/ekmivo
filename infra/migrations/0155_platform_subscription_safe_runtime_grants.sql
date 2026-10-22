-- Control database only. The Go API connects as the restricted
-- ekmivo_financial_runtime role, not the legacy elevated ekmivo_runtime role.
-- Correct the Phase 3-7 SECURITY DEFINER execution grants without granting
-- direct access to coupon, intent, invoice or payment tables.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';

DO $$
DECLARE runtime_role pg_roles;
BEGIN
 IF current_database()<>'ekmivo'
  OR to_regclass('public.financial_realm') IS NOT NULL
  OR to_regclass('public.platform_subscription_payment_handoffs') IS NULL
  OR to_regclass('public.platform_subscription_order_confirmations') IS NULL
 THEN RAISE EXCEPTION '0155 requires control database after 0154'; END IF;

 SELECT * INTO runtime_role FROM pg_roles WHERE rolname='ekmivo_financial_runtime';
 IF NOT FOUND OR NOT runtime_role.rolcanlogin OR runtime_role.rolsuper
  OR runtime_role.rolbypassrls OR runtime_role.rolcreaterole
  OR runtime_role.rolcreatedb
  OR EXISTS (
   SELECT 1 FROM pg_auth_members m JOIN pg_roles p ON p.oid=m.roleid
   WHERE m.member=runtime_role.oid
   AND p.rolname IN ('neon_superuser','pg_read_all_data','pg_write_all_data')
  )
 THEN RAISE EXCEPTION '0155 requires the verified least-privilege API runtime role'; END IF;
END $$;

GRANT USAGE ON SCHEMA public TO ekmivo_financial_runtime;

-- The authenticated Go API calls these, with actor, Store, revision and
-- session checks inside each SECURITY DEFINER function.
GRANT EXECUTE ON FUNCTION
 platform_subscription_coupon_quote(uuid,uuid,uuid,bigint,text),
 platform_subscription_coupon_current_quote(uuid,uuid),
 platform_subscription_coupon_history(uuid,uuid,integer),
 platform_subscription_intent_command(text,uuid,text,text,jsonb),
 platform_subscription_order_request(uuid,uuid,uuid,text,jsonb),
 platform_subscription_payment_bind(uuid,uuid,uuid,uuid,uuid,uuid,text),
 platform_subscription_payment_read(uuid,uuid,uuid)
TO ekmivo_financial_runtime;

-- Public catalogue and the Admin UI may move to a restricted web runtime.
-- Their own SECURITY DEFINER authorization stays authoritative.
GRANT EXECUTE ON FUNCTION
 platform_subscription_offers_public(),
 platform_subscription_policy_public(),
 platform_subscription_offer_admin(uuid,text,jsonb),
 platform_subscription_policy_admin(uuid,text,jsonb),
 platform_subscription_coupon_admin(uuid,text,jsonb),
 platform_subscription_tax_admin(uuid,text,jsonb),
 platform_subscription_payment_capability(uuid,text),
 platform_subscription_admin_operations(uuid),
 platform_subscription_admin_export(uuid,text,text)
TO ekmivo_financial_runtime;

-- Settlement, reconciliation and terminal recovery remain exclusively with
-- the financial projection/worker role. Do not grant them to the HTTP API.
COMMIT;
