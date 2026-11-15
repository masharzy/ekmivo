-- 0257: Services page + AI selling fixes (owner list, 2026-11-15).
--
--  * Services: commerce_write 'product' accepts kind 'product' (default) or 'service'; commerce_read 'products'
--    lists products only, new 'services' lists services (variants are plans).
--  * A chat that already placed an order cannot silently create a second one (upsert_order_draft returns
--    order_already_placed unless the customer asks for a new order: "new_order":true).
--  * search_products always includes out-of-stock items (available 0).
--  * Review reason NO_GROUNDED_SOURCE; one holding message for a job that went to review (briofold_ai_review_notice).
--  * Bengali product words also match their Banglish spelling; plan words monthly/yearly in Bengali and English.
--  * Read-only catalogue tools for the dashboard test chat (briofold_ai_test_tool).
-- Every replaced function is guarded by its production md5(prosrc); anything else stops before any change.
-- Running it twice is safe. Data: only products' stored search tokens (derived). Synonyms are inline because commerce_search_terms has
-- FORCE ROW LEVEL SECURITY and no policy, so non-superuser functions cannot read it.

DO $m$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('commerce_write','98cb3589cfa4ab483cedd5ace1215314','3990492809741b5ecb1ce0fd46d5f67a'),
    ('commerce_read','cdc53edcb8fdc91d9b6772f8f7178610','8651d58e45b51e21c962ddb7dd1bd688'),
    ('briofold_ai_order_tool','3a2cf24abdc2e3266c790cf3a2a11a7a','06538eef23266b6c5e18f45bc1396ef4'),
    ('briofold_ai_tool','c575c675421f71ab5cadf7baf873e097','71d4d9108a73921acc2f293d4c953752'),
    ('briofold_ai_channel_finish','ef674ae0159330eb202d96241bba77e5','94a4be24597ff399f6274e45e90eb606'),
    ('briofold_channel_send_valid','eae5d0f062ebf91ec50301edc5edaee3','3dec37f5e6d0bd07de60a47c3fc2741c'),
    ('inbox_next_send_v1','0b8f8c7a8f9a7c42d4083a6578d495cf','fe3e8f3347bc3c9353c918a5e2611223'),
    ('commerce_search_tokens','bbcefe650a2af4f36ae810d6c3da4820','9ef06c34d95e8953553c3d4e93068c3a')
  ) t(name,old_md5,new_md5) LOOP
    IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname='public' AND p.proname=r.name)<>1
       OR NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname='public' AND p.proname=r.name AND md5(p.prosrc) IN (r.old_md5,r.new_md5)) THEN
      RAISE EXCEPTION '0257: % is not the expected production source; nothing was changed', r.name;
    END IF;
  END LOOP;
END $m$;

-- Same pg_trgm note as 0256 (commerce_product_search SETs a pg_trgm parameter).
SELECT word_similarity('a','a');

-- Banglish spellings of one Bengali word (simple phonetic map; several forms because the inherent vowel and
-- chandrabindu are written differently by customers). Latin words return nothing.
CREATE OR REPLACE FUNCTION public.commerce_bn_latin(word text)
 RETURNS text[]
 LANGUAGE plpgsql
 IMMUTABLE PARALLEL SAFE
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  cons constant jsonb := '{"ক":"k","খ":"kh","গ":"g","ঘ":"gh","ঙ":"ng","চ":"ch","ছ":"chh","জ":"j","ঝ":"jh","ঞ":"n","ট":"t","ঠ":"th","ড":"d","ঢ":"dh","ণ":"n","ত":"t","থ":"th","দ":"d","ধ":"dh","ন":"n","প":"p","ফ":"f","ব":"b","ভ":"bh","ম":"m","য":"j","র":"r","ল":"l","শ":"sh","ষ":"sh","স":"s","হ":"h","ড়":"r","ঢ়":"rh","য়":"y","ৎ":"t"}';
  vow constant jsonb := '{"অ":"o","আ":"a","ই":"i","ঈ":"i","উ":"u","ঊ":"u","ঋ":"ri","এ":"e","ঐ":"oi","ও":"o","ঔ":"ou","া":"a","ি":"i","ী":"i","ু":"u","ূ":"u","ৃ":"ri","ে":"e","ৈ":"oi","ো":"o","ৌ":"ou","ং":"ng","ঃ":"h"}';
  w text; c text; nx text; i int; plain text:=''; first text:=''; every text:=''; nasal text:=''; seen int:=0; isc boolean; nxc boolean;
BEGIN
  -- one form for the nukta letters (base + nukta -> composed)
  w := replace(replace(replace(coalesce(word,''), chr(2479)||chr(2492), chr(2527)), chr(2465)||chr(2492), chr(2524)), chr(2466)||chr(2492), chr(2525));
  IF w !~ '[ঀ-৿]' OR length(w)>40 THEN RETURN '{}'; END IF;
  FOR i IN 1..length(w) LOOP
    c := substr(w,i,1); nx := substr(w,i+1,1);
    isc := cons ? c; nxc := cons ? nx;
    IF isc THEN
      plain := plain || (cons->>c); first := first || (cons->>c); every := every || (cons->>c); nasal := nasal || (cons->>c);
      seen := seen + 1;
      -- inherent vowel before another consonant (no hasanta or vowel sign between)
      IF nxc THEN
        every := every || 'o';
        IF seen=1 THEN first := first || 'o'; END IF;
      END IF;
    ELSIF vow ? c THEN
      plain := plain || (vow->>c); first := first || (vow->>c); every := every || (vow->>c); nasal := nasal || (vow->>c);
    ELSIF c = chr(2433) THEN
      nasal := nasal || 'n';
    ELSIF c ~ '[0-9a-z]' THEN
      plain := plain || c; first := first || c; every := every || c; nasal := nasal || c;
    END IF;
  END LOOP;
  RETURN ARRAY(SELECT DISTINCT x FROM unnest(ARRAY[plain, first, every, nasal]) x WHERE length(x)>1);
END $function$;

-- One short holding message for a channel job that went to review, so the customer is not left without an answer.
-- Not a model output: no generation, no charge. At most one per thread every six hours; never after a newer
-- customer message, outside the messaging window, or when AI is off for the thread.
CREATE OR REPLACE FUNCTION public.briofold_ai_review_notice(job uuid, lease uuid, body text)
 RETURNS boolean
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE j briofold_ai_channel_jobs%ROWTYPE; t inbox_threads%ROWTYPE; mid uuid;
BEGIN
  IF body IS NULL OR length(btrim(body)) NOT BETWEEN 1 AND 300 THEN RAISE EXCEPTION 'Invalid notice' USING ERRCODE='22023';END IF;
  SELECT * INTO j FROM briofold_ai_channel_jobs WHERE id=job FOR UPDATE;
  IF j.id IS NULL OR j.lease_id IS DISTINCT FROM lease OR j.state<>'review' OR j.message_id IS NOT NULL
     OR j.reason NOT IN ('AI_CREDITS_REQUIRED','AI_REQUEST_UNKNOWN','AI_REQUEST_REJECTED','AI_CONTEXT_TOO_LARGE','AI_RUNTIME_UNAVAILABLE','AI_INVALID_OUTPUT','AI_MEDIA_UNAVAILABLE','NO_GROUNDED_SOURCE') THEN
    RETURN false;
  END IF;
  SELECT * INTO t FROM inbox_threads WHERE id=j.thread_id FOR UPDATE;
  IF NOT t.ai_enabled OR t.ai_version IS DISTINCT FROM j.thread_ai_version OR NOT briofold_ai_channel_valid(j.id) THEN RETURN false;END IF;
  IF EXISTS(SELECT 1 FROM inbox_messages m WHERE m.thread_id=t.id AND m.sender='ai' AND m.content ? 'review_notice' AND m.created_at>now()-interval '6 hours') THEN RETURN false;END IF;
  IF EXISTS(SELECT 1 FROM briofold_ai_channel_jobs x WHERE x.thread_id=t.id AND x.created_at>j.created_at) THEN RETURN false;END IF;
  INSERT INTO inbox_messages(workspace_id,thread_id,sender,body,state,idempotency_key,content)
  VALUES(j.workspace_id,j.thread_id,'ai',btrim(body),'queued',j.id,jsonb_build_object('review_notice',true,'ai_version',j.thread_ai_version))
  ON CONFLICT DO NOTHING RETURNING id INTO mid;
  IF mid IS NULL THEN RETURN false;END IF;
  UPDATE briofold_ai_channel_jobs SET message_id=mid,updated_at=now() WHERE id=job;
  RETURN true;
END $function$;
REVOKE ALL ON FUNCTION public.briofold_ai_review_notice(uuid,uuid,text) FROM PUBLIC;

