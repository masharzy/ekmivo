-- Signed comment intake, optimistic rules, audited review and leased delivery.
BEGIN;
DO $$BEGIN IF to_regclass('public.briofold_inbox_alerts') IS NULL OR to_regclass('public.financial_realm') IS NOT NULL THEN RAISE EXCEPTION '0139 requires control Inbox';END IF;END $$;
CREATE TABLE briofold_comment_rules(id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES workspaces(id),connection_id uuid NOT NULL,actor_id uuid NOT NULL REFERENCES app_users(id),revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),config jsonb NOT NULL CHECK(pg_column_size(config)<=32768),updated_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(workspace_id,connection_id) REFERENCES inbox_connections(workspace_id,id),UNIQUE(workspace_id,id));
CREATE INDEX briofold_comment_rules_connection ON briofold_comment_rules(connection_id,id);
CREATE TABLE briofold_comments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL,connection_id uuid NOT NULL,external_id text NOT NULL CHECK(length(external_id) BETWEEN 1 AND 100),post_id text NOT NULL CHECK(length(post_id) BETWEEN 1 AND 100),author_id text NOT NULL CHECK(length(author_id) BETWEEN 1 AND 100),body text NOT NULL CHECK(length(body)<=8000),revision bigint NOT NULL DEFAULT 1,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','processing','review','queued','sending','sent','failed','uncertain','dismissed')),reason text NOT NULL DEFAULT '',decision jsonb NOT NULL DEFAULT '{}',rule_id uuid REFERENCES briofold_comment_rules(id),rule_revision bigint,lease_id uuid,leased_at timestamptz,actor_id uuid REFERENCES app_users(id),publication_id uuid,created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(workspace_id,connection_id) REFERENCES inbox_connections(workspace_id,id),UNIQUE(connection_id,external_id),UNIQUE(workspace_id,id)
);
CREATE INDEX briofold_comments_page ON briofold_comments(workspace_id,created_at DESC,id);
CREATE INDEX briofold_comments_workspace_state ON briofold_comments(workspace_id,state);
CREATE INDEX briofold_comments_queue ON briofold_comments(state,created_at,id) WHERE state IN ('pending','processing','queued','sending');
CREATE TABLE briofold_comment_audit(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES workspaces(id),comment_id uuid,actor_id uuid,action text NOT NULL,detail jsonb NOT NULL CHECK(pg_column_size(detail)<=32768),created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(workspace_id,comment_id) REFERENCES briofold_comments(workspace_id,id));
CREATE INDEX briofold_comment_audit_scope ON briofold_comment_audit(workspace_id,created_at DESC,id);
CREATE TRIGGER briofold_comment_audit_immutable BEFORE UPDATE OR DELETE ON briofold_comment_audit FOR EACH ROW EXECUTE FUNCTION briofold_ai_studio_immutable();
DO $$DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['briofold_comment_rules','briofold_comments','briofold_comment_audit'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);EXECUTE format('CREATE POLICY %I ON %I TO %I USING(true) WITH CHECK(true)',t||'_owner',t,current_user);EXECUTE format('REVOKE ALL ON %I FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection',t);
END LOOP;END $$;
CREATE FUNCTION briofold_comments_read(w uuid,a uuid,off integer,q text,st text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN
 PERFORM briofold_inbox_actor(w,a,'inbox:read');
 IF off IS NULL OR off NOT BETWEEN 0 AND 10000 OR q IS NULL OR length(q)>100 OR st IS NULL OR st NOT IN ('','pending','review','queued','sent','failed','uncertain','dismissed') THEN RAISE EXCEPTION 'Invalid filters' USING ERRCODE='22023';END IF;
 RETURN jsonb_build_object('rules',coalesce((SELECT jsonb_agg(config||jsonb_build_object('id',id,'revision',revision,'connection_id',connection_id) ORDER BY id) FROM briofold_comment_rules WHERE workspace_id=w),'[]'),
 'connections',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'provider',provider,'external_id',external_id)) FROM inbox_connections WHERE workspace_id=w AND enabled AND environment='live' AND provider IN ('ms','ig')),'[]'),
 'items',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC,x.id) FROM (SELECT id,connection_id,external_id,post_id,body,revision,state,reason,decision,created_at FROM briofold_comments WHERE workspace_id=w AND (st='' OR state=st) AND (q='' OR body ILIKE '%'||q||'%' OR post_id=q) ORDER BY created_at DESC,id OFFSET off LIMIT 51)x),'[]'),
 'audit',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC,x.id) FROM (SELECT id,comment_id,actor_id,action,detail,created_at FROM briofold_comment_audit WHERE workspace_id=w ORDER BY created_at DESC,id OFFSET off LIMIT 51)x),'[]'),
 'can_manage',((SELECT role FROM workspace_members WHERE workspace_id=w AND user_id=a) IN ('owner','admin') OR pg13_capability_override(w,a,'inbox:manage') IS TRUE) AND pg13_capability_override(w,a,'inbox:manage') IS DISTINCT FROM false);
