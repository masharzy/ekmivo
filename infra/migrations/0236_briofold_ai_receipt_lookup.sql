-- 0236 (financial realm, sandbox + live): read-only receipt lookup for AI payment claims.
-- Direct SELECT of receipt observations is not granted to the API role; this function is the only read path.
-- It cannot create, allocate or consume a payment. "allocated" tells the caller a checkout payment already used the receipt;
-- "checkout_status" is the realm matcher's decision (pending/matched/unmatched/ambiguous/...). The matcher runs once per receipt and
-- a later checkout attempt can never match an earlier SMS (its window starts at lock time), so an AI claim is only safe after
-- the matcher said 'unmatched'.
BEGIN;
DO $preflight$ BEGIN
 IF to_regclass('public.financial_realm') IS NULL OR to_regclass('public.financial_receipt_observations') IS NULL
    OR to_regclass('public.financial_payments') IS NULL OR to_regclass('public.pg07_receipt_results') IS NULL OR to_regprocedure('public.pg06_scope(uuid,text)') IS NULL
    OR to_regclass('public.auth_sessions') IS NOT NULL THEN
  RAISE EXCEPTION '0236 requires an isolated financial realm' USING ERRCODE='42501';
 END IF;
END $preflight$;

CREATE OR REPLACE FUNCTION public.pg236_ai_receipt(w uuid,e text,reference_digest text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=public,pg_temp AS $$
DECLARE result jsonb;BEGIN
 PERFORM pg06_scope(w,e);
 IF reference_digest IS NULL OR reference_digest!~'^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'invalid receipt lookup' USING ERRCODE='22023';END IF;
 SELECT jsonb_build_object('method',o.method,'amount_minor',o.amount_minor,'at',o.original_transaction_at,'direction',o.direction,'payer_hmac',o.payer_hmac,
   'receiving_account_id',o.receiving_account_id,'allocated',EXISTS(SELECT 1 FROM financial_payments p WHERE p.workspace_id=w AND p.environment=e AND p.observation_id=o.id),
   'checkout_status',coalesce((SELECT r.status FROM pg07_receipt_results r WHERE r.observation_id=o.id),'pending'))
 INTO result FROM financial_receipt_observations o
 WHERE o.workspace_id=w AND o.environment=e AND o.provider_reference_hmac=reference_digest
 ORDER BY o.original_transaction_at DESC LIMIT 1;
 RETURN result; -- NULL: no SMS receipt yet
END $$;
REVOKE ALL ON FUNCTION public.pg236_ai_receipt(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pg236_ai_receipt(uuid,text,text) TO ekmivo_finance_reader;
COMMIT;
