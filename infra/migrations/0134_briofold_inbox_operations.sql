-- Control-plane human workflow. Financial records and credit accounts are untouched.
BEGIN;
DO $$BEGIN
 IF to_regclass('public.briofold_ai_studio_drafts') IS NULL OR to_regclass('public.financial_realm') IS NOT NULL
 THEN RAISE EXCEPTION '0134 requires the control Inbox and Studio schema'; END IF;
END $$;
CREATE TABLE briofold_inbox_work (
 workspace_id uuid NOT NULL,thread_id uuid PRIMARY KEY,revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 owner_id uuid REFERENCES app_users(id),status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','pending','resolved','snoozed')),
 priority text NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal','high','urgent')),
 labels text[] NOT NULL DEFAULT '{}' CHECK(cardinality(labels)<=20),
 due_at timestamptz,snooze_until timestamptz,return_at timestamptz,scheduled_by uuid REFERENCES app_users(id),disputed boolean NOT NULL DEFAULT false,
 handover_reason text NOT NULL DEFAULT '' CHECK(length(handover_reason)<=500),updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(return_at IS NULL OR scheduled_by IS NOT NULL),UNIQUE(workspace_id,thread_id),FOREIGN KEY(workspace_id,thread_id) REFERENCES inbox_threads(workspace_id,id)
);
CREATE INDEX briofold_inbox_work_queue ON briofold_inbox_work(workspace_id,status,due_at,thread_id);
CREATE INDEX briofold_inbox_work_owner ON briofold_inbox_work(workspace_id,owner_id,status);
CREATE INDEX briofold_inbox_work_return ON briofold_inbox_work(return_at) WHERE return_at IS NOT NULL;
CREATE TABLE briofold_inbox_duty (
 workspace_id uuid NOT NULL,user_id uuid NOT NULL,environment text NOT NULL CHECK(environment IN ('live','sandbox')),
 state text NOT NULL CHECK(state IN ('available','busy','away')),updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,user_id,environment),FOREIGN KEY(workspace_id,user_id) REFERENCES workspace_members(workspace_id,user_id) ON DELETE CASCADE
);
CREATE TABLE briofold_inbox_saved_replies (
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES workspaces(id),environment text NOT NULL CHECK(environment IN ('live','sandbox')),
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 120),category text NOT NULL DEFAULT '' CHECK(length(category)<=80),
 body text NOT NULL CHECK(length(body) BETWEEN 1 AND 8000),active boolean NOT NULL DEFAULT true,
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(workspace_id,id)
);
CREATE INDEX briofold_inbox_saved_replies_page ON briofold_inbox_saved_replies(workspace_id,environment,updated_at DESC,id) WHERE active;
CREATE TABLE briofold_inbox_tickets (
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL,thread_id uuid NOT NULL,
 category text NOT NULL CHECK(category IN ('question','complaint','refund','return')),
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 160),detail text NOT NULL CHECK(length(detail)<=8000),
 status text NOT NULL DEFAULT 'open' CHECK(status IN ('open','pending','resolved')),
 priority text NOT NULL DEFAULT 'normal' CHECK(priority IN ('normal','high','urgent')),
 owner_id uuid REFERENCES app_users(id),resolution text NOT NULL DEFAULT '' CHECK(length(resolution)<=1000),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,id),FOREIGN KEY(workspace_id,thread_id) REFERENCES inbox_threads(workspace_id,id)
);
CREATE INDEX briofold_inbox_tickets_thread ON briofold_inbox_tickets(workspace_id,thread_id,created_at DESC,id);
CREATE TABLE briofold_inbox_events (
 workspace_id uuid NOT NULL,operation_key uuid NOT NULL,thread_id uuid,actor_id uuid NOT NULL REFERENCES app_users(id),
 action text NOT NULL,request_hash text NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,operation_key),FOREIGN KEY(workspace_id,thread_id) REFERENCES inbox_threads(workspace_id,id)
);
CREATE INDEX briofold_inbox_events_thread ON briofold_inbox_events(workspace_id,thread_id,created_at DESC,operation_key);
CREATE INDEX briofold_inbox_events_rate ON briofold_inbox_events(workspace_id,created_at DESC);
CREATE TRIGGER briofold_inbox_events_immutable BEFORE UPDATE OR DELETE ON briofold_inbox_events FOR EACH ROW EXECUTE FUNCTION briofold_ai_studio_immutable();
DO $$DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['briofold_inbox_work','briofold_inbox_duty','briofold_inbox_saved_replies','briofold_inbox_tickets','briofold_inbox_events'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY %I ON %I TO %I USING(true) WITH CHECK(true)',t||'_owner',t,current_user);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection',t);
 END LOOP;
