-- AI Commerce Phase 1 (part 2): one safe write path for the four ways of adding products, and the public catalog API.
--
-- Builds on 0228 (kept unchanged so its recorded checksum stays valid). Additive only:
--   * API keys may carry products:read / products:write.
--   * commerce_catalog_write is replaced by a version that is safe to repeat (same Idempotency-Key returns the same
--     answer, a different body with the same key is refused), updates variants by SKU instead of failing on a duplicate
--     SKU, and can set stock per variant.
--   * Deleting a product only hides it (active=false); orders keep pointing at it.
-- Rollback: restore the 0228 version of commerce_catalog_write, drop the commerce_api_catalog_* and helper functions,
-- and restore the 11-scope key constraint (only if no key uses a products scope).

ALTER TABLE merchant_api_keys DROP CONSTRAINT IF EXISTS merchant_api_keys_scopes_check;
ALTER TABLE merchant_api_keys ADD CONSTRAINT merchant_api_keys_scopes_check CHECK(cardinality(scopes) BETWEEN 1 AND 13 AND scopes <@ ARRAY['payments:read','payments:write','customers:read','customers:write','invoices:read','invoices:write','refunds:read','refunds:write','webhooks:manage','orders:read','orders:write','products:read','products:write']::text[]);

-- A stable second key derived from the caller's key, so one request can run several commerce commands.
CREATE OR REPLACE FUNCTION commerce_derive_key(k uuid,part text) RETURNS uuid LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$ SELECT md5(k::text||':'||part)::uuid $$;

