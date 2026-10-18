-- 0097: Control DB only. Independent Store identity; Workspace identity remains unchanged.
BEGIN;
DO $$ BEGIN
 IF to_regclass('public.workspaces') IS NULL OR to_regclass('public.financial_realm') IS NOT NULL
 THEN RAISE EXCEPTION '0097 requires control database'; END IF;
END $$;
CREATE TABLE dashboard_store_profiles (
 workspace_id uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
 body jsonb NOT NULL CHECK(jsonb_typeof(body)='object'),
 version bigint NOT NULL DEFAULT 1,
 updated_by uuid REFERENCES app_users(id),
 updated_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE dashboard_store_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE dashboard_store_profiles FORCE ROW LEVEL SECURITY;
DO $$ BEGIN EXECUTE format('CREATE POLICY dashboard_store_profiles_owner ON dashboard_store_profiles TO %I USING(true) WITH CHECK(true)',current_user); END $$;
REVOKE ALL ON dashboard_store_profiles FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
-- Migrate checkout branding without resetting existing store names or logos.
INSERT INTO dashboard_store_profiles(workspace_id,body)
SELECT w.id,jsonb_build_object('name',coalesce(nullif(trim(t.body->'store'->>'name'),''),w.name),
 'logo',coalesce(t.body->'store'->>'logo',''),'area','','address','','phone','')
FROM workspaces w LEFT JOIN checkout_theme_settings t ON t.workspace_id=w.id;
CREATE FUNCTION dashboard_store_on_workspace() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 INSERT INTO dashboard_store_profiles(workspace_id,body) VALUES(NEW.id,jsonb_build_object('name',NEW.name,'logo','','area','','address','','phone','')) ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;
CREATE TRIGGER dashboard_store_init AFTER INSERT ON workspaces FOR EACH ROW EXECUTE FUNCTION dashboard_store_on_workspace();

CREATE FUNCTION dashboard_store_read(w uuid,a uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM pg13_actor(w,a,false);
 RETURN (SELECT jsonb_build_object('body',body,'version',version) FROM dashboard_store_profiles WHERE workspace_id=w);
END $$;
CREATE FUNCTION dashboard_store_write(w uuid,a uuid,b jsonb,v bigint,logo_hash text DEFAULT NULL,logo_png bytea DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE old_version bigint;k text;
BEGIN
 PERFORM pg13_actor(w,a,true);
 IF pg13_capability_override(w,a,'workspace:settings') IS FALSE THEN RAISE EXCEPTION 'access denied' USING ERRCODE='42501';END IF;
 IF jsonb_typeof(b)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(b))<>5
 OR coalesce(length(trim(b->>'name')) BETWEEN 2 AND 100,false)=false
 OR coalesce(length(b->>'area')<=120,false)=false OR coalesce(length(b->>'address')<=250,false)=false
 OR coalesce(length(b->>'phone')<=30,false)=false
 OR coalesce((b->>'logo'='' OR (b->>'logo')~'^/api/checkout-logos/[a-f0-9]{64}$'),false)=false
 THEN RAISE EXCEPTION 'invalid store' USING ERRCODE='22023';END IF;
 FOR k IN SELECT jsonb_object_keys(b) LOOP
  IF k NOT IN ('name','logo','area','address','phone') OR jsonb_typeof(b->k)<>'string'
   OR (b->>k)~'[[:cntrl:]]' THEN RAISE EXCEPTION 'invalid store field' USING ERRCODE='22023'; END IF;
 END LOOP;
 PERFORM pg_advisory_xact_lock(hashtextextended('store:'||w::text,0));
 SELECT version INTO old_version FROM dashboard_store_profiles WHERE workspace_id=w FOR UPDATE;
 IF old_version IS NULL OR old_version<>v THEN RAISE EXCEPTION 'store changed' USING ERRCODE='23505';END IF;
 IF logo_hash IS NOT NULL THEN
  IF logo_png IS NULL OR encode(digest(logo_png,'sha256'),'hex')<>logo_hash OR b->>'logo'<>'/api/checkout-logos/'||logo_hash
  THEN RAISE EXCEPTION 'invalid logo' USING ERRCODE='22023';END IF;
  INSERT INTO checkout_theme_logos(digest,png) VALUES(logo_hash,logo_png) ON CONFLICT(digest) DO NOTHING;
 END IF;
 UPDATE dashboard_store_profiles SET body=b,version=version+1,updated_by=a,updated_at=now() WHERE workspace_id=w;
 INSERT INTO pg13_control_audit(workspace_id,actor_id,action,resource_id) VALUES(w,a,'store.updated',w);
 RETURN dashboard_store_read(w,a);
END $$;
CREATE FUNCTION dashboard_workspace_rename(w uuid,a uuid,new_name text) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM pg13_actor(w,a,true);
 IF pg13_capability_override(w,a,'workspace:settings') IS FALSE THEN RAISE EXCEPTION 'access denied' USING ERRCODE='42501';END IF;
 new_name:=trim(new_name);
 IF length(new_name) NOT BETWEEN 2 AND 60 OR new_name~'[[:cntrl:]]'
 THEN RAISE EXCEPTION 'invalid workspace name' USING ERRCODE='22023';END IF;
 UPDATE workspaces SET name=new_name,updated_at=now() WHERE id=w;
 INSERT INTO pg13_control_audit(workspace_id,actor_id,action,resource_id) VALUES(w,a,'workspace.renamed',w);
 RETURN new_name;
END $$;
-- Store-uploaded logos can be read on the public checkout.
CREATE OR REPLACE FUNCTION dashboard_checkout_logo(d text) RETURNS bytea
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT png FROM checkout_theme_logos WHERE digest=d AND
 (EXISTS(SELECT 1 FROM checkout_theme_settings t WHERE t.body->'store'->>'logo'='/api/checkout-logos/'||d)
 OR EXISTS(SELECT 1 FROM dashboard_store_profiles s WHERE s.body->>'logo'='/api/checkout-logos/'||d))
$$;
-- Theme editor receives Store identity read-only; only theme and logo size are theme-owned.
CREATE OR REPLACE FUNCTION dashboard_checkout_theme_read(w uuid,a uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE body_value jsonb;v bigint;store_body jsonb;
BEGIN
 PERFORM pg13_actor(w,a,false);
 SELECT body INTO store_body FROM dashboard_store_profiles WHERE workspace_id=w;
 SELECT body,version INTO body_value,v FROM checkout_theme_settings WHERE workspace_id=w;
 IF body_value IS NULL THEN
  body_value:=jsonb_build_object('theme','official','info',true,'f',jsonb_build_object('name',true,'email',true,'addr',false,'note',false));
 END IF;
 body_value:=jsonb_set(body_value,'{store}',jsonb_build_object('name',store_body->>'name','logo',store_body->>'logo',
  'size',coalesce((body_value->'store'->>'size')::integer,40)),true);
 RETURN jsonb_build_object('body',body_value,'version',coalesce(v,0));
END $$;
CREATE OR REPLACE FUNCTION dashboard_checkout_theme_write(w uuid,a uuid,b jsonb,v bigint,logo_hash text DEFAULT NULL,logo_png bytea DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE old_version bigint;store_body jsonb;
BEGIN
 PERFORM pg13_actor(w,a,true);
 IF pg13_capability_override(w,a,'workspace:settings') IS FALSE THEN RAISE EXCEPTION 'access denied' USING ERRCODE='42501';END IF;
 IF b->>'theme' NOT IN ('official','receipt','studio','sheet','hero','rail','journal','dial','night')
 OR jsonb_typeof(b->'info')<>'boolean' OR (b->'store'->>'size')::integer NOT BETWEEN 24 AND 96
 THEN RAISE EXCEPTION 'invalid theme settings' USING ERRCODE='22023';END IF;
 SELECT body INTO store_body FROM dashboard_store_profiles WHERE workspace_id=w;
 b:=jsonb_set(b,'{store}',jsonb_build_object('name',store_body->>'name','logo',store_body->>'logo','size',(b->'store'->>'size')::integer),true);
 PERFORM pg_advisory_xact_lock(hashtextextended('checkout-theme:'||w::text,0));
 SELECT version INTO old_version FROM checkout_theme_settings WHERE workspace_id=w;
 IF coalesce(old_version,0)<>v THEN RAISE EXCEPTION 'theme changed' USING ERRCODE='23505';END IF;
 INSERT INTO checkout_theme_settings VALUES(w,b,1,a,now()) ON CONFLICT(workspace_id) DO UPDATE SET
 body=excluded.body,version=checkout_theme_settings.version+1,updated_by=a,updated_at=now();
 INSERT INTO pg13_control_audit(workspace_id,actor_id,action,resource_id) VALUES(w,a,'checkout-theme.saved',w);
 RETURN dashboard_checkout_theme_read(w,a);
END $$;
-- Payments expose Store identity, not Workspace identity.
CREATE OR REPLACE FUNCTION pg13_public_checkout(w uuid,e text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('merchant_name',coalesce(nullif(store.body->>'name',''),wsp.name),
 'brand',jsonb_strip_nulls(jsonb_build_object(
 'logo_url',coalesce(nullif(store.body->>'logo',''),setting.body->>'logo_url'),
 'title',setting.body->>'checkout_title','description',setting.body->>'checkout_description',
 'support_url',setting.body->>'support_url','support_email',setting.body->>'support_email',
 'legal_url',setting.body->>'legal_url','locale',setting.body->>'locale',
 'checkout_theme',CASE WHEN theme.body IS NULL THEN NULL ELSE
 jsonb_set(theme.body,'{store}',jsonb_build_object('name',coalesce(store.body->>'name',wsp.name),
 'logo',coalesce(store.body->>'logo',''),'size',coalesce((theme.body->'store'->>'size')::integer,40)),true)::text END)))
 FROM workspaces wsp JOIN workspace_environments env ON env.workspace_id=wsp.id AND env.environment=e AND env.status='active'
 JOIN workspace_product_access prod ON prod.workspace_id=wsp.id AND prod.product='payments' AND prod.enabled
 LEFT JOIN pg13_business_settings setting ON setting.workspace_id=wsp.id
 LEFT JOIN checkout_theme_settings theme ON theme.workspace_id=wsp.id
 LEFT JOIN dashboard_store_profiles store ON store.workspace_id=wsp.id
 WHERE wsp.id=w AND e IN ('live','sandbox')
$$;
REVOKE ALL ON FUNCTION dashboard_store_read(uuid,uuid),dashboard_store_write(uuid,uuid,jsonb,bigint,text,bytea),dashboard_workspace_rename(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION dashboard_store_read(uuid,uuid),dashboard_store_write(uuid,uuid,jsonb,bigint,text,bytea),dashboard_workspace_rename(uuid,uuid,text) TO ekmivo_financial_runtime;
COMMIT;
