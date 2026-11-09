-- Phase 4: AI orders, price quotes, payment claims, selling settings.
-- payment_state is separate from order status. AI-only workspaces never reach payment_state='verified'.
-- The TrxID and the sender number never reach this database: Go replaces them with keyed digests + last digits.
-- Stock reservations go through commerce_move (commerce_stock + immutable commerce_stock_moves ledger).
BEGIN;
ALTER TABLE commerce_orders ADD COLUMN IF NOT EXISTS payment_state text NOT NULL DEFAULT 'none' CHECK(payment_state IN('none','awaiting','claimed','verified','cod','failed'));
ALTER TABLE commerce_orders ADD COLUMN IF NOT EXISTS draft_expires_at timestamptz;

CREATE TABLE IF NOT EXISTS commerce_ai_settings(
 workspace_id uuid NOT NULL REFERENCES workspaces(id),environment text NOT NULL CHECK(environment IN('live','sandbox')),
 cod_enabled boolean NOT NULL DEFAULT false,cod_charge_minor bigint NOT NULL DEFAULT 0 CHECK(cod_charge_minor BETWEEN 0 AND 10000000),
 delivery_dhaka_minor bigint NOT NULL DEFAULT 7000 CHECK(delivery_dhaka_minor BETWEEN 0 AND 10000000),delivery_outside_minor bigint NOT NULL DEFAULT 13000 CHECK(delivery_outside_minor BETWEEN 0 AND 10000000),
 max_discount_pct integer NOT NULL DEFAULT 0 CHECK(max_discount_pct BETWEEN 0 AND 90),negotiation_enabled boolean NOT NULL DEFAULT false,
 draft_expiry_hours integer NOT NULL DEFAULT 24 CHECK(draft_expiry_hours BETWEEN 1 AND 168),wrong_trx_limit integer NOT NULL DEFAULT 5 CHECK(wrong_trx_limit BETWEEN 1 AND 20),
 -- References to financial_receiving_accounts in the isolated realm. Empty = every enabled account. Numbers stay encrypted there.
 receiving_account_ids uuid[] NOT NULL DEFAULT '{}' CHECK(cardinality(receiving_account_ids)<=10),
 -- Owner opt-in: the AI may sell from the catalog (tool mode) for this workspace.
 ai_selling_enabled boolean NOT NULL DEFAULT false,
 revision bigint NOT NULL DEFAULT 1,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(workspace_id,environment));

ALTER TABLE commerce_ai_settings ADD COLUMN IF NOT EXISTS ai_selling_enabled boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS commerce_ai_quotes(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id),environment text NOT NULL CHECK(environment IN('live','sandbox')),
 thread_id uuid NOT NULL,variant_id uuid NOT NULL,list_minor bigint NOT NULL,unit_minor bigint NOT NULL CHECK(unit_minor>=0),
 expires_at timestamptz NOT NULL,created_at timestamptz NOT NULL DEFAULT now());
CREATE INDEX IF NOT EXISTS commerce_ai_quotes_thread ON commerce_ai_quotes(thread_id,variant_id,created_at);

CREATE TABLE IF NOT EXISTS commerce_payment_claims(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id),environment text NOT NULL CHECK(environment IN('live','sandbox')),
 order_id uuid NOT NULL REFERENCES commerce_orders(id),thread_id uuid,method text NOT NULL CHECK(method IN('bkash','nagad','rocket')),
 transaction_digest char(64) NOT NULL CHECK(transaction_digest~'^[0-9a-f]{64}$'),transaction_last4 text NOT NULL CHECK(length(transaction_last4)<=4),
 payer_digest char(64) NOT NULL CHECK(payer_digest~'^[0-9a-f]{64}$'),payer_last3 text NOT NULL DEFAULT '' CHECK(payer_last3~'^[0-9]{0,3}$'),
 claimed_amount_minor bigint CHECK(claimed_amount_minor IS NULL OR claimed_amount_minor>=0),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','verified','failed','review')),reason text NOT NULL DEFAULT '' CHECK(length(reason)<=200),
 receiving_account_id uuid,attempts integer NOT NULL DEFAULT 0,next_try_at timestamptz NOT NULL DEFAULT now(),created_at timestamptz NOT NULL DEFAULT now(),resolved_at timestamptz,
 UNIQUE(workspace_id,environment,transaction_digest));
