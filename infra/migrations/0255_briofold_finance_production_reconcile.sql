-- 0255 (financial realms): bring the repository level with production (stabilize runbook, step D).
--
-- Production (checked 2026-11-14 against schema-only copies of ekmivo_live_financial and ekmivo_sandbox_financial)
-- runs function sources that the repository does not build. Live and sandbox differ from each other for some of
-- them (live has a receiving-account fallback in SMS matching that sandbox does not). Each realm gets exactly its
-- own production source, chosen by financial_realm.environment, embedded as base64 where it contains CR bytes.
--
-- Rule: on production this file changes nothing. Every function is replaced only when md5(prosrc) differs from
-- that realm's production source. Running it twice is safe. Owner decision 2026-11-15: repository matches production.

-- pg06_phone_candidate(uuid,text,text,bigint,timestamp with time zone,text)
DO $m$
DECLARE realm text;
BEGIN
  SELECT environment INTO realm FROM financial_realm WHERE singleton;
  IF realm IS NULL OR realm NOT IN ('live','sandbox') THEN RAISE EXCEPTION '0255: financial_realm is not set'; END IF;
  IF realm='live' THEN  -- production md5(prosrc)=103c5c0de3137328ac6f3868eaeb4de9
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.pg06_phone_candidate(uuid,text,text,bigint,timestamp with time zone,text)') AND md5(prosrc)='103c5c0de3137328ac6f3868eaeb4de9') THEN
      EXECUTE $r$CREATE OR REPLACE FUNCTION public.pg06_phone_candidate(p_phone uuid, p_method text, p_payer text, p_amount bigint, p_time timestamp with time zone, p_precision text)
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
       AND p_precision IN ('minute','second') AND p_time>=a.window_start AND p_time<a.window_end
       AND (p_precision<>'minute' OR p_time+interval '1 minute'<=a.window_end)),
    (SELECT min(ra.id::text)
     FROM pg06_phones phone
     JOIN financial_workspace_registry registry ON registry.workspace_id=phone.workspace_id AND registry.environment=phone.environment
     JOIN financial_receiving_accounts ra ON ra.workspace_id=phone.workspace_id AND ra.environment=phone.environment
     JOIN pg06_account_configuration cfg ON cfg.account_id=ra.id AND cfg.disabled_at IS NULL
     WHERE phone.id=p_phone AND phone.revoked_at IS NULL AND phone.public_key IS NOT NULL
       AND registry.status='active' AND ra.method=p_method AND p_amount>0
       AND p_precision IN ('minute','second'))
  )
$function$
$r$;
      BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.pg06_phone_candidate(p_phone uuid, p_method text, p_payer text, p_amount bigint, p_time timestamp with time zone, p_precision text) FROM PUBLIC'; EXCEPTION WHEN undefined_object THEN NULL; END;
      BEGIN EXECUTE 'GRANT ALL ON FUNCTION public.pg06_phone_candidate(p_phone uuid, p_method text, p_payer text, p_amount bigint, p_time timestamp with time zone, p_precision text) TO ekmivo_finance_reader'; EXCEPTION WHEN undefined_object THEN NULL; END;
    END IF;
  ELSIF realm='sandbox' THEN  -- production md5(prosrc)=48e1ebed7bae354a5e799f32a3af0144
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.pg06_phone_candidate(uuid,text,text,bigint,timestamp with time zone,text)') AND md5(prosrc)='48e1ebed7bae354a5e799f32a3af0144') THEN
      EXECUTE $r$CREATE OR REPLACE FUNCTION public.pg06_phone_candidate(p_phone uuid, p_method text, p_payer text, p_amount bigint, p_time timestamp with time zone, p_precision text)
 RETURNS text
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 SELECT CASE WHEN count(*)=1 THEN min(a.receiving_account_id::text) END
 FROM payment_attempts a JOIN pg06_phones phone ON phone.workspace_id=a.workspace_id AND phone.environment=a.environment
 JOIN financial_workspace_registry registry ON registry.workspace_id=a.workspace_id AND registry.environment=a.environment
 WHERE phone.id=p_phone AND phone.revoked_at IS NULL AND phone.public_key IS NOT NULL
 AND registry.status='active' AND a.method=p_method AND a.payer_hmac=p_payer
 AND a.amount_minor=p_amount AND a.currency='BDT'
 AND p_precision IN ('minute','second') AND p_time>=a.window_start AND p_time<a.window_end
 AND (p_precision<>'minute' OR p_time+interval '1 minute'<=a.window_end)
$function$
$r$;
      BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.pg06_phone_candidate(p_phone uuid, p_method text, p_payer text, p_amount bigint, p_time timestamp with time zone, p_precision text) FROM PUBLIC'; EXCEPTION WHEN undefined_object THEN NULL; END;
      BEGIN EXECUTE 'GRANT ALL ON FUNCTION public.pg06_phone_candidate(p_phone uuid, p_method text, p_payer text, p_amount bigint, p_time timestamp with time zone, p_precision text) TO ekmivo_finance_reader'; EXCEPTION WHEN undefined_object THEN NULL; END;
    END IF;
  END IF;
END
$m$;

-- pg06_phone_forward(uuid,text,text,bytea,text,text,timestamp with time zone,bigint,bigint,uuid,text,bigint,timestamp with time zone,text,text,text,integer)
DO $m$
DECLARE realm text;
BEGIN
  SELECT environment INTO realm FROM financial_realm WHERE singleton;
  IF realm IS NULL OR realm NOT IN ('live','sandbox') THEN RAISE EXCEPTION '0255: financial_realm is not set'; END IF;
  IF realm='live' THEN  -- production md5(prosrc)=efc2b757747874307066cce1703f82aa
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.pg06_phone_forward(uuid,text,text,bytea,text,text,timestamp with time zone,bigint,bigint,uuid,text,bigint,timestamp with time zone,text,text,text,integer)') AND md5(prosrc)='efc2b757747874307066cce1703f82aa') THEN
      EXECUTE $r$CREATE OR REPLACE FUNCTION public.pg06_phone_forward(phone_id uuid, event text, hash text, encrypted bytea, sender_name text, sim_name text, observed_time timestamp with time zone, event_sequence bigint, captured_version bigint, receiving uuid, payer_identity text, amount bigint, original_time timestamp with time zone, precision_name text, reference_identity text, method_name text, parser_ver integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
 SELECT * INTO old FROM pg06_phone_forwarded AS forwarded WHERE forwarded.phone_id=p.id AND forwarded.event_id=event;
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
    JOIN pg06_account_configuration c ON c.account_id=a.id AND c.disabled_at IS NULL
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
  ciphertext,sender,sim_hint,observed_at,sequence,configuration_version,reason,observation_id)
 VALUES(p.workspace_id,p.environment,p.id,event,hash,encrypted,sender_name,sim_name,
  observed_time,event_sequence,captured_version,result_reason,observation);
 RETURN jsonb_build_object('ack','durable','reason',result_reason,
  'observation_id',observation,'replayed',false);
