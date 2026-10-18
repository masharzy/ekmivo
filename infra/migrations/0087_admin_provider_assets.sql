-- 0087: Control-plane provider image assets (0086 is reserved for financial phone reconnect). 
-- Durable, content-addressed provider logos. Original uploaded bytes live in Neon
-- Postgres; provider catalog references immutable /api/provider-logos/<sha256> URLs.
BEGIN;
CREATE TABLE IF NOT EXISTS platform_provider_assets (
 digest text PRIMARY KEY CHECK(digest ~ '^[0-9a-f]{64}$'),
 content_type text NOT NULL CHECK(content_type IN ('image/png','image/jpeg','image/webp')),
 bytes bytea NOT NULL CHECK(octet_length(bytes)>0 AND octet_length(bytes)<=512000),
 created_by uuid NOT NULL REFERENCES app_users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE platform_provider_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_provider_assets FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
 IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='platform_provider_assets' AND policyname='platform_provider_assets_owner') THEN
  CREATE POLICY platform_provider_assets_owner ON platform_provider_assets USING (true) WITH CHECK (true);
 END IF;
END $$;
REVOKE ALL ON platform_provider_assets FROM PUBLIC;
COMMIT;
