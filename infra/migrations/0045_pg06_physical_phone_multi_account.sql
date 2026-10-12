-- One physical phone, many authorized receiving-account/source associations.
-- Additive: never rewrites historic pg06_devices, ingress or evidence.
BEGIN;
CREATE TABLE pg06_phones(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL, environment text NOT NULL,
 name text NOT NULL CHECK (length(name) BETWEEN 1 AND 80),
 pair_digest char(64) UNIQUE, pair_expires_at timestamptz,
 recovery_digest char(64) UNIQUE, recovery_expires_at timestamptz,
 public_key bytea, claimed_at timestamptz, revoked_at timestamptz,
 heartbeat_at timestamptz, permission_ok boolean NOT NULL DEFAULT false,
 backlog integer NOT NULL DEFAULT 0, overflow_count bigint NOT NULL DEFAULT 0,
 last_queue_error text NOT NULL DEFAULT '',model text NOT NULL DEFAULT '',app_version text NOT NULL DEFAULT '',
 config_version bigint NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,environment,id),
 FOREIGN KEY(workspace_id,environment) REFERENCES financial_workspace_registry(workspace_id,environment),
 CHECK ((public_key IS NULL)=(claimed_at IS NULL))
);
ALTER TABLE pg06_account_configuration ADD COLUMN label text NOT NULL DEFAULT '' CHECK(length(label)<=100);
ALTER TABLE pg06_devices ADD COLUMN physical_phone_id uuid;
CREATE UNIQUE INDEX pg06_one_source_per_phone ON pg06_devices(physical_phone_id,source,binding) WHERE physical_phone_id IS NOT NULL AND revoked_at IS NULL;
ALTER TABLE pg06_devices ADD CONSTRAINT pg06_physical_parent FOREIGN KEY(workspace_id,environment,physical_phone_id)
 REFERENCES pg06_phones(workspace_id,environment,id);
CREATE INDEX pg06_phone_associations ON pg06_devices(physical_phone_id) WHERE physical_phone_id IS NOT NULL;
-- Existing claimed enrollments retain their IDs/key and old queued evidence.
INSERT INTO pg06_phones(id,workspace_id,environment,name,public_key,claimed_at,revoked_at,
 heartbeat_at,permission_ok,backlog,overflow_count,last_queue_error,model,app_version,created_at)
SELECT id,workspace_id,environment,name,public_key,claimed_at,revoked_at,
 heartbeat_at,permission_ok,backlog,overflow_count,last_queue_error,model,app_version,created_at
FROM pg06_devices WHERE public_key IS NOT NULL AND claimed_at IS NOT NULL
ON CONFLICT(id) DO NOTHING;
UPDATE pg06_devices SET physical_phone_id=id
 WHERE public_key IS NOT NULL AND claimed_at IS NOT NULL AND physical_phone_id IS NULL;
ALTER TABLE pg06_phones ENABLE ROW LEVEL SECURITY;
ALTER TABLE pg06_phones FORCE ROW LEVEL SECURITY;
CREATE POLICY pg06_phone_owner ON pg06_phones TO CURRENT_USER USING(true) WITH CHECK(true);
REVOKE ALL ON pg06_phones FROM PUBLIC, ekmivo_finance_reader,ekmivo_financial_worker;

