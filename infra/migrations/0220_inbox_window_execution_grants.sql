-- Existing security-definer Inbox routines are owned by ekmivo_owner.
-- Their nested Telegram window check needs EXECUTE under that role too.
BEGIN;
GRANT EXECUTE ON FUNCTION public.inbox_window_free(uuid)
 TO ekmivo_owner, ekmivo_financial_runtime, ekmivo_financial_projection;
COMMIT;
