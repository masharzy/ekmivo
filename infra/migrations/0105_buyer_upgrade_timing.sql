-- Control database. Verified prepaid upgrades activate at the buyer's chosen boundary.
BEGIN;
ALTER TABLE dashboard_billing_quotes ADD COLUMN activation_timing text NOT NULL DEFAULT 'now' CHECK(activation_timing IN ('now','period_end')),ADD COLUMN entitlement_start timestamptz;
ALTER TABLE dashboard_billing_quotes DROP CONSTRAINT dashboard_billing_quotes_operation_check;
ALTER TABLE dashboard_billing_quotes ADD CONSTRAINT dashboard_billing_quotes_operation_check CHECK(operation IN ('renew','upgrade','scheduled_upgrade'));
ALTER TABLE pg13_platform_invoices ADD COLUMN entitlement_start timestamptz;
ALTER TABLE pg13_subscriptions ADD COLUMN next_paid_invoice_id uuid REFERENCES pg13_platform_invoices(id);
CREATE FUNCTION dashboard_billing_quote(w uuid,a uuid,pid text,n integer,timing text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE s pg13_subscriptions;v payment_plan_versions;old_terms jsonb;q dashboard_billing_quotes;price bigint;until_at timestamptz;op text:='renew';BEGIN
 PERFORM pg13_actor(w,a,true);
 IF timing IS NULL OR timing NOT IN ('now','period_end') OR platform_billing_system_workspace(w) THEN RAISE EXCEPTION 'invalid activation choice' USING ERRCODE='22023';END IF;
 IF pg13_capability_override(w,a,'workspace:settings') IS FALSE THEN RAISE EXCEPTION 'access denied' USING ERRCODE='42501';END IF;
 IF n NOT IN (1,3,6) THEN RAISE EXCEPTION 'invalid renewal duration' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('platform-billing:'||w::text,0));
 PERFORM payment_plan_effective(w);
 SELECT * INTO s FROM pg13_subscriptions WHERE workspace_id=w;
 IF s.next_paid_invoice_id IS NOT NULL THEN RAISE EXCEPTION 'a prepaid change is already scheduled' USING ERRCODE='40001';END IF;
 SELECT pv.* INTO v FROM payment_plan_catalog c JOIN payment_plan_versions pv ON pv.id=CASE WHEN EXISTS(SELECT 1 FROM payment_plan_versions sv WHERE sv.id=s.next_version_id AND sv.plan_id=pid) THEN s.next_version_id ELSE c.current_version END WHERE c.plan_id=pid AND c.status='published' AND c.visibility='public' AND pv.terms->>'kind'='paid';
 IF v.id IS NULL THEN RAISE EXCEPTION 'public paid plan unavailable' USING ERRCODE='P0002';END IF;
 SELECT terms INTO old_terms FROM payment_plan_versions WHERE id=s.plan_version_id;
 price:=(v.terms->>'amount_minor')::bigint*n;
 until_at:=CASE WHEN s.plan_id=pid AND isfinite(s.paid_until) THEN greatest(now(),s.paid_until) ELSE now() END+make_interval(days=>(v.terms->>'period_days')::integer*n);
 IF timing='period_end' THEN
  IF s.workspace_id IS NULL OR s.plan_id=pid OR NOT isfinite(s.paid_until) OR s.paid_until<=now() THEN RAISE EXCEPTION 'a current finite plan is required' USING ERRCODE='22023';END IF;
  op:='scheduled_upgrade';until_at:=s.paid_until+make_interval(days=>(v.terms->>'period_days')::integer*n);
 ELSIF s.plan_id IS DISTINCT FROM pid AND isfinite(s.paid_until) AND s.paid_until>now() AND old_terms->>'kind'='paid' THEN
  IF (v.terms->>'amount_minor')::numeric/(v.terms->>'period_days')::integer <= (old_terms->>'amount_minor')::numeric/(old_terms->>'period_days')::integer THEN RAISE EXCEPTION 'downgrade starts at period end' USING ERRCODE='23514';END IF;
  op:='upgrade';n:=1;until_at:=s.paid_until;
  price:=greatest(1,ceil(((v.terms->>'amount_minor')::numeric/(v.terms->>'period_days')::integer-(old_terms->>'amount_minor')::numeric/(old_terms->>'period_days')::integer)*extract(epoch FROM s.paid_until-now())/86400)::bigint);
 END IF;
 INSERT INTO dashboard_billing_quotes(workspace_id,actor_id,plan_version_id,cycle_count,operation,amount_minor,entitlement_end,subscription_revision,activation_timing,entitlement_start) VALUES(w,a,v.id,n,op,price,until_at,coalesce(s.revision,0),timing,CASE WHEN timing='period_end' THEN s.paid_until ELSE now() END) RETURNING * INTO q;
 RETURN to_jsonb(q)||jsonb_build_object('plan_id',pid,'terms',v.terms);
