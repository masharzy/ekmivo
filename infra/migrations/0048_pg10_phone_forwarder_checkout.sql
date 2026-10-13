-- PG10 route compatibility with PG06 0047 signed physical-phone SMS forwarder.
-- Preserve existing checkout contracts, payer/account/time matching, and 0047 receipt invariants.
-- The Android periodic heartbeat is 15 minutes: require a signed permission-enabled heartbeat
-- within 20 minutes (the legacy account-specific device path keeps its 5-minute threshold).
-- Go independently requires an approved live parser with an explicit receiving-number capture.
-- Migration is additive, realm-isolated, and must be applied in both financial databases.
BEGIN;
CREATE OR REPLACE FUNCTION public.pg10_checkout_view(cap text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE result jsonb;i payment_intents;a payment_attempts;cipher bytea;methods jsonb;online boolean;sources jsonb;BEGIN
 result:=pg05_checkout_view(cap);IF result IS NULL THEN RETURN NULL;END IF;
 SELECT p.* INTO i FROM pg05_checkout_tokens t JOIN payment_intents p ON p.id=t.intent_id AND p.workspace_id=t.workspace_id AND p.environment=t.environment WHERE t.token_digest=cap;
 SELECT * INTO a FROM payment_attempts WHERE intent_id=i.id AND workspace_id=i.workspace_id AND environment=i.environment ORDER BY issued_at DESC LIMIT 1;
 SELECT coalesce(jsonb_agg(DISTINCT to_jsonb(accounts.method)),'[]') INTO methods FROM financial_receiving_accounts accounts JOIN pg06_account_configuration c ON c.account_id=accounts.id
 WHERE accounts.workspace_id=i.workspace_id AND accounts.environment=i.environment AND c.disabled_at IS NULL AND (EXISTS(SELECT 1 FROM pg06_devices d WHERE d.account_id=accounts.id AND d.revoked_at IS NULL AND d.permission_ok AND d.heartbeat_at>now()-interval '5 minutes') OR EXISTS(SELECT 1 FROM pg06_phones phone WHERE phone.workspace_id=accounts.workspace_id
 AND phone.environment=accounts.environment AND phone.claimed_at IS NOT NULL
 AND phone.revoked_at IS NULL AND phone.permission_ok
 AND phone.heartbeat_at>now()-interval '20 minutes'));
 IF a.id IS NOT NULL THEN
 SELECT c.number_cipher INTO cipher FROM pg06_account_configuration c WHERE c.workspace_id=i.workspace_id AND c.environment=i.environment AND c.account_id=a.receiving_account_id;
 SELECT (EXISTS(SELECT 1 FROM pg06_devices d WHERE d.account_id=a.receiving_account_id AND d.revoked_at IS NULL AND d.permission_ok AND d.heartbeat_at>now()-interval '5 minutes') OR EXISTS(SELECT 1 FROM pg06_phones phone WHERE phone.workspace_id=i.workspace_id
 AND phone.environment=i.environment AND phone.claimed_at IS NOT NULL
 AND phone.revoked_at IS NULL AND phone.permission_ok
 AND phone.heartbeat_at>now()-interval '20 minutes')) INTO online;
 END IF;
 IF i.environment='live' THEN
 SELECT coalesce(jsonb_agg(s.doc),'[]'::jsonb) INTO sources FROM (
 SELECT jsonb_build_object('method',account.method,'source',device.source,'parser_id',device.parser_id) AS doc
 FROM pg06_devices device JOIN financial_receiving_accounts account ON account.id=device.account_id
 JOIN pg06_account_configuration config ON config.account_id=account.id
 WHERE account.workspace_id=i.workspace_id AND account.environment=i.environment AND config.disabled_at IS NULL
 AND device.revoked_at IS NULL AND device.permission_ok AND device.heartbeat_at>now()-interval '5 minutes'
 AND(a.id IS NULL OR account.id=a.receiving_account_id)
 UNION ALL
 SELECT DISTINCT jsonb_build_object('method',account.method,'source',
   CASE account.method WHEN 'bkash' THEN 'bKash' WHEN 'nagad' THEN 'NAGAD' ELSE 'Rocket' END,
   'forwarder',true) AS doc
 FROM financial_receiving_accounts account
 JOIN pg06_account_configuration config ON config.account_id=account.id
 WHERE account.workspace_id=i.workspace_id AND account.environment=i.environment
 AND config.disabled_at IS NULL AND account.method IN ('bkash','nagad','rocket')
 AND(a.id IS NULL OR account.id=a.receiving_account_id) AND EXISTS(SELECT 1 FROM pg06_phones phone WHERE phone.workspace_id=account.workspace_id
 AND phone.environment=account.environment AND phone.claimed_at IS NOT NULL
 AND phone.revoked_at IS NULL AND phone.permission_ok
 AND phone.heartbeat_at>now()-interval '20 minutes')
 ) s;
 result:=result||jsonb_build_object('methods',CASE WHEN a.id IS NULL THEN methods ELSE '[]'::jsonb END,'destination',NULL,'destination_cipher',CASE WHEN cipher IS NOT NULL THEN encode(cipher,'base64') END,'source_online',coalesce(online,false),'verification_available',cipher IS NOT NULL OR jsonb_array_length(methods)>0);
 result:=result||jsonb_build_object('sources',sources);
 END IF;
 result:=result||jsonb_build_object('verification',(SELECT jsonb_build_object('method',p.verification_method,'verified_at',p.verified_at,'original_transaction_at',o.original_transaction_at,'time_precision',o.time_precision,'amount_minor',p.verified_amount_minor,'currency',p.currency,'receipt_method',o.method,'receiving_suffix',account.display_suffix) FROM financial_payments p JOIN financial_receipt_observations o ON o.id=p.observation_id AND o.workspace_id=p.workspace_id AND o.environment=p.environment JOIN financial_receiving_accounts account ON account.id=o.receiving_account_id WHERE p.attempt_id=a.id AND p.workspace_id=i.workspace_id AND p.environment=i.environment));
 result:=result||jsonb_build_object('return_url',(SELECT d.issued_snapshot->>'return_url' FROM pg05_checkout_tokens t JOIN pg10_document_intents l ON l.intent_id=t.intent_id JOIN pg10_documents d ON d.id=l.document_id WHERE t.token_digest=cap AND pg10_return_allowed(d.workspace_id,d.environment,d.issued_snapshot->>'return_url'))); RETURN result;
END $function$;
CREATE OR REPLACE FUNCTION public.pg10_lock_route(p_digest text, p_payer_hmac text, p_suffix text, p_method text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE i payment_intents%ROWTYPE; attempt payment_attempts%ROWTYPE; account_id uuid;
BEGIN
 IF p_digest !~ '^[a-f0-9]{64}$' OR p_payer_hmac !~ '^[a-f0-9]{64}$'
  OR p_suffix !~ '^[0-9]{4}$' OR p_method NOT IN ('bkash','nagad','rocket') THEN
  RAISE EXCEPTION 'invalid payer or route' USING ERRCODE='22023';
 END IF;
 SELECT intent.* INTO i FROM pg05_checkout_tokens t JOIN payment_intents intent
  ON intent.id=t.intent_id AND intent.workspace_id=t.workspace_id AND intent.environment=t.environment
 JOIN financial_workspace_registry registry ON registry.workspace_id=intent.workspace_id
  AND registry.environment=intent.environment AND registry.status='active'
 WHERE t.token_digest=p_digest AND intent.environment=(SELECT environment FROM financial_realm WHERE singleton)
 FOR UPDATE OF intent;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF pg05_intent_state(i.workspace_id,i.environment,i.id)
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
 AND NOT EXISTS(SELECT 1 FROM pg06_account_configuration c WHERE c.account_id=financial_receiving_accounts.id AND c.disabled_at IS NOT NULL)
 AND (EXISTS(SELECT 1 FROM pg06_devices d WHERE d.account_id=financial_receiving_accounts.id AND d.revoked_at IS NULL AND d.permission_ok AND d.heartbeat_at>now()-interval '5 minutes')
 OR EXISTS(SELECT 1 FROM pg06_phones phone WHERE phone.workspace_id=financial_receiving_accounts.workspace_id
 AND phone.environment=financial_receiving_accounts.environment AND phone.claimed_at IS NOT NULL
 AND phone.revoked_at IS NULL AND phone.permission_ok
 AND phone.heartbeat_at>now()-interval '20 minutes')
 OR i.environment='sandbox' AND display_suffix='0000' AND NOT EXISTS(SELECT 1 FROM pg06_account_configuration c WHERE c.workspace_id=i.workspace_id AND c.environment=i.environment AND EXISTS(SELECT 1 FROM financial_receiving_accounts actual WHERE actual.id=c.account_id AND actual.method=p_method)))
 ORDER BY CASE WHEN display_suffix='0000' THEN 1 ELSE 0 END,created_at,id LIMIT 1;
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
END; $function$;
COMMIT;
