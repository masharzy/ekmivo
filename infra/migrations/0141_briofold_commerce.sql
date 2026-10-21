-- Phase 8: operational commerce in control, never financial payment authority.
BEGIN;
DO $$BEGIN IF to_regclass('public.briofold_customers') IS NULL OR to_regclass('public.financial_realm') IS NOT NULL THEN RAISE EXCEPTION '0141 requires control 0140';END IF;END $$;
CREATE TABLE commerce_media(id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES workspaces(id),environment text NOT NULL CHECK(environment IN ('live','sandbox')),object_key text NOT NULL UNIQUE,mime text NOT NULL CHECK(mime IN ('image/png','image/jpeg')),name text NOT NULL CHECK(length(name)<=180),sha256 text NOT NULL CHECK(length(sha256)=64),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE commerce_integrations(workspace_id uuid NOT NULL REFERENCES workspaces(id),environment text NOT NULL CHECK(environment IN ('live','sandbox')),provider text NOT NULL CHECK(provider IN ('steadfast','woocommerce')),secret_cipher bytea NOT NULL,enabled boolean NOT NULL DEFAULT true,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(workspace_id,environment,provider));
CREATE TABLE commerce_products(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id),environment text NOT NULL CHECK(environment IN ('live','sandbox')),name text NOT NULL CHECK(length(name) BETWEEN 1 AND 200),description text NOT NULL DEFAULT '' CHECK(length(description)<=4000),images uuid[] NOT NULL DEFAULT '{}' CHECK(cardinality(images)<=10),size_chart text NOT NULL DEFAULT '' CHECK(length(size_chart)<=2000),active boolean NOT NULL DEFAULT true,revision bigint NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),UNIQUE(workspace_id,environment,id));
CREATE TABLE commerce_variants(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL,environment text NOT NULL,product_id uuid NOT NULL,sku text NOT NULL CHECK(length(sku) BETWEEN 1 AND 80),barcode text NOT NULL DEFAULT '' CHECK(length(barcode)<=80),options jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(options)='object' AND pg_column_size(options)<=2000),price_minor bigint NOT NULL CHECK(price_minor BETWEEN 0 AND 100000000000),active boolean NOT NULL DEFAULT true,revision bigint NOT NULL DEFAULT 1,UNIQUE(workspace_id,environment,sku),UNIQUE(workspace_id,environment,id),FOREIGN KEY(workspace_id,environment,product_id) REFERENCES commerce_products(workspace_id,environment,id));
CREATE UNIQUE INDEX commerce_variant_barcode ON commerce_variants(workspace_id,environment,barcode) WHERE barcode<>'';
CREATE TABLE commerce_warehouses(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id),environment text NOT NULL CHECK(environment IN ('live','sandbox')),name text NOT NULL CHECK(length(name) BETWEEN 1 AND 120),UNIQUE(workspace_id,environment,id),UNIQUE(workspace_id,environment,name));
CREATE TABLE commerce_stock(workspace_id uuid NOT NULL,environment text NOT NULL,warehouse_id uuid NOT NULL,variant_id uuid NOT NULL,on_hand bigint NOT NULL DEFAULT 0 CHECK(on_hand BETWEEN 0 AND 100000000),reserved bigint NOT NULL DEFAULT 0 CHECK(reserved>=0 AND reserved<=on_hand),PRIMARY KEY(workspace_id,environment,warehouse_id,variant_id),FOREIGN KEY(workspace_id,environment,warehouse_id) REFERENCES commerce_warehouses(workspace_id,environment,id),FOREIGN KEY(workspace_id,environment,variant_id) REFERENCES commerce_variants(workspace_id,environment,id));
CREATE TABLE commerce_coupons(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id),environment text NOT NULL CHECK(environment IN ('live','sandbox')),code text NOT NULL CHECK(code~'^[A-Z0-9_-]{2,40}$'),kind text NOT NULL CHECK(kind IN ('fixed','percent','shipping')),value bigint NOT NULL CHECK(value>=0),minimum_minor bigint NOT NULL DEFAULT 0 CHECK(minimum_minor>=0),max_discount_minor bigint CHECK(max_discount_minor>=0),usage_limit integer NOT NULL CHECK(usage_limit BETWEEN 1 AND 1000000),per_customer_limit integer NOT NULL DEFAULT 1 CHECK(per_customer_limit BETWEEN 1 AND 10000),starts_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL CHECK(expires_at>starts_at),audience uuid[] NOT NULL DEFAULT '{}',active boolean NOT NULL DEFAULT true,revision bigint NOT NULL DEFAULT 1,UNIQUE(workspace_id,environment,code),UNIQUE(workspace_id,environment,id),CHECK(kind<>'percent' OR value BETWEEN 1 AND 10000));
CREATE TABLE commerce_orders(id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES workspaces(id),environment text NOT NULL CHECK(environment IN ('live','sandbox')),reference text NOT NULL CHECK(length(reference) BETWEEN 1 AND 80),review_required boolean NOT NULL DEFAULT false,legacy_summary text NOT NULL DEFAULT '' CHECK(length(legacy_summary)<=2000),source text NOT NULL CHECK(source IN ('manual','api','ai')),source_id uuid,customer_id uuid,warehouse_id uuid,status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','hold','confirmed','packed','shipped','delivered','cancelled','returned')),recipient jsonb NOT NULL CHECK(jsonb_typeof(recipient)='object' AND pg_column_size(recipient)<=3000),notes text NOT NULL DEFAULT '' CHECK(length(notes)<=2000),subtotal_minor bigint NOT NULL CHECK(subtotal_minor BETWEEN 0 AND 100000000000),discount_minor bigint NOT NULL DEFAULT 0 CHECK(discount_minor>=0),shipping_minor bigint NOT NULL DEFAULT 0 CHECK(shipping_minor>=0),coupon_id uuid,coupon_discount_minor bigint NOT NULL DEFAULT 0 CHECK(coupon_discount_minor>=0),total_minor bigint NOT NULL CHECK(total_minor BETWEEN 0 AND 100000000000),revision bigint NOT NULL DEFAULT 1,created_by uuid REFERENCES app_users(id),created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),UNIQUE(workspace_id,environment,id),UNIQUE(workspace_id,environment,reference),FOREIGN KEY(workspace_id,environment,customer_id) REFERENCES briofold_customers(workspace_id,environment,id),FOREIGN KEY(workspace_id,environment,warehouse_id) REFERENCES commerce_warehouses(workspace_id,environment,id),FOREIGN KEY(workspace_id,environment,coupon_id) REFERENCES commerce_coupons(workspace_id,environment,id),CHECK(total_minor=subtotal_minor-discount_minor+shipping_minor-coupon_discount_minor));
CREATE UNIQUE INDEX commerce_order_source ON commerce_orders(workspace_id,environment,source,source_id) WHERE source='api' AND source_id IS NOT NULL;
CREATE TABLE commerce_lines(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL,environment text NOT NULL,order_id uuid NOT NULL,variant_id uuid NOT NULL,name text NOT NULL,sku text NOT NULL,options jsonb NOT NULL,unit_minor bigint NOT NULL CHECK(unit_minor>=0),quantity bigint NOT NULL CHECK(quantity BETWEEN 1 AND 10000),returned bigint NOT NULL DEFAULT 0 CHECK(returned BETWEEN 0 AND quantity),FOREIGN KEY(workspace_id,environment,order_id) REFERENCES commerce_orders(workspace_id,environment,id),FOREIGN KEY(workspace_id,environment,variant_id) REFERENCES commerce_variants(workspace_id,environment,id),UNIQUE(order_id,variant_id));
CREATE TABLE commerce_coupon_claims(coupon_id uuid NOT NULL REFERENCES commerce_coupons(id),order_id uuid PRIMARY KEY REFERENCES commerce_orders(id),customer_id uuid NOT NULL REFERENCES briofold_customers(id),status text NOT NULL CHECK(status IN ('reserved','redeemed','released')));
CREATE TABLE commerce_stock_moves(id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,workspace_id uuid NOT NULL,environment text NOT NULL,warehouse_id uuid NOT NULL,variant_id uuid NOT NULL,on_hand_delta bigint NOT NULL,reserved_delta bigint NOT NULL,reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 300),order_id uuid REFERENCES commerce_orders(id),actor_id uuid NOT NULL REFERENCES app_users(id),created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(workspace_id,environment,warehouse_id,variant_id) REFERENCES commerce_stock(workspace_id,environment,warehouse_id,variant_id));
CREATE TABLE commerce_deliveries(id uuid PRIMARY KEY,workspace_id uuid NOT NULL,environment text NOT NULL,order_id uuid NOT NULL UNIQUE,provider text NOT NULL CHECK(length(provider) BETWEEN 1 AND 80),status text NOT NULL CHECK(status IN ('ready','booking','unknown','booked','handed-over','delivered','returned','cancelled')),consignment text NOT NULL DEFAULT '' CHECK(length(consignment)<=120),tracking_url text NOT NULL DEFAULT '' CHECK(length(tracking_url)<=1000 AND (tracking_url='' OR tracking_url~'^https://')),handover_receipt text NOT NULL DEFAULT '' CHECK(length(handover_receipt)<=500),cod_minor bigint NOT NULL CHECK(cod_minor>=0),cod_received_minor bigint NOT NULL DEFAULT 0 CHECK(cod_received_minor>=0),cod_receipt text NOT NULL DEFAULT '' CHECK(length(cod_receipt)<=500),provider_status text NOT NULL DEFAULT '' CHECK(length(provider_status)<=80),revision bigint NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(workspace_id,environment,order_id) REFERENCES commerce_orders(workspace_id,environment,id));
CREATE TABLE commerce_returns(id uuid PRIMARY KEY,workspace_id uuid NOT NULL,environment text NOT NULL,order_id uuid NOT NULL,line_id uuid NOT NULL REFERENCES commerce_lines(id),quantity bigint NOT NULL CHECK(quantity>0),reason text NOT NULL CHECK(length(reason) BETWEEN 1 AND 1000),status text NOT NULL DEFAULT 'requested' CHECK(status IN ('requested','approved','rejected','inspected')),restocked bigint NOT NULL DEFAULT 0 CHECK(restocked BETWEEN 0 AND quantity),damaged bigint NOT NULL DEFAULT 0 CHECK(damaged BETWEEN 0 AND quantity),exchange_order_id uuid,refund_id uuid,inspection text NOT NULL DEFAULT '' CHECK(length(inspection)<=1000),revision bigint NOT NULL DEFAULT 1,created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(workspace_id,environment,order_id) REFERENCES commerce_orders(workspace_id,environment,id),FOREIGN KEY(workspace_id,environment,exchange_order_id) REFERENCES commerce_orders(workspace_id,environment,id));
CREATE TABLE commerce_finance_links(workspace_id uuid NOT NULL,environment text NOT NULL,order_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN ('payment','invoice','refund')),source_id uuid NOT NULL,amount_minor bigint NOT NULL DEFAULT 0 CHECK(amount_minor>=0),created_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(workspace_id,environment,kind,source_id),FOREIGN KEY(workspace_id,environment,order_id) REFERENCES commerce_orders(workspace_id,environment,id));
CREATE TABLE commerce_post_products(workspace_id uuid NOT NULL,environment text NOT NULL,connection_id uuid NOT NULL,post_id text NOT NULL CHECK(length(post_id) BETWEEN 1 AND 200),image_key text NOT NULL DEFAULT '' CHECK(length(image_key)<=300),product_id uuid NOT NULL,PRIMARY KEY(workspace_id,environment,connection_id,post_id,image_key,product_id),FOREIGN KEY(workspace_id,environment,product_id) REFERENCES commerce_products(workspace_id,environment,id));
CREATE TABLE commerce_imports(id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES workspaces(id),environment text NOT NULL CHECK(environment IN ('live','sandbox')),actor_id uuid NOT NULL REFERENCES app_users(id),rows jsonb NOT NULL CHECK(jsonb_array_length(rows) BETWEEN 1 AND 500),fingerprint text NOT NULL,status text NOT NULL DEFAULT 'preview' CHECK(status IN ('preview','applied')),created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE commerce_events(sequence bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES workspaces(id),environment text NOT NULL,entity_id uuid NOT NULL,actor_id uuid REFERENCES app_users(id),action text NOT NULL,detail jsonb NOT NULL DEFAULT '{}',created_at timestamptz NOT NULL DEFAULT now());
CREATE TABLE commerce_notification_reads(workspace_id uuid NOT NULL REFERENCES workspaces(id),environment text NOT NULL CHECK(environment IN ('live','sandbox')),actor_id uuid NOT NULL REFERENCES app_users(id),last_sequence bigint NOT NULL DEFAULT 0,PRIMARY KEY(workspace_id,environment,actor_id));
CREATE TABLE commerce_commands(workspace_id uuid NOT NULL,actor_id uuid NOT NULL,operation_key uuid NOT NULL,fingerprint text NOT NULL,result jsonb NOT NULL,PRIMARY KEY(workspace_id,actor_id,operation_key));
CREATE INDEX commerce_orders_list ON commerce_orders(workspace_id,environment,created_at DESC,id);
CREATE INDEX commerce_events_entity ON commerce_events(workspace_id,environment,entity_id,sequence DESC);
CREATE INDEX commerce_returns_list ON commerce_returns(workspace_id,environment,created_at DESC);
CREATE TRIGGER commerce_events_immutable BEFORE UPDATE OR DELETE ON commerce_events FOR EACH ROW EXECUTE FUNCTION briofold_customer_event_immutable();
CREATE TRIGGER commerce_moves_immutable BEFORE UPDATE OR DELETE ON commerce_stock_moves FOR EACH ROW EXECUTE FUNCTION briofold_customer_event_immutable();
DO $$DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['commerce_media','commerce_integrations','commerce_products','commerce_variants','commerce_warehouses','commerce_stock','commerce_coupons','commerce_orders','commerce_lines','commerce_coupon_claims','commerce_stock_moves','commerce_deliveries','commerce_returns','commerce_finance_links','commerce_post_products','commerce_imports','commerce_events','commerce_notification_reads','commerce_commands'] LOOP EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON %I FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection',t);END LOOP;END $$;
CREATE FUNCTION commerce_actor(w uuid,a uuid,manage boolean DEFAULT false) RETURNS text LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE role_name text;BEGIN
 SELECT m.role INTO role_name FROM workspace_members m JOIN app_users u ON u.id=m.user_id JOIN workspaces x ON x.id=m.workspace_id WHERE m.workspace_id=w AND m.user_id=a AND u.disabled_at IS NULL AND x.service_mode<>'off';
 IF role_name IS NULL OR (manage AND role_name NOT IN ('owner','admin','editor')) THEN RAISE EXCEPTION 'Commerce access denied' USING ERRCODE='42501';END IF;RETURN role_name;
END $$;
CREATE FUNCTION commerce_move(w uuid,e text,a uuid,wh uuid,v uuid,dh bigint,dr bigint,why text,oid uuid DEFAULT NULL) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN
 INSERT INTO commerce_stock(workspace_id,environment,warehouse_id,variant_id) VALUES(w,e,wh,v) ON CONFLICT DO NOTHING;
 UPDATE commerce_stock SET on_hand=on_hand+dh,reserved=reserved+dr WHERE workspace_id=w AND environment=e AND warehouse_id=wh AND variant_id=v;
 INSERT INTO commerce_stock_moves(workspace_id,environment,warehouse_id,variant_id,on_hand_delta,reserved_delta,reason,order_id,actor_id) VALUES(w,e,wh,v,dh,dr,why,oid,a);
END $$;
CREATE FUNCTION commerce_read(w uuid,e text,a uuid,kind text,cid uuid DEFAULT NULL,off integer DEFAULT 0,q text DEFAULT '',state_filter text DEFAULT '',source_filter text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE role_name text;items jsonb;item jsonb;BEGIN
 role_name:=commerce_actor(w,a);IF e IS NULL OR e NOT IN ('live','sandbox') OR off IS NULL OR off<0 OR off>10000 OR length(q)>100 OR length(state_filter)>40 OR source_filter NOT IN ('','manual','api','ai') THEN RAISE EXCEPTION 'Invalid commerce filter' USING ERRCODE='22023';END IF;
 IF kind='orders' THEN
  SELECT coalesce(jsonb_agg(to_jsonb(z)),'[]') INTO items FROM (SELECT o.id,o.reference,o.source,o.status,o.customer_id,o.total_minor,o.revision,o.created_at,coalesce((SELECT sum(f.amount_minor) FROM commerce_finance_links f WHERE f.order_id=o.id AND f.kind='payment'),0) linked_verified_minor FROM commerce_orders o WHERE o.workspace_id=w AND o.environment=e AND (cid IS NULL OR o.id=cid) AND (q='' OR (o.reference ILIKE '%'||q||'%' OR o.id::text=lower(q))) AND (state_filter='' OR o.status=state_filter) AND (source_filter='' OR o.source=source_filter) ORDER BY o.created_at DESC,o.id LIMIT 51 OFFSET off) z;
  IF cid IS NOT NULL THEN
   SELECT to_jsonb(o)-'workspace_id'||jsonb_build_object('recipient',CASE WHEN role_name IN ('owner','admin','editor') THEN o.recipient ELSE '{}'::jsonb END,'notes',CASE WHEN role_name IN ('owner','admin','editor') THEN o.notes ELSE '' END) INTO item FROM commerce_orders o WHERE o.workspace_id=w AND o.environment=e AND o.id=cid;
   IF item IS NULL THEN RAISE EXCEPTION 'Order unavailable' USING ERRCODE='42501';END IF;
   RETURN jsonb_build_object('order',item,'can_manage',role_name IN ('owner','admin','editor'),'lines',coalesce((SELECT jsonb_agg(to_jsonb(l)-'workspace_id'-'environment') FROM commerce_lines l WHERE l.order_id=cid),'[]'),'delivery',(SELECT to_jsonb(d)-'workspace_id'-'environment' FROM commerce_deliveries d WHERE d.order_id=cid),'returns',coalesce((SELECT jsonb_agg(to_jsonb(r)-'workspace_id'-'environment') FROM commerce_returns r WHERE r.order_id=cid),'[]'),'finance_links',coalesce((SELECT jsonb_agg(to_jsonb(f)-'workspace_id'-'environment') FROM commerce_finance_links f WHERE f.order_id=cid),'[]'),'events',coalesce((SELECT jsonb_agg(to_jsonb(z) ORDER BY z.sequence DESC) FROM (SELECT sequence,action,detail,created_at FROM commerce_events WHERE workspace_id=w AND environment=e AND entity_id=cid ORDER BY sequence DESC LIMIT 51 OFFSET off) z),'[]'));
  END IF;
 ELSIF kind='products' THEN SELECT coalesce(jsonb_agg(to_jsonb(z)),'[]') INTO items FROM (SELECT p.*,coalesce((SELECT jsonb_agg(to_jsonb(v)-'workspace_id'-'environment') FROM commerce_variants v WHERE v.product_id=p.id),'[]') variants FROM commerce_products p WHERE p.workspace_id=w AND p.environment=e AND (q='' OR p.name ILIKE '%'||q||'%' OR EXISTS(SELECT 1 FROM commerce_variants v WHERE v.product_id=p.id AND (v.sku ILIKE '%'||q||'%' OR v.barcode=q))) ORDER BY p.created_at DESC,p.id LIMIT 51 OFFSET off) z;
 ELSIF kind='inventory' THEN SELECT coalesce(jsonb_agg(to_jsonb(z)),'[]') INTO items FROM (SELECT s.*,v.sku,v.barcode,p.name,wh.name warehouse_name,s.on_hand-s.reserved available FROM commerce_stock s JOIN commerce_variants v ON v.id=s.variant_id JOIN commerce_products p ON p.id=v.product_id JOIN commerce_warehouses wh ON wh.id=s.warehouse_id WHERE s.workspace_id=w AND s.environment=e AND (q='' OR v.sku ILIKE '%'||q||'%' OR v.barcode=q OR p.name ILIKE '%'||q||'%') ORDER BY wh.name,v.sku LIMIT 51 OFFSET off) z;
 ELSIF kind='movements' THEN SELECT coalesce(jsonb_agg(to_jsonb(z)),'[]') INTO items FROM (SELECT m.*,v.sku,wh.name warehouse_name FROM commerce_stock_moves m JOIN commerce_variants v ON v.id=m.variant_id JOIN commerce_warehouses wh ON wh.id=m.warehouse_id WHERE m.workspace_id=w AND m.environment=e ORDER BY m.id DESC LIMIT 51 OFFSET off) z;
 ELSIF kind='coupons' THEN SELECT coalesce(jsonb_agg(to_jsonb(z)),'[]') INTO items FROM (SELECT c.*,(SELECT count(*) FROM commerce_coupon_claims x WHERE x.coupon_id=c.id AND x.status<>'released') used FROM commerce_coupons c WHERE c.workspace_id=w AND c.environment=e AND (q='' OR c.code ILIKE '%'||upper(q)||'%') ORDER BY c.id LIMIT 51 OFFSET off) z;
 ELSIF kind='delivery' THEN SELECT coalesce(jsonb_agg(to_jsonb(z)),'[]') INTO items FROM (SELECT d.*,o.reference FROM commerce_deliveries d JOIN commerce_orders o ON o.id=d.order_id WHERE d.workspace_id=w AND d.environment=e AND (state_filter='' OR d.status=state_filter) AND (q='' OR o.reference ILIKE '%'||q||'%' OR d.consignment ILIKE '%'||q||'%') ORDER BY d.created_at DESC,d.id LIMIT 51 OFFSET off) z;
 ELSIF kind='returns' THEN SELECT coalesce(jsonb_agg(to_jsonb(z)),'[]') INTO items FROM (SELECT r.*,o.reference,l.name FROM commerce_returns r JOIN commerce_orders o ON o.id=r.order_id JOIN commerce_lines l ON l.id=r.line_id WHERE r.workspace_id=w AND r.environment=e AND (state_filter='' OR r.status=state_filter) ORDER BY r.created_at DESC,r.id LIMIT 51 OFFSET off) z;
 ELSIF kind='notifications' THEN SELECT coalesce(jsonb_agg(to_jsonb(z)),'[]') INTO items FROM (SELECT ev.sequence,ev.action,ev.created_at,ord.id order_id,ord.reference FROM commerce_events ev JOIN commerce_orders ord ON ord.id=coalesce((ev.detail->>'order_id')::uuid,ev.entity_id) AND ord.workspace_id=w AND ord.environment=e WHERE ev.workspace_id=w AND ev.environment=e AND ev.action IN ('create-order','api-order','order-state','delivery-state','return-state','courier-status-record') AND ev.sequence>coalesce((SELECT last_sequence FROM commerce_notification_reads WHERE workspace_id=w AND environment=e AND actor_id=a),0) ORDER BY ev.sequence ASC LIMIT 51) z;
 ELSIF kind='integrations' THEN SELECT coalesce(jsonb_agg(jsonb_build_object('provider',provider,'enabled',enabled,'updated_at',updated_at)),'[]') INTO items FROM commerce_integrations WHERE workspace_id=w AND environment=e;
 ELSIF kind='media' THEN SELECT coalesce(jsonb_agg(to_jsonb(z)),'[]') INTO items FROM (SELECT id,mime,name FROM commerce_media WHERE workspace_id=w AND environment=e ORDER BY created_at DESC LIMIT 51 OFFSET off) z;
 ELSIF kind='legacy-orders' THEN SELECT coalesce(jsonb_agg(to_jsonb(z)),'[]') INTO items FROM (SELECT x.id,x.thread_id,x.reference,x.items,x.amount_minor,x.status FROM inbox_orders x JOIN inbox_threads t ON t.id=x.thread_id JOIN inbox_connections cn ON cn.id=t.connection_id WHERE x.workspace_id=w AND cn.environment=e ORDER BY x.created_at DESC LIMIT 51 OFFSET off) z;
 ELSIF kind='post-mapping' THEN SELECT coalesce(jsonb_agg(to_jsonb(z)),'[]') INTO items FROM (SELECT m.*,p.name FROM commerce_post_products m JOIN commerce_products p ON p.id=m.product_id WHERE m.workspace_id=w AND m.environment=e ORDER BY m.post_id LIMIT 51 OFFSET off) z;
 ELSE RAISE EXCEPTION 'Unknown commerce resource' USING ERRCODE='22023';END IF;
 RETURN jsonb_build_object('items',items,'can_manage',role_name IN ('owner','admin','editor'),'can_admin',role_name IN ('owner','admin'),'warehouses',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name)) FROM commerce_warehouses WHERE workspace_id=w AND environment=e),'[]'));
