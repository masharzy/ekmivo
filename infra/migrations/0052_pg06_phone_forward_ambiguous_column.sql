-- 0052: bugfix 42702. `phone_id` function argument and table column collided
-- in pg06_phone_forward's prior-event lookup; Postgres PL/pgSQL default
-- variable_conflict=error rejects every signed SMS receipt before persistence.
-- Explicitly qualify the table columns; preserve signature, claims and ACKs.
BEGIN;
CREATE OR REPLACE FUNCTION pg06_phone_forward(
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
 SELECT * INTO old FROM pg06_phone_forwarded AS forwarded WHERE forwarded.phone_id=p.id AND forwarded.event_id=event;
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
END $$;
COMMIT;
