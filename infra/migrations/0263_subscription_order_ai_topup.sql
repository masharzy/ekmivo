-- Control database. Owner decision 2026-11-16: "Both" is one cart order with
-- two lines, plan + AI credit recharge, paid once. The amount is simply the sum.
--
-- * The intent may carry ai_topup_minor (৳20 to ৳100,000) for a payments plan.
-- * The quote adds a second line "AI credit"; total = plan total + AI credit.
--   Coupon and tax still apply to the plan only.
-- * The plan invoice keeps the plan amount; the payment handoff (what the
--   customer pays on checkout) is the full total.
-- * Settlement activates the plan with the plan part and credits the AI wallet
--   with the AI part, in the same transaction, once (same idempotent top-up
--   crediting as a normal recharge, keyed by the order).
-- ai_topup_minor = 0 (every existing order) keeps the old behaviour exactly.
-- The web only sends it when BRIOFOLD_ORDER_AI_TOPUP_ENABLED=true.
-- Safe to run twice: each patch is skipped when already applied, and stops when
-- a function is not the expected one.
BEGIN;
DO $$BEGIN
 IF to_regclass('public.platform_subscription_purchase_intents') IS NULL
 OR to_regclass('public.briofold_ai_topups') IS NULL
 OR to_regclass('public.financial_realm') IS NOT NULL
 THEN RAISE EXCEPTION 'order AI top-up requires the control database'; END IF;
END $$;

ALTER TABLE platform_subscription_purchase_intents ADD COLUMN IF NOT EXISTS ai_topup_minor bigint NOT NULL DEFAULT 0;
ALTER TABLE platform_subscription_purchase_quotes ADD COLUMN IF NOT EXISTS ai_topup_minor bigint NOT NULL DEFAULT 0;
DO $$BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='platform_subscription_intents_ai_topup_range') THEN
  ALTER TABLE platform_subscription_purchase_intents ADD CONSTRAINT platform_subscription_intents_ai_topup_range
   CHECK(ai_topup_minor=0 OR ai_topup_minor BETWEEN 2000 AND 10000000);
 END IF;
 IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='platform_subscription_quotes_ai_topup_range') THEN
  ALTER TABLE platform_subscription_purchase_quotes ADD CONSTRAINT platform_subscription_quotes_ai_topup_range
   CHECK(ai_topup_minor>=0 AND ai_topup_minor<=total_minor);
 END IF;
END $$;

-- The quote total rule (0133, auto-named) becomes "plan total + AI credit".
-- Found by its definition, not its generated name.
DO $$DECLARE c record; found_rule boolean:=false;BEGIN
 IF EXISTS(SELECT 1 FROM pg_constraint WHERE conname='platform_subscription_quotes_total_with_ai') THEN RETURN; END IF;
 FOR c IN SELECT conname,pg_get_constraintdef(oid) AS def FROM pg_constraint
   WHERE conrelid='platform_subscription_purchase_quotes'::regclass AND contype='c' LOOP
  IF c.def LIKE '%(total_minor)::numeric = %subtotal_minor%tax_minor%' AND c.def NOT LIKE '%ai_topup_minor%' THEN
   EXECUTE format('ALTER TABLE platform_subscription_purchase_quotes DROP CONSTRAINT %I',c.conname);
   found_rule:=true;
  END IF;
 END LOOP;
 IF NOT found_rule THEN RAISE EXCEPTION 'quote total rule not found; inspect before applying 0263'; END IF;
 ALTER TABLE platform_subscription_purchase_quotes ADD CONSTRAINT platform_subscription_quotes_total_with_ai
  CHECK(total_minor::numeric=subtotal_minor::numeric-annual_discount_minor::numeric-bundle_discount_minor::numeric
   -coupon_discount_minor::numeric+tax_minor::numeric+ai_topup_minor::numeric);
END $$;

-- One helper: replace exact text in a function, or skip if already done.
CREATE OR REPLACE FUNCTION pg_temp.patch_fn(sig text,marker text,pairs text[]) RETURNS void LANGUAGE plpgsql AS $$
DECLARE d text; i int;
BEGIN
 d:=pg_get_functiondef(sig::regprocedure);
 IF position(marker IN d)>0 THEN RETURN; END IF;
 FOR i IN 1..array_length(pairs,1) BY 2 LOOP
  IF position(pairs[i] IN d)=0 THEN
   RAISE EXCEPTION 'Unknown % (missing: %); inspect before applying 0263',sig,left(pairs[i],80);
  END IF;
  d:=replace(d,pairs[i],pairs[i+1]);
 END LOOP;
 EXECUTE d;
END $$;

