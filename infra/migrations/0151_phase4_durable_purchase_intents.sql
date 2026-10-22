-- Phase 4 (after Phase 3 0145-0149): durable opaque purchase handles and independently bound guest sessions.
-- Additive only. This migration must be checked on an isolated Neon branch before deployment.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $$ BEGIN
 IF current_database() <> 'ekmivo'
 OR to_regclass('public.platform_subscription_purchase_intents') IS NULL
 OR to_regclass('public.financial_realm') IS NOT NULL
 THEN RAISE EXCEPTION 'phase 4 migration requires Ekmivo control database'; END IF;
END $$;

ALTER TABLE platform_subscription_purchase_intents
 ADD COLUMN public_token_sha256 text,
 ADD COLUMN guest_session_sha256 text,
 ADD COLUMN requested_quantity integer NOT NULL DEFAULT 1,
 ADD COLUMN legacy_plan_id text,
 ADD CONSTRAINT platform_purchase_token_digest_ck
  CHECK(public_token_sha256 IS NULL OR public_token_sha256 ~ '^[a-f0-9]{64}$'),
 ADD CONSTRAINT platform_purchase_guest_session_digest_ck
  CHECK(guest_session_sha256 IS NULL OR guest_session_sha256 ~ '^[a-f0-9]{64}$'),
 ADD CONSTRAINT platform_purchase_quantity_ck CHECK(requested_quantity BETWEEN 1 AND 100000),
 ADD CONSTRAINT platform_purchase_legacy_plan_ck
  CHECK(legacy_plan_id IS NULL OR legacy_plan_id ~ '^[a-z][a-z0-9_-]{1,39}$'),
 ADD CONSTRAINT platform_purchase_expiration_bound_ck
  CHECK(expires_at <= created_at + interval '7 days');

CREATE UNIQUE INDEX platform_purchase_public_token_idx
 ON platform_subscription_purchase_intents(public_token_sha256)
 WHERE public_token_sha256 IS NOT NULL;
CREATE INDEX platform_purchase_guest_session_idx
 ON platform_subscription_purchase_intents(guest_session_sha256,created_at DESC)
 WHERE guest_session_sha256 IS NOT NULL;
CREATE INDEX platform_purchase_actor_status_idx
 ON platform_subscription_purchase_intents(actor_id,created_at DESC)
 WHERE actor_id IS NOT NULL;

COMMENT ON COLUMN platform_subscription_purchase_intents.public_token_sha256 IS
 'SHA-256 of a random 256-bit capability embedded in /checkout/order/{token}; never store the raw token';
COMMENT ON COLUMN platform_subscription_purchase_intents.guest_session_sha256 IS
 'SHA-256 of the separate random HttpOnly SameSite=Lax guest session secret; not a bearer in URLs';
-- Claiming a free entitlement is distinct from a financially verified paid state.
ALTER TABLE platform_subscription_purchase_intents
 DROP CONSTRAINT IF EXISTS platform_subscription_purchase_intents_status_check;
ALTER TABLE platform_subscription_purchase_intents
 ADD CONSTRAINT platform_subscription_purchase_intents_status_check
 CHECK(status IN ('selected','quoted','confirmed','paid','cancelled','expired','claimed_free'));


-- All browser-facing lifecycle operations cross this audited SECURITY DEFINER boundary.
-- The application runtime is never granted raw UPDATE/SELECT on the RLS tables.
CREATE FUNCTION platform_subscription_intent_command(
 operation text, actor uuid, guest_digest text, capability_digest text,
 data jsonb DEFAULT '{}'::jsonb
) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=pg_catalog,public,pg_temp AS $phase4$
DECLARE
 intent_row record; v record;
 requested_offer text; selected_term text; code text; creation_digest text;
 store uuid; selection_version text; requested bigint; expected bigint;
 coupon_uuid uuid; plan_id text; old_status text; is_admin boolean;
