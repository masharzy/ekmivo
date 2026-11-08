BEGIN;
CREATE OR REPLACE FUNCTION inbox_media_source(w uuid,e text,t uuid,i uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN PERFORM inbox_scope(w,e,t);RETURN (SELECT jsonb_build_object('reference',encode(s.reference_cipher,'base64'),'credential',encode(c.credential_cipher,'base64'),'account',c.external_id,'provider',c.provider,'kind',s.kind,'provider_message_id',(SELECT m.provider_id FROM inbox_messages m WHERE m.workspace_id=w AND m.thread_id=s.thread_id AND m.content->>'media_id'=s.id::text ORDER BY m.created_at LIMIT 1)) FROM inbox_media_sources s JOIN inbox_connections c ON c.id=s.connection_id WHERE s.id=i AND s.workspace_id=w AND (s.thread_id=t OR EXISTS(SELECT 1 FROM inbox_messages WHERE thread_id=t AND workspace_id=w AND content->>'media_id'=i::text)));END $$;

CREATE OR REPLACE FUNCTION inbox_source_metadata(w uuid,t uuid,i uuid,ref bytea,sticker boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT EXISTS (SELECT 1 FROM inbox_media_sources s WHERE s.id=i AND s.workspace_id=w AND
 (s.thread_id=t OR EXISTS (SELECT 1 FROM inbox_messages m WHERE m.workspace_id=w AND m.thread_id=t AND m.content->>'media_id'=i::text)))
 THEN RAISE EXCEPTION 'media source unavailable' USING ERRCODE='42501';END IF;
 UPDATE inbox_media_sources SET reference_cipher=ref WHERE id=i AND workspace_id=w;
 IF sticker THEN
  UPDATE inbox_messages SET content=content||jsonb_build_object('sticker',true)
  WHERE workspace_id=w AND content->>'media_id'=i::text;
 END IF;
END $$;
REVOKE ALL ON FUNCTION inbox_source_metadata(uuid,uuid,uuid,bytea,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION inbox_source_metadata(uuid,uuid,uuid,bytea,boolean)
 TO ekmivo_financial_runtime,ekmivo_financial_projection,ekmivo_owner;
COMMIT;