END $$;
CREATE FUNCTION commerce_write(w uuid,e text,a uuid,k uuid,act text,b jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE role_name text;fp text;old commerce_commands;res jsonb;cid uuid:=(b->>'id')::uuid;v commerce_variants;p commerce_products;o commerce_orders;c commerce_coupons;d commerce_deliveries;r commerce_returns;l commerce_lines;row jsonb;wh uuid;qty bigint;sub bigint:=0;disc bigint:=0;ship bigint:=0;promo bigint:=0;price bigint;next_state text;why text;ix integer:=0;rows_out jsonb:='[]';groups jsonb:='{}';prior jsonb;
BEGIN
 role_name:=commerce_actor(w,a,true);
 IF e IS NULL OR e NOT IN ('live','sandbox') OR k IS NULL OR jsonb_typeof(b) IS DISTINCT FROM 'object' OR pg_column_size(b)>524288 OR act IS NULL THEN RAISE EXCEPTION 'Invalid commerce command' USING ERRCODE='22023';END IF;
 fp:=encode(sha256(convert_to(e||act||b::text,'UTF8')),'hex');PERFORM pg_advisory_xact_lock(hashtextextended('commerce:'||w::text,0));
 SELECT * INTO old FROM commerce_commands WHERE workspace_id=w AND actor_id=a AND operation_key=k;
 IF old.operation_key IS NOT NULL THEN IF old.fingerprint<>fp THEN RAISE EXCEPTION 'Operation key conflict' USING ERRCODE='23505';END IF;IF act='courier-start' THEN RETURN old.result||'{"replayed":true}'::jsonb;END IF;RETURN old.result;END IF;
 IF act='media-save' THEN
  cid:=(b->>'media_id')::uuid;
  INSERT INTO commerce_media(id,workspace_id,environment,object_key,mime,name,sha256) VALUES(cid,w,e,b->>'object_key',b->>'mime',b->>'name',b->>'sha256') ON CONFLICT(id) DO NOTHING;
  IF NOT EXISTS(SELECT 1 FROM commerce_media WHERE id=cid AND workspace_id=w AND environment=e AND sha256=b->>'sha256') THEN RAISE EXCEPTION 'Media key conflict' USING ERRCODE='23505';END IF;
 ELSIF act='warehouse' THEN
  IF role_name NOT IN ('owner','admin') OR length(btrim(coalesce(b->>'name',''))) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'Warehouse access or name invalid' USING ERRCODE='42501';END IF;
  INSERT INTO commerce_warehouses(workspace_id,environment,name) VALUES(w,e,btrim(b->>'name')) RETURNING id INTO cid;
 ELSIF act='product' THEN
  IF length(btrim(coalesce(b->>'name',''))) NOT BETWEEN 1 AND 200 OR jsonb_typeof(b->'variants') IS DISTINCT FROM 'array' OR jsonb_array_length(b->'variants') NOT BETWEEN 1 AND 100 OR length(coalesce(b->>'description',''))>4000 OR length(coalesce(b->>'size_chart',''))>2000 THEN RAISE EXCEPTION 'Invalid product' USING ERRCODE='22023';END IF;
  IF b?'images' AND (jsonb_typeof(b->'images') IS DISTINCT FROM 'array' OR jsonb_array_length(b->'images')>10) THEN RAISE EXCEPTION 'Maximum ten images' USING ERRCODE='22023';END IF;
  FOR row IN SELECT value FROM jsonb_array_elements(coalesce(b->'images','[]')) LOOP
   IF NOT EXISTS(SELECT 1 FROM commerce_media m WHERE m.id=(row#>>'{}')::uuid AND m.workspace_id=w AND m.environment=e) THEN RAISE EXCEPTION 'Clean owned image required' USING ERRCODE='42501';END IF;
  END LOOP;
  IF cid IS NOT NULL THEN
   SELECT * INTO p FROM commerce_products WHERE workspace_id=w AND environment=e AND id=cid FOR UPDATE;
   IF p.id IS NULL THEN RAISE EXCEPTION 'Product unavailable' USING ERRCODE='42501';END IF;
   IF p.revision IS DISTINCT FROM (b->>'revision')::bigint THEN RAISE EXCEPTION 'Product changed; reload' USING ERRCODE='40001';END IF;
   UPDATE commerce_products SET name=btrim(b->>'name'),description=coalesce(b->>'description',description),size_chart=coalesce(b->>'size_chart',size_chart),images=CASE WHEN b?'images' THEN ARRAY(SELECT jsonb_array_elements_text(b->'images'))::uuid[] ELSE images END,active=coalesce((b->>'active')::boolean,active),revision=revision+1 WHERE id=cid;
  ELSE INSERT INTO commerce_products(workspace_id,environment,name,description,size_chart,images,active) VALUES(w,e,btrim(b->>'name'),coalesce(b->>'description',''),coalesce(b->>'size_chart',''),ARRAY(SELECT jsonb_array_elements_text(coalesce(b->'images','[]')))::uuid[],coalesce((b->>'active')::boolean,true)) RETURNING id INTO cid;END IF;
  FOR row IN SELECT value FROM jsonb_array_elements(b->'variants') LOOP
   IF length(btrim(coalesce(row->>'sku',''))) NOT BETWEEN 1 AND 80 OR coalesce(row->>'price_minor','')!~'^[0-9]{1,12}$' OR (row->>'price_minor')::bigint>100000000000 OR length(coalesce(row->>'barcode',''))>80 OR jsonb_typeof(coalesce(row->'options','{}')) IS DISTINCT FROM 'object' OR pg_column_size(coalesce(row->'options','{}'))>2000 THEN RAISE EXCEPTION 'Invalid variant' USING ERRCODE='22023';END IF;
   IF row->>'id' IS NOT NULL THEN
    UPDATE commerce_variants SET sku=btrim(row->>'sku'),barcode=coalesce(row->>'barcode',''),options=coalesce(row->'options','{}'),price_minor=(row->>'price_minor')::bigint,active=coalesce((row->>'active')::boolean,active),revision=revision+1 WHERE id=(row->>'id')::uuid AND product_id=cid AND workspace_id=w AND environment=e;
    IF NOT FOUND THEN RAISE EXCEPTION 'Variant unavailable' USING ERRCODE='42501';END IF;
   ELSE INSERT INTO commerce_variants(workspace_id,environment,product_id,sku,barcode,options,price_minor,active) VALUES(w,e,cid,btrim(row->>'sku'),coalesce(row->>'barcode',''),coalesce(row->'options','{}'),(row->>'price_minor')::bigint,coalesce((row->>'active')::boolean,true));END IF;
  END LOOP;
 ELSIF act IN ('adjust-stock','transfer-stock') THEN
  IF role_name NOT IN ('owner','admin') THEN RAISE EXCEPTION 'Stock manager required' USING ERRCODE='42501';END IF;
  why:=btrim(coalesce(b->>'reason',''));wh:=(b->>'warehouse_id')::uuid;
  IF length(why) NOT BETWEEN 3 AND 300 OR coalesce(b->>'quantity','')!~'^-?[0-9]{1,8}$' OR abs((b->>'quantity')::bigint)>10000000 OR (b->>'quantity')::bigint=0 THEN RAISE EXCEPTION 'Stock quantity/reason required' USING ERRCODE='22023';END IF;
  cid:=(b->>'variant_id')::uuid;qty:=(b->>'quantity')::bigint;
  PERFORM commerce_move(w,e,a,wh,cid,CASE WHEN act='transfer-stock' THEN -qty ELSE qty END,0,why);
  IF act='transfer-stock' THEN IF qty<=0 OR wh=(b->>'target_warehouse_id')::uuid THEN RAISE EXCEPTION 'Invalid transfer' USING ERRCODE='22023';END IF;PERFORM commerce_move(w,e,a,(b->>'target_warehouse_id')::uuid,cid,qty,0,why);END IF;
 ELSIF act='coupon' THEN
  IF role_name NOT IN ('owner','admin') THEN RAISE EXCEPTION 'Coupon manager required' USING ERRCODE='42501';END IF;
  IF cid IS NOT NULL THEN
   SELECT * INTO c FROM commerce_coupons WHERE id=cid AND workspace_id=w AND environment=e;
   IF c.id IS NULL THEN RAISE EXCEPTION 'Coupon unavailable' USING ERRCODE='42501';END IF;
   IF c.revision IS DISTINCT FROM (b->>'revision')::bigint THEN RAISE EXCEPTION 'Coupon changed; reload' USING ERRCODE='40001';END IF;
   -- Existing price/limits remain immutable after creation. Archive rather than rewriting claims.
   UPDATE commerce_coupons SET active=(b->>'active')::boolean,revision=revision+1 WHERE id=cid;
  ELSE
   IF coalesce(b->>'kind','') NOT IN ('fixed','percent','shipping') OR coalesce(b->>'value','')!~'^[0-9]{1,12}$' OR coalesce(b->>'usage_limit','')!~'^[0-9]{1,7}$' OR coalesce(b->>'per_customer_limit','1')!~'^[0-9]{1,5}$' OR jsonb_typeof(coalesce(b->'audience','[]')) IS DISTINCT FROM 'array' OR jsonb_array_length(coalesce(b->'audience','[]'))>500 THEN RAISE EXCEPTION 'Invalid coupon' USING ERRCODE='22023';END IF;
   FOR row IN SELECT value FROM jsonb_array_elements(coalesce(b->'audience','[]')) LOOP IF NOT EXISTS(SELECT 1 FROM briofold_customers x WHERE x.id=(row#>>'{}')::uuid AND x.workspace_id=w AND x.environment=e AND x.deleted_at IS NULL AND x.merged_into IS NULL) THEN RAISE EXCEPTION 'Audience unavailable' USING ERRCODE='42501';END IF;END LOOP;
   INSERT INTO commerce_coupons(workspace_id,environment,code,kind,value,minimum_minor,max_discount_minor,usage_limit,per_customer_limit,starts_at,expires_at,audience) VALUES(w,e,upper(btrim(b->>'code')),b->>'kind',(b->>'value')::bigint,coalesce((b->>'minimum_minor')::bigint,0),(b->>'max_discount_minor')::bigint,(b->>'usage_limit')::integer,coalesce((b->>'per_customer_limit')::integer,1),coalesce((b->>'starts_at')::timestamptz,now()),(b->>'expires_at')::timestamptz,ARRAY(SELECT jsonb_array_elements_text(coalesce(b->'audience','[]')))::uuid[]) RETURNING id INTO cid;
  END IF;
 ELSIF act IN ('create-order','api-order','review-order') THEN
  IF act='review-order' THEN
   SELECT * INTO o FROM commerce_orders WHERE id=cid AND workspace_id=w AND environment=e AND status='draft' AND review_required;
   IF o.id IS NULL THEN RAISE EXCEPTION 'Review order unavailable' USING ERRCODE='42501';END IF;
   IF o.revision IS DISTINCT FROM (b->>'revision')::bigint THEN RAISE EXCEPTION 'Order changed; reload' USING ERRCODE='40001';END IF;
  ELSE cid:=k;END IF;wh:=(b->>'warehouse_id')::uuid;
  IF jsonb_typeof(b->'lines') IS DISTINCT FROM 'array' OR jsonb_array_length(b->'lines') NOT BETWEEN 1 AND 100 OR length(btrim(coalesce(b->>'reference',''))) NOT BETWEEN 1 AND 80 OR jsonb_typeof(b->'recipient') IS DISTINCT FROM 'object' OR length(btrim(coalesce(b->'recipient'->>'name',''))) NOT BETWEEN 1 AND 160 OR length(btrim(coalesce(b->'recipient'->>'address',''))) NOT BETWEEN 3 AND 1000 OR coalesce(b->'recipient'->>'phone','')!~'^\+?[0-9]{7,15}$' THEN RAISE EXCEPTION 'Recipient and order lines required' USING ERRCODE='22023';END IF;
  IF NOT EXISTS(SELECT 1 FROM commerce_warehouses WHERE id=wh AND workspace_id=w AND environment=e) THEN RAISE EXCEPTION 'Warehouse unavailable' USING ERRCODE='42501';END IF;
  IF b->>'customer_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM briofold_customers x WHERE x.id=(b->>'customer_id')::uuid AND x.workspace_id=w AND x.environment=e AND x.deleted_at IS NULL AND x.merged_into IS NULL) THEN RAISE EXCEPTION 'Customer unavailable' USING ERRCODE='42501';END IF;
  IF b->>'thread_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM inbox_threads t JOIN inbox_connections x ON x.id=t.connection_id WHERE t.id=(b->>'thread_id')::uuid AND t.workspace_id=w AND x.environment=e) THEN RAISE EXCEPTION 'Conversation unavailable' USING ERRCODE='42501';END IF;
  FOR row IN SELECT value FROM jsonb_array_elements(b->'lines') LOOP
   SELECT * INTO v FROM commerce_variants WHERE id=(row->>'variant_id')::uuid AND workspace_id=w AND environment=e AND active AND EXISTS(SELECT 1 FROM commerce_products pr WHERE pr.id=product_id AND pr.active);
   IF v.id IS NULL OR coalesce(row->>'quantity','')!~'^[0-9]{1,5}$' OR (row->>'quantity')::bigint NOT BETWEEN 1 AND 10000 THEN RAISE EXCEPTION 'Variant or quantity unavailable' USING ERRCODE='22023';END IF;
   sub:=sub+v.price_minor*(row->>'quantity')::bigint;
  END LOOP;
  disc:=coalesce((b->>'discount_minor')::bigint,0);ship:=coalesce((b->>'shipping_minor')::bigint,0);
  IF disc<0 OR disc>sub OR ship NOT BETWEEN 0 AND 100000000 OR (disc>0 AND role_name NOT IN ('owner','admin')) THEN RAISE EXCEPTION 'Invalid discount/shipping' USING ERRCODE='42501';END IF;
  IF coalesce(b->>'coupon','')<>'' THEN
   SELECT * INTO c FROM commerce_coupons WHERE workspace_id=w AND environment=e AND code=upper(btrim(b->>'coupon')) AND active AND starts_at<=now() AND expires_at>now();
   IF c.id IS NULL OR sub<c.minimum_minor OR b->>'customer_id' IS NULL OR (cardinality(c.audience)>0 AND NOT (b->>'customer_id')::uuid=ANY(c.audience)) THEN RAISE EXCEPTION 'Coupon unavailable' USING ERRCODE='22023';END IF;
   promo:=CASE c.kind WHEN 'shipping' THEN ship WHEN 'percent' THEN ((sub-disc)::numeric*c.value/10000)::bigint ELSE c.value END;
   -- Percentage discounts round down to whole paisa.
   IF c.kind='percent' THEN promo:=floor((sub-disc)::numeric*c.value/10000)::bigint;END IF;
   IF c.max_discount_minor IS NOT NULL THEN promo:=least(promo,c.max_discount_minor);END IF;promo:=least(promo,CASE WHEN c.kind='shipping' THEN ship ELSE sub-disc END);
  END IF;
  INSERT INTO commerce_orders(id,workspace_id,environment,reference,source,source_id,customer_id,warehouse_id,recipient,notes,subtotal_minor,discount_minor,shipping_minor,coupon_id,coupon_discount_minor,total_minor,created_by) VALUES(cid,w,e,btrim(b->>'reference'),CASE WHEN act='api-order' THEN 'api' WHEN b->>'thread_id' IS NOT NULL THEN 'ai' ELSE 'manual' END,CASE WHEN act='api-order' THEN k ELSE (b->>'thread_id')::uuid END,(b->>'customer_id')::uuid,wh,b->'recipient',coalesce(b->>'notes',''),sub,disc,ship,c.id,promo,sub-disc+ship-promo,a) ON CONFLICT(id) DO UPDATE SET reference=EXCLUDED.reference,customer_id=EXCLUDED.customer_id,warehouse_id=EXCLUDED.warehouse_id,recipient=EXCLUDED.recipient,notes=EXCLUDED.notes,subtotal_minor=EXCLUDED.subtotal_minor,discount_minor=EXCLUDED.discount_minor,shipping_minor=EXCLUDED.shipping_minor,coupon_id=EXCLUDED.coupon_id,coupon_discount_minor=EXCLUDED.coupon_discount_minor,total_minor=EXCLUDED.total_minor,revision=commerce_orders.revision+1,review_required=false,updated_at=now() WHERE act='review-order' AND commerce_orders.workspace_id=w AND commerce_orders.environment=e AND commerce_orders.status='draft' AND commerce_orders.review_required;
  IF NOT FOUND THEN RAISE EXCEPTION 'Order key conflict' USING ERRCODE='23505';END IF;
  FOR row IN SELECT value FROM jsonb_array_elements(b->'lines') LOOP
   SELECT * INTO v FROM commerce_variants WHERE id=(row->>'variant_id')::uuid;SELECT * INTO p FROM commerce_products WHERE id=v.product_id;
   INSERT INTO commerce_lines(workspace_id,environment,order_id,variant_id,name,sku,options,unit_minor,quantity) VALUES(w,e,cid,v.id,p.name,v.sku,v.options,v.price_minor,(row->>'quantity')::bigint);
  END LOOP;
  IF b->>'customer_id' IS NOT NULL THEN INSERT INTO briofold_customer_sources(workspace_id,environment,customer_id,kind,source_id) VALUES(w,e,(b->>'customer_id')::uuid,'order',cid);END IF;
 ELSIF act='order-state' THEN
  SELECT * INTO o FROM commerce_orders WHERE id=cid AND workspace_id=w AND environment=e FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'Order unavailable' USING ERRCODE='42501';END IF;
  IF o.revision IS DISTINCT FROM (b->>'revision')::bigint THEN RAISE EXCEPTION 'Order changed; reload' USING ERRCODE='40001';END IF;
  next_state:=b->>'status';
  IF next_state IS NULL OR NOT ((o.status IN ('draft','hold') AND next_state IN ('draft','hold','confirmed','cancelled')) OR (o.status='confirmed' AND next_state IN ('packed','cancelled','hold')) OR (o.status='packed' AND next_state IN ('shipped','cancelled')) OR (o.status='shipped' AND next_state='delivered')) OR o.status=next_state THEN RAISE EXCEPTION 'Invalid order transition' USING ERRCODE='22023';END IF;
  IF next_state='confirmed' AND (o.review_required OR o.warehouse_id IS NULL OR NOT EXISTS(SELECT 1 FROM commerce_lines WHERE order_id=cid)) THEN RAISE EXCEPTION 'Review structured items and recipient before confirmation' USING ERRCODE='23514';END IF;
  IF next_state='confirmed' THEN
   IF o.coupon_id IS NOT NULL THEN
    SELECT * INTO c FROM commerce_coupons WHERE id=o.coupon_id;
    IF NOT c.active OR c.starts_at>now() OR c.expires_at<=now() OR (cardinality(c.audience)>0 AND NOT o.customer_id=ANY(c.audience)) OR (SELECT count(*) FROM commerce_coupon_claims WHERE coupon_id=c.id AND status<>'released')>=c.usage_limit OR (SELECT count(*) FROM commerce_coupon_claims WHERE coupon_id=c.id AND customer_id=o.customer_id AND status<>'released')>=c.per_customer_limit THEN RAISE EXCEPTION 'Coupon limit or expiry reached' USING ERRCODE='23514';END IF;
    INSERT INTO commerce_coupon_claims VALUES(c.id,cid,o.customer_id,'reserved') ON CONFLICT(order_id) DO UPDATE SET status='reserved';
   END IF;
   FOR l IN SELECT * FROM commerce_lines WHERE order_id=cid ORDER BY variant_id LOOP PERFORM commerce_move(w,e,a,o.warehouse_id,l.variant_id,0,l.quantity,'Order reserved',cid);END LOOP;
  ELSIF next_state IN ('cancelled','hold') AND o.status IN ('confirmed','packed') THEN
   FOR l IN SELECT * FROM commerce_lines WHERE order_id=cid ORDER BY variant_id LOOP PERFORM commerce_move(w,e,a,o.warehouse_id,l.variant_id,0,-l.quantity,'Order released',cid);END LOOP;
   UPDATE commerce_coupon_claims SET status='released' WHERE order_id=cid;
  ELSIF next_state='shipped' THEN
   IF NOT EXISTS(SELECT 1 FROM commerce_deliveries WHERE order_id=cid AND status='handed-over') THEN RAISE EXCEPTION 'Courier handover receipt required' USING ERRCODE='23514';END IF;
   FOR l IN SELECT * FROM commerce_lines WHERE order_id=cid ORDER BY variant_id LOOP PERFORM commerce_move(w,e,a,o.warehouse_id,l.variant_id,-l.quantity,-l.quantity,'Order shipped',cid);END LOOP;
   UPDATE commerce_coupon_claims SET status='redeemed' WHERE order_id=cid;
  ELSIF next_state='delivered' THEN UPDATE commerce_deliveries SET status='delivered',revision=revision+1 WHERE order_id=cid;END IF;
  IF next_state IN ('cancelled','hold') AND EXISTS(SELECT 1 FROM commerce_deliveries WHERE order_id=cid AND status NOT IN ('ready','cancelled')) THEN RAISE EXCEPTION 'Resolve courier booking before cancellation' USING ERRCODE='23514';END IF;
  UPDATE commerce_orders SET status=next_state,revision=revision+1,updated_at=now() WHERE id=cid;
 ELSIF act IN ('courier-read','courier-status-record') THEN
  SELECT * INTO d FROM commerce_deliveries WHERE id=cid AND workspace_id=w AND environment=e;
  IF d.id IS NULL OR d.provider<>'steadfast' THEN RAISE EXCEPTION 'Shipment unavailable' USING ERRCODE='42501';END IF;
  IF act='courier-status-record' THEN UPDATE commerce_deliveries SET provider_status=left(b->>'provider_status',80),revision=revision+1 WHERE id=cid;END IF;
  res:=jsonb_build_object('id',cid,'consignment',d.consignment,'provider_status',coalesce(b->>'provider_status',d.provider_status));
 ELSIF act='courier-start' THEN
  SELECT * INTO d FROM commerce_deliveries WHERE id=cid AND workspace_id=w AND environment=e FOR UPDATE;
  SELECT * INTO o FROM commerce_orders WHERE id=d.order_id;
  IF d.id IS NULL OR d.provider<>'steadfast' OR d.status<>'ready' OR o.status NOT IN ('confirmed','packed') OR e<>'live' THEN RAISE EXCEPTION 'Courier booking unavailable; reconcile existing attempt' USING ERRCODE='23514';END IF;
  IF coalesce(o.recipient->>'phone','')!~'^(\+?88)?01[3-9][0-9]{8}$' OR length(coalesce(o.recipient->>'name',''))>100 THEN RAISE EXCEPTION 'Steadfast requires Bangladesh recipient phone and name within 100 characters' USING ERRCODE='22023';END IF;
  UPDATE commerce_deliveries SET status='booking',revision=revision+1 WHERE id=cid;
  res:=jsonb_build_object('id',cid,'order_id',o.id,'recipient',o.recipient,'reference',o.reference,'cod_minor',d.cod_minor,'notes',o.notes,'revision',d.revision+1,'replayed',false);
 ELSIF act='delivery' THEN
  SELECT * INTO o FROM commerce_orders WHERE id=(b->>'order_id')::uuid AND workspace_id=w AND environment=e;
  IF o.id IS NULL OR o.status NOT IN ('confirmed','packed') OR length(btrim(coalesce(b->>'provider',''))) NOT BETWEEN 1 AND 80 OR coalesce(b->>'cod_minor','')!~'^[0-9]{1,15}$' OR (b->>'cod_minor')::bigint>greatest(o.total_minor-coalesce((SELECT sum(amount_minor) FROM commerce_finance_links WHERE order_id=o.id AND kind='payment'),0),0) THEN RAISE EXCEPTION 'Invalid shipment/COD' USING ERRCODE='22023';END IF;
  cid:=k;INSERT INTO commerce_deliveries(id,workspace_id,environment,order_id,provider,status,cod_minor) VALUES(cid,w,e,o.id,btrim(b->>'provider'),'ready',(b->>'cod_minor')::bigint) ON CONFLICT(order_id) DO UPDATE SET provider=EXCLUDED.provider,status='ready',cod_minor=EXCLUDED.cod_minor,revision=commerce_deliveries.revision+1,consignment='',tracking_url='',handover_receipt='' WHERE commerce_deliveries.status='cancelled' RETURNING id INTO cid;IF cid IS NULL THEN RAISE EXCEPTION 'Existing shipment must be resolved' USING ERRCODE='23505';END IF;
 ELSIF act='delivery-state' THEN
  SELECT * INTO d FROM commerce_deliveries WHERE id=cid AND workspace_id=w AND environment=e FOR UPDATE;
  IF d.id IS NULL THEN RAISE EXCEPTION 'Delivery unavailable' USING ERRCODE='42501';END IF;
  IF d.revision IS DISTINCT FROM (b->>'revision')::bigint THEN RAISE EXCEPTION 'Delivery changed; reload' USING ERRCODE='40001';END IF;
  next_state:=b->>'status';
  IF next_state IS NULL OR NOT ((d.status='ready' AND next_state IN ('booking','booked','cancelled')) OR (d.status='booking' AND next_state IN ('booked','unknown','cancelled')) OR (d.status='unknown' AND next_state IN ('booked','cancelled')) OR (d.status='booked' AND next_state IN ('handed-over','cancelled')) OR (d.status IN ('handed-over','delivered') AND next_state='returned')) THEN RAISE EXCEPTION 'Invalid delivery transition; reconcile unknown outcomes first' USING ERRCODE='22023';END IF;
  IF next_state='booked' AND length(btrim(coalesce(b->>'consignment',''))) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'Courier consignment required' USING ERRCODE='22023';END IF;
  IF next_state='handed-over' AND length(btrim(coalesce(b->>'receipt',''))) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'Handover receipt required' USING ERRCODE='22023';END IF;
  IF d.status IN ('booking','unknown','booked') AND next_state='cancelled' AND (b->>'confirmed_no_booking') IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Confirm provider has no active consignment' USING ERRCODE='22023';END IF;
  UPDATE commerce_deliveries SET status=next_state,consignment=coalesce(b->>'consignment',consignment),tracking_url=coalesce(b->>'tracking_url',tracking_url),handover_receipt=coalesce(b->>'receipt',handover_receipt),revision=revision+1 WHERE id=cid;
 ELSIF act='cod-receipt' THEN
  IF role_name NOT IN ('owner','admin') THEN RAISE EXCEPTION 'COD manager required' USING ERRCODE='42501';END IF;
  UPDATE commerce_deliveries SET cod_received_minor=(b->>'amount_minor')::bigint,cod_receipt=b->>'receipt',revision=revision+1 WHERE id=cid AND workspace_id=w AND environment=e AND revision=(b->>'revision')::bigint AND status IN ('delivered','returned') AND (b->>'amount_minor')::bigint<=cod_minor AND length(btrim(coalesce(b->>'receipt',''))) BETWEEN 3 AND 500;
  IF NOT FOUND THEN RAISE EXCEPTION 'COD receipt unavailable or stale' USING ERRCODE='40001';END IF;
 ELSIF act='return-request' THEN
  SELECT * INTO l FROM commerce_lines WHERE id=(b->>'line_id')::uuid AND workspace_id=w AND environment=e;
  SELECT * INTO o FROM commerce_orders WHERE id=l.order_id;
  qty:=(b->>'quantity')::bigint;
  IF l.id IS NULL OR o.status NOT IN ('shipped','delivered','returned') OR qty IS NULL OR qty<1 OR qty+coalesce((SELECT sum(quantity) FROM commerce_returns WHERE line_id=l.id AND status<>'rejected'),0)>l.quantity OR length(btrim(coalesce(b->>'reason',''))) NOT BETWEEN 1 AND 1000 THEN RAISE EXCEPTION 'Return quantity/reason invalid' USING ERRCODE='22023';END IF;
  cid:=k;INSERT INTO commerce_returns(id,workspace_id,environment,order_id,line_id,quantity,reason) VALUES(cid,w,e,o.id,l.id,qty,b->>'reason');
 ELSIF act='return-state' THEN
  SELECT * INTO r FROM commerce_returns WHERE id=cid AND workspace_id=w AND environment=e FOR UPDATE;
  IF r.id IS NULL THEN RAISE EXCEPTION 'Return unavailable' USING ERRCODE='42501';END IF;
  IF r.revision IS DISTINCT FROM (b->>'revision')::bigint THEN RAISE EXCEPTION 'Return changed; reload' USING ERRCODE='40001';END IF;
  next_state:=b->>'status';
  IF NOT ((r.status='requested' AND next_state IN ('approved','rejected')) OR (r.status='approved' AND next_state='inspected')) OR next_state IS NULL THEN RAISE EXCEPTION 'Invalid return transition' USING ERRCODE='22023';END IF;
  IF next_state='inspected' THEN
   SELECT * INTO l FROM commerce_lines WHERE id=r.line_id;SELECT * INTO o FROM commerce_orders WHERE id=r.order_id;
   IF (b->>'restocked') IS NULL OR (b->>'damaged') IS NULL OR (b->>'restocked')::bigint<0 OR (b->>'damaged')::bigint<0 OR (b->>'restocked')::bigint+(b->>'damaged')::bigint<>r.quantity OR length(btrim(coalesce(b->>'inspection',''))) NOT BETWEEN 3 AND 1000 THEN RAISE EXCEPTION 'Inspect all returned units' USING ERRCODE='22023';END IF;
   IF (b->>'restocked')::bigint>0 THEN PERFORM commerce_move(w,e,a,o.warehouse_id,l.variant_id,(b->>'restocked')::bigint,0,'Inspected return restock',o.id);END IF;
   UPDATE commerce_lines SET returned=returned+r.quantity WHERE id=r.line_id;
   UPDATE commerce_returns SET restocked=(b->>'restocked')::bigint,damaged=(b->>'damaged')::bigint,inspection=b->>'inspection' WHERE id=cid;
   IF NOT EXISTS(SELECT 1 FROM commerce_lines WHERE order_id=o.id AND returned<quantity) THEN UPDATE commerce_orders SET status='returned',revision=revision+1,updated_at=now() WHERE id=o.id;END IF;
  END IF;
  UPDATE commerce_returns SET status=next_state,revision=revision+1 WHERE id=cid;
 ELSIF act='exchange-link' THEN
  UPDATE commerce_returns SET exchange_order_id=(b->>'exchange_order_id')::uuid,revision=revision+1 WHERE id=cid AND workspace_id=w AND environment=e AND revision=(b->>'revision')::bigint AND status IN ('approved','inspected') AND exchange_order_id IS NULL;
  IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM commerce_orders x JOIN commerce_returns rt ON rt.id=cid JOIN commerce_orders old_o ON old_o.id=rt.order_id WHERE x.id=(b->>'exchange_order_id')::uuid AND x.workspace_id=w AND x.environment=e AND x.id<>old_o.id AND x.customer_id IS NOT DISTINCT FROM old_o.customer_id AND x.status IN ('draft','hold')) THEN RAISE EXCEPTION 'Separate matching-customer exchange order required' USING ERRCODE='22023';END IF;
 ELSIF act='finance-link' THEN
  SELECT * INTO o FROM commerce_orders WHERE id=cid AND workspace_id=w AND environment=e;
  IF o.id IS NULL OR b->>'kind' NOT IN ('payment','invoice','refund') OR coalesce(b->>'amount_minor','')!~'^[0-9]{1,15}$' OR (b->>'kind'='payment' AND ((b->>'amount_minor')::bigint<=0 OR (b->>'amount_minor')::bigint+coalesce((SELECT sum(amount_minor) FROM commerce_finance_links WHERE order_id=cid AND kind='payment'),0)>o.total_minor)) THEN RAISE EXCEPTION 'Invalid financial allocation' USING ERRCODE='22023';END IF;
  IF b->>'kind'='payment' AND EXISTS(SELECT 1 FROM commerce_deliveries dl WHERE dl.order_id=cid AND dl.status NOT IN ('ready','cancelled') AND dl.cod_minor>o.total_minor-(b->>'amount_minor')::bigint-coalesce((SELECT sum(amount_minor) FROM commerce_finance_links WHERE order_id=cid AND kind='payment'),0)) THEN RAISE EXCEPTION 'Reconcile courier COD before linking additional payment' USING ERRCODE='23514';END IF;
  INSERT INTO commerce_finance_links(workspace_id,environment,order_id,kind,source_id,amount_minor) VALUES(w,e,cid,b->>'kind',(b->>'source_id')::uuid,(b->>'amount_minor')::bigint);
 ELSIF act='post-map' THEN
  IF NOT EXISTS(SELECT 1 FROM inbox_connections x WHERE x.id=(b->>'connection_id')::uuid AND x.workspace_id=w AND x.environment=e AND x.provider IN ('ms','ig')) THEN RAISE EXCEPTION 'Connection unavailable' USING ERRCODE='42501';END IF;
  cid:=(b->>'product_id')::uuid;
  IF b->>'remove'='true' THEN DELETE FROM commerce_post_products WHERE workspace_id=w AND environment=e AND connection_id=(b->>'connection_id')::uuid AND post_id=b->>'post_id' AND image_key=coalesce(b->>'image_key','') AND product_id=cid;
  ELSE INSERT INTO commerce_post_products VALUES(w,e,(b->>'connection_id')::uuid,b->>'post_id',coalesce(b->>'image_key',''),cid) ON CONFLICT DO NOTHING;END IF;
 ELSIF act='import-preview' THEN
  IF role_name NOT IN ('owner','admin') OR jsonb_typeof(b->'rows') IS DISTINCT FROM 'array' OR jsonb_array_length(b->'rows') NOT BETWEEN 1 AND 500 THEN RAISE EXCEPTION 'Import manager and 1-500 rows required' USING ERRCODE='22023';END IF;
  cid:=k;
  FOR row IN SELECT value FROM jsonb_array_elements(b->'rows') LOOP
   ix:=ix+1;IF length(btrim(coalesce(row->>'name',''))) NOT BETWEEN 1 AND 200 OR length(btrim(coalesce(row->>'sku',''))) NOT BETWEEN 1 AND 80 OR coalesce(row->>'price_minor','')!~'^[0-9]{1,12}$' OR (row->>'price_minor')::bigint>100000000000 THEN RAISE EXCEPTION 'Invalid import row %',ix USING ERRCODE='22023';END IF;
   SELECT * INTO v FROM commerce_variants WHERE workspace_id=w AND environment=e AND sku=btrim(row->>'sku');SELECT * INTO p FROM commerce_products WHERE id=v.product_id;
   rows_out:=rows_out||jsonb_build_array(jsonb_build_object('name',btrim(row->>'name'),'sku',btrim(row->>'sku'),'price_minor',(row->>'price_minor')::bigint,'barcode',coalesce(row->>'barcode',''),'product_id',p.id,'variant_id',v.id,'revision',p.revision,'previous_minor',v.price_minor,'group',coalesce(row->>'group',row->>'sku'),'options',coalesce(row->'options',v.options,'{}'),'change',CASE WHEN v.id IS NULL THEN 'create' ELSE 'update' END));
  END LOOP;
  IF (SELECT count(DISTINCT x->>'sku') FROM jsonb_array_elements(rows_out) x)<>jsonb_array_length(rows_out) THEN RAISE EXCEPTION 'Duplicate import SKU' USING ERRCODE='23505';END IF;
  INSERT INTO commerce_imports(id,workspace_id,environment,actor_id,rows,fingerprint) VALUES(cid,w,e,a,rows_out,encode(sha256(convert_to(rows_out::text,'UTF8')),'hex'));res:=jsonb_build_object('id',cid,'rows',rows_out);
 ELSIF act='import-apply' THEN
  SELECT rows INTO rows_out FROM commerce_imports WHERE id=cid AND workspace_id=w AND environment=e AND actor_id=a AND status='preview' AND created_at>now()-interval '1 hour';
  IF rows_out IS NULL OR b->>'confirmed' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Review fresh import preview first' USING ERRCODE='22023';END IF;
  FOR row IN SELECT value FROM jsonb_array_elements(rows_out) LOOP
   IF row->>'product_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM commerce_products pr WHERE pr.id=(row->>'product_id')::uuid AND pr.workspace_id=w AND pr.environment=e AND pr.revision=(row->>'revision')::bigint) THEN RAISE EXCEPTION 'Import source changed; preview again' USING ERRCODE='40001';END IF;
  END LOOP;
  ix:=0;FOR row IN SELECT value FROM jsonb_array_elements(rows_out) LOOP
   ix:=ix+1;wh:=coalesce((row->>'product_id')::uuid,(groups->>(row->>'group'))::uuid);
   IF wh IS NOT NULL THEN SELECT revision INTO price FROM commerce_products WHERE id=wh;END IF;
   prior:=commerce_write(w,e,a,md5(k::text||':'||ix::text)::uuid,'product',jsonb_strip_nulls(jsonb_build_object('id',wh,'revision',CASE WHEN wh IS NULL THEN NULL ELSE price END,'name',row->'name','variants',jsonb_build_array(jsonb_strip_nulls(jsonb_build_object('id',row->'variant_id','sku',row->'sku','price_minor',row->'price_minor','barcode',row->'barcode','options',row->'options'))))));
   groups:=groups||jsonb_build_object(row->>'group',prior->>'id');
  END LOOP;UPDATE commerce_imports SET status='applied' WHERE id=cid;
 ELSE RAISE EXCEPTION 'Unknown commerce action' USING ERRCODE='22023';END IF;
 res:=coalesce(res,jsonb_build_object('id',cid,'saved',true));
 INSERT INTO commerce_events(workspace_id,environment,entity_id,actor_id,action,detail) VALUES(w,e,coalesce(cid,k),a,act,jsonb_strip_nulls(jsonb_build_object('order_id',coalesce(o.id,r.order_id,d.order_id),'status',next_state)));
 INSERT INTO commerce_commands VALUES(w,a,k,fp,res);RETURN res;
END $$;
CREATE FUNCTION commerce_capture_inbox_order() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE env text;BEGIN
 SELECT x.environment INTO env FROM inbox_threads t JOIN inbox_connections x ON x.id=t.connection_id WHERE t.id=NEW.thread_id AND t.workspace_id=NEW.workspace_id;
 IF env IS NULL OR NEW.amount_minor>100000000000 THEN RETURN NEW;END IF;
 INSERT INTO commerce_orders(id,workspace_id,environment,reference,review_required,legacy_summary,source,source_id,recipient,subtotal_minor,total_minor,created_at) VALUES(NEW.id,NEW.workspace_id,env,'INBOX-'||NEW.id::text,true,NEW.reference||E'\n'||NEW.items,'ai',NEW.id,'{}',NEW.amount_minor,NEW.amount_minor,NEW.created_at) ON CONFLICT(id) DO UPDATE SET legacy_summary=EXCLUDED.legacy_summary,revision=commerce_orders.revision+1,updated_at=now() WHERE commerce_orders.workspace_id=NEW.workspace_id AND commerce_orders.review_required;
 INSERT INTO commerce_events(workspace_id,environment,entity_id,actor_id,action,detail) VALUES(NEW.workspace_id,env,NEW.id,NULL,'legacy-order-observed',jsonb_build_object('source_order_id',NEW.id,'source_status',NEW.status));RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION commerce_capture_inbox_order() FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
CREATE TRIGGER commerce_inbox_order_capture AFTER INSERT OR UPDATE ON inbox_orders FOR EACH ROW EXECUTE FUNCTION commerce_capture_inbox_order();
-- Existing free-text orders enter one central review queue without inventing
-- structured line prices, recipient data, stock reservations or payment proof.
INSERT INTO commerce_orders(id,workspace_id,environment,reference,review_required,legacy_summary,source,source_id,recipient,subtotal_minor,total_minor,created_at)
 SELECT io.id,io.workspace_id,cn.environment,'INBOX-'||io.id::text,true,io.reference||E'\n'||io.items,'ai',io.id,'{}',io.amount_minor,io.amount_minor,io.created_at FROM inbox_orders io JOIN inbox_threads th ON th.id=io.thread_id JOIN inbox_connections cn ON cn.id=th.connection_id WHERE io.amount_minor<=100000000000;
REVOKE ALL ON FUNCTION commerce_actor(uuid,uuid,boolean),commerce_move(uuid,text,uuid,uuid,uuid,bigint,bigint,text,uuid),commerce_read(uuid,text,uuid,text,uuid,integer,text,text,text),commerce_write(uuid,text,uuid,uuid,text,jsonb) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION commerce_read(uuid,text,uuid,text,uuid,integer,text,text,text),commerce_write(uuid,text,uuid,uuid,text,jsonb) TO ekmivo_financial_runtime,ekmivo_financial_projection;
CREATE FUNCTION commerce_integration(w uuid,e text,a uuid,p text,c bytea DEFAULT NULL,enabled_value boolean DEFAULT true) RETURNS bytea LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE role_name text;result bytea;BEGIN
 role_name:=commerce_actor(w,a,true);IF e NOT IN ('live','sandbox') OR e IS NULL OR p NOT IN ('steadfast','woocommerce') OR p IS NULL THEN RAISE EXCEPTION 'Integration scope invalid' USING ERRCODE='22023';END IF;
 IF c IS NOT NULL THEN
  IF role_name NOT IN ('owner','admin') OR octet_length(c)>8000 THEN RAISE EXCEPTION 'Integration manager required' USING ERRCODE='42501';END IF;
  INSERT INTO commerce_integrations(workspace_id,environment,provider,secret_cipher,enabled) VALUES(w,e,p,c,enabled_value) ON CONFLICT(workspace_id,environment,provider) DO UPDATE SET secret_cipher=EXCLUDED.secret_cipher,enabled=EXCLUDED.enabled,updated_at=now();
  INSERT INTO commerce_events(workspace_id,environment,entity_id,actor_id,action) VALUES(w,e,w,a,'integration-saved');RETURN NULL;
 END IF;
 SELECT secret_cipher INTO result FROM commerce_integrations WHERE workspace_id=w AND environment=e AND provider=p AND enabled;
 IF result IS NULL THEN RAISE EXCEPTION 'Integration not configured' USING ERRCODE='P0002';END IF;RETURN result;
END $$;
CREATE FUNCTION commerce_api_write(w uuid,e text,key_id uuid,k uuid,b jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE a uuid;BEGIN
 SELECT created_by INTO a FROM merchant_api_keys WHERE id=key_id AND workspace_id=w AND environment=e AND revoked_at IS NULL AND expires_at>now() AND 'orders:write'=ANY(scopes);
 IF a IS NULL THEN RAISE EXCEPTION 'Order API key unavailable' USING ERRCODE='42501';END IF;RETURN commerce_write(w,e,a,k,'api-order',b);
END $$;
CREATE FUNCTION commerce_api_read(w uuid,e text,key_id uuid,cid uuid,off integer,q text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE a uuid;BEGIN
 SELECT created_by INTO a FROM merchant_api_keys WHERE id=key_id AND workspace_id=w AND environment=e AND revoked_at IS NULL AND expires_at>now() AND 'orders:read'=ANY(scopes);IF a IS NULL THEN RAISE EXCEPTION 'Order API key unavailable' USING ERRCODE='42501';END IF;RETURN commerce_read(w,e,a,'orders',cid,off,q);
END $$;
REVOKE ALL ON FUNCTION commerce_api_read(uuid,text,uuid,uuid,integer,text) FROM PUBLIC;GRANT EXECUTE ON FUNCTION commerce_api_read(uuid,text,uuid,uuid,integer,text) TO ekmivo_financial_runtime,ekmivo_financial_projection;
CREATE FUNCTION commerce_media_access(w uuid,e text,a uuid,mid uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE result jsonb;BEGIN
 PERFORM commerce_actor(w,a);SELECT jsonb_build_object('object_key',object_key,'mime',mime,'name',name) INTO result FROM commerce_media WHERE workspace_id=w AND environment=e AND id=mid;IF result IS NULL THEN RAISE EXCEPTION 'Image unavailable' USING ERRCODE='42501';END IF;RETURN result;
END $$;
REVOKE ALL ON FUNCTION commerce_integration(uuid,text,uuid,text,bytea,boolean),commerce_api_write(uuid,text,uuid,uuid,jsonb),commerce_media_access(uuid,text,uuid,uuid) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION commerce_integration(uuid,text,uuid,text,bytea,boolean),commerce_api_write(uuid,text,uuid,uuid,jsonb),commerce_media_access(uuid,text,uuid,uuid) TO ekmivo_financial_runtime,ekmivo_financial_projection;
CREATE FUNCTION commerce_notification_ack(w uuid,e text,a uuid,seq bigint) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN
 PERFORM commerce_actor(w,a);IF e NOT IN ('live','sandbox') OR e IS NULL OR seq IS NULL OR seq<0 OR seq>coalesce((SELECT max(sequence) FROM commerce_events WHERE workspace_id=w AND environment=e),0) THEN RAISE EXCEPTION 'Invalid notification cursor' USING ERRCODE='22023';END IF;
 INSERT INTO commerce_notification_reads VALUES(w,e,a,seq) ON CONFLICT(workspace_id,environment,actor_id) DO UPDATE SET last_sequence=greatest(commerce_notification_reads.last_sequence,EXCLUDED.last_sequence);RETURN true;
END $$;
REVOKE ALL ON FUNCTION commerce_notification_ack(uuid,text,uuid,bigint) FROM PUBLIC;GRANT EXECUTE ON FUNCTION commerce_notification_ack(uuid,text,uuid,bigint) TO ekmivo_financial_runtime,ekmivo_financial_projection;
ALTER TABLE merchant_api_keys DROP CONSTRAINT merchant_api_keys_scopes_check;
ALTER TABLE merchant_api_keys ADD CONSTRAINT merchant_api_keys_scopes_check CHECK(cardinality(scopes) BETWEEN 1 AND 11 AND scopes <@ ARRAY['payments:read','payments:write','customers:read','customers:write','invoices:read','invoices:write','refunds:read','refunds:write','webhooks:manage','orders:read','orders:write']::text[]);
COMMIT;
