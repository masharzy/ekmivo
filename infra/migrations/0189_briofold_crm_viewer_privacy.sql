-- CONTROL CRM read-side hardening. Member IDs and audit metadata must not
-- leak to viewer-role accounts via list/detail JSON even when PII is hidden.
BEGIN;
DO $$ BEGIN
 IF to_regclass('public.briofold_customers') IS NULL
    OR to_regclass('public.briofold_customer_followups') IS NULL
    OR to_regclass('public.financial_realm') IS NOT NULL THEN
  RAISE EXCEPTION '0189 requires the CONTROL CRM schema';
 END IF;
END $$;

CREATE OR REPLACE FUNCTION briofold_customers_read(w uuid,e text,a uuid,cid uuid,off integer,q text,filter text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE role_name text;pii boolean;staff boolean;items jsonb;item jsonb;
BEGIN
 role_name:=briofold_customer_actor(w,a,'read');
 pii:=role_name IN ('owner','admin');
 staff:=role_name IN ('owner','admin','editor');
 IF e NOT IN ('live','sandbox') OR e IS NULL OR off IS NULL OR off<0 OR off>10000
    OR q IS NULL OR length(q)>100
    OR filter NOT IN ('','new','contacted','qualified','proposal','won','lost','due') THEN
  RAISE EXCEPTION 'Invalid CRM filter' USING ERRCODE='22023';
 END IF;
 IF cid IS NULL THEN
  SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) INTO items FROM (
   SELECT c.id,c.name,c.stage,c.temperature,c.tags,
    CASE WHEN staff THEN c.assignee ELSE NULL END AS assignee,
    c.assignee IS NOT NULL AS assigned,c.revision,c.updated_at,
    CASE WHEN pii THEN c.email ELSE '' END AS email,
    CASE WHEN pii THEN c.phone ELSE '' END AS phone,
    EXISTS(SELECT 1 FROM briofold_customer_followups f
     WHERE f.customer_id=c.id AND f.status='scheduled' AND f.due_at<=now()) AS due
   FROM briofold_customers c
   WHERE c.workspace_id=w AND c.environment=e AND c.deleted_at IS NULL AND c.merged_into IS NULL
    AND (q='' OR c.name ILIKE '%'||q||'%' OR (pii AND
      (c.email ILIKE '%'||q||'%' OR c.phone ILIKE '%'||q||'%')) OR
      EXISTS(SELECT 1 FROM unnest(c.tags) tag WHERE tag ILIKE '%'||q||'%'))
    AND (filter='' OR c.stage=filter OR (filter='due' AND
      EXISTS(SELECT 1 FROM briofold_customer_followups f WHERE f.customer_id=c.id
      AND f.status='scheduled' AND f.due_at<=now())))
   ORDER BY c.updated_at DESC,c.id LIMIT 51 OFFSET off
  ) x;
  RETURN jsonb_build_object('items',items,'can_manage',staff,'can_contact',pii,
   'can_export',pii,
   'members',CASE WHEN staff THEN coalesce((SELECT jsonb_agg(jsonb_build_object('id',u.id,'name',u.display_name))
      FROM workspace_members m JOIN app_users u ON u.id=m.user_id
      WHERE m.workspace_id=w AND u.disabled_at IS NULL),'[]'::jsonb)
     ELSE '[]'::jsonb END);
 END IF;
 SELECT to_jsonb(c)-'workspace_id'-'email'-'phone'-'notes'-'reason'-'assignee'
   ||jsonb_build_object('assignee',CASE WHEN staff THEN c.assignee ELSE NULL END,
     'assigned',c.assignee IS NOT NULL)
  INTO item FROM briofold_customers c WHERE c.workspace_id=w AND c.environment=e AND c.id=cid;
 IF item IS NULL THEN RAISE EXCEPTION 'Customer unavailable' USING ERRCODE='42501';END IF;
 IF pii THEN
  SELECT item||jsonb_build_object('email',c.email,'phone',c.phone,'notes',c.notes,'reason',c.reason)
    INTO item FROM briofold_customers c WHERE c.id=cid;
 END IF;
 RETURN jsonb_build_object('customer',item,'can_manage',staff,'can_contact',pii,'can_export',pii,
  'archives',CASE WHEN pii THEN coalesce((WITH RECURSIVE ids(id) AS (
    SELECT cid UNION SELECT x.id FROM briofold_customers x JOIN ids ON x.merged_into=ids.id)
    SELECT jsonb_agg(to_jsonb(z)) FROM (SELECT x.id,x.name,x.email,x.phone,x.notes,x.tags
    FROM briofold_customers x WHERE x.id IN(SELECT id FROM ids) AND x.id<>cid
    ORDER BY x.created_at,x.id LIMIT 51 OFFSET off) z),'[]'::jsonb) ELSE '[]'::jsonb END,
  'sources',coalesce((SELECT jsonb_agg(to_jsonb(s)-'workspace_id'-'environment')
    FROM briofold_customer_sources s WHERE s.customer_id=cid),'[]'::jsonb),
  'proofs',CASE WHEN pii THEN coalesce((SELECT jsonb_agg(jsonb_build_object('id',p.id,
    'kind',p.kind,'value',p.value,'verified_at',p.verified_at,'revoked_at',p.revoked_at))
    FROM briofold_customer_proofs p WHERE p.customer_id=cid),'[]'::jsonb)
    ELSE '[]'::jsonb END,
  'followups',coalesce((SELECT jsonb_agg(jsonb_build_object('id',f.id,'due_at',f.due_at,
    'time_zone',f.time_zone,'status',f.status,'body',CASE WHEN pii THEN f.body ELSE '' END)
    ORDER BY f.due_at) FROM briofold_customer_followups f WHERE f.customer_id=cid),'[]'::jsonb),
  'events',coalesce((SELECT jsonb_agg(to_jsonb(x) ORDER BY x.sequence DESC)
    FROM (SELECT sequence,action,created_at FROM briofold_customer_events
     WHERE customer_id=cid ORDER BY sequence DESC LIMIT 51 OFFSET off) x),'[]'::jsonb));
END $$;

COMMIT;
