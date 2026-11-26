-- Financial databases (sandbox and live). Payment automation Phase 3b, owner
-- decision 2026-11-26: a gateway may accept a little more or a little less
-- than the order amount.
--
-- * briofold_gateways.underpaid_tolerance_minor (NOT NULL, default 0) and
--   overpaid_tolerance_minor (NULL = no limit, 0 = exact). Backfilled gateways
--   keep 0 and 0, so existing shops match exactly as before. A gateway created
--   through the API gets underpaid 0 and overpaid 10 Tk unless it says otherwise.
-- * payment_attempts gets the tolerance of its gateway when the attempt is
--   written (trigger), so changing a gateway later never changes an open
--   checkout. Old attempts: 0 and 0 = exact, as before.
-- * Overpaid within tolerance: pg07_match makes the normal SMS-verified payment.
--   The verified amount is what arrived; the allocation to the checkout is the
--   checkout amount (the allocation cap trigger forbids more). The payment
--   trigger accepts amount <= verified <= amount + overpaid tolerance.
-- * Underpaid within tolerance: never an SMS-verified payment (that would need
--   a smaller allocation and the checkout would stay unpaid). The matcher keeps
--   the receipt as partial and confirms the checkout automatically as "shop
--   confirmed" (review case approved, 0271 proof), only while the checkout is
--   open. Underpaid default is 0, so this only happens when a shop asks for it.
-- * pg06_phone_candidate: an SMS from a phone is attributed to the number of an
--   attempt whose amount fits within that attempt's overpaid tolerance.
--
-- Each existing function is replaced only if it is exactly the production
-- version read from a copy of the live database on 2026-11-26 (md5 of
-- pg_get_functiondef); otherwise the migration stops. Safe to run twice.
BEGIN;
DO $$
DECLARE f record;
BEGIN
 IF to_regclass('public.briofold_gateway_accounts') IS NULL OR to_regclass('public.briofold_review_cases') IS NULL THEN
  RAISE EXCEPTION '0275 requires 0272 and 0274'; END IF;
 FOR f IN SELECT * FROM (VALUES
   ('pg07_match(uuid,bigint)','1a6d2b91aca248c008674c80a1ab4b64'),
   ('financial_verify_payment_fields()','9068eee77f96b6b47894425800d5e574'),
   ('pg06_phone_candidate(uuid,text,text,bigint,timestamptz,text)','b8c67bbe0b8f70ff2fd28c328ae11761')) v(sig,md5)
 LOOP
  IF position('0275 tolerance' IN pg_get_functiondef(f.sig::regprocedure))=0
   AND md5(pg_get_functiondef(f.sig::regprocedure))<>f.md5 THEN
   RAISE EXCEPTION '0275: % is not the expected production version',f.sig;
  END IF;
 END LOOP;
END $$;

ALTER TABLE briofold_gateways ADD COLUMN IF NOT EXISTS underpaid_tolerance_minor bigint NOT NULL DEFAULT 0;
ALTER TABLE briofold_gateways ADD COLUMN IF NOT EXISTS overpaid_tolerance_minor bigint DEFAULT 0;
DO $$BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='briofold_gateways_tolerance_range') THEN
  ALTER TABLE briofold_gateways ADD CONSTRAINT briofold_gateways_tolerance_range CHECK(
   underpaid_tolerance_minor BETWEEN 0 AND 100000000000
   AND (overpaid_tolerance_minor IS NULL OR overpaid_tolerance_minor BETWEEN 0 AND 100000000000));
 END IF;
END $$;

ALTER TABLE payment_attempts ADD COLUMN IF NOT EXISTS under_tolerance_minor bigint NOT NULL DEFAULT 0;
ALTER TABLE payment_attempts ADD COLUMN IF NOT EXISTS over_tolerance_minor bigint DEFAULT 0;
DO $$BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='payment_attempts_tolerance_range') THEN
  ALTER TABLE payment_attempts ADD CONSTRAINT payment_attempts_tolerance_range CHECK(
   under_tolerance_minor>=0 AND under_tolerance_minor<amount_minor
   AND (over_tolerance_minor IS NULL OR over_tolerance_minor>=0));
 END IF;
END $$;

