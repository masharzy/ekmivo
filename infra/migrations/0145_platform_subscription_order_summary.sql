-- Phase 5: control-plane checkout snapshots. No tax, payment or offer is activated.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF current_database()<>'ekmivo' OR to_regclass('public.platform_subscription_purchase_intents') IS NULL
  OR to_regclass('public.platform_subscription_policy_versions') IS NULL
  OR to_regclass('public.financial_realm') IS NOT NULL
 THEN RAISE EXCEPTION '0145 requires Ekmivo control database after 0144'; END IF;
END $$;

ALTER TABLE platform_subscription_purchase_intents ADD COLUMN quantity integer NOT NULL DEFAULT 1 CHECK(quantity BETWEEN 1 AND 1000);
ALTER TABLE platform_subscription_purchase_quotes ADD COLUMN tax_revision bigint;
ALTER TABLE platform_subscription_purchase_quotes ADD COLUMN coupon_revision bigint;
ALTER TABLE platform_subscription_policy_acceptances ADD COLUMN policy_kind text CHECK(policy_kind IN ('terms','privacy','refund'));
ALTER TABLE platform_subscription_policy_acceptances ADD COLUMN policy_version_label text;
ALTER TABLE platform_subscription_policy_acceptances ADD COLUMN policy_content_sha256 text CHECK(policy_content_sha256~'^[a-f0-9]{64}$');

-- Absence means checkout cannot quote: there is intentionally no invented zero tax.
CREATE TABLE platform_subscription_tax_settings (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 rate_bps integer NOT NULL CHECK(rate_bps BETWEEN 0 AND 10000),
 revision bigint NOT NULL DEFAULT 1,
 updated_by uuid NOT NULL REFERENCES app_users(id),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE platform_subscription_tax_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_subscription_tax_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_subscription_tax_settings_owner ON platform_subscription_tax_settings TO CURRENT_USER USING(true) WITH CHECK(true);
REVOKE ALL ON platform_subscription_tax_settings FROM PUBLIC;

CREATE TABLE platform_subscription_order_confirmations (
 intent_id uuid PRIMARY KEY REFERENCES platform_subscription_purchase_intents(id) ON DELETE RESTRICT,
 quote_id uuid NOT NULL UNIQUE REFERENCES platform_subscription_purchase_quotes(id) ON DELETE RESTRICT,
 invoice_id uuid NOT NULL UNIQUE REFERENCES pg13_platform_invoices(id) ON DELETE RESTRICT,
 workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
 actor_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 16 AND 128),
 snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
 accepted_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,idempotency_key)
);
ALTER TABLE platform_subscription_order_confirmations ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_subscription_order_confirmations FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_subscription_order_confirmations_owner ON platform_subscription_order_confirmations TO CURRENT_USER USING(true) WITH CHECK(true);
REVOKE ALL ON platform_subscription_order_confirmations FROM PUBLIC;

CREATE FUNCTION platform_subscription_tax_admin(actor uuid, expected_revision bigint, rate integer, reason text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE prior bigint; BEGIN
 IF NOT EXISTS(SELECT 1 FROM platform_administrators p JOIN app_users u ON u.id=p.user_id
  WHERE p.user_id=actor AND p.role='super_admin' AND u.disabled_at IS NULL)
 THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 IF rate NOT BETWEEN 0 AND 10000 OR length(trim(reason)) NOT BETWEEN 10 AND 500
 THEN RAISE EXCEPTION 'INVALID_ORDER_REQUEST'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('platform-subscription-tax',0));
 SELECT revision INTO prior FROM platform_subscription_tax_settings WHERE singleton FOR UPDATE;
 IF coalesce(prior,0)<>expected_revision THEN RAISE EXCEPTION 'TAX_CHANGED'; END IF;
 INSERT INTO platform_subscription_tax_settings(singleton,rate_bps,revision,updated_by)
 VALUES(true,rate,coalesce(prior,0)+1,actor)
 ON CONFLICT(singleton) DO UPDATE SET rate_bps=excluded.rate_bps,revision=excluded.revision,
 updated_by=excluded.updated_by,updated_at=now();
 INSERT INTO platform_admin_audit(actor_id,action,description)
 VALUES(actor,'subscription_tax.configure',left('Revision '||(coalesce(prior,0)+1)||' | '||trim(reason),1800));
 RETURN jsonb_build_object('revision',coalesce(prior,0)+1,'rate_bps',rate);
