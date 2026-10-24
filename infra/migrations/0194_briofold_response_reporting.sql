-- CONTROL-only rolling seven-day conversation response metrics.
BEGIN;
DO $$ BEGIN IF to_regclass('public.briofold_inbox_work') IS NULL OR to_regclass('public.financial_realm') IS NOT NULL THEN RAISE EXCEPTION '0194 requires CONTROL Inbox';END IF;END $$;
CREATE INDEX briofold_response_inbound_window ON inbox_messages(workspace_id,created_at,thread_id) WHERE sender='customer';
CREATE INDEX briofold_response_success ON inbox_messages(workspace_id,thread_id,coalesce(sent_at,created_at),sequence) WHERE sender IN ('seller','ai') AND state IN ('sent','delivered','seen');
CREATE FUNCTION briofold_response_snapshot(w uuid,e text,a uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE totals jsonb;channels jsonb;people jsonb;private_team boolean;
BEGIN
 PERFORM briofold_customer_actor(w,a,'read');
 PERFORM briofold_inbox_actor(w,a,'inbox:read');
 IF e IS NULL OR e NOT IN ('live','sandbox') THEN RAISE EXCEPTION 'Invalid reporting realm' USING ERRCODE='22023';END IF;
 private_team:=EXISTS(SELECT 1 FROM workspace_members WHERE workspace_id=w AND user_id=a AND role IN ('owner','admin'));
 -- Measure the first successful reply after the first customer message in
 -- this window, once per conversation. Failed/queued output is not a reply.
 WITH inbound AS (
  SELECT t.id,c.provider,min(m.created_at) AS started
  FROM inbox_threads t JOIN inbox_connections c ON c.id=t.connection_id AND c.workspace_id=w AND c.environment=e
  JOIN inbox_messages m ON m.thread_id=t.id AND m.workspace_id=w AND m.sender='customer'
  WHERE t.workspace_id=w AND m.created_at>=now()-interval '7 days' AND m.created_at<=now()
  GROUP BY t.id,c.provider
 ), cycles AS (
  SELECT i.*,r.sender,extract(epoch FROM r.responded-i.started) AS seconds
  FROM inbound i LEFT JOIN LATERAL (
   SELECT m.sender,coalesce(m.sent_at,m.created_at) AS responded
   FROM inbox_messages m WHERE m.workspace_id=w AND m.thread_id=i.id AND m.sender IN ('seller','ai')
   AND m.state IN ('sent','delivered','seen') AND coalesce(m.sent_at,m.created_at)>=i.started
   AND coalesce(m.sent_at,m.created_at)<=now()
   ORDER BY coalesce(m.sent_at,m.created_at),m.sequence LIMIT 1
  ) r ON true
 ), by_channel AS (
  SELECT provider,count(*) AS conversations,count(seconds) AS responded,
   count(*) FILTER(WHERE sender='seller') AS human_first,count(*) FILTER(WHERE sender='ai') AS ai_first,
   count(*) FILTER(WHERE seconds<=300) AS within_five_minutes,
   floor(avg(seconds))::bigint AS average_seconds FROM cycles GROUP BY provider
 )
 SELECT jsonb_build_object('conversations',count(*),'responded',count(seconds),
  'unanswered',count(*) FILTER(WHERE seconds IS NULL),'human_first',count(*) FILTER(WHERE sender='seller'),
  'ai_first',count(*) FILTER(WHERE sender='ai'),'within_five_minutes',count(*) FILTER(WHERE seconds<=300),
  'average_seconds',floor(avg(seconds))::bigint),
  (SELECT coalesce(jsonb_agg(to_jsonb(b) ORDER BY provider),'[]'::jsonb) FROM by_channel b)
 INTO totals,channels FROM cycles;
 -- Current assignment workload is not historical responder attribution.
 SELECT coalesce(jsonb_agg(to_jsonb(x) ORDER BY x.open DESC,x.name,x.id),'[]'::jsonb) INTO people FROM (
  SELECT m.user_id AS id,coalesce(nullif(u.display_name,''),'Member') AS name,
   count(*) FILTER(WHERE f.status<>'resolved') AS open,
   count(*) FILTER(WHERE f.status<>'resolved' AND f.due_at<now()) AS overdue
  FROM workspace_members m JOIN app_users u ON u.id=m.user_id AND u.disabled_at IS NULL
  JOIN briofold_inbox_work f ON f.owner_id=m.user_id AND f.workspace_id=w
  JOIN inbox_threads t ON t.id=f.thread_id AND t.workspace_id=w
  JOIN inbox_connections c ON c.id=t.connection_id AND c.workspace_id=w AND c.environment=e
  WHERE m.workspace_id=w GROUP BY m.user_id,u.display_name
  ORDER BY open DESC,name,m.user_id LIMIT 50
 ) x WHERE private_team;
 RETURN jsonb_build_object('totals',totals,'channels',channels,'people',people,'can_view_people',private_team,
  'from',now()-interval '7 days','through',now());
END $$;
REVOKE ALL ON FUNCTION briofold_response_snapshot(uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION briofold_response_snapshot(uuid,text,uuid) TO ekmivo_financial_runtime,ekmivo_financial_projection;
COMMIT;
