-- Assertions for 0274 (after 0272-0274 ran twice on payment-gateways-stub.sql).
CREATE OR REPLACE FUNCTION pg_temp.ok(cond boolean,msg text) RETURNS void LANGUAGE plpgsql AS $$
BEGIN IF cond IS NOT TRUE THEN RAISE EXCEPTION 'FAILED: %',msg; END IF; END $$;
CREATE OR REPLACE FUNCTION pg_temp.err(q text) RETURNS text LANGUAGE plpgsql AS $$
BEGIN EXECUTE q; RETURN 'none'; EXCEPTION WHEN others THEN RETURN SQLSTATE; END $$;
SELECT set_config('ekmivo.workspace_id','aaaaaaaa-0000-4000-8000-000000000001',false),set_config('ekmivo.environment','live',false);

-- Three checkouts of 1000 Tk on bKash number a1 for payer A, one for payer B
INSERT INTO payment_intents(id,merchant_reference) VALUES
 ('11111111-0000-4000-8000-000000000001','order-1'),('11111111-0000-4000-8000-000000000002','order-2'),
 ('11111111-0000-4000-8000-000000000003','order-3');
INSERT INTO payment_attempts(intent_id,receiving_account_id,payer_hmac,issued_at) VALUES
 ('11111111-0000-4000-8000-000000000001','00000000-0000-4000-8000-0000000000a1',repeat('b',64),now()),
 ('11111111-0000-4000-8000-000000000002','00000000-0000-4000-8000-0000000000a1',repeat('c',64),now()),
 ('11111111-0000-4000-8000-000000000003','00000000-0000-4000-8000-0000000000a1',repeat('c',64),now()+interval '1 second');
-- SMS: payer B sent 998 (short), payer C sent 1000 twice-eligible (two open checkouts), payer B sent 1500 later? use separate
INSERT INTO financial_receipt_observations(id,receiving_account_id,payer_hmac,amount_minor,direction,original_transaction_at) VALUES
 ('22222222-0000-4000-8000-000000000001','00000000-0000-4000-8000-0000000000a1',repeat('b',64),99800,'incoming',now()),
 ('22222222-0000-4000-8000-000000000002','00000000-0000-4000-8000-0000000000a1',repeat('c',64),100000,'incoming',now()),
 ('22222222-0000-4000-8000-000000000003','00000000-0000-4000-8000-0000000000a1',repeat('d',64),100000,'incoming',now()),
 ('22222222-0000-4000-8000-000000000004','00000000-0000-4000-8000-0000000000a1',repeat('b',64),150000,'incoming',now());
INSERT INTO pg07_receipt_results(workspace_id,environment,observation_id,status,reason) VALUES
 ('aaaaaaaa-0000-4000-8000-000000000001','live','22222222-0000-4000-8000-000000000001','unmatched','partial_amount_requires_reconciliation'),
 ('aaaaaaaa-0000-4000-8000-000000000001','live','22222222-0000-4000-8000-000000000002','ambiguous','multiple_exact_candidates'),
 ('aaaaaaaa-0000-4000-8000-000000000001','live','22222222-0000-4000-8000-000000000003','unmatched','no_exact_five_field_candidate'),
 ('aaaaaaaa-0000-4000-8000-000000000001','live','22222222-0000-4000-8000-000000000004','unmatched','excess_amount_requires_reconciliation');

CREATE TEMP TABLE l AS SELECT briofold_review_list('aaaaaaaa-0000-4000-8000-000000000001','live','open') j;
SELECT pg_temp.ok(jsonb_array_length((SELECT j FROM l)->'items')=3,'three Pending cases; plain unmatched SMS is not Pending');
SELECT pg_temp.ok(briofold_review_sync('aaaaaaaa-0000-4000-8000-000000000001','live')=0,'sync is idempotent');
CREATE TEMP TABLE k AS SELECT x FROM jsonb_array_elements((SELECT j FROM l)->'items') x;
SELECT pg_temp.ok((SELECT x->>'kind' FROM k WHERE (x->>'received_amount_minor')::bigint=99800)='underpaid'
 AND (SELECT (x->>'difference_minor')::bigint FROM k WHERE (x->>'received_amount_minor')::bigint=99800)=-200,'998 Tk is underpaid by 2 Tk');
