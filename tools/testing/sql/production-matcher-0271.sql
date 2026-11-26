-- Production versions (financial realm at 0271, read from a copy of the live database on 2026-11-26 with
-- pg_get_functiondef) of the three functions 0275 replaces, plus the allocation cap trigger of 0008.
-- Created in the stand-in database so 0275's md5 guard and the matching rules are tested against the real code.
CREATE OR REPLACE FUNCTION public.financial_verify_payment_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE a payment_attempts%ROWTYPE; o financial_receipt_observations%ROWTYPE; src text;
BEGIN
 SELECT * INTO a FROM payment_attempts
  WHERE workspace_id=NEW.workspace_id AND environment=NEW.environment
   AND id=NEW.attempt_id FOR UPDATE;
 SELECT * INTO o FROM financial_receipt_observations
  WHERE workspace_id=NEW.workspace_id AND environment=NEW.environment
   AND id=NEW.observation_id FOR UPDATE;
 IF a.id IS NULL OR o.id IS NULL OR o.payer_hmac IS NULL
   OR a.payer_hmac<>o.payer_hmac
   OR a.receiving_account_id<>o.receiving_account_id
   OR a.method<>o.method OR a.currency<>o.currency
   OR a.currency<>NEW.currency OR a.amount_minor<>NEW.verified_amount_minor
   OR o.amount_minor<>NEW.verified_amount_minor OR o.direction<>'incoming'
   OR o.original_transaction_at IS NULL OR o.time_precision='unknown'
   OR o.original_transaction_at<briofold_sms_window_start(a.window_start,o.time_precision)
   OR (o.time_precision='minute' AND o.original_transaction_at>=a.window_end)
   OR (o.time_precision='second' AND o.original_transaction_at>=a.window_end)
   OR a.policy_version<>NEW.policy_version THEN
   RAISE EXCEPTION 'verified payment requires a complete matching immutable attempt and receipt'
    USING ERRCODE='23514';
 END IF;
 SELECT e.source_kind INTO src FROM financial_inbound_events e
  WHERE e.workspace_id=NEW.workspace_id AND e.environment=NEW.environment AND e.id=o.inbound_event_id;
 IF NOT (
    (NEW.verification_method='sms_match' AND src='device_sms')
 OR (NEW.verification_method='notification_match' AND src='device_notification')
 OR (NEW.verification_method='provider_api' AND src='provider_api')
 OR (NEW.verification_method='bank_statement' AND src='bank_statement')
 OR (NEW.verification_method='sandbox_fixture' AND src='sandbox_fixture' AND NEW.environment='sandbox')
 ) THEN
  RAISE EXCEPTION 'verification source provenance or environment mismatch' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $function$;

CREATE OR REPLACE FUNCTION public.pg07_match(o_id uuid, expected_version bigint)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
 o financial_receipt_observations;
 a payment_attempts;
 candidate_count integer;
 payment uuid;
 event uuid;
 source text;
 verification text;
 status_name text;
 no_match_reason text;
 result pg07_receipt_results;
 locked_intent uuid;
