-- PG04: independent financial DATABASE schema (apply only through one PG04 migration runner).
-- River's pinned upstream migrations run first in that same runner.
-- This database MUST NOT contain auth_sessions/app_users/workspaces/merchant_api_keys.
-- Provision one database per realm, each with a separate credential and worker.
BEGIN;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE TABLE financial_realm (
 singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 environment text NOT NULL UNIQUE CHECK(environment IN ('sandbox','live')),
 installed_at timestamptz NOT NULL DEFAULT now()
);
INSERT INTO financial_realm(singleton,environment) VALUES
 (true,current_setting('ekmivo.financial_migration_realm'));
CREATE TABLE financial_workspace_registry (
 workspace_id uuid NOT NULL,
 environment text NOT NULL REFERENCES financial_realm(environment),
 status text NOT NULL CHECK(status IN ('active','suspended')),
 entitlement_version bigint NOT NULL CHECK(entitlement_version>0),
 synced_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,environment)
);
-- Only a constrained operator may provision this projection after confirming
-- the authoritative control-plane workspace and enabled product. No PII copied.
-- Finance runtime/worker have NO INSERT/UPDATE/DELETE privilege here.
CREATE FUNCTION financial_sync_workspace(p_workspace uuid,p_realm text,
 p_version bigint,p_enabled boolean)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE current_realm text; affected integer;
BEGIN
 SELECT environment INTO current_realm FROM financial_realm WHERE singleton;
 IF p_workspace IS NULL OR p_realm<>current_realm OR p_version<=0 OR p_enabled IS NULL THEN
  RAISE EXCEPTION 'invalid financial workspace projection' USING ERRCODE='22023';
 END IF;
 INSERT INTO financial_workspace_registry(workspace_id,environment,status,entitlement_version)
 VALUES(p_workspace,p_realm,CASE WHEN p_enabled THEN 'active' ELSE 'suspended' END,p_version)
 ON CONFLICT(workspace_id,environment) DO UPDATE SET
   status=excluded.status,entitlement_version=excluded.entitlement_version,synced_at=now()
 WHERE financial_workspace_registry.entitlement_version<excluded.entitlement_version
    OR (financial_workspace_registry.entitlement_version=excluded.entitlement_version
        AND financial_workspace_registry.status=excluded.status);
 GET DIAGNOSTICS affected=ROW_COUNT;
 RETURN affected=1;
END; $$;
REVOKE ALL ON FUNCTION financial_sync_workspace(uuid,text,bigint,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION financial_sync_workspace(uuid,text,bigint,boolean)
 TO ekmivo_financial_provisioner;

CREATE TABLE financial_receiving_accounts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL,
 environment text NOT NULL CHECK(environment IN ('sandbox','live')),
 method text NOT NULL CHECK(method IN ('bkash','nagad','rocket','bank','other')),
 identity_hmac char(64) NOT NULL CHECK(identity_hmac ~ '^[a-f0-9]{64}$'),
 display_suffix char(4) NOT NULL CHECK(display_suffix ~ '^[0-9]{4}$'),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,environment,id),
 UNIQUE(workspace_id,environment,method,identity_hmac),
 FOREIGN KEY(workspace_id,environment)
  REFERENCES financial_workspace_registry(workspace_id,environment) ON DELETE RESTRICT
);

CREATE TABLE payment_intents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL,
 environment text NOT NULL CHECK(environment IN ('sandbox','live')),
 merchant_reference text NOT NULL CHECK(char_length(merchant_reference) BETWEEN 1 AND 128),
 amount_minor bigint NOT NULL CHECK(amount_minor>0),
 currency char(3) NOT NULL DEFAULT 'BDT' CHECK(currency='BDT'),
 created_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL CHECK(expires_at>created_at),
 UNIQUE(workspace_id,environment,id),
 UNIQUE(workspace_id,environment,merchant_reference),
 FOREIGN KEY(workspace_id,environment)
  REFERENCES financial_workspace_registry(workspace_id,environment) ON DELETE RESTRICT
);

