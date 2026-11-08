BEGIN;
CREATE OR REPLACE FUNCTION inbox_realtime_notify() RETURNS trigger LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN
 IF TG_OP='UPDATE' AND NEW IS NOT DISTINCT FROM OLD THEN RETURN NULL;END IF;
 PERFORM pg_notify('briofold_inbox_changed',CASE WHEN TG_OP='DELETE' THEN OLD.workspace_id::text ELSE NEW.workspace_id::text END);
 RETURN NULL;
END $$;
REVOKE ALL ON FUNCTION inbox_realtime_notify() FROM PUBLIC;
DO $$DECLARE n text;BEGIN
 FOREACH n IN ARRAY ARRAY['inbox_messages','inbox_threads','inbox_connections','inbox_reactions','inbox_read_cursors','inbox_media_sources'] LOOP
  EXECUTE format('DROP TRIGGER IF EXISTS inbox_realtime_change ON %I',n);
  EXECUTE format('CREATE TRIGGER inbox_realtime_change AFTER INSERT OR UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION inbox_realtime_notify()',n);
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION inbox_avatar_source(w uuid,e text,t uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM inbox_scope(w,e,t);
 RETURN (SELECT jsonb_build_object('provider',c.provider,'account',c.external_id,'customer',x.external_id,'credential',encode(c.credential_cipher,'base64')) FROM inbox_threads x JOIN inbox_connections c ON c.id=x.connection_id AND c.workspace_id=x.workspace_id WHERE x.id=t AND x.workspace_id=w AND c.environment=e AND c.enabled);
END $$;
REVOKE ALL ON FUNCTION inbox_avatar_source(uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION inbox_avatar_source(uuid,text,uuid) TO ekmivo_owner,ekmivo_financial_runtime,ekmivo_financial_projection;
CREATE OR REPLACE FUNCTION inbox_outgoing_media_reference(job uuid,ref bytea) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 INSERT INTO inbox_media_sources(id,workspace_id,thread_id,connection_id,reference_cipher,kind,name)
 SELECT f.id,m.workspace_id,m.thread_id,t.connection_id,ref,m.type,f.name
 FROM inbox_messages m JOIN inbox_threads t ON t.id=m.thread_id AND t.workspace_id=m.workspace_id
 JOIN inbox_media f ON f.id=(m.content->>'media_id')::uuid AND f.workspace_id=m.workspace_id AND f.thread_id=m.thread_id
 WHERE m.id=job AND m.sender<>'customer' AND m.type IN ('image','audio','document')
 ON CONFLICT(id) DO UPDATE SET reference_cipher=excluded.reference_cipher;
END $$;
REVOKE ALL ON FUNCTION inbox_outgoing_media_reference(uuid,bytea) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION inbox_outgoing_media_reference(uuid,bytea) TO ekmivo_financial_runtime,ekmivo_financial_projection;
COMMIT;