END $$;
CREATE FUNCTION briofold_inbox_actor(w uuid,a uuid,cap text) RETURNS text
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE role text;BEGIN
 role:=pg13_actor(w,a,false);
 IF cap NOT IN ('inbox:read','inbox:send','inbox:manage') OR cap IS NULL
 OR NOT EXISTS(SELECT 1 FROM workspace_product_access WHERE workspace_id=w AND product='ai' AND enabled)
 OR pg13_capability_override(w,a,cap) IS FALSE
 OR (cap='inbox:send' AND role NOT IN ('owner','admin','editor') AND pg13_capability_override(w,a,cap) IS DISTINCT FROM true)
 OR (cap='inbox:manage' AND role NOT IN ('owner','admin') AND pg13_capability_override(w,a,cap) IS DISTINCT FROM true)
 THEN RAISE EXCEPTION 'Inbox workflow access denied' USING ERRCODE='42501'; END IF;
 RETURN role;
END $$;
CREATE FUNCTION briofold_inbox_work_read(w uuid,e text,a uuid,t uuid,off integer DEFAULT 0,ticket_offset integer DEFAULT 0,history_offset integer DEFAULT 0,filters jsonb DEFAULT '{}') RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE v inbox_threads;r jsonb;BEGIN
 PERFORM briofold_inbox_actor(w,a,'inbox:read');
 IF e IS NULL OR e NOT IN ('live','sandbox') OR off IS NULL OR off NOT BETWEEN 0 AND 10000 OR ticket_offset IS NULL OR ticket_offset NOT BETWEEN 0 AND 10000 OR history_offset IS NULL OR history_offset NOT BETWEEN 0 AND 10000 THEN RAISE EXCEPTION 'Invalid workflow page' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(filters) IS DISTINCT FROM 'object' OR pg_column_size(filters)>8192 OR length(coalesce(filters->>'q',''))>100 OR length(coalesce(filters->>'member_query',''))>100 OR length(coalesce(filters->>'category',''))>80 THEN RAISE EXCEPTION 'Invalid search filter' USING ERRCODE='22023'; END IF;
 IF t IS NOT NULL THEN v:=inbox_scope(w,e,t);END IF;
 SELECT jsonb_build_object('server_time',now(),
  'work',CASE WHEN t IS NOT NULL THEN coalesce((SELECT to_jsonb(x)-'workspace_id' FROM briofold_inbox_work x WHERE thread_id=t),jsonb_build_object('thread_id',t,'revision',0,'owner_id',NULL,'status','open','priority','normal','labels','[]'::jsonb,'due_at',NULL,'snooze_until',NULL,'return_at',NULL,'disputed',false,'handover_reason','')) END,
  'members',coalesce((SELECT jsonb_agg(jsonb_build_object('id',u.id,'name',u.display_name) ORDER BY u.display_name,u.id) FROM (SELECT u.id,u.display_name FROM workspace_members m JOIN app_users u ON u.id=m.user_id WHERE m.workspace_id=w AND m.role IN ('owner','admin','editor') AND u.disabled_at IS NULL AND pg13_capability_override(w,u.id,'inbox:send') IS DISTINCT FROM false AND u.display_name ILIKE '%'||coalesce(filters->>'member_query','')||'%' ORDER BY u.display_name,u.id LIMIT 50) u),'[]'),
  'more_members',(SELECT count(*)>50 FROM workspace_members m JOIN app_users u ON u.id=m.user_id WHERE m.workspace_id=w AND m.role IN ('owner','admin','editor') AND u.disabled_at IS NULL AND pg13_capability_override(w,u.id,'inbox:send') IS DISTINCT FROM false AND u.display_name ILIKE '%'||coalesce(filters->>'member_query','')||'%'),
  'duty',coalesce((SELECT state FROM briofold_inbox_duty WHERE workspace_id=w AND user_id=a AND environment=e),'away'),
  'saved_replies',coalesce((SELECT jsonb_agg(to_jsonb(x)-'workspace_id' ORDER BY x.updated_at DESC,x.id) FROM (SELECT * FROM briofold_inbox_saved_replies WHERE workspace_id=w AND environment=e AND active AND (coalesce(filters->>'q','')='' OR title ILIKE '%'||(filters->>'q')||'%' OR body ILIKE '%'||(filters->>'q')||'%') AND (coalesce(filters->>'category','')='' OR category=filters->>'category') ORDER BY updated_at DESC,id OFFSET off LIMIT 50)x),'[]'),
  'more_replies',(SELECT count(*)>off+50 FROM briofold_inbox_saved_replies WHERE workspace_id=w AND environment=e AND active AND (coalesce(filters->>'q','')='' OR title ILIKE '%'||(filters->>'q')||'%' OR body ILIKE '%'||(filters->>'q')||'%') AND (coalesce(filters->>'category','')='' OR category=filters->>'category')),
  'tickets',coalesce((SELECT jsonb_agg(to_jsonb(x)-'workspace_id' ORDER BY x.created_at DESC,x.id) FROM (SELECT q.*,z.customer_name FROM briofold_inbox_tickets q JOIN inbox_threads z ON z.id=q.thread_id JOIN inbox_connections c ON c.id=z.connection_id WHERE q.workspace_id=w AND (t IS NULL OR q.thread_id=t) AND c.environment=e AND c.enabled AND (coalesce(filters->>'q','')='' OR q.title ILIKE '%'||(filters->>'q')||'%' OR q.detail ILIKE '%'||(filters->>'q')||'%' OR z.customer_name ILIKE '%'||(filters->>'q')||'%') AND (coalesce(filters->>'ticket_status','')='' OR q.status=filters->>'ticket_status') ORDER BY q.created_at DESC,q.id OFFSET ticket_offset LIMIT 50)x),'[]'),
  'more_tickets',(SELECT count(*)>ticket_offset+50 FROM briofold_inbox_tickets q JOIN inbox_threads z ON z.id=q.thread_id JOIN inbox_connections c ON c.id=z.connection_id WHERE q.workspace_id=w AND (t IS NULL OR q.thread_id=t) AND c.environment=e AND c.enabled AND (coalesce(filters->>'q','')='' OR q.title ILIKE '%'||(filters->>'q')||'%' OR q.detail ILIKE '%'||(filters->>'q')||'%' OR z.customer_name ILIKE '%'||(filters->>'q')||'%') AND (coalesce(filters->>'ticket_status','')='' OR q.status=filters->>'ticket_status')),
  'more_history',(SELECT count(*)>history_offset+50 FROM briofold_inbox_events WHERE workspace_id=w AND thread_id=t),
  'history',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC,x.operation_key) FROM (SELECT operation_key,actor_id,action,created_at FROM briofold_inbox_events WHERE workspace_id=w AND thread_id=t ORDER BY created_at DESC,operation_key OFFSET history_offset LIMIT 50)x),'[]'),
  'note',coalesce(v.note,''),'note_version',coalesce(v.note_version,0),
  'can_send',((SELECT role FROM workspace_members WHERE workspace_id=w AND user_id=a) IN ('owner','admin','editor') OR pg13_capability_override(w,a,'inbox:send') IS TRUE) AND pg13_capability_override(w,a,'inbox:send') IS DISTINCT FROM false,
  'can_manage',((SELECT role FROM workspace_members WHERE workspace_id=w AND user_id=a) IN ('owner','admin') OR pg13_capability_override(w,a,'inbox:manage') IS TRUE) AND pg13_capability_override(w,a,'inbox:manage') IS DISTINCT FROM false
 ) INTO r;RETURN r;
