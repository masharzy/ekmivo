-- 0257: server-side product pre-search for AI selling (used only with BRIOFOLD_AI_PRESEARCH_ENABLED=true).
--
-- Small models sometimes answer "we do not sell that" from the business description or their own earlier replies
-- without calling search_products. With the flag on, the worker searches the catalogue itself for the words the
-- customer wrote, before the model answers, and gives the model the result as current facts.
-- Read-only: no order, stock or payment changes, nothing is logged. Out-of-stock products are included, so the
-- model can say "out of stock" instead of "we do not sell it". Only adds a function; running it twice is safe.

-- Same pg_trgm note as 0256: load the library before using functions that SET its parameters.
SELECT word_similarity('a','a');

CREATE OR REPLACE FUNCTION public.briofold_ai_presearch(job uuid, lease uuid, words text[])
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE j briofold_ai_channel_jobs%ROWTYPE; env text; wd text; found jsonb:='[]'::jsonb; ids uuid[]:='{}'; x jsonb;
BEGIN
  IF NOT briofold_channel_work_valid(job,lease) THEN RAISE EXCEPTION 'AI job lease is not valid' USING ERRCODE='42501';END IF;
  IF words IS NULL OR cardinality(words)>5 THEN RAISE EXCEPTION 'Invalid pre-search' USING ERRCODE='22023';END IF;
  SELECT * INTO j FROM briofold_ai_channel_jobs WHERE id=job;
  SELECT n.environment INTO env FROM inbox_threads t JOIN inbox_connections n ON n.id=t.connection_id
   WHERE t.id=j.thread_id AND t.workspace_id=j.workspace_id;
  IF env IS NULL THEN RAISE EXCEPTION 'AI job lease is not valid' USING ERRCODE='42501';END IF;
  FOREACH wd IN ARRAY words LOOP
    IF length(btrim(coalesce(wd,''))) BETWEEN 2 AND 40 THEN
      FOR x IN SELECT value FROM jsonb_array_elements(coalesce(
          commerce_product_search(j.workspace_id,env,btrim(wd),jsonb_build_object('in_stock',false),3),'[]'::jsonb)) LOOP
        IF NOT (x->>'product_id')::uuid=ANY(ids) AND cardinality(ids)<5 THEN
          ids:=ids||(x->>'product_id')::uuid;
          found:=found||jsonb_build_array(briofold_ai_public_product(x));
        END IF;
      END LOOP;
    END IF;
  END LOOP;
  RETURN jsonb_build_object('searched',to_jsonb(words),'products',found);
END $function$;

REVOKE ALL ON FUNCTION public.briofold_ai_presearch(uuid,uuid,text[]) FROM PUBLIC;
-- Same callers as briofold_ai_tool (the AI worker roles), whatever they are called on this database.
DO $g$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT (aclexplode(p.proacl)).grantee AS g FROM pg_proc p
           WHERE p.oid='public.briofold_ai_tool(uuid,uuid,integer,text,jsonb,jsonb)'::regprocedure LOOP
    IF r.g<>0 AND EXISTS(SELECT 1 FROM pg_roles WHERE oid=r.g) AND r.g<>(SELECT proowner FROM pg_proc WHERE oid='public.briofold_ai_presearch(uuid,uuid,text[])'::regprocedure) THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION public.briofold_ai_presearch(uuid,uuid,text[]) TO %I', (SELECT rolname FROM pg_roles WHERE oid=r.g));
    END IF;
  END LOOP;
END $g$;