BEGIN
 IF operation NOT IN ('create','read','bind_identity','bind_store','cancel','claim_free','revalidate')
 OR capability_digest IS NULL OR capability_digest !~ '^[a-f0-9]{64}
COMMIT;
 OR (guest_digest IS NOT NULL AND guest_digest !~ '^[a-f0-9]{64}
COMMIT;)
 OR data IS NULL OR jsonb_typeof(data)<>'object' OR pg_column_size(data)>4096
 THEN RAISE EXCEPTION 'INVALID_INTENT_REQUEST' USING ERRCODE='22023'; END IF;

 IF operation='create' THEN
  creation_digest:=data->>'creation_key';
  requested_offer:=data->>'offer_key'; selected_term:=data->>'term';
  selection_version:=data->>'version_id';
  IF guest_digest IS NULL OR creation_digest IS NULL OR creation_digest !~ '^[a-f0-9]{64}
COMMIT;
    OR requested_offer IS NULL OR requested_offer !~ '^[a-z][a-z0-9_-]{2,63}
COMMIT;
    OR selected_term NOT IN ('monthly','yearly','one_time')
    OR selection_version IS NULL OR selection_version !~ '^[a-f0-9-]{36}
COMMIT;
    OR (data->>'quantity') IS NULL OR (data->>'quantity') !~ '^[1-9][0-9]{0,5}
COMMIT;
  THEN RAISE EXCEPTION 'INVALID_SELECTION' USING ERRCODE='22023'; END IF;
  requested:=(data->>'quantity')::bigint;
  IF requested NOT BETWEEN 1 AND 100000
  THEN RAISE EXCEPTION 'INVALID_QUANTITY' USING ERRCODE='22023'; END IF;
  IF actor IS NOT NULL AND NOT EXISTS(SELECT 1 FROM app_users WHERE id=actor AND disabled_at IS NULL)
  THEN RAISE EXCEPTION 'LOGIN_REQUIRED' USING ERRCODE='42501'; END IF;
  SELECT v.id,v.offer_key,v.term,v.amount_minor,v.payment_plan_version_id,o.product
   INTO v FROM platform_subscription_offers o
   JOIN platform_subscription_offer_versions v ON v.id=o.current_version_id
   LEFT JOIN payment_plan_catalog pc ON pc.current_version=v.payment_plan_version_id
  WHERE o.offer_key=requested_offer AND o.status='published' AND v.id::text=selection_version
   AND v.term=selected_term AND v.amount_minor>0 AND v.currency='BDT'
   AND (o.product='ai_credit' OR
     (pc.status='published' AND pc.visibility='public'))
  LIMIT 1;
  IF v.id IS NULL THEN RAISE EXCEPTION 'OFFER_CHANGED' USING ERRCODE='40001'; END IF;
  IF v.product='payments' AND requested<>1
  THEN RAISE EXCEPTION 'INVALID_QUANTITY' USING ERRCODE='22023'; END IF;
  code:=upper(trim(coalesce(data->>'coupon_code','')));
  coupon_uuid:=NULL;
  IF code<>'' THEN
   IF code !~ '^[A-Z0-9][A-Z0-9_-]{2,31}
COMMIT;
   THEN RAISE EXCEPTION 'COUPON_INVALID' USING ERRCODE='22023'; END IF;
   SELECT c.id INTO coupon_uuid FROM platform_subscription_coupons c
   WHERE c.code_normalized=code AND c.status='active'
    AND (c.starts_at IS NULL OR c.starts_at<=statement_timestamp())
    AND (c.expires_at IS NULL OR c.expires_at>statement_timestamp())
    AND (cardinality(c.eligible_offer_keys)=0 OR v.offer_key=ANY(c.eligible_offer_keys))
    AND (cardinality(c.eligible_products)=0 OR v.product=ANY(c.eligible_products))
    AND (cardinality(c.eligible_terms)=0 OR v.term=ANY(c.eligible_terms));
   IF coupon_uuid IS NULL THEN RAISE EXCEPTION 'COUPON_UNAVAILABLE' USING ERRCODE='23514'; END IF;
  END IF;
  IF data->>'legacy_plan_id' IS NOT NULL
     AND data->>'legacy_plan_id' !~ '^[a-z][a-z0-9_-]{1,39}
