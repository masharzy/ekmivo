-- CONTROL only: authenticated provider consent acquisition and audience-bound
-- merchant offers. No transport or production flag is activated here.
BEGIN;
DO $$BEGIN IF to_regclass('public.briofold_member_channel_scopes') IS NULL OR to_regclass('public.financial_realm') IS NOT NULL THEN RAISE EXCEPTION '0209 requires CONTROL 0208';END IF;END $$;
ALTER TABLE briofold_growth_channel_consents ADD COLUMN provider_message_id uuid REFERENCES inbox_messages(id);
CREATE UNIQUE INDEX briofold_growth_optin_source_once ON briofold_growth_channel_consents(provider_message_id) WHERE provider_message_id IS NOT NULL;
CREATE FUNCTION briofold_growth_provider_opt_in(conn uuid,provider_message text,raw_digest text) RETURNS boolean
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE source record;ch text;BEGIN
 IF conn IS NULL OR provider_message IS NULL OR length(provider_message) NOT BETWEEN 1 AND 250 OR raw_digest IS NULL OR raw_digest!~'^[0-9a-f]{64}$' THEN RETURN false;END IF;
 -- Only verified Go callbacks invoke this. Independently bind the exact
 -- durable inbound customer message to its current Store/channel/identity.
 SELECT n.workspace_id,n.environment,n.provider,m.id message_id,s.id source_id,s.customer_id INTO source
 FROM inbox_connections n JOIN inbox_threads t ON t.connection_id=n.id AND t.workspace_id=n.workspace_id
 JOIN inbox_messages m ON m.thread_id=t.id AND m.workspace_id=n.workspace_id
 JOIN briofold_customer_sources s ON s.workspace_id=n.workspace_id AND s.environment=n.environment AND s.kind='thread' AND s.source_id=t.id
 JOIN briofold_customers c ON c.id=s.customer_id AND c.workspace_id=n.workspace_id AND c.environment=n.environment
 WHERE n.id=conn AND n.enabled AND n.provider IN ('ms','ig') AND n.environment='live'
 AND m.provider_id=provider_message AND m.sender='customer' AND m.type='text' AND m.state='received'
 AND lower(btrim(m.body))='start offers' AND c.deleted_at IS NULL AND c.merged_into IS NULL
 AND (c.preferences->>'do_not_contact')::boolean IS FALSE
 AND EXISTS(SELECT 1 FROM workspace_product_access WHERE workspace_id=n.workspace_id AND product='ai' AND enabled)
 AND EXISTS(SELECT 1 FROM workspaces WHERE id=n.workspace_id AND service_mode<>'off')
 AND m.created_at>=now()-interval '10 minutes' AND m.created_at<=now()+interval '1 minute' LIMIT 1;
 IF source.message_id IS NULL OR NOT EXISTS(SELECT 1 FROM inbox_webhook_events WHERE id=raw_digest AND provider=source.provider) THEN RETURN false;END IF;
 ch:=CASE source.provider WHEN 'ms' THEN 'messenger' ELSE 'instagram' END;
 PERFORM pg_advisory_xact_lock(hashtextextended('growth:'||source.workspace_id::text||':'||source.environment,0));
 -- A START never clears permanent STOP/legal/merchant suppression or DNC.
 IF EXISTS(SELECT 1 FROM briofold_growth_suppressions WHERE workspace_id=source.workspace_id AND environment=source.environment AND customer_id=source.customer_id AND channel IN ('all',ch)) THEN RETURN false;END IF;
 IF EXISTS(SELECT 1 FROM briofold_growth_channel_consents WHERE workspace_id=source.workspace_id AND environment=source.environment AND customer_id=source.customer_id AND channel=ch AND identity_source_id=source.source_id AND revoked_at IS NULL AND verified_at<=now() AND (expires_at IS NULL OR expires_at>now())) THEN
 UPDATE briofold_customers SET preferences=jsonb_set(preferences,'{marketing}','"opted-in"'),revision=revision+1,updated_at=now() WHERE id=source.customer_id AND preferences->>'marketing'<>'opted-in';
 RETURN true;END IF;
 INSERT INTO briofold_growth_channel_consents(workspace_id,environment,customer_id,channel,identity_source_id,source_kind,evidence_digest,verified_at,expires_at,provider_message_id)
 VALUES(source.workspace_id,source.environment,source.customer_id,ch,source.source_id,'provider-opt-in',raw_digest,now(),now()+interval '30 days',source.message_id) ON CONFLICT DO NOTHING;
 UPDATE briofold_customers SET preferences=jsonb_set(preferences,'{marketing}','"opted-in"'),revision=revision+1,updated_at=now() WHERE id=source.customer_id;
 RETURN true;
END $$;
REVOKE ALL ON FUNCTION briofold_growth_provider_opt_in(uuid,text,text) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION briofold_growth_provider_opt_in(uuid,text,text) TO ekmivo_financial_runtime;
ALTER TABLE briofold_broadcast_runs ADD COLUMN coupon_id uuid REFERENCES commerce_coupons(id),ADD COLUMN coupon_revision bigint,ADD COLUMN coupon_snapshot jsonb;
ALTER TABLE briofold_broadcast_runs ADD CONSTRAINT briofold_broadcast_coupon_pair CHECK((coupon_id IS NULL AND coupon_revision IS NULL AND coupon_snapshot IS NULL) OR (coupon_id IS NOT NULL AND coupon_revision IS NOT NULL AND coupon_snapshot IS NOT NULL));
CREATE FUNCTION briofold_broadcast_coupon_available(w uuid,e text,cp uuid,cid uuid,at_time timestamptz) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM commerce_coupons c WHERE c.id=cp AND c.workspace_id=w AND c.environment=e AND c.active AND c.starts_at<=at_time AND c.expires_at>at_time AND cid=ANY(c.audience)
 AND (SELECT count(*) FROM commerce_coupon_claims WHERE coupon_id=c.id AND status<>'released')<c.usage_limit
 AND (WITH RECURSIVE identities(id) AS(SELECT cid UNION SELECT x.id FROM briofold_customers x JOIN identities i ON x.merged_into=i.id AND x.workspace_id=w AND x.environment=e) SELECT count(*) FROM commerce_coupon_claims WHERE coupon_id=c.id AND customer_id IN(SELECT id FROM identities) AND status<>'released')<c.per_customer_limit)
