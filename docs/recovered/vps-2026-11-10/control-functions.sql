CREATE FUNCTION public.briofold_ai_business_facts(w uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'name', coalesce(nullif(p.body->>'name',''), s.name),
    'description', nullif(p.body->>'description',''),
    'logo', nullif(p.body->>'logo',''),
    'phone', nullif(p.body->>'phone',''),
    'whatsapp', nullif(p.body->>'whatsapp',''),
    'email', nullif(p.body->>'support_email',''),
    'address', nullif(p.body->>'address',''),
    'website', nullif(p.body->>'website',''),
    'refund_url', nullif(p.body->>'refund_url','')
  ))
  FROM workspaces s LEFT JOIN dashboard_store_profiles p ON p.workspace_id=s.id
  WHERE s.id=w
$$;
-----
CREATE FUNCTION public.briofold_ai_channel_claim_before_policy_v2() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$DECLARE j briofold_ai_channel_jobs;t inbox_threads;msg inbox_messages;ctx jsonb;lease uuid:=gen_random_uuid();BEGIN
 -- A lost worker is an unknown outcome requiring review, never a second provider call.
 WITH expired AS (SELECT id FROM briofold_ai_channel_jobs WHERE state='running' AND leased_at<now()-interval '2 minutes' ORDER BY leased_at LIMIT 100 FOR UPDATE SKIP LOCKED) UPDATE briofold_ai_channel_jobs x SET state='review',reason='WORKER_OUTCOME_UNKNOWN',updated_at=now() FROM expired WHERE x.id=expired.id;
 SELECT x.* INTO j FROM briofold_ai_channel_jobs x JOIN inbox_threads z ON z.id=x.thread_id JOIN inbox_connections c ON c.id=z.connection_id AND c.enabled AND c.environment='live' JOIN workspace_product_access p ON p.workspace_id=x.workspace_id AND p.product='ai' AND p.enabled WHERE x.state='queued' AND (SELECT count(*) FROM briofold_ai_channel_jobs busy WHERE busy.workspace_id=x.workspace_id AND busy.state='running')<2 AND NOT EXISTS(SELECT 1 FROM briofold_ai_channel_jobs active_job WHERE active_job.thread_id=x.thread_id AND active_job.state='running') ORDER BY x.created_at,x.id FOR UPDATE OF z,x SKIP LOCKED LIMIT 1;
 IF j.id IS NULL THEN RETURN NULL;END IF;
 IF NOT pg_try_advisory_xact_lock(hashtextextended('briofold:ai-channel:'||j.workspace_id::text,0)) OR (SELECT count(*) FROM briofold_ai_channel_jobs WHERE workspace_id=j.workspace_id AND state='running')>=2 THEN RETURN NULL;END IF;
 SELECT * INTO t FROM inbox_threads WHERE id=j.thread_id;SELECT * INTO msg FROM inbox_messages WHERE id=j.inbound_id;
 IF NOT t.ai_enabled OR t.last_customer_at IS NULL OR msg.created_at<t.last_customer_at OR (t.last_customer_at<=now()-interval '24 hours' AND NOT inbox_window_free(t.connection_id)) OR EXISTS(SELECT 1 FROM briofold_inbox_work WHERE thread_id=t.id AND (disputed OR status IN ('resolved','snoozed'))) OR EXISTS(SELECT 1 FROM briofold_inbox_tickets WHERE thread_id=t.id AND category IN ('complaint','refund','return') AND status<>'resolved') OR EXISTS(SELECT 1 FROM inbox_messages WHERE thread_id=t.id AND sender='customer' AND sequence>msg.sequence) OR NOT EXISTS(SELECT 1 FROM briofold_ai_studio_drafts d JOIN briofold_ai_studio_versions v ON v.id=d.published_id WHERE d.workspace_id=j.workspace_id AND d.published_id=j.publication_id AND v.config->>'mode'='live') THEN
  UPDATE briofold_ai_channel_jobs SET state='cancelled',reason='CONVERSATION_OR_PUBLICATION_CHANGED',updated_at=now() WHERE id=j.id;RETURN NULL;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM workspace_members m JOIN app_users u ON u.id=m.user_id WHERE m.workspace_id=j.workspace_id AND m.user_id=j.actor_id AND m.role IN ('owner','admin') AND u.disabled_at IS NULL) OR pg13_capability_override(j.workspace_id,j.actor_id,'inbox:manage') IS FALSE OR pg13_capability_override(j.workspace_id,j.actor_id,'workspace:settings') IS FALSE THEN
  UPDATE briofold_ai_channel_jobs SET state='review',reason='PUBLISHER_ACCESS_REVOKED',updated_at=now() WHERE id=j.id;RETURN NULL;
 END IF;
 BEGIN
 SELECT briofold_ai_studio_context(j.workspace_id,j.actor_id,d.revision,true,j.publication_id,CASE WHEN msg.type IN ('image','audio','video') THEN coalesce(nullif(msg.body,''),'Please understand the customer attachment.') ELSE msg.body END) INTO ctx FROM briofold_ai_studio_drafts d WHERE d.workspace_id=j.workspace_id;
 EXCEPTION WHEN insufficient_privilege OR invalid_parameter_value OR serialization_failure THEN
 UPDATE briofold_ai_channel_jobs SET state='review',reason='ASSISTANT_CONTEXT_CHANGED',updated_at=now() WHERE id=j.id;RETURN NULL;
 END;
 IF msg.type NOT IN ('image','audio','video') AND jsonb_array_length(ctx->'knowledge')=0 AND jsonb_array_length(ctx->'products')=0 AND false THEN UPDATE briofold_ai_channel_jobs SET state='review',reason='NO_GROUNDED_SOURCE',updated_at=now() WHERE id=j.id;RETURN NULL;END IF;
 ctx:=ctx||jsonb_build_object('ai_selling',briofold_ai_selling_on(j.workspace_id),'history',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.sequence) FROM (
  SELECT sender,left(body,700) AS text,sequence FROM inbox_messages WHERE workspace_id=j.workspace_id AND thread_id=t.id AND sequence<msg.sequence AND type='text' AND length(body)>0 AND state IN ('received','sent','delivered','seen') ORDER BY sequence DESC LIMIT 8)x),'[]'));
 UPDATE briofold_ai_channel_jobs SET state='running',lease_id=lease,leased_at=now(),thread_ai_version=t.ai_version,context=ctx,updated_at=now() WHERE id=j.id;
 RETURN jsonb_build_object('id',j.id,'workspace_id',j.workspace_id,'thread_id',j.thread_id,'actor_id',j.actor_id,'request_key',j.request_key,'lease_id',lease,'context',ctx);