-- The attempt copies its gateway's tolerance (no gateway = exact).
CREATE OR REPLACE FUNCTION briofold_attempt_tolerance() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE g briofold_gateways;
BEGIN
 SELECT gw.* INTO g FROM briofold_gateway_accounts m JOIN briofold_gateways gw ON gw.id=m.gateway_id
 WHERE m.account_id=NEW.receiving_account_id AND m.workspace_id=NEW.workspace_id AND m.environment=NEW.environment;
 IF g.id IS NULL THEN
  NEW.under_tolerance_minor:=0; NEW.over_tolerance_minor:=0;
 ELSE
  NEW.under_tolerance_minor:=LEAST(g.underpaid_tolerance_minor,NEW.amount_minor-1);
  NEW.over_tolerance_minor:=g.overpaid_tolerance_minor;
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS briofold_attempt_tolerance ON payment_attempts;
CREATE TRIGGER briofold_attempt_tolerance BEFORE INSERT ON payment_attempts
 FOR EACH ROW EXECUTE FUNCTION briofold_attempt_tolerance();

-- Owner confirmation without the owner: an underpaid receipt within the
-- attempt's tolerance on an open checkout. Returns true when it confirmed.
CREATE OR REPLACE FUNCTION briofold_underpaid_auto(o financial_receipt_observations) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a payment_attempts; n integer;
BEGIN
 SELECT count(*) INTO n FROM payment_attempts p
 WHERE p.workspace_id=o.workspace_id AND p.environment=o.environment
  AND p.receiving_account_id=o.receiving_account_id AND p.payer_hmac=o.payer_hmac
  AND p.method=o.method AND p.currency=o.currency
  AND p.amount_minor>o.amount_minor AND o.amount_minor>=p.amount_minor-p.under_tolerance_minor
  AND o.original_transaction_at>=briofold_sms_window_start(p.window_start,o.time_precision)
  AND o.original_transaction_at<p.window_end;
 IF n<>1 THEN RETURN false; END IF;
 SELECT p.* INTO a FROM payment_attempts p
 WHERE p.workspace_id=o.workspace_id AND p.environment=o.environment
  AND p.receiving_account_id=o.receiving_account_id AND p.payer_hmac=o.payer_hmac
  AND p.method=o.method AND p.currency=o.currency
  AND p.amount_minor>o.amount_minor AND o.amount_minor>=p.amount_minor-p.under_tolerance_minor
  AND o.original_transaction_at>=briofold_sms_window_start(p.window_start,o.time_precision)
  AND o.original_transaction_at<p.window_end;
 PERFORM 1 FROM payment_intents i WHERE i.workspace_id=a.workspace_id AND i.environment=a.environment
  AND i.id=a.intent_id AND i.expires_at>now() FOR UPDATE SKIP LOCKED;
 IF NOT FOUND OR pg05_intent_state(a.workspace_id,a.environment,a.intent_id) IN ('completed','cancelled','expired')
  OR EXISTS(SELECT 1 FROM briofold_payment_proofs WHERE workspace_id=a.workspace_id AND environment=a.environment
   AND intent_id=a.intent_id AND state IN ('approved','auto_verified'))
  OR EXISTS(SELECT 1 FROM briofold_review_cases WHERE observation_id=o.id) THEN
  RETURN false;
 END IF;
 INSERT INTO briofold_payment_proofs(workspace_id,environment,intent_id,state,decided_at,decision_reason,seen_at)
 VALUES(a.workspace_id,a.environment,a.intent_id,'approved',now(),'sms_underpaid_tolerance',now())
 ON CONFLICT(workspace_id,environment,intent_id) DO UPDATE SET state='approved',decided_at=now(),
  decision_reason='sms_underpaid_tolerance',seen_at=COALESCE(briofold_payment_proofs.seen_at,now()),updated_at=now();
 INSERT INTO briofold_review_cases(workspace_id,environment,observation_id,kind,suggested_intent_id,received_amount_minor,
  expected_amount_minor,state,decided_intent_id,decision_reason,decided_at)
 VALUES(o.workspace_id,o.environment,o.id,'underpaid',a.intent_id,o.amount_minor,a.amount_minor,'approved',a.intent_id,
  'auto_underpaid_tolerance',now());
 RETURN true;
END $$;

-- Production pg07_match (0014, 0051, 0266) with: exact candidates first; if none,
-- one candidate the receipt overpays within its tolerance; allocation capped at
-- the checkout amount; underpaid within tolerance confirmed by briofold_underpaid_auto.
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
 tolerant boolean:=false;
 payment uuid;
 event uuid;
 source text;
 verification text;
 status_name text;
 no_match_reason text;
 result pg07_receipt_results;
 locked_intent uuid;
