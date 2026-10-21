-- Control-only durable AI work. All paid generation goes through the existing meter.
BEGIN;
DO $$BEGIN
 IF to_regclass('public.briofold_inbox_work') IS NULL OR to_regclass('public.financial_realm') IS NOT NULL THEN RAISE EXCEPTION '0135 requires control Inbox workflow';END IF;
END $$;
CREATE TABLE briofold_ai_channel_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL,thread_id uuid NOT NULL,inbound_id uuid NOT NULL UNIQUE,
 publication_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES app_users(id),
 state text NOT NULL DEFAULT 'queued' CHECK(state IN ('queued','running','completed','review','cancelled')),
 request_key text NOT NULL UNIQUE,lease_id uuid,leased_at timestamptz,thread_ai_version bigint,
 context jsonb CHECK(pg_column_size(context)<=262144),reason text NOT NULL DEFAULT '' CHECK(length(reason)<=100),
 output_hash text,message_id uuid,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(workspace_id,thread_id) REFERENCES inbox_threads(workspace_id,id),
 FOREIGN KEY(workspace_id,inbound_id) REFERENCES inbox_messages(workspace_id,id),
 FOREIGN KEY(workspace_id,publication_id) REFERENCES briofold_ai_studio_versions(workspace_id,id),
 FOREIGN KEY(workspace_id,message_id) REFERENCES inbox_messages(workspace_id,id)
);
CREATE INDEX briofold_ai_channel_jobs_queue ON briofold_ai_channel_jobs(created_at,id) WHERE state='queued';
CREATE INDEX briofold_ai_channel_jobs_scope ON briofold_ai_channel_jobs(workspace_id,thread_id,created_at DESC);
CREATE UNIQUE INDEX briofold_ai_channel_running_thread ON briofold_ai_channel_jobs(thread_id) WHERE state='running';
ALTER TABLE briofold_ai_channel_jobs ENABLE ROW LEVEL SECURITY;
ALTER TABLE briofold_ai_channel_jobs FORCE ROW LEVEL SECURITY;
DO $$BEGIN EXECUTE format('CREATE POLICY briofold_ai_channel_jobs_owner ON briofold_ai_channel_jobs TO %I USING(true) WITH CHECK(true)',current_user);END $$;
REVOKE ALL ON briofold_ai_channel_jobs FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
CREATE FUNCTION briofold_ai_studio_context(w uuid,a uuid,revision bigint,published boolean,pub uuid,q text) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE d briofold_ai_studio_drafts;cfg jsonb;docs jsonb;products jsonb;BEGIN
 PERFORM briofold_ai_studio_actor(w,a);
 IF q IS NULL OR length(trim(q)) NOT BETWEEN 1 AND 8000 OR published IS NULL THEN RAISE EXCEPTION 'Question required' USING ERRCODE='22023';END IF;
 SELECT * INTO d FROM briofold_ai_studio_drafts WHERE workspace_id=w;
 IF d.revision IS DISTINCT FROM revision OR (published AND (pub IS NULL OR d.published_id IS DISTINCT FROM pub)) THEN RAISE EXCEPTION 'Assistant changed; review again' USING ERRCODE='40001';END IF;
 IF published THEN SELECT config INTO cfg FROM briofold_ai_studio_versions WHERE workspace_id=w AND id=pub;ELSE cfg:=d.config;END IF;
 IF cfg IS NULL OR coalesce(cfg->>'model','')='' THEN RAISE EXCEPTION 'Configured metered model required' USING ERRCODE='22023';END IF;
 docs:=briofold_ai_knowledge_search(w,a,left(q,1000),published);
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') INTO products FROM (SELECT id,name,price_minor,currency,sizes FROM inbox_products WHERE workspace_id=w AND environment='live' AND active AND to_tsvector('simple',name||' '||sizes)@@websearch_to_tsquery('simple',left(q,1000)) ORDER BY id LIMIT 5)x;
 RETURN jsonb_build_object('config',cfg,'publication_id',CASE WHEN published THEN pub END,'revision',d.revision,'knowledge',docs,'products',products,'question',q);
