-- Financial databases (sandbox and live). Payment automation Phase 1, owner
-- decision 2026-11-26: a "gateway" layer above receiving accounts, like the
-- competitor's gateway list (provider x type, display name, limits, discount,
-- charge, QR, status, order).
--
-- * briofold_providers / briofold_provider_senders: the provider registry and
--   the SMS senders each provider uses (exact text; confidence recorded). Data
--   only in Phase 1; matching does not read it yet.
-- * briofold_gateways: one row per shop gateway. An empty limit (NULL) means
--   "no limit"; 0 is a real number. Percent values are basis points (1% = 100).
-- * briofold_gateway_accounts: which gateway a receiving account belongs to. A
--   separate table because financial_receiving_accounts is immutable history
--   (financial_reject_history_change). No existing table, column or function is
--   changed.
-- * Backfill: one "personal" gateway per shop and existing method (bkash, nagad,
--   rocket), and the shop's current accounts of that method are linked to it.
--   Only new rows and the new column; existing rows keep every other value.
-- * Money arithmetic (payable = amount - discount + charge, in paisa, half-up)
--   lives in briofold_gateway_payable and is used by briofold_gateway_quote.
--
-- Nothing reads these tables unless BRIOFOLD_PAYMENT_GATEWAYS_ENABLED is on.
-- Safe to run twice.
BEGIN;
DO $$BEGIN
 IF to_regclass('public.financial_realm') IS NULL
  OR to_regclass('public.financial_receiving_accounts') IS NULL
  OR to_regclass('public.pg06_account_configuration') IS NULL
  OR to_regclass('public.financial_workspace_registry') IS NULL
  OR NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_schema='public'
   AND table_name='pg06_account_configuration' AND column_name='deleted_at') THEN
  RAISE EXCEPTION '0272 requires a financial realm with migrations through 0095';
 END IF;
END $$;

CREATE TABLE IF NOT EXISTS briofold_providers(
 code text PRIMARY KEY CHECK(code ~ '^[a-z][a-z0-9_]{1,30}$'),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 60),
 kind text NOT NULL CHECK(kind IN ('mfs','bank','api','other')),
 types text[] NOT NULL CHECK(cardinality(types) BETWEEN 1 AND 5
  AND types <@ ARRAY['personal','agent','merchant','bank','api']::text[]),
 logo text NOT NULL DEFAULT '' CHECK(logo ~ '^[a-z0-9_-]{0,40}$'),
 legacy_method text UNIQUE CHECK(legacy_method IN ('bkash','nagad','rocket')),
 position integer NOT NULL DEFAULT 1000 CHECK(position BETWEEN 0 AND 100000),
 enabled boolean NOT NULL DEFAULT true
);

-- The sender exactly as a phone shows it. 'official': from the provider;
-- 'observed': seen on a real phone; 'unverified': from a third-party list, true
-- letter case unknown. content_hint tells providers apart that share a sender
-- (Islami Bank sends both mCash and CellFin messages).
CREATE TABLE IF NOT EXISTS briofold_provider_senders(
 provider text NOT NULL REFERENCES briofold_providers(code),
 sender text NOT NULL CHECK(length(sender) BETWEEN 2 AND 40 AND sender ~ '^[A-Za-z0-9+._ -]+$'),
 sender_kind text NOT NULL CHECK(sender_kind IN ('number','name')),
 confidence text NOT NULL CHECK(confidence IN ('official','observed','unverified')),
 content_hint text NOT NULL DEFAULT '' CHECK(length(content_hint)<=40),
 PRIMARY KEY(provider,sender)
);

INSERT INTO briofold_providers(code,name,kind,types,logo,legacy_method,position) VALUES
 ('bkash','bKash','mfs','{personal,agent,merchant}','bkash','bkash',10),
 ('nagad','Nagad','mfs','{personal,agent,merchant}','nagad','nagad',20),
 ('rocket','Rocket','mfs','{personal,agent,merchant}','rocket','rocket',30),
 ('upay','Upay','mfs','{personal,agent,merchant}','upay',NULL,40),
 ('tap','Tap','mfs','{personal,agent,merchant}','tap',NULL,50),
 ('okwallet','OK Wallet','mfs','{personal,agent,merchant}','okwallet',NULL,60),
 ('cellfin','CellFin','mfs','{personal}','cellfin',NULL,70),
 ('mcash','mCash','mfs','{personal}','mcash',NULL,80),
 ('ipay','iPay','mfs','{personal}','ipay',NULL,90),
 ('pathaopay','Pathao Pay','mfs','{personal,merchant}','pathaopay',NULL,100),
 ('telecash','TeleCash','mfs','{personal}','telecash',NULL,110),
 ('tallypay','TallyPay','mfs','{personal}','',NULL,120),
 ('dgepay','DGEPay','mfs','{merchant}','',NULL,130)
