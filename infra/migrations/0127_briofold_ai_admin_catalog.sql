-- Control only. A single prepaid journal serves merchant, runtime and Admin.
BEGIN;
DO $$BEGIN
 IF to_regclass('public.briofold_ai_wallets') IS NULL OR to_regclass('public.financial_realm') IS NOT NULL
 THEN RAISE EXCEPTION 'AI admin catalog requires control wallet';END IF;
 -- Legacy credits had no defined money conversion. Never silently convert them.
 IF to_regclass('public.platform_ai_credit_balances') IS NOT NULL THEN
  IF EXISTS(SELECT 1 FROM platform_ai_credit_balances WHERE balance<>0)
  THEN RAISE EXCEPTION 'Legacy AI credit conversion requires an explicit policy';END IF;
 END IF;
END $$;
ALTER TABLE briofold_ai_credit_journal ADD COLUMN actor_id uuid REFERENCES app_users(id),
 ADD COLUMN reason text CHECK(length(reason) BETWEEN 10 AND 500);
CREATE FUNCTION briofold_ai_require_super_admin(a uuid) RETURNS void
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM platform_administrators p JOIN app_users u ON u.id=p.user_id
  WHERE p.user_id=a AND p.role='super_admin' AND u.disabled_at IS NULL)
 THEN RAISE EXCEPTION 'super admin required' USING ERRCODE='42501';END IF;
END $$;
CREATE FUNCTION briofold_ai_admin_adjust(a uuid,w uuid,k uuid,delta_minor bigint,why text) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE prior briofold_ai_credit_journal%ROWTYPE; wallet briofold_ai_wallets%ROWTYPE;
BEGIN
 PERFORM briofold_ai_require_super_admin(a);
 IF k IS NULL OR delta_minor IS NULL OR delta_minor=0 OR abs(delta_minor::numeric)>100000000
  OR why IS NULL OR length(trim(why)) NOT BETWEEN 10 AND 500
 THEN RAISE EXCEPTION 'invalid credit adjustment' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('briofold:ai:'||w::text,0));
 SELECT * INTO prior FROM briofold_ai_credit_journal WHERE workspace_id=w AND operation_key='admin:'||k::text;
 IF FOUND THEN
  IF prior.actor_id<>a OR prior.available_delta_minor<>delta_minor OR prior.reason<>why
  THEN RAISE EXCEPTION 'adjustment key conflict' USING ERRCODE='23505';END IF;
  RETURN jsonb_build_object('balance_minor',prior.available_after_minor,'replayed',true);
 END IF;
 INSERT INTO briofold_ai_wallets(workspace_id) VALUES(w) ON CONFLICT DO NOTHING;
 SELECT * INTO wallet FROM briofold_ai_wallets WHERE workspace_id=w FOR UPDATE;
 IF wallet.available_minor::numeric+delta_minor<0 OR wallet.available_minor::numeric+delta_minor>9007199254740991
 THEN RAISE EXCEPTION 'insufficient or unsupported balance' USING ERRCODE='22023';END IF;
 UPDATE briofold_ai_wallets SET available_minor=available_minor+delta_minor,updated_at=now()
  WHERE workspace_id=w RETURNING * INTO wallet;
 INSERT INTO briofold_ai_credit_journal(workspace_id,operation_key,kind,available_delta_minor,reserved_delta_minor,
  available_after_minor,reserved_after_minor,actor_id,reason)
 VALUES(w,'admin:'||k::text,'correction',delta_minor,0,wallet.available_minor,wallet.reserved_minor,a,why);
 INSERT INTO platform_admin_audit(actor_id,action,description)
 VALUES(a,'ai_credits.adjusted','workspace='||w::text||'; minor='||delta_minor::text||' | '||why);
 RETURN jsonb_build_object('balance_minor',wallet.available_minor,'replayed',false);
END $$;
CREATE TABLE briofold_ai_tariff_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), model text NOT NULL CHECK(model~'^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$'),
 revision integer NOT NULL CHECK(revision>0), terms jsonb NOT NULL, created_by uuid NOT NULL REFERENCES app_users(id),
 reason text NOT NULL CHECK(length(reason) BETWEEN 10 AND 500), operation_key uuid NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(), UNIQUE(model,revision), UNIQUE(id,model)
);
CREATE TABLE briofold_ai_tariff_catalog (
 model text PRIMARY KEY, current_version uuid,
 FOREIGN KEY(current_version,model) REFERENCES briofold_ai_tariff_versions(id,model)
);
CREATE TRIGGER briofold_ai_tariff_no_mutation BEFORE UPDATE OR DELETE ON briofold_ai_tariff_versions
 FOR EACH ROW EXECUTE FUNCTION briofold_ai_journal_immutable();
