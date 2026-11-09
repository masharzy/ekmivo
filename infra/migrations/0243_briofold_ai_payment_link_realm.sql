-- Financial realms only. Reuse the merchant intent readiness and idempotency checks.
BEGIN;
CREATE OR REPLACE FUNCTION briofold_payment_intent_insert(w uuid,e text,ref text,amount bigint,expiry timestamptz,k text,cap text,h text)
RETURNS jsonb LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
DECLARE old financial_idempotency; i payment_intents; result jsonb;
BEGIN
 PERFORM pg06_scope(w,e);
 IF amount NOT BETWEEN 1 AND 100000000000 OR length(ref) NOT BETWEEN 1 AND 128 OR length(k) NOT BETWEEN 16 AND 128
  OR h !~ '^[a-f0-9]{64}$' OR cap !~ '^[a-f0-9]{64}$' THEN
  RAISE EXCEPTION 'invalid request' USING ERRCODE='22023';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(w::text||e||':pg10.intent:'||k,0));
 SELECT * INTO old FROM financial_idempotency WHERE workspace_id=w AND environment=e AND operation='pg10.intent' AND idempotency_key=k;
 IF FOUND THEN
  IF old.request_hash<>h THEN RAISE EXCEPTION 'idempotency conflict' USING ERRCODE='23505';END IF;
  RETURN old.result_body;
 END IF;
 IF e='live' AND NOT EXISTS(SELECT 1 FROM financial_receiving_accounts a JOIN pg06_account_configuration c ON c.account_id=a.id WHERE a.workspace_id=w AND a.environment=e AND c.disabled_at IS NULL AND (EXISTS(SELECT 1 FROM pg06_devices d WHERE d.account_id=a.id AND d.revoked_at IS NULL AND d.permission_ok AND d.heartbeat_at>now()-interval '5 minutes')
 OR EXISTS(SELECT 1 FROM pg06_phones p
  WHERE p.workspace_id=a.workspace_id AND p.environment=a.environment
   AND p.claimed_at IS NOT NULL AND p.revoked_at IS NULL
   AND p.permission_ok AND p.heartbeat_at>now()-interval '20 minutes'))) THEN RAISE EXCEPTION 'live source unavailable' USING ERRCODE='23514';END IF;
 INSERT INTO payment_intents(workspace_id,environment,merchant_reference,amount_minor,expires_at)
 VALUES(w,e,ref,amount,expiry) RETURNING * INTO i;
 INSERT INTO pg05_checkout_tokens(workspace_id,environment,intent_id,token_digest,creation_key) VALUES(w,e,i.id,cap,k);
 INSERT INTO pg05_intent_events(workspace_id,environment,intent_id,event_type) VALUES(w,e,i.id,'created');
 result:=jsonb_build_object('id',i.id,'merchant_reference',ref,'amount_minor',amount,'currency','BDT','environment',e,
  'creation_key',k,'expires_at',i.expires_at,'state','requires_payer');
 INSERT INTO financial_idempotency(workspace_id,environment,operation,idempotency_key,request_hash,result_code,result_body)
 VALUES(w,e,'pg10.intent',k,h,201,result);
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION pg10_intent(w uuid,e text,ref text,amount bigint,minutes integer,k text,cap text,h text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM pg06_scope(w,e);
 IF minutes NOT BETWEEN 5 AND 60 THEN RAISE EXCEPTION 'invalid request' USING ERRCODE='22023';END IF;
 RETURN briofold_payment_intent_insert(w,e,ref,amount,now()+make_interval(mins=>minutes),k,cap,h);
END $$;

CREATE OR REPLACE FUNCTION pg243_ai_payment_link(w uuid,e text,order_id uuid,amount bigint,expiry timestamptz,cap text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE k text:='ai-order:'||order_id; h text;
BEGIN
 IF e<>'live' OR expiry<=now() OR expiry>now()+interval '7 days' OR order_id IS NULL THEN
  RAISE EXCEPTION 'Invalid order checkout expiry' USING ERRCODE='22023';
 END IF;
 h:=encode(digest(jsonb_build_array(order_id,amount,extract(epoch FROM expiry))::text,'sha256'),'hex');
 RETURN briofold_payment_intent_insert(w,e,k,amount,expiry,k,cap,h);
END $$;
REVOKE ALL ON FUNCTION briofold_payment_intent_insert(uuid,text,text,bigint,timestamptz,text,text,text) FROM PUBLIC,ekmivo_finance_reader;
REVOKE ALL ON FUNCTION pg243_ai_payment_link(uuid,text,uuid,bigint,timestamptz,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pg243_ai_payment_link(uuid,text,uuid,bigint,timestamptz,text) TO ekmivo_finance_reader;
DO $$DECLARE g text;BEGIN
 FOREACH g IN ARRAY ARRAY['ekmivo_financial_runtime','ekmivo_financial_projection'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=g) THEN
   EXECUTE format('GRANT EXECUTE ON FUNCTION pg243_ai_payment_link(uuid,text,uuid,bigint,timestamptz,text) TO %I',g);
  END IF;
 END LOOP;
END $$;
COMMIT;
