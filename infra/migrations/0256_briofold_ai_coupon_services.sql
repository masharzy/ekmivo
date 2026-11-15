-- 0256: AI commerce money and services fixes (AI Lab findings, 2026-11-15).
--
-- 1. Percent coupons. commerce_coupons.value for kind 'percent' is in basis points (1000 = 10%; dashboard form and
--    commerce_write use value/10000). briofold_ai_order_tool used sub*least(value,100)/100, so a 10% coupon took
--    100% off an AI order. Now it uses the same basis-point rule. check_coupon returns percent_off instead of the raw value.
-- 2. Services (commerce_products.kind='service') have no stock, delivery or address (ai-commerce-v2-plan section 4).
--    Before: search_products hid them (in_stock filter) and upsert_order_draft refused them (out of stock).
--    Now: search returns them with kind and available=null; stock moves skip them; a service-only order has no
--    delivery charge and needs a phone number instead of an address. Products are unchanged. No dashboard path
--    writes kind='service' yet, so on production this part changes nothing until services exist.
--
-- Every function below is replaced only if its current source is the expected production source (md5 of prosrc)
-- or already this file's source; anything else stops the migration before any change. Running it twice is safe.

DO $m$
DECLARE r record;
BEGIN
  FOR r IN SELECT * FROM (VALUES
    ('commerce_move','4b8ee58a6101db02705947fc0e43451c','a27d11591ed5edda812ab8d9ee8588dc'),
    ('commerce_product_search','8a76db450299b069a91b90af03729f7a','35c196e6a2a22447dc5b5fce93dff38f'),
    ('commerce_catalog_json','787bd4c40c696b84a941006868a2035f','a6cc1b8aed6437928234aecbb8cae3c9'),
    ('briofold_ai_public_product','486b64d9f0fa4225661e3931affe7a7e','b24eea4fc836e4460535b8bf1ccbce4f'),
    ('briofold_ai_order_tool','18030fb0a65bcc9966556be9cd4fd977','3a2cf24abdc2e3266c790cf3a2a11a7a'),
    ('briofold_ai_payment_method','d2e16ae967c8a00b3c78a88c4ec169fc','781a96a77effc5220f28355bdb360f77'),
    ('briofold_ai_payment_link_prepare','d58639bc782ed856bbbb0066358d8c57','759f124b69f4df9ae3ea99db3140a368')
  ) t(name,old_md5,new_md5) LOOP
    IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname='public' AND p.proname=r.name)<>1
       OR NOT EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname='public' AND p.proname=r.name AND md5(p.prosrc) IN (r.old_md5,r.new_md5)) THEN
      RAISE EXCEPTION '0256: % is not the expected production source; nothing was changed', r.name;
    END IF;
  END LOOP;
END $m$;

