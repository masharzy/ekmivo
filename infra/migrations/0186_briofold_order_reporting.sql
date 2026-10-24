-- Phase 10: aggregate operational order reports, never financial revenue.
-- CONTROL-only Store + realm function; no raw customer recipient data.
BEGIN;
DO $$ BEGIN
 IF to_regclass('public.commerce_order_assignments') IS NULL
    OR to_regclass('public.financial_realm') IS NOT NULL THEN
  RAISE EXCEPTION '0186 requires CONTROL commerce assignments';
 END IF;
END $$;

CREATE FUNCTION commerce_order_report(
 w uuid,e text,a uuid,day_from date DEFAULT NULL,day_to date DEFAULT NULL,
 state_filter text DEFAULT '',source_filter text DEFAULT '',agent_filter uuid DEFAULT NULL
) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE role_name text; first_day date; last_day date; result jsonb;
BEGIN
 role_name:=commerce_actor(w,a);
 first_day:=coalesce(day_from,(now() AT TIME ZONE 'Asia/Dhaka')::date-29);
 last_day:=coalesce(day_to,(now() AT TIME ZONE 'Asia/Dhaka')::date);
 IF e IS NULL OR e NOT IN ('live','sandbox')
   OR first_day<date '2015-01-01'
   OR last_day>(now() AT TIME ZONE 'Asia/Dhaka')::date+1
   OR last_day<first_day OR last_day-first_day>366
   OR coalesce(state_filter,'') NOT IN ('','draft','hold','confirmed','packed','shipped','delivered','cancelled','returned')
   OR coalesce(source_filter,'') NOT IN ('','manual','ai','api')
   OR (agent_filter IS NOT NULL AND role_name NOT IN ('owner','admin'))
 THEN RAISE EXCEPTION 'Invalid order report filters' USING ERRCODE='22023'; END IF;

 WITH matching AS (
  SELECT (o.created_at AT TIME ZONE 'Asia/Dhaka')::date AS day,o.status,o.source,
    assignee.assignee_id,
    CASE WHEN role_name IN ('owner','admin') THEN u.display_name ELSE NULL END AS assignee_name
  FROM commerce_orders o
  LEFT JOIN commerce_order_assignments assignee
   ON assignee.workspace_id=o.workspace_id AND assignee.environment=o.environment AND assignee.order_id=o.id
  LEFT JOIN app_users u ON u.id=assignee.assignee_id
  WHERE o.workspace_id=w AND o.environment=e
    AND (o.created_at AT TIME ZONE 'Asia/Dhaka')::date BETWEEN first_day AND last_day
    AND (coalesce(state_filter,'')='' OR o.status=state_filter)
    AND (coalesce(source_filter,'')='' OR o.source=source_filter)
    AND (agent_filter IS NULL OR assignee.assignee_id=agent_filter)
 ), daily AS (
  SELECT day,status,source,
   CASE WHEN role_name IN ('owner','admin') THEN assignee_id ELSE NULL END AS assignee_id,
   max(assignee_name) AS assignee_name,count(*) AS orders
  FROM matching GROUP BY day,status,source,
   CASE WHEN role_name IN ('owner','admin') THEN assignee_id ELSE NULL END
 ), listed AS (
  SELECT * FROM daily ORDER BY day DESC,status,source,assignee_id NULLS FIRST LIMIT 3660
 )
 SELECT jsonb_build_object(
  'total',(SELECT count(*) FROM matching),
  'by_state',(SELECT coalesce(jsonb_object_agg(status,orders),'{}'::jsonb)
    FROM (SELECT status,count(*) AS orders FROM matching GROUP BY status) z),
  'by_source',(SELECT coalesce(jsonb_object_agg(source,orders),'{}'::jsonb)
    FROM (SELECT source,count(*) AS orders FROM matching GROUP BY source) z),
  'rows',(SELECT coalesce(jsonb_agg(to_jsonb(listed) ORDER BY day DESC,status,source),'[]'::jsonb) FROM listed),
  'truncated',(SELECT count(*)>3660 FROM daily),
  'can_export',role_name IN ('owner','admin'),
  'assignees',CASE WHEN role_name IN ('owner','admin') THEN
    (SELECT coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',u.display_name)
       ORDER BY u.display_name,u.id),'[]'::jsonb)
     FROM workspace_members wm JOIN app_users u ON u.id=wm.user_id
     WHERE wm.workspace_id=w AND wm.role IN ('owner','admin','editor') AND u.disabled_at IS NULL)
    ELSE '[]'::jsonb END,
  'from',first_day,'to',last_day,'realm',e
 ) INTO result;
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION commerce_order_report(uuid,text,uuid,date,date,text,text,uuid)
 FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION commerce_order_report(uuid,text,uuid,date,date,text,text,uuid)
 TO ekmivo_financial_runtime,ekmivo_financial_projection;
COMMIT;
