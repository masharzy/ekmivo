-- CONTROL-only additive, deny-only team channel/page restrictions.
-- Independent Store-owned paired devices retain their existing authorization;
-- a member restriction never grants device or financial access.
BEGIN;
DO $$BEGIN IF to_regclass('public.briofold_broadcast_runs') IS NULL OR to_regclass('public.financial_realm') IS NOT NULL THEN RAISE EXCEPTION '0208 requires CONTROL 0207';END IF;END $$;
CREATE TABLE briofold_member_channel_scopes(
 workspace_id uuid NOT NULL,user_id uuid NOT NULL,connection_id uuid NOT NULL,
 deny_read boolean NOT NULL DEFAULT false,deny_send boolean NOT NULL DEFAULT false,
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,user_id,connection_id),
 FOREIGN KEY(workspace_id,user_id) REFERENCES workspace_members(workspace_id,user_id) ON DELETE CASCADE,
 FOREIGN KEY(workspace_id,connection_id) REFERENCES inbox_connections(workspace_id,id)
);
ALTER TABLE briofold_member_channel_scopes ENABLE ROW LEVEL SECURITY;
ALTER TABLE briofold_member_channel_scopes FORCE ROW LEVEL SECURITY;
CREATE POLICY briofold_member_channel_operator ON briofold_member_channel_scopes TO CURRENT_USER USING(true) WITH CHECK(true);
REVOKE ALL ON briofold_member_channel_scopes FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
CREATE FUNCTION briofold_channel_allowed(w uuid,a uuid,c uuid,cap text) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM workspace_members m JOIN app_users u ON u.id=m.user_id AND u.disabled_at IS NULL
 JOIN inbox_connections n ON n.id=c AND n.workspace_id=w
 WHERE m.workspace_id=w AND m.user_id=a AND cap IN ('read','send')
 AND (m.role='owner' OR NOT EXISTS(SELECT 1 FROM briofold_member_channel_scopes s
 WHERE s.workspace_id=w AND s.user_id=a AND s.connection_id=c AND (s.deny_read OR (cap='send' AND s.deny_send)))))
$$;
CREATE FUNCTION briofold_channel_thread(w uuid,e text,a uuid,t uuid,cap text) RETURNS void
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN
 PERFORM briofold_inbox_actor(w,a,CASE WHEN cap='read' THEN 'inbox:read' ELSE 'inbox:send' END);
 IF NOT EXISTS(SELECT 1 FROM inbox_threads x JOIN inbox_connections n ON n.id=x.connection_id AND n.workspace_id=w AND n.environment=e AND n.enabled WHERE x.id=t AND x.workspace_id=w AND briofold_channel_allowed(w,a,n.id,cap)) THEN
 RAISE EXCEPTION 'Conversation unavailable' USING ERRCODE='42501';END IF;
END $$;
-- A mixed-source merged customer is hidden in its entirety when any linked
-- thread is unreadable. This prevents notes/proofs/archives leaking the denied
-- identity while retaining normal access to profiles with only allowed sources.
CREATE FUNCTION briofold_channel_customer(w uuid,e text,a uuid,cid uuid) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 WITH RECURSIVE identities(id,merged_into) AS (
 SELECT id,merged_into FROM briofold_customers WHERE id=cid AND workspace_id=w AND environment=e
 UNION SELECT c.id,c.merged_into FROM briofold_customers c JOIN identities i ON (c.merged_into=i.id OR c.id=i.merged_into) WHERE c.workspace_id=w AND c.environment=e)
 SELECT EXISTS(SELECT 1 FROM identities) AND NOT EXISTS(SELECT 1 FROM briofold_customer_sources s JOIN identities i ON i.id=s.customer_id JOIN inbox_threads t ON (s.kind='thread' AND t.id=s.source_id OR s.kind='order' AND EXISTS(SELECT 1 FROM inbox_orders o WHERE o.id=s.source_id AND o.workspace_id=w AND o.thread_id=t.id)) WHERE s.workspace_id=w AND s.environment=e AND s.kind IN ('thread','order') AND NOT briofold_channel_allowed(w,a,t.connection_id,'read'))
$$;
CREATE FUNCTION briofold_channel_scopes_read(w uuid,a uuid) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN
 IF pg13_actor(w,a,false)<>'owner' THEN RAISE EXCEPTION 'Owner required' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('members',coalesce((SELECT jsonb_agg(jsonb_build_object('id',m.user_id,'name',u.display_name,'role',m.role) ORDER BY u.display_name,m.user_id) FROM workspace_members m JOIN app_users u ON u.id=m.user_id AND u.disabled_at IS NULL WHERE m.workspace_id=w AND m.role<>'owner'),'[]'),
 'channels',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'provider',provider,'external_id',external_id,'enabled',enabled) ORDER BY created_at,id) FROM inbox_connections WHERE workspace_id=w AND environment='live'),'[]'),
 'scopes',coalesce((SELECT jsonb_agg(to_jsonb(s)-'workspace_id') FROM briofold_member_channel_scopes s WHERE s.workspace_id=w),'[]'));
END $$;
CREATE FUNCTION briofold_channel_scopes_write(w uuid,a uuid,b jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE member uuid:=(b->>'user_id')::uuid;conn uuid:=(b->>'connection_id')::uuid;old briofold_member_channel_scopes;dr boolean;ds boolean;BEGIN
 IF pg13_actor(w,a,true)<>'owner' THEN RAISE EXCEPTION 'Owner required' USING ERRCODE='42501';END IF;
 IF jsonb_typeof(b) IS DISTINCT FROM 'object' OR jsonb_typeof(b->'deny_read') IS DISTINCT FROM 'boolean' OR jsonb_typeof(b->'deny_send') IS DISTINCT FROM 'boolean' THEN RAISE EXCEPTION 'Invalid channel scope' USING ERRCODE='22023';END IF;
 PERFORM 1 FROM workspace_members m JOIN app_users u ON u.id=m.user_id AND u.disabled_at IS NULL WHERE m.workspace_id=w AND m.user_id=member AND m.role<>'owner' FOR SHARE OF m,u;
 IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM inbox_connections WHERE workspace_id=w AND id=conn AND environment='live') THEN RAISE EXCEPTION 'Member/channel unavailable' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('briofold:channel-scope:'||w::text,0));
 SELECT * INTO old FROM briofold_member_channel_scopes WHERE workspace_id=w AND user_id=member AND connection_id=conn FOR UPDATE;
 IF coalesce(old.revision,0) IS DISTINCT FROM (b->>'revision')::bigint THEN RAISE EXCEPTION 'Scope changed; reload' USING ERRCODE='40001';END IF;
 dr:=(b->>'deny_read')::boolean;ds:=(b->>'deny_send')::boolean;
 INSERT INTO briofold_member_channel_scopes(workspace_id,user_id,connection_id,deny_read,deny_send) VALUES(w,member,conn,dr,ds)
 ON CONFLICT(workspace_id,user_id,connection_id) DO UPDATE SET deny_read=dr,deny_send=ds,revision=briofold_member_channel_scopes.revision+1,updated_at=now();
 INSERT INTO pg13_control_audit(workspace_id,actor_id,action,resource_id) VALUES(w,a,'member-channel-scope',member);
 RETURN jsonb_build_object('saved',true);
