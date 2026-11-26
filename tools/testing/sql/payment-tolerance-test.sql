-- Assertions for 0275 with the production matcher (production-matcher-0271.sql) and 0272-0275 applied twice.
CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean,msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF cond IS NOT TRUE THEN RAISE EXCEPTION 'FAILED: %',msg; END IF; END $$;
CREATE OR REPLACE FUNCTION pg_temp.err(q text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN EXECUTE q; RETURN 'none'; EXCEPTION WHEN others THEN RETURN SQLSTATE; END $$;
SELECT set_config('ekmivo.workspace_id','aaaaaaaa-0000-4000-8000-000000000001',false),set_config('ekmivo.environment','live',false);

-- A checkout on one number for one payer, and the SMS that arrived for it. Returns the receipt id.
CREATE OR REPLACE FUNCTION pg_temp.pay(account uuid,payer text,due bigint,sent bigint) RETURNS uuid LANGUAGE plpgsql AS $$
DECLARE i uuid:=gen_random_uuid(); ev uuid:=gen_random_uuid(); o uuid:=gen_random_uuid();
BEGIN
 INSERT INTO payment_intents(id,amount_minor,merchant_reference) VALUES(i,due,'order-'||payer);
 INSERT INTO payment_attempts(intent_id,receiving_account_id,payer_hmac,amount_minor,issued_at)
  VALUES(i,account,repeat(payer,64),due,now());
 INSERT INTO financial_inbound_events(id,workspace_id,environment) VALUES(ev,'aaaaaaaa-0000-4000-8000-000000000001','live');
 INSERT INTO financial_receipt_observations(id,receiving_account_id,payer_hmac,amount_minor,direction,original_transaction_at,inbound_event_id)
  VALUES(o,account,repeat(payer,64),sent,'incoming',now(),ev);
 INSERT INTO pg07_receipt_results(workspace_id,environment,observation_id,status,reason)
  VALUES('aaaaaaaa-0000-4000-8000-000000000001','live',o,'pending','');
 RETURN o;
END $$;
CREATE OR REPLACE FUNCTION pg_temp.intent_of(o uuid) RETURNS uuid LANGUAGE sql AS $$
 SELECT p.intent_id FROM payment_attempts p JOIN financial_receipt_observations x ON x.payer_hmac=p.payer_hmac AND x.id=o
 ORDER BY p.issued_at DESC LIMIT 1 $$;
CREATE OR REPLACE FUNCTION pg_temp.state(o uuid) RETURNS text LANGUAGE sql AS $$
 SELECT pg05_intent_state('aaaaaaaa-0000-4000-8000-000000000001','live',pg_temp.intent_of(o)) $$;
CREATE OR REPLACE FUNCTION pg_temp.reason(o uuid) RETURNS text LANGUAGE sql AS $$
 SELECT status||'/'||reason FROM pg07_receipt_results WHERE observation_id=o $$;

-- Migration guard: the three replaced functions carry the 0275 marker
SELECT pg_temp.ok(position('0275 tolerance' IN pg_get_functiondef('pg07_match(uuid,bigint)'::regprocedure))>0
 AND position('0275 tolerance' IN pg_get_functiondef('financial_verify_payment_fields()'::regprocedure))>0
 AND position('0275 tolerance' IN pg_get_functiondef('pg06_phone_candidate(uuid,text,text,bigint,timestamptz,text)'::regprocedure))>0,'functions replaced');
SELECT pg_temp.ok((SELECT underpaid_tolerance_minor=0 AND overpaid_tolerance_minor=0 FROM briofold_gateways WHERE legacy_backfill LIMIT 1),'backfilled gateways stay exact');

-- Number a1 stays in the backfilled bKash gateway (exact). Number a2 moves to a new bKash Agent gateway:
-- created with defaults (underpaid 0, overpaid 10 Tk), then underpaid set to 3 Tk.
CREATE TEMP TABLE gw AS SELECT briofold_gateway_save('aaaaaaaa-0000-4000-8000-000000000001','live',NULL,'{"provider":"bkash","type":"agent"}',NULL) j;
SELECT pg_temp.ok((SELECT (j->>'underpaid_tolerance_minor')::bigint=0 AND (j->>'overpaid_tolerance_minor')::bigint=1000 FROM gw),'new gateway: underpaid 0, overpaid 10 Tk');
UPDATE gw SET j=briofold_gateway_save('aaaaaaaa-0000-4000-8000-000000000001','live',(j->>'id')::uuid,
 '{"underpaid_tolerance_minor":300,"overpaid_tolerance_minor":1000}',(j->>'version')::bigint);
SELECT pg_temp.ok(pg_temp.err($q$SELECT briofold_gateway_save('aaaaaaaa-0000-4000-8000-000000000001','live',(SELECT (j->>'id')::uuid FROM gw),'{"underpaid_tolerance_minor":-1}',(SELECT (j->>'version')::bigint FROM gw))$q$)='P7201','negative tolerance refused');
SELECT briofold_account_assign('aaaaaaaa-0000-4000-8000-000000000001','live','00000000-0000-4000-8000-0000000000a2',(SELECT (j->>'id')::uuid FROM gw));

CREATE TEMP TABLE r(name text PRIMARY KEY,o uuid,res text);
-- 1. Exact amount on the exact gateway: unchanged behaviour
INSERT INTO r VALUES('exact',pg_temp.pay('00000000-0000-4000-8000-0000000000a1','1',100000,100000));
UPDATE r SET res=pg07_match(o,1) WHERE name='exact';
SELECT pg_temp.ok((SELECT res FROM r WHERE name='exact')='matched' AND pg_temp.state((SELECT o FROM r WHERE name='exact'))='completed','exact payment completes');
-- 2. 5 Tk extra on the exact gateway: Pending as before (excess)
INSERT INTO r VALUES('old_over',pg_temp.pay('00000000-0000-4000-8000-0000000000a1','2',100000,100500));
UPDATE r SET res=pg07_match(o,1) WHERE name='old_over';
SELECT pg_temp.ok((SELECT res FROM r WHERE name='old_over')='unmatched'
 AND pg_temp.reason((SELECT o FROM r WHERE name='old_over'))='unmatched/excess_amount_requires_reconciliation','exact gateway: 5 Tk extra is not paid');
-- 3. 5 Tk extra within 10 Tk: verified payment of 1005, 1000 allocated, checkout paid
INSERT INTO r VALUES('over_ok',pg_temp.pay('00000000-0000-4000-8000-0000000000a2','3',100000,100500));
SELECT pg_temp.ok((SELECT over_tolerance_minor=1000 AND under_tolerance_minor=300 FROM payment_attempts WHERE payer_hmac=repeat('3',64)),'attempt copied the gateway tolerance');
UPDATE r SET res=pg07_match(o,1) WHERE name='over_ok';
SELECT pg_temp.ok((SELECT res FROM r WHERE name='over_ok')='matched','overpaid within tolerance matches');
SELECT pg_temp.ok((SELECT verified_amount_minor FROM financial_payments WHERE observation_id=(SELECT o FROM r WHERE name='over_ok'))=100500,'verified amount is what arrived');
SELECT pg_temp.ok((SELECT amount_minor FROM financial_allocations a JOIN financial_payments p ON p.id=a.payment_id
 WHERE p.observation_id=(SELECT o FROM r WHERE name='over_ok'))=100000,'allocation is the checkout amount');
SELECT pg_temp.ok(pg_temp.state((SELECT o FROM r WHERE name='over_ok'))='completed','checkout paid');
-- 4. 20 Tk extra: beyond tolerance, Pending
INSERT INTO r VALUES('over_far',pg_temp.pay('00000000-0000-4000-8000-0000000000a2','4',100000,102000));
UPDATE r SET res=pg07_match(o,1) WHERE name='over_far';
SELECT pg_temp.ok((SELECT res FROM r WHERE name='over_far')='unmatched'
 AND pg_temp.reason((SELECT o FROM r WHERE name='over_far'))='unmatched/excess_amount_requires_reconciliation','20 Tk extra goes to Pending');
-- 5. 2 Tk short within 3 Tk: shop-confirmed automatically, no SMS-verified payment
INSERT INTO r VALUES('under_ok',pg_temp.pay('00000000-0000-4000-8000-0000000000a2','5',100000,99800));
UPDATE r SET res=pg07_match(o,1) WHERE name='under_ok';
SELECT pg_temp.ok((SELECT res FROM r WHERE name='under_ok')='unmatched','short payment is not an SMS-verified payment');
SELECT pg_temp.ok(pg_temp.state((SELECT o FROM r WHERE name='under_ok'))='completed','but the checkout is paid (shop-confirmed)');
SELECT pg_temp.ok((SELECT state='approved' AND decision_reason='auto_underpaid_tolerance' FROM briofold_review_cases WHERE observation_id=(SELECT o FROM r WHERE name='under_ok')),'recorded as automatic approval');
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM financial_payments WHERE observation_id=(SELECT o FROM r WHERE name='under_ok')),'no verified payment row');
-- 6. 10 Tk short: Pending for the owner
INSERT INTO r VALUES('under_far',pg_temp.pay('00000000-0000-4000-8000-0000000000a2','6',100000,99000));
UPDATE r SET res=pg07_match(o,1) WHERE name='under_far';
SELECT pg_temp.ok((SELECT res FROM r WHERE name='under_far')='unmatched' AND pg_temp.state((SELECT o FROM r WHERE name='under_far'))<>'completed','10 Tk short not paid');
SELECT pg_temp.ok(EXISTS(SELECT 1 FROM jsonb_array_elements(briofold_review_list('aaaaaaaa-0000-4000-8000-000000000001','live','open')->'items') x
 WHERE x->>'kind'='underpaid' AND (x->>'difference_minor')::bigint=-1000),'10 Tk short is in the Pending list');
