-- Control plane only. Trust is a random, hashed, revocable browser credential.
BEGIN;
CREATE TABLE platform_admin_trusted_devices (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
 token_hash text NOT NULL UNIQUE CHECK(length(token_hash)=64),
 name text NOT NULL CHECK(length(name) BETWEEN 1 AND 160),
 verified_at timestamptz NOT NULL DEFAULT now(),
 last_used_at timestamptz NOT NULL DEFAULT now(),
 expires_at timestamptz NOT NULL DEFAULT now()+interval '30 days',
 revoked_at timestamptz
);
CREATE INDEX platform_admin_trusted_devices_user ON platform_admin_trusted_devices(user_id);
ALTER TABLE auth_sessions ADD COLUMN trusted_device_id uuid REFERENCES platform_admin_trusted_devices(id);
REVOKE ALL ON platform_admin_trusted_devices FROM PUBLIC;
-- The application already owns session issuance and uses the control-plane runtime.
DO $$ DECLARE r text; BEGIN
 FOR r IN SELECT DISTINCT grantee FROM information_schema.role_table_grants
 WHERE table_schema='public' AND table_name='auth_sessions' AND privilege_type='UPDATE'
 AND grantee NOT IN ('PUBLIC',current_user) LOOP
 EXECUTE format('GRANT SELECT,INSERT,UPDATE ON platform_admin_trusted_devices TO %I',r);
 END LOOP;
END $$;
COMMIT;