END $$;
-- Restricted members cannot use global Inbox/AI configuration to read or
-- modify other pages. Their independent payment/settings base permissions
-- otherwise remain governed by existing role/grant checks.
ALTER FUNCTION pg13_capability_override(uuid,uuid,text) RENAME TO pg13_capability_override_before_channel_scopes;
REVOKE ALL ON FUNCTION pg13_capability_override_before_channel_scopes(uuid,uuid,text) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
CREATE FUNCTION pg13_capability_override(w uuid,a uuid,cap text) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT CASE WHEN cap='inbox:manage' AND EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id=w AND user_id=a AND role<>'owner') AND EXISTS(SELECT 1 FROM briofold_member_channel_scopes WHERE workspace_id=w AND user_id=a AND (deny_read OR deny_send)) THEN false ELSE pg13_capability_override_before_channel_scopes(w,a,cap) END
$$;
REVOKE ALL ON FUNCTION briofold_channel_allowed(uuid,uuid,uuid,text),briofold_channel_thread(uuid,text,uuid,uuid,text),briofold_channel_customer(uuid,text,uuid,uuid),briofold_channel_scopes_read(uuid,uuid),briofold_channel_scopes_write(uuid,uuid,jsonb),pg13_capability_override(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION briofold_channel_allowed(uuid,uuid,uuid,text),briofold_channel_scopes_read(uuid,uuid),briofold_channel_scopes_write(uuid,uuid,jsonb),pg13_capability_override(uuid,uuid,text) TO ekmivo_financial_runtime,ekmivo_financial_projection;

CREATE OR REPLACE FUNCTION inbox_page(w uuid,e text,d uuid,t uuid,before_seq bigint,f jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;rk text:=coalesce(f->>'reader_kind','device');off integer:=coalesce((f->>'offset')::integer,0);queue text:=coalesce(f->>'queue','all');q text:=coalesce(f->>'q','');start_day date;end_day date;tag text:=coalesce(f->>'label','');BEGIN
 IF rk='user' THEN PERFORM briofold_inbox_actor(w,d,'inbox:read');END IF;
 IF NOT EXISTS(SELECT 1 FROM workspace_product_access WHERE workspace_id=w AND product='ai' AND enabled) THEN RAISE EXCEPTION 'AI disabled' USING ERRCODE='42501';END IF;
 IF t IS NOT NULL AND rk='user' THEN PERFORM briofold_channel_thread(w,e,d,t,'read');END IF;
 IF t IS NOT NULL THEN RETURN inbox_page_media(w,e,d,t,before_seq,f);END IF;
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

CREATE OR REPLACE FUNCTION briofold_customers_read(w uuid,e text,a uuid,cid uuid,off integer,q text,filter text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE role_name text;pii boolean;staff boolean;items jsonb;item jsonb;
BEGIN
 role_name:=briofold_customer_actor(w,a,'read');
 pii:=role_name IN ('owner','admin');
 staff:=role_name IN ('owner','admin','editor');
 IF e NOT IN ('live','sandbox') OR e IS NULL OR off IS NULL OR off<0 OR off>10000
    OR q IS NULL OR length(q)>100
    OR filter NOT IN ('','new','contacted','qualified','proposal','won','lost','due') THEN
  RAISE EXCEPTION 'Invalid CRM filter' USING ERRCODE='22023';
 END IF;
 IF cid IS NULL THEN
  SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) INTO items FROM (
   SELECT c.id,c.name,c.stage,c.temperature,c.tags,
    CASE WHEN staff THEN c.assignee ELSE NULL END AS assignee,
    c.assignee IS NOT NULL AS assigned,c.revision,c.updated_at,
    CASE WHEN pii THEN c.email ELSE '' END AS email,
    CASE WHEN pii THEN c.phone ELSE '' END AS phone,
    EXISTS(SELECT 1 FROM briofold_customer_followups f
     WHERE f.customer_id=c.id AND f.status='scheduled' AND f.due_at<=now()) AS due
   FROM briofold_customers c
   WHERE briofold_channel_customer(w,e,a,c.id) AND c.workspace_id=w AND c.environment=e AND c.deleted_at IS NULL AND c.merged_into IS NULL
    AND (q='' OR c.name ILIKE '%'||q||'%' OR (pii AND
      (c.email ILIKE '%'||q||'%' OR c.phone ILIKE '%'||q||'%')) OR
      EXISTS(SELECT 1 FROM unnest(c.tags) tag WHERE tag ILIKE '%'||q||'%'))
    AND (filter='' OR c.stage=filter OR (filter='due' AND
      EXISTS(SELECT 1 FROM briofold_customer_followups f WHERE f.customer_id=c.id
      AND f.status='scheduled' AND f.due_at<=now())))
   ORDER BY c.updated_at DESC,c.id LIMIT 51 OFFSET off
  ) x;
  RETURN jsonb_build_object('items',items,'can_manage',staff,'can_contact',pii,
   'can_export',pii,
   'members',CASE WHEN staff THEN coalesce((SELECT jsonb_agg(jsonb_build_object('id',u.id,'name',u.display_name))
      FROM workspace_members m JOIN app_users u ON u.id=m.user_id
      WHERE m.workspace_id=w AND u.disabled_at IS NULL),'[]'::jsonb)
     ELSE '[]'::jsonb END);
 END IF;
 SELECT to_jsonb(c)-'workspace_id'-'email'-'phone'-'notes'-'reason'-'assignee'
   ||jsonb_build_object('assignee',CASE WHEN staff THEN c.assignee ELSE NULL END,
     'assigned',c.assignee IS NOT NULL)
  INTO item FROM briofold_customers c WHERE briofold_channel_customer(w,e,a,c.id) AND c.workspace_id=w AND c.environment=e AND c.id=cid;
 IF item IS NULL THEN RAISE EXCEPTION 'Customer unavailable' USING ERRCODE='42501';END IF;
 IF pii THEN
  SELECT item||jsonb_build_object('email',c.email,'phone',c.phone,'notes',c.notes,'reason',c.reason)
    INTO item FROM briofold_customers c WHERE c.id=cid;
 END IF;
 RETURN jsonb_build_object('customer',item,'can_manage',staff,'can_contact',pii,'can_export',pii,
  'archives',CASE WHEN pii THEN coalesce((WITH RECURSIVE ids(id) AS (
    SELECT cid UNION SELECT x.id FROM briofold_customers x JOIN ids ON x.merged_into=ids.id)
    SELECT jsonb_agg(to_jsonb(z)) FROM (SELECT x.id,x.name,x.email,x.phone,x.notes,x.tags
    FROM briofold_customers x WHERE briofold_channel_customer(w,e,a,x.id) AND x.id IN(SELECT id FROM ids) AND x.id<>cid
    ORDER BY x.created_at,x.id LIMIT 51 OFFSET off) z),'[]'::jsonb) ELSE '[]'::jsonb END,
  'sources',coalesce((SELECT jsonb_agg(to_jsonb(s)-'workspace_id'-'environment')
    FROM briofold_customer_sources s WHERE s.customer_id=cid),'[]'::jsonb),
  'proofs',CASE WHEN pii THEN coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,
    'kind',p.kind,'value',p.value,'verified_at',p.verified_at,'revoked_at',p.revoked_at))
    FROM briofold_customer_proofs p WHERE p.customer_id=cid),'[]'::jsonb)
    ELSE '[]'::jsonb END,
  'followups',coalesce((SELECT jsonb_agg(jsonb_build_object('id',f.id,'due_at',f.due_at,
    'time_zone',f.time_zone,'status',f.status,'kind',f.kind,'requested_due_at',f.requested_due_at,'quiet_start',left(f.quiet_start::text,5),'quiet_end',left(f.quiet_end::text,5),'body',CASE WHEN pii THEN f.body ELSE '' END)
    ORDER BY f.due_at) FROM briofold_customer_followups f WHERE f.customer_id=cid),'[]'::jsonb),
  'events',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.sequence DESC)
    FROM (SELECT sequence,action,created_at FROM briofold_customer_events
     WHERE customer_id=cid ORDER BY sequence DESC LIMIT 51 OFFSET off) x),'[]'::jsonb));
END $$;

CREATE OR REPLACE FUNCTION briofold_customers_search(w uuid,e text,a uuid,off integer,q text,
 stage_filter text,source_filter text,priority_filter text,assigned_filter text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE role_name text;pii boolean;staff boolean;base jsonb;items jsonb;
BEGIN
 role_name:=briofold_customer_actor(w,a,'read');
 pii:=role_name IN ('owner','admin');staff:=role_name IN ('owner','admin','editor');
 IF e IS NULL OR e NOT IN ('live','sandbox') OR off IS NULL OR off NOT BETWEEN 0 AND 10000
  OR q IS NULL OR length(q)>100
  OR stage_filter IS NULL OR stage_filter NOT IN ('','new','contacted','qualified','proposal','won','lost','due','unconverted')
  OR source_filter IS NULL OR source_filter NOT IN ('','thread','finance-customer','invoice','payment','order','api')
  OR priority_filter IS NULL OR priority_filter NOT IN ('','hot','warm','cold')
  OR assigned_filter IS NULL THEN
  RAISE EXCEPTION 'Invalid CRM search' USING ERRCODE='22023';
 END IF;
 IF assigned_filter<>'' THEN
  IF NOT staff THEN RAISE EXCEPTION 'Assignment filter restricted' USING ERRCODE='42501';END IF;
  IF assigned_filter<>'unassigned' THEN
   IF assigned_filter!~*'^[0-9a-f]{8}-([0-9a-f]{4}-){3}[0-9a-f]{12}$' THEN
    RAISE EXCEPTION 'Invalid assignment filter' USING ERRCODE='22023';
   END IF;
   IF NOT EXISTS(SELECT 1 FROM workspace_members m JOIN app_users u ON u.id=m.user_id
    WHERE m.workspace_id=w AND m.user_id=assigned_filter::uuid AND u.disabled_at IS NULL) THEN
    RAISE EXCEPTION 'Assignment unavailable' USING ERRCODE='42501';
   END IF;
  END IF;
 END IF;
 -- Reuse canonical permissions/member projection; never expose extra PII.
 base:=briofold_customers_read(w,e,a,NULL,0,'','');
 SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) INTO items FROM (
  SELECT c.id,c.name,c.stage,c.temperature,c.tags,
   CASE WHEN staff THEN c.assignee ELSE NULL END AS assignee,
   c.assignee IS NOT NULL AS assigned,c.revision,c.updated_at,
   CASE WHEN pii THEN c.email ELSE '' END AS email,
   CASE WHEN pii THEN c.phone ELSE '' END AS phone,
   EXISTS(SELECT 1 FROM briofold_customer_followups f WHERE f.customer_id=c.id
    AND f.status='scheduled' AND f.due_at<=now()) AS due
  FROM briofold_customers c
  WHERE briofold_channel_customer(w,e,a,c.id) AND c.workspace_id=w AND c.environment=e AND c.deleted_at IS NULL AND c.merged_into IS NULL
   AND (q='' OR c.name ILIKE '%'||q||'%' OR (pii AND
    (c.email ILIKE '%'||q||'%' OR c.phone ILIKE '%'||q||'%')) OR
    EXISTS(SELECT 1 FROM unnest(c.tags) tag WHERE tag ILIKE '%'||q||'%'))
   AND (stage_filter='' OR c.stage=stage_filter OR (stage_filter='unconverted' AND c.stage IN ('qualified','proposal') AND NOT EXISTS(
    SELECT 1 FROM commerce_orders o WHERE o.workspace_id=w AND o.environment=e AND o.status<>'cancelled'
     AND (o.customer_id=c.id OR EXISTS(SELECT 1 FROM briofold_customer_sources linked WHERE linked.workspace_id=w AND linked.environment=e AND linked.customer_id=c.id AND linked.kind='order' AND linked.source_id=o.id)))) OR (stage_filter='due' AND
    EXISTS(SELECT 1 FROM briofold_customer_followups f WHERE f.customer_id=c.id
     AND f.status='scheduled' AND f.due_at<=now())))
   AND (source_filter='' OR EXISTS(SELECT 1 FROM briofold_customer_sources s
    WHERE s.workspace_id=w AND s.environment=e AND s.customer_id=c.id AND s.kind=source_filter))
   AND (priority_filter='' OR c.temperature=priority_filter)
   AND (assigned_filter='' OR (assigned_filter='unassigned' AND c.assignee IS NULL)
    OR (assigned_filter<>'unassigned' AND c.assignee::text=assigned_filter))
  ORDER BY c.updated_at DESC,c.id LIMIT 51 OFFSET off
 ) x;
 RETURN base||jsonb_build_object('items',items);
