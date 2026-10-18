-- 0099: Control DB only. Extend Store profile to screenshot fields; remove the redundant Area field.
BEGIN;
DO $$ BEGIN
 IF to_regclass('public.dashboard_store_profiles') IS NULL OR to_regclass('public.financial_realm') IS NOT NULL
 THEN RAISE EXCEPTION '0099 requires Store control schema';END IF;
END $$;
UPDATE dashboard_store_profiles
 SET body=(body-'area')||
 jsonb_build_object('address',coalesce(nullif(body->>'address',''),body->>'area',''),
  'business_type','online','description','','brand_color','#0b0c0f',
  'support_email','','whatsapp','','website','','statement_name','','refund_url','','receipt_note',''),
 version=version+1,updated_at=now()
 WHERE NOT (body ? 'business_type');

CREATE OR REPLACE FUNCTION dashboard_store_on_workspace() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 INSERT INTO dashboard_store_profiles(workspace_id,body)
 VALUES(NEW.id,jsonb_build_object('name',NEW.name,'logo','','business_type','online',
 'description','','brand_color','#0b0c0f','phone','','support_email','',
 'whatsapp','','website','','address','','statement_name','','refund_url','','receipt_note',''))
 ON CONFLICT DO NOTHING;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION dashboard_store_write(w uuid,a uuid,b jsonb,v bigint,logo_hash text DEFAULT NULL,logo_png bytea DEFAULT NULL) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE old_version bigint;k text;limits jsonb:='{"name":40,"logo":130,"business_type":30,"description":60,"brand_color":7,"phone":11,"support_email":254,"whatsapp":11,"website":500,"address":250,"statement_name":22,"refund_url":500,"receipt_note":120}'::jsonb;
BEGIN
 PERFORM pg13_actor(w,a,true);
 IF pg13_capability_override(w,a,'workspace:settings') IS FALSE THEN RAISE EXCEPTION 'access denied' USING ERRCODE='42501';END IF;
 IF jsonb_typeof(b)<>'object' OR (SELECT count(*) FROM jsonb_object_keys(b))<>13
 OR length(trim(coalesce(b->>'name',''))) NOT BETWEEN 2 AND 40
 THEN RAISE EXCEPTION 'invalid store fields' USING ERRCODE='22023';END IF;
 FOR k IN SELECT jsonb_object_keys(b) LOOP
  IF NOT(limits?k) OR jsonb_typeof(b->k)<>'string' OR length(b->>k)>(limits->>k)::integer
   OR (b->>k)~'[[:cntrl:]]' THEN RAISE EXCEPTION 'invalid store field' USING ERRCODE='22023';END IF;
 END LOOP;
 IF b->>'business_type' NOT IN ('online','physical','service','other')
 OR b->>'brand_color' NOT IN ('#0b0c0f','#2563eb','#7c3aed','#db2777','#ea580c','#059669')
 OR (b->>'logo'<>'' AND (b->>'logo')!~'^/api/checkout-logos/[a-f0-9]{64}$')
 OR (b->>'phone'<>'' AND (b->>'phone')!~'^01[3-9][0-9]{8}$')
 OR (b->>'whatsapp'<>'' AND (b->>'whatsapp')!~'^01[3-9][0-9]{8}$')
 OR (b->>'statement_name'<>'' AND (b->>'statement_name')!~'^[A-Za-z0-9 .-]{1,22}$')
 OR (b->>'support_email'<>'' AND (b->>'support_email')!~'^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$')
 OR (b->>'website'<>'' AND left(b->>'website',8)<>'https://')
 OR (b->>'refund_url'<>'' AND left(b->>'refund_url',8)<>'https://')
 THEN RAISE EXCEPTION 'invalid store field format' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('store:'||w::text,0));
 SELECT version INTO old_version FROM dashboard_store_profiles WHERE workspace_id=w FOR UPDATE;
 IF old_version IS NULL OR old_version<>v THEN RAISE EXCEPTION 'store changed' USING ERRCODE='23505';END IF;
 IF logo_hash IS NOT NULL THEN
  IF logo_png IS NULL OR octet_length(logo_png)>1048576 OR encode(digest(logo_png,'sha256'),'hex')<>logo_hash
  OR b->>'logo'<>'/api/checkout-logos/'||logo_hash THEN RAISE EXCEPTION 'invalid logo' USING ERRCODE='22023';END IF;
  INSERT INTO checkout_theme_logos(digest,png) VALUES(logo_hash,logo_png) ON CONFLICT(digest) DO NOTHING;
 END IF;
 UPDATE dashboard_store_profiles SET body=b,version=version+1,updated_by=a,updated_at=now() WHERE workspace_id=w;
 INSERT INTO pg13_control_audit(workspace_id,actor_id,action,resource_id) VALUES(w,a,'store.updated',w);
 RETURN dashboard_store_read(w,a);
END $$;
-- Public checkout receives saved Store contact details instead of stale Workspace settings.
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
 jsonb_set(theme.body,'{store}',jsonb_build_object('name',coalesce(store.body->>'name',wsp.name),
 'logo',coalesce(store.body->>'logo',''),'size',coalesce((theme.body->'store'->>'size')::integer,40)),true)::text END)))
 FROM workspaces wsp JOIN workspace_environments env ON env.workspace_id=wsp.id AND env.environment=e AND env.status='active'
 JOIN workspace_product_access prod ON prod.workspace_id=wsp.id AND prod.product='payments' AND prod.enabled
 LEFT JOIN pg13_business_settings setting ON setting.workspace_id=wsp.id
 LEFT JOIN checkout_theme_settings theme ON theme.workspace_id=wsp.id
 LEFT JOIN dashboard_store_profiles store ON store.workspace_id=wsp.id
 WHERE wsp.id=w AND e IN ('live','sandbox')
$$;
COMMIT;
