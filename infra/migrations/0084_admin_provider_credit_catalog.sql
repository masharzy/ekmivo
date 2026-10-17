-- Admin-only catalog for payment provider presentation and manual AI credit grants.
-- IMPORTANT: This is CONTROL data only; it does not add a new Go payment parser, verification method or AI usage meter.
BEGIN;
CREATE TABLE IF NOT EXISTS platform_payment_providers (
 code text PRIMARY KEY CHECK (code ~ '^[a-z][a-z0-9_]{1,39}$'),
 display_name text NOT NULL CHECK (length(display_name) BETWEEN 2 AND 90),
 logo_url text NOT NULL DEFAULT '' CHECK (length(logo_url)<=700000),
 provider_type text NOT NULL DEFAULT 'Mobile wallet' CHECK (provider_type IN ('Mobile wallet','Bank','Other')),
 status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','published','retired')),
 visible_in_add_account boolean NOT NULL DEFAULT false,
 checkout_enabled boolean NOT NULL DEFAULT false,
 live_enabled boolean NOT NULL DEFAULT false,
 verification_supported boolean NOT NULL DEFAULT false,
 sort_order integer NOT NULL DEFAULT 100 CHECK (sort_order BETWEEN 0 AND 100000),
 updated_by uuid REFERENCES app_users(id),
 updated_at timestamptz NOT NULL DEFAULT now(),
 created_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT platform_provider_only_supported_published CHECK (status<>'published' OR verification_supported),
 CONSTRAINT platform_provider_live_published CHECK (NOT live_enabled OR (status='published' AND checkout_enabled)),
 CONSTRAINT platform_provider_checkout_published CHECK (NOT checkout_enabled OR status='published')
);
CREATE TABLE IF NOT EXISTS platform_ai_credit_balances (
 workspace_id uuid PRIMARY KEY REFERENCES workspaces(id),
 balance bigint NOT NULL DEFAULT 0 CHECK (balance>=0),
 updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS platform_ai_credit_ledger (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL REFERENCES workspaces(id),
 actor_id uuid NOT NULL REFERENCES app_users(id),
 delta bigint NOT NULL CHECK (delta<>0),
 balance_after bigint NOT NULL CHECK (balance_after>=0),
 reason text NOT NULL CHECK (length(reason) BETWEEN 10 AND 500),
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS platform_ai_credit_ledger_workspace_idx ON platform_ai_credit_ledger(workspace_id,created_at DESC);
DO $$ DECLARE t text;
BEGIN
 FOREACH t IN ARRAY ARRAY['platform_payment_providers','platform_ai_credit_balances','platform_ai_credit_ledger'] LOOP
 EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
 EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename=t AND policyname=t||'_owner') THEN
 EXECUTE format('CREATE POLICY %I ON %I TO %I USING(true) WITH CHECK(true)',t||'_owner',t,current_user);
 END IF;
 EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',t);
 END LOOP;
END $$;
-- Show only real supported Go wallet methods; add new methods as DRAFT until the Go runtime can verify them.
INSERT INTO platform_payment_providers(code,display_name,logo_url,provider_type,status,visible_in_add_account,checkout_enabled,live_enabled,verification_supported,sort_order) VALUES
 ('bkash','bKash','/payment-assets/bkash.png','Mobile wallet','published',true,true,true,true,1),
 ('nagad','Nagad','/payment-assets/nagad.png','Mobile wallet','published',true,true,true,true,2),
 ('rocket','Rocket','/payment-assets/rocket.png','Mobile wallet','published',true,false,false,true,3)
 ON CONFLICT(code) DO NOTHING;
COMMIT;
