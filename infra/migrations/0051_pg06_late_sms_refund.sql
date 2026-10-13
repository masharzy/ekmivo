-- 0051: source-agnostic signed SMS, delayed receipt and seller-managed late refund.
-- Additive and restricted to the sandbox/live financial realm. Never apply to control DB.
BEGIN;
DO $preflight$ DECLARE owner_ok boolean;BEGIN
 SELECT (to_regclass('public.pg06_phone_forwarded') IS NOT NULL AND
   to_regclass('public.pg11_refunds') IS NOT NULL AND
   to_regprocedure('public.pg07_match(uuid,bigint)') IS NOT NULL AND
   to_regprocedure('public.pg10_public_payment_sources(uuid,text)') IS NOT NULL AND
   to_regclass('public.auth_sessions') IS NULL AND
   (SELECT relowner=(SELECT oid FROM pg_roles WHERE rolname=current_user)
    FROM pg_class WHERE oid='public.financial_realm'::regclass))
 INTO owner_ok;
 IF NOT coalesce(owner_ok,false) THEN RAISE EXCEPTION '0051 requires migrated, migration-owned financial realm';END IF;
END $preflight$;

-- The device never claims to know the receiving number. All candidate account
-- attribution comes from ONE exact immutable customer attempt in this workspace.
CREATE FUNCTION pg06_phone_candidate(p_phone uuid,p_method text,p_payer text,p_amount bigint,p_time timestamptz,p_precision text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT CASE WHEN count(*)=1 THEN min(a.receiving_account_id::text) END
 FROM payment_attempts a JOIN pg06_phones phone ON phone.workspace_id=a.workspace_id AND phone.environment=a.environment
 JOIN financial_workspace_registry registry ON registry.workspace_id=a.workspace_id AND registry.environment=a.environment
 WHERE phone.id=p_phone AND phone.revoked_at IS NULL AND phone.public_key IS NOT NULL
 AND registry.status='active' AND a.method=p_method AND a.payer_hmac=p_payer
 AND a.amount_minor=p_amount AND a.currency='BDT'
 AND p_precision IN ('minute','second') AND p_time>=a.window_start AND p_time<a.window_end
 AND (p_precision<>'minute' OR p_time+interval '1 minute'<=a.window_end)
$$;
REVOKE ALL ON FUNCTION pg06_phone_candidate(uuid,text,text,bigint,timestamptz,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pg06_phone_candidate(uuid,text,text,bigint,timestamptz,text) TO ekmivo_finance_reader;
CREATE INDEX pg06_candidate_lookup ON payment_attempts(workspace_id,environment,method,payer_hmac,amount_minor,window_start,window_end);

-- Prevent indistinguishable parallel requests even if they display different
-- merchant receiving numbers: the SMS does not prove a destination number.
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
    AND tstzrange(a.window_start,a.window_end,'[)') &&
        tstzrange(NEW.window_start,NEW.window_end,'[)')
 ) INTO has_overlap;
 IF has_overlap THEN
  RAISE EXCEPTION 'overlapping payer/account/method/amount attempt'
   USING ERRCODE='23505';
 END IF;
 RETURN NEW;
END; $$;

ALTER TABLE pg06_phone_forwarded ADD COLUMN payer_cipher bytea;
CREATE FUNCTION pg06_phone_forward(
 phone_id uuid, event text, hash text, encrypted bytea,
 sender_name text, sim_name text, observed_time timestamptz, event_sequence bigint,
 captured_version bigint, receiving uuid, payer_identity text, amount bigint,
 original_time timestamptz, precision_name text, reference_identity text,
 method_name text, parser_ver integer, payer_contact bytea)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p pg06_phones; old pg06_phone_forwarded; previous financial_receipt_observations;
 inbound uuid; observation uuid; result_reason text:='verification_pending'; fingerprint text;
BEGIN
 SELECT * INTO p FROM pg06_phones WHERE id=phone_id AND revoked_at IS NULL AND
  public_key IS NOT NULL FOR UPDATE;
 IF p.id IS NULL OR NOT EXISTS(SELECT 1 FROM financial_workspace_registry r
  WHERE r.workspace_id=p.workspace_id AND r.environment=p.environment AND r.status='active')
  OR event !~ '^[A-Za-z0-9_-]{1,128}$' OR hash !~ '^[a-f0-9]{64}$'
  OR octet_length(encrypted)<29 OR length(sender_name) NOT BETWEEN 1 AND 80
  OR length(sim_name)>80 OR event_sequence<=0 OR captured_version<0
  OR observed_time IS NULL OR observed_time>now()+interval '5 minutes'
  OR observed_time<now()-interval '30 days'
 THEN RAISE EXCEPTION 'invalid signed forward' USING ERRCODE='42501';END IF;
 SELECT * INTO old FROM pg06_phone_forwarded WHERE phone_id=p.id AND event_id=event;
 IF old.id IS NOT NULL THEN
  IF old.digest<>hash THEN RAISE EXCEPTION 'reused signed event' USING ERRCODE='23505';END IF;
  RETURN jsonb_build_object('ack','durable','reason',old.reason,
   'observation_id',old.observation_id,'replayed',true);
 END IF;
 -- Capture-time configuration must still match. Otherwise do not route
 -- messages that were queued before account/source changes.
 IF captured_version<>p.config_version THEN receiving:=NULL;result_reason:='configuration_changed';
 ELSIF receiving IS NOT NULL THEN
  IF payer_identity !~ '^[a-f0-9]{64}$' OR reference_identity !~ '^[a-f0-9]{64}$'
   OR original_time IS NULL OR original_time>now()+interval '5 minutes'
   OR amount IS NULL OR amount<=0 OR precision_name NOT IN ('second','minute')
   OR NOT EXISTS(SELECT 1 FROM financial_receiving_accounts a
    JOIN pg06_account_configuration c ON c.account_id=a.id
    WHERE a.id=receiving AND a.workspace_id=p.workspace_id
    AND a.environment=p.environment AND a.method=method_name)
  THEN RAISE EXCEPTION 'invalid authoritative receipt' USING ERRCODE='22023';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('receipt|'||receiving::text||'|'||reference_identity,0));
  SELECT * INTO previous FROM financial_receipt_observations o
  WHERE o.workspace_id=p.workspace_id AND o.environment=p.environment
   AND o.receiving_account_id=receiving AND o.provider_reference_hmac=reference_identity;
  IF previous.id IS NOT NULL THEN
   observation:=previous.id;
   IF previous.payer_hmac IS DISTINCT FROM payer_identity OR
    previous.amount_minor IS DISTINCT FROM amount OR
    previous.original_transaction_at IS DISTINCT FROM original_time OR
    previous.method IS DISTINCT FROM method_name THEN
    observation:=NULL;result_reason:='provider_identity_conflict';
   ELSE result_reason:='duplicate_provider_identity';END IF;
  ELSE
   INSERT INTO financial_inbound_events(workspace_id,environment,source_kind,source_event_id,
    event_digest,original_source_at,encrypted_evidence)
   VALUES(p.workspace_id,p.environment,'device_sms',phone_id::text||':'||event,
    hash,original_time,encrypted) RETURNING id INTO inbound;
   INSERT INTO financial_receipt_observations(workspace_id,environment,inbound_event_id,
    receiving_account_id,provider_reference_hmac,payer_hmac,amount_minor,method,
    direction,original_transaction_at,time_precision,parser_version)
   VALUES(p.workspace_id,p.environment,inbound,receiving,reference_identity,payer_identity,
    amount,method_name,'incoming',original_time,precision_name,parser_ver)
   RETURNING id INTO observation;
   INSERT INTO pg07_receipt_results(workspace_id,environment,observation_id)
    VALUES(p.workspace_id,p.environment,observation);
   result_reason:='accepted_for_verification';
  END IF;
 END IF;
 INSERT INTO pg06_phone_forwarded(workspace_id,environment,phone_id,event_id,digest,
  ciphertext,sender,sim_hint,observed_at,sequence,configuration_version,reason,observation_id,payer_cipher)
 VALUES(p.workspace_id,p.environment,p.id,event,hash,encrypted,sender_name,sim_name,
  observed_time,event_sequence,captured_version,result_reason,observation,payer_contact);
 RETURN jsonb_build_object('ack','durable','reason',result_reason,
  'observation_id',observation,'replayed',false);
