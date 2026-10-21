-- Durable control-plane alerts, separate from financial notifications.
BEGIN;
DO $$BEGIN IF to_regclass('public.briofold_inbox_work') IS NULL OR to_regclass('public.financial_realm') IS NOT NULL THEN RAISE EXCEPTION '0138 requires control Inbox';END IF;END $$;
CREATE TABLE briofold_inbox_alerts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL REFERENCES workspaces(id),thread_id uuid NOT NULL,kind text NOT NULL CHECK(kind IN ('assignment','handover','sla','ticket','ai-review')),event_key text NOT NULL UNIQUE,recipient_id uuid REFERENCES app_users(id),created_at timestamptz NOT NULL DEFAULT now(),FOREIGN KEY(workspace_id,thread_id) REFERENCES inbox_threads(workspace_id,id));
CREATE INDEX briofold_inbox_alerts_page ON briofold_inbox_alerts(workspace_id,created_at DESC,id);
CREATE TABLE briofold_inbox_alert_reads(alert_id uuid NOT NULL REFERENCES briofold_inbox_alerts(id),actor_id uuid NOT NULL REFERENCES app_users(id),read_at timestamptz NOT NULL DEFAULT now(),PRIMARY KEY(alert_id,actor_id));
DO $$DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['briofold_inbox_alerts','briofold_inbox_alert_reads'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);EXECUTE format('CREATE POLICY %I ON %I TO %I USING(true) WITH CHECK(true)',t||'_owner',t,current_user);EXECUTE format('REVOKE ALL ON %I FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection',t);
END LOOP;END $$;
CREATE FUNCTION briofold_inbox_work_alert() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN
 IF NEW.owner_id IS NOT NULL AND (TG_OP='INSERT' OR NEW.owner_id IS DISTINCT FROM OLD.owner_id) THEN INSERT INTO briofold_inbox_alerts(workspace_id,thread_id,kind,event_key,recipient_id) VALUES(NEW.workspace_id,NEW.thread_id,'assignment','assignment:'||NEW.thread_id||':'||NEW.revision,NEW.owner_id) ON CONFLICT(event_key) DO NOTHING;END IF;
 IF NEW.handover_reason<>'' AND (TG_OP='INSERT' OR NEW.handover_reason IS DISTINCT FROM OLD.handover_reason) THEN INSERT INTO briofold_inbox_alerts(workspace_id,thread_id,kind,event_key) VALUES(NEW.workspace_id,NEW.thread_id,'handover','handover:'||NEW.thread_id||':'||NEW.revision) ON CONFLICT(event_key) DO NOTHING;END IF;
 RETURN NEW;
END $$;
CREATE TRIGGER briofold_inbox_work_alert AFTER INSERT OR UPDATE ON briofold_inbox_work FOR EACH ROW EXECUTE FUNCTION briofold_inbox_work_alert();
CREATE FUNCTION briofold_inbox_ticket_alert() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN
 IF NEW.status<>'resolved' AND (TG_OP='INSERT' OR NEW.status IS DISTINCT FROM OLD.status OR NEW.owner_id IS DISTINCT FROM OLD.owner_id) THEN INSERT INTO briofold_inbox_alerts(workspace_id,thread_id,kind,event_key,recipient_id) VALUES(NEW.workspace_id,NEW.thread_id,'ticket','ticket:'||NEW.id||':'||NEW.revision,NEW.owner_id) ON CONFLICT(event_key) DO NOTHING;END IF;RETURN NEW;
END $$;
CREATE TRIGGER briofold_inbox_ticket_alert AFTER INSERT OR UPDATE ON briofold_inbox_tickets FOR EACH ROW EXECUTE FUNCTION briofold_inbox_ticket_alert();
CREATE FUNCTION briofold_inbox_ai_alert() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN
 IF NEW.state='review' AND OLD.state IS DISTINCT FROM NEW.state THEN INSERT INTO briofold_inbox_alerts(workspace_id,thread_id,kind,event_key) VALUES(NEW.workspace_id,NEW.thread_id,'ai-review','ai-review:'||NEW.id) ON CONFLICT(event_key) DO NOTHING;END IF;RETURN NEW;