END $function$
$r$;
      BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.pg06_phone_forward(phone_id uuid, event text, hash text, encrypted bytea, sender_name text, sim_name text, observed_time timestamp with time zone, event_sequence bigint, captured_version bigint, receiving uuid, payer_identity text, amount bigint, original_time timestamp with time zone, precision_name text, reference_identity text, method_name text, parser_ver integer) FROM PUBLIC'; EXCEPTION WHEN undefined_object THEN NULL; END;
      BEGIN EXECUTE 'GRANT ALL ON FUNCTION public.pg06_phone_forward(phone_id uuid, event text, hash text, encrypted bytea, sender_name text, sim_name text, observed_time timestamp with time zone, event_sequence bigint, captured_version bigint, receiving uuid, payer_identity text, amount bigint, original_time timestamp with time zone, precision_name text, reference_identity text, method_name text, parser_ver integer) TO ekmivo_finance_reader'; EXCEPTION WHEN undefined_object THEN NULL; END;
    END IF;
  ELSIF realm='sandbox' THEN  -- production md5(prosrc)=efc2b757747874307066cce1703f82aa
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.pg06_phone_forward(uuid,text,text,bytea,text,text,timestamp with time zone,bigint,bigint,uuid,text,bigint,timestamp with time zone,text,text,text,integer)') AND md5(prosrc)='efc2b757747874307066cce1703f82aa') THEN
      EXECUTE $r$CREATE OR REPLACE FUNCTION public.pg06_phone_forward(phone_id uuid, event text, hash text, encrypted bytea, sender_name text, sim_name text, observed_time timestamp with time zone, event_sequence bigint, captured_version bigint, receiving uuid, payer_identity text, amount bigint, original_time timestamp with time zone, precision_name text, reference_identity text, method_name text, parser_ver integer)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
 SELECT * INTO old FROM pg06_phone_forwarded AS forwarded WHERE forwarded.phone_id=p.id AND forwarded.event_id=event;
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
    JOIN pg06_account_configuration c ON c.account_id=a.id AND c.disabled_at IS NULL
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
  ciphertext,sender,sim_hint,observed_at,sequence,configuration_version,reason,observation_id)
 VALUES(p.workspace_id,p.environment,p.id,event,hash,encrypted,sender_name,sim_name,
  observed_time,event_sequence,captured_version,result_reason,observation);
 RETURN jsonb_build_object('ack','durable','reason',result_reason,
  'observation_id',observation,'replayed',false);
END $function$
$r$;
      BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.pg06_phone_forward(phone_id uuid, event text, hash text, encrypted bytea, sender_name text, sim_name text, observed_time timestamp with time zone, event_sequence bigint, captured_version bigint, receiving uuid, payer_identity text, amount bigint, original_time timestamp with time zone, precision_name text, reference_identity text, method_name text, parser_ver integer) FROM PUBLIC'; EXCEPTION WHEN undefined_object THEN NULL; END;
      BEGIN EXECUTE 'GRANT ALL ON FUNCTION public.pg06_phone_forward(phone_id uuid, event text, hash text, encrypted bytea, sender_name text, sim_name text, observed_time timestamp with time zone, event_sequence bigint, captured_version bigint, receiving uuid, payer_identity text, amount bigint, original_time timestamp with time zone, precision_name text, reference_identity text, method_name text, parser_ver integer) TO ekmivo_finance_reader'; EXCEPTION WHEN undefined_object THEN NULL; END;
    END IF;
  END IF;
END
$m$;

