-- Run ONLY on an isolated Neon live financial branch. No durable writes.
DO $test$ DECLARE w uuid;f text;BEGIN
 SELECT workspace_id INTO w FROM financial_workspace_registry WHERE environment='live' AND status='active' LIMIT 1;
 IF w IS NULL THEN RAISE EXCEPTION 'An isolated active fixture workspace is required';END IF;
 PERFORM set_config('ekmivo.workspace_id',w::text,true);PERFORM set_config('ekmivo.environment','live',true);
 FOREACH f IN ARRAY ARRAY['invoices','payment_links','reports','exports'] LOOP
  PERFORM set_config('ekmivo.payment_plan',jsonb_build_object('workspace_id',w,'fetched_at',now(),'terms',jsonb_build_object('features',jsonb_build_object(f,false)))::text,true);
  BEGIN PERFORM payment_plan_require_feature(w,'live',f);RAISE EXCEPTION 'Disabled feature allowed: %',f;EXCEPTION WHEN SQLSTATE 'P6807' THEN NULL;END;
  PERFORM set_config('ekmivo.payment_plan',jsonb_build_object('workspace_id',w,'fetched_at',now(),'terms',jsonb_build_object('features',jsonb_build_object(f,true)))::text,true);
  PERFORM payment_plan_require_feature(w,'live',f);
 END LOOP;
 PERFORM set_config('ekmivo.payment_plan','',true);
 BEGIN PERFORM payment_plan_require_feature(w,'live','invoices');RAISE EXCEPTION 'Missing snapshot allowed';EXCEPTION WHEN SQLSTATE 'P6801' THEN NULL;END;
END $test$;
