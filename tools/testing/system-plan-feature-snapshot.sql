DO $test$ DECLARE w uuid:='6d019df4-ec89-40fb-a261-069c663c5396';p jsonb;BEGIN
PERFORM set_config('ekmivo.workspace_id',w::text,true);PERFORM set_config('ekmivo.environment','live',true);
p:=jsonb_build_object('workspace_id',w,'platform_billing',true,'fetched_at',now());
PERFORM set_config('ekmivo.payment_plan',p::text,true);
BEGIN PERFORM payment_plan_require_feature(w,'live','invoices');RAISE EXCEPTION 'old snapshot unexpectedly allowed';EXCEPTION WHEN SQLSTATE 'P6807' THEN NULL;END;
p:=p||'{"terms":{"features":{"invoices":true,"payment_links":true,"reports":true,"exports":false}}}'::jsonb;
PERFORM set_config('ekmivo.payment_plan',p::text,true);
PERFORM payment_plan_require_feature(w,'live','invoices');
PERFORM payment_plan_require_feature(w,'live','payment_links');
PERFORM payment_plan_require_feature(w,'live','reports');
BEGIN PERFORM payment_plan_require_feature(w,'live','exports');RAISE EXCEPTION 'disabled export bypass';EXCEPTION WHEN SQLSTATE 'P6807' THEN NULL;END;
END $test$;