END $$;
CREATE OR REPLACE FUNCTION dashboard_billing_quote(w uuid,a uuid,pid text,n integer) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT dashboard_billing_quote(w,a,pid,n,'now') $$;
REVOKE ALL ON FUNCTION dashboard_billing_quote(uuid,uuid,text,integer,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION dashboard_billing_quote(uuid,uuid,text,integer,text) TO ekmivo_financial_runtime;
CREATE OR REPLACE FUNCTION dashboard_billing_issue(w uuid,a uuid,qid uuid,k text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE q dashboard_billing_quotes;v payment_plan_versions;i pg13_platform_invoices;rev bigint;BEGIN
 PERFORM pg13_actor(w,a,true);
 IF pg13_capability_override(w,a,'workspace:settings') IS FALSE THEN RAISE EXCEPTION 'access denied' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('platform-billing:'||w::text,0));
 SELECT * INTO q FROM dashboard_billing_quotes WHERE id=qid AND workspace_id=w AND actor_id=a;
 IF q.id IS NULL OR length(k) NOT BETWEEN 16 AND 128 THEN RAISE EXCEPTION 'quote required' USING ERRCODE='22023';END IF;
 SELECT * INTO v FROM payment_plan_versions WHERE id=q.plan_version_id;
 SELECT * INTO i FROM pg13_platform_invoices WHERE workspace_id=w AND creation_key=k;
 IF i.id IS NOT NULL THEN IF i.plan_version_id<>q.plan_version_id OR i.amount_minor<>q.amount_minor OR i.billing_operation<>q.operation OR i.cycle_count<>q.cycle_count OR i.entitlement_start IS DISTINCT FROM q.entitlement_start THEN RAISE EXCEPTION 'billing key conflict' USING ERRCODE='23505';END IF;RETURN to_jsonb(i);END IF;
 SELECT revision INTO rev FROM pg13_subscriptions WHERE workspace_id=w;
 IF EXISTS(SELECT 1 FROM pg13_subscriptions WHERE workspace_id=w AND next_paid_invoice_id IS NOT NULL) OR (q.activation_timing='period_end' AND q.entitlement_start<=now()) OR (q.operation='upgrade' AND q.entitlement_end<=now()) OR q.expires_at<=now() OR q.subscription_revision<>coalesce(rev,0) THEN RAISE EXCEPTION 'quote expired; review again' USING ERRCODE='40001';END IF;
 INSERT INTO pg13_platform_invoices(workspace_id,plan_id,plan_version_id,amount_minor,period_days,grace_days,creation_key,cycle_count,billing_operation,entitlement_end,subscription_revision,entitlement_start)
 VALUES(w,v.plan_id,v.id,q.amount_minor,(v.terms->>'period_days')::integer*q.cycle_count,(v.terms->>'grace_days')::integer,k,q.cycle_count,q.operation,q.entitlement_end,q.subscription_revision,q.entitlement_start) RETURNING * INTO i;
 RETURN to_jsonb(i);
END $$;
CREATE OR REPLACE FUNCTION pg13_billing_verified(w uuid,invoice uuid,payment uuid,amount bigint,verified_time timestamptz) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE i pg13_platform_invoices;s pg13_subscriptions;until_time timestamptz;BEGIN
 PERFORM pg_advisory_xact_lock(hashtextextended('platform-billing:'||w::text,0));SELECT * INTO i FROM pg13_platform_invoices WHERE workspace_id=w AND id=invoice FOR UPDATE;
 IF i.id IS NULL OR i.amount_minor<>amount OR verified_time<i.created_at OR verified_time>now() THEN RAISE EXCEPTION 'billing proof mismatch' USING ERRCODE='23514';END IF;
 IF i.status='paid' THEN RETURN i.source_payment_id=payment;END IF;
 SELECT * INTO s FROM pg13_subscriptions WHERE workspace_id=w FOR UPDATE;
 IF s.next_paid_invoice_id IS NOT NULL THEN RAISE EXCEPTION 'a prepaid change is already scheduled; review payment' USING ERRCODE='40001';END IF;
 IF i.billing_operation='scheduled_upgrade' THEN
  IF s.workspace_id IS NULL OR s.revision<>i.subscription_revision OR s.paid_until IS DISTINCT FROM i.entitlement_start OR verified_time>i.entitlement_start OR i.entitlement_end<=i.entitlement_start THEN RAISE EXCEPTION 'subscription changed; review verified payment' USING ERRCODE='40001';END IF;
  UPDATE pg13_subscriptions SET next_version_id=i.plan_version_id,next_paid_invoice_id=i.id,revision=revision+1 WHERE workspace_id=w;
  UPDATE pg13_platform_invoices SET status='paid',source_payment_id=payment,paid_at=verified_time WHERE id=i.id;
  INSERT INTO payment_subscription_audit(workspace_id,action,after_value,reason) VALUES(w,'subscription.prepaid_scheduled',to_jsonb(i),'Buyer paid for activation at the current paid period end');
  PERFORM payment_plan_effective(w);
  RETURN true;
 END IF;
 IF i.billing_operation='upgrade' THEN
  IF s.revision<>i.subscription_revision OR i.entitlement_end<=now() THEN RAISE EXCEPTION 'subscription changed; review verified payment' USING ERRCODE='40001';END IF;
  until_time:=i.entitlement_end;
 ELSE
  until_time:=CASE WHEN (s.plan_version_id=i.plan_version_id OR (i.billing_operation='renew' AND s.plan_id=i.plan_id)) AND isfinite(s.paid_until) THEN greatest(now(),s.paid_until) ELSE now() END+make_interval(days=>i.period_days);
 END IF;
 INSERT INTO pg13_subscriptions(workspace_id,plan_id,plan_version_id,started_at,paid_until,grace_until) VALUES(w,i.plan_id,i.plan_version_id,now(),until_time,until_time+make_interval(days=>i.grace_days))
 ON CONFLICT(workspace_id) DO UPDATE SET plan_id=i.plan_id,plan_version_id=i.plan_version_id,paid_until=until_time,grace_until=until_time+make_interval(days=>i.grace_days),next_version_id=NULL,next_paid_invoice_id=NULL,revision=pg13_subscriptions.revision+1;
 UPDATE pg13_platform_invoices SET status='paid',source_payment_id=payment,paid_at=verified_time WHERE id=i.id;
 INSERT INTO payment_subscription_audit(workspace_id,action,after_value,reason) VALUES(w,'subscription.verified_payment',to_jsonb(i),'Verified platform payment');RETURN true;
END $$;
CREATE FUNCTION payment_plan_prepaid_guard() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$ BEGIN
 IF OLD.next_paid_invoice_id IS NOT NULL AND NEW.next_paid_invoice_id IS NOT DISTINCT FROM OLD.next_paid_invoice_id AND ROW(NEW.plan_version_id,NEW.paid_until,NEW.grace_until,NEW.next_version_id) IS DISTINCT FROM ROW(OLD.plan_version_id,OLD.paid_until,OLD.grace_until,OLD.next_version_id) THEN RAISE EXCEPTION 'paid scheduled change must be preserved' USING ERRCODE='40001';END IF;
 RETURN NEW;END $$;
REVOKE ALL ON FUNCTION payment_plan_prepaid_guard() FROM PUBLIC;
CREATE TRIGGER payment_plan_prepaid_guard BEFORE UPDATE ON pg13_subscriptions FOR EACH ROW EXECUTE FUNCTION payment_plan_prepaid_guard();
DO $patch$ DECLARE def text;marker text:=' IF s.paid_until<=now() AND s.next_version_id IS NOT NULL';activation text;BEGIN
 def:=pg_get_functiondef('payment_plan_effective(uuid)'::regprocedure);
 IF strpos(def,marker)=0 THEN RAISE EXCEPTION 'effective plan activation entry point changed';END IF;
 activation:=$body$
 IF s.paid_until<=now() AND s.next_paid_invoice_id IS NOT NULL THEN
  SELECT pv.* INTO v FROM payment_plan_versions pv JOIN pg13_platform_invoices inv ON inv.plan_version_id=pv.id WHERE inv.id=s.next_paid_invoice_id AND inv.workspace_id=w AND inv.status='paid' AND inv.plan_version_id=s.next_version_id AND inv.entitlement_start=s.paid_until;
  IF v.id IS NULL THEN RAISE EXCEPTION 'paid scheduled change needs review' USING ERRCODE='40001';END IF;
  SELECT inv.entitlement_end INTO end_at FROM pg13_platform_invoices inv WHERE inv.id=s.next_paid_invoice_id;
  UPDATE pg13_subscriptions SET plan_id=v.plan_id,plan_version_id=v.id,started_at=s.paid_until,paid_until=end_at,grace_until=end_at+make_interval(days=>(v.terms->>'grace_days')::integer),next_version_id=NULL,next_paid_invoice_id=NULL,revision=revision+1 WHERE workspace_id=w;
  INSERT INTO payment_subscription_audit(workspace_id,action,before_value,after_value,reason) VALUES(w,'subscription.prepaid_activated',to_jsonb(s),jsonb_build_object('version_id',v.id,'paid_until',end_at),'Previously paid plan reached its chosen activation date');
  SELECT * INTO s FROM pg13_subscriptions WHERE workspace_id=w;
 END IF;
$body$;
 EXECUTE replace(def,marker,activation||marker);
 def:=pg_get_functiondef('pg13_billing_read(uuid,uuid)'::regprocedure);
 marker:='''starts_at'',s.paid_until';
 IF strpos(def,marker)=0 THEN RAISE EXCEPTION 'billing read schedule entry point changed';END IF;
 EXECUTE replace(def,marker,marker||',''prepaid'',s.next_paid_invoice_id IS NOT NULL,''ends_at'',(SELECT inv.entitlement_end FROM pg13_platform_invoices inv WHERE inv.id=s.next_paid_invoice_id)');
END $patch$;
COMMIT;
