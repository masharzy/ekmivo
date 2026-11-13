-- 0248 (financial realm, sandbox + live): read-only lookup of unused incoming receipts from one sender.
-- Lets the AI confirm a payment from the sender number alone when exactly one receipt of the exact amount exists.
-- Same guarantees as 0236: it cannot create, allocate or consume a payment, and direct SELECT stays ungranted.
-- Only receipts the realm matcher already left 'unmatched' and that no checkout payment used are returned, newest first.
BEGIN;
DO $preflight$ BEGIN
 IF to_regclass('public.financial_realm') IS NULL OR to_regclass('public.financial_receipt_observations') IS NULL
    OR to_regclass('public.financial_payments') IS NULL OR to_regclass('public.pg07_receipt_results') IS NULL OR to_regprocedure('public.pg06_scope(uuid,text)') IS NULL
    OR to_regclass('public.auth_sessions') IS NOT NULL THEN
  RAISE EXCEPTION '0248 requires an isolated financial realm' USING ERRCODE='42501';
 END IF;
END $preflight$;

CREATE OR REPLACE FUNCTION public.pg248_ai_receipts_by_payer(w uuid,e text,payer_digest text,since timestamptz) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=public,pg_temp AS $$
DECLARE result jsonb;BEGIN
 PERFORM pg06_scope(w,e);
 IF payer_digest IS NULL OR payer_digest!~'^[0-9a-f]{64}$' OR since IS NULL OR since<now()-interval '7 days' THEN
  RAISE EXCEPTION 'invalid receipt lookup' USING ERRCODE='22023';
 END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.at DESC),'[]'::jsonb) INTO result FROM (
  SELECT o.provider_reference_hmac AS reference_digest,o.method,o.amount_minor,o.original_transaction_at AS at,o.receiving_account_id
  FROM financial_receipt_observations o
  WHERE o.workspace_id=w AND o.environment=e AND o.payer_hmac=payer_digest AND o.direction='incoming' AND o.original_transaction_at>=since
    AND NOT EXISTS(SELECT 1 FROM financial_payments p WHERE p.workspace_id=w AND p.environment=e AND p.observation_id=o.id)
    AND (SELECT r.status FROM pg07_receipt_results r WHERE r.observation_id=o.id)='unmatched'
  ORDER BY o.original_transaction_at DESC LIMIT 10) x;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION public.pg248_ai_receipts_by_payer(uuid,text,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pg248_ai_receipts_by_payer(uuid,text,text,timestamptz) TO ekmivo_finance_reader;
COMMIT;