$$;
REVOKE ALL ON FUNCTION briofold_broadcast_coupon_available(uuid,text,uuid,uuid,timestamptz) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
CREATE FUNCTION briofold_broadcast_coupon_snapshot_immutable() RETURNS trigger LANGUAGE plpgsql AS $$BEGIN
 IF OLD.coupon_id IS NOT NULL AND ROW(NEW.coupon_id,NEW.coupon_revision,NEW.coupon_snapshot) IS DISTINCT FROM ROW(OLD.coupon_id,OLD.coupon_revision,OLD.coupon_snapshot) THEN RAISE EXCEPTION 'Approved coupon snapshot is immutable' USING ERRCODE='42501';END IF;RETURN NEW;
END $$;
CREATE TRIGGER briofold_broadcast_coupon_snapshot_immutable BEFORE UPDATE ON briofold_broadcast_runs FOR EACH ROW EXECUTE FUNCTION briofold_broadcast_coupon_snapshot_immutable();
ALTER FUNCTION briofold_broadcast_preview(uuid,text,uuid,jsonb) RENAME TO briofold_broadcast_preview_before_offers;
REVOKE ALL ON FUNCTION briofold_broadcast_preview_before_offers(uuid,text,uuid,jsonb) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
CREATE FUNCTION briofold_broadcast_preview(w uuid,e text,a uuid,b jsonb) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p jsonb;c commerce_coupons;snapshot jsonb;aud jsonb;BEGIN
 p:=briofold_broadcast_preview_before_offers(w,e,a,b);
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.customer_id),'[]') INTO aud FROM jsonb_to_recordset(p->'audience') x(customer_id uuid,thread_id uuid,consent_id uuid)
 JOIN inbox_threads t ON t.id=x.thread_id WHERE briofold_channel_allowed(w,a,t.connection_id,'send') AND briofold_channel_customer(w,e,a,x.customer_id);
 IF nullif(b->>'test_customer','') IS NOT NULL AND jsonb_array_length(aud)<>1 THEN RAISE EXCEPTION 'Test recipient unavailable' USING ERRCODE='42501';END IF;
 p:=p||jsonb_build_object('audience',aud,'recipients',jsonb_array_length(aud),'token',encode(digest((p->>'token')||':'||aud::text,'sha256'),'hex'),
 'recipient_previews',coalesce((SELECT jsonb_agg(jsonb_build_object('id',x.customer_id,'name',t.customer_name) ORDER BY x.customer_id) FROM jsonb_to_recordset(aud)x(customer_id uuid,thread_id uuid) JOIN inbox_threads t ON t.id=x.thread_id),'[]'));
 IF nullif(b->>'coupon_id','') IS NULL AND nullif(b->>'coupon_code','') IS NULL THEN RETURN p;END IF;
 SELECT * INTO c FROM commerce_coupons WHERE ((nullif(b->>'coupon_id','') IS NOT NULL AND id=(b->>'coupon_id')::uuid) OR (nullif(b->>'coupon_id','') IS NULL AND code=upper(btrim(b->>'coupon_code')))) AND workspace_id=w AND environment=e AND active AND expires_at>now();
 IF c.id IS NULL OR cardinality(c.audience)=0 THEN RAISE EXCEPTION 'Select an active audience-bound offer' USING ERRCODE='42501';END IF;
 IF EXISTS(SELECT 1 FROM jsonb_to_recordset(p->'audience') x(customer_id uuid) WHERE NOT briofold_broadcast_coupon_available(w,e,c.id,x.customer_id,greatest(now(),c.starts_at))) THEN RAISE EXCEPTION 'Offer does not include every preview recipient' USING ERRCODE='42501';END IF;
 snapshot:=jsonb_build_object('id',c.id,'revision',c.revision,'code',c.code,'kind',c.kind,'value',c.value,'minimum_minor',c.minimum_minor,'max_discount_minor',c.max_discount_minor,'usage_limit',c.usage_limit,'per_customer_limit',c.per_customer_limit,'starts_at',c.starts_at,'expires_at',c.expires_at);
 RETURN p||jsonb_build_object('coupon',snapshot,'token',encode(digest((p->>'token')||':'||snapshot::text,'sha256'),'hex'));
