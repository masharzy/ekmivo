-- Phase 4 notifications: when an AI order is paid (verified), confirmed as COD, or its payment needs the owner's review,
-- the owner is told exactly once per order and kind: a commerce event (sidebar badge + notifications page), an email to
-- verified owner/admin accounts, and a push to the workspace's claimed mobile devices. Delivery is an outbox drained by Go.
BEGIN;
CREATE TABLE IF NOT EXISTS commerce_ai_notices(
 order_id uuid NOT NULL REFERENCES commerce_orders(id),kind text NOT NULL CHECK(kind IN('paid','cod','review')),
 workspace_id uuid NOT NULL REFERENCES workspaces(id),environment text NOT NULL CHECK(environment IN('live','sandbox')),
 state text NOT NULL DEFAULT 'queued' CHECK(state IN('queued','sending','sent','failed')),attempts integer NOT NULL DEFAULT 0,
 email_state text NOT NULL DEFAULT 'pending' CHECK(email_state IN('pending','sent','skipped','failed')),
 push_state text NOT NULL DEFAULT 'pending' CHECK(push_state IN('pending','sent','skipped','failed')),
 created_at timestamptz NOT NULL DEFAULT now(),attempt_at timestamptz,PRIMARY KEY(order_id,kind));
CREATE INDEX IF NOT EXISTS commerce_ai_notices_queue ON commerce_ai_notices(created_at) WHERE state='queued';
ALTER TABLE commerce_ai_notices ENABLE ROW LEVEL SECURITY;
ALTER TABLE commerce_ai_notices FORCE ROW LEVEL SECURITY;
DO $$BEGIN IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE tablename='commerce_ai_notices' AND policyname='commerce_ai_notices_owner') THEN
 EXECUTE format('CREATE POLICY commerce_ai_notices_owner ON commerce_ai_notices TO %I USING(true) WITH CHECK(true)',current_user);END IF;END $$;
REVOKE ALL ON commerce_ai_notices FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;

CREATE OR REPLACE FUNCTION briofold_ai_notice_add(oid uuid,k text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE o commerce_orders%ROWTYPE;n integer;BEGIN
 SELECT * INTO o FROM commerce_orders WHERE id=oid;
 IF NOT FOUND OR o.source<>'ai' THEN RETURN;END IF;
 INSERT INTO commerce_ai_notices(order_id,kind,workspace_id,environment) VALUES(oid,k,o.workspace_id,o.environment) ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT;
 -- 'order-state' is already part of the commerce notifications feed, so the sidebar badge counts it without UI changes.
 IF n=1 THEN INSERT INTO commerce_events(workspace_id,environment,entity_id,actor_id,action,detail)
  VALUES(o.workspace_id,o.environment,oid,NULL,'order-state',jsonb_build_object('order_id',oid,'source','ai','status',CASE k WHEN 'review' THEN 'payment-review' ELSE o.status END,'payment',k));
 END IF;
END $$;

CREATE OR REPLACE FUNCTION briofold_ai_notice_order() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.source='ai' AND NEW.payment_state IS DISTINCT FROM OLD.payment_state AND NEW.payment_state IN('verified','cod') THEN
  PERFORM briofold_ai_notice_add(NEW.id,CASE NEW.payment_state WHEN 'verified' THEN 'paid' ELSE 'cod' END);
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS briofold_ai_notice_order ON commerce_orders;
CREATE TRIGGER briofold_ai_notice_order AFTER UPDATE OF payment_state ON commerce_orders FOR EACH ROW EXECUTE FUNCTION briofold_ai_notice_order();

CREATE OR REPLACE FUNCTION briofold_ai_notice_claim() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.state='review' AND (TG_OP='INSERT' OR OLD.state IS DISTINCT FROM 'review') THEN PERFORM briofold_ai_notice_add(NEW.order_id,'review');END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS briofold_ai_notice_claim ON commerce_payment_claims;
CREATE TRIGGER briofold_ai_notice_claim AFTER INSERT OR UPDATE OF state ON commerce_payment_claims FOR EACH ROW EXECUTE FUNCTION briofold_ai_notice_claim();

-- Outbox: one notice per call. Recipients are verified, enabled owner/admin accounts; push targets are claimed devices.
CREATE OR REPLACE FUNCTION briofold_ai_next_notice() RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE x commerce_ai_notices%ROWTYPE;r jsonb;BEGIN
 UPDATE commerce_ai_notices SET state='queued' WHERE state='sending' AND attempt_at<now()-interval '2 minutes' AND attempts<5;
 SELECT * INTO x FROM commerce_ai_notices WHERE state='queued' AND attempts<5 AND (attempt_at IS NULL OR attempt_at<now()-interval '1 minute')
  ORDER BY created_at FOR UPDATE SKIP LOCKED LIMIT 1;
 IF NOT FOUND THEN RETURN NULL;END IF;
 UPDATE commerce_ai_notices SET state='sending',attempt_at=now(),attempts=attempts+1 WHERE order_id=x.order_id AND kind=x.kind;
 SELECT jsonb_build_object('order_id',o.id,'kind',x.kind,'workspace_id',o.workspace_id,'environment',o.environment,'reference',o.reference,'total_minor',o.total_minor,
  'email_state',x.email_state,'push_state',x.push_state,
  'recipients',coalesce((SELECT jsonb_agg(jsonb_build_object('email',u.email,'verified_at',u.email_verified_at)) FROM workspace_members m JOIN app_users u ON u.id=m.user_id
     WHERE m.workspace_id=o.workspace_id AND m.role IN('owner','admin') AND u.disabled_at IS NULL AND u.email_verified_at IS NOT NULL),'[]'::jsonb),
  'devices',coalesce((SELECT jsonb_agg(jsonb_build_object('device_id',d.id,'token',encode(t.token_cipher,'base64'))) FROM mobile_devices d JOIN inbox_push_tokens t ON t.device_id=d.id
     WHERE d.workspace_id=o.workspace_id AND d.environment=o.environment AND d.claimed_at IS NOT NULL AND d.revoked_at IS NULL),'[]'::jsonb))
 INTO r FROM commerce_orders o WHERE o.id=x.order_id;
 RETURN r;
END $$;

CREATE OR REPLACE FUNCTION briofold_ai_finish_notice(oid uuid,k text,email text,push text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF email NOT IN('pending','sent','skipped','failed') OR push NOT IN('pending','sent','skipped','failed') THEN RAISE EXCEPTION 'Invalid notice state' USING ERRCODE='22023';END IF;
 UPDATE commerce_ai_notices SET email_state=email,push_state=push,
  state=CASE WHEN email IN('sent','skipped') AND push IN('sent','skipped') THEN 'sent' WHEN attempts>=5 THEN 'failed' ELSE 'queued' END
 WHERE order_id=oid AND kind=k AND state='sending';
END $$;

REVOKE ALL ON FUNCTION briofold_ai_notice_add(uuid,text),briofold_ai_notice_order(),briofold_ai_notice_claim(),briofold_ai_next_notice(),briofold_ai_finish_notice(uuid,text,text,text) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION briofold_ai_next_notice(),briofold_ai_finish_notice(uuid,text,text,text) TO ekmivo_financial_runtime,ekmivo_financial_projection;
COMMIT;