BEGIN
 -- 0275 tolerance
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
 -- A tolerant match also locks the attempt row (FOR UPDATE below), so two
 -- receipts can never fund one attempt.
 PERFORM pg_advisory_xact_lock(hashtextextended(
  o.workspace_id::text||':'||o.environment||':'||o.payer_hmac||':'||o.method||':'||o.amount_minor::text,0));
 SELECT count(*) INTO candidate_count FROM payment_attempts p
 WHERE p.workspace_id=o.workspace_id AND p.environment=o.environment
 AND p.receiving_account_id=o.receiving_account_id AND p.payer_hmac=o.payer_hmac
 AND p.method=o.method AND p.amount_minor=o.amount_minor AND p.currency=o.currency
 AND o.original_transaction_at>=briofold_sms_window_start(p.window_start,o.time_precision) AND o.original_transaction_at<p.window_end;
 IF candidate_count=0 THEN
  -- Overpaid within the attempt's own tolerance (NULL = no upper limit).
  SELECT count(*) INTO candidate_count FROM payment_attempts p
  WHERE p.workspace_id=o.workspace_id AND p.environment=o.environment
  AND p.receiving_account_id=o.receiving_account_id AND p.payer_hmac=o.payer_hmac
  AND p.method=o.method AND p.currency=o.currency
  AND o.amount_minor>p.amount_minor
  AND (p.over_tolerance_minor IS NULL OR o.amount_minor<=p.amount_minor+p.over_tolerance_minor)
  AND o.original_transaction_at>=briofold_sms_window_start(p.window_start,o.time_precision) AND o.original_transaction_at<p.window_end;
  tolerant:=candidate_count>0;
 END IF;
 IF candidate_count<>1 THEN
  status_name:=CASE WHEN candidate_count=0 THEN 'unmatched' ELSE 'ambiguous' END;
  no_match_reason:='no_exact_five_field_candidate';
  IF candidate_count>1 THEN no_match_reason:=CASE WHEN tolerant THEN 'multiple_tolerance_candidates' ELSE 'multiple_exact_candidates' END;
  ELSE
   -- A partial/overpayment outside tolerance is NOT success; keep incoming
   -- evidence available for the shop's Pending list (0274).
   IF EXISTS(SELECT 1 FROM payment_attempts p WHERE p.workspace_id=o.workspace_id
     AND p.environment=o.environment AND p.receiving_account_id=o.receiving_account_id
     AND p.payer_hmac=o.payer_hmac AND p.method=o.method AND p.currency=o.currency
     AND p.amount_minor>o.amount_minor
     AND o.original_transaction_at>=briofold_sms_window_start(p.window_start,o.time_precision) AND o.original_transaction_at<p.window_end
   ) THEN no_match_reason:='partial_amount_requires_reconciliation';
   ELSIF EXISTS(SELECT 1 FROM payment_attempts p WHERE p.workspace_id=o.workspace_id
     AND p.environment=o.environment AND p.receiving_account_id=o.receiving_account_id
     AND p.payer_hmac=o.payer_hmac AND p.method=o.method AND p.currency=o.currency
     AND p.amount_minor<o.amount_minor
     AND o.original_transaction_at>=briofold_sms_window_start(p.window_start,o.time_precision) AND o.original_transaction_at<p.window_end
   ) THEN no_match_reason:='excess_amount_requires_reconciliation';
   END IF;
  END IF;
  UPDATE pg07_receipt_results SET status=status_name,reason=no_match_reason,
   processed_at=now() WHERE observation_id=o_id;
  IF no_match_reason='partial_amount_requires_reconciliation' THEN
   PERFORM briofold_underpaid_auto(o);
  END IF;
  RETURN status_name;
 END IF;
 SELECT p.* INTO a FROM payment_attempts p WHERE p.workspace_id=o.workspace_id
 AND p.environment=o.environment AND p.receiving_account_id=o.receiving_account_id
 AND p.payer_hmac=o.payer_hmac AND p.method=o.method AND p.currency=o.currency
 AND (p.amount_minor=o.amount_minor OR (tolerant AND o.amount_minor>p.amount_minor
  AND (p.over_tolerance_minor IS NULL OR o.amount_minor<=p.amount_minor+p.over_tolerance_minor)))
 AND o.original_transaction_at>=briofold_sms_window_start(p.window_start,o.time_precision)
 AND o.original_transaction_at<p.window_end
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
 VALUES(o.workspace_id,o.environment,payment,a.intent_id,LEAST(o.amount_minor,a.amount_minor),o.currency);
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

