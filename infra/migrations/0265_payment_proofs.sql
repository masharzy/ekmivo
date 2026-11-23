-- Financial databases (sandbox and live). Owner decision 2026-11-22: when the
-- shop's SMS phone is offline, or automatic verification has not happened, the
-- customer can leave a Transaction ID and/or receipt photos on the checkout.
-- The shop checks them by hand (dashboard, next step) and approves or rejects.
--
-- This migration only stores what the customer submitted. It never verifies a
-- payment, never changes an amount and never completes a checkout.
--
-- * One row per checkout. A new submission adds photos (max 5) and/or replaces
--   the TrxID, and makes the row "new" again for the dashboard badge.
-- * Photos live in private object storage (Cloudflare R2) under
--   payment-proofs/; the bucket's lifecycle rule deletes them after 30 days.
--   Here only the object key, size and hash are kept.
-- * Not allowed on a completed or cancelled checkout. Allowed on an expired
--   one: that is exactly the case of a phone that was offline for too long.
--
-- Safe to run twice.
BEGIN;
DO $$BEGIN
 IF to_regclass('public.financial_realm') IS NULL OR to_regclass('public.pg05_checkout_tokens') IS NULL
 THEN RAISE EXCEPTION '0265 requires a migrated financial database'; END IF;
END $$;

CREATE TABLE IF NOT EXISTS briofold_payment_proofs(
 workspace_id uuid NOT NULL,
 environment text NOT NULL,
 intent_id uuid NOT NULL,
 trx_id text CHECK (trx_id IS NULL OR trx_id ~ '^[A-Z0-9]{6,24}$'),
 images jsonb NOT NULL DEFAULT '[]'::jsonb
  CHECK (jsonb_typeof(images)='array' AND jsonb_array_length(images)<=5),
 state text NOT NULL DEFAULT 'submitted'
  CHECK (state IN ('submitted','approved','rejected','auto_verified')),
 submissions integer NOT NULL DEFAULT 1 CHECK (submissions BETWEEN 1 AND 20),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 seen_at timestamptz,
 decided_at timestamptz,
 decided_by uuid,
 decision_reason text CHECK (decision_reason IS NULL OR length(decision_reason)<=300),
 PRIMARY KEY (workspace_id,environment,intent_id),
 FOREIGN KEY (workspace_id,environment,intent_id) REFERENCES payment_intents(workspace_id,environment,id)
);
CREATE INDEX IF NOT EXISTS briofold_payment_proofs_queue
 ON briofold_payment_proofs(workspace_id,environment,state,updated_at DESC);
ALTER TABLE briofold_payment_proofs ENABLE ROW LEVEL SECURITY;
ALTER TABLE briofold_payment_proofs FORCE ROW LEVEL SECURITY;
DO $$BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE tablename='briofold_payment_proofs' AND policyname='briofold_payment_proofs_owner') THEN
  CREATE POLICY briofold_payment_proofs_owner ON briofold_payment_proofs TO CURRENT_USER USING (true) WITH CHECK (true);
 END IF;
END $$;
REVOKE ALL ON briofold_payment_proofs FROM PUBLIC;

-- The checkout behind a customer's capability, for proof functions.
CREATE OR REPLACE FUNCTION briofold_proof_checkout(p_digest text) RETURNS pg05_checkout_tokens
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t pg05_checkout_tokens;
BEGIN
 IF p_digest !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
 SELECT tok.* INTO t FROM pg05_checkout_tokens tok
 JOIN financial_workspace_registry registry ON registry.workspace_id=tok.workspace_id
  AND registry.environment=tok.environment AND registry.status='active'
 WHERE tok.token_digest=p_digest AND tok.environment=(SELECT environment FROM financial_realm WHERE singleton);
 RETURN t;
END $$;

