-- Control only. Existing intent/quote ownership and financial proof remain authoritative.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF current_database()<>'ekmivo' OR to_regclass('public.financial_realm') IS NOT NULL
 OR to_regclass('public.platform_subscription_coupon_versions') IS NULL
 THEN RAISE EXCEPTION '0146 requires control after 0145'; END IF;
END $$;
ALTER TABLE platform_subscription_purchase_quotes ADD COLUMN coupon_revision bigint;
ALTER TABLE platform_subscription_purchase_quotes ADD CONSTRAINT subscription_quote_coupon_version_fk
 FOREIGN KEY(coupon_id,coupon_revision) REFERENCES platform_subscription_coupon_versions(coupon_id,revision);
CREATE TABLE platform_subscription_coupon_commands(
 intent_id uuid NOT NULL REFERENCES platform_subscription_purchase_intents(id),
 actor_id uuid NOT NULL REFERENCES app_users(id), operation_key uuid NOT NULL,
 request jsonb NOT NULL, result jsonb NOT NULL, created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(intent_id,operation_key)
);
ALTER TABLE platform_subscription_coupon_commands ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_subscription_coupon_commands FORCE ROW LEVEL SECURITY;
CREATE POLICY subscription_coupon_commands_owner ON platform_subscription_coupon_commands TO CURRENT_USER USING(true) WITH CHECK(true);
REVOKE ALL ON platform_subscription_coupon_commands FROM PUBLIC,ekmivo_runtime,ekmivo_financial_runtime;

