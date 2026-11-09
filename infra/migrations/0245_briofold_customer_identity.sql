BEGIN;
ALTER TABLE inbox_threads
 ADD COLUMN IF NOT EXISTS meta_name_attempted_at timestamptz,
 ADD COLUMN IF NOT EXISTS meta_name_next_at timestamptz,
 ADD COLUMN IF NOT EXISTS meta_name_failures integer NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS inbox_threads_meta_name_attempt ON inbox_threads(meta_name_attempted_at)
 WHERE meta_name_attempted_at IS NOT NULL;

CREATE OR REPLACE FUNCTION briofold_meta_customer_names_claim() RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE remaining integer; result jsonb;
BEGIN
 IF NOT pg_try_advisory_xact_lock(hashtextextended('briofold:meta-customer-name-rate',0)) THEN RETURN '[]';END IF;
 SELECT greatest(0,20-count(*)) INTO remaining FROM inbox_threads WHERE meta_name_attempted_at>now()-interval '1 minute';
 WITH candidates AS (
  SELECT t.id FROM inbox_threads t JOIN inbox_connections n ON n.id=t.connection_id AND n.enabled AND n.provider IN ('ms','ig')
  JOIN workspace_product_access p ON p.workspace_id=t.workspace_id AND p.product='ai' AND p.enabled
  WHERE t.last_customer_at>now()-interval '30 days' AND t.external_id~'^[0-9]{1,32}$'
   AND (t.meta_name_next_at IS NULL OR t.meta_name_next_at<=now())
  ORDER BY t.meta_name_next_at NULLS FIRST,t.last_customer_at DESC,t.id LIMIT least(remaining,5) FOR UPDATE OF t SKIP LOCKED
 ), picked AS (
  UPDATE inbox_threads t SET meta_name_attempted_at=now(),meta_name_next_at=now()+interval '5 minutes'
  FROM candidates c WHERE t.id=c.id RETURNING t.*
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object('thread',p.id,'workspace',p.workspace_id,'attempt',p.meta_name_attempted_at,
  'provider',n.provider,'account',n.external_id,'customer',p.external_id,'credential',encode(n.credential_cipher,'base64'))),'[]')
 INTO result FROM picked p JOIN inbox_connections n ON n.id=p.connection_id;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION briofold_meta_customer_name_finish(tid uuid,attempt timestamptz,display text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE t inbox_threads; realm text; name_value text;
BEGIN
 SELECT x.* INTO t FROM inbox_threads x JOIN inbox_connections n ON n.id=x.connection_id AND n.enabled AND n.provider IN ('ms','ig')
 WHERE x.id=tid AND x.meta_name_attempted_at=attempt AND x.meta_name_next_at=x.meta_name_attempted_at+interval '5 minutes'
 FOR UPDATE OF x;
 IF NOT FOUND THEN RETURN false;END IF;
 name_value:=left(btrim(coalesce(display,'')),160);
 IF name_value='' OR name_value ~ '^[[:digit:][:space:]+()-]+$' OR name_value~'[[:cntrl:]]' THEN
  UPDATE inbox_threads SET meta_name_failures=least(meta_name_failures+1,7),
   meta_name_next_at=now()+make_interval(mins=>5*(1<<least(meta_name_failures,6))) WHERE id=tid;
  RETURN true;
 END IF;
 SELECT environment INTO realm FROM inbox_connections WHERE id=t.connection_id;
 UPDATE inbox_threads SET customer_name=name_value,meta_name_failures=0,meta_name_next_at=now()+interval '24 hours' WHERE id=tid;
 -- Refresh provider-derived names only. Explicit CRM renames and merged identities survive.
 UPDATE briofold_customers c SET name=name_value,revision=revision+1,updated_at=now()
 FROM briofold_customer_sources s
 WHERE s.kind='thread' AND s.source_id=tid AND s.workspace_id=t.workspace_id AND s.environment=realm
  AND c.id=s.customer_id AND c.workspace_id=t.workspace_id AND c.environment=realm AND c.name=left(t.customer_name,160)
  AND c.name<>name_value AND c.merged_into IS NULL AND c.deleted_at IS NULL
  AND NOT EXISTS(SELECT 1 FROM briofold_customer_events h WHERE h.customer_id=c.id AND h.action IN ('save','merge'))
  AND NOT EXISTS(SELECT 1 FROM briofold_customers x WHERE x.merged_into=c.id);
 RETURN true;
END $$;

CREATE OR REPLACE FUNCTION briofold_customer_verified_shared(w uuid,e text,c uuid,target uuid) RETURNS boolean
LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM briofold_customer_proofs x JOIN briofold_customer_proofs y
  ON y.workspace_id=x.workspace_id AND y.environment=x.environment AND y.kind=x.kind AND y.value=x.value
 WHERE x.workspace_id=w AND x.environment=e AND x.customer_id=c AND y.customer_id=target
  AND x.revoked_at IS NULL AND y.revoked_at IS NULL)
