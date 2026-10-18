-- Control. Owner requested detaching the selected system workspace from all plans.
BEGIN;
DO $patch$
DECLARE def text;marker text:='IF op IN (''expire'',''clear_schedule'') THEN';w uuid;previous jsonb;extras jsonb;
BEGIN
 def:=pg_get_functiondef('payment_plan_admin(uuid,text,jsonb)'::regprocedure);
 IF strpos(def,'system_workspace_subscription_guard')>0 OR strpos(def,marker)=0 THEN RAISE EXCEPTION 'admin plan guard entry point changed';END IF;
 def:=replace(def,marker,'-- system_workspace_subscription_guard
 IF platform_billing_system_workspace(w) THEN RAISE EXCEPTION ''System workspace has unlimited access; a subscription is not applicable.'' USING ERRCODE=''22023'';END IF;
 '||marker);
 EXECUTE def;
 w:=platform_billing_workspace();
 IF w IS NOT NULL THEN
  PERFORM pg_advisory_xact_lock(hashtextextended('platform-billing:'||w::text,0));
  SELECT to_jsonb(s) INTO previous FROM pg13_subscriptions s WHERE workspace_id=w FOR UPDATE;
  SELECT to_jsonb(o) INTO extras FROM payment_subscription_overrides o WHERE workspace_id=w FOR UPDATE;
  IF previous IS NOT NULL OR extras IS NOT NULL THEN
   INSERT INTO payment_subscription_audit(workspace_id,action,before_value,after_value,reason)
   VALUES(w,'subscription.system_detached',jsonb_build_object('subscription',previous,'override',extras),jsonb_build_object('platform_billing',true,'unlimited',true),'Owner requested removing system workspace subscription assignments; unlimited system access remains active.');
   DELETE FROM payment_subscription_overrides WHERE workspace_id=w;
   DELETE FROM pg13_subscriptions WHERE workspace_id=w;
  END IF;
 END IF;
END $patch$;
COMMIT;
