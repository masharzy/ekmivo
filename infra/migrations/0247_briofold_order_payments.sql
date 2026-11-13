-- 0247 (control): order payment ledger, partial payments, advance rules and payment-method switching.
--
-- Before this migration an order only had a payment_state. Nothing recorded HOW MUCH money was received, so a short
-- payment could only go to review, an advance (delivery charge / half) could not exist, and "Paid" could not be shown.
--
-- Model
--   * commerce_order_payments is the ledger: one row per verified receipt (or owner entry). Rows are never edited,
--     only voided. commerce_orders.paid_minor is always sum(non-void rows) and is written ONLY by
--     commerce_order_payment_recalc().
--   * One SMS receipt can pay one order once: commerce_payment_claims is unique on the receipt digest and a ledger row
--     is unique on its claim.
--   * commerce_orders.pay_method ('mobile' | 'cod') and advance_minor say what must be paid before the order confirms.
--     Mobile: the whole total. COD: the owner's advance rule (none / delivery charge / percent / full).
--   * payment_state gains 'partial': money received, but less than what confirms the order.
--   * Legacy paths (worker claim_resolve, owner review approve) keep working: a trigger writes the ledger row when a
--     claim becomes verified without one.
--
-- Nothing here is used by the running API until BRIOFOLD_AI_PAYMENTS_V2_ENABLED=true; the legacy tool branches are untouched.
-- Idempotent: safe to run twice.
BEGIN;

DO $preflight$ BEGIN
 IF to_regclass('public.commerce_orders') IS NULL OR to_regclass('public.commerce_payment_claims') IS NULL
    OR to_regclass('public.commerce_ai_settings') IS NULL OR to_regprocedure('public.briofold_ai_order_summary(uuid)') IS NULL THEN
  RAISE EXCEPTION '0247 requires the AI selling schema (0234)' USING ERRCODE='42501';
 END IF;
END $preflight$;

-- 1. Owner rule: how much a cash-on-delivery order must pay in advance.
ALTER TABLE commerce_ai_settings
 ADD COLUMN IF NOT EXISTS advance_rule text NOT NULL DEFAULT 'none',
 ADD COLUMN IF NOT EXISTS advance_pct integer NOT NULL DEFAULT 50;
DO $$BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='commerce_ai_settings_advance_rule_check') THEN
  ALTER TABLE commerce_ai_settings ADD CONSTRAINT commerce_ai_settings_advance_rule_check CHECK(advance_rule IN('none','delivery','percent','full'));
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='commerce_ai_settings_advance_pct_check') THEN
  ALTER TABLE commerce_ai_settings ADD CONSTRAINT commerce_ai_settings_advance_pct_check CHECK(advance_pct BETWEEN 1 AND 99);
 END IF;
END$$;

-- 2. Order money columns.
ALTER TABLE commerce_orders
 ADD COLUMN IF NOT EXISTS paid_minor bigint NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS advance_minor bigint NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS cod_charge_minor bigint NOT NULL DEFAULT 0,
 ADD COLUMN IF NOT EXISTS pay_method text NOT NULL DEFAULT '';
DO $$BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='commerce_orders_money_v2_check') THEN
  ALTER TABLE commerce_orders ADD CONSTRAINT commerce_orders_money_v2_check
   CHECK(paid_minor>=0 AND advance_minor>=0 AND cod_charge_minor>=0 AND cod_charge_minor<=shipping_minor AND pay_method IN('','mobile','cod'));
 END IF;
 ALTER TABLE commerce_orders DROP CONSTRAINT IF EXISTS commerce_orders_payment_state_check;
 ALTER TABLE commerce_orders ADD CONSTRAINT commerce_orders_payment_state_check
  CHECK(payment_state IN('none','awaiting','claimed','partial','verified','cod','failed'));
END$$;

-- 3. The ledger.
CREATE TABLE IF NOT EXISTS commerce_order_payments(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL,
 environment text NOT NULL CHECK(environment IN('live','sandbox')),
 order_id uuid NOT NULL,
 kind text NOT NULL CHECK(kind IN('mobile','cash','adjustment')),
 method text NOT NULL DEFAULT '' CHECK(method IN('','bkash','nagad','rocket')),
 amount_minor bigint NOT NULL CHECK(amount_minor>0 AND amount_minor<=100000000000),
 claim_id uuid UNIQUE REFERENCES commerce_payment_claims(id),
 receiving_account_id uuid,
 source text NOT NULL CHECK(source IN('sms','owner','legacy')),
 actor_id uuid,
 voided_at timestamptz,
 void_reason text NOT NULL DEFAULT '' CHECK(length(void_reason)<=200),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(workspace_id,environment,order_id) REFERENCES commerce_orders(workspace_id,environment,id),
 CHECK((kind='mobile')=(method<>''))
);
CREATE INDEX IF NOT EXISTS commerce_order_payments_order ON commerce_order_payments(order_id) WHERE voided_at IS NULL;
ALTER TABLE commerce_order_payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE commerce_order_payments FORCE ROW LEVEL SECURITY;
REVOKE ALL ON commerce_order_payments FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;

