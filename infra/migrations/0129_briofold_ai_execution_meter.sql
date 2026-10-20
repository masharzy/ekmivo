-- Control only. Claim/reserve precedes paid execution; one immutable tariff per request.
BEGIN;
DO $$BEGIN
 IF to_regclass('public.briofold_ai_tariff_versions') IS NULL OR to_regclass('public.financial_realm') IS NOT NULL
 THEN RAISE EXCEPTION 'AI execution meter requires control wallet/catalog';END IF;
END $$;
CREATE OR REPLACE FUNCTION briofold_ai_require_super_admin(a uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM 1 FROM platform_administrators p JOIN app_users u ON u.id=p.user_id
 WHERE p.user_id=a AND p.role='super_admin' AND u.disabled_at IS NULL FOR SHARE OF p,u;
 IF NOT FOUND THEN RAISE EXCEPTION 'super admin required' USING ERRCODE='42501';END IF;
END $$;
CREATE FUNCTION briofold_ai_wallet_settle_authoritative(w uuid,a uuid,k text,actual_cost_minor bigint) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE reservation briofold_ai_reservations%ROWTYPE;release_amount bigint; wallet briofold_ai_wallets%ROWTYPE;
BEGIN
 IF k IS NULL OR actual_cost_minor IS NULL OR length(k) NOT BETWEEN 8 AND 128 OR actual_cost_minor<0 THEN
  RAISE EXCEPTION 'invalid settlement' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('briofold:ai:'||w::text,0));
 SELECT * INTO reservation FROM briofold_ai_reservations
   WHERE workspace_id=w AND request_key=k FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'reservation missing' USING ERRCODE='22023';END IF;
 IF actual_cost_minor>reservation.reserved_minor THEN
  RAISE EXCEPTION 'cost exceeds reservation' USING ERRCODE='22023';END IF;
 IF reservation.state<>'reserved' THEN
  IF reservation.actual_minor<>actual_cost_minor THEN
   RAISE EXCEPTION 'settlement conflict' USING ERRCODE='23505';END IF;
  SELECT * INTO wallet FROM briofold_ai_wallets WHERE workspace_id=w;
  RETURN jsonb_build_object('state',reservation.state,'available_minor',wallet.available_minor,'reserved_minor',wallet.reserved_minor);
 END IF;
 release_amount:=reservation.reserved_minor-actual_cost_minor;
 UPDATE briofold_ai_wallets SET available_minor=available_minor+release_amount,
  reserved_minor=reserved_minor-reservation.reserved_minor,updated_at=now()
  WHERE workspace_id=w RETURNING * INTO wallet;
 UPDATE briofold_ai_reservations SET actual_minor=actual_cost_minor,
  state=CASE WHEN actual_cost_minor=0 THEN 'released' ELSE 'completed' END,
  settled_at=now() WHERE id=reservation.id;
 INSERT INTO briofold_ai_credit_journal(workspace_id,operation_key,kind,
  available_delta_minor,reserved_delta_minor,available_after_minor,reserved_after_minor,reference_id)
 VALUES(w,'settle:'||k,CASE WHEN actual_cost_minor=0 THEN 'release' ELSE 'settle' END,
  release_amount,-reservation.reserved_minor,wallet.available_minor,wallet.reserved_minor,reservation.id);
 RETURN jsonb_build_object('state',CASE WHEN actual_cost_minor=0 THEN 'released' ELSE 'completed' END,
  'available_minor',wallet.available_minor,'reserved_minor',wallet.reserved_minor);
END $$;

CREATE OR REPLACE FUNCTION briofold_ai_wallet_settle(w uuid,a uuid,k text,actual_cost_minor bigint) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM pg13_actor(w,a,true);
 RETURN briofold_ai_wallet_settle_authoritative(w,a,k,actual_cost_minor);
