-- Phase 5: customer profile drawer data, risk badge, and thread-name sync.
-- Phone and payer numbers are visible to owner/admin only (same rule as briofold_customer_orders).
BEGIN;
CREATE INDEX IF NOT EXISTS commerce_orders_customer ON commerce_orders(workspace_id,environment,customer_id,created_at DESC);

CREATE OR REPLACE FUNCTION briofold_customer_profile(w uuid,e text,a uuid,c uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE role_name text;pii boolean;cu briofold_customers%ROWTYPE;st jsonb;delivered integer;cancelled integer;returned integer;total integer;bad_claims integer;risk text:='none';reasons text[]:='{}';BEGIN
 role_name:=briofold_customer_actor(w,a,'read');pii:=role_name IN('owner','admin');
 IF e NOT IN('live','sandbox') THEN RAISE EXCEPTION 'Invalid customer filter' USING ERRCODE='22023';END IF;
 SELECT * INTO cu FROM briofold_customers WHERE id=c AND workspace_id=w AND environment=e AND deleted_at IS NULL;
 IF NOT FOUND THEN RAISE EXCEPTION 'Customer unavailable' USING ERRCODE='P0002';END IF;
 st:=coalesce(briofold_customer_stats(w,e,a,ARRAY[c])->(c::text),'{"orders":0,"total_minor":0}'::jsonb);
 SELECT count(*) FILTER (WHERE status='delivered'),count(*) FILTER (WHERE status='cancelled'),count(*) FILTER (WHERE status='returned'),count(*) FILTER (WHERE status<>'draft')
  INTO delivered,cancelled,returned,total FROM commerce_orders WHERE workspace_id=w AND environment=e AND customer_id=c;
 SELECT count(*) INTO bad_claims FROM commerce_payment_claims k JOIN commerce_orders o ON o.id=k.order_id WHERE o.customer_id=c AND k.state IN('failed','review');
 IF total>=2 AND (cancelled+returned)*2>=total THEN risk:='high';reasons:=reasons||'many_cancelled_or_returned';END IF;
 IF bad_claims>=2 THEN risk:=CASE WHEN risk='high' THEN 'high' ELSE 'medium' END;reasons:=reasons||'failed_payment_claims';END IF;
 RETURN jsonb_build_object(
  'customer',jsonb_build_object('id',cu.id,'name',cu.name,'phone',CASE WHEN pii THEN cu.phone ELSE NULL END,'email',CASE WHEN pii THEN cu.email ELSE NULL END,'tags',cu.tags,'stage',cu.stage),
  'stats',st||jsonb_build_object('delivered',delivered,'cancelled',cancelled,'returned',returned),
  'risk',jsonb_build_object('level',risk,'reasons',to_jsonb(reasons)),
  'channels',coalesce((SELECT jsonb_agg(DISTINCT ic.provider) FROM briofold_customer_sources s JOIN inbox_threads t ON t.id=s.source_id JOIN inbox_connections ic ON ic.id=t.connection_id WHERE s.customer_id=c AND s.kind='thread'),'[]'::jsonb),
  'orders',briofold_customer_orders(w,e,a,c)->'orders',
  'numbers',briofold_customer_orders(w,e,a,c)->'numbers',
  -- Suggestions only. Nothing is merged automatically.
  'merge_suggestions',CASE WHEN pii AND cu.phone IS NOT NULL AND cu.phone<>'' THEN coalesce((SELECT jsonb_agg(jsonb_build_object('id',x.id,'name',x.name)) FROM briofold_customers x WHERE x.workspace_id=w AND x.environment=e AND x.id<>c AND x.deleted_at IS NULL AND x.merged_into IS NULL AND x.phone=cu.phone),'[]'::jsonb) ELSE '[]'::jsonb END);
END $$;
REVOKE ALL ON FUNCTION briofold_customer_profile(uuid,text,uuid,uuid) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION briofold_customer_profile(uuid,text,uuid,uuid) TO ekmivo_financial_runtime,ekmivo_financial_projection;

-- Customer name follows the thread name only while nobody edited it by hand.
CREATE OR REPLACE FUNCTION briofold_thread_name_sync() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.customer_name IS DISTINCT FROM OLD.customer_name AND coalesce(btrim(NEW.customer_name),'')<>'' THEN
  UPDATE briofold_customers c SET name=left(btrim(NEW.customer_name),120),revision=c.revision+1
   WHERE c.id IN(SELECT s.customer_id FROM briofold_customer_sources s WHERE s.kind='thread' AND s.source_id=NEW.id)
     AND (c.name=coalesce(OLD.customer_name,'') OR btrim(c.name)='');
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS briofold_thread_name_sync ON inbox_threads;
CREATE TRIGGER briofold_thread_name_sync AFTER UPDATE OF customer_name ON inbox_threads FOR EACH ROW EXECUTE FUNCTION briofold_thread_name_sync();
COMMIT;
