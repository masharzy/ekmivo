-- CONTROL: per-channel response policy, operational SLA and bounded AI guidance.
BEGIN;
DO $$BEGIN IF to_regclass('public.briofold_ai_channel_jobs') IS NULL OR to_regclass('public.financial_realm') IS NOT NULL THEN RAISE EXCEPTION '0202 requires CONTROL channel execution';END IF;END $$;
CREATE TABLE briofold_channel_policies(
 connection_id uuid PRIMARY KEY REFERENCES inbox_connections(id),
 workspace_id uuid NOT NULL REFERENCES workspaces(id),revision bigint NOT NULL CHECK(revision>0),
 body jsonb NOT NULL CHECK(jsonb_typeof(body)='object' AND pg_column_size(body)<=12000),
 updated_by uuid NOT NULL REFERENCES app_users(id),updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(workspace_id,connection_id) REFERENCES inbox_connections(workspace_id,id)
);
CREATE TABLE briofold_channel_policy_events(
 workspace_id uuid NOT NULL REFERENCES workspaces(id),operation_key uuid NOT NULL,
 connection_id uuid NOT NULL REFERENCES inbox_connections(id),actor_id uuid NOT NULL REFERENCES app_users(id),
 request_hash text NOT NULL,result jsonb NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,operation_key)
);
ALTER TABLE briofold_channel_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE briofold_channel_policies FORCE ROW LEVEL SECURITY;
ALTER TABLE briofold_channel_policy_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE briofold_channel_policy_events FORCE ROW LEVEL SECURITY;
CREATE POLICY briofold_channel_policy_owner ON briofold_channel_policies TO CURRENT_USER USING(true) WITH CHECK(true);
CREATE POLICY briofold_channel_policy_events_owner ON briofold_channel_policy_events TO CURRENT_USER USING(true) WITH CHECK(true);
REVOKE ALL ON briofold_channel_policies,briofold_channel_policy_events FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
CREATE TRIGGER briofold_channel_policy_events_immutable BEFORE UPDATE OR DELETE ON briofold_channel_policy_events FOR EACH ROW EXECUTE FUNCTION briofold_ai_studio_immutable();
CREATE FUNCTION briofold_channel_policy(c uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce((SELECT body FROM briofold_channel_policies WHERE connection_id=c),'{"mode":"ai","sla_minutes":15,"return_after_minutes":60,"review_guidance":"","upsell_guidance":""}'::jsonb)
$$;
CREATE FUNCTION briofold_channel_settings_read(w uuid,a uuid,c uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE items jsonb;BEGIN
 PERFORM briofold_inbox_actor(w,a,'inbox:manage');
 IF pg13_capability_override(w,a,'workspace:settings') IS false THEN RAISE EXCEPTION 'Channel settings denied' USING ERRCODE='42501';END IF;
 IF c IS NOT NULL AND NOT EXISTS(SELECT 1 FROM inbox_connections WHERE workspace_id=w AND id=c AND environment='live') THEN RAISE EXCEPTION 'Channel unavailable' USING ERRCODE='42501';END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.created_at,x.id),'[]') INTO items FROM (
  SELECT z.id,z.provider,z.external_id,z.enabled,z.created_at,coalesce(p.revision,0) AS revision,briofold_channel_policy(z.id) AS policy,
   (SELECT count(*) FROM inbox_threads t WHERE t.connection_id=z.id AND EXISTS(SELECT 1 FROM inbox_messages m WHERE m.thread_id=t.id AND m.sender='customer' AND NOT EXISTS(SELECT 1 FROM inbox_messages response WHERE response.thread_id=t.id AND response.sender IN ('seller','ai') AND response.state IN ('sent','delivered','seen') AND response.sequence>m.sequence))) AS waiting,
   (SELECT count(*) FROM inbox_threads t WHERE t.connection_id=z.id AND t.last_customer_at<now()-make_interval(mins=>(briofold_channel_policy(z.id)->>'sla_minutes')::integer) AND EXISTS(SELECT 1 FROM inbox_messages m WHERE m.thread_id=t.id AND m.sender='customer' AND NOT EXISTS(SELECT 1 FROM inbox_messages response WHERE response.thread_id=t.id AND response.sender IN ('seller','ai') AND response.state IN ('sent','delivered','seen') AND response.sequence>m.sequence))) AS overdue
  FROM inbox_connections z LEFT JOIN briofold_channel_policies p ON p.connection_id=z.id
  WHERE z.workspace_id=w AND z.environment='live' AND (c IS NULL OR z.id=c)
 )x;
 RETURN jsonb_build_object('items',items,'can_manage',true);
