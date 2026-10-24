-- CONTROL feedback attachments: a single small, explicitly consented PNG.
BEGIN;
DO $$BEGIN IF to_regclass('public.pg13_support') IS NULL OR to_regclass('public.financial_realm') IS NOT NULL THEN RAISE EXCEPTION '0198 requires CONTROL support';END IF;END $$;
CREATE TABLE briofold_feedback_submissions(
 workspace_id uuid NOT NULL REFERENCES workspaces(id),operation_key uuid NOT NULL,actor_id uuid NOT NULL REFERENCES app_users(id),
 request_hash text NOT NULL,ticket_id uuid NOT NULL REFERENCES pg13_support(id),created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,operation_key)
);
ALTER TABLE pg13_support ADD COLUMN screenshot jsonb;
ALTER TABLE pg13_support ADD CONSTRAINT briofold_feedback_screenshot CHECK(screenshot IS NULL OR
 (jsonb_typeof(screenshot)='object' AND screenshot->>'mime'='image/png' AND screenshot->>'consent'='true'
  AND length(screenshot->>'data') BETWEEN 1 AND 700000));
ALTER TABLE briofold_feedback_submissions ENABLE ROW LEVEL SECURITY;
ALTER TABLE briofold_feedback_submissions FORCE ROW LEVEL SECURITY;
CREATE POLICY briofold_feedback_submissions_owner ON briofold_feedback_submissions TO CURRENT_USER USING(true) WITH CHECK(true);
REVOKE ALL ON briofold_feedback_submissions FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
CREATE FUNCTION briofold_feedback_write(w uuid,a uuid,k uuid,b jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE prior briofold_feedback_submissions;r jsonb;fp text;operation uuid:=coalesce(k,gen_random_uuid());BEGIN
 PERFORM pg13_actor(w,a,false);
 PERFORM pg_advisory_xact_lock(hashtextextended('pg13:control:'||w::text,0));
 fp:=encode(digest(b::text,'sha256'),'hex');
 SELECT * INTO prior FROM briofold_feedback_submissions WHERE workspace_id=w AND operation_key=operation;
 IF FOUND THEN
  IF prior.actor_id<>a OR prior.request_hash<>fp THEN RAISE EXCEPTION 'Feedback operation conflict' USING ERRCODE='23505';END IF;
  RETURN jsonb_build_object('id',prior.ticket_id,'saved',true);
 END IF;
 IF (SELECT count(*) FROM briofold_feedback_submissions WHERE workspace_id=w AND actor_id=a AND created_at>now()-interval '1 day')>=20
  OR (b ? 'screenshot' AND (SELECT count(*) FROM pg13_support WHERE workspace_id=w AND screenshot IS NOT NULL)>=100)
 THEN RAISE EXCEPTION 'Feedback submission limit' USING ERRCODE='54000';END IF;
 IF b ? 'screenshot' AND (jsonb_typeof(b->'screenshot') IS DISTINCT FROM 'object' OR b->'screenshot'->>'mime' IS DISTINCT FROM 'image/png'
  OR b->'screenshot'->>'consent' IS DISTINCT FROM 'true' OR length(coalesce(b->'screenshot'->>'data','')) NOT BETWEEN 1 AND 700000)
 THEN RAISE EXCEPTION 'Invalid screenshot' USING ERRCODE='22023';END IF;
 r:=pg13_workspace_write(w,a,'help',b,NULL);
 UPDATE pg13_support SET screenshot=b->'screenshot' WHERE id=(r->>'id')::uuid AND workspace_id=w;
 INSERT INTO briofold_feedback_submissions VALUES(w,operation,a,fp,(r->>'id')::uuid,now());
 RETURN r;
END $$;
REVOKE ALL ON FUNCTION briofold_feedback_write(uuid,uuid,uuid,jsonb) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION briofold_feedback_write(uuid,uuid,uuid,jsonb) TO ekmivo_financial_runtime,ekmivo_financial_projection;

ALTER FUNCTION pg13_workspace_read(uuid,uuid,text) RENAME TO pg13_workspace_read_before_feedback_screenshots;
REVOKE ALL ON FUNCTION pg13_workspace_read_before_feedback_screenshots(uuid,uuid,text) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
CREATE FUNCTION pg13_workspace_read(w uuid,a uuid,resource text) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE r jsonb;BEGIN
 r:=pg13_workspace_read_before_feedback_screenshots(w,a,resource);
 IF resource='help' THEN
  r:=r||jsonb_build_object('screenshots_enabled',true);
  r:=jsonb_set(r,'{items}',coalesce((SELECT jsonb_agg(value-'screenshot'||jsonb_build_object('screenshot_available',value->'screenshot' IS NOT NULL AND value->'screenshot'<>'null'::jsonb) ORDER BY pos) FROM jsonb_array_elements(r->'items') WITH ORDINALITY AS x(value,pos)),'[]'::jsonb));
 END IF;RETURN r;
END $$;
CREATE FUNCTION briofold_feedback_screenshot_read(w uuid,a uuid,t uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN
 PERFORM pg13_support_history(w,a,t);
 RETURN (SELECT jsonb_build_object('screenshot',screenshot) FROM pg13_support WHERE id=t AND workspace_id=w);
END $$;
REVOKE ALL ON FUNCTION pg13_workspace_read(uuid,uuid,text),briofold_feedback_screenshot_read(uuid,uuid,uuid) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION pg13_workspace_read(uuid,uuid,text),briofold_feedback_screenshot_read(uuid,uuid,uuid) TO ekmivo_financial_runtime,ekmivo_financial_projection;
COMMIT;
