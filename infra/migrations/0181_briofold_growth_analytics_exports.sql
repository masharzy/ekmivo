-- Briofold Phase 10 CONTROL-only operational metrics and role-safe export.
-- No finance ledger, COD receipt, provider secret or customer PII is copied.
BEGIN;
DO $$BEGIN
 IF to_regprocedure('public.briofold_growth_operations_read(uuid,text,uuid,text)') IS NULL
   OR to_regprocedure('public.briofold_growth_snapshot(uuid,text,uuid)') IS NULL
   OR to_regclass('public.financial_realm') IS NOT NULL THEN
  RAISE EXCEPTION '0181 requires Briofold Phase 10 CONTROL prerequisites';
 END IF;
END $$;

CREATE FUNCTION briofold_growth_operational_snapshot(w uuid,e text,a uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE campaigns jsonb;bookings jsonb;team jsonb;replies jsonb;
BEGIN
 PERFORM briofold_growth_store_actor(w,a,'read');
 IF e IS NULL OR e NOT IN ('live','sandbox') THEN RAISE EXCEPTION 'Invalid reporting realm' USING ERRCODE='22023';END IF;
 SELECT jsonb_build_object(
  'broadcast_drafts',count(*) FILTER(WHERE kind='broadcast' AND status='draft'),
  'broadcast_planned',count(*) FILTER(WHERE kind='broadcast' AND status='planned'),
  'post_drafts',count(*) FILTER(WHERE kind='post' AND status='draft'),
  'post_planned',count(*) FILTER(WHERE kind='post' AND status='planned'))
 INTO campaigns FROM briofold_campaign_drafts WHERE workspace_id=w AND environment=e;
 SELECT jsonb_build_object(
  'booking_requested',count(*) FILTER(WHERE status='requested'),
  'booking_confirmed',count(*) FILTER(WHERE status='confirmed'),
  'booking_completed',count(*) FILTER(WHERE status='completed'),
  'booking_cancelled',count(*) FILTER(WHERE status='cancelled'))
 INTO bookings FROM briofold_bookings WHERE workspace_id=w AND environment=e;
 SELECT jsonb_build_object(
  'assigned',count(*) FILTER(WHERE t.owner_id IS NOT NULL),
  'unassigned',count(*) FILTER(WHERE t.owner_id IS NULL),
  'open',count(*) FILTER(WHERE t.status='open'),
  'pending',count(*) FILTER(WHERE t.status='pending'),
  'resolved',count(*) FILTER(WHERE t.status='resolved'),
  'overdue',count(*) FILTER(WHERE t.due_at<now() AND t.status NOT IN ('resolved')))
 INTO team FROM briofold_inbox_work t
 JOIN inbox_threads th ON th.id=t.thread_id AND th.workspace_id=w
 JOIN inbox_connections c ON c.id=th.connection_id AND c.workspace_id=w AND c.environment=e
 WHERE t.workspace_id=w;
 SELECT jsonb_build_object(
  'inbound_7d',count(*) FILTER(WHERE m.sender='customer'),
  'human_outbound_7d',count(*) FILTER(WHERE m.sender='seller'),
  'ai_outbound_7d',count(*) FILTER(WHERE m.sender='ai'))
 INTO replies FROM inbox_messages m
 JOIN inbox_threads th ON th.id=m.thread_id AND th.workspace_id=w
 JOIN inbox_connections c ON c.id=th.connection_id AND c.workspace_id=w AND c.environment=e
 WHERE m.workspace_id=w AND m.created_at>=now()-interval '7 days';
 RETURN jsonb_build_object('campaigns',campaigns,'bookings',bookings,'team',team,'messages',replies,'as_of',now());
END $$;

CREATE FUNCTION briofold_growth_export(w uuid,e text,a uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM briofold_growth_store_actor(w,a,'export');
 IF e IS NULL OR e NOT IN ('live','sandbox') THEN RAISE EXCEPTION 'Invalid export realm' USING ERRCODE='22023';END IF;
 RETURN jsonb_build_object('version',1,'realm',e,'generated_at',now(),
  'core',briofold_growth_snapshot(w,e,a),
  'operations',briofold_growth_operational_snapshot(w,e,a));
END $$;

REVOKE ALL ON FUNCTION briofold_growth_operational_snapshot(uuid,text,uuid) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
REVOKE ALL ON FUNCTION briofold_growth_export(uuid,text,uuid) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION briofold_growth_operational_snapshot(uuid,text,uuid) TO ekmivo_financial_runtime,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION briofold_growth_export(uuid,text,uuid) TO ekmivo_financial_runtime,ekmivo_financial_projection;
COMMIT;
