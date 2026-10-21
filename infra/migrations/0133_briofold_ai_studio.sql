-- Control-plane configuration only. No model calls, payments or credit grants.
BEGIN;
DO $$BEGIN
 IF to_regclass('public.briofold_ai_tariff_catalog') IS NULL OR to_regclass('public.financial_realm') IS NOT NULL
 THEN RAISE EXCEPTION '0133 requires the control AI schema'; END IF;
END $$;
CREATE TABLE briofold_ai_studio_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id),
 publication bigint NOT NULL,config jsonb NOT NULL,actor_id uuid NOT NULL REFERENCES app_users(id),
 reason text NOT NULL CHECK(length(reason) BETWEEN 10 AND 500),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,id),UNIQUE(workspace_id,publication)
);
CREATE TABLE briofold_ai_studio_drafts (
 workspace_id uuid PRIMARY KEY REFERENCES workspaces(id),revision bigint NOT NULL CHECK(revision>0),
 config jsonb NOT NULL,published_id uuid,updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(workspace_id,published_id) REFERENCES briofold_ai_studio_versions(workspace_id,id)
);
CREATE TABLE briofold_ai_knowledge_sources (
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES workspaces(id),current_version uuid,
 active boolean NOT NULL DEFAULT true,updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(workspace_id,id)
);
CREATE TABLE briofold_ai_knowledge_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL,source_id uuid NOT NULL,
 title text NOT NULL CHECK(length(title) BETWEEN 1 AND 160),kind text NOT NULL CHECK(kind IN ('text','qa','markdown','csv')),
 content text NOT NULL CHECK(length(content) BETWEEN 1 AND 100000),actor_id uuid NOT NULL REFERENCES app_users(id),
 search_vector tsvector GENERATED ALWAYS AS (to_tsvector('simple',title||' '||content)) STORED,
 created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(workspace_id,id),UNIQUE(workspace_id,source_id,id),
 FOREIGN KEY(workspace_id,source_id) REFERENCES briofold_ai_knowledge_sources(workspace_id,id)
);
ALTER TABLE briofold_ai_knowledge_sources ADD FOREIGN KEY(workspace_id,id,current_version)
 REFERENCES briofold_ai_knowledge_versions(workspace_id,source_id,id);
CREATE INDEX briofold_ai_knowledge_search ON briofold_ai_knowledge_versions USING gin(search_vector);
CREATE INDEX briofold_ai_knowledge_active ON briofold_ai_knowledge_sources(workspace_id,updated_at DESC,id) WHERE active;
CREATE TABLE briofold_ai_studio_sources (
 workspace_id uuid NOT NULL,publication_id uuid NOT NULL,source_version_id uuid NOT NULL,
 PRIMARY KEY(publication_id,source_version_id),
 FOREIGN KEY(workspace_id,publication_id) REFERENCES briofold_ai_studio_versions(workspace_id,id),
 FOREIGN KEY(workspace_id,source_version_id) REFERENCES briofold_ai_knowledge_versions(workspace_id,id)
);
CREATE TABLE briofold_ai_studio_operations (
 workspace_id uuid NOT NULL REFERENCES workspaces(id),operation_key uuid NOT NULL,actor_id uuid NOT NULL REFERENCES app_users(id),
 kind text NOT NULL,request_hash text NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,operation_key)
);
CREATE INDEX briofold_ai_studio_operation_rate ON briofold_ai_studio_operations(workspace_id,created_at DESC);
DO $$DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['briofold_ai_studio_versions','briofold_ai_studio_drafts','briofold_ai_knowledge_sources','briofold_ai_knowledge_versions','briofold_ai_studio_sources','briofold_ai_studio_operations'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY %I ON %I TO %I USING(true) WITH CHECK(true)',t||'_owner',t,current_user);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection',t);
 END LOOP;
END $$;
CREATE FUNCTION briofold_ai_studio_immutable() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN
 RAISE EXCEPTION 'AI configuration history is immutable' USING ERRCODE='42501';
END $$;
CREATE TRIGGER briofold_ai_studio_version_immutable BEFORE UPDATE OR DELETE ON briofold_ai_studio_versions FOR EACH ROW EXECUTE FUNCTION briofold_ai_studio_immutable();
CREATE TRIGGER briofold_ai_knowledge_version_immutable BEFORE UPDATE OR DELETE ON briofold_ai_knowledge_versions FOR EACH ROW EXECUTE FUNCTION briofold_ai_studio_immutable();
CREATE TRIGGER briofold_ai_studio_snapshot_immutable BEFORE UPDATE OR DELETE ON briofold_ai_studio_sources FOR EACH ROW EXECUTE FUNCTION briofold_ai_studio_immutable();
CREATE TRIGGER briofold_ai_studio_operation_immutable BEFORE UPDATE OR DELETE ON briofold_ai_studio_operations FOR EACH ROW EXECUTE FUNCTION briofold_ai_studio_immutable();