-- pg06_phone_forward(uuid,text,text,bytea,text,text,timestamp with time zone,bigint,bigint,uuid,text,bigint,timestamp with time zone,text,text,text,integer,bytea)
DO $m$
DECLARE realm text;
BEGIN
  SELECT environment INTO realm FROM financial_realm WHERE singleton;
  IF realm IS NULL OR realm NOT IN ('live','sandbox') THEN RAISE EXCEPTION '0255: financial_realm is not set'; END IF;
  IF realm='live' THEN  -- production md5(prosrc)=734db44b5bdd484a5865e32e659a9b8a
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.pg06_phone_forward(uuid,text,text,bytea,text,text,timestamp with time zone,bigint,bigint,uuid,text,bigint,timestamp with time zone,text,text,text,integer,bytea)') AND md5(prosrc)='734db44b5bdd484a5865e32e659a9b8a') THEN
      EXECUTE $r$CREATE OR REPLACE FUNCTION public.pg06_phone_forward(phone_id uuid, event text, hash text, encrypted bytea, sender_name text, sim_name text, observed_time timestamp with time zone, event_sequence bigint, captured_version bigint, receiving uuid, payer_identity text, amount bigint, original_time timestamp with time zone, precision_name text, reference_identity text, method_name text, parser_ver integer, payer_contact bytea)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
 SELECT * INTO old FROM pg06_phone_forwarded f WHERE f.phone_id=p.id AND f.event_id=event;
 IF old.id IS NOT NULL THEN
  IF old.digest<>hash THEN RAISE EXCEPTION 'reused signed event' USING ERRCODE='23505';END IF;
  RETURN jsonb_build_object('ack','durable','reason',old.reason,
   'observation_id',old.observation_id,'replayed',true);
 END IF;
 -- Capture-time configuration must still match. Otherwise do not route
 -- messages that were queued before account/source changes.
 -- Physical forwarders no longer bind receipts to a SIM or receiving account.
 -- Configuration changes after capture do not invalidate signed queued SMS.
 -- Revoked phones, workspace scope and immutable candidate uniqueness are still enforced.
 IF receiving IS NOT NULL THEN
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
END $function$
$r$;
      BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.pg06_phone_forward(phone_id uuid, event text, hash text, encrypted bytea, sender_name text, sim_name text, observed_time timestamp with time zone, event_sequence bigint, captured_version bigint, receiving uuid, payer_identity text, amount bigint, original_time timestamp with time zone, precision_name text, reference_identity text, method_name text, parser_ver integer, payer_contact bytea) FROM PUBLIC'; EXCEPTION WHEN undefined_object THEN NULL; END;
      BEGIN EXECUTE 'GRANT ALL ON FUNCTION public.pg06_phone_forward(phone_id uuid, event text, hash text, encrypted bytea, sender_name text, sim_name text, observed_time timestamp with time zone, event_sequence bigint, captured_version bigint, receiving uuid, payer_identity text, amount bigint, original_time timestamp with time zone, precision_name text, reference_identity text, method_name text, parser_ver integer, payer_contact bytea) TO ekmivo_finance_reader'; EXCEPTION WHEN undefined_object THEN NULL; END;
    END IF;
  ELSIF realm='sandbox' THEN  -- production md5(prosrc)=734db44b5bdd484a5865e32e659a9b8a
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.pg06_phone_forward(uuid,text,text,bytea,text,text,timestamp with time zone,bigint,bigint,uuid,text,bigint,timestamp with time zone,text,text,text,integer,bytea)') AND md5(prosrc)='734db44b5bdd484a5865e32e659a9b8a') THEN
      EXECUTE $r$CREATE OR REPLACE FUNCTION public.pg06_phone_forward(phone_id uuid, event text, hash text, encrypted bytea, sender_name text, sim_name text, observed_time timestamp with time zone, event_sequence bigint, captured_version bigint, receiving uuid, payer_identity text, amount bigint, original_time timestamp with time zone, precision_name text, reference_identity text, method_name text, parser_ver integer, payer_contact bytea)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
 SELECT * INTO old FROM pg06_phone_forwarded f WHERE f.phone_id=p.id AND f.event_id=event;
 IF old.id IS NOT NULL THEN
  IF old.digest<>hash THEN RAISE EXCEPTION 'reused signed event' USING ERRCODE='23505';END IF;
  RETURN jsonb_build_object('ack','durable','reason',old.reason,
   'observation_id',old.observation_id,'replayed',true);
 END IF;
 -- Capture-time configuration must still match. Otherwise do not route
 -- messages that were queued before account/source changes.
 -- Physical forwarders no longer bind receipts to a SIM or receiving account.
 -- Configuration changes after capture do not invalidate signed queued SMS.
 -- Revoked phones, workspace scope and immutable candidate uniqueness are still enforced.
 IF receiving IS NOT NULL THEN
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
END $function$
$r$;
      BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.pg06_phone_forward(phone_id uuid, event text, hash text, encrypted bytea, sender_name text, sim_name text, observed_time timestamp with time zone, event_sequence bigint, captured_version bigint, receiving uuid, payer_identity text, amount bigint, original_time timestamp with time zone, precision_name text, reference_identity text, method_name text, parser_ver integer, payer_contact bytea) FROM PUBLIC'; EXCEPTION WHEN undefined_object THEN NULL; END;
      BEGIN EXECUTE 'GRANT ALL ON FUNCTION public.pg06_phone_forward(phone_id uuid, event text, hash text, encrypted bytea, sender_name text, sim_name text, observed_time timestamp with time zone, event_sequence bigint, captured_version bigint, receiving uuid, payer_identity text, amount bigint, original_time timestamp with time zone, precision_name text, reference_identity text, method_name text, parser_ver integer, payer_contact bytea) TO ekmivo_finance_reader'; EXCEPTION WHEN undefined_object THEN NULL; END;
    END IF;
  END IF;
END
$m$;

-- pg108_pending_phone_receipts()
DO $m$
DECLARE realm text;
BEGIN
  SELECT environment INTO realm FROM financial_realm WHERE singleton;
  IF realm IS NULL OR realm NOT IN ('live','sandbox') THEN RAISE EXCEPTION '0255: financial_realm is not set'; END IF;
  IF realm='live' THEN  -- production md5(prosrc)=f2011e58b9890e43209d3887daafd77a
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.pg108_pending_phone_receipts()') AND md5(prosrc)='f2011e58b9890e43209d3887daafd77a') THEN
      EXECUTE $r$CREATE OR REPLACE FUNCTION public.pg108_pending_phone_receipts()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM (
    SELECT f.id,f.workspace_id,f.environment,f.phone_id,f.event_id,f.sender,
           encode(f.ciphertext,'base64') AS cipher,r.entitlement_version AS version
    FROM pg06_phone_forwarded f
    JOIN pg06_phones p ON p.id=f.phone_id AND p.workspace_id=f.workspace_id AND p.environment=f.environment
    JOIN financial_workspace_registry r ON r.workspace_id=f.workspace_id AND r.environment=f.environment
    WHERE f.environment=(SELECT environment FROM financial_realm WHERE singleton)
      AND r.status='active' AND p.revoked_at IS NULL
      AND f.observation_id IS NULL AND f.reason='verification_pending'
      AND f.received_at>now()-interval '30 days'
    ORDER BY f.received_at DESC LIMIT 20
  ) x
$function$
$r$;
      BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.pg108_pending_phone_receipts() FROM PUBLIC'; EXCEPTION WHEN undefined_object THEN NULL; END;
      BEGIN EXECUTE 'GRANT ALL ON FUNCTION public.pg108_pending_phone_receipts() TO ekmivo_financial_worker'; EXCEPTION WHEN undefined_object THEN NULL; END;
    END IF;
  ELSIF realm='sandbox' THEN  -- production md5(prosrc)=efc27d6b42425a4781e7521efafce291
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.pg108_pending_phone_receipts()') AND md5(prosrc)='efc27d6b42425a4781e7521efafce291') THEN
      EXECUTE $r$CREATE OR REPLACE FUNCTION public.pg108_pending_phone_receipts()
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM (
 SELECT f.id,f.workspace_id,f.environment,f.phone_id,f.event_id,f.sender,encode(f.ciphertext,'base64') AS cipher,r.entitlement_version AS version
 FROM pg06_phone_forwarded f JOIN pg06_phones p ON p.id=f.phone_id AND p.workspace_id=f.workspace_id AND p.environment=f.environment
 JOIN financial_workspace_registry r ON r.workspace_id=f.workspace_id AND r.environment=f.environment
 WHERE f.environment=(SELECT environment FROM financial_realm WHERE singleton) AND r.status='active' AND p.revoked_at IS NULL
 AND f.observation_id IS NULL AND f.reason='verification_pending' AND f.received_at>now()-interval '1 hour'
 ORDER BY f.received_at DESC LIMIT 10
 ) x
