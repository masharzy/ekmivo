-- Phase 10: aggregate-only tenant/realm reports. Finance revenue stays in its
-- physically separate authoritative ledger. No marketing delivery capability.
BEGIN;
DO $$BEGIN
 IF to_regclass('public.commerce_orders') IS NULL OR to_regclass('public.briofold_customer_followups') IS NULL
   OR to_regclass('public.financial_realm') IS NOT NULL THEN
  RAISE EXCEPTION '0142 requires Phase 7/8 CONTROL migrations';
 END IF;
END $$;

CREATE FUNCTION briofold_growth_snapshot(w uuid,e text,a uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r jsonb;crm jsonb;orders jsonb;chats jsonb;
BEGIN
 PERFORM briofold_customer_actor(w,a,'read');
 PERFORM commerce_actor(w,a,false);
 IF e IS NULL OR e NOT IN ('live','sandbox') THEN RAISE EXCEPTION 'Invalid realm' USING ERRCODE='22023';END IF;
 SELECT jsonb_build_object('total',count(*),'qualified',count(*) FILTER(WHERE stage='qualified'),
   'won',count(*) FILTER(WHERE stage='won'),'assigned',count(*) FILTER(WHERE assignee IS NOT NULL),
   'opted_in',count(*) FILTER(WHERE preferences->>'marketing'='opted-in' AND NOT (preferences->>'do_not_contact')::boolean))
 INTO crm FROM briofold_customers WHERE workspace_id=w AND environment=e AND deleted_at IS NULL AND merged_into IS NULL;
 SELECT crm||jsonb_build_object('due',count(*) FILTER(WHERE f.status='scheduled' AND f.due_at<=now()),
   'upcoming',count(*) FILTER(WHERE f.status='scheduled' AND f.due_at>now()),
   'done',count(*) FILTER(WHERE f.status='done')) INTO crm
 FROM briofold_customer_followups f JOIN briofold_customers c ON c.id=f.customer_id
 WHERE f.workspace_id=w AND f.environment=e AND c.workspace_id=w AND c.environment=e
   AND c.deleted_at IS NULL AND c.merged_into IS NULL;
 SELECT jsonb_build_object('total',count(*),'draft',count(*) FILTER(WHERE status='draft'),
   'confirmed',count(*) FILTER(WHERE status='confirmed'),'delivered',count(*) FILTER(WHERE status='delivered'),
   'cancelled',count(*) FILTER(WHERE status='cancelled'),'returned',count(*) FILTER(WHERE status='returned'),
   'ai',count(*) FILTER(WHERE source='ai'),'api',count(*) FILTER(WHERE source='api'),
   'manual',count(*) FILTER(WHERE source='manual')) INTO orders
 FROM commerce_orders WHERE workspace_id=w AND environment=e;
 SELECT jsonb_build_object('conversations',
   (SELECT count(*) FROM inbox_threads t JOIN inbox_connections c ON c.id=t.connection_id
    WHERE t.workspace_id=w AND c.workspace_id=w AND c.environment=e AND c.enabled),
   'messages_7d',
   (SELECT count(*) FROM inbox_messages m JOIN inbox_threads t ON t.id=m.thread_id
    JOIN inbox_connections c ON c.id=t.connection_id
    WHERE m.workspace_id=w AND t.workspace_id=w AND c.workspace_id=w AND c.environment=e
      AND m.created_at>=now()-interval '7 days')) INTO chats;
 r:=jsonb_build_object('customers',crm,'commerce',orders,'inbox',chats,'as_of',now());
 RETURN r;
END $$;

REVOKE ALL ON FUNCTION briofold_growth_snapshot(uuid,text,uuid) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION briofold_growth_snapshot(uuid,text,uuid) TO ekmivo_financial_runtime,ekmivo_financial_projection;
COMMIT;
