-- Control database only. No coupons are seeded or activated by this migration.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $$ BEGIN
 IF current_database() <> 'ekmivo'
 OR to_regclass('public.platform_subscription_coupons') IS NULL
 OR to_regclass('public.auth_sessions') IS NULL
 OR to_regclass('public.financial_realm') IS NOT NULL
 THEN RAISE EXCEPTION '0134 requires Ekmivo control DB after 0133'; END IF;
END $$;

CREATE FUNCTION platform_subscription_coupon_admin(actor uuid, operation text, payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
  coupon platform_subscription_coupons%ROWTYPE;
  result jsonb;
  target_id uuid;
  expected_revision bigint;
  promo_code text;
  next_kind text;
  next_percent integer;
  next_fixed bigint;
  next_cap bigint;
  next_minimum bigint;
  next_limit bigint;
  next_store_limit integer;
  next_offers text[];
  next_starts timestamptz;
  next_expires timestamptz;
  desired text;
  explanation text;
  filter text;
  cursor_offset integer;
BEGIN
 IF NOT EXISTS (
   SELECT 1 FROM platform_administrators p JOIN app_users u ON u.id=p.user_id
   WHERE p.user_id=actor AND p.role='super_admin' AND u.disabled_at IS NULL
 ) THEN RAISE EXCEPTION 'super admin required' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(payload) IS DISTINCT FROM 'object' OR pg_column_size(payload)>16000
 THEN RAISE EXCEPTION 'invalid payload' USING ERRCODE='22023'; END IF;

 IF operation='list' THEN
   filter:=upper(trim(coalesce(payload->>'query','')));
   IF length(filter)>80 THEN RAISE EXCEPTION 'query too long' USING ERRCODE='22023'; END IF;
   cursor_offset:=coalesce((payload->>'offset')::integer,0);
   IF cursor_offset NOT BETWEEN 0 AND 100000 THEN RAISE EXCEPTION 'invalid cursor' USING ERRCODE='22023'; END IF;
   desired:=coalesce(payload->>'status','all');
   IF desired NOT IN ('all','draft','scheduled','active','paused','expired','archived')
   THEN RAISE EXCEPTION 'invalid status' USING ERRCODE='22023'; END IF;
   SELECT coalesce(jsonb_agg(to_jsonb(q) ORDER BY q.created_at DESC,q.id DESC),'[]'::jsonb)
   INTO result FROM (
     SELECT c.id,c.code_normalized,c.status,c.discount_kind,c.percent_bps,c.fixed_minor,
       c.max_discount_minor,c.min_subtotal_minor,c.max_redemptions,c.max_per_store,
       c.first_purchase_only,c.stack_with_annual,c.stack_with_bundle,c.eligible_offer_keys,
       c.starts_at,c.expires_at,c.revision,c.created_at,c.updated_at,
       (SELECT count(*) FROM platform_subscription_coupon_redemptions d WHERE d.coupon_id=c.id) AS redeemed,
       (SELECT count(*) FROM platform_subscription_coupon_reservations r WHERE r.coupon_id=c.id AND r.status='reserved' AND r.expires_at>now()) AS reserved
     FROM platform_subscription_coupons c
     WHERE (filter='' OR position(filter in c.code_normalized)>0)
       AND (desired='all' OR c.status=desired)
     ORDER BY c.created_at DESC,c.id DESC LIMIT 26 OFFSET cursor_offset
   ) q;
   RETURN jsonb_build_object('coupons',result,'next_offset',CASE WHEN jsonb_array_length(result)>25 THEN cursor_offset+25 ELSE NULL END);
 END IF;

 explanation:=trim(coalesce(payload->>'reason',''));
 IF length(explanation) NOT BETWEEN 10 AND 500
 THEN RAISE EXCEPTION 'audit reason must be 10-500 characters' USING ERRCODE='22023'; END IF;

 IF operation='save' THEN
   promo_code:=upper(trim(coalesce(payload->>'code','')));
   IF promo_code!~'^[A-Z0-9][A-Z0-9_-]{2,31}$' THEN RAISE EXCEPTION 'invalid code' USING ERRCODE='22023'; END IF;
   next_kind:=coalesce(payload->>'discount_kind','');
   IF next_kind NOT IN ('percent','fixed') THEN RAISE EXCEPTION 'invalid discount type' USING ERRCODE='22023'; END IF;
   next_percent:=nullif(payload->>'percent_bps','')::integer;
   next_fixed:=nullif(payload->>'fixed_minor','')::bigint;
   next_cap:=nullif(payload->>'max_discount_minor','')::bigint;
   next_minimum:=coalesce(nullif(payload->>'min_subtotal_minor','')::bigint,0);
   next_limit:=nullif(payload->>'max_redemptions','')::bigint;
   next_store_limit:=nullif(payload->>'max_per_store','')::integer;
   next_starts:=nullif(payload->>'starts_at','')::timestamptz;
   next_expires:=nullif(payload->>'expires_at','')::timestamptz;
   IF (next_kind='percent' AND (next_percent NOT BETWEEN 1 AND 10000 OR next_fixed IS NOT NULL))
      OR (next_kind='fixed' AND (next_fixed IS NULL OR next_fixed NOT BETWEEN 1 AND 100000000000 OR next_percent IS NOT NULL))
      OR (next_cap IS NOT NULL AND next_cap NOT BETWEEN 1 AND 100000000000)
      OR next_minimum NOT BETWEEN 0 AND 100000000000
      OR (next_limit IS NOT NULL AND next_limit NOT BETWEEN 1 AND 100000000)
      OR (next_store_limit IS NOT NULL AND next_store_limit NOT BETWEEN 1 AND 1000000)
      OR (next_expires IS NOT NULL AND (next_starts IS NULL OR next_expires<=next_starts))
   THEN RAISE EXCEPTION 'invalid monetary or date limits' USING ERRCODE='22023'; END IF;
   IF jsonb_typeof(payload->'eligible_offer_keys') IS DISTINCT FROM 'array'
      OR jsonb_array_length(payload->'eligible_offer_keys')>100
   THEN RAISE EXCEPTION 'invalid eligible offers' USING ERRCODE='22023'; END IF;
   SELECT coalesce(array_agg(DISTINCT x),ARRAY[]::text[]) INTO next_offers
   FROM jsonb_array_elements_text(payload->'eligible_offer_keys') AS x;
   IF EXISTS (SELECT 1 FROM unnest(next_offers) AS x
              WHERE x!~'^[a-z][a-z0-9_-]{2,63}$'
              OR NOT EXISTS (SELECT 1 FROM platform_subscription_offers o WHERE o.offer_key=x))
   THEN RAISE EXCEPTION 'unknown eligible offer' USING ERRCODE='22023'; END IF;
   IF payload->>'id' IS NULL OR payload->>'id'='' THEN
     INSERT INTO platform_subscription_coupons(code_normalized,discount_kind,percent_bps,fixed_minor,
       max_discount_minor,min_subtotal_minor,max_redemptions,max_per_store,
       first_purchase_only,stack_with_annual,stack_with_bundle,eligible_offer_keys,
       starts_at,expires_at,created_by,updated_by)
     VALUES (promo_code,next_kind,next_percent,next_fixed,next_cap,next_minimum,next_limit,next_store_limit,
       coalesce((payload->>'first_purchase_only')::boolean,false),
       coalesce((payload->>'stack_with_annual')::boolean,false),
       coalesce((payload->>'stack_with_bundle')::boolean,false),next_offers,
       next_starts,next_expires,actor,actor) RETURNING * INTO coupon;
   ELSE
     target_id:=(payload->>'id')::uuid;
     expected_revision:=(payload->>'revision')::bigint;
     SELECT * INTO coupon FROM platform_subscription_coupons WHERE id=target_id FOR UPDATE;
     IF NOT FOUND THEN RAISE EXCEPTION 'coupon not found' USING ERRCODE='P0002'; END IF;
     IF coupon.revision IS DISTINCT FROM expected_revision THEN RAISE EXCEPTION 'coupon revision changed' USING ERRCODE='40001'; END IF;
     IF coupon.status NOT IN ('draft','paused') OR EXISTS (
       SELECT 1 FROM platform_subscription_purchase_intents i WHERE i.coupon_id=target_id
     ) OR EXISTS (SELECT 1 FROM platform_subscription_coupon_reservations r WHERE r.coupon_id=target_id)
       OR EXISTS (SELECT 1 FROM platform_subscription_coupon_redemptions d WHERE d.coupon_id=target_id)
     THEN RAISE EXCEPTION 'coupon cannot be edited after use or while active' USING ERRCODE='23514'; END IF;
     UPDATE platform_subscription_coupons SET code_normalized=promo_code,discount_kind=next_kind,
       percent_bps=next_percent,fixed_minor=next_fixed,max_discount_minor=next_cap,
       min_subtotal_minor=next_minimum,max_redemptions=next_limit,max_per_store=next_store_limit,
       first_purchase_only=coalesce((payload->>'first_purchase_only')::boolean,false),
       stack_with_annual=coalesce((payload->>'stack_with_annual')::boolean,false),
       stack_with_bundle=coalesce((payload->>'stack_with_bundle')::boolean,false),
       eligible_offer_keys=next_offers,starts_at=next_starts,expires_at=next_expires,
       updated_by=actor,updated_at=now(),revision=revision+1
     WHERE id=target_id RETURNING * INTO coupon;
   END IF;
 ELSIF operation='transition' THEN
   target_id:=(payload->>'id')::uuid;
   expected_revision:=(payload->>'revision')::bigint;
   desired:=coalesce(payload->>'status','');
   SELECT * INTO coupon FROM platform_subscription_coupons WHERE id=target_id FOR UPDATE;
   IF NOT FOUND THEN RAISE EXCEPTION 'coupon not found' USING ERRCODE='P0002'; END IF;
   IF coupon.revision IS DISTINCT FROM expected_revision THEN RAISE EXCEPTION 'coupon revision changed' USING ERRCODE='40001'; END IF;
   IF coupon.status='archived' OR (desired='active' AND (
       (coupon.starts_at IS NOT NULL AND coupon.starts_at>now()) OR
       (coupon.expires_at IS NOT NULL AND coupon.expires_at<=now())))
       OR (desired='scheduled' AND (coupon.starts_at IS NULL OR coupon.starts_at<=now()
         OR coupon.expires_at IS NOT NULL AND coupon.expires_at<=coupon.starts_at))
       OR desired NOT IN ('active','scheduled','paused','archived','expired')
   THEN RAISE EXCEPTION 'invalid coupon status transition' USING ERRCODE='23514'; END IF;
   UPDATE platform_subscription_coupons SET status=desired,updated_by=actor,
     updated_at=now(),revision=revision+1 WHERE id=target_id RETURNING * INTO coupon;
 ELSE RAISE EXCEPTION 'unsupported operation' USING ERRCODE='22023'; END IF;

 INSERT INTO platform_admin_audit(actor_id,action,subject_id,description)
 VALUES(actor,'subscription_coupon.'||operation,coupon.id,
   left(coupon.code_normalized||' | '||coupon.status||' | revision='||coupon.revision||' | '||explanation,2000));
 RETURN jsonb_build_object('id',coupon.id,'code',coupon.code_normalized,'status',coupon.status,'revision',coupon.revision);
END $$;
REVOKE ALL ON FUNCTION platform_subscription_coupon_admin(uuid,text,jsonb) FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='ekmivo_runtime') THEN
   GRANT EXECUTE ON FUNCTION platform_subscription_coupon_admin(uuid,text,jsonb) TO ekmivo_runtime;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='ekmivo_financial_runtime') THEN
   GRANT EXECUTE ON FUNCTION platform_subscription_coupon_admin(uuid,text,jsonb) TO ekmivo_financial_runtime;
 END IF;
END $$;
COMMIT;
