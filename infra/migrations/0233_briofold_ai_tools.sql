-- Phase 3: AI tool-calling log, dispatcher, handover and rate limits.
-- The API runs as ekmivo_financial_runtime: every function Go calls is GRANTed explicitly below.
-- Money, stock and payment status are never supplied by the model; tools read them from the database.
-- Order/payment tools live in briofold_ai_order_tool (0234); the dispatcher resolves it at call time.
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
CREATE INDEX IF NOT EXISTS ai_tool_calls_recent ON ai_tool_calls(workspace_id,created_at);
ALTER TABLE ai_tool_calls ENABLE ROW LEVEL SECURITY;
ALTER TABLE ai_tool_calls FORCE ROW LEVEL SECURITY;
DO $$BEGIN IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE tablename='ai_tool_calls' AND policyname='ai_tool_calls_owner') THEN
 EXECUTE format('CREATE POLICY ai_tool_calls_owner ON ai_tool_calls TO %I USING(true) WITH CHECK(true)',current_user);END IF;END $$;
REVOKE ALL ON ai_tool_calls FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
CREATE INDEX IF NOT EXISTS briofold_ai_executions_recent ON briofold_ai_executions(workspace_id,created_at);

-- Customer-facing product shape: references instead of ids, no floor price, no private notes.
CREATE OR REPLACE FUNCTION briofold_ai_public_variant(v jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('variant_ref',v->'id','sku',v->'sku','options',v->'options','price_minor',v->'price_minor',
  'available',coalesce(v->'available',(SELECT to_jsonb(coalesce(sum((s->>'on_hand')::bigint-(s->>'reserved')::bigint),0)) FROM jsonb_array_elements(coalesce(v->'stock','[]'::jsonb)) s)))
$$;
CREATE OR REPLACE FUNCTION briofold_ai_public_product(p jsonb) RETURNS jsonb LANGUAGE sql IMMUTABLE SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('product_ref',coalesce(p->'product_id',p->'id'),'name',p->'name','category',p->'category','description',p->'description',
  'image',coalesce(p->'first_image',p->'images'->0),
  'variants',coalesce((SELECT jsonb_agg(briofold_ai_public_variant(v)) FROM jsonb_array_elements(coalesce(p->'variants','[]'::jsonb)) v WHERE coalesce((v->>'active')::boolean,true)),'[]'::jsonb))
$$;

-- One dispatcher. Replays the stored result for the same (job,step) so a retried step never acts twice.
-- Nothing is read or written unless the job lease is still valid (42501, propagated to Go).
-- Business errors (bad input, out of stock) come back as {"error":...} so the model can tell the customer.
CREATE OR REPLACE FUNCTION briofold_ai_tool(job uuid,lease uuid,step_no integer,tool_name text,args jsonb,args_redacted jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j briofold_ai_channel_jobs%ROWTYPE;t inbox_threads%ROWTYPE;env text;old jsonb;prev text;res jsonb;pid uuid;nm text;BEGIN
 IF NOT briofold_channel_work_valid(job,lease) THEN RAISE EXCEPTION 'AI job lease is not valid' USING ERRCODE='42501';END IF;
 IF jsonb_typeof(coalesce(args,'{}')) IS DISTINCT FROM 'object' OR step_no NOT BETWEEN 1 AND 6 THEN RAISE EXCEPTION 'Invalid tool call' USING ERRCODE='22023';END IF;
 SELECT tool,result INTO prev,old FROM ai_tool_calls WHERE job_id=job AND step=step_no;
 IF FOUND THEN
  IF prev<>tool_name THEN RAISE EXCEPTION 'Tool step conflict' USING ERRCODE='23505';END IF;
  RETURN old;
 END IF;
 SELECT * INTO j FROM briofold_ai_channel_jobs WHERE id=job;
 SELECT * INTO t FROM inbox_threads WHERE id=j.thread_id;
 SELECT environment INTO env FROM inbox_connections WHERE id=t.connection_id;
 BEGIN
  IF tool_name='search_products' THEN
   res:=jsonb_build_object('products',coalesce((SELECT jsonb_agg(briofold_ai_public_product(x)) FROM jsonb_array_elements(coalesce(
     commerce_product_search(j.workspace_id,env,left(coalesce(args->>'query',''),200),jsonb_build_object('category',args->>'category','in_stock',coalesce((args->>'in_stock')::boolean,true)),5),'[]'::jsonb)) x),'[]'::jsonb));
  ELSIF tool_name='get_product' THEN
   BEGIN pid:=(args->>'product_ref')::uuid;EXCEPTION WHEN others THEN pid:=NULL;END;
   res:=coalesce((SELECT briofold_ai_public_product(commerce_catalog_json(p.id)) FROM commerce_products p WHERE p.id=pid AND p.workspace_id=j.workspace_id AND p.environment=env AND p.active),jsonb_build_object('error','not_found'));
  ELSIF tool_name='get_order_status' THEN
   res:=coalesce((SELECT jsonb_build_object('reference',o.reference,'status',o.status,'payment_state',o.payment_state,'total_minor',o.total_minor)
    FROM commerce_orders o JOIN briofold_customer_sources s ON s.customer_id=o.customer_id AND s.kind='thread' AND s.source_id=t.id
    WHERE o.workspace_id=j.workspace_id AND o.environment=env AND (nullif(btrim(coalesce(args->>'reference','')),'') IS NULL OR o.reference=upper(left(btrim(args->>'reference'),80)))
    ORDER BY o.created_at DESC LIMIT 1),jsonb_build_object('error','not_found'));
  ELSIF tool_name='handover_to_human' THEN
   -- The thread is handed over by briofold_ai_apply_handover AFTER the reply is finished, so the customer still gets an answer.
   res:=jsonb_build_object('handover',true);
  ELSIF tool_name='update_customer' THEN
   nm:=left(btrim(regexp_replace(coalesce(args->>'name',''),'[<>{}\[\]\\"`[:cntrl:]]','','g')),80);
   IF length(nm)=0 THEN res:=jsonb_build_object('error','name_required');
   ELSE
    -- Only a name nobody edited by hand (empty, default, or still the channel name) is replaced.
    UPDATE briofold_customers c SET name=nm,revision=c.revision+1
     WHERE c.id IN(SELECT s.customer_id FROM briofold_customer_sources s WHERE s.kind='thread' AND s.source_id=t.id) AND c.workspace_id=j.workspace_id
       AND (btrim(c.name) IN('','Customer') OR c.name=coalesce(t.customer_name,''));
    res:=jsonb_build_object('updated',FOUND);
   END IF;
  ELSE
   res:=briofold_ai_order_tool(j.workspace_id,env,t.id,j.actor_id,tool_name,args);
  END IF;
 EXCEPTION
  WHEN SQLSTATE 'P0002' THEN res:=jsonb_build_object('error','out_of_stock','detail',left(SQLERRM,120));
  WHEN SQLSTATE '22023' OR SQLSTATE '22P02' OR SQLSTATE '22003' OR SQLSTATE '23514' OR SQLSTATE '23502' THEN res:=jsonb_build_object('error','invalid_request','detail',left(SQLERRM,120));
  WHEN SQLSTATE '23505' THEN res:=jsonb_build_object('error','conflict');
 END;
 INSERT INTO ai_tool_calls(workspace_id,job_id,step,tool,args_redacted,result,ok) VALUES(j.workspace_id,job,step_no,tool_name,coalesce(args_redacted,'{}'),res,NOT jsonb_exists(res,'error'));
 RETURN res;
END $$;

-- Called by Go after the reply was finished (or sent to review). Never overrides a person who already changed the thread.
CREATE OR REPLACE FUNCTION briofold_ai_apply_handover(job uuid) RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j briofold_ai_channel_jobs%ROWTYPE;BEGIN
 SELECT * INTO j FROM briofold_ai_channel_jobs WHERE id=job;
 IF NOT FOUND OR j.state NOT IN('completed','review') THEN RETURN false;END IF;
 UPDATE inbox_threads SET ai_enabled=false,ai_version=ai_version+1 WHERE id=j.thread_id AND ai_enabled AND ai_version=j.thread_ai_version;
 RETURN FOUND;
END $$;

-- Per-thread generations per minute (text replies and tool steps) and a per-workspace 24 h AI cost cap (charged_minor).
CREATE OR REPLACE FUNCTION briofold_ai_rate_ok(w uuid,thread uuid,per_min integer,cap_minor bigint) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT (SELECT count(*) FROM briofold_ai_executions WHERE workspace_id=w AND thread_id=thread AND created_at>now()-interval '1 minute')<greatest(per_min,1)
    AND (coalesce(cap_minor,0)<=0 OR (SELECT coalesce(sum(charged_minor),0) FROM briofold_ai_executions WHERE workspace_id=w AND created_at>now()-interval '24 hours')<cap_minor)
$$;

REVOKE ALL ON FUNCTION briofold_ai_public_variant(jsonb),briofold_ai_public_product(jsonb),briofold_ai_tool(uuid,uuid,integer,text,jsonb,jsonb),briofold_ai_apply_handover(uuid),briofold_ai_rate_ok(uuid,uuid,integer,bigint) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION briofold_ai_tool(uuid,uuid,integer,text,jsonb,jsonb),briofold_ai_apply_handover(uuid),briofold_ai_rate_ok(uuid,uuid,integer,bigint) TO ekmivo_financial_runtime,ekmivo_financial_projection;
COMMIT;
