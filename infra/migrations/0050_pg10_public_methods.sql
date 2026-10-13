-- PG10 public document payment-method discovery (no receiving numbers or personal information).
-- The public document is already authenticated by an opaque capability; Go supplies its bound workspace.
-- Use the existing owner-scoped role; expose only provider identifiers and verification source metadata.
BEGIN;
DO $preflight$
DECLARE realm text;
BEGIN
 SELECT environment INTO realm FROM financial_realm WHERE singleton;
 IF realm NOT IN ('live','sandbox') OR to_regprocedure('public.pg10_public(text)') IS NULL OR
 to_regclass('public.pg06_phones') IS NULL OR to_regclass('public.pg06_phone_forwarded') IS NULL
 THEN RAISE EXCEPTION '0050 requires PG10 and PG06 signed-forwarder financial realm'; END IF;
END $preflight$;
CREATE OR REPLACE FUNCTION public.pg10_public_payment_sources(w uuid,e text)
 RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public','pg_temp'
AS $function$
DECLARE configured jsonb; sources jsonb;
BEGIN
 PERFORM pg06_scope(w,e);
 SELECT coalesce(jsonb_agg(DISTINCT a.method),'[]'::jsonb) INTO configured
 FROM financial_receiving_accounts a
 JOIN pg06_account_configuration c ON c.account_id=a.id AND c.disabled_at IS NULL
 JOIN financial_workspace_registry registry ON registry.workspace_id=a.workspace_id
  AND registry.environment=a.environment AND registry.status='active'
 WHERE a.workspace_id=w AND a.environment=e AND a.method IN ('bkash','nagad','rocket');
 SELECT coalesce(jsonb_agg(s.doc),'[]'::jsonb) INTO sources FROM (
  SELECT DISTINCT jsonb_build_object('method',a.method,'source',d.source,'parser_id',d.parser_id) AS doc
  FROM financial_receiving_accounts a JOIN pg06_account_configuration c ON c.account_id=a.id AND c.disabled_at IS NULL
  JOIN pg06_devices d ON d.account_id=a.id AND d.revoked_at IS NULL AND d.permission_ok
   AND d.heartbeat_at>now()-interval '5 minutes'
  WHERE a.workspace_id=w AND a.environment=e AND a.method IN ('bkash','nagad','rocket')
  UNION
  SELECT DISTINCT jsonb_build_object('method',a.method,'source',
    CASE a.method WHEN 'bkash' THEN 'bKash' WHEN 'nagad' THEN 'NAGAD' ELSE 'Rocket' END,
    'forwarder',true) AS doc
  FROM financial_receiving_accounts a JOIN pg06_account_configuration c ON c.account_id=a.id AND c.disabled_at IS NULL
  WHERE a.workspace_id=w AND a.environment=e AND a.method IN ('bkash','nagad','rocket') AND
   EXISTS(SELECT 1 FROM pg06_phones p WHERE p.workspace_id=a.workspace_id AND p.environment=a.environment
    AND p.claimed_at IS NOT NULL AND p.revoked_at IS NULL AND p.permission_ok
    AND p.heartbeat_at>now()-interval '20 minutes')
 ) s;
 RETURN jsonb_build_object('configured_methods',configured,'sources',sources);
END $function$;
REVOKE ALL ON FUNCTION public.pg10_public_payment_sources(uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pg10_public_payment_sources(uuid,text) TO ekmivo_finance_reader;
COMMIT;