CREATE FUNCTION briofold_ai_studio_actor(w uuid,a uuid) RETURNS void
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN
 PERFORM pg13_actor(w,a,true);
 IF NOT EXISTS(SELECT 1 FROM workspace_product_access WHERE workspace_id=w AND product='ai' AND enabled)
 OR pg13_capability_override(w,a,'inbox:manage') IS FALSE
 THEN RAISE EXCEPTION 'AI configuration access denied' USING ERRCODE='42501'; END IF;
END $$;
CREATE FUNCTION briofold_ai_studio_validate(b jsonb) RETURNS void LANGUAGE plpgsql IMMUTABLE AS $$BEGIN
 IF jsonb_typeof(b) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(b))<>5
 OR NOT(b ?& ARRAY['instructions','mode','language','tone','model'])
 OR EXISTS(SELECT 1 FROM jsonb_each(b) WHERE jsonb_typeof(value)<>'string')
 OR length(b->>'instructions')>16000 OR b->>'mode' NOT IN ('off','practice','live')
 OR b->>'language' NOT IN ('auto','bn','en') OR b->>'tone' NOT IN ('neutral','friendly','formal')
 OR (b->>'model'<>'' AND (b->>'model')!~'^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$')
 THEN RAISE EXCEPTION 'Invalid AI configuration' USING ERRCODE='22023'; END IF;
END $$;
CREATE FUNCTION briofold_ai_studio_read(w uuid,a uuid,source_offset integer DEFAULT 0,version_offset integer DEFAULT 0) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE d briofold_ai_studio_drafts;BEGIN
 PERFORM briofold_ai_studio_actor(w,a);
 IF source_offset IS NULL OR version_offset IS NULL OR source_offset NOT BETWEEN 0 AND 500 OR version_offset NOT BETWEEN 0 AND 100000 THEN RAISE EXCEPTION 'Invalid page' USING ERRCODE='22023'; END IF;
 SELECT * INTO d FROM briofold_ai_studio_drafts WHERE workspace_id=w;
 RETURN jsonb_build_object('revision',coalesce(d.revision,0),'config',coalesce(d.config,
  '{"instructions":"","mode":"off","language":"auto","tone":"neutral","model":""}'::jsonb),'published_id',d.published_id,
  'published',(SELECT config FROM briofold_ai_studio_versions WHERE workspace_id=w AND id=d.published_id),
  'versions',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.publication DESC) FROM
   (SELECT id,publication,reason,created_at FROM briofold_ai_studio_versions WHERE workspace_id=w ORDER BY publication DESC OFFSET version_offset LIMIT 20)x),'[]'),
  'version_offset',version_offset,'more_versions',(SELECT count(*)>version_offset+20 FROM briofold_ai_studio_versions WHERE workspace_id=w),
  'sources',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.updated_at DESC,x.id) FROM
   (SELECT s.id,s.current_version,s.updated_at,v.title,v.kind,length(v.content) AS characters FROM briofold_ai_knowledge_sources s
    JOIN briofold_ai_knowledge_versions v ON v.workspace_id=s.workspace_id AND v.id=s.current_version
    WHERE s.workspace_id=w AND s.active ORDER BY s.updated_at DESC,s.id OFFSET source_offset LIMIT 50)x),'[]'),
  'source_offset',source_offset,'more_sources',(SELECT count(*)>source_offset+50 FROM briofold_ai_knowledge_sources WHERE workspace_id=w AND active),
  'models',coalesce((SELECT jsonb_agg(model ORDER BY model) FROM briofold_ai_tariff_catalog),'[]'));