CREATE INDEX IF NOT EXISTS commerce_payment_claims_due ON commerce_payment_claims(next_try_at) WHERE state='pending';
CREATE INDEX IF NOT EXISTS commerce_payment_claims_review ON commerce_payment_claims(workspace_id,environment) WHERE state='review';
CREATE INDEX IF NOT EXISTS commerce_payment_claims_thread ON commerce_payment_claims(thread_id,created_at);
CREATE UNIQUE INDEX IF NOT EXISTS commerce_payment_claims_one_pending ON commerce_payment_claims(order_id) WHERE state='pending';
DO $$DECLARE x text;BEGIN FOREACH x IN ARRAY ARRAY['commerce_ai_settings','commerce_ai_quotes','commerce_payment_claims'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',x);EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',x);
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE tablename=x AND policyname=x||'_owner') THEN EXECUTE format('CREATE POLICY %I ON %I TO %I USING(true) WITH CHECK(true)',x||'_owner',x,current_user);END IF;
 EXECUTE format('REVOKE ALL ON %I FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection',x);END LOOP;END $$;

CREATE OR REPLACE FUNCTION briofold_ai_order_summary(oid uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('reference',o.reference,'status',o.status,'payment_state',o.payment_state,'subtotal_minor',o.subtotal_minor,'shipping_minor',o.shipping_minor,
  'cod_charge_minor',CASE WHEN o.payment_state='cod' THEN coalesce(s.cod_charge_minor,0) ELSE 0 END,
  'discount_minor',o.coupon_discount_minor,'total_minor',o.total_minor,
  'lines',coalesce((SELECT jsonb_agg(jsonb_build_object('name',l.name,'sku',l.sku,'quantity',l.quantity,'unit_minor',l.unit_minor) ORDER BY l.sku) FROM commerce_lines l WHERE l.order_id=o.id),'[]'))
 FROM commerce_orders o LEFT JOIN commerce_ai_settings s ON s.workspace_id=o.workspace_id AND s.environment=o.environment WHERE o.id=oid $$;

-- Release every reservation of an order through the stock ledger.
CREATE OR REPLACE FUNCTION briofold_ai_release(oid uuid,why text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE o commerce_orders%ROWTYPE;ln record;BEGIN
 SELECT * INTO o FROM commerce_orders WHERE id=oid;
 FOR ln IN SELECT variant_id,quantity FROM commerce_lines WHERE order_id=oid LOOP
  PERFORM commerce_move(o.workspace_id,o.environment,o.created_by,o.warehouse_id,ln.variant_id,0,-least(ln.quantity,(SELECT reserved FROM commerce_stock s WHERE s.workspace_id=o.workspace_id AND s.environment=o.environment AND s.warehouse_id=o.warehouse_id AND s.variant_id=ln.variant_id)),why,oid);
 END LOOP;
END $$;

CREATE OR REPLACE FUNCTION briofold_ai_order_tool(w uuid,e text,thread uuid,actor uuid,tool_name text,args jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s commerce_ai_settings%ROWTYPE;cust uuid;o commerce_orders%ROWTYPE;it record;vid uuid;qty bigint;sub bigint:=0;ship bigint;area text;cp commerce_coupons%ROWTYPE;disc bigint:=0;
 wh uuid;avail bigint;fails integer;mode text;v commerce_variants%ROWTYPE;pr commerce_products%ROWTYPE;floor_m bigint;unit bigint;offer bigint;rounds integer;qid uuid;
 coupon_state text:='none';rec jsonb;n integer;BEGIN
 SELECT * INTO s FROM commerce_ai_settings WHERE workspace_id=w AND environment=e;
 SELECT service_mode INTO mode FROM workspaces WHERE id=w;
 SELECT customer_id INTO cust FROM briofold_customer_sources WHERE workspace_id=w AND environment=e AND kind='thread' AND source_id=thread LIMIT 1;
 SELECT * INTO o FROM commerce_orders WHERE workspace_id=w AND environment=e AND source='ai' AND source_id=thread AND status='draft' AND payment_state IN('none','awaiting') ORDER BY created_at DESC LIMIT 1;

 IF tool_name='delivery_charge' THEN
  area:=CASE WHEN lower(coalesce(args->>'area',''))='dhaka' THEN 'dhaka' ELSE 'outside' END;
  RETURN jsonb_build_object('area',area,'charge_minor',CASE WHEN area='dhaka' THEN coalesce(s.delivery_dhaka_minor,7000) ELSE coalesce(s.delivery_outside_minor,13000) END);

 ELSIF tool_name='quote_price' THEN
  -- A discount is only usable in an order through the quote_ref returned here (30 minutes, this thread only).
  BEGIN vid:=(args->>'variant_ref')::uuid;offer:=nullif(args->>'offer_minor','')::bigint;EXCEPTION WHEN others THEN RETURN jsonb_build_object('error','bad_reference');END;
  SELECT * INTO v FROM commerce_variants WHERE id=vid AND workspace_id=w AND environment=e AND active;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','variant_not_found');END IF;
  SELECT * INTO pr FROM commerce_products WHERE id=v.product_id AND active;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','variant_not_found');END IF;
  floor_m:=v.price_minor;
  IF coalesce(s.negotiation_enabled,false) THEN floor_m:=least(v.price_minor,greatest(coalesce(pr.min_price_minor,0),(v.price_minor*(100-coalesce(s.max_discount_pct,0)))/100));END IF;
  SELECT count(*) INTO rounds FROM commerce_ai_quotes WHERE thread_id=thread AND variant_id=vid AND created_at>now()-interval '30 minutes' AND unit_minor<list_minor;
  IF offer IS NULL OR offer>=v.price_minor THEN unit:=v.price_minor;
  ELSIF offer>=floor_m THEN unit:=offer;
  ELSIF floor_m>=v.price_minor THEN unit:=v.price_minor;
  -- First counter-offer stays half-way; only a repeated request reaches the floor.
  ELSIF rounds=0 THEN unit:=greatest(floor_m,v.price_minor-(v.price_minor-floor_m)/2);
  ELSE unit:=floor_m;END IF;
  INSERT INTO commerce_ai_quotes(workspace_id,environment,thread_id,variant_id,list_minor,unit_minor,expires_at) VALUES(w,e,thread,vid,v.price_minor,unit,now()+interval '30 minutes') RETURNING id INTO qid;
  RETURN jsonb_build_object('quote_ref',qid,'sku',v.sku,'list_minor',v.price_minor,'unit_minor',unit,'offer_accepted',offer IS NOT NULL AND unit=offer,
   'negotiable',floor_m<v.price_minor,'valid_minutes',30);

 ELSIF tool_name='check_coupon' THEN
  SELECT * INTO cp FROM commerce_coupons WHERE workspace_id=w AND environment=e AND code=upper(left(btrim(coalesce(args->>'code','')),40));
  IF NOT FOUND OR NOT cp.active THEN RETURN jsonb_build_object('valid',false,'reason','unknown');END IF;
  IF cp.expires_at<=now() THEN RETURN jsonb_build_object('valid',false,'reason','expired');END IF;
  IF cp.starts_at>now() THEN RETURN jsonb_build_object('valid',false,'reason','not_started');END IF;
  IF cardinality(cp.audience)>0 AND (cust IS NULL OR NOT cust=ANY(cp.audience)) THEN RETURN jsonb_build_object('valid',false,'reason','not_eligible');END IF;
  IF (SELECT count(*) FROM commerce_coupon_claims c WHERE c.coupon_id=cp.id AND c.status IN('reserved','redeemed'))>=cp.usage_limit THEN RETURN jsonb_build_object('valid',false,'reason','used_up');END IF;
  IF cust IS NOT NULL AND (SELECT count(*) FROM commerce_coupon_claims c WHERE c.coupon_id=cp.id AND c.customer_id=cust AND c.status IN('reserved','redeemed'))>=cp.per_customer_limit THEN RETURN jsonb_build_object('valid',false,'reason','customer_limit');END IF;
  RETURN jsonb_build_object('valid',true,'kind',cp.kind,'value',cp.value,'minimum_minor',cp.minimum_minor,'note','a coupon replaces any bargained price');

 ELSIF tool_name='upsert_order_draft' THEN
  IF cust IS NULL THEN RETURN jsonb_build_object('error','no_customer');END IF;
  IF EXISTS(SELECT 1 FROM commerce_orders WHERE workspace_id=w AND environment=e AND source='ai' AND source_id=thread AND status='draft' AND payment_state='claimed') THEN
   RETURN jsonb_build_object('error','payment_under_verification');END IF;
  IF jsonb_typeof(args->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(args->'items') NOT BETWEEN 1 AND 10 THEN RETURN jsonb_build_object('error','items_required');END IF;
  IF o.id IS NULL THEN
   SELECT id INTO wh FROM commerce_warehouses WHERE workspace_id=w AND environment=e ORDER BY id LIMIT 1;
   IF wh IS NULL THEN RETURN jsonb_build_object('error','no_warehouse');END IF;
   FOR n IN 1..3 LOOP
    BEGIN
     INSERT INTO commerce_orders(id,workspace_id,environment,reference,source,source_id,customer_id,warehouse_id,status,recipient,subtotal_minor,total_minor,draft_expires_at,created_by)
     VALUES(gen_random_uuid(),w,e,'AI-'||upper(substr(md5(gen_random_uuid()::text),1,10)),'ai',thread,cust,wh,'draft','{}',0,0,now()+make_interval(hours=>coalesce(s.draft_expiry_hours,24)),actor) RETURNING * INTO o;
     EXIT;
    EXCEPTION WHEN unique_violation THEN IF n=3 THEN RAISE;END IF;
    END;
   END LOOP;
  END IF;
  -- Coupon first: a coupon replaces bargained prices, so discounts never stack.
  IF nullif(btrim(coalesce(args->>'coupon_code','')),'') IS NOT NULL THEN
   SELECT * INTO cp FROM commerce_coupons WHERE workspace_id=w AND environment=e AND code=upper(left(btrim(args->>'coupon_code'),40)) AND active AND starts_at<=now() AND expires_at>now();
   IF NOT FOUND THEN coupon_state:='invalid';
   ELSIF cardinality(cp.audience)>0 AND NOT cust=ANY(cp.audience) THEN coupon_state:='not_eligible';cp:=NULL;
   ELSIF (SELECT count(*) FROM commerce_coupon_claims c WHERE c.coupon_id=cp.id AND c.status IN('reserved','redeemed') AND c.order_id<>o.id)>=cp.usage_limit THEN coupon_state:='used_up';cp:=NULL;
   ELSIF (SELECT count(*) FROM commerce_coupon_claims c WHERE c.coupon_id=cp.id AND c.customer_id=cust AND c.status IN('reserved','redeemed') AND c.order_id<>o.id)>=cp.per_customer_limit THEN coupon_state:='customer_limit';cp:=NULL;
   ELSE coupon_state:='applied';END IF;
  END IF;
  PERFORM briofold_ai_release(o.id,'ai_draft_release');
  DELETE FROM commerce_lines WHERE order_id=o.id;
  FOR it IN SELECT (x->>'variant_ref')::uuid AS vid,sum((x->>'quantity')::bigint)::bigint AS qty,max(x->>'quote_ref') AS quote FROM jsonb_array_elements(args->'items') x GROUP BY 1 LOOP
   IF it.vid IS NULL OR it.qty IS NULL OR it.qty NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Invalid item or quantity' USING ERRCODE='22023';END IF;
   SELECT * INTO v FROM commerce_variants WHERE id=it.vid AND workspace_id=w AND environment=e AND active;
   IF NOT FOUND OR NOT EXISTS(SELECT 1 FROM commerce_products p WHERE p.id=v.product_id AND p.active) THEN RAISE EXCEPTION 'Unknown variant' USING ERRCODE='22023';END IF;
   INSERT INTO commerce_stock(workspace_id,environment,warehouse_id,variant_id) VALUES(w,e,o.warehouse_id,it.vid) ON CONFLICT DO NOTHING;
   SELECT on_hand-reserved INTO avail FROM commerce_stock WHERE workspace_id=w AND environment=e AND warehouse_id=o.warehouse_id AND variant_id=it.vid FOR UPDATE;
   IF avail<it.qty THEN RAISE EXCEPTION 'Out of stock: % has % available',v.sku,greatest(avail,0) USING ERRCODE='P0002';END IF;
   unit:=v.price_minor;
   IF coupon_state<>'applied' AND it.quote IS NOT NULL THEN
    SELECT q.unit_minor INTO offer FROM commerce_ai_quotes q WHERE q.id=it.quote::uuid AND q.thread_id=thread AND q.variant_id=it.vid AND q.expires_at>now();
    IF FOUND THEN unit:=least(offer,v.price_minor);END IF;
   END IF;
   PERFORM commerce_move(w,e,actor,o.warehouse_id,it.vid,0,it.qty,'ai_draft_reserve',o.id);
   INSERT INTO commerce_lines(workspace_id,environment,order_id,variant_id,name,sku,options,unit_minor,quantity)
    SELECT w,e,o.id,v.id,p.name,v.sku,v.options,unit,it.qty FROM commerce_products p WHERE p.id=v.product_id;
   sub:=sub+unit*it.qty;
  END LOOP;
  area:=CASE WHEN lower(coalesce(args->>'area',''))='dhaka' THEN 'dhaka' ELSE 'outside' END;
  ship:=CASE WHEN area='dhaka' THEN coalesce(s.delivery_dhaka_minor,7000) ELSE coalesce(s.delivery_outside_minor,13000) END;
  IF coupon_state='applied' AND cp.minimum_minor>sub THEN coupon_state:='below_minimum';END IF;
  IF coupon_state='applied' THEN
   disc:=least(CASE cp.kind WHEN 'fixed' THEN cp.value WHEN 'percent' THEN sub*least(cp.value,100)/100 ELSE 0 END,coalesce(cp.max_discount_minor,sub),sub);
   IF cp.kind='shipping' THEN ship:=0;END IF;
   INSERT INTO commerce_coupon_claims(coupon_id,order_id,customer_id,status) VALUES(cp.id,o.id,cust,'reserved') ON CONFLICT(order_id) DO UPDATE SET coupon_id=EXCLUDED.coupon_id,customer_id=EXCLUDED.customer_id,status='reserved';
  ELSE
   UPDATE commerce_coupon_claims SET status='released' WHERE order_id=o.id AND status='reserved';
  END IF;
  rec:=CASE WHEN jsonb_typeof(args->'recipient')='object' THEN jsonb_strip_nulls(jsonb_build_object(
    'name',left(args->'recipient'->>'name',120),'phone',left(regexp_replace(coalesce(args->'recipient'->>'phone',''),'[^0-9+]','','g'),20),
    'address',left(args->'recipient'->>'address',300),'city',left(args->'recipient'->>'city',80))) ELSE o.recipient END;
  UPDATE commerce_orders SET subtotal_minor=sub,shipping_minor=ship,coupon_id=CASE WHEN coupon_state='applied' THEN cp.id END,coupon_discount_minor=disc,total_minor=sub+ship-disc,
   recipient=coalesce(rec,'{}'::jsonb),draft_expires_at=now()+make_interval(hours=>coalesce(s.draft_expiry_hours,24)),updated_at=now() WHERE id=o.id;
  RETURN briofold_ai_order_summary(o.id)||jsonb_build_object('area',area,'coupon',coupon_state);

 ELSIF tool_name='send_order_summary' THEN
  IF o.id IS NULL THEN
   SELECT * INTO o FROM commerce_orders WHERE workspace_id=w AND environment=e AND source='ai' AND source_id=thread ORDER BY created_at DESC LIMIT 1;
   IF NOT FOUND THEN RETURN jsonb_build_object('error','no_order');END IF;
  END IF;
  RETURN briofold_ai_order_summary(o.id);

 ELSIF tool_name='ask_payment_choice' THEN
  IF o.id IS NULL THEN RETURN jsonb_build_object('error','no_draft');END IF;
  IF o.recipient='{}'::jsonb OR coalesce(o.recipient->>'address','')='' THEN RETURN jsonb_build_object('error','address_required');END IF;
  IF args->>'choice'='cod' THEN
   IF NOT coalesce(s.cod_enabled,false) THEN RETURN jsonb_build_object('error','cod_disabled');END IF;
   UPDATE commerce_orders SET payment_state='cod',status='confirmed',shipping_minor=shipping_minor+coalesce(s.cod_charge_minor,0),total_minor=total_minor+coalesce(s.cod_charge_minor,0),draft_expires_at=NULL,updated_at=now() WHERE id=o.id;
   RETURN jsonb_build_object('payment_state','cod','order',briofold_ai_order_summary(o.id));
  ELSIF args->>'choice'='mobile' THEN
   UPDATE commerce_orders SET payment_state='awaiting',updated_at=now() WHERE id=o.id;
   -- Go turns pay_to_accounts into the decrypted receiving numbers; numbers are never stored here.
   RETURN jsonb_build_object('payment_state','awaiting','amount_minor',o.total_minor,'reference',o.reference,'method',CASE WHEN args->>'method' IN('bkash','nagad','rocket') THEN args->>'method' END,
    'pay_to_accounts',to_jsonb(coalesce(s.receiving_account_ids,'{}'::uuid[])),'environment',e,'cod_available',coalesce(s.cod_enabled,false),
    'next','ask the customer to pay and send the TrxID and the sender number');
  END IF;
  RETURN jsonb_build_object('options',jsonb_build_array('mobile')||CASE WHEN coalesce(s.cod_enabled,false) THEN jsonb_build_array('cod') ELSE '[]'::jsonb END);

 ELSIF tool_name='submit_payment_proof' THEN
  SELECT * INTO o FROM commerce_orders WHERE workspace_id=w AND environment=e AND source='ai' AND source_id=thread AND status IN('draft','hold') AND payment_state IN('awaiting','claimed') ORDER BY created_at DESC LIMIT 1;
  IF o.id IS NULL THEN RETURN jsonb_build_object('error','no_order_awaiting_payment');END IF;
  IF EXISTS(SELECT 1 FROM commerce_payment_claims WHERE order_id=o.id AND state='pending') THEN RETURN jsonb_build_object('accepted',false,'reason','verification_in_progress');END IF;
  -- Every claim in the last 24 h counts (pending, failed and review), so TrxIDs cannot be guessed in bulk.
  SELECT count(*) INTO fails FROM commerce_payment_claims WHERE workspace_id=w AND environment=e AND thread_id=thread AND state<>'verified' AND created_at>now()-interval '24 hours';
  IF fails>=coalesce(s.wrong_trx_limit,5) THEN RETURN jsonb_build_object('error','too_many_attempts','handover',true);END IF;
  IF coalesce(args->>'method','') NOT IN('bkash','nagad','rocket') OR coalesce(args->>'transaction_digest','')!~'^[0-9a-f]{64}$' OR coalesce(args->>'payer_digest','')!~'^[0-9a-f]{64}$' THEN
   RETURN jsonb_build_object('error','invalid_proof');END IF;
  IF EXISTS(SELECT 1 FROM commerce_payment_claims WHERE workspace_id=w AND environment=e AND transaction_digest=args->>'transaction_digest') THEN
   -- Count the attempt without storing the reused digest a second time.
   INSERT INTO commerce_payment_claims(workspace_id,environment,order_id,thread_id,method,transaction_digest,transaction_last4,payer_digest,payer_last3,state,reason,resolved_at)
    VALUES(w,e,o.id,thread,args->>'method',encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex'),left(coalesce(args->>'transaction_last4',''),4),args->>'payer_digest',left(coalesce(args->>'payer_last3',''),3),'failed','duplicate_reference',now());
   RETURN jsonb_build_object('accepted',false,'reason','already_used');
  END IF;
  INSERT INTO commerce_payment_claims(workspace_id,environment,order_id,thread_id,method,transaction_digest,transaction_last4,payer_digest,payer_last3,claimed_amount_minor,state,reason,resolved_at)
   VALUES(w,e,o.id,thread,args->>'method',args->>'transaction_digest',left(coalesce(args->>'transaction_last4',''),4),args->>'payer_digest',left(coalesce(args->>'payer_last3',''),3),
    nullif(args->>'amount_minor','')::bigint,CASE WHEN mode='ai' THEN 'review' ELSE 'pending' END,CASE WHEN mode='ai' THEN 'ai_only_never_verified' ELSE '' END,CASE WHEN mode='ai' THEN now() END);
  UPDATE commerce_orders SET payment_state='claimed',draft_expires_at=NULL,claimed_payment=jsonb_build_object('method',args->>'method','last4',left(coalesce(args->>'transaction_last4',''),4),'amount_minor',nullif(args->>'amount_minor','')::bigint),updated_at=now() WHERE id=o.id;
  RETURN jsonb_build_object('accepted',true,'payment_state','claimed','verification',CASE WHEN mode='ai' THEN 'owner_review' ELSE 'pending' END,
   'note','payment is NOT verified yet; never tell the customer it is confirmed');
 END IF;
 RETURN jsonb_build_object('error','tool_unavailable');
END $$;

-- Verification outcome, written by the Go worker after it compared the claim with the financial realm.
CREATE OR REPLACE FUNCTION briofold_ai_claim_resolve(cid uuid,outcome text,why text DEFAULT '',account uuid DEFAULT NULL) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c commerce_payment_claims%ROWTYPE;o commerce_orders%ROWTYPE;mode text;BEGIN
 IF outcome NOT IN('matched','retry','review','failed') THEN RAISE EXCEPTION 'Invalid outcome' USING ERRCODE='22023';END IF;
 SELECT * INTO c FROM commerce_payment_claims WHERE id=cid FOR UPDATE;
 IF NOT FOUND OR c.state<>'pending' THEN RETURN jsonb_build_object('changed',false);END IF;
 SELECT * INTO o FROM commerce_orders WHERE id=c.order_id FOR UPDATE;
 SELECT service_mode INTO mode FROM workspaces WHERE id=c.workspace_id;
 IF outcome='matched' AND mode='ai' THEN outcome:='review';why:='ai_only_never_verified';END IF;
 IF outcome='matched' AND (o.status NOT IN('draft','hold') OR o.payment_state<>'claimed') THEN outcome:='review';why:='paid_after_expiry_or_change';END IF;
 IF outcome='matched' THEN
  UPDATE commerce_payment_claims SET state='verified',reason='',receiving_account_id=account,resolved_at=now(),attempts=attempts+1 WHERE id=cid;
  UPDATE commerce_orders SET payment_state='verified',status='confirmed',draft_expires_at=NULL,updated_at=now() WHERE id=c.order_id;
  UPDATE commerce_coupon_claims SET status='redeemed' WHERE order_id=c.order_id AND status='reserved';
 ELSIF outcome='review' THEN
  UPDATE commerce_payment_claims SET state='review',reason=left(why,200),receiving_account_id=account,resolved_at=now(),attempts=attempts+1 WHERE id=cid;
 ELSIF outcome='retry' THEN
  IF c.created_at<now()-interval '15 minutes' THEN
   UPDATE commerce_payment_claims SET state='review',reason=CASE WHEN why='' THEN 'no_matching_sms' ELSE left(why,200) END,resolved_at=now(),attempts=attempts+1 WHERE id=cid;
  ELSE UPDATE commerce_payment_claims SET attempts=attempts+1,next_try_at=now()+interval '1 minute' WHERE id=cid;END IF;
 ELSE
  UPDATE commerce_payment_claims SET state='failed',reason=left(why,200),resolved_at=now(),attempts=attempts+1 WHERE id=cid;
  UPDATE commerce_orders SET payment_state='awaiting',updated_at=now() WHERE id=c.order_id AND payment_state='claimed' AND status IN('draft','hold');
 END IF;
 RETURN jsonb_build_object('changed',true);
END $$;

CREATE OR REPLACE FUNCTION briofold_ai_claims_due(lim integer DEFAULT 20) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'workspace_id',c.workspace_id,'environment',c.environment,'method',c.method,'digest',c.transaction_digest,'payer_digest',c.payer_digest,
  'due_minor',o.total_minor,'order_created_at',o.created_at,'service_mode',w.service_mode,'accounts',to_jsonb(coalesce(s.receiving_account_ids,'{}'::uuid[])))),'[]')
 FROM (SELECT * FROM commerce_payment_claims WHERE state='pending' AND next_try_at<=now() ORDER BY next_try_at LIMIT least(greatest(lim,1),100)) c
 JOIN commerce_orders o ON o.id=c.order_id JOIN workspaces w ON w.id=c.workspace_id
 LEFT JOIN commerce_ai_settings s ON s.workspace_id=c.workspace_id AND s.environment=c.environment $$;

-- Draft expiry: release stock and coupon of AI drafts that were never paid or confirmed.
CREATE OR REPLACE FUNCTION briofold_ai_expire_drafts() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE o record;n integer:=0;BEGIN
 FOR o IN SELECT id FROM commerce_orders WHERE source='ai' AND status='draft' AND payment_state IN('none','awaiting') AND draft_expires_at<now() ORDER BY draft_expires_at LIMIT 200 FOR UPDATE SKIP LOCKED LOOP
  PERFORM briofold_ai_release(o.id,'ai_draft_expired');
  UPDATE commerce_coupon_claims SET status='released' WHERE order_id=o.id AND status='reserved';
  UPDATE commerce_orders SET status='cancelled',payment_state='none',draft_expires_at=NULL,updated_at=now() WHERE id=o.id;n:=n+1;
 END LOOP;RETURN n;END $$;

-- Owner review queue. Only the last 4 characters of a TrxID and 3 digits of the sender are ever shown.
CREATE OR REPLACE FUNCTION briofold_ai_review_queue(w uuid,e text,a uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM briofold_customer_actor(w,a,'contact');
 IF e NOT IN('live','sandbox') THEN RAISE EXCEPTION 'Invalid environment' USING ERRCODE='22023';END IF;
 RETURN jsonb_build_object('count',(SELECT count(*) FROM commerce_payment_claims WHERE workspace_id=w AND environment=e AND state='review'),
  'items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'order',o.reference,'method',c.method,'last4',c.transaction_last4,'sender_last3',c.payer_last3,'reason',c.reason,'due_minor',o.total_minor,'claimed_minor',c.claimed_amount_minor,'at',c.created_at) ORDER BY c.created_at)
   FROM (SELECT * FROM commerce_payment_claims WHERE workspace_id=w AND environment=e AND state='review' ORDER BY created_at LIMIT 200) c JOIN commerce_orders o ON o.id=c.order_id),'[]'));
END $$;

-- Settings -> AI selling. Owner/admin only (briofold_customer_actor 'contact' also checks disabled users and service mode).
CREATE OR REPLACE FUNCTION briofold_ai_selling_write(w uuid,e text,a uuid,patch jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM briofold_customer_actor(w,a,'contact');
 IF e NOT IN('live','sandbox') OR jsonb_typeof(patch) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid settings' USING ERRCODE='22023';END IF;
 IF jsonb_exists(patch,'receiving_account_ids') AND jsonb_typeof(patch->'receiving_account_ids')<>'array' THEN RAISE EXCEPTION 'Invalid settings' USING ERRCODE='22023';END IF;
 INSERT INTO commerce_ai_settings(workspace_id,environment) VALUES(w,e) ON CONFLICT DO NOTHING;
 UPDATE commerce_ai_settings SET
  ai_selling_enabled=coalesce((patch->>'ai_selling_enabled')::boolean,ai_selling_enabled),cod_enabled=coalesce((patch->>'cod_enabled')::boolean,cod_enabled),cod_charge_minor=coalesce((patch->>'cod_charge_minor')::bigint,cod_charge_minor),
  delivery_dhaka_minor=coalesce((patch->>'delivery_dhaka_minor')::bigint,delivery_dhaka_minor),delivery_outside_minor=coalesce((patch->>'delivery_outside_minor')::bigint,delivery_outside_minor),
  max_discount_pct=coalesce((patch->>'max_discount_pct')::integer,max_discount_pct),negotiation_enabled=coalesce((patch->>'negotiation_enabled')::boolean,negotiation_enabled),
  draft_expiry_hours=coalesce((patch->>'draft_expiry_hours')::integer,draft_expiry_hours),wrong_trx_limit=coalesce((patch->>'wrong_trx_limit')::integer,wrong_trx_limit),
  receiving_account_ids=CASE WHEN jsonb_exists(patch,'receiving_account_ids') THEN ARRAY(SELECT DISTINCT x::uuid FROM jsonb_array_elements_text(patch->'receiving_account_ids') x) ELSE receiving_account_ids END,
  revision=revision+1,updated_at=now()
 WHERE workspace_id=w AND environment=e;
 RETURN (SELECT to_jsonb(s)-'workspace_id' FROM commerce_ai_settings s WHERE workspace_id=w AND environment=e);
END $$;
CREATE OR REPLACE FUNCTION briofold_ai_selling_read(w uuid,e text,a uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM briofold_customer_actor(w,a,'contact');
 RETURN coalesce((SELECT to_jsonb(s)-'workspace_id' FROM commerce_ai_settings s WHERE workspace_id=w AND environment=e),'{}'::jsonb);
END $$;

-- AI selling grounding: with the owner's opt-in and an active live catalog, a question that matches no knowledge source
-- is still claimed (the tools search the catalog). The claim marks such jobs with ctx.ai_selling. Patched in place like
-- 0216/0219 so every existing guard is kept; without the opt-in the claim behaves exactly as before.
CREATE OR REPLACE FUNCTION briofold_ai_selling_on(w uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM commerce_ai_settings s WHERE s.workspace_id=w AND s.environment='live' AND s.ai_selling_enabled)
    AND EXISTS(SELECT 1 FROM commerce_products p WHERE p.workspace_id=w AND p.environment='live' AND p.active)
$$;
REVOKE ALL ON FUNCTION briofold_ai_selling_on(uuid) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
DO $$DECLARE d text;f regprocedure;BEGIN
 f:=coalesce(to_regprocedure('briofold_ai_channel_claim_before_policy()'),to_regprocedure('briofold_ai_channel_claim()'));
 SELECT pg_get_functiondef(f) INTO d;
 IF position('briofold_ai_selling_on' IN d)>0 THEN RETURN;END IF;
 IF position('jsonb_array_length(ctx->''products'')=0 THEN' IN d)=0 OR position('ctx:=ctx||jsonb_build_object(''history'',' IN d)=0 THEN RAISE EXCEPTION 'Unexpected AI claim definition';END IF;
 d:=replace(d,'jsonb_array_length(ctx->''products'')=0 THEN','jsonb_array_length(ctx->''products'')=0 AND NOT briofold_ai_selling_on(j.workspace_id) THEN');
 d:=replace(d,'ctx:=ctx||jsonb_build_object(''history'',','ctx:=ctx||jsonb_build_object(''ai_selling'',briofold_ai_selling_on(j.workspace_id),''history'',');
 EXECUTE d;
END $$;

REVOKE ALL ON FUNCTION briofold_ai_order_summary(uuid),briofold_ai_release(uuid,text),briofold_ai_order_tool(uuid,text,uuid,uuid,text,jsonb),briofold_ai_claim_resolve(uuid,text,text,uuid),
 briofold_ai_claims_due(integer),briofold_ai_expire_drafts(),briofold_ai_review_queue(uuid,text,uuid),briofold_ai_selling_write(uuid,text,uuid,jsonb),briofold_ai_selling_read(uuid,text,uuid)
 FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION briofold_ai_claim_resolve(uuid,text,text,uuid),briofold_ai_claims_due(integer),briofold_ai_expire_drafts(),briofold_ai_review_queue(uuid,text,uuid),
 briofold_ai_selling_write(uuid,text,uuid,jsonb),briofold_ai_selling_read(uuid,text,uuid) TO ekmivo_financial_runtime,ekmivo_financial_projection;
COMMIT;
