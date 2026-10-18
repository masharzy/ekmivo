-- BOTH financial realms: disable private delivery and existing exports with their feature.
BEGIN;
DO $$ DECLARE sig text;d text;needle text;replacement text;BEGIN
 FOR sig,needle,replacement IN VALUES
 ('pg10_export_enqueue(uuid,text,uuid,text,text)','BEGIN','BEGIN IF res IN (''invoices'',''payment-links'') THEN PERFORM payment_plan_require_feature(w,e,CASE WHEN res=''invoices'' THEN ''invoices'' ELSE ''payment_links'' END);END IF;'),
 ('pg10_export_get(uuid,text,uuid,uuid,boolean)','IF download THEN','IF j.resource IN (''invoices'',''payment-links'') THEN PERFORM payment_plan_require_feature(w,e,CASE WHEN j.resource=''invoices'' THEN ''invoices'' ELSE ''payment_links'' END);END IF; IF download THEN'),
 ('pg10_export_rows(uuid,uuid,uuid)','RETURN pg10_read','PERFORM payment_plan_require_feature(j.workspace_id,j.environment,''exports'');RETURN pg10_read'),
 ('pg10_invoice_contact(uuid,text,uuid)','BEGIN','BEGIN PERFORM payment_plan_require_feature(w,e,''invoices'');'),
 ('pg10_invoice_send(uuid,text,uuid,uuid,text,bytea,text,bigint)','BEGIN','BEGIN PERFORM payment_plan_require_feature(w,e,''invoices'');'),
 ('pg10_invoice_delivery(uuid,text,uuid)','BEGIN','BEGIN PERFORM payment_plan_require_feature(w,e,''invoices'');')
 LOOP
 SELECT pg_get_functiondef(sig::regprocedure) INTO d;
 IF position(needle IN d)=0 THEN RAISE EXCEPTION 'Unexpected feature function %',sig;END IF;
 EXECUTE replace(d,needle,replacement);
 END LOOP;
END $$;
COMMIT;