END $$;
CREATE FUNCTION briofold_ai_studio_write(w uuid,a uuid,op uuid,kind text,b jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE d briofold_ai_studio_drafts; prior briofold_ai_studio_operations; result jsonb; fp text;
 cfg jsonb; new_id uuid; source_id uuid; source_row briofold_ai_knowledge_sources; target uuid; n bigint;
BEGIN
 PERFORM briofold_ai_studio_actor(w,a);
 PERFORM 1 FROM workspace_members m JOIN app_users u ON u.id=m.user_id WHERE m.workspace_id=w AND m.user_id=a FOR SHARE OF m,u;
 PERFORM briofold_ai_studio_actor(w,a);
 IF op IS NULL OR kind IS NULL OR kind NOT IN ('draft','publish','rollback','source','archive') OR jsonb_typeof(b) IS DISTINCT FROM 'object'
 THEN RAISE EXCEPTION 'Invalid operation' USING ERRCODE='22023'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('briofold:studio:'||w::text,0));
 fp:=encode(digest(kind||':'||b::text,'sha256'),'hex');
 SELECT * INTO prior FROM briofold_ai_studio_operations WHERE workspace_id=w AND operation_key=op;
 IF FOUND THEN
  IF prior.actor_id<>a OR prior.request_hash<>fp THEN RAISE EXCEPTION 'Operation key conflict' USING ERRCODE='23505'; END IF;
  RETURN prior.result;
 END IF;
 IF (SELECT count(*) FROM briofold_ai_studio_operations WHERE workspace_id=w AND created_at>now()-interval '1 minute')>=60
 THEN RAISE EXCEPTION 'Configuration write rate limit' USING ERRCODE='54000'; END IF;
 SELECT * INTO d FROM briofold_ai_studio_drafts WHERE workspace_id=w FOR UPDATE;
 IF kind IN ('draft','publish','rollback') THEN
  IF (b->>'revision')::bigint IS DISTINCT FROM coalesce(d.revision,0) THEN RAISE EXCEPTION 'Draft changed; refresh' USING ERRCODE='40001'; END IF;
  IF kind='draft' THEN
   cfg:=b->'config';PERFORM briofold_ai_studio_validate(cfg);
   INSERT INTO briofold_ai_studio_drafts(workspace_id,revision,config) VALUES(w,1,cfg)
   ON CONFLICT(workspace_id) DO UPDATE SET config=excluded.config,revision=briofold_ai_studio_drafts.revision+1,updated_at=now()
   RETURNING revision INTO n;
   result:=jsonb_build_object('revision',n,'saved',true);
  ELSE
   IF (b->>'confirmed')::boolean IS DISTINCT FROM true OR length(trim(coalesce(b->>'reason',''))) NOT BETWEEN 10 AND 500
   THEN RAISE EXCEPTION 'Explicit publication confirmation and reason required' USING ERRCODE='22023'; END IF;
   cfg:=d.config;
   IF kind='rollback' THEN
    target:=(b->>'target')::uuid;
    SELECT config INTO cfg FROM briofold_ai_studio_versions WHERE workspace_id=w AND id=target;
   END IF;
   IF cfg IS NULL THEN RAISE EXCEPTION 'Saved draft or rollback version required' USING ERRCODE='22023'; END IF;
   PERFORM briofold_ai_studio_validate(cfg);
   IF cfg->>'mode'<>'off' AND NOT EXISTS(SELECT 1 FROM briofold_ai_tariff_catalog WHERE model=cfg->>'model')
   THEN RAISE EXCEPTION 'Configured metered model required' USING ERRCODE='22023'; END IF;
   SELECT coalesce(max(publication),0)+1 INTO n FROM briofold_ai_studio_versions WHERE workspace_id=w;
   INSERT INTO briofold_ai_studio_versions(workspace_id,publication,config,actor_id,reason)
    VALUES(w,n,cfg,a,trim(b->>'reason')) RETURNING id INTO new_id;
   IF kind='rollback' THEN
    INSERT INTO briofold_ai_studio_sources SELECT w,new_id,source_version_id FROM briofold_ai_studio_sources WHERE workspace_id=w AND publication_id=target;
   ELSE
    INSERT INTO briofold_ai_studio_sources SELECT w,new_id,current_version FROM briofold_ai_knowledge_sources WHERE workspace_id=w AND active;
   END IF;
   UPDATE briofold_ai_studio_drafts SET config=cfg,published_id=new_id,revision=revision+1,updated_at=now() WHERE workspace_id=w;
   result:=jsonb_build_object('id',new_id,'publication',n,'revision',d.revision+1,'saved',true);
  END IF;
 ELSE
  source_id:=(b->>'id')::uuid;
  IF source_id IS NULL THEN RAISE EXCEPTION 'Source identifier required' USING ERRCODE='22023'; END IF;
  SELECT * INTO source_row FROM briofold_ai_knowledge_sources WHERE id=source_id FOR UPDATE;
  IF source_row.id IS NOT NULL AND source_row.workspace_id<>w THEN RAISE EXCEPTION 'Source unavailable' USING ERRCODE='42501'; END IF;
  IF (b->>'expected_version')::uuid IS DISTINCT FROM source_row.current_version THEN RAISE EXCEPTION 'Source changed; refresh' USING ERRCODE='40001'; END IF;
  IF kind='archive' THEN
   IF source_row.id IS NULL THEN RAISE EXCEPTION 'Source unavailable' USING ERRCODE='42501'; END IF;
   UPDATE briofold_ai_knowledge_sources SET active=false,updated_at=now() WHERE id=source_id;
   result:=jsonb_build_object('id',source_id,'archived',true);
  ELSE
   IF length(trim(coalesce(b->>'title',''))) NOT BETWEEN 1 AND 160 OR b->>'kind' IS NULL OR b->>'kind' NOT IN ('text','qa','markdown','csv')
   OR length(trim(coalesce(b->>'content',''))) NOT BETWEEN 1 AND 100000
   THEN RAISE EXCEPTION 'Invalid knowledge source' USING ERRCODE='22023'; END IF;
   IF (source_row.id IS NULL OR NOT source_row.active) AND (SELECT count(*) FROM briofold_ai_knowledge_sources WHERE workspace_id=w AND active)>=500
   THEN RAISE EXCEPTION 'Active knowledge source limit reached' USING ERRCODE='54000'; END IF;
   INSERT INTO briofold_ai_knowledge_sources(id,workspace_id) VALUES(source_id,w) ON CONFLICT(id) DO NOTHING;
   INSERT INTO briofold_ai_knowledge_versions(workspace_id,source_id,title,kind,content,actor_id)
    VALUES(w,source_id,trim(b->>'title'),b->>'kind',b->>'content',a) RETURNING id INTO new_id;
   UPDATE briofold_ai_knowledge_sources SET active=true,current_version=new_id,updated_at=now() WHERE id=source_id;
   result:=jsonb_build_object('id',source_id,'version',new_id,'saved',true);
  END IF;
  INSERT INTO briofold_ai_studio_drafts(workspace_id,revision,config)
   VALUES(w,1,'{"instructions":"","mode":"off","language":"auto","tone":"neutral","model":""}'::jsonb)
   ON CONFLICT(workspace_id) DO UPDATE SET revision=briofold_ai_studio_drafts.revision+1,updated_at=now() RETURNING revision INTO n;
  result:=result||jsonb_build_object('revision',n);
 END IF;
 INSERT INTO briofold_ai_studio_operations(workspace_id,operation_key,actor_id,kind,request_hash,result) VALUES(w,op,a,kind,fp,result);
 INSERT INTO pg13_control_audit(workspace_id,actor_id,action,resource_id) VALUES(w,a,'ai-studio.'||kind,coalesce(new_id,w));
 RETURN result;
