-- Phase 4: AI orders, payment claims, selling settings. payment_state is separate from order status.
-- AI-only workspaces never reach payment_state='verified' (a claim stays unverified for the owner).
BEGIN;
ALTER TABLE commerce_orders ADD COLUMN IF NOT EXISTS payment_state text NOT NULL DEFAULT 'none' CHECK(payment_state IN('none','awaiting','claimed','verified','cod','failed'));
ALTER TABLE commerce_orders ADD COLUMN IF NOT EXISTS draft_expires_at timestamptz;

CREATE TABLE IF NOT EXISTS commerce_ai_settings(
 workspace_id uuid NOT NULL REFERENCES workspaces(id),environment text NOT NULL CHECK(environment IN('live','sandbox')),
 cod_enabled boolean NOT NULL DEFAULT false,cod_charge_minor bigint NOT NULL DEFAULT 0 CHECK(cod_charge_minor>=0),
 delivery_dhaka_minor bigint NOT NULL DEFAULT 7000 CHECK(delivery_dhaka_minor>=0),delivery_outside_minor bigint NOT NULL DEFAULT 13000 CHECK(delivery_outside_minor>=0),
 max_discount_pct integer NOT NULL DEFAULT 0 CHECK(max_discount_pct BETWEEN 0 AND 100),negotiation_enabled boolean NOT NULL DEFAULT false,
 draft_expiry_hours integer NOT NULL DEFAULT 24 CHECK(draft_expiry_hours BETWEEN 1 AND 168),wrong_trx_limit integer NOT NULL DEFAULT 5 CHECK(wrong_trx_limit BETWEEN 1 AND 20),
 receiving_numbers jsonb NOT NULL DEFAULT '[]' CHECK(jsonb_typeof(receiving_numbers)='array' AND pg_column_size(receiving_numbers)<=2000),
 revision bigint NOT NULL DEFAULT 1,updated_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(workspace_id,environment));

CREATE TABLE IF NOT EXISTS commerce_payment_claims(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id),environment text NOT NULL CHECK(environment IN('live','sandbox')),
 order_id uuid NOT NULL REFERENCES commerce_orders(id),thread_id uuid,method text NOT NULL CHECK(method IN('bkash','nagad','rocket')),
 transaction_digest char(64) NOT NULL,transaction_last4 text NOT NULL CHECK(length(transaction_last4)<=4),claimed_amount_minor bigint,
 state text NOT NULL DEFAULT 'pending' CHECK(state IN('pending','verified','failed','review')),reason text NOT NULL DEFAULT '' CHECK(length(reason)<=200),
 attempts integer NOT NULL DEFAULT 0,next_try_at timestamptz NOT NULL DEFAULT now(),created_at timestamptz NOT NULL DEFAULT now(),resolved_at timestamptz,
 UNIQUE(workspace_id,environment,transaction_digest));
CREATE INDEX IF NOT EXISTS commerce_payment_claims_due ON commerce_payment_claims(next_try_at) WHERE state='pending';
CREATE INDEX IF NOT EXISTS commerce_payment_claims_review ON commerce_payment_claims(workspace_id,environment) WHERE state='review';
DO $$DECLARE x text;BEGIN FOREACH x IN ARRAY ARRAY['commerce_ai_settings','commerce_payment_claims'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',x);EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',x);
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE tablename=x AND policyname=x||'_owner') THEN EXECUTE format('CREATE POLICY %I ON %I TO %I USING(true) WITH CHECK(true)',x||'_owner',x,current_user);END IF;
 EXECUTE format('REVOKE ALL ON %I FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection',x);END LOOP;END $$;

