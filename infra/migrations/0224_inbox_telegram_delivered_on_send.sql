-- CONTROL only. Telegram Bot API sends no delivery receipts: once Telegram accepts a message it is on
-- the customer's cloud account, so a successfully sent Telegram message is shown as delivered (2 ticks).
-- Read receipts are not available to bots, so Telegram messages never reach "seen".
BEGIN;
CREATE OR REPLACE FUNCTION inbox_telegram_delivered(job uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 UPDATE inbox_messages m SET state='delivered',delivered_at=coalesce(m.delivered_at,now())
 FROM inbox_threads t JOIN inbox_connections c ON c.workspace_id=t.workspace_id AND c.id=t.connection_id
 WHERE m.id=job AND m.state='sent' AND t.id=m.thread_id AND t.workspace_id=m.workspace_id AND c.provider='tg';
END $$;
REVOKE ALL ON FUNCTION inbox_telegram_delivered(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION inbox_telegram_delivered(uuid) TO ekmivo_financial_runtime,ekmivo_financial_projection;
COMMIT;
