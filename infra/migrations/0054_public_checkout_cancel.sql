-- 0054: capability-scoped customer cancellation of the current immutable checkout.
-- A reusable payment link remains active; this changes only its issued checkout intent.
BEGIN;
DO $preflight$ BEGIN
 IF to_regclass('public.auth_sessions') IS NOT NULL OR
    to_regclass('public.pg05_checkout_tokens') IS NULL OR
    NOT EXISTS(SELECT 1 FROM pg_class WHERE oid='public.financial_realm'::regclass
      AND relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user))
 THEN RAISE EXCEPTION '0054 requires isolated financial migration owner'; END IF;
END $preflight$;
CREATE OR REPLACE FUNCTION pg05_public_cancel(p_digest text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE intent payment_intents%ROWTYPE; current_state text;
BEGIN
 IF p_digest !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
 SELECT i.* INTO intent FROM pg05_checkout_tokens t
 JOIN payment_intents i ON i.workspace_id=t.workspace_id
  AND i.environment=t.environment AND i.id=t.intent_id
 JOIN financial_workspace_registry registry ON registry.workspace_id=i.workspace_id
  AND registry.environment=i.environment AND registry.status='active'
 WHERE t.token_digest=p_digest
  AND i.environment=(SELECT environment FROM financial_realm WHERE singleton)
 FOR UPDATE OF i;
 IF intent.id IS NULL THEN RETURN NULL; END IF;
 current_state:=pg05_intent_state(intent.workspace_id,intent.environment,intent.id);
 IF current_state IN ('completed','cancelled','expired') THEN
  RETURN jsonb_build_object('state',current_state,'id',intent.id);
 END IF;
 INSERT INTO pg05_intent_events(workspace_id,environment,intent_id,event_type,reason)
 VALUES(intent.workspace_id,intent.environment,intent.id,'cancelled','customer_cancelled')
 ON CONFLICT (workspace_id,environment,intent_id,event_type) DO NOTHING;
 RETURN jsonb_build_object('state','cancelled','id',intent.id);
END $$;
REVOKE ALL ON FUNCTION pg05_public_cancel(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pg05_public_cancel(text) TO ekmivo_finance_reader;
COMMIT;
