-- Phase 8/10 parity: durable, audited order assignment. CONTROL schema only.
-- Never alters a payment, courier state, or existing order price snapshot.
BEGIN;
DO $$ BEGIN
 IF to_regclass('public.commerce_orders') IS NULL OR to_regclass('public.commerce_events') IS NULL
    OR to_regclass('public.briofold_growth_suppressions') IS NULL
    OR to_regclass('public.financial_realm') IS NOT NULL THEN
  RAISE EXCEPTION '0184 requires control commerce and Phase 10 consent migrations';
 END IF;
END $$;

CREATE TABLE commerce_order_assignments (
 workspace_id uuid NOT NULL,
 environment text NOT NULL CHECK (environment IN ('live','sandbox')),
 order_id uuid NOT NULL,
 assignee_id uuid REFERENCES app_users(id),
 revision bigint NOT NULL DEFAULT 1 CHECK (revision > 0),
 updated_by uuid NOT NULL REFERENCES app_users(id),
 updated_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY (workspace_id,environment,order_id),
 FOREIGN KEY (workspace_id,environment,order_id) REFERENCES commerce_orders(workspace_id,environment,id)
);
CREATE TABLE commerce_order_assignment_commands (
 workspace_id uuid NOT NULL REFERENCES workspaces(id),
 environment text NOT NULL CHECK (environment IN ('live','sandbox')),
 actor_id uuid NOT NULL REFERENCES app_users(id),
 operation_key uuid NOT NULL,
 fingerprint text NOT NULL CHECK (length(fingerprint)=64),
 result jsonb NOT NULL,
 PRIMARY KEY (workspace_id,environment,actor_id,operation_key)
);
DO $$ DECLARE t text; BEGIN
 FOREACH t IN ARRAY ARRAY['commerce_order_assignments','commerce_order_assignment_commands'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('REVOKE ALL ON TABLE %I FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection',t);
 END LOOP;
END $$;

CREATE FUNCTION commerce_assignment_read(w uuid,e text,a uuid,oid uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE role_name text; current_assignee uuid; current_revision bigint; member_rows jsonb; assignment_history jsonb;
BEGIN
 role_name:=commerce_actor(w,a);
 IF e IS NULL OR e NOT IN ('live','sandbox') OR oid IS NULL
    OR NOT EXISTS (SELECT 1 FROM commerce_orders o WHERE o.id=oid AND o.workspace_id=w AND o.environment=e)
 THEN RAISE EXCEPTION 'Order unavailable' USING ERRCODE='42501'; END IF;
 SELECT assignee_id,revision INTO current_assignee,current_revision
 FROM commerce_order_assignments WHERE workspace_id=w AND environment=e AND order_id=oid;
 IF role_name IN ('owner','admin','editor') THEN
  SELECT coalesce(jsonb_agg(jsonb_build_object('id',u.id,'name',u.display_name,'role',m.role)
    ORDER BY u.display_name,u.id),'[]'::jsonb) INTO member_rows
  FROM workspace_members m JOIN app_users u ON u.id=m.user_id
  WHERE m.workspace_id=w AND m.role IN ('owner','admin','editor') AND u.disabled_at IS NULL;
 ELSE member_rows:='[]'::jsonb; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(h) ORDER BY h.sequence DESC),'[]'::jsonb) INTO assignment_history
 FROM (SELECT ev.sequence,ev.created_at,ev.detail->>'assignee_id' assignee_id
       FROM commerce_events ev WHERE ev.workspace_id=w AND ev.environment=e AND ev.entity_id=oid
        AND ev.action='assign-order' ORDER BY ev.sequence DESC LIMIT 20) h;
 RETURN jsonb_build_object('assignee_id',current_assignee,'revision',coalesce(current_revision,0),
  'can_assign',role_name IN ('owner','admin'),'agents',member_rows,'history',assignment_history);
END $$;