END $$;
-----
CREATE FUNCTION public.briofold_ai_channel_claim_with_policy_v2() RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE r jsonb;c uuid;policy jsonb;revision bigint;ctx jsonb;BEGIN
 r:=briofold_ai_channel_claim_before_policy_v2();IF r IS NULL THEN RETURN NULL;END IF;
 SELECT connection_id INTO c FROM inbox_threads WHERE id=(r->>'thread_id')::uuid;
 policy:=briofold_channel_policy(c);SELECT coalesce((SELECT p.revision FROM briofold_channel_policies p WHERE p.connection_id=c),0) INTO revision;
 IF policy->>'mode'='human' THEN
  UPDATE briofold_ai_channel_jobs SET state='cancelled',reason='CHANNEL_HUMAN_MODE',updated_at=now() WHERE id=(r->>'id')::uuid;RETURN NULL;
 END IF;
 ctx:=r->'context'||jsonb_build_object('channel_policy_revision',revision,'channel_instructions',
 'Offer review or product suggestions only when relevant to the current customer request. Never invent eligibility, consent, prices, availability or a verified payment. No unsolicited follow-up. Review guidance: '||(policy->>'review_guidance')||E'\nProduct suggestion guidance: '||(policy->>'upsell_guidance'));
 UPDATE briofold_ai_channel_jobs SET context=ctx WHERE id=(r->>'id')::uuid;
 RETURN jsonb_set(r,'{context}',ctx);
