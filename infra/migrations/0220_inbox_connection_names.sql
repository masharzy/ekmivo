ALTER TABLE inbox_connections ADD COLUMN display_name text;

CREATE FUNCTION inbox_connection_named(w uuid,e text,p text,x text,k bytea,n text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE connection_id uuid;
BEGIN
  connection_id := inbox_connection(w,e,p,x,k);
  UPDATE inbox_connections
  SET display_name = COALESCE(NULLIF(left(btrim(n), 255), ''), display_name)
  WHERE id = connection_id AND workspace_id = w AND environment = e;
  RETURN connection_id;
END
$$;

REVOKE ALL ON FUNCTION inbox_connection_named(uuid,text,text,text,bytea,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION inbox_connection_named(uuid,text,text,text,bytea,text) TO ekmivo_financial_runtime,ekmivo_financial_projection;

CREATE OR REPLACE FUNCTION inbox_connection_list(w uuid,e text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
  SELECT jsonb_build_object('items', COALESCE(jsonb_agg(
    jsonb_build_object('id',id,'provider',provider,'enabled',enabled,'external_id',external_id,'display_name',display_name)
    ORDER BY created_at), '[]'::jsonb))
  FROM inbox_connections WHERE workspace_id=w AND environment=e
$$;
