-- Briofold Phase 5A. Control database only, never financial realm.
-- Prepaid AI costs are tracked in BDT minor units (paisa) with integer arithmetic.
-- No deposit can be created from a client-supplied payment success claim.
BEGIN;
DO $$BEGIN
 IF to_regclass('public.workspaces') IS NULL OR to_regclass('public.financial_realm') IS NOT NULL
 THEN RAISE EXCEPTION 'AI credit accounts require control database';END IF;
END $$;
CREATE TABLE briofold_ai_wallets (
 workspace_id uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
 available_minor bigint NOT NULL DEFAULT 0 CHECK(available_minor>=0),
 reserved_minor bigint NOT NULL DEFAULT 0 CHECK(reserved_minor>=0),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE briofold_ai_reservations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES workspaces(id),
 request_key text NOT NULL CHECK(length(request_key) BETWEEN 8 AND 128),
 reserved_minor bigint NOT NULL CHECK(reserved_minor>0),
 actual_minor bigint CHECK(actual_minor>=0 AND actual_minor<=reserved_minor),
 state text NOT NULL DEFAULT 'reserved' CHECK(state IN('reserved','completed','released')),
 created_at timestamptz NOT NULL DEFAULT now(),
 settled_at timestamptz,
 UNIQUE(workspace_id,request_key)
);
CREATE TABLE briofold_ai_credit_journal (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES workspaces(id),
 operation_key text NOT NULL CHECK(length(operation_key) BETWEEN 8 AND 180),
 kind text NOT NULL CHECK(kind IN('verified_topup','reserve','settle','release','correction')),
 available_delta_minor bigint NOT NULL,
 reserved_delta_minor bigint NOT NULL,
 available_after_minor bigint NOT NULL CHECK(available_after_minor>=0),
 reserved_after_minor bigint NOT NULL CHECK(reserved_after_minor>=0),
 reference_id uuid,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,operation_key)
);
CREATE INDEX briofold_ai_journal_account_idx ON briofold_ai_credit_journal(workspace_id,created_at DESC);
CREATE INDEX briofold_ai_reservations_pending_idx ON briofold_ai_reservations(workspace_id,created_at)
 WHERE state='reserved';
CREATE FUNCTION briofold_ai_journal_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'AI credit journal is immutable' USING ERRCODE='42501'; END $$;
CREATE TRIGGER briofold_ai_journal_no_mutation BEFORE UPDATE OR DELETE ON briofold_ai_credit_journal
 FOR EACH ROW EXECUTE FUNCTION briofold_ai_journal_immutable();
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['briofold_ai_wallets','briofold_ai_reservations','briofold_ai_credit_journal'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY %I ON %I TO %I USING(true) WITH CHECK(true)',t||'_owner',t,current_user);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection',t);
 END LOOP;