BEGIN
 -- Serialize two workers on the same receipt. Never retry a completed match
 -- or issue a second payment/event when the River wake-up is duplicated.
 SELECT * INTO result FROM pg07_receipt_results WHERE observation_id=o_id FOR UPDATE;
 IF result.observation_id IS NULL THEN RETURN 'missing'; END IF;
 IF result.status <> 'pending' THEN RETURN result.status; END IF;
 IF result.environment IS DISTINCT FROM (SELECT environment FROM financial_realm WHERE singleton)
 OR NOT EXISTS(
  SELECT 1 FROM financial_workspace_registry
  WHERE workspace_id=result.workspace_id AND environment=result.environment
    AND status='active' AND entitlement_version=expected_version
 ) THEN RAISE EXCEPTION 'stale authority or wrong financial realm' USING ERRCODE='42501'; END IF;
 SELECT * INTO o FROM financial_receipt_observations
 WHERE id=o_id AND workspace_id=result.workspace_id AND environment=result.environment FOR UPDATE;
 IF o.id IS NULL THEN RAISE EXCEPTION 'untrusted observation' USING ERRCODE='42501'; END IF;
 -- Do not infer a masked payer, original timestamp, missing source identity,
 -- uncertain amount or outgoing direction from upload/observed_at metadata.
 IF o.direction<>'incoming' OR o.payer_hmac IS NULL OR o.receiving_account_id IS NULL
 OR o.method IS NULL OR o.amount_minor IS NULL OR o.amount_minor<=0
 OR o.original_transaction_at IS NULL OR o.time_precision NOT IN ('second','minute')
 OR o.original_transaction_at>now()+interval '5 minutes' THEN
  UPDATE pg07_receipt_results SET status='unmatched',reason='incomplete_or_nonincoming_evidence',
    processed_at=now() WHERE observation_id=o_id;
  RETURN 'unmatched';
 END IF;
 -- An issued attempt remains eligible for reconciliation after an account is disabled.
 SELECT e.source_kind INTO source FROM financial_inbound_events e
 WHERE e.workspace_id=o.workspace_id AND e.environment=o.environment AND e.id=o.inbound_event_id;
 verification:=CASE source
  WHEN 'device_sms' THEN 'sms_match'
  WHEN 'device_notification' THEN 'notification_match'
  WHEN 'provider_api' THEN 'provider_api'
  WHEN 'bank_statement' THEN 'bank_statement'
  WHEN 'sandbox_fixture' THEN CASE WHEN o.environment='sandbox' THEN 'sandbox_fixture' END
  ELSE NULL END;
 IF verification IS NULL THEN
  UPDATE pg07_receipt_results SET status='unmatched',reason='unapproved_receipt_source',
    processed_at=now() WHERE observation_id=o_id;
  RETURN 'unmatched';
 END IF;
 -- Same bucket lock as immutable attempt issuance (0008). Match is never
 -- decided by receipt arrival time; minute precision means the whole minute.
 PERFORM pg_advisory_xact_lock(hashtextextended(
  o.workspace_id::text||':'||o.environment||':'||o.payer_hmac||':'||o.method||':'||o.amount_minor::text,0));
 SELECT count(*) INTO candidate_count FROM payment_attempts p
 WHERE p.workspace_id=o.workspace_id AND p.environment=o.environment
 AND p.receiving_account_id=o.receiving_account_id AND p.payer_hmac=o.payer_hmac
 AND p.method=o.method AND p.amount_minor=o.amount_minor AND p.currency=o.currency
 AND o.original_transaction_at>=briofold_sms_window_start(p.window_start,o.time_precision) AND o.original_transaction_at<p.window_end
 AND (o.time_precision<>'minute' OR o.original_transaction_at<p.window_end);
 IF candidate_count<>1 THEN
  status_name:=CASE WHEN candidate_count=0 THEN 'unmatched' ELSE 'ambiguous' END;
  no_match_reason:='no_exact_five_field_candidate';
  IF candidate_count>1 THEN no_match_reason:='multiple_exact_candidates';
  ELSE
   -- A partial/overpayment is NOT success; keep incoming evidence available
   -- for reconciliation without providing a manual mark-paid bypass.
   IF EXISTS(SELECT 1 FROM payment_attempts p WHERE p.workspace_id=o.workspace_id
     AND p.environment=o.environment AND p.receiving_account_id=o.receiving_account_id
     AND p.payer_hmac=o.payer_hmac AND p.method=o.method AND p.currency=o.currency
     AND p.amount_minor>o.amount_minor
     AND o.original_transaction_at>=briofold_sms_window_start(p.window_start,o.time_precision) AND o.original_transaction_at<p.window_end
     AND (o.time_precision<>'minute' OR o.original_transaction_at<p.window_end)
   ) THEN no_match_reason:='partial_amount_requires_reconciliation';
   ELSIF EXISTS(SELECT 1 FROM payment_attempts p WHERE p.workspace_id=o.workspace_id
     AND p.environment=o.environment AND p.receiving_account_id=o.receiving_account_id
     AND p.payer_hmac=o.payer_hmac AND p.method=o.method AND p.currency=o.currency
     AND p.amount_minor<o.amount_minor
     AND o.original_transaction_at>=briofold_sms_window_start(p.window_start,o.time_precision) AND o.original_transaction_at<p.window_end
     AND (o.time_precision<>'minute' OR o.original_transaction_at<p.window_end)
   ) THEN no_match_reason:='excess_amount_requires_reconciliation';
   END IF;
  END IF;
  UPDATE pg07_receipt_results SET status=status_name,reason=no_match_reason,
   processed_at=now() WHERE observation_id=o_id;
  RETURN status_name;
 END IF;
 SELECT p.* INTO a FROM payment_attempts p WHERE p.workspace_id=o.workspace_id
 AND p.environment=o.environment AND p.receiving_account_id=o.receiving_account_id
 AND p.payer_hmac=o.payer_hmac AND p.method=o.method AND p.amount_minor=o.amount_minor
 AND p.currency=o.currency AND o.original_transaction_at>=briofold_sms_window_start(p.window_start,o.time_precision)
 AND o.original_transaction_at<p.window_end
 AND (o.time_precision<>'minute' OR o.original_transaction_at<p.window_end)
 FOR UPDATE OF p;
 -- PG05 checkout locks intent BEFORE taking the bucket lock. SKIP LOCKED
 -- avoids reverse-order deadlocks: retain pending and let next sweep retry.
 SELECT i.id INTO locked_intent FROM payment_intents i
 WHERE i.workspace_id=a.workspace_id AND i.environment=a.environment AND i.id=a.intent_id
 FOR UPDATE OF i SKIP LOCKED;
 IF locked_intent IS NULL THEN RETURN 'pending'; END IF;
 IF now() >= (SELECT expires_at FROM payment_intents WHERE id=a.intent_id AND workspace_id=a.workspace_id AND environment=a.environment)
 OR EXISTS(SELECT 1 FROM pg05_intent_events WHERE intent_id=a.intent_id
 AND workspace_id=a.workspace_id AND environment=a.environment AND event_type='cancelled') THEN
  UPDATE pg07_receipt_results SET status='cancelled',reason='late_funds_refund_required',
   processed_at=now() WHERE observation_id=o_id;
  RETURN 'cancelled';
 END IF;
 -- A receipt arriving AFTER checkout expiry may still verify if the provider
 -- original transaction time fits the immutable pre-expiry attempt window.
 IF EXISTS(SELECT 1 FROM financial_payments
 WHERE workspace_id=o.workspace_id AND environment=o.environment
 AND (attempt_id=a.id OR observation_id=o.id))
 OR EXISTS(SELECT 1 FROM financial_allocations
 WHERE workspace_id=a.workspace_id AND environment=a.environment AND intent_id=a.intent_id) THEN
  UPDATE pg07_receipt_results SET status='duplicate',reason='attempt_already_funded',
   processed_at=now() WHERE observation_id=o_id;
  RETURN 'duplicate';
 END IF;
 -- Payment field/provenance trigger + allocation cap trigger independently
 -- fail closed. Any error rolls back ALL rows, including webhook deliveries.
 INSERT INTO financial_payments(workspace_id,environment,attempt_id,observation_id,
 verified_amount_minor,currency,verification_method,policy_version)
 VALUES(o.workspace_id,o.environment,a.id,o.id,o.amount_minor,o.currency,verification,a.policy_version)
 RETURNING id INTO payment;
 INSERT INTO financial_allocations(workspace_id,environment,payment_id,intent_id,amount_minor,currency)
 VALUES(o.workspace_id,o.environment,payment,a.intent_id,o.amount_minor,o.currency);
 INSERT INTO pg07_events(workspace_id,environment,payment_id,event_type,payload)
 VALUES(o.workspace_id,o.environment,payment,'payment.verified',
 jsonb_build_object('schema_version',1,'type','payment.verified','workspace_id',o.workspace_id,
 'environment',o.environment,'occurred_at',now(),
 'data',jsonb_build_object('payment_id',payment,'payment_intent_id',a.intent_id,
 'merchant_reference',(SELECT merchant_reference FROM payment_intents WHERE id=a.intent_id),
 'amount_minor',o.amount_minor,'currency',o.currency,'verification_status','verified',
 'verification_method',verification,'original_transaction_at',o.original_transaction_at,
 'verified_at',now(),'resource_version',1,'late_sync',now()>a.window_end)))
 RETURNING id INTO event;
 INSERT INTO pg08_deliveries(workspace_id,environment,endpoint_id,event_id)
 SELECT o.workspace_id,o.environment,e.id,event FROM pg08_endpoints e
 WHERE e.workspace_id=o.workspace_id AND e.environment=o.environment AND e.active;
 UPDATE pg07_receipt_results SET status='matched',payment_id=payment,
 reason='',processed_at=now() WHERE observation_id=o_id;
 RETURN 'matched';