$$;

CREATE OR REPLACE FUNCTION briofold_customer_merge_options(w uuid,e text,a uuid,c uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE role text;
BEGIN
 role:=briofold_customer_actor(w,a,'read');
 IF role NOT IN ('owner','admin')
  OR NOT briofold_channel_customer(w,e,a,c) THEN RETURN '[]';END IF;
 RETURN coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM (
  SELECT m.id,m.name,role='owner' AND briofold_customer_verified_shared(w,e,c,m.id) AS can_merge
  FROM briofold_customers base JOIN briofold_customers m ON m.workspace_id=base.workspace_id AND m.environment=base.environment
   AND m.phone=base.phone AND m.phone<>'' AND m.id<>base.id AND m.deleted_at IS NULL AND m.merged_into IS NULL
  WHERE base.id=c AND base.workspace_id=w AND base.environment=e AND base.deleted_at IS NULL AND base.merged_into IS NULL
   AND briofold_channel_customer(w,e,a,m.id)
  ORDER BY m.created_at,m.id LIMIT 20
 ) x),'[]');
END $$;

CREATE OR REPLACE FUNCTION briofold_customer_owner_merge(w uuid,e text,a uuid,k uuid,b jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE cid uuid:=(b->>'id')::uuid; candidate uuid:=(b->>'target')::uuid; survivor uuid; archived uuid; result jsonb;
BEGIN
 PERFORM 1 FROM workspace_members m JOIN app_users u ON u.id=m.user_id
 WHERE m.workspace_id=w AND m.user_id=a AND m.role='owner' AND u.disabled_at IS NULL FOR SHARE OF m,u;
 IF NOT FOUND OR b->>'confirmed' IS DISTINCT FROM 'true' THEN
  RAISE EXCEPTION 'Owner confirmation required' USING ERRCODE='42501';
 END IF;
 -- The established merge command locks the profile and checks shared verified
 -- identity, channel scope, revision and command replay.
 result:=briofold_customers_write(w,e,a,k,'merge',b);
 survivor:=(result->>'id')::uuid;
 archived:=CASE WHEN survivor=cid THEN candidate ELSE cid END;
 WITH RECURSIVE merged(id) AS (
  SELECT archived UNION ALL
  SELECT c.id FROM briofold_customers c JOIN merged m ON c.merged_into=m.id WHERE c.workspace_id=w AND c.environment=e
 )
 UPDATE commerce_orders SET customer_id=survivor,revision=revision+1,updated_at=now()
 WHERE workspace_id=w AND environment=e AND customer_id IN (SELECT id FROM merged);
 IF NOT EXISTS(SELECT 1 FROM briofold_customer_events WHERE customer_id=survivor AND action='merge-survived' AND detail->>'source'=archived::text) THEN
  INSERT INTO briofold_customer_events(workspace_id,environment,customer_id,actor_id,action,detail)
  VALUES(w,e,survivor,a,'merge-survived',jsonb_build_object('source',archived));
 END IF;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION briofold_customer_identity_detail(w uuid,e text,a uuid,c uuid,off integer,q text,f text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb; history jsonb;
BEGIN
 result:=briofold_customers_read(w,e,a,c,off,q,f);
 WITH RECURSIVE ids(id) AS (
  SELECT c UNION ALL SELECT x.id FROM briofold_customers x JOIN ids ON x.merged_into=ids.id WHERE x.workspace_id=w AND x.environment=e
 )
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.sequence DESC),'[]') INTO history FROM (
  SELECT sequence,action,detail,created_at FROM briofold_customer_events
  WHERE workspace_id=w AND environment=e AND customer_id IN (SELECT id FROM ids)
  ORDER BY sequence DESC LIMIT 51 OFFSET off
 ) x;
 RETURN jsonb_set(result,'{events}',history);
END $$;

REVOKE ALL ON FUNCTION briofold_customer_verified_shared(uuid,text,uuid,uuid),briofold_meta_customer_names_claim(),briofold_meta_customer_name_finish(uuid,timestamptz,text),briofold_customer_merge_options(uuid,text,uuid,uuid),briofold_customer_owner_merge(uuid,text,uuid,uuid,jsonb),briofold_customer_identity_detail(uuid,text,uuid,uuid,integer,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION briofold_meta_customer_names_claim(),briofold_meta_customer_name_finish(uuid,timestamptz,text),briofold_customer_merge_options(uuid,text,uuid,uuid),briofold_customer_owner_merge(uuid,text,uuid,uuid,jsonb),briofold_customer_identity_detail(uuid,text,uuid,uuid,integer,text,text) TO ekmivo_financial_runtime,ekmivo_financial_projection;
COMMIT;
