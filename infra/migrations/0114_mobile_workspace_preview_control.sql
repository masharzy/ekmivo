-- Control DB only. Minimal product identity for a validated, unconsumed pairing.
BEGIN;
CREATE OR REPLACE FUNCTION mobile_workspace_preview(w uuid,e text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('workspace_id',b.id,'workspace_name',b.name,
  'environment',v.environment,'products',jsonb_build_object(
   'ai',EXISTS(SELECT 1 FROM workspace_product_access p WHERE p.workspace_id=b.id AND p.product='ai' AND p.enabled),
   'payments',EXISTS(SELECT 1 FROM workspace_product_access p WHERE p.workspace_id=b.id AND p.product='payments' AND p.enabled)))
 FROM workspaces b JOIN workspace_environments v ON v.workspace_id=b.id
 WHERE b.id=w AND v.environment=e AND v.status='active' AND e IN ('sandbox','live')
 AND EXISTS(SELECT 1 FROM workspace_product_access p WHERE p.workspace_id=b.id AND p.enabled)
$$;
REVOKE ALL ON FUNCTION mobile_workspace_preview(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mobile_workspace_preview(uuid,text) TO ekmivo_financial_runtime,ekmivo_financial_projection;
COMMIT;
