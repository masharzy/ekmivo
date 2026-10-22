-- After 0148 on the existing isolated control branch; rollback only.
DO $tests$
DECLARE a uuid; manager uuid; w uuid:=gen_random_uuid(); iid uuid:=gen_random_uuid();
 v uuid:=gen_random_uuid(); cid uuid:=gen_random_uuid(); qid uuid:=gen_random_uuid();
 r jsonb; latest_revision bigint;
BEGIN
 SELECT user_id INTO a FROM workspace_members m JOIN app_users u ON u.id=m.user_id
 WHERE m.role='owner' AND u.disabled_at IS NULL LIMIT 1;
 SELECT p.user_id INTO manager FROM platform_administrators p JOIN app_users u ON u.id=p.user_id
 WHERE p.role='super_admin' AND u.disabled_at IS NULL LIMIT 1;
 IF a IS NULL OR manager IS NULL THEN RAISE EXCEPTION 'test requires isolated owners and super admin'; END IF;
 INSERT INTO workspaces(id,name,created_by,service_mode) VALUES(w,'FICTIONAL tax rollback',a,'both');
 INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(w,a,'owner');
 INSERT INTO platform_subscription_offers(offer_key,product,status,created_by)
 VALUES('phase3_tax_fixture','ai_credit','draft',a);
 INSERT INTO platform_subscription_offer_versions(id,offer_key,revision,term,amount_minor,terms,created_by)
 VALUES(v,'phase3_tax_fixture',1,'one_time',10000,'{"included_ai_credits":1}',a);
 UPDATE platform_subscription_offers SET status='published',current_version_id=v WHERE offer_key='phase3_tax_fixture';
 INSERT INTO platform_subscription_purchase_intents(id,actor_id,workspace_id,offer_version_id) VALUES(iid,a,w,v);
 INSERT INTO platform_subscription_purchase_quotes(id,intent_id,revision,offer_version_id,subtotal_minor,tax_minor,total_minor)
 VALUES(qid,iid,1,v,10000,1000,11000);
 INSERT INTO platform_subscription_quote_lines(quote_id,line_no,label,offer_version_id,quantity,unit_price_minor,subtotal_minor)
 VALUES(qid,1,'FICTIONAL taxable credits',v,1,10000,10000);
 INSERT INTO platform_subscription_coupons(id,code_normalized,status,discount_kind,fixed_minor,created_by,updated_by)
 VALUES(cid,'PHASE3_TAX_TEST','active','fixed',1000,a,a);
 BEGIN
  PERFORM platform_subscription_coupon_quote(a,iid,gen_random_uuid(),1,'PHASE3_TAX_TEST');
  RAISE EXCEPTION 'missing tax approval accepted'; EXCEPTION WHEN check_violation THEN
   IF SQLERRM<>'TAX_POLICY_REQUIRED' THEN RAISE; END IF;
 END;
 r:=platform_subscription_tax_admin(manager,'save',jsonb_build_object('product','ai_credit',
   'term','one_time','rate_bps',1000,'revision',0,'reason','Fictional rate for isolated tax tests'));
 IF (r->>'rate_bps')::integer<>1000 THEN RAISE EXCEPTION 'tax rule save failed'; END IF;
 r:=platform_subscription_coupon_quote(a,iid,gen_random_uuid(),1,'PHASE3_TAX_TEST');
 IF (r->>'tax_minor')::bigint<>900 OR (r->>'total_minor')::bigint<>9900
 OR (r->>'tax_policy_revision')::bigint<>1 THEN RAISE EXCEPTION 'discounted tax amount incorrect'; END IF;
 r:=platform_subscription_coupon_quote(a,iid,gen_random_uuid(),2,'');
 IF (r->>'tax_minor')::bigint<>1000 OR (r->>'total_minor')::bigint<>11000
 THEN RAISE EXCEPTION 'coupon remove tax re-quote incorrect'; END IF;
 SELECT revision INTO latest_revision FROM platform_subscription_tax_policies
 WHERE product='ai_credit' AND term='one_time';
 r:=platform_subscription_tax_admin(manager,'save',jsonb_build_object('product','ai_credit',
   'term','one_time','rate_bps',500,'revision',latest_revision,
   'reason','Fictional revised approval for isolated tests'));
 IF (r->>'revision')::bigint<>2 THEN RAISE EXCEPTION 'tax rule version did not advance'; END IF;
 BEGIN
  PERFORM platform_subscription_coupon_quote(a,iid,gen_random_uuid(),3,'PHASE3_TAX_TEST');
  RAISE EXCEPTION 'stale tax policy accepted'; EXCEPTION WHEN check_violation THEN
   IF SQLERRM<>'TAX_REQUOTE_REQUIRED' THEN RAISE; END IF;
 END;
 IF (SELECT count(*) FROM platform_subscription_tax_policy_versions WHERE policy_id=(r->>'id')::uuid)<>2
 THEN RAISE EXCEPTION 'tax history missing'; END IF;
END $tests$;
