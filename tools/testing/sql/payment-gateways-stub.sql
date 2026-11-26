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
CREATE TABLE payment_attempts(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),receiving_account_id uuid NOT NULL,issued_at timestamptz NOT NULL);
CREATE TABLE financial_receipt_observations(id uuid PRIMARY KEY DEFAULT gen_random_uuid(),receiving_account_id uuid NOT NULL,
 amount_minor bigint,direction text NOT NULL,original_transaction_at timestamptz,created_at timestamptz NOT NULL DEFAULT now());