ON CONFLICT(code) DO UPDATE SET name=EXCLUDED.name,kind=EXCLUDED.kind,types=EXCLUDED.types,
 logo=EXCLUDED.logo,legacy_method=EXCLUDED.legacy_method,position=EXCLUDED.position;

INSERT INTO briofold_provider_senders(provider,sender,sender_kind,confidence,content_hint) VALUES
 ('bkash','bKash','name','official',''),
 ('nagad','NAGAD','name','unverified',''),
 ('nagad','01708403334','number','unverified',''),
 ('rocket','16216','number','official',''),
 ('rocket','01190016216','number','official',''),
 ('rocket','09666777777','number','official',''),
 ('upay','upay','name','unverified',''),
 ('tap','tap','name','unverified',''),
 ('okwallet','16269','number','official',''),
 ('okwallet','okwallet','name','unverified',''),
 ('cellfin','IslamiBank','name','observed','CellFin'),
 ('cellfin','cellfin','name','unverified',''),
 ('cellfin','ibbl','name','unverified',''),
 ('cellfin','ibblcard','name','unverified',''),
 ('cellfin','01969905628','number','unverified',''),
 ('cellfin','01844242613','number','unverified',''),
 ('mcash','IslamiBank','name','observed','mCash'),
 ('ipay','ipay','name','unverified',''),
 ('pathaopay','pathaopay','name','unverified',''),
 ('pathaopay','01988114400','number','unverified',''),
 ('telecash','TeleCash','name','observed',''),
 ('tallypay','tallypay','name','unverified',''),
 ('tallypay','01309846513','number','unverified',''),
 ('tallypay','09610987019','number','unverified',''),
 ('dgepay','dgepay','name','unverified',''),
 ('dgepay','09678000005','number','unverified','')
ON CONFLICT(provider,sender) DO UPDATE SET sender_kind=EXCLUDED.sender_kind,
 confidence=EXCLUDED.confidence,content_hint=EXCLUDED.content_hint;

CREATE TABLE IF NOT EXISTS briofold_gateways(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL,
 environment text NOT NULL CHECK(environment IN ('sandbox','live')),
 provider text NOT NULL REFERENCES briofold_providers(code),
 gateway_type text NOT NULL CHECK(gateway_type IN ('personal','agent','merchant','bank','api')),
 label text NOT NULL DEFAULT '' CHECK(length(label)<=100),
 display_name text NOT NULL CHECK(length(btrim(display_name)) BETWEEN 1 AND 60 AND display_name=btrim(display_name)),
 min_amount_minor bigint CHECK(min_amount_minor IS NULL OR min_amount_minor BETWEEN 0 AND 100000000000),
 max_amount_minor bigint CHECK(max_amount_minor IS NULL OR max_amount_minor BETWEEN 0 AND 100000000000),
 fixed_discount_minor bigint NOT NULL DEFAULT 0 CHECK(fixed_discount_minor BETWEEN 0 AND 100000000000),
 percent_discount_bp integer NOT NULL DEFAULT 0 CHECK(percent_discount_bp BETWEEN 0 AND 10000),
 fixed_charge_minor bigint NOT NULL DEFAULT 0 CHECK(fixed_charge_minor BETWEEN 0 AND 100000000000),
 percent_charge_bp integer NOT NULL DEFAULT 0 CHECK(percent_charge_bp BETWEEN 0 AND 10000),
 qr_object_key text CHECK(qr_object_key IS NULL OR qr_object_key ~ '^gateway-qr/[0-9a-f-]{36}\.(png|jpg)$'),
 status text NOT NULL DEFAULT 'active' CHECK(status IN ('active','disabled')),
 position integer NOT NULL DEFAULT 0 CHECK(position BETWEEN 0 AND 100000),
 legacy_backfill boolean NOT NULL DEFAULT false,
 version bigint NOT NULL DEFAULT 1 CHECK(version>=1),
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 deleted_at timestamptz,
 CHECK(min_amount_minor IS NULL OR max_amount_minor IS NULL OR min_amount_minor<=max_amount_minor),
 UNIQUE(workspace_id,environment,id),
 FOREIGN KEY(workspace_id,environment) REFERENCES financial_workspace_registry(workspace_id,environment) ON DELETE RESTRICT
);
CREATE INDEX IF NOT EXISTS briofold_gateways_shop ON briofold_gateways(workspace_id,environment,position)
 WHERE deleted_at IS NULL;