$function$
$r$;
      BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.pg108_pending_phone_receipts() FROM PUBLIC'; EXCEPTION WHEN undefined_object THEN NULL; END;
      BEGIN EXECUTE 'GRANT ALL ON FUNCTION public.pg108_pending_phone_receipts() TO ekmivo_financial_worker'; EXCEPTION WHEN undefined_object THEN NULL; END;
    END IF;
  END IF;
END
$m$;

-- pg108_recover_phone_receipt(uuid,bigint,text,bigint,timestamp with time zone,text,text,text,integer,bytea)
DO $m$
DECLARE realm text;
BEGIN
  SELECT environment INTO realm FROM financial_realm WHERE singleton;
  IF realm IS NULL OR realm NOT IN ('live','sandbox') THEN RAISE EXCEPTION '0255: financial_realm is not set'; END IF;
  IF realm='live' THEN  -- production md5(prosrc)=84422e12d1132af8652da0bc810118de
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.pg108_recover_phone_receipt(uuid,bigint,text,bigint,timestamp with time zone,text,text,text,integer,bytea)') AND md5(prosrc)='84422e12d1132af8652da0bc810118de') THEN
      EXECUTE $r$CREATE OR REPLACE FUNCTION public.pg108_recover_phone_receipt(fid uuid, expected_version bigint, payer text, amount bigint, original_time timestamp with time zone, precision_name text, reference_identity text, method_name text, parser_ver integer, payer_contact bytea)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  f pg06_phone_forwarded; receiving uuid; observation uuid; inbound uuid; old financial_receipt_observations;
BEGIN
  SELECT * INTO f FROM pg06_phone_forwarded WHERE id=fid FOR UPDATE;
  IF f.id IS NULL THEN RETURN NULL; END IF;
  IF f.observation_id IS NOT NULL THEN RETURN f.observation_id; END IF;
  IF f.reason<>'verification_pending'
     OR f.environment IS DISTINCT FROM (SELECT environment FROM financial_realm WHERE singleton)
     OR NOT EXISTS(SELECT 1 FROM financial_workspace_registry r WHERE r.workspace_id=f.workspace_id AND r.environment=f.environment AND r.status='active' AND r.entitlement_version=expected_version)
     OR NOT EXISTS(SELECT 1 FROM pg06_phones p WHERE p.id=f.phone_id AND p.workspace_id=f.workspace_id AND p.environment=f.environment AND p.revoked_at IS NULL AND p.public_key IS NOT NULL)
  THEN RAISE EXCEPTION 'recovery scope denied' USING ERRCODE='42501'; END IF;
  IF payer !~ '^[a-f0-9]{64}$' OR reference_identity !~ '^[a-f0-9]{64}$'
     OR amount IS NULL OR amount<=0 OR original_time IS NULL OR original_time>now()+interval '5 minutes'
     OR precision_name NOT IN ('minute','second') OR parser_ver<1 OR method_name NOT IN ('bkash','nagad','rocket')
  THEN RAISE EXCEPTION 'invalid recovered evidence' USING ERRCODE='22023'; END IF;
  receiving:=pg06_phone_candidate(f.phone_id,method_name,payer,amount,original_time,precision_name)::uuid;
  IF receiving IS NULL THEN RETURN NULL; END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('receipt|'||receiving::text||'|'||reference_identity,0));
  SELECT * INTO old FROM financial_receipt_observations o
   WHERE o.workspace_id=f.workspace_id AND o.environment=f.environment
     AND o.receiving_account_id=receiving AND o.provider_reference_hmac=reference_identity;
  IF old.id IS NOT NULL THEN
    IF old.payer_hmac IS DISTINCT FROM payer OR old.amount_minor IS DISTINCT FROM amount
       OR old.original_transaction_at IS DISTINCT FROM original_time OR old.method IS DISTINCT FROM method_name THEN RETURN NULL; END IF;
    observation:=old.id;
  ELSE
    INSERT INTO financial_inbound_events(workspace_id,environment,source_kind,source_event_id,event_digest,original_source_at,encrypted_evidence)
    VALUES(f.workspace_id,f.environment,'device_sms',f.phone_id::text||':'||f.event_id,f.digest,original_time,f.ciphertext) RETURNING id INTO inbound;
    INSERT INTO financial_receipt_observations(workspace_id,environment,inbound_event_id,receiving_account_id,provider_reference_hmac,payer_hmac,amount_minor,method,direction,original_transaction_at,time_precision,parser_version)
    VALUES(f.workspace_id,f.environment,inbound,receiving,reference_identity,payer,amount,method_name,'incoming',original_time,precision_name,parser_ver) RETURNING id INTO observation;
    INSERT INTO pg07_receipt_results(workspace_id,environment,observation_id) VALUES(f.workspace_id,f.environment,observation);
    PERFORM pg07_match(observation, expected_version);
  END IF;
  UPDATE pg06_phone_forwarded SET observation_id=observation,reason='accepted_for_verification',payer_cipher=payer_contact WHERE id=f.id;
  RETURN observation;
END $function$
$r$;
      BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.pg108_recover_phone_receipt(fid uuid, expected_version bigint, payer text, amount bigint, original_time timestamp with time zone, precision_name text, reference_identity text, method_name text, parser_ver integer, payer_contact bytea) FROM PUBLIC'; EXCEPTION WHEN undefined_object THEN NULL; END;
      BEGIN EXECUTE 'GRANT ALL ON FUNCTION public.pg108_recover_phone_receipt(fid uuid, expected_version bigint, payer text, amount bigint, original_time timestamp with time zone, precision_name text, reference_identity text, method_name text, parser_ver integer, payer_contact bytea) TO ekmivo_financial_worker'; EXCEPTION WHEN undefined_object THEN NULL; END;
    END IF;
  ELSIF realm='sandbox' THEN  -- production md5(prosrc)=5037cc60c333149944025329797a2d90
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.pg108_recover_phone_receipt(uuid,bigint,text,bigint,timestamp with time zone,text,text,text,integer,bytea)') AND md5(prosrc)='5037cc60c333149944025329797a2d90') THEN
      EXECUTE $r$CREATE OR REPLACE FUNCTION public.pg108_recover_phone_receipt(fid uuid, expected_version bigint, payer text, amount bigint, original_time timestamp with time zone, precision_name text, reference_identity text, method_name text, parser_ver integer, payer_contact bytea)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE f pg06_phone_forwarded; receiving uuid; observation uuid; inbound uuid; old financial_receipt_observations;
