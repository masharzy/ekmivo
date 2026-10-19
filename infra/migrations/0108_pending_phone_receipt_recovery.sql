BEGIN;
-- Only restricted financial workers may revisit durable phone evidence.
CREATE FUNCTION pg108_pending_phone_receipts() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(x),'[]'::jsonb) FROM (
 SELECT f.id,f.workspace_id,f.environment,f.phone_id,f.event_id,f.sender,encode(f.ciphertext,'base64') AS cipher,r.entitlement_version AS version
 FROM pg06_phone_forwarded f JOIN pg06_phones p ON p.id=f.phone_id AND p.workspace_id=f.workspace_id AND p.environment=f.environment
 JOIN financial_workspace_registry r ON r.workspace_id=f.workspace_id AND r.environment=f.environment
 WHERE f.environment=(SELECT environment FROM financial_realm WHERE singleton) AND r.status='active' AND p.revoked_at IS NULL
 AND f.observation_id IS NULL AND f.reason='verification_pending' AND f.received_at>now()-interval '1 hour'
 ORDER BY f.received_at DESC LIMIT 10
 ) x
$$;
CREATE FUNCTION pg108_recover_phone_receipt(fid uuid,expected_version bigint,payer text,amount bigint,original_time timestamptz,precision_name text,reference_identity text,method_name text,parser_ver integer,payer_contact bytea)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
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
END $$;
REVOKE ALL ON FUNCTION pg108_pending_phone_receipts(),pg108_recover_phone_receipt(uuid,bigint,text,bigint,timestamptz,text,text,text,integer,bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pg108_pending_phone_receipts(),pg108_recover_phone_receipt(uuid,bigint,text,bigint,timestamptz,text,text,text,integer,bytea) TO ekmivo_financial_worker;
COMMIT;
