-- Qualified/proposal CRM interest without a linked non-cancelled order.
-- This is not evidence that a checkout was abandoned or a payment failed.
BEGIN;
DO $$BEGIN IF to_regclass('public.commerce_orders') IS NULL OR to_regclass('public.financial_realm') IS NOT NULL THEN RAISE EXCEPTION '0199 requires CONTROL commerce/CRM';END IF;END $$;
CREATE INDEX commerce_orders_interest_customer ON commerce_orders(workspace_id,environment,customer_id) WHERE status<>'cancelled';
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
  WHERE c.workspace_id=w AND c.environment=e AND c.deleted_at IS NULL AND c.merged_into IS NULL
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
COMMIT;
