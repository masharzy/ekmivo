-- Phase 6 Store-first handoff ledger. CONTROL DATABASE ONLY.
-- Additive, unseeded, not a permission to enable Live payments.
-- Requires Phase 2-5 authoritative quote/confirm and invoice creation to
-- populate confirmed_invoice_id. This migration does NOT issue invoices,
-- manufacture wallet accounts, alter financial allocations or issue credits.
BEGIN;

CREATE TABLE platform_subscription_payment_handoffs (
 intent_id uuid PRIMARY KEY REFERENCES platform_subscription_purchase_intents(id) ON DELETE RESTRICT,
 quote_id uuid NOT NULL REFERENCES platform_subscription_purchase_quotes(id) ON DELETE RESTRICT,
 invoice_id uuid NOT NULL UNIQUE REFERENCES pg13_platform_invoices(id) ON DELETE RESTRICT,
 actor_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
 receiving_workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
 offer_version_id uuid NOT NULL REFERENCES platform_subscription_offer_versions(id) ON DELETE RESTRICT,
 checkout_token_digest text NOT NULL UNIQUE CHECK(checkout_token_digest~'^[a-f0-9]{64}$'),
 amount_minor bigint NOT NULL CHECK(amount_minor>0),
 currency text NOT NULL DEFAULT 'BDT' CHECK(currency='BDT'),
 state text NOT NULL DEFAULT 'awaiting_payment'
   CHECK(state IN ('awaiting_payment','paid','expired','cancelled','recovery_required')),
 payment_id uuid UNIQUE,
 bound_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT (now()+interval '60 minutes'),
 settled_at timestamptz,
 CHECK(workspace_id<>receiving_workspace_id),
 CHECK(expires_at>bound_at),
 CHECK((state='paid')=(payment_id IS NOT NULL AND settled_at IS NOT NULL))
);
CREATE INDEX platform_subscription_payment_pending_idx ON platform_subscription_payment_handoffs(bound_at)
 WHERE state='awaiting_payment';
CREATE TABLE platform_subscription_payment_recovery_cases (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 intent_id uuid NOT NULL REFERENCES platform_subscription_payment_handoffs(intent_id) ON DELETE RESTRICT,
 payment_id uuid NOT NULL,
 reason text NOT NULL CHECK(reason IN ('expired_verified','cancelled_verified','payment_exception')),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','reviewing','resolved')),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(intent_id,payment_id)
);
CREATE INDEX platform_subscription_recovery_open_idx ON platform_subscription_payment_recovery_cases(created_at)
 WHERE status='open';