COMMIT;
  THEN RAISE EXCEPTION 'INVALID_PLAN' USING ERRCODE='22023'; END IF;
  INSERT INTO platform_subscription_purchase_intents(
   public_token_sha256,guest_session_sha256,actor_id,offer_version_id,coupon_id,
   creation_key,requested_quantity,legacy_plan_id,expires_at)
  VALUES(capability_digest,guest_digest,actor,v.id,coupon_uuid,
   creation_digest,requested::integer,data->>'legacy_plan_id',now()+interval '7 days')
  ON CONFLICT (creation_key) DO NOTHING RETURNING * INTO intent_row;
  IF NOT FOUND THEN
   SELECT * INTO intent_row FROM platform_subscription_purchase_intents WHERE creation_key=creation_digest;
   IF intent_row.id IS NULL OR intent_row.public_token_sha256 IS DISTINCT FROM capability_digest
    OR intent_row.guest_session_sha256 IS DISTINCT FROM guest_digest
    OR intent_row.offer_version_id IS DISTINCT FROM v.id
    OR intent_row.coupon_id IS DISTINCT FROM coupon_uuid
    OR intent_row.requested_quantity IS DISTINCT FROM requested
    OR intent_row.legacy_plan_id IS DISTINCT FROM (data->>'legacy_plan_id')
    OR (intent_row.actor_id IS NOT NULL AND intent_row.actor_id IS DISTINCT FROM actor)
   THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
  END IF;
  RETURN jsonb_build_object('ok',true);
 END IF;

 SELECT src.* INTO intent_row FROM platform_subscription_purchase_intents src
 WHERE src.public_token_sha256=capability_digest LIMIT 1;
 IF intent_row.id IS NULL OR (intent_row.actor_id IS NOT NULL AND intent_row.actor_id IS DISTINCT FROM actor)
  OR (intent_row.actor_id IS NULL AND intent_row.guest_session_sha256 IS DISTINCT FROM guest_digest)
 THEN RAISE EXCEPTION 'INTENT_NOT_FOUND' USING ERRCODE='42501'; END IF;

 IF operation='read' THEN
  SELECT v.id,v.offer_key,v.term,v.amount_minor,v.payment_plan_version_id,o.product
   INTO v FROM platform_subscription_offer_versions v
   JOIN platform_subscription_offers o ON o.offer_key=v.offer_key
   WHERE v.id=intent_row.offer_version_id;
  SELECT c.code_normalized INTO code FROM platform_subscription_coupons c WHERE c.id=intent_row.coupon_id;
  RETURN jsonb_build_object(
    'id',intent_row.id::text,'revision',intent_row.revision,'status',intent_row.status,'expires_at',intent_row.expires_at,
    'actor_id',intent_row.actor_id::text,'workspace_id',intent_row.workspace_id::text,
    'offer_key',v.offer_key,'offer_version_id',v.id::text,
    'gateway_plan_version_id',v.payment_plan_version_id::text,
    'product',v.product,'term',v.term,'amount_minor',v.amount_minor::text,
    'requested_quantity',intent_row.requested_quantity,'coupon_code',code,
    'legacy_plan_id',intent_row.legacy_plan_id);
 END IF;

 IF operation='revalidate' THEN
  IF intent_row.status NOT IN ('selected','quoted') OR intent_row.expires_at<=statement_timestamp()
  THEN RAISE EXCEPTION 'INTENT_EXPIRED' USING ERRCODE='40001'; END IF;
  SELECT v.id,v.offer_key,v.term,o.product INTO v
   FROM platform_subscription_offers o
   JOIN platform_subscription_offer_versions v ON v.id=o.current_version_id
   LEFT JOIN payment_plan_catalog pc ON pc.current_version=v.payment_plan_version_id
   WHERE o.status='published' AND v.id=intent_row.offer_version_id
     AND (o.product='ai_credit' OR (pc.status='published' AND pc.visibility='public'));
  IF v.id IS NULL THEN RAISE EXCEPTION 'OFFER_CHANGED' USING ERRCODE='40001'; END IF;
  IF intent_row.coupon_id IS NOT NULL THEN
   SELECT c.id INTO coupon_uuid FROM platform_subscription_coupons c
   WHERE c.id=intent_row.coupon_id AND c.status='active'
    AND (c.starts_at IS NULL OR c.starts_at<=statement_timestamp())
    AND (c.expires_at IS NULL OR c.expires_at>statement_timestamp())
    AND (cardinality(c.eligible_offer_keys)=0 OR v.offer_key=ANY(c.eligible_offer_keys))
    AND (cardinality(c.eligible_products)=0 OR v.product=ANY(c.eligible_products))
    AND (cardinality(c.eligible_terms)=0 OR v.term=ANY(c.eligible_terms));
   IF coupon_uuid IS NULL THEN RAISE EXCEPTION 'COUPON_UNAVAILABLE' USING ERRCODE='40001'; END IF;
  END IF;
  RETURN jsonb_build_object('ok',true);
 END IF;

 IF operation='cancel' THEN
  IF data->>'revision' IS NULL OR data->>'revision' !~ '^[1-9][0-9]{0,15}
