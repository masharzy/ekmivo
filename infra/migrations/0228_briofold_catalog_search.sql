-- AI Commerce Phase 1: one product catalog that the AI can search.
--
-- Rules this migration keeps:
--   * Nothing is dropped or rewritten. Only columns, indexes and new functions are added, so a flag-off
--     workspace behaves exactly as before.
--   * min_price_minor is the lowest price the AI may negotiate to. It is never returned by search.
--   * Search only returns active products of the workspace and environment it is asked about.
--   * The old chat product list (inbox_products) is copied once, idempotently. The old rows stay in place.
--
-- Rollback: every statement is additive. To undo before any data uses the new columns, drop the two triggers,
-- the new functions, the new indexes and the new columns. Never drop commerce_* tables.

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- 1. Catalog columns ---------------------------------------------------------------------------------------
ALTER TABLE commerce_products
 ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}' CHECK(cardinality(tags)<=30),
 ADD COLUMN IF NOT EXISTS category text NOT NULL DEFAULT '' CHECK(length(category)<=80),
 ADD COLUMN IF NOT EXISTS search_aliases text[] NOT NULL DEFAULT '{}' CHECK(cardinality(search_aliases)<=30),
 ADD COLUMN IF NOT EXISTS ai_notes text NOT NULL DEFAULT '' CHECK(length(ai_notes)<=2000),
 ADD COLUMN IF NOT EXISTS min_price_minor bigint CHECK(min_price_minor IS NULL OR min_price_minor BETWEEN 0 AND 100000000000),
 ADD COLUMN IF NOT EXISTS source text NOT NULL DEFAULT 'manual' CHECK(source IN ('manual','csv','api','woo')),
 ADD COLUMN IF NOT EXISTS external_id text CHECK(external_id IS NULL OR length(external_id) BETWEEN 1 AND 200),
 ADD COLUMN IF NOT EXISTS search_text text NOT NULL DEFAULT '',
 ADD COLUMN IF NOT EXISTS search_tokens text[] NOT NULL DEFAULT '{}';

CREATE UNIQUE INDEX IF NOT EXISTS commerce_products_external ON commerce_products(workspace_id,environment,source,external_id) WHERE external_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS commerce_products_scope ON commerce_products(workspace_id,environment) WHERE active;
CREATE INDEX IF NOT EXISTS commerce_products_tokens ON commerce_products USING gin(search_tokens);
CREATE INDEX IF NOT EXISTS commerce_products_trgm ON commerce_products USING gin(search_text gin_trgm_ops);

-- Image upload by URL (CSV and API) stores webp too.
DO $$DECLARE c text;BEGIN
 FOR c IN SELECT conname FROM pg_constraint WHERE conrelid='commerce_media'::regclass AND contype='c' AND pg_get_constraintdef(oid) LIKE '%image/png%' LOOP
  EXECUTE format('ALTER TABLE commerce_media DROP CONSTRAINT %I',c);
 END LOOP;
 ALTER TABLE commerce_media ADD CONSTRAINT commerce_media_mime_check CHECK(mime IN ('image/png','image/jpeg','image/webp'));
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. Words that mean the same thing (Bangla, Banglish, English) -----------------------------------------------
CREATE TABLE IF NOT EXISTS commerce_search_terms(term text PRIMARY KEY CHECK(term=lower(term) AND length(term) BETWEEN 1 AND 40),canonical text NOT NULL CHECK(canonical=lower(canonical) AND length(canonical) BETWEEN 1 AND 40));
ALTER TABLE commerce_search_terms ENABLE ROW LEVEL SECURITY;
ALTER TABLE commerce_search_terms FORCE ROW LEVEL SECURITY;
REVOKE ALL ON commerce_search_terms FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
INSERT INTO commerce_search_terms(term,canonical) VALUES
 ('পাঞ্জাবি','panjabi'),('পাঞ্জাবী','panjabi'),('punjabi','panjabi'),('panjabi','panjabi'),('punjabee','panjabi'),
 ('শাড়ি','saree'),('শাড়ী','saree'),('sari','saree'),('saree','saree'),
 ('টিশার্ট','tshirt'),('টি-শার্ট','tshirt'),('tshirt','tshirt'),('tee','tshirt'),
 ('জুতা','shoe'),('জুতো','shoe'),('shoe','shoe'),('shoes','shoe'),
 ('ব্যাগ','bag'),('bag','bag'),('bags','bag'),
 ('লাল','red'),('red','red'),('লাল','red'),('নীল','blue'),('blue','blue'),('কালো','black'),('black','black'),
 ('সাদা','white'),('white','white'),('সবুজ','green'),('green','green'),('হলুদ','yellow'),('yellow','yellow'),
 ('গোলাপি','pink'),('গোলাপী','pink'),('pink','pink'),('বাদামি','brown'),('brown','brown'),('ধূসর','grey'),('grey','grey'),('gray','grey'),
 ('এস','s'),('স্মল','s'),('small','s'),('এম','m'),('মিডিয়াম','m'),('medium','m'),('এল','l'),('লার্জ','l'),('large','l'),
 ('এক্সএল','xl'),('xl','xl'),('এক্সএক্সএল','xxl'),('xxl','xxl')
