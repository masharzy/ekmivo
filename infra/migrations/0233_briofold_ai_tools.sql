-- Phase 3: AI tool-calling log + read/handover tools. Money, stock and payment status are never
-- supplied by the model; tools read them from the database. Order/payment tools arrive in 0234.
BEGIN;
CREATE TABLE IF NOT EXISTS ai_tool_calls(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES workspaces(id),
 job_id uuid NOT NULL,
 step integer NOT NULL CHECK(step BETWEEN 1 AND 6),
 tool text NOT NULL CHECK(tool~'^[a-z_]{3,40}$'),
 args_redacted jsonb NOT NULL DEFAULT '{}' CHECK(pg_column_size(args_redacted)<=4000),
 result jsonb NOT NULL DEFAULT '{}' CHECK(pg_column_size(result)<=20000),
 ok boolean NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(job_id,step));
ALTER TABLE ai_tool_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_tool_calls FORCE ROW LEVEL SECURITY;
DO $$BEGIN IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE tablename='ai_tool_calls' AND policyname='ai_tool_calls_owner') THEN
 EXECUTE format('CREATE POLICY ai_tool_calls_owner ON ai_tool_calls TO %I USING(true) WITH CHECK(true)',current_user);END IF;END $$;
REVOKE ALL ON ai_tool_calls FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;

-- One dispatcher. Replays the stored result for the same (job,step): provider retries cannot double-act.
-- Nothing is read or written unless the job lease is still valid (lease expiry => 42501, no write).
CREATE OR REPLACE FUNCTION briofold_ai_tool(job uuid,lease uuid,step_no integer,tool_name text,args jsonb,args_redacted jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j briofold_ai_channel_jobs%ROWTYPE;t inbox_threads%ROWTYPE;env text;old jsonb;res jsonb;pid uuid;BEGIN
 IF NOT briofold_channel_work_valid(job,lease) THEN RAISE EXCEPTION 'AI job lease is not valid' USING ERRCODE='42501';END IF;
 IF jsonb_typeof(coalesce(args,'{}')) IS DISTINCT FROM 'object' THEN RAISE EXCEPTION 'Invalid tool arguments' USING ERRCODE='22023';END IF;
 SELECT result INTO old FROM ai_tool_calls WHERE job_id=job AND step=step_no;
 IF FOUND THEN RETURN old;END IF;
 SELECT * INTO j FROM briofold_ai_channel_jobs WHERE id=job;
 SELECT * INTO t FROM inbox_threads WHERE id=j.thread_id;
 SELECT environment INTO env FROM inbox_connections WHERE id=t.connection_id;
 IF tool_name='search_products' THEN
  res:=jsonb_build_object('products',coalesce(commerce_product_search(j.workspace_id,env,left(coalesce(args->>'query',''),200),jsonb_build_object('category',args->>'category','in_stock',coalesce((args->>'in_stock')::boolean,true)),5),'[]'::jsonb));
 ELSIF tool_name='get_product' THEN
  BEGIN pid:=(args->>'product_ref')::uuid;EXCEPTION WHEN others THEN pid:=NULL;END;
  res:=coalesce((SELECT commerce_catalog_json(p.id)-'min_price_minor'-'ai_notes' FROM commerce_products p WHERE p.id=pid AND p.workspace_id=j.workspace_id AND p.environment=env AND p.active),jsonb_build_object('error','not_found'));
 ELSIF tool_name='get_order_status' THEN
  res:=coalesce((SELECT jsonb_build_object('reference',o.reference,'status',o.status,'total_minor',o.total_minor,'claimed_payment_unverified',o.claimed_payment<>'{}'::jsonb)
   FROM commerce_orders o JOIN briofold_customer_sources s ON s.customer_id=o.customer_id AND s.kind='inbox_thread' AND s.source_id=t.id
   WHERE o.workspace_id=j.workspace_id AND o.environment=env AND o.reference=upper(left(coalesce(args->>'reference',''),80)) LIMIT 1),jsonb_build_object('error','not_found'));
 ELSIF tool_name='handover_to_human' THEN
  UPDATE inbox_threads SET ai_enabled=false,ai_version=ai_version+1 WHERE id=t.id;
  res:=jsonb_build_object('handover',true);
 ELSIF tool_name='update_customer' THEN
  UPDATE briofold_customers c SET name=left(btrim(coalesce(args->>'name',c.name)),120),revision=c.revision+1
   WHERE c.id IN(SELECT s.customer_id FROM briofold_customer_sources s WHERE s.kind='inbox_thread' AND s.source_id=t.id) AND c.workspace_id=j.workspace_id AND length(btrim(coalesce(args->>'name','')))>0;
  res:=jsonb_build_object('updated',true);
 ELSE
  res:=jsonb_build_object('error','tool_unavailable');
 END IF;
 INSERT INTO ai_tool_calls(workspace_id,job_id,step,tool,args_redacted,result,ok) VALUES(j.workspace_id,job,step_no,tool_name,coalesce(args_redacted,'{}'),res,NOT jsonb_exists(res,'error'));
 RETURN res;
END $$;
REVOKE ALL ON FUNCTION briofold_ai_tool(uuid,uuid,integer,text,jsonb,jsonb) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
COMMIT;
