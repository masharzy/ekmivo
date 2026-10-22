-- Read-only contract. Safe on an isolated branch and, after rollout, production.
-- Synthetic account creation/updates are tested separately inside ROLLBACK.
DO $web_role_contract$
DECLARE
  target_role pg_roles;
  relation_name text;
  function_signature text;
BEGIN
  IF current_database()<>'ekmivo' OR to_regclass('public.financial_realm') IS NOT NULL
  THEN RAISE EXCEPTION 'Web role test must target the control database'; END IF;

  SELECT * INTO target_role FROM pg_roles WHERE rolname='ekmivo_web_app';
  IF NOT FOUND OR NOT target_role.rolcanlogin OR target_role.rolsuper
     OR target_role.rolbypassrls OR target_role.rolcreaterole
     OR target_role.rolcreatedb OR target_role.rolreplication
     OR EXISTS (SELECT 1 FROM pg_auth_members m WHERE m.member=target_role.oid)
  THEN RAISE EXCEPTION 'Web role is missing or elevated'; END IF;

  IF NOT has_schema_privilege('ekmivo_web_app','public','USAGE')
     OR has_schema_privilege('ekmivo_web_app','public','CREATE')
  THEN RAISE EXCEPTION 'Web role has incorrect schema privileges'; END IF;

  FOREACH relation_name IN ARRAY ARRAY[
    'app_users','auth_sessions','workspaces','workspace_members',
    'platform_primary_stores','briofold_business_onboarding',
    'workspace_environments','workspace_product_access',
    'pg13_platform_invoices','inbox_threads','inbox_messages',
    'platform_payment_providers'
  ] LOOP
    IF NOT has_table_privilege('ekmivo_web_app',relation_name,'SELECT')
    THEN RAISE EXCEPTION 'Web cannot read required relation %',relation_name; END IF;
  END LOOP;

  FOREACH relation_name IN ARRAY ARRAY[
    'app_users','auth_sessions','workspaces','workspace_members',
    'platform_primary_stores','briofold_business_onboarding'
  ] LOOP
    IF NOT has_table_privilege('ekmivo_web_app',relation_name,'INSERT')
    THEN RAISE EXCEPTION 'Web cannot create required relation %',relation_name; END IF;
  END LOOP;

  IF NOT has_column_privilege('ekmivo_web_app','merchant_api_keys','public_id','SELECT')
     OR has_column_privilege('ekmivo_web_app','merchant_api_keys','secret_digest','SELECT')
  THEN RAISE EXCEPTION 'Web merchant key metadata/digest separation failed'; END IF;

  FOREACH relation_name IN ARRAY ARRAY[
    'platform_subscription_payment_handoffs',
    'platform_subscription_order_confirmations',
    'platform_subscription_payment_recovery_cases',
    'platform_subscription_coupon_redemptions',
    'financial_projection_versions'
  ] LOOP
    IF to_regclass('public.'||relation_name) IS NOT NULL
       AND (has_table_privilege('ekmivo_web_app',relation_name,'SELECT')
         OR has_table_privilege('ekmivo_web_app',relation_name,'INSERT')
         OR has_table_privilege('ekmivo_web_app',relation_name,'UPDATE')
         OR has_table_privilege('ekmivo_web_app',relation_name,'DELETE'))
    THEN RAISE EXCEPTION 'Forbidden financial raw access: %',relation_name; END IF;
  END LOOP;

  FOREACH function_signature IN ARRAY ARRAY[
    'payment_plan_public()',
    'platform_subscription_offers_public()',
    'platform_subscription_policy_public()',
    'platform_subscription_intent_command(text,uuid,text,text,jsonb)',
    'platform_subscription_coupon_admin(uuid,text,jsonb)',
    'platform_subscription_payment_capability(uuid,text)'
  ] LOOP
    IF NOT has_function_privilege('ekmivo_web_app',function_signature,'EXECUTE')
    THEN RAISE EXCEPTION 'Missing web function: %',function_signature; END IF;
  END LOOP;
  IF has_function_privilege('ekmivo_web_app','platform_subscription_payment_settle(uuid,uuid,bigint,timestamptz,uuid)','EXECUTE')
     OR has_function_privilege('ekmivo_web_app','platform_subscription_payment_pending()','EXECUTE')
  THEN RAISE EXCEPTION 'Worker-only payment function exposed to Web'; END IF;
END $web_role_contract$;
