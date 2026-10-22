-- Phase 8 parity: exact barcode/SKU-to-order lookup for scanner and packing.
-- Read-only CONTROL data; does not confirm payments or change shipment state.
BEGIN;
DO $$ BEGIN
 IF to_regclass('public.commerce_order_assignments') IS NULL
    OR to_regclass('public.commerce_lines') IS NULL
    OR to_regclass('public.financial_realm') IS NOT NULL
 THEN RAISE EXCEPTION '0185 requires CONTROL commerce and order assignment migrations'; END IF;
END $$;
CREATE FUNCTION commerce_order_scan(w uuid,e text,a uuid,code text,off integer DEFAULT 0,
 state_filter text DEFAULT '',source_filter text DEFAULT '')
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE role_name text; found_rows jsonb;
BEGIN
 role_name:=commerce_actor(w,a);
 code:=btrim(coalesce(code,''));
 IF e IS NULL OR e NOT IN ('live','sandbox') OR code='' OR length(code)>100
   OR off IS NULL OR off<0 OR off>10000
   OR length(coalesce(state_filter,''))>40
   OR coalesce(source_filter,'') NOT IN ('','manual','api','ai')
 THEN RAISE EXCEPTION 'Invalid scanner filter' USING ERRCODE='22023'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(matches)),'[]'::jsonb) INTO found_rows FROM (
  SELECT o.id,o.reference,o.source,o.status,o.customer_id,o.total_minor,o.revision,o.created_at,
     coalesce((SELECT sum(f.amount_minor) FROM commerce_finance_links f
       WHERE f.order_id=o.id AND f.workspace_id=w AND f.environment=e AND f.kind='payment'),0) linked_verified_minor
  FROM commerce_orders o
  WHERE o.workspace_id=w AND o.environment=e
    AND (coalesce(state_filter,'')='' OR o.status=state_filter)
    AND (coalesce(source_filter,'')='' OR o.source=source_filter)
    AND (strpos(lower(o.reference),lower(code))>0
      OR EXISTS (
       SELECT 1 FROM commerce_lines l JOIN commerce_variants v ON v.id=l.variant_id
       WHERE l.workspace_id=w AND l.environment=e AND l.order_id=o.id
        AND v.workspace_id=w AND v.environment=e
        AND (v.barcode=code OR v.sku=code)
      ))
  ORDER BY o.created_at DESC,o.id LIMIT 51 OFFSET off
 ) matches;
 RETURN jsonb_build_object('items',found_rows,'can_manage',role_name IN ('owner','admin','editor'),
   'can_admin',role_name IN ('owner','admin'),'warehouses',
   coalesce((SELECT jsonb_agg(jsonb_build_object('id',wh.id,'name',wh.name))
     FROM commerce_warehouses wh WHERE wh.workspace_id=w AND wh.environment=e),'[]'::jsonb));
END $$;
REVOKE ALL ON FUNCTION commerce_order_scan(uuid,text,uuid,text,integer,text,text)
 FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION commerce_order_scan(uuid,text,uuid,text,integer,text,text)
 TO ekmivo_financial_runtime,ekmivo_financial_projection;
COMMIT;
