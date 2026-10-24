-- Do not expose team-member UUIDs through the viewer's order assignment feed.
-- Preserve role-safe assigned/unassigned UI and event-state history without IDs.
BEGIN;
DO $$ BEGIN
 IF to_regprocedure('public.commerce_assignment_read(uuid,text,uuid,uuid)') IS NULL
    OR to_regclass('public.financial_realm') IS NOT NULL THEN
  RAISE EXCEPTION '0187 requires CONTROL commerce assignment schema';
 END IF;
END $$;

CREATE OR REPLACE FUNCTION commerce_assignment_read(w uuid,e text,a uuid,oid uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE role_name text; current_assignee uuid; current_revision bigint; member_rows jsonb; assignment_history jsonb; can_see_staff boolean;
BEGIN
 role_name:=commerce_actor(w,a);
 IF e IS NULL OR e NOT IN ('live','sandbox') OR oid IS NULL
    OR NOT EXISTS (SELECT 1 FROM commerce_orders o WHERE o.id=oid AND o.workspace_id=w AND o.environment=e)
 THEN RAISE EXCEPTION 'Order unavailable' USING ERRCODE='42501'; END IF;
 can_see_staff:=role_name IN ('owner','admin','editor');
 SELECT assignee_id,revision INTO current_assignee,current_revision
 FROM commerce_order_assignments WHERE workspace_id=w AND environment=e AND order_id=oid;
 IF can_see_staff THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',u.display_name,'role',m.role)
    ORDER BY u.display_name,u.id),'[]'::jsonb) INTO member_rows
  FROM workspace_members m JOIN app_users u ON u.id=m.user_id
  WHERE m.workspace_id=w AND m.role IN ('owner','admin','editor') AND u.disabled_at IS NULL;
 ELSE member_rows:='[]'::jsonb; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY h.sequence DESC),'[]'::jsonb) INTO assignment_history
 FROM (SELECT ev.sequence,ev.created_at,
       CASE WHEN can_see_staff THEN ev.detail->>'assignee_id' ELSE NULL END assignee_id,
       ev.detail->>'assignee_id' IS NOT NULL assigned
       FROM commerce_events ev WHERE ev.workspace_id=w AND ev.environment=e AND ev.entity_id=oid
        AND ev.action='assign-order' ORDER BY ev.sequence DESC LIMIT 20) h;
 RETURN jsonb_build_object(
  'assignee_id',CASE WHEN can_see_staff THEN current_assignee ELSE NULL END,
  'assigned',current_assignee IS NOT NULL,'revision',coalesce(current_revision,0),
  'can_assign',role_name IN ('owner','admin'),'agents',member_rows,'history',assignment_history);
END $$;
REVOKE ALL ON FUNCTION commerce_assignment_read(uuid,text,uuid,uuid)
 FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION commerce_assignment_read(uuid,text,uuid,uuid)
 TO ekmivo_financial_runtime,ekmivo_financial_projection;
COMMIT;