-- At most one backfilled gateway per shop and provider, so a second run adds nothing.
CREATE UNIQUE INDEX IF NOT EXISTS briofold_gateways_one_backfill ON briofold_gateways(workspace_id,environment,provider)
 WHERE legacy_backfill;

CREATE TABLE IF NOT EXISTS briofold_gateway_accounts(
 workspace_id uuid NOT NULL,
 environment text NOT NULL CHECK(environment IN ('sandbox','live')),
 account_id uuid PRIMARY KEY,
 gateway_id uuid NOT NULL,
 assigned_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(workspace_id,environment,account_id) REFERENCES financial_receiving_accounts(workspace_id,environment,id),
 FOREIGN KEY(workspace_id,environment,gateway_id) REFERENCES briofold_gateways(workspace_id,environment,id)
);
CREATE INDEX IF NOT EXISTS briofold_gateway_accounts_gateway ON briofold_gateway_accounts(gateway_id);

-- Backfill: existing shops keep working exactly as before; the gateways only
-- describe what is already there.
INSERT INTO briofold_gateways(workspace_id,environment,provider,gateway_type,display_name,position,legacy_backfill)
SELECT DISTINCT a.workspace_id,a.environment,p.code,'personal',p.name,p.position,true
FROM financial_receiving_accounts a
JOIN pg06_account_configuration c ON c.account_id=a.id AND c.deleted_at IS NULL
JOIN briofold_providers p ON p.legacy_method=a.method
JOIN financial_workspace_registry r ON r.workspace_id=a.workspace_id AND r.environment=a.environment
ON CONFLICT DO NOTHING;

INSERT INTO briofold_gateway_accounts(workspace_id,environment,account_id,gateway_id)
SELECT a.workspace_id,a.environment,a.id,g.id
FROM financial_receiving_accounts a
JOIN pg06_account_configuration c ON c.account_id=a.id AND c.deleted_at IS NULL
JOIN briofold_providers p ON p.legacy_method=a.method
JOIN briofold_gateways g ON g.legacy_backfill AND g.deleted_at IS NULL
 AND g.workspace_id=a.workspace_id AND g.environment=a.environment AND g.provider=p.code
ON CONFLICT(account_id) DO NOTHING;

-- Arithmetic only, no data access. Half-up rounding to whole paisa.
CREATE OR REPLACE FUNCTION briofold_gateway_payable(p_amount bigint,p_fixed_discount bigint,p_percent_discount integer,
 p_fixed_charge bigint,p_percent_charge integer) RETURNS jsonb
LANGUAGE sql IMMUTABLE STRICT SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('amount_minor',p_amount,'discount_minor',d,'charge_minor',c,'payable_minor',p_amount-d+c)
 FROM (SELECT p_fixed_discount+(p_amount*p_percent_discount+5000)/10000 d,
              p_fixed_charge+(p_amount*p_percent_charge+5000)/10000 c) x
$$;

CREATE OR REPLACE FUNCTION briofold_gateway_scope(p_workspace uuid,p_environment text) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 -- COALESCE: an unset session setting is NULL, and NULL must mean "no access".
 SELECT COALESCE(current_setting('ekmivo.workspace_id',true)=p_workspace::text
  AND current_setting('ekmivo.environment',true)=p_environment,false)
  AND EXISTS(SELECT 1 FROM financial_realm WHERE environment=p_environment)
  AND EXISTS(SELECT 1 FROM financial_workspace_registry WHERE workspace_id=p_workspace
   AND environment=p_environment AND status='active')
$$;