-- Read-only catalogue tools for the dashboard test chat (same results as the channel tools, live catalogue).
CREATE OR REPLACE FUNCTION public.briofold_ai_test_tool(w uuid, a uuid, tool_name text, args jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE pid uuid;
BEGIN
  PERFORM commerce_actor(w,a);
  IF jsonb_typeof(coalesce(args,'{}')) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid tool call' USING ERRCODE='22023';END IF;
  IF tool_name='selling_on' THEN
    RETURN jsonb_build_object('on',briofold_ai_selling_on(w));
  ELSIF tool_name='search_products' THEN
    RETURN jsonb_build_object('products',coalesce((SELECT jsonb_agg(briofold_ai_public_product(x)) FROM jsonb_array_elements(coalesce(
      commerce_product_search(w,'live',left(coalesce(args->>'query',''),200),jsonb_build_object('category',args->>'category','in_stock',false),5),'[]'::jsonb)) x),'[]'::jsonb));
  ELSIF tool_name='get_product' THEN
    BEGIN pid:=(args->>'product_ref')::uuid;EXCEPTION WHEN others THEN pid:=NULL;END;
    RETURN coalesce((SELECT briofold_ai_public_product(commerce_catalog_json(p.id)) FROM commerce_products p WHERE p.id=pid AND p.workspace_id=w AND p.environment='live' AND p.active),jsonb_build_object('error','not_found'));
  ELSIF tool_name IN ('check_coupon','delivery_charge') THEN
    RETURN briofold_ai_order_tool(w,'live',NULL,a,tool_name,args);
  END IF;
  RETURN jsonb_build_object('test_mode',true,'note','Test chat: nothing is created or charged. Tell the owner what would happen for a real customer.');
END $function$;
REVOKE ALL ON FUNCTION public.briofold_ai_test_tool(uuid,uuid,text,jsonb) FROM PUBLIC;

-- commerce_write: production md5(prosrc)=98cb3589cfa4ab483cedd5ace1215314, this file=3990492809741b5ecb1ce0fd46d5f67a
CREATE OR REPLACE FUNCTION public.commerce_write(w uuid, e text, a uuid, k uuid, act text, b jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE role_name text;fp text;old commerce_commands;res jsonb;cid uuid:=(b->>'id')::uuid;v commerce_variants;p commerce_products;o commerce_orders;c commerce_coupons;d commerce_deliveries;r commerce_returns;l commerce_lines;row jsonb;wh uuid;qty bigint;sub bigint:=0;disc bigint:=0;ship bigint:=0;promo bigint:=0;price bigint;next_state text;why text;ix integer:=0;rows_out jsonb:='[]';groups jsonb:='{}';prior jsonb;history jsonb:='{}';previous_customer uuid;
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
  IF b?'kind' AND coalesce(b->>'kind','') NOT IN ('product','service') THEN RAISE EXCEPTION 'Invalid product' USING ERRCODE='22023';END IF;
  IF length(btrim(coalesce(b->>'name',''))) NOT BETWEEN 1 AND 200 OR jsonb_typeof(b->'variants') IS DISTINCT FROM 'array' OR jsonb_array_length(b->'variants') NOT BETWEEN 1 AND 100 OR length(coalesce(b->>'description',''))>4000 OR length(coalesce(b->>'size_chart',''))>2000 THEN RAISE EXCEPTION 'Invalid product' USING ERRCODE='22023';END IF;
  IF b?'images' AND (jsonb_typeof(b->'images') IS DISTINCT FROM 'array' OR jsonb_array_length(b->'images')>10) THEN RAISE EXCEPTION 'Maximum ten images' USING ERRCODE='22023';END IF;
  FOR row IN SELECT value FROM jsonb_array_elements(coalesce(b->'images','[]')) LOOP
   IF NOT EXISTS(SELECT 1 FROM commerce_media m WHERE m.id=(row#>>'{}')::uuid AND m.workspace_id=w AND m.environment=e) THEN RAISE EXCEPTION 'Clean owned image required' USING ERRCODE='42501';END IF;
  END LOOP;
  IF cid IS NOT NULL THEN
   SELECT * INTO p FROM commerce_products WHERE workspace_id=w AND environment=e AND id=cid FOR UPDATE;
   IF p.id IS NULL THEN RAISE EXCEPTION 'Product unavailable' USING ERRCODE='42501';END IF;
   IF p.revision IS DISTINCT FROM (b->>'revision')::bigint THEN RAISE EXCEPTION 'Product changed; reload' USING ERRCODE='40001';END IF;
   UPDATE commerce_products SET name=btrim(b->>'name'),description=coalesce(b->>'description',description),size_chart=coalesce(b->>'size_chart',size_chart),images=CASE WHEN b?'images' THEN ARRAY(SELECT jsonb_array_elements_text(b->'images'))::uuid[] ELSE images END,active=coalesce((b->>'active')::boolean,active),kind=coalesce(b->>'kind',kind),revision=revision+1 WHERE id=cid;
  ELSE INSERT INTO commerce_products(workspace_id,environment,name,description,size_chart,images,active,kind) VALUES(w,e,btrim(b->>'name'),coalesce(b->>'description',''),coalesce(b->>'size_chart',''),ARRAY(SELECT jsonb_array_elements_text(coalesce(b->'images','[]')))::uuid[],coalesce((b->>'active')::boolean,true),coalesce(b->>'kind','product')) RETURNING id INTO cid;END IF;
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
 ELSIF act IN ('create-order','api-order','review-order','edit-order') THEN
  IF act IN ('review-order','edit-order') THEN
   SELECT * INTO o FROM commerce_orders WHERE id=cid AND workspace_id=w AND environment=e AND ((act='review-order' AND status='draft' AND review_required) OR (act='edit-order' AND status IN ('draft','hold') AND NOT review_required)) AND NOT EXISTS(SELECT 1 FROM commerce_finance_links fl WHERE fl.order_id=cid) AND NOT EXISTS(SELECT 1 FROM commerce_deliveries dl WHERE dl.order_id=cid);
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
  INSERT INTO commerce_orders(id,workspace_id,environment,reference,source,source_id,customer_id,warehouse_id,recipient,notes,subtotal_minor,discount_minor,shipping_minor,coupon_id,coupon_discount_minor,total_minor,created_by) VALUES(cid,w,e,btrim(b->>'reference'),CASE WHEN act='api-order' THEN 'api' WHEN b->>'thread_id' IS NOT NULL THEN 'ai' ELSE 'manual' END,CASE WHEN act='api-order' THEN k ELSE (b->>'thread_id')::uuid END,(b->>'customer_id')::uuid,wh,b->'recipient',coalesce(b->>'notes',''),sub,disc,ship,c.id,promo,sub-disc+ship-promo,a) ON CONFLICT(id) DO UPDATE SET reference=EXCLUDED.reference,customer_id=EXCLUDED.customer_id,warehouse_id=EXCLUDED.warehouse_id,recipient=EXCLUDED.recipient,notes=EXCLUDED.notes,subtotal_minor=EXCLUDED.subtotal_minor,discount_minor=EXCLUDED.discount_minor,shipping_minor=EXCLUDED.shipping_minor,coupon_id=EXCLUDED.coupon_id,coupon_discount_minor=EXCLUDED.coupon_discount_minor,total_minor=EXCLUDED.total_minor,revision=commerce_orders.revision+1,review_required=false,updated_at=now() WHERE act IN ('review-order','edit-order') AND commerce_orders.workspace_id=w AND commerce_orders.environment=e AND commerce_orders.status IN ('draft','hold');
  IF NOT FOUND THEN RAISE EXCEPTION 'Order key conflict' USING ERRCODE='23505';END IF;
  IF act='edit-order' THEN
   history:=jsonb_build_object('previous_total_minor',o.total_minor,'previous_coupon_id',o.coupon_id,'previous_lines',coalesce((SELECT jsonb_agg(jsonb_build_object('variant_id',cl.variant_id,'quantity',cl.quantity,'unit_minor',cl.unit_minor)) FROM commerce_lines cl WHERE cl.order_id=cid),'[]'));
   DELETE FROM commerce_lines WHERE order_id=cid;
  END IF;
  FOR row IN SELECT value FROM jsonb_array_elements(b->'lines') LOOP
   SELECT * INTO v FROM commerce_variants WHERE id=(row->>'variant_id')::uuid;SELECT * INTO p FROM commerce_products WHERE id=v.product_id;
   INSERT INTO commerce_lines(workspace_id,environment,order_id,variant_id,name,sku,options,unit_minor,quantity) VALUES(w,e,cid,v.id,p.name,v.sku,v.options,v.price_minor,(row->>'quantity')::bigint);
  END LOOP;
  SELECT customer_id INTO previous_customer FROM briofold_customer_sources WHERE workspace_id=w AND environment=e AND kind='order' AND source_id=cid;
  IF previous_customer IS DISTINCT FROM (b->>'customer_id')::uuid THEN
   IF previous_customer IS NOT NULL THEN
    INSERT INTO briofold_customer_events(workspace_id,environment,customer_id,actor_id,action,detail) VALUES(w,e,previous_customer,a,'order-source-unlinked',jsonb_build_object('order_id',cid));
    DELETE FROM briofold_customer_sources WHERE workspace_id=w AND environment=e AND kind='order' AND source_id=cid;
   END IF;
   IF b->>'customer_id' IS NOT NULL THEN
    INSERT INTO briofold_customer_sources(workspace_id,environment,customer_id,kind,source_id) VALUES(w,e,(b->>'customer_id')::uuid,'order',cid);
    INSERT INTO briofold_customer_events(workspace_id,environment,customer_id,actor_id,action,detail) VALUES(w,e,(b->>'customer_id')::uuid,a,'order-source-linked',jsonb_build_object('order_id',cid));
   END IF;
  END IF;
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
    IF NOT c.active OR c.starts_at>now() OR c.expires_at<=now() OR (cardinality(c.audience)>0 AND NOT o.customer_id=ANY(c.audience)) OR (SELECT count(*) FROM commerce_coupon_claims WHERE coupon_id=c.id AND status<>'released')>=c.usage_limit OR (WITH RECURSIVE identity_ids(id) AS(SELECT o.customer_id UNION SELECT cx.id FROM briofold_customers cx JOIN identity_ids pi ON cx.merged_into=pi.id) SELECT count(*) FROM commerce_coupon_claims WHERE coupon_id=c.id AND customer_id IN(SELECT id FROM identity_ids) AND status<>'released')>=c.per_customer_limit THEN RAISE EXCEPTION 'Coupon limit or expiry reached' USING ERRCODE='23514';END IF;
    INSERT INTO commerce_coupon_claims VALUES(c.id,cid,o.customer_id,'reserved') ON CONFLICT(order_id) DO UPDATE SET coupon_id=EXCLUDED.coupon_id,customer_id=EXCLUDED.customer_id,status='reserved';
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
  cid:=k;INSERT INTO commerce_deliveries(id,workspace_id,environment,order_id,provider,status,cod_minor) VALUES(cid,w,e,o.id,btrim(b->>'provider'),'ready',(b->>'cod_minor')::bigint) ON CONFLICT(order_id) DO UPDATE SET provider=EXCLUDED.provider,status='ready',cod_minor=EXCLUDED.cod_minor,revision=commerce_deliveries.revision+1,consignment='',tracking_code='',tracking_url='',handover_receipt='' WHERE commerce_deliveries.status='cancelled' RETURNING id INTO cid;IF cid IS NULL THEN RAISE EXCEPTION 'Existing shipment must be resolved' USING ERRCODE='23505';END IF;
 ELSIF act='delivery-state' THEN
  SELECT * INTO d FROM commerce_deliveries WHERE id=cid AND workspace_id=w AND environment=e FOR UPDATE;
  IF d.id IS NULL THEN RAISE EXCEPTION 'Delivery unavailable' USING ERRCODE='42501';END IF;
  IF d.revision IS DISTINCT FROM (b->>'revision')::bigint THEN RAISE EXCEPTION 'Delivery changed; reload' USING ERRCODE='40001';END IF;
  next_state:=b->>'status';
  IF next_state IS NULL OR NOT ((d.status='ready' AND next_state IN ('booking','booked','cancelled')) OR (d.status='booking' AND next_state IN ('booked','unknown','cancelled')) OR (d.status='unknown' AND next_state IN ('booked','cancelled')) OR (d.status='booked' AND next_state IN ('handed-over','cancelled')) OR (d.status IN ('handed-over','delivered') AND next_state='returned')) THEN RAISE EXCEPTION 'Invalid delivery transition; reconcile unknown outcomes first' USING ERRCODE='22023';END IF;
  IF next_state='booked' AND length(btrim(coalesce(b->>'consignment',''))) NOT BETWEEN 1 AND 120 THEN RAISE EXCEPTION 'Courier consignment required' USING ERRCODE='22023';END IF;
  IF next_state='handed-over' AND length(btrim(coalesce(b->>'receipt',''))) NOT BETWEEN 3 AND 500 THEN RAISE EXCEPTION 'Handover receipt required' USING ERRCODE='22023';END IF;
  IF d.status IN ('booking','unknown','booked') AND next_state='cancelled' AND (b->>'confirmed_no_booking') IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'Confirm provider has no active consignment' USING ERRCODE='22023';END IF;
  UPDATE commerce_deliveries SET status=next_state,consignment=coalesce(b->>'consignment',consignment),tracking_url=coalesce(b->>'tracking_url',tracking_url),tracking_code=coalesce(b->>'tracking_code',tracking_code),handover_receipt=coalesce(b->>'receipt',handover_receipt),revision=revision+1 WHERE id=cid;
 ELSIF act='cod-receipt' THEN
  IF role_name NOT IN ('owner','admin') THEN RAISE EXCEPTION 'COD manager required' USING ERRCODE='42501';END IF;
  UPDATE commerce_deliveries SET cod_received_minor=(b->>'amount_minor')::bigint,cod_receipt=b->>'receipt',revision=revision+1 WHERE id=cid AND workspace_id=w AND environment=e AND revision=(b->>'revision')::bigint AND status IN ('delivered','returned') AND (b->>'amount_minor')::bigint<=cod_minor AND length(btrim(coalesce(b->>'receipt',''))) BETWEEN 3 AND 500 RETURNING * INTO d;
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
  UPDATE commerce_returns SET exchange_order_id=(b->>'exchange_order_id')::uuid,revision=revision+1 WHERE id=cid AND workspace_id=w AND environment=e AND revision=(b->>'revision')::bigint AND status IN ('approved','inspected') AND exchange_order_id IS NULL RETURNING * INTO r;
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
   rows_out:=rows_out||jsonb_build_array(jsonb_build_object('name',btrim(row->>'name'),'sku',btrim(row->>'sku'),'price_minor',(row->>'price_minor')::bigint,'barcode',coalesce(row->>'barcode',''),'product_id',p.id,'variant_id',v.id,'revision',p.revision,'previous_minor',v.price_minor,'previous_name',p.name,'previous_barcode',v.barcode,'previous_options',v.options,'group',coalesce(row->>'group',row->>'sku'),'options',coalesce(row->'options',v.options,'{}'),'change',CASE WHEN v.id IS NULL THEN 'create' ELSE 'update' END));
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
 INSERT INTO commerce_events(workspace_id,environment,entity_id,actor_id,action,detail) VALUES(w,e,coalesce(cid,k),a,act,jsonb_strip_nulls(jsonb_build_object('order_id',coalesce(o.id,r.order_id,d.order_id),'status',next_state,'previous_status',coalesce(o.status,r.status,d.status)))||history);
 INSERT INTO commerce_commands VALUES(w,a,k,fp,res);RETURN res;
END $function$;

-- commerce_read: production md5(prosrc)=cdc53edcb8fdc91d9b6772f8f7178610, this file=8651d58e45b51e21c962ddb7dd1bd688
CREATE OR REPLACE FUNCTION public.commerce_read(w uuid, e text, a uuid, kind text, cid uuid DEFAULT NULL::uuid, off integer DEFAULT 0, q text DEFAULT ''::text, state_filter text DEFAULT ''::text, source_filter text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$DECLARE role_name text;items jsonb;item jsonb;BEGIN
 role_name:=commerce_actor(w,a);IF e IS NULL OR e NOT IN ('live','sandbox') OR off IS NULL OR off<0 OR off>10000 OR length(q)>100 OR length(state_filter)>40 OR source_filter NOT IN ('','manual','api','ai') THEN RAISE EXCEPTION 'Invalid commerce filter' USING ERRCODE='22023';END IF;
 IF kind='orders' THEN
  SELECT coalesce(jsonb_agg(to_jsonb(z)),'[]') INTO items FROM (SELECT o.id,o.reference,o.source,o.status,o.customer_id,o.total_minor,o.revision,o.created_at,greatest(coalesce((SELECT sum(f.amount_minor) FROM commerce_finance_links f WHERE f.order_id=o.id AND f.kind='payment'),0),o.paid_minor) linked_verified_minor FROM commerce_orders o WHERE o.workspace_id=w AND o.environment=e AND (cid IS NULL OR o.id=cid) AND (q='' OR (o.reference ILIKE '%'||q||'%' OR o.id::text=lower(q))) AND (state_filter='' OR o.status=state_filter) AND (source_filter='' OR o.source=source_filter) ORDER BY o.created_at DESC,o.id LIMIT 51 OFFSET off) z;
  IF cid IS NOT NULL THEN
   SELECT to_jsonb(o)-'workspace_id'||jsonb_build_object('coupon_code',(SELECT code FROM commerce_coupons cp WHERE cp.id=o.coupon_id),'recipient',CASE WHEN role_name IN ('owner','admin','editor') THEN o.recipient ELSE '{}'::jsonb END,'notes',CASE WHEN role_name IN ('owner','admin','editor') THEN o.notes ELSE '' END) INTO item FROM commerce_orders o WHERE o.workspace_id=w AND o.environment=e AND o.id=cid;
   IF item IS NULL THEN RAISE EXCEPTION 'Order unavailable' USING ERRCODE='42501';END IF;
   RETURN jsonb_build_object('order',item,'can_manage',role_name IN ('owner','admin','editor'),'lines',coalesce((SELECT jsonb_agg(to_jsonb(l)-'workspace_id'-'environment') FROM commerce_lines l WHERE l.order_id=cid),'[]'),'delivery',(SELECT to_jsonb(d)-'workspace_id'-'environment' FROM commerce_deliveries d WHERE d.order_id=cid),'returns',coalesce((SELECT jsonb_agg(to_jsonb(r)-'workspace_id'-'environment') FROM commerce_returns r WHERE r.order_id=cid),'[]'),'finance_links',coalesce((SELECT jsonb_agg(to_jsonb(f)-'workspace_id'-'environment') FROM commerce_finance_links f WHERE f.order_id=cid),'[]'),'events',coalesce((SELECT jsonb_agg(to_jsonb(z) ORDER BY z.sequence DESC) FROM (SELECT sequence,action,detail,created_at FROM commerce_events WHERE workspace_id=w AND environment=e AND ((entity_id=cid AND action IN ('create-order','api-order','edit-order','review-order','order-state','finance-link','legacy-order-observed')) OR detail->>'order_id'=cid::text) ORDER BY sequence DESC LIMIT 51 OFFSET off) z),'[]'));
  END IF;
 ELSIF kind='products' THEN SELECT coalesce(jsonb_agg(to_jsonb(z)),'[]') INTO items FROM (SELECT p.*,coalesce((SELECT jsonb_agg(to_jsonb(v)-'workspace_id'-'environment') FROM commerce_variants v WHERE v.product_id=p.id),'[]') variants FROM commerce_products p WHERE p.workspace_id=w AND p.environment=e AND p.kind='product' AND (q='' OR p.name ILIKE '%'||q||'%' OR EXISTS(SELECT 1 FROM commerce_variants v WHERE v.product_id=p.id AND (v.sku ILIKE '%'||q||'%' OR v.barcode=q))) ORDER BY p.created_at DESC,p.id LIMIT 51 OFFSET off) z;
 ELSIF kind='services' THEN SELECT coalesce(jsonb_agg(to_jsonb(z)),'[]') INTO items FROM (SELECT p.*,coalesce((SELECT jsonb_agg(to_jsonb(v)-'workspace_id'-'environment') FROM commerce_variants v WHERE v.product_id=p.id),'[]') variants FROM commerce_products p WHERE p.workspace_id=w AND p.environment=e AND p.kind='service' AND (q='' OR p.name ILIKE '%'||q||'%' OR EXISTS(SELECT 1 FROM commerce_variants v WHERE v.product_id=p.id AND (v.sku ILIKE '%'||q||'%' OR v.barcode=q))) ORDER BY p.created_at DESC,p.id LIMIT 51 OFFSET off) z;
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
END $function$;

-- briofold_ai_order_tool: production md5(prosrc)=3a2cf24abdc2e3266c790cf3a2a11a7a, this file=06538eef23266b6c5e18f45bc1396ef4
CREATE OR REPLACE FUNCTION public.briofold_ai_order_tool(w uuid, e text, thread uuid, actor uuid, tool_name text, args jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  s commerce_ai_settings%ROWTYPE; cust uuid; o commerce_orders%ROWTYPE; it record; vid uuid; qty bigint; sub bigint:=0; ship bigint;
  area text; cp commerce_coupons%ROWTYPE; disc bigint:=0; wh uuid; avail bigint; fails integer; mode text;
  v commerce_variants%ROWTYPE; pr commerce_products%ROWTYPE; floor_m bigint; unit bigint; offer bigint; rounds integer; qid uuid;
  coupon_state text:='none'; rec jsonb; n integer; ask_at timestamptz; existing_claim commerce_payment_claims%ROWTYPE; new_cid uuid; placed commerce_orders%ROWTYPE;
BEGIN
  SELECT * INTO s FROM commerce_ai_settings WHERE workspace_id=w AND environment=e;
  SELECT service_mode INTO mode FROM workspaces WHERE id=w;
  SELECT customer_id INTO cust FROM briofold_customer_sources WHERE workspace_id=w AND environment=e AND kind='thread' AND source_id=thread LIMIT 1;
  SELECT * INTO o FROM commerce_orders WHERE workspace_id=w AND environment=e AND source='ai' AND source_id=thread AND status='draft' AND payment_state IN('none','awaiting') ORDER BY created_at DESC LIMIT 1;

  IF tool_name='delivery_charge' THEN
    area:=CASE WHEN lower(coalesce(args->>'area',''))='dhaka' THEN 'dhaka' ELSE 'outside' END;
    RETURN jsonb_build_object('area',area,'charge_minor',CASE WHEN area='dhaka' THEN coalesce(s.delivery_dhaka_minor,7000) ELSE coalesce(s.delivery_outside_minor,13000) END);

  ELSIF tool_name='quote_price' THEN
    BEGIN vid:=(args->>'variant_ref')::uuid;offer:=nullif(args->>'offer_minor','')::bigint;EXCEPTION WHEN others THEN RETURN jsonb_build_object('error','bad_reference');END;
    SELECT * INTO v FROM commerce_variants WHERE id=vid AND workspace_id=w AND environment=e AND active;
    IF NOT FOUND THEN RETURN jsonb_build_object('error','variant_not_found');END IF;
    SELECT * INTO pr FROM commerce_products WHERE id=v.product_id AND active;
    IF NOT FOUND THEN RETURN jsonb_build_object('error','variant_not_found');END IF;
    floor_m:=v.price_minor;
    IF coalesce(s.negotiation_enabled,false) THEN floor_m:=least(v.price_minor,greatest(coalesce(pr.min_price_minor,0),(v.price_minor*(100-coalesce(s.max_discount_pct,0)))/100));END IF;
    SELECT count(*) INTO rounds FROM commerce_ai_quotes WHERE thread_id=thread AND variant_id=vid AND created_at>now()-interval '30 minutes' AND unit_minor<list_minor;
    IF offer IS NULL OR offer>=v.price_minor OR floor_m>=v.price_minor THEN unit:=v.price_minor;
    ELSE
      -- this round's counter: a quarter of the allowed discount per round, rounded, never below the floor
      unit:=v.price_minor-((v.price_minor-floor_m)*least(rounds+1,4))/4;
      unit:=CASE WHEN v.price_minor>=10000 THEN (unit/100)*100 ELSE (unit/50)*50 END;
      unit:=greatest(floor_m,unit);
      IF offer>=unit THEN unit:=offer;END IF;
    END IF;
    -- never quote more than an earlier, still valid quote in this chat
    unit:=least(unit,coalesce((SELECT min(q.unit_minor) FROM commerce_ai_quotes q WHERE q.thread_id=thread AND q.variant_id=vid AND q.expires_at>now()),unit));
    INSERT INTO commerce_ai_quotes(workspace_id,environment,thread_id,variant_id,list_minor,unit_minor,expires_at) VALUES(w,e,thread,vid,v.price_minor,unit,now()+interval '30 minutes') RETURNING id INTO qid;
    RETURN jsonb_build_object('quote_ref',qid,'sku',v.sku,'list_minor',v.price_minor,'unit_minor',unit,'offer_accepted',offer IS NOT NULL AND unit=offer,
      'negotiable',floor_m<v.price_minor,'final_offer',unit<=floor_m,'valid_minutes',30);

  ELSIF tool_name='check_coupon' THEN
    SELECT * INTO cp FROM commerce_coupons WHERE workspace_id=w AND environment=e AND code=upper(left(btrim(coalesce(args->>'code','')),40));
    IF NOT FOUND OR NOT cp.active THEN RETURN jsonb_build_object('valid',false,'reason','unknown');END IF;
    IF cp.expires_at<=now() THEN RETURN jsonb_build_object('valid',false,'reason','expired');END IF;
    IF cp.starts_at>now() THEN RETURN jsonb_build_object('valid',false,'reason','not_started');END IF;
    IF cardinality(cp.audience)>0 AND (cust IS NULL OR NOT cust=ANY(cp.audience)) THEN RETURN jsonb_build_object('valid',false,'reason','not_eligible');END IF;
    IF (SELECT count(*) FROM commerce_coupon_claims c WHERE c.coupon_id=cp.id AND c.status IN('reserved','redeemed'))>=cp.usage_limit THEN RETURN jsonb_build_object('valid',false,'reason','used_up');END IF;
    IF cust IS NOT NULL AND (SELECT count(*) FROM commerce_coupon_claims c WHERE c.coupon_id=cp.id AND c.customer_id=cust AND c.status IN('reserved','redeemed'))>=cp.per_customer_limit THEN RETURN jsonb_build_object('valid',false,'reason','customer_limit');END IF;
    RETURN jsonb_build_object('valid',true,'kind',cp.kind,'percent_off',CASE WHEN cp.kind='percent' THEN round(cp.value/100.0,2) END,'discount_minor',CASE WHEN cp.kind='fixed' THEN cp.value END,'max_discount_minor',cp.max_discount_minor,'minimum_minor',cp.minimum_minor,'note','a coupon replaces any bargained price');

  ELSIF tool_name='upsert_order_draft' THEN
    IF cust IS NULL THEN RETURN jsonb_build_object('error','no_customer');END IF;
    IF EXISTS(SELECT 1 FROM commerce_orders WHERE workspace_id=w AND environment=e AND source='ai' AND source_id=thread AND status='draft' AND payment_state='claimed') THEN
      RETURN jsonb_build_object('error','payment_under_verification');END IF;
    IF jsonb_typeof(args->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(args->'items') NOT BETWEEN 1 AND 10 THEN RETURN jsonb_build_object('error','items_required');END IF;
    IF o.id IS NULL AND coalesce(args->>'new_order','')<>'true' THEN
      SELECT * INTO placed FROM commerce_orders WHERE workspace_id=w AND environment=e AND source='ai' AND source_id=thread AND status<>'cancelled'
        AND (status<>'draft' OR payment_state NOT IN('none','awaiting')) AND created_at>now()-interval '24 hours' ORDER BY created_at DESC LIMIT 1;
      IF placed.id IS NOT NULL THEN
        RETURN jsonb_build_object('error','order_already_placed','order',briofold_ai_order_summary(placed.id),
          'note','This chat already placed this order. Do not create another one. Only if the customer clearly asks for a separate, additional order, call upsert_order_draft again with "new_order":true.');
      END IF;
    END IF;
    IF o.id IS NULL THEN
      SELECT id INTO wh FROM commerce_warehouses WHERE workspace_id=w AND environment=e ORDER BY id LIMIT 1;
      IF wh IS NULL THEN RETURN jsonb_build_object('error','no_warehouse');END IF;
      FOR n IN 1..3 LOOP
        BEGIN
          INSERT INTO commerce_orders(id,workspace_id,environment,reference,source,source_id,customer_id,warehouse_id,status,recipient,subtotal_minor,total_minor,draft_expires_at,created_by)
          VALUES(gen_random_uuid(),w,e,'AI-'||upper(substr(md5(gen_random_uuid()::text),1,10)),'ai',thread,cust,wh,'draft','{}',0,0,now()+make_interval(hours=>coalesce(s.draft_expiry_hours,24)),actor) RETURNING * INTO o;
          EXIT;
        EXCEPTION WHEN unique_violation THEN IF n=3 THEN RAISE;END IF;
        END;
      END LOOP;
    END IF;
    IF nullif(btrim(coalesce(args->>'coupon_code','')),'') IS NOT NULL THEN
      SELECT * INTO cp FROM commerce_coupons WHERE workspace_id=w AND environment=e AND code=upper(left(btrim(args->>'coupon_code'),40)) AND active AND starts_at<=now() AND expires_at>now();
      IF NOT FOUND THEN coupon_state:='invalid';
      ELSIF cardinality(cp.audience)>0 AND NOT cust=ANY(cp.audience) THEN coupon_state:='not_eligible';cp:=NULL;
      ELSIF (SELECT count(*) FROM commerce_coupon_claims c WHERE c.coupon_id=cp.id AND c.status IN('reserved','redeemed') AND c.order_id<>o.id)>=cp.usage_limit THEN coupon_state:='used_up';cp:=NULL;
      ELSIF (SELECT count(*) FROM commerce_coupon_claims c WHERE c.coupon_id=cp.id AND c.customer_id=cust AND c.status IN('reserved','redeemed') AND c.order_id<>o.id)>=cp.per_customer_limit THEN coupon_state:='customer_limit';cp:=NULL;
      ELSE coupon_state:='applied';END IF;
    END IF;
    PERFORM briofold_ai_release(o.id,'ai_draft_release');
    DELETE FROM commerce_lines WHERE order_id=o.id;
    FOR it IN SELECT (x->>'variant_ref')::uuid AS vid,sum((x->>'quantity')::bigint)::bigint AS qty,max(x->>'quote_ref') AS quote FROM jsonb_array_elements(args->'items') x GROUP BY 1 LOOP
      IF it.vid IS NULL OR it.qty IS NULL OR it.qty NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Invalid item or quantity' USING ERRCODE='22023';END IF;
      SELECT * INTO v FROM commerce_variants WHERE id=it.vid AND workspace_id=w AND environment=e AND active;
      IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM commerce_products p WHERE p.id=v.product_id AND p.active) THEN RAISE EXCEPTION 'Unknown variant' USING ERRCODE='22023';END IF;
      INSERT INTO commerce_stock(workspace_id,environment,warehouse_id,variant_id) VALUES(w,e,o.warehouse_id,it.vid) ON CONFLICT DO NOTHING;
      SELECT on_hand-reserved INTO avail FROM commerce_stock WHERE workspace_id=w AND environment=e AND warehouse_id=o.warehouse_id AND variant_id=it.vid FOR UPDATE;
      IF avail<it.qty AND NOT EXISTS(SELECT 1 FROM commerce_products sp WHERE sp.id=v.product_id AND sp.kind='service') THEN RAISE EXCEPTION 'Out of stock: % has % available',v.sku,greatest(avail,0) USING ERRCODE='P0002';END IF;
      unit:=v.price_minor;
      IF coupon_state<>'applied' AND it.quote IS NOT NULL THEN
        SELECT q.unit_minor INTO offer FROM commerce_ai_quotes q WHERE q.id=it.quote::uuid AND q.thread_id=thread AND q.variant_id=it.vid AND q.expires_at>now();
        IF FOUND THEN unit:=least(offer,v.price_minor);END IF;
      END IF;
      PERFORM commerce_move(w,e,actor,o.warehouse_id,it.vid,0,it.qty,'ai_draft_reserve',o.id);
      INSERT INTO commerce_lines(workspace_id,environment,order_id,variant_id,name,sku,options,unit_minor,quantity)
        SELECT w,e,o.id,v.id,p.name,v.sku,v.options,unit,it.qty FROM commerce_products p WHERE p.id=v.product_id;
      sub:=sub+unit*it.qty;
    END LOOP;
    area:=CASE WHEN lower(coalesce(args->>'area',''))='dhaka' THEN 'dhaka' ELSE 'outside' END;
    ship:=CASE WHEN area='dhaka' THEN coalesce(s.delivery_dhaka_minor,7000) ELSE coalesce(s.delivery_outside_minor,13000) END;
    IF NOT briofold_order_needs_delivery(o.id) THEN ship:=0;END IF;
    IF coupon_state='applied' AND cp.minimum_minor>sub THEN coupon_state:='below_minimum';END IF;
    IF coupon_state='applied' THEN
      disc:=least(CASE cp.kind WHEN 'fixed' THEN cp.value WHEN 'percent' THEN (sub::numeric*least(cp.value,10000)/10000)::bigint ELSE 0 END,coalesce(cp.max_discount_minor,sub),sub);
      IF cp.kind='shipping' THEN ship:=0;END IF;
      INSERT INTO commerce_coupon_claims(coupon_id,order_id,customer_id,status) VALUES(cp.id,o.id,cust,'reserved') ON CONFLICT(order_id) DO UPDATE SET coupon_id=EXCLUDED.coupon_id,customer_id=EXCLUDED.customer_id,status='reserved';
    ELSE
      UPDATE commerce_coupon_claims SET status='released' WHERE order_id=o.id AND status='reserved';
    END IF;
    rec:=CASE WHEN jsonb_typeof(args->'recipient')='object' THEN jsonb_strip_nulls(jsonb_build_object(
      'name',left(args->'recipient'->>'name',120),'phone',left(regexp_replace(coalesce(args->'recipient'->>'phone',''),'[^0-9+]','','g'),20),
      'address',left(args->'recipient'->>'address',300),'city',left(args->'recipient'->>'city',80))) ELSE o.recipient END;
    UPDATE commerce_orders SET subtotal_minor=sub,shipping_minor=ship,coupon_id=CASE WHEN coupon_state='applied' THEN cp.id END,coupon_discount_minor=disc,total_minor=sub+ship-disc,
      recipient=coalesce(rec,'{}'::jsonb),draft_expires_at=now()+make_interval(hours=>coalesce(s.draft_expiry_hours,24)),updated_at=now() WHERE id=o.id;
    RETURN briofold_ai_order_summary(o.id)||jsonb_build_object('area',area,'coupon',coupon_state);

  ELSIF tool_name='update_order_address' THEN
    IF o.id IS NULL THEN RETURN jsonb_build_object('error','no_draft'); END IF;
    IF o.payment_state='claimed' THEN RETURN jsonb_build_object('error','payment_under_verification'); END IF;
    IF jsonb_typeof(args->'address') IS DISTINCT FROM 'string'
       OR length(btrim(args->>'address')) NOT BETWEEN 1 AND 300
       OR (args ? 'city' AND (jsonb_typeof(args->'city') IS DISTINCT FROM 'string'
           OR length(btrim(args->>'city')) NOT BETWEEN 1 AND 80)) THEN
      RETURN jsonb_build_object('error','invalid_address');
    END IF;
    UPDATE commerce_orders
    SET recipient=coalesce(recipient,'{}'::jsonb)||jsonb_strip_nulls(jsonb_build_object(
          'address',btrim(args->>'address'),'city',nullif(btrim(args->>'city'),''))),
        updated_at=now()
    WHERE id=o.id AND workspace_id=w AND environment=e AND source_id=thread AND status='draft';
    IF NOT FOUND THEN RETURN jsonb_build_object('error','no_draft'); END IF;
    RETURN briofold_ai_order_summary(o.id)||jsonb_build_object('address_updated',true);

  ELSIF tool_name='send_order_summary' THEN
    IF o.id IS NULL THEN
      SELECT * INTO o FROM commerce_orders WHERE workspace_id=w AND environment=e AND source='ai' AND source_id=thread ORDER BY created_at DESC LIMIT 1;
      IF NOT FOUND THEN RETURN jsonb_build_object('error','no_order');END IF;
    END IF;
    RETURN briofold_ai_order_summary(o.id);

  ELSIF tool_name='ask_payment_choice' THEN
    IF o.id IS NULL THEN RETURN jsonb_build_object('error','no_draft');END IF;
    IF (o.recipient='{}'::jsonb OR coalesce(o.recipient->>'address','')='') AND briofold_order_needs_delivery(o.id) THEN RETURN jsonb_build_object('error','address_required');END IF;
    IF coalesce(o.recipient->>'phone','')='' AND NOT briofold_order_needs_delivery(o.id) THEN RETURN jsonb_build_object('error','phone_required');END IF;
    IF args->>'choice'='cod' THEN
      IF NOT coalesce(s.cod_enabled,false) THEN RETURN jsonb_build_object('error','cod_disabled');END IF;
      UPDATE commerce_orders SET payment_state='cod',status='confirmed',shipping_minor=shipping_minor+coalesce(s.cod_charge_minor,0),total_minor=total_minor+coalesce(s.cod_charge_minor,0),draft_expires_at=NULL,updated_at=now() WHERE id=o.id;
      RETURN jsonb_build_object('payment_state','cod','order',briofold_ai_order_summary(o.id));
    ELSIF args->>'choice'='mobile' THEN
      UPDATE commerce_orders SET payment_state='awaiting',updated_at=now() WHERE id=o.id;
      RETURN jsonb_build_object('payment_state','awaiting','amount_minor',o.total_minor,'reference',o.reference,'method',CASE WHEN args->>'method' IN('bkash','nagad','rocket') THEN args->>'method' END,
        'pay_to_accounts',to_jsonb(coalesce(s.receiving_account_ids,'{}'::uuid[])),'environment',e,'cod_available',coalesce(s.cod_enabled,false),
        'next','ask the customer to pay and send BOTH the sender phone number (যে নাম্বার থেকে টাকা পাঠিয়েছেন) and the TrxID');
    END IF;
    RETURN jsonb_build_object('options',jsonb_build_array('mobile')||CASE WHEN coalesce(s.cod_enabled,false) THEN jsonb_build_array('cod') ELSE '[]'::jsonb END);

  ELSIF tool_name='submit_payment_proof' THEN
    SELECT * INTO o FROM commerce_orders WHERE workspace_id=w AND environment=e AND source='ai' AND source_id=thread AND status IN('draft','hold') AND payment_state IN('awaiting','claimed') ORDER BY created_at DESC LIMIT 1;
    IF o.id IS NULL THEN RETURN jsonb_build_object('error','no_order_awaiting_payment');END IF;

    SELECT max(tc.created_at) INTO ask_at
    FROM ai_tool_calls tc
    JOIN briofold_ai_channel_jobs j ON j.id=tc.job_id
    WHERE tc.workspace_id=w AND j.thread_id=thread AND tc.tool='ask_payment_choice' AND tc.ok
      AND tc.created_at>=o.created_at;

    IF NOT EXISTS (
      SELECT 1 FROM inbox_messages m
      WHERE m.workspace_id=w AND m.thread_id=thread AND m.sender='customer'
        AND m.created_at>=coalesce(ask_at, o.created_at)
        AND (
          regexp_replace(coalesce(m.body,''), '[\s()-]+', '', 'g') ~ '(?:\+?88|\+?৮৮)?[0০][1১][3-9৩-৯][0-9০-৯]{8}'
          OR coalesce(m.body,'') ~* 'একই নাম্বার|ওই নাম্বার|সেম নাম্বার|ডেলিভারি নাম্বার|same number|this number'
        )
    ) THEN
      RETURN jsonb_build_object(
        'error','sender_number_required_from_customer',
        'accepted',false,
        'note','The customer only sent the TrxID and did NOT state which bKash/Nagad/Rocket sender phone number they paid from. Do NOT reuse the delivery phone number automatically. Ask the customer for the sender phone number they sent the money from, then call submit_payment_proof again.'
      );
    END IF;

    IF coalesce(args->>'method','') NOT IN('bkash','nagad','rocket') OR coalesce(args->>'transaction_digest','')!~'^[0-9a-f]{64}$' OR coalesce(args->>'payer_digest','')!~'^[0-9a-f]{64}$' THEN
      RETURN jsonb_build_object('error','invalid_proof');END IF;

    SELECT * INTO existing_claim FROM commerce_payment_claims WHERE workspace_id=w AND environment=e AND transaction_digest=args->>'transaction_digest' LIMIT 1;
    IF FOUND THEN
      IF existing_claim.order_id=o.id AND existing_claim.state<>'verified' THEN
        UPDATE commerce_payment_claims
        SET method=args->>'method',
            payer_digest=args->>'payer_digest',
            payer_last3=left(coalesce(args->>'payer_last3',''),3),
            claimed_amount_minor=coalesce(nullif(args->>'amount_minor','')::bigint, claimed_amount_minor),
            state=CASE WHEN mode='ai' THEN 'review' ELSE 'pending' END,
            reason=CASE WHEN mode='ai' THEN 'ai_only_never_verified' ELSE '' END,
            attempts=0,
            next_try_at=now(),
            created_at=now(),
            resolved_at=CASE WHEN mode='ai' THEN now() ELSE NULL END
        WHERE id=existing_claim.id;
        UPDATE commerce_orders SET payment_state='claimed',draft_expires_at=NULL,
          claimed_payment=jsonb_build_object('method',args->>'method','last4',left(coalesce(args->>'transaction_last4',''),4),'amount_minor',nullif(args->>'amount_minor','')::bigint),
          updated_at=now() WHERE id=o.id;
        RETURN briofold_ai_verify_claim_now(existing_claim.id);
      END IF;
      INSERT INTO commerce_payment_claims(workspace_id,environment,order_id,thread_id,method,transaction_digest,transaction_last4,payer_digest,payer_last3,state,reason,resolved_at)
      VALUES(w,e,o.id,thread,args->>'method',encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex'),left(coalesce(args->>'transaction_last4',''),4),args->>'payer_digest',left(coalesce(args->>'payer_last3',''),3),'failed','duplicate_reference',now());
      RETURN jsonb_build_object('accepted',false,'verified',false,'verification','failed','reason','already_used','note','This TrxID has already been used for another order.');
    END IF;

    SELECT count(*) INTO fails FROM commerce_payment_claims WHERE workspace_id=w AND environment=e AND thread_id=thread AND state<>'verified' AND created_at>now()-interval '24 hours';
    IF fails>=coalesce(s.wrong_trx_limit,5) THEN RETURN jsonb_build_object('error','too_many_attempts','handover',true);END IF;

    INSERT INTO commerce_payment_claims(workspace_id,environment,order_id,thread_id,method,transaction_digest,transaction_last4,payer_digest,payer_last3,claimed_amount_minor,state,reason,resolved_at)
    VALUES(w,e,o.id,thread,args->>'method',args->>'transaction_digest',left(coalesce(args->>'transaction_last4',''),4),args->>'payer_digest',left(coalesce(args->>'payer_last3',''),3),
      nullif(args->>'amount_minor','')::bigint,CASE WHEN mode='ai' THEN 'review' ELSE 'pending' END,CASE WHEN mode='ai' THEN 'ai_only_never_verified' ELSE '' END,CASE WHEN mode='ai' THEN now() END)
    RETURNING id INTO new_cid;

    UPDATE commerce_orders SET payment_state='claimed',draft_expires_at=NULL,
      claimed_payment=jsonb_build_object('method',args->>'method','last4',left(coalesce(args->>'transaction_last4',''),4),'amount_minor',nullif(args->>'amount_minor','')::bigint),
      updated_at=now() WHERE id=o.id;

    RETURN briofold_ai_verify_claim_now(new_cid);
  END IF;
  RETURN jsonb_build_object('error','tool_unavailable');
END $function$;

-- briofold_ai_tool: production md5(prosrc)=c575c675421f71ab5cadf7baf873e097, this file=71d4d9108a73921acc2f293d4c953752
CREATE OR REPLACE FUNCTION public.briofold_ai_tool(job uuid, lease uuid, step_no integer, tool_name text, args jsonb, args_redacted jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  j briofold_ai_channel_jobs%ROWTYPE;
  t inbox_threads%ROWTYPE;
  env text;
  old jsonb;
  prev text;
  res jsonb;
  pid uuid;
  nm text;
BEGIN
  IF NOT briofold_channel_work_valid(job,lease) THEN RAISE EXCEPTION 'AI job lease is not valid' USING ERRCODE='42501';END IF;
  IF jsonb_typeof(coalesce(args,'{}')) IS DISTINCT FROM 'object' OR step_no NOT BETWEEN 1 AND 6 THEN RAISE EXCEPTION 'Invalid tool call' USING ERRCODE='22023';END IF;
  SELECT tool,result INTO prev,old FROM ai_tool_calls WHERE job_id=job AND step=step_no;
  IF FOUND THEN
    IF prev<>tool_name THEN RAISE EXCEPTION 'Tool step conflict' USING ERRCODE='23505';END IF;
    RETURN old;
  END IF;
  SELECT * INTO j FROM briofold_ai_channel_jobs WHERE id=job;
  SELECT * INTO t FROM inbox_threads WHERE id=j.thread_id;
  SELECT environment INTO env FROM inbox_connections WHERE id=t.connection_id;
  BEGIN
    IF tool_name='search_products' THEN
      res:=jsonb_build_object('products',coalesce((SELECT jsonb_agg(briofold_ai_public_product(x)) FROM jsonb_array_elements(coalesce(
        commerce_product_search(j.workspace_id,env,left(coalesce(args->>'query',''),200),jsonb_build_object('category',args->>'category','in_stock',false),5),'[]'::jsonb)) x),'[]'::jsonb));
    ELSIF tool_name='get_product' THEN
      BEGIN pid:=(args->>'product_ref')::uuid;EXCEPTION WHEN others THEN pid:=NULL;END;
      res:=coalesce((SELECT briofold_ai_public_product(commerce_catalog_json(p.id)) FROM commerce_products p WHERE p.id=pid AND p.workspace_id=j.workspace_id AND p.environment=env AND p.active),jsonb_build_object('error','not_found'));
    ELSIF tool_name='get_order_status' THEN
      res:=public.briofold_ai_order_status_live(j.workspace_id,env,t.id,args->>'reference');
    ELSIF tool_name='handover_to_human' THEN
      res:=jsonb_build_object('handover',true);
    ELSIF tool_name='update_customer' THEN
      nm:=left(btrim(regexp_replace(coalesce(args->>'name',''),'[<>{}\[\]\\"`[:cntrl:]]','','g')),80);
      IF length(nm)=0 THEN res:=jsonb_build_object('error','name_required');
      ELSE
        UPDATE briofold_customers c SET name=nm,revision=c.revision+1
         WHERE c.id IN(SELECT s.customer_id FROM briofold_customer_sources s WHERE s.kind='thread' AND s.source_id=t.id) AND c.workspace_id=j.workspace_id
           AND (btrim(c.name) IN('','Customer') OR c.name=coalesce(t.customer_name,''));
        res:=jsonb_build_object('updated',FOUND);
      END IF;
    ELSE
      res:=briofold_ai_order_limit(j.workspace_id,env,tool_name,briofold_ai_order_tool(j.workspace_id,env,t.id,j.actor_id,tool_name,args));
    END IF;
  EXCEPTION
    WHEN SQLSTATE 'P0002' THEN res:=jsonb_build_object('error','out_of_stock','detail',left(SQLERRM,120));
    WHEN SQLSTATE '22023' OR SQLSTATE '22P02' OR SQLSTATE '22003' OR SQLSTATE '23514' OR SQLSTATE '23502' THEN res:=jsonb_build_object('error','invalid_request','detail',left(SQLERRM,120));
    WHEN SQLSTATE '23505' THEN res:=jsonb_build_object('error','conflict');
  END;
  INSERT INTO ai_tool_calls(workspace_id,job_id,step,tool,args_redacted,result,ok) VALUES(j.workspace_id,job,step_no,tool_name,coalesce(args_redacted,'{}'),res,NOT jsonb_exists(res,'error'));
  RETURN res;
END $function$;

-- briofold_ai_channel_finish: production md5(prosrc)=ef674ae0159330eb202d96241bba77e5, this file=94a4be24597ff399f6274e45e90eb606
CREATE OR REPLACE FUNCTION public.briofold_ai_channel_finish(job_id uuid, lease uuid, body text, safe_reason text DEFAULT ''::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$DECLARE j briofold_ai_channel_jobs;t inbox_threads;output_id uuid;h text;BEGIN
 SELECT * INTO j FROM briofold_ai_channel_jobs WHERE id=job_id;
 IF j.id IS NULL OR j.lease_id IS DISTINCT FROM lease THEN RAISE EXCEPTION 'AI job lease conflict' USING ERRCODE='23505';END IF;
 PERFORM 1 FROM inbox_threads WHERE id=j.thread_id FOR UPDATE;SELECT * INTO j FROM briofold_ai_channel_jobs WHERE id=job_id FOR UPDATE;
 IF j.state='completed' THEN
  IF j.output_hash IS DISTINCT FROM encode(digest(body,'sha256'),'hex') THEN RAISE EXCEPTION 'AI job output conflict' USING ERRCODE='23505';END IF;RETURN jsonb_build_object('id',j.message_id,'queued',true);
 END IF;
 IF j.state<>'running' THEN RETURN jsonb_build_object('queued',false,'state',j.state);END IF;
 IF safe_reason<>'' THEN
  IF safe_reason NOT IN ('AI_CREDITS_REQUIRED','AI_REQUEST_UNKNOWN','AI_REQUEST_REJECTED','AI_CONTEXT_TOO_LARGE','AI_RUNTIME_UNAVAILABLE','AI_INVALID_OUTPUT','AI_MEDIA_UNAVAILABLE','NO_GROUNDED_SOURCE') THEN RAISE EXCEPTION 'Invalid review reason' USING ERRCODE='22023';END IF;
  UPDATE briofold_ai_channel_jobs SET state='review',reason=safe_reason,updated_at=now() WHERE id=job_id;RETURN jsonb_build_object('queued',false,'state','review');
 END IF;
 IF body IS NULL OR length(trim(body)) NOT BETWEEN 1 AND 8000 THEN RAISE EXCEPTION 'Invalid AI output' USING ERRCODE='22023';END IF;
 IF NOT EXISTS(SELECT 1 FROM briofold_ai_executions WHERE workspace_id=j.workspace_id AND request_key=j.request_key AND actor_id=j.actor_id AND thread_id=j.thread_id AND state='completed') THEN RAISE EXCEPTION 'Metered completed generation required' USING ERRCODE='42501';END IF;
 SELECT * INTO t FROM inbox_threads WHERE id=j.thread_id;
 IF NOT briofold_ai_channel_valid(j.id) OR NOT t.ai_enabled OR t.ai_version IS DISTINCT FROM j.thread_ai_version OR (t.last_customer_at<=now()-interval '24 hours' AND NOT inbox_window_free(t.connection_id)) OR EXISTS(SELECT 1 FROM inbox_messages WHERE thread_id=t.id AND sender='customer' AND sequence>(SELECT sequence FROM inbox_messages WHERE id=j.inbound_id)) OR NOT EXISTS(SELECT 1 FROM briofold_ai_studio_drafts WHERE workspace_id=j.workspace_id AND published_id=j.publication_id) OR EXISTS(SELECT 1 FROM jsonb_array_elements(j.context->'knowledge') doc WHERE NOT EXISTS(SELECT 1 FROM briofold_ai_knowledge_sources s WHERE s.workspace_id=j.workspace_id AND s.id=(doc->>'source_id')::uuid AND s.active)) OR EXISTS(SELECT 1 FROM jsonb_array_elements(j.context->'products') fact(value) WHERE NOT EXISTS(SELECT 1 FROM inbox_products p WHERE p.workspace_id=j.workspace_id AND p.id=(fact.value->>'id')::uuid AND p.active AND p.environment='live' AND p.name=fact.value->>'name' AND p.price_minor=(fact.value->>'price_minor')::bigint AND p.currency=fact.value->>'currency' AND p.sizes=fact.value->>'sizes')) THEN
  UPDATE briofold_ai_channel_jobs SET state='review',reason='CONVERSATION_OR_SOURCE_CHANGED',updated_at=now() WHERE id=job_id;RETURN jsonb_build_object('queued',false,'state','review');
 END IF;
 h:=encode(digest(body,'sha256'),'hex');
 INSERT INTO inbox_messages(workspace_id,thread_id,sender,body,state,idempotency_key,content) VALUES(j.workspace_id,j.thread_id,'ai',body,'queued',j.id,jsonb_build_object('publication_id',j.publication_id,'ai_version',j.thread_ai_version,'request_key',j.request_key)) RETURNING id INTO output_id;
 UPDATE briofold_ai_channel_jobs SET state='completed',message_id=output_id,output_hash=h,updated_at=now() WHERE id=job_id;RETURN jsonb_build_object('id',output_id,'queued',true);
END $function$;

-- briofold_channel_send_valid: production md5(prosrc)=eae5d0f062ebf91ec50301edc5edaee3, this file=3dec37f5e6d0bd07de60a47c3fc2741c
CREATE OR REPLACE FUNCTION public.briofold_channel_send_valid(i uuid)
 RETURNS boolean
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$DECLARE msg inbox_messages;conn uuid;BEGIN
 SELECT * INTO msg FROM inbox_messages WHERE id=i;
 IF msg.sender='ai' THEN RETURN EXISTS(SELECT 1 FROM briofold_ai_channel_jobs j WHERE j.message_id=i AND (j.state='completed' OR (j.state='review' AND msg.content ? 'review_notice')) AND briofold_ai_channel_valid(j.id));END IF;
 IF msg.sender<>'seller' THEN RETURN false;END IF;
 SELECT connection_id INTO conn FROM inbox_threads WHERE id=msg.thread_id;
 IF msg.requested_by IS NULL THEN RETURN NOT EXISTS(SELECT 1 FROM briofold_member_channel_scopes WHERE workspace_id=msg.workspace_id AND connection_id=conn AND (deny_read OR deny_send));END IF;
 BEGIN PERFORM briofold_inbox_actor(msg.workspace_id,msg.requested_by,'inbox:send');EXCEPTION WHEN insufficient_privilege THEN RETURN false;END;
 RETURN briofold_channel_allowed(msg.workspace_id,msg.requested_by,conn,'send');
END $function$;

-- inbox_next_send_v1: production md5(prosrc)=0b8f8c7a8f9a7c42d4083a6578d495cf, this file=fe3e8f3347bc3c9353c918a5e2611223
CREATE OR REPLACE FUNCTION public.inbox_next_send_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$DECLARE m inbox_messages;result jsonb;BEGIN
 PERFORM briofold_inbox_due_returns();
 UPDATE inbox_messages x SET state='failed',error_code='CHANNEL_ACCESS_REVOKED' WHERE x.state='queued' AND x.sender='seller' AND NOT briofold_channel_send_valid(x.id);
 UPDATE inbox_messages x SET state='failed',error_code='AI_CONTEXT_CHANGED' WHERE x.sender='ai' AND x.state='queued' AND NOT EXISTS(SELECT 1 FROM briofold_ai_channel_jobs j WHERE j.message_id=x.id AND (j.state='completed' OR (j.state='review' AND x.content ? 'review_notice')) AND briofold_ai_channel_valid(j.id));
 UPDATE inbox_messages x SET state='failed',error_code='BROADCAST_APPROVAL_INVALID' WHERE x.state='queued' AND EXISTS(SELECT 1 FROM briofold_broadcast_recipients r WHERE r.id=x.batch_id) AND NOT briofold_broadcast_valid(x.batch_id);
 UPDATE inbox_messages SET state='uncertain',error_code='WORKER_OUTCOME_UNKNOWN' WHERE state='sending' AND attempt_at<now()-interval '1 minute';
 UPDATE inbox_messages x SET state='failed',error_code='HUMAN_TAKEOVER' FROM inbox_threads t WHERE x.thread_id=t.id AND x.state='queued' AND x.sender='ai' AND (NOT t.ai_enabled OR EXISTS(SELECT 1 FROM briofold_inbox_work z WHERE z.thread_id=t.id AND (z.disputed OR z.status='resolved')) OR EXISTS(SELECT 1 FROM briofold_inbox_tickets q WHERE q.thread_id=t.id AND q.category IN ('complaint','refund','return') AND q.status<>'resolved'));
 UPDATE inbox_messages x SET state='failed',error_code='WINDOW_CLOSED' FROM inbox_threads t WHERE x.thread_id=t.id AND x.state='queued' AND (t.last_customer_at<=now()-interval '24 hours' AND NOT inbox_window_free(t.connection_id));
 SELECT x.* INTO m FROM inbox_messages x JOIN inbox_threads t ON t.id=x.thread_id JOIN inbox_connections c ON c.id=t.connection_id AND c.enabled JOIN workspace_product_access p ON p.workspace_id=x.workspace_id AND p.product='ai' AND p.enabled WHERE x.state='queued' AND briofold_channel_send_valid(x.id) AND (NOT EXISTS(SELECT 1 FROM briofold_broadcast_recipients r WHERE r.id=x.batch_id) OR (briofold_broadcast_valid(x.batch_id) AND briofold_broadcast_due(x.batch_id))) AND (x.batch_id IS NULL OR NOT EXISTS(SELECT 1 FROM inbox_messages earlier WHERE earlier.thread_id=x.thread_id AND earlier.batch_id=x.batch_id AND earlier.sequence<x.sequence AND earlier.state NOT IN ('sent','delivered','seen'))) AND (x.sender<>'ai' OR (t.ai_enabled AND EXISTS(SELECT 1 FROM briofold_ai_channel_jobs j WHERE j.message_id=x.id AND j.state='completed' AND briofold_ai_channel_valid(j.id)))) AND (t.last_customer_at>now()-interval '24 hours' OR inbox_window_free(t.connection_id)) ORDER BY x.sequence FOR UPDATE OF t,x SKIP LOCKED LIMIT 1;
 IF m.id IS NULL THEN RETURN NULL;END IF;
 UPDATE inbox_messages SET state='sending',attempt_at=now(),attempts=attempts+1 WHERE id=m.id;
 SELECT jsonb_build_object('channel_guard',true,'broadcast',EXISTS(SELECT 1 FROM briofold_broadcast_recipients WHERE id=m.batch_id),'id',m.id,'workspace_id',m.workspace_id,'text',m.body,'channel',c.provider,'account',c.external_id,'recipient',t.external_id,'credential',encode(c.credential_cipher,'base64')) INTO result FROM inbox_threads t JOIN inbox_connections c ON c.id=t.connection_id WHERE t.id=m.thread_id;RETURN result;
END $function$;

-- commerce_search_tokens: production md5(prosrc)=bbcefe650a2af4f36ae810d6c3da4820, this file=9ef06c34d95e8953553c3d4e93068c3a
CREATE OR REPLACE FUNCTION public.commerce_search_tokens(t text)
 RETURNS text[]
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
 SELECT coalesce(array_agg(DISTINCT x),'{}') FROM (
  SELECT w AS x FROM unnest(string_to_array(commerce_search_norm(t),' ')) w WHERE length(w)>0
  UNION SELECT s.canonical FROM unnest(string_to_array(commerce_search_norm(t),' ')) w JOIN commerce_search_terms s ON s.term=w
  UNION SELECT l FROM unnest(string_to_array(commerce_search_norm(t),' ')) w, unnest(commerce_bn_latin(w)) l WHERE length(l)>1
  UNION SELECT m.canonical FROM unnest(string_to_array(commerce_search_norm(t),' ')) w JOIN (VALUES ('পাঞ্জাবি','panjabi'),('পাঞ্জাবী','panjabi'),('punjabi','panjabi'),('panjabi','panjabi'),('punjabee','panjabi'),('শাড়ি','saree'),('শাড়ী','saree'),('sari','saree'),('saree','saree'),('টিশার্ট','tshirt'),('tshirt','tshirt'),('tee','tshirt'),('জুতা','shoe'),('জুতো','shoe'),('shoe','shoe'),('shoes','shoe'),('ব্যাগ','bag'),('bag','bag'),('bags','bag'),('লাল','red'),('red','red'),('নীল','blue'),('blue','blue'),('কালো','black'),('black','black'),('সাদা','white'),('white','white'),('সবুজ','green'),('green','green'),('হলুদ','yellow'),('yellow','yellow'),('গোলাপি','pink'),('গোলাপী','pink'),('pink','pink'),('বাদামি','brown'),('brown','brown'),('ধূসর','grey'),('grey','grey'),('gray','grey'),('small','s'),('medium','m'),('large','l'),('xl','xl'),('xxl','xxl'),('মাসিক','monthly'),('monthly','monthly'),('mashik','monthly'),('masik','monthly'),('month','monthly'),('মাস','monthly'),('বার্ষিক','yearly'),('বাৎসরিক','yearly'),('yearly','yearly'),('annual','yearly'),('year','yearly'),('barshik','yearly'),('bochor','yearly'),('বছর','yearly'),('সাপ্তাহিক','weekly'),('weekly','weekly'),('week','weekly'),('potato','alu'),('aloo','alu'),('alu','alu'),('onion','peyaj'),('piyaj','peyaj'),('peyaj','peyaj'),('pyaj','peyaj'),('payaj','peyaj')) m(term,canonical) ON m.term=w
 ) z
$function$;

-- New functions: the same callers as briofold_ai_tool (the AI worker roles), whatever they are named here.
DO $g$
DECLARE r record; f text;
BEGIN
  FOREACH f IN ARRAY ARRAY['public.briofold_ai_review_notice(uuid,uuid,text)','public.briofold_ai_test_tool(uuid,uuid,text,jsonb)'] LOOP
    FOR r IN SELECT DISTINCT (aclexplode(p.proacl)).grantee AS g FROM pg_proc p
             WHERE p.oid='public.briofold_ai_tool(uuid,uuid,integer,text,jsonb,jsonb)'::regprocedure LOOP
      IF r.g<>0 AND r.g<>(SELECT proowner FROM pg_proc WHERE oid=f::regprocedure) AND EXISTS(SELECT 1 FROM pg_roles WHERE oid=r.g) THEN
        EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO %I', f, (SELECT rolname FROM pg_roles WHERE oid=r.g));
      END IF;
    END LOOP;
  END LOOP;
END $g$;

-- Recompute stored search tokens so existing products get their Banglish forms (derived search data only).
DO $r$
DECLARE p uuid;
BEGIN
  FOR p IN SELECT id FROM commerce_products LOOP PERFORM commerce_product_refresh_search(p); END LOOP;
END $r$;
