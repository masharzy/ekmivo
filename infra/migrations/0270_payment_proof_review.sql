-- Financial databases (sandbox and live). Owner decision 2026-11-23: the shop
-- sees uploaded receipts in a separate list on the dashboard, with a badge for
-- new ones, can open the photos and can reject a receipt. After a rejection the
-- customer can upload again; otherwise one upload ends the customer's part.
--
-- This migration never verifies a payment, never changes an amount and never
-- completes a checkout. Approving (paid + transaction) is a separate step.
--
-- * briofold_proof_list: newest first, with the checkout reference, amount and
--   its current state, so a receipt whose payment was verified automatically
--   in the meantime shows as such.
-- * briofold_proof_image: the private object key of photo n (the API streams it).
-- * briofold_proof_seen: clears the "new" badge for one receipt.
-- * briofold_proof_reject: only while the checkout is not completed.
-- * briofold_proof_submit: after a rejection the old photos are replaced.
--
-- Safe to run twice; stops on an unexpected function.
BEGIN;
DO $$BEGIN
 IF to_regclass('public.briofold_payment_proofs') IS NULL THEN
  RAISE EXCEPTION '0270 requires 0265'; END IF;
END $$;

-- The merchant guard used by pg05_merchant_list: scoped session and an active workspace.
CREATE OR REPLACE FUNCTION briofold_proof_scope(p_workspace uuid,p_environment text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT current_setting('ekmivo.workspace_id',true)=p_workspace::text
  AND current_setting('ekmivo.environment',true)=p_environment
  AND EXISTS(SELECT 1 FROM financial_workspace_registry WHERE workspace_id=p_workspace
   AND environment=p_environment AND status='active')
$$;

CREATE OR REPLACE FUNCTION briofold_proof_list(p_workspace uuid,p_environment text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT briofold_proof_scope(p_workspace,p_environment) THEN RETURN NULL; END IF;
 RETURN jsonb_build_object(
  'new',(SELECT count(*) FROM briofold_payment_proofs p WHERE p.workspace_id=p_workspace
   AND p.environment=p_environment AND p.state='submitted' AND p.seen_at IS NULL
   AND pg05_intent_state(p.workspace_id,p.environment,p.intent_id) NOT IN ('completed','cancelled')),
  'items',COALESCE((SELECT jsonb_agg(x.j ORDER BY x.u DESC) FROM (
   SELECT p.updated_at u,jsonb_build_object(
    'intent_id',p.intent_id,'reference',i.merchant_reference,'amount_minor',i.amount_minor,
    'currency',i.currency,'checkout_created_at',i.created_at,
    'checkout_state',pg05_intent_state(p.workspace_id,p.environment,p.intent_id),
    'state',p.state,'image_count',jsonb_array_length(p.images),
    'images',(SELECT COALESCE(jsonb_agg(jsonb_build_object('at',e->>'at','bytes',(e->>'bytes')::bigint)),'[]'::jsonb)
      FROM jsonb_array_elements(p.images) e),
    'submitted_at',p.created_at,'updated_at',p.updated_at,'seen',p.seen_at IS NOT NULL,
    'decided_at',p.decided_at,'decision_reason',p.decision_reason) j
   FROM briofold_payment_proofs p
   JOIN payment_intents i ON i.workspace_id=p.workspace_id AND i.environment=p.environment AND i.id=p.intent_id
   WHERE p.workspace_id=p_workspace AND p.environment=p_environment
   ORDER BY p.updated_at DESC LIMIT 200) x),'[]'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION briofold_proof_image(p_workspace uuid,p_environment text,p_intent uuid,p_index integer) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE k text;
BEGIN
 IF NOT briofold_proof_scope(p_workspace,p_environment) OR p_index IS NULL OR p_index<0 OR p_index>4 THEN RETURN NULL; END IF;
 SELECT p.images->p_index->>'key' INTO k FROM briofold_payment_proofs p
 WHERE p.workspace_id=p_workspace AND p.environment=p_environment AND p.intent_id=p_intent;
 IF k IS NULL OR k !~ '^payment-proofs/[0-9a-f-]{36}\.jpg$' THEN RETURN NULL; END IF;
 RETURN k;
END $$;

CREATE OR REPLACE FUNCTION briofold_proof_seen(p_workspace uuid,p_environment text,p_intent uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT briofold_proof_scope(p_workspace,p_environment) THEN RETURN NULL; END IF;
 UPDATE briofold_payment_proofs SET seen_at=coalesce(seen_at,now())
 WHERE workspace_id=p_workspace AND environment=p_environment AND intent_id=p_intent;
 IF NOT FOUND THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('seen',true);
END $$;

CREATE OR REPLACE FUNCTION briofold_proof_reject(p_workspace uuid,p_environment text,p_intent uuid,p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p briofold_payment_proofs; st text; why text;
BEGIN
 IF NOT briofold_proof_scope(p_workspace,p_environment) THEN RETURN NULL; END IF;
 why:=nullif(left(btrim(coalesce(p_reason,'')),300),'');
 PERFORM 1 FROM payment_intents WHERE workspace_id=p_workspace AND environment=p_environment AND id=p_intent FOR UPDATE;
 SELECT * INTO p FROM briofold_payment_proofs
 WHERE workspace_id=p_workspace AND environment=p_environment AND intent_id=p_intent FOR UPDATE;
 IF p.intent_id IS NULL THEN RETURN NULL; END IF;
 st:=pg05_intent_state(p_workspace,p_environment,p_intent);
 IF st='completed' OR p.state IN ('approved','auto_verified') THEN
  RAISE EXCEPTION 'PROOF_ALREADY_SETTLED' USING ERRCODE='P6808';
 END IF;
 UPDATE briofold_payment_proofs SET state='rejected',decided_at=now(),decided_by=NULL,
  decision_reason=why,seen_at=coalesce(seen_at,now()),updated_at=now()
 WHERE workspace_id=p_workspace AND environment=p_environment AND intent_id=p_intent;
 RETURN jsonb_build_object('state','rejected');
END $$;

-- After a rejection a new upload replaces the old photos (still max 5).
CREATE FUNCTION pg_temp.patch_submit(pairs text[][]) RETURNS void LANGUAGE plpgsql AS $$
DECLARE d text; i integer;
BEGIN
 d:=pg_get_functiondef('briofold_proof_submit(text,text,jsonb)'::regprocedure);
 IF position('0270 after rejection' IN d)>0 THEN RETURN; END IF;
 FOR i IN 1..array_length(pairs,1) LOOP
  IF (length(d)-length(replace(d,pairs[i][1],'')))/length(pairs[i][1])<>1 THEN
   RAISE EXCEPTION 'Unknown briofold_proof_submit; inspect before applying 0270';
  END IF;
  d:=replace(d,pairs[i][1],pairs[i][2]);
 END LOOP;
 EXECUTE d;
END $$;
SELECT pg_temp.patch_submit(ARRAY[
 ['(p_image IS NOT NULL AND jsonb_array_length(p.images)>=5)',
  '(p_image IS NOT NULL AND p.state<>''rejected'' AND jsonb_array_length(p.images)>=5)'],
 ['images=CASE WHEN p_image IS NULL THEN images ELSE images||jsonb_build_array(',
  'images=CASE WHEN p_image IS NULL THEN images WHEN p.state=''rejected'' /* 0270 after rejection */ THEN jsonb_build_array(p_image||jsonb_build_object(''at'',now())) ELSE images||jsonb_build_array(']]);

REVOKE ALL ON FUNCTION briofold_proof_scope(uuid,text),briofold_proof_list(uuid,text),
 briofold_proof_image(uuid,text,uuid,integer),briofold_proof_seen(uuid,text,uuid),
 briofold_proof_reject(uuid,text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION briofold_proof_list(uuid,text),briofold_proof_image(uuid,text,uuid,integer),
 briofold_proof_seen(uuid,text,uuid),briofold_proof_reject(uuid,text,uuid,text) TO ekmivo_finance_reader;
COMMIT;
