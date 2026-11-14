-- 0254: bring the repository level with production (stabilize runbook, step D).
--
-- Production (checked 2026-11-14 against a schema-only copy of the VPS databases) has these objects that no
-- repository migration creates. They came from VPS-only changes on 2026-11-03..10 whose files were never pushed.
--   commerce_products.kind (product | service) and its check constraint
--   inbox_connections.display_name
--   inbox_connection_named(), and the production bodies of inbox_connection_list(), briofold_ai_order_tool()
--   and briofold_ai_tool()
-- The function bodies below are byte-for-byte the production bodies.
--
-- Rule: on production this file must change nothing. Every statement is guarded: a column, constraint or
-- function is created or replaced only when it is missing or its body (md5 of prosrc) differs from production.
-- Running it twice is safe.

DO $m254$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.commerce_products'::regclass AND attname='kind' AND NOT attisdropped) THEN
    ALTER TABLE public.commerce_products ADD COLUMN kind text DEFAULT 'product'::text NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='public.commerce_products'::regclass AND conname='commerce_products_kind_check') THEN
    ALTER TABLE public.commerce_products ADD CONSTRAINT commerce_products_kind_check CHECK ((kind = ANY (ARRAY['product'::text, 'service'::text])));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_attribute WHERE attrelid='public.inbox_connections'::regclass AND attname='display_name' AND NOT attisdropped) THEN
    ALTER TABLE public.inbox_connections ADD COLUMN display_name text;
  END IF;
END
$m254$;

-- inbox_connection_named: production body, md5(prosrc)=7ee6ec3bb5050808c551d5644952bd3e
DO $m254$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.inbox_connection_named(uuid,text,text,text,bytea,text)') AND md5(prosrc)='7ee6ec3bb5050808c551d5644952bd3e') THEN
    EXECUTE $f254$CREATE OR REPLACE FUNCTION public.inbox_connection_named(w uuid, e text, p text, x text, k bytea, n text) RETURNS uuid
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE connection_id uuid;
BEGIN
  connection_id := inbox_connection(w,e,p,x,k);
  UPDATE inbox_connections
  SET display_name = COALESCE(NULLIF(left(btrim(n), 255), ''), display_name)
  WHERE id = connection_id AND workspace_id = w AND environment = e;
  RETURN connection_id;
END
$$$f254$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.inbox_connection_named(w uuid, e text, p text, x text, k bytea, n text) FROM PUBLIC';
    EXECUTE 'GRANT ALL ON FUNCTION public.inbox_connection_named(w uuid, e text, p text, x text, k bytea, n text) TO ekmivo_financial_runtime';
    EXECUTE 'GRANT ALL ON FUNCTION public.inbox_connection_named(w uuid, e text, p text, x text, k bytea, n text) TO ekmivo_financial_projection';
  END IF;
END
$m254$;

-- inbox_connection_list: production body, md5(prosrc)=aea474974d566d37999f2d1fc3e874a6
DO $m254$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.inbox_connection_list(uuid,text)') AND md5(prosrc)='aea474974d566d37999f2d1fc3e874a6') THEN
    EXECUTE $f254$CREATE OR REPLACE FUNCTION public.inbox_connection_list(w uuid, e text) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT jsonb_build_object('items', COALESCE(jsonb_agg(
    jsonb_build_object('id',id,'provider',provider,'enabled',enabled,'external_id',external_id,'display_name',display_name)
    ORDER BY created_at), '[]'::jsonb))
  FROM inbox_connections WHERE workspace_id=w AND environment=e
$$$f254$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.inbox_connection_list(w uuid, e text) FROM PUBLIC';
    EXECUTE 'GRANT ALL ON FUNCTION public.inbox_connection_list(w uuid, e text) TO ekmivo_financial_runtime';
    EXECUTE 'GRANT ALL ON FUNCTION public.inbox_connection_list(w uuid, e text) TO ekmivo_financial_projection';
  END IF;
END
$m254$;

