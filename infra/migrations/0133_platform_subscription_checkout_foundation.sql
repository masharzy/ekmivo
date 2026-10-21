-- Ekmivo control database only. Additive; no rows, prices, payments or access are changed.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $$BEGIN
 IF current_database()<>'ekmivo' OR to_regclass('public.pg13_platform_invoices') IS NULL
 OR to_regclass('public.auth_sessions') IS NULL OR to_regclass('public.financial_realm') IS NOT NULL
 THEN RAISE EXCEPTION '0133 requires ekmivo control DB';END IF;
END$$;

CREATE TABLE platform_primary_stores (
 user_id uuid PRIMARY KEY REFERENCES app_users(id) ON DELETE RESTRICT,
 workspace_id uuid NOT NULL UNIQUE REFERENCES workspaces(id) ON DELETE RESTRICT,
 bound_by uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 bound_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE platform_subscription_offers (
 offer_key text PRIMARY KEY CHECK(offer_key~'^[a-z][a-z0-9_-]{2,63}$'),
 product text NOT NULL CHECK(product IN ('payments','ai_credit','bundle')),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
 current_version_id uuid,created_by uuid REFERENCES app_users(id),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE platform_subscription_offer_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 offer_key text NOT NULL REFERENCES platform_subscription_offers(offer_key) ON DELETE RESTRICT,
 revision integer NOT NULL CHECK(revision>0),
 term text NOT NULL CHECK(term IN ('monthly','yearly','one_time')),
 amount_minor bigint NOT NULL CHECK(amount_minor BETWEEN 0 AND 100000000000),
 currency text NOT NULL DEFAULT 'BDT' CHECK(currency='BDT'),
 payment_plan_version_id uuid REFERENCES payment_plan_versions(id) ON DELETE RESTRICT,
 terms jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(terms)='object'),
 created_by uuid REFERENCES app_users(id),created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(offer_key,revision),UNIQUE(offer_key,id)
);
ALTER TABLE platform_subscription_offers ADD CONSTRAINT platform_offer_current_version_fk
 FOREIGN KEY(offer_key,current_version_id) REFERENCES platform_subscription_offer_versions(offer_key,id) ON DELETE RESTRICT;

-- These are Ekmivo subscription promotions, NOT seller-store order coupons.
CREATE TABLE platform_subscription_coupons (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 code_normalized text NOT NULL UNIQUE CHECK(code_normalized~'^[A-Z0-9][A-Z0-9_-]{2,31}$'),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','scheduled','active','paused','expired','archived')),
 discount_kind text NOT NULL CHECK(discount_kind IN ('percent','fixed')),
 percent_bps integer,fixed_minor bigint,
 max_discount_minor bigint CHECK(max_discount_minor IS NULL OR max_discount_minor>0),
 min_subtotal_minor bigint NOT NULL DEFAULT 0 CHECK(min_subtotal_minor>=0),
 max_redemptions bigint CHECK(max_redemptions IS NULL OR max_redemptions>0),
 max_per_store integer CHECK(max_per_store IS NULL OR max_per_store>0),
 first_purchase_only boolean NOT NULL DEFAULT false,
 stack_with_annual boolean NOT NULL DEFAULT false,stack_with_bundle boolean NOT NULL DEFAULT false,
 eligible_offer_keys text[] NOT NULL DEFAULT '{}',
 starts_at timestamptz,expires_at timestamptz,
 created_by uuid NOT NULL REFERENCES app_users(id),updated_by uuid NOT NULL REFERENCES app_users(id),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 CHECK(expires_at IS NULL OR starts_at IS NOT NULL AND expires_at>starts_at),
 CHECK((discount_kind='percent' AND percent_bps BETWEEN 1 AND 10000 AND fixed_minor IS NULL)
    OR(discount_kind='fixed' AND fixed_minor>0 AND percent_bps IS NULL))
);
CREATE INDEX platform_subscription_coupons_status_idx ON platform_subscription_coupons(status,starts_at,expires_at);

