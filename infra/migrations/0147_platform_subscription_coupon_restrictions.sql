-- Control only, after 0146. Add explicit product/term scoping and safe
-- post-use revision authoring without changing any installed migration.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF current_database()<>'ekmivo' OR to_regclass('public.financial_realm') IS NOT NULL
 OR to_regprocedure('public.platform_subscription_coupon_quote(uuid,uuid,uuid,bigint,text)') IS NULL
 THEN RAISE EXCEPTION '0147 requires control after 0146'; END IF;
END $$;

ALTER TABLE platform_subscription_coupons
 ADD COLUMN eligible_products text[] NOT NULL DEFAULT '{}'
   CHECK(eligible_products <@ ARRAY['payments','ai_credit','bundle']::text[]),
 ADD COLUMN eligible_terms text[] NOT NULL DEFAULT '{}'
   CHECK(eligible_terms <@ ARRAY['monthly','yearly','one_time']::text[]);

-- Existing committed revisions remain immutable. New edits append a revision;
-- a pending invoice holds its original quote, discount and coupon version.
DO $patch$
DECLARE source text; item record; modifications text[][] := ARRAY[
 ARRAY[$old$  next_offers text[];$old$,$new$  next_offers text[];
  next_products text[];
  next_terms text[];$new$],
 ARRAY[$old$c.first_purchase_only,c.stack_with_annual,c.stack_with_bundle,c.eligible_offer_keys,$old$,
       $new$c.first_purchase_only,c.stack_with_annual,c.stack_with_bundle,c.eligible_offer_keys,
       c.eligible_products,c.eligible_terms,$new$],
 ARRAY[$old$   IF payload->>'id' IS NULL OR payload->>'id'='' THEN$old$,
       $new$   IF jsonb_typeof(payload->'eligible_products') IS DISTINCT FROM 'array'
      OR jsonb_typeof(payload->'eligible_terms') IS DISTINCT FROM 'array'
      OR jsonb_array_length(payload->'eligible_products')>3
      OR jsonb_array_length(payload->'eligible_terms')>3
   THEN RAISE EXCEPTION 'invalid product or term restrictions' USING ERRCODE='22023'; END IF;
   SELECT coalesce(array_agg(DISTINCT x),ARRAY[]::text[]) INTO next_products
   FROM jsonb_array_elements_text(payload->'eligible_products') AS x;
   SELECT coalesce(array_agg(DISTINCT x),ARRAY[]::text[]) INTO next_terms
   FROM jsonb_array_elements_text(payload->'eligible_terms') AS x;
   IF EXISTS(SELECT 1 FROM unnest(next_products) x WHERE x NOT IN ('payments','ai_credit','bundle'))
      OR EXISTS(SELECT 1 FROM unnest(next_terms) x WHERE x NOT IN ('monthly','yearly','one_time'))
   THEN RAISE EXCEPTION 'unknown product or term restriction' USING ERRCODE='22023'; END IF;
   IF payload->>'id' IS NULL OR payload->>'id'='' THEN$new$],
 ARRAY[$old$first_purchase_only,stack_with_annual,stack_with_bundle,eligible_offer_keys,
       starts_at$old$,
       $new$first_purchase_only,stack_with_annual,stack_with_bundle,eligible_offer_keys,
       eligible_products,eligible_terms,starts_at$new$],
 ARRAY[$old$coalesce((payload->>'stack_with_bundle')::boolean,false),next_offers,
       next_starts$old$,
       $new$coalesce((payload->>'stack_with_bundle')::boolean,false),next_offers,next_products,next_terms,
       next_starts$new$],
 ARRAY[$old$     IF coupon.status NOT IN ('draft','paused') OR EXISTS (
       SELECT 1 FROM platform_subscription_purchase_intents i WHERE i.coupon_id=target_id
     ) OR EXISTS (SELECT 1 FROM platform_subscription_coupon_reservations r WHERE r.coupon_id=target_id)
       OR EXISTS (SELECT 1 FROM platform_subscription_coupon_redemptions d WHERE d.coupon_id=target_id)
     THEN RAISE EXCEPTION 'coupon cannot be edited after use or while active' USING ERRCODE='23514'; END IF;$old$,
       $new$     -- Explicit pause is required, but historical use is not an editing ban.
     IF coupon.status NOT IN ('draft','paused')
     THEN RAISE EXCEPTION 'pause coupon before editing' USING ERRCODE='23514'; END IF;
     -- Limits cannot be lowered under redeemed plus currently held capacity.
     IF next_limit IS NOT NULL AND next_limit < (
       (SELECT count(*) FROM platform_subscription_coupon_redemptions WHERE coupon_id=target_id)
       +(SELECT count(*) FROM platform_subscription_coupon_reservations WHERE coupon_id=target_id AND status='reserved'))
     THEN RAISE EXCEPTION 'limit below existing usage' USING ERRCODE='23514'; END IF;
     IF next_store_limit IS NOT NULL AND EXISTS(
       SELECT 1 FROM (
         SELECT workspace_id FROM platform_subscription_coupon_redemptions WHERE coupon_id=target_id
         UNION ALL SELECT workspace_id FROM platform_subscription_coupon_reservations
           WHERE coupon_id=target_id AND status='reserved'
       ) usage GROUP BY workspace_id HAVING count(*)>next_store_limit)
     THEN RAISE EXCEPTION 'store limit below existing usage' USING ERRCODE='23514'; END IF;$new$],
 ARRAY[$old$eligible_offer_keys=next_offers,starts_at=next_starts$old$,
       $new$eligible_offer_keys=next_offers,eligible_products=next_products,
       eligible_terms=next_terms,starts_at=next_starts$new$]
 ];
BEGIN
 SELECT pg_get_functiondef('platform_subscription_coupon_admin(uuid,text,jsonb)'::regprocedure) INTO source;
 FOR item IN SELECT modifications[n][1] AS old_part,modifications[n][2] AS new_part
             FROM generate_subscripts(modifications,1) AS n LOOP
   IF (length(source)-length(replace(source,item.old_part,'')))/length(item.old_part)<>1
   THEN RAISE EXCEPTION '0147 admin function source drift: %',left(item.old_part,70); END IF;
   source:=replace(source,item.old_part,item.new_part);
 END LOOP;
 EXECUTE source;
END $patch$;

DO $patch$
DECLARE source text; needle text := ' OR cardinality(c.eligible_offer_keys)>0 AND NOT(v.offer_key=ANY(c.eligible_offer_keys))';
BEGIN
 SELECT pg_get_functiondef('platform_subscription_coupon_quote(uuid,uuid,uuid,bigint,text)'::regprocedure) INTO source;
 IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1
 THEN RAISE EXCEPTION '0147 coupon quote source drift'; END IF;
 source:=replace(source,needle,
 ' OR cardinality(c.eligible_products)>0 AND NOT EXISTS (
   SELECT 1 FROM platform_subscription_offers scoped WHERE scoped.offer_key=v.offer_key
   AND scoped.product=ANY(c.eligible_products))
 OR cardinality(c.eligible_terms)>0 AND NOT(v.term=ANY(c.eligible_terms))'||needle);
 EXECUTE source;
END $patch$;
COMMIT;
