-- 0144: published-only price catalog projection for unauthenticated marketing.
-- SECURITY DEFINER is narrowly scoped; no direct runtime RLS bypass granted on offer tables.
-- No historical invoices, wallet records or draft/private prices are modified.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF current_database()<>'ekmivo'
 OR to_regclass('public.platform_subscription_offers') IS NULL
 OR to_regclass('public.platform_subscription_offer_versions') IS NULL
 OR to_regclass('public.payment_plan_catalog') IS NULL
 OR to_regclass('public.financial_realm') IS NOT NULL
 THEN RAISE EXCEPTION '0144 requires Ekmivo control DB after 0143'; END IF;
END $$;

CREATE OR REPLACE FUNCTION public.platform_subscription_offers_public()
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp
AS $function$
 SELECT coalesce(jsonb_agg(item.entry ORDER BY item.offer_key),'[]'::jsonb)
 FROM (
  SELECT o.offer_key,
    jsonb_build_object(
      'key',o.offer_key,'product',o.product,'version_id',v.id::text,
      'term',v.term,'amount_minor',v.amount_minor::text,'currency',v.currency,
      'gateway_plan_version_id',v.payment_plan_version_id::text,
      'name',v.terms->>'name','name_bn',coalesce(v.terms->>'name_bn',''),
      'description',coalesce(v.terms->>'description',''),
      'description_bn',coalesce(v.terms->>'description_bn',''),
      'included_ai_credits',v.terms->>'included_ai_credits'
    ) AS entry
  FROM public.platform_subscription_offers o
  JOIN public.platform_subscription_offer_versions v
   ON v.offer_key=o.offer_key AND v.id=o.current_version_id
  LEFT JOIN public.payment_plan_catalog c ON c.current_version=v.payment_plan_version_id
  WHERE o.status='published'
    AND v.currency='BDT' AND v.amount_minor>0
    AND (o.product='ai_credit'
      OR (c.status='published' AND c.visibility='public'))
  ORDER BY o.offer_key LIMIT 100
 ) item;
$function$;

REVOKE ALL ON FUNCTION public.platform_subscription_offers_public() FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='ekmivo_runtime')
 THEN GRANT EXECUTE ON FUNCTION public.platform_subscription_offers_public() TO ekmivo_runtime;
 END IF;
END $$;
COMMIT;
