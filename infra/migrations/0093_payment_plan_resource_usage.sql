-- BOTH financial realms. Aggregate only; no account/device identifiers are returned.
BEGIN;
CREATE FUNCTION payment_plan_resource_usage(w uuid,e text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM pg06_scope(w,e);
 RETURN jsonb_build_object(
 'payment_methods',(SELECT count(*) FROM pg06_account_configuration WHERE workspace_id=w AND environment=e AND disabled_at IS NULL),
 'devices',(SELECT count(*) FROM pg06_phones WHERE workspace_id=w AND environment=e AND revoked_at IS NULL AND (claimed_at IS NOT NULL OR pair_expires_at>now()))+(SELECT count(*) FROM pg06_devices WHERE workspace_id=w AND environment=e AND revoked_at IS NULL AND physical_phone_id IS NULL AND (claimed_at IS NOT NULL OR pair_expires_at>now())),
 'active_checkouts',(SELECT count(*) FROM payment_allowance_slots WHERE workspace_id=w AND environment=e AND state='reserved' AND expires_at>now()));
END $$;
REVOKE ALL ON FUNCTION payment_plan_resource_usage(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION payment_plan_resource_usage(uuid,text) TO ekmivo_finance_reader;
COMMIT;