END $$;
REVOKE ALL ON FUNCTION briofold_ai_wallet_settle_authoritative(uuid,uuid,text,bigint) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
ALTER TABLE briofold_ai_reservations ADD CONSTRAINT briofold_ai_reservation_scope UNIQUE(workspace_id,id);
CREATE TABLE briofold_ai_executions (
 workspace_id uuid NOT NULL REFERENCES workspaces(id),request_key text NOT NULL CHECK(length(request_key) BETWEEN 16 AND 128),
 actor_id uuid NOT NULL REFERENCES app_users(id),fingerprint text NOT NULL CHECK(fingerprint~'^[a-f0-9]{64}$'),
 tariff_id uuid NOT NULL REFERENCES briofold_ai_tariff_versions(id),reservation_id uuid NOT NULL UNIQUE,
 thread_id uuid,thread_ai_version bigint,state text NOT NULL DEFAULT 'running' CHECK(state IN('running','unknown','completed','released')),
 provider_ref text CHECK(length(provider_ref) BETWEEN 1 AND 200),usage jsonb,charged_minor bigint CHECK(charged_minor>=0),response_cipher bytea CHECK(octet_length(response_cipher) BETWEEN 28 AND 131072),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,request_key),FOREIGN KEY(workspace_id,reservation_id) REFERENCES briofold_ai_reservations(workspace_id,id),
 FOREIGN KEY(workspace_id,thread_id) REFERENCES inbox_threads(workspace_id,id),
 CHECK(state<>'completed' OR (usage IS NOT NULL AND charged_minor IS NOT NULL AND response_cipher IS NOT NULL AND provider_ref IS NOT NULL))
);
CREATE UNIQUE INDEX briofold_ai_execution_paid_generation ON briofold_ai_executions(workspace_id,provider_ref) WHERE state='completed' AND charged_minor>0;
CREATE INDEX briofold_ai_execution_pending ON briofold_ai_executions(workspace_id,thread_id,created_at) WHERE state IN('running','unknown');
ALTER TABLE briofold_ai_executions ENABLE ROW LEVEL SECURITY;
ALTER TABLE briofold_ai_executions FORCE ROW LEVEL SECURITY;
DO $$BEGIN
 EXECUTE format('CREATE POLICY briofold_ai_execution_owner ON briofold_ai_executions TO %I USING(true) WITH CHECK(true)',current_user);
END $$;
REVOKE ALL ON briofold_ai_executions FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
CREATE FUNCTION briofold_ai_request_view(w uuid,k text,fresh boolean) RETURNS jsonb
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('fresh',fresh,'state',e.state,'charged_minor',e.charged_minor,'response_cipher',encode(e.response_cipher,'hex'),
 'tariff',jsonb_build_object('id',v.id,'model',v.model,'terms',v.terms))
 FROM briofold_ai_executions e JOIN briofold_ai_tariff_versions v ON v.id=e.tariff_id
 WHERE e.workspace_id=w AND e.request_key=k