END $$;
CREATE FUNCTION briofold_comments_write(w uuid,a uuid,op uuid,act text,b jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE prior briofold_inbox_events;h text;result jsonb;r briofold_comment_rules;c briofold_comments;object_id uuid;BEGIN
 PERFORM briofold_inbox_actor(w,a,'inbox:manage');
 IF op IS NULL OR act IS NULL OR act NOT IN ('rule','review') OR jsonb_typeof(b) IS DISTINCT FROM 'object' OR pg_column_size(b)>32768 THEN RAISE EXCEPTION 'Invalid command' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('briofold:comments:'||w::text,0));h:=encode(sha256(convert_to(jsonb_build_array(act,b)::text,'UTF8')),'hex');SELECT * INTO prior FROM briofold_inbox_events WHERE workspace_id=w AND operation_key=op;
 IF FOUND THEN IF prior.actor_id<>a OR prior.action<>'comment-'||act OR prior.request_hash<>h THEN RAISE EXCEPTION 'Operation conflict' USING ERRCODE='23505';END IF;RETURN prior.result;END IF;
 IF (SELECT count(*) FROM briofold_inbox_events WHERE workspace_id=w AND action LIKE 'comment-%' AND created_at>now()-interval '1 minute')>=30 THEN RAISE EXCEPTION 'Rate limited' USING ERRCODE='54000';END IF;
 object_id:=(b->>'id')::uuid;IF object_id IS NULL THEN RAISE EXCEPTION 'Object required' USING ERRCODE='22023';END IF;
 IF act='rule' THEN
  IF NOT b ?& ARRAY['id','revision','connection_id','name','enabled','posts','selected','excluded','match','keywords','intent','threshold','mode','action','reply'] THEN RAISE EXCEPTION 'Incomplete rule' USING ERRCODE='22023';END IF;
  IF EXISTS(SELECT 1 FROM unnest(ARRAY['name','posts','match','mode','action','reply','intent']) field_name WHERE jsonb_typeof(b->field_name) IS DISTINCT FROM 'string') OR jsonb_typeof(b->'threshold') IS DISTINCT FROM 'number' THEN RAISE EXCEPTION 'Invalid rule types' USING ERRCODE='22023';END IF;
  SELECT * INTO r FROM briofold_comment_rules WHERE id=object_id FOR UPDATE;
  IF r.id IS NOT NULL AND r.workspace_id<>w THEN RAISE EXCEPTION 'Rule unavailable' USING ERRCODE='42501';END IF;
  IF (b->>'revision')::bigint IS DISTINCT FROM coalesce(r.revision,0) THEN RAISE EXCEPTION 'Rule changed' USING ERRCODE='40001';END IF;
  IF NOT EXISTS(SELECT 1 FROM inbox_connections WHERE workspace_id=w AND id=(b->>'connection_id')::uuid AND enabled AND environment='live' AND provider IN ('ms','ig')) THEN RAISE EXCEPTION 'Connection unavailable' USING ERRCODE='42501';END IF;
  IF r.id IS NULL AND (SELECT count(*) FROM briofold_comment_rules WHERE workspace_id=w)>=50 THEN RAISE EXCEPTION 'Rule limit' USING ERRCODE='54000';END IF;
  IF jsonb_typeof(b->'enabled') IS DISTINCT FROM 'boolean' OR length(trim(b->>'name')) NOT BETWEEN 1 AND 120 OR b->>'posts' NOT IN ('all','selected') OR jsonb_typeof(b->'selected') IS DISTINCT FROM 'array' OR jsonb_array_length(b->'selected')>100 OR jsonb_typeof(b->'excluded') IS DISTINCT FROM 'array' OR jsonb_array_length(b->'excluded')>100 OR b->>'match' NOT IN ('all','keyword','intent') OR jsonb_typeof(b->'keywords') IS DISTINCT FROM 'array' OR jsonb_array_length(b->'keywords')>20 OR b->>'mode' NOT IN ('fixed','ai','human') OR b->>'action' NOT IN ('reply','hide','delete','review') OR (b->>'threshold')::numeric NOT BETWEEN .5 AND 1 OR length(b->>'reply')>2000 THEN RAISE EXCEPTION 'Invalid rule' USING ERRCODE='22023';END IF;
  INSERT INTO briofold_comment_rules(id,workspace_id,connection_id,actor_id,config) VALUES(object_id,w,(b->>'connection_id')::uuid,a,b-'revision'-'id') ON CONFLICT(id) DO UPDATE SET connection_id=excluded.connection_id,actor_id=a,config=excluded.config,revision=briofold_comment_rules.revision+1,updated_at=now();
  UPDATE briofold_comments SET state='review',reason='RULE_CHANGED',updated_at=now() WHERE workspace_id=w AND rule_id=object_id AND state IN ('queued','processing');
 ELSE
  SELECT * INTO c FROM briofold_comments WHERE id=object_id AND workspace_id=w FOR UPDATE;IF c.id IS NULL THEN RAISE EXCEPTION 'Comment unavailable' USING ERRCODE='42501';END IF;
  IF c.revision IS DISTINCT FROM (b->>'revision')::bigint OR c.state NOT IN ('review','failed','uncertain') THEN RAISE EXCEPTION 'Comment changed' USING ERRCODE='40001';END IF;
  IF b->>'action' IS NULL OR b->>'action' NOT IN ('reply','hide','delete','dismiss') OR (b->>'action'='reply' AND coalesce(length(trim(b->>'reply')),0) NOT BETWEEN 1 AND 2000) OR coalesce((b->>'confirmed')::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION 'Review confirmation required' USING ERRCODE='22023';END IF;
  IF c.state='uncertain' AND coalesce((b->>'acknowledge_unknown')::boolean,false) IS NOT TRUE THEN RAISE EXCEPTION 'Unknown outcome confirmation required' USING ERRCODE='22023';END IF;
  UPDATE briofold_comments SET state=CASE WHEN b->>'action'='dismiss' THEN 'dismissed' ELSE 'queued' END,reason='HUMAN_REVIEWED',decision=jsonb_build_object('action',b->>'action','reply',coalesce(b->>'reply',''),'mode','human-approved'),actor_id=a,rule_id=NULL,rule_revision=NULL,publication_id=NULL,revision=revision+1,lease_id=NULL,updated_at=now() WHERE id=c.id;
 END IF;
 result:=jsonb_build_object('saved',true,'id',object_id);INSERT INTO briofold_comment_audit(workspace_id,comment_id,actor_id,action,detail) VALUES(w,CASE WHEN act='review' THEN object_id END,a,act,jsonb_build_object('id',object_id,'request_hash',h));INSERT INTO briofold_inbox_events(workspace_id,operation_key,actor_id,action,request_hash,result) VALUES(w,op,a,'comment-'||act,h,result);RETURN result;
END $$;
CREATE FUNCTION briofold_comment_ingest(p text,account text,external text,post text,author text,txt text,removed boolean) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE c inbox_connections;v briofold_comments;BEGIN
 IF p IS NULL OR p NOT IN ('ms','ig') OR external IS NULL OR external!~'^[0-9A-Za-z_-]{1,100}$' OR post IS NULL OR post!~'^[0-9A-Za-z_-]{1,100}$' OR author IS NULL OR length(author) NOT BETWEEN 1 AND 100 OR txt IS NULL OR length(txt)>8000 OR removed IS NULL THEN RETURN false;END IF;
 SELECT * INTO c FROM inbox_connections WHERE provider=p AND external_id=account AND enabled AND environment='live';IF c.id IS NULL OR author=account OR NOT EXISTS(SELECT 1 FROM workspace_product_access WHERE workspace_id=c.workspace_id AND product='ai' AND enabled) THEN RETURN false;END IF;
 SELECT * INTO v FROM briofold_comments WHERE connection_id=c.id AND external_id=external FOR UPDATE;
 IF v.id IS NOT NULL THEN
  IF v.post_id<>post OR v.author_id<>author OR (v.body=txt AND NOT removed) THEN RETURN false;END IF;
  UPDATE briofold_comments SET body=txt,state=CASE WHEN removed THEN 'dismissed' WHEN v.state='sending' THEN 'uncertain' ELSE 'review' END,reason=CASE WHEN removed THEN 'PROVIDER_REMOVED' WHEN v.state='sending' THEN 'EDIT_DURING_DISPATCH_UNKNOWN' ELSE 'PROVIDER_EDITED' END,revision=revision+1,updated_at=now() WHERE id=v.id;RETURN true;
 END IF;
 IF removed THEN RETURN false;END IF;
 IF (SELECT count(*) FROM briofold_comments WHERE workspace_id=c.workspace_id AND created_at>now()-interval '1 minute')>=300 THEN RAISE EXCEPTION 'Intake limited; retry webhook' USING ERRCODE='54000';END IF;
 INSERT INTO briofold_comments(workspace_id,connection_id,external_id,post_id,author_id,body) VALUES(c.workspace_id,c.id,external,post,author,txt);RETURN true;
END $$;
CREATE FUNCTION briofold_comment_context_valid(c briofold_comments) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE context_value jsonb;BEGIN
 IF c.publication_id IS NULL THEN RETURN true;END IF;
 context_value:=briofold_ai_studio_context(c.workspace_id,c.actor_id,(c.decision->>'context_revision')::bigint,true,c.publication_id,c.body);
 RETURN coalesce(c.decision->>'context_hash'=encode(sha256(convert_to(context_value::text,'UTF8')),'hex'),false);
 EXCEPTION WHEN OTHERS THEN RETURN false;
END $$;
CREATE FUNCTION briofold_comment_claim(phase text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE c briofold_comments;conn inbox_connections;rules jsonb;BEGIN
 IF phase IS NULL OR phase NOT IN ('evaluate','send') THEN RAISE EXCEPTION 'Invalid phase' USING ERRCODE='22023';END IF;
 WITH expired AS (SELECT id FROM briofold_comments WHERE state IN ('processing','sending') AND leased_at<now()-interval '2 minutes' ORDER BY leased_at LIMIT 100 FOR UPDATE SKIP LOCKED) UPDATE briofold_comments x SET state='uncertain',reason='WORKER_OUTCOME_UNKNOWN',updated_at=now() FROM expired WHERE x.id=expired.id;
 SELECT x.* INTO c FROM briofold_comments x JOIN inbox_connections z ON z.id=x.connection_id AND z.enabled JOIN workspace_product_access p ON p.workspace_id=x.workspace_id AND p.product='ai' AND p.enabled WHERE x.state=CASE WHEN phase='evaluate' THEN 'pending' ELSE 'queued' END AND NOT EXISTS(SELECT 1 FROM briofold_comments busy WHERE busy.workspace_id=x.workspace_id AND busy.state=CASE WHEN phase='evaluate' THEN 'processing' ELSE 'sending' END) ORDER BY x.created_at,x.id FOR UPDATE OF x SKIP LOCKED LIMIT 1;
 IF c.id IS NULL THEN RETURN NULL;END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('briofold:comment-worker:'||phase||':'||c.workspace_id::text,0)) OR EXISTS(SELECT 1 FROM briofold_comments busy WHERE busy.workspace_id=c.workspace_id AND busy.state=CASE WHEN phase='evaluate' THEN 'processing' ELSE 'sending' END) THEN RETURN NULL;END IF;
 SELECT * INTO conn FROM inbox_connections WHERE id=c.connection_id;
 IF phase='send' THEN
  IF NOT EXISTS(SELECT 1 FROM workspace_members m JOIN app_users u ON u.id=m.user_id WHERE m.workspace_id=c.workspace_id AND m.user_id=c.actor_id AND u.disabled_at IS NULL AND (m.role IN ('owner','admin') OR pg13_capability_override(c.workspace_id,c.actor_id,'inbox:manage') IS TRUE)) OR pg13_capability_override(c.workspace_id,c.actor_id,'inbox:manage') IS FALSE OR (c.rule_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM briofold_comment_rules r WHERE r.id=c.rule_id AND r.revision=c.rule_revision AND (r.config->>'enabled')::boolean)) OR NOT briofold_comment_context_valid(c) THEN UPDATE briofold_comments SET state='review',reason='CONTEXT_CHANGED',updated_at=now() WHERE id=c.id;RETURN NULL;END IF;
  IF (SELECT count(*) FROM briofold_comment_audit WHERE workspace_id=c.workspace_id AND action='dispatch' AND created_at>now()-interval '1 minute')>=20 THEN RETURN NULL;END IF;
  INSERT INTO briofold_comment_audit(workspace_id,comment_id,action,detail) VALUES(c.workspace_id,c.id,'dispatch',jsonb_build_object('revision',c.revision,'action',c.decision->>'action'));
 END IF;
 SELECT coalesce(jsonb_agg(r.config||jsonb_build_object('id',r.id,'revision',r.revision,'connection_id',r.connection_id,'actor_id',r.actor_id) ORDER BY r.id),'[]') INTO rules FROM briofold_comment_rules r WHERE r.connection_id=c.connection_id;
 UPDATE briofold_comments SET state=CASE WHEN phase='evaluate' THEN 'processing' ELSE 'sending' END,lease_id=gen_random_uuid(),leased_at=now(),updated_at=now() WHERE id=c.id RETURNING * INTO c;
 RETURN (to_jsonb(c)-'author_id')||jsonb_build_object('rules',rules,'provider',conn.provider,'account',conn.external_id,'credential',encode(conn.credential_cipher,'base64'));
