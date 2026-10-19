-- CONTROL database: shared web/native inbox, never a payment-realm table.
BEGIN;
CREATE TABLE inbox_connections (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id),
 environment text NOT NULL CHECK(environment IN ('live','sandbox')),provider text NOT NULL CHECK(provider IN ('wa','ig','ms')),external_id text NOT NULL,
 credential_cipher bytea NOT NULL,enabled boolean NOT NULL DEFAULT true,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(provider,external_id),UNIQUE(workspace_id,id)
);
CREATE TABLE inbox_threads (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id),
 connection_id uuid NOT NULL,external_id text NOT NULL,customer_name text NOT NULL,
 ai_enabled boolean NOT NULL DEFAULT true,ai_version bigint NOT NULL DEFAULT 1,
 last_customer_at timestamptz,last_activity_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(workspace_id,connection_id) REFERENCES inbox_connections(workspace_id,id),
 UNIQUE(connection_id,external_id),UNIQUE(workspace_id,id)
);
CREATE TABLE inbox_messages (
 sequence bigint GENERATED ALWAYS AS IDENTITY UNIQUE,id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL,thread_id uuid NOT NULL,sender text NOT NULL CHECK(sender IN ('customer','seller','ai')),
 type text NOT NULL DEFAULT 'text' CHECK(type IN ('text','unsupported')),body text NOT NULL CHECK(length(body)<=8000),
 provider_id text,idempotency_key uuid,reply_to uuid,state text NOT NULL CHECK(state IN ('received','queued','sending','sent','delivered','seen','failed','uncertain')),
 created_at timestamptz NOT NULL DEFAULT now(),sent_at timestamptz,delivered_at timestamptz,seen_at timestamptz,
 attempt_at timestamptz,attempts integer NOT NULL DEFAULT 0,error_code text NOT NULL DEFAULT '',
 FOREIGN KEY(workspace_id,thread_id) REFERENCES inbox_threads(workspace_id,id),
 UNIQUE(workspace_id,id),UNIQUE(thread_id,provider_id),UNIQUE(thread_id,idempotency_key),
 FOREIGN KEY(workspace_id,reply_to) REFERENCES inbox_messages(workspace_id,id)
);
CREATE INDEX inbox_threads_activity ON inbox_threads(workspace_id,last_activity_at DESC,id);
CREATE INDEX inbox_messages_thread_sequence ON inbox_messages(workspace_id,thread_id,sequence DESC);
CREATE INDEX inbox_send_queue ON inbox_messages(created_at) WHERE state='queued';
ALTER TABLE mobile_devices ADD CONSTRAINT mobile_devices_workspace_id_key UNIQUE(workspace_id,id);
CREATE TABLE inbox_read_cursors(workspace_id uuid NOT NULL,thread_id uuid NOT NULL,device_id uuid NOT NULL,reader_kind text NOT NULL DEFAULT 'device' CHECK(reader_kind IN ('device','user')),sequence bigint NOT NULL DEFAULT 0,
 PRIMARY KEY(thread_id,device_id,reader_kind),FOREIGN KEY(workspace_id,thread_id) REFERENCES inbox_threads(workspace_id,id));
