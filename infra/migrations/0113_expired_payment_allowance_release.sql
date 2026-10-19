-- 0113 FINANCIAL (live and sandbox). Reserved slots expire with checkout.
-- Late cryptographically verified funds still transition released -> consumed.
-- No intent, allocation, verification, or audit history is deleted.
BEGIN;
CREATE OR REPLACE FUNCTION payment_allowance_reconcile_expired(batch_size integer DEFAULT 200)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE released bigint:=0;
BEGIN
 IF batch_size IS NULL OR batch_size<1 OR batch_size>500 THEN
  RAISE EXCEPTION 'invalid allowance cleanup batch' USING ERRCODE='22023';
 END IF;
 WITH stale AS (
  SELECT s.workspace_id,s.environment,s.intent_id FROM payment_allowance_slots s
  WHERE s.environment=(SELECT environment FROM financial_realm WHERE singleton)
    AND s.state='reserved' AND s.expires_at<=now()
  ORDER BY s.expires_at,s.intent_id LIMIT batch_size FOR UPDATE OF s SKIP LOCKED
 )
 UPDATE payment_allowance_slots s SET state='released'
 FROM stale
 WHERE s.workspace_id=stale.workspace_id AND s.environment=stale.environment
   AND s.intent_id=stale.intent_id AND s.state='reserved';
 GET DIAGNOSTICS released=ROW_COUNT;
 RETURN released;
END $$;
REVOKE ALL ON FUNCTION payment_allowance_reconcile_expired(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION payment_allowance_reconcile_expired(integer) TO ekmivo_finance_reader;
COMMIT;
