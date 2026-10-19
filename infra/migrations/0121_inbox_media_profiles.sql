-- CONTROL only. Media bytes remain in private object storage; never in finance.
BEGIN;
ALTER TABLE inbox_messages DROP CONSTRAINT inbox_messages_type_check;
ALTER TABLE inbox_messages ADD CONSTRAINT inbox_messages_type_check CHECK(type IN ('text','unsupported','image','audio','document','product','reaction'));
ALTER TABLE inbox_messages ADD COLUMN content jsonb NOT NULL DEFAULT '{}' CHECK(pg_column_size(content)<=16384);
ALTER TABLE inbox_messages ADD COLUMN batch_id uuid;
ALTER TABLE inbox_threads ADD COLUMN contact jsonb NOT NULL DEFAULT '{}' CHECK(pg_column_size(contact)<=8192);
ALTER TABLE inbox_threads ADD COLUMN note text NOT NULL DEFAULT '' CHECK(length(note)<=8000);
ALTER TABLE inbox_threads ADD COLUMN note_version bigint NOT NULL DEFAULT 0;
CREATE TABLE inbox_media(id uuid PRIMARY KEY,workspace_id uuid NOT NULL,thread_id uuid NOT NULL,object_key text NOT NULL UNIQUE,name text NOT NULL,mime text NOT NULL,size_bytes integer NOT NULL CHECK(size_bytes BETWEEN 1 AND 5242880),sha256 text NOT NULL,duration_ms integer NOT NULL DEFAULT 0,created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(workspace_id,thread_id) REFERENCES inbox_threads(workspace_id,id),UNIQUE(workspace_id,id));
CREATE TABLE inbox_products(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id),environment text NOT NULL CHECK(environment IN ('live','sandbox')),name text NOT NULL CHECK(length(name) BETWEEN 1 AND 200),price_minor bigint NOT NULL CHECK(price_minor>=0),currency text NOT NULL DEFAULT 'BDT',sizes text NOT NULL DEFAULT '',image_media_id uuid,active boolean NOT NULL DEFAULT true,FOREIGN KEY(workspace_id,image_media_id) REFERENCES inbox_media(workspace_id,id),UNIQUE(workspace_id,id));
CREATE TABLE inbox_orders(id uuid PRIMARY KEY,workspace_id uuid NOT NULL,thread_id uuid NOT NULL,reference text NOT NULL,items text NOT NULL CHECK(length(items) BETWEEN 1 AND 1000),amount_minor bigint NOT NULL CHECK(amount_minor>=0),currency text NOT NULL DEFAULT 'BDT',status text NOT NULL CHECK(status IN ('ok','cx','rt','run')),reason text NOT NULL DEFAULT '',created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(workspace_id,thread_id) REFERENCES inbox_threads(workspace_id,id),UNIQUE(thread_id,reference));
CREATE TABLE inbox_reactions(workspace_id uuid NOT NULL,thread_id uuid NOT NULL,message_id uuid PRIMARY KEY,emoji text NOT NULL,updated_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(workspace_id,thread_id) REFERENCES inbox_threads(workspace_id,id),FOREIGN KEY(workspace_id,message_id) REFERENCES inbox_messages(workspace_id,id));
CREATE TABLE inbox_media_sources(id uuid PRIMARY KEY,workspace_id uuid NOT NULL,thread_id uuid NOT NULL,connection_id uuid NOT NULL REFERENCES inbox_connections(id),reference_cipher bytea NOT NULL,kind text NOT NULL CHECK(kind IN ('image','audio','document')),name text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(workspace_id,thread_id) REFERENCES inbox_threads(workspace_id,id));
ALTER TABLE inbox_media_sources ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON inbox_media_sources FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
CREATE INDEX inbox_orders_thread ON inbox_orders(workspace_id,thread_id,created_at DESC);
CREATE INDEX inbox_products_scope ON inbox_products(workspace_id,environment) WHERE active;
ALTER TABLE inbox_media ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox_orders ENABLE ROW LEVEL SECURITY;
ALTER TABLE inbox_reactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON inbox_media,inbox_products,inbox_orders,inbox_reactions FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
CREATE FUNCTION inbox_scope(w uuid,e text,t uuid) RETURNS inbox_threads LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v inbox_threads;BEGIN
 IF NOT EXISTS(SELECT 1 FROM workspace_product_access WHERE workspace_id=w AND product='ai' AND enabled) THEN RAISE EXCEPTION 'AI disabled' USING ERRCODE='42501';END IF;
 SELECT x.* INTO v FROM inbox_threads x JOIN inbox_connections c ON c.id=x.connection_id AND c.environment=e AND c.enabled WHERE x.id=t AND x.workspace_id=w;
 IF v.id IS NULL THEN RAISE EXCEPTION 'thread unavailable' USING ERRCODE='42501';END IF;RETURN v;
