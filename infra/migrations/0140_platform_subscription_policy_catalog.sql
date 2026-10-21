-- Published legal documents must be administrator-approved; no documents seeded.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF current_database()<>'ekmivo' OR to_regclass('public.platform_subscription_policy_versions') IS NULL
 OR to_regclass('public.financial_realm') IS NOT NULL
 THEN RAISE EXCEPTION '0140 requires Ekmivo control DB after checkout foundation';END IF;
END $$;

CREATE FUNCTION platform_subscription_policy_admin(actor uuid, operation text, payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE policy platform_subscription_policy_versions%ROWTYPE;
 target uuid; kind text; title text; address text; fingerprint text; reason text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM platform_administrators p JOIN app_users u ON u.id=p.user_id
  WHERE p.user_id=actor AND p.role='super_admin' AND u.disabled_at IS NULL)
 THEN RAISE EXCEPTION 'super admin required' USING ERRCODE='42501';END IF;
 IF jsonb_typeof(payload) IS DISTINCT FROM 'object' OR pg_column_size(payload)>8000
 THEN RAISE EXCEPTION 'invalid input' USING ERRCODE='22023';END IF;
 IF operation='list' THEN
   RETURN jsonb_build_object('policies',coalesce((SELECT jsonb_agg(to_jsonb(p)||jsonb_build_object(
      'acceptances',(SELECT count(*) FROM platform_subscription_policy_acceptances a WHERE a.policy_version_id=p.id))
      ORDER BY CASE p.kind WHEN 'terms' THEN 1 WHEN 'privacy' THEN 2 ELSE 3 END,p.created_at DESC)
    FROM platform_subscription_policy_versions p),'[]'::jsonb));
 END IF;
 reason:=trim(coalesce(payload->>'reason',''));
 IF length(reason) NOT BETWEEN 10 AND 500 THEN RAISE EXCEPTION 'audit reason required' USING ERRCODE='22023';END IF;
 IF operation='create' THEN
  kind:=coalesce(payload->>'kind','');title:=trim(coalesce(payload->>'version_label',''));
  address:=trim(coalesce(payload->>'url',''));fingerprint:=lower(trim(coalesce(payload->>'content_sha256','')));
  IF kind NOT IN ('terms','privacy','refund') OR length(title) NOT BETWEEN 1 AND 64
     OR title!~'^[A-Za-z0-9][A-Za-z0-9._-]*$'
     OR length(address)>2000 OR address!~'^https://[A-Za-z0-9.-]+(:443)?(/[A-Za-z0-9._~:/?#\[\]@!$&''()*+,;=%-]*)?$'
     OR fingerprint!~'^[a-f0-9]{64}$'
  THEN RAISE EXCEPTION 'invalid legal document version, URL or fingerprint' USING ERRCODE='22023';END IF;
  INSERT INTO platform_subscription_policy_versions(kind,version_label,url,content_sha256,status,created_by)
  VALUES(kind,title,address,fingerprint,'draft',actor) RETURNING * INTO policy;
 ELSIF operation IN ('publish','archive') THEN
  target:=(payload->>'id')::uuid;
  SELECT * INTO policy FROM platform_subscription_policy_versions WHERE id=target FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'policy not found' USING ERRCODE='P0002';END IF;
  IF policy.status='archived' OR operation='publish' AND policy.status<>'draft'
    OR operation='archive' AND policy.status NOT IN ('draft','published')
  THEN RAISE EXCEPTION 'invalid policy transition' USING ERRCODE='23514';END IF;
  PERFORM pg_advisory_xact_lock(hashtextextended('ekmivo-policy-'+policy.kind,0));
  IF operation='publish' THEN
    UPDATE platform_subscription_policy_versions SET status='archived'
    WHERE kind=policy.kind AND status='published';
    UPDATE platform_subscription_policy_versions SET status='published',published_at=now()
    WHERE id=target RETURNING * INTO policy;
  ELSE
    UPDATE platform_subscription_policy_versions SET status='archived'
    WHERE id=target RETURNING * INTO policy;
  END IF;
 ELSE RAISE EXCEPTION 'unsupported operation' USING ERRCODE='22023';END IF;
 INSERT INTO platform_admin_audit(actor_id,action,description)
 VALUES(actor,'subscription_policy.'||operation,left(policy.kind||':'||policy.version_label||
    ' id='||policy.id||' sha256='||policy.content_sha256||' | '||reason,1800));
 RETURN jsonb_build_object('id',policy.id,'kind',policy.kind,'version_label',policy.version_label,'status',policy.status);
END $$;
CREATE FUNCTION platform_subscription_policy_public() RETURNS jsonb
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_object_agg(p.kind,jsonb_build_object(
   'id',p.id,'url',p.url,'version',p.version_label,'sha256',p.content_sha256)),
   '{}'::jsonb) FROM platform_subscription_policy_versions p WHERE p.status='published'
$$;
REVOKE ALL ON FUNCTION platform_subscription_policy_admin(uuid,text,jsonb),platform_subscription_policy_public() FROM PUBLIC;
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='ekmivo_runtime') THEN
  GRANT EXECUTE ON FUNCTION platform_subscription_policy_admin(uuid,text,jsonb),platform_subscription_policy_public() TO ekmivo_runtime;
 END IF;
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='ekmivo_financial_runtime') THEN
  GRANT EXECUTE ON FUNCTION platform_subscription_policy_admin(uuid,text,jsonb),platform_subscription_policy_public() TO ekmivo_financial_runtime;
 END IF;
END $$;
COMMIT;
