-- Phase 10 control-plane team groups. Group permissions are restrictions only:
-- a group may deny a capability but never grant privileges above the actor's
-- base role or an existing per-member restriction. No financial realm DDL.
BEGIN;
DO $$BEGIN
 IF to_regclass('public.pg13_member_grants') IS NULL OR to_regclass('public.financial_realm') IS NOT NULL
 THEN RAISE EXCEPTION '0196 requires isolated CONTROL team schema'; END IF;
END $$;

CREATE TABLE briofold_team_groups (
 id uuid PRIMARY KEY,workspace_id uuid NOT NULL REFERENCES workspaces(id),
 name text NOT NULL CHECK(length(trim(name)) BETWEEN 1 AND 100),
 denied_capabilities text[] NOT NULL DEFAULT '{}'::text[]
  CHECK(cardinality(denied_capabilities)<=11 AND denied_capabilities <@ ARRAY[
   'payments:read','payments:issue','payments:manage','payments:export','workspace:settings',
   'members:manage','product:payments','inbox:read','inbox:send','inbox:manage','product:ai']::text[]),
 active boolean NOT NULL DEFAULT true,revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 updated_at timestamptz NOT NULL DEFAULT now(),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,id)
);
CREATE UNIQUE INDEX briofold_team_group_name ON briofold_team_groups(workspace_id,lower(name)) WHERE active;
CREATE TABLE briofold_team_group_members (
 workspace_id uuid NOT NULL,group_id uuid NOT NULL,user_id uuid NOT NULL,
 PRIMARY KEY(workspace_id,group_id,user_id),
 FOREIGN KEY(workspace_id,group_id) REFERENCES briofold_team_groups(workspace_id,id) ON DELETE CASCADE,
 FOREIGN KEY(workspace_id,user_id) REFERENCES workspace_members(workspace_id,user_id) ON DELETE CASCADE
);
CREATE INDEX briofold_team_group_member_lookup ON briofold_team_group_members(workspace_id,user_id,group_id);
DO $$DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY['briofold_team_groups','briofold_team_group_members'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY %I ON %I TO %I USING(true) WITH CHECK(true)',t||'_owner',t,current_user);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection',t);
 END LOOP;
END $$;

-- Direct per-member denies continue to win. Group denies cannot elevate a
-- viewer/editor or undo a product-scoped deny. Existing owner bypass retained.
CREATE OR REPLACE FUNCTION pg13_capability_override(w uuid,a uuid,cap text) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT CASE WHEN m.role='owner' THEN NULL
  WHEN cap LIKE 'payments:%' AND (
   EXISTS(SELECT 1 FROM pg13_member_grants g WHERE g.workspace_id=w AND g.user_id=a AND g.capability='product:payments' AND NOT g.allowed)
   OR EXISTS(SELECT 1 FROM briofold_team_group_members gm JOIN briofold_team_groups tg
    ON tg.workspace_id=gm.workspace_id AND tg.id=gm.group_id WHERE gm.workspace_id=w AND gm.user_id=a AND tg.active AND 'product:payments'=ANY(tg.denied_capabilities))) THEN false
  WHEN cap LIKE 'inbox:%' AND (
   EXISTS(SELECT 1 FROM pg13_member_grants g WHERE g.workspace_id=w AND g.user_id=a AND g.capability='product:ai' AND NOT g.allowed)
   OR EXISTS(SELECT 1 FROM briofold_team_group_members gm JOIN briofold_team_groups tg
    ON tg.workspace_id=gm.workspace_id AND tg.id=gm.group_id WHERE gm.workspace_id=w AND gm.user_id=a AND tg.active AND 'product:ai'=ANY(tg.denied_capabilities))) THEN false
  WHEN EXISTS(SELECT 1 FROM briofold_team_group_members gm JOIN briofold_team_groups tg
   ON tg.workspace_id=gm.workspace_id AND tg.id=gm.group_id WHERE gm.workspace_id=w AND gm.user_id=a AND tg.active AND cap=ANY(tg.denied_capabilities)) THEN false
  ELSE (SELECT g.allowed FROM pg13_member_grants g WHERE g.workspace_id=w AND g.user_id=a AND g.capability=cap)
 END
 FROM workspace_members m WHERE m.workspace_id=w AND m.user_id=a
$$;

CREATE FUNCTION briofold_team_groups_read(w uuid,a uuid) RETURNS jsonb
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE role text;
BEGIN
 role:=pg13_actor(w,a,false);
 IF role<>'owner' THEN
  RETURN jsonb_build_object('can_manage',false,'groups','[]'::jsonb,'members','[]'::jsonb);
 END IF;
 RETURN jsonb_build_object('can_manage',true,
  'groups',coalesce((SELECT jsonb_agg(jsonb_build_object('id',g.id,'name',g.name,
   'denied_capabilities',g.denied_capabilities,'revision',g.revision,
   'members',coalesce((SELECT jsonb_agg(gm.user_id ORDER BY gm.user_id) FROM briofold_team_group_members gm
    WHERE gm.workspace_id=w AND gm.group_id=g.id),'[]'::jsonb)) ORDER BY g.name,g.id)
   FROM briofold_team_groups g WHERE g.workspace_id=w AND g.active),'[]'::jsonb),
  'members',coalesce((SELECT jsonb_agg(jsonb_build_object('id',m.user_id,'name',u.display_name,'role',m.role) ORDER BY u.display_name,m.user_id)
   FROM workspace_members m JOIN app_users u ON u.id=m.user_id WHERE m.workspace_id=w AND m.role<>'owner' AND u.disabled_at IS NULL),'[]'::jsonb));
