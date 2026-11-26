-- Assertions for 0272 after it ran twice on payment-gateways-stub.sql.
-- Any failed check raises and stops the run.
CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean,msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF cond IS NOT TRUE THEN RAISE EXCEPTION 'FAILED: %',msg; END IF; END $$;
CREATE OR REPLACE FUNCTION pg_temp.err(q text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN EXECUTE q; RETURN 'none'; EXCEPTION WHEN others THEN RETURN SQLSTATE; END $$;
CREATE OR REPLACE FUNCTION pg_temp.as_shop(ws text) RETURNS void LANGUAGE sql AS $$
 SELECT set_config('ekmivo.workspace_id',ws,false),set_config('ekmivo.environment','live',false) $$;

-- Registry and senders
SELECT pg_temp.ok((SELECT count(*) FROM briofold_providers)=13,'13 providers');
SELECT pg_temp.ok((SELECT count(*) FROM briofold_provider_senders)=26,'26 senders, no duplicates after two runs');
SELECT pg_temp.ok(EXISTS(SELECT 1 FROM briofold_provider_senders WHERE provider='bkash' AND sender='bKash' AND confidence='official'),'bKash exact case');
SELECT pg_temp.ok((SELECT count(*) FROM briofold_provider_senders WHERE sender='IslamiBank')=2,'IslamiBank shared by mCash and CellFin');
SELECT pg_temp.ok((SELECT string_agg(content_hint,',' ORDER BY content_hint) FROM briofold_provider_senders WHERE sender='IslamiBank')='CellFin,mCash','content hints');

-- Backfill: shop A gets bKash + Nagad (Rocket account deleted), shop B gets bKash; once only.
SELECT pg_temp.ok((SELECT count(*) FROM briofold_gateways)=3,'three backfilled gateways after two runs');
SELECT pg_temp.ok((SELECT count(*) FROM briofold_gateways WHERE legacy_backfill AND gateway_type='personal'
 AND min_amount_minor IS NULL AND max_amount_minor IS NULL AND fixed_charge_minor=0 AND status='active')=3,'backfill defaults');
SELECT pg_temp.ok((SELECT count(*) FROM financial_receiving_accounts WHERE gateway_id IS NOT NULL)=4,'four live accounts linked');
SELECT pg_temp.ok((SELECT gateway_id IS NULL FROM financial_receiving_accounts WHERE id='00000000-0000-4000-8000-0000000000a4'),'deleted account not linked');
SELECT pg_temp.ok((SELECT count(DISTINCT gateway_id) FROM financial_receiving_accounts WHERE id IN
 ('00000000-0000-4000-8000-0000000000a1','00000000-0000-4000-8000-0000000000a2'))=1,'both bKash numbers in one gateway');
SELECT pg_temp.ok((SELECT g.workspace_id FROM briofold_gateways g JOIN financial_receiving_accounts a ON a.gateway_id=g.id
 WHERE a.id='00000000-0000-4000-8000-0000000000b1')='bbbbbbbb-0000-4000-8000-000000000002','shop B account in shop B gateway');

-- Arithmetic: half-up to paisa
SELECT pg_temp.ok(briofold_gateway_payable(100000,0,0,0,0)->>'payable_minor'='100000','no charge');
SELECT pg_temp.ok(briofold_gateway_payable(100000,0,0,1000,185)->>'charge_minor'='2850','1.85% + 10 Tk on 1000 Tk');
SELECT pg_temp.ok(briofold_gateway_payable(100000,0,0,1000,185)->>'payable_minor'='102850','payable with charge');
SELECT pg_temp.ok(briofold_gateway_payable(150,0,0,0,100)->>'charge_minor'='2','1% of 1.50 Tk = 1.5 paisa rounds up');
SELECT pg_temp.ok(briofold_gateway_payable(149,0,0,0,100)->>'charge_minor'='1','1% of 1.49 Tk rounds down');
SELECT pg_temp.ok(briofold_gateway_payable(100000,5000,1000,0,0)->>'payable_minor'='85000','50 Tk + 10% discount');

-- Scope: no session settings or another shop sees nothing
SELECT pg_temp.ok(briofold_gateway_list('aaaaaaaa-0000-4000-8000-000000000001','live') IS NULL,'no scope, no data');
SELECT pg_temp.as_shop('bbbbbbbb-0000-4000-8000-000000000002');
SELECT pg_temp.ok(briofold_gateway_list('aaaaaaaa-0000-4000-8000-000000000001','live') IS NULL,'other shop cannot read');
SELECT pg_temp.ok(jsonb_array_length(briofold_gateway_list('bbbbbbbb-0000-4000-8000-000000000002','live')->'items')=1,'shop B sees its one');
SELECT pg_temp.ok(briofold_gateway_list('bbbbbbbb-0000-4000-8000-000000000002','sandbox') IS NULL,'wrong realm');

SELECT pg_temp.as_shop('aaaaaaaa-0000-4000-8000-000000000001');
SELECT pg_temp.ok((SELECT sum((x->>'account_count')::int) FROM jsonb_array_elements(briofold_gateway_list('aaaaaaaa-0000-4000-8000-000000000001','live')->'items') x)=3,'account counts');

-- Create: provider/type rules, null = no limit, 0 is a real value
SELECT pg_temp.ok(pg_temp.err($q$SELECT briofold_gateway_save('aaaaaaaa-0000-4000-8000-000000000001','live',NULL,'{"provider":"cellfin","type":"agent"}',NULL)$q$)='P7201','CellFin has no agent type');
SELECT pg_temp.ok(pg_temp.err($q$SELECT briofold_gateway_save('aaaaaaaa-0000-4000-8000-000000000001','live',NULL,'{"provider":"nope","type":"personal"}',NULL)$q$)='P7201','unknown provider');
SELECT pg_temp.ok(pg_temp.err($q$SELECT briofold_gateway_save('aaaaaaaa-0000-4000-8000-000000000001','live',NULL,'{"provider":"bkash","type":"agent","extra":1}',NULL)$q$)='P7201','unknown field');
SELECT pg_temp.ok(pg_temp.err($q$SELECT briofold_gateway_save('aaaaaaaa-0000-4000-8000-000000000001','live',NULL,'{"provider":"bkash","type":"agent","min_amount_minor":500,"max_amount_minor":100}',NULL)$q$)='P7201','min above max');
SELECT pg_temp.ok(pg_temp.err($q$SELECT briofold_gateway_save('aaaaaaaa-0000-4000-8000-000000000001','live',NULL,'{"provider":"bkash","type":"agent","percent_charge_bp":10001}',NULL)$q$)='P7201','over 100%');
SELECT pg_temp.ok(pg_temp.err($q$SELECT briofold_gateway_save('aaaaaaaa-0000-4000-8000-000000000001','live',NULL,'{"provider":"bkash","type":"agent","fixed_charge_minor":"ten"}',NULL)$q$)='P7201','not a number');
SELECT pg_temp.ok(pg_temp.err($q$SELECT briofold_gateway_save('aaaaaaaa-0000-4000-8000-000000000001','live',NULL,'{"provider":"bkash","type":"agent","fixed_charge_minor":-1}',NULL)$q$)='P7201','negative charge');

CREATE TEMP TABLE t AS SELECT briofold_gateway_save('aaaaaaaa-0000-4000-8000-000000000001','live',NULL,
 '{"provider":"bkash","type":"agent","display_name":"bKash Agent","max_amount_minor":0,"percent_charge_bp":185}',NULL) j;
SELECT pg_temp.ok((SELECT j->>'type' FROM t)='agent' AND (SELECT j->>'min_amount_minor' FROM t) IS NULL
 AND (SELECT j->>'max_amount_minor' FROM t)='0' AND (SELECT (j->>'version')::int FROM t)=1,'created, null min, 0 max kept');
SELECT pg_temp.ok((SELECT (j->>'position')::int FROM t)=(SELECT max(position) FROM briofold_gateways
 WHERE workspace_id='aaaaaaaa-0000-4000-8000-000000000001'),'new gateway goes last');

-- Quote: max 0 means nothing passes; disabled; below minimum; payable must be positive
SELECT pg_temp.ok(briofold_gateway_quote('aaaaaaaa-0000-4000-8000-000000000001','live',(SELECT (j->>'id')::uuid FROM t),100)->>'reason'='ABOVE_MAXIMUM','max 0 is a real limit');
UPDATE t SET j=briofold_gateway_save('aaaaaaaa-0000-4000-8000-000000000001','live',(j->>'id')::uuid,
 '{"display_name":"bKash Agent","min_amount_minor":1000,"percent_charge_bp":185}',(j->>'version')::bigint);
SELECT pg_temp.ok((SELECT j->>'max_amount_minor' FROM t) IS NULL AND (SELECT (j->>'version')::int FROM t)=2,'update clears max (no limit), version 2');
SELECT pg_temp.ok(briofold_gateway_quote('aaaaaaaa-0000-4000-8000-000000000001','live',(SELECT (j->>'id')::uuid FROM t),999)->>'reason'='BELOW_MINIMUM','below minimum');
SELECT pg_temp.ok((briofold_gateway_quote('aaaaaaaa-0000-4000-8000-000000000001','live',(SELECT (j->>'id')::uuid FROM t),100000)->>'offered')::boolean
 AND briofold_gateway_quote('aaaaaaaa-0000-4000-8000-000000000001','live',(SELECT (j->>'id')::uuid FROM t),100000)->>'payable_minor'='101850','offered with charge');
SELECT pg_temp.ok(pg_temp.err($q$SELECT briofold_gateway_save('aaaaaaaa-0000-4000-8000-000000000001','live',(SELECT (j->>'id')::uuid FROM t),'{}',1)$q$)='P7202','stale version refused');
SELECT pg_temp.ok(pg_temp.err($q$SELECT briofold_gateway_save('aaaaaaaa-0000-4000-8000-000000000001','live',(SELECT (j->>'id')::uuid FROM t),'{"type":"merchant"}',2)$q$)='P7201','type cannot change');
SELECT pg_temp.ok(pg_temp.err($q$SELECT briofold_gateway_save('aaaaaaaa-0000-4000-8000-000000000001','live','00000000-0000-4000-8000-00000000ffff','{}',1)$q$)='P7204','missing gateway');

UPDATE t SET j=briofold_gateway_action('aaaaaaaa-0000-4000-8000-000000000001','live',(j->>'id')::uuid,'status','disabled',(j->>'version')::bigint);
SELECT pg_temp.ok(briofold_gateway_quote('aaaaaaaa-0000-4000-8000-000000000001','live',(SELECT (j->>'id')::uuid FROM t),100000)->>'reason'='DISABLED','disabled not offered');

-- Discount bigger than the amount is never offered
CREATE TEMP TABLE d AS SELECT briofold_gateway_save('aaaaaaaa-0000-4000-8000-000000000001','live',NULL,
 '{"provider":"nagad","type":"personal","fixed_discount_minor":5000}',NULL) j;
SELECT pg_temp.ok(briofold_gateway_quote('aaaaaaaa-0000-4000-8000-000000000001','live',(SELECT (j->>'id')::uuid FROM d),5000)->>'reason'='PAYABLE_NOT_POSITIVE','payable 0 not offered');

-- Duplicate (disabled copy, no accounts), delete refused while accounts linked, delete ok when empty
CREATE TEMP TABLE c AS SELECT briofold_gateway_action('aaaaaaaa-0000-4000-8000-000000000001','live',
 (SELECT gateway_id FROM financial_receiving_accounts WHERE id='00000000-0000-4000-8000-0000000000a1'),'duplicate',NULL,NULL) j;
SELECT pg_temp.ok((SELECT j->>'status' FROM c)='disabled' AND (SELECT (j->>'account_count')::int FROM c)=0,'duplicate is disabled and empty');
SELECT pg_temp.ok(pg_temp.err($q$SELECT briofold_gateway_action('aaaaaaaa-0000-4000-8000-000000000001','live',
 (SELECT gateway_id FROM financial_receiving_accounts WHERE id='00000000-0000-4000-8000-0000000000a1'),'delete',NULL,
 (SELECT version FROM briofold_gateways WHERE id=(SELECT gateway_id FROM financial_receiving_accounts WHERE id='00000000-0000-4000-8000-0000000000a1')))$q$)='P7203','cannot delete with accounts');
SELECT pg_temp.ok((briofold_gateway_action('aaaaaaaa-0000-4000-8000-000000000001','live',(SELECT (j->>'id')::uuid FROM c),'delete',NULL,
 (SELECT (j->>'version')::bigint FROM c))->>'deleted')::boolean,'empty gateway deleted');
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM jsonb_array_elements(briofold_gateway_list('aaaaaaaa-0000-4000-8000-000000000001','live')->'items') x
 WHERE x->>'id'=(SELECT j->>'id' FROM c)),'deleted gateway not listed');