-- 7. Gateway changed after the checkout started: the checkout keeps its tolerance
INSERT INTO r VALUES('snapshot',pg_temp.pay('00000000-0000-4000-8000-0000000000a2','7',100000,100500));
UPDATE gw SET j=briofold_gateway_save('aaaaaaaa-0000-4000-8000-000000000001','live',(j->>'id')::uuid,
 '{"underpaid_tolerance_minor":0,"overpaid_tolerance_minor":0}',(SELECT version FROM briofold_gateways WHERE id=(j->>'id')::uuid));
UPDATE r SET res=pg07_match(o,1) WHERE name='snapshot';
SELECT pg_temp.ok((SELECT res FROM r WHERE name='snapshot')='matched','tolerance fixed when the checkout started');
-- 8. Two open checkouts the same SMS could overpay: ambiguous, nothing paid
UPDATE gw SET j=briofold_gateway_save('aaaaaaaa-0000-4000-8000-000000000001','live',(j->>'id')::uuid,
 '{"overpaid_tolerance_minor":1000}',(SELECT version FROM briofold_gateways WHERE id=(j->>'id')::uuid));
INSERT INTO payment_intents(id,amount_minor) VALUES('99999999-0000-4000-8000-000000000008',100300);
INSERT INTO payment_attempts(intent_id,receiving_account_id,payer_hmac,amount_minor,issued_at)
 VALUES('99999999-0000-4000-8000-000000000008','00000000-0000-4000-8000-0000000000a2',repeat('8',64),100300,now());