END $$;

CREATE OR REPLACE FUNCTION briofold_inbox_alert_read(w uuid,a uuid,off integer,q text,k text,unread_only boolean) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN
 PERFORM briofold_inbox_actor(w,a,'inbox:read');
 IF off IS NULL OR off NOT BETWEEN 0 AND 10000 OR q IS NULL OR length(q)>100 OR k IS NULL OR k NOT IN ('','assignment','handover','sla','ticket','ai-review') OR unread_only IS NULL THEN RAISE EXCEPTION 'Invalid alert filters' USING ERRCODE='22023';END IF;
 RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC,x.id) FROM (
  SELECT n.id,n.thread_id,n.kind,n.created_at,t.customer_name,r.read_at FROM briofold_inbox_alerts n JOIN inbox_threads t ON t.id=n.thread_id JOIN inbox_connections c ON c.id=t.connection_id AND c.enabled AND c.environment='live' LEFT JOIN briofold_inbox_alert_reads r ON r.alert_id=n.id AND r.actor_id=a WHERE briofold_channel_allowed(w,a,c.id,'read') AND n.workspace_id=w AND (n.recipient_id IS NULL OR n.recipient_id=a) AND (k='' OR n.kind=k) AND (q='' OR t.customer_name ILIKE '%'||q||'%') AND (NOT unread_only OR r.read_at IS NULL) ORDER BY n.created_at DESC,n.id OFFSET off LIMIT 51
 )x),'[]'));
END $$;

CREATE OR REPLACE FUNCTION briofold_inbox_alert_mark(w uuid,a uuid,alert uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN
 PERFORM briofold_inbox_actor(w,a,'inbox:read');
 IF alert IS NULL OR NOT EXISTS(SELECT 1 FROM briofold_inbox_alerts n JOIN inbox_threads t ON t.id=n.thread_id JOIN inbox_connections c ON c.id=t.connection_id AND c.enabled AND c.environment='live' WHERE briofold_channel_allowed(w,a,c.id,'read') AND n.workspace_id=w AND n.id=alert AND (n.recipient_id IS NULL OR n.recipient_id=a)) THEN RAISE EXCEPTION 'Alert unavailable' USING ERRCODE='42501';END IF;
 INSERT INTO briofold_inbox_alert_reads(alert_id,actor_id) VALUES(alert,a) ON CONFLICT DO NOTHING;RETURN true;
END $$;

CREATE OR REPLACE FUNCTION briofold_ai_review_read(w uuid,e text,a uuid,off integer,q text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN
 PERFORM briofold_inbox_actor(w,a,'inbox:read');
 IF e IS DISTINCT FROM 'live' OR off IS NULL OR off NOT BETWEEN 0 AND 10000 OR q IS NULL OR length(q)>100 THEN RAISE EXCEPTION 'Invalid AI review filters' USING ERRCODE='22023';END IF;
 RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC,x.id) FROM (
  SELECT j.id,j.thread_id,CASE WHEN j.state='running' THEN 'WORKER_OUTCOME_UNKNOWN' ELSE j.reason END AS reason,j.created_at,t.customer_name,m.body AS question FROM briofold_ai_channel_jobs j JOIN inbox_threads t ON t.id=j.thread_id JOIN inbox_connections c ON c.id=t.connection_id AND c.environment=e AND c.enabled JOIN inbox_messages m ON m.id=j.inbound_id
  WHERE briofold_channel_allowed(w,a,c.id,'read') AND j.workspace_id=w AND (j.state='review' OR (j.state='running' AND j.leased_at<now()-interval '2 minutes')) AND (q='' OR t.customer_name ILIKE '%'||q||'%' OR to_tsvector('simple',m.body)@@websearch_to_tsquery('simple',q)) ORDER BY j.created_at DESC,j.id OFFSET off LIMIT 50)x),'[]'),
  'can_send',EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id=w AND user_id=a AND role IN ('owner','admin','editor')) AND pg13_capability_override(w,a,'inbox:send') IS DISTINCT FROM false);
END $$;

CREATE OR REPLACE FUNCTION briofold_ai_review_done(w uuid,e text,a uuid,job_id uuid,op uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE j briofold_ai_channel_jobs;prior briofold_inbox_events;fp text:=encode(digest(job_id::text,'sha256'),'hex');result jsonb;BEGIN
 PERFORM briofold_inbox_actor(w,a,'inbox:send');
 IF e IS DISTINCT FROM 'live' OR op IS NULL OR job_id IS NULL THEN RAISE EXCEPTION 'Invalid AI review request' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('briofold:inbox:'||w::text,0));
 SELECT * INTO prior FROM briofold_inbox_events WHERE workspace_id=w AND operation_key=op;
 IF FOUND THEN IF prior.actor_id<>a OR prior.action<>'ai-review' OR prior.request_hash<>fp THEN RAISE EXCEPTION 'Review request conflict' USING ERRCODE='23505';END IF;RETURN prior.result;END IF;
 SELECT x.* INTO j FROM briofold_ai_channel_jobs x JOIN inbox_threads t ON t.id=x.thread_id JOIN inbox_connections c ON c.id=t.connection_id AND c.environment=e AND c.enabled WHERE x.workspace_id=w AND x.id=job_id FOR UPDATE OF x;
 IF j.id IS NOT NULL THEN PERFORM briofold_channel_thread(w,e,a,j.thread_id,'send');END IF;
 IF j.id IS NULL THEN RAISE EXCEPTION 'Review request unavailable' USING ERRCODE='42501';END IF;
 IF j.state<>'review' AND NOT(j.state='running' AND j.leased_at<now()-interval '2 minutes') THEN RAISE EXCEPTION 'Review state changed' USING ERRCODE='40001';END IF;
 UPDATE briofold_ai_channel_jobs SET state='cancelled',reason='HUMAN_REVIEWED',updated_at=now() WHERE id=job_id;
 result:=jsonb_build_object('reviewed',true);
 INSERT INTO briofold_inbox_events(workspace_id,operation_key,thread_id,actor_id,action,request_hash,result) VALUES(w,op,j.thread_id,a,'ai-review',fp,result);
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION briofold_response_snapshot(w uuid,e text,a uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE totals jsonb;channels jsonb;people jsonb;private_team boolean;
BEGIN
 PERFORM briofold_customer_actor(w,a,'read');
 PERFORM briofold_inbox_actor(w,a,'inbox:read');
 IF e IS NULL OR e NOT IN ('live','sandbox') THEN RAISE EXCEPTION 'Invalid reporting realm' USING ERRCODE='22023';END IF;
 private_team:=EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id=w AND user_id=a AND role IN ('owner','admin'));
 -- Measure the first successful reply after the first customer message in
 -- this window, once per conversation. Failed/queued output is not a reply.
 WITH inbound AS (
  SELECT t.id,c.provider,min(m.created_at) AS started
  FROM inbox_threads t JOIN inbox_connections c ON c.id=t.connection_id AND c.workspace_id=w AND c.environment=e
  JOIN inbox_messages m ON m.thread_id=t.id AND m.workspace_id=w AND m.sender='customer'
  WHERE briofold_channel_allowed(w,a,c.id,'read') AND t.workspace_id=w AND m.created_at>=now()-interval '7 days' AND m.created_at<=now()
  GROUP BY t.id,c.provider
 ), cycles AS (
  SELECT i.*,r.sender,extract(epoch FROM r.responded-i.started) AS seconds
  FROM inbound i LEFT JOIN LATERAL (
   SELECT m.sender,coalesce(m.sent_at,m.created_at) AS responded
   FROM inbox_messages m WHERE m.workspace_id=w AND m.thread_id=i.id AND m.sender IN ('seller','ai')
   AND m.state IN ('sent','delivered','seen') AND coalesce(m.sent_at,m.created_at)>=i.started
   AND coalesce(m.sent_at,m.created_at)<=now()
   ORDER BY coalesce(m.sent_at,m.created_at),m.sequence LIMIT 1
  ) r ON true
 ), by_channel AS (
  SELECT provider,count(*) AS conversations,count(seconds) AS responded,
   count(*) FILTER(WHERE sender='seller') AS human_first,count(*) FILTER(WHERE sender='ai') AS ai_first,
   count(*) FILTER(WHERE seconds<=300) AS within_five_minutes,
   floor(avg(seconds))::bigint AS average_seconds FROM cycles GROUP BY provider
 )
 SELECT jsonb_build_object('conversations',count(*),'responded',count(seconds),
  'unanswered',count(*) FILTER(WHERE seconds IS NULL),'human_first',count(*) FILTER(WHERE sender='seller'),
  'ai_first',count(*) FILTER(WHERE sender='ai'),'within_five_minutes',count(*) FILTER(WHERE seconds<=300),
  'average_seconds',floor(avg(seconds))::bigint),
  (SELECT coalesce(jsonb_agg(to_jsonb(b) ORDER BY provider),'[]'::jsonb) FROM by_channel b)
 INTO totals,channels FROM cycles;
 -- Current assignment workload is not historical responder attribution.
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.open DESC,x.name,x.id),'[]'::jsonb) INTO people FROM (
  SELECT m.user_id AS id,coalesce(nullif(u.display_name,''),'Member') AS name,
   count(*) FILTER(WHERE f.status<>'resolved') AS open,
   count(*) FILTER(WHERE f.status<>'resolved' AND f.due_at<now()) AS overdue
  FROM workspace_members m JOIN app_users u ON u.id=m.user_id AND u.disabled_at IS NULL
  JOIN briofold_inbox_work f ON f.owner_id=m.user_id AND f.workspace_id=w
  JOIN inbox_threads t ON t.id=f.thread_id AND t.workspace_id=w
  JOIN inbox_connections c ON c.id=t.connection_id AND c.workspace_id=w AND c.environment=e
  WHERE briofold_channel_allowed(w,a,c.id,'read') AND m.workspace_id=w GROUP BY m.user_id,u.display_name
  ORDER BY open DESC,name,m.user_id LIMIT 50
 ) x WHERE private_team;
 RETURN jsonb_build_object('totals',totals,'channels',channels,'people',people,'can_view_people',private_team,
  'from',now()-interval '7 days','through',now());
