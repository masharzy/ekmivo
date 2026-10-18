-- Control plane only. Aggregate access preserves the runtime's table isolation.
BEGIN;
CREATE FUNCTION payment_plan_admin_resource_usage(a uuid,w uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM platform_administrators p JOIN app_users u ON u.id=p.user_id
  WHERE p.user_id=a AND p.role='super_admin' AND u.disabled_at IS NULL)
 THEN RAISE EXCEPTION 'admin required' USING ERRCODE='42501';END IF;
 IF NOT EXISTS(SELECT 1 FROM workspaces WHERE id=w) THEN RAISE EXCEPTION 'workspace missing' USING ERRCODE='P0002';END IF;
 RETURN jsonb_build_object(
 'api_keys',(SELECT count(*) FROM merchant_api_keys WHERE workspace_id=w AND environment='live' AND revoked_at IS NULL AND expires_at>now()),
 'team_members',(SELECT count(*) FROM workspace_members WHERE workspace_id=w));
END $$;
REVOKE ALL ON FUNCTION payment_plan_admin_resource_usage(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION payment_plan_admin_resource_usage(uuid,uuid) TO ekmivo_financial_runtime;
COMMIT;