END $$;
CREATE TRIGGER briofold_inbox_ai_alert AFTER UPDATE ON briofold_ai_channel_jobs FOR EACH ROW EXECUTE FUNCTION briofold_inbox_ai_alert();
CREATE FUNCTION briofold_inbox_alert_sweep() RETURNS integer LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE n integer;BEGIN
 INSERT INTO briofold_inbox_alerts(workspace_id,thread_id,kind,event_key,recipient_id)
 SELECT z.workspace_id,z.thread_id,'sla','sla:'||z.thread_id||':'||extract(epoch FROM z.due_at)::text,z.owner_id FROM briofold_inbox_work z JOIN inbox_threads t ON t.id=z.thread_id JOIN inbox_connections c ON c.id=t.connection_id AND c.enabled JOIN workspace_product_access p ON p.workspace_id=z.workspace_id AND p.product='ai' AND p.enabled WHERE z.status IN ('open','pending') AND z.due_at<=now() AND NOT EXISTS(SELECT 1 FROM briofold_inbox_alerts a WHERE a.event_key='sla:'||z.thread_id||':'||extract(epoch FROM z.due_at)::text) ORDER BY z.due_at,z.thread_id LIMIT 100 ON CONFLICT(event_key) DO NOTHING;
 GET DIAGNOSTICS n=ROW_COUNT;RETURN n;
END $$;
CREATE FUNCTION briofold_inbox_alert_read(w uuid,a uuid,off integer,q text,k text,unread_only boolean) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN
 PERFORM briofold_inbox_actor(w,a,'inbox:read');
 IF off IS NULL OR off NOT BETWEEN 0 AND 10000 OR q IS NULL OR length(q)>100 OR k IS NULL OR k NOT IN ('','assignment','handover','sla','ticket','ai-review') OR unread_only IS NULL THEN RAISE EXCEPTION 'Invalid alert filters' USING ERRCODE='22023';END IF;
 RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.created_at DESC,x.id) FROM (
  SELECT n.id,n.thread_id,n.kind,n.created_at,t.customer_name,r.read_at FROM briofold_inbox_alerts n JOIN inbox_threads t ON t.id=n.thread_id JOIN inbox_connections c ON c.id=t.connection_id AND c.enabled AND c.environment='live' LEFT JOIN briofold_inbox_alert_reads r ON r.alert_id=n.id AND r.actor_id=a WHERE n.workspace_id=w AND (n.recipient_id IS NULL OR n.recipient_id=a) AND (k='' OR n.kind=k) AND (q='' OR t.customer_name ILIKE '%'||q||'%') AND (NOT unread_only OR r.read_at IS NULL) ORDER BY n.created_at DESC,n.id OFFSET off LIMIT 51
 )x),'[]'));
END $$;
CREATE FUNCTION briofold_inbox_alert_mark(w uuid,a uuid,alert uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN
 PERFORM briofold_inbox_actor(w,a,'inbox:read');
 IF alert IS NULL OR NOT EXISTS(SELECT 1 FROM briofold_inbox_alerts n JOIN inbox_threads t ON t.id=n.thread_id JOIN inbox_connections c ON c.id=t.connection_id AND c.enabled AND c.environment='live' WHERE n.workspace_id=w AND n.id=alert AND (n.recipient_id IS NULL OR n.recipient_id=a)) THEN RAISE EXCEPTION 'Alert unavailable' USING ERRCODE='42501';END IF;
 INSERT INTO briofold_inbox_alert_reads(alert_id,actor_id) VALUES(alert,a) ON CONFLICT DO NOTHING;RETURN true;
END $$;
REVOKE ALL ON FUNCTION briofold_inbox_work_alert(),briofold_inbox_ticket_alert(),briofold_inbox_ai_alert(),briofold_inbox_alert_sweep(),briofold_inbox_alert_read(uuid,uuid,integer,text,text,boolean),briofold_inbox_alert_mark(uuid,uuid,uuid) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION briofold_inbox_alert_sweep(),briofold_inbox_alert_read(uuid,uuid,integer,text,text,boolean),briofold_inbox_alert_mark(uuid,uuid,uuid) TO ekmivo_financial_runtime,ekmivo_financial_projection;
COMMIT;
