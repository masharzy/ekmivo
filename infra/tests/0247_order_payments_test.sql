-- Rule tests for 0247. Runs inside one transaction and rolls back; needs a database that has the control schema.
-- psql -v ON_ERROR_STOP=1 -f infra/tests/0247_order_payments_test.sql   -> prints "0247 tests passed"
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

DO $t$
DECLARE w uuid:='00000000-0000-4000-8000-0000000000a1';o uuid;c uuid;r jsonb;x commerce_orders%ROWTYPE;th uuid;failed boolean;
BEGIN
 -- advance rule arithmetic
 ASSERT commerce_order_advance(23000,13000,'none',50)=0;
 ASSERT commerce_order_advance(23000,13000,'delivery',50)=13000;
 ASSERT commerce_order_advance(23000,13000,'percent',50)=11500;
 ASSERT commerce_order_advance(23001,13000,'percent',50)=11501,'percent rounds up';
 ASSERT commerce_order_advance(23000,13000,'full',50)=23000;
 ASSERT commerce_order_advance(5000,13000,'delivery',50)=5000,'advance never exceeds total';

 -- T1 exact mobile payment confirms the order
 o:=pg_temp.new_order('T1',10000,13000);c:=pg_temp.new_claim(o);
 r:=briofold_ai_payment_record(c,23000,NULL);SELECT * INTO x FROM commerce_orders WHERE id=o;
 ASSERT r->>'result'='paid' AND x.status='confirmed' AND x.payment_state='verified' AND x.paid_minor=23000 AND x.draft_expires_at IS NULL,'T1 '||r::text;
 ASSERT (r->>'due_minor')::bigint=0;
 -- T5 the same receipt can never be counted twice
 r:=briofold_ai_payment_record(c,23000,NULL);SELECT * INTO x FROM commerce_orders WHERE id=o;
 ASSERT (r->>'recorded')::boolean=false AND x.paid_minor=23000,'T5 double count';

 -- T2 short payment is a partial payment that holds the stock and never expires; the rest completes it
 o:=pg_temp.new_order('T2',10000,13000);c:=pg_temp.new_claim(o);
 r:=briofold_ai_payment_record(c,10000,NULL);SELECT * INTO x FROM commerce_orders WHERE id=o;
 ASSERT r->>'result'='partial' AND x.status='hold' AND x.payment_state='partial' AND x.paid_minor=10000 AND x.draft_expires_at IS NULL,'T2a '||r::text;
 ASSERT (r->>'due_minor')::bigint=13000 AND (r->>'due_now_minor')::bigint=13000;
 c:=pg_temp.new_claim(o);r:=briofold_ai_payment_record(c,13000,NULL);SELECT * INTO x FROM commerce_orders WHERE id=o;
 ASSERT r->>'result'='paid' AND x.status='confirmed' AND x.payment_state='verified' AND x.paid_minor=23000,'T2b '||r::text;

 -- T3 COD with delivery-charge advance: COD charge added once, order confirms when the advance is in
 o:=pg_temp.new_order('T3',10000,13000);SELECT source_id INTO th FROM commerce_orders WHERE id=o;
 r:=briofold_ai_payment_method(w,'live',th,'cod');SELECT * INTO x FROM commerce_orders WHERE id=o;
 ASSERT x.total_minor=24000 AND x.cod_charge_minor=1000 AND x.advance_minor=14000 AND x.pay_method='cod' AND x.status='draft' AND x.payment_state='awaiting','T3a '||r::text;
 ASSERT (r->>'due_now_minor')::bigint=14000 AND (r->>'on_delivery_minor')::bigint=10000,'T3a money '||r::text;
 r:=briofold_ai_payment_method(w,'live',th,'cod');SELECT * INTO x FROM commerce_orders WHERE id=o;
 ASSERT x.total_minor=24000,'COD charge must not be added twice';
 c:=pg_temp.new_claim(o);r:=briofold_ai_payment_record(c,14000,NULL);SELECT * INTO x FROM commerce_orders WHERE id=o;
 ASSERT r->>'result'='advance_paid' AND x.status='confirmed' AND x.payment_state='cod' AND x.paid_minor=14000,'T3b '||r::text;
 ASSERT (r->>'on_delivery_minor')::bigint=10000 AND (r->>'due_now_minor')::bigint=0;

 -- T4 switching: COD -> mobile removes the COD charge and asks for the full total; mobile -> COD puts it back
 o:=pg_temp.new_order('T4',10000,13000);SELECT source_id INTO th FROM commerce_orders WHERE id=o;
 PERFORM briofold_ai_payment_method(w,'live',th,'cod');
 r:=briofold_ai_payment_method(w,'live',th,'mobile');SELECT * INTO x FROM commerce_orders WHERE id=o;
 ASSERT x.total_minor=23000 AND x.cod_charge_minor=0 AND x.pay_method='mobile' AND x.advance_minor=23000 AND (r->>'due_now_minor')::bigint=23000,'T4a '||r::text;
 -- a customer who already paid part by mobile and then chooses COD keeps the money; only the missing advance is asked
 c:=pg_temp.new_claim(o);PERFORM briofold_ai_payment_record(c,5000,NULL);
 r:=briofold_ai_payment_method(w,'live',th,'cod');SELECT * INTO x FROM commerce_orders WHERE id=o;
 ASSERT x.paid_minor=5000 AND x.payment_state='partial' AND x.status='hold' AND (r->>'due_now_minor')::bigint=9000,'T4b '||r::text;
 -- pure COD (no advance) confirms at once; switching that confirmed order to mobile puts it on hold until paid
 UPDATE commerce_ai_settings SET advance_rule='none' WHERE workspace_id=w;
 o:=pg_temp.new_order('T4c',10000,13000);SELECT source_id INTO th FROM commerce_orders WHERE id=o;
 r:=briofold_ai_payment_method(w,'live',th,'cod');SELECT * INTO x FROM commerce_orders WHERE id=o;
 ASSERT r->>'result'='cod' AND x.status='confirmed' AND x.payment_state='cod' AND x.paid_minor=0,'T4c '||r::text;
 r:=briofold_ai_payment_method(w,'live',th,'mobile');SELECT * INTO x FROM commerce_orders WHERE id=o;
 ASSERT x.status='hold' AND x.payment_state='awaiting' AND x.total_minor=23000,'T4d '||r::text;
 UPDATE commerce_orders SET status='shipped' WHERE id=o;
 r:=briofold_ai_payment_method(w,'live',th,'cod');ASSERT r->>'error'='no_open_order','shipped orders cannot switch';

 -- T6 legacy worker path still confirms and now fills the ledger
 o:=pg_temp.new_order('T6',10000,13000);c:=pg_temp.new_claim(o);
 UPDATE commerce_orders SET payment_state='claimed' WHERE id=o;
 PERFORM briofold_ai_claim_resolve(c,'matched','',NULL);SELECT * INTO x FROM commerce_orders WHERE id=o;
 ASSERT x.status='confirmed' AND x.payment_state='verified' AND x.paid_minor=23000,'T6 legacy '||x.paid_minor||' '||x.status||' '||x.payment_state;
 ASSERT (SELECT count(*) FROM commerce_order_payments WHERE order_id=o AND source='legacy')=1;

 -- T7 ledger rows are facts; a void by the owner takes the money back out
 failed:=false;BEGIN UPDATE commerce_order_payments SET amount_minor=1 WHERE order_id=o;EXCEPTION WHEN check_violation THEN failed:=true;END;ASSERT failed,'edit must fail';
 failed:=false;BEGIN DELETE FROM commerce_order_payments WHERE order_id=o;EXCEPTION WHEN check_violation THEN failed:=true;END;ASSERT failed,'delete must fail';
 UPDATE commerce_order_payments SET voided_at=now(),void_reason='test' WHERE order_id=o;
 r:=commerce_order_payment_recalc(o);SELECT * INTO x FROM commerce_orders WHERE id=o;
 ASSERT x.paid_minor=0 AND x.payment_state='awaiting' AND x.status='hold','T7 void '||r::text;

 -- T8 overpayment is recorded in full and flagged for the owner
 o:=pg_temp.new_order('T8',10000,13000);c:=pg_temp.new_claim(o);
 r:=briofold_ai_payment_record(c,25000,NULL);SELECT * INTO x FROM commerce_orders WHERE id=o;
 ASSERT r->>'result'='overpaid' AND x.review_required AND x.paid_minor=25000 AND (r->>'overpaid_minor')::bigint=2000 AND x.status='confirmed','T8 '||r::text;

 -- T9 money that arrives for a cancelled order is never applied silently
 o:=pg_temp.new_order('T9',10000,13000);c:=pg_temp.new_claim(o);UPDATE commerce_orders SET status='cancelled' WHERE id=o;
 r:=briofold_ai_payment_record(c,23000,NULL);SELECT * INTO x FROM commerce_orders WHERE id=o;
 ASSERT r->>'result'='review' AND x.paid_minor=0 AND x.status='cancelled','T9 '||r::text;
 ASSERT (SELECT state FROM commerce_payment_claims WHERE id=c)='review';

 -- summary carries the money view
 ASSERT briofold_ai_order_summary(o)?'paid_minor' AND briofold_ai_order_summary(o)?'due_now_minor';
 -- the Orders list shows ledger money (0253), when that migration is installed
 IF position('o.paid_minor) linked_verified_minor' IN pg_get_functiondef('commerce_order_scan'::regproc))>0 THEN
  o:=pg_temp.new_order('T10',10000,13000);c:=pg_temp.new_claim(o);PERFORM briofold_ai_payment_record(c,23000,NULL);
  ASSERT (SELECT greatest(coalesce((SELECT sum(f.amount_minor) FROM commerce_finance_links f WHERE f.order_id=x2.id AND f.kind='payment'),0),x2.paid_minor) FROM commerce_orders x2 WHERE x2.id=o)=23000;
 END IF;
 RAISE NOTICE '0247 tests passed';
END $t$;
ROLLBACK;