CREATE FUNCTION commerce_assignment_write(w uuid,e text,a uuid,k uuid,b jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE role_name text; oid uuid; target uuid; prior uuid; rev bigint; expected bigint; order_status text;
 fingerprint text; previous_fingerprint text; previous_result jsonb; saved jsonb;
BEGIN
 role_name:=commerce_actor(w,a,true);
 IF role_name NOT IN ('owner','admin') THEN
  RAISE EXCEPTION 'Order assignment manager required' USING ERRCODE='42501';
 END IF;
 IF e IS NULL OR e NOT IN ('live','sandbox') OR k IS NULL OR b IS NULL
    OR jsonb_typeof(b) IS DISTINCT FROM 'object' OR length(b::text)>2048
    OR coalesce(b->>'id','') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
    OR coalesce(b->>'revision','') !~ '^[0-9]{1,12}$'
    OR (b ? 'assignee_id' AND b->>'assignee_id' IS NOT NULL
        AND (b->>'assignee_id') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$')
 THEN RAISE EXCEPTION 'Invalid assignment' USING ERRCODE='22023'; END IF;
 oid:=(b->>'id')::uuid;target:=(b->>'assignee_id')::uuid;
 expected:=(b->>'revision')::bigint;
 fingerprint:=encode(digest(w::text||':'||e||':'||a::text||':'||b::text,'sha256'),'hex');
 SELECT o.status INTO order_status FROM commerce_orders o WHERE o.id=oid AND o.workspace_id=w AND o.environment=e FOR UPDATE;
 IF order_status IS NULL THEN RAISE EXCEPTION 'Order unavailable' USING ERRCODE='42501'; END IF;
 SELECT c.fingerprint,c.result INTO previous_fingerprint,previous_result
 FROM commerce_order_assignment_commands c WHERE c.workspace_id=w AND c.environment=e AND c.actor_id=a AND c.operation_key=k;
 IF FOUND THEN
  IF previous_fingerprint<>fingerprint THEN RAISE EXCEPTION 'Operation key reused' USING ERRCODE='23505'; END IF;
  RETURN previous_result;
 END IF;
 IF order_status IN ('cancelled','returned') THEN RAISE EXCEPTION 'Closed order cannot be reassigned' USING ERRCODE='42501'; END IF;
 IF target IS NOT NULL AND NOT EXISTS (
   SELECT 1 FROM workspace_members m JOIN app_users u ON u.id=m.user_id
   WHERE m.workspace_id=w AND m.user_id=target AND m.role IN ('owner','admin','editor') AND u.disabled_at IS NULL
 ) THEN RAISE EXCEPTION 'Assignee unavailable' USING ERRCODE='42501'; END IF;
 SELECT x.assignee_id,x.revision INTO prior,rev FROM commerce_order_assignments x
 WHERE x.workspace_id=w AND x.environment=e AND x.order_id=oid;
 rev:=coalesce(rev,0);
 IF rev<>expected THEN RAISE EXCEPTION 'Assignment changed; reload' USING ERRCODE='40001'; END IF;
 IF prior IS DISTINCT FROM target OR rev=0 THEN
  INSERT INTO commerce_order_assignments(workspace_id,environment,order_id,assignee_id,updated_by)
  VALUES(w,e,oid,target,a)
  ON CONFLICT (workspace_id,environment,order_id) DO UPDATE
    SET assignee_id=excluded.assignee_id,updated_by=excluded.updated_by,
      revision=commerce_order_assignments.revision+1,updated_at=now();
  INSERT INTO commerce_events(workspace_id,environment,entity_id,actor_id,action,detail)
  VALUES(w,e,oid,a,'assign-order',jsonb_build_object('previous_assignee_id',prior,'assignee_id',target));
 END IF;
 SELECT assignee_id,revision INTO target,rev FROM commerce_order_assignments x
 WHERE x.workspace_id=w AND x.environment=e AND x.order_id=oid;
 saved:=jsonb_build_object('order_id',oid,'assignee_id',target,'revision',rev);
 INSERT INTO commerce_order_assignment_commands(workspace_id,environment,actor_id,operation_key,fingerprint,result)
 VALUES(w,e,a,k,fingerprint,saved);
 RETURN saved;
END $$;
REVOKE ALL ON FUNCTION commerce_assignment_read(uuid,text,uuid,uuid),commerce_assignment_write(uuid,text,uuid,uuid,jsonb)
 FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION commerce_assignment_read(uuid,text,uuid,uuid),commerce_assignment_write(uuid,text,uuid,uuid,jsonb)
 TO ekmivo_financial_runtime,ekmivo_financial_projection;
COMMIT;
