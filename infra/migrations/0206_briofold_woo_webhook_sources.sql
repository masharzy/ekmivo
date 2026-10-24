-- Signed Woo product notices are review sources, never catalog mutation authority.
BEGIN;
DO $$BEGIN IF to_regclass('public.commerce_integrations') IS NULL OR to_regclass('public.financial_realm') IS NOT NULL THEN RAISE EXCEPTION '0206 requires CONTROL commerce schema';END IF;END $$;
CREATE TABLE commerce_woo_hook_sources(
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES workspaces(id),environment text NOT NULL CHECK(environment IN ('live','sandbox')),
 origin text NOT NULL CHECK(origin~'^https://' AND length(origin)<=2048),secret_cipher bytea NOT NULL CHECK(octet_length(secret_cipher) BETWEEN 28 AND 4096),
 enabled boolean NOT NULL DEFAULT true,created_by uuid NOT NULL REFERENCES app_users(id),operation_key uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,environment,id),UNIQUE(workspace_id,created_by,operation_key)
);
CREATE TABLE commerce_woo_hook_events(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL,environment text NOT NULL,source_id uuid NOT NULL,
 delivery_id text NOT NULL CHECK(length(delivery_id) BETWEEN 1 AND 128),request_hash text NOT NULL CHECK(request_hash~'^[0-9a-f]{64}$'),
 product_id bigint NOT NULL CHECK(product_id>0),product_name text NOT NULL CHECK(length(product_name)<=200),created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(workspace_id,environment,source_id) REFERENCES commerce_woo_hook_sources(workspace_id,environment,id),
 UNIQUE(source_id,delivery_id),UNIQUE(source_id,request_hash),UNIQUE(source_id,id)
);
CREATE TABLE commerce_woo_hook_receipts(
 source_id uuid NOT NULL REFERENCES commerce_woo_hook_sources(id),delivery_id text NOT NULL CHECK(length(delivery_id) BETWEEN 1 AND 128),request_hash text NOT NULL CHECK(request_hash~'^[0-9a-f]{64}$'),event_id uuid NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(source_id,delivery_id),FOREIGN KEY(source_id,event_id) REFERENCES commerce_woo_hook_events(source_id,id)
);
CREATE INDEX commerce_woo_hook_review ON commerce_woo_hook_events(workspace_id,environment,created_at DESC,id);
DO $$DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['commerce_woo_hook_sources','commerce_woo_hook_events','commerce_woo_hook_receipts'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
 EXECUTE format('CREATE POLICY %I ON %I TO %I USING(true) WITH CHECK(true)',t||'_owner',t,current_user);
 EXECUTE format('REVOKE ALL ON %I FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection',t);
END LOOP;END $$;
CREATE TRIGGER commerce_woo_hook_event_immutable BEFORE UPDATE OR DELETE ON commerce_woo_hook_events FOR EACH ROW EXECUTE FUNCTION briofold_customer_event_immutable();
CREATE TRIGGER commerce_woo_hook_receipt_immutable BEFORE UPDATE OR DELETE ON commerce_woo_hook_receipts FOR EACH ROW EXECUTE FUNCTION briofold_customer_event_immutable();
CREATE FUNCTION commerce_woo_hook_manage(w uuid,e text,a uuid) RETURNS void LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN
 IF e IS NULL OR e NOT IN ('live','sandbox') OR commerce_actor(w,a,false) NOT IN ('owner','admin') OR pg13_capability_override(w,a,'workspace:settings') IS FALSE THEN RAISE EXCEPTION 'Woo webhook settings denied' USING ERRCODE='42501';END IF;
END $$;
CREATE FUNCTION commerce_woo_hook_create(w uuid,e text,a uuid,k uuid,sid uuid,source_origin text,cipher bytea) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE src commerce_woo_hook_sources;
BEGIN
 PERFORM commerce_woo_hook_manage(w,e,a);PERFORM pg_advisory_xact_lock(hashtextextended('woo-hook:'||w::text,0));
 SELECT * INTO src FROM commerce_woo_hook_sources WHERE workspace_id=w AND created_by=a AND operation_key=k;
 IF src.id IS NOT NULL THEN
  IF src.environment<>e OR src.origin<>source_origin OR NOT src.enabled OR src.created_at<now()-interval '15 minutes' THEN RAISE EXCEPTION 'Source create recovery expired or changed' USING ERRCODE='40001';END IF;
 ELSE
  IF k IS NULL OR sid IS NULL OR octet_length(cipher) NOT BETWEEN 28 AND 4096 OR source_origin!~'^https://' THEN RAISE EXCEPTION 'Invalid source' USING ERRCODE='22023';END IF;
  IF NOT EXISTS(SELECT 1 FROM commerce_integrations WHERE workspace_id=w AND environment=e AND provider='woocommerce' AND enabled) THEN RAISE EXCEPTION 'Woo connection unavailable' USING ERRCODE='P0002';END IF;
  IF (SELECT count(*) FROM commerce_woo_hook_sources WHERE workspace_id=w AND environment=e AND enabled)>=20 THEN RAISE EXCEPTION 'Active source limit' USING ERRCODE='54000';END IF;
  INSERT INTO commerce_woo_hook_sources(id,workspace_id,environment,origin,secret_cipher,created_by,operation_key) VALUES(sid,w,e,source_origin,cipher,a,k) RETURNING * INTO src;
  INSERT INTO commerce_events(workspace_id,environment,entity_id,actor_id,action) VALUES(w,e,src.id,a,'woo-hook-created');
 END IF;
 RETURN jsonb_build_object('id',src.id,'secret_cipher',encode(src.secret_cipher,'base64'));
END $$;
CREATE FUNCTION commerce_woo_hook_disable(w uuid,e text,a uuid,sid uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN
 PERFORM commerce_woo_hook_manage(w,e,a);UPDATE commerce_woo_hook_sources SET enabled=false WHERE id=sid AND workspace_id=w AND environment=e;
 IF NOT FOUND THEN RAISE EXCEPTION 'Source unavailable' USING ERRCODE='42501';END IF;
 INSERT INTO commerce_events(workspace_id,environment,entity_id,actor_id,action) VALUES(w,e,sid,a,'woo-hook-disabled');
END $$;
CREATE FUNCTION commerce_woo_hook_read(w uuid,e text,a uuid,off integer DEFAULT 0) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN
 PERFORM commerce_woo_hook_manage(w,e,a);
 IF off IS NULL OR off NOT BETWEEN 0 AND 10000 THEN RAISE EXCEPTION 'Invalid review page' USING ERRCODE='22023';END IF;
 RETURN jsonb_build_object('sources',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC,x.id) FROM (SELECT id,origin,created_at FROM commerce_woo_hook_sources WHERE workspace_id=w AND environment=e AND enabled ORDER BY created_at DESC,id LIMIT 20)x),'[]'),
 'events',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC,x.id) FROM (SELECT id,source_id,product_id,product_name,created_at FROM commerce_woo_hook_events WHERE workspace_id=w AND environment=e ORDER BY created_at DESC,id OFFSET off LIMIT 51)x),'[]'));