-- Issued attempts are immutable. New payer/route/time means a NEW attempt,
-- not an UPDATE. Store only a keyed digest of the normalized payer number.
CREATE TABLE payment_attempts (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL,
 environment text NOT NULL CHECK(environment IN ('sandbox','live')),
 intent_id uuid NOT NULL,
 receiving_account_id uuid NOT NULL,
 payer_hmac char(64) NOT NULL CHECK(payer_hmac ~ '^[a-f0-9]{64}$'),
 payer_suffix char(4) NOT NULL CHECK(payer_suffix ~ '^[0-9]{4}$'),
 amount_minor bigint NOT NULL CHECK(amount_minor>0),
 currency char(3) NOT NULL DEFAULT 'BDT' CHECK(currency='BDT'),
 method text NOT NULL CHECK(method IN ('bkash','nagad','rocket','bank','other')),
 window_start timestamptz NOT NULL,
 window_end timestamptz NOT NULL,
 policy_version integer NOT NULL CHECK(policy_version>0),
 issued_at timestamptz NOT NULL DEFAULT now(),
 CHECK(window_end>window_start),
 UNIQUE(workspace_id,environment,id),
 FOREIGN KEY(workspace_id,environment,intent_id)
  REFERENCES payment_intents(workspace_id,environment,id) ON DELETE RESTRICT,
 FOREIGN KEY(workspace_id,environment,receiving_account_id)
  REFERENCES financial_receiving_accounts(workspace_id,environment,id) ON DELETE RESTRICT
);
-- The payer/route/time tuple is locked at issue; overlapping active
-- windows for the same evidence bucket would create ambiguous matches.
CREATE FUNCTION financial_validate_attempt() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE intent payment_intents%ROWTYPE; method_of_account text; has_overlap boolean;
BEGIN
 SELECT * INTO intent FROM payment_intents
  WHERE workspace_id=NEW.workspace_id AND environment=NEW.environment
   AND id=NEW.intent_id;
 SELECT method INTO method_of_account FROM financial_receiving_accounts
  WHERE workspace_id=NEW.workspace_id AND environment=NEW.environment
   AND id=NEW.receiving_account_id;
 IF intent.id IS NULL OR method_of_account IS NULL
    OR intent.amount_minor<>NEW.amount_minor OR intent.currency<>NEW.currency
    OR method_of_account<>NEW.method OR NEW.window_start<NEW.issued_at
    OR NEW.window_end>intent.expires_at THEN
  RAISE EXCEPTION 'attempt cannot change issued amount, receiving method or window'
   USING ERRCODE='23514';
 END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(
  NEW.workspace_id::text||':'||NEW.environment||':'||NEW.receiving_account_id::text||
  ':'||NEW.payer_hmac||':'||NEW.method||':'||NEW.amount_minor::text,0));
 SELECT EXISTS (
  SELECT 1 FROM payment_attempts a
  WHERE a.workspace_id=NEW.workspace_id AND a.environment=NEW.environment
    AND a.receiving_account_id=NEW.receiving_account_id
    AND a.payer_hmac=NEW.payer_hmac AND a.method=NEW.method
    AND a.amount_minor=NEW.amount_minor
    AND tstzrange(a.window_start,a.window_end,'[)') &&
        tstzrange(NEW.window_start,NEW.window_end,'[)')
 ) INTO has_overlap;
 IF has_overlap THEN
  RAISE EXCEPTION 'overlapping payer/account/method/amount attempt'
   USING ERRCODE='23505';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER financial_attempt_issuance BEFORE INSERT ON payment_attempts
 FOR EACH ROW EXECUTE FUNCTION financial_validate_attempt();

CREATE INDEX payment_attempts_intent_idx ON payment_attempts(workspace_id,environment,intent_id,issued_at);

-- The signed/approved ingress layer in PG06 must resolve tenant/environment
-- from the enrollment/provider connection, never from an unauthenticated body.
-- Only encrypted/raw-minimized approved evidence is retained here.
CREATE TABLE financial_inbound_events (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL,
 environment text NOT NULL CHECK(environment IN ('sandbox','live')),
 source_kind text NOT NULL CHECK(source_kind IN ('device_sms','device_notification','provider_api','bank_statement','sandbox_fixture')),
 source_event_id text NOT NULL CHECK(char_length(source_event_id) BETWEEN 1 AND 160),
 event_digest char(64) NOT NULL CHECK(event_digest ~ '^[a-f0-9]{64}$'),
 original_source_at timestamptz,
 received_at timestamptz NOT NULL DEFAULT now(),
 encrypted_evidence bytea NOT NULL CHECK(octet_length(encrypted_evidence)>16),
 UNIQUE(workspace_id,environment,id),
 UNIQUE(workspace_id,environment,source_kind,source_event_id),
 FOREIGN KEY(workspace_id,environment)
  REFERENCES financial_workspace_registry(workspace_id,environment) ON DELETE RESTRICT
);