BEGIN
 SELECT * INTO f FROM pg06_phone_forwarded WHERE id=fid FOR UPDATE;
 IF f.id IS NULL THEN RETURN NULL; END IF;
 IF f.observation_id IS NOT NULL THEN RETURN f.observation_id; END IF;
 IF f.reason<>'verification_pending' OR f.environment IS DISTINCT FROM (SELECT environment FROM financial_realm WHERE singleton)
 OR NOT EXISTS(SELECT 1 FROM financial_workspace_registry r WHERE r.workspace_id=f.workspace_id AND r.environment=f.environment AND r.status='active' AND r.entitlement_version=expected_version)
 OR NOT EXISTS(SELECT 1 FROM pg06_phones p WHERE p.id=f.phone_id AND p.workspace_id=f.workspace_id AND p.environment=f.environment AND p.revoked_at IS NULL AND p.public_key IS NOT NULL)
 THEN RAISE EXCEPTION 'recovery scope denied' USING ERRCODE='42501'; END IF;
 IF payer !~ '^[a-f0-9]{64}$' OR reference_identity !~ '^[a-f0-9]{64}$' OR amount IS NULL OR amount<=0 OR original_time IS NULL OR original_time>now()+interval '5 minutes' OR precision_name NOT IN ('minute','second') OR parser_ver<1 OR method_name NOT IN ('bkash','nagad','rocket')
 THEN RAISE EXCEPTION 'invalid recovered evidence' USING ERRCODE='22023'; END IF;
 receiving:=pg06_phone_candidate(f.phone_id,method_name,payer,amount,original_time,precision_name)::uuid;
 IF receiving IS NULL THEN RETURN NULL; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('receipt|'||receiving::text||'|'||reference_identity,0));
 SELECT * INTO old FROM financial_receipt_observations o WHERE o.workspace_id=f.workspace_id AND o.environment=f.environment AND o.receiving_account_id=receiving AND o.provider_reference_hmac=reference_identity;
 IF old.id IS NOT NULL THEN
  IF old.payer_hmac IS DISTINCT FROM payer OR old.amount_minor IS DISTINCT FROM amount OR old.original_transaction_at IS DISTINCT FROM original_time OR old.method IS DISTINCT FROM method_name THEN RETURN NULL; END IF;
  observation:=old.id;
 ELSE
  INSERT INTO financial_inbound_events(workspace_id,environment,source_kind,source_event_id,event_digest,original_source_at,encrypted_evidence)
  VALUES(f.workspace_id,f.environment,'device_sms',f.phone_id::text||':'||f.event_id,f.digest,original_time,f.ciphertext) RETURNING id INTO inbound;
  INSERT INTO financial_receipt_observations(workspace_id,environment,inbound_event_id,receiving_account_id,provider_reference_hmac,payer_hmac,amount_minor,method,direction,original_transaction_at,time_precision,parser_version)
  VALUES(f.workspace_id,f.environment,inbound,receiving,reference_identity,payer,amount,method_name,'incoming',original_time,precision_name,parser_ver) RETURNING id INTO observation;
  INSERT INTO pg07_receipt_results(workspace_id,environment,observation_id) VALUES(f.workspace_id,f.environment,observation);
 END IF;
 UPDATE pg06_phone_forwarded SET observation_id=observation,reason='accepted_for_verification',payer_cipher=payer_contact WHERE id=f.id;
 RETURN observation;
END $function$
$r$;
      BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.pg108_recover_phone_receipt(fid uuid, expected_version bigint, payer text, amount bigint, original_time timestamp with time zone, precision_name text, reference_identity text, method_name text, parser_ver integer, payer_contact bytea) FROM PUBLIC'; EXCEPTION WHEN undefined_object THEN NULL; END;
      BEGIN EXECUTE 'GRANT ALL ON FUNCTION public.pg108_recover_phone_receipt(fid uuid, expected_version bigint, payer text, amount bigint, original_time timestamp with time zone, precision_name text, reference_identity text, method_name text, parser_ver integer, payer_contact bytea) TO ekmivo_financial_worker'; EXCEPTION WHEN undefined_object THEN NULL; END;
    END IF;
  END IF;
END
$m$;

-- pg10_customer_activity(uuid,text,uuid)
DO $m$
DECLARE realm text;
BEGIN
  SELECT environment INTO realm FROM financial_realm WHERE singleton;
  IF realm IS NULL OR realm NOT IN ('live','sandbox') THEN RAISE EXCEPTION '0255: financial_realm is not set'; END IF;
  IF realm='live' THEN  -- production md5(prosrc)=217966cfe45642b0c9e1aa2e2fa2b8b5
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.pg10_customer_activity(uuid,text,uuid)') AND md5(prosrc)='217966cfe45642b0c9e1aa2e2fa2b8b5') THEN
      EXECUTE $r$CREATE OR REPLACE FUNCTION public.pg10_customer_activity(w uuid, e text, customer uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
 PERFORM pg06_scope(w,e);
 IF NOT EXISTS(SELECT 1 FROM pg64_document_catalog WHERE workspace_id=w AND environment=e AND id=customer AND kind='customers') THEN RAISE EXCEPTION 'customer missing' USING ERRCODE='P0002';END IF;
 RETURN jsonb_build_object('invoices',coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'reference',d.reference,'status',d.status,'amount_minor',d.amount_minor,
 'paid_minor',CASE WHEN d.body->>'source'='automatic_checkout' THEN (SELECT coalesce(sum(a.amount_minor),0) FROM financial_allocations a WHERE a.workspace_id=w AND a.environment=e AND a.intent_id=d.id)
 ELSE coalesce((SELECT sum(a.amount_minor) FROM pg10_document_intents l JOIN financial_allocations a ON a.intent_id=l.intent_id AND a.workspace_id=w AND a.environment=e WHERE l.document_id=d.id AND l.workspace_id=w AND l.environment=e),0) END))
 FROM pg64_document_catalog d WHERE d.workspace_id=w AND d.environment=e AND d.customer_id=customer AND d.kind='invoices' AND d.body->>'source' IS DISTINCT FROM 'automatic_checkout'),'[]'::jsonb));