CREATE OR REPLACE FUNCTION briofold_gateway_json(g briofold_gateways) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('id',g.id,'provider',g.provider,'provider_name',p.name,'logo',p.logo,
  'type',g.gateway_type,'label',g.label,'display_name',g.display_name,
  'min_amount_minor',g.min_amount_minor,'max_amount_minor',g.max_amount_minor,
  'fixed_discount_minor',g.fixed_discount_minor,'percent_discount_bp',g.percent_discount_bp,
  'fixed_charge_minor',g.fixed_charge_minor,'percent_charge_bp',g.percent_charge_bp,
  'has_qr',g.qr_object_key IS NOT NULL,'status',g.status,'position',g.position,
  'version',g.version,'created_at',g.created_at,'updated_at',g.updated_at,
  'account_count',(SELECT count(*) FROM briofold_gateway_accounts m
    JOIN pg06_account_configuration c ON c.account_id=m.account_id AND c.deleted_at IS NULL
    WHERE m.gateway_id=g.id))
 FROM briofold_providers p WHERE p.code=g.provider
$$;

CREATE OR REPLACE FUNCTION briofold_provider_list() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT COALESCE(jsonb_agg(jsonb_build_object('code',code,'name',name,'kind',kind,'types',to_jsonb(types),'logo',logo)
  ORDER BY position,code),'[]'::jsonb) FROM briofold_providers WHERE enabled
$$;

CREATE OR REPLACE FUNCTION briofold_gateway_list(p_workspace uuid,p_environment text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT briofold_gateway_scope(p_workspace,p_environment) THEN RETURN NULL; END IF;
 RETURN jsonb_build_object('items',COALESCE((SELECT jsonb_agg(briofold_gateway_json(g) ORDER BY g.position,g.created_at,g.id)
  FROM briofold_gateways g WHERE g.workspace_id=p_workspace AND g.environment=p_environment AND g.deleted_at IS NULL),'[]'::jsonb));
END $$;

-- Create (p_id NULL) or replace the editable fields of one gateway. Every field
-- is sent each time; an absent or null limit means "no limit".
-- Errors: P7201 invalid input, P7202 stale version, P7204 not found.
CREATE OR REPLACE FUNCTION briofold_gateway_save(p_workspace uuid,p_environment text,p_id uuid,p_body jsonb,p_version bigint)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE pr briofold_providers; g briofold_gateways; v_type text; v_min bigint; v_max bigint;
BEGIN
 IF NOT briofold_gateway_scope(p_workspace,p_environment) THEN RETURN NULL; END IF;
 IF jsonb_typeof(p_body)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_body) k WHERE k NOT IN
   ('provider','type','label','display_name','min_amount_minor','max_amount_minor','fixed_discount_minor',
    'percent_discount_bp','fixed_charge_minor','percent_charge_bp','status')) THEN
  RAISE EXCEPTION 'invalid gateway' USING ERRCODE='P7201'; END IF;
 BEGIN
  v_min:=(p_body->>'min_amount_minor')::bigint; v_max:=(p_body->>'max_amount_minor')::bigint;
 EXCEPTION WHEN others THEN RAISE EXCEPTION 'invalid gateway' USING ERRCODE='P7201'; END;
 IF p_id IS NULL THEN
  SELECT * INTO pr FROM briofold_providers WHERE code=p_body->>'provider' AND enabled;
  v_type:=p_body->>'type';
  IF pr.code IS NULL OR v_type IS NULL OR NOT v_type=ANY(pr.types) THEN
   RAISE EXCEPTION 'invalid gateway' USING ERRCODE='P7201'; END IF;
 ELSE
  SELECT * INTO g FROM briofold_gateways WHERE id=p_id AND workspace_id=p_workspace
   AND environment=p_environment AND deleted_at IS NULL FOR UPDATE;
  IF g.id IS NULL THEN RAISE EXCEPTION 'gateway not found' USING ERRCODE='P7204'; END IF;
  IF p_version IS DISTINCT FROM g.version THEN RAISE EXCEPTION 'stale gateway' USING ERRCODE='P7202'; END IF;
  IF (p_body ? 'provider' AND p_body->>'provider'<>g.provider) OR (p_body ? 'type' AND p_body->>'type'<>g.gateway_type) THEN
   RAISE EXCEPTION 'invalid gateway' USING ERRCODE='P7201'; END IF;
 END IF;
 BEGIN
  IF p_id IS NULL THEN
   INSERT INTO briofold_gateways(workspace_id,environment,provider,gateway_type,label,display_name,
    min_amount_minor,max_amount_minor,fixed_discount_minor,percent_discount_bp,fixed_charge_minor,percent_charge_bp,status,position)
   VALUES(p_workspace,p_environment,pr.code,v_type,COALESCE(p_body->>'label',''),
    COALESCE(NULLIF(btrim(p_body->>'display_name'),''),pr.name),v_min,v_max,
    COALESCE((p_body->>'fixed_discount_minor')::bigint,0),COALESCE((p_body->>'percent_discount_bp')::integer,0),
    COALESCE((p_body->>'fixed_charge_minor')::bigint,0),COALESCE((p_body->>'percent_charge_bp')::integer,0),
    COALESCE(p_body->>'status','active'),
    COALESCE((SELECT max(position)+1 FROM briofold_gateways WHERE workspace_id=p_workspace
      AND environment=p_environment AND deleted_at IS NULL),0))
   RETURNING * INTO g;
  ELSE
   UPDATE briofold_gateways SET label=COALESCE(p_body->>'label',''),
    display_name=COALESCE(NULLIF(btrim(p_body->>'display_name'),''),display_name),
    min_amount_minor=v_min,max_amount_minor=v_max,
    fixed_discount_minor=COALESCE((p_body->>'fixed_discount_minor')::bigint,0),
    percent_discount_bp=COALESCE((p_body->>'percent_discount_bp')::integer,0),
    fixed_charge_minor=COALESCE((p_body->>'fixed_charge_minor')::bigint,0),
    percent_charge_bp=COALESCE((p_body->>'percent_charge_bp')::integer,0),
    status=COALESCE(p_body->>'status',status),version=version+1,updated_at=now()
   WHERE id=g.id RETURNING * INTO g;
  END IF;
 EXCEPTION WHEN check_violation OR invalid_text_representation OR numeric_value_out_of_range OR not_null_violation THEN
  RAISE EXCEPTION 'invalid gateway' USING ERRCODE='P7201';
 END;
 RETURN briofold_gateway_json(g);
