-- Both financial realms. Keep immutable account/payment history; deletion is a tombstone.
BEGIN;
ALTER TABLE pg06_account_configuration ADD COLUMN deleted_at timestamptz;
DROP INDEX financial_exclusive_receiving_identity;
CREATE INDEX financial_receiving_identity_lookup ON financial_receiving_accounts(environment,method,identity_hmac);
CREATE FUNCTION pg06_account_add(w uuid,e text,m text,identity text,suffix text,ciphertext bytea,consent boolean) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a uuid; removed timestamptz; shared boolean;
BEGIN
 PERFORM pg06_scope(w,e);
 IF identity IS NULL OR identity !~ '^[a-f0-9]{64}$' OR suffix IS NULL OR suffix !~ '^[0-9]{4}$' OR m IS NULL OR m NOT IN ('bkash','nagad','rocket') OR ciphertext IS NULL OR octet_length(ciphertext)<29 THEN RAISE EXCEPTION 'invalid receiving account' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(e||'|'||m||'|'||identity,95));
 SELECT f.id,c.deleted_at INTO a,removed FROM financial_receiving_accounts f LEFT JOIN pg06_account_configuration c ON c.account_id=f.id WHERE f.workspace_id=w AND f.environment=e AND f.method=m AND f.identity_hmac=identity;
 IF a IS NOT NULL AND removed IS NULL THEN RAISE EXCEPTION 'account already exists' USING ERRCODE='23505';END IF;
 SELECT EXISTS(SELECT 1 FROM financial_receiving_accounts f JOIN pg06_account_configuration c ON c.account_id=f.id WHERE f.workspace_id<>w AND f.environment=e AND f.method=m AND f.identity_hmac=identity AND c.deleted_at IS NULL) INTO shared;
 IF shared AND consent IS DISTINCT FROM true THEN RAISE EXCEPTION 'receiving consent required' USING ERRCODE='P6901';END IF;
 IF a IS NULL THEN
  INSERT INTO financial_receiving_accounts(workspace_id,environment,method,identity_hmac,display_suffix) VALUES(w,e,m,identity,suffix) RETURNING id INTO a;
  INSERT INTO pg06_account_configuration(workspace_id,environment,account_id,number_cipher) VALUES(w,e,a,ciphertext);
 ELSE
  UPDATE pg06_account_configuration SET deleted_at=NULL,disabled_at=NULL,number_cipher=ciphertext,label='' WHERE account_id=a;
 END IF;
 INSERT INTO pg09_audit(workspace_id,environment,resource,resource_id,action) VALUES(w,e,'gateways',a,CASE WHEN shared THEN 'create_shared_consent' ELSE 'create' END);
 RETURN jsonb_build_object('id',a,'method',m,'display_suffix',suffix);
END $$;
-- Keep old callers safe: they must obtain consent before sharing, too.
CREATE OR REPLACE FUNCTION pg06_account(w uuid,e text,m text,identity text,suffix text,ciphertext bytea) RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT pg06_account_add(w,e,m,identity,suffix,ciphertext,false) $$;
CREATE FUNCTION pg06_account_delete(w uuid,e text,a uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM pg06_scope(w,e);
 UPDATE pg06_account_configuration SET deleted_at=coalesce(deleted_at,now()),disabled_at=coalesce(disabled_at,now()) WHERE workspace_id=w AND environment=e AND account_id=a;
 IF NOT FOUND THEN RAISE EXCEPTION 'account not found' USING ERRCODE='P0002';END IF;
 INSERT INTO pg09_audit(workspace_id,environment,resource,resource_id,action) VALUES(w,e,'gateways',a,'delete');
 RETURN jsonb_build_object('deleted',true);
END $$;
CREATE OR REPLACE FUNCTION pg06_phone_account_cipher(w uuid,e text) RETURNS TABLE(account_id uuid,method text,display_suffix text,account_label text,number_cipher bytea,disabled_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM pg06_scope(w,e);
 RETURN QUERY SELECT a.id,a.method,a.display_suffix::text,c.label,c.number_cipher,c.disabled_at FROM financial_receiving_accounts a JOIN pg06_account_configuration c ON c.account_id=a.id WHERE a.workspace_id=w AND a.environment=e AND c.deleted_at IS NULL;
END $$;
-- Deleted accounts cannot be re-enabled through a stale request.
DO $$ DECLARE d text;BEGIN
 SELECT pg_get_functiondef('pg09_action(uuid,text,text,uuid,text,jsonb,bytea)'::regprocedure) INTO d;
 d:=replace(d,'BEGIN', 'BEGIN IF resource=''gateways'' AND EXISTS(SELECT 1 FROM pg06_account_configuration WHERE account_id=resource_id AND workspace_id=w AND environment=e AND deleted_at IS NOT NULL) THEN RAISE EXCEPTION ''account deleted'' USING ERRCODE=''42501'';END IF;');
 EXECUTE d;
END $$;
REVOKE ALL ON FUNCTION pg06_account_add(uuid,text,text,text,text,bytea,boolean),pg06_account_delete(uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pg06_account_add(uuid,text,text,text,text,bytea,boolean),pg06_account_delete(uuid,text,uuid) TO ekmivo_finance_reader;
COMMIT;