CREATE TABLE platform_subscription_purchase_intents (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 guest_token_sha256 text UNIQUE CHECK(guest_token_sha256 IS NULL OR guest_token_sha256~'^[a-f0-9]{64}$'),
 actor_id uuid REFERENCES app_users(id) ON DELETE RESTRICT,
 workspace_id uuid REFERENCES workspaces(id) ON DELETE RESTRICT,
 offer_version_id uuid NOT NULL REFERENCES platform_subscription_offer_versions(id) ON DELETE RESTRICT,
 coupon_id uuid REFERENCES platform_subscription_coupons(id) ON DELETE RESTRICT,
 status text NOT NULL DEFAULT 'selected' CHECK(status IN ('selected','quoted','confirmed','paid','cancelled','expired')),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 creation_key text UNIQUE CHECK(creation_key IS NULL OR length(creation_key) BETWEEN 16 AND 128),
 confirmed_invoice_id uuid UNIQUE REFERENCES pg13_platform_invoices(id) ON DELETE RESTRICT,
 created_at timestamptz NOT NULL DEFAULT now(),updated_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT (now()+interval '1 hour'),
 CHECK(workspace_id IS NULL OR actor_id IS NOT NULL),CHECK(expires_at>created_at)
);
CREATE INDEX platform_subscription_intents_owner_idx ON platform_subscription_purchase_intents(actor_id,workspace_id,created_at DESC);
CREATE INDEX platform_subscription_intents_expiry_idx ON platform_subscription_purchase_intents(expires_at)
 WHERE status IN ('selected','quoted');

CREATE TABLE platform_subscription_purchase_quotes (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 intent_id uuid NOT NULL REFERENCES platform_subscription_purchase_intents(id) ON DELETE RESTRICT,
 revision bigint NOT NULL CHECK(revision>0),
 offer_version_id uuid NOT NULL REFERENCES platform_subscription_offer_versions(id) ON DELETE RESTRICT,
 coupon_id uuid REFERENCES platform_subscription_coupons(id) ON DELETE RESTRICT,
 subtotal_minor bigint NOT NULL CHECK(subtotal_minor>=0),
 annual_discount_minor bigint NOT NULL DEFAULT 0 CHECK(annual_discount_minor>=0),
 bundle_discount_minor bigint NOT NULL DEFAULT 0 CHECK(bundle_discount_minor>=0),
 coupon_discount_minor bigint NOT NULL DEFAULT 0 CHECK(coupon_discount_minor>=0),
 tax_minor bigint NOT NULL DEFAULT 0 CHECK(tax_minor>=0),
 total_minor bigint NOT NULL CHECK(total_minor>=0),
 currency text NOT NULL DEFAULT 'BDT' CHECK(currency='BDT'),
 created_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL DEFAULT (now()+interval '15 minutes'),
 UNIQUE(intent_id,revision),CHECK(expires_at>created_at),
 CHECK(subtotal_minor::numeric >= annual_discount_minor::numeric+bundle_discount_minor::numeric+coupon_discount_minor::numeric),
 CHECK(total_minor::numeric = subtotal_minor::numeric-annual_discount_minor::numeric-bundle_discount_minor::numeric-coupon_discount_minor::numeric+tax_minor::numeric)
);
CREATE TABLE platform_subscription_quote_lines (
 quote_id uuid NOT NULL REFERENCES platform_subscription_purchase_quotes(id) ON DELETE RESTRICT,
 line_no integer NOT NULL CHECK(line_no>0),label text NOT NULL CHECK(length(label) BETWEEN 1 AND 160),
 offer_version_id uuid REFERENCES platform_subscription_offer_versions(id) ON DELETE RESTRICT,
 quantity integer NOT NULL CHECK(quantity BETWEEN 1 AND 100000),
 unit_price_minor bigint NOT NULL CHECK(unit_price_minor>=0),subtotal_minor bigint NOT NULL CHECK(subtotal_minor>=0),
 PRIMARY KEY(quote_id,line_no),CHECK(subtotal_minor::numeric=quantity::numeric*unit_price_minor::numeric)
);