END $$;
CREATE FUNCTION briofold_ai_channel_enqueue() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE pub briofold_ai_studio_versions;j uuid:=gen_random_uuid();BEGIN
 IF NEW.sender<>'customer' OR NEW.type<>'text' OR length(trim(NEW.body))=0 THEN RETURN NEW;END IF;
 SELECT v.* INTO pub FROM briofold_ai_studio_drafts d JOIN briofold_ai_studio_versions v ON v.workspace_id=d.workspace_id AND v.id=d.published_id JOIN inbox_threads t ON t.id=NEW.thread_id JOIN inbox_connections c ON c.id=t.connection_id AND c.enabled AND c.environment='live' JOIN workspace_product_access p ON p.workspace_id=d.workspace_id AND p.product='ai' AND p.enabled WHERE d.workspace_id=NEW.workspace_id AND v.config->>'mode'='live' AND t.ai_enabled;
 IF pub.id IS NULL THEN RETURN NEW;END IF;
 -- Coalesce a burst to its newest question; a running generation is version-checked at finish.
 UPDATE briofold_ai_channel_jobs SET state='cancelled',reason='NEWER_CUSTOMER_MESSAGE',updated_at=now() WHERE thread_id=NEW.thread_id AND state='queued';
 IF (SELECT count(*) FROM briofold_ai_channel_jobs WHERE workspace_id=NEW.workspace_id AND state IN ('queued','running'))>=1000 THEN RETURN NEW;END IF;
 INSERT INTO briofold_ai_channel_jobs(id,workspace_id,thread_id,inbound_id,publication_id,actor_id,request_key) VALUES(j,NEW.workspace_id,NEW.thread_id,NEW.id,pub.id,pub.actor_id,'inbox:'||j::text) ON CONFLICT(inbound_id) DO NOTHING;RETURN NEW;
END $$;
CREATE TRIGGER briofold_ai_channel_enqueue AFTER INSERT ON inbox_messages FOR EACH ROW EXECUTE FUNCTION briofold_ai_channel_enqueue();
CREATE FUNCTION briofold_ai_channel_claim() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE j briofold_ai_channel_jobs;t inbox_threads;msg inbox_messages;ctx jsonb;lease uuid:=gen_random_uuid();BEGIN
 -- A lost worker is an unknown outcome requiring review, never a second provider call.
 WITH expired AS (SELECT id FROM briofold_ai_channel_jobs WHERE state='running' AND leased_at<now()-interval '2 minutes' ORDER BY leased_at LIMIT 100 FOR UPDATE SKIP LOCKED) UPDATE briofold_ai_channel_jobs x SET state='review',reason='WORKER_OUTCOME_UNKNOWN',updated_at=now() FROM expired WHERE x.id=expired.id;
 SELECT x.* INTO j FROM briofold_ai_channel_jobs x JOIN inbox_threads z ON z.id=x.thread_id JOIN inbox_connections c ON c.id=z.connection_id AND c.enabled AND c.environment='live' JOIN workspace_product_access p ON p.workspace_id=x.workspace_id AND p.product='ai' AND p.enabled WHERE x.state='queued' AND NOT EXISTS(SELECT 1 FROM briofold_ai_channel_jobs active_job WHERE active_job.thread_id=x.thread_id AND active_job.state='running') ORDER BY x.created_at,x.id FOR UPDATE OF z,x SKIP LOCKED LIMIT 1;
 IF j.id IS NULL THEN RETURN NULL;END IF;
 SELECT * INTO t FROM inbox_threads WHERE id=j.thread_id;SELECT * INTO msg FROM inbox_messages WHERE id=j.inbound_id;
 IF NOT t.ai_enabled OR t.last_customer_at<=now()-interval '24 hours' OR EXISTS(SELECT 1 FROM briofold_inbox_work WHERE thread_id=t.id AND (disputed OR status IN ('resolved','snoozed'))) OR EXISTS(SELECT 1 FROM briofold_inbox_tickets WHERE thread_id=t.id AND category IN ('complaint','refund','return') AND status<>'resolved') OR EXISTS(SELECT 1 FROM inbox_messages WHERE thread_id=t.id AND sender='customer' AND sequence>msg.sequence) OR NOT EXISTS(SELECT 1 FROM briofold_ai_studio_drafts d JOIN briofold_ai_studio_versions v ON v.id=d.published_id WHERE d.workspace_id=j.workspace_id AND d.published_id=j.publication_id AND v.config->>'mode'='live') THEN
  UPDATE briofold_ai_channel_jobs SET state='cancelled',reason='CONVERSATION_OR_PUBLICATION_CHANGED',updated_at=now() WHERE id=j.id;RETURN NULL;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM workspace_members m JOIN app_users u ON u.id=m.user_id WHERE m.workspace_id=j.workspace_id AND m.user_id=j.actor_id AND m.role IN ('owner','admin') AND u.disabled_at IS NULL) OR pg13_capability_override(j.workspace_id,j.actor_id,'inbox:manage') IS FALSE OR pg13_capability_override(j.workspace_id,j.actor_id,'workspace:settings') IS FALSE THEN
  UPDATE briofold_ai_channel_jobs SET state='review',reason='PUBLISHER_ACCESS_REVOKED',updated_at=now() WHERE id=j.id;RETURN NULL;
 END IF;
 BEGIN
 SELECT briofold_ai_studio_context(j.workspace_id,j.actor_id,d.revision,true,j.publication_id,msg.body) INTO ctx FROM briofold_ai_studio_drafts d WHERE d.workspace_id=j.workspace_id;
 EXCEPTION WHEN insufficient_privilege OR invalid_parameter_value OR serialization_failure THEN
 UPDATE briofold_ai_channel_jobs SET state='review',reason='ASSISTANT_CONTEXT_CHANGED',updated_at=now() WHERE id=j.id;RETURN NULL;
 END;
 IF jsonb_array_length(ctx->'knowledge')=0 AND jsonb_array_length(ctx->'products')=0 THEN UPDATE briofold_ai_channel_jobs SET state='review',reason='NO_GROUNDED_SOURCE',updated_at=now() WHERE id=j.id;RETURN NULL;END IF;
 UPDATE briofold_ai_channel_jobs SET state='running',lease_id=lease,leased_at=now(),thread_ai_version=t.ai_version,context=ctx,updated_at=now() WHERE id=j.id;
 RETURN jsonb_build_object('id',j.id,'workspace_id',j.workspace_id,'thread_id',j.thread_id,'actor_id',j.actor_id,'request_key',j.request_key,'lease_id',lease,'context',ctx);