-- briofold_ai_order_tool: production body, md5(prosrc)=18030fb0a65bcc9966556be9cd4fd977
DO $m254$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.briofold_ai_order_tool(uuid,text,uuid,uuid,text,jsonb)') AND md5(prosrc)='18030fb0a65bcc9966556be9cd4fd977') THEN
    EXECUTE $f254$CREATE OR REPLACE FUNCTION public.briofold_ai_order_tool(w uuid, e text, thread uuid, actor uuid, tool_name text, args jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $_$
DECLARE
  s commerce_ai_settings%ROWTYPE; cust uuid; o commerce_orders%ROWTYPE; it record; vid uuid; qty bigint; sub bigint:=0; ship bigint;
  area text; cp commerce_coupons%ROWTYPE; disc bigint:=0; wh uuid; avail bigint; fails integer; mode text;
  v commerce_variants%ROWTYPE; pr commerce_products%ROWTYPE; floor_m bigint; unit bigint; offer bigint; rounds integer; qid uuid;
  coupon_state text:='none'; rec jsonb; n integer; ask_at timestamptz; existing_claim commerce_payment_claims%ROWTYPE; new_cid uuid;
BEGIN
  SELECT * INTO s FROM commerce_ai_settings WHERE workspace_id=w AND environment=e;
  SELECT service_mode INTO mode FROM workspaces WHERE id=w;
  SELECT customer_id INTO cust FROM briofold_customer_sources WHERE workspace_id=w AND environment=e AND kind='thread' AND source_id=thread LIMIT 1;
  SELECT * INTO o FROM commerce_orders WHERE workspace_id=w AND environment=e AND source='ai' AND source_id=thread AND status='draft' AND payment_state IN('none','awaiting') ORDER BY created_at DESC LIMIT 1;

  IF tool_name='delivery_charge' THEN
    area:=CASE WHEN lower(coalesce(args->>'area',''))='dhaka' THEN 'dhaka' ELSE 'outside' END;
    RETURN jsonb_build_object('area',area,'charge_minor',CASE WHEN area='dhaka' THEN coalesce(s.delivery_dhaka_minor,7000) ELSE coalesce(s.delivery_outside_minor,13000) END);

  ELSIF tool_name='quote_price' THEN
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

  ELSIF tool_name='update_order_address' THEN
    IF o.id IS NULL THEN RETURN jsonb_build_object('error','no_draft'); END IF;
    IF o.payment_state='claimed' THEN RETURN jsonb_build_object('error','payment_under_verification'); END IF;
    IF jsonb_typeof(args->'address') IS DISTINCT FROM 'string'
       OR length(btrim(args->>'address')) NOT BETWEEN 1 AND 300
       OR (args ? 'city' AND (jsonb_typeof(args->'city') IS DISTINCT FROM 'string'
           OR length(btrim(args->>'city')) NOT BETWEEN 1 AND 80)) THEN
      RETURN jsonb_build_object('error','invalid_address');
    END IF;
    UPDATE commerce_orders
    SET recipient=coalesce(recipient,'{}'::jsonb)||jsonb_strip_nulls(jsonb_build_object(
          'address',btrim(args->>'address'),'city',nullif(btrim(args->>'city'),''))),
        updated_at=now()
    WHERE id=o.id AND workspace_id=w AND environment=e AND source_id=thread AND status='draft';
    IF NOT FOUND THEN RETURN jsonb_build_object('error','no_draft'); END IF;
    RETURN briofold_ai_order_summary(o.id)||jsonb_build_object('address_updated',true);

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
      RETURN jsonb_build_object('payment_state','awaiting','amount_minor',o.total_minor,'reference',o.reference,'method',CASE WHEN args->>'method' IN('bkash','nagad','rocket') THEN args->>'method' END,
        'pay_to_accounts',to_jsonb(coalesce(s.receiving_account_ids,'{}'::uuid[])),'environment',e,'cod_available',coalesce(s.cod_enabled,false),
        'next','ask the customer to pay and send BOTH the sender phone number (যে নাম্বার থেকে টাকা পাঠিয়েছেন) and the TrxID');
    END IF;
    RETURN jsonb_build_object('options',jsonb_build_array('mobile')||CASE WHEN coalesce(s.cod_enabled,false) THEN jsonb_build_array('cod') ELSE '[]'::jsonb END);

  ELSIF tool_name='submit_payment_proof' THEN
    SELECT * INTO o FROM commerce_orders WHERE workspace_id=w AND environment=e AND source='ai' AND source_id=thread AND status IN('draft','hold') AND payment_state IN('awaiting','claimed') ORDER BY created_at DESC LIMIT 1;
    IF o.id IS NULL THEN RETURN jsonb_build_object('error','no_order_awaiting_payment');END IF;

    SELECT max(tc.created_at) INTO ask_at
    FROM ai_tool_calls tc
    JOIN briofold_ai_channel_jobs j ON j.id=tc.job_id
    WHERE tc.workspace_id=w AND j.thread_id=thread AND tc.tool='ask_payment_choice' AND tc.ok
      AND tc.created_at>=o.created_at;

    IF NOT EXISTS (
      SELECT 1 FROM inbox_messages m
      WHERE m.workspace_id=w AND m.thread_id=thread AND m.sender='customer'
        AND m.created_at>=coalesce(ask_at, o.created_at)
        AND (
          regexp_replace(coalesce(m.body,''), '[\s()-]+', '', 'g') ~ '(?:\+?88|\+?৮৮)?[0০][1১][3-9৩-৯][0-9০-৯]{8}'
          OR coalesce(m.body,'') ~* 'একই নাম্বার|ওই নাম্বার|সেম নাম্বার|ডেলিভারি নাম্বার|same number|this number'
        )
    ) THEN
      RETURN jsonb_build_object(
        'error','sender_number_required_from_customer',
        'accepted',false,
        'note','The customer only sent the TrxID and did NOT state which bKash/Nagad/Rocket sender phone number they paid from. Do NOT reuse the delivery phone number automatically. Ask the customer for the sender phone number they sent the money from, then call submit_payment_proof again.'
      );
    END IF;

    IF coalesce(args->>'method','') NOT IN('bkash','nagad','rocket') OR coalesce(args->>'transaction_digest','')!~'^[0-9a-f]{64}$' OR coalesce(args->>'payer_digest','')!~'^[0-9a-f]{64}$' THEN
      RETURN jsonb_build_object('error','invalid_proof');END IF;

    SELECT * INTO existing_claim FROM commerce_payment_claims WHERE workspace_id=w AND environment=e AND transaction_digest=args->>'transaction_digest' LIMIT 1;
    IF FOUND THEN
      IF existing_claim.order_id=o.id AND existing_claim.state<>'verified' THEN
        UPDATE commerce_payment_claims
        SET method=args->>'method',
            payer_digest=args->>'payer_digest',
            payer_last3=left(coalesce(args->>'payer_last3',''),3),
            claimed_amount_minor=coalesce(nullif(args->>'amount_minor','')::bigint, claimed_amount_minor),
            state=CASE WHEN mode='ai' THEN 'review' ELSE 'pending' END,
            reason=CASE WHEN mode='ai' THEN 'ai_only_never_verified' ELSE '' END,
            attempts=0,
            next_try_at=now(),
            created_at=now(),
            resolved_at=CASE WHEN mode='ai' THEN now() ELSE NULL END
        WHERE id=existing_claim.id;
        UPDATE commerce_orders SET payment_state='claimed',draft_expires_at=NULL,
          claimed_payment=jsonb_build_object('method',args->>'method','last4',left(coalesce(args->>'transaction_last4',''),4),'amount_minor',nullif(args->>'amount_minor','')::bigint),
          updated_at=now() WHERE id=o.id;
        RETURN briofold_ai_verify_claim_now(existing_claim.id);
      END IF;
      INSERT INTO commerce_payment_claims(workspace_id,environment,order_id,thread_id,method,transaction_digest,transaction_last4,payer_digest,payer_last3,state,reason,resolved_at)
      VALUES(w,e,o.id,thread,args->>'method',encode(sha256(convert_to(gen_random_uuid()::text,'UTF8')),'hex'),left(coalesce(args->>'transaction_last4',''),4),args->>'payer_digest',left(coalesce(args->>'payer_last3',''),3),'failed','duplicate_reference',now());
      RETURN jsonb_build_object('accepted',false,'verified',false,'verification','failed','reason','already_used','note','This TrxID has already been used for another order.');
    END IF;

    SELECT count(*) INTO fails FROM commerce_payment_claims WHERE workspace_id=w AND environment=e AND thread_id=thread AND state<>'verified' AND created_at>now()-interval '24 hours';
    IF fails>=coalesce(s.wrong_trx_limit,5) THEN RETURN jsonb_build_object('error','too_many_attempts','handover',true);END IF;

    INSERT INTO commerce_payment_claims(workspace_id,environment,order_id,thread_id,method,transaction_digest,transaction_last4,payer_digest,payer_last3,claimed_amount_minor,state,reason,resolved_at)
    VALUES(w,e,o.id,thread,args->>'method',args->>'transaction_digest',left(coalesce(args->>'transaction_last4',''),4),args->>'payer_digest',left(coalesce(args->>'payer_last3',''),3),
      nullif(args->>'amount_minor','')::bigint,CASE WHEN mode='ai' THEN 'review' ELSE 'pending' END,CASE WHEN mode='ai' THEN 'ai_only_never_verified' ELSE '' END,CASE WHEN mode='ai' THEN now() END)
    RETURNING id INTO new_cid;

    UPDATE commerce_orders SET payment_state='claimed',draft_expires_at=NULL,
      claimed_payment=jsonb_build_object('method',args->>'method','last4',left(coalesce(args->>'transaction_last4',''),4),'amount_minor',nullif(args->>'amount_minor','')::bigint),
      updated_at=now() WHERE id=o.id;

    RETURN briofold_ai_verify_claim_now(new_cid);
  END IF;
  RETURN jsonb_build_object('error','tool_unavailable');
END $_$$f254$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.briofold_ai_order_tool(w uuid, e text, thread uuid, actor uuid, tool_name text, args jsonb) FROM PUBLIC';
  END IF;
END
$m254$;

-- briofold_ai_tool: production body, md5(prosrc)=c575c675421f71ab5cadf7baf873e097
DO $m254$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.briofold_ai_tool(uuid,uuid,integer,text,jsonb,jsonb)') AND md5(prosrc)='c575c675421f71ab5cadf7baf873e097') THEN
    EXECUTE $f254$CREATE OR REPLACE FUNCTION public.briofold_ai_tool(job uuid, lease uuid, step_no integer, tool_name text, args jsonb, args_redacted jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  j briofold_ai_channel_jobs%ROWTYPE;
  t inbox_threads%ROWTYPE;
  env text;
  old jsonb;
  prev text;
  res jsonb;
  pid uuid;
  nm text;
BEGIN
  IF NOT briofold_channel_work_valid(job,lease) THEN RAISE EXCEPTION 'AI job lease is not valid' USING ERRCODE='42501';END IF;
  IF jsonb_typeof(coalesce(args,'{}')) IS DISTINCT FROM 'object' OR step_no NOT BETWEEN 1 AND 6 THEN RAISE EXCEPTION 'Invalid tool call' USING ERRCODE='22023';END IF;
  SELECT tool,result INTO prev,old FROM ai_tool_calls WHERE job_id=job AND step=step_no;
  IF FOUND THEN
    IF prev<>tool_name THEN RAISE EXCEPTION 'Tool step conflict' USING ERRCODE='23505';END IF;
    RETURN old;
  END IF;
  SELECT * INTO j FROM briofold_ai_channel_jobs WHERE id=job;
  SELECT * INTO t FROM inbox_threads WHERE id=j.thread_id;
  SELECT environment INTO env FROM inbox_connections WHERE id=t.connection_id;
  BEGIN
    IF tool_name='search_products' THEN
      res:=jsonb_build_object('products',coalesce((SELECT jsonb_agg(briofold_ai_public_product(x)) FROM jsonb_array_elements(coalesce(
        commerce_product_search(j.workspace_id,env,left(coalesce(args->>'query',''),200),jsonb_build_object('category',args->>'category','in_stock',coalesce((args->>'in_stock')::boolean,true)),5),'[]'::jsonb)) x),'[]'::jsonb));
    ELSIF tool_name='get_product' THEN
      BEGIN pid:=(args->>'product_ref')::uuid;EXCEPTION WHEN others THEN pid:=NULL;END;
      res:=coalesce((SELECT briofold_ai_public_product(commerce_catalog_json(p.id)) FROM commerce_products p WHERE p.id=pid AND p.workspace_id=j.workspace_id AND p.environment=env AND p.active),jsonb_build_object('error','not_found'));
    ELSIF tool_name='get_order_status' THEN
      res:=public.briofold_ai_order_status_live(j.workspace_id,env,t.id,args->>'reference');
    ELSIF tool_name='handover_to_human' THEN
      res:=jsonb_build_object('handover',true);
    ELSIF tool_name='update_customer' THEN
      nm:=left(btrim(regexp_replace(coalesce(args->>'name',''),'[<>{}\[\]\\"`[:cntrl:]]','','g')),80);
      IF length(nm)=0 THEN res:=jsonb_build_object('error','name_required');
      ELSE
        UPDATE briofold_customers c SET name=nm,revision=c.revision+1
         WHERE c.id IN(SELECT s.customer_id FROM briofold_customer_sources s WHERE s.kind='thread' AND s.source_id=t.id) AND c.workspace_id=j.workspace_id
           AND (btrim(c.name) IN('','Customer') OR c.name=coalesce(t.customer_name,''));
        res:=jsonb_build_object('updated',FOUND);
      END IF;
    ELSE
      res:=briofold_ai_order_limit(j.workspace_id,env,tool_name,briofold_ai_order_tool(j.workspace_id,env,t.id,j.actor_id,tool_name,args));
    END IF;
  EXCEPTION
    WHEN SQLSTATE 'P0002' THEN res:=jsonb_build_object('error','out_of_stock','detail',left(SQLERRM,120));
    WHEN SQLSTATE '22023' OR SQLSTATE '22P02' OR SQLSTATE '22003' OR SQLSTATE '23514' OR SQLSTATE '23502' THEN res:=jsonb_build_object('error','invalid_request','detail',left(SQLERRM,120));
    WHEN SQLSTATE '23505' THEN res:=jsonb_build_object('error','conflict');
  END;
  INSERT INTO ai_tool_calls(workspace_id,job_id,step,tool,args_redacted,result,ok) VALUES(j.workspace_id,job,step_no,tool_name,coalesce(args_redacted,'{}'),res,NOT jsonb_exists(res,'error'));
  RETURN res;
END $$$f254$;
    EXECUTE 'REVOKE ALL ON FUNCTION public.briofold_ai_tool(job uuid, lease uuid, step_no integer, tool_name text, args jsonb, args_redacted jsonb) FROM PUBLIC';
    EXECUTE 'GRANT ALL ON FUNCTION public.briofold_ai_tool(job uuid, lease uuid, step_no integer, tool_name text, args jsonb, args_redacted jsonb) TO ekmivo_financial_runtime';
    EXECUTE 'GRANT ALL ON FUNCTION public.briofold_ai_tool(job uuid, lease uuid, step_no integer, tool_name text, args jsonb, args_redacted jsonb) TO ekmivo_financial_projection';
  END IF;
END
$m254$;