END $$;

CREATE FUNCTION platform_subscription_order_request(w uuid,a uuid,purchase uuid,operation text,payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 intent platform_subscription_purchase_intents%ROWTYPE;
 offer platform_subscription_offers%ROWTYPE;
 variant platform_subscription_offer_versions%ROWTYPE;
 promo platform_subscription_coupons%ROWTYPE;
 quote platform_subscription_purchase_quotes%ROWTYPE;
 tax platform_subscription_tax_settings%ROWTYPE;
 confirmed platform_subscription_order_confirmations%ROWTYPE;
 version payment_plan_versions%ROWTYPE;
 plan payment_plan_catalog%ROWTYPE;
 policies jsonb; base numeric; promo_discount numeric:=0; tax_amount numeric; final_amount numeric;
 code text; key text; chosen_coupon uuid; status text; previous_revision bigint;
 used_count bigint; store_count bigint; units integer; kinds text[]:=ARRAY['terms','privacy','refund']; kind text;
 policy platform_subscription_policy_versions%ROWTYPE; legal jsonb:='{}'::jsonb;
 invoice pg13_platform_invoices%ROWTYPE; result jsonb; summary jsonb; compare_amount numeric;
BEGIN
 IF operation NOT IN ('read','quote','confirm') OR jsonb_typeof(payload) IS DISTINCT FROM 'object'
  OR pg_column_size(payload)>4096 THEN RAISE EXCEPTION 'INVALID_ORDER_REQUEST'; END IF;
 PERFORM pg13_actor(w,a,true);
 IF pg13_capability_override(w,a,'workspace:settings') IS FALSE
 THEN RAISE EXCEPTION 'ACCESS_DENIED' USING ERRCODE='42501'; END IF;
 IF NOT EXISTS(SELECT 1 FROM platform_primary_stores s WHERE s.user_id=a AND s.workspace_id=w)
 THEN RAISE EXCEPTION 'STORE_CHANGED' USING ERRCODE='42501'; END IF;
 IF operation<>'read' THEN PERFORM pg_advisory_xact_lock(hashtextextended('subscription-order:'||purchase::text,0)); END IF;
 SELECT * INTO intent FROM platform_subscription_purchase_intents
 WHERE id=purchase AND actor_id=a AND workspace_id=w
 FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'ORDER_NOT_FOUND'; END IF;

 SELECT * INTO confirmed FROM platform_subscription_order_confirmations WHERE intent_id=purchase;
 IF confirmed.intent_id IS NOT NULL THEN
  -- Re-check owner authorization, but do not generate a second invoice or rewrite immutable accepted versions.
  RETURN jsonb_build_object('status','confirmed','invoice_id',confirmed.invoice_id,
   'quote_id',confirmed.quote_id,'total_minor',confirmed.snapshot->>'total_minor',
   'currency','BDT','snapshot',confirmed.snapshot);
 END IF;
 IF intent.expires_at<=now() OR intent.status IN ('expired','cancelled','paid')
 THEN RAISE EXCEPTION 'ORDER_EXPIRED'; END IF;

 SELECT * INTO variant FROM platform_subscription_offer_versions WHERE id=intent.offer_version_id;
 SELECT * INTO offer FROM platform_subscription_offers WHERE offer_key=variant.offer_key;
 IF offer.offer_key IS NULL OR offer.status<>'published' OR offer.current_version_id<>variant.id
  OR variant.currency<>'BDT' THEN RAISE EXCEPTION 'PRICE_CHANGED'; END IF;
 IF variant.payment_plan_version_id IS NOT NULL THEN
  SELECT * INTO version FROM payment_plan_versions WHERE id=variant.payment_plan_version_id;
  SELECT * INTO plan FROM payment_plan_catalog WHERE plan_id=version.plan_id;
  IF plan.status IS DISTINCT FROM 'published' OR plan.visibility IS DISTINCT FROM 'public'
   OR plan.current_version IS DISTINCT FROM version.id OR version.terms->>'kind'<>'paid'
  THEN RAISE EXCEPTION 'PLAN_CHANGED'; END IF;
 END IF;
 policies:=platform_subscription_policy_public();
 IF NOT (policies ?& kinds) THEN RAISE EXCEPTION 'POLICY_UNAVAILABLE'; END IF;
 SELECT * INTO tax FROM platform_subscription_tax_settings WHERE singleton;
 IF tax.singleton IS NULL THEN RAISE EXCEPTION 'TAX_NOT_CONFIGURED'; END IF;
 units:=intent.quantity;
 IF units NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'INVALID_ORDER_REQUEST'; END IF;
 base:=variant.amount_minor::numeric*units;
 IF base>100000000000 THEN RAISE EXCEPTION 'AMOUNT_OUT_OF_RANGE'; END IF;

 IF operation='read' THEN
  SELECT * INTO quote FROM platform_subscription_purchase_quotes q WHERE q.intent_id=purchase
  ORDER BY q.revision DESC LIMIT 1;
  RETURN jsonb_build_object('status',intent.status,'intent_id',intent.id,'store_id',w,
   'expires_at',intent.expires_at,'offer',jsonb_build_object('key',offer.offer_key,'product',offer.product,
    'term',variant.term,'version_id',variant.id,'quantity',units,'name',variant.terms->>'name',
    'name_bn',variant.terms->>'name_bn','included_ai_credits',variant.terms->>'included_ai_credits'),
   'policies',policies,'quote',CASE WHEN quote.id IS NULL THEN NULL ELSE jsonb_build_object(
    'id',quote.id,'subtotal_minor',quote.subtotal_minor::text,'annual_discount_minor',quote.annual_discount_minor::text,
    'bundle_discount_minor',quote.bundle_discount_minor::text,'coupon_discount_minor',quote.coupon_discount_minor::text,
    'tax_minor',quote.tax_minor::text,'total_minor',quote.total_minor::text,'currency','BDT',
    'expires_at',quote.expires_at,'coupon_code',(SELECT c.code_normalized FROM platform_subscription_coupons c WHERE c.id=quote.coupon_id),
    'lines',(SELECT coalesce(jsonb_agg(jsonb_build_object('label',l.label,'quantity',l.quantity,
      'unit_price_minor',l.unit_price_minor::text,'subtotal_minor',l.subtotal_minor::text)
     ORDER BY l.line_no),'[]'::jsonb) FROM platform_subscription_quote_lines l WHERE l.quote_id=quote.id)) END);
 END IF;

 IF operation='quote' THEN
  IF intent.status='confirmed' THEN RAISE EXCEPTION 'ORDER_CONFIRMED'; END IF;
  IF payload ? 'coupon_code' THEN
   code:=upper(trim(coalesce(payload->>'coupon_code','')));
   IF code<>'' AND code!~'^[A-Z0-9][A-Z0-9_-]{2,31}$' THEN RAISE EXCEPTION 'COUPON_INVALID'; END IF;
   chosen_coupon:=NULL;
   IF code<>'' THEN
    SELECT id INTO chosen_coupon FROM platform_subscription_coupons WHERE code_normalized=code;
    IF chosen_coupon IS NULL THEN RAISE EXCEPTION 'COUPON_INVALID'; END IF;
   END IF;
  ELSE chosen_coupon:=intent.coupon_id; END IF;
 ELSE
  IF coalesce(payload->>'quote_id','')!~'^[0-9a-fA-F-]{36}$'
  THEN RAISE EXCEPTION 'QUOTE_STALE'; END IF;
  SELECT * INTO quote FROM platform_subscription_purchase_quotes
   WHERE id=(payload->>'quote_id')::uuid AND intent_id=purchase FOR UPDATE;
  IF quote.id IS NULL OR quote.expires_at<=now() OR quote.offer_version_id<>variant.id
   OR quote.tax_revision IS DISTINCT FROM tax.revision
   OR quote.revision<>intent.revision
  THEN RAISE EXCEPTION 'QUOTE_STALE'; END IF;
  chosen_coupon:=quote.coupon_id;
 END IF;

 IF chosen_coupon IS NOT NULL THEN
  SELECT * INTO promo FROM platform_subscription_coupons WHERE id=chosen_coupon FOR UPDATE;
  IF promo.id IS NULL OR promo.status NOT IN ('active','scheduled') THEN RAISE EXCEPTION 'COUPON_INVALID'; END IF;
  IF promo.starts_at IS NOT NULL AND promo.starts_at>now() THEN RAISE EXCEPTION 'COUPON_INVALID'; END IF;
  IF promo.expires_at IS NOT NULL AND promo.expires_at<=now() THEN RAISE EXCEPTION 'COUPON_EXPIRED'; END IF;
  IF array_length(promo.eligible_offer_keys,1) IS NOT NULL AND NOT offer.offer_key=ANY(promo.eligible_offer_keys)
   THEN RAISE EXCEPTION 'COUPON_INELIGIBLE'; END IF;
  IF base<promo.min_subtotal_minor OR (variant.term='yearly' AND NOT promo.stack_with_annual)
    OR (offer.product='bundle' AND NOT promo.stack_with_bundle)
   THEN RAISE EXCEPTION 'COUPON_INELIGIBLE'; END IF;
  IF promo.first_purchase_only AND (EXISTS(SELECT 1 FROM pg13_platform_invoices i WHERE i.workspace_id=w AND i.status='paid')
    OR EXISTS(SELECT 1 FROM platform_subscription_coupon_reservations r
       WHERE r.workspace_id=w AND r.intent_id<>purchase AND r.status='reserved' AND r.expires_at>now()))
   THEN RAISE EXCEPTION 'COUPON_INELIGIBLE'; END IF;
  SELECT (SELECT count(*) FROM platform_subscription_coupon_redemptions WHERE coupon_id=promo.id)
    +(SELECT count(*) FROM platform_subscription_coupon_reservations
      WHERE coupon_id=promo.id AND status='reserved' AND expires_at>now() AND intent_id<>purchase)
  INTO used_count;
  SELECT (SELECT count(*) FROM platform_subscription_coupon_redemptions WHERE coupon_id=promo.id AND workspace_id=w)
    +(SELECT count(*) FROM platform_subscription_coupon_reservations
      WHERE coupon_id=promo.id AND workspace_id=w AND status='reserved' AND expires_at>now() AND intent_id<>purchase)
  INTO store_count;
  IF promo.max_redemptions IS NOT NULL AND used_count>=promo.max_redemptions
    OR promo.max_per_store IS NOT NULL AND store_count>=promo.max_per_store
   THEN RAISE EXCEPTION 'COUPON_EXHAUSTED'; END IF;
  IF promo.discount_kind='percent' THEN promo_discount:=floor(base*promo.percent_bps/10000);
  ELSE promo_discount:=promo.fixed_minor; END IF;
  IF promo.max_discount_minor IS NOT NULL THEN promo_discount:=least(promo_discount,promo.max_discount_minor); END IF;
  promo_discount:=least(base,promo_discount);
  IF operation='confirm' AND quote.coupon_revision IS DISTINCT FROM promo.revision
   THEN RAISE EXCEPTION 'QUOTE_STALE'; END IF;
 ELSIF operation='confirm' AND quote.coupon_revision IS NOT NULL THEN RAISE EXCEPTION 'QUOTE_STALE';
 END IF;
 -- Published annual and bundle amounts are already their final prices. Do not
 -- manufacture a comparison or savings claim without a separately published baseline.
 tax_amount:=floor((base-promo_discount)*tax.rate_bps/10000);
 final_amount:=base-promo_discount+tax_amount;
 IF final_amount>100000000000 THEN RAISE EXCEPTION 'AMOUNT_OUT_OF_RANGE'; END IF;
 IF operation='confirm' AND (quote.subtotal_minor<>base OR quote.coupon_discount_minor<>promo_discount
  OR quote.tax_minor<>tax_amount OR quote.total_minor<>final_amount)
 THEN RAISE EXCEPTION 'QUOTE_STALE'; END IF;

 IF operation='quote' THEN
  previous_revision:=intent.revision+1;
  UPDATE platform_subscription_purchase_intents SET coupon_id=chosen_coupon,revision=previous_revision,
    status='quoted',updated_at=now() WHERE id=purchase;
  INSERT INTO platform_subscription_purchase_quotes(intent_id,revision,offer_version_id,coupon_id,
    subtotal_minor,coupon_discount_minor,tax_minor,total_minor,tax_revision,coupon_revision)
  VALUES(purchase,previous_revision,variant.id,chosen_coupon,base::bigint,promo_discount::bigint,
    tax_amount::bigint,final_amount::bigint,tax.revision,promo.revision) RETURNING * INTO quote;
  INSERT INTO platform_subscription_quote_lines(quote_id,line_no,label,offer_version_id,quantity,unit_price_minor,subtotal_minor)
   VALUES(quote.id,1,variant.terms->>'name',variant.id,units,variant.amount_minor,base::bigint);
  INSERT INTO platform_subscription_purchase_audit(intent_id,actor_id,action,detail)
   VALUES(purchase,a,'order.quoted',jsonb_build_object('quote_id',quote.id,'coupon_id',chosen_coupon,'tax_revision',tax.revision));
  RETURN jsonb_build_object('quote_id',quote.id,'status','quoted','revision',quote.revision);
 END IF;

 IF quote.total_minor<=0 THEN RAISE EXCEPTION 'ZERO_DUE_UNAPPROVED'; END IF;
 -- The Phase 6 AI/bundle/yearly entitlement adapter is not yet authorized.
 IF offer.product<>'payments' OR variant.term<>'monthly' OR units<>1
 THEN RAISE EXCEPTION 'FULFILLMENT_NOT_READY'; END IF;
 IF quote.annual_discount_minor<>0 OR quote.bundle_discount_minor<>0
 THEN RAISE EXCEPTION 'FULFILLMENT_NOT_READY'; END IF;
 key:=coalesce(payload->>'idempotency_key','');
 IF length(key) NOT BETWEEN 16 AND 128 OR key!~'^[A-Za-z0-9_-]+$'
 THEN RAISE EXCEPTION 'INVALID_IDEMPOTENCY_KEY'; END IF;
 IF EXISTS(SELECT 1 FROM platform_subscription_order_confirmations c WHERE c.workspace_id=w AND c.idempotency_key=key)
 THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT'; END IF;
 FOREACH kind IN ARRAY kinds LOOP
  PERFORM pg_advisory_xact_lock(hashtextextended('ekmivo-policy-'||kind,0));
  SELECT * INTO policy FROM platform_subscription_policy_versions WHERE status='published' AND platform_subscription_policy_versions.kind=kind;
  IF policy.id IS NULL OR payload->'consents'->kind->'accepted' IS DISTINCT FROM 'true'::jsonb
   THEN RAISE EXCEPTION 'POLICY_ACCEPTANCE_REQUIRED'; END IF;
  IF payload->'consents'->kind->>'id' IS DISTINCT FROM policy.id::text
    OR payload->'consents'->kind->>'sha256' IS DISTINCT FROM policy.content_sha256
   THEN RAISE EXCEPTION 'POLICY_CHANGED'; END IF;
  legal:=legal||jsonb_build_object(kind,jsonb_build_object('id',policy.id,'version',policy.version_label,'sha256',policy.content_sha256));
 END LOOP;
 INSERT INTO pg13_platform_invoices(workspace_id,plan_id,plan_version_id,amount_minor,period_days,
  grace_days,creation_key,cycle_count,billing_operation,tax_minor)
 VALUES(w,version.plan_id,version.id,final_amount::bigint,(version.terms->>'period_days')::integer*units,
  (version.terms->>'grace_days')::integer,'saas-order:'||purchase::text,1,'purchase',tax_amount::bigint)
 RETURNING * INTO invoice;
 FOREACH kind IN ARRAY kinds LOOP
  SELECT * INTO policy FROM platform_subscription_policy_versions WHERE id=(legal->kind->>'id')::uuid;
  INSERT INTO platform_subscription_policy_acceptances(intent_id,actor_id,workspace_id,policy_version_id,
    policy_kind,policy_version_label,policy_content_sha256)
  VALUES(purchase,a,w,policy.id,kind,policy.version_label,policy.content_sha256);
 END LOOP;
 IF chosen_coupon IS NOT NULL THEN
  INSERT INTO platform_subscription_coupon_reservations(coupon_id,intent_id,quote_id,actor_id,workspace_id,expires_at)
  VALUES(chosen_coupon,purchase,quote.id,a,w,now()+interval '60 minutes');
 END IF;
 summary:=jsonb_build_object('intent_id',purchase,'quote_id',quote.id,'offer_version_id',variant.id,
   'product',offer.product,'term',variant.term,'quantity',units,'subtotal_minor',base::bigint::text,
   'coupon_discount_minor',promo_discount::bigint::text,'tax_minor',tax_amount::bigint::text,
   'total_minor',final_amount::bigint::text,'currency','BDT','coupon_id',chosen_coupon,
   'tax_revision',tax.revision,'coupon_revision',promo.revision,'legal',legal,
   'lines',(SELECT coalesce(jsonb_agg(jsonb_build_object('label',l.label,
       'quantity',l.quantity,'unit_price_minor',l.unit_price_minor::text,
       'subtotal_minor',l.subtotal_minor::text) ORDER BY l.line_no),'[]'::jsonb)
       FROM platform_subscription_quote_lines l WHERE l.quote_id=quote.id));
  INSERT INTO platform_subscription_order_confirmations(intent_id,quote_id,invoice_id,workspace_id,actor_id,idempotency_key,snapshot)
   VALUES(purchase,quote.id,invoice.id,w,a,key,summary);
  UPDATE platform_subscription_purchase_intents SET status='confirmed',confirmed_invoice_id=invoice.id,updated_at=now()
   WHERE id=purchase;
  INSERT INTO platform_subscription_purchase_audit(intent_id,actor_id,action,detail)
   VALUES(purchase,a,'order.confirmed',jsonb_build_object('invoice_id',invoice.id,'quote_id',quote.id));
  RETURN jsonb_build_object('status','confirmed','invoice_id',invoice.id,'quote_id',quote.id,
    'total_minor',final_amount::bigint::text,'currency','BDT','snapshot',summary);
END $$;

REVOKE ALL ON FUNCTION platform_subscription_order_request(uuid,uuid,uuid,text,jsonb),
 platform_subscription_tax_admin(uuid,bigint,integer,text) FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='ekmivo_runtime') THEN
  GRANT EXECUTE ON FUNCTION platform_subscription_order_request(uuid,uuid,uuid,text,jsonb),
   platform_subscription_tax_admin(uuid,bigint,integer,text) TO ekmivo_runtime;
 END IF;
END $$;
COMMIT;
