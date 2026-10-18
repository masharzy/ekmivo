-- Both financial realms. Add/re-enable/reconnect all enforce the effective quota.
BEGIN;
CREATE OR REPLACE FUNCTION payment_plan_financial_limit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p jsonb;k text;lim bigint;total bigint;BEGIN
 IF NEW.environment='sandbox' THEN RETURN NEW;END IF;
 IF TG_TABLE_NAME='pg06_devices' THEN IF NEW.physical_phone_id IS NOT NULL THEN RETURN NEW;END IF;END IF;
 p:=nullif(current_setting('ekmivo.payment_plan',true),'')::jsonb;
 IF p IS NULL OR p->>'fetched_at' IS NULL OR p->>'workspace_id' IS DISTINCT FROM NEW.workspace_id::text OR (p->>'fetched_at')::timestamptz<clock_timestamp()-interval '30 seconds' OR (p->>'fetched_at')::timestamptz>clock_timestamp()+interval '1 minute' THEN RAISE EXCEPTION 'PLAN_SNAPSHOT_REQUIRED' USING ERRCODE='P6801';END IF;
 IF p->>'platform_billing'='true' THEN RETURN NEW;END IF;
 IF p->>'access_until' IS NULL OR coalesce((p->>'active')::boolean,false) IS NOT TRUE OR (p->>'access_until')::timestamptz<=now() THEN RAISE EXCEPTION 'SUBSCRIPTION_REQUIRED' USING ERRCODE='P6802';END IF;
 k:=CASE WHEN TG_TABLE_NAME='pg06_account_configuration' THEN 'payment_methods' ELSE 'devices' END;
 lim:=(p->'terms'->'limits'->>k)::bigint;IF lim IS NULL THEN RETURN NEW;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('plan-resource:'||NEW.workspace_id::text||k,0));
 IF k='payment_methods' THEN SELECT count(*) INTO total FROM pg06_account_configuration WHERE workspace_id=NEW.workspace_id AND environment=NEW.environment AND disabled_at IS NULL;
 ELSE SELECT (SELECT count(*) FROM pg06_phones WHERE workspace_id=NEW.workspace_id AND environment=NEW.environment AND revoked_at IS NULL AND (claimed_at IS NOT NULL OR pair_expires_at>now()))+(SELECT count(*) FROM pg06_devices WHERE workspace_id=NEW.workspace_id AND environment=NEW.environment AND revoked_at IS NULL AND physical_phone_id IS NULL AND (claimed_at IS NOT NULL OR pair_expires_at>now())) INTO total;END IF;
 IF total>=lim THEN RAISE EXCEPTION 'PLAN_RESOURCE_LIMIT' USING ERRCODE='P6806';END IF;RETURN NEW;
END $$;
CREATE TRIGGER payment_plan_phone_reconnect_limit BEFORE UPDATE OF revoked_at,pair_expires_at ON pg06_phones FOR EACH ROW WHEN (NEW.revoked_at IS NULL AND (NEW.claimed_at IS NOT NULL OR NEW.pair_expires_at>now()) AND (OLD.revoked_at IS NOT NULL OR (OLD.claimed_at IS NULL AND (OLD.pair_expires_at IS NULL OR OLD.pair_expires_at<=now())))) EXECUTE FUNCTION payment_plan_financial_limit();
COMMIT;
