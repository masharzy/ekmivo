-- Additional integrity: prevent alteration of audit-grade manual AI credit adjustment history.
-- Additive migration only; never rewrites a previously issued credit adjustment.
BEGIN;
CREATE OR REPLACE FUNCTION platform_ai_credit_ledger_immutable()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 RAISE EXCEPTION 'AI credit ledger entries are immutable' USING ERRCODE='42501';
END $$;
DO $$
BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_trigger WHERE tgname='platform_ai_credit_ledger_block_changes'
  AND tgrelid='public.platform_ai_credit_ledger'::regclass) THEN
  CREATE TRIGGER platform_ai_credit_ledger_block_changes
   BEFORE UPDATE OR DELETE ON platform_ai_credit_ledger
   FOR EACH ROW EXECUTE FUNCTION platform_ai_credit_ledger_immutable();
 END IF;
END $$;
COMMIT;