CREATE TABLE financial_receipt_observations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL,
 environment text NOT NULL CHECK(environment IN ('sandbox','live')),
 inbound_event_id uuid NOT NULL,
 receiving_account_id uuid NOT NULL,
 provider_reference_hmac char(64) CHECK(provider_reference_hmac ~ '^[a-f0-9]{64}$'),
 payer_hmac char(64) CHECK(payer_hmac ~ '^[a-f0-9]{64}$'),
 amount_minor bigint CHECK(amount_minor>0),
 currency char(3) NOT NULL DEFAULT 'BDT' CHECK(currency='BDT'),
 method text CHECK(method IN ('bkash','nagad','rocket','bank','other')),
 direction text NOT NULL CHECK(direction IN ('incoming','outgoing','unknown')),
 original_transaction_at timestamptz,
 time_precision text NOT NULL CHECK(time_precision IN ('second','minute','unknown')),
 parser_version integer NOT NULL CHECK(parser_version>0),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,environment,id),
 UNIQUE(workspace_id,environment,inbound_event_id),
 FOREIGN KEY(workspace_id,environment,inbound_event_id)
  REFERENCES financial_inbound_events(workspace_id,environment,id) ON DELETE RESTRICT,
 FOREIGN KEY(workspace_id,environment,receiving_account_id)
  REFERENCES financial_receiving_accounts(workspace_id,environment,id) ON DELETE RESTRICT
);
CREATE UNIQUE INDEX financial_receipt_provider_unique
 ON financial_receipt_observations(workspace_id,environment,receiving_account_id,provider_reference_hmac)
 WHERE provider_reference_hmac IS NOT NULL;

-- Never interpret a transport ACK or browser return as verification.
-- Only PG07's server matcher will be authorized to INSERT verified payments.
CREATE TABLE financial_payments (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL,
 environment text NOT NULL CHECK(environment IN ('sandbox','live')),
 attempt_id uuid NOT NULL,
 observation_id uuid NOT NULL,
 verified_amount_minor bigint NOT NULL CHECK(verified_amount_minor>0),
 currency char(3) NOT NULL DEFAULT 'BDT' CHECK(currency='BDT'),
 verification_method text NOT NULL CHECK(verification_method IN ('sms_match','notification_match','provider_api','bank_statement','sandbox_fixture')),
 verified_at timestamptz NOT NULL DEFAULT now(),
 policy_version integer NOT NULL CHECK(policy_version>0),
 UNIQUE(workspace_id,environment,id),
 UNIQUE(workspace_id,environment,attempt_id),
 UNIQUE(workspace_id,environment,observation_id),
 FOREIGN KEY(workspace_id,environment,attempt_id)
  REFERENCES payment_attempts(workspace_id,environment,id) ON DELETE RESTRICT,
 FOREIGN KEY(workspace_id,environment,observation_id)
  REFERENCES financial_receipt_observations(workspace_id,environment,id) ON DELETE RESTRICT
);

-- Guard against a forged or incomplete "verified" insert independently of the
-- PG07 matcher. All five actual receipt fields must align with the issued
-- immutable attempt; no client-submitted verified=true can pass this alone.
CREATE FUNCTION financial_verify_payment_fields() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a payment_attempts%ROWTYPE; o financial_receipt_observations%ROWTYPE; src text;
BEGIN
 SELECT * INTO a FROM payment_attempts
  WHERE workspace_id=NEW.workspace_id AND environment=NEW.environment
   AND id=NEW.attempt_id FOR UPDATE;
 SELECT * INTO o FROM financial_receipt_observations
  WHERE workspace_id=NEW.workspace_id AND environment=NEW.environment
   AND id=NEW.observation_id FOR UPDATE;
 IF a.id IS NULL OR o.id IS NULL OR o.payer_hmac IS NULL
   OR a.payer_hmac<>o.payer_hmac
   OR a.receiving_account_id<>o.receiving_account_id
   OR a.method<>o.method OR a.currency<>o.currency
   OR a.currency<>NEW.currency OR a.amount_minor<>NEW.verified_amount_minor
   OR o.amount_minor<>NEW.verified_amount_minor OR o.direction<>'incoming'
   OR o.original_transaction_at IS NULL OR o.time_precision='unknown'
   OR o.original_transaction_at<a.window_start
   OR (o.time_precision='minute' AND o.original_transaction_at+interval '1 minute'>a.window_end)
   OR (o.time_precision='second' AND o.original_transaction_at>a.window_end)
   OR a.policy_version<>NEW.policy_version THEN
   RAISE EXCEPTION 'verified payment requires a complete matching immutable attempt and receipt'
    USING ERRCODE='23514';
 END IF;
 SELECT e.source_kind INTO src FROM financial_inbound_events e
  WHERE e.workspace_id=NEW.workspace_id AND e.environment=NEW.environment AND e.id=o.inbound_event_id;
 IF NOT (
    (NEW.verification_method='sms_match' AND src='device_sms')
 OR (NEW.verification_method='notification_match' AND src='device_notification')
 OR (NEW.verification_method='provider_api' AND src='provider_api')
 OR (NEW.verification_method='bank_statement' AND src='bank_statement')
 OR (NEW.verification_method='sandbox_fixture' AND src='sandbox_fixture' AND NEW.environment='sandbox')
 ) THEN
  RAISE EXCEPTION 'verification source provenance or environment mismatch' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER financial_verified_fields BEFORE INSERT ON financial_payments
 FOR EACH ROW EXECUTE FUNCTION financial_verify_payment_fields();

