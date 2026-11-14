-- Rule tests for 0249 (verification ladder). Runs inside one transaction and rolls back; needs a database that has the control schema.
-- psql -v ON_ERROR_STOP=1 -f infra/tests/0249_payment_settle_test.sql   -> prints "0249 tests passed"
BEGIN;
SET LOCAL session_replication_role=replica; -- fixture parents only (workspace owner, thread) are not created
INSERT INTO workspaces(id,name,service_mode,created_by) VALUES('00000000-0000-4000-8000-0000000000a1','T247','both','00000000-0000-4000-8000-0000000000a2');
SET LOCAL session_replication_role=origin;
INSERT INTO commerce_ai_settings(workspace_id,environment,cod_enabled,cod_charge_minor,advance_rule,advance_pct,ai_selling_enabled)
 VALUES('00000000-0000-4000-8000-0000000000a1','live',true,1000,'delivery',50,true);

CREATE FUNCTION pg_temp.new_order(ref text,sub bigint,ship bigint) RETURNS uuid LANGUAGE sql AS $$
 INSERT INTO commerce_orders(id,workspace_id,environment,reference,source,source_id,status,recipient,subtotal_minor,shipping_minor,total_minor,payment_state,draft_expires_at)
 VALUES(gen_random_uuid(),'00000000-0000-4000-8000-0000000000a1','live',ref,'ai',gen_random_uuid(),'draft','{"name":"x","address":"Dhaka"}',sub,ship,sub+ship,'awaiting',now()+interval '1 day') RETURNING id $$;
CREATE FUNCTION pg_temp.new_claim(oid uuid) RETURNS uuid LANGUAGE sql AS $$
 INSERT INTO commerce_payment_claims(workspace_id,environment,order_id,method,transaction_digest,transaction_last4,payer_digest)
 VALUES('00000000-0000-4000-8000-0000000000a1','live',oid,'bkash',encode(sha256(gen_random_uuid()::text::bytea),'hex'),'1234',repeat('a',64)) RETURNING id $$;


CREATE FUNCTION pg_temp.d(t text) RETURNS text LANGUAGE sql AS $$ SELECT encode(sha256(t::bytea),'hex') $$;
CREATE FUNCTION pg_temp.rc(ref text,amt bigint,at timestamptz,payer text,st text DEFAULT 'unmatched') RETURNS jsonb LANGUAGE sql AS $$
 SELECT jsonb_build_object('reference_digest',pg_temp.d(ref),'method','bkash','amount_minor',amt,'at',at,'direction','incoming','payer_hmac',pg_temp.d(payer),'allocated',false,'checkout_status',st) $$;
