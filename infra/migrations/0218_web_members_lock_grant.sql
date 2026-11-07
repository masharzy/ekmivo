-- Control database only. API key create/rotate/revoke locks the caller's workspace_members row
-- (SELECT ... FOR UPDATE), and PostgreSQL requires UPDATE on at least one column for any row lock.
-- Grant the least harmful column: joined_at is informational and never read for authorisation.
-- role and the key columns stay unwritable by the web runtime.
BEGIN;
GRANT UPDATE (joined_at) ON TABLE public.workspace_members TO ekmivo_web_app;
COMMIT;
