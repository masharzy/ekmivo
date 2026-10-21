-- Control-plane website adapter. No financial records or paid flags change.
BEGIN;
DO $$BEGIN IF to_regclass('public.briofold_ai_channel_jobs') IS NULL OR to_regclass('public.financial_realm') IS NOT NULL THEN RAISE EXCEPTION '0137 requires control Inbox';END IF;END $$;
ALTER TABLE inbox_connections DROP CONSTRAINT inbox_connections_provider_check;
ALTER TABLE inbox_connections ADD CONSTRAINT inbox_connections_provider_check CHECK(provider IN ('wa','ig','ms','site'));
CREATE TABLE briofold_website_sites(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL UNIQUE REFERENCES workspaces(id),connection_id uuid NOT NULL,
 origin text NOT NULL CHECK(length(origin) BETWEEN 8 AND 255),enabled boolean NOT NULL DEFAULT false,revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(workspace_id,connection_id) REFERENCES inbox_connections(workspace_id,id)
);
CREATE TABLE briofold_website_visitors(
 site_id uuid NOT NULL REFERENCES briofold_website_sites(id),secret_hash text NOT NULL CHECK(secret_hash~'^[0-9a-f]{64}$'),thread_id uuid NOT NULL UNIQUE REFERENCES inbox_threads(id),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days',PRIMARY KEY(site_id,secret_hash)
);
CREATE INDEX briofold_website_visitors_expiry ON briofold_website_visitors(site_id,expires_at);
CREATE TABLE briofold_website_rates(site_id uuid NOT NULL REFERENCES briofold_website_sites(id),identity text NOT NULL CHECK(length(identity)<=80),bucket timestamptz NOT NULL,hits integer NOT NULL CHECK(hits>0),PRIMARY KEY(site_id,identity));
DO $$DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['briofold_website_sites','briofold_website_visitors','briofold_website_rates'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY %I ON %I TO %I USING(true) WITH CHECK(true)',t||'_owner',t,current_user);
 EXECUTE format('REVOKE ALL ON %I FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection',t);
END LOOP;END $$;
CREATE FUNCTION briofold_website_read(w uuid,a uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE result jsonb;BEGIN
 PERFORM briofold_inbox_actor(w,a,'inbox:read');
 SELECT to_jsonb(s)-'workspace_id'-'connection_id' INTO result FROM briofold_website_sites s WHERE workspace_id=w;
 RETURN jsonb_build_object('site',result,'can_manage',((SELECT role FROM workspace_members WHERE workspace_id=w AND user_id=a) IN ('owner','admin') OR pg13_capability_override(w,a,'inbox:manage') IS TRUE) AND pg13_capability_override(w,a,'inbox:manage') IS DISTINCT FROM false);
END $$;
CREATE FUNCTION briofold_website_save(w uuid,a uuid,o text,on_off boolean,rev bigint,op uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE s briofold_website_sites;prior briofold_inbox_events;c uuid;sid uuid:=gen_random_uuid();h text;result jsonb;BEGIN
 PERFORM briofold_inbox_actor(w,a,'inbox:manage');
 IF o IS NULL OR length(o)>255 OR o!~'^https://[^/@?#[:space:]\\]+$' OR on_off IS NULL OR rev IS NULL OR rev<0 OR op IS NULL THEN RAISE EXCEPTION 'Invalid website' USING ERRCODE='22023';END IF;
 PERFORM 1 FROM workspaces WHERE id=w FOR UPDATE;
 h:=encode(sha256(convert_to(jsonb_build_array(o,on_off,rev)::text,'UTF8')),'hex');SELECT * INTO prior FROM briofold_inbox_events WHERE workspace_id=w AND operation_key=op;
 IF prior.operation_key IS NOT NULL THEN IF prior.actor_id<>a OR prior.action<>'website-save' OR prior.request_hash<>h THEN RAISE EXCEPTION 'Operation conflict' USING ERRCODE='23505';END IF;RETURN prior.result;END IF;
 SELECT * INTO s FROM briofold_website_sites WHERE workspace_id=w FOR UPDATE;
 IF coalesce(s.revision,0)<>rev THEN RAISE EXCEPTION 'Website changed' USING ERRCODE='40001';END IF;
 IF (SELECT count(*) FROM briofold_inbox_events WHERE workspace_id=w AND action='website-save' AND created_at>now()-interval '1 minute')>=20 THEN RAISE EXCEPTION 'Rate limited' USING ERRCODE='54000';END IF;
 IF s.id IS NULL THEN
  INSERT INTO inbox_connections(workspace_id,environment,provider,external_id,credential_cipher,enabled) VALUES(w,'live','site',sid::text,''::bytea,on_off) RETURNING id INTO c;
  INSERT INTO briofold_website_sites(id,workspace_id,connection_id,origin,enabled) VALUES(sid,w,c,o,on_off);
 ELSE
  IF s.origin<>o THEN
   DELETE FROM briofold_website_visitors WHERE site_id=s.id;
   UPDATE inbox_threads SET ai_enabled=false,ai_version=ai_version+1 WHERE connection_id=s.connection_id;
   UPDATE briofold_ai_channel_jobs j SET state='cancelled',reason='WEBSITE_ORIGIN_CHANGED',updated_at=now() FROM inbox_threads t WHERE j.thread_id=t.id AND t.connection_id=s.connection_id AND j.state='queued';
   UPDATE inbox_messages m SET state='failed',error_code='WEBSITE_ORIGIN_CHANGED' FROM inbox_threads t WHERE m.thread_id=t.id AND t.connection_id=s.connection_id AND m.state='queued';
  END IF;
  UPDATE briofold_website_sites SET origin=o,enabled=on_off,revision=revision+1,updated_at=now() WHERE id=s.id;
  UPDATE inbox_connections SET enabled=on_off WHERE id=s.connection_id;
 END IF;
 result:=briofold_website_read(w,a);INSERT INTO briofold_inbox_events(workspace_id,operation_key,actor_id,action,request_hash,result) VALUES(w,op,a,'website-save',h,result);RETURN result;
END $$;
CREATE FUNCTION briofold_website_origin(sid uuid,o text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM briofold_website_sites s JOIN inbox_connections c ON c.id=s.connection_id AND c.enabled JOIN workspace_product_access p ON p.workspace_id=s.workspace_id AND p.product='ai' AND p.enabled WHERE s.id=sid AND s.enabled AND s.origin=o)
$$;
CREATE FUNCTION briofold_website_limit(sid uuid,identity_key text,max_hits integer) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE n integer;BEGIN
 INSERT INTO briofold_website_rates(site_id,identity,bucket,hits) VALUES(sid,identity_key,date_trunc('minute',now()),1)
 ON CONFLICT(site_id,identity) DO UPDATE SET bucket=EXCLUDED.bucket,hits=CASE WHEN briofold_website_rates.bucket=EXCLUDED.bucket THEN briofold_website_rates.hits+1 ELSE 1 END RETURNING hits INTO n;
 IF n>max_hits THEN RAISE EXCEPTION 'Rate limited' USING ERRCODE='54000';END IF;
END $$;
CREATE FUNCTION briofold_website_visit(sid uuid,o text,act text,secret text,peer text,txt text,key text,before_seq bigint) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE s briofold_website_sites;v briofold_website_visitors;t uuid;m inbox_messages;result jsonb;BEGIN
 IF secret IS NULL OR secret!~'^[0-9a-f]{64}$' OR peer IS NULL OR peer!~'^[0-9a-f]{64}$' OR act IS NULL OR act NOT IN ('start','read','send') OR before_seq IS NULL OR before_seq<0 THEN RAISE EXCEPTION 'Invalid visitor' USING ERRCODE='22023';END IF;
 SELECT * INTO s FROM briofold_website_sites WHERE id=sid FOR SHARE;
 IF s.id IS NULL OR NOT briofold_website_origin(sid,o) THEN RAISE EXCEPTION 'Site unavailable' USING ERRCODE='42501';END IF;
 DELETE FROM briofold_website_rates WHERE (site_id,identity) IN (SELECT site_id,identity FROM briofold_website_rates WHERE site_id=sid AND bucket<now()-interval '1 day' LIMIT 100);
 PERFORM briofold_website_limit(sid,'peer:'||peer,1800);
 IF act='start' THEN
  DELETE FROM briofold_website_visitors WHERE (site_id,secret_hash) IN (SELECT site_id,secret_hash FROM briofold_website_visitors WHERE site_id=sid AND expires_at<=now() LIMIT 100);
  PERFORM briofold_website_limit(sid,'start:'||peer,10);PERFORM briofold_website_limit(sid,'site-start',100);
  IF (SELECT count(*) FROM briofold_website_visitors WHERE site_id=sid)>=10000 THEN RAISE EXCEPTION 'Visitor capacity reached' USING ERRCODE='54000';END IF;
  t:=gen_random_uuid();INSERT INTO inbox_threads(id,workspace_id,connection_id,external_id,customer_name) VALUES(t,s.workspace_id,s.connection_id,t::text,'Website visitor');
  INSERT INTO briofold_website_visitors(site_id,secret_hash,thread_id) VALUES(sid,secret,t);RETURN jsonb_build_object('started',true);
 END IF;
 SELECT * INTO v FROM briofold_website_visitors WHERE site_id=sid AND secret_hash=secret AND expires_at>now() FOR UPDATE;
 IF v.thread_id IS NULL THEN RAISE EXCEPTION 'Visitor unavailable' USING ERRCODE='42501';END IF;
 PERFORM briofold_website_limit(sid,'visitor:'||secret,60);
 IF act='send' THEN
  IF txt IS NULL OR length(trim(txt)) NOT BETWEEN 1 AND 8000 OR key IS NULL OR key!~'^[0-9a-fA-F]{8}(-[0-9a-fA-F]{4}){3}-[0-9a-fA-F]{12}$' THEN RAISE EXCEPTION 'Invalid message' USING ERRCODE='22023';END IF;
  SELECT * INTO m FROM inbox_messages WHERE thread_id=v.thread_id AND provider_id=key;
  IF m.id IS NOT NULL THEN IF m.body<>txt THEN RAISE EXCEPTION 'Retry changed' USING ERRCODE='23505';END IF;
  ELSE PERFORM briofold_website_limit(sid,'send:'||secret,20);PERFORM briofold_website_limit(sid,'site-send',200);
   PERFORM inbox_ingest(s.connection_id,key,(SELECT external_id FROM inbox_threads WHERE id=v.thread_id),'Website visitor',txt,'text',now());
  END IF;
 END IF;
 SELECT jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.sequence),'[]')) INTO result FROM (
  SELECT sequence,sender,body,type,state,created_at FROM inbox_messages WHERE thread_id=v.thread_id AND workspace_id=s.workspace_id AND (sender='customer' OR state IN ('sent','delivered','seen')) AND (before_seq=0 OR sequence<before_seq) ORDER BY sequence DESC LIMIT 50
 ) x;RETURN result;
END $$;
REVOKE ALL ON FUNCTION briofold_website_read(uuid,uuid),briofold_website_save(uuid,uuid,text,boolean,bigint,uuid),briofold_website_origin(uuid,text),briofold_website_limit(uuid,text,integer),briofold_website_visit(uuid,text,text,text,text,text,text,bigint) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION briofold_website_read(uuid,uuid),briofold_website_save(uuid,uuid,text,boolean,bigint,uuid),briofold_website_origin(uuid,text),briofold_website_visit(uuid,text,text,text,text,text,text,bigint) TO ekmivo_financial_runtime,ekmivo_financial_projection;
COMMIT;
