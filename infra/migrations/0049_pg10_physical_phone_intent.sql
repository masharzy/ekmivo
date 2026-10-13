-- 0049 PG10 live intent creation: accept signed physical SMS forwarder (0047).
-- pg10_checkout_view/pg10_lock_route were already updated in 0048.
-- Preserve all business idempotency, active-scope authorization and financial invariants.
-- Eligibility is necessary to CREATE a request, not sufficient to collect funds:
-- public checkout remains gated on an approved receiver-aware production SMS parser.
BEGIN;
DO $preflight$
DECLARE realm text;
BEGIN
 SELECT environment INTO realm FROM financial_realm WHERE singleton;
 IF realm NOT IN ('sandbox','live') OR to_regclass('public.pg06_phone_forwarded') IS NULL
 OR to_regprocedure('public.pg10_intent(uuid,text,text,bigint,integer,text,text,text)') IS NULL
 OR to_regprocedure('public.pg10_checkout_view(text)') IS NULL
 OR position('20 minutes' IN pg_get_functiondef('public.pg10_checkout_view(text)'::regprocedure))=0
 THEN RAISE EXCEPTION '0049 requires financial sandbox/live with 0047/0048 applied';
 END IF;
END $preflight$;
CREATE OR REPLACE FUNCTION public.pg10_intent(w uuid, e text, ref text, amount bigint, minutes integer, k text, cap text, h text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE old financial_idempotency; i payment_intents; result jsonb;
BEGIN
 PERFORM pg06_scope(w,e);
 IF amount NOT BETWEEN 1 AND 100000000000 OR minutes NOT BETWEEN 5 AND 60 OR length(ref) NOT BETWEEN 1 AND 128 OR length(k) NOT BETWEEN 16 AND 128 OR h !~ '^[a-f0-9]{64}$' OR cap !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'invalid request' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(w::text||e||':pg10.intent:'||k,0));
 SELECT * INTO old FROM financial_idempotency WHERE workspace_id=w AND environment=e AND operation='pg10.intent' AND idempotency_key=k;
 IF FOUND THEN IF old.request_hash<>h THEN RAISE EXCEPTION 'idempotency conflict' USING ERRCODE='23505';END IF;RETURN old.result_body;END IF;
 IF e='live' AND NOT EXISTS(SELECT 1 FROM financial_receiving_accounts a JOIN pg06_account_configuration c ON c.account_id=a.id WHERE a.workspace_id=w AND a.environment=e AND c.disabled_at IS NULL AND (EXISTS(SELECT 1 FROM pg06_devices d WHERE d.account_id=a.id AND d.revoked_at IS NULL AND d.permission_ok AND d.heartbeat_at>now()-interval '5 minutes')
 OR EXISTS(SELECT 1 FROM pg06_phones p
  WHERE p.workspace_id=a.workspace_id AND p.environment=a.environment
   AND p.claimed_at IS NOT NULL AND p.revoked_at IS NULL
   AND p.permission_ok AND p.heartbeat_at>now()-interval '20 minutes'))) THEN RAISE EXCEPTION 'live source unavailable' USING ERRCODE='23514';END IF;
 INSERT INTO payment_intents(workspace_id,environment,merchant_reference,amount_minor,expires_at) VALUES(w,e,ref,amount,now()+make_interval(mins=>minutes)) RETURNING * INTO i;
 INSERT INTO pg05_checkout_tokens(workspace_id,environment,intent_id,token_digest,creation_key) VALUES(w,e,i.id,cap,k);
 INSERT INTO pg05_intent_events(workspace_id,environment,intent_id,event_type) VALUES(w,e,i.id,'created');
 result:=jsonb_build_object('id',i.id,'merchant_reference',ref,'amount_minor',amount,'currency','BDT','environment',e,'creation_key',k,'expires_at',i.expires_at,'state','requires_payer');
 INSERT INTO financial_idempotency(workspace_id,environment,operation,idempotency_key,request_hash,result_code,result_body) VALUES(w,e,'pg10.intent',k,h,201,result);RETURN result;
END $function$;
COMMIT;
