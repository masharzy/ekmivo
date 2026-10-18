-- BOTH financial realms. Public checkout completion/verification are preserved.
BEGIN;
CREATE FUNCTION payment_plan_require_feature(w uuid,e text,f text) RETURNS void
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE p jsonb;BEGIN
 PERFORM pg06_scope(w,e);
 IF e='sandbox' THEN RETURN;END IF;
 p:=nullif(current_setting('ekmivo.payment_plan',true),'')::jsonb;
 IF p IS NULL OR p->>'workspace_id' IS DISTINCT FROM w::text OR p->>'fetched_at' IS NULL
 OR (p->>'fetched_at')::timestamptz<statement_timestamp()-interval '30 seconds'
 OR (p->>'fetched_at')::timestamptz>statement_timestamp()+interval '1 minute'
 THEN RAISE EXCEPTION 'PLAN_SNAPSHOT_REQUIRED' USING ERRCODE='P6801';END IF;
 IF coalesce((p->'terms'->'features'->>f)::boolean,false) IS NOT TRUE
 THEN RAISE EXCEPTION 'PLAN_FEATURE_REQUIRED' USING ERRCODE='P6807';END IF;
END $$;
REVOKE ALL ON FUNCTION payment_plan_require_feature(uuid,text,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION payment_plan_require_feature(uuid,text,text) TO ekmivo_finance_reader,ekmivo_financial_worker;
-- Add guards to the existing implementations, retaining paging, PII and idempotency.
DO $$ DECLARE sig text;guard text;d text;start_at integer;BEGIN
 FOR sig,guard IN VALUES
 ('pg10_read(uuid,text,text,uuid,uuid,text)','IF res IN (''invoices'',''payment-links'') THEN PERFORM payment_plan_require_feature(w,e,CASE WHEN res=''invoices'' THEN ''invoices'' ELSE ''payment_links'' END);END IF;'),
 ('pg10_write(uuid,text,text,uuid,text,jsonb,text,text,text,uuid)','IF res IN (''invoices'',''payment-links'') THEN PERFORM payment_plan_require_feature(w,e,CASE WHEN res=''invoices'' THEN ''invoices'' ELSE ''payment_links'' END);END IF;'),
 ('pg13_reports(uuid,text,timestamptz,timestamptz,uuid)','PERFORM payment_plan_require_feature(w,e,''reports'');'),
 ('pg10_export_enqueue(uuid,text,uuid,text,text)','PERFORM payment_plan_require_feature(w,e,''exports'');'),
 ('pg10_export_get(uuid,text,uuid,uuid,boolean)','PERFORM payment_plan_require_feature(w,e,''exports'');')
 LOOP
  SELECT pg_get_functiondef(sig::regprocedure) INTO d;
  start_at:=position('BEGIN' IN d);
  IF start_at=0 THEN RAISE EXCEPTION 'Unexpected plan function %',sig;END IF;
  d:=overlay(d placing 'BEGIN '||guard from start_at for 5);
  EXECUTE d;
 END LOOP;
END $$;
COMMIT;