CREATE OR REPLACE FUNCTION public.briofold_order_needs_delivery(oid uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 -- An order needs delivery unless every line is a service. An order without lines keeps the earlier rule.
 SELECT NOT EXISTS(SELECT 1 FROM commerce_lines l WHERE l.order_id=oid)
     OR EXISTS(SELECT 1 FROM commerce_lines l JOIN commerce_variants cv ON cv.id=l.variant_id JOIN commerce_products cp ON cp.id=cv.product_id
               WHERE l.order_id=oid AND cp.kind<>'service')
$function$;
REVOKE ALL ON FUNCTION public.briofold_order_needs_delivery(uuid) FROM PUBLIC;

-- commerce_move: production md5(prosrc)=4b8ee58a6101db02705947fc0e43451c, this file=a27d11591ed5edda812ab8d9ee8588dc
CREATE OR REPLACE FUNCTION public.commerce_move(w uuid, e text, a uuid, wh uuid, v uuid, dh bigint, dr bigint, why text, oid uuid DEFAULT NULL::uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$BEGIN
 IF EXISTS(SELECT 1 FROM commerce_variants cv JOIN commerce_products cp ON cp.id=cv.product_id WHERE cv.id=v AND cp.kind='service') THEN RETURN;END IF;
 INSERT INTO commerce_stock(workspace_id,environment,warehouse_id,variant_id) VALUES(w,e,wh,v) ON CONFLICT DO NOTHING;
 UPDATE commerce_stock SET on_hand=on_hand+dh,reserved=reserved+dr WHERE workspace_id=w AND environment=e AND warehouse_id=wh AND variant_id=v;
 INSERT INTO commerce_stock_moves(workspace_id,environment,warehouse_id,variant_id,on_hand_delta,reserved_delta,reason,order_id,actor_id) VALUES(w,e,wh,v,dh,dr,why,oid,a);
END $function$;

-- commerce_product_search: production md5(prosrc)=8a76db450299b069a91b90af03729f7a, this file=35c196e6a2a22447dc5b5fce93dff38f
CREATE OR REPLACE FUNCTION public.commerce_product_search(w uuid, e text, q text, filters jsonb DEFAULT '{}'::jsonb, lim integer DEFAULT 10)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
 SET "pg_trgm.word_similarity_threshold" TO '0.45'
AS $function$
DECLARE qn text;words text[];alt_sets jsonb;a1 text[];a2 text[];a3 text[];a4 text[];a5 text[];a6 text[];a7 text[];a8 text[];a9 text[];a10 text[];a11 text[];a12 text[];need integer;cat text;lo bigint;hi bigint;stock_only boolean;n integer;ids uuid[];result jsonb;BEGIN
 IF e IS NULL OR e NOT IN ('live','sandbox') OR w IS NULL OR length(coalesce(q,''))>200 OR jsonb_typeof(coalesce(filters,'{}')) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid product search' USING ERRCODE='22023';END IF;
 n:=least(greatest(coalesce(lim,10),1),50);
 qn:=commerce_search_norm(q);words:=string_to_array(qn,' ');need:=coalesce(array_length(words,1),0);
 IF need>12 THEN RAISE EXCEPTION 'Invalid product search' USING ERRCODE='22023';END IF;
 cat:=nullif(btrim(filters->>'category'),'');
 lo:=CASE WHEN coalesce(filters->>'min_price_minor','')~'^[0-9]{1,12}$' THEN (filters->>'min_price_minor')::bigint END;
 hi:=CASE WHEN coalesce(filters->>'max_price_minor','')~'^[0-9]{1,12}$' THEN (filters->>'max_price_minor')::bigint END;
 stock_only:=coalesce((filters->>'in_stock')::boolean,false);
 SELECT coalesce(jsonb_agg(to_jsonb(commerce_search_tokens(wd))),'[]') INTO alt_sets FROM unnest(words) wd; a1:=ARRAY(SELECT jsonb_array_elements_text(alt_sets->0)); a2:=ARRAY(SELECT jsonb_array_elements_text(alt_sets->1)); a3:=ARRAY(SELECT jsonb_array_elements_text(alt_sets->2)); a4:=ARRAY(SELECT jsonb_array_elements_text(alt_sets->3)); a5:=ARRAY(SELECT jsonb_array_elements_text(alt_sets->4)); a6:=ARRAY(SELECT jsonb_array_elements_text(alt_sets->5)); a7:=ARRAY(SELECT jsonb_array_elements_text(alt_sets->6)); a8:=ARRAY(SELECT jsonb_array_elements_text(alt_sets->7)); a9:=ARRAY(SELECT jsonb_array_elements_text(alt_sets->8)); a10:=ARRAY(SELECT jsonb_array_elements_text(alt_sets->9)); a11:=ARRAY(SELECT jsonb_array_elements_text(alt_sets->10)); a12:=ARRAY(SELECT jsonb_array_elements_text(alt_sets->11));
 -- 1) products that contain every word
 SELECT coalesce(array_agg(z.id),'{}') INTO ids FROM (
  SELECT p.id FROM commerce_products p
  WHERE p.workspace_id=w AND p.environment=e AND p.active AND (cat IS NULL OR lower(p.category)=lower(cat))
    AND (need=0 OR (p.search_tokens && a1 AND (need<2 OR p.search_tokens && a2) AND (need<3 OR p.search_tokens && a3) AND (need<4 OR p.search_tokens && a4) AND (need<5 OR p.search_tokens && a5) AND (need<6 OR p.search_tokens && a6) AND (need<7 OR p.search_tokens && a7) AND (need<8 OR p.search_tokens && a8) AND (need<9 OR p.search_tokens && a9) AND (need<10 OR p.search_tokens && a10) AND (need<11 OR p.search_tokens && a11) AND (need<12 OR p.search_tokens && a12)))
    AND EXISTS(SELECT 1 FROM commerce_variants v WHERE v.product_id=p.id AND v.active AND (lo IS NULL OR v.price_minor>=lo) AND (hi IS NULL OR v.price_minor<=hi)
               AND (NOT stock_only OR p.kind='service' OR coalesce((SELECT sum(s.on_hand-s.reserved) FROM commerce_stock s WHERE s.variant_id=v.id),0)>0))
  ORDER BY CASE WHEN need=0 THEN 0 ELSE -word_similarity(qn,p.name) END,p.name,p.id LIMIT n) z;
 -- 2) nothing matched completely: close spellings. Every word must still be close to some word of the product.
 IF cardinality(ids)=0 AND need>0 THEN
  SELECT coalesce(array_agg(z.id ORDER BY z.rank DESC,z.name,z.id),'{}') INTO ids FROM (
   SELECT c.id,c.name,c.rank FROM (
    SELECT p.id,p.name,p.search_tokens,word_similarity(qn,p.search_text) rank FROM commerce_products p
    WHERE p.workspace_id=w AND p.environment=e AND p.active AND (cat IS NULL OR lower(p.category)=lower(cat)) AND qn <% p.search_text
      AND EXISTS(SELECT 1 FROM commerce_variants v WHERE v.product_id=p.id AND v.active AND (lo IS NULL OR v.price_minor>=lo) AND (hi IS NULL OR v.price_minor<=hi)
                 AND (NOT stock_only OR p.kind='service' OR coalesce((SELECT sum(s.on_hand-s.reserved) FROM commerce_stock s WHERE s.variant_id=v.id),0)>0))
    ORDER BY rank DESC,p.name,p.id LIMIT 200) c
   WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(alt_sets) a WHERE NOT EXISTS(
           SELECT 1 FROM unnest(c.search_tokens) t, jsonb_array_elements_text(a) alt WHERE t=alt OR (length(alt)>=4 AND similarity(t,alt)>=0.5)))
   ORDER BY c.rank DESC,c.name,c.id LIMIT n) z;
 END IF;
 -- 3) shape only those products, choosing the variants that fit what the customer said
 WITH picked AS (SELECT p.id,p.name,p.category,p.kind,p.images[1] first_image,u.ord,commerce_search_tokens(concat_ws(' ',p.name,p.category,array_to_string(p.tags,' '),array_to_string(p.search_aliases,' '),left(p.description,500))) base_tokens
                 FROM unnest(ids) WITH ORDINALITY u(id,ord) JOIN commerce_products p ON p.id=u.id),
 scored AS (
  SELECT k.id pid,k.kind,v.id,v.sku,v.options,v.price_minor,CASE WHEN k.kind='service' THEN NULL ELSE coalesce((SELECT sum(s.on_hand-s.reserved) FROM commerce_stock s WHERE s.variant_id=v.id),0) END available,
         (SELECT count(*) FROM jsonb_array_elements(alt_sets) a WHERE (k.base_tokens||commerce_search_tokens(concat_ws(' ',v.sku,(SELECT string_agg(o.value,' ') FROM jsonb_each_text(v.options) o)))) && ARRAY(SELECT jsonb_array_elements_text(a))) fit
  FROM picked k JOIN commerce_variants v ON v.product_id=k.id AND v.active
  WHERE (lo IS NULL OR v.price_minor>=lo) AND (hi IS NULL OR v.price_minor<=hi)
 ), best AS (
  SELECT sc.* FROM scored sc WHERE (NOT stock_only OR sc.kind='service' OR sc.available>0) AND sc.fit=(SELECT max(x.fit) FROM scored x WHERE x.pid=sc.pid AND (NOT stock_only OR x.kind='service' OR x.available>0))
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object('product_id',k.id,'name',k.name,'kind',k.kind,'category',k.category,'first_image',k.first_image,
          'variants',(SELECT jsonb_agg(jsonb_build_object('id',b.id,'sku',b.sku,'options',b.options,'price_minor',b.price_minor,'available',b.available,'matches_request',need>0 AND b.fit=need) ORDER BY b.sku) FROM best b WHERE b.pid=k.id))
          ORDER BY k.ord),'[]') INTO result
 FROM picked k WHERE EXISTS(SELECT 1 FROM best b WHERE b.pid=k.id);
 RETURN result;
