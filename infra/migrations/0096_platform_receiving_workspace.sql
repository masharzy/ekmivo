-- Control database. Super-admin-managed system receiving destination.
BEGIN;
CREATE TABLE platform_billing_settings(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),workspace_id uuid REFERENCES workspaces(id) ON DELETE RESTRICT,updated_by uuid REFERENCES app_users(id),updated_at timestamptz NOT NULL DEFAULT now());
INSERT INTO platform_billing_settings(singleton) VALUES(true);
ALTER TABLE platform_billing_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_billing_settings FORCE ROW LEVEL SECURITY;
CREATE POLICY platform_billing_settings_owner ON platform_billing_settings TO CURRENT_USER USING(true) WITH CHECK(true);
REVOKE ALL ON platform_billing_settings FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
ALTER TABLE pg13_platform_invoices ADD COLUMN receiving_workspace_id uuid REFERENCES workspaces(id) ON DELETE RESTRICT;
CREATE FUNCTION platform_billing_workspace() RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT workspace_id FROM platform_billing_settings WHERE singleton $$;
CREATE FUNCTION platform_billing_system_workspace(w uuid) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT coalesce(w=platform_billing_workspace(),false) OR EXISTS(SELECT 1 FROM pg13_platform_invoices WHERE receiving_workspace_id=w AND status='issued') $$;
CREATE FUNCTION platform_billing_set(a uuid,w uuid,reason text) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE previous uuid;BEGIN
 PERFORM pg_advisory_xact_lock(5101496);
 IF NOT EXISTS(SELECT 1 FROM platform_administrators p JOIN app_users u ON u.id=p.user_id WHERE p.user_id=a AND p.role='super_admin' AND u.disabled_at IS NULL) THEN RAISE EXCEPTION 'super admin required' USING ERRCODE='42501';END IF;
 IF length(trim(reason)) NOT BETWEEN 10 AND 500 THEN RAISE EXCEPTION 'reason required' USING ERRCODE='22023';END IF;
 IF NOT EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id=w AND user_id=a AND role IN ('owner','admin')) OR NOT EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id=w AND role='owner') OR EXISTS(SELECT 1 FROM workspace_members m LEFT JOIN platform_administrators p ON p.user_id=m.user_id LEFT JOIN app_users u ON u.id=m.user_id WHERE m.workspace_id=w AND (p.role IS DISTINCT FROM 'super_admin' OR u.disabled_at IS NOT NULL)) OR NOT EXISTS(SELECT 1 FROM workspace_product_access WHERE workspace_id=w AND product='payments' AND enabled) THEN RAISE EXCEPTION 'system workspace must have only active super admin members and payment access' USING ERRCODE='22023';END IF;
 SELECT workspace_id INTO previous FROM platform_billing_settings WHERE singleton FOR UPDATE;
 UPDATE platform_billing_settings SET workspace_id=w,updated_by=a,updated_at=now() WHERE singleton;
 INSERT INTO platform_admin_audit(actor_id,action,subject_id,description) VALUES(a,'billing.receiving_workspace_changed',NULL,'Workspace: '||w::text||' | Previous: '||coalesce(previous::text,'none')||' | '||trim(reason));
 RETURN true;
END $$;
CREATE FUNCTION platform_billing_invoice_receiver(w uuid,i uuid) RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT receiving_workspace_id FROM pg13_platform_invoices WHERE workspace_id=w AND id=i $$;
CREATE FUNCTION platform_billing_pin_invoice() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 NEW.receiving_workspace_id:=platform_billing_workspace();
 IF NEW.receiving_workspace_id IS NULL OR NEW.receiving_workspace_id=NEW.workspace_id THEN RAISE EXCEPTION 'PLATFORM_RECEIVING_UNAVAILABLE' USING ERRCODE='P6902';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER platform_billing_pin_invoice BEFORE INSERT ON pg13_platform_invoices FOR EACH ROW EXECUTE FUNCTION platform_billing_pin_invoice();
CREATE FUNCTION platform_billing_member_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM pg_advisory_xact_lock(5101496);
 IF platform_billing_system_workspace(NEW.workspace_id) AND NOT EXISTS(SELECT 1 FROM platform_administrators p JOIN app_users u ON u.id=p.user_id WHERE p.user_id=NEW.user_id AND p.role='super_admin' AND u.disabled_at IS NULL) THEN RAISE EXCEPTION 'system workspace requires super admin members' USING ERRCODE='42501';END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER platform_billing_member_guard BEFORE INSERT OR UPDATE ON workspace_members FOR EACH ROW EXECUTE FUNCTION platform_billing_member_guard();
CREATE FUNCTION platform_billing_role_guard() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 PERFORM pg_advisory_xact_lock(5101496);
 IF (TG_OP='DELETE' OR NEW.role IS DISTINCT FROM 'super_admin') AND EXISTS(SELECT 1 FROM workspace_members m WHERE m.user_id=OLD.user_id AND platform_billing_system_workspace(m.workspace_id)) THEN RAISE EXCEPTION 'remove system workspace membership before changing platform role' USING ERRCODE='42501';END IF;
 IF TG_OP='DELETE' THEN RETURN OLD;END IF;RETURN NEW;
END $$;
CREATE TRIGGER platform_billing_role_guard BEFORE UPDATE OR DELETE ON platform_administrators FOR EACH ROW EXECUTE FUNCTION platform_billing_role_guard();
CREATE OR REPLACE FUNCTION pg13_pending_billing() RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT coalesce(jsonb_agg(to_jsonb(i)),'[]') FROM(SELECT id,workspace_id,amount_minor,receiving_workspace_id FROM pg13_platform_invoices WHERE status='issued' AND created_at>now()-interval '90 days' ORDER BY created_at LIMIT 100)i $$;
REVOKE ALL ON FUNCTION platform_billing_workspace(),platform_billing_system_workspace(uuid),platform_billing_set(uuid,uuid,text),platform_billing_invoice_receiver(uuid,uuid),platform_billing_pin_invoice(),platform_billing_member_guard(),platform_billing_role_guard() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_billing_workspace(),platform_billing_system_workspace(uuid),platform_billing_invoice_receiver(uuid,uuid) TO ekmivo_financial_runtime;
COMMIT;