END $$;
CREATE FUNCTION briofold_channel_settings_write(w uuid,a uuid,k uuid,b jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c uuid;expected bigint;next_revision bigint;policy jsonb;prior briofold_channel_policy_events;fp text;result jsonb;BEGIN
 PERFORM briofold_inbox_actor(w,a,'inbox:manage');
 IF pg13_capability_override(w,a,'workspace:settings') IS false THEN RAISE EXCEPTION 'Channel settings denied' USING ERRCODE='42501';END IF;
 IF k IS NULL OR jsonb_typeof(b) IS DISTINCT FROM 'object' OR pg_column_size(b)>16000 THEN RAISE EXCEPTION 'Invalid channel policy' USING ERRCODE='22023';END IF;
 c:=(b->>'id')::uuid;expected:=(b->>'revision')::bigint;policy:=b->'policy';
 IF c IS NULL OR expected IS NULL OR expected<0 OR jsonb_typeof(policy) IS DISTINCT FROM 'object'
  OR (SELECT count(*) FROM jsonb_object_keys(policy))<>5
  OR policy->>'mode' IS NULL OR policy->>'mode' NOT IN ('ai','human')
  OR coalesce(policy->>'sla_minutes','')!~'^[0-9]{1,5}$' OR (policy->>'sla_minutes')::integer NOT BETWEEN 1 AND 10080
  OR coalesce(policy->>'return_after_minutes','')!~'^[0-9]{1,5}$' OR (policy->>'return_after_minutes')::integer NOT BETWEEN 0 AND 10080
  OR jsonb_typeof(policy->'review_guidance') IS DISTINCT FROM 'string' OR length(policy->>'review_guidance')>1000
  OR jsonb_typeof(policy->'upsell_guidance') IS DISTINCT FROM 'string' OR length(policy->>'upsell_guidance')>1000
 THEN RAISE EXCEPTION 'Invalid channel policy' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('briofold:channel-policy:'||w::text,0));
 PERFORM 1 FROM inbox_connections WHERE workspace_id=w AND id=c AND environment='live' FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Channel unavailable' USING ERRCODE='42501';END IF;
 fp:=encode(digest(b::text,'sha256'),'hex');SELECT * INTO prior FROM briofold_channel_policy_events WHERE workspace_id=w AND operation_key=k;
 IF FOUND THEN
  IF prior.actor_id<>a OR prior.request_hash<>fp THEN RAISE EXCEPTION 'Channel operation conflict' USING ERRCODE='23505';END IF;
  RETURN prior.result;
 END IF;
 SELECT coalesce((SELECT revision FROM briofold_channel_policies WHERE connection_id=c),0) INTO next_revision;
 IF next_revision<>expected THEN RAISE EXCEPTION 'Channel policy changed' USING ERRCODE='40001';END IF;
 next_revision:=next_revision+1;
 INSERT INTO briofold_channel_policies(connection_id,workspace_id,revision,body,updated_by) VALUES(c,w,next_revision,policy,a)
  ON CONFLICT(connection_id) DO UPDATE SET revision=EXCLUDED.revision,body=EXCLUDED.body,updated_by=a,updated_at=now();
 -- Running/queued work holds an old policy snapshot. Never reuse that job or
 -- automatically re-send when a channel returns to AI-assisted mode.
 UPDATE briofold_ai_channel_jobs SET state='cancelled',reason='CHANNEL_POLICY_CHANGED',updated_at=now()
 WHERE workspace_id=w AND thread_id IN(SELECT id FROM inbox_threads WHERE connection_id=c) AND state IN ('queued','running');
 result:=jsonb_build_object('id',c,'revision',next_revision,'saved',true);
 INSERT INTO briofold_channel_policy_events VALUES(w,k,c,a,fp,result,now());
 RETURN result;