END $function$;

-- commerce_catalog_json: production md5(prosrc)=787bd4c40c696b84a941006868a2035f, this file=a6cc1b8aed6437928234aecbb8cae3c9
CREATE OR REPLACE FUNCTION public.commerce_catalog_json(pid uuid)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 SELECT jsonb_build_object('id',p.id,'kind',p.kind,'source',p.source,'external_id',p.external_id,'name',p.name,'description',p.description,'category',p.category,'tags',to_jsonb(p.tags),
   'search_aliases',to_jsonb(p.search_aliases),'ai_notes',p.ai_notes,'min_price_minor',p.min_price_minor,'size_chart',p.size_chart,'active',p.active,'revision',p.revision,'images',to_jsonb(p.images),
   'variants',coalesce((SELECT jsonb_agg(jsonb_build_object('id',v.id,'sku',v.sku,'barcode',v.barcode,'options',v.options,'price_minor',v.price_minor,'active',v.active,
       'stock',coalesce((SELECT jsonb_agg(jsonb_build_object('warehouse_id',s.warehouse_id,'on_hand',s.on_hand,'reserved',s.reserved) ORDER BY s.warehouse_id) FROM commerce_stock s WHERE s.variant_id=v.id),'[]')) ORDER BY v.sku) FROM commerce_variants v WHERE v.product_id=p.id),'[]'))
 FROM commerce_products p WHERE p.id=pid
