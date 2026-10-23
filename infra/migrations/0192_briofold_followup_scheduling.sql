-- CONTROL follow-ups: persisted offer reminders, skip and timezone quiet windows.
-- These remain internal team work; this migration creates no dispatch transport.
BEGIN;
DO $$ BEGIN
 IF to_regclass('public.briofold_customer_followups') IS NULL
 OR to_regclass('public.financial_realm') IS NOT NULL THEN
  RAISE EXCEPTION '0192 requires CONTROL CRM';
 END IF;
END $$;
ALTER TABLE briofold_customer_followups ADD COLUMN requested_due_at timestamptz;
UPDATE briofold_customer_followups SET requested_due_at=due_at;
ALTER TABLE briofold_customer_followups ALTER COLUMN requested_due_at SET NOT NULL;
ALTER TABLE briofold_customer_followups ADD COLUMN kind text NOT NULL DEFAULT 'reminder' CHECK(kind IN ('reminder','offer'));
ALTER TABLE briofold_customer_followups ADD COLUMN quiet_start time;
ALTER TABLE briofold_customer_followups ADD COLUMN quiet_end time;
ALTER TABLE briofold_customer_followups ADD CONSTRAINT briofold_followup_quiet_pair
 CHECK((quiet_start IS NULL AND quiet_end IS NULL) OR (quiet_start IS NOT NULL AND quiet_end IS NOT NULL AND quiet_start<>quiet_end));
ALTER TABLE briofold_customer_followups DROP CONSTRAINT briofold_customer_followups_status_check;
ALTER TABLE briofold_customer_followups ADD CONSTRAINT briofold_customer_followups_status_check CHECK(status IN ('scheduled','done','cancelled','skipped'));
CREATE FUNCTION briofold_followup_due(requested timestamptz,zone text,quiet_start time,quiet_end time)
RETURNS timestamptz LANGUAGE plpgsql STABLE SET search_path=public,pg_temp AS $$
DECLARE local_due timestamp;effective timestamp;clock time;
BEGIN
 IF requested IS NULL OR NOT isfinite(requested) OR zone IS NULL
 OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=zone)
 OR (quiet_start IS NULL)<>(quiet_end IS NULL) OR quiet_start=quiet_end THEN
  RAISE EXCEPTION 'Invalid follow-up schedule' USING ERRCODE='22023';
 END IF;
 IF quiet_start IS NULL THEN RETURN requested;END IF;
 local_due:=requested AT TIME ZONE zone;clock:=local_due::time;effective:=local_due;
 IF quiet_start<quiet_end AND clock>=quiet_start AND clock<quiet_end THEN
  effective:=local_due::date+quiet_end;
 ELSIF quiet_start>quiet_end THEN
  IF clock>=quiet_start THEN effective:=(local_due::date+1)+quiet_end;
  ELSIF clock<quiet_end THEN effective:=local_due::date+quiet_end;END IF;
 END IF;
 RETURN greatest(requested,effective AT TIME ZONE zone);
END $$;
REVOKE ALL ON FUNCTION briofold_followup_due(timestamptz,text,time,time) FROM PUBLIC;