END $$;

CREATE OR REPLACE FUNCTION briofold_growth_snapshot(w uuid,e text,a uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r jsonb;crm jsonb;orders jsonb;chats jsonb;
BEGIN
 PERFORM briofold_customer_actor(w,a,'read');
 PERFORM commerce_actor(w,a,false);
 IF e IS NULL OR e NOT IN ('live','sandbox') THEN RAISE EXCEPTION 'Invalid realm' USING ERRCODE='22023';END IF;
 SELECT jsonb_build_object('total',count(*),'qualified',count(*) FILTER(WHERE stage='qualified'),
   'won',count(*) FILTER(WHERE stage='won'),'assigned',count(*) FILTER(WHERE assignee IS NOT NULL),
   'opted_in',count(*) FILTER(WHERE preferences->>'marketing'='opted-in' AND NOT (preferences->>'do_not_contact')::boolean))
 INTO crm FROM briofold_customers WHERE briofold_channel_customer(w,e,a,id) AND workspace_id=w AND environment=e AND deleted_at IS NULL AND merged_into IS NULL;
 SELECT crm||jsonb_build_object('due',count(*) FILTER(WHERE f.status='scheduled' AND f.due_at<=now()),
   'upcoming',count(*) FILTER(WHERE f.status='scheduled' AND f.due_at>now()),
   'done',count(*) FILTER(WHERE f.status='done')) INTO crm
 FROM briofold_customer_followups f JOIN briofold_customers c ON c.id=f.customer_id
 WHERE briofold_channel_customer(w,e,a,c.id) AND f.workspace_id=w AND f.environment=e AND c.workspace_id=w AND c.environment=e
   AND c.deleted_at IS NULL AND c.merged_into IS NULL;
 SELECT jsonb_build_object('total',count(*),'draft',count(*) FILTER(WHERE status='draft'),
   'confirmed',count(*) FILTER(WHERE status='confirmed'),'delivered',count(*) FILTER(WHERE status='delivered'),
   'cancelled',count(*) FILTER(WHERE status='cancelled'),'returned',count(*) FILTER(WHERE status='returned'),
   'ai',count(*) FILTER(WHERE source='ai'),'api',count(*) FILTER(WHERE source='api'),
   'manual',count(*) FILTER(WHERE source='manual')) INTO orders
 FROM commerce_orders WHERE workspace_id=w AND environment=e;
 SELECT jsonb_build_object('conversations',
   (SELECT count(*) FROM inbox_threads t JOIN inbox_connections c ON c.id=t.connection_id
    WHERE briofold_channel_allowed(w,a,c.id,'read') AND t.workspace_id=w AND c.workspace_id=w AND c.environment=e AND c.enabled),
   'messages_7d',
   (SELECT count(*) FROM inbox_messages m JOIN inbox_threads t ON t.id=m.thread_id
    JOIN inbox_connections c ON c.id=t.connection_id
    WHERE briofold_channel_allowed(w,a,c.id,'read') AND m.workspace_id=w AND t.workspace_id=w AND c.workspace_id=w AND c.environment=e
      AND m.created_at>=now()-interval '7 days')) INTO chats;
 r:=jsonb_build_object('customers',crm,'commerce',orders,'inbox',chats,'as_of',now());
 RETURN r;
END $$;

CREATE OR REPLACE FUNCTION briofold_growth_operational_snapshot(w uuid,e text,a uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE campaigns jsonb;bookings jsonb;team jsonb;replies jsonb;
BEGIN
 PERFORM briofold_growth_store_actor(w,a,'read');
 IF e IS NULL OR e NOT IN ('live','sandbox') THEN RAISE EXCEPTION 'Invalid reporting realm' USING ERRCODE='22023';END IF;
 SELECT jsonb_build_object(
  'broadcast_drafts',count(*) FILTER(WHERE kind='broadcast' AND status='draft'),
  'broadcast_planned',count(*) FILTER(WHERE kind='broadcast' AND status='planned'),
  'post_drafts',count(*) FILTER(WHERE kind='post' AND status='draft'),
  'post_planned',count(*) FILTER(WHERE kind='post' AND status='planned'))
 INTO campaigns FROM briofold_campaign_drafts WHERE workspace_id=w AND environment=e;
 SELECT jsonb_build_object(
  'booking_requested',count(*) FILTER(WHERE status='requested'),
  'booking_confirmed',count(*) FILTER(WHERE status='confirmed'),
  'booking_completed',count(*) FILTER(WHERE status='completed'),
  'booking_cancelled',count(*) FILTER(WHERE status='cancelled'))
 INTO bookings FROM briofold_bookings WHERE workspace_id=w AND environment=e;
 SELECT jsonb_build_object(
  'assigned',count(*) FILTER(WHERE t.owner_id IS NOT NULL),
  'unassigned',count(*) FILTER(WHERE t.owner_id IS NULL),
  'open',count(*) FILTER(WHERE coalesce(t.status,'open')='open'),
  'pending',count(*) FILTER(WHERE t.status='pending'),
  'resolved',count(*) FILTER(WHERE t.status='resolved'),
  'overdue',count(*) FILTER(WHERE t.due_at<now() AND t.status NOT IN ('resolved')))
 INTO team FROM inbox_threads th
 JOIN inbox_connections c ON c.id=th.connection_id AND c.workspace_id=w AND c.environment=e
 LEFT JOIN briofold_inbox_work t ON t.thread_id=th.id AND t.workspace_id=w
 WHERE briofold_channel_allowed(w,a,c.id,'read') AND th.workspace_id=w;
 SELECT jsonb_build_object(
  'inbound_7d',count(*) FILTER(WHERE m.sender='customer'),
  'human_outbound_7d',count(*) FILTER(WHERE m.sender='seller' AND m.state IN ('sent','delivered','seen')),
  'ai_outbound_7d',count(*) FILTER(WHERE m.sender='ai' AND m.state IN ('sent','delivered','seen')))
 INTO replies FROM inbox_messages m
 JOIN inbox_threads th ON th.id=m.thread_id AND th.workspace_id=w
 JOIN inbox_connections c ON c.id=th.connection_id AND c.workspace_id=w AND c.environment=e
 WHERE briofold_channel_allowed(w,a,c.id,'read') AND m.workspace_id=w AND m.created_at>=now()-interval '7 days';
 RETURN jsonb_build_object('campaigns',campaigns,'bookings',bookings,'team',team,'messages',replies,'as_of',now());
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
  'can_send',((SELECT role FROM workspace_members WHERE workspace_id=w AND user_id=a) IN ('owner','admin','editor') OR pg13_capability_override(w,a,'inbox:send') IS TRUE) AND pg13_capability_override(w,a,'inbox:send') IS DISTINCT FROM false,
  'can_manage',((SELECT role FROM workspace_members WHERE workspace_id=w AND user_id=a) IN ('owner','admin') OR pg13_capability_override(w,a,'inbox:manage') IS TRUE) AND pg13_capability_override(w,a,'inbox:manage') IS DISTINCT FROM false
 ) INTO r;RETURN r;
END $$;
CREATE FUNCTION briofold_channel_reply(w uuid,e text,a uuid,r uuid) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT NOT EXISTS(SELECT 1 FROM briofold_inbox_saved_replies s CROSS JOIN LATERAL jsonb_array_elements(s.messages) part
 LEFT JOIN inbox_messages m ON m.id=(CASE WHEN part->>'type'<>'text' THEN part->>'message_id' END)::uuid
 LEFT JOIN inbox_threads t ON t.id=m.thread_id
 WHERE s.id=r AND s.workspace_id=w AND s.environment=e AND part->>'type'<>'text'
 AND (m.id IS NULL OR NOT briofold_channel_allowed(w,a,t.connection_id,'read')))
$$;
ALTER TABLE inbox_messages ADD COLUMN requested_by uuid REFERENCES app_users(id);
ALTER FUNCTION inbox_action(uuid,text,uuid,uuid,text,jsonb) RENAME TO inbox_action_before_channel_scopes;
REVOKE ALL ON FUNCTION inbox_action_before_channel_scopes(uuid,text,uuid,uuid,text,jsonb) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
CREATE FUNCTION inbox_action(w uuid,e text,d uuid,t uuid,act text,b jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE res jsonb;BEGIN
 IF b->>'reader_kind'='user' THEN PERFORM briofold_channel_thread(w,e,d,t,CASE WHEN act='read' THEN 'read' ELSE 'send' END);END IF;
 res:=inbox_action_before_channel_scopes(w,e,d,t,act,b);
 IF b->>'reader_kind'='user' AND res->>'id' IS NOT NULL THEN UPDATE inbox_messages SET requested_by=d WHERE id=(res->>'id')::uuid AND workspace_id=w AND sender='seller' AND state='queued';END IF;
 RETURN res;
END $$;
ALTER FUNCTION inbox_advanced(uuid,text,uuid,uuid,text,jsonb) RENAME TO inbox_advanced_before_channel_scopes;
REVOKE ALL ON FUNCTION inbox_advanced_before_channel_scopes(uuid,text,uuid,uuid,text,jsonb) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
CREATE FUNCTION inbox_advanced(w uuid,e text,d uuid,t uuid,act text,b jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE res jsonb;source_thread uuid;BEGIN
 IF b->>'reader_kind'='user' THEN
 PERFORM briofold_channel_thread(w,e,d,t,CASE WHEN act IN ('profile','products','info') THEN 'read' ELSE 'send' END);
 IF act='forward' THEN SELECT thread_id INTO source_thread FROM inbox_messages WHERE id=(b->>'message_id')::uuid AND workspace_id=w;PERFORM briofold_channel_thread(w,e,d,source_thread,'read');END IF;
 END IF;
 res:=inbox_advanced_before_channel_scopes(w,e,d,t,act,b);
 IF b->>'reader_kind'='user' AND res->>'id' IS NOT NULL THEN UPDATE inbox_messages SET requested_by=d WHERE id=(res->>'id')::uuid AND workspace_id=w AND sender='seller' AND state='queued';END IF;
 RETURN res;
END $$;
ALTER FUNCTION briofold_saved_reply_send(uuid,text,uuid,uuid,uuid,jsonb) RENAME TO briofold_saved_reply_send_before_channel_scopes;
REVOKE ALL ON FUNCTION briofold_saved_reply_send_before_channel_scopes(uuid,text,uuid,uuid,uuid,jsonb) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
CREATE FUNCTION briofold_saved_reply_send(w uuid,e text,a uuid,t uuid,k uuid,b jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE res jsonb;BEGIN
 PERFORM briofold_channel_thread(w,e,a,t,'send');
 IF NOT briofold_channel_reply(w,e,a,(b->>'id')::uuid) THEN RAISE EXCEPTION 'Reply unavailable' USING ERRCODE='42501';END IF;
 res:=briofold_saved_reply_send_before_channel_scopes(w,e,a,t,k,b);
 UPDATE inbox_messages SET requested_by=a WHERE workspace_id=w AND batch_id=k AND state='queued' AND sender='seller';RETURN res;
END $$;
ALTER FUNCTION briofold_inbox_work_write(uuid,text,uuid,uuid,uuid,text,jsonb) RENAME TO briofold_inbox_work_write_before_channel_scopes;
REVOKE ALL ON FUNCTION briofold_inbox_work_write_before_channel_scopes(uuid,text,uuid,uuid,uuid,text,jsonb) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
CREATE FUNCTION briofold_inbox_work_write(w uuid,e text,a uuid,t uuid,k uuid,act text,b jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN
 IF t IS NOT NULL THEN
  PERFORM briofold_channel_thread(w,e,a,t,'send');
  IF nullif(b->>'owner_id','') IS NOT NULL THEN PERFORM briofold_channel_thread(w,e,(b->>'owner_id')::uuid,t,'send');END IF;
 END IF;
 IF act IN ('saved-reply','archive-reply') AND b->>'id' IS NOT NULL AND NOT briofold_channel_reply(w,e,a,(b->>'id')::uuid) THEN RAISE EXCEPTION 'Reply unavailable' USING ERRCODE='42501';END IF;
 RETURN briofold_inbox_work_write_before_channel_scopes(w,e,a,t,k,act,b);
END $$;
ALTER FUNCTION briofold_customers_write(uuid,text,uuid,uuid,text,jsonb) RENAME TO briofold_customers_write_before_channel_scopes;
REVOKE ALL ON FUNCTION briofold_customers_write_before_channel_scopes(uuid,text,uuid,uuid,text,jsonb) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
CREATE FUNCTION briofold_customers_write(w uuid,e text,a uuid,k uuid,act text,b jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN
 IF nullif(b->>'id','') IS NOT NULL AND NOT briofold_channel_customer(w,e,a,(b->>'id')::uuid) THEN RAISE EXCEPTION 'Customer unavailable' USING ERRCODE='42501';END IF;
 IF act='merge' AND NOT briofold_channel_customer(w,e,a,(b->>'target')::uuid) THEN RAISE EXCEPTION 'Customer unavailable' USING ERRCODE='42501';END IF;
 IF act='link' AND b->>'kind'='thread' THEN PERFORM briofold_channel_thread(w,e,a,(b->>'source_id')::uuid,'read');END IF;
 RETURN briofold_customers_write_before_channel_scopes(w,e,a,k,act,b);
END $$;
CREATE FUNCTION briofold_channel_send_valid(i uuid) RETURNS boolean
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE msg inbox_messages;conn uuid;BEGIN
 SELECT * INTO msg FROM inbox_messages WHERE id=i;
 IF msg.sender<>'seller' THEN RETURN true;END IF;
 SELECT connection_id INTO conn FROM inbox_threads WHERE id=msg.thread_id;
 IF msg.requested_by IS NULL THEN RETURN NOT EXISTS(SELECT 1 FROM briofold_member_channel_scopes WHERE workspace_id=msg.workspace_id AND connection_id=conn AND (deny_read OR deny_send));END IF;
 BEGIN PERFORM briofold_inbox_actor(msg.workspace_id,msg.requested_by,'inbox:send');EXCEPTION WHEN insufficient_privilege THEN RETURN false;END;
 RETURN briofold_channel_allowed(msg.workspace_id,msg.requested_by,conn,'send');
END $$;
GRANT EXECUTE ON FUNCTION inbox_action(uuid,text,uuid,uuid,text,jsonb),inbox_advanced(uuid,text,uuid,uuid,text,jsonb),briofold_saved_reply_send(uuid,text,uuid,uuid,uuid,jsonb),briofold_inbox_work_write(uuid,text,uuid,uuid,uuid,text,jsonb),briofold_customers_write(uuid,text,uuid,uuid,text,jsonb),briofold_channel_thread(uuid,text,uuid,uuid,text),briofold_channel_send_valid(uuid) TO ekmivo_financial_runtime,ekmivo_financial_projection;
REVOKE ALL ON FUNCTION inbox_action(uuid,text,uuid,uuid,text,jsonb),inbox_advanced(uuid,text,uuid,uuid,text,jsonb),briofold_saved_reply_send(uuid,text,uuid,uuid,uuid,jsonb),briofold_inbox_work_write(uuid,text,uuid,uuid,uuid,text,jsonb),briofold_customers_write(uuid,text,uuid,uuid,text,jsonb),briofold_channel_reply(uuid,text,uuid,uuid),briofold_channel_send_valid(uuid) FROM PUBLIC;

CREATE OR REPLACE FUNCTION briofold_comments_read(w uuid,a uuid,off integer,q text,st text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN
 PERFORM briofold_inbox_actor(w,a,'inbox:read');
 IF off IS NULL OR off NOT BETWEEN 0 AND 10000 OR q IS NULL OR length(q)>100 OR st IS NULL OR st NOT IN ('','pending','review','queued','sent','failed','uncertain','dismissed') THEN RAISE EXCEPTION 'Invalid filters' USING ERRCODE='22023';END IF;
 RETURN jsonb_build_object('rules',coalesce((SELECT jsonb_agg(config||jsonb_build_object('id',id,'revision',revision,'connection_id',connection_id) ORDER BY id) FROM briofold_comment_rules WHERE (connection_id IS NULL AND NOT EXISTS(SELECT 1 FROM briofold_member_channel_scopes WHERE workspace_id=w AND user_id=a AND deny_read) OR briofold_channel_allowed(w,a,connection_id,'read')) AND workspace_id=w),'[]'),
 'connections',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'provider',provider,'external_id',external_id)) FROM inbox_connections WHERE briofold_channel_allowed(w,a,id,'read') AND workspace_id=w AND enabled AND environment='live' AND provider IN ('ms','ig')),'[]'),
 'items',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC,x.id) FROM (SELECT id,connection_id,external_id,post_id,body,revision,state,reason,decision,created_at FROM briofold_comments WHERE briofold_channel_allowed(w,a,connection_id,'read') AND workspace_id=w AND (st='' OR state=st) AND (q='' OR body ILIKE '%'||q||'%' OR post_id=q) ORDER BY created_at DESC,id OFFSET off LIMIT 51)x),'[]'),
 'audit',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC,x.id) FROM (SELECT id,comment_id,actor_id,action,detail,created_at FROM briofold_comment_audit ev WHERE workspace_id=w AND EXISTS(SELECT 1 FROM briofold_comments z WHERE z.id=ev.comment_id AND briofold_channel_allowed(w,a,z.connection_id,'read')) ORDER BY created_at DESC,id OFFSET off LIMIT 51)x),'[]'),
 'can_manage',((SELECT role FROM workspace_members WHERE workspace_id=w AND user_id=a) IN ('owner','admin') OR pg13_capability_override(w,a,'inbox:manage') IS TRUE) AND pg13_capability_override(w,a,'inbox:manage') IS DISTINCT FROM false);
