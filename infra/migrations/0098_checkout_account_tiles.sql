-- 0098: Apply independently to BOTH isolated financial realms after 0095.
-- Public checkout advertises only active/online receiving account IDs, never phone numbers.
BEGIN;
DO $$ BEGIN
 IF to_regclass('public.financial_realm') IS NULL OR to_regclass('public.pg06_account_configuration') IS NULL
 OR to_regprocedure('public.pg10_lock_route(text,text,text,text)') IS NULL
 OR NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public' AND table_name='pg06_account_configuration' AND column_name='deleted_at')
 THEN RAISE EXCEPTION '0098 requires financial realm and migrations through 0095'; END IF;
END $$;
CREATE FUNCTION pg98_checkout_accounts(cap text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE items jsonb;
BEGIN
 IF cap !~ '^[a-f0-9]{64}$' THEN RETURN '[]'::jsonb; END IF;
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'method',a.method,'suffix',a.display_suffix)
   ORDER BY a.method,a.created_at,a.id),'[]'::jsonb) INTO items
 FROM pg05_checkout_tokens t JOIN payment_intents i ON i.id=t.intent_id AND i.workspace_id=t.workspace_id AND i.environment=t.environment
 JOIN financial_workspace_registry reg ON reg.workspace_id=i.workspace_id AND reg.environment=i.environment AND reg.status='active'
 JOIN financial_receiving_accounts a ON a.workspace_id=i.workspace_id AND a.environment=i.environment
 JOIN pg06_account_configuration cfg ON cfg.account_id=a.id AND cfg.workspace_id=a.workspace_id AND cfg.environment=a.environment
 WHERE t.token_digest=cap AND t.environment=(SELECT environment FROM financial_realm WHERE singleton)
 AND pg05_intent_state(i.workspace_id,i.environment,i.id)='requires_payer'
 AND cfg.disabled_at IS NULL AND cfg.deleted_at IS NULL AND a.method IN ('bkash','nagad','rocket')
 AND (EXISTS(SELECT 1 FROM pg06_devices dev WHERE dev.account_id=a.id AND dev.revoked_at IS NULL AND dev.permission_ok AND dev.heartbeat_at>now()-interval '5 minutes')
 OR EXISTS(SELECT 1 FROM pg06_phones phone WHERE phone.workspace_id=i.workspace_id AND phone.environment=i.environment AND phone.claimed_at IS NOT NULL
 AND phone.revoked_at IS NULL AND phone.permission_ok AND phone.heartbeat_at>now()-interval '20 minutes'));
 RETURN items;
END $$;

-- Explicit source account binding. No binding of phone/device to receiving account is introduced.
CREATE FUNCTION pg98_lock_account(p_digest text,p_payer_hmac text,p_suffix text,p_method text,p_account uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE i payment_intents%ROWTYPE; attempt payment_attempts%ROWTYPE; account_id uuid;
BEGIN
 IF p_digest !~ '^[a-f0-9]{64}$' OR p_payer_hmac !~ '^[a-f0-9]{64}$' OR p_suffix !~ '^[0-9]{4}$'
 OR p_method NOT IN ('bkash','nagad','rocket') OR p_account IS NULL THEN
 RAISE EXCEPTION 'invalid payer or receiving account' USING ERRCODE='22023';END IF;
 SELECT intent.* INTO i FROM pg05_checkout_tokens t JOIN payment_intents intent
 ON intent.id=t.intent_id AND intent.workspace_id=t.workspace_id AND intent.environment=t.environment
 JOIN financial_workspace_registry reg ON reg.workspace_id=intent.workspace_id AND reg.environment=intent.environment AND reg.status='active'
 WHERE t.token_digest=p_digest AND intent.environment=(SELECT environment FROM financial_realm WHERE singleton) FOR UPDATE OF intent;
 IF NOT FOUND THEN RETURN NULL; END IF;
 IF pg05_intent_state(i.workspace_id,i.environment,i.id) NOT IN ('requires_payer','awaiting_payment')
 THEN RAISE EXCEPTION 'checkout expired, cancelled or unavailable' USING ERRCODE='23514';END IF;
 SELECT * INTO attempt FROM payment_attempts WHERE workspace_id=i.workspace_id AND environment=i.environment AND intent_id=i.id LIMIT 1;
 IF FOUND THEN
  IF attempt.payer_hmac<>p_payer_hmac OR attempt.method<>p_method OR attempt.receiving_account_id<>p_account
  THEN RAISE EXCEPTION 'payer or receiving account already locked' USING ERRCODE='23505';END IF;
  RETURN pg10_checkout_view(p_digest);
 END IF;
 SELECT a.id INTO account_id FROM financial_receiving_accounts a JOIN pg06_account_configuration cfg
 ON cfg.account_id=a.id AND cfg.workspace_id=a.workspace_id AND cfg.environment=a.environment
 WHERE a.id=p_account AND a.workspace_id=i.workspace_id AND a.environment=i.environment AND a.method=p_method
 AND cfg.disabled_at IS NULL AND cfg.deleted_at IS NULL
 AND (EXISTS(SELECT 1 FROM pg06_devices d WHERE d.account_id=a.id AND d.revoked_at IS NULL AND d.permission_ok AND d.heartbeat_at>now()-interval '5 minutes')
 OR EXISTS(SELECT 1 FROM pg06_phones phone WHERE phone.workspace_id=i.workspace_id AND phone.environment=i.environment
 AND phone.claimed_at IS NOT NULL AND phone.revoked_at IS NULL AND phone.permission_ok AND phone.heartbeat_at>now()-interval '20 minutes'));
 IF account_id IS NULL THEN RAISE EXCEPTION 'receiving account unavailable' USING ERRCODE='23514';END IF;
 INSERT INTO payment_attempts(workspace_id,environment,intent_id,receiving_account_id,payer_hmac,payer_suffix,amount_minor,method,window_start,window_end,policy_version,issued_at)
 VALUES(i.workspace_id,i.environment,i.id,account_id,p_payer_hmac,p_suffix,i.amount_minor,p_method,now(),i.expires_at,1,now());
 INSERT INTO pg05_intent_events(workspace_id,environment,intent_id,event_type) VALUES(i.workspace_id,i.environment,i.id,'payer_locked');
 RETURN pg10_checkout_view(p_digest);
END $$;
REVOKE ALL ON FUNCTION pg98_checkout_accounts(text),pg98_lock_account(text,text,text,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pg98_checkout_accounts(text),pg98_lock_account(text,text,text,text,uuid) TO ekmivo_finance_reader;
COMMIT;