END $function$;

CREATE OR REPLACE FUNCTION public.pg06_phone_candidate(p_phone uuid, p_method text, p_payer text, p_amount bigint, p_time timestamp with time zone, p_precision text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT COALESCE(
    (SELECT CASE WHEN count(*)=1 THEN min(a.receiving_account_id::text) END
     FROM payment_attempts a
     JOIN pg06_phones phone ON phone.workspace_id=a.workspace_id AND phone.environment=a.environment
     JOIN financial_workspace_registry registry ON registry.workspace_id=a.workspace_id AND registry.environment=a.environment
     WHERE phone.id=p_phone AND phone.revoked_at IS NULL AND phone.public_key IS NOT NULL
       AND registry.status='active' AND a.method=p_method AND a.payer_hmac=p_payer
       AND a.amount_minor=p_amount AND a.currency='BDT'
       AND p_precision IN ('minute','second') AND p_time>=briofold_sms_window_start(a.window_start,p_precision) AND p_time<a.window_end
       AND (p_precision<>'minute' OR p_time<a.window_end)),
    (SELECT min(ra.id::text)
     FROM pg06_phones phone
     JOIN financial_workspace_registry registry ON registry.workspace_id=phone.workspace_id AND registry.environment=phone.environment
     JOIN financial_receiving_accounts ra ON ra.workspace_id=phone.workspace_id AND ra.environment=phone.environment
     JOIN pg06_account_configuration cfg ON cfg.account_id=ra.id AND cfg.disabled_at IS NULL
     WHERE phone.id=p_phone AND phone.revoked_at IS NULL AND phone.public_key IS NOT NULL
       AND registry.status='active' AND ra.method=p_method AND p_amount>0
       AND p_precision IN ('minute','second'))
  )
$function$;

-- 0008 allocation caps (unchanged since).
CREATE OR REPLACE FUNCTION financial_enforce_allocation_caps() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE verified bigint; requested bigint; paid bigint; allocated bigint; payment_currency text; intent_currency text;
BEGIN
 SELECT p.verified_amount_minor,p.currency INTO verified,payment_currency
 FROM financial_payments p
 WHERE p.workspace_id=NEW.workspace_id AND p.environment=NEW.environment AND p.id=NEW.payment_id FOR UPDATE;
 SELECT i.amount_minor,i.currency INTO requested,intent_currency
 FROM payment_intents i
 WHERE i.workspace_id=NEW.workspace_id AND i.environment=NEW.environment AND i.id=NEW.intent_id FOR UPDATE;
 IF verified IS NULL OR requested IS NULL OR payment_currency<>NEW.currency OR intent_currency<>NEW.currency THEN
  RAISE EXCEPTION 'allocation currency or parent mismatch' USING ERRCODE='23514';
 END IF;
 SELECT COALESCE(sum(a.amount_minor),0) INTO allocated FROM financial_allocations a
 WHERE a.workspace_id=NEW.workspace_id AND a.environment=NEW.environment AND a.payment_id=NEW.payment_id;
 SELECT COALESCE(sum(a.amount_minor),0) INTO paid FROM financial_allocations a
 WHERE a.workspace_id=NEW.workspace_id AND a.environment=NEW.environment AND a.intent_id=NEW.intent_id;
 IF NEW.amount_minor>verified-allocated OR NEW.amount_minor>requested-paid THEN
  RAISE EXCEPTION 'allocation exceeds verified funds or requested amount' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;

CREATE TRIGGER financial_verified_fields BEFORE INSERT ON financial_payments
 FOR EACH ROW EXECUTE FUNCTION financial_verify_payment_fields();
CREATE TRIGGER financial_allocation_caps BEFORE INSERT ON financial_allocations
 FOR EACH ROW EXECUTE FUNCTION financial_enforce_allocation_caps();
CREATE TRIGGER financial_payments_immutable BEFORE UPDATE OR DELETE ON financial_payments
 FOR EACH ROW EXECUTE FUNCTION financial_reject_history_change();
CREATE TRIGGER financial_allocations_immutable BEFORE UPDATE OR DELETE ON financial_allocations
 FOR EACH ROW EXECUTE FUNCTION financial_reject_history_change();
-- The md5 that 0275 checks must be what these texts produce.
DO $$BEGIN
 IF md5(pg_get_functiondef('pg07_match(uuid,bigint)'::regprocedure))<>'1a6d2b91aca248c008674c80a1ab4b64'
  OR md5(pg_get_functiondef('financial_verify_payment_fields()'::regprocedure))<>'9068eee77f96b6b47894425800d5e574'
  OR md5(pg_get_functiondef('pg06_phone_candidate(uuid,text,text,bigint,timestamptz,text)'::regprocedure))<>'b8c67bbe0b8f70ff2fd28c328ae11761' THEN
  RAISE EXCEPTION 'stand-in production functions differ from production';
 END IF;
END $$;