$function$;

-- briofold_ai_public_product: production md5(prosrc)=486b64d9f0fa4225661e3931affe7a7e, this file=b24eea4fc836e4460535b8bf1ccbce4f
CREATE OR REPLACE FUNCTION public.briofold_ai_public_product(p jsonb)
 RETURNS jsonb
 LANGUAGE sql
 IMMUTABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
 SELECT jsonb_build_object('product_ref',coalesce(p->'product_id',p->'id'),'name',p->'name','kind',coalesce(p->>'kind','product'),'category',p->'category','description',p->'description',
  'image',coalesce(p->'first_image',p->'images'->0),
  'variants',coalesce((SELECT jsonb_agg(CASE WHEN p->>'kind'='service' THEN briofold_ai_public_variant(v)||'{"available":null}'::jsonb ELSE briofold_ai_public_variant(v) END) FROM jsonb_array_elements(coalesce(p->'variants','[]'::jsonb)) v WHERE coalesce((v->>'active')::boolean,true)),'[]'::jsonb))
$function$;

-- briofold_ai_order_tool: production md5(prosrc)=18030fb0a65bcc9966556be9cd4fd977, this file=3a2cf24abdc2e3266c790cf3a2a11a7a
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
  coupon_state text:='none'; rec jsonb; n integer; ask_at timestamptz; existing_claim commerce_payment_claims%ROWTYPE; new_cid uuid;
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
    IF offer IS NULL OR offer>=v.price_minor THEN unit:=v.price_minor;
    ELSIF offer>=floor_m THEN unit:=offer;
    ELSIF floor_m>=v.price_minor THEN unit:=v.price_minor;
    ELSIF rounds=0 THEN unit:=greatest(floor_m,v.price_minor-(v.price_minor-floor_m)/2);
    ELSE unit:=floor_m;END IF;
    INSERT INTO commerce_ai_quotes(workspace_id,environment,thread_id,variant_id,list_minor,unit_minor,expires_at) VALUES(w,e,thread,vid,v.price_minor,unit,now()+interval '30 minutes') RETURNING id INTO qid;
    RETURN jsonb_build_object('quote_ref',qid,'sku',v.sku,'list_minor',v.price_minor,'unit_minor',unit,'offer_accepted',offer IS NOT NULL AND unit=offer,
      'negotiable',floor_m<v.price_minor,'valid_minutes',30);

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