DO $t$
DECLARE w uuid:='00000000-0000-4000-8000-0000000000a1';o uuid;o2 uuid;th uuid;th2 uuid;r jsonb;x commerce_orders%ROWTYPE;me text:=pg_temp.d('017me');
BEGIN
 UPDATE commerce_ai_settings SET advance_rule='none',wrong_trx_limit=20 WHERE workspace_id=w;
 -- S1 sender number alone: exactly one unused receipt with the exact amount -> confirmed, no TrxID asked
 o:=pg_temp.new_order('S1',10000,13000);SELECT source_id INTO th FROM commerce_orders WHERE id=o;
 r:=briofold_ai_payment_settle(w,'live',th,jsonb_build_object('payer_digest',me,'payer_last3','123','receipts',jsonb_build_array(pg_temp.rc('s1a',23000,now(),'017me'),pg_temp.rc('s1b',500,now(),'017me'))));
 SELECT * INTO x FROM commerce_orders WHERE id=o;
 ASSERT (r->>'verified')::boolean AND r->>'matched_by'='sender_number' AND x.status='confirmed' AND x.payment_state='verified' AND x.paid_minor=23000,'S1 '||r::text;
 -- the receipt that paid S1 can never pay another order
 o2:=pg_temp.new_order('S1x',10000,13000);SELECT source_id INTO th2 FROM commerce_orders WHERE id=o2;
 r:=briofold_ai_payment_settle(w,'live',th2,jsonb_build_object('payer_digest',me,'receipts',jsonb_build_array(pg_temp.rc('s1a',23000,now(),'017me'))));
 ASSERT NOT (r->>'verified')::boolean AND r->>'result'='not_found' AND r->>'next'='ask_transaction_id','S1 reuse '||r::text;
 r:=briofold_ai_payment_settle(w,'live',th2,jsonb_build_object('payer_digest',me,'transaction_digest',pg_temp.d('s1a'),'receipt',pg_temp.rc('s1a',23000,now(),'017me')));
 ASSERT r->>'result'='already_used','S1 trx reuse '||r::text;

 -- S2 no certainty -> ask for the TrxID, nothing is written
 o:=pg_temp.new_order('S2',10000,13000);SELECT source_id INTO th FROM commerce_orders WHERE id=o;
 r:=briofold_ai_payment_settle(w,'live',th,jsonb_build_object('payer_digest',me,'receipts',jsonb_build_array(pg_temp.rc('s2a',23000,now(),'017me'),pg_temp.rc('s2b',23000,now(),'017me'))));
 ASSERT r->>'result'='ambiguous' AND r->>'next'='ask_transaction_id','S2 two equal '||r::text;
 r:=briofold_ai_payment_settle(w,'live',th,jsonb_build_object('payer_digest',me,'receipts',jsonb_build_array(pg_temp.rc('s2c',22900,now(),'017me'))));
 ASSERT r->>'result'='amount_mismatch','S2 one taka short is not exact '||r::text;
 r:=briofold_ai_payment_settle(w,'live',th,jsonb_build_object('payer_digest',me,'receipts',jsonb_build_array(pg_temp.rc('s2d',23000,now()-interval '3 days','017me'))));
 ASSERT r->>'result'='not_found','S2 payment from before the conversation '||r::text;
 r:=briofold_ai_payment_settle(w,'live',th,jsonb_build_object('payer_digest',me,'receipts','[]'::jsonb));
 ASSERT r->>'result'='not_found';
 SELECT * INTO x FROM commerce_orders WHERE id=o;
 ASSERT x.status='draft' AND x.payment_state='awaiting' AND x.paid_minor=0 AND (SELECT count(*) FROM commerce_payment_claims WHERE order_id=o)=0,'S2 must not write';

 -- S3 TrxID with the wrong sender is refused; the right sender then confirms with the same TrxID
 r:=briofold_ai_payment_settle(w,'live',th,jsonb_build_object('payer_digest',pg_temp.d('019other'),'transaction_digest',pg_temp.d('s2a'),'transaction_last4','AB12','receipt',pg_temp.rc('s2a',23000,now(),'017me')));
 SELECT * INTO x FROM commerce_orders WHERE id=o;
 ASSERT r->>'result'='sender_mismatch' AND x.payment_state='awaiting' AND x.paid_minor=0,'S3a '||r::text;
 r:=briofold_ai_payment_settle(w,'live',th,jsonb_build_object('payer_digest',me,'transaction_digest',pg_temp.d('s2a'),'transaction_last4','AB12','receipt',pg_temp.rc('s2a',23000,now(),'017me')));
 SELECT * INTO x FROM commerce_orders WHERE id=o;
 ASSERT (r->>'verified')::boolean AND r->>'matched_by'='transaction_id' AND x.status='confirmed' AND x.paid_minor=23000,'S3b '||r::text;

 -- S4 TrxID with a short amount: recorded as partial, remainder stated; the second payment completes it
 o:=pg_temp.new_order('S4',10000,13000);SELECT source_id INTO th FROM commerce_orders WHERE id=o;
 r:=briofold_ai_payment_settle(w,'live',th,jsonb_build_object('payer_digest',me,'transaction_digest',pg_temp.d('s4a'),'receipt',pg_temp.rc('s4a',13000,now(),'017me')));
 SELECT * INTO x FROM commerce_orders WHERE id=o;
 ASSERT (r->>'verified')::boolean AND r->>'result'='partial' AND (r->>'due_minor')::bigint=10000 AND x.status='hold' AND x.payment_state='partial','S4a '||r::text;
 r:=briofold_ai_payment_settle(w,'live',th,jsonb_build_object('payer_digest',me,'receipts',jsonb_build_array(pg_temp.rc('s4b',10000,now(),'017me'))));
 SELECT * INTO x FROM commerce_orders WHERE id=o;
 ASSERT r->>'result'='paid' AND x.status='confirmed' AND x.paid_minor=23000,'S4b sender route pays the remainder '||r::text;

 -- S5 SMS not arrived yet -> pending claim for the worker; unclear receipt -> owner review
 o:=pg_temp.new_order('S5',10000,13000);SELECT source_id INTO th FROM commerce_orders WHERE id=o;
 r:=briofold_ai_payment_settle(w,'live',th,jsonb_build_object('payer_digest',me,'method','bkash','transaction_digest',pg_temp.d('s5a'),'receipt',NULL));
 SELECT * INTO x FROM commerce_orders WHERE id=o;
 ASSERT r->>'result'='checking' AND x.payment_state='claimed' AND x.draft_expires_at IS NULL AND (SELECT state FROM commerce_payment_claims WHERE order_id=o)='pending','S5a '||r::text;
 r:=briofold_ai_payment_settle(w,'live',th,jsonb_build_object('payer_digest',me,'transaction_digest',pg_temp.d('s5a'),'receipt',pg_temp.rc('s5a',23000,now()-interval '3 days','017me')));
 ASSERT r->>'result'='review' AND r->>'reason'='payment_before_conversation' AND (SELECT state FROM commerce_payment_claims WHERE order_id=o)='review','S5b '||r::text;
 r:=briofold_ai_payment_settle(w,'live',th,jsonb_build_object('payer_digest',me,'transaction_digest',pg_temp.d('s5c'),'receipt',pg_temp.rc('s5c',23000,now(),'017me','ambiguous')));
 ASSERT r->>'result'='review' AND r->>'reason'='checkout_ambiguous','S5c '||r::text;

 -- S6 COD with delivery advance: the sender route accepts exactly the advance
 UPDATE commerce_ai_settings SET advance_rule='delivery' WHERE workspace_id=w;
 o:=pg_temp.new_order('S6',10000,13000);SELECT source_id INTO th FROM commerce_orders WHERE id=o;
 PERFORM briofold_ai_payment_method(w,'live',th,'cod');
 r:=briofold_ai_payment_settle(w,'live',th,jsonb_build_object('payer_digest',me,'receipts',jsonb_build_array(pg_temp.rc('s6a',14000,now(),'017me'))));
 SELECT * INTO x FROM commerce_orders WHERE id=o;
 ASSERT r->>'result'='advance_paid' AND x.status='confirmed' AND x.payment_state='cod' AND x.paid_minor=14000 AND (r->>'on_delivery_minor')::bigint=10000,'S6 '||r::text;

 -- S7 input guards and AI-only workspaces never auto-verify
 ASSERT briofold_ai_payment_settle(w,'live',th,'{}'::jsonb)->>'error'='sender_number_required';
 ASSERT briofold_ai_payment_settle(w,'live',gen_random_uuid(),jsonb_build_object('payer_digest',me))->>'error'='no_order_awaiting_payment';
 SET LOCAL session_replication_role=replica;UPDATE workspaces SET service_mode='ai' WHERE id=w;SET LOCAL session_replication_role=origin;
 o:=pg_temp.new_order('S7',10000,13000);SELECT source_id INTO th FROM commerce_orders WHERE id=o;
 r:=briofold_ai_payment_settle(w,'live',th,jsonb_build_object('payer_digest',me,'receipts',jsonb_build_array(pg_temp.rc('s7a',23000,now(),'017me'))));
 SELECT * INTO x FROM commerce_orders WHERE id=o;
 ASSERT NOT (r->>'verified')::boolean AND x.paid_minor=0,'S7 ai-only '||r::text;
 RAISE NOTICE '0249 tests passed';
END $t$;
ROLLBACK;
