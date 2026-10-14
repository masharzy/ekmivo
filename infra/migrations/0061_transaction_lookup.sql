-- 0061: tenant-scoped, read-only TrxID-assisted status lookup.
-- This cannot create, allocate, confirm or consume a payment. No money state mutation.
-- Direct SELECT of raw receipt observations is intentionally NOT granted to the API role.
BEGIN;
DO $preflight$ BEGIN
 IF to_regclass('public.financial_realm') IS NULL
    OR to_regclass('public.financial_receipt_observations') IS NULL
    OR to_regclass('public.financial_payments') IS NULL
    OR to_regclass('public.payment_intents') IS NULL
    OR to_regclass('public.payment_attempts') IS NULL
    OR to_regprocedure('public.pg06_scope(uuid,text)') IS NULL
    OR to_regclass('public.auth_sessions') IS NOT NULL THEN
  RAISE EXCEPTION '0061 requires an isolated financial realm with verified payment tables' USING ERRCODE='42501';
 END IF;
END $preflight$;

CREATE FUNCTION public.pg61_transaction_lookup(
 w uuid, e text, intent uuid, method text, reference_digest text, amount bigint
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path=public,pg_temp AS $$
DECLARE
 result jsonb;
BEGIN
 PERFORM pg06_scope(w,e);
 IF intent IS NULL OR method NOT IN ('bkash','nagad','rocket')
    OR reference_digest IS NULL OR reference_digest !~ '^[0-9a-f]{64}$'
    OR amount IS NULL OR amount<=0 THEN
  RAISE EXCEPTION 'invalid transaction lookup' USING ERRCODE='22023';
 END IF;
 SELECT jsonb_build_object(
    'verified',true,
    'status','verified',
    'payment_intent_id',i.id,
    'payment_id',p.id,
    'verified_at',p.verified_at
 ) INTO result
 FROM payment_intents i
 JOIN payment_attempts a ON a.intent_id=i.id
      AND a.workspace_id=w AND a.environment=e
 JOIN financial_payments p ON p.attempt_id=a.id
      AND p.workspace_id=w AND p.environment=e
 JOIN financial_receipt_observations o ON o.id=p.observation_id
      AND o.workspace_id=w AND o.environment=e
 WHERE i.id=intent AND i.workspace_id=w AND i.environment=e
   AND o.provider_reference_hmac=reference_digest
   AND o.method=method AND o.direction='incoming'
   AND p.verified_amount_minor=amount
   AND o.amount_minor=amount AND i.amount_minor=amount
   AND o.payer_hmac=a.payer_hmac
   AND o.original_transaction_at>=a.window_start
   AND o.original_transaction_at<a.window_end
 ORDER BY p.verified_at DESC,p.id DESC LIMIT 1;
 RETURN COALESCE(result,jsonb_build_object(
   'verified',false,'status','pending','payment_intent_id',intent));
END $$;
REVOKE ALL ON FUNCTION public.pg61_transaction_lookup(uuid,text,uuid,text,text,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pg61_transaction_lookup(uuid,text,uuid,text,text,bigint) TO ekmivo_finance_reader;
COMMIT;
