-- Self-contained check for migration 0228 (catalog search). Runs on an EMPTY disposable database:
--   createdb t && psql -v ON_ERROR_STOP=1 -d t -f tools/testing/catalog-search-harness.sql
-- It builds only the few tables 0228 touches (copied from 0141 / 0121), applies 0228 TWICE, then asserts behaviour.
-- It does NOT replace the isolated-PostgreSQL run of the full migration chain.
\set ON_ERROR_STOP on
\set QUIET on

DO $$BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='ekmivo_financial_runtime') THEN CREATE ROLE ekmivo_financial_runtime;END IF;IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='ekmivo_financial_projection') THEN CREATE ROLE ekmivo_financial_projection;END IF;END $$;
CREATE TABLE workspaces(id uuid PRIMARY KEY DEFAULT gen_random_uuid());
CREATE TABLE inbox_media(workspace_id uuid,id uuid,UNIQUE(workspace_id,id));
\! sed -n '4p;6,10p' infra/migrations/0141_briofold_commerce.sql > /tmp/catalog-0141-subset.sql
\i /tmp/catalog-0141-subset.sql
\! sed -n '11p' infra/migrations/0121_inbox_media_profiles.sql > /tmp/catalog-0121-subset.sql
\i /tmp/catalog-0121-subset.sql

INSERT INTO workspaces(id) VALUES('11111111-1111-1111-1111-111111111111'),('22222222-2222-2222-2222-222222222222');
INSERT INTO commerce_warehouses(id,workspace_id,environment,name) VALUES('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','sandbox','Main');
INSERT INTO commerce_products(id,workspace_id,environment,name,description) VALUES
 ('00000000-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','sandbox','পাঞ্জাবি','cotton'),
 ('00000000-0000-0000-0000-000000000002','11111111-1111-1111-1111-111111111111','sandbox','Cotton T-Shirt',''),
 ('00000000-0000-0000-0000-000000000003','22222222-2222-2222-2222-222222222222','sandbox','Panjabi Other Workspace','');
INSERT INTO commerce_variants(workspace_id,environment,product_id,sku,options,price_minor) VALUES
 ('11111111-1111-1111-1111-111111111111','sandbox','00000000-0000-0000-0000-000000000001','PJ-R-M','{"color":"লাল","size":"এম"}',120000),
 ('11111111-1111-1111-1111-111111111111','sandbox','00000000-0000-0000-0000-000000000001','PJ-B-L','{"color":"Blue","size":"L"}',125000),
 ('11111111-1111-1111-1111-111111111111','sandbox','00000000-0000-0000-0000-000000000002','TS-W-M','{"color":"White","size":"M"}',50000),
 ('22222222-2222-2222-2222-222222222222','sandbox','00000000-0000-0000-0000-000000000003','OTH-R-M','{"color":"Red","size":"M"}',100);
INSERT INTO commerce_stock(workspace_id,environment,warehouse_id,variant_id,on_hand,reserved) SELECT '11111111-1111-1111-1111-111111111111','sandbox','aaaaaaaa-0000-0000-0000-000000000001',id,5,1 FROM commerce_variants WHERE sku='PJ-B-L';
INSERT INTO inbox_products(workspace_id,environment,name,price_minor,sizes) VALUES
 ('11111111-1111-1111-1111-111111111111','sandbox','Old Shirt',70000,'M, L,XL'),
 ('11111111-1111-1111-1111-111111111111','sandbox','Old Bag',90000,''),
 ('11111111-1111-1111-1111-111111111111','sandbox','USD Thing',5,'M');
UPDATE inbox_products SET currency='USD' WHERE name='USD Thing';

\i infra/migrations/0228_briofold_catalog_search.sql
\i infra/migrations/0228_briofold_catalog_search.sql

CREATE FUNCTION t_skus(qry text,flt jsonb DEFAULT '{}') RETURNS text LANGUAGE sql AS $$
 SELECT coalesce(string_agg(v->>'sku',',' ORDER BY v->>'sku'),'') FROM jsonb_array_elements(commerce_product_search('11111111-1111-1111-1111-111111111111','sandbox',qry,flt,10)) x,jsonb_array_elements(x->'variants') v
$$;
CREATE FUNCTION t_eq(label text,got text,want text) RETURNS void LANGUAGE plpgsql AS $$BEGIN IF got IS DISTINCT FROM want THEN RAISE EXCEPTION 'FAIL %: got [%] want [%]',label,got,want;END IF;RAISE NOTICE 'PASS %',label;END $$;

SELECT t_eq('three spellings pick the same variant',(SELECT string_agg(DISTINCT t_skus(x),'|') FROM unnest(ARRAY['লাল পাঞ্জাবি M','panjabi red','পাঞ্জাবি লাল এম','punjabi red m']) x),'PJ-R-M');
SELECT t_eq('blue L picks the other variant',t_skus('punjabi blue L'),'PJ-B-L');
SELECT t_eq('t-shirt and tshirt match',t_skus('t-shirt'),'TS-W-M');
SELECT t_eq('typo still finds it',t_skus('panjabbi red'),'PJ-R-M');
SELECT t_eq('price ceiling hides dearer variants',t_skus('panjabi',jsonb_build_object('max_price_minor',60000)),'');
SELECT t_eq('in_stock keeps only stocked variant',t_skus('panjabi',jsonb_build_object('in_stock',true)),'PJ-B-L');
SELECT t_eq('other workspace is invisible',t_skus('Other Workspace'),'');
SELECT t_eq('unrelated words are not fuzzy matched',t_skus('old bag xyz'),'');
SELECT t_eq('Bangla digits normalised',commerce_search_norm('৫০০ টাকা'),'500 টাকা');
UPDATE commerce_products SET min_price_minor=111 WHERE id='00000000-0000-0000-0000-000000000001';
SELECT t_eq('min_price never returned',(commerce_product_search('11111111-1111-1111-1111-111111111111','sandbox','panjabi','{}',10)::text ~ 'min_price|111')::text,'false');
UPDATE commerce_products SET active=false WHERE name='Old Bag';
SELECT t_eq('inactive product hidden',t_skus('old bag'),'');
SELECT t_eq('inbox copy: sizes became variants',(SELECT count(*)::text FROM commerce_variants WHERE sku LIKE 'INBOX-%'),'4');
SELECT t_eq('inbox copy skipped non-BDT',(SELECT count(*)::text FROM commerce_products WHERE external_id LIKE 'inbox:%'),'2');
\i infra/migrations/0228_briofold_catalog_search.sql
SELECT t_eq('re-apply adds no duplicate products',(SELECT count(*)::text FROM commerce_products),'5');
SELECT t_eq('re-apply adds no duplicate variants',(SELECT count(*)::text FROM commerce_variants),'8');
