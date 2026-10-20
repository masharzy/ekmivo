-- Run after 0114 inside an enclosing transaction on an isolated Neon test branch.
DO $test$
DECLARE row record; got jsonb; n integer:=0;
BEGIN
 FOR row IN SELECT w.id,w.name,v.environment FROM workspaces w JOIN workspace_environments v ON v.workspace_id=w.id AND v.status='active'
 WHERE EXISTS(SELECT 1 FROM workspace_product_access p WHERE p.workspace_id=w.id AND p.enabled) LIMIT 10 LOOP
  n:=n+1;
  got:=mobile_workspace_preview(row.id,row.environment);
  IF got IS NULL OR got->>'workspace_id'<>row.id::text OR got->>'workspace_name'<>row.name OR got->>'environment'<>row.environment THEN RAISE EXCEPTION 'control identity scope failed'; END IF;
  IF (got->'products'->>'ai')::boolean IS DISTINCT FROM EXISTS(SELECT 1 FROM workspace_product_access p WHERE p.workspace_id=row.id AND p.product='ai' AND p.enabled) THEN RAISE EXCEPTION 'AI capability disagrees with DB'; END IF;
  IF (got->'products'->>'payments')::boolean IS DISTINCT FROM EXISTS(SELECT 1 FROM workspace_product_access p WHERE p.workspace_id=row.id AND p.product='payments' AND p.enabled) THEN RAISE EXCEPTION 'payment capability disagrees with DB'; END IF;
 END LOOP;
 IF n=0 THEN RAISE EXCEPTION 'no active workspace fixtures: test would be vacuous'; END IF;
 IF mobile_workspace_preview(gen_random_uuid(),'sandbox') IS NOT NULL THEN RAISE EXCEPTION 'unknown workspace leaked'; END IF;
 IF mobile_workspace_preview(gen_random_uuid(),'invalid') IS NOT NULL THEN RAISE EXCEPTION 'invalid realm accepted'; END IF;
END $test$;
SELECT true AS control_identity_products_scope_checks_passed;
