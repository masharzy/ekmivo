-- PG04 financial source-of-truth foundation.
-- Apply ONCE through the existing infra/migrations runner, never from HTTP.
-- This schema deliberately creates no synthetic paid records and no public "mark paid" API.
BEGIN;

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
  REFERENCES workspace_environments(workspace_id,environment) ON DELETE RESTRICT
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
  REFERENCES workspace_environments(workspace_id,environment) ON DELETE RESTRICT
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
  REFERENCES workspace_environments(workspace_id,environment) ON DELETE RESTRICT
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
LANGUAGE plpgsql SECURITY INVOKER SET search_path=public,pg_temp AS $$
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
END $$;
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
  REFERENCES workspace_environments(workspace_id,environment) ON DELETE RESTRICT
);

CREATE TABLE financial_outbox (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL,
 environment text NOT NULL CHECK(environment IN ('sandbox','live')),
 event_key text NOT NULL CHECK(char_length(event_key) BETWEEN 1 AND 160),
 event_kind text NOT NULL CHECK(event_kind ~ '^[a-z][a-z0-9_.:-]{1,95}$'),
 payload jsonb NOT NULL CHECK(jsonb_typeof(payload)='object' AND pg_column_size(payload)<=16384),
 created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,environment,id),
 UNIQUE(workspace_id,environment,event_key),
 FOREIGN KEY(workspace_id,environment)
  REFERENCES workspace_environments(workspace_id,environment) ON DELETE RESTRICT
);

-- Durable queue/outbox association. Never acknowledge a financial event before
-- its handling is committed; one outbox event has exactly one base delivery job.
CREATE TABLE financial_jobs (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL,
 environment text NOT NULL CHECK(environment IN ('sandbox','live')),
 outbox_id uuid NOT NULL,
 queue text NOT NULL CHECK(queue='financial:'||environment),
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','processing','completed','dead')),
 attempts integer NOT NULL DEFAULT 0 CHECK(attempts>=0),
 max_attempts integer NOT NULL DEFAULT 10 CHECK(max_attempts BETWEEN 1 AND 30),
 run_after timestamptz NOT NULL DEFAULT now(),
 lease_token uuid,
 lease_until timestamptz,
 last_error_code text CHECK(last_error_code ~ '^[A-Z_]{1,64}$'),
 completed_at timestamptz,
 created_at timestamptz NOT NULL DEFAULT now(),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,environment,id),
 UNIQUE(workspace_id,environment,outbox_id),
 CHECK((state='processing')=(lease_token IS NOT NULL AND lease_until IS NOT NULL)),
 CHECK((state='completed')=(completed_at IS NOT NULL)),
 FOREIGN KEY(workspace_id,environment,outbox_id)
  REFERENCES financial_outbox(workspace_id,environment,id) ON DELETE RESTRICT
);
CREATE INDEX financial_jobs_claim_idx
 ON financial_jobs(environment,run_after,created_at)
 WHERE state IN ('pending','processing');

-- Every source and outbox row is append-only, including "expired" attempts.
-- Corrections are compensating events, not destructive editing.
CREATE FUNCTION financial_reject_history_change() RETURNS trigger
LANGUAGE plpgsql SET search_path=public,pg_temp AS $$
BEGIN RAISE EXCEPTION 'immutable financial history' USING ERRCODE='55000'; END $$;
DO $$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY[
  'financial_receiving_accounts','payment_intents','payment_attempts',
  'financial_inbound_events','financial_receipt_observations','financial_payments',
  'financial_allocations','financial_idempotency','financial_outbox'
 ] LOOP
  EXECUTE format('CREATE TRIGGER %I BEFORE UPDATE OR DELETE ON %I FOR EACH ROW EXECUTE FUNCTION financial_reject_history_change()',t||'_immutable',t);
 END LOOP;
END $$;

-- Tenant+realm scope is always transaction-local; absent context sees no rows.
DO $$
DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY[
  'financial_receiving_accounts','payment_intents','payment_attempts',
  'financial_inbound_events','financial_receipt_observations','financial_payments',
  'financial_allocations','financial_idempotency','financial_outbox','financial_jobs'
 ] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
  EXECUTE format('CREATE POLICY %I ON %I FOR SELECT TO ekmivo_financial_runtime USING (
    workspace_id = nullif(current_setting(''ekmivo.workspace_id'',true),'''')::uuid
    AND environment = current_setting(''ekmivo.environment'',true)
    AND EXISTS(SELECT 1 FROM workspace_environments e
      WHERE e.workspace_id=workspace_id AND e.environment=environment AND e.status=''active'')
    AND EXISTS(SELECT 1 FROM workspace_members m JOIN app_users u ON u.id=m.user_id
      WHERE m.workspace_id=workspace_id
      AND m.user_id=nullif(current_setting(''ekmivo.user_id'',true),'''')::uuid
      AND u.disabled_at IS NULL)
  )', t||'_reader',t);
 END LOOP;
END $$;

REVOKE ALL ON financial_receiving_accounts,payment_intents,payment_attempts,
 financial_inbound_events,financial_receipt_observations,financial_payments,
 financial_allocations,financial_idempotency,financial_outbox,financial_jobs
 FROM PUBLIC,ekmivo_financial_runtime;
-- Read-only control-plane projections. No raw ingress bytes or auth-less writes.
GRANT SELECT ON payment_intents,payment_attempts,financial_payments,
 financial_allocations,financial_idempotency,financial_outbox
 TO ekmivo_financial_runtime;

-- Only the process which owns database migrations has INSERT rights at PG04.
-- PG05/PG06 add narrow, validated writer entrypoints without unsafe mark-paid.
COMMIT;
