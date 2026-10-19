-- 0111 CONTROL database only. Public checkout shows merchant-approved Store contact
-- fields (never payment account numbers, dashboard identities, or account secrets).
-- No theme or Store settings are modified.
BEGIN;
DO $$ BEGIN
 IF to_regclass('public.financial_realm') IS NOT NULL
    OR to_regclass('public.dashboard_store_profiles') IS NULL
    OR to_regprocedure('public.pg13_public_checkout(uuid,text)') IS NULL
 THEN RAISE EXCEPTION '0111 requires control database through 0100'; END IF;
END $$;
CREATE OR REPLACE FUNCTION pg13_public_checkout(w uuid,e text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('merchant_name',coalesce(nullif(store.body->>'name',''),wsp.name),
 'brand',jsonb_strip_nulls(jsonb_build_object(
 'logo_url',coalesce(nullif(store.body->>'logo',''),setting.body->>'logo_url'),
 'title',setting.body->>'checkout_title',
 'description',coalesce(nullif(store.body->>'description',''),setting.body->>'checkout_description'),
 'support_url',coalesce(nullif(store.body->>'website',''),setting.body->>'support_url'),
 'website_url',coalesce(nullif(store.body->>'website',''),setting.body->>'support_url'),
 'support_phone',nullif(store.body->>'phone',''),
 'whatsapp',nullif(store.body->>'whatsapp',''),
 'address',nullif(store.body->>'address',''),
 'business_type',nullif(store.body->>'business_type',''),
 'statement_name',nullif(store.body->>'statement_name',''),
 'receipt_note',nullif(store.body->>'receipt_note',''),
 'support_email',coalesce(nullif(store.body->>'support_email',''),setting.body->>'support_email'),
 'legal_url',coalesce(nullif(store.body->>'refund_url',''),setting.body->>'legal_url'),
 'locale',setting.body->>'locale',
 'checkout_theme',CASE WHEN theme.body IS NULL THEN NULL ELSE
 jsonb_set(theme.body,'{store}',jsonb_build_object(
 'name',coalesce(store.body->>'name',wsp.name),'logo',coalesce(store.body->>'logo',''),
 'size',coalesce((theme.body->'store'->>'size')::integer,40),
 'radius',coalesce((theme.body->'store'->>'radius')::integer,0),
 'position',coalesce(nullif(theme.body->'store'->>'position',''),'beside-left'),
 'invert',coalesce((theme.body->'store'->>'invert')::boolean,false)),true)::text END)))
 FROM workspaces wsp JOIN workspace_environments env
 ON env.workspace_id=wsp.id AND env.environment=e AND env.status='active'
 JOIN workspace_product_access prod
 ON prod.workspace_id=wsp.id AND prod.product='payments' AND prod.enabled
 LEFT JOIN pg13_business_settings setting ON setting.workspace_id=wsp.id
 LEFT JOIN checkout_theme_settings theme ON theme.workspace_id=wsp.id
 LEFT JOIN dashboard_store_profiles store ON store.workspace_id=wsp.id
 WHERE wsp.id=w AND e IN ('live','sandbox')
$$;
COMMIT;