END $$;
-----
CREATE FUNCTION public.briofold_ai_financial_receipt_lookup(w uuid, env text, ref_digest text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
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
END $$;
-----
CREATE FUNCTION public.briofold_ai_order_memory(job uuid, lease uuid) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
  SELECT jsonb_strip_nulls(jsonb_build_object(
    'draft', CASE WHEN o.id IS NOT NULL THEN jsonb_build_object(
      'reference',o.reference,'has_name',coalesce(o.recipient->>'name','')<>'',
      'has_phone',coalesce(o.recipient->>'phone','')<>'',
      'has_address',coalesce(o.recipient->>'address','')<>'',
      'total_minor',o.total_minor,
      'items',coalesce((SELECT jsonb_agg(jsonb_build_object(
        'variant_ref',l.variant_id,'name',l.name,'quantity',l.quantity) ORDER BY l.variant_id)
        FROM commerce_lines l WHERE l.order_id=o.id),'[]'::jsonb)
    ) END,
    'recent_product_lookup',lookup.products
  ))
  FROM briofold_ai_channel_jobs j
  JOIN inbox_threads t ON (t.workspace_id,t.id)=(j.workspace_id,j.thread_id)
  JOIN inbox_connections n ON (n.workspace_id,n.id)=(j.workspace_id,t.connection_id)
  LEFT JOIN LATERAL (
    SELECT x.* FROM commerce_orders x
    WHERE (x.workspace_id,x.environment,x.source_id)=(j.workspace_id,n.environment,j.thread_id)
      AND x.source='ai' AND x.status='draft' AND x.payment_state IN ('none','awaiting')
      AND x.draft_expires_at>now()
    ORDER BY x.created_at DESC LIMIT 1
  ) o ON true
  LEFT JOIN LATERAL (
    SELECT c.result->'products' AS products
    FROM ai_tool_calls c JOIN briofold_ai_channel_jobs previous ON previous.id=c.job_id
    WHERE c.workspace_id=j.workspace_id AND previous.workspace_id=j.workspace_id
      AND previous.thread_id=j.thread_id AND previous.state='completed'
      AND c.tool='search_products' AND c.ok AND c.created_at>now()-interval '30 minutes'
    ORDER BY c.created_at DESC LIMIT 1
  ) lookup ON true
  WHERE j.id=job AND j.lease_id=lease AND j.state='running';
$$;
-----
CREATE FUNCTION public.briofold_ai_order_status_live(w uuid, env text, thread_id uuid, ref_arg text) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  o commerce_orders%ROWTYPE;
  c commerce_payment_claims%ROWTYPE;
BEGIN
  SELECT ord.* INTO o
  FROM commerce_orders ord
  JOIN briofold_customer_sources s ON s.customer_id=ord.customer_id AND s.kind='thread' AND s.source_id=thread_id
  WHERE ord.workspace_id=w AND ord.environment=env
    AND (nullif(btrim(coalesce(ref_arg,'')),'') IS NULL OR ord.reference=upper(left(btrim(ref_arg),80)))
  ORDER BY ord.created_at DESC LIMIT 1;

  IF NOT FOUND THEN RETURN jsonb_build_object('error','not_found'); END IF;

  SELECT * INTO c FROM commerce_payment_claims WHERE order_id=o.id ORDER BY created_at DESC LIMIT 1;
  IF FOUND AND o.payment_state <> 'verified' THEN
    RETURN public.briofold_ai_verify_claim_now(c.id);
  END IF;

  RETURN jsonb_build_object('reference',o.reference,'status',o.status,'payment_state',o.payment_state,'total_minor',o.total_minor);
END $$;
-----
CREATE FUNCTION public.briofold_ai_sms_review_due(lim integer DEFAULT 10) RETURNS jsonb
    LANGUAGE sql STABLE SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object(
   'id',c.id,'workspace_id',c.workspace_id,'environment',c.environment,
   'method',c.method,'digest',c.transaction_digest,'payer_digest',c.payer_digest,
   'due_minor',o.total_minor,'order_created_at',o.created_at,'service_mode',w.service_mode,
   'accounts',to_jsonb(coalesce(s.receiving_account_ids,'{}'::uuid[]))
 )),'[]'::jsonb)
 FROM (
   SELECT claim.* FROM commerce_payment_claims claim
   JOIN commerce_orders ord ON (ord.workspace_id,ord.environment,ord.id)=(claim.workspace_id,claim.environment,claim.order_id)
   JOIN workspaces ws ON ws.id=claim.workspace_id AND ws.service_mode<>'ai'
   WHERE claim.state='review' AND claim.reason='no_matching_sms'
     AND claim.created_at>now()-interval '24 hours'
     AND ord.status IN ('draft','hold') AND ord.payment_state='claimed'
   ORDER BY claim.created_at,claim.id
   LIMIT least(greatest(lim,1),20)
 ) c
 JOIN commerce_orders o ON o.id=c.order_id
 JOIN workspaces w ON w.id=c.workspace_id
 LEFT JOIN commerce_ai_settings s ON s.workspace_id=c.workspace_id AND s.environment=c.environment
