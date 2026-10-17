-- 0083: Revoke a physical SMS phone only after Go validates its signed request.
-- Unlike merchant pg06_phone_action, this function has no merchant-session
-- dependency; callers MUST first authenticate the phone's P-256 request.
BEGIN;
CREATE FUNCTION pg06_phone_self_revoke(phone_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp
AS $$
DECLARE
  p pg06_phones;
BEGIN
  UPDATE pg06_phones
    SET revoked_at=now(), config_version=config_version+1
    WHERE id=phone_id AND revoked_at IS NULL AND public_key IS NOT NULL
    RETURNING * INTO p;
  IF p.id IS NULL THEN RETURN false; END IF;
  UPDATE pg06_devices
    SET revoked_at=now()
    WHERE physical_phone_id=phone_id AND workspace_id=p.workspace_id
      AND environment=p.environment AND revoked_at IS NULL;
  INSERT INTO pg09_audit(workspace_id,environment,resource,resource_id,action)
    VALUES(p.workspace_id,p.environment,'phones',p.id,'revoke');
  RETURN true;
END $$;
REVOKE ALL ON FUNCTION pg06_phone_self_revoke(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pg06_phone_self_revoke(uuid) TO ekmivo_finance_reader;
COMMIT;