SELECT pg_temp.ok((SELECT x->>'suggested_intent_id' FROM k WHERE (x->>'received_amount_minor')::bigint=99800)='11111111-0000-4000-8000-000000000001','suggests order-1');
SELECT pg_temp.ok((SELECT x->>'kind' FROM k WHERE (x->>'received_amount_minor')::bigint=150000)='overpaid','1500 Tk is overpaid');
SELECT pg_temp.ok((SELECT x->>'kind' FROM k WHERE (x->>'received_amount_minor')::bigint=100000)='ambiguous'
 AND (SELECT x->>'suggested_intent_id' FROM k WHERE (x->>'received_amount_minor')::bigint=100000) IS NULL
 AND (SELECT jsonb_array_length(x->'candidates') FROM k WHERE (x->>'received_amount_minor')::bigint=100000)=2,'conflict lists both checkouts, suggests none');
SELECT pg_temp.ok(NOT ((SELECT j FROM l)::text ~ repeat('b',64)),'no payer hash in the answer');

-- Ambiguous needs a chosen checkout; approve the 998 for order-1; second SMS cannot take order-1
SELECT pg_temp.ok(pg_temp.err(format($q$SELECT briofold_review_approve('aaaaaaaa-0000-4000-8000-000000000001','live','%s',NULL)$q$,
 (SELECT x->>'id' FROM k WHERE x->>'kind'='ambiguous')))='P7201','ambiguous needs a choice');
SELECT pg_temp.ok(briofold_review_approve('aaaaaaaa-0000-4000-8000-000000000001','live',(SELECT (x->>'id')::uuid FROM k WHERE x->>'kind'='underpaid'),NULL)->>'state'='approved','owner accepts 998');
SELECT pg_temp.ok(pg05_intent_state('aaaaaaaa-0000-4000-8000-000000000001','live','11111111-0000-4000-8000-000000000001')='completed','order-1 completed as shop-confirmed');
SELECT pg_temp.ok((SELECT decision_reason FROM briofold_payment_proofs WHERE intent_id='11111111-0000-4000-8000-000000000001')='sms_review_underpaid','recorded as shop confirmation');
SELECT pg_temp.ok(pg_temp.err(format($q$SELECT briofold_review_approve('aaaaaaaa-0000-4000-8000-000000000001','live','%s','11111111-0000-4000-8000-000000000001')$q$,
 (SELECT x->>'id' FROM k WHERE x->>'kind'='overpaid')))='P7205','a paid checkout cannot take a second SMS');
SELECT pg_temp.ok(pg_temp.err(format($q$SELECT briofold_review_approve('aaaaaaaa-0000-4000-8000-000000000001','live','%s',NULL)$q$,
 (SELECT x->>'id' FROM k WHERE x->>'kind'='underpaid')))='P7205','decided case cannot be decided again');

-- Move: the ambiguous 1000 goes to order-3 chosen by the owner
SELECT pg_temp.ok(briofold_review_approve('aaaaaaaa-0000-4000-8000-000000000001','live',(SELECT (x->>'id')::uuid FROM k WHERE x->>'kind'='ambiguous'),'11111111-0000-4000-8000-000000000003')->>'decided_intent_id'='11111111-0000-4000-8000-000000000003','owner picks the checkout');
-- Reject the overpaid one
SELECT pg_temp.ok(briofold_review_reject('aaaaaaaa-0000-4000-8000-000000000001','live',(SELECT (x->>'id')::uuid FROM k WHERE x->>'kind'='overpaid'),'customer will be refunded')->>'state'='rejected','owner rejects');
SELECT pg_temp.ok(jsonb_array_length(briofold_review_list('aaaaaaaa-0000-4000-8000-000000000001','live','open')->'items')=0,'nothing open');
SELECT pg_temp.ok(jsonb_array_length(briofold_review_list('aaaaaaaa-0000-4000-8000-000000000001','live','approved')->'items')=2,'two approved');

-- Other shop
SELECT set_config('ekmivo.workspace_id','bbbbbbbb-0000-4000-8000-000000000002',false);
SELECT pg_temp.ok(briofold_review_list('aaaaaaaa-0000-4000-8000-000000000001','live','open') IS NULL,'other shop cannot read');
SELECT pg_temp.ok(pg_temp.err(format($q$SELECT briofold_review_reject('bbbbbbbb-0000-4000-8000-000000000002','live','%s',NULL)$q$,
 (SELECT x->>'id' FROM k WHERE x->>'kind'='overpaid')))='P7204','other shop case not found');
SELECT pg_temp.ok(NOT has_function_privilege('ekmivo_finance_reader','briofold_review_sync(uuid,text)','EXECUTE'),'sync not granted');

SELECT 'payment review 0274: all checks passed' AS result;
