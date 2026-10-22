-- Additive CONTROL-only Briofold Phase 10 drafts/appointments.
-- A planned broadcast is NOT a queued or sent message. Provider delivery and
-- consent verification need separate, approved transports; no worker consumes
-- these rows and no sender contact information is stored here.
BEGIN;
DO $$BEGIN
 IF to_regclass('public.briofold_customers') IS NULL OR to_regclass('public.commerce_orders') IS NULL
   OR to_regclass('public.financial_realm') IS NOT NULL THEN
   RAISE EXCEPTION '0180 requires Briofold Phase 7/8 CONTROL schema';
 END IF;
END $$;

-- New single-Store bindings override legacy membership cookies. Historic
-- unbound multi-member accounts remain readable until an owner-approved
-- transition; we never delete or reassign their financial/CRM records.
CREATE FUNCTION briofold_growth_store_actor(w uuid,a uuid,cap text) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE bound uuid;
BEGIN
 PERFORM briofold_customer_actor(w,a,cap);
 IF to_regclass('public.platform_primary_stores') IS NOT NULL THEN
  EXECUTE 'SELECT workspace_id FROM public.platform_primary_stores WHERE user_id=$1 LIMIT 1' INTO bound USING a;
  IF bound IS NOT NULL AND bound<>w THEN RAISE EXCEPTION 'Primary Store mismatch' USING ERRCODE='42501';END IF;
 END IF;
END $$;

CREATE TABLE briofold_campaign_drafts(
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES workspaces(id),
 environment text NOT NULL CHECK(environment IN ('live','sandbox')),
 kind text NOT NULL CHECK(kind IN ('broadcast','post')),
 title text NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 120),
 body text NOT NULL CHECK(length(trim(body)) BETWEEN 1 AND 4000),
 audience text NOT NULL CHECK(audience IN ('all','qualified','won')),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','planned','archived')),
 planned_at timestamptz,time_zone text NOT NULL DEFAULT 'Asia/Dhaka',
 revision bigint NOT NULL DEFAULT 1,created_by uuid NOT NULL REFERENCES app_users(id),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,environment,id),
 CHECK((status='planned')=(planned_at IS NOT NULL))
);
CREATE INDEX briofold_campaign_drafts_list ON briofold_campaign_drafts(workspace_id,environment,updated_at DESC,id);