COMMIT;
  THEN RAISE EXCEPTION 'INVALID_REVISION' USING ERRCODE='22023'; END IF;
  expected:=(data->>'revision')::bigint;
  UPDATE platform_subscription_purchase_intents SET status='cancelled',revision=revision+1,updated_at=now()
  WHERE id=intent_row.id AND revision=expected AND status IN ('selected','quoted')
   AND confirmed_invoice_id IS NULL AND expires_at>statement_timestamp() RETURNING id INTO store;
  IF store IS NULL THEN RAISE EXCEPTION 'INTENT_STATE_CHANGED' USING ERRCODE='40001'; END IF;
  UPDATE platform_subscription_coupon_reservations SET status='released'
   WHERE intent_id=intent_row.id AND status='reserved';
  INSERT INTO platform_subscription_purchase_audit(intent_id,actor_id,action)
   VALUES(intent_row.id,actor,'selection_cancelled');
  RETURN jsonb_build_object('status','cancelled');
 END IF;

 IF actor IS NULL OR NOT EXISTS(SELECT 1 FROM app_users WHERE id=actor AND disabled_at IS NULL)
 THEN RAISE EXCEPTION 'LOGIN_REQUIRED' USING ERRCODE='42501'; END IF;
 IF operation='bind_identity' THEN
  UPDATE platform_subscription_purchase_intents SET actor_id=actor,
   revision=revision+CASE WHEN actor_id IS NULL THEN 1 ELSE 0 END,updated_at=now()
  WHERE id=intent_row.id AND (actor_id=actor OR (actor_id IS NULL AND guest_session_sha256=guest_digest))
    AND status IN ('selected','quoted') AND expires_at>statement_timestamp()
  RETURNING id INTO store;
  IF store IS NULL THEN RAISE EXCEPTION 'INTENT_NOT_FOUND' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('ok',true);
 END IF;

 IF operation='bind_store' THEN
  store:=NULL;
  IF data->>'store_id' IS NULL OR data->>'store_id' !~
   '^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}
