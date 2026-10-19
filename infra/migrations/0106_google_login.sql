BEGIN;
CREATE TABLE auth_google_identities (
 subject text PRIMARY KEY CHECK(length(subject) BETWEEN 1 AND 255),
 user_id uuid NOT NULL UNIQUE REFERENCES app_users(id) ON DELETE CASCADE,
 linked_at timestamptz NOT NULL DEFAULT now()
);
REVOKE ALL ON auth_google_identities FROM PUBLIC;
-- These are auth records, read/written only by the existing web auth role.
-- The Go financial runtime has no identity mapping privileges.
DO $$
DECLARE auth_role text;
BEGIN
 SELECT tableowner INTO auth_role FROM pg_tables WHERE schemaname='public' AND tablename='app_users';
 EXECUTE format('GRANT SELECT,INSERT ON auth_google_identities TO %I',auth_role);
END $$;
COMMIT;
