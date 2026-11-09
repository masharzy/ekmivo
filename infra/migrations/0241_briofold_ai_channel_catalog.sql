BEGIN;

CREATE OR REPLACE FUNCTION briofold_inbox_catalog_items(w uuid,e text,selected uuid DEFAULT NULL)
RETURNS TABLE(id uuid,name text,price_minor bigint,currency text,sizes text)
LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
 SELECT p.id,p.name,v.price_minor,'BDT'::text,
  coalesce((SELECT string_agg(x.value,', ' ORDER BY x.key) FROM jsonb_each_text(v.options) x),'')
 FROM commerce_products p
 JOIN LATERAL (
  SELECT price_minor,options FROM commerce_variants
  WHERE workspace_id=w AND environment=e AND product_id=p.id AND active
  ORDER BY price_minor,id LIMIT 1
 ) v ON true
 WHERE p.workspace_id=w AND p.environment=e AND p.active AND (selected IS NULL OR p.id=selected)
 ORDER BY p.name,p.id LIMIT 100
$$;

CREATE OR REPLACE FUNCTION briofold_inbox_catalog(w uuid,e text,a uuid,t uuid,action text,b jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 thread inbox_threads;
 msg inbox_messages;
 snapshot jsonb;
 message_key uuid;
 quote_id uuid;
 product_id uuid;
 channel text;
 request_hash text;
BEGIN
 IF action NOT IN ('products','send-product') THEN RAISE EXCEPTION 'Invalid catalog action' USING ERRCODE='22023';END IF;
 -- The picker is a composer operation. Apply send capability and channel scope to both endpoints.
 PERFORM briofold_channel_thread(w,e,a,t,'send');
 thread:=inbox_scope(w,e,t);
 IF action='products' THEN
  RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.name,x.id)
   FROM briofold_inbox_catalog_items(w,e) x),'[]'::jsonb));
 END IF;

 message_key:=(b->>'idempotency_key')::uuid;
 product_id:=(b->>'product_id')::uuid;
 quote_id:=(b->>'reply_to')::uuid;
 IF message_key IS NULL OR product_id IS NULL THEN RAISE EXCEPTION 'Missing catalog request' USING ERRCODE='22023';END IF;
 request_hash:=encode(digest(jsonb_build_array('commerce-product',product_id,quote_id)::text,'sha256'),'hex');
 SELECT * INTO thread FROM inbox_threads WHERE id=t FOR UPDATE;
 SELECT provider INTO channel FROM inbox_connections WHERE id=thread.connection_id;
 SELECT * INTO msg FROM inbox_messages WHERE thread_id=t AND idempotency_key=message_key;
 IF FOUND THEN
  IF msg.content->>'request_hash' IS DISTINCT FROM request_hash THEN
   RAISE EXCEPTION 'Catalog request conflict' USING ERRCODE='23505';
  END IF;
  RETURN (to_jsonb(msg)-'workspace_id')||jsonb_build_object('channel',channel);
 END IF;
 IF thread.last_customer_at IS NULL OR (thread.last_customer_at<=now()-interval '24 hours' AND NOT inbox_window_free(thread.connection_id)) THEN
  RAISE EXCEPTION 'WINDOW_CLOSED' USING ERRCODE='22023';
 END IF;
 IF quote_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM inbox_messages WHERE id=quote_id AND workspace_id=w AND thread_id=t) THEN
  RAISE EXCEPTION 'Invalid reply' USING ERRCODE='42501';
 END IF;
 SELECT to_jsonb(x) INTO snapshot FROM briofold_inbox_catalog_items(w,e,product_id) x;
 IF snapshot IS NULL THEN RAISE EXCEPTION 'Product unavailable' USING ERRCODE='42501';END IF;
 INSERT INTO inbox_messages(workspace_id,thread_id,sender,type,body,state,idempotency_key,content,reply_to,requested_by)
 VALUES(w,t,'seller','product',snapshot->>'name','queued',message_key,snapshot||jsonb_build_object('request_hash',request_hash),quote_id,a)
 RETURNING * INTO msg;
 UPDATE inbox_threads SET ai_enabled=false,ai_version=ai_version+1,last_activity_at=now() WHERE id=t;
 RETURN (to_jsonb(msg)-'workspace_id')||jsonb_build_object('channel',channel);
END $$;

CREATE OR REPLACE FUNCTION briofold_ai_channel_photo_products(job uuid,lease uuid,h text,c jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j briofold_ai_channel_jobs; e text; matches jsonb; products jsonb;
BEGIN
 IF NOT briofold_channel_work_valid(job,lease) THEN
  RAISE EXCEPTION 'AI job lease is not valid' USING ERRCODE='42501';
 END IF;
 SELECT * INTO j FROM briofold_ai_channel_jobs WHERE id=job;
 SELECT n.environment INTO e FROM inbox_threads t JOIN inbox_connections n ON n.id=t.connection_id
 WHERE t.id=j.thread_id AND t.workspace_id=j.workspace_id;
 matches:=commerce_photo_search(j.workspace_id,e,j.actor_id,h,c,'');
 SELECT coalesce(jsonb_agg(briofold_ai_public_product(commerce_catalog_json(p.id)) ORDER BY item.ordinality),'[]')
 INTO products
 FROM jsonb_array_elements(matches->'items') WITH ORDINALITY item(value,ordinality)
 JOIN commerce_products p ON p.id=(item.value->>'product_id')::uuid AND p.workspace_id=j.workspace_id
  AND p.environment=e AND p.active
 WHERE item.ordinality<=3;
 RETURN products;
END $$;

REVOKE ALL ON FUNCTION briofold_inbox_catalog_items(uuid,text,uuid),briofold_inbox_catalog(uuid,text,uuid,uuid,text,jsonb),briofold_ai_channel_photo_products(uuid,uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION briofold_inbox_catalog(uuid,text,uuid,uuid,text,jsonb),briofold_ai_channel_photo_products(uuid,uuid,text,jsonb) TO ekmivo_financial_runtime,ekmivo_financial_projection;
COMMIT;
