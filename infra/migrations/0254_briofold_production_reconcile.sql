-- 0254: bring the repository level with production (stabilize runbook, step D).
--
-- Production (checked 2026-11-14 against a schema-only copy of the VPS control database) has objects that no
-- repository migration creates, and functions whose production source differs from what the repository builds.
-- They came from changes made directly on the VPS between 2026-11-03 and 2026-11-10.
-- This file carries them over exactly: two columns and a check constraint, the dblink extension, and the
-- production source of every differing function (embedded as base64 where the source contains CR bytes).
--
-- Rule: on production this file changes nothing. Every statement is guarded by existence or by md5(prosrc)
-- equal to production. Running it twice is safe. Owner decision 2026-11-15: the repository must match production.

DO $m$
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
  -- Production has dblink 1.2 (used only by briofold_ai_financial_receipt_lookup). It needs a superuser to install,
  -- so a fresh build without one skips it; production already has it.
  IF NOT EXISTS (SELECT 1 FROM pg_extension WHERE extname='dblink')
     AND EXISTS (SELECT 1 FROM pg_available_extensions WHERE name='dblink')
     AND (SELECT rolsuper FROM pg_roles WHERE rolname=current_user) THEN
    CREATE EXTENSION dblink;
  END IF;
END
$m$;

-- briofold_ai_claims_due(integer): production md5(prosrc)=5a6414bcafbc5b533782e43e1e2c35d3
DO $m$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.briofold_ai_claims_due(integer)') AND md5(prosrc)='5a6414bcafbc5b533782e43e1e2c35d3') THEN
    EXECUTE $r$CREATE OR REPLACE FUNCTION public.briofold_ai_claims_due(lim integer DEFAULT 20)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT coalesce(jsonb_agg(jsonb_build_object(
    'id',c.id,'workspace_id',c.workspace_id,'environment',c.environment,'method',c.method,
    'digest',c.transaction_digest,'payer_digest',c.payer_digest,
    'due_minor',o.total_minor,'order_created_at',o.created_at,'service_mode',w.service_mode,
    'accounts','[]'::jsonb
  )),'[]'::jsonb)
  FROM (SELECT * FROM commerce_payment_claims WHERE state='pending' AND next_try_at<=now() ORDER BY next_try_at LIMIT least(greatest(lim,1),100)) c
  JOIN commerce_orders o ON o.id=c.order_id
  JOIN workspaces w ON w.id=c.workspace_id
$function$
$r$;
    BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.briofold_ai_claims_due(lim integer) FROM PUBLIC'; EXCEPTION WHEN undefined_object THEN NULL; END;
    BEGIN EXECUTE 'GRANT ALL ON FUNCTION public.briofold_ai_claims_due(lim integer) TO ekmivo_financial_runtime'; EXCEPTION WHEN undefined_object THEN NULL; END;
    BEGIN EXECUTE 'GRANT ALL ON FUNCTION public.briofold_ai_claims_due(lim integer) TO ekmivo_financial_projection'; EXCEPTION WHEN undefined_object THEN NULL; END;
  END IF;
END
$m$;

-- briofold_ai_financial_receipt_lookup(uuid,text,text): production md5(prosrc)=2b3f9314315f4d760af496c594e059ed
DO $m$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.briofold_ai_financial_receipt_lookup(uuid,text,text)') AND md5(prosrc)='2b3f9314315f4d760af496c594e059ed') THEN
    EXECUTE $r$CREATE OR REPLACE FUNCTION public.briofold_ai_financial_receipt_lookup(w uuid, env text, ref_digest text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  dbname text;
  sql_q text;
  receipt jsonb;
BEGIN
  dbname := CASE WHEN env='live' THEN 'ekmivo_live_financial' ELSE 'ekmivo_sandbox_financial' END;
  sql_q := format(
    'SELECT jsonb_build_object(
       ''method'', o.method,
       ''amount_minor'', o.amount_minor,
       ''at'', o.original_transaction_at,
       ''direction'', o.direction,
       ''payer_hmac'', o.payer_hmac,
       ''receiving_account_id'', o.receiving_account_id,
       ''allocated'', EXISTS(SELECT 1 FROM financial_payments p WHERE p.workspace_id=%L::uuid AND p.environment=%L AND p.observation_id=o.id),
       ''checkout_status'', coalesce((SELECT r.status FROM pg07_receipt_results r WHERE r.observation_id=o.id), ''pending'')
     )
     FROM financial_receipt_observations o
     WHERE o.workspace_id=%L::uuid AND o.environment=%L AND o.provider_reference_hmac=%L
     ORDER BY o.original_transaction_at DESC LIMIT 1',
    w::text, env, w::text, env, ref_digest
  );
  SELECT x.res INTO receipt
  FROM dblink('dbname=' || dbname || ' user=briofold_admin', sql_q) AS x(res jsonb);
  RETURN receipt;
EXCEPTION WHEN others THEN
  RETURN NULL;
END $function$
$r$;
    BEGIN EXECUTE 'GRANT ALL ON FUNCTION public.briofold_ai_financial_receipt_lookup(w uuid, env text, ref_digest text) TO ekmivo_owner'; EXCEPTION WHEN undefined_object THEN NULL; END;
    BEGIN EXECUTE 'GRANT ALL ON FUNCTION public.briofold_ai_financial_receipt_lookup(w uuid, env text, ref_digest text) TO ekmivo_financial_runtime'; EXCEPTION WHEN undefined_object THEN NULL; END;
    BEGIN EXECUTE 'GRANT ALL ON FUNCTION public.briofold_ai_financial_receipt_lookup(w uuid, env text, ref_digest text) TO ekmivo_financial_projection'; EXCEPTION WHEN undefined_object THEN NULL; END;
  END IF;
END
$m$;

-- briofold_ai_order_tool(uuid,text,uuid,uuid,text,jsonb): production md5(prosrc)=18030fb0a65bcc9966556be9cd4fd977
DO $m$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.briofold_ai_order_tool(uuid,text,uuid,uuid,text,jsonb)') AND md5(prosrc)='18030fb0a65bcc9966556be9cd4fd977') THEN
    EXECUTE $r$CREATE OR REPLACE FUNCTION public.briofold_ai_order_tool(w uuid, e text, thread uuid, actor uuid, tool_name text, args jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
END $function$
$r$;
    BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.briofold_ai_order_tool(w uuid, e text, thread uuid, actor uuid, tool_name text, args jsonb) FROM PUBLIC'; EXCEPTION WHEN undefined_object THEN NULL; END;
  END IF;
END
$m$;

-- briofold_ai_studio_context(uuid,uuid,bigint,boolean,uuid,text): production md5(prosrc)=baa821fc365ddad35103d343cdd42941
DO $m$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.briofold_ai_studio_context(uuid,uuid,bigint,boolean,uuid,text)') AND md5(prosrc)='baa821fc365ddad35103d343cdd42941') THEN
    EXECUTE $r$CREATE OR REPLACE FUNCTION public.briofold_ai_studio_context(w uuid, a uuid, revision bigint, published boolean, pub uuid, q text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$DECLARE d briofold_ai_studio_drafts;cfg jsonb;docs jsonb;products jsonb;query tsquery;lexeme text;BEGIN
 PERFORM briofold_ai_studio_actor(w,a);
 IF q IS NULL OR length(trim(q)) NOT BETWEEN 1 AND 8000 OR published IS NULL THEN RAISE EXCEPTION 'Question required' USING ERRCODE='22023';END IF;
 SELECT * INTO d FROM briofold_ai_studio_drafts WHERE workspace_id=w;
 IF d.revision IS DISTINCT FROM revision OR (published AND (pub IS NULL OR d.published_id IS DISTINCT FROM pub)) THEN RAISE EXCEPTION 'Assistant changed; review again' USING ERRCODE='40001';END IF;
 IF published THEN SELECT config INTO cfg FROM briofold_ai_studio_versions WHERE workspace_id=w AND id=pub;ELSE cfg:=d.config;END IF;
 IF cfg IS NULL OR coalesce(cfg->>'model','')='' THEN RAISE EXCEPTION 'Configured metered model required' USING ERRCODE='22023';END IF;
 -- Natural customer sentences should retrieve relevant terms instead of requiring
 -- every greeting and filler word to appear in the source. Never interpolate raw tsquery.
 FOR lexeme IN SELECT unnest(tsvector_to_array(to_tsvector('simple',left(q,1000)))) LIMIT 32 LOOP
  IF query IS NULL THEN query:=plainto_tsquery('simple',lexeme);ELSE query:=query||plainto_tsquery('simple',lexeme);END IF;
 END LOOP;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.score DESC,x.id),'[]') INTO docs FROM (
  SELECT v.id,v.source_id,v.title,left(v.content,4000) AS content,coalesce(ts_rank_cd(v.search_vector,query),0) AS score
  FROM briofold_ai_knowledge_versions v JOIN briofold_ai_knowledge_sources s ON s.workspace_id=v.workspace_id AND s.id=v.source_id AND s.active
  WHERE v.workspace_id=w AND ((NOT published AND s.current_version=v.id) OR (published AND EXISTS(SELECT 1 FROM briofold_ai_studio_sources z WHERE z.workspace_id=w AND z.publication_id=pub AND z.source_version_id=v.id)))
  ORDER BY score DESC,v.id LIMIT 5)x;
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.id),'[]') INTO products FROM (SELECT id,name,price_minor,currency,sizes FROM inbox_products WHERE workspace_id=w AND environment='live' AND active AND to_tsvector('simple',name||' '||sizes)@@query ORDER BY id LIMIT 5)x;
 RETURN jsonb_build_object('config',cfg,'publication_id',CASE WHEN published THEN pub END,'revision',d.revision,'knowledge',docs,'products',products,'question',q);