-- A narrow, transactional bind to the ALREADY issued authoritative invoice.
-- There is no separate Phase 6 price calculator. Buyer-supplied amount,
-- invoice ID, receiver and token cannot create a valid new purchase.
CREATE FUNCTION platform_subscription_payment_bind(w uuid,a uuid,purchase uuid,qid uuid,invoice uuid,receiver uuid,token_sha text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p platform_subscription_purchase_intents;
 q platform_subscription_purchase_quotes; v platform_subscription_offer_versions;
 i pg13_platform_invoices; h platform_subscription_payment_handoffs;
BEGIN
 PERFORM pg13_actor(w,a,true);
 IF pg13_capability_override(w,a,'workspace:settings') IS FALSE
 THEN RAISE EXCEPTION 'billing permission denied' USING ERRCODE='42501';END IF;
 IF receiver=w OR receiver::text IS DISTINCT FROM platform_billing_workspace()::text
    OR token_sha!~'^[a-f0-9]{64}$'
 THEN RAISE EXCEPTION 'platform receiver or digest invalid' USING ERRCODE='23514';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('subscription-handoff:'||purchase::text,0));
 SELECT * INTO p FROM platform_subscription_purchase_intents WHERE id=purchase FOR UPDATE;
 IF p.id IS NULL OR p.actor_id IS DISTINCT FROM a OR p.workspace_id IS DISTINCT FROM w
    OR p.confirmed_invoice_id IS DISTINCT FROM invoice OR p.status NOT IN ('confirmed','paid')
 THEN RAISE EXCEPTION 'confirmed purchase unavailable' USING ERRCODE='42501';END IF;
 -- Store-first owners are bound to exactly their primary Store.
 IF NOT EXISTS(SELECT 1 FROM platform_primary_stores WHERE user_id=a AND workspace_id=w)
 THEN RAISE EXCEPTION 'buyer Store binding unavailable' USING ERRCODE='42501';END IF;
 SELECT * INTO h FROM platform_subscription_payment_handoffs WHERE intent_id=purchase;
 IF FOUND THEN
   IF h.quote_id<>qid OR h.invoice_id<>invoice OR h.workspace_id<>w
      OR h.receiving_workspace_id<>receiver OR h.checkout_token_digest<>token_sha
   THEN RAISE EXCEPTION 'payment capability conflict' USING ERRCODE='23505';END IF;
   RETURN to_jsonb(h);
 END IF;
 IF p.status<>'confirmed' OR p.expires_at<=now()
 THEN RAISE EXCEPTION 'purchase expired' USING ERRCODE='40001';END IF;
 SELECT * INTO q FROM platform_subscription_purchase_quotes
 WHERE id=qid AND intent_id=purchase AND offer_version_id=p.offer_version_id;
 SELECT * INTO v FROM platform_subscription_offer_versions WHERE id=p.offer_version_id;
 SELECT * INTO i FROM pg13_platform_invoices WHERE id=invoice AND workspace_id=w FOR UPDATE;
 IF q.id IS NULL OR q.expires_at<=now() OR q.currency<>'BDT'
    OR q.total_minor<=0 OR q.coupon_id IS DISTINCT FROM p.coupon_id
    OR v.id IS NULL OR v.term<>'monthly' OR v.payment_plan_version_id IS NULL
    OR (SELECT product FROM platform_subscription_offers WHERE offer_key=v.offer_key)<>'payments'
    OR i.id IS NULL OR i.status<>'issued' OR i.amount_minor<>q.total_minor
    OR i.plan_version_id IS DISTINCT FROM v.payment_plan_version_id
    OR i.period_days IS DISTINCT FROM (SELECT (pv.terms->>'period_days')::integer
       FROM payment_plan_versions pv WHERE pv.id=v.payment_plan_version_id)
    OR platform_billing_invoice_receiver(w,invoice)::text IS DISTINCT FROM receiver::text
 THEN RAISE EXCEPTION 'immutable quote/invoice mismatch' USING ERRCODE='23514';END IF;
 -- Three distinct published legal documents, accepted for this exact
 -- purchase, Store and buyer. This is checked server-side, never a UI flag.
 IF (SELECT count(DISTINCT policy.kind)
     FROM platform_subscription_policy_acceptances acceptance
     JOIN platform_subscription_policy_versions policy ON policy.id=acceptance.policy_version_id
     WHERE acceptance.intent_id=purchase AND acceptance.actor_id=a
       AND acceptance.workspace_id=w AND policy.status='published'
       AND policy.kind IN ('terms','privacy','refund'))<>3
 THEN RAISE EXCEPTION 'three legal snapshots required' USING ERRCODE='23514';END IF;
 IF q.coupon_id IS NOT NULL AND NOT EXISTS(
   SELECT 1 FROM platform_subscription_coupon_reservations r
   WHERE r.intent_id=purchase AND r.quote_id=qid AND r.coupon_id=q.coupon_id
     AND r.workspace_id=w AND r.actor_id=a AND r.status='reserved' AND r.expires_at>now())
 THEN RAISE EXCEPTION 'coupon reservation unavailable' USING ERRCODE='23514';END IF;
 INSERT INTO platform_subscription_payment_handoffs
 (intent_id,quote_id,invoice_id,actor_id,workspace_id,receiving_workspace_id,
  offer_version_id,checkout_token_digest,amount_minor)
 VALUES(purchase,qid,invoice,a,w,receiver,v.id,token_sha,i.amount_minor)
 RETURNING * INTO h;
 INSERT INTO platform_subscription_purchase_audit(intent_id,actor_id,action,detail)
 VALUES(purchase,a,'payment.handoff_bound',jsonb_build_object('invoice_id',invoice,'quote_id',qid));
 RETURN to_jsonb(h);
END $$;

