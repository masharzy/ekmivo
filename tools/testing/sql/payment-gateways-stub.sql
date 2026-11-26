-- Minimal stand-ins for the financial tables 0272 builds on (same names and the
-- columns 0272 uses). Only for a disposable test database.
DO $$BEGIN IF NOT EXISTS(SELECT 1 FROM pg_roles WHERE rolname='ekmivo_finance_reader') THEN
 CREATE ROLE ekmivo_finance_reader NOLOGIN; END IF; END $$;
CREATE TABLE financial_realm(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),
 environment text NOT NULL UNIQUE CHECK(environment IN ('sandbox','live')));
INSERT INTO financial_realm VALUES(true,'live');
CREATE TABLE financial_workspace_registry(workspace_id uuid NOT NULL,environment text NOT NULL,
 status text NOT NULL DEFAULT 'active',PRIMARY KEY(workspace_id,environment));
CREATE TABLE financial_receiving_accounts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL,
 environment text NOT NULL,method text NOT NULL CHECK(method IN ('bkash','nagad','rocket','bank','other')),
 display_suffix char(4) NOT NULL DEFAULT '1234',created_at timestamptz NOT NULL DEFAULT clock_timestamp(),UNIQUE(workspace_id,environment,id),
 FOREIGN KEY(workspace_id,environment) REFERENCES financial_workspace_registry(workspace_id,environment));
CREATE TABLE pg06_account_configuration(account_id uuid PRIMARY KEY REFERENCES financial_receiving_accounts(id),
 label text NOT NULL DEFAULT '',disabled_at timestamptz,deleted_at timestamptz);

-- Shop A: two bKash numbers, one Nagad, one deleted Rocket. Shop B: one bKash.
INSERT INTO financial_workspace_registry VALUES
 ('aaaaaaaa-0000-4000-8000-000000000001','live'),('bbbbbbbb-0000-4000-8000-000000000002','live');
INSERT INTO financial_receiving_accounts(id,workspace_id,environment,method) VALUES
 ('00000000-0000-4000-8000-0000000000a1','aaaaaaaa-0000-4000-8000-000000000001','live','bkash'),
 ('00000000-0000-4000-8000-0000000000a2','aaaaaaaa-0000-4000-8000-000000000001','live','bkash'),
 ('00000000-0000-4000-8000-0000000000a3','aaaaaaaa-0000-4000-8000-000000000001','live','nagad'),
 ('00000000-0000-4000-8000-0000000000a4','aaaaaaaa-0000-4000-8000-000000000001','live','rocket'),
 ('00000000-0000-4000-8000-0000000000b1','bbbbbbbb-0000-4000-8000-000000000002','live','bkash');
INSERT INTO pg06_account_configuration(account_id,deleted_at) VALUES
 ('00000000-0000-4000-8000-0000000000a1',NULL),('00000000-0000-4000-8000-0000000000a2',NULL),
 ('00000000-0000-4000-8000-0000000000a3',NULL),('00000000-0000-4000-8000-0000000000a4',now()),
 ('00000000-0000-4000-8000-0000000000b1',NULL);

-- Phase 2 (0273) stand-ins: phones, payment attempts and SMS receipts.
CREATE TABLE pg06_devices(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),account_id uuid NOT NULL,revoked_at timestamptz,
 permission_ok boolean NOT NULL DEFAULT true,heartbeat_at timestamptz);
CREATE TABLE pg06_phones(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),workspace_id uuid NOT NULL,environment text NOT NULL,
 claimed_at timestamptz,revoked_at timestamptz,permission_ok boolean NOT NULL DEFAULT true,heartbeat_at timestamptz);
CREATE TABLE payment_intents(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL DEFAULT 'aaaaaaaa-0000-4000-8000-000000000001',environment text NOT NULL DEFAULT 'live',
 merchant_reference text NOT NULL DEFAULT 'order',amount_minor bigint NOT NULL DEFAULT 100000,expires_at timestamptz NOT NULL DEFAULT now()+interval '15 minutes',
 UNIQUE(workspace_id,environment,id));
