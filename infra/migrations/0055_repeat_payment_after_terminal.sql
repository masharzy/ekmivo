-- 0055: paid/cancelled/expired attempts must not block repeat customer purchases.
-- Only genuinely active, overlapping payer/method/amount attempts conflict.
BEGIN;
CREATE OR REPLACE FUNCTION financial_validate_attempt() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE intent payment_intents%ROWTYPE; method_of_account text; has_overlap boolean;
BEGIN
 SELECT * INTO intent FROM payment_intents
  WHERE workspace_id=NEW.workspace_id AND environment=NEW.environment
   AND id=NEW.intent_id;
 SELECT method INTO method_of_account FROM financial_receiving_accounts
  WHERE workspace_id=NEW.workspace_id AND environment=NEW.environment
   AND id=NEW.receiving_account_id;
 IF intent.id IS NULL OR method_of_account IS NULL
    OR intent.amount_minor<>NEW.amount_minor OR intent.currency<>NEW.currency
    OR method_of_account<>NEW.method OR NEW.window_start<NEW.issued_at
    OR NEW.window_end>intent.expires_at THEN
  RAISE EXCEPTION 'attempt cannot change issued amount, receiving method or window'
   USING ERRCODE='23514';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(
  NEW.workspace_id::text||':'||NEW.environment||':'||NEW.payer_hmac||':'||NEW.method||':'||NEW.amount_minor::text,0));
 SELECT EXISTS (
  SELECT 1 FROM payment_attempts a
  WHERE a.workspace_id=NEW.workspace_id AND a.environment=NEW.environment
    AND a.payer_hmac=NEW.payer_hmac AND a.method=NEW.method
    AND a.amount_minor=NEW.amount_minor
    AND pg05_intent_state(a.workspace_id,a.environment,a.intent_id)
        IN ('requires_payer','awaiting_payment')
    AND tstzrange(a.window_start,a.window_end,'[)') &&
        tstzrange(NEW.window_start,NEW.window_end,'[)')
 ) INTO has_overlap;
 IF has_overlap THEN
  RAISE EXCEPTION 'overlapping payer/account/method/amount attempt'
   USING ERRCODE='23505';
 END IF;
 RETURN NEW;
END; $$;
COMMIT;
