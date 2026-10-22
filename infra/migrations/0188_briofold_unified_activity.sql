-- CONTROL-side redacted Store activity stream. Financial events remain
-- separately authoritative and are not copied or reclassified here.
BEGIN;
DO $$ BEGIN
 IF to_regclass('public.commerce_events') IS NULL
    OR to_regclass('public.briofold_customer_events') IS NULL
    OR to_regclass('public.briofold_comment_audit') IS NULL
    OR to_regclass('public.pg13_control_audit') IS NULL
    OR to_regclass('public.financial_realm') IS NOT NULL THEN
  RAISE EXCEPTION '0188 requires CONTROL CRM, Inbox and commerce audit sources';
 END IF;
END $$;

CREATE FUNCTION briofold_unified_activity(w uuid,e text,a uuid,category text DEFAULT '',q text DEFAULT '',off integer DEFAULT 0)
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
   FROM briofold_customer_events ev WHERE ev.workspace_id=w AND ev.environment=e
   ORDER BY created_at DESC LIMIT 1051
 ), comment_events AS (
  SELECT 'comments'::text AS source,ev.action,ev.actor_id,ev.created_at,'realm'::text AS scope
   FROM briofold_comment_audit ev
    JOIN briofold_comments c ON c.id=ev.comment_id AND c.workspace_id=w
    JOIN inbox_connections cn ON cn.id=c.connection_id AND cn.workspace_id=w
   WHERE ev.workspace_id=w AND cn.environment=e
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

REVOKE ALL ON FUNCTION briofold_unified_activity(uuid,text,uuid,text,text,integer)
 FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION briofold_unified_activity(uuid,text,uuid,text,text,integer)
 TO ekmivo_financial_runtime,ekmivo_financial_projection;
COMMIT;