END $$;

-- status | duplicate | delete. Delete is soft and refused while accounts are linked.
-- Errors: P7201 invalid, P7202 stale version, P7203 accounts linked, P7204 not found.
CREATE OR REPLACE FUNCTION briofold_gateway_action(p_workspace uuid,p_environment text,p_id uuid,p_action text,
 p_status text,p_version bigint) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE g briofold_gateways;
BEGIN
 IF NOT briofold_gateway_scope(p_workspace,p_environment) THEN RETURN NULL; END IF;
 SELECT * INTO g FROM briofold_gateways WHERE id=p_id AND workspace_id=p_workspace
  AND environment=p_environment AND deleted_at IS NULL FOR UPDATE;
 IF g.id IS NULL THEN RAISE EXCEPTION 'gateway not found' USING ERRCODE='P7204'; END IF;
 IF p_action IN ('status','delete') AND p_version IS DISTINCT FROM g.version THEN
  RAISE EXCEPTION 'stale gateway' USING ERRCODE='P7202'; END IF;
 IF p_action='status' THEN
  IF p_status IS NULL OR p_status NOT IN ('active','disabled') THEN RAISE EXCEPTION 'invalid gateway' USING ERRCODE='P7201'; END IF;
  UPDATE briofold_gateways SET status=p_status,version=version+1,updated_at=now() WHERE id=g.id RETURNING * INTO g;
 ELSIF p_action='delete' THEN
  IF EXISTS(SELECT 1 FROM briofold_gateway_accounts m JOIN pg06_account_configuration c
    ON c.account_id=m.account_id AND c.deleted_at IS NULL WHERE m.gateway_id=g.id) THEN
   RAISE EXCEPTION 'gateway has accounts' USING ERRCODE='P7203'; END IF;
  UPDATE briofold_gateways SET deleted_at=now(),status='disabled',version=version+1,updated_at=now()
   WHERE id=g.id RETURNING * INTO g;
  RETURN jsonb_build_object('id',g.id,'deleted',true);
 ELSIF p_action='duplicate' THEN
  INSERT INTO briofold_gateways(workspace_id,environment,provider,gateway_type,label,display_name,min_amount_minor,
   max_amount_minor,fixed_discount_minor,percent_discount_bp,fixed_charge_minor,percent_charge_bp,status,position)
  SELECT workspace_id,environment,provider,gateway_type,label,display_name,min_amount_minor,max_amount_minor,
   fixed_discount_minor,percent_discount_bp,fixed_charge_minor,percent_charge_bp,'disabled',
   (SELECT max(position)+1 FROM briofold_gateways WHERE workspace_id=p_workspace AND environment=p_environment AND deleted_at IS NULL)
  FROM briofold_gateways WHERE id=g.id RETURNING * INTO g;
 ELSE
  RAISE EXCEPTION 'invalid gateway' USING ERRCODE='P7201';
 END IF;
 RETURN briofold_gateway_json(g);