CREATE TABLE financial_allocations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL,
 environment text NOT NULL CHECK(environment IN ('sandbox','live')),
 payment_id uuid NOT NULL,
 intent_id uuid NOT NULL,
 amount_minor bigint NOT NULL CHECK(amount_minor>0),
 currency char(3) NOT NULL DEFAULT 'BDT' CHECK(currency='BDT'),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,environment,id),
 UNIQUE(workspace_id,environment,payment_id,intent_id),
 FOREIGN KEY(workspace_id,environment,payment_id)
  REFERENCES financial_payments(workspace_id,environment,id) ON DELETE RESTRICT,
 FOREIGN KEY(workspace_id,environment,intent_id)
  REFERENCES payment_intents(workspace_id,environment,id) ON DELETE RESTRICT
);

-- Explicit row locks serialize competitors to enforce both caps under READ COMMITTED.
CREATE FUNCTION financial_enforce_allocation_caps() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE verified bigint; requested bigint; paid bigint; allocated bigint; payment_currency text; intent_currency text;
BEGIN
 SELECT p.verified_amount_minor,p.currency INTO verified,payment_currency
 FROM financial_payments p
 WHERE p.workspace_id=NEW.workspace_id AND p.environment=NEW.environment AND p.id=NEW.payment_id FOR UPDATE;
 SELECT i.amount_minor,i.currency INTO requested,intent_currency
 FROM payment_intents i
 WHERE i.workspace_id=NEW.workspace_id AND i.environment=NEW.environment AND i.id=NEW.intent_id FOR UPDATE;
 IF verified IS NULL OR requested IS NULL OR payment_currency<>NEW.currency OR intent_currency<>NEW.currency THEN
  RAISE EXCEPTION 'allocation currency or parent mismatch' USING ERRCODE='23514';
 END IF;
 SELECT COALESCE(sum(a.amount_minor),0) INTO allocated FROM financial_allocations a
 WHERE a.workspace_id=NEW.workspace_id AND a.environment=NEW.environment AND a.payment_id=NEW.payment_id;
 SELECT COALESCE(sum(a.amount_minor),0) INTO paid FROM financial_allocations a
 WHERE a.workspace_id=NEW.workspace_id AND a.environment=NEW.environment AND a.intent_id=NEW.intent_id;
 IF NEW.amount_minor>verified-allocated OR NEW.amount_minor>requested-paid THEN
  RAISE EXCEPTION 'allocation exceeds verified funds or requested amount' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER financial_allocation_caps BEFORE INSERT ON financial_allocations
 FOR EACH ROW EXECUTE FUNCTION financial_enforce_allocation_caps();

-- Completed keys are immutable; the caller must hold one DB transaction
-- across business mutation, event/job enqueue and INSERT of this result.
CREATE TABLE financial_idempotency (
 workspace_id uuid NOT NULL,
 environment text NOT NULL CHECK(environment IN ('sandbox','live')),
 operation text NOT NULL CHECK(operation ~ '^[a-z][a-z0-9_.:-]{1,63}$'),
 idempotency_key text NOT NULL CHECK(char_length(idempotency_key) BETWEEN 16 AND 128),
 request_hash char(64) NOT NULL CHECK(request_hash ~ '^[a-f0-9]{64}$'),
 result_code integer NOT NULL CHECK(result_code BETWEEN 200 AND 299),
 result_body jsonb NOT NULL CHECK(jsonb_typeof(result_body)='object' AND pg_column_size(result_body)<=16384),
 created_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,environment,operation,idempotency_key),
 FOREIGN KEY(workspace_id,environment)
  REFERENCES financial_workspace_registry(workspace_id,environment) ON DELETE RESTRICT
);

