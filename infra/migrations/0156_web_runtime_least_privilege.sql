-- Control database only. Provision ekmivo_web_app as a SQL-created LOGIN role
-- with a private password before this migration. Neon console-created roles
-- can inherit neon_superuser and must not be used for the web application.
-- This migration does not create/rotate credentials or touch financial realms.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';

DO $web_runtime$
DECLARE
  target_role pg_roles;
  relation_name text;
  function_name text;
  selected_relations text[] := ARRAY[
    'app_users','auth_attempts','auth_google_identities','auth_one_time_codes',
    'auth_sessions','briofold_ai_credit_journal','briofold_ai_executions',
    'briofold_ai_reservations','briofold_ai_tariff_catalog',
    'briofold_ai_tariff_versions','briofold_ai_topups','briofold_ai_wallets',
    'briofold_business_onboarding','inbox_connections','inbox_messages',
    'inbox_threads','merchant_api_key_audit','merchant_api_keys',
    'payment_plan_versions','pg13_platform_invoices','pg13_privacy_requests',
    'pg13_subscriptions','pg13_support','pg13_support_replies',
    'platform_admin_audit','platform_admin_mfa','platform_admin_mfa_attempts',
    'platform_admin_recovery_codes','platform_admin_trusted_devices',
    'platform_administrators','platform_ai_credit_balances',
    'platform_auth_settings','platform_billing_settings',
    'platform_payment_providers','platform_primary_stores',
    'platform_provider_assets','public_sandbox_config',
    'workspace_environments','workspace_members','workspace_product_access',
    'workspace_product_access_audit','workspaces'
  ];
  inserted_relations text[] := ARRAY[
    'app_users','auth_attempts','auth_google_identities','auth_one_time_codes',
    'auth_sessions','briofold_business_onboarding','merchant_api_key_audit',
    'merchant_api_keys','platform_admin_audit','platform_admin_mfa',
    'platform_admin_mfa_attempts','platform_admin_recovery_codes',
    'platform_admin_trusted_devices','platform_administrators',
    'platform_payment_providers','platform_primary_stores',
    'platform_provider_assets','workspace_members',
    'workspace_product_access_audit','workspaces'
  ];
  updated_relations text[] := ARRAY[
    'app_users','auth_attempts','auth_one_time_codes','auth_sessions',
    'briofold_business_onboarding','merchant_api_keys','platform_admin_mfa',
    'platform_admin_mfa_attempts','platform_admin_recovery_codes',
    'platform_admin_trusted_devices','platform_auth_settings',
    'platform_payment_providers','public_sandbox_config',
    'workspace_environments','workspace_product_access','workspaces'
  ];
  deleted_relations text[] := ARRAY[
    'auth_attempts','platform_admin_mfa','platform_admin_recovery_codes',
    'platform_administrators'
  ];
  web_functions text[] := ARRAY[
    'briofold_ai_admin_adjust(uuid,uuid,uuid,bigint,text)',
    'briofold_ai_admin_waive(uuid,uuid,text,uuid,text)',
    'briofold_ai_knowledge_read(uuid,uuid,uuid)',
    'briofold_ai_knowledge_search(uuid,uuid,text,boolean)',
    'briofold_ai_studio_read(uuid,uuid,integer,integer)',
    'briofold_ai_studio_write(uuid,uuid,uuid,text,jsonb)',
    'briofold_ai_tariff_publish(uuid,uuid,text,uuid,jsonb,text)',
    'briofold_customers_read(uuid,text,uuid,uuid,integer,text,text)',
    'briofold_inbox_alert_mark(uuid,uuid,uuid)',
    'briofold_inbox_alert_read(uuid,uuid,integer,text,text,boolean)',
    'dashboard_checkout_logo(text)',
    'dashboard_checkout_theme_read(uuid,uuid)',
    'dashboard_checkout_theme_write(uuid,uuid,jsonb,bigint,text,bytea)',
    'dashboard_preferences(uuid,uuid,boolean)',
    'dashboard_store_read(uuid,uuid)',
    'dashboard_store_write(uuid,uuid,jsonb,bigint,text,bytea)',
    'dashboard_workspace_rename(uuid,uuid,text)',
    'payment_plan_admin(uuid,text,jsonb)',
    'payment_plan_claim_free(uuid,uuid,text)',
    'payment_plan_effective(uuid)',
    'payment_plan_public()',
    'pg13_billing_allowed(uuid)',
    'pg13_billing_read(uuid,uuid)',
    'pg13_support_reply(uuid,uuid,text,text)',
    'platform_billing_set(uuid,uuid,text)',
    'platform_billing_system_workspace(uuid)',
    'platform_subscription_admin_export(uuid,text,text)',
    'platform_subscription_admin_operations(uuid)',
    'platform_subscription_coupon_admin(uuid,text,jsonb)',
    'platform_subscription_coupon_history(uuid,uuid,integer)',
    'platform_subscription_intent_command(text,uuid,text,text,jsonb)',
    'platform_subscription_offer_admin(uuid,text,jsonb)',
    'platform_subscription_offers_public()',
    'platform_subscription_payment_capability(uuid,text)',
    'platform_subscription_policy_admin(uuid,text,jsonb)',
    'platform_subscription_policy_public()',
    'platform_subscription_tax_admin(uuid,text,jsonb)'
  ];