END $$;
ALTER FUNCTION briofold_broadcast_command(uuid,text,uuid,uuid,text,jsonb) RENAME TO briofold_broadcast_command_before_offers;
REVOKE ALL ON FUNCTION briofold_broadcast_command_before_offers(uuid,text,uuid,uuid,text,jsonb) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
CREATE FUNCTION briofold_broadcast_command(w uuid,e text,a uuid,k uuid,act text,b jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE res jsonb;r briofold_broadcast_runs;c commerce_coupons;prior boolean;BEGIN
 PERFORM briofold_broadcast_actor(w,a);
 PERFORM pg_advisory_xact_lock(hashtextextended('growth:'||w::text||':'||e,0));
 SELECT EXISTS(SELECT 1 FROM briofold_broadcast_runs WHERE id=k AND workspace_id=w AND environment=e) INTO prior;
 res:=briofold_broadcast_command_before_offers(w,e,a,k,act,b);
 IF act='broadcast-approve' AND NOT prior AND (nullif(b->>'coupon_id','') IS NOT NULL OR nullif(b->>'coupon_code','') IS NOT NULL) THEN
 SELECT * INTO r FROM briofold_broadcast_runs WHERE id=k AND workspace_id=w AND environment=e FOR UPDATE;
 SELECT * INTO c FROM commerce_coupons WHERE id=(r.preview->'coupon'->>'id')::uuid AND workspace_id=w AND environment=e FOR SHARE;
 IF c.id IS NULL OR NOT c.active OR c.revision IS DISTINCT FROM (r.preview->'coupon'->>'revision')::bigint OR r.due_at<c.starts_at OR r.expires_at>c.expires_at OR c.expires_at<=now() THEN RAISE EXCEPTION 'Offer changed or delivery exceeds offer validity' USING ERRCODE='40001';END IF;
 UPDATE briofold_broadcast_runs SET coupon_id=c.id,coupon_revision=c.revision,coupon_snapshot=r.preview->'coupon' WHERE id=k;
 END IF;RETURN res;
END $$;
ALTER FUNCTION briofold_broadcast_valid(uuid) RENAME TO briofold_broadcast_valid_before_offers;
REVOKE ALL ON FUNCTION briofold_broadcast_valid_before_offers(uuid) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
CREATE FUNCTION briofold_broadcast_valid(recipient uuid) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT briofold_broadcast_valid_before_offers(recipient) AND EXISTS(SELECT 1 FROM briofold_broadcast_recipients r JOIN briofold_broadcast_runs n ON n.id=r.run_id WHERE r.id=recipient AND (n.coupon_id IS NULL OR EXISTS(SELECT 1 FROM commerce_coupons c WHERE c.id=n.coupon_id AND c.workspace_id=n.workspace_id AND c.environment=n.environment AND c.active AND c.revision=n.coupon_revision AND c.starts_at<=now() AND c.expires_at>now() AND briofold_broadcast_coupon_available(n.workspace_id,n.environment,c.id,r.customer_id,now()))))
$$;
REVOKE ALL ON FUNCTION briofold_broadcast_preview(uuid,text,uuid,jsonb),briofold_broadcast_command(uuid,text,uuid,uuid,text,jsonb),briofold_broadcast_valid(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION briofold_broadcast_command(uuid,text,uuid,uuid,text,jsonb) TO ekmivo_financial_runtime,ekmivo_financial_projection;
-- The pre-transport guard also revalidates AI publication/actor context after
-- claim, preserving the same checks used by the SQL sender selector.
CREATE OR REPLACE FUNCTION briofold_channel_send_valid(i uuid) RETURNS boolean
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE msg inbox_messages;conn uuid;BEGIN
 SELECT * INTO msg FROM inbox_messages WHERE id=i;
 IF msg.sender='ai' THEN RETURN EXISTS(SELECT 1 FROM briofold_ai_channel_jobs j WHERE j.message_id=i AND j.state='completed' AND briofold_ai_channel_valid(j.id));END IF;
 IF msg.sender<>'seller' THEN RETURN false;END IF;
 SELECT connection_id INTO conn FROM inbox_threads WHERE id=msg.thread_id;
 IF msg.requested_by IS NULL THEN RETURN NOT EXISTS(SELECT 1 FROM briofold_member_channel_scopes WHERE workspace_id=msg.workspace_id AND connection_id=conn AND (deny_read OR deny_send));END IF;
 BEGIN PERFORM briofold_inbox_actor(msg.workspace_id,msg.requested_by,'inbox:send');EXCEPTION WHEN insufficient_privilege THEN RETURN false;END;
 RETURN briofold_channel_allowed(msg.workspace_id,msg.requested_by,conn,'send');
END $$;
CREATE OR REPLACE FUNCTION inbox_page(w uuid,e text,d uuid,t uuid,before_seq bigint,f jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;rk text:=coalesce(f->>'reader_kind','device');off integer:=coalesce((f->>'offset')::integer,0);queue text:=coalesce(f->>'queue','all');q text:=coalesce(f->>'q','');start_day date;end_day date;tag text:=coalesce(f->>'label','');BEGIN
 IF rk='user' THEN PERFORM briofold_inbox_actor(w,d,'inbox:read');END IF;
 IF NOT EXISTS(SELECT 1 FROM workspace_product_access WHERE workspace_id=w AND product='ai' AND enabled) THEN RAISE EXCEPTION 'AI disabled' USING ERRCODE='42501';END IF;
 IF t IS NOT NULL AND rk='user' THEN PERFORM briofold_channel_thread(w,e,d,t,'read');END IF;
 IF t IS NOT NULL THEN
 result:=inbox_page_media(w,e,d,t,before_seq,f);
 IF rk='user' THEN result:=jsonb_set(result,'{thread}',(result->'thread')||jsonb_build_object(
 'send_allowed',((SELECT role FROM workspace_members WHERE workspace_id=w AND user_id=d) IN ('owner','admin','editor') OR pg13_capability_override(w,d,'inbox:send') IS TRUE) AND EXISTS(SELECT 1 FROM inbox_threads x WHERE x.id=t AND briofold_channel_allowed(w,d,x.connection_id,'send')) AND pg13_capability_override(w,d,'inbox:send') IS DISTINCT FROM false,
 'manage_allowed',((SELECT role FROM workspace_members WHERE workspace_id=w AND user_id=d) IN ('owner','admin') OR pg13_capability_override(w,d,'inbox:manage') IS TRUE) AND pg13_capability_override(w,d,'inbox:manage') IS DISTINCT FROM false));END IF;RETURN result;END IF;
 IF e IS NULL OR e NOT IN ('live','sandbox') OR length(q)>200 OR off NOT BETWEEN 0 AND 10000 OR queue NOT IN ('all','unread','mine','unassigned','attention','resolved','snoozed','open','pending','waiting') OR coalesce(f->>'channel','') NOT IN ('','ms','ig','wa','web') THEN RAISE EXCEPTION 'Invalid conversation filters' USING ERRCODE='22023';END IF;
 IF length(tag)>40 OR (coalesce(f->>'from_date','')<>'' AND f->>'from_date'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
 OR (coalesce(f->>'through_date','')<>'' AND f->>'through_date'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$') THEN
  RAISE EXCEPTION 'Invalid conversation date or label' USING ERRCODE='22023';END IF;
 BEGIN
  start_day:=nullif(f->>'from_date','')::date;end_day:=nullif(f->>'through_date','')::date;
 EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
  RAISE EXCEPTION 'Invalid conversation date' USING ERRCODE='22023';END;
 IF start_day>end_day THEN RAISE EXCEPTION 'Reversed conversation dates' USING ERRCODE='22023';END IF;
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
  WHERE (rk<>'user' OR briofold_channel_allowed(w,d,c.id,'read')) AND a.workspace_id=w AND c.enabled AND c.environment=e
  AND (start_day IS NULL OR a.last_activity_at>=(start_day::timestamp AT TIME ZONE 'UTC'))
  AND (end_day IS NULL OR a.last_activity_at<((end_day+1)::timestamp AT TIME ZONE 'UTC'))
  AND (tag='' OR tag=ANY(coalesce(wf.labels,'{}')))
  AND (q='' OR a.customer_name ILIKE '%'||q||'%' OR coalesce(a.contact->>'phone','') ILIKE '%'||q||'%' OR (c.provider='wa' AND a.external_id ILIKE '%'||q||'%') OR EXISTS(SELECT 1 FROM inbox_messages m WHERE m.workspace_id=w AND m.thread_id=a.id AND to_tsvector('simple',m.body)@@websearch_to_tsquery('simple',q)) OR EXISTS(SELECT 1 FROM inbox_orders o WHERE o.workspace_id=w AND o.thread_id=a.id AND o.reference ILIKE '%'||q||'%'))
  AND (coalesce(f->>'channel','')='' OR c.provider=f->>'channel')
  AND (coalesce(f->>'mode','')='' OR (f->>'mode'='ai' AND a.ai_enabled) OR (f->>'mode'='seller' AND NOT a.ai_enabled) OR (f->>'mode'='waiting' AND EXISTS(SELECT 1 FROM inbox_messages request WHERE request.thread_id=a.id AND request.workspace_id=a.workspace_id AND request.sender='customer' AND NOT EXISTS(SELECT 1 FROM inbox_messages response WHERE response.thread_id=a.id AND response.workspace_id=a.workspace_id AND response.sender IN ('seller','ai') AND response.state IN ('sent','delivered','seen') AND response.sequence>request.sequence))))
  AND (coalesce((f->>'days')::integer,0)=0 OR a.last_activity_at>=now()-make_interval(days=>(f->>'days')::integer))
  AND (coalesce((f->>'unread')::boolean,false)=false OR EXISTS(SELECT 1 FROM inbox_messages m WHERE m.thread_id=a.id AND m.sender='customer' AND m.sequence>coalesce(rc.sequence,0)))
  AND (queue='all' OR (queue='open' AND coalesce(wf.status,'open')='open') OR (queue='pending' AND wf.status='pending') OR (queue='waiting' AND EXISTS(SELECT 1 FROM inbox_messages request WHERE request.thread_id=a.id AND request.workspace_id=a.workspace_id AND request.sender='customer' AND NOT EXISTS(SELECT 1 FROM inbox_messages response WHERE response.thread_id=a.id AND response.workspace_id=a.workspace_id AND response.sender IN ('seller','ai') AND response.state IN ('sent','delivered','seen') AND response.sequence>request.sequence)) AND coalesce(wf.status,'open')<>'resolved') OR (queue='unread' AND EXISTS(SELECT 1 FROM inbox_messages m WHERE m.thread_id=a.id AND m.sender='customer' AND m.sequence>coalesce(rc.sequence,0))) OR (queue='mine' AND wf.owner_id=d) OR (queue='unassigned' AND wf.owner_id IS NULL) OR (queue='attention' AND coalesce(wf.status,'open')<>'resolved' AND (coalesce(wf.disputed,false) OR wf.due_at<now() OR EXISTS(SELECT 1 FROM inbox_messages request WHERE request.thread_id=a.id AND request.workspace_id=a.workspace_id AND request.sender='customer' AND NOT EXISTS(SELECT 1 FROM inbox_messages response WHERE response.thread_id=a.id AND response.workspace_id=a.workspace_id AND response.sender IN ('seller','ai') AND response.state IN ('sent','delivered','seen') AND response.sequence>request.sequence)))) OR (queue='resolved' AND wf.status='resolved') OR (queue='snoozed' AND wf.status='snoozed' AND wf.snooze_until>now()))
  ORDER BY a.last_activity_at DESC,a.id OFFSET off LIMIT 50
 )x;RETURN result;
END $$;
CREATE OR REPLACE FUNCTION briofold_inbox_work_read_before_channel_policy(w uuid,e text,a uuid,t uuid,off integer DEFAULT 0,ticket_offset integer DEFAULT 0,history_offset integer DEFAULT 0,filters jsonb DEFAULT '{}') RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE v inbox_threads;r jsonb;BEGIN
 PERFORM briofold_inbox_actor(w,a,'inbox:read');
 IF e IS NULL OR e NOT IN ('live','sandbox') OR off IS NULL OR off NOT BETWEEN 0 AND 10000 OR ticket_offset IS NULL OR ticket_offset NOT BETWEEN 0 AND 10000 OR history_offset IS NULL OR history_offset NOT BETWEEN 0 AND 10000 THEN RAISE EXCEPTION 'Invalid workflow page' USING ERRCODE='22023'; END IF;
 IF jsonb_typeof(filters) IS DISTINCT FROM 'object' OR pg_column_size(filters)>8192 OR length(coalesce(filters->>'q',''))>100 OR length(coalesce(filters->>'member_query',''))>100 OR length(coalesce(filters->>'category',''))>80 THEN RAISE EXCEPTION 'Invalid search filter' USING ERRCODE='22023'; END IF;
 IF coalesce(filters->>'reply_state','active') NOT IN ('active','archived') THEN RAISE EXCEPTION 'Invalid reply state' USING ERRCODE='22023';END IF;
 IF t IS NOT NULL THEN PERFORM briofold_channel_thread(w,e,a,t,'read');v:=inbox_scope(w,e,t);END IF;
 SELECT jsonb_build_object('reply_sequences_enabled',true,'server_time',now(),
  'work',CASE WHEN t IS NOT NULL THEN coalesce((SELECT to_jsonb(x)-'workspace_id' FROM briofold_inbox_work x WHERE thread_id=t),jsonb_build_object('thread_id',t,'revision',0,'owner_id',NULL,'status','open','priority','normal','labels','[]'::jsonb,'due_at',NULL,'snooze_until',NULL,'return_at',NULL,'disputed',false,'handover_reason','')) END,
  'members',coalesce((SELECT jsonb_agg(jsonb_build_object('id',u.id,'name',u.display_name) ORDER BY u.display_name,u.id) FROM (SELECT u.id,u.display_name FROM workspace_members m JOIN app_users u ON u.id=m.user_id WHERE m.workspace_id=w AND m.role IN ('owner','admin','editor') AND u.disabled_at IS NULL AND pg13_capability_override(w,u.id,'inbox:send') IS DISTINCT FROM false AND (t IS NULL OR EXISTS(SELECT 1 FROM inbox_threads ch WHERE ch.id=t AND briofold_channel_allowed(w,u.id,ch.connection_id,'send'))) AND u.display_name ILIKE '%'||coalesce(filters->>'member_query','')||'%' ORDER BY u.display_name,u.id LIMIT 50) u),'[]'),
  'more_members',(SELECT count(*)>50 FROM workspace_members m JOIN app_users u ON u.id=m.user_id WHERE m.workspace_id=w AND m.role IN ('owner','admin','editor') AND u.disabled_at IS NULL AND pg13_capability_override(w,u.id,'inbox:send') IS DISTINCT FROM false AND (t IS NULL OR EXISTS(SELECT 1 FROM inbox_threads ch WHERE ch.id=t AND briofold_channel_allowed(w,u.id,ch.connection_id,'send'))) AND u.display_name ILIKE '%'||coalesce(filters->>'member_query','')||'%'),
  'duty',coalesce((SELECT state FROM briofold_inbox_duty WHERE workspace_id=w AND user_id=a AND environment=e),'away'),
  'reply_media',coalesce((SELECT jsonb_agg(to_jsonb(media)) FROM (SELECT m.id,m.type,m.content->>'name' AS name FROM inbox_messages m JOIN inbox_threads th ON th.id=m.thread_id JOIN inbox_connections c ON c.id=th.connection_id AND c.environment=e AND c.enabled WHERE briofold_channel_allowed(w,a,c.id,'read') AND m.workspace_id=w AND m.sender IN ('seller','ai') AND m.state IN ('sent','delivered','seen') AND m.type IN ('image','audio','document') ORDER BY m.created_at DESC LIMIT 50) media),'[]'::jsonb),
  'saved_replies',coalesce((SELECT jsonb_agg(to_jsonb(x)-'workspace_id' ORDER BY x.updated_at DESC,x.id) FROM (SELECT * FROM briofold_inbox_saved_replies WHERE briofold_channel_reply(w,e,a,id) AND workspace_id=w AND environment=e AND active=(coalesce(filters->>'reply_state','active')<>'archived') AND (visibility='team' OR created_by=a) AND (coalesce(filters->>'q','')='' OR title ILIKE '%'||(filters->>'q')||'%' OR body ILIKE '%'||(filters->>'q')||'%' OR shortcut ILIKE '%'||(filters->>'q')||'%') AND (coalesce(filters->>'category','')='' OR category=filters->>'category') ORDER BY updated_at DESC,id OFFSET off LIMIT 50)x),'[]'),
  'more_replies',(SELECT count(*)>off+50 FROM briofold_inbox_saved_replies WHERE briofold_channel_reply(w,e,a,id) AND workspace_id=w AND environment=e AND active=(coalesce(filters->>'reply_state','active')<>'archived') AND (visibility='team' OR created_by=a) AND (coalesce(filters->>'q','')='' OR title ILIKE '%'||(filters->>'q')||'%' OR body ILIKE '%'||(filters->>'q')||'%' OR shortcut ILIKE '%'||(filters->>'q')||'%') AND (coalesce(filters->>'category','')='' OR category=filters->>'category')),
  'tickets',coalesce((SELECT jsonb_agg(to_jsonb(x)-'workspace_id' ORDER BY x.created_at DESC,x.id) FROM (SELECT q.*,z.customer_name FROM briofold_inbox_tickets q JOIN inbox_threads z ON z.id=q.thread_id JOIN inbox_connections c ON c.id=z.connection_id WHERE briofold_channel_allowed(w,a,c.id,'read') AND q.workspace_id=w AND (t IS NULL OR q.thread_id=t) AND c.environment=e AND c.enabled AND (coalesce(filters->>'q','')='' OR q.title ILIKE '%'||(filters->>'q')||'%' OR q.detail ILIKE '%'||(filters->>'q')||'%' OR z.customer_name ILIKE '%'||(filters->>'q')||'%') AND (coalesce(filters->>'ticket_status','')='' OR q.status=filters->>'ticket_status') ORDER BY q.created_at DESC,q.id OFFSET ticket_offset LIMIT 50)x),'[]'),
  'more_tickets',(SELECT count(*)>ticket_offset+50 FROM briofold_inbox_tickets q JOIN inbox_threads z ON z.id=q.thread_id JOIN inbox_connections c ON c.id=z.connection_id WHERE briofold_channel_allowed(w,a,c.id,'read') AND q.workspace_id=w AND (t IS NULL OR q.thread_id=t) AND c.environment=e AND c.enabled AND (coalesce(filters->>'q','')='' OR q.title ILIKE '%'||(filters->>'q')||'%' OR q.detail ILIKE '%'||(filters->>'q')||'%' OR z.customer_name ILIKE '%'||(filters->>'q')||'%') AND (coalesce(filters->>'ticket_status','')='' OR q.status=filters->>'ticket_status')),
  'more_history',(SELECT count(*)>history_offset+50 FROM briofold_inbox_events WHERE workspace_id=w AND thread_id=t),
  'history',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC,x.operation_key) FROM (SELECT operation_key,actor_id,action,created_at FROM briofold_inbox_events WHERE workspace_id=w AND thread_id=t ORDER BY created_at DESC,operation_key OFFSET history_offset LIMIT 50)x),'[]'),
  'note',coalesce(v.note,''),'note_version',coalesce(v.note_version,0),
  'can_send',((SELECT role FROM workspace_members WHERE workspace_id=w AND user_id=a) IN ('owner','admin','editor') OR pg13_capability_override(w,a,'inbox:send') IS TRUE) AND pg13_capability_override(w,a,'inbox:send') IS DISTINCT FROM false AND (t IS NULL OR EXISTS(SELECT 1 FROM inbox_threads ch WHERE ch.id=t AND briofold_channel_allowed(w,a,ch.connection_id,'send'))),
  'can_manage',((SELECT role FROM workspace_members WHERE workspace_id=w AND user_id=a) IN ('owner','admin') OR pg13_capability_override(w,a,'inbox:manage') IS TRUE) AND pg13_capability_override(w,a,'inbox:manage') IS DISTINCT FROM false
 ) INTO r;RETURN r;
END $$;
ALTER FUNCTION briofold_growth_audience_preview(uuid,text,uuid,text,text) RENAME TO briofold_growth_audience_preview_before_dispatch;
REVOKE ALL ON FUNCTION briofold_growth_audience_preview_before_dispatch(uuid,text,uuid,text,text) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
CREATE FUNCTION briofold_growth_audience_preview(w uuid,e text,a uuid,ch text,segment text) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE p jsonb;BEGIN
 p:=briofold_growth_audience_preview_before_dispatch(w,e,a,ch,segment);
 IF ch IN ('messenger','instagram') THEN p:=p||jsonb_build_object('provider_status','approval-required','note','Evidence review only. Use current-window delivery preview/approval; no send is authorized by these counts.');END IF;
 RETURN p;
END $$;
REVOKE ALL ON FUNCTION briofold_growth_audience_preview(uuid,text,uuid,text,text),briofold_broadcast_coupon_snapshot_immutable() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION briofold_growth_audience_preview(uuid,text,uuid,text,text) TO ekmivo_financial_runtime,ekmivo_financial_projection;
-- Retire/scrub identity proof referenced by immutable consent evidence rather
-- than failing contact erasure on its foreign key or deleting legal history.
CREATE OR REPLACE FUNCTION briofold_customers_write_before_channel_scopes(w uuid,e text,a uuid,k uuid,act text,b jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE c briofold_customers;other briofold_customers;old briofold_customer_commands;fp text;res jsonb;cid uuid:=(b->>'id')::uuid;target uuid;rev bigint;fid uuid;BEGIN
 PERFORM briofold_customer_actor(w,a,'manage');
 IF e IS NULL OR e NOT IN ('live','sandbox') OR k IS NULL OR jsonb_typeof(b) IS DISTINCT FROM 'object' OR pg_column_size(b)>16384 OR act IS NULL OR act NOT IN ('save','merge','unlink','dispute','followup','followup-status','delete','link') THEN RAISE EXCEPTION 'Invalid customer command' USING ERRCODE='22023';END IF;
 fp:=encode(sha256(convert_to(e||act||b::text,'UTF8')),'hex');PERFORM pg_advisory_xact_lock(hashtextextended('crm:'||w::text,0));
 SELECT * INTO old FROM briofold_customer_commands WHERE workspace_id=w AND actor_id=a AND operation_key=k;IF old.operation_key IS NOT NULL THEN IF old.fingerprint<>fp THEN RAISE EXCEPTION 'Operation key conflict' USING ERRCODE='23505';END IF;RETURN old.result;END IF;
 IF act='save' AND cid IS NULL THEN INSERT INTO briofold_customers(workspace_id,environment,name) VALUES(w,e,'Customer') RETURNING id INTO cid;ELSE SELECT * INTO c FROM briofold_customers WHERE id=cid AND workspace_id=w AND environment=e FOR UPDATE;IF c.id IS NULL OR c.deleted_at IS NOT NULL OR c.merged_into IS NOT NULL THEN RAISE EXCEPTION 'Customer unavailable' USING ERRCODE='42501';END IF;IF (b->>'revision')::bigint IS DISTINCT FROM c.revision THEN RAISE EXCEPTION 'Customer changed; reload' USING ERRCODE='40001';END IF;END IF;
 IF act='save' THEN
  IF length(trim(coalesce(b->>'name','')))=0 OR length(b->>'name')>160 OR length(coalesce(b->>'notes',''))>4000 OR length(coalesce(b->>'reason',''))>500 OR jsonb_typeof(b->'tags') IS DISTINCT FROM 'array' OR jsonb_array_length(b->'tags')>20 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(b->'tags') x WHERE length(x)>40 OR trim(x)='') OR coalesce(b->>'stage','new') NOT IN ('new','contacted','qualified','proposal','won','lost') OR coalesce(b->>'temperature','warm') NOT IN ('hot','warm','cold') THEN RAISE EXCEPTION 'Invalid profile' USING ERRCODE='22023';END IF;
  IF coalesce(b->>'assignee','')<>'' AND NOT EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id=w AND user_id=(b->>'assignee')::uuid) THEN RAISE EXCEPTION 'Invalid assignee' USING ERRCODE='42501';END IF;
  IF b ? 'email' OR b ? 'phone' OR b ? 'notes' OR b ? 'reason' OR b ? 'preferences' THEN PERFORM briofold_customer_actor(w,a,'contact');END IF;
  IF length(coalesce(b->>'email',''))>254 OR (coalesce(b->>'email','')<>'' AND b->>'email'!~'^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$') OR (coalesce(b->>'phone','')<>'' AND b->>'phone'!~'^\+?[0-9]{7,15}$') THEN RAISE EXCEPTION 'Invalid contact' USING ERRCODE='22023';END IF;
  IF b ? 'preferences' AND (jsonb_typeof(b->'preferences') IS DISTINCT FROM 'object' OR b->'preferences'->>'marketing' IS NULL OR b->'preferences'->>'marketing' NOT IN ('unknown','opted-in','opted-out') OR jsonb_typeof(b->'preferences'->'do_not_contact') IS DISTINCT FROM 'boolean' OR ((b->'preferences')-'marketing'-'do_not_contact')<>'{}'::jsonb) THEN RAISE EXCEPTION 'Invalid preferences' USING ERRCODE='22023';END IF;
  UPDATE briofold_customers SET name=b->>'name',tags=ARRAY(SELECT jsonb_array_elements_text(b->'tags')),stage=coalesce(b->>'stage','new'),temperature=coalesce(b->>'temperature','warm'),assignee=nullif(b->>'assignee','')::uuid,email=CASE WHEN b ? 'email' THEN lower(trim(b->>'email')) ELSE email END,phone=coalesce(b->>'phone',phone),notes=coalesce(b->>'notes',notes),reason=coalesce(b->>'reason',reason),preferences=coalesce(b->'preferences',preferences) WHERE id=cid;
  UPDATE briofold_customer_proofs p SET revoked_at=now() FROM briofold_customers x WHERE x.id=cid AND p.customer_id=cid AND p.revoked_at IS NULL AND ((p.kind='email' AND p.value<>x.email) OR (p.kind='phone' AND p.value<>x.phone));
  UPDATE briofold_customer_challenges ch SET used_at=now(),value='' FROM briofold_customers x WHERE x.id=cid AND ch.customer_id=cid AND ch.value<>x.email;
 ELSIF act='merge' THEN
  PERFORM briofold_customer_actor(w,a,'contact');target:=(b->>'target')::uuid;SELECT * INTO other FROM briofold_customers WHERE id=target AND workspace_id=w AND environment=e AND deleted_at IS NULL AND merged_into IS NULL FOR UPDATE;
  IF other.id IS NULL OR other.id=cid OR b->>'confirmed' IS DISTINCT FROM 'true' OR NOT EXISTS(SELECT 1 FROM briofold_customer_proofs x JOIN briofold_customer_proofs y ON y.workspace_id=x.workspace_id AND y.environment=x.environment AND y.kind=x.kind AND y.value=x.value WHERE x.customer_id=cid AND y.customer_id=target AND x.revoked_at IS NULL AND y.revoked_at IS NULL) THEN RAISE EXCEPTION 'Verified shared identity and confirmation required' USING ERRCODE='42501';END IF;
  -- Canonical target is deterministic, independent of request order.
  IF (c.created_at,c.id)<(other.created_at,other.id) THEN target:=cid;cid:=other.id;END IF;
  UPDATE briofold_customer_sources SET customer_id=target WHERE customer_id=cid;UPDATE briofold_customer_proofs SET customer_id=target WHERE customer_id=cid;UPDATE briofold_customer_followups SET customer_id=target WHERE customer_id=cid;
  UPDATE briofold_customers SET merged_into=target WHERE id=cid;UPDATE briofold_customers SET revision=revision+1,updated_at=now(),preferences=jsonb_build_object('marketing',CASE WHEN preferences->>'marketing'='opted-out' OR c.preferences->>'marketing'='opted-out' OR other.preferences->>'marketing'='opted-out' THEN 'opted-out' ELSE 'unknown' END,'do_not_contact',(preferences->>'do_not_contact')::boolean OR (c.preferences->>'do_not_contact')::boolean OR (other.preferences->>'do_not_contact')::boolean) WHERE id=target;
 ELSIF act IN ('unlink','dispute') THEN
  PERFORM briofold_customer_actor(w,a,'contact');IF b->>'confirmed' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Confirm identity correction' USING ERRCODE='22023';END IF;
  fid:=(b->>'source')::uuid;IF NOT EXISTS(SELECT 1 FROM briofold_customer_sources WHERE id=fid AND customer_id=cid) THEN RAISE EXCEPTION 'Source unavailable' USING ERRCODE='42501';END IF;
  INSERT INTO briofold_customers(workspace_id,environment,name,preferences) VALUES(w,e,'Separated customer','{"marketing":"opted-out","do_not_contact":true}') RETURNING id INTO target;UPDATE briofold_customer_sources SET customer_id=target WHERE id=fid;
  UPDATE briofold_customer_proofs SET revoked_at=now() WHERE customer_id=cid AND revoked_at IS NULL;UPDATE briofold_customers SET preferences='{"marketing":"opted-out","do_not_contact":true}' WHERE id=cid;
 ELSIF act='followup' THEN
  IF length(trim(coalesce(b->>'body','')))=0 OR length(b->>'body')>2000 OR NOT EXISTS(SELECT 1 FROM pg_timezone_names WHERE name=b->>'time_zone') OR (b->>'due_at')::timestamptz IS NULL OR (b->>'due_at')::timestamptz>now()+interval '2 years' THEN RAISE EXCEPTION 'Invalid follow-up' USING ERRCODE='22023';END IF;
  IF (SELECT count(*) FROM briofold_customer_followups WHERE customer_id=cid)>=200 THEN RAISE EXCEPTION 'Follow-up limit' USING ERRCODE='54000';END IF;
  IF coalesce(b->>'kind','reminder') NOT IN ('reminder','offer')
   OR (coalesce(b->>'quiet_start','')='' AND coalesce(b->>'quiet_end','')<>'')
   OR (coalesce(b->>'quiet_start','')<>'' AND coalesce(b->>'quiet_end','')='')
   OR (coalesce(b->>'quiet_start','')<>'' AND (b->>'quiet_start'!~'^([01][0-9]|2[0-3]):[0-5][0-9]$' OR b->>'quiet_end'!~'^([01][0-9]|2[0-3]):[0-5][0-9]$'))
   THEN RAISE EXCEPTION 'Invalid reminder kind or quiet hours' USING ERRCODE='22023';END IF;
  INSERT INTO briofold_customer_followups(id,workspace_id,environment,customer_id,due_at,time_zone,body,created_by,requested_due_at,kind,quiet_start,quiet_end)
   VALUES((b->>'followup_id')::uuid,w,e,cid,
    briofold_followup_due((b->>'due_at')::timestamptz,b->>'time_zone',nullif(b->>'quiet_start','')::time,nullif(b->>'quiet_end','')::time),
    b->>'time_zone',b->>'body',a,(b->>'due_at')::timestamptz,coalesce(b->>'kind','reminder'),nullif(b->>'quiet_start','')::time,nullif(b->>'quiet_end','')::time);
 ELSIF act='followup-status' THEN
  IF b->>'status' IS NULL OR b->>'status' NOT IN ('done','cancelled','skipped') THEN RAISE EXCEPTION 'Invalid follow-up status' USING ERRCODE='22023';END IF;UPDATE briofold_customer_followups SET status=b->>'status' WHERE id=(b->>'followup_id')::uuid AND customer_id=cid AND status='scheduled';IF NOT FOUND THEN RAISE EXCEPTION 'Follow-up unavailable' USING ERRCODE='40001';END IF;
 ELSIF act='delete' THEN
  PERFORM briofold_customer_actor(w,a,'contact');IF b->>'confirmed' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Deletion confirmation required' USING ERRCODE='22023';END IF;
  WITH RECURSIVE ids(id) AS(SELECT cid UNION SELECT x.id FROM briofold_customers x JOIN ids ON x.merged_into=ids.id) DELETE FROM briofold_customer_challenges WHERE customer_id IN(SELECT id FROM ids);
  WITH RECURSIVE ids(id) AS(SELECT cid UNION SELECT x.id FROM briofold_customers x JOIN ids ON x.merged_into=ids.id) UPDATE briofold_growth_channel_consents SET revoked_at=greatest(now(),verified_at) WHERE customer_id IN(SELECT id FROM ids) AND revoked_at IS NULL;
  WITH RECURSIVE ids(id) AS(SELECT cid UNION SELECT x.id FROM briofold_customers x JOIN ids ON x.merged_into=ids.id) UPDATE briofold_customer_proofs SET value='',revoked_at=coalesce(revoked_at,now()) WHERE customer_id IN(SELECT id FROM ids);
  WITH RECURSIVE ids(id) AS(SELECT cid UNION SELECT x.id FROM briofold_customers x JOIN ids ON x.merged_into=ids.id) DELETE FROM briofold_customer_proofs p WHERE customer_id IN(SELECT id FROM ids) AND NOT EXISTS(SELECT 1 FROM briofold_growth_channel_consents c WHERE c.identity_proof_id=p.id);
  UPDATE briofold_customer_followups SET body='Deleted',status='cancelled' WHERE customer_id=cid;
  WITH RECURSIVE ids(id) AS(SELECT cid UNION SELECT x.id FROM briofold_customers x JOIN ids ON x.merged_into=ids.id) UPDATE briofold_customers SET name='Deleted customer',email='',phone='',notes='',reason='',tags='{}',assignee=NULL,deleted_at=now(),preferences='{"marketing":"opted-out","do_not_contact":true}' WHERE id IN(SELECT id FROM ids);
 ELSIF act='link' THEN
  PERFORM briofold_customer_actor(w,a,'contact');IF b->>'kind' NOT IN ('thread','finance-customer','invoice','payment','order','api') OR b->>'kind' IS NULL THEN RAISE EXCEPTION 'Invalid source' USING ERRCODE='22023';END IF;
  -- Only trusted Go can validate references in the physically separate finance realm.
  IF b->>'kind'='thread' AND NOT EXISTS(SELECT 1 FROM inbox_threads t JOIN inbox_connections x ON x.id=t.connection_id WHERE t.id=(b->>'source_id')::uuid AND t.workspace_id=w AND x.environment=e) THEN RAISE EXCEPTION 'Source unavailable' USING ERRCODE='42501';END IF;
  IF b->>'kind'='order' AND NOT EXISTS(SELECT 1 FROM inbox_orders o JOIN inbox_threads t ON t.id=o.thread_id JOIN inbox_connections x ON x.id=t.connection_id WHERE o.id=(b->>'source_id')::uuid AND o.workspace_id=w AND x.environment=e) THEN RAISE EXCEPTION 'Source unavailable' USING ERRCODE='42501';END IF;
  INSERT INTO briofold_customer_sources(workspace_id,environment,customer_id,kind,source_id) VALUES(w,e,cid,b->>'kind',(b->>'source_id')::uuid);
 END IF;
 UPDATE briofold_customers SET revision=revision+1,updated_at=now() WHERE id=cid RETURNING revision INTO rev;
 INSERT INTO briofold_customer_events(workspace_id,environment,customer_id,actor_id,action,detail) VALUES(w,e,cid,a,act,jsonb_strip_nulls(jsonb_build_object('target',target,'source',b->>'source','followup_id',b->>'followup_id')));
 SELECT revision INTO rev FROM briofold_customers WHERE id=coalesce(target,cid);res:=jsonb_build_object('id',coalesce(target,cid),'revision',rev);INSERT INTO briofold_customer_commands VALUES(w,a,k,fp,res);RETURN res;