END $function$
$r$;
    BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.briofold_ai_studio_context(w uuid, a uuid, revision bigint, published boolean, pub uuid, q text) FROM PUBLIC'; EXCEPTION WHEN undefined_object THEN NULL; END;
    BEGIN EXECUTE 'GRANT ALL ON FUNCTION public.briofold_ai_studio_context(w uuid, a uuid, revision bigint, published boolean, pub uuid, q text) TO ekmivo_financial_runtime'; EXCEPTION WHEN undefined_object THEN NULL; END;
    BEGIN EXECUTE 'GRANT ALL ON FUNCTION public.briofold_ai_studio_context(w uuid, a uuid, revision bigint, published boolean, pub uuid, q text) TO ekmivo_financial_projection'; EXCEPTION WHEN undefined_object THEN NULL; END;
  END IF;
END
$m$;

-- briofold_ai_studio_context(uuid,uuid,bigint,boolean,uuid,text,boolean): production md5(prosrc)=d0eb30a82f022df01cd56a9d9bbf33cc
DO $m$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.briofold_ai_studio_context(uuid,uuid,bigint,boolean,uuid,text,boolean)') AND md5(prosrc)='d0eb30a82f022df01cd56a9d9bbf33cc') THEN
    EXECUTE convert_from(decode('Q1JFQVRFIE9SIFJFUExBQ0UgRlVOQ1RJT04gcHVibGljLmJyaW9mb2xkX2FpX3N0dWRpb19jb250ZXh0KHcgdXVpZCwgYSB1dWlkLCByZXZpc2lvbiBiaWdpbnQsIHB1Ymxpc2hlZCBib29sZWFuLCBwdWIgdXVpZCwgcSB0ZXh0LCBpbmNsdWRlX2J1c2luZXNzIGJvb2xlYW4pCiBSRVRVUk5TIGpzb25iCiBMQU5HVUFHRSBwbHBnc3FsCiBTRUNVUklUWSBERUZJTkVSCiBTRVQgc2VhcmNoX3BhdGggVE8gJ3B1YmxpYycsICdwZ190ZW1wJwpBUyAkZnVuY3Rpb24kDQpERUNMQVJFIHN0dWRpbyBqc29uYjsNCkJFR0lODQogIHN0dWRpbyA6PSBicmlvZm9sZF9haV9zdHVkaW9fY29udGV4dCh3LGEscmV2aXNpb24scHVibGlzaGVkLHB1YixxKTsNCiAgSUYgc3R1ZGlvIElTIE5VTEwgT1IgTk9UIGluY2x1ZGVfYnVzaW5lc3MgVEhFTiBSRVRVUk4gc3R1ZGlvOyBFTkQgSUY7DQogIFJFVFVSTiBzdHVkaW8gfHwganNvbmJfYnVpbGRfb2JqZWN0KA0KICAgICdidXNpbmVzcycsYnJpb2ZvbGRfYWlfYnVzaW5lc3NfZmFjdHModyksDQogICAgJ3Byb2R1Y3RzJyxjb2FsZXNjZSgoDQogICAgICBTRUxFQ1QganNvbmJfYWdnKGJyaW9mb2xkX2FpX3B1YmxpY19wcm9kdWN0KGhpdCkpDQogICAgICBGUk9NIGpzb25iX2FycmF5X2VsZW1lbnRzKGNvbW1lcmNlX3Byb2R1Y3Rfc2VhcmNoKHcsJ2xpdmUnLGxlZnQocSwyMDApLCd7fScsNSkpIEFTIGhpdA0KICAgICksJ1tdJzo6anNvbmIpDQogICk7DQpFTkQNCiRmdW5jdGlvbiQK','base64'),'UTF8');
    BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.briofold_ai_studio_context(w uuid, a uuid, revision bigint, published boolean, pub uuid, q text, include_business boolean) FROM PUBLIC'; EXCEPTION WHEN undefined_object THEN NULL; END;
    BEGIN EXECUTE 'GRANT ALL ON FUNCTION public.briofold_ai_studio_context(w uuid, a uuid, revision bigint, published boolean, pub uuid, q text, include_business boolean) TO ekmivo_financial_runtime'; EXCEPTION WHEN undefined_object THEN NULL; END;
  END IF;
END
$m$;

-- briofold_ai_tariff_publish(uuid,uuid,text,uuid,jsonb,text): production md5(prosrc)=f6c933ded1882b745d36e09be1a9255a
DO $m$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.briofold_ai_tariff_publish(uuid,uuid,text,uuid,jsonb,text)') AND md5(prosrc)='f6c933ded1882b745d36e09be1a9255a') THEN
    EXECUTE $r$CREATE OR REPLACE FUNCTION public.briofold_ai_tariff_publish(a uuid, k uuid, m text, expected uuid, b jsonb, why text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE old briofold_ai_tariff_versions%ROWTYPE;current_id uuid;next_revision integer;v uuid;n text;
BEGIN
 PERFORM briofold_ai_require_super_admin(a);
 IF k IS NULL OR m IS NULL OR m!~'^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$' OR why IS NULL OR length(trim(why)) NOT BETWEEN 10 AND 500
  OR jsonb_typeof(b) IS DISTINCT FROM 'object' OR (SELECT count(*) FROM jsonb_object_keys(b))<>9
  OR b->>'provider' IS DISTINCT FROM 'openrouter' OR b->>'currency' IS DISTINCT FROM 'BDT' OR b->>'rounding' IS DISTINCT FROM 'ceil_minor'
 THEN RAISE EXCEPTION 'invalid AI tariff' USING ERRCODE='22023';END IF;
 FOREACH n IN ARRAY ARRAY['input_minor_per_million','cached_input_minor_per_million','output_minor_per_million','max_input_tokens','max_output_tokens','max_request_minor'] LOOP
  IF jsonb_typeof(b->n) IS DISTINCT FROM 'number' OR (b->>n)::numeric<>trunc((b->>n)::numeric)
   OR (b->>n)::numeric<0 OR (b->>n)::numeric>100000000
  THEN RAISE EXCEPTION 'invalid tariff number' USING ERRCODE='22023';END IF;
 END LOOP;
 IF (b->>'cached_input_minor_per_million')::numeric>(b->>'input_minor_per_million')::numeric
  OR (b->>'input_minor_per_million')::numeric+(b->>'output_minor_per_million')::numeric=0
  OR (b->>'max_input_tokens')::numeric=0 OR (b->>'max_output_tokens')::numeric=0 OR (b->>'max_request_minor')::numeric=0
  OR ceil(((b->>'max_input_tokens')::numeric*(b->>'input_minor_per_million')::numeric+
   (b->>'max_output_tokens')::numeric*(b->>'output_minor_per_million')::numeric)/1000000)>(b->>'max_request_minor')::numeric
 THEN RAISE EXCEPTION 'invalid tariff reservation bound' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('briofold:tariff:'||m,0));
 SELECT * INTO old FROM briofold_ai_tariff_versions WHERE operation_key=k;
 IF FOUND THEN
  IF old.model<>m OR old.terms<>b OR old.created_by<>a OR old.reason<>why
  THEN RAISE EXCEPTION 'tariff key conflict' USING ERRCODE='23505';END IF;
  RETURN old.id;
 END IF;
 SELECT current_version INTO current_id FROM briofold_ai_tariff_catalog WHERE model=m;
 IF current_id IS DISTINCT FROM expected THEN RAISE EXCEPTION 'tariff changed; refresh' USING ERRCODE='40001';END IF;
 SELECT coalesce(max(revision),0)+1 INTO next_revision FROM briofold_ai_tariff_versions WHERE model=m;
 INSERT INTO briofold_ai_tariff_versions(model,revision,terms,created_by,reason,operation_key)
  VALUES(m,next_revision,b,a,why,k) RETURNING id INTO v;
 INSERT INTO briofold_ai_tariff_catalog(model,current_version) VALUES(m,v)
  ON CONFLICT(model) DO UPDATE SET current_version=EXCLUDED.current_version;
 INSERT INTO platform_admin_audit(actor_id,action,description)
  VALUES(a,'ai_tariff.published','version='||v::text||'; '||m||' v'||next_revision::text||' | '||why);
 RETURN v;
END $function$
$r$;
    BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.briofold_ai_tariff_publish(a uuid, k uuid, m text, expected uuid, b jsonb, why text) FROM PUBLIC'; EXCEPTION WHEN undefined_object THEN NULL; END;
    BEGIN EXECUTE 'GRANT ALL ON FUNCTION public.briofold_ai_tariff_publish(a uuid, k uuid, m text, expected uuid, b jsonb, why text) TO ekmivo_web_app'; EXCEPTION WHEN undefined_object THEN NULL; END;
  END IF;
END
$m$;

