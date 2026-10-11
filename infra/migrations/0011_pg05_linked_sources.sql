-- PG05 0011: immutable server-priced sandbox order/invoice snapshots.
-- Merchant supplies line descriptions/quantity/unit prices, never a linked total.
BEGIN;
CREATE TABLE pg05_billing_sources (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL,
 environment text NOT NULL CHECK(environment IN ('sandbox','live')),
 source_kind text NOT NULL CHECK(source_kind IN ('order','invoice')),
 source_reference text NOT NULL CHECK(length(source_reference) BETWEEN 1 AND 128),
 items jsonb NOT NULL CHECK(jsonb_typeof(items)='array'),
 amount_minor bigint NOT NULL CHECK(amount_minor BETWEEN 1 AND 100000000000),
 currency char(3) NOT NULL DEFAULT 'BDT' CHECK(currency='BDT'),
 issued_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,environment,source_kind,id),
 UNIQUE(workspace_id,environment,source_kind,source_reference),
 FOREIGN KEY(workspace_id,environment)
  REFERENCES financial_workspace_registry(workspace_id,environment) ON DELETE RESTRICT
);
CREATE TABLE pg05_intent_source_links (
 workspace_id uuid NOT NULL,
 environment text NOT NULL,
 intent_id uuid NOT NULL,
 source_kind text NOT NULL,
 source_id uuid NOT NULL,
 linked_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,environment,intent_id),
 FOREIGN KEY(workspace_id,environment,intent_id)
  REFERENCES payment_intents(workspace_id,environment,id) ON DELETE RESTRICT,
 FOREIGN KEY(workspace_id,environment,source_kind,source_id)
  REFERENCES pg05_billing_sources(workspace_id,environment,source_kind,id) ON DELETE RESTRICT
);
CREATE INDEX pg05_links_source ON pg05_intent_source_links(workspace_id,environment,source_kind,source_id);
DO $$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['pg05_billing_sources','pg05_intent_source_links'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO %I USING (true) WITH CHECK (true)',
   t||'_migration_owner',t,current_user);
  EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION financial_reject_history_change()',t||'_immutable',t);
 END LOOP;
END; $$;
REVOKE ALL ON pg05_billing_sources,pg05_intent_source_links FROM PUBLIC,ekmivo_finance_reader,ekmivo_financial_worker;

