-- FINANCIAL realms only; enables AI-first handsets to add Payment later.
BEGIN;
CREATE FUNCTION pg06_mobile_adopt(i uuid,w uuid,e text,k bytea) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF octet_length(k) NOT BETWEEN 60 AND 256 OR NOT EXISTS(SELECT 1 FROM financial_workspace_registry WHERE workspace_id=w AND environment=e AND status='active') THEN RETURN false; END IF;
 INSERT INTO pg06_phones(id,workspace_id,environment,name,public_key,claimed_at) VALUES(i,w,e,'Android',k,now()) ON CONFLICT(id) DO UPDATE SET public_key=EXCLUDED.public_key,claimed_at=now(),revoked_at=NULL
 WHERE pg06_phones.workspace_id=w AND pg06_phones.environment=e AND coalesce(to_jsonb(pg06_phones)->>'deleted_at','')='';
 RETURN EXISTS(SELECT 1 FROM pg06_phones WHERE id=i AND workspace_id=w AND environment=e AND public_key=k AND revoked_at IS NULL AND coalesce(to_jsonb(pg06_phones)->>'deleted_at','')='');
END $$;
REVOKE ALL ON FUNCTION pg06_mobile_adopt(uuid,uuid,text,bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pg06_mobile_adopt(uuid,uuid,text,bytea) TO ekmivo_financial_runtime;
CREATE FUNCTION pg06_mobile_key(i uuid) RETURNS TABLE(workspace_id uuid,environment text,public_key bytea,authorized boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT p.workspace_id,p.environment,p.public_key,(p.revoked_at IS NULL AND p.public_key IS NOT NULL AND coalesce(to_jsonb(p)->>'deleted_at','')='') FROM pg06_phones p WHERE p.id=i
$$;
REVOKE ALL ON FUNCTION pg06_mobile_key(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pg06_mobile_key(uuid) TO ekmivo_financial_runtime;
COMMIT;
