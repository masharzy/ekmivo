-- CONTROL only. No production activation or provider operation.
BEGIN;
DO $$BEGIN IF to_regclass('public.briofold_member_channel_scopes') IS NULL OR to_regclass('public.financial_realm') IS NOT NULL THEN RAISE EXCEPTION '0212 requires CONTROL channel scopes';END IF;END $$;
CREATE TABLE channel_platform_config(singleton boolean PRIMARY KEY DEFAULT true CHECK(singleton),cipher bytea NOT NULL CHECK(octet_length(cipher) BETWEEN 28 AND 65536),updated_by uuid NOT NULL REFERENCES app_users(id),updated_at timestamptz NOT NULL DEFAULT now());
ALTER TABLE channel_platform_config ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON channel_platform_config FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
CREATE FUNCTION channel_platform_config_read() RETURNS bytea LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$ SELECT cipher FROM channel_platform_config WHERE singleton $$;
CREATE FUNCTION channel_platform_config_write(a uuid,c bytea,r text,v text) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$ BEGIN
 IF length(trim(r)) NOT BETWEEN 10 AND 500 OR NOT EXISTS(SELECT 1 FROM platform_administrators p JOIN app_users u ON u.id=p.user_id WHERE p.user_id=a AND p.role='super_admin' AND u.disabled_at IS NULL) THEN RAISE EXCEPTION 'Admin required' USING ERRCODE='42501';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('channel-platform-config',0));
 IF coalesce((SELECT encode(digest(cipher,'sha256'),'hex') FROM channel_platform_config WHERE singleton),'initial') IS DISTINCT FROM v THEN RAISE EXCEPTION 'Configuration changed' USING ERRCODE='40001';END IF;
 INSERT INTO channel_platform_config(singleton,cipher,updated_by) VALUES(true,c,a) ON CONFLICT(singleton) DO UPDATE SET cipher=EXCLUDED.cipher,updated_by=a,updated_at=now();
 INSERT INTO platform_admin_audit(actor_id,action,description) VALUES(a,'channels.configuration',r);
END $$;
REVOKE ALL ON FUNCTION channel_platform_config_read(),channel_platform_config_write(uuid,bytea,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION channel_platform_config_read(),channel_platform_config_write(uuid,bytea,text,text) TO ekmivo_financial_projection;
ALTER TABLE inbox_connections DROP CONSTRAINT inbox_connections_provider_check;
ALTER TABLE inbox_connections ADD CONSTRAINT inbox_connections_provider_check CHECK(provider IN ('wa','ig','ms','site','tg'));
-- Text-only Telegram support: never advertise unimplemented media/reactions.
ALTER FUNCTION inbox_capabilities(text) RENAME TO inbox_capabilities_before_telegram;
CREATE FUNCTION inbox_capabilities(p text) RETURNS jsonb LANGUAGE sql IMMUTABLE AS $$ SELECT CASE WHEN p='tg' THEN '{"image":false,"audio":false,"document":false,"product":false,"forward":false,"reactions":[],"delivered":false,"max_images":0,"max_bytes":0}'::jsonb ELSE inbox_capabilities_before_telegram(p) END $$;
COMMIT;
