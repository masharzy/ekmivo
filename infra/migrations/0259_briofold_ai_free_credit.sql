-- 0259: one-time free AI credit (৳30) for a business. Control database only.
-- Owner decision 2026-11-16: "Free" on the AI credit pricing gives 30 credit (= ৳30 balance), no payment.
-- The amount is fixed here, never sent by a client. One grant per business AND one per user, so a
-- person cannot collect it again by creating more businesses. Journal kind 'free_grant' is added.
-- Safe to run twice: the constraint and function are replaced only when needed. No existing rows change.
BEGIN;
DO $pre$
BEGIN
 IF to_regclass('public.briofold_ai_credit_journal') IS NULL OR to_regclass('public.financial_realm') IS NOT NULL
 THEN RAISE EXCEPTION '0259 requires the control database with the AI wallet (0124)'; END IF;
END
$pre$;

DO $kind$
DECLARE def text;
BEGIN
 SELECT pg_get_constraintdef(c.oid) INTO def FROM pg_constraint c
  WHERE c.conrelid='public.briofold_ai_credit_journal'::regclass AND c.conname='briofold_ai_credit_journal_kind_check';
 IF def IS NULL THEN RAISE EXCEPTION '0259: journal kind constraint not found; nothing changed'; END IF;
 IF position('free_grant' IN def)>0 THEN RETURN; END IF; -- already applied
 ALTER TABLE briofold_ai_credit_journal DROP CONSTRAINT briofold_ai_credit_journal_kind_check;
 ALTER TABLE briofold_ai_credit_journal ADD CONSTRAINT briofold_ai_credit_journal_kind_check
  CHECK(kind IN('verified_topup','reserve','settle','release','correction','free_grant'));
END
$kind$;

CREATE INDEX IF NOT EXISTS briofold_ai_journal_free_grant_actor_idx
 ON briofold_ai_credit_journal(actor_id) WHERE kind='free_grant';

CREATE OR REPLACE FUNCTION briofold_ai_free_credit_claim(w uuid,a uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 amount constant bigint := 3000; -- ৳30.00 in paisa
 wallet briofold_ai_wallets%ROWTYPE;
BEGIN
 IF w IS NULL OR a IS NULL THEN RAISE EXCEPTION 'invalid request' USING ERRCODE='22023'; END IF;
 PERFORM pg13_actor(w,a,true);
 IF NOT EXISTS(SELECT 1 FROM workspace_members m JOIN app_users u ON u.id=m.user_id
   WHERE m.workspace_id=w AND m.user_id=a AND m.role IN('owner','admin') AND u.disabled_at IS NULL)
 OR NOT EXISTS(SELECT 1 FROM workspace_product_access WHERE workspace_id=w AND product='ai' AND enabled)
 THEN RAISE EXCEPTION 'access denied' USING ERRCODE='42501'; END IF;
 -- Same lock as every other wallet change for this business, plus one per user.
 PERFORM pg_advisory_xact_lock(hashtextextended('briofold:ai:'||w::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('briofold:ai-free:'||a::text,0));
 IF EXISTS(SELECT 1 FROM briofold_ai_credit_journal WHERE workspace_id=w AND operation_key='free-credit:'||w::text)
 OR EXISTS(SELECT 1 FROM briofold_ai_credit_journal WHERE kind='free_grant' AND actor_id=a) THEN
  SELECT * INTO wallet FROM briofold_ai_wallets WHERE workspace_id=w;
  RETURN jsonb_build_object('granted',false,'reason','ALREADY_CLAIMED','amount_minor',amount,
   'balance_minor',coalesce(wallet.available_minor,0));
 END IF;
 INSERT INTO briofold_ai_wallets(workspace_id) VALUES(w) ON CONFLICT DO NOTHING;
 UPDATE briofold_ai_wallets SET available_minor=available_minor+amount,updated_at=now()
  WHERE workspace_id=w RETURNING * INTO wallet;
 INSERT INTO briofold_ai_credit_journal(workspace_id,operation_key,kind,available_delta_minor,
   reserved_delta_minor,available_after_minor,reserved_after_minor,actor_id)
  VALUES(w,'free-credit:'||w::text,'free_grant',amount,0,wallet.available_minor,wallet.reserved_minor,a);
 RETURN jsonb_build_object('granted',true,'amount_minor',amount,'balance_minor',wallet.available_minor);
END $$;

-- Read-only: can this person still claim it here? The pricing page uses it to show or hide "Free".
CREATE OR REPLACE FUNCTION briofold_ai_free_credit_available(w uuid,a uuid) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT NOT EXISTS(SELECT 1 FROM briofold_ai_credit_journal WHERE workspace_id=w AND operation_key='free-credit:'||w::text)
    AND NOT EXISTS(SELECT 1 FROM briofold_ai_credit_journal WHERE kind='free_grant' AND actor_id=a)
$$;

REVOKE ALL ON FUNCTION briofold_ai_free_credit_claim(uuid,uuid),briofold_ai_free_credit_available(uuid,uuid)
 FROM PUBLIC,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION briofold_ai_free_credit_claim(uuid,uuid),briofold_ai_free_credit_available(uuid,uuid)
 TO ekmivo_financial_runtime;
COMMIT;