INSERT INTO r VALUES('two',pg_temp.pay('00000000-0000-4000-8000-0000000000a2','8',100000,100500));
UPDATE r SET res=pg07_match(o,1) WHERE name='two';
SELECT pg_temp.ok((SELECT res FROM r WHERE name='two')='ambiguous'
 AND pg_temp.reason((SELECT o FROM r WHERE name='two'))='ambiguous/multiple_tolerance_candidates','two possible checkouts: no automatic choice');
SELECT pg_temp.ok(NOT EXISTS(SELECT 1 FROM financial_payments WHERE observation_id=(SELECT o FROM r WHERE name='two')),'nothing paid');
-- 9. No upper limit (null): 5000 Tk extra still pays
UPDATE gw SET j=briofold_gateway_save('aaaaaaaa-0000-4000-8000-000000000001','live',(j->>'id')::uuid,
 '{"overpaid_tolerance_minor":null}',(SELECT version FROM briofold_gateways WHERE id=(j->>'id')::uuid));
SELECT pg_temp.ok((SELECT overpaid_tolerance_minor IS NULL FROM briofold_gateways WHERE id=(SELECT (j->>'id')::uuid FROM gw)),'explicit null = no limit');
INSERT INTO r VALUES('nolimit',pg_temp.pay('00000000-0000-4000-8000-0000000000a2','9',100000,600000));
UPDATE r SET res=pg07_match(o,1) WHERE name='nolimit';
SELECT pg_temp.ok((SELECT res FROM r WHERE name='nolimit')='matched','no limit: any extra is accepted');
-- 10. A second SMS for an already paid checkout is a duplicate
INSERT INTO financial_inbound_events(id,workspace_id,environment) VALUES('77777777-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001','live');
INSERT INTO financial_receipt_observations(id,receiving_account_id,payer_hmac,amount_minor,direction,original_transaction_at,inbound_event_id)
 VALUES('77777777-0000-4000-8000-000000000002','00000000-0000-4000-8000-0000000000a2',repeat('3',64),100500,'incoming',now(),'77777777-0000-4000-8000-000000000001');
