-- CONTROL only. Preserve financial IDs, wallet metering and channel guards.
BEGIN;
DO $$BEGIN
 IF to_regclass('public.channel_platform_config') IS NULL OR to_regclass('public.financial_realm') IS NOT NULL THEN RAISE EXCEPTION '0216 requires CONTROL 0212';END IF;
END $$;
ALTER TABLE inbox_messages DROP CONSTRAINT inbox_messages_type_check;
ALTER TABLE inbox_messages ADD CONSTRAINT inbox_messages_type_check CHECK(type IN ('text','unsupported','image','audio','video','document','product','reaction'));
ALTER TABLE inbox_media_sources DROP CONSTRAINT inbox_media_sources_kind_check;
ALTER TABLE inbox_media_sources ADD CONSTRAINT inbox_media_sources_kind_check CHECK(kind IN ('image','audio','video','document'));
-- The webhook transaction stores encrypted sources before jobs become visible.
-- Modify only known predicates; retain all current access/policy guards.
DO $$DECLARE d text;claim_function regprocedure;BEGIN
 SELECT pg_get_functiondef('briofold_ai_channel_enqueue()'::regprocedure) INTO d;
 IF position('NEW.type<>''text'' OR length(trim(NEW.body))=0' IN d)=0 THEN RAISE EXCEPTION 'Unexpected AI enqueue definition';END IF;
 d:=replace(d,'NEW.type<>''text'' OR length(trim(NEW.body))=0','NEW.type NOT IN (''text'',''image'',''audio'',''video'') OR (NEW.type=''text'' AND length(trim(NEW.body))=0)');
 EXECUTE d;
 claim_function:=coalesce(to_regprocedure('briofold_ai_channel_claim_before_policy()'),to_regprocedure('briofold_ai_channel_claim()'));
 SELECT pg_get_functiondef(claim_function) INTO d;
 IF position('j.publication_id,msg.body)' IN d)=0 OR position('IF jsonb_array_length(ctx->''knowledge'')=0 AND jsonb_array_length(ctx->''products'')=0 THEN' IN d)=0 THEN RAISE EXCEPTION 'Unexpected AI claim definition';END IF;
 d:=replace(d,'j.publication_id,msg.body)','j.publication_id,CASE WHEN msg.type IN (''image'',''audio'',''video'') THEN coalesce(nullif(msg.body,''''),''Please understand the customer attachment.'') ELSE msg.body END)');
 d:=replace(d,'IF jsonb_array_length(ctx->''knowledge'')=0 AND jsonb_array_length(ctx->''products'')=0 THEN','IF msg.type NOT IN (''image'',''audio'',''video'') AND jsonb_array_length(ctx->''knowledge'')=0 AND jsonb_array_length(ctx->''products'')=0 THEN');
 EXECUTE d;
 SELECT pg_get_functiondef('briofold_ai_channel_finish(uuid,uuid,text,text)'::regprocedure) INTO d;
 IF position('''AI_INVALID_OUTPUT''' IN d)=0 THEN RAISE EXCEPTION 'Unexpected AI finish definition';END IF;
 EXECUTE replace(d,'''AI_INVALID_OUTPUT''','''AI_INVALID_OUTPUT'',''AI_MEDIA_UNAVAILABLE''');
END $$;
-- Exact leased-job lookup only: no caller-selected tenant, thread or media ID.
CREATE FUNCTION briofold_ai_channel_media(job uuid,lease uuid) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j briofold_ai_channel_jobs;m inbox_messages;r jsonb;policy_valid boolean;BEGIN
 SELECT * INTO j FROM briofold_ai_channel_jobs WHERE id=job AND lease_id=lease AND state='running' AND leased_at>now()-interval '2 minutes';
 IF j.id IS NULL OR NOT briofold_ai_channel_valid(job)  THEN RAISE EXCEPTION 'AI media access revoked' USING ERRCODE='42501';END IF;
 IF to_regprocedure('briofold_channel_work_valid(uuid,uuid)') IS NOT NULL THEN
  EXECUTE 'SELECT briofold_channel_work_valid($1,$2)' INTO policy_valid USING job,lease;
  IF policy_valid IS DISTINCT FROM true THEN RAISE EXCEPTION 'AI channel policy changed' USING ERRCODE='42501';END IF;
 END IF;
 SELECT * INTO m FROM inbox_messages WHERE id=j.inbound_id AND workspace_id=j.workspace_id AND thread_id=j.thread_id;
 IF m.type NOT IN ('image','audio','video') THEN RETURN NULL;END IF;
 SELECT jsonb_build_object('reference',encode(s.reference_cipher,'base64'),'credential',encode(c.credential_cipher,'base64'),'provider',c.provider,'account',c.external_id,'kind',s.kind) INTO r
 FROM inbox_media_sources s JOIN inbox_connections c ON c.id=s.connection_id AND c.enabled AND c.environment='live'
 JOIN inbox_threads t ON t.id=j.thread_id AND t.connection_id=c.id
 WHERE s.id=(m.content->>'media_id')::uuid AND s.workspace_id=j.workspace_id AND s.thread_id=j.thread_id AND s.kind=m.type;
 IF r IS NULL THEN RAISE EXCEPTION 'AI media source unavailable' USING ERRCODE='42501';END IF;
 RETURN r;
END $$;
REVOKE ALL ON FUNCTION briofold_ai_channel_media(uuid,uuid) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION briofold_ai_channel_media(uuid,uuid) TO ekmivo_financial_projection;
COMMIT;
