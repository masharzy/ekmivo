-- Isolated Neon control branch only. All fixture changes roll back.
DO $test$
DECLARE w uuid:='0216de25-7da3-464b-ae13-c374647bd522';without_plan uuid;before_plan jsonb;underlying jsonb;p jsonb;k text;
BEGIN
 BEGIN
 UPDATE platform_billing_settings SET workspace_id=NULL WHERE singleton;
 before_plan:=payment_plan_effective(w);
 SELECT to_jsonb(s) INTO underlying FROM pg13_subscriptions s WHERE workspace_id=w;
 IF before_plan->'terms'->'features'->>'payment_links' IS DISTINCT FROM 'false' THEN RAISE EXCEPTION 'finite fixture required';END IF;
 UPDATE platform_billing_settings SET workspace_id=w WHERE singleton;
 p:=payment_plan_effective(w);
 IF p->>'active' IS DISTINCT FROM 'true' OR p->>'platform_billing' IS DISTINCT FROM 'true' OR p->>'access_until'<>'infinity' THEN RAISE EXCEPTION 'system inactive';END IF;
 FOREACH k IN ARRAY ARRAY['invoices','payment_links','reports','exports'] LOOP
 IF p->'terms'->'features'->>k IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'system feature disabled: %',k;END IF;END LOOP;
 FOREACH k IN ARRAY ARRAY['payment_limit','active_checkout_limit','create_per_minute'] LOOP
 IF p->'terms'->k IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'system quota finite: %',k;END IF;END LOOP;
 FOREACH k IN ARRAY ARRAY['api_keys','team_members','devices','payment_methods'] LOOP
 IF p->'terms'->'limits'->k IS DISTINCT FROM 'null'::jsonb THEN RAISE EXCEPTION 'system resource finite: %',k;END IF;END LOOP;
 IF (SELECT to_jsonb(s) FROM pg13_subscriptions s WHERE workspace_id=w) IS DISTINCT FROM underlying THEN RAISE EXCEPTION 'subscription overwritten';END IF;
 UPDATE pg13_subscriptions SET paid_until=now()-interval '1 day',grace_until=now()-interval '1 day' WHERE workspace_id=w;
 IF payment_plan_effective(w)->>'active' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'expiry blocked system';END IF;
 UPDATE platform_billing_settings SET workspace_id=NULL WHERE singleton;
 p:=payment_plan_effective(w);
 IF p->>'active' IS DISTINCT FROM 'false' OR p->'terms'->'features'->>'payment_links' IS DISTINCT FROM 'false' OR p->'terms'->>'payment_limit' IS DISTINCT FROM before_plan->'terms'->>'payment_limit' THEN RAISE EXCEPTION 'designation removal did not restore assigned limits';END IF;
 SELECT id INTO without_plan FROM workspaces x WHERE NOT EXISTS(SELECT 1 FROM pg13_subscriptions s WHERE s.workspace_id=x.id) LIMIT 1;
 IF without_plan IS NULL THEN RAISE EXCEPTION 'unsubscribed fixture required';END IF;
 UPDATE platform_billing_settings SET workspace_id=without_plan WHERE singleton;
 IF payment_plan_effective(without_plan)->>'active' IS DISTINCT FROM 'true' THEN RAISE EXCEPTION 'system requires a subscription';END IF;
 IF payment_plan_effective(w)->>'platform_billing'='true' THEN RAISE EXCEPTION 'previous system retained exemption';END IF;
 RAISE EXCEPTION 'rollback fixture' USING ERRCODE='P6999';
 EXCEPTION WHEN SQLSTATE 'P6999' THEN NULL;END;
END $test$;