-- mobile_devices currently has a realm-qualified uniqueness; use explicit workspace/device key.
CREATE TABLE inbox_webhook_events(id text PRIMARY KEY,provider text NOT NULL,event_cipher bytea NOT NULL,received_at timestamptz NOT NULL DEFAULT now(),processed_at timestamptz,error_code text NOT NULL DEFAULT '');
ALTER TABLE inbox_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox_messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox_read_cursors ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox_webhook_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON inbox_connections,inbox_threads,inbox_messages,inbox_read_cursors,inbox_webhook_events FROM PUBLIC,ekmivo_financial_runtime;
CREATE FUNCTION inbox_page(w uuid,e text,d uuid,t uuid,before_seq bigint,f jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;rk text:=coalesce(f->>'reader_kind','device');
BEGIN
 IF NOT EXISTS(SELECT 1 FROM workspace_product_access WHERE workspace_id=w AND product='ai' AND enabled) THEN RAISE EXCEPTION 'AI disabled' USING ERRCODE='42501'; END IF;
 IF t IS NOT NULL THEN
  IF NOT EXISTS(SELECT 1 FROM inbox_threads a JOIN inbox_connections c ON c.id=a.connection_id WHERE a.id=t AND a.workspace_id=w AND c.enabled AND c.environment=e) THEN RAISE EXCEPTION 'thread unavailable' USING ERRCODE='42501'; END IF;
  SELECT jsonb_build_object('thread',jsonb_build_object('id',a.id,'name',a.customer_name,'channel',c.provider,'ai_enabled',a.ai_enabled,'last_customer_at',a.last_customer_at,'window_open',coalesce(a.last_customer_at>now()-interval '24 hours',false)),
   'items',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.sequence) FROM (SELECT m.id,m.sequence,m.sender,m.type,m.body,m.state,m.created_at,m.sent_at,m.delivered_at,m.seen_at,m.reply_to,m.error_code FROM inbox_messages m WHERE m.workspace_id=w AND m.thread_id=t AND (before_seq IS NULL OR m.sequence<before_seq) ORDER BY m.sequence DESC LIMIT 50)x),'[]'::jsonb)) INTO result
  FROM inbox_threads a JOIN inbox_connections c ON c.id=a.connection_id WHERE a.id=t AND a.workspace_id=w;
  RETURN result;
 END IF;
 SELECT jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.last_activity_at DESC,x.id),'[]'::jsonb)) INTO result FROM (
  SELECT a.id,a.customer_name AS name,c.provider AS channel,a.ai_enabled,a.last_activity_at,
   (SELECT body FROM inbox_messages WHERE thread_id=a.id ORDER BY sequence DESC LIMIT 1) AS preview,
   (SELECT sender FROM inbox_messages WHERE thread_id=a.id ORDER BY sequence DESC LIMIT 1) AS preview_sender,
   (SELECT count(*) FROM inbox_messages WHERE thread_id=a.id AND sender='customer' AND sequence>coalesce((SELECT sequence FROM inbox_read_cursors WHERE thread_id=a.id AND device_id=d AND reader_kind=rk),0)) AS unread
  FROM inbox_threads a JOIN inbox_connections c ON c.id=a.connection_id
  WHERE a.workspace_id=w AND c.enabled AND c.environment=e
  AND (coalesce(f->>'q','')='' OR a.customer_name ILIKE '%'||(f->>'q')||'%')
  AND (coalesce(f->>'channel','')='' OR c.provider=f->>'channel')
  AND (coalesce(f->>'mode','')='' OR (f->>'mode'='ai' AND a.ai_enabled) OR (f->>'mode'='seller' AND NOT a.ai_enabled) OR (f->>'mode'='waiting' AND (SELECT sender='customer' FROM inbox_messages WHERE thread_id=a.id ORDER BY sequence DESC LIMIT 1)))
  AND (coalesce((f->>'days')::integer,0)=0 OR a.last_activity_at>=now()-make_interval(days=>(f->>'days')::integer))
  AND (coalesce((f->>'unread')::boolean,false)=false OR EXISTS(SELECT 1 FROM inbox_messages m WHERE m.thread_id=a.id AND m.sender='customer' AND m.sequence>coalesce((SELECT sequence FROM inbox_read_cursors WHERE thread_id=a.id AND device_id=d AND reader_kind=rk),0)))
  ORDER BY a.last_activity_at DESC,a.id OFFSET coalesce((f->>'offset')::integer,0) LIMIT 50
 )x;
 RETURN result;