-- briofold_ai_tool(uuid,uuid,integer,text,jsonb,jsonb): production md5(prosrc)=c575c675421f71ab5cadf7baf873e097
DO $m$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.briofold_ai_tool(uuid,uuid,integer,text,jsonb,jsonb)') AND md5(prosrc)='c575c675421f71ab5cadf7baf873e097') THEN
    EXECUTE $r$CREATE OR REPLACE FUNCTION public.briofold_ai_tool(job uuid, lease uuid, step_no integer, tool_name text, args jsonb, args_redacted jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
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
END $function$
$r$;
    BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.briofold_ai_tool(job uuid, lease uuid, step_no integer, tool_name text, args jsonb, args_redacted jsonb) FROM PUBLIC'; EXCEPTION WHEN undefined_object THEN NULL; END;
    BEGIN EXECUTE 'GRANT ALL ON FUNCTION public.briofold_ai_tool(job uuid, lease uuid, step_no integer, tool_name text, args jsonb, args_redacted jsonb) TO ekmivo_financial_runtime'; EXCEPTION WHEN undefined_object THEN NULL; END;
    BEGIN EXECUTE 'GRANT ALL ON FUNCTION public.briofold_ai_tool(job uuid, lease uuid, step_no integer, tool_name text, args jsonb, args_redacted jsonb) TO ekmivo_financial_projection'; EXCEPTION WHEN undefined_object THEN NULL; END;
  END IF;
END
$m$;

-- briofold_customers_read(uuid,text,uuid,uuid,integer,text,text): production md5(prosrc)=a75bc857fa45da7216f41e48df171b70
DO $m$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.briofold_customers_read(uuid,text,uuid,uuid,integer,text,text)') AND md5(prosrc)='a75bc857fa45da7216f41e48df171b70') THEN
    EXECUTE $r$CREATE OR REPLACE FUNCTION public.briofold_customers_read(w uuid, e text, a uuid, cid uuid, off integer, q text, filter text)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE role_name text;pii boolean;staff boolean;items jsonb;item jsonb;
BEGIN
 role_name:=briofold_customer_actor(w,a,'read');
 pii:=role_name IN ('owner','admin');
 staff:=role_name IN ('owner','admin','editor');
 IF e NOT IN ('live','sandbox') OR e IS NULL OR off IS NULL OR off<0 OR off>10000
    OR q IS NULL OR length(q)>100
    OR filter NOT IN ('','new','contacted','qualified','proposal','won','lost','due') THEN
  RAISE EXCEPTION 'Invalid CRM filter' USING ERRCODE='22023';
 END IF;
 IF cid IS NULL THEN
  SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) INTO items FROM (
   SELECT c.id,c.name,c.stage,c.temperature,c.tags,
    CASE WHEN staff THEN c.assignee ELSE NULL END AS assignee,
    c.assignee IS NOT NULL AS assigned,c.revision,c.updated_at,
    CASE WHEN pii THEN c.email ELSE '' END AS email,
    CASE WHEN pii THEN c.phone ELSE '' END AS phone,
    EXISTS(SELECT 1 FROM briofold_customer_followups f
     WHERE f.customer_id=c.id AND f.status='scheduled' AND f.due_at<=now()) AS due
   FROM briofold_customers c
   WHERE briofold_channel_customer(w,e,a,c.id) AND c.workspace_id=w AND c.environment=e AND c.deleted_at IS NULL AND c.merged_into IS NULL
    AND (q='' OR c.name ILIKE '%'||q||'%' OR (pii AND
      (c.email ILIKE '%'||q||'%' OR c.phone ILIKE '%'||q||'%')) OR
      EXISTS(SELECT 1 FROM unnest(c.tags) tag WHERE tag ILIKE '%'||q||'%'))
    AND (filter='' OR c.stage=filter OR (filter='due' AND
      EXISTS(SELECT 1 FROM briofold_customer_followups f WHERE f.customer_id=c.id
      AND f.status='scheduled' AND f.due_at<=now())))
   ORDER BY c.updated_at DESC,c.id LIMIT 51 OFFSET off
  ) x;
  RETURN jsonb_build_object('items',items,'can_manage',staff,'can_contact',pii,
   'can_export',pii,
   'members',CASE WHEN staff THEN coalesce((SELECT jsonb_agg(jsonb_build_object('id',u.id,'name',u.display_name))
      FROM workspace_members m JOIN app_users u ON u.id=m.user_id
      WHERE m.workspace_id=w AND u.disabled_at IS NULL),'[]'::jsonb)
     ELSE '[]'::jsonb END);
 END IF;
 SELECT to_jsonb(c)-'workspace_id'-'email'-'phone'-'notes'-'reason'-'assignee'
   ||jsonb_build_object('assignee',CASE WHEN staff THEN c.assignee ELSE NULL END,
     'assigned',c.assignee IS NOT NULL)
  INTO item FROM briofold_customers c WHERE briofold_channel_customer(w,e,a,c.id) AND c.workspace_id=w AND c.environment=e AND c.id=cid;
 IF item IS NULL THEN RAISE EXCEPTION 'Customer unavailable' USING ERRCODE='42501';END IF;
 IF pii THEN
  SELECT item||jsonb_build_object('email',c.email,'phone',c.phone,'notes',c.notes,'reason',c.reason)
    INTO item FROM briofold_customers c WHERE c.id=cid;
 END IF;
 RETURN jsonb_build_object('customer',item,'can_manage',staff,'can_contact',pii,'can_export',pii,
  'archives',CASE WHEN pii THEN coalesce((WITH RECURSIVE ids(id) AS (
    SELECT cid UNION SELECT x.id FROM briofold_customers x JOIN ids ON x.merged_into=ids.id)
    SELECT jsonb_agg(to_jsonb(z)) FROM (SELECT x.id,x.name,x.email,x.phone,x.notes,x.tags
    FROM briofold_customers x WHERE briofold_channel_customer(w,e,a,x.id) AND x.id IN(SELECT id FROM ids) AND x.id<>cid
    ORDER BY x.created_at,x.id LIMIT 51 OFFSET off) z),'[]'::jsonb) ELSE '[]'::jsonb END,
  'sources',coalesce((SELECT jsonb_agg(to_jsonb(s)-'workspace_id'-'environment')
    FROM briofold_customer_sources s WHERE s.customer_id=cid),'[]'::jsonb),
  'proofs',CASE WHEN pii THEN coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,
    'kind',p.kind,'value',p.value,'verified_at',p.verified_at,'revoked_at',p.revoked_at))
    FROM briofold_customer_proofs p WHERE p.customer_id=cid),'[]'::jsonb)
    ELSE '[]'::jsonb END,
  'followups',coalesce((SELECT jsonb_agg(jsonb_build_object('id',f.id,'due_at',f.due_at,
    'time_zone',f.time_zone,'status',f.status,'kind',f.kind,'requested_due_at',f.requested_due_at,'quiet_start',left(f.quiet_start::text,5),'quiet_end',left(f.quiet_end::text,5),'body',CASE WHEN pii THEN f.body ELSE '' END)
    ORDER BY f.due_at) FROM briofold_customer_followups f WHERE f.customer_id=cid),'[]'::jsonb),
  'events',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.sequence DESC)
    FROM (SELECT sequence,action,created_at FROM briofold_customer_events
     WHERE customer_id=cid ORDER BY sequence DESC LIMIT 51 OFFSET off) x),'[]'::jsonb));
END $function$
$r$;
    BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.briofold_customers_read(w uuid, e text, a uuid, cid uuid, off integer, q text, filter text) FROM PUBLIC'; EXCEPTION WHEN undefined_object THEN NULL; END;
    BEGIN EXECUTE 'GRANT ALL ON FUNCTION public.briofold_customers_read(w uuid, e text, a uuid, cid uuid, off integer, q text, filter text) TO ekmivo_financial_runtime'; EXCEPTION WHEN undefined_object THEN NULL; END;
    BEGIN EXECUTE 'GRANT ALL ON FUNCTION public.briofold_customers_read(w uuid, e text, a uuid, cid uuid, off integer, q text, filter text) TO ekmivo_financial_projection'; EXCEPTION WHEN undefined_object THEN NULL; END;
    BEGIN EXECUTE 'GRANT ALL ON FUNCTION public.briofold_customers_read(w uuid, e text, a uuid, cid uuid, off integer, q text, filter text) TO ekmivo_web_app'; EXCEPTION WHEN undefined_object THEN NULL; END;
  END IF;
END
$m$;