CREATE TABLE payment_attempts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL DEFAULT 'aaaaaaaa-0000-4000-8000-000000000001',environment text NOT NULL DEFAULT 'live',
 intent_id uuid,receiving_account_id uuid NOT NULL,payer_hmac text NOT NULL DEFAULT repeat('a',64),payer_suffix char(4) NOT NULL DEFAULT '5678',
 amount_minor bigint NOT NULL DEFAULT 100000,currency char(3) NOT NULL DEFAULT 'BDT',method text NOT NULL DEFAULT 'bkash',
 window_start timestamptz NOT NULL DEFAULT now()-interval '1 minute',window_end timestamptz NOT NULL DEFAULT now()+interval '15 minutes',
 issued_at timestamptz NOT NULL);
CREATE TABLE financial_receipt_observations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL DEFAULT 'aaaaaaaa-0000-4000-8000-000000000001',environment text NOT NULL DEFAULT 'live',
 receiving_account_id uuid NOT NULL,payer_hmac text DEFAULT repeat('a',64),method text DEFAULT 'bkash',currency char(3) NOT NULL DEFAULT 'BDT',
 time_precision text NOT NULL DEFAULT 'minute',
 amount_minor bigint,direction text NOT NULL,original_transaction_at timestamptz,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(workspace_id,environment,id));

-- Phase 3a (0274) stand-ins: receipt results, shop-confirmed proofs, intent state, SMS window rule (0266).
CREATE TABLE pg07_receipt_results(workspace_id uuid NOT NULL,environment text NOT NULL,observation_id uuid PRIMARY KEY,
 status text NOT NULL,reason text NOT NULL DEFAULT '',processed_at timestamptz DEFAULT now());
CREATE TABLE briofold_payment_proofs(workspace_id uuid NOT NULL,environment text NOT NULL,intent_id uuid NOT NULL,
 trx_id text,images jsonb NOT NULL DEFAULT '[]',state text NOT NULL DEFAULT 'submitted',submissions integer NOT NULL DEFAULT 1,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),seen_at timestamptz,
 decided_at timestamptz,decided_by uuid,decision_reason text,PRIMARY KEY(workspace_id,environment,intent_id));
CREATE FUNCTION pg05_intent_state(p_workspace uuid,p_environment text,p_intent uuid) RETURNS text LANGUAGE sql STABLE AS $$
 SELECT CASE WHEN EXISTS(SELECT 1 FROM briofold_payment_proofs WHERE workspace_id=p_workspace AND environment=p_environment
  AND intent_id=p_intent AND state='approved') THEN 'completed' ELSE 'awaiting_payment' END $$;
CREATE FUNCTION briofold_sms_window_start(window_start timestamptz,precision_name text) RETURNS timestamptz
LANGUAGE sql STABLE AS $$ SELECT CASE WHEN precision_name='minute' THEN date_trunc('minute',window_start) ELSE window_start END $$;

-- Production makes these tables append-only (financial_reject_history_change, 0008). Same rule here so a
-- migration that updates or deletes their rows fails in the test as it would in production.
CREATE FUNCTION financial_reject_history_change() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'immutable financial history' USING ERRCODE='55000'; END $$;
CREATE TRIGGER financial_receiving_accounts_immutable BEFORE UPDATE OR DELETE ON financial_receiving_accounts
 FOR EACH ROW EXECUTE FUNCTION financial_reject_history_change();
CREATE TRIGGER payment_attempts_immutable BEFORE UPDATE OR DELETE ON payment_attempts
 FOR EACH ROW EXECUTE FUNCTION financial_reject_history_change();
CREATE TRIGGER payment_intents_immutable BEFORE UPDATE OR DELETE ON payment_intents
 FOR EACH ROW EXECUTE FUNCTION financial_reject_history_change();
CREATE TRIGGER financial_receipt_observations_immutable BEFORE UPDATE OR DELETE ON financial_receipt_observations
 FOR EACH ROW EXECUTE FUNCTION financial_reject_history_change();
