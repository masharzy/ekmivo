-- Phase 10: Store/realm-scoped product operations, never payment revenue.
-- Additive CONTROL migration only. Do not run against the financial realm.
BEGIN;
DO $$ BEGIN
 IF to_regclass('public.commerce_lines') IS NULL
  OR to_regclass('public.commerce_variants') IS NULL
  OR to_regclass('public.financial_realm') IS NOT NULL
 THEN RAISE EXCEPTION '0195 requires the isolated CONTROL commerce schema'; END IF;
END $$;

CREATE INDEX commerce_analytics_variant ON commerce_lines(workspace_id,environment,variant_id,order_id);

CREATE FUNCTION commerce_product_operational_analytics(w uuid,e text,a uuid,off integer DEFAULT 0,q text DEFAULT '')
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE items jsonb;
BEGIN
 PERFORM commerce_actor(w,a,false);
 IF e IS NULL OR e NOT IN ('live','sandbox') OR off IS NULL OR off NOT BETWEEN 0 AND 10000
  OR q IS NULL OR length(q)>100 THEN
  RAISE EXCEPTION 'Invalid product analytics filter' USING ERRCODE='22023';
 END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(z) ORDER BY z.product_name,z.sku,z.variant_id),'[]'::jsonb)
 INTO items FROM (
  SELECT p.id product_id,p.name product_name,v.id variant_id,v.sku,
   a.order_count,a.ordered_units,a.delivered_units,a.returned_units,
   greatest(0,a.delivered_units-a.returned_units) net_delivered_units
  FROM commerce_products p
  JOIN commerce_variants v ON v.product_id=p.id AND v.workspace_id=w AND v.environment=e
  CROSS JOIN LATERAL (
   SELECT count(DISTINCT l.order_id) order_count,
    coalesce(sum(l.quantity),0)::bigint ordered_units,
    coalesce(sum(l.quantity) FILTER(WHERE o.status IN ('delivered','returned')),0)::bigint delivered_units,
    coalesce(sum(l.returned) FILTER(WHERE o.status IN ('delivered','returned')),0)::bigint returned_units
   FROM commerce_lines l JOIN commerce_orders o ON o.id=l.order_id
    AND o.workspace_id=w AND o.environment=e
   WHERE l.workspace_id=w AND l.environment=e AND l.variant_id=v.id
    AND o.status IN ('confirmed','packed','shipped','delivered','returned')
  ) a
  WHERE p.workspace_id=w AND p.environment=e
   AND (q='' OR p.name ILIKE '%'||q||'%' OR v.sku ILIKE '%'||q||'%')
  ORDER BY p.name,v.sku,v.id OFFSET off LIMIT 51
 ) z;
 RETURN jsonb_build_object('items',(SELECT coalesce(jsonb_agg(value ORDER BY pos),'[]'::jsonb) FROM jsonb_array_elements(items) WITH ORDINALITY AS r(value,pos) WHERE pos<=50),
  'more',jsonb_array_length(items)>50,
  'definition','Operational order units only: confirmed or later, excluding draft/hold/cancelled. Delivered and inspected returned units are not verified payment revenue.');
END $$;

REVOKE ALL ON FUNCTION commerce_product_operational_analytics(uuid,text,uuid,integer,text)
 FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION commerce_product_operational_analytics(uuid,text,uuid,integer,text)
 TO ekmivo_financial_runtime,ekmivo_financial_projection;
COMMIT;
