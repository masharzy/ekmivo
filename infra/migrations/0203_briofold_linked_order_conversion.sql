-- CONTROL operational attribution by explicit CRM/order links, never payment revenue.
BEGIN;
DO $$BEGIN IF to_regclass('public.commerce_orders') IS NULL OR to_regclass('public.financial_realm') IS NOT NULL THEN RAISE EXCEPTION '0203 requires CONTROL CRM/commerce';END IF;END $$;
CREATE INDEX briofold_customer_cohort_window ON briofold_customers(workspace_id,environment,created_at,id) WHERE deleted_at IS NULL AND merged_into IS NULL;
CREATE FUNCTION briofold_linked_order_conversion(w uuid,e text,a uuid,days integer DEFAULT 30,off integer DEFAULT 0) RETURNS jsonb
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
  SELECT c.id,c.assignee,c.created_at FROM briofold_customers c WHERE c.workspace_id=w AND c.environment=e AND c.deleted_at IS NULL AND c.merged_into IS NULL AND c.created_at>=now()-make_interval(days=>days) AND c.created_at<=now()
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
REVOKE ALL ON FUNCTION briofold_linked_order_conversion(uuid,text,uuid,integer,integer) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION briofold_linked_order_conversion(uuid,text,uuid,integer,integer) TO ekmivo_financial_runtime,ekmivo_financial_projection;
COMMIT;