END $$;
CREATE FUNCTION briofold_ai_channel_valid(job_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM briofold_ai_channel_jobs j JOIN inbox_threads t ON t.id=j.thread_id JOIN inbox_connections c ON c.id=t.connection_id AND c.enabled AND c.environment='live' JOIN workspace_product_access p ON p.workspace_id=j.workspace_id AND p.product='ai' AND p.enabled JOIN workspace_members m ON m.workspace_id=j.workspace_id AND m.user_id=j.actor_id AND m.role IN ('owner','admin') JOIN app_users a ON a.id=m.user_id AND a.disabled_at IS NULL
 WHERE j.id=job_id AND t.ai_enabled AND t.ai_version=j.thread_ai_version AND t.last_customer_at>now()-interval '24 hours'
 AND pg13_capability_override(j.workspace_id,j.actor_id,'inbox:manage') IS DISTINCT FROM false AND pg13_capability_override(j.workspace_id,j.actor_id,'workspace:settings') IS DISTINCT FROM false
 AND NOT EXISTS(SELECT 1 FROM briofold_inbox_work x WHERE x.thread_id=t.id AND (x.disputed OR x.status IN ('resolved','snoozed')))
 AND NOT EXISTS(SELECT 1 FROM briofold_inbox_tickets x WHERE x.thread_id=t.id AND x.category IN ('complaint','refund','return') AND x.status<>'resolved')
 AND EXISTS(SELECT 1 FROM briofold_ai_studio_drafts d JOIN briofold_ai_studio_versions v ON v.id=d.published_id WHERE d.workspace_id=j.workspace_id AND d.published_id=j.publication_id AND v.config->>'mode'='live')
 AND NOT EXISTS(SELECT 1 FROM inbox_messages x WHERE x.thread_id=t.id AND x.sender='customer' AND x.sequence>(SELECT sequence FROM inbox_messages WHERE id=j.inbound_id))
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(j.context->'knowledge') doc WHERE NOT EXISTS(SELECT 1 FROM briofold_ai_knowledge_sources s WHERE s.workspace_id=j.workspace_id AND s.id=(doc->>'source_id')::uuid AND s.active))
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(j.context->'products') product WHERE NOT EXISTS(SELECT 1 FROM inbox_products x WHERE x.workspace_id=j.workspace_id AND x.id=(product->>'id')::uuid AND x.active AND x.environment='live' AND x.name=product->>'name' AND x.price_minor=(product->>'price_minor')::bigint AND x.currency=product->>'currency' AND x.sizes=product->>'sizes')));
$$;
REVOKE ALL ON FUNCTION briofold_ai_channel_valid(uuid) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
CREATE FUNCTION briofold_ai_channel_finish(job_id uuid,lease uuid,body text,safe_reason text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE j briofold_ai_channel_jobs;t inbox_threads;output_id uuid;h text;BEGIN
 SELECT * INTO j FROM briofold_ai_channel_jobs WHERE id=job_id;
 IF j.id IS NULL OR j.lease_id IS DISTINCT FROM lease THEN RAISE EXCEPTION 'AI job lease conflict' USING ERRCODE='23505';END IF;
 PERFORM 1 FROM inbox_threads WHERE id=j.thread_id FOR UPDATE;SELECT * INTO j FROM briofold_ai_channel_jobs WHERE id=job_id FOR UPDATE;
 IF j.state='completed' THEN
  IF j.output_hash IS DISTINCT FROM encode(digest(body,'sha256'),'hex') THEN RAISE EXCEPTION 'AI job output conflict' USING ERRCODE='23505';END IF;RETURN jsonb_build_object('id',j.message_id,'queued',true);
 END IF;
 IF j.state<>'running' THEN RETURN jsonb_build_object('queued',false,'state',j.state);END IF;
 IF safe_reason<>'' THEN
  IF safe_reason NOT IN ('AI_CREDITS_REQUIRED','AI_REQUEST_UNKNOWN','AI_REQUEST_REJECTED','AI_CONTEXT_TOO_LARGE','AI_RUNTIME_UNAVAILABLE','AI_INVALID_OUTPUT') THEN RAISE EXCEPTION 'Invalid review reason' USING ERRCODE='22023';END IF;
  UPDATE briofold_ai_channel_jobs SET state='review',reason=safe_reason,updated_at=now() WHERE id=job_id;RETURN jsonb_build_object('queued',false,'state','review');
 END IF;
 IF body IS NULL OR length(trim(body)) NOT BETWEEN 1 AND 8000 THEN RAISE EXCEPTION 'Invalid AI output' USING ERRCODE='22023';END IF;
 IF NOT EXISTS(SELECT 1 FROM briofold_ai_executions WHERE workspace_id=j.workspace_id AND request_key=j.request_key AND actor_id=j.actor_id AND thread_id=j.thread_id AND state='completed') THEN RAISE EXCEPTION 'Metered completed generation required' USING ERRCODE='42501';END IF;
 SELECT * INTO t FROM inbox_threads WHERE id=j.thread_id;
 IF NOT briofold_ai_channel_valid(j.id) OR NOT t.ai_enabled OR t.ai_version IS DISTINCT FROM j.thread_ai_version OR t.last_customer_at<=now()-interval '24 hours' OR EXISTS(SELECT 1 FROM inbox_messages WHERE thread_id=t.id AND sender='customer' AND sequence>(SELECT sequence FROM inbox_messages WHERE id=j.inbound_id)) OR NOT EXISTS(SELECT 1 FROM briofold_ai_studio_drafts WHERE workspace_id=j.workspace_id AND published_id=j.publication_id) OR EXISTS(SELECT 1 FROM jsonb_array_elements(j.context->'knowledge') doc WHERE NOT EXISTS(SELECT 1 FROM briofold_ai_knowledge_sources s WHERE s.workspace_id=j.workspace_id AND s.id=(doc->>'source_id')::uuid AND s.active)) OR EXISTS(SELECT 1 FROM jsonb_array_elements(j.context->'products') product WHERE NOT EXISTS(SELECT 1 FROM inbox_products p WHERE p.workspace_id=j.workspace_id AND p.id=(product->>'id')::uuid AND p.active AND p.environment='live' AND p.name=product->>'name' AND p.price_minor=(product->>'price_minor')::bigint AND p.currency=product->>'currency' AND p.sizes=product->>'sizes')) THEN
  UPDATE briofold_ai_channel_jobs SET state='review',reason='CONVERSATION_OR_SOURCE_CHANGED',updated_at=now() WHERE id=job_id;RETURN jsonb_build_object('queued',false,'state','review');
 END IF;
 h:=encode(digest(body,'sha256'),'hex');
 INSERT INTO inbox_messages(workspace_id,thread_id,sender,body,state,idempotency_key,content) VALUES(j.workspace_id,j.thread_id,'ai',body,'queued',j.id,jsonb_build_object('publication_id',j.publication_id,'ai_version',j.thread_ai_version,'request_key',j.request_key)) RETURNING id INTO output_id;
 UPDATE briofold_ai_channel_jobs SET state='completed',message_id=output_id,output_hash=h,updated_at=now() WHERE id=job_id;RETURN jsonb_build_object('id',output_id,'queued',true);
END $$;
REVOKE ALL ON FUNCTION briofold_ai_studio_context(uuid,uuid,bigint,boolean,uuid,text),briofold_ai_channel_enqueue(),briofold_ai_channel_claim(),briofold_ai_channel_finish(uuid,uuid,text,text) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION briofold_ai_studio_context(uuid,uuid,bigint,boolean,uuid,text),briofold_ai_channel_claim(),briofold_ai_channel_finish(uuid,uuid,text,text) TO ekmivo_financial_runtime,ekmivo_financial_projection;
CREATE OR REPLACE FUNCTION inbox_next_send_v1() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE m inbox_messages;result jsonb;BEGIN
 PERFORM briofold_inbox_due_returns();
 UPDATE inbox_messages x SET state='failed',error_code='AI_CONTEXT_CHANGED' WHERE x.sender='ai' AND x.state='queued' AND NOT EXISTS(SELECT 1 FROM briofold_ai_channel_jobs j WHERE j.message_id=x.id AND j.state='completed' AND briofold_ai_channel_valid(j.id));
 UPDATE inbox_messages SET state='uncertain',error_code='WORKER_OUTCOME_UNKNOWN' WHERE state='sending' AND attempt_at<now()-interval '1 minute';
 UPDATE inbox_messages x SET state='failed',error_code='HUMAN_TAKEOVER' FROM inbox_threads t WHERE x.thread_id=t.id AND x.state='queued' AND x.sender='ai' AND (NOT t.ai_enabled OR EXISTS(SELECT 1 FROM briofold_inbox_work z WHERE z.thread_id=t.id AND (z.disputed OR z.status='resolved')) OR EXISTS(SELECT 1 FROM briofold_inbox_tickets q WHERE q.thread_id=t.id AND q.category IN ('complaint','refund','return') AND q.status<>'resolved'));
 UPDATE inbox_messages x SET state='failed',error_code='WINDOW_CLOSED' FROM inbox_threads t WHERE x.thread_id=t.id AND x.state='queued' AND t.last_customer_at<=now()-interval '24 hours';
 SELECT x.* INTO m FROM inbox_messages x JOIN inbox_threads t ON t.id=x.thread_id JOIN inbox_connections c ON c.id=t.connection_id AND c.enabled JOIN workspace_product_access p ON p.workspace_id=x.workspace_id AND p.product='ai' AND p.enabled WHERE x.state='queued' AND (x.sender<>'ai' OR (t.ai_enabled AND EXISTS(SELECT 1 FROM briofold_ai_channel_jobs j WHERE j.message_id=x.id AND j.state='completed' AND briofold_ai_channel_valid(j.id)))) AND t.last_customer_at>now()-interval '24 hours' ORDER BY x.sequence FOR UPDATE OF t,x SKIP LOCKED LIMIT 1;
 IF m.id IS NULL THEN RETURN NULL;END IF;
 UPDATE inbox_messages SET state='sending',attempt_at=now(),attempts=attempts+1 WHERE id=m.id;
 SELECT jsonb_build_object('id',m.id,'workspace_id',m.workspace_id,'text',m.body,'channel',c.provider,'account',c.external_id,'recipient',t.external_id,'credential',encode(c.credential_cipher,'base64')) INTO result FROM inbox_threads t JOIN inbox_connections c ON c.id=t.connection_id WHERE t.id=m.thread_id;RETURN result;
END $$;
CREATE FUNCTION briofold_ai_review_read(w uuid,e text,a uuid,off integer,q text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN
 PERFORM briofold_inbox_actor(w,a,'inbox:read');
 IF e IS DISTINCT FROM 'live' OR off IS NULL OR off NOT BETWEEN 0 AND 10000 OR q IS NULL OR length(q)>100 THEN RAISE EXCEPTION 'Invalid AI review filters' USING ERRCODE='22023';END IF;
 RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC,x.id) FROM (
  SELECT j.id,j.thread_id,j.reason,j.created_at,t.customer_name,m.body AS question FROM briofold_ai_channel_jobs j JOIN inbox_threads t ON t.id=j.thread_id JOIN inbox_connections c ON c.id=t.connection_id AND c.environment=e AND c.enabled JOIN inbox_messages m ON m.id=j.inbound_id
  WHERE j.workspace_id=w AND j.state='review' AND (q='' OR t.customer_name ILIKE '%'||q||'%' OR to_tsvector('simple',m.body)@@websearch_to_tsquery('simple',q)) ORDER BY j.created_at DESC,j.id OFFSET off LIMIT 50)x),'[]'),
  'can_send',EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id=w AND user_id=a AND role IN ('owner','admin','editor')) AND pg13_capability_override(w,a,'inbox:send') IS DISTINCT FROM false);
