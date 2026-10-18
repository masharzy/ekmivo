-- 0100: control DB only. Checkout logo presentation is theme-owned, logo bytes and name remain Store-owned.
BEGIN;
DO $$ BEGIN
 IF to_regclass('public.checkout_theme_settings') IS NULL OR to_regclass('public.dashboard_store_profiles') IS NULL
 OR to_regclass('public.financial_realm') IS NOT NULL THEN
 RAISE EXCEPTION '0100 requires the control database through 0099'; END IF;
END $$;
-- Upgrade saved themes without modifying merchant Store names or existing logo bytes.
UPDATE checkout_theme_settings SET body=jsonb_set(body,'{store}',
 coalesce(body->'store','{}'::jsonb)||jsonb_build_object(
 'radius',0,'position','beside-left','invert',false),true)
 WHERE NOT (body->'store' ? 'radius') OR NOT (body->'store' ? 'position') OR NOT (body->'store' ? 'invert');

CREATE OR REPLACE FUNCTION dashboard_checkout_theme_read(w uuid,a uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE b jsonb;v bigint;sb jsonb;sv jsonb;
BEGIN
 PERFORM pg13_actor(w,a,false);
 SELECT body INTO sb FROM dashboard_store_profiles WHERE workspace_id=w;
 SELECT body,version INTO b,v FROM checkout_theme_settings WHERE workspace_id=w;
 IF b IS NULL THEN b:=jsonb_build_object('theme','official','info',true,
 'f',jsonb_build_object('name',true,'email',true,'addr',false,'note',false));END IF;
 sv:=coalesce(b->'store','{}'::jsonb);
 b:=jsonb_set(b,'{store}',jsonb_build_object(
 'name',sb->>'name','logo',coalesce(sb->>'logo',''),
 'size',coalesce((sv->>'size')::integer,40),
 'radius',coalesce((sv->>'radius')::integer,0),
 'position',coalesce(nullif(sv->>'position',''),'beside-left'),
 'invert',coalesce((sv->>'invert')::boolean,false)),true);
 RETURN jsonb_build_object('body',b,'version',coalesce(v,0));
END $$;

CREATE OR REPLACE FUNCTION dashboard_checkout_theme_write(w uuid,a uuid,b jsonb,v bigint,logo_hash text DEFAULT NULL,logo_png bytea DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE old_version bigint;sb jsonb;sv jsonb;
BEGIN
 PERFORM pg13_actor(w,a,true);
 IF pg13_capability_override(w,a,'workspace:settings') IS FALSE
 THEN RAISE EXCEPTION 'access denied' USING ERRCODE='42501';END IF;
 sv:=b->'store';
 IF b->>'theme' NOT IN ('official','receipt','studio','sheet','hero','rail','journal','dial','night')
 OR jsonb_typeof(b->'info')<>'boolean'
 OR coalesce((sv->>'size')::integer BETWEEN 24 AND 96,false)=false
 OR coalesce((sv->>'radius')::integer BETWEEN 0 AND 48,false)=false
 OR coalesce(sv->>'position' IN ('top-left','top-center','top-right','beside-left','beside-right'),false)=false
 OR jsonb_typeof(sv->'invert')<>'boolean'
 THEN RAISE EXCEPTION 'invalid checkout presentation' USING ERRCODE='22023';END IF;
 SELECT body INTO sb FROM dashboard_store_profiles WHERE workspace_id=w;
 IF sb IS NULL THEN RAISE EXCEPTION 'store unavailable' USING ERRCODE='P0002';END IF;
 -- Ignore all incoming brand identity from client; only trusted Store settings decide name/logo.
 b:=jsonb_set(b,'{store}',jsonb_build_object(
 'name',sb->>'name','logo',coalesce(sb->>'logo',''),
 'size',(sv->>'size')::integer,'radius',(sv->>'radius')::integer,
 'position',sv->>'position','invert',(sv->>'invert')::boolean),true);
 PERFORM pg_advisory_xact_lock(hashtextextended('checkout-theme:'||w::text,0));
 SELECT version INTO old_version FROM checkout_theme_settings WHERE workspace_id=w;
 IF coalesce(old_version,0)<>v THEN RAISE EXCEPTION 'theme changed' USING ERRCODE='23505';END IF;
 INSERT INTO checkout_theme_settings VALUES(w,b,1,a,now())
 ON CONFLICT(workspace_id) DO UPDATE SET
 body=excluded.body,version=checkout_theme_settings.version+1,updated_by=a,updated_at=now();
 INSERT INTO pg13_control_audit(workspace_id,actor_id,action,resource_id)
 VALUES(w,a,'checkout-theme.saved',w);
 RETURN dashboard_checkout_theme_read(w,a);
END $$;

CREATE OR REPLACE FUNCTION pg13_public_checkout(w uuid,e text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('merchant_name',coalesce(nullif(store.body->>'name',''),wsp.name),
 'brand',jsonb_strip_nulls(jsonb_build_object(
 'logo_url',coalesce(nullif(store.body->>'logo',''),setting.body->>'logo_url'),
 'title',setting.body->>'checkout_title',
 'description',coalesce(nullif(store.body->>'description',''),setting.body->>'checkout_description'),
 'support_url',coalesce(nullif(store.body->>'website',''),setting.body->>'support_url'),
 'support_email',coalesce(nullif(store.body->>'support_email',''),setting.body->>'support_email'),
 'legal_url',coalesce(nullif(store.body->>'refund_url',''),setting.body->>'legal_url'),
 'locale',setting.body->>'locale',
 'checkout_theme',CASE WHEN theme.body IS NULL THEN NULL ELSE
 jsonb_set(theme.body,'{store}',jsonb_build_object(
 'name',coalesce(store.body->>'name',wsp.name),'logo',coalesce(store.body->>'logo',''),
 'size',coalesce((theme.body->'store'->>'size')::integer,40),
 'radius',coalesce((theme.body->'store'->>'radius')::integer,0),
 'position',coalesce(nullif(theme.body->'store'->>'position',''),'beside-left'),
 'invert',coalesce((theme.body->'store'->>'invert')::boolean,false)),true)::text END)))
 FROM workspaces wsp JOIN workspace_environments env
 ON env.workspace_id=wsp.id AND env.environment=e AND env.status='active'
 JOIN workspace_product_access prod
 ON prod.workspace_id=wsp.id AND prod.product='payments' AND prod.enabled
 LEFT JOIN pg13_business_settings setting ON setting.workspace_id=wsp.id
 LEFT JOIN checkout_theme_settings theme ON theme.workspace_id=wsp.id
 LEFT JOIN dashboard_store_profiles store ON store.workspace_id=wsp.id
 WHERE wsp.id=w AND e IN ('live','sandbox')
$$;
COMMIT;
