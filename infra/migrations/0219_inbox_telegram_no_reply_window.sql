-- CONTROL only. Telegram has no 24-hour customer-service window, so Telegram threads are always open.
-- Messenger/Instagram/WhatsApp keep the 24-hour rule. Existing definitions are patched in place
-- (same approach as 0216) so every current access/policy guard is retained.
BEGIN;
DO $$BEGIN
 IF to_regclass('public.inbox_threads') IS NULL OR to_regclass('public.financial_realm') IS NOT NULL THEN RAISE EXCEPTION '0219 requires CONTROL inbox';END IF;
END $$;

CREATE FUNCTION inbox_window_free(connection uuid) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS
$$SELECT coalesce((SELECT provider='tg' FROM inbox_connections WHERE id=connection),false)$$;
REVOKE ALL ON FUNCTION inbox_window_free(uuid) FROM PUBLIC;
DO $$DECLARE g text;BEGIN
 FOREACH g IN ARRAY ARRAY['ekmivo_runtime','ekmivo_web_app'] LOOP
  IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=g) THEN EXECUTE format('GRANT EXECUTE ON FUNCTION inbox_window_free(uuid) TO %I',g);END IF;
 END LOOP;
END $$;

DO $$DECLARE r record;d text;n text;patched int:=0;BEGIN
 FOR r IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace AND s.nspname='public'
   WHERE p.prokind='f' AND p.proname IN ('inbox_page_v1','inbox_page_media','inbox_page','inbox_action_v2','inbox_next_send_v1','inbox_media_save','inbox_advanced_before_channel_scopes','briofold_ai_channel_claim_before_policy','briofold_ai_channel_valid','briofold_ai_channel_finish')
   AND p.prosrc ~ 'last_customer_at\s*(>|<=)\s*now\(\)\s*-\s*interval ''24 hours'''
 LOOP
  d:=pg_get_functiondef(r.oid);
  n:=regexp_replace(d,'(\w+)\.last_customer_at\s*>\s*now\(\)\s*-\s*interval ''24 hours''','(\1.last_customer_at>now()-interval ''24 hours'' OR inbox_window_free(\1.connection_id))','g');
  n:=regexp_replace(n,'(\w+)\.last_customer_at\s*<=\s*now\(\)\s*-\s*interval ''24 hours''','(\1.last_customer_at<=now()-interval ''24 hours'' AND NOT inbox_window_free(\1.connection_id))','g');
  IF n=d THEN RAISE EXCEPTION 'Unexpected window definition in %',r.proname;END IF;
  EXECUTE n;patched:=patched+1;
 END LOOP;
 IF patched<8 THEN RAISE EXCEPTION 'Expected at least 8 window functions, patched %',patched;END IF;
END $$;
COMMIT;