END $$;
CREATE FUNCTION briofold_comment_decide(cid uuid,lease uuid,rev bigint,d jsonb,actor uuid,rule uuid,rule_rev bigint,pub uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE c briofold_comments;BEGIN
 SELECT * INTO c FROM briofold_comments WHERE id=cid FOR UPDATE;IF c.id IS NULL OR c.state<>'processing' OR c.lease_id IS DISTINCT FROM lease OR c.revision<>rev THEN RETURN false;END IF;
 IF jsonb_typeof(d) IS DISTINCT FROM 'object' OR pg_column_size(d)>32768 OR d->>'action' IS NULL OR d->>'action' NOT IN ('reply','hide','delete','review') OR length(coalesce(d->>'reply',''))>2000 OR length(coalesce(d->>'reason',''))>100 THEN RAISE EXCEPTION 'Invalid decision' USING ERRCODE='22023';END IF;
 IF rule IS NOT NULL AND NOT EXISTS(SELECT 1 FROM briofold_comment_rules WHERE id=rule AND workspace_id=c.workspace_id AND revision=rule_rev) THEN d:=jsonb_build_object('action','review','mode','human','reason','RULE_CHANGED');END IF;
 IF d->>'mode'='ai' AND NOT EXISTS(SELECT 1 FROM briofold_ai_executions WHERE workspace_id=c.workspace_id AND request_key='comment:'||c.id||':'||c.revision||':reply' AND state='completed') THEN RAISE EXCEPTION 'Metered output required' USING ERRCODE='42501';END IF;
 UPDATE briofold_comments SET state=CASE WHEN d->>'action'='review' THEN 'review' ELSE 'queued' END,decision=d,reason=coalesce(d->>'reason',''),actor_id=actor,rule_id=rule,rule_revision=rule_rev,publication_id=pub,updated_at=now() WHERE id=cid;
 INSERT INTO briofold_comment_audit(workspace_id,comment_id,actor_id,action,detail) VALUES(c.workspace_id,cid,actor,'decision',d-'reply');RETURN true;
END $$;
CREATE FUNCTION briofold_comment_finish(cid uuid,lease uuid,rev bigint,outcome text,reason text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE c briofold_comments;BEGIN
 IF outcome IS NULL OR outcome NOT IN ('sent','failed','uncertain') OR length(coalesce(reason,''))>100 THEN RAISE EXCEPTION 'Invalid outcome' USING ERRCODE='22023';END IF;
 UPDATE briofold_comments SET state=outcome,reason=coalesce(briofold_comment_finish.reason,''),updated_at=now() WHERE id=cid AND state='sending' AND lease_id=lease AND revision=rev RETURNING * INTO c;IF c.id IS NULL THEN RETURN false;END IF;
 INSERT INTO briofold_comment_audit(workspace_id,comment_id,action,detail) VALUES(c.workspace_id,cid,'provider-outcome',jsonb_build_object('state',outcome,'reason',reason));RETURN true;
END $$;
REVOKE ALL ON FUNCTION briofold_comments_read(uuid,uuid,integer,text,text),briofold_comments_write(uuid,uuid,uuid,text,jsonb),briofold_comment_ingest(text,text,text,text,text,text,boolean),briofold_comment_claim(text),briofold_comment_decide(uuid,uuid,bigint,jsonb,uuid,uuid,bigint,uuid),briofold_comment_finish(uuid,uuid,bigint,text,text),briofold_comment_context_valid(briofold_comments) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION briofold_comments_read(uuid,uuid,integer,text,text),briofold_comments_write(uuid,uuid,uuid,text,jsonb),briofold_comment_ingest(text,text,text,text,text,text,boolean),briofold_comment_claim(text),briofold_comment_decide(uuid,uuid,bigint,jsonb,uuid,uuid,bigint,uuid),briofold_comment_finish(uuid,uuid,bigint,text,text) TO ekmivo_financial_runtime,ekmivo_financial_projection;
ALTER TABLE inbox_oauth_states ADD COLUMN comment_access boolean NOT NULL DEFAULT false;
CREATE OR REPLACE FUNCTION inbox_oauth_begin(d text,w uuid,e text,a uuid,p text) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$INSERT INTO inbox_oauth_states(digest,workspace_id,environment,actor_id,provider,expires_at,consumed_at) VALUES(d,w,e,a,p,now()+interval '10 minutes',NULL)$$;
CREATE FUNCTION briofold_comment_oauth_begin(d text,w uuid,e text,a uuid,p text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN
 PERFORM briofold_inbox_actor(w,a,'inbox:manage');IF p IS NULL OR p NOT IN ('ms','ig') OR e IS DISTINCT FROM 'live' THEN RAISE EXCEPTION 'Invalid connector' USING ERRCODE='22023';END IF;PERFORM inbox_oauth_begin(d,w,e,a,p);UPDATE inbox_oauth_states SET comment_access=true WHERE digest=d;
END $$;
CREATE OR REPLACE FUNCTION inbox_oauth_consume(d text,a uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE state inbox_oauth_states;BEGIN
 UPDATE inbox_oauth_states SET consumed_at=now() WHERE digest=d AND actor_id=a AND expires_at>now() AND consumed_at IS NULL RETURNING * INTO state;IF state.digest IS NULL THEN RAISE EXCEPTION 'OAuth unavailable' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('workspace_id',state.workspace_id,'environment',state.environment,'provider',state.provider,'comment_access',state.comment_access);
END $$;
REVOKE ALL ON FUNCTION briofold_comment_oauth_begin(text,uuid,text,uuid,text) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION briofold_comment_oauth_begin(text,uuid,text,uuid,text) TO ekmivo_financial_runtime,ekmivo_financial_projection;
COMMIT;
