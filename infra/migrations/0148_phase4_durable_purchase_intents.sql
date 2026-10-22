-- Phase 4: durable opaque purchase handles and independently bound guest sessions.
-- Additive only. This migration must be checked on an isolated Neon branch before deployment.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $$ BEGIN
 IF current_database() <> 'ekmivo'
 OR to_regclass('public.platform_subscription_purchase_intents') IS NULL
 OR to_regclass('public.financial_realm') IS NOT NULL
 THEN RAISE EXCEPTION 'phase 4 migration requires Ekmivo control database'; END IF;
END $$;

ALTER TABLE platform_subscription_purchase_intents
 ADD COLUMN public_token_sha256 text,
 ADD COLUMN guest_session_sha256 text,
 ADD COLUMN requested_quantity integer NOT NULL DEFAULT 1,
 ADD COLUMN legacy_plan_id text,
 ADD CONSTRAINT platform_purchase_token_digest_ck
  CHECK(public_token_sha256 IS NULL OR public_token_sha256 ~ '^[a-f0-9]{64}$'),
 ADD CONSTRAINT platform_purchase_guest_session_digest_ck
  CHECK(guest_session_sha256 IS NULL OR guest_session_sha256 ~ '^[a-f0-9]{64}$'),
 ADD CONSTRAINT platform_purchase_quantity_ck CHECK(requested_quantity BETWEEN 1 AND 100000),
 ADD CONSTRAINT platform_purchase_legacy_plan_ck
  CHECK(legacy_plan_id IS NULL OR legacy_plan_id ~ '^[a-z][a-z0-9_-]{1,39}$'),
 ADD CONSTRAINT platform_purchase_expiration_bound_ck
  CHECK(expires_at <= created_at + interval '7 days');

CREATE UNIQUE INDEX platform_purchase_public_token_idx
 ON platform_subscription_purchase_intents(public_token_sha256)
 WHERE public_token_sha256 IS NOT NULL;
CREATE INDEX platform_purchase_guest_session_idx
 ON platform_subscription_purchase_intents(guest_session_sha256,created_at DESC)
 WHERE guest_session_sha256 IS NOT NULL;
CREATE INDEX platform_purchase_actor_status_idx
 ON platform_subscription_purchase_intents(actor_id,created_at DESC)
 WHERE actor_id IS NOT NULL;

COMMENT ON COLUMN platform_subscription_purchase_intents.public_token_sha256 IS
 'SHA-256 of a random 256-bit capability embedded in /checkout/order/{token}; never store the raw token';
COMMENT ON COLUMN platform_subscription_purchase_intents.guest_session_sha256 IS
 'SHA-256 of the separate random HttpOnly SameSite=Lax guest session secret; not a bearer in URLs';
-- Existing intents are preserved; newly issued Phase 4 intents require a public digest.
COMMIT;