-- Generic ineligibility hides whether an unrelated Store's requested coupon exists.
CREATE FUNCTION platform_subscription_coupon_quote(a uuid,iid uuid,k uuid,expected bigint,code text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE i platform_subscription_purchase_intents; q platform_subscription_purchase_quotes;
 c platform_subscription_coupons; v platform_subscription_offer_versions;
 prior platform_subscription_coupon_commands; fresh platform_subscription_purchase_quotes;
 req jsonb; result jsonb; normalized text; discount bigint:=0; available bigint;
 used bigint; store_used bigint; n bigint; stamp timestamptz:=statement_timestamp();
BEGIN
 IF k IS NULL OR expected IS NULL OR length(coalesce(code,''))>64 THEN
 RAISE EXCEPTION 'INVALID_COUPON_REQUEST' USING ERRCODE='22023'; END IF;
 SELECT * INTO i FROM platform_subscription_purchase_intents WHERE id=iid FOR UPDATE;
 IF i.id IS NULL OR i.actor_id IS DISTINCT FROM a OR i.workspace_id IS NULL THEN
 RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM pg13_actor(i.workspace_id,a,true);
 IF pg13_capability_override(i.workspace_id,a,'workspace:settings') IS FALSE THEN
 RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 normalized:=upper(trim(coalesce(code,'')));
 req:=jsonb_build_object('revision',expected,'code',normalized);
 SELECT * INTO prior FROM platform_subscription_coupon_commands WHERE intent_id=iid AND operation_key=k;
 IF FOUND THEN
 IF prior.actor_id<>a OR prior.request<>req THEN RAISE EXCEPTION 'IDEMPOTENCY_CONFLICT' USING ERRCODE='23505'; END IF;
 RETURN prior.result;
 END IF;
 IF i.revision<>expected OR i.status NOT IN ('selected','quoted') OR i.expires_at<=stamp
 OR i.confirmed_invoice_id IS NOT NULL THEN RAISE EXCEPTION 'QUOTE_CHANGED' USING ERRCODE='40001'; END IF;
 SELECT * INTO q FROM platform_subscription_purchase_quotes WHERE intent_id=iid ORDER BY revision DESC LIMIT 1;
 IF q.id IS NULL OR q.expires_at<=stamp THEN RAISE EXCEPTION 'QUOTE_REQUIRED' USING ERRCODE='40001'; END IF;
 SELECT * INTO v FROM platform_subscription_offer_versions WHERE id=i.offer_version_id;
 IF v.id IS NULL OR q.offer_version_id<>v.id OR q.subtotal_minor>100000000000
 OR q.total_minor>100000000000 OR v.currency<>'BDT' OR NOT EXISTS(
 SELECT 1 FROM platform_subscription_offers o WHERE o.offer_key=v.offer_key AND o.status='published' AND o.current_version_id=v.id)
 THEN RAISE EXCEPTION 'OFFER_CHANGED' USING ERRCODE='40001'; END IF;
 -- Serialize global coupon capacity without lock-order cycles when switching codes.
 IF q.tax_minor<>0 THEN RAISE EXCEPTION 'TAX_REQUOTE_REQUIRED' USING ERRCODE='23514'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('platform-subscription-coupon-capacity',0));
 -- Only unbound checkout reservations expire automatically. A bound invoice with
 -- an unknown/pending outcome retains its slot regardless of the checkout TTL.
 UPDATE platform_subscription_coupon_reservations r SET status='expired'
 WHERE r.status='reserved' AND r.expires_at<=stamp AND EXISTS(
 SELECT 1 FROM platform_subscription_purchase_intents x WHERE x.id=r.intent_id AND x.confirmed_invoice_id IS NULL);
 IF normalized<>'' THEN
 SELECT * INTO c FROM platform_subscription_coupons WHERE code_normalized=normalized FOR UPDATE;
 IF c.id IS NULL OR c.status NOT IN ('active','scheduled')
 OR c.status='scheduled' AND c.starts_at IS NULL
 OR c.starts_at>stamp OR c.expires_at<=stamp
 OR q.subtotal_minor<c.min_subtotal_minor
 OR cardinality(c.eligible_offer_keys)>0 AND NOT(v.offer_key=ANY(c.eligible_offer_keys))
 OR (q.annual_discount_minor>0 OR v.term='yearly') AND NOT c.stack_with_annual
 OR (q.bundle_discount_minor>0 OR (SELECT product FROM platform_subscription_offers WHERE offer_key=v.offer_key)='bundle') AND NOT c.stack_with_bundle
 OR c.first_purchase_only AND EXISTS(SELECT 1 FROM pg13_platform_invoices WHERE workspace_id=i.workspace_id AND status='paid')
 THEN RAISE EXCEPTION 'COUPON_INELIGIBLE' USING ERRCODE='23514'; END IF;
 SELECT count(*) INTO used FROM platform_subscription_coupon_redemptions WHERE coupon_id=c.id;
 SELECT count(*) INTO store_used FROM platform_subscription_coupon_redemptions WHERE coupon_id=c.id AND workspace_id=i.workspace_id;
 SELECT count(*) INTO n FROM platform_subscription_coupon_reservations
 WHERE coupon_id=c.id AND status='reserved' AND intent_id<>iid;
 IF c.max_redemptions IS NOT NULL AND used+n>=c.max_redemptions THEN
 RAISE EXCEPTION 'COUPON_INELIGIBLE' USING ERRCODE='23514'; END IF;
 SELECT count(*) INTO n FROM platform_subscription_coupon_reservations
 WHERE coupon_id=c.id AND status='reserved' AND workspace_id=i.workspace_id AND intent_id<>iid;
 IF c.max_per_store IS NOT NULL AND store_used+n>=c.max_per_store
 OR c.first_purchase_only AND store_used+n>0 THEN
 RAISE EXCEPTION 'COUPON_INELIGIBLE' USING ERRCODE='23514'; END IF;
 available:=q.subtotal_minor-q.annual_discount_minor-q.bundle_discount_minor;
 IF c.discount_kind='percent' THEN discount:=floor(available::numeric*c.percent_bps/10000)::bigint;
 ELSE discount:=c.fixed_minor; END IF;
 discount:=least(discount,available,coalesce(c.max_discount_minor,available));
 END IF;
 -- Zero-due activation requires a separate owner-approved entitlement policy.
 IF q.subtotal_minor-q.annual_discount_minor-q.bundle_discount_minor-discount+q.tax_minor<=0
 THEN RAISE EXCEPTION 'ZERO_DUE_POLICY_REQUIRED' USING ERRCODE='23514'; END IF;
 UPDATE platform_subscription_coupon_reservations SET status='released' WHERE intent_id=iid AND status='reserved';
 INSERT INTO platform_subscription_purchase_quotes(intent_id,revision,offer_version_id,coupon_id,coupon_revision,
 subtotal_minor,annual_discount_minor,bundle_discount_minor,coupon_discount_minor,tax_minor,total_minor,expires_at)
 VALUES(iid,q.revision+1,v.id,c.id,c.revision,q.subtotal_minor,q.annual_discount_minor,q.bundle_discount_minor,discount,
 q.tax_minor,q.subtotal_minor-q.annual_discount_minor-q.bundle_discount_minor-discount+q.tax_minor,
 least(i.expires_at,stamp+interval '15 minutes',coalesce(c.expires_at,i.expires_at))) RETURNING * INTO fresh;
 INSERT INTO platform_subscription_quote_lines(quote_id,line_no,label,offer_version_id,quantity,unit_price_minor,subtotal_minor)
 SELECT fresh.id,line_no,label,offer_version_id,quantity,unit_price_minor,subtotal_minor FROM platform_subscription_quote_lines WHERE quote_id=q.id;
 IF NOT FOUND THEN RAISE EXCEPTION 'QUOTE_LINES_REQUIRED' USING ERRCODE='23514'; END IF;
 IF c.id IS NOT NULL THEN
 INSERT INTO platform_subscription_coupon_reservations(coupon_id,intent_id,quote_id,actor_id,workspace_id,expires_at)
 VALUES(c.id,iid,fresh.id,a,i.workspace_id,fresh.expires_at);
 END IF;
 UPDATE platform_subscription_purchase_intents SET coupon_id=c.id,status='quoted',revision=revision+1,updated_at=stamp WHERE id=iid RETURNING revision INTO n;
 result:=to_jsonb(fresh)||jsonb_build_object('intent_revision',n,'coupon_eligible',true,
 'lines',(SELECT jsonb_agg(to_jsonb(l) ORDER BY line_no) FROM platform_subscription_quote_lines l WHERE quote_id=fresh.id));
 INSERT INTO platform_subscription_coupon_commands VALUES(iid,a,k,req,result,stamp);
 INSERT INTO platform_subscription_purchase_audit(intent_id,actor_id,action,detail)
 VALUES(iid,a,CASE WHEN c.id IS NULL THEN 'coupon.remove' ELSE 'coupon.apply' END,jsonb_build_object('quote_id',fresh.id,'coupon_id',c.id,'coupon_revision',c.revision,'discount_minor',discount));
 RETURN result;
