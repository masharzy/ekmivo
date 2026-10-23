-- Additive CONTROL-only saved reply sequences; no delivery flags are changed.
BEGIN;
DO $$ BEGIN
 IF to_regclass('public.briofold_inbox_saved_replies') IS NULL OR to_regclass('public.financial_realm') IS NOT NULL
 THEN RAISE EXCEPTION '0197 requires CONTROL Inbox'; END IF;
END $$;
ALTER TABLE briofold_inbox_saved_replies
 ADD COLUMN messages jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(messages)='array' AND jsonb_array_length(messages)<=10),
 ADD COLUMN shortcut text NOT NULL DEFAULT '' CHECK(shortcut='' OR shortcut ~ '^[a-z0-9_-]{1,40}$'),
 ADD COLUMN visibility text NOT NULL DEFAULT 'team' CHECK(visibility IN ('team','private')),
 ADD COLUMN created_by uuid REFERENCES app_users(id);
CREATE UNIQUE INDEX briofold_reply_shortcut ON briofold_inbox_saved_replies(workspace_id,environment,shortcut) WHERE active AND shortcut<>'';
ALTER FUNCTION briofold_inbox_work_write(uuid,text,uuid,uuid,uuid,text,jsonb) RENAME TO briofold_inbox_work_write_before_sequences;
REVOKE ALL ON FUNCTION briofold_inbox_work_write_before_sequences(uuid,text,uuid,uuid,uuid,text,jsonb) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
CREATE FUNCTION briofold_inbox_work_write(w uuid,e text,a uuid,t uuid,k uuid,act text,b jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE part jsonb;parts jsonb;src inbox_messages;r jsonb;prior boolean;
BEGIN
 IF act IN ('saved-reply','archive-reply') THEN
  PERFORM briofold_inbox_actor(w,a,'inbox:manage');
  PERFORM pg_advisory_xact_lock(hashtextextended('briofold:inbox-work:'||w::text,0));
  IF EXISTS(SELECT 1 FROM briofold_inbox_saved_replies WHERE id=(b->>'id')::uuid AND workspace_id=w AND environment=e AND visibility='private' AND created_by IS DISTINCT FROM a)
  THEN RAISE EXCEPTION 'Reply unavailable' USING ERRCODE='42501';END IF;
  IF act='saved-reply' THEN
   parts:=coalesce(b->'messages','[]'::jsonb);
   IF jsonb_typeof(parts) IS DISTINCT FROM 'array' OR jsonb_array_length(parts)>10
    OR coalesce(b->>'visibility','team') NOT IN ('team','private')
    OR (coalesce(b->>'shortcut','')<>'' AND b->>'shortcut' !~ '^[a-z0-9_-]{1,40}$')
   THEN RAISE EXCEPTION 'Invalid reply sequence' USING ERRCODE='22023';END IF;
   FOR part IN SELECT value FROM jsonb_array_elements(parts) LOOP
    IF jsonb_typeof(part) IS DISTINCT FROM 'object' OR part->>'type' IS NULL OR part->>'type' NOT IN ('text','image','audio','document')
    THEN RAISE EXCEPTION 'Invalid reply message' USING ERRCODE='22023'; END IF;
    IF part->>'type'='text' THEN
     IF length(trim(coalesce(part->>'text',''))) NOT BETWEEN 1 AND 8000 OR regexp_replace(part->>'text','\{\{\s*customer_name\s*\}\}','','g') ~ '\{\{'
     THEN RAISE EXCEPTION 'Invalid reply text or variable' USING ERRCODE='22023';END IF;
    ELSE
     SELECT m.* INTO src FROM inbox_messages m JOIN inbox_threads th ON th.id=m.thread_id
      JOIN inbox_connections c ON c.id=th.connection_id AND c.environment=e AND c.enabled
      WHERE m.id=(part->>'message_id')::uuid AND m.workspace_id=w AND m.sender IN ('seller','ai') AND m.state IN ('sent','delivered','seen') AND m.type=part->>'type'
       AND EXISTS(SELECT 1 FROM inbox_media f WHERE f.id=(m.content->>'media_id')::uuid AND f.workspace_id=w);
     IF src.id IS NULL THEN RAISE EXCEPTION 'Saved media unavailable' USING ERRCODE='42501';END IF;
    END IF;
   END LOOP;
   IF regexp_replace(coalesce(b->>'body',''),'\{\{\s*customer_name\s*\}\}','','g') ~ '\{\{'
   THEN RAISE EXCEPTION 'Unsupported reply variable' USING ERRCODE='22023';END IF;
  END IF;
  SELECT EXISTS(SELECT 1 FROM briofold_inbox_events WHERE workspace_id=w AND operation_key=k) INTO prior;
 END IF;
 r:=briofold_inbox_work_write_before_sequences(w,e,a,t,k,act,b);
 IF act='saved-reply' AND NOT prior THEN
  UPDATE briofold_inbox_saved_replies SET messages=parts,shortcut=coalesce(b->>'shortcut',''),visibility=coalesce(b->>'visibility','team'),created_by=CASE WHEN coalesce(b->>'visibility','team')='private' THEN a ELSE coalesce(created_by,a) END
   WHERE id=(b->>'id')::uuid AND workspace_id=w AND environment=e;
 END IF;
 RETURN r;
END $$;
CREATE OR REPLACE FUNCTION briofold_inbox_work_read(w uuid,e text,a uuid,t uuid,off integer DEFAULT 0,ticket_offset integer DEFAULT 0,history_offset integer DEFAULT 0,filters jsonb DEFAULT '{}') RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE v inbox_threads;r jsonb;BEGIN
 PERFORM briofold_inbox_actor(w,a,'inbox:read');
 IF e IS NULL OR e NOT IN ('live','sandbox') OR off IS NULL OR off NOT BETWEEN 0 AND 10000 OR ticket_offset IS NULL OR ticket_offset NOT BETWEEN 0 AND 10000 OR history_offset IS NULL OR history_offset NOT BETWEEN 0 AND 10000 THEN RAISE EXCEPTION 'Invalid workflow page' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(filters) IS DISTINCT FROM 'object' OR pg_column_size(filters)>8192 OR length(coalesce(filters->>'q',''))>100 OR length(coalesce(filters->>'member_query',''))>100 OR length(coalesce(filters->>'category',''))>80 THEN RAISE EXCEPTION 'Invalid search filter' USING ERRCODE='22023'; END IF;
 IF coalesce(filters->>'reply_state','active') NOT IN ('active','archived') THEN RAISE EXCEPTION 'Invalid reply state' USING ERRCODE='22023';END IF;
 IF t IS NOT NULL THEN v:=inbox_scope(w,e,t);END IF;
 SELECT jsonb_build_object('reply_sequences_enabled',true,'server_time',now(),
  'work',CASE WHEN t IS NOT NULL THEN coalesce((SELECT to_jsonb(x)-'workspace_id' FROM briofold_inbox_work x WHERE thread_id=t),jsonb_build_object('thread_id',t,'revision',0,'owner_id',NULL,'status','open','priority','normal','labels','[]'::jsonb,'due_at',NULL,'snooze_until',NULL,'return_at',NULL,'disputed',false,'handover_reason','')) END,
  'members',coalesce((SELECT jsonb_agg(jsonb_build_object('id',u.id,'name',u.display_name) ORDER BY u.display_name,u.id) FROM (SELECT u.id,u.display_name FROM workspace_members m JOIN app_users u ON u.id=m.user_id WHERE m.workspace_id=w AND m.role IN ('owner','admin','editor') AND u.disabled_at IS NULL AND pg13_capability_override(w,u.id,'inbox:send') IS DISTINCT FROM false AND u.display_name ILIKE '%'||coalesce(filters->>'member_query','')||'%' ORDER BY u.display_name,u.id LIMIT 50) u),'[]'),
  'more_members',(SELECT count(*)>50 FROM workspace_members m JOIN app_users u ON u.id=m.user_id WHERE m.workspace_id=w AND m.role IN ('owner','admin','editor') AND u.disabled_at IS NULL AND pg13_capability_override(w,u.id,'inbox:send') IS DISTINCT FROM false AND u.display_name ILIKE '%'||coalesce(filters->>'member_query','')||'%'),
  'duty',coalesce((SELECT state FROM briofold_inbox_duty WHERE workspace_id=w AND user_id=a AND environment=e),'away'),
  'reply_media',coalesce((SELECT jsonb_agg(to_jsonb(media)) FROM (SELECT m.id,m.type,m.content->>'name' AS name FROM inbox_messages m JOIN inbox_threads th ON th.id=m.thread_id JOIN inbox_connections c ON c.id=th.connection_id AND c.environment=e AND c.enabled WHERE m.workspace_id=w AND m.sender IN ('seller','ai') AND m.state IN ('sent','delivered','seen') AND m.type IN ('image','audio','document') ORDER BY m.created_at DESC LIMIT 50) media),'[]'::jsonb),
  'saved_replies',coalesce((SELECT jsonb_agg(to_jsonb(x)-'workspace_id' ORDER BY x.updated_at DESC,x.id) FROM (SELECT * FROM briofold_inbox_saved_replies WHERE workspace_id=w AND environment=e AND active=(coalesce(filters->>'reply_state','active')<>'archived') AND (visibility='team' OR created_by=a) AND (coalesce(filters->>'q','')='' OR title ILIKE '%'||(filters->>'q')||'%' OR body ILIKE '%'||(filters->>'q')||'%' OR shortcut ILIKE '%'||(filters->>'q')||'%') AND (coalesce(filters->>'category','')='' OR category=filters->>'category') ORDER BY updated_at DESC,id OFFSET off LIMIT 50)x),'[]'),
  'more_replies',(SELECT count(*)>off+50 FROM briofold_inbox_saved_replies WHERE workspace_id=w AND environment=e AND active=(coalesce(filters->>'reply_state','active')<>'archived') AND (visibility='team' OR created_by=a) AND (coalesce(filters->>'q','')='' OR title ILIKE '%'||(filters->>'q')||'%' OR body ILIKE '%'||(filters->>'q')||'%' OR shortcut ILIKE '%'||(filters->>'q')||'%') AND (coalesce(filters->>'category','')='' OR category=filters->>'category')),
  'tickets',coalesce((SELECT jsonb_agg(to_jsonb(x)-'workspace_id' ORDER BY x.created_at DESC,x.id) FROM (SELECT q.*,z.customer_name FROM briofold_inbox_tickets q JOIN inbox_threads z ON z.id=q.thread_id JOIN inbox_connections c ON c.id=z.connection_id WHERE q.workspace_id=w AND (t IS NULL OR q.thread_id=t) AND c.environment=e AND c.enabled AND (coalesce(filters->>'q','')='' OR q.title ILIKE '%'||(filters->>'q')||'%' OR q.detail ILIKE '%'||(filters->>'q')||'%' OR z.customer_name ILIKE '%'||(filters->>'q')||'%') AND (coalesce(filters->>'ticket_status','')='' OR q.status=filters->>'ticket_status') ORDER BY q.created_at DESC,q.id OFFSET ticket_offset LIMIT 50)x),'[]'),
  'more_tickets',(SELECT count(*)>ticket_offset+50 FROM briofold_inbox_tickets q JOIN inbox_threads z ON z.id=q.thread_id JOIN inbox_connections c ON c.id=z.connection_id WHERE q.workspace_id=w AND (t IS NULL OR q.thread_id=t) AND c.environment=e AND c.enabled AND (coalesce(filters->>'q','')='' OR q.title ILIKE '%'||(filters->>'q')||'%' OR q.detail ILIKE '%'||(filters->>'q')||'%' OR z.customer_name ILIKE '%'||(filters->>'q')||'%') AND (coalesce(filters->>'ticket_status','')='' OR q.status=filters->>'ticket_status')),
  'more_history',(SELECT count(*)>history_offset+50 FROM briofold_inbox_events WHERE workspace_id=w AND thread_id=t),
  'history',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC,x.operation_key) FROM (SELECT operation_key,actor_id,action,created_at FROM briofold_inbox_events WHERE workspace_id=w AND thread_id=t ORDER BY created_at DESC,operation_key OFFSET history_offset LIMIT 50)x),'[]'),
  'note',coalesce(v.note,''),'note_version',coalesce(v.note_version,0),
  'can_send',((SELECT role FROM workspace_members WHERE workspace_id=w AND user_id=a) IN ('owner','admin','editor') OR pg13_capability_override(w,a,'inbox:send') IS TRUE) AND pg13_capability_override(w,a,'inbox:send') IS DISTINCT FROM false,
  'can_manage',((SELECT role FROM workspace_members WHERE workspace_id=w AND user_id=a) IN ('owner','admin') OR pg13_capability_override(w,a,'inbox:manage') IS TRUE) AND pg13_capability_override(w,a,'inbox:manage') IS DISTINCT FROM false
 ) INTO r;RETURN r;
