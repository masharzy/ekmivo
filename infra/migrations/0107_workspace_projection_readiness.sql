BEGIN;
-- A fresh, correctly scoped workspace may not yet be copied by the periodic
-- control-to-finance reconciler. Distinguish absence from actual denial.
-- Keep the existing SECURITY DEFINER owner, ACL, realm and RLS boundary.
CREATE OR REPLACE FUNCTION pg06_scope(w uuid,e text) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF w IS NULL OR e IS NULL OR
 e IS DISTINCT FROM (SELECT environment FROM financial_realm WHERE singleton) OR
 current_setting('ekmivo.workspace_id',true) IS DISTINCT FROM w::text OR
 current_setting('ekmivo.environment',true) IS DISTINCT FROM e THEN
  RAISE EXCEPTION 'scope denied' USING ERRCODE='42501';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM financial_workspace_registry WHERE workspace_id=w AND environment=e) THEN
  RAISE EXCEPTION 'workspace initialization pending' USING ERRCODE='P0401';
 END IF;
 IF NOT EXISTS(SELECT 1 FROM financial_workspace_registry WHERE workspace_id=w AND environment=e AND status='active') THEN
  RAISE EXCEPTION 'scope denied' USING ERRCODE='42501';
 END IF;
END $$;
CREATE FUNCTION pg06_workspace_ready(w uuid,e text) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT pg06_scope(w,e)
$$;
REVOKE ALL ON FUNCTION pg06_workspace_ready(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pg06_workspace_ready(uuid,text) TO ekmivo_finance_reader;
COMMIT;
