-- Ekmivo control database. Admin-only, versioned offer authoring; no offers seeded.
-- This catalog is not a billing mandate and publishes no payment instructions.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF current_database()<>'ekmivo'
 OR to_regclass('public.platform_subscription_offers') IS NULL
 OR to_regclass('public.financial_realm') IS NOT NULL
 THEN RAISE EXCEPTION '0143 requires Ekmivo control DB after 0133';END IF;
END $$;

CREATE FUNCTION platform_subscription_offer_admin(actor uuid, operation text, payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 offer platform_subscription_offers%ROWTYPE;
 variant platform_subscription_offer_versions%ROWTYPE;
 key text; product text; interval_name text; amount bigint; plan_version uuid;
 details jsonb; reason text; desired_version uuid; prior_version uuid;
BEGIN
 IF NOT EXISTS (SELECT 1 FROM platform_administrators a JOIN app_users u ON u.id=a.user_id
   WHERE a.user_id=actor AND a.role='super_admin' AND u.disabled_at IS NULL)
 THEN RAISE EXCEPTION 'super admin required' USING ERRCODE='42501';END IF;
 IF jsonb_typeof(payload) IS DISTINCT FROM 'object' OR pg_column_size(payload)>12000
 THEN RAISE EXCEPTION 'invalid payload' USING ERRCODE='22023';END IF;
 IF operation='list' THEN
  RETURN jsonb_build_object('offers',coalesce((SELECT jsonb_agg(
    jsonb_build_object('key',o.offer_key,'product',o.product,'status',o.status,
      'current_version_id',o.current_version_id,'updated_at',o.updated_at,
      'versions',coalesce((SELECT jsonb_agg(jsonb_build_object(
       'id',v.id,'revision',v.revision,'term',v.term,'amount_minor',v.amount_minor,
       'currency',v.currency,'payment_plan_version_id',v.payment_plan_version_id,
       'terms',v.terms,'created_at',v.created_at) ORDER BY v.revision DESC)
       FROM platform_subscription_offer_versions v WHERE v.offer_key=o.offer_key),'[]'::jsonb))
      ORDER BY o.updated_at DESC,o.offer_key)
    FROM platform_subscription_offers o),'[]'::jsonb));
 END IF;

 reason:=trim(coalesce(payload->>'reason',''));
 IF length(reason) NOT BETWEEN 10 AND 500
 THEN RAISE EXCEPTION 'audit reason required' USING ERRCODE='22023';END IF;

 IF operation='draft' THEN
  key:=trim(coalesce(payload->>'offer_key',''));
  product:=coalesce(payload->>'product','');interval_name:=coalesce(payload->>'term','');
  IF key!~'^[a-z][a-z0-9_-]{2,63}$' OR product NOT IN ('payments','ai_credit','bundle')
   OR (product='ai_credit' AND interval_name<>'one_time')
   OR (product IN ('payments','bundle') AND interval_name NOT IN ('monthly','yearly'))
  THEN RAISE EXCEPTION 'invalid offer key, product or term' USING ERRCODE='22023';END IF;
  amount:=(payload->>'amount_minor')::bigint;
  IF amount IS NULL OR amount NOT BETWEEN 1 AND 100000000000
  THEN RAISE EXCEPTION 'invalid price' USING ERRCODE='22023';END IF;
  plan_version:=nullif(payload->>'payment_plan_version_id','')::uuid;
  IF (product IN ('payments','bundle') AND plan_version IS NULL)
   OR (product='ai_credit' AND plan_version IS NOT NULL)
  THEN RAISE EXCEPTION 'plan version required only for payments and bundle' USING ERRCODE='22023';END IF;
  IF plan_version IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM payment_plan_versions v JOIN payment_plan_catalog c
     ON c.current_version=v.id AND c.plan_id=v.plan_id
    WHERE v.id=plan_version AND c.status='published' AND c.visibility='public'
  ) THEN RAISE EXCEPTION 'gateway plan version not published' USING ERRCODE='23514';END IF;
  details:=payload->'terms';
  IF jsonb_typeof(details) IS DISTINCT FROM 'object' OR pg_column_size(details)>6000
   OR length(trim(coalesce(details->>'name',''))) NOT BETWEEN 2 AND 100
   OR length(coalesce(details->>'name_bn',''))>120
   OR length(coalesce(details->>'description',''))>500
   OR length(coalesce(details->>'description_bn',''))>500
   OR EXISTS (SELECT 1 FROM jsonb_object_keys(details) AS kv(prop)
      WHERE kv.prop NOT IN ('name','name_bn','description','description_bn','included_ai_credits'))
  THEN RAISE EXCEPTION 'invalid offer display terms' USING ERRCODE='22023';END IF;
  IF (product='payments' AND details ? 'included_ai_credits')
   OR (product IN ('ai_credit','bundle') AND
      (details->>'included_ai_credits' IS NULL OR
       (details->>'included_ai_credits')!~'^[1-9][0-9]{0,11}$'))
  THEN RAISE EXCEPTION 'AI credits must be explicit and positive for AI packs or bundles' USING ERRCODE='22023';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('ekmivo-offer-'||key,0));
  INSERT INTO platform_subscription_offers(offer_key,product,status,created_by)
   VALUES(key,product,'draft',actor) ON CONFLICT(offer_key) DO NOTHING;
  SELECT * INTO offer FROM platform_subscription_offers WHERE offer_key=key FOR UPDATE;
  IF offer.status='archived' OR offer.product<>product
  THEN RAISE EXCEPTION 'offer immutable identity or archived' USING ERRCODE='23514';END IF;
  INSERT INTO platform_subscription_offer_versions(
    offer_key,revision,term,amount_minor,payment_plan_version_id,terms,created_by)
  SELECT key,coalesce(max(revision),0)+1,interval_name,amount,plan_version,details,actor
    FROM platform_subscription_offer_versions WHERE offer_key=key RETURNING * INTO variant;
  UPDATE platform_subscription_offers SET updated_at=now() WHERE offer_key=key;
 ELSIF operation IN ('publish','archive') THEN
  key:=coalesce(payload->>'offer_key','');
  IF key!~'^[a-z][a-z0-9_-]{2,63}$' THEN RAISE EXCEPTION 'invalid offer' USING ERRCODE='22023';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('ekmivo-offer-'||key,0));
  SELECT * INTO offer FROM platform_subscription_offers WHERE offer_key=key FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'offer not found' USING ERRCODE='P0002';END IF;
  IF offer.status='archived' THEN RAISE EXCEPTION 'archived offer' USING ERRCODE='23514';END IF;
  prior_version:=nullif(payload->>'expected_current_version_id','')::uuid;
  IF offer.current_version_id IS DISTINCT FROM prior_version
  THEN RAISE EXCEPTION 'published version changed' USING ERRCODE='40001';END IF;
  IF operation='publish' THEN
   desired_version:=(payload->>'version_id')::uuid;
   SELECT * INTO variant FROM platform_subscription_offer_versions
    WHERE offer_key=key AND id=desired_version FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'version not found' USING ERRCODE='P0002';END IF;
   IF variant.payment_plan_version_id IS NOT NULL AND NOT EXISTS (
     SELECT 1 FROM payment_plan_versions v JOIN payment_plan_catalog c
     ON c.current_version=v.id AND c.plan_id=v.plan_id
     WHERE v.id=variant.payment_plan_version_id AND c.status='published' AND c.visibility='public'
   ) THEN RAISE EXCEPTION 'gateway plan changed; create a new draft' USING ERRCODE='40001';END IF;
   UPDATE platform_subscription_offers SET status='published',current_version_id=desired_version,
     updated_at=now() WHERE offer_key=key RETURNING * INTO offer;
  ELSE
   UPDATE platform_subscription_offers SET status='archived',updated_at=now()
   WHERE offer_key=key RETURNING * INTO offer;
  END IF;
 ELSE RAISE EXCEPTION 'unsupported operation' USING ERRCODE='22023';END IF;

 INSERT INTO platform_admin_audit(actor_id,action,description)
 VALUES(actor,'subscription_offer.'||operation,left(key||' product='||offer.product||
    ' version='||coalesce(variant.id::text,offer.current_version_id::text,'none')||
    ' status='||offer.status||' | '||reason,1800));
 RETURN jsonb_build_object('key',key,'status',offer.status,'version_id',variant.id);
END $$;

REVOKE ALL ON FUNCTION platform_subscription_offer_admin(uuid,text,jsonb) FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='ekmivo_runtime') THEN
  GRANT EXECUTE ON FUNCTION platform_subscription_offer_admin(uuid,text,jsonb) TO ekmivo_runtime;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='ekmivo_financial_runtime') THEN
  GRANT EXECUTE ON FUNCTION platform_subscription_offer_admin(uuid,text,jsonb) TO ekmivo_financial_runtime;
 END IF;
END $$;
COMMIT;
