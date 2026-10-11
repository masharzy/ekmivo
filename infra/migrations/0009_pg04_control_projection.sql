-- PG04 additive CONTROL-plane projection version (applied to existing auth DB).
-- Source data stays in auth DB; financial databases receive only workspace UUID,
-- realm, active/suspended and increasing version. No user/session/secret cloned.
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
INSERT INTO financial_projection_versions(workspace_id,environment)
 SELECT workspace_id,environment FROM workspace_environments
 ON CONFLICT DO NOTHING;

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
  UPDATE financial_projection_versions SET version=version+1,changed_at=now()
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
 IF NEW.product='payments' AND (TG_OP='INSERT' OR NEW.enabled IS DISTINCT FROM OLD.enabled) THEN
  UPDATE financial_projection_versions SET version=version+1,changed_at=now()
  WHERE workspace_id=NEW.workspace_id;
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER financial_projection_product_bump_trigger
 AFTER INSERT OR UPDATE OF enabled ON workspace_product_access
 FOR EACH ROW EXECUTE FUNCTION financial_projection_payment_product_bump();

-- Constrained machine role can resolve only booleans/version by explicit UUID.
-- No cross-database FK/identity copies, no untrusted tenant user headers.
CREATE FUNCTION resolve_financial_projection(p_workspace uuid,p_environment text)
RETURNS TABLE(workspace_id uuid,environment text,source_version bigint,active boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT v.workspace_id,v.environment,v.version,
   (e.status='active' AND COALESCE(pa.enabled,false)) AS active
 FROM financial_projection_versions v
 JOIN workspace_environments e ON e.workspace_id=v.workspace_id
  AND e.environment=v.environment
 LEFT JOIN workspace_product_access pa ON pa.workspace_id=v.workspace_id
  AND pa.product='payments'
 WHERE v.workspace_id=p_workspace AND v.environment=p_environment
 LIMIT 1
$$;
REVOKE ALL ON FUNCTION resolve_financial_projection(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION resolve_financial_projection(uuid,text)
 TO ekmivo_financial_projection;

ALTER TABLE financial_projection_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_projection_versions FORCE ROW LEVEL SECURITY;
DO $ BEGIN
 EXECUTE format('CREATE POLICY financial_projection_migration_owner ON financial_projection_versions FOR ALL TO %I USING (true) WITH CHECK (true)',current_user);
END; $;
REVOKE ALL ON financial_projection_versions FROM PUBLIC,ekmivo_financial_runtime,
 ekmivo_financial_projection;
COMMIT;