-- briofold_ai_payment_method: production md5(prosrc)=d2e16ae967c8a00b3c78a88c4ec169fc, this file=781a96a77effc5220f28355bdb360f77
CREATE OR REPLACE FUNCTION public.briofold_ai_payment_method(w uuid, e text, thread uuid, choice text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE s commerce_ai_settings%ROWTYPE;o commerce_orders%ROWTYPE;charge bigint;adv bigint;r jsonb;BEGIN
 IF e NOT IN('live','sandbox') OR choice NOT IN('mobile','cod') THEN RAISE EXCEPTION 'Invalid payment choice' USING ERRCODE='22023';END IF;
 SELECT * INTO s FROM commerce_ai_settings WHERE workspace_id=w AND environment=e;
 SELECT * INTO o FROM commerce_orders WHERE workspace_id=w AND environment=e AND source='ai' AND source_id=thread
   AND status IN('draft','hold','confirmed') ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','no_open_order');END IF;
 IF o.payment_state='claimed' THEN RETURN jsonb_build_object('error','payment_being_checked','reference',o.reference);END IF;
 IF o.paid_minor>=o.total_minor AND o.total_minor>0 THEN RETURN commerce_order_payment_recalc(o.id)||jsonb_build_object('error','already_paid');END IF;
 IF choice='cod' THEN
  IF NOT coalesce(s.cod_enabled,false) THEN RETURN jsonb_build_object('error','cod_disabled');END IF;
  IF coalesce(o.recipient->>'address','')='' AND briofold_order_needs_delivery(o.id) THEN RETURN jsonb_build_object('error','address_required');END IF;
  IF o.pay_method<>'cod' THEN
   charge:=coalesce(s.cod_charge_minor,0);
   UPDATE commerce_orders SET shipping_minor=shipping_minor+charge,total_minor=total_minor+charge,cod_charge_minor=charge WHERE id=o.id RETURNING * INTO o;
  END IF;
  adv:=commerce_order_advance(o.total_minor,o.shipping_minor,s.advance_rule,s.advance_pct);
  UPDATE commerce_orders SET pay_method='cod',advance_minor=adv,
    payment_state=CASE WHEN payment_state IN('none','failed') THEN 'awaiting' ELSE payment_state END WHERE id=o.id;
 ELSE
  IF o.pay_method='cod' AND o.cod_charge_minor>0 THEN
   UPDATE commerce_orders SET shipping_minor=shipping_minor-cod_charge_minor,total_minor=total_minor-cod_charge_minor,cod_charge_minor=0 WHERE id=o.id RETURNING * INTO o;
  END IF;
  UPDATE commerce_orders SET pay_method='mobile',advance_minor=o.total_minor,
    payment_state=CASE WHEN payment_state IN('none','failed','cod') THEN 'awaiting' ELSE payment_state END WHERE id=o.id;
 END IF;
 r:=commerce_order_payment_recalc(o.id);
 RETURN r||jsonb_build_object('advance_rule',CASE WHEN choice='cod' THEN coalesce(s.advance_rule,'none') END,
  'pay_to_accounts',to_jsonb(coalesce(s.receiving_account_ids,'{}'::uuid[])),'environment',e,'cod_available',coalesce(s.cod_enabled,false));
END$function$;

-- briofold_ai_payment_link_prepare: production md5(prosrc)=d58639bc782ed856bbbb0066358d8c57, this file=759f124b69f4df9ae3ea99db3140a368
CREATE OR REPLACE FUNCTION public.briofold_ai_payment_link_prepare(job uuid, lease uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE j briofold_ai_channel_jobs; o commerce_orders; l commerce_ai_payment_links;
BEGIN
 IF NOT briofold_channel_work_valid(job,lease) THEN RAISE EXCEPTION 'Invalid job lease' USING ERRCODE='42501';END IF;
 SELECT * INTO j FROM briofold_ai_channel_jobs WHERE id=job;
 IF NOT EXISTS(SELECT 1 FROM workspaces WHERE id=j.workspace_id AND service_mode='both')
  OR NOT EXISTS(SELECT 1 FROM workspace_product_access WHERE workspace_id=j.workspace_id AND product='payments' AND enabled)
  OR NOT EXISTS(SELECT 1 FROM commerce_ai_settings WHERE workspace_id=j.workspace_id AND environment='live' AND ai_selling_enabled)
  OR NOT EXISTS(SELECT 1 FROM inbox_threads t JOIN inbox_connections n ON n.id=t.connection_id
   WHERE t.id=j.thread_id AND n.environment='live') THEN
  RETURN jsonb_build_object('error','payment_link_unavailable');
 END IF;
 PERFORM 1 FROM inbox_threads WHERE id=j.thread_id FOR UPDATE;
 SELECT * INTO l FROM commerce_ai_payment_links WHERE thread_id=j.thread_id AND state='pending'
  AND expires_at>now() ORDER BY expires_at DESC LIMIT 1;
 IF FOUND THEN
  RETURN jsonb_build_object('order_id',l.order_id,'intent_id',l.intent_id,'amount_minor',l.amount_minor,'expires_at',l.expires_at);
 END IF;
 SELECT * INTO o FROM commerce_orders WHERE workspace_id=j.workspace_id AND environment='live'
  AND source='ai' AND source_id=j.thread_id AND status='draft' AND payment_state IN ('none','awaiting')
  AND draft_expires_at>now() AND total_minor>0 ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','no_draft');END IF;
 IF coalesce(o.recipient->>'address','')='' AND briofold_order_needs_delivery(o.id) THEN RETURN jsonb_build_object('error','address_required');END IF;
 IF EXISTS(SELECT 1 FROM commerce_finance_links WHERE order_id=o.id) THEN
  RETURN jsonb_build_object('error','payment_link_unavailable');
 END IF;
 RETURN jsonb_build_object('order_id',o.id,'amount_minor',o.total_minor,'expires_at',o.draft_expires_at);
END $function$;
