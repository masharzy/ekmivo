-- Run after 0133/0134/0135/0145/0146 on an isolated control branch.
-- Caller wraps this DO block in a rollback-only migration test.
DO $tests$
DECLARE a uuid; w uuid:=gen_random_uuid(); iid uuid:=gen_random_uuid(); v uuid:=gen_random_uuid();
 receiver uuid:=gen_random_uuid(); invoice_id_fixture uuid:=gen_random_uuid(); plan text; cid uuid:=gen_random_uuid(); qid uuid:=gen_random_uuid(); k uuid:=gen_random_uuid(); r jsonb; replay jsonb;
BEGIN
 SELECT user_id INTO a FROM workspace_members m JOIN app_users u ON u.id=m.user_id WHERE m.role='owner' AND u.disabled_at IS NULL LIMIT 1;
 IF a IS NULL THEN RAISE EXCEPTION 'test requires isolated owner fixture'; END IF;
 INSERT INTO workspaces(id,name,created_by,service_mode) VALUES(w,'FICTIONAL Phase3 rollback test',a,'both');
 INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(w,a,'owner');
 INSERT INTO platform_subscription_offers(offer_key,product,status,created_by) VALUES('phase3_fixture','ai_credit','draft',a);
 INSERT INTO platform_subscription_offer_versions(id,offer_key,revision,term,amount_minor,terms,created_by)
 VALUES(v,'phase3_fixture',1,'one_time',10000,'{"name":"Fictional fixture","included_ai_credits":1}',a);
 UPDATE platform_subscription_offers SET status='published',current_version_id=v WHERE offer_key='phase3_fixture';
 INSERT INTO platform_subscription_purchase_intents(id,actor_id,workspace_id,offer_version_id) VALUES(iid,a,w,v);
 INSERT INTO platform_subscription_purchase_quotes(id,intent_id,revision,offer_version_id,subtotal_minor,total_minor) VALUES(qid,iid,1,v,10000,10000);
 INSERT INTO platform_subscription_quote_lines(quote_id,line_no,label,offer_version_id,quantity,unit_price_minor,subtotal_minor) VALUES(qid,1,'Fictional',v,1,10000,10000);
 INSERT INTO platform_subscription_coupons(id,code_normalized,status,discount_kind,percent_bps,max_redemptions,max_per_store,created_by,updated_by)
 VALUES(cid,'PHASE3_FIXTURE','active','percent',1000,1,1,a,a);
 r:=platform_subscription_coupon_quote(a,iid,k,1,' phase3_fixture ');
 IF (r->>'total_minor')::bigint<>9000 OR (r->>'coupon_discount_minor')::bigint<>1000 OR jsonb_array_length(r->'lines')<>1
 THEN RAISE EXCEPTION 'percentage/normalization/lines failed'; END IF;
 replay:=platform_subscription_coupon_quote(a,iid,k,1,'PHASE3_FIXTURE');
 IF replay<>r THEN RAISE EXCEPTION 'idempotent replay changed'; END IF;
 BEGIN
 PERFORM platform_subscription_coupon_quote(a,iid,k,1,'OTHER');
 RAISE EXCEPTION 'changed idempotency accepted'; EXCEPTION WHEN unique_violation THEN NULL; END;
 BEGIN
 PERFORM platform_subscription_coupon_quote(gen_random_uuid(),iid,gen_random_uuid(),2,'PHASE3_FIXTURE');
 RAISE EXCEPTION 'foreign actor accepted'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 BEGIN
 PERFORM platform_subscription_coupon_quote(a,iid,gen_random_uuid(),1,'PHASE3_FIXTURE');
 RAISE EXCEPTION 'stale revision accepted'; EXCEPTION WHEN serialization_failure THEN NULL; END;
 r:=platform_subscription_coupon_quote(a,iid,gen_random_uuid(),2,'');
 IF (r->>'total_minor')::bigint<>10000 OR EXISTS(SELECT 1 FROM platform_subscription_coupon_reservations WHERE intent_id=iid AND status='reserved')
 THEN RAISE EXCEPTION 'remove did not release/requote'; END IF;
 UPDATE platform_subscription_coupons SET discount_kind='fixed',percent_bps=NULL,fixed_minor=1500,max_discount_minor=500,revision=revision+1 WHERE id=cid;
 r:=platform_subscription_coupon_quote(a,iid,gen_random_uuid(),3,'PHASE3_FIXTURE');
 IF (r->>'total_minor')::bigint<>9500 THEN RAISE EXCEPTION 'fixed cap failed'; END IF;
 IF (SELECT count(*) FROM platform_subscription_coupon_versions WHERE coupon_id=cid)<>2 THEN RAISE EXCEPTION 'version snapshot missing'; END IF;
 BEGIN
 UPDATE platform_subscription_coupon_versions SET snapshot='{}' WHERE coupon_id=cid;
 RAISE EXCEPTION 'immutable snapshot changed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 UPDATE platform_subscription_coupons SET min_subtotal_minor=10001,revision=revision+1 WHERE id=cid;
 BEGIN
 PERFORM platform_subscription_coupon_quote(a,iid,gen_random_uuid(),4,'PHASE3_FIXTURE');
 RAISE EXCEPTION 'minimum spend ignored'; EXCEPTION WHEN check_violation THEN NULL; END;
 UPDATE platform_subscription_coupons SET min_subtotal_minor=0,starts_at=now()+interval '1 day',expires_at=now()+interval '2 days',status='scheduled',revision=revision+1 WHERE id=cid;
 BEGIN
 PERFORM platform_subscription_coupon_quote(a,iid,gen_random_uuid(),4,'PHASE3_FIXTURE');
 RAISE EXCEPTION 'scheduled coupon applied early'; EXCEPTION WHEN check_violation THEN NULL; END;
 UPDATE platform_subscription_coupons SET starts_at=now()-interval '2 days',expires_at=now()-interval '1 day',status='active',revision=revision+1 WHERE id=cid;
 BEGIN
 PERFORM platform_subscription_coupon_quote(a,iid,gen_random_uuid(),4,'PHASE3_FIXTURE');
 RAISE EXCEPTION 'expired coupon applied'; EXCEPTION WHEN check_violation THEN NULL; END;
 UPDATE platform_subscription_coupons SET expires_at=NULL,starts_at=NULL,max_discount_minor=NULL,fixed_minor=10000,revision=revision+1 WHERE id=cid;
 BEGIN
 PERFORM platform_subscription_coupon_quote(a,iid,gen_random_uuid(),4,'PHASE3_FIXTURE');
 RAISE EXCEPTION 'zero due accepted'; EXCEPTION WHEN check_violation THEN NULL; END;
 IF EXISTS(SELECT 1 FROM platform_subscription_coupon_redemptions WHERE coupon_id=cid) THEN RAISE EXCEPTION 'unpaid coupon redeemed'; END IF;
 IF platform_subscription_coupon_reconcile(iid)->>'status'<>'reserved' THEN RAISE EXCEPTION 'unexpired reservation released'; END IF;
 IF (SELECT count(*) FROM platform_subscription_purchase_audit WHERE intent_id=iid)<>3 THEN RAISE EXCEPTION 'audit lost'; END IF;
 INSERT INTO workspaces(id,name,created_by,service_mode) VALUES(receiver,'FICTIONAL rollback receiver',a,'both');
 UPDATE platform_billing_settings SET workspace_id=receiver WHERE singleton;
 SELECT id INTO plan FROM pg13_plans LIMIT 1;
 IF plan IS NULL THEN RAISE EXCEPTION 'isolated fixture needs plan'; END IF;
 INSERT INTO pg13_platform_invoices(id,workspace_id,plan_id,amount_minor,period_days,grace_days,creation_key)
 VALUES(invoice_id_fixture,w,plan,9500,30,0,'phase3-invoice-'||invoice_id_fixture::text);
 UPDATE platform_subscription_purchase_intents SET confirmed_invoice_id=invoice_id_fixture,status='confirmed' WHERE id=iid;
 IF platform_subscription_coupon_reconcile(iid)->>'status'<>'reserved' THEN RAISE EXCEPTION 'pending invoice reservation released'; END IF;
 UPDATE pg13_platform_invoices SET status='paid',source_payment_id=gen_random_uuid(),paid_at=now() WHERE id=invoice_id_fixture;
 IF (SELECT count(*) FROM platform_subscription_coupon_redemptions WHERE invoice_id=invoice_id_fixture)<>1 THEN RAISE EXCEPTION 'verified invoice hook did not redeem'; END IF;
 PERFORM platform_subscription_coupon_reconcile(iid);
 IF (SELECT count(*) FROM platform_subscription_coupon_redemptions WHERE invoice_id=invoice_id_fixture)<>1 THEN RAISE EXCEPTION 'redemption replay duplicated'; END IF;

END $tests$;
