-- Persist the *issued* financial proof locator before returning a checkout token.
-- Rotating the API signing key must never strand or mis-credit a paid AI top-up.
-- Control database only; the digest is a lookup reference, never payment proof.
BEGIN;
DO $$BEGIN
 IF to_regclass('public.briofold_ai_topups') IS NULL
 OR to_regclass('public.financial_realm') IS NOT NULL
 THEN RAISE EXCEPTION 'AI top-up proof binding requires control database'; END IF;
END $$;

ALTER TABLE briofold_ai_topups ADD COLUMN checkout_token_digest text
 CHECK(checkout_token_digest ~ '^[0-9a-f]{64}$');

-- Runtime may bind once, but may never redirect an existing top-up to a new
-- financial token, even after its caller rotates its signing key.
CREATE FUNCTION briofold_ai_topup_bind_proof(w uuid,a uuid,tid uuid,proof_digest text)
 RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE record briofold_ai_topups%ROWTYPE;
BEGIN
 PERFORM pg13_actor(w,a,true);
 IF pg13_capability_override(w,a,'workspace:settings') IS FALSE
 THEN RAISE EXCEPTION 'access denied' USING ERRCODE='42501';END IF;
 IF proof_digest IS NULL OR proof_digest !~ '^[0-9a-f]{64}$'
 THEN RAISE EXCEPTION 'invalid payment locator' USING ERRCODE='22023';END IF;
 SELECT * INTO record FROM briofold_ai_topups
 WHERE workspace_id=w AND id=tid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'top-up not found' USING ERRCODE='P0002';END IF;
 IF record.checkout_token_digest IS NOT NULL THEN
  IF record.checkout_token_digest<>proof_digest
  THEN RAISE EXCEPTION 'top-up locator cannot change' USING ERRCODE='23505'; END IF;
  RETURN record.checkout_token_digest;
 END IF;
 IF record.status<>'pending'
 THEN RAISE EXCEPTION 'top-up is already complete' USING ERRCODE='23505';END IF;
 UPDATE briofold_ai_topups SET checkout_token_digest=proof_digest WHERE id=tid;
 RETURN proof_digest;
END $$;

CREATE FUNCTION briofold_ai_topup_payment_context(w uuid,a uuid,tid uuid)
 RETURNS TABLE(receiving_workspace_id uuid,amount_minor bigint,checkout_token_digest text)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM pg13_actor(w,a,true);
 IF pg13_capability_override(w,a,'workspace:settings') IS FALSE
 THEN RAISE EXCEPTION 'access denied' USING ERRCODE='42501';END IF;
 RETURN QUERY SELECT t.receiving_workspace_id,t.amount_minor,t.checkout_token_digest
 FROM briofold_ai_topups t WHERE t.workspace_id=w AND t.id=tid;
END $$;

-- Unbound legacy records cannot be automatically matched after a key
-- rotation. Never guess a new lookup token or credit without financial proof.
-- Such records must be bound using the original key before key rotation.
CREATE OR REPLACE FUNCTION briofold_ai_topup_claim_pending() RETURNS jsonb
 LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 WITH candidates AS (
  SELECT id FROM briofold_ai_topups
  WHERE status='pending' AND checkout_token_digest IS NOT NULL
   AND next_reconcile_at<=now()
  ORDER BY next_reconcile_at,created_at LIMIT 50 FOR UPDATE SKIP LOCKED
 ), claimed AS (
  UPDATE briofold_ai_topups t SET next_reconcile_at=now()+interval '2 minutes'
  FROM candidates c WHERE t.id=c.id
  RETURNING t.id,t.workspace_id,t.receiving_workspace_id,t.amount_minor,t.checkout_token_digest
 ) SELECT coalesce(jsonb_agg(to_jsonb(claimed)),'[]'::jsonb) FROM claimed
$$;
REVOKE ALL ON FUNCTION briofold_ai_topup_bind_proof(uuid,uuid,uuid,text),
 briofold_ai_topup_payment_context(uuid,uuid,uuid)
 FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION briofold_ai_topup_bind_proof(uuid,uuid,uuid,text),
 briofold_ai_topup_payment_context(uuid,uuid,uuid)
 TO ekmivo_financial_runtime;
COMMIT;