END $$;
CREATE FUNCTION inbox_capabilities(p text) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$ SELECT jsonb_build_object('image',true,'audio',true,'document',p<>'ig','product',true,'forward',true,'reactions',CASE WHEN p='ig' THEN '["❤️"]'::jsonb WHEN p='ms' THEN '["❤️","👍","😂","😮","😢"]'::jsonb ELSE '["❤️","👍","😂","😮","😢","🙏"]'::jsonb END,'delivered',p<>'ig','max_images',10,'max_bytes',5242880) $$;
ALTER FUNCTION inbox_page(uuid,text,uuid,uuid,bigint,jsonb) RENAME TO inbox_page_v1;
CREATE FUNCTION inbox_page(w uuid,e text,d uuid,t uuid,before_seq bigint,f jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r jsonb;p text;BEGIN
 r:=inbox_page_v1(w,e,d,t,before_seq,f);
 IF t IS NOT NULL THEN
  SELECT c.provider INTO p FROM inbox_threads a JOIN inbox_connections c ON c.id=a.connection_id WHERE a.id=t;
  r:=jsonb_set(r,'{thread,capabilities}',inbox_capabilities(p));
  r:=jsonb_set(r,'{items}',coalesce((SELECT jsonb_agg(x.item||jsonb_build_object('content',m.content-'request_hash','batch_id',m.batch_id,'reaction',(SELECT emoji FROM inbox_reactions WHERE message_id=m.id)) ORDER BY x.ord) FROM jsonb_array_elements(r->'items') WITH ORDINALITY x(item,ord) JOIN inbox_messages m ON m.id=(x.item->>'id')::uuid),'[]'::jsonb));
 ELSE
  r:=jsonb_set(r,'{items}',coalesce((SELECT jsonb_agg(x.item||jsonb_build_object('window_open',coalesce(a.last_customer_at>now()-interval '24 hours',false),'capabilities',inbox_capabilities(c.provider)) ORDER BY x.ord) FROM jsonb_array_elements(r->'items') WITH ORDINALITY x(item,ord) JOIN inbox_threads a ON a.id=(x.item->>'id')::uuid JOIN inbox_connections c ON c.id=a.connection_id),'[]'::jsonb));
 END IF;RETURN r;
END $$;
CREATE FUNCTION inbox_media_access(w uuid,e text,t uuid,i uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN PERFORM inbox_scope(w,e,t);RETURN (SELECT to_jsonb(m)-'workspace_id' FROM inbox_media m WHERE id=i AND workspace_id=w AND (thread_id=t OR EXISTS(SELECT 1 FROM inbox_messages x WHERE x.workspace_id=w AND x.thread_id=t AND (x.content->>'media_id'=i::text OR x.content->>'image_media_id'=i::text))));END $$;
CREATE FUNCTION inbox_media_save(w uuid,e text,t uuid,i uuid,k text,n text,m text,z integer,h text,ms integer) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v inbox_threads;r inbox_media;BEGIN
 v:=inbox_scope(w,e,t);
 IF v.last_customer_at IS NULL OR v.last_customer_at<=now()-interval '24 hours' THEN RAISE EXCEPTION 'WINDOW_CLOSED' USING ERRCODE='22023';END IF;
 INSERT INTO inbox_media VALUES(i,w,t,k,n,m,z,h,ms,now()) ON CONFLICT(id) DO NOTHING;
 SELECT * INTO r FROM inbox_media WHERE id=i AND workspace_id=w AND thread_id=t;
 IF r.id IS NULL OR r.sha256<>h THEN RAISE EXCEPTION 'upload conflict' USING ERRCODE='23505';END IF;
 RETURN to_jsonb(r)-'object_key'-'workspace_id';END $$;
CREATE FUNCTION inbox_profile(w uuid,e text,t uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v inbox_threads;r jsonb;BEGIN
 v:=inbox_scope(w,e,t);
 SELECT jsonb_build_object('id',v.id,'name',v.customer_name,'channel',c.provider,'phone',CASE WHEN c.provider='wa' THEN v.external_id ELSE v.contact->>'phone' END,'contact',v.contact,'note',v.note,'note_version',v.note_version,'ai_enabled',v.ai_enabled,'store',ws.name,
 'messages',(SELECT count(*) FROM inbox_messages WHERE thread_id=t AND sender='customer'),
 'talks',(SELECT count(*) FILTER(WHERE previous_at IS NULL OR created_at-previous_at>interval '24 hours') FROM (SELECT created_at,lag(created_at) OVER(ORDER BY created_at,sequence) previous_at FROM inbox_messages WHERE thread_id=t AND sender='customer') sessions),
 'first',(SELECT jsonb_build_object('at',created_at,'text',body) FROM inbox_messages WHERE thread_id=t AND sender='customer' ORDER BY sequence LIMIT 1),
 'summary',(SELECT jsonb_build_object('total',count(*),'ok',count(*) FILTER(WHERE status='ok'),'cx',count(*) FILTER(WHERE status='cx'),'rt',count(*) FILTER(WHERE status='rt'),'run',count(*) FILTER(WHERE status='run'),'spend_minor',coalesce(sum(amount_minor) FILTER(WHERE status='ok'),0),'last_order',max(created_at)) FROM inbox_orders WHERE workspace_id=w AND thread_id=t),
 'orders',coalesce((SELECT jsonb_agg(to_jsonb(o)-'workspace_id' ORDER BY created_at DESC,id) FROM inbox_orders o WHERE workspace_id=w AND thread_id=t),'[]'::jsonb)) INTO r FROM inbox_connections c JOIN workspaces ws ON ws.id=w WHERE c.id=v.connection_id;
 RETURN r;END $$;
CREATE FUNCTION inbox_advanced(w uuid,e text,d uuid,t uuid,a text,b jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
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
  SELECT x.* INTO src FROM inbox_messages x JOIN inbox_threads st ON st.id=x.thread_id JOIN inbox_connections sc ON sc.id=st.connection_id AND sc.environment=e AND sc.enabled WHERE x.id=(b->>'message_id')::uuid AND x.workspace_id=w AND x.thread_id<>t AND x.sender IN ('seller','ai') AND x.type IN ('text','image','audio','document','product');
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
ALTER FUNCTION inbox_next_send() RENAME TO inbox_next_send_v1;
CREATE FUNCTION inbox_next_send() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r jsonb;m inbox_messages;BEGIN
 r:=inbox_next_send_v1();IF r IS NULL THEN RETURN NULL;END IF;
 SELECT * INTO m FROM inbox_messages WHERE id=(r->>'id')::uuid;
 RETURN r||jsonb_build_object('thread_id',m.thread_id,'environment',(SELECT environment FROM inbox_connections WHERE id=(SELECT connection_id FROM inbox_threads WHERE id=m.thread_id)),'type',m.type,'content',m.content,'reply_provider_id',(SELECT provider_id FROM inbox_messages WHERE id=m.reply_to));END $$;
-- Update reaction only when the provider accepted the operation.
CREATE FUNCTION inbox_reaction_finish(i uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE m inbox_messages;BEGIN SELECT * INTO m FROM inbox_messages WHERE id=i AND type='reaction' AND state='sent';IF m.id IS NOT NULL THEN
 INSERT INTO inbox_reactions VALUES(m.workspace_id,m.thread_id,(m.content->>'target_id')::uuid,m.content->>'emoji',now()) ON CONFLICT(message_id) DO UPDATE SET emoji=EXCLUDED.emoji,updated_at=now();END IF;END $$;
-- Called only after verified provider webhook routing; media reference is encrypted.
CREATE FUNCTION inbox_inbound_media(c uuid,p text,s text,n text,kind text,ref bytea,at_time timestamptz) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE conn inbox_connections;t uuid;i uuid;BEGIN
 SELECT * INTO conn FROM inbox_connections WHERE id=c AND enabled;IF conn.id IS NULL THEN RETURN NULL;END IF;
 PERFORM inbox_ingest(c,p,s,n,'',kind,at_time);
 SELECT m.thread_id INTO t FROM inbox_messages m JOIN inbox_threads x ON x.id=m.thread_id WHERE x.connection_id=c AND m.provider_id=p;
 IF t IS NULL THEN RETURN NULL;END IF;
 SELECT id INTO i FROM inbox_media_sources WHERE thread_id=t AND id=(SELECT (content->>'media_id')::uuid FROM inbox_messages WHERE thread_id=t AND provider_id=p);
 IF i IS NOT NULL THEN RETURN i;END IF;
 i:=gen_random_uuid();INSERT INTO inbox_media_sources VALUES(i,conn.workspace_id,t,c,ref,kind,'attachment',now());
 UPDATE inbox_messages SET type=kind,body='',content=jsonb_build_object('media_id',i,'name','attachment') WHERE thread_id=t AND provider_id=p;RETURN i;END $$;
CREATE FUNCTION inbox_media_source(w uuid,e text,t uuid,i uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN PERFORM inbox_scope(w,e,t);RETURN (SELECT jsonb_build_object('reference',encode(s.reference_cipher,'base64'),'credential',encode(c.credential_cipher,'base64'),'account',c.external_id,'provider',c.provider,'kind',s.kind) FROM inbox_media_sources s JOIN inbox_connections c ON c.id=s.connection_id WHERE s.id=i AND s.workspace_id=w AND (s.thread_id=t OR EXISTS(SELECT 1 FROM inbox_messages WHERE thread_id=t AND workspace_id=w AND content->>'media_id'=i::text)));END $$;
CREATE FUNCTION inbox_inbound_store(w uuid,t uuid,i uuid,k text,n text,m text,z integer,h text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM inbox_media_sources WHERE id=i AND workspace_id=w AND thread_id=t) THEN RAISE EXCEPTION 'source unavailable' USING ERRCODE='42501';END IF;
 INSERT INTO inbox_media VALUES(i,w,t,k,n,m,z,h,0,now()) ON CONFLICT(id) DO NOTHING;
 UPDATE inbox_messages SET content=content||jsonb_build_object('name',n,'mime',m,'size_bytes',z) WHERE thread_id=t AND content->>'media_id'=i::text;
END $$;
REVOKE ALL ON FUNCTION inbox_inbound_media(uuid,text,text,text,text,bytea,timestamptz),inbox_media_source(uuid,text,uuid,uuid),inbox_inbound_store(uuid,uuid,uuid,text,text,text,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION inbox_inbound_media(uuid,text,text,text,text,bytea,timestamptz),inbox_media_source(uuid,text,uuid,uuid),inbox_inbound_store(uuid,uuid,uuid,text,text,text,integer,text) TO ekmivo_financial_runtime,ekmivo_financial_projection;
CREATE TABLE inbox_incoming_reactions(connection_id uuid NOT NULL REFERENCES inbox_connections(id),provider_id text NOT NULL,external_id text NOT NULL,emoji text NOT NULL,occurred_at timestamptz NOT NULL,PRIMARY KEY(connection_id,provider_id,external_id));
ALTER TABLE inbox_incoming_reactions ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON inbox_incoming_reactions FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
CREATE FUNCTION inbox_provider_reaction(c uuid,p text,s text,emoji_value text,at_time timestamptz) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 INSERT INTO inbox_incoming_reactions VALUES(c,p,s,emoji_value,at_time) ON CONFLICT(connection_id,provider_id,external_id) DO UPDATE SET emoji=EXCLUDED.emoji,occurred_at=EXCLUDED.occurred_at WHERE EXCLUDED.occurred_at>=inbox_incoming_reactions.occurred_at;
 INSERT INTO inbox_reactions(workspace_id,thread_id,message_id,emoji,updated_at) SELECT m.workspace_id,m.thread_id,m.id,r.emoji,r.occurred_at FROM inbox_messages m JOIN inbox_threads t ON t.id=m.thread_id JOIN inbox_incoming_reactions r ON r.connection_id=t.connection_id AND r.provider_id=m.provider_id AND r.external_id=t.external_id WHERE t.connection_id=c AND m.provider_id=p AND t.external_id=s AND m.sender<>'customer'
 ON CONFLICT(message_id) DO UPDATE SET emoji=EXCLUDED.emoji,updated_at=EXCLUDED.updated_at WHERE EXCLUDED.updated_at>=inbox_reactions.updated_at;
END $$;
ALTER FUNCTION inbox_finish_send(uuid,text,text,text) RENAME TO inbox_finish_send_v1;
CREATE FUNCTION inbox_finish_send(i uuid,p text,s text,err text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN PERFORM inbox_finish_send_v1(i,p,s,err);
 PERFORM inbox_provider_reaction(r.connection_id,r.provider_id,r.external_id,r.emoji,r.occurred_at) FROM inbox_incoming_reactions r JOIN inbox_threads t ON t.connection_id=r.connection_id JOIN inbox_messages m ON m.thread_id=t.id WHERE m.id=i AND r.provider_id=p;
END $$;
REVOKE ALL ON FUNCTION inbox_provider_reaction(uuid,text,text,text,timestamptz),inbox_finish_send(uuid,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION inbox_provider_reaction(uuid,text,text,text,timestamptz),inbox_finish_send(uuid,text,text,text) TO ekmivo_financial_runtime,ekmivo_financial_projection;
CREATE FUNCTION inbox_forward_album(w uuid,e text,d uuid,t uuid,source uuid,k uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE src inbox_messages;x inbox_messages;r jsonb;items jsonb:='[]';BEGIN
 PERFORM inbox_scope(w,e,t);
 SELECT m.* INTO src FROM inbox_messages m JOIN inbox_threads a ON a.id=m.thread_id JOIN inbox_connections c ON c.id=a.connection_id AND c.enabled AND c.environment=e WHERE m.id=source AND m.workspace_id=w AND m.sender IN ('seller','ai') AND m.thread_id<>t;
 IF src.id IS NULL THEN RAISE EXCEPTION 'forward unavailable' USING ERRCODE='42501';END IF;
 IF src.type<>'image' OR src.batch_id IS NULL THEN RETURN inbox_advanced(w,e,d,t,'forward',jsonb_build_object('message_id',source,'idempotency_key',k));END IF;
 FOR x IN SELECT * FROM inbox_messages WHERE thread_id=src.thread_id AND batch_id=src.batch_id AND sender=src.sender AND type='image' ORDER BY sequence LOOP
  r:=inbox_advanced(w,e,d,t,'forward',jsonb_build_object('message_id',x.id,'idempotency_key',md5(k::text||x.id::text)::uuid,'batch_id',k));items:=items||jsonb_build_array(r);
 END LOOP;RETURN jsonb_build_object('items',items);
END $$;
REVOKE ALL ON FUNCTION inbox_forward_album(uuid,text,uuid,uuid,uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION inbox_forward_album(uuid,text,uuid,uuid,uuid,uuid) TO ekmivo_financial_runtime,ekmivo_financial_projection;
REVOKE ALL ON FUNCTION inbox_scope(uuid,text,uuid),inbox_capabilities(text),inbox_page(uuid,text,uuid,uuid,bigint,jsonb),inbox_media_access(uuid,text,uuid,uuid),inbox_media_save(uuid,text,uuid,uuid,text,text,text,integer,text,integer),inbox_profile(uuid,text,uuid),inbox_advanced(uuid,text,uuid,uuid,text,jsonb),inbox_next_send(),inbox_reaction_finish(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION inbox_capabilities(text),inbox_page(uuid,text,uuid,uuid,bigint,jsonb),inbox_media_access(uuid,text,uuid,uuid),inbox_media_save(uuid,text,uuid,uuid,text,text,text,integer,text,integer),inbox_profile(uuid,text,uuid),inbox_advanced(uuid,text,uuid,uuid,text,jsonb),inbox_next_send(),inbox_reaction_finish(uuid) TO ekmivo_financial_runtime,ekmivo_financial_projection;
COMMIT;