END $$;
CREATE FUNCTION inbox_action(w uuid,e text,d uuid,t uuid,a text,b jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE thread inbox_threads; msg inbox_messages; upto bigint; quoted uuid;rk text:=coalesce(b->>'reader_kind','device');
BEGIN
 IF NOT EXISTS(SELECT 1 FROM workspace_product_access WHERE workspace_id=w AND product='ai' AND enabled) THEN RAISE EXCEPTION 'AI disabled' USING ERRCODE='42501'; END IF;
 SELECT x.* INTO thread FROM inbox_threads x JOIN inbox_connections c ON c.id=x.connection_id AND c.enabled AND c.environment=e WHERE x.id=t AND x.workspace_id=w FOR UPDATE OF x;
 IF thread.id IS NULL THEN RAISE EXCEPTION 'thread unavailable' USING ERRCODE='42501'; END IF;
 IF a='read' THEN
  SELECT max(sequence) INTO upto FROM inbox_messages WHERE thread_id=t AND workspace_id=w AND sequence<=coalesce((b->>'sequence')::bigint,0);
  IF upto IS NOT NULL THEN INSERT INTO inbox_read_cursors VALUES(w,t,d,rk,upto) ON CONFLICT(thread_id,device_id,reader_kind) DO UPDATE SET sequence=greatest(inbox_read_cursors.sequence,EXCLUDED.sequence); END IF;
  RETURN jsonb_build_object('saved',true);
 ELSIF a='ai' THEN
  UPDATE inbox_threads SET ai_enabled=(b->>'enabled')::boolean,ai_version=ai_version+1 WHERE id=t;
  RETURN jsonb_build_object('saved',true);
 ELSIF a='retry' THEN
  UPDATE inbox_messages SET state='queued',error_code='' WHERE id=(b->>'message_id')::uuid AND workspace_id=w AND thread_id=t AND state='failed' AND thread.last_customer_at>now()-interval '24 hours' RETURNING * INTO msg;
  IF msg.id IS NULL THEN RAISE EXCEPTION 'retry unavailable' USING ERRCODE='22023'; END IF;
  RETURN to_jsonb(msg)-'workspace_id';
 ELSIF a='send' THEN
  SELECT * INTO msg FROM inbox_messages WHERE thread_id=t AND idempotency_key=(b->>'idempotency_key')::uuid;
  IF msg.id IS NOT NULL THEN
   IF msg.body IS DISTINCT FROM b->>'text' OR coalesce(msg.reply_to::text,'')<>coalesce(b->>'reply_to','') THEN RAISE EXCEPTION 'idempotency conflict' USING ERRCODE='23505'; END IF;
   RETURN to_jsonb(msg)-'workspace_id';
  END IF;
  IF thread.last_customer_at IS NULL OR thread.last_customer_at<=now()-interval '24 hours' THEN RAISE EXCEPTION 'WINDOW_CLOSED' USING ERRCODE='22023'; END IF;
  IF length(trim(b->>'text')) NOT BETWEEN 1 AND 8000 THEN RAISE EXCEPTION 'invalid message' USING ERRCODE='22023'; END IF;
  quoted:=(b->>'reply_to')::uuid;
  IF quoted IS NOT NULL AND NOT EXISTS(SELECT 1 FROM inbox_messages WHERE id=quoted AND workspace_id=w AND thread_id=t) THEN RAISE EXCEPTION 'invalid reply' USING ERRCODE='42501'; END IF;
  INSERT INTO inbox_messages(workspace_id,thread_id,sender,body,state,idempotency_key,reply_to) VALUES(w,t,'seller',b->>'text','queued',(b->>'idempotency_key')::uuid,quoted) RETURNING * INTO msg;
  UPDATE inbox_threads SET ai_enabled=false,ai_version=ai_version+1,last_activity_at=now() WHERE id=t;
  RETURN to_jsonb(msg)-'workspace_id';
 END IF;
 RAISE EXCEPTION 'unsupported action' USING ERRCODE='22023';
END $$;
CREATE FUNCTION inbox_ingest(c uuid,p text,s text,n text,b text,k text,at_time timestamptz) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE conn inbox_connections; t uuid; inserted integer;
BEGIN
 SELECT * INTO conn FROM inbox_connections WHERE id=c AND enabled;
 IF conn.id IS NULL THEN RETURN false; END IF;
 INSERT INTO inbox_threads(workspace_id,connection_id,external_id,customer_name,last_customer_at,last_activity_at) VALUES(conn.workspace_id,c,s,coalesce(nullif(n,''),s),at_time,at_time) ON CONFLICT(connection_id,external_id) DO UPDATE SET last_customer_at=greatest(inbox_threads.last_customer_at,EXCLUDED.last_customer_at),last_activity_at=greatest(inbox_threads.last_activity_at,EXCLUDED.last_activity_at) RETURNING id INTO t;
 INSERT INTO inbox_messages(workspace_id,thread_id,sender,type,body,provider_id,state,created_at) VALUES(conn.workspace_id,t,'customer',k,b,p,'received',at_time) ON CONFLICT(thread_id,provider_id) DO NOTHING;
 GET DIAGNOSTICS inserted=ROW_COUNT;RETURN inserted>0;
END $$;
CREATE FUNCTION inbox_connection(w uuid,e text,p text,x text,k bytea) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result uuid;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM workspace_product_access WHERE workspace_id=w AND product='ai' AND enabled) THEN RAISE EXCEPTION 'AI disabled' USING ERRCODE='42501'; END IF;
 INSERT INTO inbox_connections(workspace_id,environment,provider,external_id,credential_cipher) VALUES(w,e,p,x,k)
 ON CONFLICT(provider,external_id) DO UPDATE SET credential_cipher=EXCLUDED.credential_cipher,enabled=true WHERE inbox_connections.workspace_id=w AND inbox_connections.environment=e RETURNING id INTO result;
 IF result IS NULL THEN RAISE EXCEPTION 'connection owned elsewhere' USING ERRCODE='42501'; END IF;RETURN result;