-- Server-side price. A customer offer is honoured only down to the floor:
-- max(product min price, list price less max_discount_pct); no negotiation => list price.
CREATE OR REPLACE FUNCTION briofold_ai_unit_price(w uuid,e text,variant uuid,offer bigint) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE v commerce_variants%ROWTYPE;pr commerce_products%ROWTYPE;s commerce_ai_settings%ROWTYPE;floor_m bigint;unit bigint;BEGIN
 SELECT * INTO v FROM commerce_variants WHERE id=variant AND workspace_id=w AND environment=e AND active;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','variant_not_found');END IF;
 SELECT * INTO pr FROM commerce_products WHERE id=v.product_id AND active;
 SELECT * INTO s FROM commerce_ai_settings WHERE workspace_id=w AND environment=e;
 floor_m:=v.price_minor;
 IF coalesce(s.negotiation_enabled,false) THEN floor_m:=greatest(coalesce(pr.min_price_minor,0),(v.price_minor*(100-coalesce(s.max_discount_pct,0)))/100);END IF;
 unit:=CASE WHEN offer IS NULL OR offer>=v.price_minor THEN v.price_minor ELSE greatest(offer,floor_m) END;
 RETURN jsonb_build_object('variant_ref',v.id,'sku',v.sku,'list_minor',v.price_minor,'unit_minor',unit,'at_floor',unit=floor_m AND floor_m<v.price_minor);
END $$;
REVOKE ALL ON FUNCTION briofold_ai_unit_price(uuid,text,uuid,bigint) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;