CREATE TABLE financial_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL,
 environment text NOT NULL CHECK(environment IN ('sandbox','live')),
 event_key text NOT NULL CHECK(char_length(event_key) BETWEEN 1 AND 160),
 event_kind text NOT NULL CHECK(event_kind ~ '^[a-z][a-z0-9_.:-]{1,95}$'),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND pg_column_size(payload)<=16384),
 river_job_id bigint NOT NULL UNIQUE,
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,environment,id),
 UNIQUE(workspace_id,environment,event_key),
 FOREIGN KEY(workspace_id,environment)
  REFERENCES financial_workspace_registry(workspace_id,environment) ON DELETE RESTRICT
);

-- Durable queue/outbox association. Never acknowledge a financial event before
-- its handling is committed; one outbox event has exactly one base delivery job.
-- Outbox and River job must co-commit; do NOT use a permanent FK
-- since River legitimately prunes completed jobs while financial audit remains.
CREATE FUNCTION financial_require_river_job() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM river_job WHERE id=NEW.river_job_id
  AND queue='financial_'||NEW.environment AND kind=NEW.event_kind) THEN
  RAISE EXCEPTION 'financial outbox requires the matching River job in same transaction'
   USING ERRCODE='23514';
 END IF;
 RETURN NULL;
END; $$;
CREATE CONSTRAINT TRIGGER financial_outbox_river_commit
 AFTER INSERT ON financial_outbox DEFERRABLE INITIALLY DEFERRED
 FOR EACH ROW EXECUTE FUNCTION financial_require_river_job();