END $function$
$r$;
      BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.pg10_customer_activity(w uuid, e text, customer uuid) FROM PUBLIC'; EXCEPTION WHEN undefined_object THEN NULL; END;
      BEGIN EXECUTE 'GRANT ALL ON FUNCTION public.pg10_customer_activity(w uuid, e text, customer uuid) TO ekmivo_finance_reader'; EXCEPTION WHEN undefined_object THEN NULL; END;
    END IF;
  ELSIF realm='sandbox' THEN  -- production md5(prosrc)=217966cfe45642b0c9e1aa2e2fa2b8b5
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.pg10_customer_activity(uuid,text,uuid)') AND md5(prosrc)='217966cfe45642b0c9e1aa2e2fa2b8b5') THEN
      EXECUTE $r$CREATE OR REPLACE FUNCTION public.pg10_customer_activity(w uuid, e text, customer uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
BEGIN
 PERFORM pg06_scope(w,e);
 IF NOT EXISTS(SELECT 1 FROM pg64_document_catalog WHERE workspace_id=w AND environment=e AND id=customer AND kind='customers') THEN RAISE EXCEPTION 'customer missing' USING ERRCODE='P0002';END IF;
 RETURN jsonb_build_object('invoices',coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'reference',d.reference,'status',d.status,'amount_minor',d.amount_minor,
 'paid_minor',CASE WHEN d.body->>'source'='automatic_checkout' THEN (SELECT coalesce(sum(a.amount_minor),0) FROM financial_allocations a WHERE a.workspace_id=w AND a.environment=e AND a.intent_id=d.id)
 ELSE coalesce((SELECT sum(a.amount_minor) FROM pg10_document_intents l JOIN financial_allocations a ON a.intent_id=l.intent_id AND a.workspace_id=w AND a.environment=e WHERE l.document_id=d.id AND l.workspace_id=w AND l.environment=e),0) END))
 FROM pg64_document_catalog d WHERE d.workspace_id=w AND d.environment=e AND d.customer_id=customer AND d.kind='invoices' AND d.body->>'source' IS DISTINCT FROM 'automatic_checkout'),'[]'::jsonb));
END $function$
$r$;
      BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.pg10_customer_activity(w uuid, e text, customer uuid) FROM PUBLIC'; EXCEPTION WHEN undefined_object THEN NULL; END;
      BEGIN EXECUTE 'GRANT ALL ON FUNCTION public.pg10_customer_activity(w uuid, e text, customer uuid) TO ekmivo_finance_reader'; EXCEPTION WHEN undefined_object THEN NULL; END;
    END IF;
  END IF;
END
$m$;

-- pg10_read(uuid,text,text,uuid,uuid,text)
DO $m$
DECLARE realm text;
BEGIN
  SELECT environment INTO realm FROM financial_realm WHERE singleton;
  IF realm IS NULL OR realm NOT IN ('live','sandbox') THEN RAISE EXCEPTION '0255: financial_realm is not set'; END IF;
  IF realm='live' THEN  -- production md5(prosrc)=4bf87a3a26a30aa4c50a2df1859059c7
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.pg10_read(uuid,text,text,uuid,uuid,text)') AND md5(prosrc)='4bf87a3a26a30aa4c50a2df1859059c7') THEN
      EXECUTE $r$CREATE OR REPLACE FUNCTION public.pg10_read(w uuid, e text, res text, item uuid, after_id uuid, search text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE result jsonb;
BEGIN IF res IN ('invoices','payment-links') THEN PERFORM payment_plan_require_feature(w,e,CASE WHEN res='invoices' THEN 'invoices' ELSE 'payment_links' END);END IF;
 PERFORM pg06_scope(w,e);IF after_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM pg64_document_catalog WHERE workspace_id=w AND environment=e AND kind=res AND id=after_id) THEN RAISE EXCEPTION 'invalid document cursor' USING ERRCODE='22023';END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') INTO result FROM (
 SELECT d.id,d.kind,d.reference,d.status,d.version,CASE WHEN item IS NOT NULL THEN d.body ELSE jsonb_strip_nulls(jsonb_build_object('source',d.body->'source','payment_count',d.body->'payment_count','verified_minor',d.body->'verified_minor','last_payment_at',d.body->'last_payment_at','name',d.body->'name','description',d.body->'description','email',d.body->'email','phone',d.body->'phone','due_at',d.body->'due_at','expires_at',d.body->'expires_at')) END body,d.amount_minor,d.customer_id,d.capability_key,CASE WHEN item IS NOT NULL THEN d.issued_snapshot END issued_snapshot,d.created_at,d.updated_at,
 CASE WHEN d.body->>'source'='automatic_checkout' THEN (SELECT coalesce(sum(a.amount_minor),0) FROM financial_allocations a WHERE a.workspace_id=w AND a.environment=e AND a.intent_id=d.id) ELSE coalesce((SELECT sum(a.amount_minor) FROM pg10_document_intents l JOIN financial_allocations a ON a.intent_id=l.intent_id AND a.workspace_id=l.workspace_id AND a.environment=l.environment WHERE l.document_id=d.id),0) END paid_minor,
 CASE WHEN item IS NULL THEN '[]'::jsonb WHEN d.body->>'source'='automatic_checkout' THEN jsonb_build_array(jsonb_build_object('intent_id',d.id,'state',pg05_intent_state(w,e,d.id))) ELSE (SELECT coalesce(jsonb_agg(jsonb_build_object('intent_id',l.intent_id,'state',pg05_intent_state(w,e,l.intent_id))), '[]') FROM pg10_document_intents l WHERE l.document_id=d.id) END payments,
 CASE WHEN item IS NULL THEN '[]'::jsonb ELSE (SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY v.version),'[]') FROM pg10_versions v WHERE v.document_id=d.id) END history
 FROM pg64_document_catalog d WHERE d.workspace_id=w AND d.environment=e AND d.kind=res AND (item IS NULL OR d.id=item)
 AND (res<>'invoices' OR coalesce(d.body->>'source','')<>'automatic_checkout')
 AND (search IS NULL OR d.reference ILIKE '%'||search||'%' OR d.body->>'name' ILIKE '%'||search||'%')
 AND (after_id IS NULL OR (d.created_at,d.id)<(SELECT x.created_at,x.id FROM pg64_document_catalog x WHERE x.workspace_id=w AND x.environment=e AND x.kind=res AND x.id=after_id))
 ORDER BY d.created_at DESC,d.id DESC LIMIT 50) t;
 RETURN jsonb_build_object('items',result,'next_cursor',CASE WHEN jsonb_array_length(result)=50 THEN result->49->>'id' ELSE NULL END);