END $$;

CREATE OR REPLACE FUNCTION briofold_customer_challenge(w uuid,e text,a uuid,cid uuid,d text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE c briofold_customers;BEGIN
 PERFORM briofold_customer_actor(w,a,'contact');IF NOT briofold_channel_customer(w,e,a,cid) THEN RAISE EXCEPTION 'Customer unavailable' USING ERRCODE='42501';END IF;PERFORM pg_advisory_xact_lock(hashtextextended('crm:'||w::text,0));SELECT * INTO c FROM briofold_customers WHERE id=cid AND workspace_id=w AND environment=e AND deleted_at IS NULL AND merged_into IS NULL FOR UPDATE;
 IF c.id IS NULL OR c.email='' OR d IS NULL OR d!~'^[0-9a-f]{64}$' THEN RAISE EXCEPTION 'Email unavailable' USING ERRCODE='22023';END IF;
 IF EXISTS(SELECT 1 FROM briofold_customer_challenges WHERE digest=d) THEN IF NOT EXISTS(SELECT 1 FROM briofold_customer_challenges WHERE digest=d AND customer_id=cid AND value=c.email AND expires_at>now()) THEN RAISE EXCEPTION 'Verification changed' USING ERRCODE='23505';END IF;RETURN jsonb_build_object('email',c.email,'created',false);END IF;
 DELETE FROM briofold_customer_challenges WHERE workspace_id=w AND expires_at<now()-interval '24 hours';
 IF (SELECT count(*) FROM briofold_customer_challenges WHERE workspace_id=w AND value=c.email AND created_at>now()-interval '1 hour')>=3 THEN RAISE EXCEPTION 'Verification rate limited' USING ERRCODE='54000';END IF;
 INSERT INTO briofold_customer_challenges(digest,workspace_id,environment,customer_id,value) VALUES(d,w,e,cid,c.email);RETURN jsonb_build_object('email',c.email,'created',true);
END $$;

CREATE OR REPLACE FUNCTION briofold_unified_activity(w uuid,e text,a uuid,category text DEFAULT '',q text DEFAULT '',off integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE role_name text; result jsonb;
BEGIN
 role_name:=commerce_actor(w,a);
 IF e IS NULL OR e NOT IN ('live','sandbox')
   OR coalesce(category,'') NOT IN ('','orders','customers','comments','settings')
   OR q IS NULL OR length(q)>100 OR off IS NULL OR off<0 OR off>1000
 THEN RAISE EXCEPTION 'Invalid activity filter' USING ERRCODE='22023'; END IF;

 WITH events AS (
  SELECT 'orders'::text AS source,ev.action,ev.actor_id,ev.created_at,'realm'::text AS scope
   FROM commerce_events ev WHERE ev.workspace_id=w AND ev.environment=e
   ORDER BY created_at DESC LIMIT 1051
 ), customer_events AS (
  SELECT 'customers'::text AS source,ev.action,ev.actor_id,ev.created_at,'realm'::text AS scope
   FROM briofold_customer_events ev WHERE briofold_channel_customer(w,e,a,ev.customer_id) AND ev.workspace_id=w AND ev.environment=e
   ORDER BY created_at DESC LIMIT 1051
 ), comment_events AS (
  SELECT 'comments'::text AS source,ev.action,ev.actor_id,ev.created_at,'realm'::text AS scope
   FROM briofold_comment_audit ev
    JOIN briofold_comments c ON c.id=ev.comment_id AND c.workspace_id=w
    JOIN inbox_connections cn ON cn.id=c.connection_id AND cn.workspace_id=w
   WHERE briofold_channel_allowed(w,a,cn.id,'read') AND ev.workspace_id=w AND cn.environment=e
   ORDER BY ev.created_at DESC LIMIT 1051
 ), settings_events AS (
  SELECT 'settings'::text AS source,ev.action,ev.actor_id,ev.created_at,'store'::text AS scope
   FROM pg13_control_audit ev WHERE ev.workspace_id=w AND role_name IN ('owner','admin')
   ORDER BY ev.created_at DESC LIMIT 1051
 ), filtered AS (
  SELECT * FROM (
   SELECT * FROM events UNION ALL SELECT * FROM customer_events
   UNION ALL SELECT * FROM comment_events UNION ALL SELECT * FROM settings_events
  ) history
  WHERE (category='' OR history.source=category) AND (q='' OR history.action ILIKE '%'||q||'%')
 ), paged AS (
  SELECT source,action,created_at,scope,
   CASE WHEN actor_id IS NULL THEN 'System'
    WHEN role_name NOT IN ('owner','admin') THEN 'Team member'
    ELSE coalesce((SELECT u.display_name FROM app_users u WHERE u.id=actor_id),'Former team member') END actor_name
  FROM filtered ORDER BY created_at DESC,source,action LIMIT 51 OFFSET off
 )
 SELECT jsonb_build_object(
  'items',coalesce(jsonb_agg(to_jsonb(paged) ORDER BY created_at DESC,source,action),'[]'::jsonb),
  'can_export',role_name IN ('owner','admin'),
  'scope',e,'cursor',off
 ) INTO result FROM paged;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION briofold_linked_order_conversion(w uuid,e text,a uuid,days integer DEFAULT 30,off integer DEFAULT 0) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE role_name text;private_team boolean;result jsonb;BEGIN
 role_name:=briofold_customer_actor(w,a,'read');
 IF e IS NULL OR e NOT IN ('live','sandbox') OR days IS NULL OR days NOT IN (7,30,90) OR off IS NULL OR off NOT BETWEEN 0 AND 10000 THEN RAISE EXCEPTION 'Invalid conversion period' USING ERRCODE='22023';END IF;
 IF EXISTS(SELECT 1 FROM workspace_product_access WHERE workspace_id=w AND product='ai' AND enabled) THEN
  PERFORM briofold_inbox_actor(w,a,'inbox:read');
 ELSIF NOT EXISTS(SELECT 1 FROM workspace_product_access WHERE workspace_id=w AND product='payments' AND enabled) OR pg13_capability_override(w,a,'payments:read') IS false THEN
  RAISE EXCEPTION 'Conversion report denied' USING ERRCODE='42501';
 END IF;
 private_team:=role_name IN ('owner','admin') AND pg13_capability_override(w,a,'workspace:settings') IS DISTINCT FROM false;
 WITH RECURSIVE cohort AS (
  SELECT c.id,c.assignee,c.created_at FROM briofold_customers c WHERE briofold_channel_customer(w,e,a,c.id) AND c.workspace_id=w AND c.environment=e AND c.deleted_at IS NULL AND c.merged_into IS NULL AND c.created_at>=now()-make_interval(days=>days) AND c.created_at<=now()
 ), cluster(root_id,id) AS (
  SELECT id,id FROM cohort UNION SELECT x.root_id,c.id FROM cluster x JOIN briofold_customers c ON c.merged_into=x.id AND c.workspace_id=w AND c.environment=e AND c.deleted_at IS NULL
 ), linked AS (
  SELECT root.id,root.assignee,
   coalesce((SELECT cn.provider FROM briofold_customer_sources src JOIN cluster cl ON cl.id=src.customer_id AND cl.root_id=root.id JOIN inbox_threads t ON t.id=src.source_id AND t.workspace_id=w JOIN inbox_connections cn ON cn.id=t.connection_id AND cn.workspace_id=w AND cn.environment=e WHERE src.workspace_id=w AND src.environment=e AND src.kind='thread' ORDER BY src.created_at,src.id LIMIT 1),'unattributed') AS source_key,
   EXISTS(SELECT 1 FROM commerce_orders o WHERE o.workspace_id=w AND o.environment=e AND o.status IN ('confirmed','packed','shipped','delivered') AND o.created_at>=root.created_at AND o.created_at<=now() AND
    (EXISTS(SELECT 1 FROM cluster cl WHERE cl.root_id=root.id AND cl.id=o.customer_id) OR EXISTS(SELECT 1 FROM briofold_customer_sources src JOIN cluster cl ON cl.id=src.customer_id AND cl.root_id=root.id WHERE src.workspace_id=w AND src.environment=e AND src.kind='order' AND src.source_id=o.id))) AS converted
  FROM cohort root
 ), sources AS (
  SELECT source_key AS key,count(*) AS profiles,count(*) FILTER(WHERE converted) AS converted FROM linked GROUP BY source_key
 ), team AS (
  SELECT CASE WHEN l.assignee IS NULL THEN 'unassigned' WHEN NOT private_team THEN 'assigned' WHEN m.user_id IS NULL OR u.disabled_at IS NOT NULL THEN 'former' ELSE l.assignee::text END AS key,
   CASE WHEN l.assignee IS NULL THEN 'Unassigned' WHEN NOT private_team THEN 'Assigned members' WHEN m.user_id IS NULL OR u.disabled_at IS NOT NULL THEN 'Former member' ELSE u.display_name END AS name,
   count(*) AS profiles,count(*) FILTER(WHERE converted) AS converted
  FROM linked l LEFT JOIN workspace_members m ON m.workspace_id=w AND m.user_id=l.assignee LEFT JOIN app_users u ON u.id=m.user_id
  GROUP BY 1,2
 ) SELECT jsonb_build_object('period_days',days,'as_of',now(),'can_export',private_team,
  'profiles',(SELECT count(*) FROM linked),'converted',(SELECT count(*) FROM linked WHERE converted),
  'sources',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.key) FROM sources x),'[]'),
  'people',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.key) FROM(SELECT * FROM team ORDER BY key OFFSET off LIMIT 50)x),'[]'),
  'more_people',(SELECT count(*)>off+50 FROM team),'offset',off) INTO result;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION inbox_next_send_v1() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE m inbox_messages;result jsonb;BEGIN
 PERFORM briofold_inbox_due_returns();
 UPDATE inbox_messages x SET state='failed',error_code='CHANNEL_ACCESS_REVOKED' WHERE x.state='queued' AND NOT briofold_channel_send_valid(x.id);
 UPDATE inbox_messages x SET state='failed',error_code='AI_CONTEXT_CHANGED' WHERE x.sender='ai' AND x.state='queued' AND NOT EXISTS(SELECT 1 FROM briofold_ai_channel_jobs j WHERE j.message_id=x.id AND j.state='completed' AND briofold_ai_channel_valid(j.id));
 UPDATE inbox_messages x SET state='failed',error_code='BROADCAST_APPROVAL_INVALID' WHERE x.state='queued' AND EXISTS(SELECT 1 FROM briofold_broadcast_recipients r WHERE r.id=x.batch_id) AND NOT briofold_broadcast_valid(x.batch_id);
 UPDATE inbox_messages SET state='uncertain',error_code='WORKER_OUTCOME_UNKNOWN' WHERE state='sending' AND attempt_at<now()-interval '1 minute';
 UPDATE inbox_messages x SET state='failed',error_code='HUMAN_TAKEOVER' FROM inbox_threads t WHERE x.thread_id=t.id AND x.state='queued' AND x.sender='ai' AND (NOT t.ai_enabled OR EXISTS(SELECT 1 FROM briofold_inbox_work z WHERE z.thread_id=t.id AND (z.disputed OR z.status='resolved')) OR EXISTS(SELECT 1 FROM briofold_inbox_tickets q WHERE q.thread_id=t.id AND q.category IN ('complaint','refund','return') AND q.status<>'resolved'));
 UPDATE inbox_messages x SET state='failed',error_code='WINDOW_CLOSED' FROM inbox_threads t WHERE x.thread_id=t.id AND x.state='queued' AND t.last_customer_at<=now()-interval '24 hours';
 SELECT x.* INTO m FROM inbox_messages x JOIN inbox_threads t ON t.id=x.thread_id JOIN inbox_connections c ON c.id=t.connection_id AND c.enabled JOIN workspace_product_access p ON p.workspace_id=x.workspace_id AND p.product='ai' AND p.enabled WHERE x.state='queued' AND briofold_channel_send_valid(x.id) AND (NOT EXISTS(SELECT 1 FROM briofold_broadcast_recipients r WHERE r.id=x.batch_id) OR (briofold_broadcast_valid(x.batch_id) AND briofold_broadcast_due(x.batch_id))) AND (x.batch_id IS NULL OR NOT EXISTS(SELECT 1 FROM inbox_messages earlier WHERE earlier.thread_id=x.thread_id AND earlier.batch_id=x.batch_id AND earlier.sequence<x.sequence AND earlier.state NOT IN ('sent','delivered','seen'))) AND (x.sender<>'ai' OR (t.ai_enabled AND EXISTS(SELECT 1 FROM briofold_ai_channel_jobs j WHERE j.message_id=x.id AND j.state='completed' AND briofold_ai_channel_valid(j.id)))) AND t.last_customer_at>now()-interval '24 hours' ORDER BY x.sequence FOR UPDATE OF t,x SKIP LOCKED LIMIT 1;
 IF m.id IS NULL THEN RETURN NULL;END IF;
 UPDATE inbox_messages SET state='sending',attempt_at=now(),attempts=attempts+1 WHERE id=m.id;
 SELECT jsonb_build_object('channel_guard',true,'broadcast',EXISTS(SELECT 1 FROM briofold_broadcast_recipients WHERE id=m.batch_id),'id',m.id,'workspace_id',m.workspace_id,'text',m.body,'channel',c.provider,'account',c.external_id,'recipient',t.external_id,'credential',encode(c.credential_cipher,'base64')) INTO result FROM inbox_threads t JOIN inbox_connections c ON c.id=t.connection_id WHERE t.id=m.thread_id;RETURN result;
