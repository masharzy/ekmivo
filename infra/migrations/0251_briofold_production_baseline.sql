-- 0251 (control): bring the repository level with production, and remove the dblink shortcut.
--
-- Part A is copied verbatim from the production control database (2026-11-13). These functions were created on the
-- VPS on 2026-11-10 and never committed; the API build that calls them is reproduced in this branch:
--   briofold_ai_channel_claim(true)  -> claim plus business profile   (BRIOFOLD_AI_COMMERCE_V2_ENABLED)
--   briofold_ai_order_memory         -> open draft + last lookup      (BRIOFOLD_AI_ORDER_MEMORY_ENABLED)
--   briofold_ai_sms_review_due       -> late SMS re-check             (BRIOFOLD_AI_LATE_SMS_REVIEW_ENABLED)
--   briofold_ai_claim_resolve        -> production version (a late SMS may verify a 'no_matching_sms' review)
-- On production Part A is a no-op.
--
-- Part B replaces two hand-made functions that read receipts through dblink as a superuser and turned every error
-- into "no SMS found". Receipts are read only by the API through the financial realm (pg236 / pg248).
-- Idempotent.
BEGIN;
-- Part A ---------------------------------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.briofold_ai_business_facts(w uuid) RETURNS jsonb
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

CREATE OR REPLACE FUNCTION public.briofold_ai_channel_claim_before_policy_v2() RETURNS jsonb
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

CREATE OR REPLACE FUNCTION public.briofold_ai_channel_claim_with_policy_v2() RETURNS jsonb
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

CREATE OR REPLACE FUNCTION public.briofold_ai_channel_claim(include_business boolean) RETURNS jsonb
    LANGUAGE plpgsql SECURITY DEFINER
    SET search_path TO 'public', 'pg_temp'
    AS $$
DECLARE claimed jsonb;
BEGIN
  IF NOT include_business THEN RETURN briofold_ai_channel_claim(); END IF;
  claimed := briofold_ai_channel_claim_with_policy_v2();
  IF claimed IS NULL THEN RETURN NULL; END IF;
  RETURN jsonb_set(claimed,'{context,business}',coalesce(
    briofold_ai_business_facts((claimed->>'workspace_id')::uuid),'{}'::jsonb));
END
$$;

CREATE OR REPLACE FUNCTION public.briofold_ai_order_memory(job uuid, lease uuid) RETURNS jsonb
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

CREATE OR REPLACE FUNCTION public.briofold_ai_sms_review_due(lim integer DEFAULT 10) RETURNS jsonb
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

CREATE OR REPLACE FUNCTION public.briofold_ai_claim_resolve(cid uuid, outcome text, why text DEFAULT ''::text, account uuid DEFAULT NULL::uuid) RETURNS jsonb
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

-- Part B ---------------------------------------------------------------------------------------------------------
-- Legacy submit_payment_proof ends here: the claim is stored and the worker verifies it against the realm within a
-- minute. No lookup, no dblink, and never a "did not match" that was really a failed query.
CREATE OR REPLACE FUNCTION public.briofold_ai_verify_claim_now(cid uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c commerce_payment_claims%ROWTYPE;o commerce_orders%ROWTYPE;BEGIN
 SELECT * INTO c FROM commerce_payment_claims WHERE id=cid;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','claim_not_found');END IF;
 SELECT * INTO o FROM commerce_orders WHERE id=c.order_id;
 IF c.state='verified' THEN
  RETURN jsonb_build_object('accepted',true,'verified',true,'verification','verified','status',o.status,'payment_state',o.payment_state,'reference',o.reference,'total_minor',o.total_minor);
 END IF;
 RETURN jsonb_build_object('accepted',true,'verified',false,'verification',CASE c.state WHEN 'pending' THEN 'checking' ELSE c.state END,
  'reason',c.reason,'status',o.status,'payment_state',o.payment_state,'reference',o.reference,'total_minor',o.total_minor);
END$$;

-- get_order_status: the customer's latest (or named) order with the money view. Read-only.
CREATE OR REPLACE FUNCTION public.briofold_ai_order_status_live(w uuid,env text,thread_id uuid,ref_arg text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE oid uuid;BEGIN
 SELECT ord.id INTO oid FROM commerce_orders ord
  JOIN briofold_customer_sources s ON s.customer_id=ord.customer_id AND s.kind='thread' AND s.source_id=thread_id
  WHERE ord.workspace_id=w AND ord.environment=env
    AND (nullif(btrim(coalesce(ref_arg,'')),'') IS NULL OR ord.reference=upper(left(btrim(ref_arg),80)))
  ORDER BY ord.created_at DESC LIMIT 1;
 IF oid IS NULL THEN RETURN jsonb_build_object('error','not_found');END IF;
 RETURN briofold_ai_order_summary(oid)-'lines';
END$$;

REVOKE ALL ON FUNCTION briofold_ai_business_facts(uuid),briofold_ai_channel_claim_before_policy_v2(),briofold_ai_channel_claim_with_policy_v2(),
 briofold_ai_channel_claim(boolean),briofold_ai_order_memory(uuid,uuid),briofold_ai_sms_review_due(integer),
 briofold_ai_verify_claim_now(uuid),briofold_ai_order_status_live(uuid,text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION briofold_ai_channel_claim(boolean),briofold_ai_order_memory(uuid,uuid),briofold_ai_sms_review_due(integer),
 briofold_ai_verify_claim_now(uuid),briofold_ai_order_status_live(uuid,text,uuid,text) TO ekmivo_financial_runtime,ekmivo_financial_projection;
COMMIT;