CREATE FUNCTION pg06_phone_begin(w uuid,e text,n text,d text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE phone pg06_phones;
BEGIN
 PERFORM pg06_scope(w,e);
 IF length(trim(n))<1 OR length(n)>80 OR d !~ '^[a-f0-9]{64}$' THEN
  RAISE EXCEPTION 'invalid phone registration' USING ERRCODE='22023';
 END IF;
 INSERT INTO pg06_phones(workspace_id,environment,name,pair_digest,pair_expires_at)
 VALUES(w,e,n,d,now()+interval '5 minutes') RETURNING * INTO phone;
 INSERT INTO pg09_audit(workspace_id,environment,resource,resource_id,action)
 VALUES(w,e,'phones',phone.id,'pair_issued');
 RETURN jsonb_build_object('id',phone.id,'expires_at',phone.pair_expires_at);
END $$;

CREATE FUNCTION pg06_phone_claim(d text,k bytea) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE phone pg06_phones;
BEGIN
 IF d !~ '^[a-f0-9]{64}$' OR octet_length(k) NOT BETWEEN 60 AND 256 THEN
  RAISE EXCEPTION 'pair unavailable' USING ERRCODE='42501';
 END IF;
 SELECT * INTO phone FROM pg06_phones
 WHERE revoked_at IS NULL AND (
  (pair_digest=d AND pair_expires_at>now() AND public_key IS NULL)
  OR (recovery_digest=d AND recovery_expires_at>now() AND public_key=k))
 FOR UPDATE;
 IF phone.id IS NULL OR NOT EXISTS(
   SELECT 1 FROM financial_workspace_registry r WHERE r.workspace_id=phone.workspace_id
   AND r.environment=phone.environment AND r.status='active'
 ) THEN RAISE EXCEPTION 'pair unavailable' USING ERRCODE='42501'; END IF;
 IF phone.public_key IS NULL THEN
  UPDATE pg06_phones SET public_key=k,claimed_at=now(),pair_digest=NULL,pair_expires_at=NULL,
   recovery_digest=d,recovery_expires_at=now()+interval '5 minutes' WHERE id=phone.id;
 END IF;
 RETURN jsonb_build_object('id',phone.id,'physical_device',true,
  'workspace_id',phone.workspace_id,'environment',phone.environment);
END $$;

CREATE FUNCTION pg06_phone_attach(w uuid,e text,phone_id uuid,acc uuid,n text,s text,p text,b text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE key bytea; assoc pg06_devices;
BEGIN
 PERFORM pg06_scope(w,e);
 SELECT public_key INTO key FROM pg06_phones WHERE id=phone_id AND workspace_id=w AND environment=e
  AND revoked_at IS NULL AND claimed_at IS NOT NULL FOR UPDATE;
 IF key IS NULL OR NOT EXISTS(
   SELECT 1 FROM financial_receiving_accounts a
   WHERE a.id=acc AND a.workspace_id=w AND a.environment=e
   AND NOT EXISTS(SELECT 1 FROM pg06_account_configuration c WHERE c.account_id=acc AND c.disabled_at IS NOT NULL)
 ) OR length(n)<1 OR length(n)>80 OR length(s)<1 OR length(s)>160
   OR length(p)<1 OR length(p)>80 OR length(b)<1 OR length(b)>160 THEN
  RAISE EXCEPTION 'invalid phone account/source' USING ERRCODE='42501';
 END IF;
 INSERT INTO pg06_devices(workspace_id,environment,physical_phone_id,account_id,name,source,parser_id,binding,public_key,claimed_at)
 VALUES(w,e,phone_id,acc,n,s,p,b,key,now()) RETURNING * INTO assoc;
 UPDATE pg06_phones SET config_version=config_version+1 WHERE id=phone_id;
 INSERT INTO pg09_audit(workspace_id,environment,resource,resource_id,action)
 VALUES(w,e,'devices',assoc.id,'attach_account');
 RETURN jsonb_build_object('id',assoc.id,'account_id',acc,'source',s,'binding',b,'parser_id',p);
END $$;

CREATE FUNCTION pg06_phone_detach(w uuid,e text,phone_id uuid,assoc_id uuid) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM pg06_scope(w,e);
 UPDATE pg06_devices SET revoked_at=now()
 WHERE id=assoc_id AND physical_phone_id=phone_id AND workspace_id=w AND environment=e AND revoked_at IS NULL;
 IF NOT FOUND THEN RETURN false; END IF;
 UPDATE pg06_phones SET config_version=config_version+1 WHERE id=phone_id;
 INSERT INTO pg09_audit(workspace_id,environment,resource,resource_id,action)
 VALUES(w,e,'devices',assoc_id,'detach_account');
 RETURN true;
END $$;

CREATE FUNCTION pg06_phone_action(w uuid,e text,phone_id uuid,act text,new_name text DEFAULT NULL)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM pg06_scope(w,e);
 IF act='rename' AND length(trim(new_name)) BETWEEN 1 AND 80 THEN
  UPDATE pg06_phones SET name=new_name WHERE id=phone_id AND workspace_id=w AND environment=e AND revoked_at IS NULL;
 ELSIF act='revoke' THEN
  UPDATE pg06_phones SET revoked_at=now(),config_version=config_version+1
   WHERE id=phone_id AND workspace_id=w AND environment=e AND revoked_at IS NULL;
  UPDATE pg06_devices SET revoked_at=now() WHERE physical_phone_id=phone_id AND revoked_at IS NULL;
 ELSE RAISE EXCEPTION 'invalid phone action' USING ERRCODE='22023'; END IF;
 IF NOT FOUND AND act='rename' THEN RETURN false; END IF;
 INSERT INTO pg09_audit(workspace_id,environment,resource,resource_id,action)
 VALUES(w,e,'phones',phone_id,act);
 RETURN true;
END $$;

CREATE FUNCTION pg06_phone_list(w uuid,e text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM pg06_scope(w,e);
 RETURN coalesce((SELECT jsonb_agg(jsonb_build_object(
 'id',p.id,'name',p.name,'created_at',p.created_at,'claimed_at',p.claimed_at,
 'revoked_at',p.revoked_at,'heartbeat_at',p.heartbeat_at,'permission_ok',p.permission_ok,
 'backlog',p.backlog,'overflow_count',p.overflow_count,'last_queue_error',p.last_queue_error,
 'model',p.model,'app_version',p.app_version,'config_version',p.config_version,
 'bindings',coalesce((SELECT jsonb_agg(jsonb_build_object(
  'id',d.id,'account_id',d.account_id,'source',d.source,'binding',d.binding,
  'parser_id',d.parser_id,'revoked_at',d.revoked_at,'last_receipt_at',
  (SELECT max(t.received_at) FROM pg06_transport t WHERE t.device_id=d.id)))
 FROM pg06_devices d WHERE d.physical_phone_id=p.id AND d.revoked_at IS NULL),'[]'::jsonb)))
 FROM pg06_phones p WHERE p.workspace_id=w AND p.environment=e),'[]'::jsonb);
END $$;

CREATE FUNCTION pg06_phone_configuration(phone_id uuid) RETURNS jsonb
LANGUAGE sql SECURITY DEFINER STABLE SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('id',p.id,'workspace_id',p.workspace_id,
 'environment',p.environment,'config_version',p.config_version,'bindings',
 coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'account_id',d.account_id,
 'source',d.source,'binding',d.binding,'parser_id',d.parser_id))
 FROM pg06_devices d WHERE d.physical_phone_id=p.id AND d.revoked_at IS NULL
 AND NOT EXISTS(SELECT 1 FROM pg06_account_configuration c WHERE c.account_id=d.account_id AND c.disabled_at IS NOT NULL)),'[]'::jsonb))
 FROM pg06_phones p JOIN financial_workspace_registry r USING(workspace_id,environment)
 WHERE p.id=$1 AND p.revoked_at IS NULL AND p.public_key IS NOT NULL AND r.status='active'
