-- CONTROL only. Seller-sent attachments are kept encrypted-at-transport in this table for a short time
-- (see inboxBlobTTL in Go) instead of private object storage; expired rows are purged by the backend.
-- Telegram gains photo / voice / document sending.
BEGIN;
DO $$BEGIN
 IF to_regclass('public.inbox_media') IS NULL OR to_regclass('public.financial_realm') IS NOT NULL THEN RAISE EXCEPTION '0222 requires CONTROL inbox';END IF;
END $$;

CREATE TABLE inbox_blobs(
 key text PRIMARY KEY,
 workspace_id uuid NOT NULL,
 data bytea NOT NULL,
 created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX inbox_blobs_created_idx ON inbox_blobs(created_at);
REVOKE ALL ON inbox_blobs FROM PUBLIC;

CREATE FUNCTION inbox_blob_put(k text,w uuid,d bytea) RETURNS void
 LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS
$$INSERT INTO inbox_blobs(key,workspace_id,data) VALUES(k,w,d) ON CONFLICT(key) DO NOTHING$$;
CREATE FUNCTION inbox_blob_get(k text) RETURNS bytea
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS
$$SELECT data FROM inbox_blobs WHERE key=k$$;
CREATE FUNCTION inbox_blob_has(k text) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS
$$SELECT EXISTS(SELECT 1 FROM inbox_blobs WHERE key=k)$$;
CREATE FUNCTION inbox_blob_purge(max_age interval) RETURNS integer
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS
$$DECLARE n integer;BEGIN DELETE FROM inbox_blobs WHERE created_at<now()-max_age;GET DIAGNOSTICS n=ROW_COUNT;RETURN n;END$$;

REVOKE ALL ON FUNCTION inbox_blob_put(text,uuid,bytea),inbox_blob_get(text),inbox_blob_has(text),inbox_blob_purge(interval) FROM PUBLIC;
DO $$DECLARE g text;BEGIN
 FOREACH g IN ARRAY ARRAY['ekmivo_owner','ekmivo_financial_runtime','ekmivo_financial_projection','ekmivo_runtime','ekmivo_web_app'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=g) THEN
   EXECUTE format('GRANT EXECUTE ON FUNCTION inbox_blob_put(text,uuid,bytea),inbox_blob_get(text),inbox_blob_has(text),inbox_blob_purge(interval) TO %I',g);
  END IF;
 END LOOP;
END $$;

-- Telegram can now send photos, voice notes and documents.
DO $$DECLARE d text;n text;BEGIN
 d:=pg_get_functiondef('inbox_capabilities(text)'::regprocedure);
 n:=replace(d,'"image":false,"audio":false,"document":false','"image":true,"audio":true,"document":true');
 n:=replace(n,'"max_images":0,"max_bytes":0','"max_images":10,"max_bytes":5242880');
 IF n=d THEN RAISE EXCEPTION 'Unexpected inbox_capabilities definition';END IF;
 EXECUTE n;
END $$;
COMMIT;