-- Read requires current billing membership; opaque capability alone is not
-- a Store Billing read credential.
CREATE FUNCTION platform_subscription_payment_read(w uuid,a uuid,purchase uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE h platform_subscription_payment_handoffs;
BEGIN
 PERFORM pg13_actor(w,a,false);
 SELECT * INTO h FROM platform_subscription_payment_handoffs WHERE intent_id=purchase AND workspace_id=w;
 IF h.intent_id IS NULL THEN RETURN NULL;END IF;
 RETURN to_jsonb(h);
END $$;

-- The opaque URL is a payment capability, not a billing-account credential.
-- Guard the SaaS wallet page using the same session actor and primary Store.
-- A seller payment token from /pay/{documentToken} cannot pass this lookup.
CREATE FUNCTION platform_subscription_payment_capability(a uuid,token_sha text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE h platform_subscription_payment_handoffs;
BEGIN
 IF token_sha!~'^[a-f0-9]{64}$' THEN RETURN NULL;END IF;
 SELECT * INTO h FROM platform_subscription_payment_handoffs
 WHERE checkout_token_digest=token_sha;
 IF h.intent_id IS NULL THEN RETURN NULL;END IF;
 PERFORM pg13_actor(h.workspace_id,a,false);
 IF NOT EXISTS(SELECT 1 FROM platform_primary_stores p
  WHERE p.user_id=a AND p.workspace_id=h.workspace_id)
 THEN RETURN NULL;END IF;
 RETURN jsonb_build_object('intent_id',h.intent_id,'workspace_id',h.workspace_id);
END $$;

-- Worker-only bounded cursor; immutable locator survives key rotation,
-- process crash, tab closure and delayed provider verification.
CREATE FUNCTION platform_subscription_payment_pending() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(to_jsonb(h)),'[]'::jsonb) FROM (
  SELECT intent_id,quote_id,invoice_id,workspace_id,receiving_workspace_id,
         checkout_token_digest,amount_minor,state,expires_at
  FROM platform_subscription_payment_handoffs
  WHERE state IN ('awaiting_payment','expired','cancelled','recovery_required')
  ORDER BY bound_at LIMIT 50
 ) h
$$;

-- Called ONLY by restricted control projection worker AFTER finance realm
-- returned a valid, exact allocation AND completed state. Never grant this
-- function to the web/runtime role or accept a client-supplied success flag.
CREATE FUNCTION platform_subscription_payment_settle(purchase uuid,payment uuid,amount bigint,verified_time timestamptz,receiver uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE h platform_subscription_payment_handoffs;
 q platform_subscription_purchase_quotes;
 res platform_subscription_coupon_reservations;
 applied boolean;
BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('subscription-handoff:'||purchase::text,0));
 SELECT * INTO h FROM platform_subscription_payment_handoffs WHERE intent_id=purchase FOR UPDATE;
 IF h.intent_id IS NULL OR h.receiving_workspace_id<>receiver
    OR h.amount_minor<>amount OR payment IS NULL OR verified_time IS NULL
 THEN RAISE EXCEPTION 'payment proof rejected' USING ERRCODE='23514';END IF;
 IF h.state='paid' THEN RETURN h.payment_id=payment;END IF;
 IF h.state<>'awaiting_payment' THEN
   RAISE EXCEPTION 'terminal payment requires operator recovery' USING ERRCODE='23514';
 END IF;
 IF NOT pg13_billing_verified(h.workspace_id,h.invoice_id,payment,amount,verified_time)
 THEN RAISE EXCEPTION 'entitlement not confirmed' USING ERRCODE='23514';END IF;
 SELECT * INTO q FROM platform_subscription_purchase_quotes WHERE id=h.quote_id;
 IF q.coupon_id IS NOT NULL THEN
   SELECT * INTO res FROM platform_subscription_coupon_reservations
   WHERE intent_id=purchase AND quote_id=q.id AND coupon_id=q.coupon_id FOR UPDATE;
   IF res.id IS NULL OR res.status NOT IN ('reserved','redeemed')
   THEN RAISE EXCEPTION 'coupon unavailable at settlement' USING ERRCODE='23514';END IF;
   INSERT INTO platform_subscription_coupon_redemptions
   (coupon_id,reservation_id,invoice_id,actor_id,workspace_id,discount_minor)
   VALUES(q.coupon_id,res.id,h.invoice_id,h.actor_id,h.workspace_id,q.coupon_discount_minor)
   ON CONFLICT(reservation_id) DO NOTHING;
   IF NOT EXISTS(SELECT 1 FROM platform_subscription_coupon_redemptions
     WHERE reservation_id=res.id AND invoice_id=h.invoice_id)
   THEN RAISE EXCEPTION 'coupon redemption conflict' USING ERRCODE='23505';END IF;
   UPDATE platform_subscription_coupon_reservations SET status='redeemed' WHERE id=res.id;
 END IF;
 UPDATE platform_subscription_payment_handoffs
 SET state='paid',payment_id=payment,settled_at=now() WHERE intent_id=purchase;
 UPDATE platform_subscription_purchase_intents
 SET status='paid',updated_at=now() WHERE id=purchase;
 INSERT INTO platform_subscription_purchase_audit(intent_id,action,detail)
 VALUES(purchase,'payment.verified_activated',jsonb_build_object('invoice_id',h.invoice_id,'payment_id',payment));
 RETURN true;
END $$;

-- Terminal payment with verified money is not silently discarded and does NOT
-- trigger financial payout/refund. Manual operator case must be resolved.
CREATE FUNCTION platform_subscription_payment_recover(purchase uuid,payment uuid,reason_text text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE h platform_subscription_payment_handoffs;
BEGIN
 IF reason_text NOT IN ('expired_verified','cancelled_verified','payment_exception') OR payment IS NULL
 THEN RAISE EXCEPTION 'invalid recovery' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('subscription-handoff:'||purchase::text,0));
 SELECT * INTO h FROM platform_subscription_payment_handoffs WHERE intent_id=purchase FOR UPDATE;
 IF h.intent_id IS NULL OR h.state='paid' THEN RAISE EXCEPTION 'recovery scope invalid' USING ERRCODE='23514';END IF;
 IF EXISTS(SELECT 1 FROM platform_subscription_payment_recovery_cases
    WHERE intent_id=purchase AND payment_id=payment) THEN RETURN true;END IF;
 INSERT INTO platform_subscription_payment_recovery_cases(intent_id,payment_id,reason)
 VALUES(purchase,payment,reason_text) ON CONFLICT(intent_id,payment_id) DO NOTHING;
 UPDATE platform_subscription_payment_handoffs SET state='recovery_required' WHERE intent_id=purchase;
 UPDATE platform_subscription_coupon_reservations SET status='released'
 WHERE intent_id=purchase AND status='reserved';
 INSERT INTO platform_subscription_purchase_audit(intent_id,action,detail)
 VALUES(purchase,'payment.recovery_required',jsonb_build_object('payment_id',payment,'reason',reason_text));
 RETURN true;
END $$;

CREATE FUNCTION platform_subscription_payment_terminal(purchase uuid,final_state text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE h platform_subscription_payment_handoffs;
BEGIN
 IF final_state NOT IN ('cancelled','expired') THEN RAISE EXCEPTION 'invalid terminal state' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('subscription-handoff:'||purchase::text,0));
 SELECT * INTO h FROM platform_subscription_payment_handoffs WHERE intent_id=purchase FOR UPDATE;
 IF h.intent_id IS NULL THEN RETURN false;END IF;
 IF h.state IN ('paid','recovery_required') THEN RETURN false;END IF;
 UPDATE platform_subscription_payment_handoffs SET state=final_state WHERE intent_id=purchase;
 UPDATE platform_subscription_coupon_reservations SET status='released'
 WHERE intent_id=purchase AND status='reserved';
 UPDATE platform_subscription_purchase_intents SET status=final_state,updated_at=now()
 WHERE id=purchase AND status<>'paid';
 INSERT INTO platform_subscription_purchase_audit(intent_id,action,detail)
 VALUES(purchase,'payment.'||final_state,jsonb_build_object('invoice_id',h.invoice_id));
 RETURN true;
END $$;

DO $$DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['platform_subscription_payment_handoffs','platform_subscription_payment_recovery_cases'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY %I ON %I TO %I USING(true) WITH CHECK(true)',t||'_owner',t,current_user);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',t);
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='ekmivo_financial_runtime')
  THEN EXECUTE format('REVOKE ALL ON %I FROM ekmivo_financial_runtime',t);END IF;
 END LOOP;
