-- 0103: Independent financial realms (live AND sandbox). Read-only paginated notification feed.
BEGIN;
DO $$ BEGIN
 IF to_regclass('public.financial_realm') IS NULL OR to_regclass('public.pg13_notifications') IS NULL
 OR to_regclass('public.pg13_notification_reads') IS NULL
 THEN RAISE EXCEPTION '0103 requires a financial realm with PG13 notifications'; END IF;
END $$;
CREATE INDEX IF NOT EXISTS pg103_notifications_timeline
 ON pg13_notifications(workspace_id,environment,created_at DESC,id DESC);
CREATE FUNCTION pg103_notification_page(
 w uuid,e text,actor uuid,p_page integer,p_size integer,p_filter text,p_status text,p_query text
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb; normalized_query text;
BEGIN
 PERFORM pg06_scope(w,e);
 IF actor IS NULL OR p_page NOT BETWEEN 1 AND 2000 OR p_size NOT IN (10,20,50)
 OR p_filter NOT IN ('all','payments','refunds','alerts') OR p_status NOT IN ('all','read','unread')
 OR length(p_query)>80 OR p_query~'[[:cntrl:]]'
 THEN RAISE EXCEPTION 'invalid notification filters' USING ERRCODE='22023'; END IF;
 normalized_query:=lower(trim(p_query));
 WITH matching AS (
  SELECT n.id,n.type,n.resource_id,n.body,n.created_at,r.read_at
  FROM pg13_notifications n
  LEFT JOIN pg13_notification_reads r ON r.notification_id=n.id AND r.actor_id=actor
  WHERE n.workspace_id=w AND n.environment=e
   AND (p_filter='all'
    OR (p_filter='payments' AND n.type='payment.verified')
    OR (p_filter='refunds' AND n.type ILIKE '%refund%')
    OR (p_filter='alerts' AND n.type<>'payment.verified' AND n.type NOT ILIKE '%refund%'))
   AND (p_status='all' OR (p_status='unread' AND r.read_at IS NULL) OR (p_status='read' AND r.read_at IS NOT NULL))
   AND (normalized_query='' OR lower(n.type) LIKE '%'||normalized_query||'%'
    OR n.resource_id::text LIKE '%'||normalized_query||'%'
    OR lower(coalesce(n.body->>'reference','')) LIKE '%'||normalized_query||'%'
    OR lower(coalesce(n.body->>'status','')) LIKE '%'||normalized_query||'%')
 )
 SELECT jsonb_build_object(
  'items',coalesce((SELECT jsonb_agg(to_jsonb(t) ORDER BY t.created_at DESC,t.id DESC)
    FROM (SELECT * FROM matching ORDER BY created_at DESC,id DESC LIMIT p_size OFFSET (p_page-1)*p_size) t),'[]'::jsonb),
  'total',(SELECT count(*) FROM matching),
  'unread',(SELECT count(*) FROM pg13_notifications n
    WHERE n.workspace_id=w AND n.environment=e AND NOT EXISTS (
      SELECT 1 FROM pg13_notification_reads r WHERE r.notification_id=n.id AND r.actor_id=actor)),
  'page',p_page,'page_size',p_size
 ) INTO result;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION pg103_notification_page(uuid,text,uuid,integer,integer,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pg103_notification_page(uuid,text,uuid,integer,integer,text,text,text) TO ekmivo_finance_reader;
COMMIT;