END $$;
-- Refuse new automatic generation for human-only channels at the queue boundary.
CREATE FUNCTION briofold_channel_job_policy_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN
 IF (SELECT briofold_channel_policy(connection_id)->>'mode' FROM inbox_threads WHERE id=NEW.thread_id)='human' THEN
  NEW.state:='cancelled';NEW.reason:='CHANNEL_HUMAN_MODE';
 END IF;RETURN NEW;
END $$;
CREATE TRIGGER briofold_channel_job_policy_guard BEFORE INSERT ON briofold_ai_channel_jobs FOR EACH ROW EXECUTE FUNCTION briofold_channel_job_policy_guard();
ALTER FUNCTION briofold_ai_channel_claim() RENAME TO briofold_ai_channel_claim_before_policy;
REVOKE ALL ON FUNCTION briofold_ai_channel_claim_before_policy() FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
CREATE FUNCTION briofold_ai_channel_claim() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r jsonb;c uuid;policy jsonb;revision bigint;ctx jsonb;BEGIN
 r:=briofold_ai_channel_claim_before_policy();IF r IS NULL THEN RETURN NULL;END IF;
 SELECT connection_id INTO c FROM inbox_threads WHERE id=(r->>'thread_id')::uuid;
 policy:=briofold_channel_policy(c);SELECT coalesce((SELECT p.revision FROM briofold_channel_policies p WHERE p.connection_id=c),0) INTO revision;
 IF policy->>'mode'='human' THEN
  UPDATE briofold_ai_channel_jobs SET state='cancelled',reason='CHANNEL_HUMAN_MODE',updated_at=now() WHERE id=(r->>'id')::uuid;RETURN NULL;
 END IF;
 ctx:=r->'context'||jsonb_build_object('channel_policy_revision',revision,'channel_instructions',
 'Offer review or product suggestions only when relevant to the current customer request. Never invent eligibility, consent, prices, availability or a verified payment. No unsolicited follow-up. Review guidance: '||(policy->>'review_guidance')||E'\nProduct suggestion guidance: '||(policy->>'upsell_guidance'));
 UPDATE briofold_ai_channel_jobs SET context=ctx WHERE id=(r->>'id')::uuid;
 RETURN jsonb_set(r,'{context}',ctx);