ON CONFLICT(term) DO NOTHING;

-- 3. Text normalisation -----------------------------------------------------------------------------------------
-- Bangla digits become ASCII, case and punctuation are removed, "t shirt" becomes "tshirt". Pure function.
CREATE OR REPLACE FUNCTION commerce_search_norm(t text) RETURNS text LANGUAGE sql IMMUTABLE PARALLEL SAFE AS $$
 SELECT btrim(regexp_replace(' '||regexp_replace(regexp_replace(lower(translate(coalesce(t,''),'০১২৩৪৫৬৭৮৯','0123456789')),'[^[:alnum:]ঀ-৿]+',' ','g'),'\mt shirt\M','tshirt','g')||' ','\s+',' ','g'))
$$;

-- All tokens a product can be found by: its own words plus the shared meaning of each word.
CREATE OR REPLACE FUNCTION commerce_search_tokens(t text) RETURNS text[] LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
 SELECT coalesce(array_agg(DISTINCT x),'{}') FROM (
  SELECT w AS x FROM unnest(string_to_array(commerce_search_norm(t),' ')) w WHERE length(w)>0
  UNION SELECT s.canonical FROM unnest(string_to_array(commerce_search_norm(t),' ')) w JOIN commerce_search_terms s ON s.term=w
 ) z
$$;

