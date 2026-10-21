-- Parsing authorization only; imports remain private editor text until Save.
BEGIN;
DO $$BEGIN IF to_regclass('public.briofold_ai_channel_jobs') IS NULL OR to_regclass('public.financial_realm') IS NOT NULL THEN RAISE EXCEPTION '0136 requires control AI schema';END IF;END $$;
CREATE FUNCTION briofold_ai_import_authorize(w uuid,a uuid) RETURNS boolean LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN PERFORM briofold_ai_studio_actor(w,a);RETURN true;END $$;
REVOKE ALL ON FUNCTION briofold_ai_import_authorize(uuid,uuid) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION briofold_ai_import_authorize(uuid,uuid) TO ekmivo_financial_runtime,ekmivo_financial_projection;
COMMIT;