CREATE TABLE platform_subscription_policy_versions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 kind text NOT NULL CHECK(kind IN ('terms','privacy','refund')),
 version_label text NOT NULL CHECK(length(version_label) BETWEEN 1 AND 64),
 url text NOT NULL CHECK(url~'^https://[^[:space:]]+$'),
 content_sha256 text NOT NULL CHECK(content_sha256~'^[a-f0-9]{64}$'),
 status text NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','published','archived')),
 created_by uuid NOT NULL REFERENCES app_users(id),created_at timestamptz NOT NULL DEFAULT now(),published_at timestamptz,
 UNIQUE(kind,version_label)
);
CREATE UNIQUE INDEX platform_subscription_policy_published_idx ON platform_subscription_policy_versions(kind) WHERE status='published';
CREATE TABLE platform_subscription_policy_acceptances (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 intent_id uuid NOT NULL REFERENCES platform_subscription_purchase_intents(id) ON DELETE RESTRICT,
 actor_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
 policy_version_id uuid NOT NULL REFERENCES platform_subscription_policy_versions(id) ON DELETE RESTRICT,
 accepted_at timestamptz NOT NULL DEFAULT now(),UNIQUE(intent_id,policy_version_id)
);

CREATE TABLE platform_subscription_coupon_reservations (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 coupon_id uuid NOT NULL REFERENCES platform_subscription_coupons(id) ON DELETE RESTRICT,
 intent_id uuid NOT NULL REFERENCES platform_subscription_purchase_intents(id) ON DELETE RESTRICT,
 quote_id uuid NOT NULL REFERENCES platform_subscription_purchase_quotes(id) ON DELETE RESTRICT,
 actor_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
 status text NOT NULL DEFAULT 'reserved' CHECK(status IN ('reserved','released','redeemed','expired')),
 reserved_at timestamptz NOT NULL DEFAULT now(),expires_at timestamptz NOT NULL,
 UNIQUE(coupon_id,intent_id,quote_id),CHECK(expires_at>reserved_at)
);
CREATE UNIQUE INDEX platform_subscription_one_reserved_intent_idx ON platform_subscription_coupon_reservations(intent_id) WHERE status='reserved';
CREATE INDEX platform_subscription_coupon_reservations_expiry_idx ON platform_subscription_coupon_reservations(expires_at) WHERE status='reserved';
CREATE TABLE platform_subscription_coupon_redemptions (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 coupon_id uuid NOT NULL REFERENCES platform_subscription_coupons(id) ON DELETE RESTRICT,
 reservation_id uuid NOT NULL UNIQUE REFERENCES platform_subscription_coupon_reservations(id) ON DELETE RESTRICT,
 invoice_id uuid NOT NULL UNIQUE REFERENCES pg13_platform_invoices(id) ON DELETE RESTRICT,
 actor_id uuid NOT NULL REFERENCES app_users(id) ON DELETE RESTRICT,
 workspace_id uuid NOT NULL REFERENCES workspaces(id) ON DELETE RESTRICT,
 discount_minor bigint NOT NULL CHECK(discount_minor>=0),redeemed_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX platform_subscription_coupon_redemptions_idx ON platform_subscription_coupon_redemptions(coupon_id,redeemed_at DESC);
CREATE TABLE platform_subscription_purchase_audit (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 intent_id uuid NOT NULL REFERENCES platform_subscription_purchase_intents(id) ON DELETE RESTRICT,
 actor_id uuid REFERENCES app_users(id) ON DELETE RESTRICT,
 action text NOT NULL CHECK(length(action) BETWEEN 3 AND 80),
 detail jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(detail)='object'),
 occurred_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX platform_subscription_purchase_audit_idx ON platform_subscription_purchase_audit(intent_id,occurred_at DESC);

-- No runtime role obtains raw table permissions. Future authorized Go APIs
-- must use narrowly scoped SECURITY DEFINER functions and audited writes.
DO $$DECLARE t text;BEGIN
 FOREACH t IN ARRAY ARRAY[
 'platform_primary_stores','platform_subscription_offers','platform_subscription_offer_versions',
 'platform_subscription_coupons','platform_subscription_purchase_intents',
 'platform_subscription_purchase_quotes','platform_subscription_quote_lines',
 'platform_subscription_policy_versions','platform_subscription_policy_acceptances',
 'platform_subscription_coupon_reservations','platform_subscription_coupon_redemptions',
 'platform_subscription_purchase_audit'] LOOP
   EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',t);
   EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',t);
   EXECUTE format('CREATE POLICY %I ON %I TO %I USING(true) WITH CHECK(true)',t||'_owner',t,current_user);
   EXECUTE format('REVOKE ALL ON %I FROM PUBLIC',t);
   IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='ekmivo_financial_runtime') THEN
     EXECUTE format('REVOKE ALL ON %I FROM ekmivo_financial_runtime',t);
   END IF;
 END LOOP;
END$$;
COMMIT;
