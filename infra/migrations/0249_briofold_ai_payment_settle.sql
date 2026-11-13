-- 0249 (control): the AI payment verification ladder.
--
--   1. Sender number only: confirm when exactly ONE unused receipt from that sender, received after the customer
--      started this conversation, has exactly the amount due. Anything else -> ask for the TrxID.
--   2. TrxID (typed or read from a screenshot): the receipt is identified for certain; the sender must still match.
--      The receipt's real amount is recorded, so a short payment becomes a partial payment with a clear remainder.
--   3. Anything not certain goes to the owner's payment review and the customer is told so.
--
-- The API reads receipts from the financial realm (pg236_ai_receipt / pg248_ai_receipts_by_payer) and passes them in;
-- this function owns every decision and every write, in one transaction. It never trusts an amount typed by the customer.
-- Requires 0247. Idempotent.
BEGIN;
DO $preflight$ BEGIN
 IF to_regprocedure('public.briofold_ai_payment_record(uuid,bigint,uuid)') IS NULL THEN RAISE EXCEPTION '0249 requires 0247' USING ERRCODE='42501';END IF;
END $preflight$;

CREATE OR REPLACE FUNCTION briofold_ai_payment_settle(w uuid,e text,thread uuid,args jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s commerce_ai_settings%ROWTYPE;o commerce_orders%ROWTYPE;mode text;since timestamptz;need bigint;due_now bigint;due_all bigint;fails integer;
 payer text:=args->>'payer_digest';trx text:=args->>'transaction_digest';meth text:=nullif(args->>'method','');rc jsonb:=args->'receipt';
 ex commerce_payment_claims%ROWTYPE;cid uuid;pick jsonb;n_all integer;n_exact integer;r jsonb;why text;outcome text;
BEGIN
 IF e NOT IN('live','sandbox') OR coalesce(payer,'')!~'^[0-9a-f]{64}$' OR (trx IS NOT NULL AND trx!~'^[0-9a-f]{64}$')
    OR (meth IS NOT NULL AND meth NOT IN('bkash','nagad','rocket')) THEN
  RETURN jsonb_build_object('error',CASE WHEN coalesce(payer,'')='' THEN 'sender_number_required' ELSE 'invalid_proof' END);
 END IF;
 SELECT * INTO s FROM commerce_ai_settings WHERE workspace_id=w AND environment=e;
 SELECT service_mode INTO mode FROM workspaces WHERE id=w;
 SELECT * INTO o FROM commerce_orders WHERE workspace_id=w AND environment=e AND source='ai' AND source_id=thread
   AND status IN('draft','hold','confirmed') AND paid_minor<total_minor AND payment_state IN('none','awaiting','claimed','partial','cod')
  ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','no_order_awaiting_payment');END IF;
 need:=CASE WHEN o.pay_method='cod' THEN least(o.advance_minor,o.total_minor) ELSE o.total_minor END;
 due_now:=greatest(need-o.paid_minor,0);due_all:=o.total_minor-o.paid_minor;
 -- "After the customer started talking about this purchase": first customer message in the day before the order.
 SELECT least(o.created_at,coalesce(min(m.created_at),o.created_at)) INTO since FROM inbox_messages m
  WHERE m.workspace_id=w AND m.thread_id=thread AND m.sender='customer' AND m.created_at>o.created_at-interval '24 hours';
 SELECT count(*) INTO fails FROM commerce_payment_claims WHERE workspace_id=w AND environment=e AND thread_id=thread AND state='failed' AND created_at>now()-interval '24 hours';
 IF fails>=coalesce(s.wrong_trx_limit,5) THEN RETURN jsonb_build_object('error','too_many_attempts','handover',true,'reference',o.reference);END IF;

 IF trx IS NULL THEN
  -- Step 1: sender number only.
  SELECT count(*),count(*) FILTER(WHERE (x->>'amount_minor')::bigint IN(due_all,nullif(due_now,0))),
         (array_agg(x) FILTER(WHERE (x->>'amount_minor')::bigint IN(due_all,nullif(due_now,0))))[1]
   INTO n_all,n_exact,pick
  FROM jsonb_array_elements(CASE WHEN jsonb_typeof(args->'receipts')='array' THEN args->'receipts' ELSE '[]'::jsonb END) x
  WHERE (x->>'at')::timestamptz>=since AND x->>'reference_digest'~'^[0-9a-f]{64}$' AND (meth IS NULL OR x->>'method'=meth)
    AND NOT EXISTS(SELECT 1 FROM commerce_payment_claims c WHERE c.workspace_id=w AND c.environment=e AND c.transaction_digest=x->>'reference_digest');
  IF n_exact<>1 THEN
   RETURN jsonb_build_object('verified',false,'result',CASE WHEN n_exact>1 THEN 'ambiguous' WHEN n_all>0 THEN 'amount_mismatch' ELSE 'not_found' END,
    'next','ask_transaction_id','reference',o.reference,'due_now_minor',due_now,'due_minor',due_all);
  END IF;
  IF mode='ai' THEN RETURN jsonb_build_object('verified',false,'result','review','reason','ai_only_never_verified','next','ask_transaction_id','reference',o.reference);END IF;
  INSERT INTO commerce_payment_claims(workspace_id,environment,order_id,thread_id,method,transaction_digest,transaction_last4,payer_digest,payer_last3)
   VALUES(w,e,o.id,thread,pick->>'method',pick->>'reference_digest','',payer,left(coalesce(args->>'payer_last3',''),3)) RETURNING id INTO cid;
  r:=briofold_ai_payment_record(cid,(pick->>'amount_minor')::bigint,nullif(pick->>'receiving_account_id','')::uuid);
  RETURN r||jsonb_build_object('verified',true,'matched_by','sender_number');
 END IF;

 -- Step 2: TrxID.
 SELECT * INTO ex FROM commerce_payment_claims WHERE workspace_id=w AND environment=e AND transaction_digest=trx FOR UPDATE;
 IF FOUND AND (ex.order_id<>o.id OR ex.state='verified') THEN
  RETURN jsonb_build_object('verified',false,'result','already_used','reference',o.reference);
 END IF;
 IF FOUND THEN
  UPDATE commerce_payment_claims SET payer_digest=payer,payer_last3=left(coalesce(args->>'payer_last3',''),3),method=coalesce(meth,method),
    state='pending',reason='',resolved_at=NULL,next_try_at=now(),created_at=now(),attempts=0 WHERE id=ex.id;
  cid:=ex.id;
 ELSE
  INSERT INTO commerce_payment_claims(workspace_id,environment,order_id,thread_id,method,transaction_digest,transaction_last4,payer_digest,payer_last3)
   VALUES(w,e,o.id,thread,coalesce(meth,rc->>'method','bkash'),trx,left(coalesce(args->>'transaction_last4',''),4),payer,left(coalesce(args->>'payer_last3',''),3)) RETURNING id INTO cid;
 END IF;
 UPDATE commerce_orders SET payment_state=CASE WHEN payment_state IN('none','awaiting') AND status IN('draft','hold') THEN 'claimed' ELSE payment_state END,
   draft_expires_at=NULL,claimed_payment=jsonb_build_object('method',coalesce(meth,rc->>'method'),'last4',left(coalesce(args->>'transaction_last4',''),4)),updated_at=now() WHERE id=o.id;

 IF mode='ai' THEN outcome:='review';why:='ai_only_never_verified';
 ELSIF rc IS NULL OR jsonb_typeof(rc)<>'object' THEN outcome:='checking';why:='no_matching_sms';
 ELSIF rc->>'direction'<>'incoming' THEN outcome:='failed';why:='not_incoming';
 ELSIF coalesce((rc->>'allocated')::boolean,false) OR rc->>'checkout_status'='matched' THEN outcome:='failed';why:='already_used';
 ELSIF coalesce(rc->>'checkout_status','pending') IN('','pending') THEN outcome:='checking';why:='checkout_matcher_pending';
 ELSIF rc->>'checkout_status'<>'unmatched' THEN outcome:='review';why:='checkout_'||(rc->>'checkout_status');
 ELSIF meth IS NOT NULL AND rc->>'method'<>meth THEN outcome:='failed';why:='wrong_method';
 ELSIF coalesce(rc->>'payer_hmac','')<>payer THEN outcome:='failed';why:='sender_mismatch';
 ELSIF (rc->>'at')::timestamptz<since THEN outcome:='review';why:='payment_before_conversation';
 ELSIF coalesce((rc->>'amount_minor')::bigint,0)<=0 THEN outcome:='review';why:='invalid_amount';
 ELSE outcome:='matched';
 END IF;

 IF outcome='matched' THEN
  UPDATE commerce_payment_claims SET method=rc->>'method' WHERE id=cid AND method<>rc->>'method';
  r:=briofold_ai_payment_record(cid,(rc->>'amount_minor')::bigint,nullif(rc->>'receiving_account_id','')::uuid);
  RETURN r||jsonb_build_object('verified',true,'matched_by','transaction_id');
 ELSIF outcome='checking' THEN
  -- The SMS may simply not have arrived yet: the worker keeps checking this pending claim.
  RETURN jsonb_build_object('verified',false,'result','checking','reason',why,'reference',o.reference);
 ELSIF outcome='review' THEN
  UPDATE commerce_payment_claims SET state='review',reason=why,resolved_at=now(),attempts=attempts+1 WHERE id=cid;
  RETURN jsonb_build_object('verified',false,'result','review','reason',why,'reference',o.reference);
 ELSE
  UPDATE commerce_payment_claims SET state='failed',reason=why,resolved_at=now(),attempts=attempts+1 WHERE id=cid;
  UPDATE commerce_orders SET payment_state='awaiting',updated_at=now() WHERE id=o.id AND payment_state='claimed';
  RETURN jsonb_build_object('verified',false,'result',why,'reference',o.reference,'due_now_minor',due_now);
 END IF;
END$$;
REVOKE ALL ON FUNCTION briofold_ai_payment_settle(uuid,text,uuid,jsonb) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
COMMIT;