END $$;
-- Only trusted server-side AI execution may invoke these functions. Never expose
-- reserve/settle/deposit as unauthenticated public API actions.
CREATE FUNCTION briofold_ai_wallet_reserve(w uuid,a uuid,k text,cost_minor bigint) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE existing uuid; balance bigint; rid uuid;
BEGIN
 IF length(k) NOT BETWEEN 8 AND 128 OR cost_minor NOT BETWEEN 1 AND 100000000 THEN
  RAISE EXCEPTION 'invalid reservation' USING ERRCODE='22023'; END IF;
 PERFORM pg13_actor(w,a,true);
 IF NOT EXISTS(SELECT 1 FROM workspace_product_access WHERE workspace_id=w AND product='ai' AND enabled)
 THEN RAISE EXCEPTION 'AI disabled' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('briofold:ai:'||w::text,0));
 SELECT id INTO existing FROM briofold_ai_reservations WHERE workspace_id=w AND request_key=k;
 IF existing IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM briofold_ai_reservations WHERE id=existing AND reserved_minor=cost_minor)
  THEN RAISE EXCEPTION 'idempotency conflict' USING ERRCODE='23505'; END IF;
  RETURN existing;
 END IF;
 INSERT INTO briofold_ai_wallets(workspace_id) VALUES(w) ON CONFLICT DO NOTHING;
 SELECT available_minor INTO balance FROM briofold_ai_wallets WHERE workspace_id=w FOR UPDATE;
 IF balance<cost_minor THEN RAISE EXCEPTION 'insufficient AI credits' USING ERRCODE='P0001'; END IF;
 UPDATE briofold_ai_wallets SET available_minor=available_minor-cost_minor,
   reserved_minor=reserved_minor+cost_minor,updated_at=now() WHERE workspace_id=w;
 INSERT INTO briofold_ai_reservations(workspace_id,request_key,reserved_minor)
  VALUES(w,k,cost_minor) RETURNING id INTO rid;
 INSERT INTO briofold_ai_credit_journal(workspace_id,operation_key,kind,
  available_delta_minor,reserved_delta_minor,available_after_minor,reserved_after_minor,reference_id)
  SELECT w,'reserve:'||k,'reserve',-cost_minor,cost_minor,available_minor,reserved_minor,rid
  FROM briofold_ai_wallets WHERE workspace_id=w;
 RETURN rid;
END $$;
CREATE FUNCTION briofold_ai_wallet_settle(w uuid,a uuid,k text,actual_cost_minor bigint) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE reservation briofold_ai_reservations%ROWTYPE;release_amount bigint; wallet briofold_ai_wallets%ROWTYPE;
BEGIN
 PERFORM pg13_actor(w,a,true);
 IF length(k) NOT BETWEEN 8 AND 128 OR actual_cost_minor<0 THEN
  RAISE EXCEPTION 'invalid settlement' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('briofold:ai:'||w::text,0));
 SELECT * INTO reservation FROM briofold_ai_reservations
   WHERE workspace_id=w AND request_key=k FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'reservation missing' USING ERRCODE='22023';END IF;
 IF actual_cost_minor>reservation.reserved_minor THEN
  RAISE EXCEPTION 'cost exceeds reservation' USING ERRCODE='22023';END IF;
 IF reservation.state<>'reserved' THEN
  IF reservation.actual_minor<>actual_cost_minor THEN
   RAISE EXCEPTION 'settlement conflict' USING ERRCODE='23505';END IF;
  SELECT * INTO wallet FROM briofold_ai_wallets WHERE workspace_id=w;
  RETURN jsonb_build_object('state',reservation.state,'available_minor',wallet.available_minor,'reserved_minor',wallet.reserved_minor);
 END IF;
 release_amount:=reservation.reserved_minor-actual_cost_minor;
 UPDATE briofold_ai_wallets SET available_minor=available_minor+release_amount,
  reserved_minor=reserved_minor-reservation.reserved_minor,updated_at=now()
  WHERE workspace_id=w RETURNING * INTO wallet;
 UPDATE briofold_ai_reservations SET actual_minor=actual_cost_minor,
  state=CASE WHEN actual_cost_minor=0 THEN 'released' ELSE 'completed' END,
  settled_at=now() WHERE id=reservation.id;
 INSERT INTO briofold_ai_credit_journal(workspace_id,operation_key,kind,
  available_delta_minor,reserved_delta_minor,available_after_minor,reserved_after_minor,reference_id)
 VALUES(w,'settle:'||k,CASE WHEN actual_cost_minor=0 THEN 'release' ELSE 'settle' END,
  release_amount,-reservation.reserved_minor,wallet.available_minor,wallet.reserved_minor,reservation.id);
 RETURN jsonb_build_object('state',CASE WHEN actual_cost_minor=0 THEN 'released' ELSE 'completed' END,
  'available_minor',wallet.available_minor,'reserved_minor',wallet.reserved_minor);
END $$;
COMMIT;
