-- Product-independent handset authorization. CONTROL database only.
BEGIN;
CREATE TABLE mobile_devices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(), workspace_id uuid NOT NULL,
 environment text NOT NULL, name text NOT NULL CHECK(length(name) BETWEEN 1 AND 80),
 financial_origin boolean NOT NULL DEFAULT false, public_key bytea, pair_digest text UNIQUE, pair_expires_at timestamptz,
 recovery_digest text UNIQUE, recovery_expires_at timestamptz,
 claimed_at timestamptz, revoked_at timestamptz, deleted_at timestamptz, heartbeat_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(workspace_id,environment) REFERENCES workspace_environments(workspace_id,environment),
 UNIQUE(workspace_id,environment,id), CHECK((public_key IS NULL)=(claimed_at IS NULL))
);
ALTER TABLE mobile_devices ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON mobile_devices FROM PUBLIC,ekmivo_financial_runtime;
CREATE FUNCTION mobile_device_manage(w uuid,e text,a text,i uuid,n text,d text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE device mobile_devices; result jsonb;
BEGIN
 -- Caller is the existing authenticated workspace owner/admin service boundary.
 IF NOT EXISTS(SELECT 1 FROM workspace_environments WHERE workspace_id=w AND environment=e AND status='active') THEN RAISE EXCEPTION 'workspace unavailable' USING ERRCODE='42501'; END IF;
 IF a='list' THEN RETURN jsonb_build_object('items',coalesce((SELECT jsonb_agg(jsonb_build_object('id',id,'name',name,'created_at',created_at,'claimed_at',claimed_at,'revoked_at',revoked_at,'heartbeat_at',heartbeat_at,'pair_expires_at',pair_expires_at,'permission_ok',true,'backlog',0) ORDER BY created_at DESC) FROM mobile_devices WHERE workspace_id=w AND environment=e AND deleted_at IS NULL),'[]'::jsonb)); END IF;
 IF a IN ('begin','reconnect') THEN
  IF NOT EXISTS(SELECT 1 FROM workspace_product_access WHERE workspace_id=w AND enabled) THEN RAISE EXCEPTION 'no enabled service' USING ERRCODE='42501'; END IF;
  IF d !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'invalid digest'; END IF;
  IF a='begin' THEN
   INSERT INTO mobile_devices(workspace_id,environment,name,pair_digest,pair_expires_at) VALUES(w,e,n,d,now()+interval '5 minutes') RETURNING * INTO device;
  ELSE
   UPDATE mobile_devices SET pair_digest=d,pair_expires_at=now()+interval '5 minutes',recovery_digest=NULL,recovery_expires_at=NULL,public_key=NULL,claimed_at=NULL,revoked_at=NULL
   WHERE id=i AND workspace_id=w AND environment=e AND revoked_at IS NOT NULL AND deleted_at IS NULL RETURNING * INTO device;
  END IF;
  IF device.id IS NULL THEN RAISE EXCEPTION 'device unavailable' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('id',device.id,'expires_at',device.pair_expires_at);
 ELSIF a='delete' THEN
  UPDATE mobile_devices SET revoked_at=coalesce(revoked_at,now()),deleted_at=now(),pair_digest=NULL,recovery_digest=NULL WHERE id=i AND workspace_id=w AND environment=e RETURNING * INTO device;
  IF device.id IS NULL THEN RAISE EXCEPTION 'device unavailable' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('saved',true);
 ELSIF a='revoke' THEN
  UPDATE mobile_devices SET revoked_at=now(),pair_digest=NULL,recovery_digest=NULL WHERE id=i AND workspace_id=w AND environment=e RETURNING * INTO device;
  IF device.id IS NULL THEN RAISE EXCEPTION 'device unavailable' USING ERRCODE='42501'; END IF;
  RETURN jsonb_build_object('saved',true);
 END IF;
 RAISE EXCEPTION 'unsupported device action';
END $$;
CREATE FUNCTION mobile_device_preview(d text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT mobile_workspace_preview(workspace_id,environment)||jsonb_build_object('expires_at',pair_expires_at)
 FROM mobile_devices WHERE pair_digest=d AND pair_expires_at>now() AND public_key IS NULL AND revoked_at IS NULL
$$;
CREATE FUNCTION mobile_device_claim(d text,k bytea) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE device mobile_devices; scope jsonb;
BEGIN
 IF d !~ '^[a-f0-9]{64}$' OR octet_length(k) NOT BETWEEN 60 AND 256 THEN RAISE EXCEPTION 'pairing unavailable' USING ERRCODE='42501'; END IF;
 SELECT * INTO device FROM mobile_devices WHERE revoked_at IS NULL AND ((pair_digest=d AND pair_expires_at>now() AND public_key IS NULL) OR (recovery_digest=d AND recovery_expires_at>now() AND public_key=k)) FOR UPDATE;
 scope:=mobile_workspace_preview(device.workspace_id,device.environment);
 IF device.id IS NULL OR scope IS NULL THEN RAISE EXCEPTION 'pairing unavailable' USING ERRCODE='42501'; END IF;
 UPDATE mobile_devices SET public_key=k,claimed_at=coalesce(claimed_at,now()),pair_digest=NULL,pair_expires_at=NULL,recovery_digest=d,recovery_expires_at=now()+interval '5 minutes' WHERE id=device.id;
 RETURN scope||jsonb_build_object('id',device.id,'physical_device',true,'control_device',true);
END $$;
CREATE FUNCTION mobile_device_key(i uuid) RETURNS TABLE(workspace_id uuid,environment text,public_key bytea,authorized boolean,financial_origin boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT d.workspace_id,d.environment,d.public_key,(d.revoked_at IS NULL AND d.public_key IS NOT NULL AND e.status='active'),d.financial_origin FROM mobile_devices d JOIN workspace_environments e ON e.workspace_id=d.workspace_id AND e.environment=d.environment WHERE d.id=i
$$;
CREATE FUNCTION mobile_device_adopt(i uuid,w uuid,e text,k bytea) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF octet_length(k) NOT BETWEEN 60 AND 256 THEN RETURN false; END IF;
 INSERT INTO mobile_devices(id,workspace_id,environment,name,public_key,claimed_at,financial_origin) VALUES(i,w,e,'Android',k,now(),true) ON CONFLICT(id) DO UPDATE SET public_key=EXCLUDED.public_key,claimed_at=now(),revoked_at=NULL
 WHERE mobile_devices.workspace_id=w AND mobile_devices.environment=e AND mobile_devices.financial_origin;
 RETURN EXISTS(SELECT 1 FROM mobile_devices WHERE id=i AND workspace_id=w AND environment=e AND public_key=k AND revoked_at IS NULL);
END $$;
CREATE FUNCTION mobile_device_touch(i uuid) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$ UPDATE mobile_devices SET heartbeat_at=now() WHERE id=i AND revoked_at IS NULL $$;
REVOKE ALL ON FUNCTION mobile_device_manage(uuid,text,text,uuid,text,text),mobile_device_preview(text),mobile_device_claim(text,bytea),mobile_device_key(uuid),mobile_device_adopt(uuid,uuid,text,bytea),mobile_device_touch(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mobile_device_manage(uuid,text,text,uuid,text,text),mobile_device_preview(text),mobile_device_claim(text,bytea),mobile_device_key(uuid),mobile_device_adopt(uuid,uuid,text,bytea),mobile_device_touch(uuid) TO ekmivo_financial_runtime;
-- Unlike pairing preview, an already authorized handset must learn both OFF too.
CREATE FUNCTION mobile_workspace_state(w uuid,e text) RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('workspace_id',b.id,'workspace_name',b.name,'environment',v.environment,
 'products',jsonb_build_object('ai',EXISTS(SELECT 1 FROM workspace_product_access p WHERE p.workspace_id=b.id AND p.product='ai' AND p.enabled),'payments',EXISTS(SELECT 1 FROM workspace_product_access p WHERE p.workspace_id=b.id AND p.product='payments' AND p.enabled)))
 FROM workspaces b JOIN workspace_environments v ON v.workspace_id=b.id WHERE b.id=w AND v.environment=e AND v.status='active'
$$;
REVOKE ALL ON FUNCTION mobile_workspace_state(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mobile_workspace_state(uuid,text) TO ekmivo_financial_runtime;
CREATE FUNCTION mobile_device_pair_exists(d text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM mobile_devices WHERE revoked_at IS NULL AND ((pair_digest=d AND pair_expires_at>now()) OR (recovery_digest=d AND recovery_expires_at>now())))
$$;
REVOKE ALL ON FUNCTION mobile_device_pair_exists(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION mobile_device_pair_exists(text) TO ekmivo_financial_runtime;
COMMIT;