-- Ledger rows are facts: the only allowed change is voiding a live row once.
CREATE OR REPLACE FUNCTION commerce_order_payments_immutable() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$BEGIN
 IF TG_OP='DELETE' THEN RAISE EXCEPTION 'Order payments cannot be deleted' USING ERRCODE='23514';END IF;
 IF OLD.voided_at IS NOT NULL OR NEW.voided_at IS NULL
    OR (to_jsonb(NEW)-'voided_at'-'void_reason') IS DISTINCT FROM (to_jsonb(OLD)-'voided_at'-'void_reason') THEN
  RAISE EXCEPTION 'Order payments can only be voided once' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END$$;
DROP TRIGGER IF EXISTS commerce_order_payments_immutable ON commerce_order_payments;
CREATE TRIGGER commerce_order_payments_immutable BEFORE UPDATE OR DELETE ON commerce_order_payments FOR EACH ROW EXECUTE FUNCTION commerce_order_payments_immutable();

-- 4. Advance required for a COD order under the owner's rule. total/shipping already include the COD charge.
CREATE OR REPLACE FUNCTION commerce_order_advance(total bigint,shipping bigint,rule text,pct integer) RETURNS bigint LANGUAGE sql IMMUTABLE AS $$
 SELECT CASE coalesce(rule,'none')
  WHEN 'delivery' THEN least(greatest(shipping,0),total)
  WHEN 'percent' THEN least(total,(total*least(greatest(coalesce(pct,50),1),99)+99)/100)
  WHEN 'full' THEN total
  ELSE 0 END $$;

