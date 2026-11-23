-- Financial databases (sandbox and live). Owner decision 2026-11-23: the shop
-- can accept a receipt. Accepting is recorded separately as "confirmed by the
-- shop"; it never creates an SMS-verified payment, so the rule that every
-- verified payment has a real provider SMS behind it stays intact.
--
-- * briofold_proof_approve: only for a receipt that waits for review, on a
--   checkout that is not completed. The full checkout amount is confirmed.
-- * pg05_intent_state: a checkout with an accepted receipt is 'completed', so the
--   customer page, the merchant API and payment links see it as paid.
-- * pg11_late_phone_receipt_case: if the phone later forwards the SMS of a
--   checkout the shop already accepted, no refund case is opened for it.
-- * briofold_proof_confirmed: accepted receipts without an SMS payment, for the
--   Transactions list ("confirmed by the shop").
--
-- Safe to run twice; stops on an unexpected function.
BEGIN;
DO $$BEGIN
 IF to_regprocedure('briofold_proof_scope(uuid,text)') IS NULL THEN
  RAISE EXCEPTION '0271 requires 0270'; END IF;
END $$;

CREATE OR REPLACE FUNCTION briofold_proof_approve(p_workspace uuid,p_environment text,p_intent uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p briofold_payment_proofs; st text;
BEGIN
 IF NOT briofold_proof_scope(p_workspace,p_environment) THEN RETURN NULL; END IF;
 PERFORM 1 FROM payment_intents WHERE workspace_id=p_workspace AND environment=p_environment AND id=p_intent FOR UPDATE;
 SELECT * INTO p FROM briofold_payment_proofs
 WHERE workspace_id=p_workspace AND environment=p_environment AND intent_id=p_intent FOR UPDATE;
 IF p.intent_id IS NULL THEN RETURN NULL; END IF;
 IF p.state='approved' THEN RETURN jsonb_build_object('state','approved'); END IF;
 st:=pg05_intent_state(p_workspace,p_environment,p_intent);
 IF st='completed' OR p.state<>'submitted' THEN
  RAISE EXCEPTION 'PROOF_NOT_PENDING' USING ERRCODE='P6808';
 END IF;
 UPDATE briofold_payment_proofs SET state='approved',decided_at=now(),decided_by=NULL,
  decision_reason=NULL,seen_at=coalesce(seen_at,now()),updated_at=now()
 WHERE workspace_id=p_workspace AND environment=p_environment AND intent_id=p_intent;
 RETURN jsonb_build_object('state','approved');
END $$;

CREATE OR REPLACE FUNCTION briofold_proof_confirmed(p_workspace uuid,p_environment text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT briofold_proof_scope(p_workspace,p_environment) THEN RETURN NULL; END IF;
 RETURN COALESCE((SELECT jsonb_agg(x.j ORDER BY x.at DESC) FROM (
  SELECT p.decided_at at,jsonb_build_object('id',p.intent_id,'payment_intent_id',p.intent_id,
   'merchant_reference',i.merchant_reference,'verified_amount_minor',i.amount_minor,'currency',i.currency,
   'status','merchant_confirmed','verification_method','merchant_confirmed','verified_at',p.decided_at,
   'manual',true) j
  FROM briofold_payment_proofs p
  JOIN payment_intents i ON i.workspace_id=p.workspace_id AND i.environment=p.environment AND i.id=p.intent_id
  WHERE p.workspace_id=p_workspace AND p.environment=p_environment AND p.state='approved'
   AND NOT EXISTS(SELECT 1 FROM financial_allocations a WHERE a.workspace_id=p.workspace_id
    AND a.environment=p.environment AND a.intent_id=p.intent_id)
  ORDER BY p.decided_at DESC LIMIT 100) x),'[]'::jsonb);
END $$;

CREATE FUNCTION pg_temp.patch_0271(sig text,marker text,pairs text[][]) RETURNS void LANGUAGE plpgsql AS $$
DECLARE d text; i integer;
BEGIN
 d:=pg_get_functiondef(sig::regprocedure);
 IF position(marker IN d)>0 THEN RETURN; END IF;
 FOR i IN 1..array_length(pairs,1) LOOP
  IF (length(d)-length(replace(d,pairs[i][1],'')))/length(pairs[i][1])<>1 THEN
   RAISE EXCEPTION 'Unknown %; inspect before applying 0271',sig;
  END IF;
  d:=replace(d,pairs[i][1],pairs[i][2]);
 END LOOP;
 EXECUTE d;
END $$;

SELECT pg_temp.patch_0271('pg05_intent_state(uuid,text,uuid)','0271 shop confirmed',ARRAY[
 [' SELECT CASE'||chr(13)||chr(10)||'  WHEN (SELECT COALESCE(sum(a.amount_minor),0) FROM financial_allocations a',
  ' SELECT CASE'||chr(13)||chr(10)||'  WHEN EXISTS(SELECT 1 FROM briofold_payment_proofs bp /* 0271 shop confirmed */ WHERE bp.workspace_id=i.workspace_id'||chr(13)||chr(10)||
  '   AND bp.environment=i.environment AND bp.intent_id=i.id AND bp.state=''approved'') THEN ''completed'''||chr(13)||chr(10)||
  '  WHEN (SELECT COALESCE(sum(a.amount_minor),0) FROM financial_allocations a']]);

SELECT pg_temp.patch_0271('pg11_late_phone_receipt_case()','0271 shop confirmed',ARRAY[
 ['IF NOT FOUND OR EXISTS(SELECT 1 FROM financial_payments p WHERE p.attempt_id=a.id)',
  'IF NOT FOUND OR EXISTS(SELECT 1 FROM financial_payments p WHERE p.attempt_id=a.id)'||
  ' OR EXISTS(SELECT 1 FROM briofold_payment_proofs bp /* 0271 shop confirmed */ WHERE bp.workspace_id=a.workspace_id'||
  ' AND bp.environment=a.environment AND bp.intent_id=a.intent_id AND bp.state=''approved'')']]);

REVOKE ALL ON FUNCTION briofold_proof_approve(uuid,text,uuid),briofold_proof_confirmed(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION briofold_proof_approve(uuid,text,uuid),briofold_proof_confirmed(uuid,text) TO ekmivo_finance_reader;
COMMIT;