END $$;
-- The workflow reader supplies the configured default to the human takeover
-- editor; its explicit timestamp continues through the existing retry guard.
ALTER FUNCTION briofold_inbox_work_read(uuid,text,uuid,uuid,integer,integer,integer,jsonb) RENAME TO briofold_inbox_work_read_before_channel_policy;
REVOKE ALL ON FUNCTION briofold_inbox_work_read_before_channel_policy(uuid,text,uuid,uuid,integer,integer,integer,jsonb) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
CREATE FUNCTION briofold_inbox_work_read(w uuid,e text,a uuid,t uuid,off integer DEFAULT 0,ticket_offset integer DEFAULT 0,history_offset integer DEFAULT 0,filters jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE r jsonb;BEGIN
 r:=briofold_inbox_work_read_before_channel_policy(w,e,a,t,off,ticket_offset,history_offset,filters);
 RETURN r||jsonb_build_object('channel_policy',CASE WHEN t IS NOT NULL THEN (SELECT briofold_channel_policy(connection_id)-'review_guidance'-'upsell_guidance' FROM inbox_threads WHERE id=t) ELSE NULL END);
END $$;
REVOKE ALL ON FUNCTION briofold_channel_policy(uuid),briofold_channel_settings_read(uuid,uuid,uuid),briofold_channel_settings_write(uuid,uuid,uuid,jsonb),briofold_channel_job_policy_guard(),briofold_ai_channel_claim(),briofold_inbox_work_read(uuid,text,uuid,uuid,integer,integer,integer,jsonb) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION briofold_channel_settings_read(uuid,uuid,uuid),briofold_channel_settings_write(uuid,uuid,uuid,jsonb),briofold_ai_channel_claim(),briofold_inbox_work_read(uuid,text,uuid,uuid,integer,integer,integer,jsonb) TO ekmivo_financial_runtime,ekmivo_financial_projection;
CREATE OR REPLACE FUNCTION briofold_ai_channel_valid(job_id uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM briofold_ai_channel_jobs j JOIN inbox_threads t ON t.id=j.thread_id JOIN inbox_connections c ON c.id=t.connection_id AND c.enabled AND c.environment='live' JOIN workspace_product_access p ON p.workspace_id=j.workspace_id AND p.product='ai' AND p.enabled JOIN workspace_members m ON m.workspace_id=j.workspace_id AND m.user_id=j.actor_id AND m.role IN ('owner','admin') JOIN app_users a ON a.id=m.user_id AND a.disabled_at IS NULL
 WHERE j.id=job_id AND briofold_channel_policy(c.id)->>'mode'='ai' AND coalesce((j.context->>'channel_policy_revision')::bigint,0)=coalesce((SELECT revision FROM briofold_channel_policies WHERE connection_id=c.id),0) AND t.ai_enabled AND t.ai_version=j.thread_ai_version AND t.last_customer_at>now()-interval '24 hours'
 AND pg13_capability_override(j.workspace_id,j.actor_id,'inbox:manage') IS DISTINCT FROM false AND pg13_capability_override(j.workspace_id,j.actor_id,'workspace:settings') IS DISTINCT FROM false
 AND NOT EXISTS(SELECT 1 FROM briofold_inbox_work x WHERE x.thread_id=t.id AND (x.disputed OR x.status IN ('resolved','snoozed')))
 AND NOT EXISTS(SELECT 1 FROM briofold_inbox_tickets x WHERE x.thread_id=t.id AND x.category IN ('complaint','refund','return') AND x.status<>'resolved')
 AND EXISTS(SELECT 1 FROM briofold_ai_studio_drafts d JOIN briofold_ai_studio_versions v ON v.id=d.published_id WHERE d.workspace_id=j.workspace_id AND d.published_id=j.publication_id AND v.config->>'mode'='live')
 AND NOT EXISTS(SELECT 1 FROM inbox_messages x WHERE x.thread_id=t.id AND x.sender='customer' AND x.sequence>(SELECT sequence FROM inbox_messages WHERE id=j.inbound_id))
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(j.context->'knowledge') doc WHERE NOT EXISTS(SELECT 1 FROM briofold_ai_knowledge_sources s WHERE s.workspace_id=j.workspace_id AND s.id=(doc->>'source_id')::uuid AND s.active))
 AND NOT EXISTS(SELECT 1 FROM jsonb_array_elements(j.context->'products') fact(value) WHERE NOT EXISTS(SELECT 1 FROM inbox_products x WHERE x.workspace_id=j.workspace_id AND x.id=(fact.value->>'id')::uuid AND x.active AND x.environment='live' AND x.name=fact.value->>'name' AND x.price_minor=(fact.value->>'price_minor')::bigint AND x.currency=fact.value->>'currency' AND x.sizes=fact.value->>'sizes')));
$$;
CREATE FUNCTION briofold_channel_work_valid(j uuid,l uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM briofold_ai_channel_jobs WHERE id=j AND lease_id=l AND state='running') AND briofold_ai_channel_valid(j)
$$;
REVOKE ALL ON FUNCTION briofold_channel_work_valid(uuid,uuid) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION briofold_channel_work_valid(uuid,uuid) TO ekmivo_financial_runtime,ekmivo_financial_projection;
COMMIT;