CREATE OR REPLACE FUNCTION briofold_ai_order_tool(w uuid,e text,thread uuid,tool_name text,args jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s commerce_ai_settings%ROWTYPE;cust uuid;o commerce_orders%ROWTYPE;it jsonb;vid uuid;qty bigint;price jsonb;sub bigint:=0;ship bigint;area text;cp commerce_coupons%ROWTYPE;disc bigint:=0;wh uuid;ln record;avail bigint;
 fails integer;BEGIN
 SELECT * INTO s FROM commerce_ai_settings WHERE workspace_id=w AND environment=e;
 SELECT customer_id INTO cust FROM briofold_customer_sources WHERE kind='thread' AND source_id=thread LIMIT 1;
 SELECT * INTO o FROM commerce_orders WHERE workspace_id=w AND environment=e AND source='ai' AND source_id=thread AND status='draft' ORDER BY created_at DESC LIMIT 1;
 IF tool_name='delivery_charge' THEN
  area:=lower(coalesce(args->>'area','outside'));
  RETURN jsonb_build_object('area',area,'charge_minor',CASE WHEN area='dhaka' THEN coalesce(s.delivery_dhaka_minor,7000) ELSE coalesce(s.delivery_outside_minor,13000) END);
 ELSIF tool_name='quote_price' THEN
  BEGIN vid:=(args->>'variant_ref')::uuid;EXCEPTION WHEN others THEN RETURN jsonb_build_object('error','bad_reference');END;
  RETURN briofold_ai_unit_price(w,e,vid,nullif(args->>'offer_minor','')::bigint);
 ELSIF tool_name='check_coupon' THEN
  SELECT * INTO cp FROM commerce_coupons WHERE workspace_id=w AND environment=e AND code=upper(left(coalesce(args->>'code',''),40));
  IF NOT FOUND OR NOT cp.active THEN RETURN jsonb_build_object('valid',false,'reason','unknown');END IF;
  IF cp.expires_at<=now() THEN RETURN jsonb_build_object('valid',false,'reason','expired');END IF;
  IF cp.starts_at>now() THEN RETURN jsonb_build_object('valid',false,'reason','not_started');END IF;
  IF (SELECT count(*) FROM commerce_coupon_claims c WHERE c.coupon_id=cp.id AND c.status IN('reserved','redeemed'))>=cp.usage_limit THEN RETURN jsonb_build_object('valid',false,'reason','used_up');END IF;
  IF cust IS NOT NULL AND (SELECT count(*) FROM commerce_coupon_claims c WHERE c.coupon_id=cp.id AND c.customer_id=cust AND c.status IN('reserved','redeemed'))>=cp.per_customer_limit THEN RETURN jsonb_build_object('valid',false,'reason','customer_limit');END IF;
  RETURN jsonb_build_object('valid',true,'kind',cp.kind,'value',cp.value,'minimum_minor',cp.minimum_minor);
 ELSIF tool_name='upsert_order_draft' THEN
  IF cust IS NULL THEN RETURN jsonb_build_object('error','no_customer');END IF;
  SELECT id INTO wh FROM commerce_warehouses WHERE workspace_id=w AND environment=e ORDER BY id LIMIT 1;
  IF wh IS NULL THEN RETURN jsonb_build_object('error','no_warehouse');END IF;
  IF jsonb_typeof(args->'items') IS DISTINCT FROM 'array' OR jsonb_array_length(args->'items') NOT BETWEEN 1 AND 10 THEN RETURN jsonb_build_object('error','items_required');END IF;
  IF o.id IS NULL THEN
   INSERT INTO commerce_orders(id,workspace_id,environment,reference,source,source_id,customer_id,warehouse_id,status,recipient,subtotal_minor,total_minor,draft_expires_at)
   VALUES(gen_random_uuid(),w,e,'AI-'||upper(substr(md5(random()::text||clock_timestamp()::text),1,8)),'ai',thread,cust,wh,'draft','{}',0,0,now()+make_interval(hours=>coalesce(s.draft_expiry_hours,24))) RETURNING * INTO o;
  END IF;
  -- release the previous reservation, then reserve again under a row lock
  FOR ln IN SELECT * FROM commerce_lines WHERE order_id=o.id LOOP UPDATE commerce_stock SET reserved=greatest(reserved-ln.quantity,0) WHERE variant_id=ln.variant_id AND warehouse_id=o.warehouse_id;END LOOP;
  DELETE FROM commerce_lines WHERE order_id=o.id;
  FOR it IN SELECT * FROM jsonb_array_elements(args->'items') LOOP
   BEGIN vid:=(it->>'variant_ref')::uuid;qty:=(it->>'quantity')::bigint;EXCEPTION WHEN others THEN RAISE EXCEPTION 'Invalid item' USING ERRCODE='22023';END;
   IF qty IS NULL OR qty NOT BETWEEN 1 AND 20 THEN RAISE EXCEPTION 'Invalid quantity' USING ERRCODE='22023';END IF;
   SELECT on_hand-reserved INTO avail FROM commerce_stock WHERE variant_id=vid AND warehouse_id=o.warehouse_id FOR UPDATE;
   IF avail IS NULL OR avail<qty THEN RAISE EXCEPTION 'Out of stock' USING ERRCODE='P0002';END IF;
   price:=briofold_ai_unit_price(w,e,vid,nullif(it->>'offer_minor','')::bigint);
   IF jsonb_exists(price,'error') THEN RAISE EXCEPTION 'Unknown variant' USING ERRCODE='22023';END IF;
   UPDATE commerce_stock SET reserved=reserved+qty WHERE variant_id=vid AND warehouse_id=o.warehouse_id;
   INSERT INTO commerce_lines(workspace_id,environment,order_id,variant_id,name,sku,options,unit_minor,quantity)
    SELECT w,e,o.id,v.id,p.name,v.sku,v.options,(price->>'unit_minor')::bigint,qty FROM commerce_variants v JOIN commerce_products p ON p.id=v.product_id WHERE v.id=vid
    ON CONFLICT(order_id,variant_id) DO UPDATE SET quantity=commerce_lines.quantity+EXCLUDED.quantity;
   sub:=sub+(price->>'unit_minor')::bigint*qty;
  END LOOP;
  area:=lower(coalesce(args->>'area','outside'));
  ship:=CASE WHEN area='dhaka' THEN coalesce(s.delivery_dhaka_minor,7000) ELSE coalesce(s.delivery_outside_minor,13000) END;
  IF nullif(args->>'coupon_code','') IS NOT NULL THEN
   SELECT * INTO cp FROM commerce_coupons WHERE workspace_id=w AND environment=e AND code=upper(left(args->>'coupon_code',40)) AND active AND starts_at<=now() AND expires_at>now() AND minimum_minor<=sub;
   IF FOUND AND (SELECT count(*) FROM commerce_coupon_claims c WHERE c.coupon_id=cp.id AND c.customer_id=cust AND c.status IN('reserved','redeemed') AND c.order_id<>o.id)<cp.per_customer_limit THEN
    disc:=least(CASE cp.kind WHEN 'fixed' THEN cp.value WHEN 'percent' THEN sub*cp.value/100 ELSE 0 END,coalesce(cp.max_discount_minor,sub),sub);
    IF cp.kind='shipping' THEN ship:=0;END IF;
    INSERT INTO commerce_coupon_claims(coupon_id,order_id,customer_id,status) VALUES(cp.id,o.id,cust,'reserved') ON CONFLICT(order_id) DO UPDATE SET coupon_id=EXCLUDED.coupon_id,status='reserved';
    UPDATE commerce_orders SET coupon_id=cp.id WHERE id=o.id;
   END IF;
  END IF;
  UPDATE commerce_orders SET subtotal_minor=sub,shipping_minor=ship,coupon_discount_minor=disc,total_minor=sub+ship-disc,
   recipient=CASE WHEN jsonb_typeof(args->'recipient')='object' THEN args->'recipient' ELSE recipient END,draft_expires_at=now()+make_interval(hours=>coalesce(s.draft_expiry_hours,24)),updated_at=now() WHERE id=o.id;
  RETURN briofold_ai_order_summary(o.id);
 ELSIF tool_name='send_order_summary' THEN
  IF o.id IS NULL THEN RETURN jsonb_build_object('error','no_draft');END IF;
  RETURN briofold_ai_order_summary(o.id);
 ELSIF tool_name='ask_payment_choice' THEN
  IF o.id IS NULL THEN RETURN jsonb_build_object('error','no_draft');END IF;
  IF args->>'choice'='cod' THEN
   IF NOT coalesce(s.cod_enabled,false) THEN RETURN jsonb_build_object('error','cod_disabled');END IF;
   UPDATE commerce_orders SET payment_state='cod',status='confirmed',total_minor=total_minor+coalesce(s.cod_charge_minor,0),updated_at=now() WHERE id=o.id;
   RETURN jsonb_build_object('payment_state','cod','order',briofold_ai_order_summary(o.id));
  ELSIF args->>'choice'='mobile' THEN
   UPDATE commerce_orders SET payment_state='awaiting',updated_at=now() WHERE id=o.id;
   RETURN jsonb_build_object('payment_state','awaiting','pay_to',coalesce(s.receiving_numbers,'[]'::jsonb),'amount_minor',o.total_minor,'cod_available',coalesce(s.cod_enabled,false));
  END IF;
  RETURN jsonb_build_object('options',jsonb_build_array('mobile')||CASE WHEN coalesce(s.cod_enabled,false) THEN jsonb_build_array('cod') ELSE '[]'::jsonb END);
 ELSIF tool_name='submit_payment_proof' THEN
  -- args carry only a server-computed digest and last4; the TrxID itself never reaches this database.
  SELECT * INTO o FROM commerce_orders WHERE workspace_id=w AND environment=e AND source='ai' AND source_id=thread AND payment_state IN('awaiting','claimed') ORDER BY created_at DESC LIMIT 1;
  IF o.id IS NULL THEN RETURN jsonb_build_object('error','no_order_awaiting_payment');END IF;
  SELECT count(*) INTO fails FROM commerce_payment_claims WHERE workspace_id=w AND environment=e AND thread_id=thread AND state IN('failed','review');
  IF fails>=coalesce(s.wrong_trx_limit,5) THEN UPDATE inbox_threads SET ai_enabled=false,ai_version=ai_version+1 WHERE id=thread;RETURN jsonb_build_object('error','too_many_attempts','handover',true);END IF;
  IF args->>'method' NOT IN('bkash','nagad','rocket') OR coalesce(length(args->>'transaction_digest'),0)<>64 THEN RETURN jsonb_build_object('error','invalid_proof');END IF;
  IF EXISTS(SELECT 1 FROM commerce_payment_claims WHERE workspace_id=w AND environment=e AND transaction_digest=args->>'transaction_digest') THEN
   INSERT INTO commerce_payment_claims(workspace_id,environment,order_id,thread_id,method,transaction_digest,transaction_last4,state,reason)
    VALUES(w,e,o.id,thread,args->>'method',encode(sha256((gen_random_uuid()::text)::bytea),'hex'),coalesce(left(args->>'transaction_last4',4),''),'failed','duplicate_reference');
   RETURN jsonb_build_object('accepted',false,'reason','already_used');
  END IF;
  INSERT INTO commerce_payment_claims(workspace_id,environment,order_id,thread_id,method,transaction_digest,transaction_last4,claimed_amount_minor)
   VALUES(w,e,o.id,thread,args->>'method',args->>'transaction_digest',coalesce(left(args->>'transaction_last4',4),''),nullif(args->>'amount_minor','')::bigint);
  UPDATE commerce_orders SET payment_state='claimed',claimed_payment=jsonb_build_object('method',args->>'method','last4',coalesce(left(args->>'transaction_last4',4),''),'amount_minor',nullif(args->>'amount_minor','')::bigint),updated_at=now() WHERE id=o.id;
  RETURN jsonb_build_object('accepted',true,'payment_state','claimed','verification','pending');
 ELSIF tool_name='create_payment_link' OR tool_name='find_product_by_image' THEN
  RETURN jsonb_build_object('error','tool_unavailable');
 ELSIF tool_name='send_products' THEN
  RETURN jsonb_build_object('error','use_search_products');
 END IF;
 RETURN jsonb_build_object('error','tool_unavailable');
END $$;
REVOKE ALL ON FUNCTION briofold_ai_order_tool(uuid,text,uuid,text,jsonb) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;

CREATE OR REPLACE FUNCTION briofold_ai_order_summary(oid uuid) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('reference',o.reference,'status',o.status,'payment_state',o.payment_state,'subtotal_minor',o.subtotal_minor,'shipping_minor',o.shipping_minor,
  'discount_minor',o.coupon_discount_minor,'total_minor',o.total_minor,'lines',coalesce((SELECT jsonb_agg(jsonb_build_object('name',l.name,'sku',l.sku,'quantity',l.quantity,'unit_minor',l.unit_minor)) FROM commerce_lines l WHERE l.order_id=o.id),'[]'))
 FROM commerce_orders o WHERE o.id=oid $$;
REVOKE ALL ON FUNCTION briofold_ai_order_summary(uuid) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;

CREATE OR REPLACE FUNCTION briofold_ai_tool(job uuid,lease uuid,step_no integer,tool_name text,args jsonb,args_redacted jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j briofold_ai_channel_jobs%ROWTYPE;t inbox_threads%ROWTYPE;env text;old jsonb;res jsonb;pid uuid;BEGIN
 IF NOT briofold_channel_work_valid(job,lease) THEN RAISE EXCEPTION 'AI job lease is not valid' USING ERRCODE='42501';END IF;
 IF jsonb_typeof(coalesce(args,'{}')) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid tool arguments' USING ERRCODE='22023';END IF;
 SELECT result INTO old FROM ai_tool_calls WHERE job_id=job AND step=step_no;
 IF FOUND THEN RETURN old;END IF;
 SELECT * INTO j FROM briofold_ai_channel_jobs WHERE id=job;
 SELECT * INTO t FROM inbox_threads WHERE id=j.thread_id;
 SELECT environment INTO env FROM inbox_connections WHERE id=t.connection_id;
 IF tool_name='search_products' THEN
  res:=jsonb_build_object('products',coalesce(commerce_product_search(j.workspace_id,env,left(coalesce(args->>'query',''),200),jsonb_build_object('category',args->>'category','in_stock',coalesce((args->>'in_stock')::boolean,true)),5),'[]'::jsonb));
 ELSIF tool_name='get_product' THEN
  BEGIN pid:=(args->>'product_ref')::uuid;EXCEPTION WHEN others THEN pid:=NULL;END;
  res:=coalesce((SELECT commerce_catalog_json(p.id)-'min_price_minor'-'ai_notes' FROM commerce_products p WHERE p.id=pid AND p.workspace_id=j.workspace_id AND p.environment=env AND p.active),jsonb_build_object('error','not_found'));
 ELSIF tool_name='get_order_status' THEN
  res:=coalesce((SELECT jsonb_build_object('reference',o.reference,'status',o.status,'payment_state',o.payment_state,'total_minor',o.total_minor,'claimed_payment_unverified',o.claimed_payment<>'{}'::jsonb)
   FROM commerce_orders o JOIN briofold_customer_sources s ON s.customer_id=o.customer_id AND s.kind='thread' AND s.source_id=t.id
   WHERE o.workspace_id=j.workspace_id AND o.environment=env AND o.reference=upper(left(coalesce(args->>'reference',''),80)) LIMIT 1),jsonb_build_object('error','not_found'));
 ELSIF tool_name='handover_to_human' THEN
  UPDATE inbox_threads SET ai_enabled=false,ai_version=ai_version+1 WHERE id=t.id;
  res:=jsonb_build_object('handover',true);
 ELSIF tool_name='update_customer' THEN
  UPDATE briofold_customers c SET name=left(btrim(coalesce(args->>'name',c.name)),120),revision=c.revision+1
   WHERE c.id IN(SELECT s.customer_id FROM briofold_customer_sources s WHERE s.kind='thread' AND s.source_id=t.id) AND c.workspace_id=j.workspace_id AND length(btrim(coalesce(args->>'name','')))>0;
  res:=jsonb_build_object('updated',true);
 ELSE
  res:=briofold_ai_order_tool(j.workspace_id,env,t.id,tool_name,args);
 END IF;
 INSERT INTO ai_tool_calls(workspace_id,job_id,step,tool,args_redacted,result,ok) VALUES(j.workspace_id,job,step_no,tool_name,coalesce(args_redacted,'{}'),res,NOT jsonb_exists(res,'error'));
 RETURN res;
END $$;
REVOKE ALL ON FUNCTION briofold_ai_tool(uuid,uuid,integer,text,jsonb,jsonb) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;

-- Verification outcome, written by the Go worker after it compared the claim with the financial realm.
-- verified: payment_state verified + order confirmed + coupon redeemed. AI-only workspaces never verify.
CREATE OR REPLACE FUNCTION briofold_ai_claim_resolve(cid uuid,outcome text,why text DEFAULT '') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c commerce_payment_claims%ROWTYPE;mode text;BEGIN
 SELECT * INTO c FROM commerce_payment_claims WHERE id=cid FOR UPDATE;
 IF NOT FOUND OR c.state<>'pending' THEN RETURN jsonb_build_object('changed',false);END IF;
 SELECT service_mode INTO mode FROM workspaces WHERE id=c.workspace_id;
 IF outcome='matched' AND mode='ai' THEN outcome:='review';why:='ai_only_never_verified';END IF;
 IF outcome='matched' THEN
  UPDATE commerce_payment_claims SET state='verified',reason='',resolved_at=now(),attempts=attempts+1 WHERE id=cid;
  UPDATE commerce_orders SET payment_state='verified',status=CASE WHEN status='draft' THEN 'confirmed' ELSE status END,draft_expires_at=NULL,updated_at=now() WHERE id=c.order_id;
  UPDATE commerce_coupon_claims SET status='redeemed' WHERE order_id=c.order_id AND status='reserved';
 ELSIF outcome='review' THEN
  UPDATE commerce_payment_claims SET state='review',reason=left(why,200),resolved_at=now(),attempts=attempts+1 WHERE id=cid;
 ELSIF outcome='retry' THEN
  IF c.created_at<now()-interval '15 minutes' THEN
   UPDATE commerce_payment_claims SET state='review',reason='no_matching_sms',resolved_at=now(),attempts=attempts+1 WHERE id=cid;
  ELSE UPDATE commerce_payment_claims SET attempts=attempts+1,next_try_at=now()+interval '1 minute' WHERE id=cid;END IF;
 ELSE
  UPDATE commerce_payment_claims SET state='failed',reason=left(why,200),resolved_at=now(),attempts=attempts+1 WHERE id=cid;
  UPDATE commerce_orders SET payment_state='awaiting',updated_at=now() WHERE id=c.order_id AND payment_state='claimed';
 END IF;
 RETURN jsonb_build_object('changed',true);
END $$;
REVOKE ALL ON FUNCTION briofold_ai_claim_resolve(uuid,text,text) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;

CREATE OR REPLACE FUNCTION briofold_ai_claims_due(lim integer DEFAULT 20) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',c.id,'workspace_id',c.workspace_id,'environment',c.environment,'method',c.method,'digest',c.transaction_digest,
  'due_minor',o.total_minor,'order_created_at',o.created_at)),'[]') FROM (SELECT * FROM commerce_payment_claims WHERE state='pending' AND next_try_at<=now() ORDER BY next_try_at LIMIT least(lim,100)) c JOIN commerce_orders o ON o.id=c.order_id $$;