-- The whole product as the merchant (and the API) sees it. Internal: not granted to any role.
CREATE OR REPLACE FUNCTION commerce_catalog_json(pid uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('id',p.id,'source',p.source,'external_id',p.external_id,'name',p.name,'description',p.description,'category',p.category,'tags',to_jsonb(p.tags),
   'search_aliases',to_jsonb(p.search_aliases),'ai_notes',p.ai_notes,'min_price_minor',p.min_price_minor,'size_chart',p.size_chart,'active',p.active,'revision',p.revision,'images',to_jsonb(p.images),
   'variants',coalesce((SELECT jsonb_agg(jsonb_build_object('id',v.id,'sku',v.sku,'barcode',v.barcode,'options',v.options,'price_minor',v.price_minor,'active',v.active,
       'stock',coalesce((SELECT jsonb_agg(jsonb_build_object('warehouse_id',s.warehouse_id,'on_hand',s.on_hand,'reserved',s.reserved) ORDER BY s.warehouse_id) FROM commerce_stock s WHERE s.variant_id=v.id),'[]')) ORDER BY v.sku) FROM commerce_variants v WHERE v.product_id=p.id),'[]'))
 FROM commerce_products p WHERE p.id=pid
$$;

-- Set (not add) the stock of one variant in one warehouse. No warehouse given: the first warehouse by name.
CREATE OR REPLACE FUNCTION commerce_catalog_stock_set(w uuid,e text,a uuid,k uuid,vid uuid,qty bigint,wh uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE cur bigint;delta bigint;BEGIN
 IF qty IS NULL OR qty<0 OR qty>10000000 THEN RAISE EXCEPTION 'Invalid stock' USING ERRCODE='22023';END IF;
 IF NOT EXISTS(SELECT 1 FROM commerce_variants WHERE id=vid AND workspace_id=w AND environment=e) THEN RAISE EXCEPTION 'Variant unavailable' USING ERRCODE='42501';END IF;
 IF wh IS NULL THEN SELECT id INTO wh FROM commerce_warehouses WHERE workspace_id=w AND environment=e ORDER BY name,id LIMIT 1;END IF;
 IF wh IS NULL THEN RAISE EXCEPTION 'Create a warehouse before setting stock' USING ERRCODE='22023';END IF;
 SELECT on_hand INTO cur FROM commerce_stock WHERE workspace_id=w AND environment=e AND warehouse_id=wh AND variant_id=vid;
 cur:=coalesce(cur,0);delta:=qty-cur;
 IF delta=0 THEN RETURN jsonb_build_object('variant_id',vid,'warehouse_id',wh,'on_hand',cur,'changed',false);END IF;
 PERFORM commerce_write(w,e,a,k,'adjust-stock',jsonb_build_object('variant_id',vid,'warehouse_id',wh,'quantity',delta,'reason','Catalog stock set'));
 RETURN jsonb_build_object('variant_id',vid,'warehouse_id',wh,'on_hand',qty,'changed',true);
END $$;

-- Hide a product, by id or by (source, external_id). Never deletes rows.
CREATE OR REPLACE FUNCTION commerce_catalog_deactivate(w uuid,e text,a uuid,pid uuid,src text DEFAULT NULL,ext text DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN
 PERFORM commerce_actor(w,a,true);
 IF pid IS NULL AND src IS NOT NULL AND ext IS NOT NULL THEN SELECT id INTO pid FROM commerce_products WHERE workspace_id=w AND environment=e AND source=src AND external_id=ext;END IF;
 IF pid IS NULL OR NOT EXISTS(SELECT 1 FROM commerce_products WHERE id=pid AND workspace_id=w AND environment=e) THEN RETURN jsonb_build_object('found',false,'deactivated',false);END IF;
 UPDATE commerce_products SET active=false,revision=revision+1 WHERE id=pid AND workspace_id=w AND environment=e AND active;
 RETURN jsonb_build_object('id',pid,'found',true,'deactivated',true);
END $$;

-- The single write path. Body = the existing product body (name, description, images, variants, ...) plus catalog fields
-- (tags, category, search_aliases, ai_notes, min_price_minor, source, external_id). Each variant may carry "stock".
-- Optional "warehouse_id" picks the warehouse for those stock numbers.
CREATE OR REPLACE FUNCTION commerce_catalog_write(w uuid,e text,a uuid,k uuid,b jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE src text;ext text;pid uuid;rev bigint;created boolean:=false;core jsonb;res jsonb;answer jsonb;tg text[];al text[];fp text;old commerce_commands;vv jsonb;vid uuid;variants jsonb:='[]';stock_rows jsonb:='[]';wh uuid;sr jsonb;role_name text;BEGIN
 IF jsonb_typeof(b) IS DISTINCT FROM 'object' OR pg_column_size(b)>524288 OR k IS NULL THEN RAISE EXCEPTION 'Invalid product' USING ERRCODE='22023';END IF;
 role_name:=commerce_actor(w,a,true);
 src:=coalesce(nullif(b->>'source',''),'manual');ext:=nullif(btrim(coalesce(b->>'external_id','')),'');
 IF src NOT IN ('manual','csv','api','woo') OR (ext IS NOT NULL AND length(ext)>200) THEN RAISE EXCEPTION 'Invalid product source' USING ERRCODE='22023';END IF;
 IF b?'tags' AND (jsonb_typeof(b->'tags') IS DISTINCT FROM 'array' OR jsonb_array_length(b->'tags')>30) THEN RAISE EXCEPTION 'Invalid tags' USING ERRCODE='22023';END IF;
 IF b?'search_aliases' AND (jsonb_typeof(b->'search_aliases') IS DISTINCT FROM 'array' OR jsonb_array_length(b->'search_aliases')>30) THEN RAISE EXCEPTION 'Invalid aliases' USING ERRCODE='22023';END IF;
 IF b?'min_price_minor' AND jsonb_typeof(b->'min_price_minor') IS DISTINCT FROM 'null' AND coalesce(b->>'min_price_minor','')!~'^[0-9]{1,12}$' THEN RAISE EXCEPTION 'Invalid minimum price' USING ERRCODE='22023';END IF;
 IF b?'category' AND length(coalesce(b->>'category',''))>80 THEN RAISE EXCEPTION 'Invalid category' USING ERRCODE='22023';END IF;
 IF b?'ai_notes' AND length(coalesce(b->>'ai_notes',''))>2000 THEN RAISE EXCEPTION 'Invalid AI notes' USING ERRCODE='22023';END IF;
 IF jsonb_typeof(b->'variants') IS DISTINCT FROM 'array' OR jsonb_array_length(b->'variants') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid product' USING ERRCODE='22023';END IF;
 wh:=nullif(b->>'warehouse_id','')::uuid;
 fp:=encode(sha256(convert_to('catalog'||e||b::text,'UTF8')),'hex');PERFORM pg_advisory_xact_lock(hashtextextended('commerce:'||w::text,0));
 SELECT * INTO old FROM commerce_commands WHERE workspace_id=w AND actor_id=a AND operation_key=k;
 IF old.operation_key IS NOT NULL THEN IF old.fingerprint<>fp THEN RAISE EXCEPTION 'Operation key conflict' USING ERRCODE='23505';END IF;RETURN old.result;END IF;
 pid:=nullif(b->>'id','')::uuid;
 IF pid IS NULL AND ext IS NOT NULL THEN SELECT id INTO pid FROM commerce_products WHERE workspace_id=w AND environment=e AND source=src AND external_id=ext;END IF;
 IF pid IS NOT NULL THEN
  SELECT revision INTO rev FROM commerce_products WHERE id=pid AND workspace_id=w AND environment=e;
  IF rev IS NULL THEN RAISE EXCEPTION 'Product unavailable' USING ERRCODE='42501';END IF;
 END IF;
 FOR vv IN SELECT value FROM jsonb_array_elements(b->'variants') LOOP
  IF jsonb_typeof(vv) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid variant' USING ERRCODE='22023';END IF;
  IF vv?'stock' AND coalesce(vv->>'stock','')!~'^[0-9]{1,8}$' THEN RAISE EXCEPTION 'Invalid stock' USING ERRCODE='22023';END IF;
  IF vv->>'id' IS NULL AND pid IS NOT NULL THEN
   SELECT id INTO vid FROM commerce_variants WHERE product_id=pid AND workspace_id=w AND environment=e AND sku=btrim(coalesce(vv->>'sku',''));
   IF vid IS NOT NULL THEN vv:=vv||jsonb_build_object('id',vid);END IF;
   vid:=NULL;
  END IF;
  IF vv?'stock' THEN stock_rows:=stock_rows||jsonb_build_array(jsonb_build_object('sku',btrim(vv->>'sku'),'stock',(vv->>'stock')::bigint));END IF;
  variants:=variants||jsonb_build_array(vv-'stock');
 END LOOP;
 core:=(b-'tags'-'category'-'search_aliases'-'ai_notes'-'min_price_minor'-'source'-'external_id'-'warehouse_id')||jsonb_build_object('variants',variants);
 IF pid IS NOT NULL THEN core:=core||jsonb_build_object('id',pid)||CASE WHEN core?'revision' THEN '{}'::jsonb ELSE jsonb_build_object('revision',rev) END;
 ELSE created:=true;END IF;
 res:=commerce_write(w,e,a,commerce_derive_key(k,'product'),'product',core);
 pid:=(res->>'id')::uuid;
 SELECT coalesce(array_agg(btrim(x)),'{}') INTO tg FROM jsonb_array_elements_text(coalesce(b->'tags','[]')) x WHERE btrim(x)<>'' AND length(x)<=40;
 SELECT coalesce(array_agg(btrim(x)),'{}') INTO al FROM jsonb_array_elements_text(coalesce(b->'search_aliases','[]')) x WHERE btrim(x)<>'' AND length(x)<=60;
 UPDATE commerce_products SET
   tags=CASE WHEN b?'tags' THEN tg ELSE tags END,
   search_aliases=CASE WHEN b?'search_aliases' THEN al ELSE search_aliases END,
   category=CASE WHEN b?'category' THEN btrim(b->>'category') ELSE category END,
   ai_notes=CASE WHEN b?'ai_notes' THEN b->>'ai_notes' ELSE ai_notes END,
   min_price_minor=CASE WHEN b?'min_price_minor' THEN (b->>'min_price_minor')::bigint ELSE min_price_minor END,
   source=CASE WHEN b?'source' OR ext IS NOT NULL THEN src ELSE source END,
   external_id=CASE WHEN ext IS NOT NULL THEN ext ELSE external_id END
 WHERE id=pid AND workspace_id=w AND environment=e;
 FOR sr IN SELECT value FROM jsonb_array_elements(stock_rows) LOOP
  SELECT id INTO vid FROM commerce_variants WHERE product_id=pid AND workspace_id=w AND environment=e AND sku=sr->>'sku';
  PERFORM commerce_catalog_stock_set(w,e,a,commerce_derive_key(k,'stock:'||vid::text),vid,(sr->>'stock')::bigint,wh);
 END LOOP;
 PERFORM commerce_product_refresh_search(pid);
 SELECT revision INTO rev FROM commerce_products WHERE id=pid;
 answer:=jsonb_build_object('id',pid,'revision',rev,'created',created,'external_id',ext);
 INSERT INTO commerce_commands VALUES(w,a,k,fp,answer);
 RETURN answer;
END $$;

-- Public API: the key's creator acts, and only for a key that carries the right scope and is not revoked or expired.
CREATE OR REPLACE FUNCTION commerce_api_key_actor(w uuid,e text,key_id uuid,scope text) RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE a uuid;BEGIN
 SELECT created_by INTO a FROM merchant_api_keys WHERE id=key_id AND workspace_id=w AND environment=e AND revoked_at IS NULL AND expires_at>now() AND scope=ANY(scopes);
 IF a IS NULL THEN RAISE EXCEPTION 'Product API key unavailable' USING ERRCODE='42501';END IF;
 RETURN a;
END $$;

CREATE OR REPLACE FUNCTION commerce_api_catalog_write(w uuid,e text,key_id uuid,k uuid,b jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE a uuid;BEGIN
 a:=commerce_api_key_actor(w,e,key_id,'products:write');
 IF jsonb_typeof(b) IS DISTINCT FROM 'object' OR nullif(btrim(coalesce(b->>'external_id','')),'') IS NULL THEN RAISE EXCEPTION 'external_id required' USING ERRCODE='22023';END IF;
 RETURN commerce_catalog_write(w,e,a,k,(b-'source'-'id')||jsonb_build_object('source','api'));
END $$;

-- Update by product id (PUT /v1/products/{id}): the id and revision come from the server, not the caller.
CREATE OR REPLACE FUNCTION commerce_api_catalog_update(w uuid,e text,key_id uuid,k uuid,pid uuid,b jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE a uuid;ext text;BEGIN
 a:=commerce_api_key_actor(w,e,key_id,'products:write');
 IF jsonb_typeof(b) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid product' USING ERRCODE='22023';END IF;
 SELECT external_id INTO ext FROM commerce_products WHERE id=pid AND workspace_id=w AND environment=e AND source='api';
 IF NOT FOUND THEN RAISE EXCEPTION 'Product unavailable' USING ERRCODE='42501';END IF;
 RETURN commerce_catalog_write(w,e,a,k,(b-'source'-'external_id'-'revision')||jsonb_build_object('id',pid));
END $$;

CREATE OR REPLACE FUNCTION commerce_api_catalog_stock(w uuid,e text,key_id uuid,k uuid,pid uuid,b jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE a uuid;item jsonb;vid uuid;wh uuid;results jsonb:='[]';BEGIN
 a:=commerce_api_key_actor(w,e,key_id,'products:write');
 IF jsonb_typeof(b->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(b->'items') NOT BETWEEN 1 AND 100 THEN RAISE EXCEPTION 'Invalid stock' USING ERRCODE='22023';END IF;
 IF NOT EXISTS(SELECT 1 FROM commerce_products WHERE id=pid AND workspace_id=w AND environment=e) THEN RAISE EXCEPTION 'Product unavailable' USING ERRCODE='42501';END IF;
 wh:=nullif(b->>'warehouse_id','')::uuid;
 FOR item IN SELECT value FROM jsonb_array_elements(b->'items') LOOP
  IF jsonb_typeof(item) IS DISTINCT FROM 'object' OR coalesce(item->>'quantity','')!~'^[0-9]{1,8}$' THEN RAISE EXCEPTION 'Invalid stock' USING ERRCODE='22023';END IF;
  SELECT id INTO vid FROM commerce_variants WHERE product_id=pid AND workspace_id=w AND environment=e AND (id=nullif(item->>'variant_id','')::uuid OR (item->>'variant_id' IS NULL AND sku=item->>'sku'));
  IF vid IS NULL THEN RAISE EXCEPTION 'Variant unavailable' USING ERRCODE='42501';END IF;
  results:=results||jsonb_build_array(commerce_catalog_stock_set(w,e,a,commerce_derive_key(k,'stock:'||vid::text),vid,(item->>'quantity')::bigint,wh));
 END LOOP;
 RETURN jsonb_build_object('items',results);
END $$;

CREATE OR REPLACE FUNCTION commerce_api_catalog_delete(w uuid,e text,key_id uuid,pid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE a uuid;BEGIN
 a:=commerce_api_key_actor(w,e,key_id,'products:write');
 RETURN commerce_catalog_deactivate(w,e,a,pid);
END $$;

-- GET /v1/products?external_id=..&q=..&cursor=..  and  GET /v1/products/{id}
CREATE OR REPLACE FUNCTION commerce_api_catalog_read(w uuid,e text,key_id uuid,pid uuid,ext text,off integer,q text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE a uuid;one jsonb;ids uuid[];page jsonb;BEGIN
 a:=commerce_api_key_actor(w,e,key_id,'products:read');
 IF off IS NULL OR off<0 OR off>100000 OR length(coalesce(q,''))>200 OR length(coalesce(ext,''))>200 THEN RAISE EXCEPTION 'Invalid filter' USING ERRCODE='22023';END IF;
 IF pid IS NOT NULL OR nullif(ext,'') IS NOT NULL THEN
  IF pid IS NULL THEN SELECT id INTO pid FROM commerce_products WHERE workspace_id=w AND environment=e AND source='api' AND external_id=ext;END IF;
  one:=CASE WHEN pid IS NULL THEN NULL ELSE (SELECT commerce_catalog_json(id) FROM commerce_products WHERE id=pid AND workspace_id=w AND environment=e) END;
  IF one IS NULL THEN RAISE EXCEPTION 'Product unavailable' USING ERRCODE='42501';END IF;
  RETURN one;
 END IF;
 SELECT coalesce(array_agg(id ORDER BY created_at,id),'{}') INTO ids FROM (SELECT id,created_at FROM commerce_products WHERE workspace_id=w AND environment=e AND source='api' AND (nullif(btrim(coalesce(q,'')),'') IS NULL OR search_tokens && commerce_search_tokens(q)) ORDER BY created_at,id OFFSET off LIMIT 51) z;
 SELECT coalesce(jsonb_agg(commerce_catalog_json(x) ORDER BY n),'[]') INTO page FROM unnest(ids[1:50]) WITH ORDINALITY u(x,n);
 RETURN jsonb_build_object('items',page,'next_cursor',CASE WHEN cardinality(ids)>50 THEN off+50 ELSE NULL END);
END $$;

REVOKE ALL ON FUNCTION commerce_derive_key(uuid,text),commerce_catalog_json(uuid),commerce_catalog_stock_set(uuid,text,uuid,uuid,uuid,bigint,uuid),commerce_catalog_deactivate(uuid,text,uuid,uuid,text,text),commerce_catalog_write(uuid,text,uuid,uuid,jsonb),commerce_api_key_actor(uuid,text,uuid,text),commerce_api_catalog_write(uuid,text,uuid,uuid,jsonb),commerce_api_catalog_update(uuid,text,uuid,uuid,uuid,jsonb),commerce_api_catalog_stock(uuid,text,uuid,uuid,uuid,jsonb),commerce_api_catalog_delete(uuid,text,uuid,uuid),commerce_api_catalog_read(uuid,text,uuid,uuid,text,integer,text) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION commerce_catalog_write(uuid,text,uuid,uuid,jsonb),commerce_catalog_deactivate(uuid,text,uuid,uuid,text,text),commerce_api_catalog_write(uuid,text,uuid,uuid,jsonb),commerce_api_catalog_update(uuid,text,uuid,uuid,uuid,jsonb),commerce_api_catalog_stock(uuid,text,uuid,uuid,uuid,jsonb),commerce_api_catalog_delete(uuid,text,uuid,uuid),commerce_api_catalog_read(uuid,text,uuid,uuid,text,integer,text) TO ekmivo_financial_runtime,ekmivo_financial_projection;
