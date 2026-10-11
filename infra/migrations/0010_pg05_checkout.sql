-- PG05: hosted checkout capabilities, immutable payer locks and cancellation history.
-- Apply AFTER PG04 0008 to BOTH physically isolated financial realms, never to control DB.
-- Service role uses granted functions, not direct INSERT into finance/paid tables.
BEGIN;
CREATE TABLE pg05_checkout_tokens (
 workspace_id uuid NOT NULL, environment text NOT NULL,
 intent_id uuid NOT NULL, token_digest char(64) NOT NULL UNIQUE,
 creation_key text NOT NULL CHECK(length(creation_key) BETWEEN 16 AND 128),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,environment,intent_id),
 FOREIGN KEY(workspace_id,environment,intent_id)
  REFERENCES payment_intents(workspace_id,environment,id) ON DELETE RESTRICT
);
CREATE TABLE pg05_intent_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL, environment text NOT NULL,
 intent_id uuid NOT NULL, event_type text NOT NULL CHECK(event_type IN ('created','cancelled','payer_locked')),
 reason text NOT NULL DEFAULT '', occurred_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,environment,intent_id,event_type),
 FOREIGN KEY(workspace_id,environment,intent_id)
  REFERENCES payment_intents(workspace_id,environment,id) ON DELETE RESTRICT
);
CREATE INDEX pg05_events_intent ON pg05_intent_events(workspace_id,environment,intent_id,occurred_at);
DO $$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['pg05_checkout_tokens','pg05_intent_events'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO %I USING (true) WITH CHECK (true)',
   t||'_migration_owner',t,current_user);
  EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION financial_reject_history_change()',t||'_immutable',t);
 END LOOP;
END; $$;
REVOKE ALL ON pg05_checkout_tokens,pg05_intent_events FROM PUBLIC,ekmivo_finance_reader,ekmivo_financial_worker;

