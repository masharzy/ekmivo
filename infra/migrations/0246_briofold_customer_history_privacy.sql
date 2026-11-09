-- 0245's merged-history read returned briofold_customer_events.detail to every reader, including viewers.
-- Customer history has exposed only sequence, action and time since 0189/0208; keep that contract for merged history too.
BEGIN;
CREATE OR REPLACE FUNCTION briofold_customer_identity_detail(w uuid,e text,a uuid,c uuid,off integer,q text,f text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb; history jsonb;
BEGIN
 result:=briofold_customers_read(w,e,a,c,off,q,f);
 WITH RECURSIVE ids(id) AS (
  SELECT c UNION ALL SELECT x.id FROM briofold_customers x JOIN ids ON x.merged_into=ids.id WHERE x.workspace_id=w AND x.environment=e
 )
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.sequence DESC),'[]') INTO history FROM (
  SELECT sequence,action,created_at FROM briofold_customer_events
  WHERE workspace_id=w AND environment=e AND customer_id IN (SELECT id FROM ids)
  ORDER BY sequence DESC LIMIT 51 OFFSET off
 ) x;
 RETURN jsonb_set(result,'{events}',history);
END $$;
COMMIT;