-- What the checkout page shows about the customer's own submission.
CREATE OR REPLACE FUNCTION briofold_proof_public(p_digest text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t pg05_checkout_tokens; p briofold_payment_proofs;
BEGIN
 t:=briofold_proof_checkout(p_digest);
 IF t.intent_id IS NULL THEN RETURN NULL; END IF;
 SELECT * INTO p FROM briofold_payment_proofs
 WHERE workspace_id=t.workspace_id AND environment=t.environment AND intent_id=t.intent_id;
 IF p.intent_id IS NULL THEN RETURN jsonb_build_object('submitted',false); END IF;
 RETURN jsonb_build_object('submitted',true,'state',p.state,'has_trx_id',p.trx_id IS NOT NULL,
  'image_count',jsonb_array_length(p.images),'updated_at',p.updated_at);
END $$;

-- Customer submits a TrxID and/or one photo (already stored by the API).
-- p_image: {"key":"payment-proofs/<uuid>.jpg","bytes":n,"sha256":"<hex>"} or NULL.
CREATE OR REPLACE FUNCTION briofold_proof_submit(p_digest text,p_trx text,p_image jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t pg05_checkout_tokens; st text; p briofold_payment_proofs; trx text;
BEGIN
 t:=briofold_proof_checkout(p_digest);
 IF t.intent_id IS NULL THEN RETURN NULL; END IF;
 trx:=nullif(upper(regexp_replace(coalesce(p_trx,''),'[^A-Za-z0-9]','','g')),'');
 IF trx IS NOT NULL AND trx !~ '^[A-Z0-9]{6,24}$' THEN
  RAISE EXCEPTION 'INVALID_TRX_ID' USING ERRCODE='22023';
 END IF;
 IF p_image IS NOT NULL AND (jsonb_typeof(p_image)<>'object'
   OR coalesce(p_image->>'key','') !~ '^payment-proofs/[0-9a-f-]{36}\.jpg$'
   OR coalesce(p_image->>'sha256','') !~ '^[0-9a-f]{64}$'
   OR coalesce(p_image->>'bytes','') !~ '^[0-9]{1,8}$') THEN
  RAISE EXCEPTION 'INVALID_IMAGE' USING ERRCODE='22023';
 END IF;
 IF trx IS NULL AND p_image IS NULL THEN RAISE EXCEPTION 'EMPTY_PROOF' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM payment_intents WHERE workspace_id=t.workspace_id AND environment=t.environment AND id=t.intent_id FOR UPDATE;
 st:=pg05_intent_state(t.workspace_id,t.environment,t.intent_id);
 IF st IN ('completed','cancelled') THEN RAISE EXCEPTION 'PROOF_NOT_ALLOWED' USING ERRCODE='P6808'; END IF;
 SELECT * INTO p FROM briofold_payment_proofs
 WHERE workspace_id=t.workspace_id AND environment=t.environment AND intent_id=t.intent_id FOR UPDATE;
 IF p.intent_id IS NULL THEN
  INSERT INTO briofold_payment_proofs(workspace_id,environment,intent_id,trx_id,images)
  VALUES(t.workspace_id,t.environment,t.intent_id,trx,
   CASE WHEN p_image IS NULL THEN '[]'::jsonb ELSE jsonb_build_array(p_image||jsonb_build_object('at',now())) END);
 ELSE
  IF p.state IN ('approved','auto_verified') THEN RAISE EXCEPTION 'PROOF_NOT_ALLOWED' USING ERRCODE='P6808'; END IF;
  IF p.submissions>=20 OR (p_image IS NOT NULL AND jsonb_array_length(p.images)>=5) THEN
   RAISE EXCEPTION 'PROOF_LIMIT_REACHED' USING ERRCODE='P6809';
  END IF;
  UPDATE briofold_payment_proofs SET
   trx_id=coalesce(trx,trx_id),
   images=CASE WHEN p_image IS NULL THEN images ELSE images||jsonb_build_array(p_image||jsonb_build_object('at',now())) END,
   state='submitted', submissions=submissions+1, updated_at=now(), seen_at=NULL,
   decided_at=NULL, decided_by=NULL, decision_reason=NULL
  WHERE workspace_id=t.workspace_id AND environment=t.environment AND intent_id=t.intent_id;
 END IF;
 RETURN briofold_proof_public(p_digest);
END $$;

REVOKE ALL ON FUNCTION briofold_proof_checkout(text),briofold_proof_public(text),briofold_proof_submit(text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION briofold_proof_public(text),briofold_proof_submit(text,text,jsonb) TO ekmivo_finance_reader;
COMMIT;
