-- PG04 CONTROL database migration: versioned minimal financial tenant projection.
-- No financial records, phone numbers, credentials or receipts live here.
BEGIN;
CREATE TABLE financial_projection_versions (
 workspace_id uuid NOT NULL,
 environment text NOT NULL CHECK(environment IN ('sandbox','live')),
 version bigint NOT NULL DEFAULT 1 CHECK(version>0),
 changed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,environment),
 FOREIGN KEY(workspace_id,environment)
  REFERENCES workspace_environments(workspace_id,environment) ON DELETE CASCADE
);
CREATE TABLE financial_projection_tombstones (
 workspace_id uuid NOT NULL,
 environment text NOT NULL CHECK(environment IN ('sandbox','live')),
 version bigint NOT NULL CHECK(version>0),
 deleted_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,environment)
);
INSERT INTO financial_projection_versions(workspace_id,environment)
 SELECT workspace_id,environment FROM workspace_environments ON CONFLICT DO NOTHING;

CREATE FUNCTION financial_projection_environment_seed() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 INSERT INTO financial_projection_versions(workspace_id,environment)
 VALUES(NEW.workspace_id,NEW.environment) ON CONFLICT DO NOTHING;
 RETURN NEW;
END; $$;
CREATE TRIGGER financial_projection_environment_seed_trigger
 AFTER INSERT ON workspace_environments FOR EACH ROW
 EXECUTE FUNCTION financial_projection_environment_seed();

CREATE FUNCTION financial_projection_environment_bump() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.status IS DISTINCT FROM OLD.status THEN
  UPDATE financial_projection_versions
  SET version=version+1,changed_at=now()
  WHERE workspace_id=NEW.workspace_id AND environment=NEW.environment;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER financial_projection_environment_bump_trigger
 AFTER UPDATE OF status ON workspace_environments FOR EACH ROW
 EXECUTE FUNCTION financial_projection_environment_bump();

CREATE FUNCTION financial_projection_payment_product_bump() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.product='payments' THEN
  IF TG_OP='INSERT' THEN
   UPDATE financial_projection_versions SET version=version+1,changed_at=now()
   WHERE workspace_id=NEW.workspace_id;
  ELSIF NEW.enabled IS DISTINCT FROM OLD.enabled THEN
   UPDATE financial_projection_versions SET version=version+1,changed_at=now()
   WHERE workspace_id=NEW.workspace_id;
  END IF;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER financial_projection_product_bump_trigger
 AFTER INSERT OR UPDATE OF enabled ON workspace_product_access
 FOR EACH ROW EXECUTE FUNCTION financial_projection_payment_product_bump();

-- A removed workspace has an explicit higher-version tombstone. A previously
-- active financial projection cannot be re-enabled by delayed/stale syncing.
CREATE FUNCTION financial_projection_workspace_deleted() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 INSERT INTO financial_projection_tombstones(workspace_id,environment,version)
 SELECT workspace_id,environment,version+1
 FROM financial_projection_versions WHERE workspace_id=OLD.id
 ON CONFLICT(workspace_id,environment) DO UPDATE
 SET version=GREATEST(financial_projection_tombstones.version,excluded.version),
     deleted_at=now();
 RETURN OLD;
END; $$;
CREATE TRIGGER financial_projection_workspace_deleted_trigger
 BEFORE DELETE ON workspaces FOR EACH ROW
 EXECUTE FUNCTION financial_projection_workspace_deleted();

ALTER TABLE financial_projection_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_projection_versions FORCE ROW LEVEL SECURITY;
ALTER TABLE financial_projection_tombstones ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_projection_tombstones FORCE ROW LEVEL SECURITY;

-- The migration owner may maintain version rows through SECURITY DEFINER
-- triggers, even under FORCE RLS; application runtime and public get no rows.
DO $$
DECLARE migration_owner text;
BEGIN
 SELECT current_user INTO migration_owner;
 EXECUTE format('CREATE POLICY financial_projection_owner_rw ON financial_projection_versions FOR ALL TO %I USING (true) WITH CHECK (true)',migration_owner);
 EXECUTE format('CREATE POLICY financial_projection_tombstone_owner_rw ON financial_projection_tombstones FOR ALL TO %I USING (true) WITH CHECK (true)',migration_owner);
END; $$;
REVOKE ALL ON financial_projection_versions,financial_projection_tombstones
 FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;

-- Owner-only stored function is the sole access path for the projection
-- daemon; outputs UUID/environment/version/status, never identity contents.
CREATE FUNCTION list_financial_projections()
RETURNS TABLE(workspace_id uuid,environment text,source_version bigint,active boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT v.workspace_id,v.environment,v.version,
  (e.status='active' AND COALESCE(p.enabled,false)) AS active
 FROM financial_projection_versions v
 JOIN workspace_environments e ON e.workspace_id=v.workspace_id
  AND e.environment=v.environment
 LEFT JOIN workspace_product_access p ON p.workspace_id=v.workspace_id AND p.product='payments'
 UNION ALL
 SELECT t.workspace_id,t.environment,t.version,false
 FROM financial_projection_tombstones t
 WHERE NOT EXISTS(
   SELECT 1 FROM financial_projection_versions v
   WHERE v.workspace_id=t.workspace_id AND v.environment=t.environment)
$$;
CREATE FUNCTION resolve_financial_projection(p_workspace uuid,p_environment text)
RETURNS TABLE(workspace_id uuid,environment text,source_version bigint,active boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT a.workspace_id,a.environment,a.source_version,a.active
 FROM list_financial_projections() a
 WHERE a.workspace_id=p_workspace AND a.environment=p_environment LIMIT 1
$$;
REVOKE ALL ON FUNCTION list_financial_projections() FROM PUBLIC;
REVOKE ALL ON FUNCTION resolve_financial_projection(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION list_financial_projections(),
 resolve_financial_projection(uuid,text) TO ekmivo_financial_projection;
COMMIT;
