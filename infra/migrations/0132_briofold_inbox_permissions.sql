-- Control-only Inbox permissions. Payment and device privileges are unchanged.
BEGIN;
DO $$BEGIN
 IF to_regclass('public.pg13_member_grants') IS NULL OR to_regclass('public.financial_realm') IS NOT NULL
 THEN RAISE EXCEPTION '0132 requires the control permission schema'; END IF;
END $$;
ALTER TABLE pg13_member_grants DROP CONSTRAINT pg13_member_grants_capability_check;
ALTER TABLE pg13_member_grants ADD CONSTRAINT pg13_member_grants_capability_check CHECK(capability IN
 ('payments:read','payments:issue','payments:manage','payments:export','workspace:settings','members:manage','product:payments',
 'inbox:read','inbox:send','inbox:manage','product:ai'));
CREATE OR REPLACE FUNCTION pg13_capability_override(w uuid,a uuid,cap text) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT CASE WHEN m.role='owner' THEN NULL
 WHEN ((cap LIKE 'payments:%' AND EXISTS(SELECT 1 FROM pg13_member_grants WHERE workspace_id=w AND user_id=a AND capability='product:payments' AND NOT allowed))
 OR (cap LIKE 'inbox:%' AND EXISTS(SELECT 1 FROM pg13_member_grants WHERE workspace_id=w AND user_id=a AND capability='product:ai' AND NOT allowed))) THEN false
 ELSE(SELECT allowed FROM pg13_member_grants WHERE workspace_id=w AND user_id=a AND capability=cap) END
 FROM workspace_members m WHERE m.workspace_id=w AND m.user_id=a
$$;
COMMIT;
