-- Run only in an explicitly isolated CONTROL Neon branch. All fixture writes
-- (including queue isolation) roll back inside the caught subtransaction.
DO $test$
DECLARE a uuid:=gen_random_uuid();w uuid:=gen_random_uuid();c uuid;t uuid;v uuid:=gen_random_uuid();media uuid;job jsonb;source jsonb;kind text;ref bytea:=decode('abcd','hex');
BEGIN
 BEGIN
  UPDATE briofold_ai_channel_jobs SET state='cancelled' WHERE state IN ('queued','running');
  INSERT INTO app_users(id,email,display_name,password_hash) VALUES(a,'multimodal-'||a||'@example.test','Media test','not-a-login-hash');
  INSERT INTO workspaces(id,name,service_mode,created_by) VALUES(w,'Isolated multimodal fixture','ai',a);
  INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(w,a,'owner') ON CONFLICT DO NOTHING;
  UPDATE workspace_product_access SET enabled=true WHERE workspace_id=w AND product='ai';
  c:=inbox_connection(w,'live','tg','fixture-'||w,ref);
  INSERT INTO briofold_ai_studio_versions(id,workspace_id,publication,config,actor_id,reason) VALUES(v,w,1,'{"mode":"live","model":"qwen/qwen3.8-omni-flash","language":"auto","instructions":"Answer concisely"}',a,'isolated media verification');
  INSERT INTO briofold_ai_studio_drafts(workspace_id,revision,config,published_id) SELECT w,1,config,v FROM briofold_ai_studio_versions WHERE id=v;
  FOREACH kind IN ARRAY ARRAY['image','audio','video'] LOOP
   media:=inbox_inbound_media(c,'fixture-'||kind,'customer-'||kind,'Customer',kind,ref,now());
   IF media IS NULL THEN RAISE EXCEPTION 'media not ingested';END IF;
   -- Provider replay cannot create another source or another AI job.
   IF inbox_inbound_media(c,'fixture-'||kind,'customer-'||kind,'Customer',kind,ref,now())<>media THEN RAISE EXCEPTION 'duplicate source';END IF;
   SELECT thread_id INTO t FROM inbox_media_sources WHERE id=media;
   IF (SELECT count(*) FROM briofold_ai_channel_jobs WHERE thread_id=t)<>1 THEN RAISE EXCEPTION 'duplicate/missing media job';END IF;
   job:=briofold_ai_channel_claim();
   IF job IS NULL OR (job->>'thread_id')::uuid<>t THEN RAISE EXCEPTION 'media job not claimed: %', (SELECT jsonb_agg(jsonb_build_object('state',state,'reason',reason)) FROM briofold_ai_channel_jobs WHERE workspace_id=w);END IF;
   source:=briofold_ai_channel_media((job->>'id')::uuid,(job->>'lease_id')::uuid);
   IF source->>'kind' IS DISTINCT FROM kind OR source->>'provider'<>'tg' THEN RAISE EXCEPTION 'wrong media source';END IF;
   BEGIN
    PERFORM briofold_ai_channel_media((job->>'id')::uuid,gen_random_uuid());
    RAISE EXCEPTION 'invalid lease accepted';
   EXCEPTION WHEN insufficient_privilege THEN NULL;END;
   UPDATE inbox_threads SET ai_enabled=false WHERE id=t;
   BEGIN
    PERFORM briofold_ai_channel_media((job->>'id')::uuid,(job->>'lease_id')::uuid);
    RAISE EXCEPTION 'takeover accepted';
   EXCEPTION WHEN insufficient_privilege THEN NULL;END;
   UPDATE briofold_ai_channel_jobs SET state='cancelled' WHERE id=(job->>'id')::uuid;
  END LOOP;
  UPDATE workspace_product_access SET enabled=false WHERE workspace_id=w AND product='ai';
  PERFORM inbox_inbound_media(c,'disabled-image','disabled-customer','Customer','image',ref,now());
  IF EXISTS(SELECT 1 FROM briofold_ai_channel_jobs j JOIN inbox_messages m ON m.id=j.inbound_id WHERE m.workspace_id=w AND m.provider_id='disabled-image') THEN RAISE EXCEPTION 'AI disabled but job enqueued';END IF;
  RAISE EXCEPTION 'rollback isolated fixture' USING ERRCODE='P7999';
 EXCEPTION WHEN SQLSTATE 'P7999' THEN NULL;
 END;
END $test$;