-- 1. Create intent: accept an optional AI recharge for a payments plan.
SELECT pg_temp.patch_fn('platform_subscription_intent_command(text,uuid,text,text,jsonb)','ai_topup bigint:=0;',ARRAY[
 'coupon_uuid uuid; plan_id text;',
 'coupon_uuid uuid; ai_topup bigint:=0; plan_id text;',
 E'  IF selected_offer.product=''payments'' AND requested<>1\n  THEN RAISE EXCEPTION ''INVALID_QUANTITY'' USING ERRCODE=''22023''; END IF;',
 E'  IF selected_offer.product=''payments'' AND requested<>1\n  THEN RAISE EXCEPTION ''INVALID_QUANTITY'' USING ERRCODE=''22023''; END IF;\n  IF data ? ''ai_topup_minor'' THEN\n   IF coalesce(data->>''ai_topup_minor'','''')!~''^[1-9][0-9]{0,8}$'' OR selected_offer.product<>''payments''\n   THEN RAISE EXCEPTION ''INVALID_AI_TOPUP'' USING ERRCODE=''22023''; END IF;\n   ai_topup:=(data->>''ai_topup_minor'')::bigint;\n   IF ai_topup NOT BETWEEN 2000 AND 10000000 THEN RAISE EXCEPTION ''INVALID_AI_TOPUP'' USING ERRCODE=''22023''; END IF;\n  END IF;',
 E'   creation_key,requested_quantity,legacy_plan_id,expires_at)\n  VALUES(capability_digest,guest_digest,actor,selected_offer.id,coupon_uuid,\n   creation_digest,requested::integer,data->>''legacy_plan_id'',now()+interval ''7 days'')',
 E'   creation_key,requested_quantity,legacy_plan_id,expires_at,ai_topup_minor)\n  VALUES(capability_digest,guest_digest,actor,selected_offer.id,coupon_uuid,\n   creation_digest,requested::integer,data->>''legacy_plan_id'',now()+interval ''7 days'',ai_topup)',
 E'    OR intent_row.legacy_plan_id IS DISTINCT FROM (data->>''legacy_plan_id'')\n',
 E'    OR intent_row.legacy_plan_id IS DISTINCT FROM (data->>''legacy_plan_id'')\n    OR intent_row.ai_topup_minor IS DISTINCT FROM ai_topup\n'
]);

-- 2. Quote, read and confirm: second line, total includes the AI part.
SELECT pg_temp.patch_fn('platform_subscription_order_request(uuid,uuid,uuid,text,jsonb)','final_amount+intent.ai_topup_minor',ARRAY[
 E'''expires_at'',intent.expires_at,''offer'',',
 E'''expires_at'',intent.expires_at,''ai_topup_minor'',intent.ai_topup_minor::text,''offer'',',
 E'''tax_minor'',quote.tax_minor::text,''total_minor'',quote.total_minor::text,',
 E'''tax_minor'',quote.tax_minor::text,''ai_topup_minor'',quote.ai_topup_minor::text,''total_minor'',quote.total_minor::text,',
 E'    subtotal_minor,coupon_discount_minor,tax_minor,total_minor,tax_policy_id,tax_policy_revision,coupon_revision)\n  VALUES(purchase,previous_revision,variant.id,chosen_coupon,base::bigint,promo_discount::bigint,\n    tax_amount::bigint,final_amount::bigint,tax.id,tax.revision,promo.revision) RETURNING * INTO quote;',
 E'    subtotal_minor,coupon_discount_minor,tax_minor,total_minor,tax_policy_id,tax_policy_revision,coupon_revision,ai_topup_minor)\n  VALUES(purchase,previous_revision,variant.id,chosen_coupon,base::bigint,promo_discount::bigint,\n    tax_amount::bigint,(final_amount+intent.ai_topup_minor)::bigint,tax.id,tax.revision,promo.revision,intent.ai_topup_minor) RETURNING * INTO quote;',
 E'   VALUES(quote.id,1,variant.terms->>''name'',variant.id,units,variant.amount_minor,base::bigint);',
 E'   VALUES(quote.id,1,variant.terms->>''name'',variant.id,units,variant.amount_minor,base::bigint);\n  IF intent.ai_topup_minor>0 THEN\n   INSERT INTO platform_subscription_quote_lines(quote_id,line_no,label,offer_version_id,quantity,unit_price_minor,subtotal_minor)\n    VALUES(quote.id,2,''AI credit'',NULL,1,intent.ai_topup_minor,intent.ai_topup_minor);\n  END IF;',
 E'  OR quote.tax_minor<>tax_amount OR quote.total_minor<>final_amount)',
 E'  OR quote.tax_minor<>tax_amount OR quote.total_minor<>final_amount+intent.ai_topup_minor\n  OR quote.ai_topup_minor<>intent.ai_topup_minor)',
 E' IF quote.total_minor<=0 THEN RAISE EXCEPTION ''ZERO_DUE_UNAPPROVED''; END IF;',
 E' IF quote.total_minor-quote.ai_topup_minor<=0 THEN RAISE EXCEPTION ''ZERO_DUE_UNAPPROVED''; END IF;',
 E'''total_minor'',final_amount::bigint::text,''currency'',''BDT'',''coupon_id'',chosen_coupon,',
 E'''ai_topup_minor'',intent.ai_topup_minor::text,''total_minor'',(final_amount+intent.ai_topup_minor)::bigint::text,''currency'',''BDT'',''coupon_id'',chosen_coupon,',
 E'''total_minor'',final_amount::bigint::text,''currency'',''BDT'',''snapshot'',summary);',
 E'''total_minor'',(final_amount+intent.ai_topup_minor)::bigint::text,''currency'',''BDT'',''snapshot'',summary);'
]);

-- 3. Coupon requote (current body from 0148) keeps the AI line and its amount.
SELECT pg_temp.patch_fn('platform_subscription_coupon_quote(uuid,uuid,uuid,bigint,text)','+computed_tax+q.ai_topup_minor',ARRAY[
 'coupon_discount_minor,tax_minor,total_minor,expires_at,tax_policy_id,tax_policy_revision)',
 'coupon_discount_minor,tax_minor,total_minor,expires_at,tax_policy_id,tax_policy_revision,ai_topup_minor)',
 'computed_tax,q.subtotal_minor-q.annual_discount_minor-q.bundle_discount_minor-discount+computed_tax,',
 'computed_tax,q.subtotal_minor-q.annual_discount_minor-q.bundle_discount_minor-discount+computed_tax+q.ai_topup_minor,',
 'coalesce(c.expires_at,i.expires_at)),rule.id,rule.revision) RETURNING * INTO fresh;',
 'coalesce(c.expires_at,i.expires_at)),rule.id,rule.revision,q.ai_topup_minor) RETURNING * INTO fresh;'
]);

-- 4. Payment handoff: the invoice is the plan part; the customer pays the total.
SELECT pg_temp.patch_fn('platform_subscription_payment_bind(uuid,uuid,uuid,uuid,uuid,uuid,text)','i.amount_minor+q.ai_topup_minor<>q.total_minor',ARRAY[
 'OR i.amount_minor<>q.total_minor',
 'OR i.amount_minor+q.ai_topup_minor<>q.total_minor',
 'VALUES(purchase,qid,invoice,a,w,receiver,v.id,token_sha,i.amount_minor)',
 'VALUES(purchase,qid,invoice,a,w,receiver,v.id,token_sha,q.total_minor)'
]);

-- 5. Settlement: plan part activates the plan, AI part credits the wallet, once.
SELECT pg_temp.patch_fn('platform_subscription_payment_settle(uuid,uuid,bigint,timestamptz,uuid)','briofold_ai_topup_credit_proof',ARRAY[
 E' applied boolean;',
 E' applied boolean; topup uuid;',
 E' IF NOT pg13_billing_verified(h.workspace_id,h.invoice_id,payment,amount,verified_time)\n THEN RAISE EXCEPTION ''entitlement not confirmed'' USING ERRCODE=''23514'';END IF;\n SELECT * INTO q FROM platform_subscription_purchase_quotes WHERE id=h.quote_id;',
 E' SELECT * INTO q FROM platform_subscription_purchase_quotes WHERE id=h.quote_id;\n IF q.id IS NULL OR q.ai_topup_minor<0 OR q.ai_topup_minor>=amount\n THEN RAISE EXCEPTION ''payment proof rejected'' USING ERRCODE=''23514'';END IF;\n IF NOT pg13_billing_verified(h.workspace_id,h.invoice_id,payment,amount-q.ai_topup_minor,verified_time)\n THEN RAISE EXCEPTION ''entitlement not confirmed'' USING ERRCODE=''23514'';END IF;',
 E' UPDATE platform_subscription_payment_handoffs\n SET state=''paid'',payment_id=payment,settled_at=now() WHERE intent_id=purchase;',
 E' IF q.ai_topup_minor>0 THEN\n  INSERT INTO briofold_ai_topups(workspace_id,actor_id,idempotency_key,amount_minor,receiving_workspace_id)\n  VALUES(h.workspace_id,h.actor_id,''saas-order:''||purchase::text,q.ai_topup_minor,h.receiving_workspace_id)\n  ON CONFLICT(workspace_id,idempotency_key) DO NOTHING;\n  SELECT id INTO topup FROM briofold_ai_topups\n  WHERE workspace_id=h.workspace_id AND idempotency_key=''saas-order:''||purchase::text;\n  PERFORM briofold_ai_topup_credit_proof(h.workspace_id,topup,payment,q.ai_topup_minor);\n END IF;\n UPDATE platform_subscription_payment_handoffs\n SET state=''paid'',payment_id=payment,settled_at=now() WHERE intent_id=purchase;'
]);
COMMIT;