-- inbox_advanced_before_channel_scopes(uuid,text,uuid,uuid,text,jsonb): production md5(prosrc)=168f7d8610cb6fd20432a5cd928cb0b4
DO $m$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.inbox_advanced_before_channel_scopes(uuid,text,uuid,uuid,text,jsonb)') AND md5(prosrc)='168f7d8610cb6fd20432a5cd928cb0b4') THEN
    EXECUTE $r$CREATE OR REPLACE FUNCTION public.inbox_advanced_before_channel_scopes(w uuid, e text, d uuid, t uuid, a text, b jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE v inbox_threads;m inbox_messages;src inbox_messages;f inbox_media;p text;ct jsonb;kind text;key uuid;quoted uuid;prod inbox_products;BEGIN
 v:=inbox_scope(w,e,t);SELECT provider INTO p FROM inbox_connections WHERE id=v.connection_id;
 -- Serialize sends, note revisions and handovers in this conversation.
 PERFORM 1 FROM inbox_threads WHERE id=t FOR UPDATE;
 IF a='profile' THEN RETURN inbox_profile(w,e,t);
 ELSIF a='note' THEN
  IF length(b->>'text')>8000 THEN RAISE EXCEPTION 'note too long' USING ERRCODE='22023';END IF;
  UPDATE inbox_threads SET note=coalesce(b->>'text',''),note_version=note_version+1 WHERE id=t AND note_version=(b->>'version')::bigint RETURNING * INTO v;
  IF v.id IS NULL THEN RAISE EXCEPTION 'note changed' USING ERRCODE='23505';END IF;RETURN jsonb_build_object('saved',true,'version',v.note_version);
 ELSIF a='contact' THEN
  IF jsonb_typeof(b->'contact')<>'object' OR pg_column_size(b->'contact')>8192 THEN RAISE EXCEPTION 'invalid contact' USING ERRCODE='22023';END IF;
  UPDATE inbox_threads SET contact=b->'contact' WHERE id=t;RETURN jsonb_build_object('saved',true);
 ELSIF a='orders-save' THEN
  INSERT INTO inbox_orders(id,workspace_id,thread_id,reference,items,amount_minor,currency,status,reason) VALUES((b->>'id')::uuid,w,t,b->>'reference',b->>'items',(b->>'amount_minor')::bigint,coalesce(b->>'currency','BDT'),b->>'status',coalesce(b->>'reason',''))
  ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,reason=EXCLUDED.reason,items=EXCLUDED.items,amount_minor=EXCLUDED.amount_minor,updated_at=now() WHERE inbox_orders.workspace_id=w AND inbox_orders.thread_id=t;
  IF NOT FOUND THEN RAISE EXCEPTION 'order unavailable' USING ERRCODE='42501';END IF;RETURN jsonb_build_object('saved',true);
 ELSIF a='products' THEN RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(x)-'workspace_id') FROM inbox_products x WHERE workspace_id=w AND environment=e AND active),'[]'::jsonb));
 ELSIF a='product-save' THEN
  IF b->>'image_media_id' IS NOT NULL AND NOT EXISTS(SELECT 1 FROM inbox_media f JOIN inbox_threads x ON x.id=f.thread_id JOIN inbox_connections c ON c.id=x.connection_id WHERE f.id=(b->>'image_media_id')::uuid AND f.workspace_id=w AND c.environment=e) THEN RAISE EXCEPTION 'product image unavailable' USING ERRCODE='42501';END IF;
  INSERT INTO inbox_products(id,workspace_id,environment,name,price_minor,sizes,image_media_id,active) VALUES((b->>'id')::uuid,w,e,b->>'name',(b->>'price_minor')::bigint,coalesce(b->>'sizes',''),(b->>'image_media_id')::uuid,coalesce((b->>'active')::boolean,true))
  ON CONFLICT(id) DO UPDATE SET name=EXCLUDED.name,price_minor=EXCLUDED.price_minor,sizes=EXCLUDED.sizes,image_media_id=EXCLUDED.image_media_id,active=EXCLUDED.active WHERE inbox_products.workspace_id=w AND inbox_products.environment=e;
  IF NOT FOUND THEN RAISE EXCEPTION 'product unavailable' USING ERRCODE='42501';END IF;RETURN jsonb_build_object('saved',true);
 ELSIF a='info' THEN
  SELECT * INTO m FROM inbox_messages WHERE id=(b->>'message_id')::uuid AND workspace_id=w AND thread_id=t;
  IF m.id IS NULL THEN RAISE EXCEPTION 'message unavailable' USING ERRCODE='42501';END IF;RETURN (to_jsonb(m)-'workspace_id')||jsonb_build_object('channel',p);
 END IF;
 IF a NOT IN ('send-media','send-product','forward','react') THEN RAISE EXCEPTION 'invalid action' USING ERRCODE='22023';END IF;
 key:=(b->>'idempotency_key')::uuid;
 IF key IS NULL THEN RAISE EXCEPTION 'missing key' USING ERRCODE='22023';END IF;
 SELECT * INTO m FROM inbox_messages WHERE thread_id=t AND idempotency_key=key;
 IF m.id IS NOT NULL THEN
  IF m.content->>'request_hash' IS DISTINCT FROM md5(b::text) THEN RAISE EXCEPTION 'idempotency conflict' USING ERRCODE='23505';END IF;RETURN (to_jsonb(m)-'workspace_id')||jsonb_build_object('channel',p);
 END IF;
 IF v.last_customer_at IS NULL OR (v.last_customer_at<=now()-interval '24 hours' AND NOT inbox_window_free(v.connection_id)) THEN RAISE EXCEPTION 'WINDOW_CLOSED' USING ERRCODE='22023';END IF;
 IF a='forward' THEN
  SELECT x.* INTO src FROM inbox_messages x JOIN inbox_threads st ON st.id=x.thread_id JOIN inbox_connections sc ON sc.id=st.connection_id AND sc.environment=e AND sc.enabled WHERE x.id=(b->>'message_id')::uuid AND x.workspace_id=w AND x.thread_id<>t AND x.sender IN ('seller','ai','customer') AND x.type IN ('text','image','audio','document','product');
  IF src.id IS NULL THEN RAISE EXCEPTION 'forward unavailable' USING ERRCODE='42501';END IF;kind:=src.type;ct:=src.content;ct:=ct-'request_hash';
 ELSIF a='send-media' THEN
  SELECT * INTO f FROM inbox_media WHERE id=(b->>'media_id')::uuid AND workspace_id=w AND thread_id=t;
  IF f.id IS NULL THEN RAISE EXCEPTION 'media unavailable' USING ERRCODE='42501';END IF;
  kind:=CASE WHEN f.mime LIKE 'image/%' THEN 'image' WHEN f.mime LIKE 'audio/%' THEN 'audio' ELSE 'document' END;
  IF kind='audio' AND f.duration_ms BETWEEN 1 AND 999 THEN RAISE EXCEPTION 'voice too short' USING ERRCODE='22023';END IF;
  ct:=jsonb_build_object('media_id',f.id,'name',f.name,'mime',f.mime,'size_bytes',f.size_bytes,'duration_ms',f.duration_ms);
 ELSIF a='send-product' THEN
  SELECT * INTO prod FROM inbox_products WHERE id=(b->>'product_id')::uuid AND workspace_id=w AND environment=e AND active;
  IF prod.id IS NULL THEN RAISE EXCEPTION 'product unavailable' USING ERRCODE='42501';END IF;
  kind:='product';ct:=to_jsonb(prod)-'workspace_id';
 ELSE
  SELECT * INTO src FROM inbox_messages WHERE id=(b->>'message_id')::uuid AND workspace_id=w AND thread_id=t AND sender='customer';
  IF src.id IS NULL OR src.provider_id IS NULL OR NOT (inbox_capabilities(p)->'reactions' @> to_jsonb(ARRAY[b->>'emoji'])) AND coalesce(b->>'emoji','')<>'' THEN RAISE EXCEPTION 'reaction unavailable' USING ERRCODE='22023';END IF;
  kind:='reaction';ct:=jsonb_build_object('target_id',src.id,'provider_id',src.provider_id,'emoji',coalesce(b->>'emoji',''));
 END IF;
 IF kind='document' AND p='ig' THEN RAISE EXCEPTION 'unsupported document' USING ERRCODE='22023';END IF;
 IF (b->>'batch_id') IS NOT NULL AND (SELECT count(*) FROM inbox_messages WHERE workspace_id=w AND thread_id=t AND batch_id=(b->>'batch_id')::uuid)>=10 THEN RAISE EXCEPTION 'max 10 images' USING ERRCODE='22023';END IF;
 quoted:=(b->>'reply_to')::uuid;
 IF quoted IS NOT NULL AND NOT EXISTS(SELECT 1 FROM inbox_messages WHERE id=quoted AND workspace_id=w AND thread_id=t) THEN RAISE EXCEPTION 'invalid reply' USING ERRCODE='42501';END IF;
 ct:=ct||jsonb_build_object('request_hash',md5(b::text));
 INSERT INTO inbox_messages(workspace_id,thread_id,sender,type,body,state,idempotency_key,content,batch_id,reply_to) VALUES(w,t,'seller',kind,CASE WHEN a='forward' THEN src.body WHEN kind='product' THEN prod.name ELSE '' END,'queued',key,ct,(b->>'batch_id')::uuid,quoted) RETURNING * INTO m;
 IF kind<>'reaction' THEN UPDATE inbox_threads SET ai_enabled=false,ai_version=ai_version+1,last_activity_at=now() WHERE id=t;END IF;
 RETURN to_jsonb(m)-'workspace_id';END $function$
$r$;
    BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.inbox_advanced_before_channel_scopes(w uuid, e text, d uuid, t uuid, a text, b jsonb) FROM PUBLIC'; EXCEPTION WHEN undefined_object THEN NULL; END;
  END IF;
END
$m$;

