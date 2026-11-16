-- Both financial realms. Owner decision 2026-11-16: a payment link or invoice may
-- use any public https Redirect URL, not only a website added in Integrations.
-- Behind BRIOFOLD_ANY_RETURN_URL_ENABLED: the Go API sets the transaction setting
-- ekmivo.any_return_url='on' only when that flag is on. Flag off = the old rule.
-- The Go API already rejects non-https, credentials and private hosts
-- (merchantwebhook.ValidateURL); query strings and fragments stay refused here.
-- CREATE OR REPLACE keeps the existing grants. Safe to run twice.
BEGIN;
DO $$ BEGIN PERFORM 1 FROM financial_realm; END $$;
CREATE OR REPLACE FUNCTION pg10_return_allowed(w uuid,e text,url text) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT url IS NULL OR url=''
 OR EXISTS(SELECT 1 FROM pg12_integrations WHERE workspace_id=w AND environment=e AND status='configured' AND (url=origin OR left(url,length(origin)+1)=origin||'/') AND url!~ '[?#]')
 OR (coalesce(current_setting('ekmivo.any_return_url',true),'')='on' AND length(url)<=2048
     AND url ~ '^https://[A-Za-z0-9.-]+(:[0-9]{1,5})?(/[^[:space:]?#]*)?$')
$$;
REVOKE ALL ON FUNCTION pg10_return_allowed(uuid,text,text) FROM PUBLIC;
COMMIT;