END $$;

-- New order: the listed gateways first, in that order; the rest keep their relative order after them.
CREATE OR REPLACE FUNCTION briofold_gateway_reorder(p_workspace uuid,p_environment text,p_ids uuid[]) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT briofold_gateway_scope(p_workspace,p_environment) THEN RETURN NULL; END IF;
 IF p_ids IS NULL OR cardinality(p_ids)>500 OR cardinality(p_ids)<>(SELECT count(DISTINCT x) FROM unnest(p_ids) x)
  OR EXISTS(SELECT 1 FROM unnest(p_ids) x WHERE NOT EXISTS(SELECT 1 FROM briofold_gateways g WHERE g.id=x
   AND g.workspace_id=p_workspace AND g.environment=p_environment AND g.deleted_at IS NULL)) THEN
  RAISE EXCEPTION 'invalid gateway' USING ERRCODE='P7201'; END IF;
 UPDATE briofold_gateways g SET position=o.n,updated_at=now(),version=version+1
 FROM (SELECT id,row_number() OVER(ORDER BY COALESCE(array_position(p_ids,id),1000000),position,created_at,id)-1 n
  FROM briofold_gateways WHERE workspace_id=p_workspace AND environment=p_environment AND deleted_at IS NULL) o
 WHERE g.id=o.id AND g.position<>o.n;
 RETURN briofold_gateway_list(p_workspace,p_environment);
END $$;

-- What the customer would pay through this gateway, and whether it is offered.
-- Limits compare the order amount before discount and charge (owner 2026-11-26).
CREATE OR REPLACE FUNCTION briofold_gateway_quote(p_workspace uuid,p_environment text,p_id uuid,p_amount bigint) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE g briofold_gateways; q jsonb; why text:=NULL;
BEGIN
 IF NOT briofold_gateway_scope(p_workspace,p_environment) THEN RETURN NULL; END IF;
 IF p_amount IS NULL OR p_amount<1 OR p_amount>100000000000 THEN RAISE EXCEPTION 'invalid gateway' USING ERRCODE='P7201'; END IF;
 SELECT * INTO g FROM briofold_gateways WHERE id=p_id AND workspace_id=p_workspace
  AND environment=p_environment AND deleted_at IS NULL;
 IF g.id IS NULL THEN RAISE EXCEPTION 'gateway not found' USING ERRCODE='P7204'; END IF;
 q:=briofold_gateway_payable(p_amount,g.fixed_discount_minor,g.percent_discount_bp,g.fixed_charge_minor,g.percent_charge_bp);
 IF g.status<>'active' THEN why:='DISABLED';
 ELSIF g.min_amount_minor IS NOT NULL AND p_amount<g.min_amount_minor THEN why:='BELOW_MINIMUM';
 ELSIF g.max_amount_minor IS NOT NULL AND p_amount>g.max_amount_minor THEN why:='ABOVE_MAXIMUM';
 ELSIF (q->>'payable_minor')::bigint<1 THEN why:='PAYABLE_NOT_POSITIVE';
 END IF;
 RETURN q||jsonb_build_object('gateway_id',g.id,'offered',why IS NULL,'reason',why);
END $$;

REVOKE ALL ON TABLE briofold_providers,briofold_provider_senders,briofold_gateways,briofold_gateway_accounts FROM PUBLIC;
REVOKE ALL ON FUNCTION briofold_gateway_payable(bigint,bigint,integer,bigint,integer),
 briofold_gateway_scope(uuid,text),briofold_gateway_json(briofold_gateways),briofold_provider_list(),
 briofold_gateway_list(uuid,text),briofold_gateway_save(uuid,text,uuid,jsonb,bigint),
 briofold_gateway_action(uuid,text,uuid,text,text,bigint),briofold_gateway_reorder(uuid,text,uuid[]),
 briofold_gateway_quote(uuid,text,uuid,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION briofold_provider_list(),briofold_gateway_list(uuid,text),
 briofold_gateway_save(uuid,text,uuid,jsonb,bigint),briofold_gateway_action(uuid,text,uuid,text,text,bigint),
 briofold_gateway_reorder(uuid,text,uuid[]),briofold_gateway_quote(uuid,text,uuid,bigint) TO ekmivo_finance_reader;
COMMIT;
