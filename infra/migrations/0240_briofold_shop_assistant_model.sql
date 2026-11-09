BEGIN;

CREATE TABLE IF NOT EXISTS briofold_shop_assistant_model_versions (
 revision bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 model text,
 actor_id uuid NOT NULL REFERENCES app_users(id),
 created_at timestamptz NOT NULL DEFAULT now(),
 CHECK (model ~ '^[A-Za-z0-9][A-Za-z0-9._:/-]{0,199}$')
);

CREATE OR REPLACE FUNCTION briofold_shop_assistant_model() RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT model FROM briofold_shop_assistant_model_versions ORDER BY revision DESC LIMIT 1
$$;

CREATE OR REPLACE FUNCTION briofold_shop_assistant_model_change(
 actor uuid, expected bigint, selected_model text, rollback boolean
) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 current_revision bigint;
 current_model text;
 next_model text := selected_model;
 new_revision bigint;
BEGIN
 PERFORM 1 FROM platform_administrators p JOIN app_users u ON u.id=p.user_id
 WHERE p.user_id=actor AND p.role='super_admin' AND u.disabled_at IS NULL FOR SHARE OF p,u;
 IF NOT FOUND THEN
  RAISE EXCEPTION 'Super Admin required' USING ERRCODE='42501';
 END IF;
 LOCK TABLE briofold_shop_assistant_model_versions IN SHARE ROW EXCLUSIVE MODE;
 SELECT revision, model INTO current_revision, current_model
 FROM briofold_shop_assistant_model_versions ORDER BY revision DESC LIMIT 1;
 IF coalesce(current_revision,0) IS DISTINCT FROM expected THEN
  RAISE EXCEPTION 'Model setting has changed' USING ERRCODE='40001';
 END IF;
 IF rollback THEN
  IF current_revision IS NULL THEN
   RAISE EXCEPTION 'No model version to roll back' USING ERRCODE='22023';
  END IF;
  SELECT model INTO next_model FROM briofold_shop_assistant_model_versions
  WHERE revision < current_revision ORDER BY revision DESC LIMIT 1;
 ELSE
  IF selected_model IS NULL OR NOT EXISTS (
   SELECT 1 FROM briofold_ai_tariff_catalog WHERE model=selected_model AND current_version IS NOT NULL
  ) THEN
   RAISE EXCEPTION 'Model must have a published rate' USING ERRCODE='22023';
  END IF;
 END IF;
 IF next_model IS NOT DISTINCT FROM current_model THEN
  RETURN current_revision;
 END IF;
 INSERT INTO briofold_shop_assistant_model_versions(model,actor_id)
 VALUES(next_model,actor) RETURNING revision INTO new_revision;
 INSERT INTO platform_admin_audit(actor_id,action,description)
 VALUES(actor, CASE WHEN rollback THEN 'ai_model.rollback' ELSE 'ai_model.change' END,
        'Shop assistant model revision ' || new_revision);
 RETURN new_revision;
END $$;

REVOKE ALL ON FUNCTION briofold_shop_assistant_model(),briofold_shop_assistant_model_change(uuid,bigint,text,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION briofold_shop_assistant_model(),briofold_shop_assistant_model_change(uuid,bigint,text,boolean) TO ekmivo_financial_runtime,ekmivo_financial_projection;
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='ekmivo_web_app') THEN
  GRANT SELECT ON briofold_shop_assistant_model_versions TO ekmivo_web_app;
  GRANT EXECUTE ON FUNCTION briofold_shop_assistant_model_change(uuid,bigint,text,boolean) TO ekmivo_web_app;
 END IF;
END $$;
COMMIT;