BEGIN
  IF current_database() <> 'ekmivo'
     OR to_regclass('public.financial_realm') IS NOT NULL
     OR to_regclass('public.platform_subscription_payment_handoffs') IS NULL
  THEN RAISE EXCEPTION '0156 applies only to the post-0155 control database'; END IF;

  SELECT * INTO target_role FROM pg_roles WHERE rolname='ekmivo_web_app';
  IF NOT FOUND OR NOT target_role.rolcanlogin OR target_role.rolsuper
    OR target_role.rolbypassrls OR target_role.rolcreaterole
    OR target_role.rolcreatedb OR target_role.rolreplication
    OR EXISTS (SELECT 1 FROM pg_auth_members m JOIN pg_roles p ON p.oid=m.roleid
               WHERE m.member=target_role.oid)
  THEN RAISE EXCEPTION 'SQL-created restricted ekmivo_web_app LOGIN role required'; END IF;

  GRANT USAGE ON SCHEMA public TO ekmivo_web_app;
  -- Every direct table reference in Next.js is enumerated. No blanket schema
  -- or default privileges: new tables/functions must be explicitly reviewed.
  FOREACH relation_name IN ARRAY selected_relations LOOP
    IF to_regclass('public.'||relation_name) IS NULL
    THEN RAISE EXCEPTION 'Missing audited web relation: %',relation_name; END IF;
    IF relation_name='merchant_api_keys' THEN
      -- Browser-facing pages need metadata, never the authentication digest.
      GRANT SELECT (id,workspace_id,environment,public_id,name,scopes,
                    created_at,created_by,expires_at,revoked_at,last_used_at)
        ON TABLE public.merchant_api_keys TO ekmivo_web_app;
    ELSE
      EXECUTE format('GRANT SELECT ON TABLE public.%I TO ekmivo_web_app',relation_name);
    END IF;
    IF EXISTS (SELECT 1 FROM pg_class WHERE oid=to_regclass('public.'||relation_name)
                 AND relrowsecurity) THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR SELECT TO ekmivo_web_app USING (true)',
                     'web_app_read_'||relation_name,relation_name);
    END IF;
  END LOOP;
  FOREACH relation_name IN ARRAY inserted_relations LOOP
    EXECUTE format('GRANT INSERT ON TABLE public.%I TO ekmivo_web_app',relation_name);
    IF EXISTS (SELECT 1 FROM pg_class WHERE oid=to_regclass('public.'||relation_name)
                 AND relrowsecurity) THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR INSERT TO ekmivo_web_app WITH CHECK (true)',
                     'web_app_insert_'||relation_name,relation_name);
    END IF;
  END LOOP;
  FOREACH relation_name IN ARRAY updated_relations LOOP
    EXECUTE format('GRANT UPDATE ON TABLE public.%I TO ekmivo_web_app',relation_name);
    IF EXISTS (SELECT 1 FROM pg_class WHERE oid=to_regclass('public.'||relation_name)
                 AND relrowsecurity) THEN
      EXECUTE format('CREATE POLICY %I ON public.%I FOR UPDATE TO ekmivo_web_app USING (true) WITH CHECK (true)',
                     'web_app_update_'||relation_name,relation_name);
    END IF;
  END LOOP;
  FOREACH relation_name IN ARRAY deleted_relations LOOP
    EXECUTE format('GRANT DELETE ON TABLE public.%I TO ekmivo_web_app',relation_name);
  END LOOP;

  FOREACH function_name IN ARRAY web_functions LOOP
    IF to_regprocedure('public.'||function_name) IS NULL
    THEN RAISE EXCEPTION 'Missing audited web function: %',function_name; END IF;
    EXECUTE format('GRANT EXECUTE ON FUNCTION public.%s TO ekmivo_web_app',function_name);
  END LOOP;
END;
$web_runtime$;
COMMIT;