$$;
CREATE FUNCTION briofold_ai_request_begin(w uuid,a uuid,k text,m text,fp text,input_bound bigint,thread uuid DEFAULT NULL) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE previous briofold_ai_executions%ROWTYPE;tariff briofold_ai_tariff_versions%ROWTYPE;cost bigint;rid uuid;av bigint;
BEGIN
 -- Serialize permission revocation with this acceptance transaction.
 PERFORM 1 FROM workspace_members member JOIN app_users u ON u.id=member.user_id
 WHERE member.workspace_id=w AND member.user_id=a AND member.role IN('owner','admin') AND u.disabled_at IS NULL FOR SHARE OF member,u;
 IF NOT FOUND OR pg13_capability_override(w,a,'workspace:settings') IS FALSE
 THEN RAISE EXCEPTION 'AI execution denied' USING ERRCODE='42501';END IF;
 IF k IS NULL OR k!~'^[A-Za-z0-9_.:-]{16,128}$' OR fp IS NULL OR fp!~'^[a-f0-9]{64}$' OR input_bound IS NULL OR input_bound NOT BETWEEN 1 AND 65536
 THEN RAISE EXCEPTION 'invalid AI request' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('briofold:ai:'||w::text,0));
 SELECT * INTO previous FROM briofold_ai_executions WHERE workspace_id=w AND request_key=k;
 IF FOUND THEN
  IF previous.fingerprint<>fp OR previous.actor_id<>a OR previous.thread_id IS DISTINCT FROM thread
   OR NOT EXISTS(SELECT 1 FROM briofold_ai_tariff_versions WHERE id=previous.tariff_id AND model=m)
  THEN RAISE EXCEPTION 'AI request key conflict' USING ERRCODE='23505';END IF;
  RETURN briofold_ai_request_view(w,k,false);
 END IF;
 IF (SELECT count(*) FROM briofold_ai_executions WHERE workspace_id=w AND state IN('running','unknown'))>=20
 THEN RAISE EXCEPTION 'AI concurrency limit reached' USING ERRCODE='54000';END IF;
 IF thread IS NOT NULL THEN
  SELECT t.ai_version INTO av FROM inbox_threads t JOIN inbox_connections c ON c.id=t.connection_id
  WHERE t.workspace_id=w AND t.id=thread AND t.ai_enabled AND c.enabled AND c.environment='live' FOR SHARE OF t,c;
  IF av IS NULL THEN RAISE EXCEPTION 'AI conversation is not enabled' USING ERRCODE='42501';END IF;
  IF EXISTS(SELECT 1 FROM briofold_ai_executions WHERE workspace_id=w AND thread_id=thread AND state IN('running','unknown'))
  THEN RAISE EXCEPTION 'AI conversation already running' USING ERRCODE='54000';END IF;
 END IF;
 SELECT v.* INTO tariff FROM briofold_ai_tariff_catalog c JOIN briofold_ai_tariff_versions v ON v.id=c.current_version
 WHERE c.model=m FOR SHARE OF c;
 IF tariff.id IS NULL THEN RAISE EXCEPTION 'AI model is not configured' USING ERRCODE='P0002';END IF;
 IF input_bound>(tariff.terms->>'max_input_tokens')::bigint THEN RAISE EXCEPTION 'AI input exceeds request bound' USING ERRCODE='22023';END IF;
 cost:=ceil(((tariff.terms->>'max_input_tokens')::numeric*(tariff.terms->>'input_minor_per_million')::numeric+
  (tariff.terms->>'max_output_tokens')::numeric*(tariff.terms->>'output_minor_per_million')::numeric)/1000000)::bigint;
 rid:=briofold_ai_wallet_reserve(w,a,'run:'||encode(digest(k,'sha256'),'hex'),cost);
 INSERT INTO briofold_ai_executions(workspace_id,request_key,actor_id,fingerprint,tariff_id,reservation_id,thread_id,thread_ai_version)
  VALUES(w,k,a,fp,tariff.id,rid,thread,av);
 RETURN briofold_ai_request_view(w,k,true);
END $$;
CREATE FUNCTION briofold_ai_request_complete(w uuid,k text,ref text,input_tokens bigint,cached_tokens bigint,output_tokens bigint,cipher bytea) RETURNS jsonb
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
 IF execution.state='released' OR (execution.provider_ref IS NOT NULL AND execution.provider_ref<>ref)
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
CREATE FUNCTION briofold_ai_request_fail(w uuid,k text,ref text,rejected boolean) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE execution briofold_ai_executions%ROWTYPE;reservation_key text;
BEGIN
 IF rejected IS NULL OR (ref IS NOT NULL AND length(ref)>200) OR (rejected AND coalesce(ref,'')<>'')
 THEN RAISE EXCEPTION 'invalid AI failure outcome' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('briofold:ai:'||w::text,0));
 SELECT * INTO execution FROM briofold_ai_executions WHERE workspace_id=w AND request_key=k FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'AI request missing' USING ERRCODE='P0002';END IF;
 IF execution.state IN('completed','released') THEN RETURN;END IF;
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
REVOKE ALL ON FUNCTION briofold_ai_request_view(uuid,text,boolean),briofold_ai_request_begin(uuid,uuid,text,text,text,bigint,uuid),
 briofold_ai_request_complete(uuid,text,text,bigint,bigint,bigint,bytea),briofold_ai_request_fail(uuid,text,text,boolean)
 FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION briofold_ai_request_begin(uuid,uuid,text,text,text,bigint,uuid),
 briofold_ai_request_complete(uuid,text,text,bigint,bigint,bigint,bytea),briofold_ai_request_fail(uuid,text,text,boolean) TO ekmivo_financial_runtime;
COMMIT;