DO $$DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['briofold_ai_tariff_versions','briofold_ai_tariff_catalog'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY %I ON %I TO %I USING(true) WITH CHECK(true)',t||'_owner',t,current_user);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection',t);
 END LOOP;
END $$;
CREATE FUNCTION briofold_ai_tariff_publish(a uuid,k uuid,m text,expected uuid,b jsonb,why text) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE old briofold_ai_tariff_versions%ROWTYPE;current_id uuid;next_revision integer;v uuid;n text;
BEGIN
 PERFORM briofold_ai_require_super_admin(a);
 IF k IS NULL OR m IS NULL OR m!~'^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$' OR why IS NULL OR length(trim(why)) NOT BETWEEN 10 AND 500
  OR jsonb_typeof(b) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(b))<>9
  OR b->>'provider' IS DISTINCT FROM 'openrouter' OR b->>'currency' IS DISTINCT FROM 'BDT' OR b->>'rounding' IS DISTINCT FROM 'ceil_minor'
 THEN RAISE EXCEPTION 'invalid AI tariff' USING ERRCODE='22023';END IF;
 FOREACH n IN ARRAY ARRAY['input_minor_per_million','cached_input_minor_per_million','output_minor_per_million','max_input_tokens','max_output_tokens','max_request_minor'] LOOP
  IF jsonb_typeof(b->n) IS DISTINCT FROM 'number' OR (b->>n)::numeric<>trunc((b->>n)::numeric)
   OR (b->>n)::numeric<0 OR (b->>n)::numeric>100000000
  THEN RAISE EXCEPTION 'invalid tariff number' USING ERRCODE='22023';END IF;
 END LOOP;
 IF (b->>'cached_input_minor_per_million')::numeric>(b->>'input_minor_per_million')::numeric
  OR (b->>'input_minor_per_million')::numeric+(b->>'output_minor_per_million')::numeric=0
  OR (b->>'max_input_tokens')::numeric=0 OR (b->>'max_output_tokens')::numeric=0 OR (b->>'max_request_minor')::numeric=0
  OR ceil(((b->>'max_input_tokens')::numeric*(b->>'input_minor_per_million')::numeric+
   (b->>'max_output_tokens')::numeric*(b->>'output_minor_per_million')::numeric)/1000000)>(b->>'max_request_minor')::numeric
 THEN RAISE EXCEPTION 'invalid tariff reservation bound' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('briofold:tariff:'||m,0));
 SELECT * INTO old FROM briofold_ai_tariff_versions WHERE operation_key=k;
 IF FOUND THEN
  IF old.model<>m OR old.terms<>b OR old.created_by<>a OR old.reason<>why
  THEN RAISE EXCEPTION 'tariff key conflict' USING ERRCODE='23505';END IF;
  RETURN old.id;
 END IF;
 SELECT current_version INTO current_id FROM briofold_ai_tariff_catalog WHERE model=m;
 IF current_id IS DISTINCT FROM expected THEN RAISE EXCEPTION 'tariff changed; refresh' USING ERRCODE='40001';END IF;
 SELECT coalesce(max(revision),0)+1 INTO next_revision FROM briofold_ai_tariff_versions WHERE model=m;
 INSERT INTO briofold_ai_tariff_versions(model,revision,terms,created_by,reason,operation_key)
  VALUES(m,next_revision,b,a,why,k) RETURNING id INTO v;
 INSERT INTO briofold_ai_tariff_catalog(model,current_version) VALUES(m,v)
  ON CONFLICT(model) DO UPDATE SET current_version=EXCLUDED.current_version;
 INSERT INTO platform_admin_audit(actor_id,action,description)
  VALUES(a,'ai_tariff.published','version='||v::text||'; '||m||' v'||next_revision::text||' | '||why);
 RETURN v;
END $$;
CREATE FUNCTION briofold_ai_tariff_current(m text) RETURNS jsonb
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('id',v.id,'model',v.model,'revision',v.revision,'terms',v.terms)
 FROM briofold_ai_tariff_catalog c JOIN briofold_ai_tariff_versions v ON v.id=c.current_version WHERE c.model=m
$$;
REVOKE ALL ON FUNCTION briofold_ai_require_super_admin(uuid),briofold_ai_admin_adjust(uuid,uuid,uuid,bigint,text),
 briofold_ai_tariff_publish(uuid,uuid,text,uuid,jsonb,text),briofold_ai_tariff_current(text) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION briofold_ai_tariff_current(text) TO ekmivo_financial_runtime;
COMMIT;
