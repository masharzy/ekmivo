-- 0086: Reconnect and delete an existing physical SMS phone without changing its ID.
-- Financial realms only. No historical receipt, audit or transaction rows are deleted.
BEGIN;
ALTER TABLE pg06_phones ADD COLUMN IF NOT EXISTS deleted_at timestamptz;

CREATE OR REPLACE FUNCTION pg06_phone_reconnect(w uuid,e text,phone_id uuid,d text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE phone pg06_phones;
BEGIN
 PERFORM pg06_scope(w,e);
 IF d !~ '^[a-f0-9]{64}$' THEN RAISE EXCEPTION 'invalid pairing code' USING ERRCODE='22023'; END IF;
 SELECT * INTO phone FROM pg06_phones p
 WHERE p.id=phone_id AND p.workspace_id=w AND p.environment=e AND p.deleted_at IS NULL FOR UPDATE;
 IF phone.id IS NULL OR NOT (
  phone.revoked_at IS NOT NULL OR
  (phone.public_key IS NULL AND phone.claimed_at IS NULL AND
   (phone.pair_expires_at IS NULL OR phone.pair_expires_at<=now()))
 ) THEN RAISE EXCEPTION 'PHONE_RECONNECT_UNAVAILABLE' USING ERRCODE='22023'; END IF;
 -- Invalidates the previous signed device and all pending/recovery pairing codes.
 UPDATE pg06_phones SET public_key=NULL,claimed_at=NULL,revoked_at=NULL,
  pair_digest=d,pair_expires_at=now()+interval '5 minutes',
  recovery_digest=NULL,recovery_expires_at=NULL,heartbeat_at=NULL,
  permission_ok=false,backlog=0,last_queue_error='',config_version=config_version+1
 WHERE id=phone_id RETURNING * INTO phone;
 INSERT INTO pg09_audit(workspace_id,environment,resource,resource_id,action)
 VALUES(w,e,'phones',phone_id,'pair_reissued');
 RETURN jsonb_build_object('id',phone.id,'expires_at',phone.pair_expires_at);
END $$;

CREATE OR REPLACE FUNCTION pg06_phone_delete(w uuid,e text,phone_id uuid)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE phone pg06_phones;
BEGIN
 PERFORM pg06_scope(w,e);
 UPDATE pg06_phones SET deleted_at=now(),revoked_at=coalesce(revoked_at,now()),
  public_key=NULL,claimed_at=NULL,pair_digest=NULL,pair_expires_at=NULL,
  recovery_digest=NULL,recovery_expires_at=NULL,heartbeat_at=NULL,
  permission_ok=false,backlog=0,last_queue_error='',config_version=config_version+1
 WHERE id=phone_id AND workspace_id=w AND environment=e AND deleted_at IS NULL RETURNING * INTO phone;
 IF phone.id IS NULL THEN RETURN false; END IF;
 UPDATE pg06_devices SET revoked_at=now()
 WHERE physical_phone_id=phone_id AND workspace_id=w AND environment=e AND revoked_at IS NULL;
 INSERT INTO pg09_audit(workspace_id,environment,resource,resource_id,action)
 VALUES(w,e,'phones',phone_id,'delete');
 RETURN true;
END $$;

-- Retain all previously installed fields (notably receipt_count) in pg06_phone_list.
-- Update the exact function expression rather than replacing a read-model wholesale.
DO $list$
DECLARE definition text;
BEGIN
 definition:=pg_get_functiondef('public.pg06_phone_list(uuid,text)'::regprocedure);
 IF position('p.deleted_at IS NULL' IN definition)=0 THEN
  IF position('WHERE p.workspace_id=w AND p.environment=e' IN definition)=0 THEN
   RAISE EXCEPTION '0086 unknown phone list function';
  END IF;
  definition:=replace(definition,'WHERE p.workspace_id=w AND p.environment=e',
    'WHERE p.workspace_id=w AND p.environment=e AND p.deleted_at IS NULL');
 END IF;
 IF position('''pair_expires_at'',p.pair_expires_at' IN definition)=0 THEN
  IF position('''claimed_at'',p.claimed_at,' IN definition)=0 THEN
   RAISE EXCEPTION '0086 unknown phone pairing fields';
  END IF;
  definition:=replace(definition,'''claimed_at'',p.claimed_at,',
    '''claimed_at'',p.claimed_at,''pair_expires_at'',p.pair_expires_at,');
 END IF;
 EXECUTE definition;
END
$list$;

REVOKE ALL ON FUNCTION pg06_phone_reconnect(uuid,text,uuid,text) FROM PUBLIC;
REVOKE ALL ON FUNCTION pg06_phone_delete(uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pg06_phone_reconnect(uuid,text,uuid,text),
 pg06_phone_delete(uuid,text,uuid) TO ekmivo_finance_reader;
COMMIT;
