-- Audited customer-credit waivers are not provider usage/payment proof.
BEGIN;
DO $$BEGIN
 IF to_regclass('public.briofold_ai_executions') IS NULL OR to_regclass('public.financial_realm') IS NOT NULL
 THEN RAISE EXCEPTION 'AI exceptions require control execution meter';END IF;
END $$;
ALTER TABLE briofold_ai_executions DROP CONSTRAINT briofold_ai_executions_state_check;
ALTER TABLE briofold_ai_executions ADD CONSTRAINT briofold_ai_executions_state_check CHECK(state IN('running','unknown','completed','released','waived')),
 ADD COLUMN waiver_key uuid UNIQUE,ADD COLUMN waived_by uuid REFERENCES app_users(id),
 ADD COLUMN waived_at timestamptz,ADD COLUMN waiver_reason text CHECK(length(waiver_reason) BETWEEN 20 AND 500),
 ADD CONSTRAINT briofold_ai_waiver_consistent CHECK(state<>'waived' OR (waiver_key IS NOT NULL AND waived_by IS NOT NULL AND waived_at IS NOT NULL AND waiver_reason IS NOT NULL AND charged_minor IS NOT NULL AND charged_minor=0));
CREATE OR REPLACE FUNCTION briofold_ai_request_complete(w uuid,k text,ref text,input_tokens bigint,cached_tokens bigint,output_tokens bigint,cipher bytea) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE execution briofold_ai_executions%ROWTYPE;terms jsonb;cost bigint;usage_value jsonb;reservation_key text;
BEGIN
 IF ref IS NULL OR length(ref) NOT BETWEEN 1 AND 200 OR input_tokens IS NULL OR cached_tokens IS NULL OR output_tokens IS NULL
  OR input_tokens<0 OR cached_tokens<0 OR cached_tokens>input_tokens OR output_tokens<0 OR cipher IS NULL OR octet_length(cipher) NOT BETWEEN 28 AND 131072
 THEN RAISE EXCEPTION 'invalid authoritative AI result' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('briofold:ai:'||w::text,0));
 SELECT * INTO execution FROM briofold_ai_executions WHERE workspace_id=w AND request_key=k FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'AI request missing' USING ERRCODE='P0002';END IF;
 SELECT v.terms INTO terms FROM briofold_ai_tariff_versions v WHERE v.id=execution.tariff_id;
 IF input_tokens>(terms->>'max_input_tokens')::bigint OR output_tokens>(terms->>'max_output_tokens')::bigint
 THEN RAISE EXCEPTION 'AI usage exceeds reservation bounds' USING ERRCODE='22023';END IF;
 usage_value:=jsonb_build_object('input',input_tokens,'cached',cached_tokens,'output',output_tokens);
 IF execution.state='completed' THEN
  IF execution.usage<>usage_value OR execution.provider_ref<>ref THEN RAISE EXCEPTION 'AI settlement conflict' USING ERRCODE='23505';END IF;
  RETURN briofold_ai_request_view(w,k,false);
 END IF;
 IF execution.state IN('released','waived') OR (execution.provider_ref IS NOT NULL AND execution.provider_ref<>ref)
 THEN RAISE EXCEPTION 'AI result conflicts with previous outcome' USING ERRCODE='23505';END IF;
 cost:=ceil(((input_tokens-cached_tokens)::numeric*(terms->>'input_minor_per_million')::numeric+
  cached_tokens::numeric*(terms->>'cached_input_minor_per_million')::numeric+
  output_tokens::numeric*(terms->>'output_minor_per_million')::numeric)/1000000)::bigint;
 SELECT request_key INTO reservation_key FROM briofold_ai_reservations WHERE id=execution.reservation_id;
 PERFORM briofold_ai_wallet_settle_authoritative(w,execution.actor_id,reservation_key,cost);
 UPDATE briofold_ai_executions SET state='completed',usage=usage_value,charged_minor=cost,provider_ref=ref,response_cipher=cipher,updated_at=now()
 WHERE workspace_id=w AND request_key=k;
 RETURN briofold_ai_request_view(w,k,false);
END $$;
CREATE OR REPLACE FUNCTION briofold_ai_request_fail(w uuid,k text,ref text,rejected boolean) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE execution briofold_ai_executions%ROWTYPE;reservation_key text;
BEGIN
 IF rejected IS NULL OR (ref IS NOT NULL AND length(ref)>200) OR (rejected AND coalesce(ref,'')<>'')
 THEN RAISE EXCEPTION 'invalid AI failure outcome' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('briofold:ai:'||w::text,0));
 SELECT * INTO execution FROM briofold_ai_executions WHERE workspace_id=w AND request_key=k FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'AI request missing' USING ERRCODE='P0002';END IF;
 IF execution.state IN('completed','released','waived') THEN RETURN;END IF;
 -- An uncertain call can only be settled from actual usage, never later relabelled
 -- as a definitely unexecuted call by a retry.
 IF rejected AND execution.state='unknown' THEN RAISE EXCEPTION 'AI result still uncertain' USING ERRCODE='23505';END IF;
 IF rejected THEN
  SELECT request_key INTO reservation_key FROM briofold_ai_reservations WHERE id=execution.reservation_id;
  PERFORM briofold_ai_wallet_settle_authoritative(w,execution.actor_id,reservation_key,0);
 END IF;
 UPDATE briofold_ai_executions SET state=CASE WHEN rejected THEN 'released' ELSE 'unknown' END,
  provider_ref=coalesce(provider_ref,nullif(ref,'')),updated_at=now() WHERE workspace_id=w AND request_key=k;
END $$;
CREATE FUNCTION briofold_ai_admin_waive(a uuid,w uuid,k text,op uuid,why text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE execution briofold_ai_executions%ROWTYPE;reservation_key text;
BEGIN
 PERFORM briofold_ai_require_super_admin(a);
 IF op IS NULL OR why IS NULL OR length(trim(why)) NOT BETWEEN 20 AND 500
 THEN RAISE EXCEPTION 'waiver reason required' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('briofold:ai:'||w::text,0));
 SELECT * INTO execution FROM briofold_ai_executions WHERE workspace_id=w AND request_key=k FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'AI request missing' USING ERRCODE='P0002';END IF;
 IF execution.state='waived' THEN
  IF execution.waiver_key<>op OR execution.waived_by<>a OR execution.waiver_reason<>why
  THEN RAISE EXCEPTION 'waiver key conflict' USING ERRCODE='23505';END IF;
  RETURN jsonb_build_object('released',true,'replayed',true);
 END IF;
 IF execution.state<>'unknown' AND NOT(execution.state='running' AND execution.created_at<now()-interval '5 minutes')
 THEN RAISE EXCEPTION 'request is not an unresolved exception' USING ERRCODE='23505';END IF;
 SELECT request_key INTO reservation_key FROM briofold_ai_reservations WHERE id=execution.reservation_id;
 PERFORM briofold_ai_wallet_settle_authoritative(w,a,reservation_key,0);
 UPDATE briofold_ai_executions SET state='waived',charged_minor=0,waiver_key=op,waived_by=a,waived_at=now(),waiver_reason=why,updated_at=now()
 WHERE workspace_id=w AND request_key=k;
 INSERT INTO platform_admin_audit(actor_id,action,description)
 VALUES(a,'ai_request.credits_waived','workspace='||w::text||'; request='||k||' | '||why);
 RETURN jsonb_build_object('released',true,'replayed',false);
END $$;
REVOKE ALL ON FUNCTION briofold_ai_admin_waive(uuid,uuid,text,uuid,text) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
COMMIT;