END $$;

-- Internal reconciler only: never trusts a browser payment flag or caller amount.
-- Phase 6 must bind the independently verified existing invoice to its intent.
CREATE FUNCTION platform_subscription_coupon_reconcile(iid uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE i platform_subscription_purchase_intents; r platform_subscription_coupon_reservations;
 inv pg13_platform_invoices; q platform_subscription_purchase_quotes;
BEGIN
 SELECT * INTO i FROM platform_subscription_purchase_intents WHERE id=iid FOR UPDATE;
 IF i.id IS NULL THEN RAISE EXCEPTION 'INTENT_UNAVAILABLE' USING ERRCODE='P0002'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('platform-subscription-coupon-capacity',0));
 SELECT * INTO r FROM platform_subscription_coupon_reservations WHERE intent_id=iid AND status IN ('reserved','redeemed') ORDER BY reserved_at DESC LIMIT 1 FOR UPDATE;
 IF r.id IS NULL THEN RETURN jsonb_build_object('status','none'); END IF;
 IF i.confirmed_invoice_id IS NULL THEN
 IF i.expires_at<=statement_timestamp() OR i.status IN ('cancelled','expired') THEN
 UPDATE platform_subscription_coupon_reservations SET status='released' WHERE id=r.id AND status='reserved';
 RETURN jsonb_build_object('status','released'); END IF;
 RETURN jsonb_build_object('status','reserved'); END IF;
 SELECT * INTO inv FROM pg13_platform_invoices WHERE id=i.confirmed_invoice_id AND workspace_id=i.workspace_id;
 IF inv.id IS NULL THEN RAISE EXCEPTION 'INVOICE_SCOPE_MISMATCH' USING ERRCODE='23514'; END IF;
 SELECT * INTO q FROM platform_subscription_purchase_quotes WHERE id=r.quote_id;
 IF inv.status='paid' THEN
 IF inv.source_payment_id IS NULL OR inv.paid_at IS NULL OR inv.amount_minor<>q.total_minor
 OR q.coupon_id<>r.coupon_id OR r.status NOT IN ('reserved','redeemed') THEN
 RAISE EXCEPTION 'VERIFIED_PAYMENT_REQUIRED' USING ERRCODE='23514'; END IF;
 INSERT INTO platform_subscription_coupon_redemptions(coupon_id,reservation_id,invoice_id,actor_id,workspace_id,discount_minor)
 VALUES(r.coupon_id,r.id,inv.id,r.actor_id,r.workspace_id,q.coupon_discount_minor) ON CONFLICT(reservation_id) DO NOTHING;
 IF NOT EXISTS(SELECT 1 FROM platform_subscription_coupon_redemptions WHERE reservation_id=r.id AND invoice_id=inv.id AND discount_minor=q.coupon_discount_minor)
 THEN RAISE EXCEPTION 'REDEMPTION_CONFLICT' USING ERRCODE='23514'; END IF;
 UPDATE platform_subscription_coupon_reservations SET status='redeemed' WHERE id=r.id;
 IF r.status<>'redeemed' THEN INSERT INTO platform_subscription_purchase_audit(intent_id,action,detail)
 VALUES(iid,'coupon.redeem',jsonb_build_object('invoice_id',inv.id,'reservation_id',r.id)); END IF;
 RETURN jsonb_build_object('status','redeemed');
 ELSIF inv.status='cancelled' AND inv.source_payment_id IS NULL THEN
 UPDATE platform_subscription_coupon_reservations SET status='released' WHERE id=r.id AND status='reserved';
 RETURN jsonb_build_object('status','released'); END IF;
 RETURN jsonb_build_object('status','reserved','reconciliation_required',true);
