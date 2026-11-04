CREATE OR REPLACE FUNCTION inbox_ingest(c uuid,p text,s text,n text,b text,k text,at_time timestamptz) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE conn inbox_connections; t uuid; inserted integer;
BEGIN
 SELECT * INTO conn FROM inbox_connections WHERE id=c AND enabled;
 IF conn.id IS NULL THEN RETURN false; END IF;
 INSERT INTO inbox_threads(workspace_id,connection_id,external_id,customer_name,last_customer_at,last_activity_at) VALUES(conn.workspace_id,c,s,coalesce(nullif(left(n,255),''),s),at_time,at_time) ON CONFLICT(connection_id,external_id) DO UPDATE SET customer_name=CASE WHEN inbox_threads.customer_name=inbox_threads.external_id AND nullif(n,'') IS NOT NULL THEN left(n,255) ELSE inbox_threads.customer_name END, last_customer_at=greatest(inbox_threads.last_customer_at,EXCLUDED.last_customer_at),last_activity_at=greatest(inbox_threads.last_activity_at,EXCLUDED.last_activity_at) RETURNING id INTO t;
 INSERT INTO inbox_messages(workspace_id,thread_id,sender,type,body,provider_id,state,created_at) VALUES(conn.workspace_id,t,'customer',k,b,p,'received',at_time) ON CONFLICT(thread_id,provider_id) DO NOTHING;
 GET DIAGNOSTICS inserted=ROW_COUNT;RETURN inserted>0;
END $$;