END $$;

CREATE FUNCTION briofold_saved_reply_send(w uuid,e text,a uuid,t uuid,k uuid,b jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE reply briofold_inbox_saved_replies;v inbox_threads;part jsonb;parts jsonb;prior briofold_inbox_events;source inbox_messages;result jsonb:='[]';sent jsonb;idx integer:=0;key uuid;fp text;
BEGIN
 PERFORM briofold_inbox_actor(w,a,'inbox:send');
 PERFORM 1 FROM workspace_members m JOIN app_users u ON u.id=m.user_id WHERE m.workspace_id=w AND m.user_id=a FOR SHARE OF m,u;
 PERFORM briofold_inbox_actor(w,a,'inbox:send');
 IF k IS NULL OR jsonb_typeof(b) IS DISTINCT FROM 'object' OR (b->>'confirmed')::boolean IS DISTINCT FROM true THEN RAISE EXCEPTION 'Confirm reply sequence' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('briofold:inbox-work:'||w::text,0));
 v:=inbox_scope(w,e,t);PERFORM 1 FROM inbox_threads WHERE id=t FOR UPDATE;
 fp:=encode(digest(e||':'||t::text||':send-saved-reply:'||b::text,'sha256'),'hex');
 SELECT * INTO prior FROM briofold_inbox_events WHERE workspace_id=w AND operation_key=k;
 IF FOUND THEN
  IF prior.actor_id<>a OR prior.request_hash<>fp THEN RAISE EXCEPTION 'Reply send key conflict' USING ERRCODE='23505';END IF;
  RETURN prior.result;
 END IF;
 SELECT * INTO reply FROM briofold_inbox_saved_replies WHERE id=(b->>'id')::uuid AND workspace_id=w AND environment=e AND active AND (visibility='team' OR created_by=a) FOR SHARE;
 IF reply.id IS NULL THEN RAISE EXCEPTION 'Reply unavailable' USING ERRCODE='42501';END IF;
 IF reply.revision IS DISTINCT FROM (b->>'revision')::bigint THEN RAISE EXCEPTION 'Reply changed, review again' USING ERRCODE='40001';END IF;
 IF (SELECT count(*) FROM briofold_inbox_events WHERE workspace_id=w AND created_at>now()-interval '1 minute')>=120 THEN RAISE EXCEPTION 'Workflow rate limit' USING ERRCODE='54000';END IF;
 parts:=CASE WHEN jsonb_array_length(reply.messages)>0 THEN reply.messages ELSE jsonb_build_array(jsonb_build_object('type','text','text',reply.body)) END;
 FOR part IN SELECT value FROM jsonb_array_elements(parts) LOOP
  idx:=idx+1;key:=md5(k::text||':'||idx)::uuid;
  IF part->>'type'='text' THEN
   sent:=inbox_action(w,e,a,t,'send',jsonb_build_object('idempotency_key',key,'text',regexp_replace(part->>'text','\{\{\s*customer_name\s*\}\}',replace(v.customer_name,'\','\\'),'g')));
  ELSE
   SELECT m.* INTO source FROM inbox_messages m JOIN inbox_threads th ON th.id=m.thread_id JOIN inbox_connections c ON c.id=th.connection_id AND c.enabled AND c.environment=e WHERE m.id=(part->>'message_id')::uuid AND m.workspace_id=w AND m.sender IN ('seller','ai') AND m.state IN ('sent','delivered','seen') AND m.type=part->>'type';
   IF source.id IS NULL THEN RAISE EXCEPTION 'Reply media unavailable' USING ERRCODE='42501';END IF;
   IF source.thread_id=t THEN
    sent:=inbox_advanced(w,e,a,t,'send-media',jsonb_build_object('idempotency_key',key,'media_id',source.content->>'media_id'));
   ELSE
    sent:=inbox_advanced(w,e,a,t,'forward',jsonb_build_object('idempotency_key',key,'message_id',part->>'message_id'));
   END IF;
   IF sent->>'type' IS DISTINCT FROM part->>'type' THEN RAISE EXCEPTION 'Reply media changed' USING ERRCODE='40001';END IF;
  END IF;
  UPDATE inbox_messages SET batch_id=k WHERE id=(sent->>'id')::uuid AND workspace_id=w AND thread_id=t;
  result:=result||jsonb_build_array(jsonb_build_object('id',sent->>'id','type',sent->>'type','state',sent->>'state'));
 END LOOP;
 result:=jsonb_build_object('queued',result);
 INSERT INTO briofold_inbox_events VALUES(w,k,t,a,'send-saved-reply',fp,result,now());
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION briofold_inbox_work_write(uuid,text,uuid,uuid,uuid,text,jsonb),briofold_saved_reply_send(uuid,text,uuid,uuid,uuid,jsonb) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION briofold_inbox_work_write(uuid,text,uuid,uuid,uuid,text,jsonb),briofold_saved_reply_send(uuid,text,uuid,uuid,uuid,jsonb) TO ekmivo_financial_runtime,ekmivo_financial_projection;
CREATE OR REPLACE FUNCTION inbox_next_send_v1() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE m inbox_messages;result jsonb;BEGIN
 PERFORM briofold_inbox_due_returns();
 UPDATE inbox_messages x SET state='failed',error_code='AI_CONTEXT_CHANGED' WHERE x.sender='ai' AND x.state='queued' AND NOT EXISTS(SELECT 1 FROM briofold_ai_channel_jobs j WHERE j.message_id=x.id AND j.state='completed' AND briofold_ai_channel_valid(j.id));
 UPDATE inbox_messages SET state='uncertain',error_code='WORKER_OUTCOME_UNKNOWN' WHERE state='sending' AND attempt_at<now()-interval '1 minute';
 UPDATE inbox_messages x SET state='failed',error_code='HUMAN_TAKEOVER' FROM inbox_threads t WHERE x.thread_id=t.id AND x.state='queued' AND x.sender='ai' AND (NOT t.ai_enabled OR EXISTS(SELECT 1 FROM briofold_inbox_work z WHERE z.thread_id=t.id AND (z.disputed OR z.status='resolved')) OR EXISTS(SELECT 1 FROM briofold_inbox_tickets q WHERE q.thread_id=t.id AND q.category IN ('complaint','refund','return') AND q.status<>'resolved'));
 UPDATE inbox_messages x SET state='failed',error_code='WINDOW_CLOSED' FROM inbox_threads t WHERE x.thread_id=t.id AND x.state='queued' AND t.last_customer_at<=now()-interval '24 hours';
 SELECT x.* INTO m FROM inbox_messages x JOIN inbox_threads t ON t.id=x.thread_id JOIN inbox_connections c ON c.id=t.connection_id AND c.enabled JOIN workspace_product_access p ON p.workspace_id=x.workspace_id AND p.product='ai' AND p.enabled WHERE x.state='queued' AND (x.batch_id IS NULL OR NOT EXISTS(SELECT 1 FROM inbox_messages earlier WHERE earlier.thread_id=x.thread_id AND earlier.batch_id=x.batch_id AND earlier.sequence<x.sequence AND earlier.state NOT IN ('sent','delivered','seen'))) AND (x.sender<>'ai' OR (t.ai_enabled AND EXISTS(SELECT 1 FROM briofold_ai_channel_jobs j WHERE j.message_id=x.id AND j.state='completed' AND briofold_ai_channel_valid(j.id)))) AND t.last_customer_at>now()-interval '24 hours' ORDER BY x.sequence FOR UPDATE OF t,x SKIP LOCKED LIMIT 1;
 IF m.id IS NULL THEN RETURN NULL;END IF;
 UPDATE inbox_messages SET state='sending',attempt_at=now(),attempts=attempts+1 WHERE id=m.id;
 SELECT jsonb_build_object('id',m.id,'workspace_id',m.workspace_id,'text',m.body,'channel',c.provider,'account',c.external_id,'recipient',t.external_id,'credential',encode(c.credential_cipher,'base64')) INTO result FROM inbox_threads t JOIN inbox_connections c ON c.id=t.connection_id WHERE t.id=m.thread_id;RETURN result;
END $$;
COMMIT;
