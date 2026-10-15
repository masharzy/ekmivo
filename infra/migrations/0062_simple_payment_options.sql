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
 webhook_endpoint_id uuid,
 customer_name text NOT NULL DEFAULT '',
 customer_email text NOT NULL DEFAULT '',
 customer_phone text NOT NULL DEFAULT '',
 merchant_metadata jsonb NOT NULL DEFAULT '{}'::jsonb CHECK(jsonb_typeof(merchant_metadata)='object'),
 created_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(workspace_id,environment,intent_id) REFERENCES payment_intents(workspace_id,environment,id) ON DELETE RESTRICT,
 FOREIGN KEY(workspace_id,environment,webhook_endpoint_id) REFERENCES pg08_endpoints(workspace_id,environment,id) ON DELETE RESTRICT
);
ALTER TABLE pg62_intent_options ENABLE ROW LEVEL SECURITY;
ALTER TABLE pg62_intent_options FORCE ROW LEVEL SECURITY;
DO $$ BEGIN EXECUTE format('CREATE POLICY pg62_intent_options_owner ON pg62_intent_options TO %I USING(true) WITH CHECK(true)',current_user); END $$;
REVOKE ALL ON pg62_intent_options FROM PUBLIC,ekmivo_finance_reader,ekmivo_financial_worker;
CREATE FUNCTION pg62_store_intent_options(w uuid,e text,intent uuid,redir text,cancel text,hook text,cname text,cemail text,cphone text,extra jsonb)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE existing_options pg62_intent_options%ROWTYPE; endpoint uuid;
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
 SELECT * INTO existing_options FROM pg62_intent_options WHERE intent_id=intent;
 IF FOUND THEN
 IF (existing_options.redirect_url,existing_options.cancel_url,existing_options.webhook_url,existing_options.customer_name,
     existing_options.customer_email,existing_options.customer_phone,existing_options.merchant_metadata)
    IS DISTINCT FROM (redir,cancel,hook,cname,cemail,cphone,extra)
 THEN RAISE EXCEPTION 'payment options changed on retry' USING ERRCODE='23505'; END IF;
 RETURN true;
 END IF;
 -- A per-payment webhook URL may select only an already registered, active
 -- workspace/realm endpoint with its own signing secret and retry worker.
 -- Never dispatch to a request-provided arbitrary network host.
 IF hook<>'' THEN
  SELECT id INTO endpoint FROM pg08_endpoints
  WHERE workspace_id=w AND environment=e AND url=hook AND active ORDER BY created_at LIMIT 1;
  IF endpoint IS NULL THEN RAISE EXCEPTION 'webhook URL must be an active registered endpoint' USING ERRCODE='22023'; END IF;
 END IF;
 INSERT INTO pg62_intent_options(workspace_id,environment,intent_id,redirect_url,cancel_url,webhook_url,webhook_endpoint_id,customer_name,customer_email,customer_phone,merchant_metadata)
 VALUES(w,e,intent,redir,cancel,hook,endpoint,cname,cemail,cphone,extra);
 RETURN true;
END $$;
-- Merchant-only PII and metadata, never included in token/public checkout.
CREATE FUNCTION pg62_merchant_options(w uuid,e text,intent uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT CASE WHEN current_setting('ekmivo.workspace_id',true)=w::text
 AND current_setting('ekmivo.environment',true)=e AND
 e=(SELECT environment FROM financial_realm WHERE singleton)
 THEN COALESCE((SELECT jsonb_build_object(
 'redirect_url',redirect_url,'cancel_url',cancel_url,
 'webhook_url',webhook_url,'customer_name',customer_name,
 'customer_email',customer_email,'customer_phone',customer_phone,
 'metadata',merchant_metadata)
 FROM pg62_intent_options WHERE workspace_id=w AND environment=e AND intent_id=intent),'{}'::jsonb)
 ELSE '{}'::jsonb END
$$;
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
REVOKE ALL ON FUNCTION pg62_store_intent_options(uuid,text,uuid,text,text,text,text,text,text,jsonb),pg62_checkout_redirects(uuid,text,uuid),pg62_merchant_options(uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pg62_store_intent_options(uuid,text,uuid,text,text,text,text,text,text,jsonb),pg62_checkout_redirects(uuid,text,uuid),pg62_merchant_options(uuid,text,uuid) TO ekmivo_finance_reader;

-- The existing durable delivery worker and HMAC remain authoritative.
-- If the merchant selected a registered per-payment endpoint, route only
-- events concerning this immutable intent to that endpoint. Without a
-- selection, retain the historical broadcast-to-active-endpoints behavior.
CREATE FUNCTION pg62_route_payment_webhook() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE target_endpoint uuid;
BEGIN
 SELECT options.webhook_endpoint_id INTO target_endpoint
 FROM pg07_events ev
 LEFT JOIN financial_payments p ON p.id=ev.payment_id
   AND p.workspace_id=ev.workspace_id AND p.environment=ev.environment
 LEFT JOIN payment_attempts a ON a.id=p.attempt_id
   AND a.workspace_id=p.workspace_id AND a.environment=p.environment
 JOIN pg62_intent_options options ON options.workspace_id=ev.workspace_id
   AND options.environment=ev.environment
   AND options.intent_id::text=COALESCE(
     a.intent_id::text,
     ev.payload->'data'->>'payment_intent_id',
     ev.payload->'data'->>'intent_id')
 WHERE ev.id=NEW.event_id AND ev.workspace_id=NEW.workspace_id
   AND ev.environment=NEW.environment;
 IF target_endpoint IS NOT NULL AND target_endpoint<>NEW.endpoint_id THEN
   RETURN NULL;
 END IF;
 RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION pg62_route_payment_webhook() FROM PUBLIC;
CREATE TRIGGER pg62_delivery_endpoint_selection
 BEFORE INSERT ON pg08_deliveries FOR EACH ROW
 EXECUTE FUNCTION pg62_route_payment_webhook();
COMMIT;
