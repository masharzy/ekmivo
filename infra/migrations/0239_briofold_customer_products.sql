-- Customer drawer, "Products bought": what this customer bought, how many times and when last. Same read
-- permission as the profile; drafts, cancelled orders and returned units do not count as bought.
BEGIN;
CREATE OR REPLACE FUNCTION briofold_customer_products(w uuid,e text,a uuid,c uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM briofold_customer_actor(w,a,'read');
 IF e NOT IN('live','sandbox') THEN RAISE EXCEPTION 'Invalid customer filter' USING ERRCODE='22023';END IF;
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object('name',z.name,'sku',z.sku,'quantity',z.qty,'orders',z.n,'last_at',z.last_at) ORDER BY z.last_at DESC)
  FROM (SELECT l.name,l.sku,sum(l.quantity-l.returned)::bigint qty,count(DISTINCT o.id)::integer n,max(o.created_at) last_at
   FROM commerce_orders o JOIN commerce_lines l ON l.order_id=o.id AND l.workspace_id=o.workspace_id AND l.environment=o.environment
   WHERE o.workspace_id=w AND o.environment=e AND o.customer_id=c AND o.status NOT IN('draft','cancelled')
   GROUP BY l.name,l.sku HAVING sum(l.quantity-l.returned)>0 ORDER BY max(o.created_at) DESC LIMIT 50) z),'[]'::jsonb);
END $$;
REVOKE ALL ON FUNCTION briofold_customer_products(uuid,text,uuid,uuid) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION briofold_customer_products(uuid,text,uuid,uuid) TO ekmivo_financial_runtime,ekmivo_financial_projection;
COMMIT;
