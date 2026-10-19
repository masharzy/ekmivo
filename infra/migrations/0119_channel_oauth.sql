BEGIN;
CREATE TABLE inbox_oauth_states(digest text PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES workspaces(id),environment text NOT NULL CHECK(environment IN ('live','sandbox')),actor_id uuid NOT NULL REFERENCES app_users(id),provider text NOT NULL CHECK(provider IN ('wa','ig','ms')),expires_at timestamptz NOT NULL,consumed_at timestamptz);
ALTER TABLE inbox_oauth_states ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON inbox_oauth_states FROM PUBLIC,ekmivo_financial_runtime;
CREATE FUNCTION inbox_oauth_begin(d text,w uuid,e text,a uuid,p text) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 INSERT INTO inbox_oauth_states VALUES(d,w,e,a,p,now()+interval '10 minutes',NULL)
$$;
CREATE FUNCTION inbox_oauth_consume(d text,a uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE state inbox_oauth_states;
BEGIN
 UPDATE inbox_oauth_states SET consumed_at=now() WHERE digest=d AND actor_id=a AND expires_at>now() AND consumed_at IS NULL RETURNING * INTO state;
 IF state.digest IS NULL THEN RAISE EXCEPTION 'OAuth state unavailable' USING ERRCODE='42501'; END IF;
 RETURN jsonb_build_object('workspace_id',state.workspace_id,'environment',state.environment,'provider',state.provider);
END $$;
REVOKE ALL ON FUNCTION inbox_oauth_begin(text,uuid,text,uuid,text),inbox_oauth_consume(text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION inbox_oauth_begin(text,uuid,text,uuid,text),inbox_oauth_consume(text,uuid) TO ekmivo_financial_runtime,ekmivo_financial_projection;
COMMIT;
