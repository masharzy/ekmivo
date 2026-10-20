-- Control only. A verified purchase survives closed browser tabs, membership
-- revocation and worker restarts. Only the trusted financial projector can sweep.
BEGIN;
DO $$BEGIN
 IF to_regclass('public.briofold_ai_topups') IS NULL OR to_regclass('public.financial_realm') IS NOT NULL
 THEN RAISE EXCEPTION 'AI top-up recovery requires control database';END IF;
END $$;
ALTER TABLE briofold_ai_topups ADD COLUMN next_reconcile_at timestamptz NOT NULL DEFAULT now();
CREATE INDEX briofold_ai_topup_recovery_idx ON briofold_ai_topups(next_reconcile_at,created_at) WHERE status='pending';
CREATE FUNCTION briofold_ai_topup_claim_pending() RETURNS jsonb
 LANGUAGE sql VOLATILE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 WITH candidates AS (
  SELECT id FROM briofold_ai_topups WHERE status='pending' AND next_reconcile_at<=now()
  ORDER BY next_reconcile_at,created_at LIMIT 50 FOR UPDATE SKIP LOCKED
 ), claimed AS (
  UPDATE briofold_ai_topups t SET next_reconcile_at=now()+interval '2 minutes'
  FROM candidates c WHERE t.id=c.id
  RETURNING t.id,t.workspace_id,t.receiving_workspace_id,t.amount_minor
 ) SELECT coalesce(jsonb_agg(to_jsonb(claimed)),'[]'::jsonb) FROM claimed
$$;
CREATE FUNCTION briofold_ai_topup_credit_proof(w uuid,topup_id uuid,verified_id uuid,verified_minor bigint) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE row briofold_ai_topups%ROWTYPE;wallet briofold_ai_wallets%ROWTYPE;
BEGIN
 IF verified_id IS NULL OR verified_minor IS NULL OR verified_minor<=0
 THEN RAISE EXCEPTION 'invalid proof' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('briofold:ai:'||w::text,0));
 SELECT * INTO row FROM briofold_ai_topups WHERE workspace_id=w AND id=topup_id FOR UPDATE;
 IF NOT FOUND OR row.amount_minor<>verified_minor THEN RAISE EXCEPTION 'topup mismatch' USING ERRCODE='22023';END IF;
 IF row.status='credited' THEN
  IF row.verified_payment_id IS DISTINCT FROM verified_id THEN RAISE EXCEPTION 'proof conflict' USING ERRCODE='23505';END IF;
  SELECT * INTO wallet FROM briofold_ai_wallets WHERE workspace_id=w;
  RETURN jsonb_build_object('credited',false,'balance_minor',wallet.available_minor);
 END IF;
 UPDATE briofold_ai_topups SET status='credited',verified_payment_id=verified_id,credited_at=now() WHERE id=topup_id;
 INSERT INTO briofold_ai_wallets(workspace_id) VALUES(w) ON CONFLICT DO NOTHING;
 UPDATE briofold_ai_wallets SET available_minor=available_minor+row.amount_minor,updated_at=now()
  WHERE workspace_id=w RETURNING * INTO wallet;
 INSERT INTO briofold_ai_credit_journal(workspace_id,operation_key,kind,available_delta_minor,
  reserved_delta_minor,available_after_minor,reserved_after_minor,reference_id)
 VALUES(w,'topup:'||topup_id::text,'verified_topup',row.amount_minor,0,wallet.available_minor,wallet.reserved_minor,verified_id);
 RETURN jsonb_build_object('credited',true,'balance_minor',wallet.available_minor);
END $$;
-- The interactive and worker routes share exactly one crediting implementation.
CREATE OR REPLACE FUNCTION briofold_ai_topup_apply_verified(w uuid,a uuid,topup_id uuid,verified_id uuid,verified_minor bigint) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM pg13_actor(w,a,true);
 IF pg13_capability_override(w,a,'workspace:settings') IS FALSE
 THEN RAISE EXCEPTION 'access denied' USING ERRCODE='42501';END IF;
 RETURN briofold_ai_topup_credit_proof(w,topup_id,verified_id,verified_minor);
END $$;
REVOKE ALL ON FUNCTION briofold_ai_topup_claim_pending(),briofold_ai_topup_credit_proof(uuid,uuid,uuid,bigint)
 FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION briofold_ai_topup_claim_pending(),briofold_ai_topup_credit_proof(uuid,uuid,uuid,bigint)
 TO ekmivo_financial_projection;
COMMIT;
