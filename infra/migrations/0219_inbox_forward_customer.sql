-- Preserve the scoped wrappers from 0208. Permit explicit forwarding of customer messages within the same workspace and environment.
CREATE OR REPLACE FUNCTION inbox_advanced_before_channel_scopes(w uuid,e text,d uuid,t uuid,a text,b jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v inbox_threads;m inbox_messages;src inbox_messages;f inbox_media;p text;ct jsonb;kind text;key uuid;quoted uuid;prod inbox_products;BEGIN
 v:=inbox_scope(w,e,t);SELECT provider INTO p FROM inbox_connections WHERE id=v.connection_id;
 -- Serialize sends, note revisions and handovers in this conversation.
 PERFORM 1 FROM inbox_threads WHERE id=t FOR UPDATE;
 IF a='profile' THEN RETURN inbox_profile(w,e,t);
 ELSIF a='note' THEN
  IF length(b->>'text')>8000 THEN RAISE EXCEPTION 'note too long' USING ERRCODE='22023';END IF;
  UPDATE inbox_threads SET note=coalesce(b->>'text',''),note_version=note_version+1 WHERE id=t AND note_version=(b->>'version')::bigint RETURNING * INTO v;
  IF v.id IS NULL THEN RAISE EXCEPTION 'note changed' USING ERRCODE='23505';END IF;RETURN jsonb_build_object('saved',true,'version',v.note_version);
 ELSIF a='contact' THEN
  IF jsonb_typeof(b->'contact')<>'object' OR pg_column_size(b->'contact')>8192 THEN RAISE EXCEPTION 'invalid contact' USING ERRCODE='22023';END IF;
  UPDATE inbox_threads SET contact=b->'contact' WHERE id=t;RETURN jsonb_build_object('saved',true);
 ELSIF a='orders-save' THEN
  INSERT INTO inbox_orders(id,workspace_id,thread_id,reference,items,amount_minor,currency,status,reason) VALUES((b->>'id')::uuid,w,t,b->>'reference',b->>'items',(b->>'amount_minor')::bigint,coalesce(b->>'currency','BDT'),b->>'status',coalesce(b->>'reason',''))
  ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,reason=EXCLUDED.reason,items=EXCLUDED.items,amount_minor=EXCLUDED.amount_minor,updated_at=now() WHERE inbox_orders.workspace_id=w AND inbox_orders.thread_id=t;
  IF NOT FOUND THEN RAISE EXCEPTION 'order unavailable' USING ERRCODE='42501';END IF;RETURN jsonb_build_object('saved',true);
 ELSIF a='products' THEN RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(x)-'workspace_id') FROM inbox_products x WHERE workspace_id=w AND environment=e AND active),'[]'::jsonb));
 ELSIF a='product-save' THEN
  IF b->>'image_media_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM inbox_media f JOIN inbox_threads x ON x.id=f.thread_id JOIN inbox_connections c ON c.id=x.connection_id WHERE f.id=(b->>'image_media_id')::uuid AND f.workspace_id=w AND c.environment=e) THEN RAISE EXCEPTION 'product image unavailable' USING ERRCODE='42501';END IF;
  INSERT INTO inbox_products(id,workspace_id,environment,name,price_minor,sizes,image_media_id,active) VALUES((b->>'id')::uuid,w,e,b->>'name',(b->>'price_minor')::bigint,coalesce(b->>'sizes',''),(b->>'image_media_id')::uuid,coalesce((b->>'active')::boolean,true))
  ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,price_minor=EXCLUDED.price_minor,sizes=EXCLUDED.sizes,image_media_id=EXCLUDED.image_media_id,active=EXCLUDED.active WHERE inbox_products.workspace_id=w AND inbox_products.environment=e;
  IF NOT FOUND THEN RAISE EXCEPTION 'product unavailable' USING ERRCODE='42501';END IF;RETURN jsonb_build_object('saved',true);
 ELSIF a='info' THEN
  SELECT * INTO m FROM inbox_messages WHERE id=(b->>'message_id')::uuid AND workspace_id=w AND thread_id=t;
  IF m.id IS NULL THEN RAISE EXCEPTION 'message unavailable' USING ERRCODE='42501';END IF;RETURN (to_jsonb(m)-'workspace_id')||jsonb_build_object('channel',p);
 END IF;
 IF a NOT IN ('send-media','send-product','forward','react') THEN RAISE EXCEPTION 'invalid action' USING ERRCODE='22023';END IF;
 key:=(b->>'idempotency_key')::uuid;
 IF key IS NULL THEN RAISE EXCEPTION 'missing key' USING ERRCODE='22023';END IF;
 SELECT * INTO m FROM inbox_messages WHERE thread_id=t AND idempotency_key=key;
 IF m.id IS NOT NULL THEN
  IF m.content->>'request_hash' IS DISTINCT FROM md5(b::text) THEN RAISE EXCEPTION 'idempotency conflict' USING ERRCODE='23505';END IF;RETURN (to_jsonb(m)-'workspace_id')||jsonb_build_object('channel',p);
 END IF;
 IF v.last_customer_at IS NULL OR v.last_customer_at<=now()-interval '24 hours' THEN RAISE EXCEPTION 'WINDOW_CLOSED' USING ERRCODE='22023';END IF;
 IF a='forward' THEN
  SELECT x.* INTO src FROM inbox_messages x JOIN inbox_threads st ON st.id=x.thread_id JOIN inbox_connections sc ON sc.id=st.connection_id AND sc.environment=e AND sc.enabled WHERE x.id=(b->>'message_id')::uuid AND x.workspace_id=w AND x.thread_id<>t AND x.sender IN ('seller','ai','customer') AND x.type IN ('text','image','audio','document','product');
  IF src.id IS NULL THEN RAISE EXCEPTION 'forward unavailable' USING ERRCODE='42501';END IF;kind:=src.type;ct:=src.content;ct:=ct-'request_hash';
 ELSIF a='send-media' THEN
  SELECT * INTO f FROM inbox_media WHERE id=(b->>'media_id')::uuid AND workspace_id=w AND thread_id=t;
  IF f.id IS NULL THEN RAISE EXCEPTION 'media unavailable' USING ERRCODE='42501';END IF;
  kind:=CASE WHEN f.mime LIKE 'image/%' THEN 'image' WHEN f.mime LIKE 'audio/%' THEN 'audio' ELSE 'document' END;
  IF kind='audio' AND f.duration_ms BETWEEN 1 AND 999 THEN RAISE EXCEPTION 'voice too short' USING ERRCODE='22023';END IF;
  ct:=jsonb_build_object('media_id',f.id,'name',f.name,'mime',f.mime,'size_bytes',f.size_bytes,'duration_ms',f.duration_ms);
 ELSIF a='send-product' THEN
  SELECT * INTO prod FROM inbox_products WHERE id=(b->>'product_id')::uuid AND workspace_id=w AND environment=e AND active;
  IF prod.id IS NULL THEN RAISE EXCEPTION 'product unavailable' USING ERRCODE='42501';END IF;
  kind:='product';ct:=to_jsonb(prod)-'workspace_id';
 ELSE
  SELECT * INTO src FROM inbox_messages WHERE id=(b->>'message_id')::uuid AND workspace_id=w AND thread_id=t AND sender='customer';
  IF src.id IS NULL OR src.provider_id IS NULL OR NOT (inbox_capabilities(p)->'reactions' @> to_jsonb(ARRAY[b->>'emoji'])) AND coalesce(b->>'emoji','')<>'' THEN RAISE EXCEPTION 'reaction unavailable' USING ERRCODE='22023';END IF;
  kind:='reaction';ct:=jsonb_build_object('target_id',src.id,'provider_id',src.provider_id,'emoji',coalesce(b->>'emoji',''));
 END IF;
 IF kind='document' AND p='ig' THEN RAISE EXCEPTION 'unsupported document' USING ERRCODE='22023';END IF;
 IF (b->>'batch_id') IS NOT NULL AND (SELECT count(*) FROM inbox_messages WHERE workspace_id=w AND thread_id=t AND batch_id=(b->>'batch_id')::uuid)>=10 THEN RAISE EXCEPTION 'max 10 images' USING ERRCODE='22023';END IF;
 quoted:=(b->>'reply_to')::uuid;
 IF quoted IS NOT NULL AND NOT EXISTS(SELECT 1 FROM inbox_messages WHERE id=quoted AND workspace_id=w AND thread_id=t) THEN RAISE EXCEPTION 'invalid reply' USING ERRCODE='42501';END IF;
 ct:=ct||jsonb_build_object('request_hash',md5(b::text));
 INSERT INTO inbox_messages(workspace_id,thread_id,sender,type,body,state,idempotency_key,content,batch_id,reply_to) VALUES(w,t,'seller',kind,CASE WHEN a='forward' THEN src.body WHEN kind='product' THEN prod.name ELSE '' END,'queued',key,ct,(b->>'batch_id')::uuid,quoted) RETURNING * INTO m;
 IF kind<>'reaction' THEN UPDATE inbox_threads SET ai_enabled=false,ai_version=ai_version+1,last_activity_at=now() WHERE id=t;END IF;
 RETURN to_jsonb(m)-'workspace_id';END $$;
