-- Found on the Neon test branch with 10k products: commerce_variants had no index on
-- product_id, so every product-to-variant check scanned the whole table, and stock
-- rows were not reachable by variant_id alone. Both are plain btree indexes.
CREATE INDEX IF NOT EXISTS commerce_variants_product ON commerce_variants(product_id);
CREATE INDEX IF NOT EXISTS commerce_stock_variant ON commerce_stock(variant_id);
-- Phase 1 performance fix: the product match filter re-expanded the JSON word
-- alternatives for every product row (about 0.4 s on 10k products). Each word's
-- alternatives are now plain text[] values, so && uses the search_tokens GIN index.
CREATE OR REPLACE FUNCTION commerce_product_search(w uuid,e text,q text,filters jsonb DEFAULT '{}',lim integer DEFAULT 10) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp SET pg_trgm.word_similarity_threshold=0.45 AS $$
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
               AND (NOT stock_only OR coalesce((SELECT sum(s.on_hand-s.reserved) FROM commerce_stock s WHERE s.variant_id=v.id),0)>0))
  ORDER BY CASE WHEN need=0 THEN 0 ELSE -word_similarity(qn,p.name) END,p.name,p.id LIMIT n) z;
 -- 2) nothing matched completely: close spellings. Every word must still be close to some word of the product.
 IF cardinality(ids)=0 AND need>0 THEN
  SELECT coalesce(array_agg(z.id ORDER BY z.rank DESC,z.name,z.id),'{}') INTO ids FROM (
   SELECT c.id,c.name,c.rank FROM (
    SELECT p.id,p.name,p.search_tokens,word_similarity(qn,p.search_text) rank FROM commerce_products p
    WHERE p.workspace_id=w AND p.environment=e AND p.active AND (cat IS NULL OR lower(p.category)=lower(cat)) AND qn <% p.search_text
      AND EXISTS(SELECT 1 FROM commerce_variants v WHERE v.product_id=p.id AND v.active AND (lo IS NULL OR v.price_minor>=lo) AND (hi IS NULL OR v.price_minor<=hi)
                 AND (NOT stock_only OR coalesce((SELECT sum(s.on_hand-s.reserved) FROM commerce_stock s WHERE s.variant_id=v.id),0)>0))
    ORDER BY rank DESC,p.name,p.id LIMIT 200) c
   WHERE NOT EXISTS(SELECT 1 FROM jsonb_array_elements(alt_sets) a WHERE NOT EXISTS(
           SELECT 1 FROM unnest(c.search_tokens) t, jsonb_array_elements_text(a) alt WHERE t=alt OR (length(alt)>=4 AND similarity(t,alt)>=0.5)))
   ORDER BY c.rank DESC,c.name,c.id LIMIT n) z;
 END IF;
 -- 3) shape only those products, choosing the variants that fit what the customer said
 WITH picked AS (SELECT p.id,p.name,p.category,p.images[1] first_image,u.ord,commerce_search_tokens(concat_ws(' ',p.name,p.category,array_to_string(p.tags,' '),array_to_string(p.search_aliases,' '),left(p.description,500))) base_tokens
                 FROM unnest(ids) WITH ORDINALITY u(id,ord) JOIN commerce_products p ON p.id=u.id),
 scored AS (
  SELECT k.id pid,v.id,v.sku,v.options,v.price_minor,coalesce((SELECT sum(s.on_hand-s.reserved) FROM commerce_stock s WHERE s.variant_id=v.id),0) available,
         (SELECT count(*) FROM jsonb_array_elements(alt_sets) a WHERE (k.base_tokens||commerce_search_tokens(concat_ws(' ',v.sku,(SELECT string_agg(o.value,' ') FROM jsonb_each_text(v.options) o)))) && ARRAY(SELECT jsonb_array_elements_text(a))) fit
  FROM picked k JOIN commerce_variants v ON v.product_id=k.id AND v.active
  WHERE (lo IS NULL OR v.price_minor>=lo) AND (hi IS NULL OR v.price_minor<=hi)
 ), best AS (
  SELECT sc.* FROM scored sc WHERE (NOT stock_only OR sc.available>0) AND sc.fit=(SELECT max(x.fit) FROM scored x WHERE x.pid=sc.pid AND (NOT stock_only OR x.available>0))
 )
 SELECT coalesce(jsonb_agg(jsonb_build_object('product_id',k.id,'name',k.name,'category',k.category,'first_image',k.first_image,
          'variants',(SELECT jsonb_agg(jsonb_build_object('id',b.id,'sku',b.sku,'options',b.options,'price_minor',b.price_minor,'available',b.available,'matches_request',need>0 AND b.fit=need) ORDER BY b.sku) FROM best b WHERE b.pid=k.id))
          ORDER BY k.ord),'[]') INTO result
 FROM picked k WHERE EXISTS(SELECT 1 FROM best b WHERE b.pid=k.id);
 RETURN result;
END $$;