-- inbox_connection_list(uuid,text): production md5(prosrc)=aea474974d566d37999f2d1fc3e874a6
DO $m$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.inbox_connection_list(uuid,text)') AND md5(prosrc)='aea474974d566d37999f2d1fc3e874a6') THEN
    EXECUTE $r$CREATE OR REPLACE FUNCTION public.inbox_connection_list(w uuid, e text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT jsonb_build_object('items', COALESCE(jsonb_agg(
    jsonb_build_object('id',id,'provider',provider,'enabled',enabled,'external_id',external_id,'display_name',display_name)
    ORDER BY created_at), '[]'::jsonb))
  FROM inbox_connections WHERE workspace_id=w AND environment=e
$function$
$r$;
    BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.inbox_connection_list(w uuid, e text) FROM PUBLIC'; EXCEPTION WHEN undefined_object THEN NULL; END;
    BEGIN EXECUTE 'GRANT ALL ON FUNCTION public.inbox_connection_list(w uuid, e text) TO ekmivo_financial_runtime'; EXCEPTION WHEN undefined_object THEN NULL; END;
    BEGIN EXECUTE 'GRANT ALL ON FUNCTION public.inbox_connection_list(w uuid, e text) TO ekmivo_financial_projection'; EXCEPTION WHEN undefined_object THEN NULL; END;
  END IF;
END
$m$;

-- inbox_connection_named(uuid,text,text,text,bytea,text): production md5(prosrc)=7ee6ec3bb5050808c551d5644952bd3e
DO $m$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.inbox_connection_named(uuid,text,text,text,bytea,text)') AND md5(prosrc)='7ee6ec3bb5050808c551d5644952bd3e') THEN
    EXECUTE $r$CREATE OR REPLACE FUNCTION public.inbox_connection_named(w uuid, e text, p text, x text, k bytea, n text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE connection_id uuid;
BEGIN
  connection_id := inbox_connection(w,e,p,x,k);
  UPDATE inbox_connections
  SET display_name = COALESCE(NULLIF(left(btrim(n), 255), ''), display_name)
  WHERE id = connection_id AND workspace_id = w AND environment = e;
  RETURN connection_id;
END
$function$
$r$;
    BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.inbox_connection_named(w uuid, e text, p text, x text, k bytea, n text) FROM PUBLIC'; EXCEPTION WHEN undefined_object THEN NULL; END;
    BEGIN EXECUTE 'GRANT ALL ON FUNCTION public.inbox_connection_named(w uuid, e text, p text, x text, k bytea, n text) TO ekmivo_financial_runtime'; EXCEPTION WHEN undefined_object THEN NULL; END;
    BEGIN EXECUTE 'GRANT ALL ON FUNCTION public.inbox_connection_named(w uuid, e text, p text, x text, k bytea, n text) TO ekmivo_financial_projection'; EXCEPTION WHEN undefined_object THEN NULL; END;
  END IF;
END
$m$;

-- inbox_forward_album_before_channel_scopes(uuid,text,uuid,uuid,uuid,uuid): production md5(prosrc)=0841a4118cb7d8b4c30641f5d0b5bde7
DO $m$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.inbox_forward_album_before_channel_scopes(uuid,text,uuid,uuid,uuid,uuid)') AND md5(prosrc)='0841a4118cb7d8b4c30641f5d0b5bde7') THEN
    EXECUTE $r$CREATE OR REPLACE FUNCTION public.inbox_forward_album_before_channel_scopes(w uuid, e text, d uuid, t uuid, source uuid, k uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE src inbox_messages;x inbox_messages;r jsonb;items jsonb:='[]';BEGIN
 PERFORM inbox_scope(w,e,t);
 SELECT m.* INTO src FROM inbox_messages m JOIN inbox_threads a ON a.id=m.thread_id JOIN inbox_connections c ON c.id=a.connection_id AND c.enabled AND c.environment=e WHERE m.id=source AND m.workspace_id=w AND m.sender IN ('seller','ai','customer') AND m.thread_id<>t;
 IF src.id IS NULL THEN RAISE EXCEPTION 'forward unavailable' USING ERRCODE='42501';END IF;
 IF src.type<>'image' OR src.batch_id IS NULL THEN RETURN inbox_advanced(w,e,d,t,'forward',jsonb_build_object('message_id',source,'idempotency_key',k));END IF;
 IF EXISTS(SELECT 1 FROM inbox_messages dest WHERE dest.thread_id=t AND dest.batch_id=k AND NOT EXISTS(SELECT 1 FROM inbox_messages original WHERE original.thread_id=src.thread_id AND original.batch_id=src.batch_id AND md5(k::text||original.id::text)::uuid=dest.idempotency_key)) THEN RAISE EXCEPTION 'album idempotency conflict' USING ERRCODE='23505';END IF;
 FOR x IN SELECT * FROM inbox_messages WHERE thread_id=src.thread_id AND batch_id=src.batch_id AND sender=src.sender AND type='image' ORDER BY sequence LOOP
  r:=inbox_advanced(w,e,d,t,'forward',jsonb_build_object('message_id',x.id,'idempotency_key',md5(k::text||x.id::text)::uuid,'batch_id',k));items:=items||jsonb_build_array(r);
 END LOOP;RETURN jsonb_build_object('items',items);
END $function$
$r$;
    BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.inbox_forward_album_before_channel_scopes(w uuid, e text, d uuid, t uuid, source uuid, k uuid) FROM PUBLIC'; EXCEPTION WHEN undefined_object THEN NULL; END;
  END IF;
END
$m$;

-- inbox_ingest(uuid,text,text,text,text,text,timestamp with time zone): production md5(prosrc)=023a730bd7a6d4a41a7e477d97763ab4
DO $m$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.inbox_ingest(uuid,text,text,text,text,text,timestamp with time zone)') AND md5(prosrc)='023a730bd7a6d4a41a7e477d97763ab4') THEN
    EXECUTE convert_from(decode('Q1JFQVRFIE9SIFJFUExBQ0UgRlVOQ1RJT04gcHVibGljLmluYm94X2luZ2VzdChjIHV1aWQsIHAgdGV4dCwgcyB0ZXh0LCBuIHRleHQsIGIgdGV4dCwgayB0ZXh0LCBhdF90aW1lIHRpbWVzdGFtcCB3aXRoIHRpbWUgem9uZSkKIFJFVFVSTlMgYm9vbGVhbgogTEFOR1VBR0UgcGxwZ3NxbAogU0VDVVJJVFkgREVGSU5FUgogU0VUIHNlYXJjaF9wYXRoIFRPICdwdWJsaWMnLCAncGdfdGVtcCcKQVMgJGZ1bmN0aW9uJA0KREVDTEFSRSBjb25uIGluYm94X2Nvbm5lY3Rpb25zOyB0IHV1aWQ7IGluc2VydGVkIGludGVnZXI7DQpCRUdJTg0KIFNFTEVDVCAqIElOVE8gY29ubiBGUk9NIGluYm94X2Nvbm5lY3Rpb25zIFdIRVJFIGlkPWMgQU5EIGVuYWJsZWQ7DQogSUYgY29ubi5pZCBJUyBOVUxMIFRIRU4gUkVUVVJOIGZhbHNlOyBFTkQgSUY7DQogSU5TRVJUIElOVE8gaW5ib3hfdGhyZWFkcyh3b3Jrc3BhY2VfaWQsY29ubmVjdGlvbl9pZCxleHRlcm5hbF9pZCxjdXN0b21lcl9uYW1lLGxhc3RfY3VzdG9tZXJfYXQsbGFzdF9hY3Rpdml0eV9hdCkgVkFMVUVTKGNvbm4ud29ya3NwYWNlX2lkLGMscyxjb2FsZXNjZShudWxsaWYobGVmdChuLDI1NSksJycpLHMpLGF0X3RpbWUsYXRfdGltZSkgT04gQ09ORkxJQ1QoY29ubmVjdGlvbl9pZCxleHRlcm5hbF9pZCkgRE8gVVBEQVRFIFNFVCBjdXN0b21lcl9uYW1lPUNBU0UgV0hFTiBpbmJveF90aHJlYWRzLmN1c3RvbWVyX25hbWU9aW5ib3hfdGhyZWFkcy5leHRlcm5hbF9pZCBBTkQgbnVsbGlmKG4sJycpIElTIE5PVCBOVUxMIFRIRU4gbGVmdChuLDI1NSkgRUxTRSBpbmJveF90aHJlYWRzLmN1c3RvbWVyX25hbWUgRU5ELCBsYXN0X2N1c3RvbWVyX2F0PWdyZWF0ZXN0KGluYm94X3RocmVhZHMubGFzdF9jdXN0b21lcl9hdCxFWENMVURFRC5sYXN0X2N1c3RvbWVyX2F0KSxsYXN0X2FjdGl2aXR5X2F0PWdyZWF0ZXN0KGluYm94X3RocmVhZHMubGFzdF9hY3Rpdml0eV9hdCxFWENMVURFRC5sYXN0X2FjdGl2aXR5X2F0KSBSRVRVUk5JTkcgaWQgSU5UTyB0Ow0KIElOU0VSVCBJTlRPIGluYm94X21lc3NhZ2VzKHdvcmtzcGFjZV9pZCx0aHJlYWRfaWQsc2VuZGVyLHR5cGUsYm9keSxwcm92aWRlcl9pZCxzdGF0ZSxjcmVhdGVkX2F0KSBWQUxVRVMoY29ubi53b3Jrc3BhY2VfaWQsdCwnY3VzdG9tZXInLGssYixwLCdyZWNlaXZlZCcsYXRfdGltZSkgT04gQ09ORkxJQ1QodGhyZWFkX2lkLHByb3ZpZGVyX2lkKSBETyBOT1RISU5HOw0KIEdFVCBESUFHTk9TVElDUyBpbnNlcnRlZD1ST1dfQ09VTlQ7UkVUVVJOIGluc2VydGVkPjA7DQpFTkQgJGZ1bmN0aW9uJAo=','base64'),'UTF8');
    BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.inbox_ingest(c uuid, p text, s text, n text, b text, k text, at_time timestamp with time zone) FROM PUBLIC'; EXCEPTION WHEN undefined_object THEN NULL; END;
    BEGIN EXECUTE 'GRANT ALL ON FUNCTION public.inbox_ingest(c uuid, p text, s text, n text, b text, k text, at_time timestamp with time zone) TO ekmivo_financial_runtime'; EXCEPTION WHEN undefined_object THEN NULL; END;
    BEGIN EXECUTE 'GRANT ALL ON FUNCTION public.inbox_ingest(c uuid, p text, s text, n text, b text, k text, at_time timestamp with time zone) TO ekmivo_financial_projection'; EXCEPTION WHEN undefined_object THEN NULL; END;
  END IF;
END
$m$;

-- inbox_next_send_v1(): production md5(prosrc)=0b8f8c7a8f9a7c42d4083a6578d495cf
DO $m$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.inbox_next_send_v1()') AND md5(prosrc)='0b8f8c7a8f9a7c42d4083a6578d495cf') THEN
    EXECUTE $r$CREATE OR REPLACE FUNCTION public.inbox_next_send_v1()
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$DECLARE m inbox_messages;result jsonb;BEGIN
 PERFORM briofold_inbox_due_returns();
 UPDATE inbox_messages x SET state='failed',error_code='CHANNEL_ACCESS_REVOKED' WHERE x.state='queued' AND x.sender='seller' AND NOT briofold_channel_send_valid(x.id);
 UPDATE inbox_messages x SET state='failed',error_code='AI_CONTEXT_CHANGED' WHERE x.sender='ai' AND x.state='queued' AND NOT EXISTS(SELECT 1 FROM briofold_ai_channel_jobs j WHERE j.message_id=x.id AND j.state='completed' AND briofold_ai_channel_valid(j.id));
 UPDATE inbox_messages x SET state='failed',error_code='BROADCAST_APPROVAL_INVALID' WHERE x.state='queued' AND EXISTS(SELECT 1 FROM briofold_broadcast_recipients r WHERE r.id=x.batch_id) AND NOT briofold_broadcast_valid(x.batch_id);
 UPDATE inbox_messages SET state='uncertain',error_code='WORKER_OUTCOME_UNKNOWN' WHERE state='sending' AND attempt_at<now()-interval '1 minute';
 UPDATE inbox_messages x SET state='failed',error_code='HUMAN_TAKEOVER' FROM inbox_threads t WHERE x.thread_id=t.id AND x.state='queued' AND x.sender='ai' AND (NOT t.ai_enabled OR EXISTS(SELECT 1 FROM briofold_inbox_work z WHERE z.thread_id=t.id AND (z.disputed OR z.status='resolved')) OR EXISTS(SELECT 1 FROM briofold_inbox_tickets q WHERE q.thread_id=t.id AND q.category IN ('complaint','refund','return') AND q.status<>'resolved'));
 UPDATE inbox_messages x SET state='failed',error_code='WINDOW_CLOSED' FROM inbox_threads t WHERE x.thread_id=t.id AND x.state='queued' AND (t.last_customer_at<=now()-interval '24 hours' AND NOT inbox_window_free(t.connection_id));
 SELECT x.* INTO m FROM inbox_messages x JOIN inbox_threads t ON t.id=x.thread_id JOIN inbox_connections c ON c.id=t.connection_id AND c.enabled JOIN workspace_product_access p ON p.workspace_id=x.workspace_id AND p.product='ai' AND p.enabled WHERE x.state='queued' AND briofold_channel_send_valid(x.id) AND (NOT EXISTS(SELECT 1 FROM briofold_broadcast_recipients r WHERE r.id=x.batch_id) OR (briofold_broadcast_valid(x.batch_id) AND briofold_broadcast_due(x.batch_id))) AND (x.batch_id IS NULL OR NOT EXISTS(SELECT 1 FROM inbox_messages earlier WHERE earlier.thread_id=x.thread_id AND earlier.batch_id=x.batch_id AND earlier.sequence<x.sequence AND earlier.state NOT IN ('sent','delivered','seen'))) AND (x.sender<>'ai' OR (t.ai_enabled AND EXISTS(SELECT 1 FROM briofold_ai_channel_jobs j WHERE j.message_id=x.id AND j.state='completed' AND briofold_ai_channel_valid(j.id)))) AND (t.last_customer_at>now()-interval '24 hours' OR inbox_window_free(t.connection_id)) ORDER BY x.sequence FOR UPDATE OF t,x SKIP LOCKED LIMIT 1;
 IF m.id IS NULL THEN RETURN NULL;END IF;
 UPDATE inbox_messages SET state='sending',attempt_at=now(),attempts=attempts+1 WHERE id=m.id;
 SELECT jsonb_build_object('channel_guard',true,'broadcast',EXISTS(SELECT 1 FROM briofold_broadcast_recipients WHERE id=m.batch_id),'id',m.id,'workspace_id',m.workspace_id,'text',m.body,'channel',c.provider,'account',c.external_id,'recipient',t.external_id,'credential',encode(c.credential_cipher,'base64')) INTO result FROM inbox_threads t JOIN inbox_connections c ON c.id=t.connection_id WHERE t.id=m.thread_id;RETURN result;
END $function$
$r$;
    BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.inbox_next_send_v1() FROM PUBLIC'; EXCEPTION WHEN undefined_object THEN NULL; END;
    BEGIN EXECUTE 'GRANT ALL ON FUNCTION public.inbox_next_send_v1() TO ekmivo_financial_runtime'; EXCEPTION WHEN undefined_object THEN NULL; END;
    BEGIN EXECUTE 'GRANT ALL ON FUNCTION public.inbox_next_send_v1() TO ekmivo_financial_projection'; EXCEPTION WHEN undefined_object THEN NULL; END;
  END IF;
END
$m$;

-- inbox_page(uuid,text,uuid,uuid,bigint,jsonb): production md5(prosrc)=3e4d32c325e4e4a5c38bdf5792ec3050
DO $m$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.inbox_page(uuid,text,uuid,uuid,bigint,jsonb)') AND md5(prosrc)='3e4d32c325e4e4a5c38bdf5792ec3050') THEN
    EXECUTE $r$CREATE OR REPLACE FUNCTION public.inbox_page(w uuid, e text, d uuid, t uuid, before_seq bigint, f jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE result jsonb;rk text:=coalesce(f->>'reader_kind','device');off integer:=coalesce((f->>'offset')::integer,0);queue text:=coalesce(f->>'queue','all');q text:=coalesce(f->>'q','');start_day date;end_day date;tag text:=coalesce(f->>'label','');BEGIN
 IF rk='user' THEN PERFORM briofold_inbox_actor(w,d,'inbox:read');END IF;
 IF NOT EXISTS(SELECT 1 FROM workspace_product_access WHERE workspace_id=w AND product='ai' AND enabled) THEN RAISE EXCEPTION 'AI disabled' USING ERRCODE='42501';END IF;
 IF t IS NOT NULL AND rk='user' THEN PERFORM briofold_channel_thread(w,e,d,t,'read');END IF;
 IF t IS NOT NULL THEN
 result:=inbox_page_media(w,e,d,t,before_seq,f);
 IF rk='user' THEN result:=jsonb_set(result,'{thread}',(result->'thread')||jsonb_build_object(
 'send_allowed',((SELECT role FROM workspace_members WHERE workspace_id=w AND user_id=d) IN ('owner','admin','editor') OR pg13_capability_override(w,d,'inbox:send') IS TRUE) AND EXISTS(SELECT 1 FROM inbox_threads x WHERE x.id=t AND briofold_channel_allowed(w,d,x.connection_id,'send')) AND pg13_capability_override(w,d,'inbox:send') IS DISTINCT FROM false,
 'manage_allowed',((SELECT role FROM workspace_members WHERE workspace_id=w AND user_id=d) IN ('owner','admin') OR pg13_capability_override(w,d,'inbox:manage') IS TRUE) AND pg13_capability_override(w,d,'inbox:manage') IS DISTINCT FROM false));END IF;RETURN result;END IF;
 IF e IS NULL OR e NOT IN ('live','sandbox') OR length(q)>200 OR off NOT BETWEEN 0 AND 10000 OR queue NOT IN ('all','unread','mine','unassigned','attention','resolved','snoozed','open','pending','waiting') OR coalesce(f->>'channel','') NOT IN ('','ms','ig','wa','web') THEN RAISE EXCEPTION 'Invalid conversation filters' USING ERRCODE='22023';END IF;
 IF length(tag)>40 OR (coalesce(f->>'from_date','')<>'' AND f->>'from_date'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
 OR (coalesce(f->>'through_date','')<>'' AND f->>'through_date'!~'^[0-9]{4}-[0-9]{2}-[0-9]{2}$') THEN
  RAISE EXCEPTION 'Invalid conversation date or label' USING ERRCODE='22023';END IF;
 BEGIN
  start_day:=nullif(f->>'from_date','')::date;end_day:=nullif(f->>'through_date','')::date;
 EXCEPTION WHEN datetime_field_overflow OR invalid_datetime_format THEN
  RAISE EXCEPTION 'Invalid conversation date' USING ERRCODE='22023';END;
 IF start_day>end_day THEN RAISE EXCEPTION 'Reversed conversation dates' USING ERRCODE='22023';END IF;
 SELECT jsonb_build_object('items',coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.last_activity_at DESC,x.id),'[]')) INTO result FROM (
  SELECT a.id,a.customer_name AS name,c.provider AS channel,a.ai_enabled,a.last_activity_at,
   latest.body AS preview,latest.sender AS preview_sender,
   (SELECT count(*) FROM inbox_messages m WHERE m.thread_id=a.id AND m.sender='customer' AND m.sequence>coalesce(rc.sequence,0)) AS unread,
   coalesce(wf.owner_id::text,'') AS owner_id,coalesce(wf.status,'open') AS status,coalesce(wf.priority,'normal') AS priority,coalesce(wf.labels,'{}') AS labels,wf.due_at,
   coalesce(wf.due_at<now() AND wf.status<>'resolved',false) AS overdue,
   coalesce((a.last_customer_at>now()-interval '24 hours' OR inbox_window_free(a.connection_id)),false) AS window_open,inbox_capabilities(c.provider) AS capabilities
  FROM inbox_threads a JOIN inbox_connections c ON c.id=a.connection_id
  LEFT JOIN briofold_inbox_work wf ON wf.thread_id=a.id
  LEFT JOIN inbox_read_cursors rc ON rc.thread_id=a.id AND rc.device_id=d AND rc.reader_kind=rk
  LEFT JOIN LATERAL(SELECT body,sender FROM inbox_messages WHERE thread_id=a.id ORDER BY sequence DESC LIMIT 1)latest ON true
  WHERE (rk<>'user' OR briofold_channel_allowed(w,d,c.id,'read')) AND a.workspace_id=w AND c.enabled AND c.environment=e
  AND (start_day IS NULL OR a.last_activity_at>=(start_day::timestamp AT TIME ZONE 'UTC'))
  AND (end_day IS NULL OR a.last_activity_at<((end_day+1)::timestamp AT TIME ZONE 'UTC'))
  AND (tag='' OR tag=ANY(coalesce(wf.labels,'{}')))
  AND (q='' OR a.customer_name ILIKE '%'||q||'%' OR coalesce(a.contact->>'phone','') ILIKE '%'||q||'%' OR (c.provider='wa' AND a.external_id ILIKE '%'||q||'%') OR EXISTS(SELECT 1 FROM inbox_messages m WHERE m.workspace_id=w AND m.thread_id=a.id AND to_tsvector('simple',m.body)@@websearch_to_tsquery('simple',q)) OR EXISTS(SELECT 1 FROM inbox_orders o WHERE o.workspace_id=w AND o.thread_id=a.id AND o.reference ILIKE '%'||q||'%'))
  AND (coalesce(f->>'channel','')='' OR c.provider=f->>'channel')
  AND (coalesce(f->>'mode','')='' OR (f->>'mode'='ai' AND a.ai_enabled) OR (f->>'mode'='seller' AND NOT a.ai_enabled) OR (f->>'mode'='waiting' AND EXISTS(SELECT 1 FROM inbox_messages request WHERE request.thread_id=a.id AND request.workspace_id=a.workspace_id AND request.sender='customer' AND NOT EXISTS(SELECT 1 FROM inbox_messages response WHERE response.thread_id=a.id AND response.workspace_id=a.workspace_id AND response.sender IN ('seller','ai') AND response.state IN ('sent','delivered','seen') AND response.sequence>request.sequence))))
  AND (coalesce((f->>'days')::integer,0)=0 OR a.last_activity_at>=now()-make_interval(days=>(f->>'days')::integer))
  AND (coalesce((f->>'unread')::boolean,false)=false OR EXISTS(SELECT 1 FROM inbox_messages m WHERE m.thread_id=a.id AND m.sender='customer' AND m.sequence>coalesce(rc.sequence,0)))
  AND (queue='all' OR (queue='open' AND coalesce(wf.status,'open')='open') OR (queue='pending' AND wf.status='pending') OR (queue='waiting' AND EXISTS(SELECT 1 FROM inbox_messages request WHERE request.thread_id=a.id AND request.workspace_id=a.workspace_id AND request.sender='customer' AND NOT EXISTS(SELECT 1 FROM inbox_messages response WHERE response.thread_id=a.id AND response.workspace_id=a.workspace_id AND response.sender IN ('seller','ai') AND response.state IN ('sent','delivered','seen') AND response.sequence>request.sequence)) AND coalesce(wf.status,'open')<>'resolved') OR (queue='unread' AND EXISTS(SELECT 1 FROM inbox_messages m WHERE m.thread_id=a.id AND m.sender='customer' AND m.sequence>coalesce(rc.sequence,0))) OR (queue='mine' AND wf.owner_id=d) OR (queue='unassigned' AND wf.owner_id IS NULL) OR (queue='attention' AND coalesce(wf.status,'open')<>'resolved' AND (coalesce(wf.disputed,false) OR wf.due_at<now() OR EXISTS(SELECT 1 FROM inbox_messages request WHERE request.thread_id=a.id AND request.workspace_id=a.workspace_id AND request.sender='customer' AND NOT EXISTS(SELECT 1 FROM inbox_messages response WHERE response.thread_id=a.id AND response.workspace_id=a.workspace_id AND response.sender IN ('seller','ai') AND response.state IN ('sent','delivered','seen') AND response.sequence>request.sequence)))) OR (queue='resolved' AND wf.status='resolved') OR (queue='snoozed' AND wf.status='snoozed' AND wf.snooze_until>now()))
  ORDER BY a.last_activity_at DESC,a.id OFFSET off LIMIT 50
 )x;RETURN result;
END $function$
$r$;
    BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.inbox_page(w uuid, e text, d uuid, t uuid, before_seq bigint, f jsonb) FROM PUBLIC'; EXCEPTION WHEN undefined_object THEN NULL; END;
    BEGIN EXECUTE 'GRANT ALL ON FUNCTION public.inbox_page(w uuid, e text, d uuid, t uuid, before_seq bigint, f jsonb) TO ekmivo_financial_runtime'; EXCEPTION WHEN undefined_object THEN NULL; END;
    BEGIN EXECUTE 'GRANT ALL ON FUNCTION public.inbox_page(w uuid, e text, d uuid, t uuid, before_seq bigint, f jsonb) TO ekmivo_financial_projection'; EXCEPTION WHEN undefined_object THEN NULL; END;
  END IF;
END
$m$;

-- inbox_page_media(uuid,text,uuid,uuid,bigint,jsonb): production md5(prosrc)=89f4bdd37fc8bcb1f1632ef384717099
DO $m$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.inbox_page_media(uuid,text,uuid,uuid,bigint,jsonb)') AND md5(prosrc)='89f4bdd37fc8bcb1f1632ef384717099') THEN
    EXECUTE $r$CREATE OR REPLACE FUNCTION public.inbox_page_media(w uuid, e text, d uuid, t uuid, before_seq bigint, f jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE r jsonb;p text;BEGIN
 r:=inbox_page_v1(w,e,d,t,before_seq,f);
 IF t IS NOT NULL THEN
  SELECT c.provider INTO p FROM inbox_threads a JOIN inbox_connections c ON c.id=a.connection_id WHERE a.id=t;
  r:=jsonb_set(r,'{thread,capabilities}',inbox_capabilities(p));
  r:=jsonb_set(r,'{items}',coalesce((SELECT jsonb_agg(x.item||jsonb_build_object('content',m.content-'request_hash','batch_id',m.batch_id,'client_key',CASE WHEN f->>'reader_kind'='user' AND m.requested_by=d THEN m.idempotency_key ELSE NULL END,'reaction',(SELECT emoji FROM inbox_reactions WHERE message_id=m.id)) ORDER BY x.ord) FROM jsonb_array_elements(r->'items') WITH ORDINALITY x(item,ord) JOIN inbox_messages m ON m.id=(x.item->>'id')::uuid),'[]'::jsonb));
 ELSE
  r:=jsonb_set(r,'{items}',coalesce((SELECT jsonb_agg(x.item||jsonb_build_object('window_open',coalesce((a.last_customer_at>now()-interval '24 hours' OR inbox_window_free(a.connection_id)),false),'capabilities',inbox_capabilities(c.provider)) ORDER BY x.ord) FROM jsonb_array_elements(r->'items') WITH ORDINALITY x(item,ord) JOIN inbox_threads a ON a.id=(x.item->>'id')::uuid JOIN inbox_connections c ON c.id=a.connection_id),'[]'::jsonb));
 END IF;RETURN r;
END $function$
$r$;
    BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.inbox_page_media(w uuid, e text, d uuid, t uuid, before_seq bigint, f jsonb) FROM PUBLIC'; EXCEPTION WHEN undefined_object THEN NULL; END;
    BEGIN EXECUTE 'GRANT ALL ON FUNCTION public.inbox_page_media(w uuid, e text, d uuid, t uuid, before_seq bigint, f jsonb) TO ekmivo_financial_runtime'; EXCEPTION WHEN undefined_object THEN NULL; END;
    BEGIN EXECUTE 'GRANT ALL ON FUNCTION public.inbox_page_media(w uuid, e text, d uuid, t uuid, before_seq bigint, f jsonb) TO ekmivo_financial_projection'; EXCEPTION WHEN undefined_object THEN NULL; END;
  END IF;
END
$m$;

-- pg13_public_checkout(uuid,text): production md5(prosrc)=06adaf3a7eaccf365fd8433b2cb32875
DO $m$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.pg13_public_checkout(uuid,text)') AND md5(prosrc)='06adaf3a7eaccf365fd8433b2cb32875') THEN
    EXECUTE $r$CREATE OR REPLACE FUNCTION public.pg13_public_checkout(w uuid, e text)
 RETURNS jsonb
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
 SELECT jsonb_build_object('merchant_name',coalesce(nullif(store.body->>'name',''),wsp.name),
 'brand',jsonb_strip_nulls(jsonb_build_object(
 'logo_url',coalesce(nullif(store.body->>'logo',''),setting.body->>'logo_url'),
 'title',setting.body->>'checkout_title',
 'description',coalesce(nullif(store.body->>'description',''),setting.body->>'checkout_description'),
 'support_url',coalesce(nullif(store.body->>'website',''),setting.body->>'support_url'),
 'website_url',coalesce(nullif(store.body->>'website',''),setting.body->>'support_url'),
 'support_phone',nullif(store.body->>'phone',''),
 'whatsapp',nullif(store.body->>'whatsapp',''),
 'address',nullif(store.body->>'address',''),
 'business_type',nullif(store.body->>'business_type',''),
 'statement_name',nullif(store.body->>'statement_name',''),
 'receipt_note',nullif(store.body->>'receipt_note',''),
 'support_email',coalesce(nullif(store.body->>'support_email',''),setting.body->>'support_email'),
 'legal_url',coalesce(nullif(store.body->>'refund_url',''),setting.body->>'legal_url'),
 'locale',setting.body->>'locale',
 'checkout_theme',CASE WHEN theme.body IS NULL THEN NULL ELSE
 jsonb_set(theme.body,'{store}',jsonb_build_object(
 'name',coalesce(store.body->>'name',wsp.name),'logo',coalesce(store.body->>'logo',''),
 'size',coalesce((theme.body->'store'->>'size')::integer,40),
 'radius',coalesce((theme.body->'store'->>'radius')::integer,0),
 'position',coalesce(nullif(theme.body->'store'->>'position',''),'beside-left'),
 'invert',coalesce((theme.body->'store'->>'invert')::boolean,false)),true)::text END)))
 FROM workspaces wsp JOIN workspace_environments env
 ON env.workspace_id=wsp.id AND env.environment=e AND env.status='active'
 JOIN workspace_product_access prod
 ON prod.workspace_id=wsp.id AND prod.product='payments' AND prod.enabled
 LEFT JOIN pg13_business_settings setting ON setting.workspace_id=wsp.id
 LEFT JOIN checkout_theme_settings theme ON theme.workspace_id=wsp.id
 LEFT JOIN dashboard_store_profiles store ON store.workspace_id=wsp.id
 WHERE wsp.id=w AND e IN ('live','sandbox')
$function$
$r$;
    BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.pg13_public_checkout(w uuid, e text) FROM PUBLIC'; EXCEPTION WHEN undefined_object THEN NULL; END;
    BEGIN EXECUTE 'GRANT ALL ON FUNCTION public.pg13_public_checkout(w uuid, e text) TO ekmivo_financial_runtime'; EXCEPTION WHEN undefined_object THEN NULL; END;
  END IF;
END
$m$;

-- pg13_workspace_read_before_feedback_screenshots(uuid,uuid,text): production md5(prosrc)=f84e26d2b21af021b8804bafcdeafedd
DO $m$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_proc WHERE oid=to_regprocedure('public.pg13_workspace_read_before_feedback_screenshots(uuid,uuid,text)') AND md5(prosrc)='f84e26d2b21af021b8804bafcdeafedd') THEN
    EXECUTE convert_from(decode('Q1JFQVRFIE9SIFJFUExBQ0UgRlVOQ1RJT04gcHVibGljLnBnMTNfd29ya3NwYWNlX3JlYWRfYmVmb3JlX2ZlZWRiYWNrX3NjcmVlbnNob3RzKHcgdXVpZCwgYSB1dWlkLCByZXNvdXJjZSB0ZXh0KQogUkVUVVJOUyBqc29uYgogTEFOR1VBR0UgcGxwZ3NxbAogU1RBQkxFIFNFQ1VSSVRZIERFRklORVIKIFNFVCBzZWFyY2hfcGF0aCBUTyAncHVibGljJywgJ3BnX3RlbXAnCkFTICRmdW5jdGlvbiQgREVDTEFSRSBhY3Rvcl9yb2xlIHRleHQ7QkVHSU4NCiBhY3Rvcl9yb2xlOj1wZzEzX2FjdG9yKHcsYSxmYWxzZSk7DQogSUYgcmVzb3VyY2U9J3RlYW0nIFRIRU4gUkVUVVJOIGpzb25iX2J1aWxkX29iamVjdCgnbWVtYmVycycsY29hbGVzY2UoKFNFTEVDVCBqc29uYl9hZ2coanNvbmJfYnVpbGRfb2JqZWN0KCdpZCcsdS5pZCwnbmFtZScsdS5kaXNwbGF5X25hbWUsJ2VtYWlsJyxDQVNFIFdIRU4gYWN0b3Jfcm9sZSBJTiAoJ293bmVyJywnYWRtaW4nKSBPUiB1LmlkPWEgVEhFTiB1LmVtYWlsIEVORCwncm9sZScsbS5yb2xlLCdqb2luZWRfYXQnLG0uam9pbmVkX2F0KSkgRlJPTSB3b3Jrc3BhY2VfbWVtYmVycyBtIEpPSU4gYXBwX3VzZXJzIHUgT04gdS5pZD1tLnVzZXJfaWQgV0hFUkUgbS53b3Jrc3BhY2VfaWQ9dyksJ1tdJyksJ2ludml0YXRpb25zJyxDQVNFIFdIRU4gYWN0b3Jfcm9sZSBJTiAoJ293bmVyJywnYWRtaW4nKSBUSEVOIGNvYWxlc2NlKChTRUxFQ1QganNvbmJfYWdnKHRvX2pzb25iKGkpLSd0b2tlbl9kaWdlc3QnKSBGUk9NIHBnMTNfaW52aXRlcyBpIFdIRVJFIHdvcmtzcGFjZV9pZD13IEFORCBhY2NlcHRlZF9hdCBJUyBOVUxMIEFORCByZXZva2VkX2F0IElTIE5VTEwpLCdbXScpIEVMU0UgJ1tdJzo6anNvbmIgRU5EKTsNCiBFTFNJRiByZXNvdXJjZT0nc2V0dGluZ3MnIFRIRU4gUkVUVVJOIGNvYWxlc2NlKChTRUxFQ1QganNvbmJfYnVpbGRfb2JqZWN0KCdib2R5Jyxib2R5LCd2ZXJzaW9uJyx2ZXJzaW9uLCd1cGRhdGVkX2F0Jyx1cGRhdGVkX2F0KSBGUk9NIHBnMTNfYnVzaW5lc3Nfc2V0dGluZ3MgV0hFUkUgd29ya3NwYWNlX2lkPXcpLCd7ImJvZHkiOnt9LCJ2ZXJzaW9uIjowfSc6Ompzb25iKTsNCiBFTFNJRiByZXNvdXJjZT0naGVscCcgVEhFTiBSRVRVUk4ganNvbmJfYnVpbGRfb2JqZWN0KCdpdGVtcycsY29hbGVzY2UoKFNFTEVDVCBqc29uYl9hZ2codG9fanNvbmIocyl8fGpzb25iX2J1aWxkX29iamVjdCgncmVwbGllcycscGcxM19zdXBwb3J0X2hpc3RvcnkodyxhLHMuaWQpKSkgRlJPTShTRUxFQ1QgKiBGUk9NIHBnMTNfc3VwcG9ydCBXSEVSRSB3b3Jrc3BhY2VfaWQ9dyBBTkQoYWN0b3JfaWQ9YSBPUiBhY3Rvcl9yb2xlIElOICgnb3duZXInLCdhZG1pbicpKSBPUkRFUiBCWSBjcmVhdGVkX2F0IERFU0MgTElNSVQgMTAwKXMpLCdbXScpKTsNCiBFTFNFIFJBSVNFIEVYQ0VQVElPTiAndW5rbm93biB3b3Jrc3BhY2UgcmVzb3VyY2UnIFVTSU5HIEVSUkNPREU9JzIyMDIzJztFTkQgSUY7DQpFTkQgJGZ1bmN0aW9uJAo=','base64'),'UTF8');
    BEGIN EXECUTE 'REVOKE ALL ON FUNCTION public.pg13_workspace_read_before_feedback_screenshots(w uuid, a uuid, resource text) FROM PUBLIC'; EXCEPTION WHEN undefined_object THEN NULL; END;
  END IF;
END
$m$;