-- This function is never a payment confirmation. Only PG07's verified
-- evidence + allocations can turn an intent into "completed".
CREATE FUNCTION pg05_intent_state(p_workspace uuid,p_environment text,p_intent uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT CASE
  WHEN (SELECT COALESCE(sum(a.amount_minor),0) FROM financial_allocations a
   WHERE a.workspace_id=i.workspace_id AND a.environment=i.environment AND a.intent_id=i.id)>=i.amount_minor
   THEN 'completed'
  WHEN EXISTS(SELECT 1 FROM pg05_intent_events e WHERE e.workspace_id=i.workspace_id
   AND e.environment=i.environment AND e.intent_id=i.id AND e.event_type='cancelled') THEN 'cancelled'
  WHEN i.expires_at<=now() THEN 'expired'
  WHEN EXISTS(SELECT 1 FROM payment_attempts a WHERE a.workspace_id=i.workspace_id
   AND a.environment=i.environment AND a.intent_id=i.id) THEN 'awaiting_payment'
  ELSE 'requires_payer' END
 FROM payment_intents i WHERE i.workspace_id=p_workspace
 AND i.environment=p_environment AND i.id=p_intent
$$;
-- Authenticated merchant creation. Canonical request digest prevents idempotency
-- key reuse with altered amount, reference or time. Secret token never persisted.
CREATE FUNCTION pg05_create_intent(p_workspace uuid,p_environment text,p_reference text,
 p_amount bigint,p_minutes integer,p_key text,p_digest text,p_request_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE existing financial_idempotency%ROWTYPE; issued payment_intents%ROWTYPE; result jsonb; method text;
BEGIN
 IF p_environment<>'sandbox' OR p_workspace IS NULL OR
  current_setting('ekmivo.workspace_id',true) IS DISTINCT FROM p_workspace::text OR
  current_setting('ekmivo.environment',true) IS DISTINCT FROM p_environment OR
  length(p_reference) NOT BETWEEN 1 AND 128 OR p_reference<>btrim(p_reference) OR
  p_amount NOT BETWEEN 1 AND 100000000000 OR p_minutes NOT BETWEEN 5 AND 60 OR
  length(p_key) NOT BETWEEN 16 AND 128 OR p_digest !~ '^[a-f0-9]{64}$' OR
  p_request_hash !~ '^[a-f0-9]{64}$' OR
  NOT EXISTS(SELECT 1 FROM financial_workspace_registry WHERE workspace_id=p_workspace
    AND environment=p_environment AND status='active') THEN
  RAISE EXCEPTION 'sandbox request invalid or unavailable' USING ERRCODE='22023';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(
  p_workspace::text||':'||p_environment||':pg05.create:'||p_key,0));
 SELECT * INTO existing FROM financial_idempotency
 WHERE workspace_id=p_workspace AND environment=p_environment AND operation='pg05.create' AND idempotency_key=p_key;
 IF FOUND THEN
  IF existing.request_hash<>p_request_hash THEN
   RAISE EXCEPTION 'idempotency payload changed' USING ERRCODE='23505';
  END IF;
  RETURN existing.result_body;
 END IF;
 INSERT INTO payment_intents(workspace_id,environment,merchant_reference,amount_minor,expires_at)
 VALUES(p_workspace,p_environment,p_reference,p_amount,now()+make_interval(mins=>p_minutes))
 RETURNING * INTO issued;
 INSERT INTO pg05_checkout_tokens(workspace_id,environment,intent_id,token_digest,creation_key)
 VALUES(p_workspace,p_environment,issued.id,p_digest,p_key);
 -- Explicitly SIMULATED destinations. Neither real receiving phone numbers nor
 -- provider credentials are created. Live paths require PG06/PG12 onboarding.
 FOREACH method IN ARRAY ARRAY['bkash','nagad','rocket'] LOOP
  INSERT INTO financial_receiving_accounts
   (workspace_id,environment,method,identity_hmac,display_suffix)
  VALUES(p_workspace,p_environment,method,
   encode(digest('pg05-NO-REAL-MONEY:'||p_workspace::text||':'||method,'sha256'),'hex'),'0000')
  ON CONFLICT(workspace_id,environment,method,identity_hmac) DO NOTHING;
 END LOOP;
 INSERT INTO pg05_intent_events(workspace_id,environment,intent_id,event_type)
 VALUES(p_workspace,p_environment,issued.id,'created');
 result=jsonb_build_object('id',issued.id,'merchant_reference',issued.merchant_reference,
  'amount_minor',issued.amount_minor,'currency','BDT','environment',issued.environment,
  'expires_at',issued.expires_at,'state','requires_payer');
 INSERT INTO financial_idempotency
 (workspace_id,environment,operation,idempotency_key,request_hash,result_code,result_body)
 VALUES(p_workspace,p_environment,'pg05.create',p_key,p_request_hash,201,result);
 RETURN result;
END; $$;

-- A checkout capability grants only status and payer lock, NEVER paid status,
-- cancellation, refunds or financial evidence insertion.
CREATE FUNCTION pg05_checkout_view(p_digest text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE i payment_intents%ROWTYPE; attempt payment_attempts%ROWTYPE; state text;
BEGIN
 IF p_digest !~ '^[a-f0-9]{64}$' THEN RETURN NULL; END IF;
 SELECT intent.* INTO i FROM pg05_checkout_tokens t
 JOIN payment_intents intent ON intent.id=t.intent_id
  AND intent.workspace_id=t.workspace_id AND intent.environment=t.environment
 JOIN financial_workspace_registry registry ON registry.workspace_id=intent.workspace_id
  AND registry.environment=intent.environment AND registry.status='active'
 WHERE t.token_digest=p_digest AND t.environment=(SELECT environment FROM financial_realm WHERE singleton);
 IF NOT FOUND THEN RETURN NULL; END IF;
 state:=pg05_intent_state(i.workspace_id,i.environment,i.id);
 SELECT * INTO attempt FROM payment_attempts
  WHERE workspace_id=i.workspace_id AND environment=i.environment AND intent_id=i.id
  ORDER BY issued_at DESC LIMIT 1;
 RETURN jsonb_build_object('id',i.id,'merchant_reference',i.merchant_reference,
  'amount_minor',i.amount_minor,'currency',i.currency,'environment',i.environment,
  'created_at',i.created_at,'expires_at',i.expires_at,'state',state,
  'payer_suffix',attempt.payer_suffix,'method',attempt.method,
  'methods',CASE WHEN state='requires_payer' THEN '["bkash","nagad","rocket"]'::jsonb ELSE '[]'::jsonb END,
  'destination',CASE WHEN attempt.id IS NOT NULL THEN 'SIMULATED — DO NOT SEND MONEY' ELSE NULL END,
  'verification_available',false);
END; $$;

CREATE FUNCTION pg05_lock_payer(p_digest text,p_payer_hmac text,p_suffix text,p_method text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE i payment_intents%ROWTYPE; attempt payment_attempts%ROWTYPE; account_id uuid;
BEGIN
 IF p_digest !~ '^[a-f0-9]{64}$' OR p_payer_hmac !~ '^[a-f0-9]{64}$'
  OR p_suffix !~ '^[0-9]{4}$' OR p_method NOT IN ('bkash','nagad','rocket') THEN
  RAISE EXCEPTION 'invalid payer or route' USING ERRCODE='22023';
 END IF;
 SELECT intent.* INTO i FROM pg05_checkout_tokens t JOIN payment_intents intent
  ON intent.id=t.intent_id AND intent.workspace_id=t.workspace_id AND intent.environment=t.environment
 WHERE t.token_digest=p_digest AND intent.environment=(SELECT environment FROM financial_realm WHERE singleton)
 FOR UPDATE OF intent;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF i.environment<>'sandbox' OR pg05_intent_state(i.workspace_id,i.environment,i.id)
    NOT IN ('requires_payer','awaiting_payment') THEN
  RAISE EXCEPTION 'checkout expired, cancelled or unavailable' USING ERRCODE='23514';
 END IF;
 SELECT * INTO attempt FROM payment_attempts WHERE workspace_id=i.workspace_id
  AND environment=i.environment AND intent_id=i.id LIMIT 1;
 IF FOUND THEN
  IF attempt.payer_hmac<>p_payer_hmac OR attempt.method<>p_method THEN
   RAISE EXCEPTION 'payer or method already locked' USING ERRCODE='23505';
  END IF;
  RETURN pg05_checkout_view(p_digest);
 END IF;
 SELECT id INTO account_id FROM financial_receiving_accounts
 WHERE workspace_id=i.workspace_id AND environment=i.environment AND method=p_method
 AND display_suffix='0000' ORDER BY created_at LIMIT 1;
 IF account_id IS NULL THEN
  RAISE EXCEPTION 'receiving route not available' USING ERRCODE='23514';
 END IF;
 INSERT INTO payment_attempts(workspace_id,environment,intent_id,receiving_account_id,
  payer_hmac,payer_suffix,amount_minor,method,window_start,window_end,policy_version,issued_at)
 VALUES(i.workspace_id,i.environment,i.id,account_id,p_payer_hmac,p_suffix,i.amount_minor,
  p_method,now(),i.expires_at,1,now());
 INSERT INTO pg05_intent_events(workspace_id,environment,intent_id,event_type)
 VALUES(i.workspace_id,i.environment,i.id,'payer_locked');
 RETURN pg05_checkout_view(p_digest);
END; $$;

-- Merchant read/cancel is separate from the public token capability; authenticated
-- Go role must bind the freshly authorized workspace+realm transaction-local.
CREATE FUNCTION pg05_merchant_list(p_workspace uuid,p_environment text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT CASE WHEN current_setting('ekmivo.workspace_id',true)=p_workspace::text
 AND current_setting('ekmivo.environment',true)=p_environment THEN
 COALESCE((SELECT jsonb_agg(jsonb_build_object(
  'id',i.id,'merchant_reference',i.merchant_reference,'amount_minor',i.amount_minor,
  'currency',i.currency,'created_at',i.created_at,'expires_at',i.expires_at,
  'state',pg05_intent_state(i.workspace_id,i.environment,i.id),
  'creation_key',t.creation_key) ORDER BY i.created_at DESC)
 FROM (SELECT * FROM payment_intents WHERE workspace_id=p_workspace
 AND environment=p_environment ORDER BY created_at DESC LIMIT 50) i
 JOIN pg05_checkout_tokens t ON t.workspace_id=i.workspace_id AND
 t.environment=i.environment AND t.intent_id=i.id), '[]'::jsonb) ELSE NULL END
$$;
CREATE FUNCTION pg05_cancel_intent(p_workspace uuid,p_environment text,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE i payment_intents%ROWTYPE; state text;
BEGIN
 IF current_setting('ekmivo.workspace_id',true) IS DISTINCT FROM p_workspace::text
 OR current_setting('ekmivo.environment',true) IS DISTINCT FROM p_environment THEN
  RAISE EXCEPTION 'scope denied' USING ERRCODE='42501';
 END IF;
 SELECT * INTO i FROM payment_intents WHERE workspace_id=p_workspace
 AND environment=p_environment AND id=p_id FOR UPDATE;
 IF NOT FOUND THEN RETURN NULL; END IF;
 state:=pg05_intent_state(p_workspace,p_environment,p_id);
 IF state='cancelled' THEN
  RETURN jsonb_build_object('id',p_id,'state','cancelled');
 END IF;
 IF state NOT IN ('awaiting_payment','requires_payer') THEN
  RAISE EXCEPTION 'paid or expired request cannot be cancelled' USING ERRCODE='23514';
 END IF;
 INSERT INTO pg05_intent_events(workspace_id,environment,intent_id,event_type,reason)
 VALUES(p_workspace,p_environment,p_id,'cancelled','merchant_cancelled');
 RETURN jsonb_build_object('id',p_id,'state','cancelled');
END; $$;
REVOKE ALL ON FUNCTION pg05_intent_state(uuid,text,uuid),pg05_create_intent(uuid,text,text,bigint,integer,text,text,text),
 pg05_checkout_view(text),pg05_lock_payer(text,text,text,text),pg05_merchant_list(uuid,text),
 pg05_cancel_intent(uuid,text,uuid) FROM PUBLIC;
-- PG04 reader is a restricted role with no direct finance writes.
GRANT EXECUTE ON FUNCTION pg05_create_intent(uuid,text,text,bigint,integer,text,text,text),
 pg05_checkout_view(text),pg05_lock_payer(text,text,text,text),pg05_merchant_list(uuid,text),
 pg05_cancel_intent(uuid,text,uuid) TO ekmivo_finance_reader;

-- A cancelled immutable attempt stays in history but must not prevent a
-- NEW honest payment attempt against the same payer/route/time bucket.
CREATE OR REPLACE FUNCTION financial_validate_attempt() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE intent payment_intents%ROWTYPE; method_of_account text; has_overlap boolean;
BEGIN
 SELECT * INTO intent FROM payment_intents
 WHERE workspace_id=NEW.workspace_id AND environment=NEW.environment AND id=NEW.intent_id;
 SELECT method INTO method_of_account FROM financial_receiving_accounts
 WHERE workspace_id=NEW.workspace_id AND environment=NEW.environment AND id=NEW.receiving_account_id;
 IF intent.id IS NULL OR method_of_account IS NULL
  OR intent.amount_minor<>NEW.amount_minor OR intent.currency<>NEW.currency
  OR method_of_account<>NEW.method OR NEW.window_start<NEW.issued_at
  OR NEW.window_end>intent.expires_at OR NEW.window_start>=NEW.window_end THEN
  RAISE EXCEPTION 'attempt cannot change issued amount, receiving method or window' USING ERRCODE='23514';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(
  NEW.workspace_id::text||':'||NEW.environment||':'||NEW.receiving_account_id::text||
  ':'||NEW.payer_hmac||':'||NEW.method||':'||NEW.amount_minor::text,0));
 SELECT EXISTS(SELECT 1 FROM payment_attempts a
  WHERE a.workspace_id=NEW.workspace_id AND a.environment=NEW.environment
  AND a.receiving_account_id=NEW.receiving_account_id AND a.payer_hmac=NEW.payer_hmac
  AND a.method=NEW.method AND a.amount_minor=NEW.amount_minor
  AND tstzrange(a.window_start,a.window_end,'[)') &&
     tstzrange(NEW.window_start,NEW.window_end,'[)')
  AND NOT EXISTS(SELECT 1 FROM pg05_intent_events cancellation
   WHERE cancellation.workspace_id=a.workspace_id
   AND cancellation.environment=a.environment AND cancellation.intent_id=a.intent_id
   AND cancellation.event_type='cancelled')
 ) INTO has_overlap;
 IF has_overlap THEN
  RAISE EXCEPTION 'overlapping active payer/account/method/amount attempt' USING ERRCODE='23505';
 END IF;
 RETURN NEW;
END; $$;
COMMIT;
