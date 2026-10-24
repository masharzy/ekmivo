-- CONTROL only. Keep existing tariff revisions immutable; allow explicitly priced direct Qwen execution.
BEGIN;
DO $$BEGIN IF to_regclass('public.channel_platform_config') IS NULL OR to_regclass('public.financial_realm') IS NOT NULL THEN RAISE EXCEPTION '0213 requires CONTROL 0212';END IF;END $$;
CREATE OR REPLACE FUNCTION briofold_ai_tariff_publish(a uuid,k uuid,m text,expected uuid,b jsonb,why text) RETURNS uuid
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE old briofold_ai_tariff_versions%ROWTYPE;current_id uuid;next_revision integer;v uuid;n text;
BEGIN
 PERFORM briofold_ai_require_super_admin(a);
 IF k IS NULL OR m IS NULL OR m!~'^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$' OR why IS NULL OR length(trim(why)) NOT BETWEEN 10 AND 500
  OR jsonb_typeof(b) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(b))<>9
  OR (coalesce(b->>'provider','') NOT IN ('openrouter','qwen') OR ((m='qwen3.5-omni-flash' OR m LIKE 'qwen3.5-omni-flash-%') IS DISTINCT FROM (b->>'provider'='qwen'))) OR b->>'currency' IS DISTINCT FROM 'BDT' OR b->>'rounding' IS DISTINCT FROM 'ceil_minor'
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
COMMIT;