-- Production financial_verify_payment_fields with the amount rule widened from
-- "equal" to "the attempt amount up to its overpaid tolerance". Everything else unchanged.
CREATE OR REPLACE FUNCTION public.financial_verify_payment_fields()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE a payment_attempts%ROWTYPE; o financial_receipt_observations%ROWTYPE; src text;
BEGIN
 -- 0275 tolerance
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
   OR a.currency<>NEW.currency OR NEW.verified_amount_minor<a.amount_minor
   OR (a.over_tolerance_minor IS NOT NULL AND NEW.verified_amount_minor>a.amount_minor+a.over_tolerance_minor)
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

-- Production pg06_phone_candidate with the attempt amount rule widened to the
-- attempt's overpaid tolerance (0 = exact, as before).
CREATE OR REPLACE FUNCTION public.pg06_phone_candidate(p_phone uuid, p_method text, p_payer text, p_amount bigint, p_time timestamp with time zone, p_precision text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  -- 0275 tolerance
  SELECT COALESCE(
    (SELECT CASE WHEN count(*)=1 THEN min(a.receiving_account_id::text) END
     FROM payment_attempts a
     JOIN pg06_phones phone ON phone.workspace_id=a.workspace_id AND phone.environment=a.environment
     JOIN financial_workspace_registry registry ON registry.workspace_id=a.workspace_id AND registry.environment=a.environment
     WHERE phone.id=p_phone AND phone.revoked_at IS NULL AND phone.public_key IS NOT NULL
       AND registry.status='active' AND a.method=p_method AND a.payer_hmac=p_payer
       AND p_amount>=a.amount_minor AND (a.over_tolerance_minor IS NULL OR p_amount<=a.amount_minor+a.over_tolerance_minor)
       AND a.currency='BDT'
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

-- Gateways keep their tolerance through the API (fields added to save and json).
CREATE OR REPLACE FUNCTION briofold_gateway_json(g briofold_gateways) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('id',g.id,'provider',g.provider,'provider_name',p.name,'logo',p.logo,
  'type',g.gateway_type,'label',g.label,'display_name',g.display_name,
  'min_amount_minor',g.min_amount_minor,'max_amount_minor',g.max_amount_minor,
  'fixed_discount_minor',g.fixed_discount_minor,'percent_discount_bp',g.percent_discount_bp,
  'fixed_charge_minor',g.fixed_charge_minor,'percent_charge_bp',g.percent_charge_bp,
  'underpaid_tolerance_minor',g.underpaid_tolerance_minor,'overpaid_tolerance_minor',g.overpaid_tolerance_minor,
  'has_qr',g.qr_object_key IS NOT NULL,'status',g.status,'position',g.position,
  'version',g.version,'created_at',g.created_at,'updated_at',g.updated_at,
  'account_count',(SELECT count(*) FROM briofold_gateway_accounts m
    JOIN pg06_account_configuration c ON c.account_id=m.account_id AND c.deleted_at IS NULL
    WHERE m.gateway_id=g.id))
 FROM briofold_providers p WHERE p.code=g.provider
$$;

-- Save the tolerance fields. On create: absent underpaid = 0, absent overpaid =
-- 1000 (10 Tk, owner default); explicit null overpaid = no limit. On edit every
-- field is sent each time (absent overpaid = no limit, like the other limits).
CREATE OR REPLACE FUNCTION briofold_gateway_set_tolerance(g uuid,p_body jsonb,p_create boolean) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 BEGIN
  UPDATE briofold_gateways SET
   underpaid_tolerance_minor=COALESCE((p_body->>'underpaid_tolerance_minor')::bigint,0),
   overpaid_tolerance_minor=CASE WHEN p_create AND NOT p_body ? 'overpaid_tolerance_minor' THEN 1000
    ELSE (p_body->>'overpaid_tolerance_minor')::bigint END
  WHERE id=g;
 EXCEPTION WHEN check_violation OR invalid_text_representation OR numeric_value_out_of_range THEN
  RAISE EXCEPTION 'invalid gateway' USING ERRCODE='P7201';
 END;
END $$;

-- briofold_gateway_save from 0272 with the two tolerance keys allowed.
CREATE OR REPLACE FUNCTION briofold_gateway_save(p_workspace uuid,p_environment text,p_id uuid,p_body jsonb,p_version bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE pr briofold_providers; g briofold_gateways; v_type text; v_min bigint; v_max bigint;
BEGIN
 IF NOT briofold_gateway_scope(p_workspace,p_environment) THEN RETURN NULL; END IF;
 IF jsonb_typeof(p_body)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_body) k WHERE k NOT IN
   ('provider','type','label','display_name','min_amount_minor','max_amount_minor','fixed_discount_minor',
    'percent_discount_bp','fixed_charge_minor','percent_charge_bp','status',
    'underpaid_tolerance_minor','overpaid_tolerance_minor')) THEN
  RAISE EXCEPTION 'invalid gateway' USING ERRCODE='P7201'; END IF;
 BEGIN
  v_min:=(p_body->>'min_amount_minor')::bigint; v_max:=(p_body->>'max_amount_minor')::bigint;
 EXCEPTION WHEN others THEN RAISE EXCEPTION 'invalid gateway' USING ERRCODE='P7201'; END;
 IF p_id IS NULL THEN
  SELECT * INTO pr FROM briofold_providers WHERE code=p_body->>'provider' AND enabled;
  v_type:=p_body->>'type';
  IF pr.code IS NULL OR v_type IS NULL OR NOT v_type=ANY(pr.types) THEN
   RAISE EXCEPTION 'invalid gateway' USING ERRCODE='P7201'; END IF;
 ELSE
  SELECT * INTO g FROM briofold_gateways WHERE id=p_id AND workspace_id=p_workspace
   AND environment=p_environment AND deleted_at IS NULL FOR UPDATE;
  IF g.id IS NULL THEN RAISE EXCEPTION 'gateway not found' USING ERRCODE='P7204'; END IF;
  IF p_version IS DISTINCT FROM g.version THEN RAISE EXCEPTION 'stale gateway' USING ERRCODE='P7202'; END IF;
  IF (p_body ? 'provider' AND p_body->>'provider'<>g.provider) OR (p_body ? 'type' AND p_body->>'type'<>g.gateway_type) THEN
   RAISE EXCEPTION 'invalid gateway' USING ERRCODE='P7201'; END IF;
 END IF;
 BEGIN
  IF p_id IS NULL THEN
   INSERT INTO briofold_gateways(workspace_id,environment,provider,gateway_type,label,display_name,
    min_amount_minor,max_amount_minor,fixed_discount_minor,percent_discount_bp,fixed_charge_minor,percent_charge_bp,status,position)
   VALUES(p_workspace,p_environment,pr.code,v_type,COALESCE(p_body->>'label',''),
    COALESCE(NULLIF(btrim(p_body->>'display_name'),''),pr.name),v_min,v_max,
    COALESCE((p_body->>'fixed_discount_minor')::bigint,0),COALESCE((p_body->>'percent_discount_bp')::integer,0),
    COALESCE((p_body->>'fixed_charge_minor')::bigint,0),COALESCE((p_body->>'percent_charge_bp')::integer,0),
    COALESCE(p_body->>'status','active'),
    COALESCE((SELECT max(position)+1 FROM briofold_gateways WHERE workspace_id=p_workspace
      AND environment=p_environment AND deleted_at IS NULL),0))
   RETURNING * INTO g;
  ELSE
   UPDATE briofold_gateways SET label=COALESCE(p_body->>'label',''),
    display_name=COALESCE(NULLIF(btrim(p_body->>'display_name'),''),display_name),
    min_amount_minor=v_min,max_amount_minor=v_max,
    fixed_discount_minor=COALESCE((p_body->>'fixed_discount_minor')::bigint,0),
    percent_discount_bp=COALESCE((p_body->>'percent_discount_bp')::integer,0),
    fixed_charge_minor=COALESCE((p_body->>'fixed_charge_minor')::bigint,0),
    percent_charge_bp=COALESCE((p_body->>'percent_charge_bp')::integer,0),
    status=COALESCE(p_body->>'status',status),version=version+1,updated_at=now()
   WHERE id=g.id RETURNING * INTO g;
  END IF;
 EXCEPTION WHEN check_violation OR invalid_text_representation OR numeric_value_out_of_range OR not_null_violation THEN
  RAISE EXCEPTION 'invalid gateway' USING ERRCODE='P7201';
 END;
 PERFORM briofold_gateway_set_tolerance(g.id,p_body,p_id IS NULL);
 SELECT * INTO g FROM briofold_gateways WHERE id=g.id;
 RETURN briofold_gateway_json(g);
END $$;

REVOKE ALL ON FUNCTION briofold_attempt_tolerance(),briofold_underpaid_auto(financial_receipt_observations),
 briofold_gateway_set_tolerance(uuid,jsonb,boolean) FROM PUBLIC;
REVOKE ALL ON FUNCTION briofold_gateway_json(briofold_gateways),briofold_gateway_save(uuid,text,uuid,jsonb,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION briofold_gateway_save(uuid,text,uuid,jsonb,bigint) TO ekmivo_finance_reader;
COMMIT;