CREATE OR REPLACE FUNCTION inbox_forward_album_before_channel_scopes(w uuid,e text,d uuid,t uuid,source uuid,k uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE src inbox_messages;x inbox_messages;r jsonb;items jsonb:='[]';BEGIN
 PERFORM inbox_scope(w,e,t);
 SELECT m.* INTO src FROM inbox_messages m JOIN inbox_threads a ON a.id=m.thread_id JOIN inbox_connections c ON c.id=a.connection_id AND c.enabled AND c.environment=e WHERE m.id=source AND m.workspace_id=w AND m.sender IN ('seller','ai','customer') AND m.thread_id<>t;
 IF src.id IS NULL THEN RAISE EXCEPTION 'forward unavailable' USING ERRCODE='42501';END IF;
 IF src.type<>'image' OR src.batch_id IS NULL THEN RETURN inbox_advanced(w,e,d,t,'forward',jsonb_build_object('message_id',source,'idempotency_key',k));END IF;
 IF EXISTS(SELECT 1 FROM inbox_messages dest WHERE dest.thread_id=t AND dest.batch_id=k AND NOT EXISTS(SELECT 1 FROM inbox_messages original WHERE original.thread_id=src.thread_id AND original.batch_id=src.batch_id AND md5(k::text||original.id::text)::uuid=dest.idempotency_key)) THEN RAISE EXCEPTION 'album idempotency conflict' USING ERRCODE='23505';END IF;
 FOR x IN SELECT * FROM inbox_messages WHERE thread_id=src.thread_id AND batch_id=src.batch_id AND sender=src.sender AND type='image' ORDER BY sequence LOOP
  r:=inbox_advanced(w,e,d,t,'forward',jsonb_build_object('message_id',x.id,'idempotency_key',md5(k::text||x.id::text)::uuid,'batch_id',k));items:=items||jsonb_build_array(r);
 END LOOP;RETURN jsonb_build_object('items',items);
END $$;

-- Expose a sender’s own request key only to that same authenticated member so optimistic messages reconcile without duplicates.
CREATE OR REPLACE FUNCTION inbox_page_media(w uuid,e text,d uuid,t uuid,before_seq bigint,f jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r jsonb;p text;BEGIN
 r:=inbox_page_v1(w,e,d,t,before_seq,f);
 IF t IS NOT NULL THEN
  SELECT c.provider INTO p FROM inbox_threads a JOIN inbox_connections c ON c.id=a.connection_id WHERE a.id=t;
  r:=jsonb_set(r,'{thread,capabilities}',inbox_capabilities(p));
  r:=jsonb_set(r,'{items}',coalesce((SELECT jsonb_agg(x.item||jsonb_build_object('content',m.content-'request_hash','batch_id',m.batch_id,'client_key',CASE WHEN f->>'reader_kind'='user' AND m.requested_by=d THEN m.idempotency_key ELSE NULL END,'reaction',(SELECT emoji FROM inbox_reactions WHERE message_id=m.id)) ORDER BY x.ord) FROM jsonb_array_elements(r->'items') WITH ORDINALITY x(item,ord) JOIN inbox_messages m ON m.id=(x.item->>'id')::uuid),'[]'::jsonb));
 ELSE
  r:=jsonb_set(r,'{items}',coalesce((SELECT jsonb_agg(x.item||jsonb_build_object('window_open',coalesce(a.last_customer_at>now()-interval '24 hours',false),'capabilities',inbox_capabilities(c.provider)) ORDER BY x.ord) FROM jsonb_array_elements(r->'items') WITH ORDINALITY x(item,ord) JOIN inbox_threads a ON a.id=(x.item->>'id')::uuid JOIN inbox_connections c ON c.id=a.connection_id),'[]'::jsonb));
 END IF;RETURN r;
END $$;