CREATE TABLE briofold_booking_resources(
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES workspaces(id),
 environment text NOT NULL CHECK(environment IN ('live','sandbox')),
 title text NOT NULL CHECK(length(trim(title)) BETWEEN 1 AND 120),
 active boolean NOT NULL DEFAULT true,revision bigint NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,environment,id)
);
CREATE TABLE briofold_bookings(
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL,environment text NOT NULL,
 resource_id uuid NOT NULL,customer_id uuid,
 starts_at timestamptz NOT NULL,ends_at timestamptz NOT NULL,
 time_zone text NOT NULL,summary text NOT NULL CHECK(length(trim(summary)) BETWEEN 1 AND 200),
 status text NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','confirmed','cancelled','completed')),
 revision bigint NOT NULL DEFAULT 1,created_by uuid NOT NULL REFERENCES app_users(id),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,environment,id),
 FOREIGN KEY(workspace_id,environment,resource_id) REFERENCES briofold_booking_resources(workspace_id,environment,id),
 FOREIGN KEY(workspace_id,environment,customer_id) REFERENCES briofold_customers(workspace_id,environment,id),
 CHECK(ends_at>starts_at AND ends_at<=starts_at+interval '8 hours')
);
CREATE INDEX briofold_bookings_calendar ON briofold_bookings(workspace_id,environment,resource_id,starts_at,id) WHERE status IN ('requested','confirmed');
CREATE TABLE briofold_growth_commands(
 workspace_id uuid NOT NULL,actor_id uuid NOT NULL,operation_key uuid NOT NULL,
 fingerprint text NOT NULL,result jsonb NOT NULL,
 PRIMARY KEY(workspace_id,actor_id,operation_key)
);
DO $$DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['briofold_campaign_drafts','briofold_booking_resources','briofold_bookings','briofold_growth_commands'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  -- SECURITY DEFINER runs as this deployment operator, while API/runtime
  -- roles get no direct table access. FORCE RLS still needs an owner policy.
  EXECUTE format('CREATE POLICY %I ON %I TO %I USING (true) WITH CHECK (true)',t||'_operator',t,current_user);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection',t);
 END LOOP;
END $$;

CREATE FUNCTION briofold_growth_operations_read(w uuid,e text,a uuid,k text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE permitted boolean;items jsonb;resources jsonb;appointments jsonb;candidates bigint;
BEGIN
 PERFORM briofold_growth_store_actor(w,a,'read');
 IF e IS NULL OR e NOT IN ('live','sandbox') OR k IS NULL OR k NOT IN ('broadcast','post','booking') THEN RAISE EXCEPTION 'Invalid growth scope' USING ERRCODE='22023';END IF;
 SELECT m.role IN ('owner','admin') INTO permitted FROM workspace_members m WHERE m.workspace_id=w AND m.user_id=a;
 IF k IN ('broadcast','post') THEN
  SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO items FROM (
   SELECT id,kind,title,body,audience,status,planned_at,time_zone,revision,created_at,updated_at
   FROM briofold_campaign_drafts WHERE workspace_id=w AND environment=e AND kind=k
   ORDER BY updated_at DESC,id LIMIT 100
  ) x;
  -- These are candidates for *future* provider-consent checks, never approved
  -- recipients. A verified email identity is NOT marketing consent proof.
  SELECT count(*) INTO candidates FROM briofold_customers c
   WHERE c.workspace_id=w AND c.environment=e AND c.deleted_at IS NULL AND c.merged_into IS NULL
    AND c.preferences->>'marketing'='opted-in' AND NOT (c.preferences->>'do_not_contact')::boolean
    AND EXISTS(SELECT 1 FROM briofold_customer_proofs p WHERE p.customer_id=c.id AND p.kind='email'
     AND p.value=c.email AND p.revoked_at IS NULL);
  RETURN jsonb_build_object('items',items,'can_manage',permitted,'potential_audience',candidates,
   'send_ready',false,'provider_status','not-configured','note','Draft/planning only; no recipient delivery');
 END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO resources FROM (
  SELECT id,title,active,revision FROM briofold_booking_resources
  WHERE workspace_id=w AND environment=e ORDER BY title,id LIMIT 100
 ) x;
 SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO appointments FROM (
  SELECT id,resource_id,customer_id,starts_at,ends_at,time_zone,summary,status,revision,created_at
  FROM briofold_bookings WHERE workspace_id=w AND environment=e
  ORDER BY starts_at DESC,id LIMIT 100
 ) x;
 RETURN jsonb_build_object('resources',resources,'items',appointments,'can_manage',permitted,'provider_status','internal-only');
END $$;

CREATE FUNCTION briofold_growth_operations_write(w uuid,e text,a uuid,k uuid,act text,b jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE prior briofold_growth_commands;fp text;cid uuid;rid uuid;rev bigint;start_time timestamptz;end_time timestamptz;target briofold_bookings;campaign briofold_campaign_drafts;res jsonb;
BEGIN
 PERFORM briofold_growth_store_actor(w,a,'contact');
 IF e IS NULL OR e NOT IN ('live','sandbox') OR k IS NULL OR jsonb_typeof(b) IS DISTINCT FROM 'object'
  OR pg_column_size(b)>16384 OR act IS NULL OR act NOT IN ('draft-create','draft-update','resource-create','resource-update','booking-create','booking-status') THEN
   RAISE EXCEPTION 'Invalid growth command' USING ERRCODE='22023';END IF;
 fp:=encode(sha256(convert_to(e||act||b::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended('growth:'||w::text||':'||e,0));
 SELECT * INTO prior FROM briofold_growth_commands WHERE workspace_id=w AND actor_id=a AND operation_key=k;
 IF prior.operation_key IS NOT NULL THEN
  IF prior.fingerprint<>fp THEN RAISE EXCEPTION 'Operation key reused' USING ERRCODE='23505';END IF;
  RETURN prior.result;
 END IF;
 IF act='draft-create' THEN
  IF b->>'kind' NOT IN ('broadcast','post') OR b->>'audience' NOT IN ('all','qualified','won')
   OR length(trim(coalesce(b->>'title',''))) NOT BETWEEN 1 AND 120
   OR length(trim(coalesce(b->>'body',''))) NOT BETWEEN 1 AND 4000
   OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=b->>'time_zone') THEN
   RAISE EXCEPTION 'Invalid campaign draft' USING ERRCODE='22023';END IF;
  cid:=k;
  INSERT INTO briofold_campaign_drafts(id,workspace_id,environment,kind,title,body,audience,time_zone,created_by)
   VALUES(cid,w,e,b->>'kind',trim(b->>'title'),trim(b->>'body'),b->>'audience',b->>'time_zone',a);
 ELSIF act='draft-update' THEN
  cid:=(b->>'id')::uuid;
  SELECT * INTO campaign FROM briofold_campaign_drafts WHERE id=cid AND workspace_id=w AND environment=e FOR UPDATE;
  IF campaign.id IS NULL OR (b->>'revision')::bigint IS DISTINCT FROM campaign.revision
   OR b->>'status' NOT IN ('draft','planned','archived') OR campaign.status='archived'
   OR length(trim(coalesce(b->>'title',''))) NOT BETWEEN 1 AND 120
   OR length(trim(coalesce(b->>'body',''))) NOT BETWEEN 1 AND 4000
   OR b->>'audience' NOT IN ('all','qualified','won')
   OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=b->>'time_zone') THEN
   RAISE EXCEPTION 'Draft changed or invalid' USING ERRCODE='40001';END IF;
  IF b->>'status'='planned' THEN
   start_time:=(b->>'planned_at')::timestamptz;
   IF start_time IS NULL OR start_time<now() OR start_time>now()+interval '2 years' THEN RAISE EXCEPTION 'Invalid editorial date' USING ERRCODE='22023';END IF;
  END IF;
  UPDATE briofold_campaign_drafts SET title=trim(b->>'title'),body=trim(b->>'body'),audience=b->>'audience',
   time_zone=b->>'time_zone',status=b->>'status',planned_at=start_time,revision=revision+1,updated_at=now()
   WHERE id=cid RETURNING revision INTO rev;
 ELSIF act='resource-create' THEN
  IF length(trim(coalesce(b->>'title',''))) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'Invalid resource' USING ERRCODE='22023';END IF;
  IF (SELECT count(*) FROM briofold_booking_resources WHERE workspace_id=w AND environment=e)>=100 THEN RAISE EXCEPTION 'Resource limit' USING ERRCODE='54000';END IF;
  cid:=k;
  INSERT INTO briofold_booking_resources(id,workspace_id,environment,title) VALUES(cid,w,e,trim(b->>'title'));
 ELSIF act='resource-update' THEN
  cid:=(b->>'id')::uuid;
  IF length(trim(coalesce(b->>'title',''))) NOT BETWEEN 1 AND 120 OR jsonb_typeof(b->'active') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Invalid resource' USING ERRCODE='22023';END IF;
  UPDATE briofold_booking_resources SET title=trim(b->>'title'),active=(b->>'active')::boolean,revision=revision+1
   WHERE id=cid AND workspace_id=w AND environment=e AND revision=(b->>'revision')::bigint RETURNING revision INTO rev;
  IF rev IS NULL THEN RAISE EXCEPTION 'Resource changed' USING ERRCODE='40001';END IF;
 ELSIF act='booking-create' THEN
  cid:=k;rid:=(b->>'resource_id')::uuid;start_time:=(b->>'starts_at')::timestamptz;end_time:=(b->>'ends_at')::timestamptz;
  IF start_time IS NULL OR end_time IS NULL OR start_time<now() OR start_time>now()+interval '2 years'
   OR end_time<=start_time OR end_time>start_time+interval '8 hours'
   OR length(trim(coalesce(b->>'summary',''))) NOT BETWEEN 1 AND 200
   OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=b->>'time_zone')
   OR NOT EXISTS(SELECT 1 FROM briofold_booking_resources WHERE id=rid AND workspace_id=w AND environment=e AND active)
   OR (nullif(b->>'customer_id','') IS NOT NULL AND NOT EXISTS(SELECT 1 FROM briofold_customers c
       WHERE c.id=(b->>'customer_id')::uuid AND c.workspace_id=w AND c.environment=e AND c.deleted_at IS NULL AND c.merged_into IS NULL)) THEN
   RAISE EXCEPTION 'Booking invalid or resource unavailable' USING ERRCODE='22023';END IF;
  IF EXISTS(SELECT 1 FROM briofold_bookings x WHERE x.workspace_id=w AND x.environment=e AND x.resource_id=rid
   AND x.status IN ('requested','confirmed') AND x.starts_at<end_time AND x.ends_at>start_time) THEN
   RAISE EXCEPTION 'Booking slot conflict' USING ERRCODE='40001';END IF;
  INSERT INTO briofold_bookings(id,workspace_id,environment,resource_id,customer_id,starts_at,ends_at,time_zone,summary,created_by)
   VALUES(cid,w,e,rid,nullif(b->>'customer_id','')::uuid,start_time,end_time,b->>'time_zone',trim(b->>'summary'),a);
 ELSIF act='booking-status' THEN
  cid:=(b->>'id')::uuid;
  SELECT * INTO target FROM briofold_bookings WHERE id=cid AND workspace_id=w AND environment=e FOR UPDATE;
  IF target.id IS NULL OR (b->>'revision')::bigint IS DISTINCT FROM target.revision
   OR NOT ((target.status='requested' AND b->>'status' IN ('confirmed','cancelled'))
    OR (target.status='confirmed' AND b->>'status' IN ('completed','cancelled'))) THEN
   RAISE EXCEPTION 'Booking changed or invalid transition' USING ERRCODE='40001';END IF;
  UPDATE briofold_bookings SET status=b->>'status',revision=revision+1,updated_at=now() WHERE id=cid RETURNING revision INTO rev;
 END IF;
 res:=jsonb_build_object('id',cid,'revision',coalesce(rev,1),'status',CASE WHEN act='booking-create' THEN 'requested' WHEN act='draft-create' THEN 'draft' ELSE b->>'status' END);
 INSERT INTO briofold_growth_commands VALUES(w,a,k,fp,res);
 RETURN res;
END $$;

REVOKE ALL ON FUNCTION briofold_growth_operations_read(uuid,text,uuid,text) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
REVOKE ALL ON FUNCTION briofold_growth_operations_write(uuid,text,uuid,uuid,text,jsonb) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
REVOKE ALL ON FUNCTION briofold_growth_store_actor(uuid,uuid,text) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION briofold_growth_operations_read(uuid,text,uuid,text) TO ekmivo_financial_runtime,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION briofold_growth_operations_write(uuid,text,uuid,uuid,text,jsonb) TO ekmivo_financial_runtime,ekmivo_financial_projection;
COMMIT;