END $$;
CREATE FUNCTION briofold_ai_knowledge_read(w uuid,a uuid,s uuid) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN
 PERFORM briofold_ai_studio_actor(w,a);
 RETURN (SELECT jsonb_build_object('id',x.id,'version',v.id,'title',v.title,'kind',v.kind,'content',v.content)
  FROM briofold_ai_knowledge_sources x JOIN briofold_ai_knowledge_versions v ON v.workspace_id=x.workspace_id AND v.id=x.current_version
  WHERE x.workspace_id=w AND x.id=s AND x.active);
END $$;
CREATE FUNCTION briofold_ai_knowledge_search(w uuid,a uuid,q text,published boolean) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE query tsquery; pub uuid;BEGIN
 PERFORM briofold_ai_studio_actor(w,a);
 IF q IS NULL OR length(trim(q)) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Search query required' USING ERRCODE='22023'; END IF;
 query:=websearch_to_tsquery('simple',q);
 SELECT published_id INTO pub FROM briofold_ai_studio_drafts WHERE workspace_id=w;
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.score DESC,x.id) FROM (
  SELECT v.id,v.source_id,v.title,left(v.content,4000) AS content,ts_rank_cd(v.search_vector,query) AS score
  FROM briofold_ai_knowledge_versions v JOIN briofold_ai_knowledge_sources s ON s.workspace_id=v.workspace_id AND s.id=v.source_id AND s.active
  WHERE v.workspace_id=w AND v.search_vector@@query AND
   ((NOT published AND v.id=s.current_version) OR (published AND EXISTS(SELECT 1 FROM briofold_ai_studio_sources z WHERE z.workspace_id=w AND z.publication_id=pub AND z.source_version_id=v.id)))
  ORDER BY score DESC,v.id LIMIT 5)x),'[]');
END $$;
REVOKE ALL ON FUNCTION briofold_ai_studio_actor(uuid,uuid),briofold_ai_studio_validate(jsonb),briofold_ai_studio_read(uuid,uuid,integer,integer),briofold_ai_studio_write(uuid,uuid,uuid,text,jsonb),briofold_ai_knowledge_read(uuid,uuid,uuid),briofold_ai_knowledge_search(uuid,uuid,text,boolean),briofold_ai_studio_immutable() FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
COMMIT;
