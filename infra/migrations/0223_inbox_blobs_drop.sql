-- CONTROL only. Seller-sent attachments are held in backend memory only (never in a database table),
-- so the transient table introduced in 0222 is removed. Telegram media capabilities from 0222 stay.
BEGIN;
DROP FUNCTION IF EXISTS inbox_blob_put(text,uuid,bytea);
DROP FUNCTION IF EXISTS inbox_blob_get(text);
DROP FUNCTION IF EXISTS inbox_blob_has(text);
DROP FUNCTION IF EXISTS inbox_blob_purge(interval);
DROP TABLE IF EXISTS inbox_blobs;
COMMIT;
