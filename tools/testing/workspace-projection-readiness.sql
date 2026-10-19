-- Run only in an isolated Neon financial branch. All synthetic rows roll back.
DO $$
DECLARE w uuid:=gen_random_uuid(); other uuid:=gen_random_uuid(); e text; opposite text;
BEGIN
 BEGIN
  SELECT environment INTO e FROM financial_realm WHERE singleton;
  opposite:=CASE WHEN e='live' THEN 'sandbox' ELSE 'live' END;
  PERFORM set_config('ekmivo.workspace_id',w::text,true),set_config('ekmivo.environment',e,true);
  BEGIN PERFORM pg06_workspace_ready(w,e); RAISE EXCEPTION 'fresh workspace unexpectedly ready';
   EXCEPTION WHEN SQLSTATE 'P0401' THEN NULL; END;
  BEGIN PERFORM pg06_workspace_ready(other,e); RAISE EXCEPTION 'cross-workspace readiness allowed';
   EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  BEGIN PERFORM pg06_workspace_ready(w,opposite); RAISE EXCEPTION 'cross-realm readiness allowed';
   EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF NOT financial_sync_workspace(w,e,2,true) THEN RAISE EXCEPTION 'initial sync failed'; END IF;
  PERFORM pg06_workspace_ready(w,e);
  PERFORM pg05_merchant_list(w,e);
  IF NOT financial_sync_workspace(w,e,2,true) THEN RAISE EXCEPTION 'idempotent repair failed'; END IF;
  IF financial_sync_workspace(w,e,1,true) THEN RAISE EXCEPTION 'stale repair accepted'; END IF;
  IF NOT financial_sync_workspace(w,e,3,false) THEN RAISE EXCEPTION 'suspension failed'; END IF;
  BEGIN PERFORM pg06_workspace_ready(w,e); RAISE EXCEPTION 'suspended workspace allowed';
   EXCEPTION WHEN insufficient_privilege THEN NULL; END;
  IF financial_sync_workspace(w,e,2,true) THEN RAISE EXCEPTION 'stale repair reactivated suspension'; END IF;
  IF NOT has_function_privilege('ekmivo_finance_reader','pg06_workspace_ready(uuid,text)','EXECUTE') OR has_function_privilege('ekmivo_finance_reader','financial_sync_workspace(uuid,text,bigint,boolean)','EXECUTE') THEN RAISE EXCEPTION 'reader/provisioner separation changed'; END IF;
  RAISE SQLSTATE 'ZX001' USING MESSAGE='rollback synthetic fixture';
 EXCEPTION WHEN SQLSTATE 'ZX001' THEN NULL;
 END;
END $$;