INSERT INTO pg07_receipt_results(workspace_id,environment,observation_id,status) VALUES('aaaaaaaa-0000-4000-8000-000000000001','live','77777777-0000-4000-8000-000000000002','pending');
INSERT INTO r VALUES('dup','77777777-0000-4000-8000-000000000002',pg07_match('77777777-0000-4000-8000-000000000002',1));
SELECT pg_temp.ok((SELECT res FROM r WHERE name='dup')='duplicate','second SMS for a paid checkout');
-- 11. The trigger still refuses a verified payment below the checkout amount or above its tolerance
SELECT pg_temp.ok(pg_temp.err($q$INSERT INTO financial_payments(workspace_id,environment,attempt_id,observation_id,verified_amount_minor,currency,verification_method,policy_version)
 SELECT 'aaaaaaaa-0000-4000-8000-000000000001','live',p.id,(SELECT o FROM r WHERE name='under_far'),99000,'BDT','sms_match',1
 FROM payment_attempts p WHERE p.payer_hmac=repeat('6',64)$q$)='23514','trigger refuses an underpaid verified payment');
SELECT pg_temp.ok(pg_temp.err($q$INSERT INTO financial_payments(workspace_id,environment,attempt_id,observation_id,verified_amount_minor,currency,verification_method,policy_version)
 SELECT 'aaaaaaaa-0000-4000-8000-000000000001','live',p.id,(SELECT o FROM r WHERE name='over_far'),102000,'BDT','sms_match',1
 FROM payment_attempts p WHERE p.payer_hmac=repeat('4',64)$q$)='23514','trigger refuses an overpaid verified payment beyond tolerance');
-- 12. Phone attribution: an SMS 5 Tk over a 10 Tk-tolerance checkout is put on that checkout's number
INSERT INTO pg06_phones(id,workspace_id,environment,public_key,claimed_at,heartbeat_at) VALUES('66666666-0000-4000-8000-000000000001','aaaaaaaa-0000-4000-8000-000000000001','live','k',now(),now());
UPDATE gw SET j=briofold_gateway_save('aaaaaaaa-0000-4000-8000-000000000001','live',(j->>'id')::uuid,
 '{"overpaid_tolerance_minor":1000}',(SELECT version FROM briofold_gateways WHERE id=(j->>'id')::uuid));
INSERT INTO payment_intents(id,amount_minor) VALUES('99999999-0000-4000-8000-000000000012',50000);
INSERT INTO payment_attempts(intent_id,receiving_account_id,payer_hmac,amount_minor,issued_at)
 VALUES('99999999-0000-4000-8000-000000000012','00000000-0000-4000-8000-0000000000a2',repeat('c',64),50000,now());
SELECT pg_temp.ok(pg06_phone_candidate('66666666-0000-4000-8000-000000000001','bkash',repeat('c',64),50500,now(),'minute')='00000000-0000-4000-8000-0000000000a2','phone SMS within tolerance goes to the checkout number');
SELECT pg_temp.ok(pg06_phone_candidate('66666666-0000-4000-8000-000000000001','bkash',repeat('c',64),50000,now(),'minute')='00000000-0000-4000-8000-0000000000a2','exact amount unchanged');

SELECT 'payment tolerance 0275: all checks passed' AS result;
