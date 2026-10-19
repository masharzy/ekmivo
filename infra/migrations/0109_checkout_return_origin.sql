BEGIN;
-- Resolve origin from durable document bindings, never a browser parameter or
-- reference prefix. Payment links deliberately expose no redirect destination.
CREATE OR REPLACE FUNCTION pg62_checkout_redirects(w uuid,e text,intent uuid)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT CASE WHEN current_setting('ekmivo.workspace_id',true)=w::text
 AND current_setting('ekmivo.environment',true)=e
 AND e=(SELECT environment FROM financial_realm WHERE singleton)
 AND EXISTS(SELECT 1 FROM payment_intents i WHERE i.id=intent AND i.workspace_id=w AND i.environment=e)
 THEN CASE WHEN EXISTS(
 SELECT 1 FROM pg10_document_intents l JOIN pg10_documents d
 ON d.id=l.document_id AND d.workspace_id=l.workspace_id AND d.environment=l.environment
 WHERE l.intent_id=intent AND l.workspace_id=w AND l.environment=e AND d.kind='payment-links')
 THEN jsonb_build_object('checkout_origin','payment_link')
 ELSE jsonb_build_object('checkout_origin','merchant') || COALESCE((
 SELECT jsonb_strip_nulls(jsonb_build_object('return_url',NULLIF(redirect_url,''),'cancel_url',NULLIF(cancel_url,'')))
 FROM pg62_intent_options WHERE workspace_id=w AND environment=e AND intent_id=intent),'{}'::jsonb) END
 ELSE '{}'::jsonb END
$$;
REVOKE ALL ON FUNCTION pg62_checkout_redirects(uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pg62_checkout_redirects(uuid,text,uuid) TO ekmivo_finance_reader;
COMMIT;