CREATE FUNCTION pg05_create_billing_source(p_workspace uuid,p_environment text,
 p_kind text,p_reference text,p_items jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE line jsonb; name text; q text; u text; total numeric:=0;
 issued pg05_billing_sources%ROWTYPE;
BEGIN
 IF p_environment<>'sandbox' OR p_kind NOT IN ('order','invoice')
  OR current_setting('ekmivo.workspace_id',true) IS DISTINCT FROM p_workspace::text
  OR current_setting('ekmivo.environment',true) IS DISTINCT FROM p_environment
  OR p_reference IS NULL OR length(p_reference) NOT BETWEEN 1 AND 128
  OR p_reference<>btrim(p_reference) OR p_reference ~ '[[:cntrl:]]'
  OR jsonb_typeof(p_items) IS DISTINCT FROM 'array'
  OR jsonb_array_length(p_items) NOT BETWEEN 1 AND 20
  OR NOT EXISTS(SELECT 1 FROM financial_workspace_registry WHERE workspace_id=p_workspace
   AND environment=p_environment AND status='active') THEN
  RAISE EXCEPTION 'invalid billing source' USING ERRCODE='22023';
 END IF;
 FOR line IN SELECT value FROM jsonb_array_elements(p_items) LOOP
  IF jsonb_typeof(line) IS DISTINCT FROM 'object'
   OR EXISTS(SELECT 1 FROM jsonb_object_keys(line) AS item_key(field)
    WHERE field NOT IN ('title','quantity','unit_amount_minor')) THEN
   RAISE EXCEPTION 'invalid billing line keys' USING ERRCODE='22023';
  END IF;
  name:=line->>'title';q:=line->>'quantity';u:=line->>'unit_amount_minor';
  IF name IS NULL OR length(name) NOT BETWEEN 1 AND 160 OR name<>btrim(name)
   OR name ~ '[[:cntrl:]]' OR q IS NULL OR q !~ '^[1-9][0-9]{0,3}$'
   OR u IS NULL OR u !~ '^[1-9][0-9]{0,11}$'
   OR jsonb_typeof(line->'quantity') IS DISTINCT FROM 'number'
   OR jsonb_typeof(line->'unit_amount_minor') IS DISTINCT FROM 'number' THEN
   RAISE EXCEPTION 'invalid quantity or unit amount' USING ERRCODE='22023';
  END IF;
  total:=total+(q::numeric*u::numeric);
  IF total>100000000000 THEN
   RAISE EXCEPTION 'total exceeds allowed range' USING ERRCODE='22023';
  END IF;
 END LOOP;
 INSERT INTO pg05_billing_sources
 (workspace_id,environment,source_kind,source_reference,items,amount_minor)
 VALUES(p_workspace,p_environment,p_kind,p_reference,p_items,total::bigint)
 ON CONFLICT(workspace_id,environment,source_kind,source_reference) DO NOTHING
 RETURNING * INTO issued;
 IF NOT FOUND THEN
  SELECT * INTO issued FROM pg05_billing_sources
  WHERE workspace_id=p_workspace AND environment=p_environment
   AND source_kind=p_kind AND source_reference=p_reference;
  IF issued.id IS NULL OR issued.items IS DISTINCT FROM p_items
   OR issued.amount_minor IS DISTINCT FROM total::bigint THEN
   RAISE EXCEPTION 'source document identity conflict' USING ERRCODE='23505';
  END IF;
 END IF;
 RETURN jsonb_build_object('id',issued.id,'source_kind',issued.source_kind,
  'source_reference',issued.source_reference,'amount_minor',issued.amount_minor,
  'currency',issued.currency,'issued_at',issued.issued_at,'items',issued.items);
END; $$;

CREATE FUNCTION pg05_list_billing_sources(p_workspace uuid,p_environment text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT CASE WHEN current_setting('ekmivo.workspace_id',true)=p_workspace::text
 AND current_setting('ekmivo.environment',true)=p_environment
 AND EXISTS(SELECT 1 FROM financial_workspace_registry WHERE workspace_id=p_workspace
  AND environment=p_environment AND status='active') THEN
 COALESCE((SELECT jsonb_agg(jsonb_build_object(
  'id',s.id,'source_kind',s.source_kind,'source_reference',s.source_reference,
  'amount_minor',s.amount_minor,'currency',s.currency,'issued_at',s.issued_at,
  'items',s.items) ORDER BY s.issued_at DESC)
  FROM (SELECT * FROM pg05_billing_sources WHERE workspace_id=p_workspace
  AND environment=p_environment ORDER BY issued_at DESC LIMIT 50) s),'[]'::jsonb)
 ELSE NULL END
$$;

CREATE FUNCTION pg05_create_linked_intent(p_workspace uuid,p_environment text,
 p_reference text,p_kind text,p_source_id uuid,p_minutes integer,
 p_key text,p_digest text,p_request_hash text)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE source pg05_billing_sources%ROWTYPE; issued jsonb;
 saved pg05_intent_source_links%ROWTYPE;
BEGIN
 IF p_kind NOT IN ('order','invoice') OR p_source_id IS NULL THEN
  RAISE EXCEPTION 'invalid linked source' USING ERRCODE='22023';
 END IF;
 SELECT * INTO source FROM pg05_billing_sources
 WHERE workspace_id=p_workspace AND environment=p_environment AND
 source_kind=p_kind AND id=p_source_id;
 IF NOT FOUND THEN RAISE EXCEPTION 'linked source not found' USING ERRCODE='P0002'; END IF;
 -- Serialize issuance for the same authoritative source across different
 -- idempotency keys: never issue competing active full-amount checkouts.
 PERFORM pg_advisory_xact_lock(hashtextextended(
  p_workspace::text||':'||p_environment||':pg05.linked:'||p_source_id::text,0));
 issued:=pg05_create_intent(p_workspace,p_environment,p_reference,source.amount_minor,
  p_minutes,p_key,p_digest,p_request_hash);
 IF EXISTS(SELECT 1 FROM pg05_intent_source_links l WHERE
  l.workspace_id=p_workspace AND l.environment=p_environment
  AND l.source_kind=p_kind AND l.source_id=p_source_id
  AND l.intent_id<>(issued->>'id')::uuid
  AND pg05_intent_state(l.workspace_id,l.environment,l.intent_id)
    NOT IN ('cancelled','expired')) THEN
  RAISE EXCEPTION 'source has an active request' USING ERRCODE='23505';
 END IF;
 INSERT INTO pg05_intent_source_links(workspace_id,environment,intent_id,source_kind,source_id)
 VALUES(p_workspace,p_environment,(issued->>'id')::uuid,p_kind,p_source_id)
 ON CONFLICT(workspace_id,environment,intent_id) DO NOTHING;
 SELECT * INTO saved FROM pg05_intent_source_links
 WHERE workspace_id=p_workspace AND environment=p_environment
 AND intent_id=(issued->>'id')::uuid;
 IF saved.source_kind IS DISTINCT FROM p_kind OR saved.source_id IS DISTINCT FROM p_source_id THEN
  RAISE EXCEPTION 'linked source conflict' USING ERRCODE='23505';
 END IF;
 RETURN issued||jsonb_build_object('source_kind',p_kind,'source_id',p_source_id,
  'source_reference',source.source_reference);
END; $$;

CREATE OR REPLACE FUNCTION pg05_merchant_list(p_workspace uuid,p_environment text)
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT CASE WHEN current_setting('ekmivo.workspace_id',true)=p_workspace::text
 AND current_setting('ekmivo.environment',true)=p_environment
 AND EXISTS(SELECT 1 FROM financial_workspace_registry WHERE workspace_id=p_workspace
  AND environment=p_environment AND status='active') THEN
 COALESCE((SELECT jsonb_agg(jsonb_build_object(
  'id',i.id,'merchant_reference',i.merchant_reference,'amount_minor',i.amount_minor,
  'currency',i.currency,'created_at',i.created_at,'expires_at',i.expires_at,
  'state',pg05_intent_state(i.workspace_id,i.environment,i.id),
  'creation_key',t.creation_key,'source_kind',l.source_kind,'source_id',l.source_id,
  'source_reference',s.source_reference) ORDER BY i.created_at DESC)
  FROM (SELECT * FROM payment_intents WHERE workspace_id=p_workspace
  AND environment=p_environment ORDER BY created_at DESC LIMIT 50) i
  JOIN pg05_checkout_tokens t ON t.workspace_id=i.workspace_id
   AND t.environment=i.environment AND t.intent_id=i.id
  LEFT JOIN pg05_intent_source_links l ON l.workspace_id=i.workspace_id
   AND l.environment=i.environment AND l.intent_id=i.id
  LEFT JOIN pg05_billing_sources s ON s.workspace_id=l.workspace_id
   AND s.environment=l.environment AND s.source_kind=l.source_kind AND s.id=l.source_id),'[]'::jsonb)
 ELSE NULL END
$$;
REVOKE ALL ON FUNCTION pg05_create_billing_source(uuid,text,text,text,jsonb),
 pg05_list_billing_sources(uuid,text),
 pg05_create_linked_intent(uuid,text,text,text,uuid,integer,text,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pg05_create_billing_source(uuid,text,text,text,jsonb),
 pg05_list_billing_sources(uuid,text),
 pg05_create_linked_intent(uuid,text,text,text,uuid,integer,text,text,text)
 TO ekmivo_finance_reader;
COMMIT;