END $$;
CREATE FUNCTION briofold_ai_review_done(w uuid,e text,a uuid,job_id uuid,op uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE j briofold_ai_channel_jobs;prior briofold_inbox_events;fp text:=encode(digest(job_id::text,'sha256'),'hex');result jsonb;BEGIN
 PERFORM briofold_inbox_actor(w,a,'inbox:send');
 IF e IS DISTINCT FROM 'live' OR op IS NULL OR job_id IS NULL THEN RAISE EXCEPTION 'Invalid AI review request' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('briofold:inbox:'||w::text,0));
 SELECT * INTO prior FROM briofold_inbox_events WHERE workspace_id=w AND operation_key=op;
 IF FOUND THEN IF prior.actor_id<>a OR prior.action<>'ai-review' OR prior.request_hash<>fp THEN RAISE EXCEPTION 'Review request conflict' USING ERRCODE='23505';END IF;RETURN prior.result;END IF;
 SELECT x.* INTO j FROM briofold_ai_channel_jobs x JOIN inbox_threads t ON t.id=x.thread_id JOIN inbox_connections c ON c.id=t.connection_id AND c.environment=e AND c.enabled WHERE x.workspace_id=w AND x.id=job_id FOR UPDATE OF x;
 IF j.id IS NULL THEN RAISE EXCEPTION 'Review request unavailable' USING ERRCODE='42501';END IF;
 IF j.state<>'review' THEN RAISE EXCEPTION 'Review state changed' USING ERRCODE='40001';END IF;
 UPDATE briofold_ai_channel_jobs SET state='cancelled',reason='HUMAN_REVIEWED',updated_at=now() WHERE id=job_id;
 result:=jsonb_build_object('reviewed',true);
 INSERT INTO briofold_inbox_events(workspace_id,operation_key,thread_id,actor_id,action,request_hash,result) VALUES(w,op,j.thread_id,a,'ai-review',fp,result);
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION briofold_ai_review_read(uuid,text,uuid,integer,text),briofold_ai_review_done(uuid,text,uuid,uuid,uuid) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION briofold_ai_review_read(uuid,text,uuid,integer,text),briofold_ai_review_done(uuid,text,uuid,uuid,uuid) TO ekmivo_financial_runtime,ekmivo_financial_projection;

COMMIT;