END $$;
-- Minimal worker functions; secrets stay server-side and have no app read grant.
CREATE FUNCTION inbox_next_send() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE m inbox_messages; result jsonb;
BEGIN
 UPDATE inbox_messages SET state='uncertain',error_code='WORKER_OUTCOME_UNKNOWN' WHERE state='sending' AND attempt_at<now()-interval '1 minute';
 UPDATE inbox_messages expired SET state='failed',error_code='WINDOW_CLOSED' FROM inbox_threads t WHERE expired.thread_id=t.id AND expired.state='queued' AND t.last_customer_at<=now()-interval '24 hours';
 SELECT x.* INTO m FROM inbox_messages x JOIN inbox_threads t ON t.id=x.thread_id JOIN inbox_connections c ON c.id=t.connection_id AND c.enabled
 JOIN workspace_product_access p ON p.workspace_id=x.workspace_id AND p.product='ai' AND p.enabled
 WHERE x.state='queued' AND t.last_customer_at>now()-interval '24 hours' ORDER BY x.sequence FOR UPDATE OF x SKIP LOCKED LIMIT 1;
 IF m.id IS NULL THEN RETURN NULL; END IF;
 UPDATE inbox_messages SET state='sending',attempt_at=now(),attempts=attempts+1 WHERE id=m.id;
 SELECT jsonb_build_object('id',m.id,'workspace_id',m.workspace_id,'text',m.body,'channel',c.provider,'account',c.external_id,'recipient',t.external_id,'credential',encode(c.credential_cipher,'base64')) INTO result FROM inbox_threads t JOIN inbox_connections c ON c.id=t.connection_id WHERE t.id=m.thread_id;
 RETURN result;