END $$;
CREATE FUNCTION briofold_inbox_work_write(w uuid,e text,a uuid,t uuid,k uuid,act text,b jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE prior briofold_inbox_events;v inbox_threads;x briofold_inbox_work;reply briofold_inbox_saved_replies;ticket briofold_inbox_tickets;
 result jsonb;fp text;object_id uuid;owner uuid;expected bigint;labels_value text[];return_time timestamptz;cap text;
BEGIN
 cap:=CASE WHEN act IN ('saved-reply','archive-reply') THEN 'inbox:manage' ELSE 'inbox:send' END;
 PERFORM briofold_inbox_actor(w,a,cap);
 IF e IS NULL OR e NOT IN ('live','sandbox') OR k IS NULL OR act IS NULL OR act NOT IN ('work','takeover','release','duty','saved-reply','archive-reply','ticket','note') OR jsonb_typeof(b) IS DISTINCT FROM 'object' OR pg_column_size(b)>65536
 THEN RAISE EXCEPTION 'Invalid workflow operation' USING ERRCODE='22023'; END IF;
 PERFORM 1 FROM workspace_members m JOIN app_users u ON u.id=m.user_id WHERE m.workspace_id=w AND m.user_id=a FOR SHARE OF m,u;
 PERFORM briofold_inbox_actor(w,a,cap);
 PERFORM pg_advisory_xact_lock(hashtextextended('briofold:inbox-work:'||w::text,0));
 fp:=encode(digest(e||':'||coalesce(t::text,'')||':'||act||':'||b::text,'sha256'),'hex');
 SELECT * INTO prior FROM briofold_inbox_events WHERE workspace_id=w AND operation_key=k;
 IF FOUND THEN
  IF prior.actor_id<>a OR prior.request_hash<>fp THEN RAISE EXCEPTION 'Workflow operation key conflict' USING ERRCODE='23505'; END IF;RETURN prior.result;
 END IF;
 IF (SELECT count(*) FROM briofold_inbox_events WHERE workspace_id=w AND created_at>now()-interval '1 minute')>=120 THEN RAISE EXCEPTION 'Workflow rate limit' USING ERRCODE='54000';END IF;
 IF act IN ('work','takeover','release','ticket','note') THEN
  v:=inbox_scope(w,e,t);PERFORM 1 FROM inbox_threads WHERE id=t FOR UPDATE;
  SELECT * INTO x FROM briofold_inbox_work WHERE thread_id=t FOR UPDATE;
 END IF;
 IF act IN ('work','takeover','release') THEN
  expected:=(b->>'revision')::bigint;
  IF expected IS DISTINCT FROM coalesce(x.revision,0) THEN RAISE EXCEPTION 'Workflow changed; refresh' USING ERRCODE='40001'; END IF;
  INSERT INTO briofold_inbox_work(workspace_id,thread_id) VALUES(w,t) ON CONFLICT(thread_id) DO NOTHING;
  IF act='work' THEN
   owner:=(b->>'owner_id')::uuid;
   IF owner IS NOT NULL AND NOT EXISTS(SELECT 1 FROM workspace_members m JOIN app_users u ON u.id=m.user_id WHERE m.workspace_id=w AND m.user_id=owner AND m.role IN ('owner','admin','editor') AND u.disabled_at IS NULL AND pg13_capability_override(w,owner,'inbox:send') IS DISTINCT FROM false) THEN RAISE EXCEPTION 'Assignee unavailable' USING ERRCODE='42501'; END IF;
   IF b->>'status' IS NULL OR b->>'status' NOT IN ('open','pending','resolved','snoozed') OR b->>'priority' IS NULL OR b->>'priority' NOT IN ('normal','high','urgent') OR jsonb_typeof(b->'labels') IS DISTINCT FROM 'array' OR jsonb_array_length(b->'labels')>20 OR EXISTS(SELECT 1 FROM jsonb_array_elements(b->'labels') z WHERE jsonb_typeof(z)<>'string' OR length(trim(z#>>'{}')) NOT BETWEEN 1 AND 40) OR jsonb_typeof(b->'disputed') IS DISTINCT FROM 'boolean'
   THEN RAISE EXCEPTION 'Invalid conversation workflow' USING ERRCODE='22023'; END IF;
   SELECT coalesce(array_agg(DISTINCT trim(value) ORDER BY trim(value)),'{}') INTO labels_value FROM jsonb_array_elements_text(b->'labels');
   IF b->>'status'='snoozed' AND ((b->>'snooze_until')::timestamptz IS NULL OR (b->>'snooze_until')::timestamptz<=now() OR (b->>'snooze_until')::timestamptz>now()+interval '30 days') THEN RAISE EXCEPTION 'Future snooze time required' USING ERRCODE='22023'; END IF;
   UPDATE briofold_inbox_work SET owner_id=owner,status=b->>'status',priority=b->>'priority',labels=labels_value,due_at=(b->>'due_at')::timestamptz,snooze_until=CASE WHEN b->>'status'='snoozed' THEN (b->>'snooze_until')::timestamptz END,disputed=(b->>'disputed')::boolean,revision=coalesce(x.revision,0)+1,updated_at=now() WHERE thread_id=t;
   IF (b->>'disputed')::boolean OR b->>'status'='resolved' THEN
    UPDATE inbox_threads SET ai_enabled=false,ai_version=ai_version+1 WHERE id=t;
    UPDATE inbox_messages SET state='failed',error_code='HUMAN_REVIEW_REQUIRED' WHERE thread_id=t AND sender='ai' AND state='queued';
   END IF;
  ELSE
   IF act='takeover' THEN
    IF length(trim(coalesce(b->>'reason',''))) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'Handover reason required' USING ERRCODE='22023';END IF;
    return_time:=(b->>'return_at')::timestamptz;
    IF return_time IS NOT NULL AND (return_time<=now() OR return_time>now()+interval '7 days') THEN RAISE EXCEPTION 'Invalid auto-return time' USING ERRCODE='22023'; END IF;
    UPDATE briofold_inbox_work SET owner_id=a,return_at=return_time,scheduled_by=a,handover_reason=trim(b->>'reason'),revision=coalesce(x.revision,0)+1,updated_at=now() WHERE thread_id=t;
    UPDATE inbox_threads SET ai_enabled=false,ai_version=ai_version+1 WHERE id=t;
    UPDATE inbox_messages SET state='failed',error_code='HUMAN_TAKEOVER' WHERE thread_id=t AND sender='ai' AND state='queued';
   ELSE
    IF (b->>'confirmed')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'Explicit release confirmation required' USING ERRCODE='22023'; END IF;
    IF coalesce(x.disputed,false) OR EXISTS(SELECT 1 FROM briofold_inbox_tickets WHERE thread_id=t AND category IN ('complaint','refund','return') AND status<>'resolved') THEN RAISE EXCEPTION 'Resolve dispute before release' USING ERRCODE='22023'; END IF;
    UPDATE briofold_inbox_work SET owner_id=NULL,return_at=NULL,scheduled_by=NULL,handover_reason='',revision=coalesce(x.revision,0)+1,updated_at=now() WHERE thread_id=t;
    UPDATE inbox_threads SET ai_enabled=true,ai_version=ai_version+1 WHERE id=t;
   END IF;
  END IF;
  SELECT to_jsonb(z)-'workspace_id' INTO result FROM briofold_inbox_work z WHERE thread_id=t;
 ELSIF act='note' THEN
  IF b->>'text' IS NULL OR length(b->>'text')>8000 THEN RAISE EXCEPTION 'Invalid internal note' USING ERRCODE='22023'; END IF;
  UPDATE inbox_threads SET note=b->>'text',note_version=note_version+1 WHERE id=t AND note_version=(b->>'version')::bigint RETURNING jsonb_build_object('saved',true,'version',note_version) INTO result;
  IF result IS NULL THEN RAISE EXCEPTION 'Internal note changed' USING ERRCODE='40001';END IF;
 ELSIF act='duty' THEN
  IF b->>'state' IS NULL OR b->>'state' NOT IN ('available','busy','away') THEN RAISE EXCEPTION 'Invalid duty state' USING ERRCODE='22023';END IF;
  INSERT INTO briofold_inbox_duty VALUES(w,a,e,b->>'state',now()) ON CONFLICT(workspace_id,user_id,environment) DO UPDATE SET state=excluded.state,updated_at=now();result:=jsonb_build_object('saved',true);
 ELSIF act IN ('saved-reply','archive-reply') THEN
  object_id:=(b->>'id')::uuid;IF object_id IS NULL THEN RAISE EXCEPTION 'Reply identifier required' USING ERRCODE='22023';END IF;
  SELECT * INTO reply FROM briofold_inbox_saved_replies WHERE briofold_inbox_saved_replies.id=object_id FOR UPDATE;
  IF reply.id IS NOT NULL AND (reply.workspace_id<>w OR reply.environment<>e) THEN RAISE EXCEPTION 'Reply unavailable' USING ERRCODE='42501'; END IF;
  IF (b->>'revision')::bigint IS DISTINCT FROM coalesce(reply.revision,0) THEN RAISE EXCEPTION 'Saved reply changed' USING ERRCODE='40001'; END IF;
  IF act='archive-reply' THEN
   IF reply.id IS NULL THEN RAISE EXCEPTION 'Reply unavailable' USING ERRCODE='42501'; END IF;
   UPDATE briofold_inbox_saved_replies SET active=false,revision=revision+1,updated_at=now() WHERE briofold_inbox_saved_replies.id=object_id;
  ELSE
   IF length(trim(coalesce(b->>'title',''))) NOT BETWEEN 1 AND 120 OR length(coalesce(b->>'category',''))>80 OR length(trim(coalesce(b->>'body',''))) NOT BETWEEN 1 AND 8000 THEN RAISE EXCEPTION 'Invalid saved reply' USING ERRCODE='22023'; END IF;
   IF (reply.id IS NULL OR NOT reply.active) AND (SELECT count(*) FROM briofold_inbox_saved_replies WHERE workspace_id=w AND environment=e AND active)>=500 THEN RAISE EXCEPTION 'Saved reply limit reached' USING ERRCODE='54000'; END IF;
   INSERT INTO briofold_inbox_saved_replies(id,workspace_id,environment,title,category,body) VALUES(object_id,w,e,trim(b->>'title'),coalesce(b->>'category',''),b->>'body') ON CONFLICT ON CONSTRAINT briofold_inbox_saved_replies_pkey DO UPDATE SET title=excluded.title,category=excluded.category,body=excluded.body,active=true,revision=briofold_inbox_saved_replies.revision+1,updated_at=now();
  END IF;
  result:=jsonb_build_object('saved',true,'id',object_id);
 ELSE
  object_id:=(b->>'id')::uuid;SELECT * INTO ticket FROM briofold_inbox_tickets z WHERE z.id=object_id FOR UPDATE;
  IF object_id IS NULL THEN RAISE EXCEPTION 'Ticket identifier required' USING ERRCODE='22023';END IF;
  IF ticket.id IS NOT NULL AND (ticket.workspace_id<>w OR ticket.thread_id<>t) THEN RAISE EXCEPTION 'Ticket unavailable' USING ERRCODE='42501';END IF;
  IF (b->>'revision')::bigint IS DISTINCT FROM coalesce(ticket.revision,0) THEN RAISE EXCEPTION 'Ticket changed' USING ERRCODE='40001';END IF;
  owner:=(b->>'owner_id')::uuid;
  IF owner IS NOT NULL AND NOT EXISTS(SELECT 1 FROM workspace_members m JOIN app_users u ON u.id=m.user_id WHERE m.workspace_id=w AND m.user_id=owner AND m.role IN ('owner','admin','editor') AND u.disabled_at IS NULL) THEN RAISE EXCEPTION 'Ticket assignee unavailable' USING ERRCODE='42501';END IF;
  IF b->>'category' IS NULL OR b->>'category' NOT IN ('question','complaint','refund','return') OR b->>'status' IS NULL OR b->>'status' NOT IN ('open','pending','resolved') OR b->>'priority' IS NULL OR b->>'priority' NOT IN ('normal','high','urgent') OR length(trim(coalesce(b->>'title',''))) NOT BETWEEN 1 AND 160 OR length(coalesce(b->>'detail',''))>8000 OR length(coalesce(b->>'resolution',''))>1000 OR (b->>'status'='resolved' AND length(trim(coalesce(b->>'resolution','')))<3) THEN RAISE EXCEPTION 'Invalid ticket or resolution' USING ERRCODE='22023'; END IF;
  INSERT INTO briofold_inbox_tickets(id,workspace_id,thread_id,category,title,detail,status,priority,owner_id,resolution) VALUES(object_id,w,t,b->>'category',trim(b->>'title'),coalesce(b->>'detail',''),b->>'status',b->>'priority',owner,coalesce(b->>'resolution','')) ON CONFLICT ON CONSTRAINT briofold_inbox_tickets_pkey DO UPDATE SET category=excluded.category,title=excluded.title,detail=excluded.detail,status=excluded.status,priority=excluded.priority,owner_id=excluded.owner_id,resolution=excluded.resolution,revision=briofold_inbox_tickets.revision+1,updated_at=now();
  IF b->>'category' IN ('complaint','refund','return') AND b->>'status'<>'resolved' THEN
   INSERT INTO briofold_inbox_work(workspace_id,thread_id,disputed) VALUES(w,t,true) ON CONFLICT(thread_id) DO UPDATE SET disputed=true,revision=briofold_inbox_work.revision+1,updated_at=now();
   UPDATE inbox_threads SET ai_enabled=false,ai_version=ai_version+1 WHERE inbox_threads.id=t;
   UPDATE inbox_messages SET state='failed',error_code='HUMAN_REVIEW_REQUIRED' WHERE thread_id=t AND sender='ai' AND state='queued';
  END IF;
  result:=jsonb_build_object('saved',true,'id',object_id);
 END IF;
 INSERT INTO briofold_inbox_events VALUES(w,k,t,a,act,fp,result,now());RETURN result;
END $$;
CREATE FUNCTION briofold_inbox_reopen() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN
 IF NEW.sender='customer' THEN UPDATE briofold_inbox_work SET status='open',snooze_until=NULL,revision=revision+1,updated_at=now() WHERE thread_id=NEW.thread_id AND status IN ('resolved','snoozed') AND NEW.created_at>updated_at;END IF;RETURN NEW;
END $$;
CREATE TRIGGER briofold_inbox_reopen AFTER INSERT ON inbox_messages FOR EACH ROW EXECUTE FUNCTION briofold_inbox_reopen();
REVOKE ALL ON FUNCTION briofold_inbox_reopen() FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
-- Legacy web/native AI toggles cannot bypass dispute protection.
ALTER FUNCTION inbox_action(uuid,text,uuid,uuid,text,jsonb) RENAME TO inbox_action_v2;
CREATE FUNCTION inbox_action(w uuid,e text,d uuid,t uuid,act text,b jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE r jsonb;BEGIN
 PERFORM inbox_scope(w,e,t);PERFORM 1 FROM inbox_threads WHERE id=t FOR UPDATE;
 IF act='ai' AND (b->>'enabled')::boolean AND (EXISTS(SELECT 1 FROM briofold_inbox_work WHERE thread_id=t AND disputed) OR EXISTS(SELECT 1 FROM briofold_inbox_tickets WHERE thread_id=t AND category IN ('complaint','refund','return') AND status<>'resolved')) THEN RAISE EXCEPTION 'Resolve dispute before release' USING ERRCODE='22023';END IF;
 r:=inbox_action_v2(w,e,d,t,act,b);
 IF act='send' OR (act='ai' AND NOT (b->>'enabled')::boolean) THEN UPDATE inbox_messages SET state='failed',error_code='HUMAN_TAKEOVER' WHERE thread_id=t AND sender='ai' AND state='queued';END IF;
 RETURN r;
END $$;
REVOKE ALL ON FUNCTION inbox_action(uuid,text,uuid,uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION inbox_action(uuid,text,uuid,uuid,text,jsonb) TO ekmivo_financial_runtime,ekmivo_financial_projection;
-- A due return is applied by the existing delivery worker, never by a browser timer.
CREATE FUNCTION briofold_inbox_due_returns() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE x briofold_inbox_work;n integer:=0;BEGIN
 FOR x IN SELECT z.* FROM briofold_inbox_work z JOIN inbox_threads t ON t.id=z.thread_id JOIN inbox_connections c ON c.id=t.connection_id AND c.enabled JOIN workspace_product_access p ON p.workspace_id=z.workspace_id AND p.product='ai' AND p.enabled WHERE z.return_at<=now() AND NOT z.disputed AND z.status IN ('open','pending') AND NOT EXISTS(SELECT 1 FROM briofold_inbox_tickets q WHERE q.thread_id=z.thread_id AND q.category IN ('complaint','refund','return') AND q.status<>'resolved') ORDER BY z.return_at LIMIT 100 FOR UPDATE OF t,z SKIP LOCKED LOOP
  UPDATE briofold_inbox_work SET owner_id=NULL,return_at=NULL,scheduled_by=NULL,handover_reason='',revision=revision+1,updated_at=now() WHERE thread_id=x.thread_id;
  UPDATE inbox_threads SET ai_enabled=true,ai_version=ai_version+1 WHERE id=x.thread_id;
  INSERT INTO briofold_inbox_events VALUES(x.workspace_id,gen_random_uuid(),x.thread_id,x.scheduled_by,'auto-return',encode(digest(x.thread_id::text||':'||x.revision::text,'sha256'),'hex'),jsonb_build_object('returned',true),now());n:=n+1;
 END LOOP;
 WITH due AS (SELECT thread_id FROM briofold_inbox_work WHERE status='snoozed' AND snooze_until<=now() ORDER BY snooze_until LIMIT 100 FOR UPDATE SKIP LOCKED) UPDATE briofold_inbox_work target SET status='open',snooze_until=NULL,revision=target.revision+1,updated_at=now() FROM due WHERE due.thread_id=target.thread_id;
 RETURN n;
END $$;
-- Keep media preparation, reaction and provider acknowledgement wrappers intact.
CREATE OR REPLACE FUNCTION inbox_next_send_v1() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE m inbox_messages;result jsonb;BEGIN
 PERFORM briofold_inbox_due_returns();
 UPDATE inbox_messages SET state='uncertain',error_code='WORKER_OUTCOME_UNKNOWN' WHERE state='sending' AND attempt_at<now()-interval '1 minute';
 UPDATE inbox_messages x SET state='failed',error_code='HUMAN_TAKEOVER' FROM inbox_threads t WHERE x.thread_id=t.id AND x.state='queued' AND x.sender='ai' AND (NOT t.ai_enabled OR EXISTS(SELECT 1 FROM briofold_inbox_work z WHERE z.thread_id=t.id AND (z.disputed OR z.status='resolved')) OR EXISTS(SELECT 1 FROM briofold_inbox_tickets q WHERE q.thread_id=t.id AND q.category IN ('complaint','refund','return') AND q.status<>'resolved'));
 UPDATE inbox_messages x SET state='failed',error_code='WINDOW_CLOSED' FROM inbox_threads t WHERE x.thread_id=t.id AND x.state='queued' AND t.last_customer_at<=now()-interval '24 hours';
 SELECT x.* INTO m FROM inbox_messages x JOIN inbox_threads t ON t.id=x.thread_id JOIN inbox_connections c ON c.id=t.connection_id AND c.enabled JOIN workspace_product_access p ON p.workspace_id=x.workspace_id AND p.product='ai' AND p.enabled WHERE x.state='queued' AND (x.sender<>'ai' OR t.ai_enabled) AND t.last_customer_at>now()-interval '24 hours' ORDER BY x.sequence FOR UPDATE OF t,x SKIP LOCKED LIMIT 1;
 IF m.id IS NULL THEN RETURN NULL;END IF;
 UPDATE inbox_messages SET state='sending',attempt_at=now(),attempts=attempts+1 WHERE id=m.id;
 SELECT jsonb_build_object('id',m.id,'workspace_id',m.workspace_id,'text',m.body,'channel',c.provider,'account',c.external_id,'recipient',t.external_id,'credential',encode(c.credential_cipher,'base64')) INTO result FROM inbox_threads t JOIN inbox_connections c ON c.id=t.connection_id WHERE t.id=m.thread_id;RETURN result;
END $$;
REVOKE ALL ON FUNCTION briofold_inbox_actor(uuid,uuid,text),briofold_inbox_work_read(uuid,text,uuid,uuid,integer,integer,integer,jsonb),briofold_inbox_work_write(uuid,text,uuid,uuid,uuid,text,jsonb),briofold_inbox_due_returns() FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION briofold_inbox_work_read(uuid,text,uuid,uuid,integer,integer,integer,jsonb),briofold_inbox_work_write(uuid,text,uuid,uuid,uuid,text,jsonb) TO ekmivo_financial_runtime,ekmivo_financial_projection;
-- Filtering happens before pagination so matches on later pages are never hidden.
CREATE INDEX briofold_inbox_message_search ON inbox_messages USING gin(to_tsvector('simple',body));
ALTER FUNCTION inbox_page(uuid,text,uuid,uuid,bigint,jsonb) RENAME TO inbox_page_media;
CREATE FUNCTION inbox_page(w uuid,e text,d uuid,t uuid,before_seq bigint,f jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;rk text:=coalesce(f->>'reader_kind','device');off integer:=coalesce((f->>'offset')::integer,0);queue text:=coalesce(f->>'queue','all');q text:=coalesce(f->>'q','');BEGIN
 IF rk='user' THEN PERFORM briofold_inbox_actor(w,d,'inbox:read');END IF;
 IF NOT EXISTS(SELECT 1 FROM workspace_product_access WHERE workspace_id=w AND product='ai' AND enabled) THEN RAISE EXCEPTION 'AI disabled' USING ERRCODE='42501';END IF;
 IF t IS NOT NULL THEN RETURN inbox_page_media(w,e,d,t,before_seq,f);END IF;
 IF e IS NULL OR e NOT IN ('live','sandbox') OR length(q)>200 OR off NOT BETWEEN 0 AND 10000 OR queue NOT IN ('all','unread','mine','unassigned','attention','resolved','snoozed') OR coalesce(f->>'channel','') NOT IN ('','ms','ig','wa') THEN RAISE EXCEPTION 'Invalid conversation filters' USING ERRCODE='22023';END IF;
 SELECT jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.last_activity_at DESC,x.id),'[]')) INTO result FROM (
  SELECT a.id,a.customer_name AS name,c.provider AS channel,a.ai_enabled,a.last_activity_at,
   latest.body AS preview,latest.sender AS preview_sender,
   (SELECT count(*) FROM inbox_messages m WHERE m.thread_id=a.id AND m.sender='customer' AND m.sequence>coalesce(rc.sequence,0)) AS unread,
   coalesce(wf.owner_id::text,'') AS owner_id,coalesce(wf.status,'open') AS status,coalesce(wf.priority,'normal') AS priority,coalesce(wf.labels,'{}') AS labels,wf.due_at,
   coalesce(wf.due_at<now() AND wf.status<>'resolved',false) AS overdue,
   coalesce(a.last_customer_at>now()-interval '24 hours',false) AS window_open,inbox_capabilities(c.provider) AS capabilities
  FROM inbox_threads a JOIN inbox_connections c ON c.id=a.connection_id
  LEFT JOIN briofold_inbox_work wf ON wf.thread_id=a.id
  LEFT JOIN inbox_read_cursors rc ON rc.thread_id=a.id AND rc.device_id=d AND rc.reader_kind=rk
  LEFT JOIN LATERAL(SELECT body,sender FROM inbox_messages WHERE thread_id=a.id ORDER BY sequence DESC LIMIT 1)latest ON true
  WHERE a.workspace_id=w AND c.enabled AND c.environment=e
  AND (q='' OR a.customer_name ILIKE '%'||q||'%' OR coalesce(a.contact->>'phone','') ILIKE '%'||q||'%' OR (c.provider='wa' AND a.external_id ILIKE '%'||q||'%') OR EXISTS(SELECT 1 FROM inbox_messages m WHERE m.workspace_id=w AND m.thread_id=a.id AND to_tsvector('simple',m.body)@@websearch_to_tsquery('simple',q)) OR EXISTS(SELECT 1 FROM inbox_orders o WHERE o.workspace_id=w AND o.thread_id=a.id AND o.reference ILIKE '%'||q||'%'))
  AND (coalesce(f->>'channel','')='' OR c.provider=f->>'channel')
  AND (coalesce(f->>'mode','')='' OR (f->>'mode'='ai' AND a.ai_enabled) OR (f->>'mode'='seller' AND NOT a.ai_enabled) OR (f->>'mode'='waiting' AND latest.sender='customer'))
  AND (coalesce((f->>'days')::integer,0)=0 OR a.last_activity_at>=now()-make_interval(days=>(f->>'days')::integer))
  AND (coalesce((f->>'unread')::boolean,false)=false OR EXISTS(SELECT 1 FROM inbox_messages m WHERE m.thread_id=a.id AND m.sender='customer' AND m.sequence>coalesce(rc.sequence,0)))
  AND (queue='all' OR (queue='unread' AND EXISTS(SELECT 1 FROM inbox_messages m WHERE m.thread_id=a.id AND m.sender='customer' AND m.sequence>coalesce(rc.sequence,0))) OR (queue='mine' AND wf.owner_id=d) OR (queue='unassigned' AND wf.owner_id IS NULL) OR (queue='attention' AND coalesce(wf.status,'open')<>'resolved' AND (coalesce(wf.disputed,false) OR wf.due_at<now() OR latest.sender='customer')) OR (queue='resolved' AND wf.status='resolved') OR (queue='snoozed' AND wf.status='snoozed' AND wf.snooze_until>now()))
  ORDER BY a.last_activity_at DESC,a.id OFFSET off LIMIT 50
 )x;RETURN result;
END $$;
REVOKE ALL ON FUNCTION inbox_page(uuid,text,uuid,uuid,bigint,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION inbox_page(uuid,text,uuid,uuid,bigint,jsonb) TO ekmivo_financial_runtime,ekmivo_financial_projection;
COMMIT;