-- River owns the durable queue schema; the immutable financial outbox stores
-- its committed job ID. The event AND job are inserted by one pgx transaction.
CREATE TABLE financial_audit_processed (
 workspace_id uuid NOT NULL,
 environment text NOT NULL,
 outbox_id uuid NOT NULL,
 processed_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(workspace_id,environment,outbox_id),
 FOREIGN KEY(workspace_id,environment,outbox_id)
  REFERENCES financial_outbox(workspace_id,environment,id) ON DELETE RESTRICT
);
-- Only the River worker may resolve a safe audit event's workspace/version;
-- it cannot SELECT arbitrary payment or raw receipt rows.
CREATE FUNCTION financial_audit_context(p_outbox uuid)
RETURNS TABLE(workspace_id uuid,environment text,entitlement_version bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT o.workspace_id,o.environment,r.entitlement_version
 FROM financial_outbox o JOIN financial_workspace_registry r
  ON r.workspace_id=o.workspace_id AND r.environment=o.environment
 JOIN financial_realm f ON f.environment=o.environment AND f.singleton=true
 WHERE o.id=p_outbox AND o.event_kind='pg04_audit' AND r.status='active'
 LIMIT 1
$;
REVOKE ALL ON FUNCTION financial_audit_context(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION financial_audit_context(uuid) TO ekmivo_financial_worker;
CREATE FUNCTION financial_process_audit(p_outbox_id uuid)
 RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=public,pg_temp AS $$
DECLARE evt financial_outbox%ROWTYPE; realm text;
BEGIN
 SELECT environment INTO realm FROM financial_realm WHERE singleton=true;
 SELECT * INTO evt FROM financial_outbox o WHERE o.id=p_outbox_id AND o.environment=realm;
 IF evt.id IS NULL OR evt.event_kind<>'pg04_audit' OR
  evt.payload<>'{"schema_version":1,"action":"durability_probe"}'::jsonb OR
  NOT EXISTS(SELECT 1 FROM financial_workspace_registry r
     WHERE r.workspace_id=evt.workspace_id AND r.environment=evt.environment AND r.status='active')
 THEN
  RAISE EXCEPTION 'audit job is not authorized for this realm or version' USING ERRCODE='42501';
 END IF;
 INSERT INTO financial_audit_processed(workspace_id,environment,outbox_id)
 VALUES(evt.workspace_id,evt.environment,evt.id) ON CONFLICT DO NOTHING;
 RETURN FOUND;
END; $$;
REVOKE ALL ON FUNCTION financial_process_audit(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION financial_process_audit(uuid) TO ekmivo_financial_worker;

-- Every source and outbox row is append-only, including "expired" attempts.
-- Corrections are compensating events, not destructive editing.
CREATE FUNCTION financial_reject_history_change() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN RAISE EXCEPTION 'immutable financial history' USING ERRCODE='55000'; END; $$;
DO $$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY[
  'financial_receiving_accounts','payment_intents','payment_attempts',
  'financial_inbound_events','financial_receipt_observations','financial_payments',
  'financial_allocations','financial_idempotency','financial_outbox','financial_audit_processed'
 ] LOOP
  EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION financial_reject_history_change()',t||'_immutable',t);
 END LOOP;
END; $$;

-- Defense-in-depth: no finance rows without an authorized transaction-local scope.
-- IMPORTANT: Go authenticates user/merchant in the separate control DB BEFORE
-- using this connection. PostgreSQL GUCs alone are not authentication.
ALTER TABLE financial_workspace_registry ENABLE ROW LEVEL SECURITY;
ALTER TABLE financial_workspace_registry FORCE ROW LEVEL SECURITY;
DO $ BEGIN
 EXECUTE format('CREATE POLICY financial_registry_migration_owner ON financial_workspace_registry FOR ALL TO %I USING (true) WITH CHECK (true)',current_user);
END; $$;
CREATE POLICY financial_registry_scope_read ON financial_workspace_registry
 FOR SELECT TO ekmivo_finance_reader
 USING(workspace_id=nullif(current_setting('ekmivo.workspace_id',true),'')::uuid
  AND environment=current_setting('ekmivo.environment',true) AND status='active');

DO $$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY[
  'financial_receiving_accounts','payment_intents','payment_attempts',
  'financial_inbound_events','financial_receipt_observations','financial_payments',
  'financial_allocations','financial_idempotency','financial_outbox',
  'financial_audit_processed'
 ] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  -- Trusted migration-owner SECURITY DEFINER functions still work under FORCE RLS.
  EXECUTE format('CREATE POLICY %I ON %I FOR ALL TO %I USING (true) WITH CHECK (true)',
    t||'_migration_owner',t,current_user);
  EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO ekmivo_finance_reader USING (
   workspace_id=nullif(current_setting(''ekmivo.workspace_id'',true),'''')::uuid
   AND environment=current_setting(''ekmivo.environment'',true)
   AND EXISTS(SELECT 1 FROM financial_workspace_registry r
    WHERE r.workspace_id=%2$I.workspace_id AND r.environment=%2$I.environment
    AND r.status=''active'')
  )',t||'_reader',t);
 END LOOP;
END; $$;

REVOKE ALL ON financial_realm,financial_workspace_registry,
 financial_receiving_accounts,payment_intents,payment_attempts,
 financial_inbound_events,financial_receipt_observations,financial_payments,
 financial_allocations,financial_idempotency,financial_outbox,
 financial_audit_processed FROM PUBLIC,ekmivo_finance_reader,ekmivo_financial_worker;
GRANT SELECT ON financial_realm TO ekmivo_financial_worker;
GRANT SELECT ON financial_realm,financial_workspace_registry,
 payment_intents,payment_attempts,financial_payments,
 financial_allocations,financial_idempotency,financial_outbox
 TO ekmivo_finance_reader;

-- Only the River worker may operate the queue; it cannot mint payments.
-- Role is separately scoped to EACH physical financial database.
GRANT SELECT,INSERT,UPDATE,DELETE ON river_job TO ekmivo_financial_worker;
GRANT USAGE,SELECT ON SEQUENCE river_job_id_seq TO ekmivo_financial_worker;
-- Upstream River's migration-owned queue/leader and future tables are
-- restricted to worker, never financial domain tables or River migrations.
DO $$
DECLARE row_info record;
BEGIN
 FOR row_info IN SELECT c.relname,c.relkind FROM pg_class c
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname='public' AND c.relname LIKE 'river\\_%' ESCAPE '\\'
    AND c.relkind IN ('r','p') AND c.relname<>'river_migration'
 LOOP
  EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON TABLE %I TO ekmivo_financial_worker',row_info.relname);
 END LOOP;
END; $$;
-- The actual database owner/provisioner independently restricts CONNECT to
-- this realm's credentials. No worker becomes a financial table owner.
-- Provisioning/mutation is restricted to trusted domain writers. PG05 adds
-- authorized API entrypoints, never a direct client-controlled mark-paid route.
COMMIT;