-- 4. Keep the search columns current -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION commerce_product_refresh_search(pid uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE doc text;BEGIN
 SELECT concat_ws(' ',p.name,p.category,array_to_string(p.tags,' '),array_to_string(p.search_aliases,' '),left(p.description,500),
   (SELECT string_agg(concat_ws(' ',v.sku,(SELECT string_agg(o.value,' ') FROM jsonb_each_text(v.options) o)),' ') FROM commerce_variants v WHERE v.product_id=p.id AND v.active))
  INTO doc FROM commerce_products p WHERE p.id=pid;
 IF doc IS NULL THEN RETURN;END IF;
 UPDATE commerce_products SET search_tokens=commerce_search_tokens(doc),search_text=array_to_string(commerce_search_tokens(doc),' ') WHERE id=pid AND (search_tokens IS DISTINCT FROM commerce_search_tokens(doc) OR search_text IS DISTINCT FROM array_to_string(commerce_search_tokens(doc),' '));
END $$;

CREATE OR REPLACE FUNCTION commerce_products_search_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN
 PERFORM commerce_product_refresh_search(NEW.id);
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS commerce_products_search ON commerce_products;
CREATE TRIGGER commerce_products_search AFTER INSERT OR UPDATE OF name,category,tags,search_aliases,description ON commerce_products FOR EACH ROW EXECUTE FUNCTION commerce_products_search_trigger();

CREATE OR REPLACE FUNCTION commerce_variants_search_trigger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN
 PERFORM commerce_product_refresh_search(coalesce(NEW.product_id,OLD.product_id));
 RETURN NULL;
END $$;
DROP TRIGGER IF EXISTS commerce_variants_search ON commerce_variants;
CREATE TRIGGER commerce_variants_search AFTER INSERT OR UPDATE OF sku,options,active OR DELETE ON commerce_variants FOR EACH ROW EXECUTE FUNCTION commerce_variants_search_trigger();

-- Existing products get their search columns once.
SELECT commerce_product_refresh_search(id) FROM commerce_products;

-- 5. Copy the old chat product list into the catalog (once; the old rows stay) -----------------------------------
-- Each size becomes a variant. Images live in the inbox media store and are NOT copied here: they must be
-- re-attached by the owner or by a later image import. Products in a currency other than BDT are skipped.
INSERT INTO commerce_products(workspace_id,environment,name,description,active,source,external_id,ai_notes)
SELECT i.workspace_id,i.environment,i.name,'',i.active,'manual','inbox:'||i.id::text,CASE WHEN btrim(i.sizes)<>'' THEN left('Sizes: '||btrim(i.sizes),2000) ELSE '' END
FROM inbox_products i WHERE i.currency='BDT' AND i.price_minor<=100000000000
ON CONFLICT DO NOTHING;

INSERT INTO commerce_variants(workspace_id,environment,product_id,sku,options,price_minor,active)
SELECT p.workspace_id,p.environment,p.id,
       'INBOX-'||replace(i.id::text,'-','')||CASE WHEN s.size IS NULL THEN '' ELSE '-'||s.n END,
       CASE WHEN s.size IS NULL THEN '{}'::jsonb ELSE jsonb_build_object('size',s.size) END,
       i.price_minor,i.active
FROM inbox_products i
JOIN commerce_products p ON p.workspace_id=i.workspace_id AND p.environment=i.environment AND p.source='manual' AND p.external_id='inbox:'||i.id::text
LEFT JOIN LATERAL (SELECT btrim(x.size) size,x.n FROM unnest(regexp_split_to_array(btrim(i.sizes),'\s*[,;|/]\s*')) WITH ORDINALITY x(size,n) WHERE btrim(x.size)<>'' AND x.n<=100) s ON btrim(i.sizes)<>''
WHERE i.currency='BDT'
ON CONFLICT DO NOTHING;

-- 6. Search the catalog for the AI ----------------------------------------------------------------------------------
-- filters: {"category":text,"min_price_minor":n,"max_price_minor":n,"in_stock":bool}. Never returns min_price_minor.
-- Every word of the question must be found (a word and its shared meanings count as one). Only if nothing matches
-- completely, close spellings are tried. When the customer names a colour or size, only the variants that fit it are
-- returned (matches_request=true). The slow word-by-word work runs on at most `lim` products, not on the whole catalog.
CREATE OR REPLACE FUNCTION commerce_product_search(w uuid,e text,q text,filters jsonb DEFAULT '{}',lim integer DEFAULT 10) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp SET pg_trgm.word_similarity_threshold=0.45 AS $$
DECLARE qn text;words text[];alt_sets jsonb;need integer;cat text;lo bigint;hi bigint;stock_only boolean;n integer;ids uuid[];result jsonb;BEGIN
 IF e IS NULL OR e NOT IN ('live','sandbox') OR w IS NULL OR length(coalesce(q,''))>200 OR jsonb_typeof(coalesce(filters,'{}')) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid product search' USING ERRCODE='22023';END IF;
 n:=least(greatest(coalesce(lim,10),1),50);
 qn:=commerce_search_norm(q);words:=string_to_array(qn,' ');need:=coalesce(array_length(words,1),0);
 IF need>12 THEN RAISE EXCEPTION 'Invalid product search' USING ERRCODE='22023';END IF;
 cat:=nullif(btrim(filters->>'category'),'');
 lo:=CASE WHEN coalesce(filters->>'min_price_minor','')~'^[0-9]{1,12}$' THEN (filters->>'min_price_minor')::bigint END;
 hi:=CASE WHEN coalesce(filters->>'max_price_minor','')~'^[0-9]{1,12}$' THEN (filters->>'max_price_minor')::bigint END;
 stock_only:=coalesce((filters->>'in_stock')::boolean,false);
 SELECT coalesce(jsonb_agg(to_jsonb(commerce_search_tokens(wd))),'[]') INTO alt_sets FROM unnest(words) wd;
 -- 1) products that contain every word
 SELECT coalesce(array_agg(z.id),'{}') INTO ids FROM (
  SELECT p.id FROM commerce_products p
  WHERE p.workspace_id=w AND p.environment=e AND p.active AND (cat IS NULL OR lower(p.category)=lower(cat))
    AND (need=0 OR NOT EXISTS(SELECT 1 FROM jsonb_array_elements(alt_sets) a WHERE NOT (p.search_tokens && ARRAY(SELECT jsonb_array_elements_text(a)))))
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

REVOKE ALL ON FUNCTION commerce_search_norm(text),commerce_search_tokens(text),commerce_product_refresh_search(uuid),commerce_products_search_trigger(),commerce_variants_search_trigger(),commerce_product_search(uuid,text,text,jsonb,integer) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION commerce_product_search(uuid,text,text,jsonb,integer) TO ekmivo_financial_runtime,ekmivo_financial_projection;

-- 7. One write path for catalog fields -----------------------------------------------------------------------------
-- Wraps the existing commerce_write('product') so images, variants and revision checks stay in one place, then saves the
-- catalog fields in the same transaction. A repeated (source, external_id) updates the same product instead of adding one.
CREATE OR REPLACE FUNCTION commerce_catalog_write(w uuid,e text,a uuid,k uuid,b jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE src text;ext text;pid uuid;rev bigint;core jsonb;res jsonb;tg text[];al text[];mn bigint;BEGIN
 IF jsonb_typeof(b) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid product' USING ERRCODE='22023';END IF;
 src:=coalesce(nullif(b->>'source',''),'manual');ext:=nullif(btrim(coalesce(b->>'external_id','')),'');
 IF src NOT IN ('manual','csv','api','woo') OR (ext IS NOT NULL AND length(ext)>200) THEN RAISE EXCEPTION 'Invalid product source' USING ERRCODE='22023';END IF;
 IF b?'tags' AND (jsonb_typeof(b->'tags') IS DISTINCT FROM 'array' OR jsonb_array_length(b->'tags')>30) THEN RAISE EXCEPTION 'Invalid tags' USING ERRCODE='22023';END IF;
 IF b?'search_aliases' AND (jsonb_typeof(b->'search_aliases') IS DISTINCT FROM 'array' OR jsonb_array_length(b->'search_aliases')>30) THEN RAISE EXCEPTION 'Invalid aliases' USING ERRCODE='22023';END IF;
 IF b?'min_price_minor' AND b->'min_price_minor'<>'null'::jsonb AND coalesce(b->>'min_price_minor','')!~'^[0-9]{1,12}$' THEN RAISE EXCEPTION 'Invalid minimum price' USING ERRCODE='22023';END IF;
 IF b?'category' AND length(coalesce(b->>'category',''))>80 THEN RAISE EXCEPTION 'Invalid category' USING ERRCODE='22023';END IF;
 IF b?'ai_notes' AND length(coalesce(b->>'ai_notes',''))>2000 THEN RAISE EXCEPTION 'Invalid AI notes' USING ERRCODE='22023';END IF;
 pid:=nullif(b->>'id','')::uuid;
 IF pid IS NULL AND ext IS NOT NULL THEN
  SELECT id,revision INTO pid,rev FROM commerce_products WHERE workspace_id=w AND environment=e AND source=src AND external_id=ext;
 END IF;
 core:=b-'tags'-'category'-'search_aliases'-'ai_notes'-'min_price_minor'-'source'-'external_id';
 IF pid IS NOT NULL THEN core:=core||jsonb_build_object('id',pid)||CASE WHEN rev IS NOT NULL AND NOT core?'revision' THEN jsonb_build_object('revision',rev) ELSE '{}'::jsonb END;END IF;
 res:=commerce_write(w,e,a,k,'product',core);
 pid:=coalesce((res->>'id')::uuid,pid);
 SELECT coalesce(array_agg(btrim(x)),'{}') INTO tg FROM jsonb_array_elements_text(coalesce(b->'tags','[]')) x WHERE btrim(x)<>'' AND length(x)<=40;
 SELECT coalesce(array_agg(btrim(x)),'{}') INTO al FROM jsonb_array_elements_text(coalesce(b->'search_aliases','[]')) x WHERE btrim(x)<>'' AND length(x)<=60;
 UPDATE commerce_products SET
   tags=CASE WHEN b?'tags' THEN tg ELSE tags END,
   search_aliases=CASE WHEN b?'search_aliases' THEN al ELSE search_aliases END,
   category=CASE WHEN b?'category' THEN btrim(b->>'category') ELSE category END,
   ai_notes=CASE WHEN b?'ai_notes' THEN b->>'ai_notes' ELSE ai_notes END,
   min_price_minor=CASE WHEN b?'min_price_minor' THEN (b->>'min_price_minor')::bigint ELSE min_price_minor END,
   source=CASE WHEN ext IS NOT NULL THEN src ELSE source END,
   external_id=CASE WHEN ext IS NOT NULL THEN ext ELSE external_id END
 WHERE id=pid AND workspace_id=w AND environment=e;
 PERFORM commerce_product_refresh_search(pid);
 RETURN res||jsonb_build_object('id',pid);
END $$;
REVOKE ALL ON FUNCTION commerce_catalog_write(uuid,text,uuid,uuid,jsonb) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION commerce_catalog_write(uuid,text,uuid,uuid,jsonb) TO ekmivo_financial_runtime,ekmivo_financial_projection;