END $$;
REVOKE ALL ON FUNCTION platform_subscription_coupon_quote(uuid,uuid,uuid,bigint,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION platform_subscription_coupon_reconcile(uuid) FROM PUBLIC;
-- Deliberately do not grant reconcile to web/session runtime. Trusted payment
-- worker integration and least-privilege role grants must be tested together.
GRANT EXECUTE ON FUNCTION platform_subscription_coupon_quote(uuid,uuid,uuid,bigint,text) TO ekmivo_runtime;
CREATE FUNCTION subscription_coupon_invoice_changed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE target uuid;
BEGIN
 IF NEW.status NOT IN ('paid','cancelled') THEN RETURN NEW; END IF;
 SELECT id INTO target FROM platform_subscription_purchase_intents WHERE confirmed_invoice_id=NEW.id;
 IF target IS NOT NULL THEN PERFORM platform_subscription_coupon_reconcile(target); END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER subscription_coupon_invoice_settlement AFTER UPDATE OF status ON pg13_platform_invoices
 FOR EACH ROW EXECUTE FUNCTION subscription_coupon_invoice_changed();
REVOKE ALL ON FUNCTION subscription_coupon_invoice_changed() FROM PUBLIC;

CREATE FUNCTION platform_subscription_coupon_history(a uuid,cid uuid,off integer DEFAULT 0)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM platform_administrators p JOIN app_users u ON u.id=p.user_id WHERE p.user_id=a AND p.role='super_admin' AND u.disabled_at IS NULL)
 THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF off IS NULL OR off NOT BETWEEN 0 AND 100000 THEN RAISE EXCEPTION 'INVALID_PAGE' USING ERRCODE='22023'; END IF;
 IF NOT EXISTS(SELECT 1 FROM platform_subscription_coupons WHERE id=cid) THEN RAISE EXCEPTION 'NOT_FOUND' USING ERRCODE='P0002'; END IF;
 RETURN jsonb_build_object('versions',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY revision DESC) FROM
 (SELECT revision,snapshot,recorded_at FROM platform_subscription_coupon_versions WHERE coupon_id=cid ORDER BY revision DESC LIMIT 26 OFFSET off) x),'[]'::jsonb),
 'redemptions',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY redeemed_at DESC,id DESC) FROM
 (SELECT id,invoice_id,workspace_id,discount_minor,redeemed_at FROM platform_subscription_coupon_redemptions WHERE coupon_id=cid ORDER BY redeemed_at DESC,id DESC LIMIT 26 OFFSET off) x),'[]'::jsonb),
 'offset',off);
END $$;
REVOKE ALL ON FUNCTION platform_subscription_coupon_history(uuid,uuid,integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_subscription_coupon_history(uuid,uuid,integer) TO ekmivo_runtime;
COMMIT;