CREATE OR REPLACE FUNCTION briofold_customers_write(w uuid,e text,a uuid,k uuid,act text,b jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE c briofold_customers;other briofold_customers;old briofold_customer_commands;fp text;res jsonb;cid uuid:=(b->>'id')::uuid;target uuid;rev bigint;fid uuid;BEGIN
 PERFORM briofold_customer_actor(w,a,'manage');
 IF e IS NULL OR e NOT IN ('live','sandbox') OR k IS NULL OR jsonb_typeof(b) IS DISTINCT FROM 'object' OR pg_column_size(b)>16384 OR act IS NULL OR act NOT IN ('save','merge','unlink','dispute','followup','followup-status','delete','link') THEN RAISE EXCEPTION 'Invalid customer command' USING ERRCODE='22023';END IF;
 fp:=encode(sha256(convert_to(e||act||b::text,'UTF8')),'hex');PERFORM pg_advisory_xact_lock(hashtextextended('crm:'||w::text,0));
 SELECT * INTO old FROM briofold_customer_commands WHERE workspace_id=w AND actor_id=a AND operation_key=k;IF old.operation_key IS NOT NULL THEN IF old.fingerprint<>fp THEN RAISE EXCEPTION 'Operation key conflict' USING ERRCODE='23505';END IF;RETURN old.result;END IF;
 IF act='save' AND cid IS NULL THEN INSERT INTO briofold_customers(workspace_id,environment,name) VALUES(w,e,'Customer') RETURNING id INTO cid;ELSE SELECT * INTO c FROM briofold_customers WHERE id=cid AND workspace_id=w AND environment=e FOR UPDATE;IF c.id IS NULL OR c.deleted_at IS NOT NULL OR c.merged_into IS NOT NULL THEN RAISE EXCEPTION 'Customer unavailable' USING ERRCODE='42501';END IF;IF (b->>'revision')::bigint IS DISTINCT FROM c.revision THEN RAISE EXCEPTION 'Customer changed; reload' USING ERRCODE='40001';END IF;END IF;
 IF act='save' THEN
  IF length(trim(coalesce(b->>'name','')))=0 OR length(b->>'name')>160 OR length(coalesce(b->>'notes',''))>4000 OR length(coalesce(b->>'reason',''))>500 OR jsonb_typeof(b->'tags') IS DISTINCT FROM 'array' OR jsonb_array_length(b->'tags')>20 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(b->'tags') x WHERE length(x)>40 OR trim(x)='') OR coalesce(b->>'stage','new') NOT IN ('new','contacted','qualified','proposal','won','lost') OR coalesce(b->>'temperature','warm') NOT IN ('hot','warm','cold') THEN RAISE EXCEPTION 'Invalid profile' USING ERRCODE='22023';END IF;
  IF coalesce(b->>'assignee','')<>'' AND NOT EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id=w AND user_id=(b->>'assignee')::uuid) THEN RAISE EXCEPTION 'Invalid assignee' USING ERRCODE='42501';END IF;
  IF b ? 'email' OR b ? 'phone' OR b ? 'notes' OR b ? 'reason' OR b ? 'preferences' THEN PERFORM briofold_customer_actor(w,a,'contact');END IF;
  IF length(coalesce(b->>'email',''))>254 OR (coalesce(b->>'email','')<>'' AND b->>'email'!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') OR (coalesce(b->>'phone','')<>'' AND b->>'phone'!~'^\+?[0-9]{7,15}$') THEN RAISE EXCEPTION 'Invalid contact' USING ERRCODE='22023';END IF;
  IF b ? 'preferences' AND (jsonb_typeof(b->'preferences') IS DISTINCT FROM 'object' OR b->'preferences'->>'marketing' IS NULL OR b->'preferences'->>'marketing' NOT IN ('unknown','opted-in','opted-out') OR jsonb_typeof(b->'preferences'->'do_not_contact') IS DISTINCT FROM 'boolean' OR ((b->'preferences')-'marketing'-'do_not_contact')<>'{}'::jsonb) THEN RAISE EXCEPTION 'Invalid preferences' USING ERRCODE='22023';END IF;
  UPDATE briofold_customers SET name=b->>'name',tags=ARRAY(SELECT jsonb_array_elements_text(b->'tags')),stage=coalesce(b->>'stage','new'),temperature=coalesce(b->>'temperature','warm'),assignee=nullif(b->>'assignee','')::uuid,email=CASE WHEN b ? 'email' THEN lower(trim(b->>'email')) ELSE email END,phone=coalesce(b->>'phone',phone),notes=coalesce(b->>'notes',notes),reason=coalesce(b->>'reason',reason),preferences=coalesce(b->'preferences',preferences) WHERE id=cid;
  UPDATE briofold_customer_proofs p SET revoked_at=now() FROM briofold_customers x WHERE x.id=cid AND p.customer_id=cid AND p.revoked_at IS NULL AND ((p.kind='email' AND p.value<>x.email) OR (p.kind='phone' AND p.value<>x.phone));
  UPDATE briofold_customer_challenges ch SET used_at=now(),value='' FROM briofold_customers x WHERE x.id=cid AND ch.customer_id=cid AND ch.value<>x.email;
 ELSIF act='merge' THEN
  PERFORM briofold_customer_actor(w,a,'contact');target:=(b->>'target')::uuid;SELECT * INTO other FROM briofold_customers WHERE id=target AND workspace_id=w AND environment=e AND deleted_at IS NULL AND merged_into IS NULL FOR UPDATE;
  IF other.id IS NULL OR other.id=cid OR b->>'confirmed' IS DISTINCT FROM 'true' OR NOT EXISTS(SELECT 1 FROM briofold_customer_proofs x JOIN briofold_customer_proofs y ON y.workspace_id=x.workspace_id AND y.environment=x.environment AND y.kind=x.kind AND y.value=x.value WHERE x.customer_id=cid AND y.customer_id=target AND x.revoked_at IS NULL AND y.revoked_at IS NULL) THEN RAISE EXCEPTION 'Verified shared identity and confirmation required' USING ERRCODE='42501';END IF;
  -- Canonical target is deterministic, independent of request order.
  IF (c.created_at,c.id)<(other.created_at,other.id) THEN target:=cid;cid:=other.id;END IF;
  UPDATE briofold_customer_sources SET customer_id=target WHERE customer_id=cid;UPDATE briofold_customer_proofs SET customer_id=target WHERE customer_id=cid;UPDATE briofold_customer_followups SET customer_id=target WHERE customer_id=cid;
  UPDATE briofold_customers SET merged_into=target WHERE id=cid;UPDATE briofold_customers SET revision=revision+1,updated_at=now(),preferences=jsonb_build_object('marketing',CASE WHEN preferences->>'marketing'='opted-out' OR c.preferences->>'marketing'='opted-out' OR other.preferences->>'marketing'='opted-out' THEN 'opted-out' ELSE 'unknown' END,'do_not_contact',(preferences->>'do_not_contact')::boolean OR (c.preferences->>'do_not_contact')::boolean OR (other.preferences->>'do_not_contact')::boolean) WHERE id=target;
 ELSIF act IN ('unlink','dispute') THEN
  PERFORM briofold_customer_actor(w,a,'contact');IF b->>'confirmed' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Confirm identity correction' USING ERRCODE='22023';END IF;
  fid:=(b->>'source')::uuid;IF NOT EXISTS(SELECT 1 FROM briofold_customer_sources WHERE id=fid AND customer_id=cid) THEN RAISE EXCEPTION 'Source unavailable' USING ERRCODE='42501';END IF;
  INSERT INTO briofold_customers(workspace_id,environment,name,preferences) VALUES(w,e,'Separated customer','{"marketing":"opted-out","do_not_contact":true}') RETURNING id INTO target;UPDATE briofold_customer_sources SET customer_id=target WHERE id=fid;
  UPDATE briofold_customer_proofs SET revoked_at=now() WHERE customer_id=cid AND revoked_at IS NULL;UPDATE briofold_customers SET preferences='{"marketing":"opted-out","do_not_contact":true}' WHERE id=cid;
 ELSIF act='followup' THEN
  IF length(trim(coalesce(b->>'body','')))=0 OR length(b->>'body')>2000 OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=b->>'time_zone') OR (b->>'due_at')::timestamptz IS NULL OR (b->>'due_at')::timestamptz>now()+interval '2 years' THEN RAISE EXCEPTION 'Invalid follow-up' USING ERRCODE='22023';END IF;
  IF (SELECT count(*) FROM briofold_customer_followups WHERE customer_id=cid)>=200 THEN RAISE EXCEPTION 'Follow-up limit' USING ERRCODE='54000';END IF;
  IF coalesce(b->>'kind','reminder') NOT IN ('reminder','offer')
   OR (coalesce(b->>'quiet_start','')='' AND coalesce(b->>'quiet_end','')<>'')
   OR (coalesce(b->>'quiet_start','')<>'' AND coalesce(b->>'quiet_end','')='')
   OR (coalesce(b->>'quiet_start','')<>'' AND (b->>'quiet_start'!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' OR b->>'quiet_end'!~'^([01][0-9]|2[0-3]):[0-5][0-9]$'))
   THEN RAISE EXCEPTION 'Invalid reminder kind or quiet hours' USING ERRCODE='22023';END IF;
  INSERT INTO briofold_customer_followups(id,workspace_id,environment,customer_id,due_at,time_zone,body,created_by,requested_due_at,kind,quiet_start,quiet_end)
   VALUES((b->>'followup_id')::uuid,w,e,cid,
    briofold_followup_due((b->>'due_at')::timestamptz,b->>'time_zone',nullif(b->>'quiet_start','')::time,nullif(b->>'quiet_end','')::time),
    b->>'time_zone',b->>'body',a,(b->>'due_at')::timestamptz,coalesce(b->>'kind','reminder'),nullif(b->>'quiet_start','')::time,nullif(b->>'quiet_end','')::time);
 ELSIF act='followup-status' THEN
  IF b->>'status' IS NULL OR b->>'status' NOT IN ('done','cancelled','skipped') THEN RAISE EXCEPTION 'Invalid follow-up status' USING ERRCODE='22023';END IF;UPDATE briofold_customer_followups SET status=b->>'status' WHERE id=(b->>'followup_id')::uuid AND customer_id=cid AND status='scheduled';IF NOT FOUND THEN RAISE EXCEPTION 'Follow-up unavailable' USING ERRCODE='40001';END IF;
 ELSIF act='delete' THEN
  PERFORM briofold_customer_actor(w,a,'contact');IF b->>'confirmed' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Deletion confirmation required' USING ERRCODE='22023';END IF;
  WITH RECURSIVE ids(id) AS(SELECT cid UNION SELECT x.id FROM briofold_customers x JOIN ids ON x.merged_into=ids.id) DELETE FROM briofold_customer_challenges WHERE customer_id IN(SELECT id FROM ids);
  WITH RECURSIVE ids(id) AS(SELECT cid UNION SELECT x.id FROM briofold_customers x JOIN ids ON x.merged_into=ids.id) DELETE FROM briofold_customer_proofs WHERE customer_id IN(SELECT id FROM ids);
  UPDATE briofold_customer_followups SET body='Deleted',status='cancelled' WHERE customer_id=cid;
  WITH RECURSIVE ids(id) AS(SELECT cid UNION SELECT x.id FROM briofold_customers x JOIN ids ON x.merged_into=ids.id) UPDATE briofold_customers SET name='Deleted customer',email='',phone='',notes='',reason='',tags='{}',assignee=NULL,deleted_at=now(),preferences='{"marketing":"opted-out","do_not_contact":true}' WHERE id IN(SELECT id FROM ids);
 ELSIF act='link' THEN
  PERFORM briofold_customer_actor(w,a,'contact');IF b->>'kind' NOT IN ('thread','finance-customer','invoice','payment','order','api') OR b->>'kind' IS NULL THEN RAISE EXCEPTION 'Invalid source' USING ERRCODE='22023';END IF;
  -- Only trusted Go can validate references in the physically separate finance realm.
  IF b->>'kind'='thread' AND NOT EXISTS(SELECT 1 FROM inbox_threads t JOIN inbox_connections x ON x.id=t.connection_id WHERE t.id=(b->>'source_id')::uuid AND t.workspace_id=w AND x.environment=e) THEN RAISE EXCEPTION 'Source unavailable' USING ERRCODE='42501';END IF;
  IF b->>'kind'='order' AND NOT EXISTS(SELECT 1 FROM inbox_orders o JOIN inbox_threads t ON t.id=o.thread_id JOIN inbox_connections x ON x.id=t.connection_id WHERE o.id=(b->>'source_id')::uuid AND o.workspace_id=w AND x.environment=e) THEN RAISE EXCEPTION 'Source unavailable' USING ERRCODE='42501';END IF;
  INSERT INTO briofold_customer_sources(workspace_id,environment,customer_id,kind,source_id) VALUES(w,e,cid,b->>'kind',(b->>'source_id')::uuid);
 END IF;
 UPDATE briofold_customers SET revision=revision+1,updated_at=now() WHERE id=cid RETURNING revision INTO rev;
 INSERT INTO briofold_customer_events(workspace_id,environment,customer_id,actor_id,action,detail) VALUES(w,e,cid,a,act,jsonb_strip_nulls(jsonb_build_object('target',target,'source',b->>'source','followup_id',b->>'followup_id')));
 SELECT revision INTO rev FROM briofold_customers WHERE id=coalesce(target,cid);res:=jsonb_build_object('id',coalesce(target,cid),'revision',rev);INSERT INTO briofold_customer_commands VALUES(w,a,k,fp,res);RETURN res;
END $$;
CREATE OR REPLACE FUNCTION briofold_customers_read(w uuid,e text,a uuid,cid uuid,off integer,q text,filter text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE role_name text;pii boolean;staff boolean;items jsonb;item jsonb;
BEGIN
 role_name:=briofold_customer_actor(w,a,'read');
 pii:=role_name IN ('owner','admin');
 staff:=role_name IN ('owner','admin','editor');
 IF e NOT IN ('live','sandbox') OR e IS NULL OR off IS NULL OR off<0 OR off>10000
    OR q IS NULL OR length(q)>100
    OR filter NOT IN ('','new','contacted','qualified','proposal','won','lost','due') THEN
  RAISE EXCEPTION 'Invalid CRM filter' USING ERRCODE='22023';
 END IF;
 IF cid IS NULL THEN
  SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) INTO items FROM (
   SELECT c.id,c.name,c.stage,c.temperature,c.tags,
    CASE WHEN staff THEN c.assignee ELSE NULL END AS assignee,
    c.assignee IS NOT NULL AS assigned,c.revision,c.updated_at,
    CASE WHEN pii THEN c.email ELSE '' END AS email,
    CASE WHEN pii THEN c.phone ELSE '' END AS phone,
    EXISTS(SELECT 1 FROM briofold_customer_followups f
     WHERE f.customer_id=c.id AND f.status='scheduled' AND f.due_at<=now()) AS due
   FROM briofold_customers c
   WHERE c.workspace_id=w AND c.environment=e AND c.deleted_at IS NULL AND c.merged_into IS NULL
    AND (q='' OR c.name ILIKE '%'||q||'%' OR (pii AND
      (c.email ILIKE '%'||q||'%' OR c.phone ILIKE '%'||q||'%')) OR
      EXISTS(SELECT 1 FROM unnest(c.tags) tag WHERE tag ILIKE '%'||q||'%'))
    AND (filter='' OR c.stage=filter OR (filter='due' AND
      EXISTS(SELECT 1 FROM briofold_customer_followups f WHERE f.customer_id=c.id
      AND f.status='scheduled' AND f.due_at<=now())))
   ORDER BY c.updated_at DESC,c.id LIMIT 51 OFFSET off
  ) x;
  RETURN jsonb_build_object('items',items,'can_manage',staff,'can_contact',pii,
   'can_export',pii,
   'members',CASE WHEN staff THEN coalesce((SELECT jsonb_agg(jsonb_build_object('id',u.id,'name',u.display_name))
      FROM workspace_members m JOIN app_users u ON u.id=m.user_id
      WHERE m.workspace_id=w AND u.disabled_at IS NULL),'[]'::jsonb)
     ELSE '[]'::jsonb END);
 END IF;
 SELECT to_jsonb(c)-'workspace_id'-'email'-'phone'-'notes'-'reason'-'assignee'
   ||jsonb_build_object('assignee',CASE WHEN staff THEN c.assignee ELSE NULL END,
     'assigned',c.assignee IS NOT NULL)
  INTO item FROM briofold_customers c WHERE c.workspace_id=w AND c.environment=e AND c.id=cid;
 IF item IS NULL THEN RAISE EXCEPTION 'Customer unavailable' USING ERRCODE='42501';END IF;
 IF pii THEN
  SELECT item||jsonb_build_object('email',c.email,'phone',c.phone,'notes',c.notes,'reason',c.reason)
    INTO item FROM briofold_customers c WHERE c.id=cid;
 END IF;
 RETURN jsonb_build_object('customer',item,'can_manage',staff,'can_contact',pii,'can_export',pii,
  'archives',CASE WHEN pii THEN coalesce((WITH RECURSIVE ids(id) AS (
    SELECT cid UNION SELECT x.id FROM briofold_customers x JOIN ids ON x.merged_into=ids.id)
    SELECT jsonb_agg(to_jsonb(z)) FROM (SELECT x.id,x.name,x.email,x.phone,x.notes,x.tags
    FROM briofold_customers x WHERE x.id IN(SELECT id FROM ids) AND x.id<>cid
    ORDER BY x.created_at,x.id LIMIT 51 OFFSET off) z),'[]'::jsonb) ELSE '[]'::jsonb END,
  'sources',coalesce((SELECT jsonb_agg(to_jsonb(s)-'workspace_id'-'environment')
    FROM briofold_customer_sources s WHERE s.customer_id=cid),'[]'::jsonb),
  'proofs',CASE WHEN pii THEN coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,
    'kind',p.kind,'value',p.value,'verified_at',p.verified_at,'revoked_at',p.revoked_at))
    FROM briofold_customer_proofs p WHERE p.customer_id=cid),'[]'::jsonb)
    ELSE '[]'::jsonb END,
  'followups',coalesce((SELECT jsonb_agg(jsonb_build_object('id',f.id,'due_at',f.due_at,
    'time_zone',f.time_zone,'status',f.status,'kind',f.kind,'requested_due_at',f.requested_due_at,'quiet_start',left(f.quiet_start::text,5),'quiet_end',left(f.quiet_end::text,5),'body',CASE WHEN pii THEN f.body ELSE '' END)
    ORDER BY f.due_at) FROM briofold_customer_followups f WHERE f.customer_id=cid),'[]'::jsonb),
  'events',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.sequence DESC)
    FROM (SELECT sequence,action,created_at FROM briofold_customer_events
     WHERE customer_id=cid ORDER BY sequence DESC LIMIT 51 OFFSET off) x),'[]'::jsonb));
END $$;

COMMIT;
