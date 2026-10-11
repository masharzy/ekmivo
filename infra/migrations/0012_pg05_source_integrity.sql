-- Additive PG05 upgrade. Never rewrite already applied 0010/0011.
BEGIN;
ALTER FUNCTION pg05_create_linked_intent(uuid,text,text,text,uuid,integer,text,text,text)
 RENAME TO pg05_create_linked_intent_v1;
REVOKE ALL ON FUNCTION pg05_create_linked_intent_v1(uuid,text,text,text,uuid,integer,text,text,text)
 FROM PUBLIC,ekmivo_finance_reader;

CREATE FUNCTION pg05_create_linked_intent(p_workspace uuid,p_environment text,
 p_reference text,p_kind text,p_source_id uuid,p_minutes integer,
 p_key text,p_digest text,p_request_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 -- Authorize BEFORE looking up a source: no source-existence oracle across tenants.
 IF p_workspace IS NULL OR p_environment IS DISTINCT FROM 'sandbox'
 OR current_setting('ekmivo.workspace_id',true) IS DISTINCT FROM p_workspace::text
 OR current_setting('ekmivo.environment',true) IS DISTINCT FROM p_environment
 OR NOT EXISTS(SELECT 1 FROM financial_workspace_registry WHERE workspace_id=p_workspace
  AND environment=p_environment AND status='active') THEN
  RAISE EXCEPTION 'scope denied' USING ERRCODE='42501';
 END IF;
 RETURN pg05_create_linked_intent_v1(p_workspace,p_environment,p_reference,p_kind,
  p_source_id,p_minutes,p_key,p_digest,p_request_hash);
END; $$;

-- Defense in depth: even a replayed standalone intent cannot be attached to
-- a document with a different frozen amount/currency through a function call.
CREATE FUNCTION pg05_validate_source_link() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM payment_intents i JOIN pg05_billing_sources s
  ON s.workspace_id=i.workspace_id AND s.environment=i.environment
  AND s.amount_minor=i.amount_minor AND s.currency=i.currency
  WHERE i.workspace_id=NEW.workspace_id AND i.environment=NEW.environment
  AND i.id=NEW.intent_id AND s.id=NEW.source_id AND s.source_kind=NEW.source_kind) THEN
  RAISE EXCEPTION 'linked terms mismatch' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER pg05_link_terms BEFORE INSERT ON pg05_intent_source_links
 FOR EACH ROW EXECUTE FUNCTION pg05_validate_source_link();
REVOKE ALL ON FUNCTION pg05_validate_source_link() FROM PUBLIC;

ALTER FUNCTION pg05_create_billing_source(uuid,text,text,text,jsonb)
 RENAME TO pg05_create_billing_source_v1;
REVOKE ALL ON FUNCTION pg05_create_billing_source_v1(uuid,text,text,text,jsonb)
 FROM PUBLIC,ekmivo_finance_reader;
