-- CONTROL: inbox date/label filters apply before pagination; preserve existing authorization.
BEGIN;
DO $$ BEGIN IF to_regprocedure('public.briofold_inbox_actor(uuid,uuid,text)') IS NULL OR to_regclass('public.financial_realm') IS NOT NULL THEN RAISE EXCEPTION '0193 requires CONTROL Inbox';END IF;END $$;
CREATE OR REPLACE FUNCTION inbox_page(w uuid,e text,d uuid,t uuid,before_seq bigint,f jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;rk text:=coalesce(f->>'reader_kind','device');off integer:=coalesce((f->>'offset')::integer,0);queue text:=coalesce(f->>'queue','all');q text:=coalesce(f->>'q','');start_day date;end_day date;tag text:=coalesce(f->>'label','');BEGIN
 IF rk='user' THEN PERFORM briofold_inbox_actor(w,d,'inbox:read');END IF;
 IF NOT EXISTS(SELECT 1 FROM workspace_product_access WHERE workspace_id=w AND product='ai' AND enabled) THEN RAISE EXCEPTION 'AI disabled' USING ERRCODE='42501';END IF;
 IF t IS NOT NULL THEN RETURN inbox_page_media(w,e,d,t,before_seq,f);END IF;
 IF e IS NULL OR e NOT IN ('live','sandbox') OR length(q)>200 OR off NOT BETWEEN 0 AND 10000 OR queue NOT IN ('all','unread','mine','unassigned','attention','resolved','snoozed','open','pending','waiting') OR coalesce(f->>'channel','') NOT IN ('','ms','ig','wa') THEN RAISE EXCEPTION 'Invalid conversation filters' USING ERRCODE='22023';END IF;
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
  WHERE a.workspace_id=w AND c.enabled AND c.environment=e
  AND (start_day IS NULL OR a.last_activity_at>=(start_day::timestamp AT TIME ZONE 'UTC'))
  AND (end_day IS NULL OR a.last_activity_at<((end_day+1)::timestamp AT TIME ZONE 'UTC'))
  AND (tag='' OR tag=ANY(coalesce(wf.labels,'{}')))
  AND (q='' OR a.customer_name ILIKE '%'||q||'%' OR coalesce(a.contact->>'phone','') ILIKE '%'||q||'%' OR (c.provider='wa' AND a.external_id ILIKE '%'||q||'%') OR EXISTS(SELECT 1 FROM inbox_messages m WHERE m.workspace_id=w AND m.thread_id=a.id AND to_tsvector('simple',m.body)@@websearch_to_tsquery('simple',q)) OR EXISTS(SELECT 1 FROM inbox_orders o WHERE o.workspace_id=w AND o.thread_id=a.id AND o.reference ILIKE '%'||q||'%'))
  AND (coalesce(f->>'channel','')='' OR c.provider=f->>'channel')
  AND (coalesce(f->>'mode','')='' OR (f->>'mode'='ai' AND a.ai_enabled) OR (f->>'mode'='seller' AND NOT a.ai_enabled) OR (f->>'mode'='waiting' AND latest.sender='customer'))
  AND (coalesce((f->>'days')::integer,0)=0 OR a.last_activity_at>=now()-make_interval(days=>(f->>'days')::integer))
  AND (coalesce((f->>'unread')::boolean,false)=false OR EXISTS(SELECT 1 FROM inbox_messages m WHERE m.thread_id=a.id AND m.sender='customer' AND m.sequence>coalesce(rc.sequence,0)))
  AND (queue='all' OR (queue='open' AND coalesce(wf.status,'open')='open') OR (queue='pending' AND wf.status='pending') OR (queue='waiting' AND latest.sender='customer' AND coalesce(wf.status,'open')<>'resolved') OR (queue='unread' AND EXISTS(SELECT 1 FROM inbox_messages m WHERE m.thread_id=a.id AND m.sender='customer' AND m.sequence>coalesce(rc.sequence,0))) OR (queue='mine' AND wf.owner_id=d) OR (queue='unassigned' AND wf.owner_id IS NULL) OR (queue='attention' AND coalesce(wf.status,'open')<>'resolved' AND (coalesce(wf.disputed,false) OR wf.due_at<now() OR latest.sender='customer')) OR (queue='resolved' AND wf.status='resolved') OR (queue='snoozed' AND wf.status='snoozed' AND wf.snooze_until>now()))
  ORDER BY a.last_activity_at DESC,a.id OFFSET off LIMIT 50
 )x;RETURN result;
END $$;
COMMIT;
