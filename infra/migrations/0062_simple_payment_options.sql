-- Simple payment API options. Apply separately to Sandbox and Live finance DBs.
-- Public token views only expose safe navigation destinations, never PII.
BEGIN;
CREATE TABLE pg62_intent_options (
 workspace_id uuid NOT NULL,
 environment text NOT NULL CHECK(environment IN ('sandbox','live')),
 intent_id uuid PRIMARY KEY,
 redirect_url text NOT NULL DEFAULT '',
 cancel_url text NOT NULL DEFAULT '',
 webhook_url text NOT NULL DEFAULT '',
 customer_name text NOT NULL DEFAULT '',
 customer_email text NOT NULL DEFAULT '',
 customer_phone text NOT NULL DEFAULT '',
 merchant_metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(merchant_metadata)='object'),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(workspace_id,environment,intent_id) REFERENCES payment_intents(workspace_id,environment,id) ON DELETE RESTRICT
);
ALTER TABLE pg62_intent_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE pg62_intent_options FORCE ROW LEVEL SECURITY;
DO $ BEGIN EXECUTE format('CREATE POLICY pg62_intent_options_owner ON pg62_intent_options TO %I USING(true) WITH CHECK(true)',current_user); END $;
REVOKE ALL ON pg62_intent_options FROM PUBLIC,ekmivo_finance_reader,ekmivo_financial_worker;
CREATE FUNCTION pg62_store_intent_options(w uuid,e text,intent uuid,redir text,cancel text,hook text,cname text,cemail text,cphone text,extra jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE current pg62_intent_options%ROWTYPE;
BEGIN
 IF current_setting('ekmivo.workspace_id',true) IS DISTINCT FROM w::text OR
 current_setting('ekmivo.environment',true) IS DISTINCT FROM e OR
 e IS DISTINCT FROM (SELECT environment FROM financial_realm WHERE singleton) OR
 NOT EXISTS(SELECT 1 FROM payment_intents WHERE workspace_id=w AND environment=e AND id=intent) OR
 length(redir)>2048 OR length(cancel)>2048 OR length(hook)>2048 OR
 length(cname)>160 OR length(cemail)>254 OR length(cphone)>32 OR
 length(extra::text)>2048 OR jsonb_typeof(extra) IS DISTINCT FROM 'object' THEN
 RAISE EXCEPTION 'invalid payment options or authority' USING ERRCODE='22023';
 END IF;
 -- A per-payment webhook URL may select only an already registered, active
 -- workspace/realm endpoint with its own signing secret and retry worker.
 -- Never dispatch to a request-provided arbitrary network host.
 IF hook<>'' AND NOT EXISTS(
 SELECT 1 FROM pg08_endpoints WHERE workspace_id=w AND environment=e AND url=hook AND active
 ) THEN RAISE EXCEPTION 'webhook URL must be an active registered endpoint' USING ERRCODE='22023'; END IF;
 SELECT * INTO current FROM pg62_intent_options WHERE intent_id=intent;
 IF FOUND THEN
 IF (current.redirect_url,current.cancel_url,current.webhook_url,current.customer_name,
     current.customer_email,current.customer_phone,current.merchant_metadata)
    IS DISTINCT FROM (redir,cancel,hook,cname,cemail,cphone,extra)
 THEN RAISE EXCEPTION 'payment options changed on retry' USING ERRCODE='23505'; END IF;
 RETURN true;
 END IF;
 INSERT INTO pg62_intent_options(workspace_id,environment,intent_id,redirect_url,cancel_url,webhook_url,customer_name,customer_email,customer_phone,merchant_metadata)
 VALUES(w,e,intent,redir,cancel,hook,cname,cemail,cphone,extra);
 RETURN true;
END $$;
CREATE FUNCTION pg62_checkout_redirects(w uuid,e text,intent uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT CASE WHEN current_setting('ekmivo.workspace_id',true)=w::text
 AND current_setting('ekmivo.environment',true)=e AND
 e=(SELECT environment FROM financial_realm WHERE singleton)
 THEN COALESCE((SELECT jsonb_strip_nulls(jsonb_build_object(
 'return_url',NULLIF(redirect_url,''),'cancel_url',NULLIF(cancel_url,''))
 FROM pg62_intent_options WHERE workspace_id=w AND environment=e AND intent_id=intent),'{}'::jsonb)
 ELSE '{}'::jsonb END
$$;
REVOKE ALL ON FUNCTION pg62_store_intent_options(uuid,text,uuid,text,text,text,text,text,text,jsonb),pg62_checkout_redirects(uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pg62_store_intent_options(uuid,text,uuid,text,text,text,text,text,text,jsonb),pg62_checkout_redirects(uuid,text,uuid) TO ekmivo_finance_reader;
COMMIT;