END $$;

-- Prevent the legacy PG13 worker from independently activating a Phase 6
-- invoice while its coupon and recovery state are still undecided.
CREATE FUNCTION platform_subscription_payment_is_handoff(invoice uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM platform_subscription_payment_handoffs WHERE invoice_id=invoice)
$$;

REVOKE ALL ON FUNCTION
 platform_subscription_payment_is_handoff(uuid),
 platform_subscription_payment_bind(uuid,uuid,uuid,uuid,uuid,uuid,text),
 platform_subscription_payment_read(uuid,uuid,uuid),
 platform_subscription_payment_capability(uuid,text),
 platform_subscription_payment_pending(),
 platform_subscription_payment_settle(uuid,uuid,bigint,timestamptz,uuid),
 platform_subscription_payment_recover(uuid,uuid,text),
 platform_subscription_payment_terminal(uuid,text) FROM PUBLIC;
DO $$BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='ekmivo_financial_runtime') THEN
  GRANT EXECUTE ON FUNCTION platform_subscription_payment_bind(uuid,uuid,uuid,uuid,uuid,uuid,text),
   platform_subscription_payment_read(uuid,uuid,uuid) TO ekmivo_financial_runtime;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='ekmivo_runtime') THEN
  GRANT EXECUTE ON FUNCTION platform_subscription_payment_capability(uuid,text) TO ekmivo_runtime;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='ekmivo_financial_projection') THEN
  GRANT EXECUTE ON FUNCTION platform_subscription_payment_is_handoff(uuid),
   platform_subscription_payment_pending(),
   platform_subscription_payment_settle(uuid,uuid,bigint,timestamptz,uuid),
   platform_subscription_payment_recover(uuid,uuid,text),
   platform_subscription_payment_terminal(uuid,text) TO ekmivo_financial_projection;
 END IF;
END $$;
COMMIT;
