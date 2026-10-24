-- CONTROL only: preserve consent erasure, signed callback permissions and
-- indexed source traversal. No transport or deployment flags are enabled.
BEGIN;
DO $$BEGIN
 IF to_regclass('public.briofold_member_channel_scopes') IS NULL OR to_regclass('public.financial_realm') IS NOT NULL THEN RAISE EXCEPTION '0211 requires CONTROL 0210';END IF;
END $$;
-- Signed webhook ingestion uses the same restricted projection role as STOP.
GRANT EXECUTE ON FUNCTION briofold_growth_provider_opt_in(uuid,text,text) TO ekmivo_financial_projection;
-- Avoid the PL/pgSQL customer record named c shadowing a consent table alias.
DO $$DECLARE definition text;BEGIN
 definition:=pg_get_functiondef('briofold_customers_write_before_channel_scopes(uuid,text,uuid,uuid,text,jsonb)'::regprocedure);
 IF position('briofold_growth_channel_consents c WHERE c.identity_proof_id=p.id' IN definition)=0 THEN RAISE EXCEPTION 'Unexpected customer erasure predecessor';END IF;
 EXECUTE replace(definition,'briofold_growth_channel_consents c WHERE c.identity_proof_id=p.id','briofold_growth_channel_consents consent_history WHERE consent_history.identity_proof_id=p.id');
END $$;
CREATE OR REPLACE FUNCTION briofold_channel_customer(w uuid,e text,a uuid,cid uuid) RETURNS boolean
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE role_name text;allowed boolean;BEGIN
 SELECT m.role INTO role_name FROM workspace_members m JOIN app_users u ON u.id=m.user_id AND u.disabled_at IS NULL WHERE m.workspace_id=w AND m.user_id=a;
 IF role_name IS NULL OR NOT EXISTS(SELECT 1 FROM briofold_customers WHERE id=cid AND workspace_id=w AND environment=e) THEN RETURN false;END IF;
 IF role_name='owner' OR NOT EXISTS(SELECT 1 FROM briofold_member_channel_scopes WHERE workspace_id=w AND user_id=a AND deny_read) THEN RETURN true;END IF;
 -- Walk both directions with separate indexed lookups. UNION terminates even
 -- malformed cycles; a merged denied identity still hides the entire family.
 WITH RECURSIVE identities(id,merged_into) AS (
  SELECT id,merged_into FROM briofold_customers WHERE id=cid AND workspace_id=w AND environment=e
  UNION
  SELECT family.id,family.merged_into FROM identities i CROSS JOIN LATERAL (
   SELECT child.id,child.merged_into FROM briofold_customers child WHERE child.workspace_id=w AND child.environment=e AND child.merged_into=i.id
   UNION SELECT parent.id,parent.merged_into FROM briofold_customers parent WHERE parent.workspace_id=w AND parent.environment=e AND parent.id=i.merged_into
  ) family
 ), source_threads AS (
  SELECT t.connection_id FROM identities i JOIN briofold_customer_sources s ON s.customer_id=i.id AND s.workspace_id=w AND s.environment=e AND s.kind='thread'
   JOIN inbox_threads t ON t.id=s.source_id AND t.workspace_id=w
  UNION ALL
  SELECT t.connection_id FROM identities i JOIN briofold_customer_sources s ON s.customer_id=i.id AND s.workspace_id=w AND s.environment=e AND s.kind='order'
   JOIN inbox_orders o ON o.id=s.source_id AND o.workspace_id=w JOIN inbox_threads t ON t.id=o.thread_id AND t.workspace_id=w
 ) SELECT NOT EXISTS(SELECT 1 FROM source_threads t JOIN briofold_member_channel_scopes restriction ON restriction.connection_id=t.connection_id AND restriction.workspace_id=w AND restriction.user_id=a AND restriction.deny_read) INTO allowed;
 RETURN allowed;
END $$;
COMMIT;