END $$;

CREATE OR REPLACE FUNCTION briofold_broadcast_valid(recipient uuid) RETURNS boolean
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r briofold_broadcast_recipients;n briofold_broadcast_runs;c briofold_campaign_drafts;BEGIN
 SELECT * INTO r FROM briofold_broadcast_recipients WHERE id=recipient;IF NOT FOUND THEN RETURN false;END IF;
 SELECT * INTO n FROM briofold_broadcast_runs WHERE id=r.run_id;
 IF NOT EXISTS(SELECT 1 FROM inbox_threads t WHERE t.id=r.thread_id AND briofold_channel_allowed(n.workspace_id,n.actor_id,t.connection_id,'send')) THEN RETURN false;END IF;
 IF n.status<>'approved' OR n.expires_at<=now() THEN RETURN false;END IF;
 BEGIN PERFORM briofold_broadcast_actor(n.workspace_id,n.actor_id);EXCEPTION WHEN insufficient_privilege THEN RETURN false;END;
 SELECT * INTO c FROM briofold_campaign_drafts WHERE id=n.campaign_id;
 IF c.revision<>n.campaign_revision OR c.status='archived' OR NOT EXISTS(SELECT 1 FROM briofold_inbox_saved_replies WHERE id=n.reply_id AND workspace_id=n.workspace_id AND environment=n.environment AND active AND revision=n.reply_revision AND (visibility='team' OR created_by=n.actor_id)) THEN RETURN false;END IF;
 RETURN EXISTS(SELECT 1 FROM briofold_broadcast_audience(n.workspace_id,n.environment,n.channel,c.audience,r.customer_id)x WHERE x.thread_id=r.thread_id AND x.consent_id=r.consent_id);