CREATE FUNCTION pg05_create_billing_source(p_workspace uuid,p_environment text,
 p_kind text,p_reference text,p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF jsonb_typeof(p_items) IS DISTINCT FROM 'array' THEN
  RAISE EXCEPTION 'items must be an array' USING ERRCODE='22023';
 END IF;
 IF EXISTS(SELECT 1 FROM jsonb_array_elements(p_items) l
  WHERE jsonb_typeof(l->'title') IS DISTINCT FROM 'string') THEN
  RAISE EXCEPTION 'title must be text' USING ERRCODE='22023';
 END IF;
 RETURN pg05_create_billing_source_v1(p_workspace,p_environment,p_kind,p_reference,p_items);
END; $$;

-- Read-only terms/history, including records outside the latest-50 list.
CREATE FUNCTION pg05_merchant_detail(p_workspace uuid,p_environment text,p_id uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 IF current_setting('ekmivo.workspace_id',true) IS DISTINCT FROM p_workspace::text
 OR current_setting('ekmivo.environment',true) IS DISTINCT FROM p_environment
 OR NOT EXISTS(SELECT 1 FROM financial_workspace_registry WHERE workspace_id=p_workspace
  AND environment=p_environment AND status='active') THEN
  RAISE EXCEPTION 'scope denied' USING ERRCODE='42501';
 END IF;
 SELECT jsonb_build_object('id',i.id,'merchant_reference',i.merchant_reference,
  'amount_minor',i.amount_minor,'currency',i.currency,'created_at',i.created_at,
  'expires_at',i.expires_at,'state',pg05_intent_state(i.workspace_id,i.environment,i.id),
  'creation_key',t.creation_key,'source_kind',l.source_kind,'source_id',l.source_id,
  'source_reference',s.source_reference,'items',s.items,
  'attempt',(SELECT jsonb_build_object('payer_suffix',a.payer_suffix,'method',a.method,
    'window_start',a.window_start,'window_end',a.window_end,'issued_at',a.issued_at)
   FROM payment_attempts a WHERE a.workspace_id=i.workspace_id AND a.environment=i.environment
    AND a.intent_id=i.id ORDER BY a.issued_at DESC LIMIT 1),
  'events',COALESCE((SELECT jsonb_agg(jsonb_build_object('event_type',e.event_type,
    'reason',e.reason,'occurred_at',e.occurred_at) ORDER BY e.occurred_at,e.id)
   FROM pg05_intent_events e WHERE e.workspace_id=i.workspace_id AND e.environment=i.environment
    AND e.intent_id=i.id),'[]'::jsonb)) INTO result
 FROM payment_intents i JOIN pg05_checkout_tokens t ON t.workspace_id=i.workspace_id
  AND t.environment=i.environment AND t.intent_id=i.id
 LEFT JOIN pg05_intent_source_links l ON l.workspace_id=i.workspace_id
  AND l.environment=i.environment AND l.intent_id=i.id
 LEFT JOIN pg05_billing_sources s ON s.workspace_id=l.workspace_id
  AND s.environment=l.environment AND s.source_kind=l.source_kind AND s.id=l.source_id
 WHERE i.workspace_id=p_workspace AND i.environment=p_environment AND i.id=p_id;
 RETURN result;
END; $$;
-- Public summary includes the same frozen document terms. The Go boundary
-- removes workspace_id and resolves the current business name from control DB.
ALTER FUNCTION pg05_checkout_view(text) RENAME TO pg05_checkout_view_v1;
REVOKE ALL ON FUNCTION pg05_checkout_view_v1(text) FROM PUBLIC,ekmivo_finance_reader;
CREATE FUNCTION pg05_checkout_view(p_digest text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb; terms jsonb; workspace uuid;
BEGIN
 result:=pg05_checkout_view_v1(p_digest);
 IF result IS NULL THEN RETURN NULL; END IF;
 SELECT t.workspace_id INTO workspace FROM pg05_checkout_tokens t WHERE t.token_digest=p_digest;
 SELECT jsonb_build_object('source_kind',s.source_kind,'source_reference',s.source_reference,'items',s.items)
 INTO terms FROM pg05_intent_source_links l JOIN pg05_billing_sources s
 ON s.workspace_id=l.workspace_id AND s.environment=l.environment
 AND s.source_kind=l.source_kind AND s.id=l.source_id
 WHERE l.workspace_id=workspace AND l.intent_id=(result->>'id')::uuid
 AND l.environment=result->>'environment';
 RETURN result||jsonb_build_object('workspace_id',workspace)||COALESCE(terms,'{}'::jsonb);
END; $$;
REVOKE ALL ON FUNCTION pg05_checkout_view(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pg05_checkout_view(text) TO ekmivo_finance_reader;
REVOKE ALL ON FUNCTION pg05_create_linked_intent(uuid,text,text,text,uuid,integer,text,text,text),
 pg05_create_billing_source(uuid,text,text,text,jsonb),pg05_merchant_detail(uuid,text,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pg05_create_linked_intent(uuid,text,text,text,uuid,integer,text,text,text),
 pg05_create_billing_source(uuid,text,text,text,jsonb),pg05_merchant_detail(uuid,text,uuid) TO ekmivo_finance_reader;
COMMIT;
