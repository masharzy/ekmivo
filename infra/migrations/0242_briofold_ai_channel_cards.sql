BEGIN;

CREATE OR REPLACE FUNCTION briofold_ai_channel_finish_cards(job uuid,lease uuid,body text,cards jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 IF jsonb_typeof(cards->'cards') IS DISTINCT FROM 'array' OR jsonb_array_length(cards->'cards') NOT BETWEEN 1 AND 10
  OR pg_column_size(cards)>16384 THEN
  RAISE EXCEPTION 'Invalid AI catalog cards' USING ERRCODE='22023';
 END IF;
 result:=briofold_ai_channel_finish(job,lease,body,'');
 IF coalesce((result->>'queued')::boolean,false) THEN
  UPDATE inbox_messages SET content=content||jsonb_build_object('ai_cards',cards)
  WHERE id=(result->>'id')::uuid AND sender='ai' AND state='queued' AND NOT (content ? 'ai_cards');
 END IF;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION briofold_ai_channel_button_thread(c uuid,w uuid,external text)
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT t.id FROM inbox_threads t JOIN inbox_connections n ON n.id=t.connection_id AND n.enabled AND n.workspace_id=w
 WHERE t.connection_id=c AND t.workspace_id=w AND t.external_id=external
$$;

CREATE OR REPLACE FUNCTION briofold_ai_website_button_scope(sid uuid,o text,secret text)
RETURNS TABLE(workspace_id uuid,thread_id uuid)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT s.workspace_id,v.thread_id
 FROM briofold_website_sites s JOIN briofold_website_visitors v ON v.site_id=s.id
 WHERE s.id=sid AND v.secret_hash=secret AND v.expires_at>now() AND briofold_website_origin(sid,o)
$$;

CREATE OR REPLACE FUNCTION briofold_ai_website_cards(sid uuid,o text,secret text,sequences bigint[])
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_object_agg(m.sequence,m.content->'ai_cards'),'{}')
 FROM briofold_ai_website_button_scope(sid,o,secret) scope
 JOIN inbox_messages m ON m.thread_id=scope.thread_id AND m.workspace_id=scope.workspace_id
 WHERE cardinality(sequences)<=50 AND m.sequence=ANY(sequences) AND m.sender='ai'
  AND m.state IN ('sent','delivered','seen') AND m.content ? 'ai_cards'
$$;

REVOKE ALL ON FUNCTION briofold_ai_channel_finish_cards(uuid,uuid,text,jsonb),briofold_ai_channel_button_thread(uuid,uuid,text),briofold_ai_website_button_scope(uuid,text,text),briofold_ai_website_cards(uuid,text,text,bigint[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION briofold_ai_channel_finish_cards(uuid,uuid,text,jsonb),briofold_ai_channel_button_thread(uuid,uuid,text),briofold_ai_website_button_scope(uuid,text,text),briofold_ai_website_cards(uuid,text,text,bigint[]) TO ekmivo_financial_runtime,ekmivo_financial_projection;
COMMIT;
