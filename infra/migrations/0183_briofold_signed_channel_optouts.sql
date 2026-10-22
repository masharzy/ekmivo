-- CONTROL only, after 0182. A provider-signed inbound STOP may *remove*
-- marketing eligibility. It can never mint consent or enqueue delivery.
BEGIN;
DO $$ BEGIN
 IF to_regclass('public.briofold_growth_suppressions') IS NULL
    OR to_regclass('public.inbox_messages') IS NULL
    OR to_regclass('public.financial_realm') IS NOT NULL THEN
  RAISE EXCEPTION '0183 requires CONTROL inbox and 0182 consent schema';
 END IF;
END $$;

-- A signed inbound customer request has no human actor. Do not forge the
-- Store owner's identity in the audit trail; retain the source message ID.
ALTER TABLE briofold_growth_suppressions
 ALTER COLUMN actor_id DROP NOT NULL,
 ADD COLUMN provider_message_id uuid REFERENCES inbox_messages(id);
ALTER TABLE briofold_growth_suppression_events
 ALTER COLUMN actor_id DROP NOT NULL,
 ADD COLUMN provider_message_id uuid REFERENCES inbox_messages(id);

CREATE FUNCTION briofold_growth_provider_opt_out(connection_id uuid, provider_message text)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c record;channel_name text;scope text;inserted_count bigint;
BEGIN
 IF connection_id IS NULL OR provider_message IS NULL OR length(provider_message)>250 THEN
  RETURN false;
 END IF;
 -- The message must be a durable, actually ingested inbound customer event.
 -- Go invokes this only inside its verified Meta-signature transaction.
 SELECT cn.workspace_id,cn.environment,cn.provider,s.customer_id,m.id message_id,
        lower(btrim(m.body)) body
 INTO c
 FROM inbox_connections cn
 JOIN inbox_threads t ON t.connection_id=cn.id AND t.workspace_id=cn.workspace_id
 JOIN inbox_messages m ON m.thread_id=t.id AND m.workspace_id=cn.workspace_id
 JOIN briofold_customer_sources s ON s.workspace_id=cn.workspace_id
  AND s.environment=cn.environment AND s.kind='thread' AND s.source_id=t.id
 JOIN briofold_customers profile ON profile.id=s.customer_id
  AND profile.workspace_id=cn.workspace_id AND profile.environment=cn.environment
 WHERE cn.id=connection_id AND cn.enabled AND cn.provider IN ('ms','ig','wa')
  AND m.provider_id=provider_message AND m.sender='customer' AND m.type='text'
  AND m.state='received' AND profile.deleted_at IS NULL AND profile.merged_into IS NULL
 LIMIT 1;
 IF c.message_id IS NULL OR c.body NOT IN ('stop','stop all','unsubscribe') THEN
  RETURN false;
 END IF;
 channel_name:=CASE c.provider WHEN 'wa' THEN 'whatsapp' WHEN 'ig' THEN 'instagram' ELSE 'messenger' END;
 scope:=CASE WHEN c.body='stop all' THEN 'all' ELSE channel_name END;
 PERFORM pg_advisory_xact_lock(hashtextextended('growth:'||c.workspace_id::text||':'||c.environment,0));
 INSERT INTO briofold_growth_suppressions
  (workspace_id,environment,customer_id,channel,reason,actor_id,provider_message_id)
 VALUES(c.workspace_id,c.environment,c.customer_id,scope,'provider-opt-out',NULL,c.message_id)
 ON CONFLICT DO NOTHING;
 GET DIAGNOSTICS inserted_count=ROW_COUNT;
 IF inserted_count=1 THEN
  INSERT INTO briofold_growth_suppression_events
   (workspace_id,environment,customer_id,channel,reason,actor_id,provider_message_id)
  VALUES(c.workspace_id,c.environment,c.customer_id,scope,'provider-opt-out',NULL,c.message_id);
 END IF;
 RETURN true;
END $$;

-- CRM merge must preserve channel/global suppression *and* the original
-- signed-source reference. Marketing consent itself is never transferred.
CREATE OR REPLACE FUNCTION briofold_growth_suppression_on_merge()
 RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.merged_into IS NOT NULL AND NEW.merged_into IS DISTINCT FROM OLD.merged_into THEN
  WITH copied AS (
   INSERT INTO briofold_growth_suppressions
    (workspace_id,environment,customer_id,channel,reason,actor_id,provider_message_id)
   SELECT s.workspace_id,s.environment,NEW.merged_into,s.channel,s.reason,s.actor_id,s.provider_message_id
   FROM briofold_growth_suppressions s
   WHERE s.workspace_id=NEW.workspace_id AND s.environment=NEW.environment AND s.customer_id=NEW.id
   ON CONFLICT DO NOTHING
   RETURNING workspace_id,environment,customer_id,channel,reason,actor_id,provider_message_id
  )
  INSERT INTO briofold_growth_suppression_events
   (workspace_id,environment,customer_id,channel,reason,actor_id,provider_message_id)
  SELECT workspace_id,environment,customer_id,channel,reason,actor_id,provider_message_id FROM copied;
 END IF;
 RETURN NEW;
END $$;

REVOKE ALL ON FUNCTION briofold_growth_provider_opt_out(uuid,text)
 FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION briofold_growth_provider_opt_out(uuid,text)
 TO ekmivo_financial_runtime;
COMMIT;