END $$;
-- Scope-free members and owners do not need a recursive identity walk for
-- every list row. Restricted identities use indexed family/source traversal.
CREATE INDEX briofold_customer_scope_family ON briofold_customers(workspace_id,environment,merged_into) WHERE merged_into IS NOT NULL;
CREATE INDEX briofold_customer_scope_links ON briofold_customer_sources(workspace_id,environment,customer_id,kind,source_id);
CREATE OR REPLACE FUNCTION briofold_channel_customer(w uuid,e text,a uuid,cid uuid) RETURNS boolean
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE role_name text;allowed boolean;BEGIN
 SELECT m.role INTO role_name FROM workspace_members m JOIN app_users u ON u.id=m.user_id AND u.disabled_at IS NULL WHERE m.workspace_id=w AND m.user_id=a;
 IF role_name IS NULL OR NOT EXISTS(SELECT 1 FROM briofold_customers WHERE id=cid AND workspace_id=w AND environment=e) THEN RETURN false;END IF;
 IF role_name='owner' OR NOT EXISTS(SELECT 1 FROM briofold_member_channel_scopes WHERE workspace_id=w AND user_id=a AND deny_read) THEN RETURN true;END IF;
 WITH RECURSIVE identities(id,merged_into) AS (
 SELECT id,merged_into FROM briofold_customers WHERE id=cid AND workspace_id=w AND environment=e
 UNION SELECT c.id,c.merged_into FROM briofold_customers c JOIN identities i ON (c.merged_into=i.id OR c.id=i.merged_into) WHERE c.workspace_id=w AND c.environment=e)
 SELECT NOT EXISTS(SELECT 1 FROM briofold_customer_sources s JOIN identities i ON i.id=s.customer_id
 JOIN inbox_threads t ON (s.kind='thread' AND t.id=s.source_id OR s.kind='order' AND EXISTS(SELECT 1 FROM inbox_orders o WHERE o.id=s.source_id AND o.workspace_id=w AND o.thread_id=t.id))
 WHERE s.workspace_id=w AND s.environment=e AND s.kind IN ('thread','order') AND NOT briofold_channel_allowed(w,a,t.connection_id,'read')) INTO allowed;
 RETURN allowed;
END $$;
COMMIT;