COMMIT;
  THEN RAISE EXCEPTION 'STORE_NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
  store:=(data->>'store_id')::uuid;
  IF intent_row.actor_id IS DISTINCT FROM actor
   OR EXISTS(SELECT 1 FROM platform_primary_stores p
     WHERE p.user_id=actor AND p.workspace_id<>store)
   OR NOT EXISTS(SELECT 1 FROM workspace_members m JOIN app_users u ON u.id=m.user_id
    WHERE m.workspace_id=store AND m.user_id=actor AND u.disabled_at IS NULL
      AND m.role IN ('owner','admin')
      AND pg13_capability_override(store,actor,'workspace:settings') IS NOT FALSE)
  THEN RAISE EXCEPTION 'STORE_NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
  UPDATE platform_subscription_purchase_intents
  SET workspace_id=store,revision=revision+CASE WHEN workspace_id IS NULL THEN 1 ELSE 0 END,updated_at=now()
  WHERE id=intent_row.id AND actor_id=actor AND (workspace_id IS NULL OR workspace_id=store)
    AND status IN ('selected','quoted') AND expires_at>statement_timestamp();
  IF NOT FOUND THEN RAISE EXCEPTION 'STORE_NOT_AUTHORIZED' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('ok',true);
 END IF;

 IF operation='claim_free' THEN
  SELECT * INTO intent_row FROM platform_subscription_purchase_intents
    WHERE id=intent_row.id AND actor_id=actor FOR UPDATE;
  IF intent_row.status='claimed_free' THEN RETURN jsonb_build_object('status','claimed_free'); END IF;
  IF intent_row.status<>'selected' OR intent_row.expires_at<=statement_timestamp()
   OR intent_row.workspace_id IS NULL OR intent_row.coupon_id IS NOT NULL OR intent_row.requested_quantity<>1
   OR intent_row.confirmed_invoice_id IS NOT NULL
  THEN RAISE EXCEPTION 'FREE_CLAIM_DENIED' USING ERRCODE='40001'; END IF;
  SELECT v.amount_minor,v.payment_plan_version_id,o.product INTO v
   FROM platform_subscription_offers o JOIN platform_subscription_offer_versions v
    ON v.id=o.current_version_id WHERE o.status='published' AND v.id=intent_row.offer_version_id;
  IF v.product<>'payments' OR v.amount_minor<>0 OR v.payment_plan_version_id IS NULL
  THEN RAISE EXCEPTION 'FREE_CLAIM_DENIED' USING ERRCODE='23514'; END IF;
  IF NOT EXISTS (SELECT 1 FROM workspace_members m JOIN app_users u ON u.id=m.user_id
   WHERE m.workspace_id=intent_row.workspace_id AND m.user_id=actor AND u.disabled_at IS NULL
    AND m.role IN ('owner','admin')
    AND pg13_capability_override(intent_row.workspace_id,actor,'workspace:settings') IS NOT FALSE)
  THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
  SELECT pc.plan_id INTO plan_id FROM payment_plan_catalog pc
   JOIN payment_plan_versions pv ON pc.current_version=pv.id
  WHERE pc.current_version=v.payment_plan_version_id
   AND pc.status='published' AND pc.visibility='public'
   AND pv.terms->>'kind'='free';
  IF plan_id IS NULL THEN RAISE EXCEPTION 'FREE_PLAN_CHANGED' USING ERRCODE='40001'; END IF;
  PERFORM payment_plan_claim_free(intent_row.workspace_id,actor,plan_id);
  UPDATE platform_subscription_purchase_intents SET status='claimed_free',
    revision=revision+1,updated_at=now() WHERE id=intent_row.id;
  INSERT INTO platform_subscription_purchase_audit(intent_id,actor_id,action)
   VALUES(intent_row.id,actor,'free_claimed');
  RETURN jsonb_build_object('status','claimed_free');
 END IF;

 RAISE EXCEPTION 'INVALID_INTENT_OPERATION' USING ERRCODE='22023';
END $phase4$;
REVOKE ALL ON FUNCTION platform_subscription_intent_command(text,uuid,text,text,jsonb) FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='ekmivo_runtime')
 THEN GRANT EXECUTE ON FUNCTION platform_subscription_intent_command(text,uuid,text,text,jsonb) TO ekmivo_runtime;
 END IF;
END $$;

-- Existing intents are preserved; newly issued Phase 4 intents require a public digest.
COMMIT;