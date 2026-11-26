-- Assertions for 0273 (after 0272 and 0273 each ran twice on payment-gateways-stub.sql).
CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean,msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF cond IS NOT TRUE THEN RAISE EXCEPTION 'FAILED: %',msg; END IF; END $$;
CREATE OR REPLACE FUNCTION pg_temp.err(q text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN EXECUTE q; RETURN 'none'; EXCEPTION WHEN others THEN RETURN SQLSTATE; END $$;
SELECT set_config('ekmivo.workspace_id','aaaaaaaa-0000-4000-8000-000000000001',false),set_config('ekmivo.environment','live',false);
CREATE TEMP TABLE ids AS SELECT
 '00000000-0000-4000-8000-0000000000a1'::uuid a1,'00000000-0000-4000-8000-0000000000a2'::uuid a2,
 '00000000-0000-4000-8000-0000000000a3'::uuid a3,
 (SELECT gateway_id FROM briofold_gateway_accounts WHERE account_id='00000000-0000-4000-8000-0000000000a1') gb,
 (SELECT gateway_id FROM briofold_gateway_accounts WHERE account_id='00000000-0000-4000-8000-0000000000a3') gn,
 'aaaaaaaa-0000-4000-8000-000000000001'::uuid ws;

-- No phone online: nothing can be picked
SELECT pg_temp.ok(briofold_gateway_pick_account((SELECT ws FROM ids),'live',(SELECT gb FROM ids),10000)->>'reason'='NO_ACCOUNT_AVAILABLE','offline numbers are not given out');
-- Both bKash numbers online through their own device
INSERT INTO pg06_devices(account_id,heartbeat_at) SELECT a1,now() FROM ids UNION ALL SELECT a2,now() FROM ids;

-- Rotation: never-used first (created order), then least recently given
SELECT pg_temp.ok((briofold_gateway_pick_account((SELECT ws FROM ids),'live',(SELECT gb FROM ids),10000)->>'account_id')::uuid=(SELECT a1 FROM ids),'first number first');
INSERT INTO payment_attempts(receiving_account_id,issued_at) SELECT a1,now() FROM ids;
SELECT pg_temp.ok((briofold_gateway_pick_account((SELECT ws FROM ids),'live',(SELECT gb FROM ids),10000)->>'account_id')::uuid=(SELECT a2 FROM ids),'then the other number');
INSERT INTO payment_attempts(receiving_account_id,issued_at) SELECT a2,now()+interval '1 second' FROM ids;
SELECT pg_temp.ok((briofold_gateway_pick_account((SELECT ws FROM ids),'live',(SELECT gb FROM ids),10000)->>'account_id')::uuid=(SELECT a1 FROM ids),'back to the first');

-- Limits: null = no limit, 0 = real 0, would-cross is skipped
SELECT pg_temp.ok(pg_temp.err($q$SELECT briofold_account_set_limits((SELECT ws FROM ids),'live',(SELECT a1 FROM ids),'{"daily_count":-1}')$q$)='P7201','negative limit');
SELECT pg_temp.ok(pg_temp.err($q$SELECT briofold_account_set_limits((SELECT ws FROM ids),'live',(SELECT a1 FROM ids),'{"weekly":5}')$q$)='P7201','unknown limit');
SELECT briofold_account_set_limits((SELECT ws FROM ids),'live',(SELECT a1 FROM ids),'{"daily_amount_minor":0}');
SELECT pg_temp.ok((briofold_gateway_pick_account((SELECT ws FROM ids),'live',(SELECT gb FROM ids),10000)->>'account_id')::uuid=(SELECT a2 FROM ids),'daily amount 0 blocks the first number');
SELECT briofold_account_set_limits((SELECT ws FROM ids),'live',(SELECT a1 FROM ids),'{"daily_amount_minor":null}');
SELECT pg_temp.ok((SELECT daily_amount_minor IS NULL FROM briofold_account_limits WHERE account_id=(SELECT a1 FROM ids)),'null clears the limit');

-- Usage counts incoming money today (Dhaka) and this month; outgoing ignored
INSERT INTO financial_receipt_observations(receiving_account_id,amount_minor,direction,original_transaction_at)
 SELECT a1,2000000,'incoming',now() FROM ids UNION ALL SELECT a1,999999,'outgoing',now() FROM ids;
SELECT pg_temp.ok(briofold_account_usage((SELECT a1 FROM ids))->>'day_amount_minor'='2000000','usage counts incoming only');
SELECT briofold_account_set_limits((SELECT ws FROM ids),'live',(SELECT a1 FROM ids),'{"daily_amount_minor":2500000,"monthly_count":5}');
SELECT pg_temp.ok(briofold_account_limit_reason((SELECT a1 FROM ids),400000) IS NULL,'20000+4000 Tk fits a 25000 Tk day');
SELECT pg_temp.ok(briofold_account_limit_reason((SELECT a1 FROM ids),600000)='DAILY_AMOUNT','20000+6000 Tk crosses the day');
SELECT briofold_account_set_limits((SELECT ws FROM ids),'live',(SELECT a1 FROM ids),'{"daily_count":1}');
SELECT pg_temp.ok(briofold_account_limit_reason((SELECT a1 FROM ids),100)='DAILY_COUNT','second payment of the day crosses a count of 1');

-- Both blocked: no number available; a2 at 0 monthly count
SELECT briofold_account_set_limits((SELECT ws FROM ids),'live',(SELECT a2 FROM ids),'{"monthly_count":0}');
SELECT pg_temp.ok(briofold_gateway_pick_account((SELECT ws FROM ids),'live',(SELECT gb FROM ids),100)->>'reason'='NO_ACCOUNT_AVAILABLE','all numbers at their limit');

-- Gateway list of numbers shows usage and the reason for a given amount
SELECT pg_temp.ok(jsonb_array_length(briofold_gateway_accounts((SELECT ws FROM ids),'live',(SELECT gb FROM ids),100)->'items')=2,'two numbers listed');
SELECT pg_temp.ok((SELECT x->>'limit_reason' FROM jsonb_array_elements(briofold_gateway_accounts((SELECT ws FROM ids),'live',(SELECT gb FROM ids),100)->'items') x
 WHERE (x->>'id')::uuid=(SELECT a2 FROM ids))='MONTHLY_COUNT','reason per number');

-- Assign: method must match the provider; move works; other shop refused
SELECT pg_temp.ok(pg_temp.err($q$SELECT briofold_account_assign((SELECT ws FROM ids),'live',(SELECT a3 FROM ids),(SELECT gb FROM ids))$q$)='P7201','Nagad number cannot join a bKash gateway');
CREATE TEMP TABLE g2 AS SELECT (briofold_gateway_save((SELECT ws FROM ids),'live',NULL,'{"provider":"bkash","type":"merchant"}',NULL)->>'id')::uuid id;
SELECT briofold_account_assign((SELECT ws FROM ids),'live',(SELECT a2 FROM ids),(SELECT id FROM g2));
SELECT pg_temp.ok((SELECT gateway_id FROM briofold_gateway_accounts WHERE account_id=(SELECT a2 FROM ids))=(SELECT id FROM g2),'moved to the merchant gateway');
SELECT pg_temp.ok(jsonb_array_length(briofold_gateway_accounts((SELECT ws FROM ids),'live',(SELECT gb FROM ids),NULL)->'items')=1,'old gateway lost it');
CREATE TEMP TABLE g3 AS SELECT (briofold_gateway_save((SELECT ws FROM ids),'live',NULL,'{"provider":"upay","type":"personal"}',NULL)->>'id')::uuid id;
SELECT pg_temp.ok(briofold_gateway_pick_account((SELECT ws FROM ids),'live',(SELECT id FROM g3),100)->>'reason'='NO_ACCOUNT','empty gateway');

SELECT set_config('ekmivo.workspace_id','bbbbbbbb-0000-4000-8000-000000000002',false);
SELECT pg_temp.ok(briofold_account_assign('aaaaaaaa-0000-4000-8000-000000000001','live',(SELECT a1 FROM ids),(SELECT gb FROM ids)) IS NULL,'other shop cannot assign');
SELECT pg_temp.ok(pg_temp.err($q$SELECT briofold_account_set_limits('bbbbbbbb-0000-4000-8000-000000000002','live',(SELECT a1 FROM ids),'{}')$q$)='P7204','other shop number not found');
SELECT pg_temp.ok(NOT has_function_privilege('ekmivo_finance_reader','briofold_account_usage(uuid)','EXECUTE'),'internal helper not granted');

SELECT 'gateway accounts 0273: all checks passed' AS result;