END $$;

ALTER FUNCTION inbox_forward_album(uuid,text,uuid,uuid,uuid,uuid) RENAME TO inbox_forward_album_before_channel_scopes;
REVOKE ALL ON FUNCTION inbox_forward_album_before_channel_scopes(uuid,text,uuid,uuid,uuid,uuid) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
CREATE FUNCTION inbox_forward_album(w uuid,e text,d uuid,t uuid,source uuid,k uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE res jsonb;origin_thread uuid;BEGIN
 IF EXISTS(SELECT 1 FROM app_users WHERE id=d) THEN
 PERFORM briofold_channel_thread(w,e,d,t,'send');SELECT thread_id INTO origin_thread FROM inbox_messages WHERE id=source AND workspace_id=w;PERFORM briofold_channel_thread(w,e,d,origin_thread,'read');
 END IF;
 res:=inbox_forward_album_before_channel_scopes(w,e,d,t,source,k);
 IF EXISTS(SELECT 1 FROM app_users WHERE id=d) THEN UPDATE inbox_messages SET requested_by=d WHERE workspace_id=w AND thread_id=t AND state='queued' AND (batch_id=k OR id=(res->>'id')::uuid);END IF;
 RETURN res;
END $$;
REVOKE ALL ON FUNCTION inbox_forward_album(uuid,text,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION inbox_forward_album(uuid,text,uuid,uuid,uuid,uuid) TO ekmivo_financial_runtime,ekmivo_financial_projection;

CREATE OR REPLACE FUNCTION briofold_growth_operations_read(w uuid,e text,a uuid,k text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE permitted boolean;items jsonb;resources jsonb;appointments jsonb;candidates bigint;
BEGIN
 PERFORM briofold_growth_store_actor(w,a,'read');
 IF e IS NULL OR e NOT IN ('live','sandbox') OR k IS NULL OR k NOT IN ('broadcast','post','booking') THEN RAISE EXCEPTION 'Invalid growth scope' USING ERRCODE='22023';END IF;
 SELECT m.role IN ('owner','admin') INTO permitted FROM workspace_members m WHERE m.workspace_id=w AND m.user_id=a;
 IF k IN ('broadcast','post') THEN
  SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO items FROM (
   SELECT id,kind,title,body,audience,status,planned_at,time_zone,revision,created_at,updated_at
   FROM briofold_campaign_drafts WHERE workspace_id=w AND environment=e AND kind=k
   ORDER BY updated_at DESC,id LIMIT 100
  ) x;
  -- These are candidates for *future* provider-consent checks, never approved
  -- recipients. A verified email identity is NOT marketing consent proof.
  SELECT count(*) INTO candidates FROM briofold_customers c
   WHERE briofold_channel_customer(w,e,a,c.id) AND c.workspace_id=w AND c.environment=e AND c.deleted_at IS NULL AND c.merged_into IS NULL
    AND c.preferences->>'marketing'='opted-in' AND NOT (c.preferences->>'do_not_contact')::boolean
    AND EXISTS(SELECT 1 FROM briofold_customer_proofs p WHERE p.customer_id=c.id AND p.kind='email'
     AND p.value=c.email AND p.revoked_at IS NULL);
  RETURN jsonb_build_object('items',items,'can_manage',permitted,'potential_audience',candidates,
   'send_ready',false,'provider_status','not-configured','note','Draft/planning only; no recipient delivery');
 END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO resources FROM (
  SELECT id,title,active,revision FROM briofold_booking_resources
  WHERE workspace_id=w AND environment=e ORDER BY title,id LIMIT 100
 ) x;
 SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]') INTO appointments FROM (
  SELECT id,resource_id,customer_id,starts_at,ends_at,time_zone,summary,status,revision,created_at
  FROM briofold_bookings WHERE (customer_id IS NULL OR briofold_channel_customer(w,e,a,customer_id)) AND workspace_id=w AND environment=e
  ORDER BY starts_at DESC,id LIMIT 100
 ) x;
 RETURN jsonb_build_object('resources',resources,'items',appointments,'can_manage',permitted,'provider_status','internal-only');
END $$;

CREATE OR REPLACE FUNCTION briofold_growth_audience_preview(w uuid,e text,a uuid,ch text,segment text)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE eligible bigint;total bigint;opted_out bigint;unverified bigint;without_channel bigint;suppressed bigint;
BEGIN
 PERFORM briofold_growth_store_actor(w,a,'contact');
 IF e IS NULL OR e NOT IN ('live','sandbox') OR ch IS NULL
    OR ch NOT IN ('email','sms','whatsapp','messenger','instagram')
    OR segment IS NULL OR segment NOT IN ('all','qualified','won') THEN
  RAISE EXCEPTION 'Invalid preview scope' USING ERRCODE='22023';
 END IF;
 WITH candidates AS (
  SELECT
   c.preferences->>'marketing'='opted-in' AND
    coalesce((c.preferences->>'do_not_contact')::boolean,true)=false AS profile_opt_in,
   CASE WHEN ch IN ('email','sms','whatsapp') THEN
    EXISTS(SELECT 1 FROM briofold_customer_proofs p
     WHERE p.workspace_id=w AND p.environment=e AND p.customer_id=c.id
      AND p.revoked_at IS NULL AND p.kind=CASE WHEN ch='email' THEN 'email' ELSE 'phone' END
      AND p.value=CASE WHEN ch='email' THEN c.email ELSE c.phone END)
    ELSE EXISTS(SELECT 1 FROM briofold_customer_sources s
     JOIN inbox_threads t ON t.id=s.source_id
     JOIN inbox_connections conn ON conn.id=t.connection_id
     WHERE s.workspace_id=w AND s.environment=e AND s.customer_id=c.id
      AND s.kind='thread' AND conn.workspace_id=w AND conn.environment=e
      AND conn.provider=CASE WHEN ch='messenger' THEN 'ms' ELSE 'ig' END)
   END AS verified_identity,
   EXISTS(SELECT 1 FROM briofold_growth_channel_consents proof
     WHERE proof.workspace_id=w AND proof.environment=e AND proof.customer_id=c.id
      AND proof.channel=ch AND proof.revoked_at IS NULL AND proof.verified_at<=now()
      AND (proof.expires_at IS NULL OR proof.expires_at>now())
      AND ((ch IN ('email','sms','whatsapp') AND EXISTS(
       SELECT 1 FROM briofold_customer_proofs p WHERE p.id=proof.identity_proof_id
        AND p.workspace_id=w AND p.environment=e AND p.customer_id=c.id AND p.revoked_at IS NULL
        AND p.kind=CASE WHEN ch='email' THEN 'email' ELSE 'phone' END
        AND p.value=CASE WHEN ch='email' THEN c.email ELSE c.phone END))
       OR (ch IN ('messenger','instagram') AND EXISTS(
        SELECT 1 FROM briofold_customer_sources s
         JOIN inbox_threads t ON t.id=s.source_id
         JOIN inbox_connections conn ON conn.id=t.connection_id
         WHERE s.id=proof.identity_source_id AND s.workspace_id=w AND s.environment=e
          AND s.customer_id=c.id AND s.kind='thread' AND conn.workspace_id=w AND conn.environment=e
          AND conn.provider=CASE WHEN ch='messenger' THEN 'ms' ELSE 'ig' END)))) AS channel_opt_in,
   EXISTS(SELECT 1 FROM briofold_growth_suppressions suppression
     WHERE suppression.workspace_id=w AND suppression.environment=e
      AND suppression.customer_id=c.id AND suppression.channel IN ('all',ch)) AS is_suppressed
  FROM briofold_customers c
  WHERE briofold_channel_customer(w,e,a,c.id) AND c.workspace_id=w AND c.environment=e AND c.deleted_at IS NULL AND c.merged_into IS NULL
   AND (segment='all' OR (segment='qualified' AND c.stage IN ('qualified','proposal','won'))
    OR (segment='won' AND c.stage='won'))
 )
 SELECT count(*),count(*) FILTER (WHERE NOT profile_opt_in),
  count(*) FILTER (WHERE NOT verified_identity),
  count(*) FILTER (WHERE NOT channel_opt_in),
  count(*) FILTER (WHERE is_suppressed),
  count(*) FILTER (WHERE profile_opt_in AND verified_identity AND channel_opt_in AND NOT is_suppressed)
 INTO total,opted_out,unverified,without_channel,suppressed,eligible FROM candidates;
 RETURN jsonb_build_object('channel',ch,'audience',segment,'candidate_profiles',total,
  'profile_permission_blocked',opted_out,'identity_unverified',unverified,
  'channel_proof_missing',without_channel,'suppressed',suppressed,
  'potentially_eligible_with_proof',eligible,'send_ready',false,
  'provider_status','not-configured',
  'note','Preview only. Recheck proof, suppression, provider rules and local quiet hours at dispatch; delivery is disabled.');
END $$;

CREATE OR REPLACE FUNCTION briofold_growth_suppress_contact(w uuid,e text,a uuid,k uuid,b jsonb)
 RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE cid uuid;ch text;why text;prior briofold_growth_commands;fp text;result jsonb;inserted_count bigint;
BEGIN
 PERFORM briofold_growth_store_actor(w,a,'contact');
 IF e IS NULL OR e NOT IN ('live','sandbox') OR k IS NULL
  OR jsonb_typeof(b) IS DISTINCT FROM 'object' OR pg_column_size(b)>2048 THEN
  RAISE EXCEPTION 'Invalid suppression command' USING ERRCODE='22023';
 END IF;
 cid:=(b->>'customer_id')::uuid;IF NOT briofold_channel_customer(w,e,a,cid) THEN RAISE EXCEPTION 'Customer unavailable' USING ERRCODE='42501';END IF;ch:=b->>'channel';why:=b->>'reason';
 IF cid IS NULL OR ch IS NULL OR ch NOT IN ('all','email','sms','whatsapp','messenger','instagram')
  OR why IS NULL OR why NOT IN ('customer-request','provider-opt-out','staff-reported','legal') THEN
  RAISE EXCEPTION 'Invalid suppression input' USING ERRCODE='22023';
 END IF;
 fp:=encode(sha256(convert_to(e||'suppress-contact'||b::text,'UTF8')),'hex');
 PERFORM pg_advisory_xact_lock(hashtextextended('growth:'||w::text||':'||e,0));
 SELECT * INTO prior FROM briofold_growth_commands
  WHERE workspace_id=w AND actor_id=a AND operation_key=k;
 IF prior.operation_key IS NOT NULL THEN
  IF prior.fingerprint<>fp THEN RAISE EXCEPTION 'Operation key reused' USING ERRCODE='23505';END IF;
  RETURN prior.result;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM briofold_customers c
  WHERE c.id=cid AND c.workspace_id=w AND c.environment=e AND c.deleted_at IS NULL AND c.merged_into IS NULL) THEN
  RAISE EXCEPTION 'Customer unavailable in Store' USING ERRCODE='42501';
 END IF;
 INSERT INTO briofold_growth_suppressions(workspace_id,environment,customer_id,channel,reason,actor_id)
  VALUES(w,e,cid,ch,why,a) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS inserted_count = ROW_COUNT;
 IF inserted_count=1 THEN
  INSERT INTO briofold_growth_suppression_events(workspace_id,environment,customer_id,channel,reason,actor_id)
   VALUES(w,e,cid,ch,why,a);
 END IF;
 result:=jsonb_build_object('customer_id',cid,'channel',ch,'suppressed',true);
 INSERT INTO briofold_growth_commands VALUES(w,a,k,fp,result);
 RETURN result;