-- 5. The single writer of paid_minor / payment_state / confirmation.
--    Returns the money view the AI and the dashboard show.
CREATE OR REPLACE FUNCTION commerce_order_payment_recalc(oid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE o commerce_orders%ROWTYPE;paid bigint;need bigint;ps text;st text;exp timestamptz;result text;BEGIN
 SELECT * INTO o FROM commerce_orders WHERE id=oid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE='P0002';END IF;
 SELECT coalesce(sum(amount_minor),0) INTO paid FROM commerce_order_payments WHERE order_id=oid AND voided_at IS NULL;
 ps:=o.payment_state;st:=o.status;exp:=o.draft_expires_at;
 -- What confirms this order: everything for mobile, the advance for COD.
 need:=CASE WHEN o.pay_method='cod' THEN least(o.advance_minor,o.total_minor) ELSE o.total_minor END;
 IF o.status IN('cancelled','returned') THEN
  result:='closed'; -- money on a closed order is the owner's refund decision; never reopen it here
 ELSIF paid>=o.total_minor AND o.total_minor>0 THEN
  ps:='verified';result:=CASE WHEN paid>o.total_minor THEN 'overpaid' ELSE 'paid' END;
  IF st IN('draft','hold') THEN st:='confirmed';END IF;exp:=NULL;
 ELSIF o.pay_method='cod' AND paid>=need THEN
  ps:='cod';result:=CASE WHEN paid>0 THEN 'advance_paid' ELSE 'cod' END;
  IF st IN('draft','hold') THEN st:='confirmed';END IF;exp:=NULL;
 ELSIF paid>0 THEN
  -- Money is in but not enough: keep the stock, never let the draft expire, wait for the rest.
  ps:='partial';result:='partial';
  IF st='draft' THEN st:='hold';END IF;exp:=NULL;
 ELSE
  result:='unpaid';
  IF ps IN('verified','partial') OR (ps='cod' AND need>0) THEN ps:='awaiting';END IF;
  IF st='confirmed' AND ps='awaiting' THEN st:='hold';END IF;
 END IF;
 UPDATE commerce_orders SET paid_minor=paid,payment_state=ps,status=st,draft_expires_at=exp,
   review_required=review_required OR result='overpaid',updated_at=now()
  WHERE id=oid AND (paid_minor,payment_state,status,draft_expires_at) IS DISTINCT FROM (paid,ps,st,exp);
 IF st='confirmed' AND o.status<>'confirmed' THEN
  UPDATE commerce_coupon_claims SET status='redeemed' WHERE order_id=oid AND status='reserved';
 END IF;
 RETURN jsonb_build_object('result',result,'reference',o.reference,'status',st,'payment_state',ps,'pay_method',o.pay_method,
  'total_minor',o.total_minor,'paid_minor',paid,'due_minor',greatest(o.total_minor-paid,0),
  'due_now_minor',greatest(need-paid,0),'on_delivery_minor',CASE WHEN o.pay_method='cod' THEN greatest(o.total_minor-greatest(paid,need),0) ELSE 0 END,
  'overpaid_minor',greatest(paid-o.total_minor,0));
END$$;

-- 6. Legacy bridge: a claim verified by the worker or by the owner's review has no amount of its own. Those paths only
--    verify when the order's due amount was paid, so the ledger row is the amount still due at that moment.
CREATE OR REPLACE FUNCTION commerce_payment_claim_ledger() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE o commerce_orders%ROWTYPE;due bigint;BEGIN
 IF NEW.state='verified' AND (TG_OP='INSERT' OR OLD.state IS DISTINCT FROM 'verified')
    AND NOT EXISTS(SELECT 1 FROM commerce_order_payments WHERE claim_id=NEW.id) THEN
  SELECT * INTO o FROM commerce_orders WHERE id=NEW.order_id;
  due:=o.total_minor-(SELECT coalesce(sum(amount_minor),0) FROM commerce_order_payments WHERE order_id=o.id AND voided_at IS NULL);
  IF due>0 THEN
   INSERT INTO commerce_order_payments(workspace_id,environment,order_id,kind,method,amount_minor,claim_id,receiving_account_id,source)
    VALUES(NEW.workspace_id,NEW.environment,NEW.order_id,'mobile',NEW.method,due,NEW.id,NEW.receiving_account_id,'legacy');
   UPDATE commerce_orders SET paid_minor=paid_minor+due,pay_method=CASE WHEN pay_method='' THEN 'mobile' ELSE pay_method END WHERE id=o.id;
  END IF;
 END IF;
 RETURN NEW;
END$$;
DROP TRIGGER IF EXISTS commerce_payment_claim_ledger ON commerce_payment_claims;
CREATE TRIGGER commerce_payment_claim_ledger AFTER INSERT OR UPDATE OF state ON commerce_payment_claims FOR EACH ROW EXECUTE FUNCTION commerce_payment_claim_ledger();

-- 7. Record one verified receipt against its claim. Called only after the receipt itself was checked (incoming, unused,
--    right method, right sender, paid after the conversation started). The amount is the receipt's real amount, so a
--    short payment becomes a partial payment instead of a dead end.
CREATE OR REPLACE FUNCTION briofold_ai_payment_record(cid uuid,amount bigint,account uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c commerce_payment_claims%ROWTYPE;o commerce_orders%ROWTYPE;BEGIN
 IF amount IS NULL OR amount<=0 THEN RAISE EXCEPTION 'Invalid amount' USING ERRCODE='22023';END IF;
 SELECT * INTO c FROM commerce_payment_claims WHERE id=cid FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Claim not found' USING ERRCODE='P0002';END IF;
 SELECT * INTO o FROM commerce_orders WHERE id=c.order_id FOR UPDATE;
 IF EXISTS(SELECT 1 FROM commerce_order_payments WHERE claim_id=cid) THEN
  RETURN commerce_order_payment_recalc(o.id)||jsonb_build_object('recorded',false);
 END IF;
 IF o.status IN('cancelled','returned') THEN
  UPDATE commerce_payment_claims SET state='review',reason='paid_after_expiry_or_change',receiving_account_id=account,resolved_at=now(),attempts=attempts+1 WHERE id=cid;
  RETURN jsonb_build_object('result','review','reason','order_closed','reference',o.reference,'recorded',false);
 END IF;
 INSERT INTO commerce_order_payments(workspace_id,environment,order_id,kind,method,amount_minor,claim_id,receiving_account_id,source)
  VALUES(c.workspace_id,c.environment,c.order_id,'mobile',c.method,amount,cid,account,'sms');
 UPDATE commerce_orders SET pay_method=CASE WHEN pay_method='' THEN 'mobile' ELSE pay_method END,
   advance_minor=CASE WHEN pay_method='' THEN total_minor ELSE advance_minor END WHERE id=o.id;
 UPDATE commerce_payment_claims SET state='verified',reason='',receiving_account_id=account,claimed_amount_minor=amount,resolved_at=now(),attempts=attempts+1 WHERE id=cid;
 RETURN commerce_order_payment_recalc(o.id)||jsonb_build_object('recorded',true,'received_minor',amount);
END$$;

-- 8. Choose or change how the order is paid. Works on a draft and on a confirmed order that has not been packed.
CREATE OR REPLACE FUNCTION briofold_ai_payment_method(w uuid,e text,thread uuid,choice text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s commerce_ai_settings%ROWTYPE;o commerce_orders%ROWTYPE;charge bigint;adv bigint;r jsonb;BEGIN
 IF e NOT IN('live','sandbox') OR choice NOT IN('mobile','cod') THEN RAISE EXCEPTION 'Invalid payment choice' USING ERRCODE='22023';END IF;
 SELECT * INTO s FROM commerce_ai_settings WHERE workspace_id=w AND environment=e;
 SELECT * INTO o FROM commerce_orders WHERE workspace_id=w AND environment=e AND source='ai' AND source_id=thread
   AND status IN('draft','hold','confirmed') ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','no_open_order');END IF;
 IF o.payment_state='claimed' THEN RETURN jsonb_build_object('error','payment_being_checked','reference',o.reference);END IF;
 IF o.paid_minor>=o.total_minor AND o.total_minor>0 THEN RETURN commerce_order_payment_recalc(o.id)||jsonb_build_object('error','already_paid');END IF;
 IF choice='cod' THEN
  IF NOT coalesce(s.cod_enabled,false) THEN RETURN jsonb_build_object('error','cod_disabled');END IF;
  IF coalesce(o.recipient->>'address','')='' THEN RETURN jsonb_build_object('error','address_required');END IF;
  IF o.pay_method<>'cod' THEN
   charge:=coalesce(s.cod_charge_minor,0);
   UPDATE commerce_orders SET shipping_minor=shipping_minor+charge,total_minor=total_minor+charge,cod_charge_minor=charge WHERE id=o.id RETURNING * INTO o;
  END IF;
  adv:=commerce_order_advance(o.total_minor,o.shipping_minor,s.advance_rule,s.advance_pct);
  UPDATE commerce_orders SET pay_method='cod',advance_minor=adv,
    payment_state=CASE WHEN payment_state IN('none','failed') THEN 'awaiting' ELSE payment_state END WHERE id=o.id;
 ELSE
  IF o.pay_method='cod' AND o.cod_charge_minor>0 THEN
   UPDATE commerce_orders SET shipping_minor=shipping_minor-cod_charge_minor,total_minor=total_minor-cod_charge_minor,cod_charge_minor=0 WHERE id=o.id RETURNING * INTO o;
  END IF;
  UPDATE commerce_orders SET pay_method='mobile',advance_minor=o.total_minor,
    payment_state=CASE WHEN payment_state IN('none','failed','cod') THEN 'awaiting' ELSE payment_state END WHERE id=o.id;
 END IF;
 r:=commerce_order_payment_recalc(o.id);
 RETURN r||jsonb_build_object('advance_rule',CASE WHEN choice='cod' THEN coalesce(s.advance_rule,'none') END,
  'pay_to_accounts',to_jsonb(coalesce(s.receiving_account_ids,'{}'::uuid[])),'environment',e,'cod_available',coalesce(s.cod_enabled,false));
END$$;

-- 9. Owner actions: record cash / a manual payment, or void a wrong ledger row.
CREATE OR REPLACE FUNCTION commerce_order_payment_owner(w uuid,e text,a uuid,oid uuid,action text,body jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE o commerce_orders%ROWTYPE;amt bigint;BEGIN
 PERFORM briofold_customer_actor(w,a,'contact');
 IF e NOT IN('live','sandbox') OR action NOT IN('record','void') THEN RAISE EXCEPTION 'Invalid payment action' USING ERRCODE='22023';END IF;
 SELECT * INTO o FROM commerce_orders WHERE id=oid AND workspace_id=w AND environment=e FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Order not found' USING ERRCODE='P0002';END IF;
 IF action='record' THEN
  amt:=CASE WHEN coalesce(body->>'amount_minor','')~'^[0-9]{1,12}$' THEN (body->>'amount_minor')::bigint END;
  IF amt IS NULL OR amt<=0 OR coalesce(body->>'kind','') NOT IN('cash','mobile','adjustment')
     OR (body->>'kind'='mobile')<>(coalesce(body->>'method','') IN('bkash','nagad','rocket')) OR (body->>'kind'<>'mobile' AND coalesce(body->>'method','')<>'') THEN
   RAISE EXCEPTION 'Invalid payment' USING ERRCODE='22023';
  END IF;
  INSERT INTO commerce_order_payments(workspace_id,environment,order_id,kind,method,amount_minor,source,actor_id)
   VALUES(w,e,oid,body->>'kind',coalesce(body->>'method',''),amt,'owner',a);
 ELSE
  UPDATE commerce_order_payments SET voided_at=now(),void_reason=left(coalesce(body->>'reason',''),200)
   WHERE id=(body->>'payment_id')::uuid AND order_id=oid AND voided_at IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'Payment not found' USING ERRCODE='P0002';END IF;
 END IF;
 INSERT INTO commerce_events(workspace_id,environment,entity_id,actor_id,action,detail)
  VALUES(w,e,oid,a,'order-payment-'||action,jsonb_build_object('order_id',oid,'amount_minor',amt,'payment_id',body->>'payment_id'));
 RETURN commerce_order_payment_recalc(oid);
END$$;

-- 10. The order summary the AI reads now carries the money view (additive keys only).
CREATE OR REPLACE FUNCTION briofold_ai_order_summary(oid uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('reference',o.reference,'status',o.status,'payment_state',o.payment_state,'subtotal_minor',o.subtotal_minor,'shipping_minor',o.shipping_minor,
  'cod_charge_minor',CASE WHEN o.pay_method='cod' THEN o.cod_charge_minor WHEN o.payment_state='cod' THEN coalesce(s.cod_charge_minor,0) ELSE 0 END,
  'discount_minor',o.coupon_discount_minor,'total_minor',o.total_minor,
  'pay_method',o.pay_method,'paid_minor',o.paid_minor,'due_minor',greatest(o.total_minor-o.paid_minor,0),
  'due_now_minor',greatest(CASE WHEN o.pay_method='cod' THEN least(o.advance_minor,o.total_minor) ELSE o.total_minor END-o.paid_minor,0),
  'lines',coalesce((SELECT jsonb_agg(jsonb_build_object('name',l.name,'sku',l.sku,'quantity',l.quantity,'unit_minor',l.unit_minor) ORDER BY l.sku) FROM commerce_lines l WHERE l.order_id=o.id),'[]'))
 FROM commerce_orders o LEFT JOIN commerce_ai_settings s ON s.workspace_id=o.workspace_id AND s.environment=o.environment WHERE o.id=oid $$;

-- 11. Backfill: every already-verified claim becomes a ledger row for its order total; existing COD orders are marked COD.
INSERT INTO commerce_order_payments(workspace_id,environment,order_id,kind,method,amount_minor,claim_id,receiving_account_id,source,created_at)
 SELECT c.workspace_id,c.environment,c.order_id,'mobile',c.method,o.total_minor,c.id,c.receiving_account_id,'legacy',coalesce(c.resolved_at,c.created_at)
 FROM commerce_payment_claims c JOIN commerce_orders o ON o.id=c.order_id
 WHERE c.state='verified' AND o.payment_state='verified' AND o.total_minor>0
   AND c.id=(SELECT x.id FROM commerce_payment_claims x WHERE x.order_id=c.order_id AND x.state='verified' ORDER BY x.resolved_at DESC NULLS LAST,x.id LIMIT 1)
   AND NOT EXISTS(SELECT 1 FROM commerce_order_payments p WHERE p.order_id=c.order_id);
UPDATE commerce_orders o SET paid_minor=x.paid,pay_method=CASE WHEN o.pay_method='' THEN 'mobile' ELSE o.pay_method END,
  advance_minor=CASE WHEN o.pay_method='' THEN o.total_minor ELSE o.advance_minor END
 FROM (SELECT order_id,sum(amount_minor) paid FROM commerce_order_payments WHERE voided_at IS NULL GROUP BY 1) x
 WHERE x.order_id=o.id AND o.paid_minor IS DISTINCT FROM x.paid;
UPDATE commerce_orders SET pay_method='cod' WHERE payment_state='cod' AND pay_method='';

REVOKE ALL ON FUNCTION commerce_order_payments_immutable(),commerce_order_advance(bigint,bigint,text,integer),commerce_order_payment_recalc(uuid),
 commerce_payment_claim_ledger(),briofold_ai_payment_record(uuid,bigint,uuid),briofold_ai_payment_method(uuid,text,uuid,text),
 commerce_order_payment_owner(uuid,text,uuid,uuid,text,jsonb) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION briofold_ai_payment_record(uuid,bigint,uuid),briofold_ai_payment_method(uuid,text,uuid,text),
 commerce_order_payment_owner(uuid,text,uuid,uuid,text,jsonb) TO ekmivo_financial_runtime;
COMMIT;