END $$;
CREATE FUNCTION inbox_finish_send(i uuid,p text,s text,err text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF s NOT IN ('sent','failed','uncertain') THEN RAISE EXCEPTION 'invalid state'; END IF;
 UPDATE inbox_messages SET state=s,provider_id=nullif(p,''),error_code=err,sent_at=CASE WHEN s='sent' THEN now() ELSE sent_at END WHERE id=i AND state='sending';
 PERFORM inbox_status(x.connection_id,x.provider_id,x.status,x.occurred_at) FROM inbox_status_events x JOIN inbox_threads t ON t.connection_id=x.connection_id JOIN inbox_messages m ON m.thread_id=t.id WHERE m.id=i AND x.provider_id=p;
END $$;
CREATE FUNCTION inbox_provider_connections(p text,x text) RETURNS TABLE(id uuid,workspace_id uuid,credential_cipher bytea) LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT id,workspace_id,credential_cipher FROM inbox_connections WHERE provider=p AND external_id=x AND enabled $$;
CREATE FUNCTION inbox_webhook_record(i text,p text,b bytea) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE n integer;
BEGIN
 INSERT INTO inbox_webhook_events(id,provider,event_cipher) VALUES(i,p,b) ON CONFLICT DO NOTHING;GET DIAGNOSTICS n=ROW_COUNT;RETURN n>0;
END $$;
REVOKE ALL ON FUNCTION inbox_page(uuid,text,uuid,uuid,bigint,jsonb),inbox_action(uuid,text,uuid,uuid,text,jsonb),inbox_ingest(uuid,text,text,text,text,text,timestamptz),inbox_connection(uuid,text,text,text,bytea),inbox_next_send(),inbox_finish_send(uuid,text,text,text),inbox_provider_connections(text,text),inbox_webhook_record(text,text,bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION inbox_page(uuid,text,uuid,uuid,bigint,jsonb),inbox_action(uuid,text,uuid,uuid,text,jsonb),inbox_ingest(uuid,text,text,text,text,text,timestamptz),inbox_connection(uuid,text,text,text,bytea),inbox_next_send(),inbox_finish_send(uuid,text,text,text),inbox_provider_connections(text,text),inbox_webhook_record(text,text,bytea) TO ekmivo_financial_runtime;
CREATE TABLE inbox_status_events(connection_id uuid NOT NULL REFERENCES inbox_connections(id),provider_id text NOT NULL,status text NOT NULL CHECK(status IN ('sent','delivered','seen','failed')),occurred_at timestamptz NOT NULL,PRIMARY KEY(connection_id,provider_id,status));
ALTER TABLE inbox_status_events ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON inbox_status_events FROM PUBLIC,ekmivo_financial_runtime;
CREATE FUNCTION inbox_status(c uuid,p text,s text,at_time timestamptz) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 INSERT INTO inbox_status_events VALUES(c,p,s,at_time) ON CONFLICT(connection_id,provider_id,status) DO UPDATE SET occurred_at=least(inbox_status_events.occurred_at,EXCLUDED.occurred_at);
 UPDATE inbox_messages m SET
 seen_at=CASE WHEN s='seen' THEN coalesce(m.seen_at,at_time) ELSE m.seen_at END,
 delivered_at=CASE WHEN s='delivered' THEN coalesce(m.delivered_at,at_time) ELSE m.delivered_at END,
 sent_at=CASE WHEN s='sent' THEN coalesce(m.sent_at,at_time) ELSE m.sent_at END,
 state=CASE WHEN m.seen_at IS NOT NULL OR s='seen' THEN 'seen' WHEN m.delivered_at IS NOT NULL OR s='delivered' THEN 'delivered' WHEN s='failed' AND m.state NOT IN ('seen','delivered') THEN 'failed' ELSE m.state END
 FROM inbox_threads t WHERE m.thread_id=t.id AND t.connection_id=c AND m.provider_id=p AND m.sender<>'customer';
END $$;
REVOKE ALL ON FUNCTION inbox_status(uuid,text,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION inbox_status(uuid,text,text,timestamptz) TO ekmivo_financial_runtime;
CREATE FUNCTION inbox_seen_watermark(c uuid,r text,at_time timestamptz) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 UPDATE inbox_messages m SET state='seen',seen_at=coalesce(seen_at,at_time)
 FROM inbox_threads t WHERE m.thread_id=t.id AND t.connection_id=c AND t.external_id=r AND m.sender<>'customer' AND m.created_at<=at_time AND m.provider_id IS NOT NULL
$$;
REVOKE ALL ON FUNCTION inbox_seen_watermark(uuid,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION inbox_seen_watermark(uuid,text,timestamptz) TO ekmivo_financial_runtime;
CREATE FUNCTION inbox_connection_list(w uuid,e text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('items',coalesce(jsonb_agg(jsonb_build_object('id',id,'provider',provider,'enabled',enabled) ORDER BY created_at),'[]'::jsonb)) FROM inbox_connections WHERE workspace_id=w AND environment=e
$$;
CREATE FUNCTION inbox_disconnect(w uuid,e text,i uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE n integer;
BEGIN UPDATE inbox_connections SET enabled=false WHERE id=i AND workspace_id=w AND environment=e;GET DIAGNOSTICS n=ROW_COUNT;RETURN n>0;END $$;
REVOKE ALL ON FUNCTION inbox_connection_list(uuid,text),inbox_disconnect(uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION inbox_connection_list(uuid,text),inbox_disconnect(uuid,text,uuid) TO ekmivo_financial_runtime;
COMMIT;
