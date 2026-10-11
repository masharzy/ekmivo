-- CONTROL database only. Public capability is validated in isolated finance
-- before Go invokes this narrow read. No session, membership or secret output.
BEGIN;
DO $$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['workspace_environments','workspace_product_access'] LOOP
  EXECUTE format('CREATE POLICY pg05_public_business_owner_read ON %I FOR SELECT TO %I USING (true)',t,current_user);
 END LOOP;
END; $$;
CREATE FUNCTION pg05_public_business(p_workspace uuid,p_environment text)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT w.name FROM workspaces w
 JOIN workspace_environments e ON e.workspace_id=w.id AND e.environment=p_environment AND e.status='active'
 JOIN workspace_product_access p ON p.workspace_id=w.id AND p.product='payments' AND p.enabled
 WHERE w.id=p_workspace AND p_environment='sandbox' LIMIT 1
$$;
REVOKE ALL ON FUNCTION pg05_public_business(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pg05_public_business(uuid,text) TO ekmivo_financial_runtime;
COMMIT;