REVOKE ALL ON FUNCTION briofold_ai_claims_due(integer) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;

-- Draft expiry: release stock and coupon of AI drafts that were never paid or confirmed.
CREATE OR REPLACE FUNCTION briofold_ai_expire_drafts() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE o record;ln record;n integer:=0;BEGIN
 FOR o IN SELECT id,warehouse_id FROM commerce_orders WHERE source='ai' AND status='draft' AND payment_state IN('none','awaiting') AND draft_expires_at<now() FOR UPDATE SKIP LOCKED LOOP
  FOR ln IN SELECT variant_id,quantity FROM commerce_lines WHERE order_id=o.id LOOP UPDATE commerce_stock SET reserved=greatest(reserved-ln.quantity,0) WHERE variant_id=ln.variant_id AND warehouse_id=o.warehouse_id;END LOOP;
  UPDATE commerce_coupon_claims SET status='released' WHERE order_id=o.id AND status='reserved';
  UPDATE commerce_orders SET status='cancelled',draft_expires_at=NULL,updated_at=now() WHERE id=o.id;n:=n+1;
 END LOOP;RETURN n;END $$;
REVOKE ALL ON FUNCTION briofold_ai_expire_drafts() FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;

-- Owner review queue (claims the system could not verify). Body only exposes last4, never the full TrxID.
CREATE OR REPLACE FUNCTION briofold_ai_review_queue(w uuid,e text,a uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM workspace_members m WHERE m.workspace_id=w AND m.user_id=a AND m.role IN('owner','admin')) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('count',(SELECT count(*) FROM commerce_payment_claims WHERE workspace_id=w AND environment=e AND state='review'),
  'items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',c.id,'order',o.reference,'method',c.method,'last4',c.transaction_last4,'reason',c.reason,'due_minor',o.total_minor,'claimed_minor',c.claimed_amount_minor,'at',c.created_at) ORDER BY c.created_at)
   FROM commerce_payment_claims c JOIN commerce_orders o ON o.id=c.order_id WHERE c.workspace_id=w AND c.environment=e AND c.state='review'),'[]'));
