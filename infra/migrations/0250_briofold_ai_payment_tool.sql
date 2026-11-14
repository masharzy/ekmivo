-- 0250 (control): tool entry points for the payment ladder (0249) and method switching (0247).
-- Same contract as briofold_ai_tool: the job lease must be valid, a step is recorded once in ai_tool_calls and a
-- repeated step returns the recorded result. The legacy dispatcher and its tools are not modified.
-- Requires 0247 and 0249. Idempotent.
BEGIN;
DO $preflight$ BEGIN
 IF to_regprocedure('public.briofold_ai_payment_settle(uuid,text,uuid,jsonb)') IS NULL OR to_regprocedure('public.briofold_channel_work_valid(uuid,uuid)') IS NULL THEN
  RAISE EXCEPTION '0250 requires 0249 and the AI tool schema' USING ERRCODE='42501';
 END IF;
END $preflight$;

-- What the API needs before it can read receipts from the financial realm: which realm, and from when.
CREATE OR REPLACE FUNCTION briofold_ai_payment_context(job uuid,lease uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j briofold_ai_channel_jobs%ROWTYPE;env text;o commerce_orders%ROWTYPE;since timestamptz;BEGIN
 IF NOT briofold_channel_work_valid(job,lease) THEN RAISE EXCEPTION 'AI job lease is not valid' USING ERRCODE='42501';END IF;
 SELECT * INTO j FROM briofold_ai_channel_jobs WHERE id=job;
 SELECT n.environment INTO env FROM inbox_threads t JOIN inbox_connections n ON n.id=t.connection_id WHERE t.id=j.thread_id;
 SELECT * INTO o FROM commerce_orders WHERE workspace_id=j.workspace_id AND environment=env AND source='ai' AND source_id=j.thread_id
   AND status IN('draft','hold','confirmed') AND paid_minor<total_minor AND payment_state IN('none','awaiting','claimed','partial','cod')
  ORDER BY created_at DESC LIMIT 1;
 IF NOT FOUND THEN RETURN jsonb_build_object('workspace_id',j.workspace_id,'environment',env,'has_order',false);END IF;
 SELECT least(o.created_at,coalesce(min(m.created_at),o.created_at)) INTO since FROM inbox_messages m
  WHERE m.workspace_id=j.workspace_id AND m.thread_id=j.thread_id AND m.sender='customer' AND m.created_at>o.created_at-interval '24 hours';
 RETURN jsonb_build_object('workspace_id',j.workspace_id,'environment',env,'has_order',true,'since',since);
END$$;

CREATE OR REPLACE FUNCTION briofold_ai_payment_tool(job uuid,lease uuid,step_no integer,tool_name text,args jsonb,args_redacted jsonb DEFAULT '{}'::jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j briofold_ai_channel_jobs%ROWTYPE;env text;old jsonb;prev text;res jsonb;BEGIN
 IF NOT briofold_channel_work_valid(job,lease) THEN RAISE EXCEPTION 'AI job lease is not valid' USING ERRCODE='42501';END IF;
 IF jsonb_typeof(coalesce(args,'{}')) IS DISTINCT FROM 'object' OR step_no NOT BETWEEN 1 AND 6 OR tool_name NOT IN('verify_payment','change_payment_method') THEN
  RAISE EXCEPTION 'Invalid tool call' USING ERRCODE='22023';
 END IF;
 SELECT tool,result INTO prev,old FROM ai_tool_calls WHERE job_id=job AND step=step_no;
 IF FOUND THEN
  IF prev<>tool_name THEN RAISE EXCEPTION 'Tool step conflict' USING ERRCODE='23505';END IF;
  RETURN old;
 END IF;
 SELECT * INTO j FROM briofold_ai_channel_jobs WHERE id=job;
 SELECT n.environment INTO env FROM inbox_threads t JOIN inbox_connections n ON n.id=t.connection_id WHERE t.id=j.thread_id;
 BEGIN
  IF tool_name='verify_payment' THEN res:=briofold_ai_payment_settle(j.workspace_id,env,j.thread_id,args);
  ELSE res:=briofold_ai_payment_method(j.workspace_id,env,j.thread_id,coalesce(args->>'choice',''));
  END IF;
 EXCEPTION
  WHEN SQLSTATE '22023' OR SQLSTATE '22P02' OR SQLSTATE '22003' OR SQLSTATE '23514' OR SQLSTATE '23502' OR SQLSTATE '22007' THEN res:=jsonb_build_object('error','invalid_request','detail',left(SQLERRM,120));
  WHEN SQLSTATE '23505' THEN res:=jsonb_build_object('error','conflict');
 END;
 INSERT INTO ai_tool_calls(workspace_id,job_id,step,tool,args_redacted,result,ok) VALUES(j.workspace_id,job,step_no,tool_name,coalesce(args_redacted,'{}'),res,NOT jsonb_exists(res,'error'));
 RETURN res;
END$$;
REVOKE ALL ON FUNCTION briofold_ai_payment_context(uuid,uuid),briofold_ai_payment_tool(uuid,uuid,integer,text,jsonb,jsonb) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION briofold_ai_payment_context(uuid,uuid),briofold_ai_payment_tool(uuid,uuid,integer,text,jsonb,jsonb) TO ekmivo_financial_runtime,ekmivo_financial_projection;
COMMIT;
