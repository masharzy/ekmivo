-- CONTROL only. Messenger delivery webhooks may carry only a watermark (no message ids).
-- Mark every earlier outbound message to that customer as delivered.
BEGIN;
CREATE OR REPLACE FUNCTION inbox_delivered_watermark(c uuid,r text,at_time timestamptz) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 UPDATE inbox_messages m SET state='delivered',delivered_at=coalesce(m.delivered_at,at_time)
 FROM inbox_threads t WHERE m.thread_id=t.id AND t.connection_id=c AND t.external_id=r AND m.sender<>'customer' AND m.state='sent' AND m.created_at<=at_time AND m.provider_id IS NOT NULL;
END $$;
REVOKE ALL ON FUNCTION inbox_delivered_watermark(uuid,text,timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION inbox_delivered_watermark(uuid,text,timestamptz) TO ekmivo_financial_runtime,ekmivo_financial_projection;
COMMIT;