-- Reorder: listed first, others keep order; another shop's id refused
SELECT pg_temp.ok((briofold_gateway_reorder('aaaaaaaa-0000-4000-8000-000000000001','live',ARRAY[(SELECT (j->>'id')::uuid FROM d)])->'items'->0->>'id')=(SELECT j->>'id' FROM d),'reordered first');
SELECT pg_temp.ok(pg_temp.err($q$SELECT briofold_gateway_reorder('aaaaaaaa-0000-4000-8000-000000000001','live',
 ARRAY[(SELECT id FROM briofold_gateways WHERE workspace_id='bbbbbbbb-0000-4000-8000-000000000002' LIMIT 1)])$q$)='P7201','foreign id refused');

-- Shop B cannot change shop A's gateway even with the right id
SELECT pg_temp.as_shop('bbbbbbbb-0000-4000-8000-000000000002');
SELECT pg_temp.ok(briofold_gateway_save('aaaaaaaa-0000-4000-8000-000000000001','live',(SELECT (j->>'id')::uuid FROM d),'{}',1) IS NULL,'cross-shop write refused');
SELECT pg_temp.ok(pg_temp.err($q$SELECT briofold_gateway_save('bbbbbbbb-0000-4000-8000-000000000002','live',(SELECT (j->>'id')::uuid FROM d),'{}',1)$q$)='P7204','id of another shop not found');

-- The runtime role can call the functions but not touch the tables
SELECT pg_temp.ok(has_function_privilege('ekmivo_finance_reader','briofold_gateway_save(uuid,text,uuid,jsonb,bigint)','EXECUTE'),'reader may call save');
SELECT pg_temp.ok(NOT has_table_privilege('ekmivo_finance_reader','briofold_gateways','SELECT'),'reader has no table access');
SELECT pg_temp.ok(NOT has_function_privilege('ekmivo_finance_reader','briofold_gateway_scope(uuid,text)','EXECUTE'),'scope helper not granted');

SELECT 'payment gateways 0272: all checks passed' AS result;