END $function$
$r$;
      BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.pg10_read(w uuid, e text, res text, item uuid, after_id uuid, search text) FROM PUBLIC'; EXCEPTION WHEN undefined_object THEN NULL; END;
      BEGIN EXECUTE 'GRANT ALL ON FUNCTION public.pg10_read(w uuid, e text, res text, item uuid, after_id uuid, search text) TO ekmivo_finance_reader'; EXCEPTION WHEN undefined_object THEN NULL; END;
    END IF;
  ELSIF realm='sandbox' THEN  -- production md5(prosrc)=4bf87a3a26a30aa4c50a2df1859059c7
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.pg10_read(uuid,text,text,uuid,uuid,text)') AND md5(prosrc)='4bf87a3a26a30aa4c50a2df1859059c7') THEN
      EXECUTE $r$CREATE OR REPLACE FUNCTION public.pg10_read(w uuid, e text, res text, item uuid, after_id uuid, search text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE result jsonb;
BEGIN IF res IN ('invoices','payment-links') THEN PERFORM payment_plan_require_feature(w,e,CASE WHEN res='invoices' THEN 'invoices' ELSE 'payment_links' END);END IF;
 PERFORM pg06_scope(w,e);IF after_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM pg64_document_catalog WHERE workspace_id=w AND environment=e AND kind=res AND id=after_id) THEN RAISE EXCEPTION 'invalid document cursor' USING ERRCODE='22023';END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') INTO result FROM (
 SELECT d.id,d.kind,d.reference,d.status,d.version,CASE WHEN item IS NOT NULL THEN d.body ELSE jsonb_strip_nulls(jsonb_build_object('source',d.body->'source','payment_count',d.body->'payment_count','verified_minor',d.body->'verified_minor','last_payment_at',d.body->'last_payment_at','name',d.body->'name','description',d.body->'description','email',d.body->'email','phone',d.body->'phone','due_at',d.body->'due_at','expires_at',d.body->'expires_at')) END body,d.amount_minor,d.customer_id,d.capability_key,CASE WHEN item IS NOT NULL THEN d.issued_snapshot END issued_snapshot,d.created_at,d.updated_at,
 CASE WHEN d.body->>'source'='automatic_checkout' THEN (SELECT coalesce(sum(a.amount_minor),0) FROM financial_allocations a WHERE a.workspace_id=w AND a.environment=e AND a.intent_id=d.id) ELSE coalesce((SELECT sum(a.amount_minor) FROM pg10_document_intents l JOIN financial_allocations a ON a.intent_id=l.intent_id AND a.workspace_id=l.workspace_id AND a.environment=l.environment WHERE l.document_id=d.id),0) END paid_minor,
 CASE WHEN item IS NULL THEN '[]'::jsonb WHEN d.body->>'source'='automatic_checkout' THEN jsonb_build_array(jsonb_build_object('intent_id',d.id,'state',pg05_intent_state(w,e,d.id))) ELSE (SELECT coalesce(jsonb_agg(jsonb_build_object('intent_id',l.intent_id,'state',pg05_intent_state(w,e,l.intent_id))), '[]') FROM pg10_document_intents l WHERE l.document_id=d.id) END payments,
 CASE WHEN item IS NULL THEN '[]'::jsonb ELSE (SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY v.version),'[]') FROM pg10_versions v WHERE v.document_id=d.id) END history
 FROM pg64_document_catalog d WHERE d.workspace_id=w AND d.environment=e AND d.kind=res AND (item IS NULL OR d.id=item)
 AND (res<>'invoices' OR coalesce(d.body->>'source','')<>'automatic_checkout')
 AND (search IS NULL OR d.reference ILIKE '%'||search||'%' OR d.body->>'name' ILIKE '%'||search||'%')
 AND (after_id IS NULL OR (d.created_at,d.id)<(SELECT x.created_at,x.id FROM pg64_document_catalog x WHERE x.workspace_id=w AND x.environment=e AND x.kind=res AND x.id=after_id))
 ORDER BY d.created_at DESC,d.id DESC LIMIT 50) t;
 RETURN jsonb_build_object('items',result,'next_cursor',CASE WHEN jsonb_array_length(result)=50 THEN result->49->>'id' ELSE NULL END);
END $function$
$r$;
      BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.pg10_read(w uuid, e text, res text, item uuid, after_id uuid, search text) FROM PUBLIC'; EXCEPTION WHEN undefined_object THEN NULL; END;
      BEGIN EXECUTE 'GRANT ALL ON FUNCTION public.pg10_read(w uuid, e text, res text, item uuid, after_id uuid, search text) TO ekmivo_finance_reader'; EXCEPTION WHEN undefined_object THEN NULL; END;
    END IF;
  END IF;
END
$m$;

-- pg110_public_workspace_accounts(uuid,text)
DO $m$
DECLARE realm text;
BEGIN
  SELECT environment INTO realm FROM financial_realm WHERE singleton;
  IF realm IS NULL OR realm NOT IN ('live','sandbox') THEN RAISE EXCEPTION '0255: financial_realm is not set'; END IF;
  IF realm='live' THEN  -- production md5(prosrc)=9f4bf753d017f57a5efaa90bdebcf1ee
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.pg110_public_workspace_accounts(uuid,text)') AND md5(prosrc)='9f4bf753d017f57a5efaa90bdebcf1ee') THEN
      EXECUTE $r$CREATE OR REPLACE FUNCTION public.pg110_public_workspace_accounts(w uuid, e text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'method',a.method,'suffix',a.display_suffix,'source_online',(EXISTS(SELECT 1 FROM pg06_devices d WHERE d.account_id=a.id AND d.revoked_at IS NULL AND d.permission_ok AND d.heartbeat_at>now()-interval '5 minutes') OR EXISTS(SELECT 1 FROM pg06_phones p WHERE p.workspace_id=a.workspace_id AND p.environment=a.environment AND p.claimed_at IS NOT NULL AND p.revoked_at IS NULL AND p.permission_ok AND p.heartbeat_at>now()-interval '20 minutes'))) ORDER BY a.method,a.created_at,a.id),'[]'::jsonb) FROM financial_receiving_accounts a JOIN pg06_account_configuration cfg ON cfg.account_id=a.id AND cfg.workspace_id=a.workspace_id AND cfg.environment=a.environment JOIN financial_workspace_registry reg ON reg.workspace_id=a.workspace_id AND reg.environment=a.environment AND reg.status='active' WHERE a.workspace_id=w AND a.environment=e AND e=(SELECT environment FROM financial_realm WHERE singleton) AND cfg.disabled_at IS NULL AND cfg.deleted_at IS NULL AND a.method IN ('bkash','nagad','rocket') $function$
