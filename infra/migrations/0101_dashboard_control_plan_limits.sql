-- Control realm. Reserve team seats at invitation time; preserve bootstrap and maintenance.
BEGIN;
CREATE FUNCTION payment_plan_member_resource_usage(a uuid,w uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM pg13_actor(w,a,false);
 RETURN jsonb_build_object('payments_enabled',EXISTS(SELECT 1 FROM workspace_product_access WHERE workspace_id=w AND product='payments' AND enabled),'api_keys',(SELECT count(*) FROM merchant_api_keys WHERE workspace_id=w AND environment='live' AND revoked_at IS NULL AND expires_at>now()),'team_members',(SELECT count(*) FROM workspace_members WHERE workspace_id=w),'pending_invites',(SELECT count(*) FROM pg13_invites WHERE workspace_id=w AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now()));
END $$;
CREATE OR REPLACE FUNCTION payment_plan_control_limit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p jsonb;lim bigint;total bigint;k text;accepting text;rotating text;BEGIN
 IF TG_TABLE_NAME='merchant_api_keys' THEN IF NEW.environment='sandbox' THEN RETURN NEW;END IF;END IF;
 IF NOT EXISTS(SELECT 1 FROM workspace_product_access WHERE workspace_id=NEW.workspace_id AND product='payments' AND enabled) OR platform_billing_system_workspace(NEW.workspace_id) THEN RETURN NEW;END IF;
 k:=CASE WHEN TG_TABLE_NAME='merchant_api_keys' THEN 'api_keys' ELSE 'team_members' END;
 PERFORM pg_advisory_xact_lock(hashtextextended('plan-resource:'||NEW.workspace_id::text||k,0));
 IF TG_TABLE_NAME='workspace_members' THEN
  IF EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id=NEW.workspace_id AND user_id=NEW.user_id) OR NOT EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id=NEW.workspace_id) THEN RETURN NEW;END IF;
 END IF;
 IF TG_TABLE_NAME='merchant_api_keys' THEN
  rotating:=nullif(current_setting('ekmivo.key_rotation_id',true),'');
  IF rotating IS NOT NULL AND EXISTS(SELECT 1 FROM merchant_api_keys WHERE id::text=rotating AND workspace_id=NEW.workspace_id AND environment=NEW.environment AND revoked_at=transaction_timestamp()) THEN RETURN NEW;END IF;
 END IF;
 p:=payment_plan_effective(NEW.workspace_id);
 IF coalesce((p->>'active')::boolean,false) IS NOT TRUE OR (p->>'access_until')::timestamptz<=now() THEN RAISE EXCEPTION 'SUBSCRIPTION_REQUIRED' USING ERRCODE='P6802';END IF;
 lim:=(p->'terms'->'limits'->>k)::bigint;IF lim IS NULL THEN RETURN NEW;END IF;
 IF k='api_keys' THEN SELECT count(*) INTO total FROM merchant_api_keys WHERE workspace_id=NEW.workspace_id AND environment='live' AND revoked_at IS NULL AND expires_at>now();
 ELSE
  accepting:=nullif(current_setting('ekmivo.accepting_invite_id',true),'');
  SELECT (SELECT count(*) FROM workspace_members WHERE workspace_id=NEW.workspace_id)+(SELECT count(*) FROM pg13_invites WHERE workspace_id=NEW.workspace_id AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now() AND (accepting IS NULL OR id::text<>accepting)) INTO total;
 END IF;
 IF total>=lim THEN RAISE EXCEPTION 'PLAN_RESOURCE_LIMIT' USING ERRCODE='P6806';END IF;RETURN NEW;
END $$;
CREATE FUNCTION payment_plan_invite_limit() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ DECLARE p jsonb;lim bigint;total bigint;BEGIN
 IF NOT EXISTS(SELECT 1 FROM workspace_product_access WHERE workspace_id=NEW.workspace_id AND product='payments' AND enabled) OR platform_billing_system_workspace(NEW.workspace_id) THEN RETURN NEW;END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('plan-resource:'||NEW.workspace_id::text||'team_members',0));
 IF EXISTS(SELECT 1 FROM pg13_invites WHERE workspace_id=NEW.workspace_id AND lower(email)=lower(NEW.email) AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now()) THEN RAISE EXCEPTION 'invite already pending' USING ERRCODE='23505';END IF;
 p:=payment_plan_effective(NEW.workspace_id);
 IF coalesce((p->>'active')::boolean,false) IS NOT TRUE OR (p->>'access_until')::timestamptz<=now() THEN RAISE EXCEPTION 'SUBSCRIPTION_REQUIRED' USING ERRCODE='P6802';END IF;
 lim:=(p->'terms'->'limits'->>'team_members')::bigint;IF lim IS NULL THEN RETURN NEW;END IF;
 SELECT (SELECT count(*) FROM workspace_members WHERE workspace_id=NEW.workspace_id)+(SELECT count(*) FROM pg13_invites WHERE workspace_id=NEW.workspace_id AND accepted_at IS NULL AND revoked_at IS NULL AND expires_at>now()) INTO total;
 IF total>=lim THEN RAISE EXCEPTION 'PLAN_RESOURCE_LIMIT' USING ERRCODE='P6806';END IF;RETURN NEW;
END $$;
CREATE TRIGGER payment_plan_invite_limit BEFORE INSERT ON pg13_invites FOR EACH ROW EXECUTE FUNCTION payment_plan_invite_limit();
CREATE TRIGGER payment_plan_invite_renew_limit BEFORE UPDATE OF expires_at,revoked_at,accepted_at ON pg13_invites FOR EACH ROW WHEN (NEW.accepted_at IS NULL AND NEW.revoked_at IS NULL AND NEW.expires_at>now() AND (OLD.accepted_at IS NOT NULL OR OLD.revoked_at IS NOT NULL OR OLD.expires_at<=now())) EXECUTE FUNCTION payment_plan_invite_limit();
-- Accepting an invitation converts its reserved slot into one member, not two seats.
DO $$ DECLARE d text;BEGIN
 SELECT pg_get_functiondef('pg13_invite_accept(uuid,text)'::regprocedure) INTO d;
 d:=replace(d,'INSERT INTO workspace_members','PERFORM set_config(''ekmivo.accepting_invite_id'',i.id::text,true); INSERT INTO workspace_members');
 EXECUTE d;
END $$;
REVOKE ALL ON FUNCTION payment_plan_member_resource_usage(uuid,uuid),payment_plan_invite_limit() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION payment_plan_member_resource_usage(uuid,uuid) TO ekmivo_financial_runtime;
COMMIT;