END $$;

CREATE FUNCTION briofold_team_groups_write(w uuid,a uuid,act text,b jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE gid uuid;row briofold_team_groups;group_name text;caps text[];members uuid[];
 input_caps jsonb;input_members jsonb;expected bigint;member uuid;
BEGIN
 IF pg13_actor(w,a,true)<>'owner' THEN RAISE EXCEPTION 'owner required' USING ERRCODE='42501';END IF;
 PERFORM 1 FROM workspace_members m JOIN app_users u ON u.id=m.user_id WHERE m.workspace_id=w AND m.user_id=a FOR SHARE OF m,u;
 IF pg13_actor(w,a,true)<>'owner' THEN RAISE EXCEPTION 'owner required' USING ERRCODE='42501';END IF;
 IF act NOT IN ('create','update','archive') OR jsonb_typeof(b) IS DISTINCT FROM 'object' OR pg_column_size(b)>8192
 THEN RAISE EXCEPTION 'invalid group action' USING ERRCODE='22023';END IF;
 gid:=(b->>'id')::uuid;
 IF gid IS NULL THEN RAISE EXCEPTION 'group id required' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('briofold:groups:'||w::text,0));
 SELECT * INTO row FROM briofold_team_groups WHERE workspace_id=w AND id=gid FOR UPDATE;
 IF act='create' THEN
  IF row.id IS NULL AND (SELECT count(*) FROM briofold_team_groups WHERE workspace_id=w AND active)>=100
  THEN RAISE EXCEPTION 'group limit reached' USING ERRCODE='54000';END IF;
 ELSE
  expected:=(b->>'revision')::bigint;
  IF row.id IS NULL OR NOT row.active THEN RAISE EXCEPTION 'group unavailable' USING ERRCODE='42501';END IF;
  IF expected IS DISTINCT FROM row.revision THEN RAISE EXCEPTION 'group revision conflict' USING ERRCODE='40001';END IF;
 END IF;
 IF act='archive' THEN
  UPDATE briofold_team_groups SET active=false,revision=revision+1,updated_at=now() WHERE workspace_id=w AND id=gid;
 ELSE
  group_name:=trim(coalesce(b->>'name',''));
  input_caps:=b->'denied_capabilities';input_members:=b->'members';
  IF length(group_name) NOT BETWEEN 1 AND 100 OR jsonb_typeof(input_caps) IS DISTINCT FROM 'array'
   OR jsonb_typeof(input_members) IS DISTINCT FROM 'array' OR jsonb_array_length(input_caps)>11
   OR jsonb_array_length(input_members)>100 THEN
   RAISE EXCEPTION 'invalid group payload' USING ERRCODE='22023';
  END IF;
  SELECT coalesce(array_agg(DISTINCT item.capability ORDER BY item.capability),'{}'::text[]) INTO caps
   FROM jsonb_array_elements_text(input_caps) AS item(capability);
  IF NOT caps <@ ARRAY['payments:read','payments:issue','payments:manage','payments:export','workspace:settings',
   'members:manage','product:payments','inbox:read','inbox:send','inbox:manage','product:ai']::text[] THEN
   RAISE EXCEPTION 'invalid permission' USING ERRCODE='22023';
  END IF;
  SELECT coalesce(array_agg(DISTINCT item.member_id::uuid ORDER BY item.member_id::uuid),'{}'::uuid[]) INTO members
   FROM jsonb_array_elements_text(input_members) AS item(member_id);
  IF EXISTS(SELECT 1 FROM unnest(members) requested WHERE NOT EXISTS(
   SELECT 1 FROM workspace_members m JOIN app_users u ON u.id=m.user_id
    WHERE m.workspace_id=w AND m.user_id=requested AND m.role<>'owner' AND u.disabled_at IS NULL)) THEN
   RAISE EXCEPTION 'group member unavailable' USING ERRCODE='42501';
  END IF;
  IF act='create' THEN
   IF row.id IS NOT NULL THEN
    IF row.active AND row.revision=1 AND row.name=group_name AND row.denied_capabilities=caps
     AND members=coalesce((SELECT array_agg(user_id ORDER BY user_id) FROM briofold_team_group_members WHERE workspace_id=w AND group_id=gid),'{}'::uuid[])
    THEN RETURN jsonb_build_object('saved',true,'id',gid);END IF;
    RAISE EXCEPTION 'Group create conflict' USING ERRCODE='23505';
   END IF;
   INSERT INTO briofold_team_groups(id,workspace_id,name,denied_capabilities) VALUES(gid,w,group_name,caps);
  ELSE
   UPDATE briofold_team_groups SET name=group_name,denied_capabilities=caps,revision=revision+1,updated_at=now()
    WHERE workspace_id=w AND id=gid;
  END IF;
  DELETE FROM briofold_team_group_members WHERE workspace_id=w AND group_id=gid;
  FOREACH member IN ARRAY members LOOP
   INSERT INTO briofold_team_group_members(workspace_id,group_id,user_id) VALUES(w,gid,member);
  END LOOP;
 END IF;
 INSERT INTO pg13_control_audit(workspace_id,actor_id,action,resource_id)
  VALUES(w,a,'team-group-'||act,gid);
 RETURN jsonb_build_object('saved',true,'id',gid);
END $$;
REVOKE ALL ON FUNCTION briofold_team_groups_read(uuid,uuid),briofold_team_groups_write(uuid,uuid,text,jsonb)
 FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION briofold_team_groups_read(uuid,uuid),briofold_team_groups_write(uuid,uuid,text,jsonb)
 TO ekmivo_financial_runtime;
COMMIT;