$r$;
      BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.pg110_public_workspace_accounts(w uuid, e text) FROM PUBLIC'; EXCEPTION WHEN undefined_object THEN NULL; END;
      BEGIN EXECUTE 'GRANT ALL ON FUNCTION public.pg110_public_workspace_accounts(w uuid, e text) TO ekmivo_finance_reader'; EXCEPTION WHEN undefined_object THEN NULL; END;
    END IF;
  ELSIF realm='sandbox' THEN  -- production md5(prosrc)=9f4bf753d017f57a5efaa90bdebcf1ee
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.pg110_public_workspace_accounts(uuid,text)') AND md5(prosrc)='9f4bf753d017f57a5efaa90bdebcf1ee') THEN
      EXECUTE $r$CREATE OR REPLACE FUNCTION public.pg110_public_workspace_accounts(w uuid, e text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'method',a.method,'suffix',a.display_suffix,'source_online',(EXISTS(SELECT 1 FROM pg06_devices d WHERE d.account_id=a.id AND d.revoked_at IS NULL AND d.permission_ok AND d.heartbeat_at>now()-interval '5 minutes') OR EXISTS(SELECT 1 FROM pg06_phones p WHERE p.workspace_id=a.workspace_id AND p.environment=a.environment AND p.claimed_at IS NOT NULL AND p.revoked_at IS NULL AND p.permission_ok AND p.heartbeat_at>now()-interval '20 minutes'))) ORDER BY a.method,a.created_at,a.id),'[]'::jsonb) FROM financial_receiving_accounts a JOIN pg06_account_configuration cfg ON cfg.account_id=a.id AND cfg.workspace_id=a.workspace_id AND cfg.environment=a.environment JOIN financial_workspace_registry reg ON reg.workspace_id=a.workspace_id AND reg.environment=a.environment AND reg.status='active' WHERE a.workspace_id=w AND a.environment=e AND e=(SELECT environment FROM financial_realm WHERE singleton) AND cfg.disabled_at IS NULL AND cfg.deleted_at IS NULL AND a.method IN ('bkash','nagad','rocket') $function$
$r$;
      BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.pg110_public_workspace_accounts(w uuid, e text) FROM PUBLIC'; EXCEPTION WHEN undefined_object THEN NULL; END;
      BEGIN EXECUTE 'GRANT ALL ON FUNCTION public.pg110_public_workspace_accounts(w uuid, e text) TO ekmivo_finance_reader'; EXCEPTION WHEN undefined_object THEN NULL; END;
    END IF;
  END IF;
END
$m$;

-- pg98_checkout_accounts(text)
DO $m$
DECLARE realm text;
BEGIN
  SELECT environment INTO realm FROM financial_realm WHERE singleton;
  IF realm IS NULL OR realm NOT IN ('live','sandbox') THEN RAISE EXCEPTION '0255: financial_realm is not set'; END IF;
  IF realm='live' THEN  -- production md5(prosrc)=ed089d994f939f089479d70b02c14791
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.pg98_checkout_accounts(text)') AND md5(prosrc)='ed089d994f939f089479d70b02c14791') THEN
      EXECUTE $r$CREATE OR REPLACE FUNCTION public.pg98_checkout_accounts(cap text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ DECLARE w uuid;e text; BEGIN IF cap !~ '^[a-f0-9]{64}$' THEN RETURN '[]'::jsonb; END IF; SELECT i.workspace_id,i.environment INTO w,e FROM pg05_checkout_tokens t JOIN payment_intents i ON i.id=t.intent_id AND i.workspace_id=t.workspace_id AND i.environment=t.environment JOIN financial_workspace_registry reg ON reg.workspace_id=i.workspace_id AND reg.environment=i.environment AND reg.status='active' WHERE t.token_digest=cap AND t.environment=(SELECT environment FROM financial_realm WHERE singleton) AND pg05_intent_state(i.workspace_id,i.environment,i.id)='requires_payer'; IF w IS NULL THEN RETURN '[]'::jsonb; END IF; RETURN pg110_public_workspace_accounts(w,e); END $function$
$r$;
      BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.pg98_checkout_accounts(cap text) FROM PUBLIC'; EXCEPTION WHEN undefined_object THEN NULL; END;
      BEGIN EXECUTE 'GRANT ALL ON FUNCTION public.pg98_checkout_accounts(cap text) TO ekmivo_finance_reader'; EXCEPTION WHEN undefined_object THEN NULL; END;
    END IF;
  ELSIF realm='sandbox' THEN  -- production md5(prosrc)=ed089d994f939f089479d70b02c14791
    IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.pg98_checkout_accounts(text)') AND md5(prosrc)='ed089d994f939f089479d70b02c14791') THEN
      EXECUTE $r$CREATE OR REPLACE FUNCTION public.pg98_checkout_accounts(cap text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$ DECLARE w uuid;e text; BEGIN IF cap !~ '^[a-f0-9]{64}$' THEN RETURN '[]'::jsonb; END IF; SELECT i.workspace_id,i.environment INTO w,e FROM pg05_checkout_tokens t JOIN payment_intents i ON i.id=t.intent_id AND i.workspace_id=t.workspace_id AND i.environment=t.environment JOIN financial_workspace_registry reg ON reg.workspace_id=i.workspace_id AND reg.environment=i.environment AND reg.status='active' WHERE t.token_digest=cap AND t.environment=(SELECT environment FROM financial_realm WHERE singleton) AND pg05_intent_state(i.workspace_id,i.environment,i.id)='requires_payer'; IF w IS NULL THEN RETURN '[]'::jsonb; END IF; RETURN pg110_public_workspace_accounts(w,e); END $function$
$r$;
      BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.pg98_checkout_accounts(cap text) FROM PUBLIC'; EXCEPTION WHEN undefined_object THEN NULL; END;
      BEGIN EXECUTE 'GRANT ALL ON FUNCTION public.pg98_checkout_accounts(cap text) TO ekmivo_finance_reader'; EXCEPTION WHEN undefined_object THEN NULL; END;
    END IF;
  END IF;
END
$m$;