END $$;
REVOKE ALL ON FUNCTION briofold_ai_review_queue(uuid,text,uuid) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;

-- Settings -> AI selling. Owner/admin only; the receiving number is stored as typed and never logged.
CREATE OR REPLACE FUNCTION briofold_ai_selling_write(w uuid,e text,a uuid,patch jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM workspace_members m WHERE m.workspace_id=w AND m.user_id=a AND m.role IN('owner','admin')) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 INSERT INTO commerce_ai_settings(workspace_id,environment) VALUES(w,e) ON CONFLICT DO NOTHING;
 UPDATE commerce_ai_settings SET
  cod_enabled=coalesce((patch->>'cod_enabled')::boolean,cod_enabled),cod_charge_minor=coalesce((patch->>'cod_charge_minor')::bigint,cod_charge_minor),
  delivery_dhaka_minor=coalesce((patch->>'delivery_dhaka_minor')::bigint,delivery_dhaka_minor),delivery_outside_minor=coalesce((patch->>'delivery_outside_minor')::bigint,delivery_outside_minor),
  max_discount_pct=coalesce((patch->>'max_discount_pct')::integer,max_discount_pct),negotiation_enabled=coalesce((patch->>'negotiation_enabled')::boolean,negotiation_enabled),
  draft_expiry_hours=coalesce((patch->>'draft_expiry_hours')::integer,draft_expiry_hours),wrong_trx_limit=coalesce((patch->>'wrong_trx_limit')::integer,wrong_trx_limit),
  receiving_numbers=CASE WHEN jsonb_typeof(patch->'receiving_numbers')='array' THEN patch->'receiving_numbers' ELSE receiving_numbers END,revision=revision+1,updated_at=now()
 WHERE workspace_id=w AND environment=e;
 RETURN (SELECT to_jsonb(s)-'workspace_id' FROM commerce_ai_settings s WHERE workspace_id=w AND environment=e);
END $$;
REVOKE ALL ON FUNCTION briofold_ai_selling_write(uuid,text,uuid,jsonb) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
CREATE OR REPLACE FUNCTION briofold_ai_selling_read(w uuid,e text,a uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM workspace_members m WHERE m.workspace_id=w AND m.user_id=a AND m.role IN('owner','admin')) THEN RAISE EXCEPTION 'Forbidden' USING ERRCODE='42501';END IF;
 RETURN coalesce((SELECT to_jsonb(s)-'workspace_id' FROM commerce_ai_settings s WHERE workspace_id=w AND environment=e),'{}'::jsonb);
END $$;
REVOKE ALL ON FUNCTION briofold_ai_selling_read(uuid,text,uuid) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
COMMIT;