END $$;
CREATE FUNCTION commerce_woo_hook_source(sid uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('id',s.id,'workspace_id',s.workspace_id,'environment',s.environment,'origin',s.origin,'secret_cipher',encode(s.secret_cipher,'base64'),'connection_cipher',encode(i.secret_cipher,'base64'))
 FROM commerce_woo_hook_sources s JOIN workspaces w ON w.id=s.workspace_id AND w.service_mode<>'off' JOIN commerce_integrations i ON i.workspace_id=s.workspace_id AND i.environment=s.environment AND i.provider='woocommerce' AND i.enabled WHERE s.id=sid AND s.enabled
$$;
CREATE FUNCTION commerce_woo_hook_receive(sid uuid,delivery text,h text,pid bigint,n text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE src commerce_woo_hook_sources;old commerce_woo_hook_receipts;result uuid;
BEGIN
 SELECT * INTO src FROM commerce_woo_hook_sources WHERE id=sid AND enabled FOR SHARE;
 IF src.id IS NULL OR NOT EXISTS(SELECT 1 FROM workspaces WHERE id=src.workspace_id AND service_mode<>'off') OR NOT EXISTS(SELECT 1 FROM commerce_integrations WHERE workspace_id=src.workspace_id AND environment=src.environment AND provider='woocommerce' AND enabled) THEN RAISE EXCEPTION 'Source unavailable' USING ERRCODE='42501';END IF;
 IF delivery IS NULL OR length(delivery) NOT BETWEEN 1 AND 128 OR h IS NULL OR h!~'^[0-9a-f]{64}$' OR pid IS NULL OR pid<1 OR n IS NULL OR length(n)>200 THEN RAISE EXCEPTION 'Invalid product notice' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('woo-delivery:'||src.workspace_id::text,0));
 SELECT * INTO old FROM commerce_woo_hook_receipts WHERE source_id=sid AND delivery_id=delivery;
 IF old.event_id IS NOT NULL THEN IF old.request_hash<>h THEN RAISE EXCEPTION 'Delivery digest conflict' USING ERRCODE='23505';END IF;RETURN jsonb_build_object('id',old.event_id,'replayed',true);END IF;
 SELECT id INTO result FROM commerce_woo_hook_events WHERE source_id=sid AND request_hash=h;
 IF (SELECT count(*) FROM commerce_woo_hook_receipts r JOIN commerce_woo_hook_sources s ON s.id=r.source_id WHERE s.workspace_id=src.workspace_id AND r.created_at>now()-interval '1 day')>=10000 THEN RAISE EXCEPTION 'Source notice limit' USING ERRCODE='54000';END IF;
 IF result IS NOT NULL THEN INSERT INTO commerce_woo_hook_receipts(source_id,delivery_id,request_hash,event_id) VALUES(sid,delivery,h,result);RETURN jsonb_build_object('id',result,'replayed',true);END IF;
 INSERT INTO commerce_woo_hook_events(workspace_id,environment,source_id,delivery_id,request_hash,product_id,product_name) VALUES(src.workspace_id,src.environment,sid,delivery,h,pid,n) RETURNING id INTO result;
 INSERT INTO commerce_woo_hook_receipts(source_id,delivery_id,request_hash,event_id) VALUES(sid,delivery,h,result);
 RETURN jsonb_build_object('id',result,'replayed',false);
END $$;
CREATE FUNCTION commerce_woo_event_source(w uuid,e text,a uuid,event_id uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE result jsonb;BEGIN
 PERFORM commerce_actor(w,a,true);
 SELECT jsonb_build_object('product_id',v.product_id,'origin',s.origin) INTO result FROM commerce_woo_hook_events v JOIN commerce_woo_hook_sources s ON s.id=v.source_id AND s.enabled WHERE v.id=event_id AND v.workspace_id=w AND v.environment=e;
 IF result IS NULL THEN RAISE EXCEPTION 'Notice unavailable' USING ERRCODE='42501';END IF;RETURN result;
END $$;
REVOKE ALL ON FUNCTION commerce_woo_hook_manage(uuid,text,uuid),commerce_woo_hook_create(uuid,text,uuid,uuid,uuid,text,bytea),commerce_woo_hook_disable(uuid,text,uuid,uuid),commerce_woo_hook_read(uuid,text,uuid,integer),commerce_woo_hook_source(uuid),commerce_woo_hook_receive(uuid,text,text,bigint,text),commerce_woo_event_source(uuid,text,uuid,uuid) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION commerce_woo_hook_create(uuid,text,uuid,uuid,uuid,text,bytea),commerce_woo_hook_disable(uuid,text,uuid,uuid),commerce_woo_hook_read(uuid,text,uuid,integer),commerce_woo_hook_source(uuid),commerce_woo_hook_receive(uuid,text,text,bigint,text),commerce_woo_event_source(uuid,text,uuid,uuid) TO ekmivo_financial_runtime,ekmivo_financial_projection;
COMMIT;
