-- FINANCIAL live and sandbox. The maintenance job uses the worker role.
-- Preserve allowance logic and restrict this grant to its bounded function.
BEGIN;
GRANT EXECUTE ON FUNCTION payment_allowance_reconcile_expired(integer) TO ekmivo_financial_worker;
COMMIT;
