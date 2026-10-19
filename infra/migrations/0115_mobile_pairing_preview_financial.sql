-- Financial realms only. Read-only; never claims a device or consumes a code.
BEGIN;
CREATE OR REPLACE FUNCTION pg06_phone_pairing_preview(d text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('workspace_id',p.workspace_id,'environment',p.environment,
  'expires_at',p.pair_expires_at)
 FROM pg06_phones p JOIN financial_workspace_registry r USING(workspace_id,environment)
 WHERE d ~ '^[a-f0-9]{64}$' AND p.pair_digest=d AND p.pair_expires_at>now()
 AND p.public_key IS NULL AND p.revoked_at IS NULL AND r.status='active'
 AND coalesce(to_jsonb(p)->>'deleted_at','')=''
 LIMIT 1
$$;
REVOKE ALL ON FUNCTION pg06_phone_pairing_preview(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pg06_phone_pairing_preview(text) TO ekmivo_financial_runtime;
COMMIT;
