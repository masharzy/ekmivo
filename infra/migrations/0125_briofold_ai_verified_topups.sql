-- Briofold AI prepaid top-up: control database only, confirmed by Go
-- against the authoritative live financial realm before any funds are credited.
BEGIN;
DO $$BEGIN
 IF to_regclass('public.workspaces') IS NULL OR to_regclass('public.financial_realm') IS NOT NULL
 THEN RAISE EXCEPTION 'AI top-ups require control database';END IF;
END $$;
CREATE TABLE briofold_ai_topups (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
 actor_id uuid NOT NULL REFERENCES app_users(id),
 idempotency_key text NOT NULL CHECK(length(idempotency_key) BETWEEN 8 AND 128),
 amount_minor bigint NOT NULL CHECK(amount_minor BETWEEN 1000 AND 10000000),
 receiving_workspace_id uuid NOT NULL REFERENCES workspaces(id),
 status text NOT NULL DEFAULT 'pending' CHECK(status IN('pending','credited')),
 verified_payment_id uuid UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(),
 credited_at timestamptz,
 UNIQUE(workspace_id,idempotency_key)
);
CREATE INDEX briofold_ai_topups_merchant_idx ON briofold_ai_topups(workspace_id,created_at DESC);
ALTER TABLE briofold_ai_topups ENABLE ROW LEVEL SECURITY;
ALTER TABLE briofold_ai_topups FORCE ROW LEVEL SECURITY;
DO $$BEGIN
 EXECUTE format('CREATE POLICY briofold_ai_topups_owner ON briofold_ai_topups TO %I USING(true) WITH CHECK(true)',current_user);
END $$;
REVOKE ALL ON briofold_ai_topups FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
CREATE FUNCTION briofold_ai_topup_issue(w uuid,a uuid,cost bigint,k text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE receiver uuid;ordered briofold_ai_topups%ROWTYPE;
BEGIN
 PERFORM pg13_actor(w,a,true);
 IF NOT EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id=w AND user_id=a AND role IN('owner','admin'))
 OR NOT EXISTS(SELECT 1 FROM workspace_product_access WHERE workspace_id=w AND product='ai' AND enabled)
 THEN RAISE EXCEPTION 'access denied' USING ERRCODE='42501';END IF;
 IF cost IS NULL OR cost NOT BETWEEN 1000 AND 10000000 OR k IS NULL OR length(k) NOT BETWEEN 8 AND 128
 THEN RAISE EXCEPTION 'invalid AI topup amount or idempotency' USING ERRCODE='22023'; END IF;
 SELECT platform_billing_workspace() INTO receiver;
 IF receiver IS NULL OR receiver=w THEN
  RAISE EXCEPTION 'platform receiving unavailable' USING ERRCODE='55000'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('ai-topup:'||w::text||':'||k,0));
 SELECT * INTO ordered FROM briofold_ai_topups WHERE workspace_id=w AND idempotency_key=k;
 IF FOUND THEN
  IF ordered.amount_minor<>cost OR ordered.receiving_workspace_id<>receiver THEN
   RAISE EXCEPTION 'idempotency conflict' USING ERRCODE='23505';END IF;
 ELSE
  INSERT INTO briofold_ai_topups(workspace_id,actor_id,receiving_workspace_id,amount_minor,idempotency_key)
   VALUES(w,a,receiver,cost,k) RETURNING * INTO ordered;
 END IF;
 RETURN jsonb_build_object('id',ordered.id,'status',ordered.status,'amount_minor',ordered.amount_minor,
 'receiving_workspace_id',ordered.receiving_workspace_id);
END $$;
-- The only top-up crediting path is called by the private Go service AFTER
-- checking the signed checkout token against pg13_platform_payment in the Live
-- financial realm, matching receiver, currency, exact amount and paid state.
CREATE FUNCTION briofold_ai_topup_apply_verified(w uuid,a uuid,topup_id uuid,
 verified_id uuid,verified_minor bigint) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE row briofold_ai_topups%ROWTYPE;wallet briofold_ai_wallets%ROWTYPE;
BEGIN
 PERFORM pg13_actor(w,a,true);
 IF NOT EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id=w AND user_id=a AND role IN('owner','admin'))
 THEN RAISE EXCEPTION 'access denied' USING ERRCODE='42501';END IF;
 IF verified_id IS NULL OR verified_minor IS NULL OR verified_minor<=0
 THEN RAISE EXCEPTION 'invalid proof' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('briofold:ai:'||w::text,0));
 SELECT * INTO row FROM briofold_ai_topups WHERE workspace_id=w AND id=topup_id FOR UPDATE;
 IF NOT FOUND OR row.amount_minor<>verified_minor THEN RAISE EXCEPTION 'topup mismatch' USING ERRCODE='22023';END IF;
 IF row.status='credited' THEN
  IF row.verified_payment_id<>verified_id THEN RAISE EXCEPTION 'proof conflict' USING ERRCODE='23505';END IF;
  SELECT * INTO wallet FROM briofold_ai_wallets WHERE workspace_id=w;
  RETURN jsonb_build_object('credited',false,'balance_minor',wallet.available_minor);
 END IF;
 UPDATE briofold_ai_topups SET status='credited',verified_payment_id=verified_id,credited_at=now()
  WHERE id=topup_id;
 INSERT INTO briofold_ai_wallets(workspace_id) VALUES(w) ON CONFLICT DO NOTHING;
 UPDATE briofold_ai_wallets SET available_minor=available_minor+row.amount_minor,updated_at=now()
  WHERE workspace_id=w RETURNING * INTO wallet;
 INSERT INTO briofold_ai_credit_journal(workspace_id,operation_key,kind,available_delta_minor,
   reserved_delta_minor,available_after_minor,reserved_after_minor,reference_id)
  VALUES(w,'topup:'||topup_id::text,'verified_topup',row.amount_minor,0,
   wallet.available_minor,wallet.reserved_minor,verified_id);
 RETURN jsonb_build_object('credited',true,'balance_minor',wallet.available_minor);
END $$;
REVOKE ALL ON FUNCTION briofold_ai_topup_issue(uuid,uuid,bigint,text) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
REVOKE ALL ON FUNCTION briofold_ai_topup_apply_verified(uuid,uuid,uuid,uuid,bigint) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
COMMIT;
