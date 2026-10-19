-- 0112 CONTROL. Free-only quota increase is a grant, not a repricing.
-- For a published Free plan, increase just its payment_limit and automatically
-- advance subscribers currently pinned to the immediately previous plan version.
-- Keep paid contracts, dates, usage and all other immutable terms untouched.
BEGIN;
DO $$ BEGIN
 IF to_regclass('public.payment_plan_versions') IS NULL OR
    to_regclass('public.payment_subscription_audit') IS NULL OR
    to_regclass('public.payment_plan_catalog') IS NULL OR
    to_regprocedure('public.platform_billing_system_workspace(uuid)') IS NULL
 THEN RAISE EXCEPTION '0112 requires versioned control plans and system guard'; END IF;
END $$;
CREATE OR REPLACE FUNCTION payment_plan_free_quota_upgrade() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE before_terms jsonb;after_terms jsonb;editor uuid;
BEGIN
 IF TG_OP<>'UPDATE' OR OLD.current_version=NEW.current_version
    OR NEW.status<>'published' THEN RETURN NEW; END IF;
 SELECT terms INTO before_terms FROM payment_plan_versions WHERE id=OLD.current_version AND plan_id=OLD.plan_id;
 SELECT terms,created_by INTO after_terms,editor FROM payment_plan_versions WHERE id=NEW.current_version AND plan_id=NEW.plan_id;
 IF before_terms IS NULL OR after_terms IS NULL OR
   before_terms->>'kind'<>'free' OR after_terms->>'kind'<>'free' OR
   (before_terms - 'payment_limit') IS DISTINCT FROM (after_terms - 'payment_limit') OR
   NOT ((before_terms->>'payment_limit' IS NOT NULL AND after_terms->>'payment_limit' IS NULL)
      OR (before_terms->>'payment_limit' IS NOT NULL AND after_terms->>'payment_limit' IS NOT NULL
       AND (after_terms->>'payment_limit')::bigint > (before_terms->>'payment_limit')::bigint))
 THEN RETURN NEW; END IF;
 INSERT INTO payment_subscription_audit(workspace_id,actor_id,action,before_value,after_value,reason)
 SELECT sub.workspace_id,editor,'subscription.free_limit_increase',
  jsonb_build_object('plan_version_id',OLD.current_version,'payment_limit',before_terms->'payment_limit'),
  jsonb_build_object('plan_version_id',NEW.current_version,'payment_limit',after_terms->'payment_limit'),
  'Free payment quota increased; dates, previous usage, and other terms preserved'
 FROM pg13_subscriptions sub
 WHERE sub.plan_id=NEW.plan_id AND sub.plan_version_id=OLD.current_version
  AND NOT platform_billing_system_workspace(sub.workspace_id);
 UPDATE pg13_subscriptions sub
 SET plan_version_id=NEW.current_version,revision=sub.revision+1
 WHERE sub.plan_id=NEW.plan_id AND sub.plan_version_id=OLD.current_version
  AND NOT platform_billing_system_workspace(sub.workspace_id);
 RETURN NEW;
END $$;
DO $$ BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgrelid='public.payment_plan_catalog'::regclass AND tgname='payment_plan_free_quota_upgrade_trigger' AND NOT tgisinternal) THEN
  CREATE TRIGGER payment_plan_free_quota_upgrade_trigger AFTER UPDATE OF current_version
   ON payment_plan_catalog FOR EACH ROW EXECUTE FUNCTION payment_plan_free_quota_upgrade();
 END IF;
END $$;
REVOKE ALL ON FUNCTION payment_plan_free_quota_upgrade() FROM PUBLIC;
COMMIT;