END $$;
ALTER FUNCTION briofold_growth_operations_write(uuid,text,uuid,uuid,text,jsonb) RENAME TO briofold_growth_operations_write_before_channel_scopes;
REVOKE ALL ON FUNCTION briofold_growth_operations_write_before_channel_scopes(uuid,text,uuid,uuid,text,jsonb) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
CREATE FUNCTION briofold_growth_operations_write(w uuid,e text,a uuid,k uuid,act text,b jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE customer uuid;BEGIN
 IF act='booking-create' THEN customer:=nullif(b->>'customer_id','')::uuid;
 ELSIF act='booking-status' THEN SELECT customer_id INTO customer FROM briofold_bookings WHERE id=(b->>'id')::uuid AND workspace_id=w AND environment=e;END IF;
 IF customer IS NOT NULL AND NOT briofold_channel_customer(w,e,a,customer) THEN RAISE EXCEPTION 'Customer unavailable' USING ERRCODE='42501';END IF;
 RETURN briofold_growth_operations_write_before_channel_scopes(w,e,a,k,act,b);
END $$;
REVOKE ALL ON FUNCTION briofold_growth_operations_write(uuid,text,uuid,uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION briofold_growth_operations_write(uuid,text,uuid,uuid,text,jsonb) TO ekmivo_financial_runtime,ekmivo_financial_projection;
COMMIT;