END $$;

REVOKE ALL ON FUNCTION pg06_phone_forward(uuid,text,text,bytea,text,text,timestamptz,bigint,bigint,uuid,text,bigint,timestamptz,text,text,text,integer,bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pg06_phone_forward(uuid,text,text,bytea,text,text,timestamptz,bigint,bigint,uuid,text,bigint,timestamptz,text,text,text,integer,bytea) TO ekmivo_finance_reader;

-- A late funded expired/cancelled intent has no verified payment row, so the
-- historical refund table must support a receipt-backed seller request.
ALTER TABLE pg11_refunds ALTER COLUMN payment_id DROP NOT NULL;
ALTER TABLE pg11_refunds ADD COLUMN source_observation_id uuid;
ALTER TABLE pg11_refunds ADD COLUMN source_intent_id uuid;
ALTER TABLE pg11_refunds ADD CONSTRAINT pg11_late_source_observation
 FOREIGN KEY(workspace_id,environment,source_observation_id) REFERENCES financial_receipt_observations(workspace_id,environment,id);
ALTER TABLE pg11_refunds ADD CONSTRAINT pg11_late_source_intent
 FOREIGN KEY(workspace_id,environment,source_intent_id) REFERENCES payment_intents(workspace_id,environment,id);
ALTER TABLE pg11_refunds ADD CONSTRAINT pg11_refund_source_kind
 CHECK ((payment_id IS NOT NULL AND source_observation_id IS NULL AND source_intent_id IS NULL)
 OR (payment_id IS NULL AND source_observation_id IS NOT NULL AND source_intent_id IS NOT NULL));
CREATE UNIQUE INDEX pg11_late_refund_once ON pg11_refunds(source_observation_id) WHERE source_observation_id IS NOT NULL;

-- Trigger runs in worker transaction that marks a receipt cancelled. Reusing
-- same provider receipt/event or retrying the worker never opens two cases.
CREATE FUNCTION pg11_late_phone_receipt_case() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a payment_attempts; o financial_receipt_observations; contact bytea; case_id uuid;
BEGIN
 IF NEW.status<>'cancelled' OR OLD.status='cancelled' THEN RETURN NEW;END IF;
 SELECT * INTO o FROM financial_receipt_observations WHERE id=NEW.observation_id
  AND workspace_id=NEW.workspace_id AND environment=NEW.environment;
 IF o.id IS NULL OR o.direction<>'incoming' THEN RETURN NEW;END IF;
 SELECT f.payer_cipher INTO contact FROM pg06_phone_forwarded f WHERE f.observation_id=o.id
  AND f.workspace_id=o.workspace_id AND f.environment=o.environment AND f.payer_cipher IS NOT NULL LIMIT 1;
 IF contact IS NULL THEN RETURN NEW;END IF;
 SELECT p.* INTO a FROM payment_attempts p
 WHERE p.workspace_id=o.workspace_id AND p.environment=o.environment
 AND p.receiving_account_id=o.receiving_account_id AND p.payer_hmac=o.payer_hmac
 AND p.method=o.method AND p.amount_minor=o.amount_minor
 AND o.original_transaction_at>=p.window_start AND o.original_transaction_at<p.window_end
 AND (o.time_precision<>'minute' OR o.original_transaction_at+interval '1 minute'<=p.window_end);
 IF NOT FOUND OR EXISTS(SELECT 1 FROM financial_payments p WHERE p.attempt_id=a.id)
 THEN RETURN NEW;END IF;
 INSERT INTO pg11_refunds(workspace_id,environment,payment_id,source_observation_id,
  source_intent_id,amount_minor,customer_cipher,reason)
 VALUES(o.workspace_id,o.environment,NULL,o.id,a.intent_id,o.amount_minor,contact,
  'Payment receipt arrived after checkout expiration or cancellation; seller must review and return funds outside platform.')
 ON CONFLICT DO NOTHING RETURNING id INTO case_id;
 IF case_id IS NOT NULL THEN
  INSERT INTO pg13_notifications(workspace_id,environment,type,resource_id,body)
  VALUES(o.workspace_id,o.environment,'refund_requested',case_id,
   jsonb_build_object('refund_id',case_id,'payment_intent_id',a.intent_id,'amount_minor',o.amount_minor,
   'status','requested','origin','late_phone_sms'));
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION pg11_late_phone_receipt_case() FROM PUBLIC;
CREATE TRIGGER pg11_late_phone_receipt AFTER UPDATE OF status ON pg07_receipt_results
 FOR EACH ROW WHEN (NEW.status='cancelled' AND OLD.status IS DISTINCT FROM NEW.status)
 EXECUTE FUNCTION pg11_late_phone_receipt_case();

-- Once a previously valid payment intent has expired/cancelled by the time
-- its delayed SMS is processed, it must NOT be silently marked paid.
CREATE OR REPLACE FUNCTION pg07_match(o_id uuid,expected_version bigint) RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
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
  o.workspace_id::text||':'||o.environment||':'||o.receiving_account_id::text||
  ':'||o.payer_hmac||':'||o.method||':'||o.amount_minor::text,0));
 SELECT count(*) INTO candidate_count FROM payment_attempts p
 WHERE p.workspace_id=o.workspace_id AND p.environment=o.environment
 AND p.receiving_account_id=o.receiving_account_id AND p.payer_hmac=o.payer_hmac
 AND p.method=o.method AND p.amount_minor=o.amount_minor AND p.currency=o.currency
 AND o.original_transaction_at>=p.window_start AND o.original_transaction_at<p.window_end
 AND (o.time_precision<>'minute' OR o.original_transaction_at+interval '1 minute'<=p.window_end);
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
     AND o.original_transaction_at>=p.window_start AND o.original_transaction_at<p.window_end
     AND (o.time_precision<>'minute' OR o.original_transaction_at+interval '1 minute'<=p.window_end)
   ) THEN no_match_reason:='partial_amount_requires_reconciliation';
   ELSIF EXISTS(SELECT 1 FROM payment_attempts p WHERE p.workspace_id=o.workspace_id
     AND p.environment=o.environment AND p.receiving_account_id=o.receiving_account_id
     AND p.payer_hmac=o.payer_hmac AND p.method=o.method AND p.currency=o.currency
     AND p.amount_minor<o.amount_minor
     AND o.original_transaction_at>=p.window_start AND o.original_transaction_at<p.window_end
     AND (o.time_precision<>'minute' OR o.original_transaction_at+interval '1 minute'<=p.window_end)
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
 AND p.currency=o.currency AND o.original_transaction_at>=p.window_start
 AND o.original_transaction_at<p.window_end
 AND (o.time_precision<>'minute' OR o.original_transaction_at+interval '1 minute'<=p.window_end)
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
END $$;

COMMIT;