$$;
-----
CREATE FUNCTION public.briofold_ai_verify_claim_now(cid uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE
  c commerce_payment_claims%ROWTYPE;
  o commerce_orders%ROWTYPE;
  mode text;
  receipt jsonb;
  r_method text;
  r_amount bigint;
  r_at timestamptz;
  r_dir text;
  r_payer text;
  r_acct uuid;
  r_alloc boolean;
  r_chk text;
  outcome text;
  why text := '';
BEGIN
  SELECT * INTO c FROM commerce_payment_claims WHERE id=cid;
  IF NOT FOUND THEN RETURN jsonb_build_object('error','claim_not_found'); END IF;
  SELECT * INTO o FROM commerce_orders WHERE id=c.order_id;
  SELECT service_mode INTO mode FROM workspaces WHERE id=c.workspace_id;

  IF c.state='verified' OR o.payment_state='verified' THEN
    RETURN jsonb_build_object(
      'accepted',true,'verified',true,'verification','verified',
      'status',o.status,'order_status',o.status,'payment_state',o.payment_state,'reference',o.reference,'total_minor',o.total_minor,
      'note','Payment is VERIFIED and order is CONFIRMED. Tell the customer their payment is verified and the order is confirmed!'
    );
  END IF;

  IF mode='ai' THEN
    RETURN jsonb_build_object('accepted',true,'verified',false,'verification','owner_review','reason','ai_only_never_verified');
  END IF;

  receipt := public.briofold_ai_financial_receipt_lookup(c.workspace_id, c.environment, c.transaction_digest);

  IF receipt IS NULL OR jsonb_typeof(receipt) = 'null' THEN
    RETURN jsonb_build_object(
      'accepted',false,'verified',false,'verification','not_matched',
      'reference',o.reference,'status','not_matched','payment_state','not_matched','total_minor',o.total_minor,
      'reason','no_matching_sms',
      'note','No SMS receipt matching this TrxID was found in the payment gateway. Tell the customer clearly that their TrxID did NOT match any received payment SMS.'
    );
  END IF;

  r_method := lower(btrim(coalesce(receipt->>'method','')));
  r_amount := (receipt->>'amount_minor')::bigint;
  r_at     := (receipt->>'at')::timestamptz;
  r_dir    := receipt->>'direction';
  r_payer  := receipt->>'payer_hmac';
  BEGIN r_acct := (receipt->>'receiving_account_id')::uuid; EXCEPTION WHEN others THEN r_acct := NULL; END;
  r_alloc  := coalesce((receipt->>'allocated')::boolean, false);
  r_chk    := coalesce(receipt->>'checkout_status', '');

  IF r_dir <> 'incoming' THEN outcome := 'failed'; why := 'not_incoming';
  ELSIF r_alloc OR r_chk = 'matched' THEN outcome := 'failed'; why := 'already_used';
  ELSIF r_chk = '' OR r_chk = 'pending' THEN outcome := 'retry'; why := 'checkout_matcher_pending';
  ELSIF r_chk <> 'unmatched' THEN outcome := 'review'; why := 'checkout_' || r_chk;
  ELSIF r_method <> lower(btrim(c.method)) THEN outcome := 'failed'; why := 'wrong_method';
  ELSIF coalesce(r_payer, '') = '' OR r_payer <> c.payer_digest THEN outcome := 'review'; why := 'sender_mismatch';
  ELSIF r_at < o.created_at - interval '1 minute' THEN outcome := 'review'; why := 'payment_before_order';
  ELSIF r_amount < o.total_minor THEN outcome := 'review'; why := 'short_payment';
  ELSIF r_amount > o.total_minor THEN outcome := 'review'; why := 'over_payment';
  ELSE outcome := 'matched'; why := '';
  END IF;

  IF c.state <> 'pending' AND outcome IN ('matched', 'review', 'failed') THEN
    UPDATE commerce_payment_claims SET state='pending', resolved_at=NULL WHERE id=c.id;
  END IF;

  PERFORM briofold_ai_claim_resolve(c.id, outcome, why, r_acct);
  SELECT * INTO o FROM commerce_orders WHERE id=c.order_id;

  IF outcome = 'matched' AND o.payment_state = 'verified' THEN
    RETURN jsonb_build_object(
      'accepted',true,'verified',true,'verification','verified',
      'status',o.status,'order_status',o.status,'payment_state',o.payment_state,'reference',o.reference,'total_minor',o.total_minor,
      'note','Payment is VERIFIED and order ' || o.reference || ' is CONFIRMED! Tell the customer clearly that their payment is verified and the order is confirmed.'
    );
  ELSIF why = 'sender_mismatch' THEN
    RETURN jsonb_build_object(
      'accepted',false,'verified',false,'verification','failed','reason','sender_mismatch',
      'reference',o.reference,'status','sender_mismatch','payment_state','sender_mismatch','total_minor',o.total_minor,
      'note','The TrxID was found in the payment gateway, but the sender phone number does NOT match the phone number that sent the money. Tell the customer clearly that the sender number did not match, and ask them for the exact sender number they paid from.'
    );
  ELSIF why = 'short_payment' THEN
    RETURN jsonb_build_object(
      'accepted',false,'verified',false,'verification','failed','reason','short_payment',
      'reference',o.reference,'status','short_payment','payment_state','short_payment',
      'received_minor',r_amount,'due_minor',o.total_minor,'total_minor',o.total_minor,
      'note','The payment SMS was found, but the paid amount (' || (r_amount/100) || ' BDT) is less than the order total (' || (o.total_minor/100) || ' BDT). Tell the customer clearly.'
    );
  ELSIF why = 'wrong_method' THEN
    RETURN jsonb_build_object(
      'accepted',false,'verified',false,'verification','failed','reason','wrong_method',
      'reference',o.reference,'status','wrong_method','payment_state','wrong_method','total_minor',o.total_minor,
      'note','The TrxID belongs to ' || r_method || ', not ' || c.method || '. Tell the customer.'
    );
  ELSIF why = 'already_used' THEN
    RETURN jsonb_build_object(
      'accepted',false,'verified',false,'verification','failed','reason','already_used',
      'reference',o.reference,'status','already_used','payment_state','already_used','total_minor',o.total_minor,
      'note','This TrxID has already been used for another payment. Tell the customer.'
    );
  ELSE
    RETURN jsonb_build_object(
      'accepted',false,'verified',false,'verification',outcome,'reason',why,
      'reference',o.reference,'status',why,'payment_state',why,'total_minor',o.total_minor,
      'note','Payment could not be verified (reason: ' || why || '). Tell the customer clearly.'
    );
  END IF;
END $$;
-----
CREATE FUNCTION public.briofold_ai_order_tool(w uuid, e text, thread uuid, actor uuid, tool_name text, args jsonb) RETURNS jsonb
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
END $_$;
-----
CREATE FUNCTION public.briofold_ai_tool(job uuid, lease uuid, step_no integer, tool_name text, args jsonb, args_redacted jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
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
END $$;
-----
CREATE FUNCTION public.briofold_ai_claim_resolve(cid uuid, outcome text, why text DEFAULT ''::text, account uuid DEFAULT NULL::uuid) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE c commerce_payment_claims%ROWTYPE;o commerce_orders%ROWTYPE;mode text;BEGIN
 IF outcome NOT IN('matched','retry','review','failed') THEN RAISE EXCEPTION 'Invalid outcome' USING ERRCODE='22023';END IF;
 SELECT * INTO c FROM commerce_payment_claims WHERE id=cid FOR UPDATE;
 IF NOT FOUND OR (c.state<>'pending' AND NOT (outcome='matched' AND c.state='review' AND c.reason='no_matching_sms')) THEN RETURN jsonb_build_object('changed',false);END IF;
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
-----