$$;

CREATE FUNCTION pg06_phone_heartbeat(phone_id uuid,permission boolean,pending integer,model_name text,version_name text,overflows bigint,queue_error text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF pending NOT BETWEEN 0 AND 10000 OR overflows<0 OR length(queue_error)>64 OR queue_error !~ '^[A-Z0-9_]*$'
 THEN RAISE EXCEPTION 'invalid phone health' USING ERRCODE='22023'; END IF;
 UPDATE pg06_phones SET heartbeat_at=now(),permission_ok=permission,backlog=pending,
  model=left(model_name,80),app_version=left(version_name,40),
  overflow_count=greatest(overflow_count,overflows),last_queue_error=queue_error
 WHERE id=phone_id AND revoked_at IS NULL AND public_key IS NOT NULL;
 RETURN FOUND;
END $$;

CREATE FUNCTION pg06_phone_key(phone_id uuid)
RETURNS TABLE(workspace_id uuid,environment text,public_key bytea,entitlement_version bigint)
LANGUAGE sql SECURITY DEFINER STABLE SET search_path=public,pg_temp AS $$
 SELECT p.workspace_id,p.environment,p.public_key,r.entitlement_version
 FROM pg06_phones p JOIN financial_workspace_registry r USING(workspace_id,environment)
 WHERE p.id=$1 AND p.revoked_at IS NULL AND p.public_key IS NOT NULL AND r.status='active'
$$;

CREATE FUNCTION pg06_phone_account_cipher(w uuid,e text) RETURNS TABLE(
 account_id uuid,method text,display_suffix text,account_label text,number_cipher bytea,disabled_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM pg06_scope(w,e);
 RETURN QUERY SELECT a.id,a.method,a.display_suffix,c.label,c.number_cipher,c.disabled_at
 FROM financial_receiving_accounts a JOIN pg06_account_configuration c ON c.account_id=a.id
 WHERE a.workspace_id=w AND a.environment=e;
END $$;

CREATE FUNCTION pg06_phone_account_label(w uuid,e text,a uuid,n text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM pg06_scope(w,e);
 IF length(trim(n))>100 THEN RAISE EXCEPTION 'invalid account label' USING ERRCODE='22023'; END IF;
 UPDATE pg06_account_configuration SET label=trim(n) WHERE account_id=a AND
 EXISTS(SELECT 1 FROM financial_receiving_accounts f WHERE f.id=a AND f.workspace_id=w AND f.environment=e);
 IF NOT FOUND THEN RETURN false; END IF;
 INSERT INTO pg09_audit(workspace_id,environment,resource,resource_id,action) VALUES(w,e,'gateways',a,'rename');
 RETURN true;
END $$;

CREATE FUNCTION pg06_phone_account_edit(w uuid,e text,a uuid,n text,identity text,suffix text,ciphertext bytea)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM pg06_scope(w,e);
 IF length(trim(n))>100 THEN RAISE EXCEPTION 'invalid account label' USING ERRCODE='22023'; END IF;
 IF identity IS NULL THEN RETURN pg06_phone_account_label(w,e,a,n); END IF;
 IF identity !~ '^[a-f0-9]{64}$' OR suffix !~ '^[0-9]{4}$' OR octet_length(ciphertext)<29 THEN
  RAISE EXCEPTION 'invalid receiving identity' USING ERRCODE='22023';
 END IF;
 IF EXISTS(SELECT 1 FROM pg06_devices WHERE account_id=a)
  OR EXISTS(SELECT 1 FROM payment_attempts WHERE receiving_account_id=a)
  OR EXISTS(SELECT 1 FROM financial_receipt_observations WHERE receiving_account_id=a) THEN
  RAISE EXCEPTION 'receiving identity has history; create a new account' USING ERRCODE='23514';
 END IF;
 UPDATE financial_receiving_accounts SET identity_hmac=identity,display_suffix=suffix
 WHERE id=a AND workspace_id=w AND environment=e;
 IF NOT FOUND THEN RETURN false; END IF;
 UPDATE pg06_account_configuration SET number_cipher=ciphertext,label=trim(n) WHERE account_id=a;
 INSERT INTO pg09_audit(workspace_id,environment,resource,resource_id,action) VALUES(w,e,'gateways',a,'edit_unlinked');
 RETURN true;
END $$;

-- Signed Go ingress validates the enrollment ID before accessing ciphertext.
CREATE FUNCTION pg06_device_receiving_cipher(dev uuid) RETURNS bytea
LANGUAGE sql SECURITY DEFINER STABLE SET search_path=public,pg_temp AS $$
 SELECT c.number_cipher FROM pg06_devices d
 JOIN pg06_account_configuration c ON c.account_id=d.account_id AND c.disabled_at IS NULL
 LEFT JOIN pg06_phones p ON p.id=d.physical_phone_id
 WHERE d.id=$1 AND d.revoked_at IS NULL AND d.public_key IS NOT NULL
  AND (d.physical_phone_id IS NULL OR p.revoked_at IS NULL)
$$;

REVOKE ALL ON FUNCTION pg06_phone_account_label(uuid,text,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION pg06_phone_account_edit(uuid,text,uuid,text,text,text,bytea) FROM PUBLIC;
REVOKE ALL ON FUNCTION pg06_device_receiving_cipher(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pg06_phone_account_label(uuid,text,uuid,text),
 pg06_phone_account_edit(uuid,text,uuid,text,text,text,bytea),
 pg06_device_receiving_cipher(uuid) TO ekmivo_finance_reader;
REVOKE ALL ON FUNCTION pg06_phone_begin(uuid,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION pg06_phone_claim(text,bytea) FROM PUBLIC;
REVOKE ALL ON FUNCTION pg06_phone_attach(uuid,text,uuid,uuid,text,text,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION pg06_phone_detach(uuid,text,uuid,uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION pg06_phone_action(uuid,text,uuid,text,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION pg06_phone_list(uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION pg06_phone_configuration(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION pg06_phone_heartbeat(uuid,boolean,integer,text,text,bigint,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION pg06_phone_key(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION pg06_phone_account_cipher(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pg06_phone_begin(uuid,text,text,text),pg06_phone_claim(text,bytea),
 pg06_phone_attach(uuid,text,uuid,uuid,text,text,text,text),pg06_phone_detach(uuid,text,uuid,uuid),
 pg06_phone_action(uuid,text,uuid,text,text),pg06_phone_list(uuid,text),
 pg06_phone_configuration(uuid),pg06_phone_heartbeat(uuid,boolean,integer,text,text,bigint,text),
 pg06_phone_key(uuid),pg06_phone_account_cipher(uuid,text) TO ekmivo_finance_reader;
COMMIT;
