DO $test$ DECLARE w uuid:='6d019df4-ec89-40fb-a261-069c663c5396'; v uuid:='6f7aeede-2890-406e-92d1-c448fb37a9ce'; ident text:=encode(sha256(gen_random_uuid()::text::bytea),'hex'); a uuid; b uuid; BEGIN
 BEGIN
 PERFORM set_config('ekmivo.environment','live',true);
 PERFORM set_config('ekmivo.workspace_id',w::text,true);
 PERFORM set_config('ekmivo.payment_plan',jsonb_build_object('workspace_id',w,'fetched_at',now(),'platform_billing',true)::text,true);
 a:=(pg06_account_add(w,'live','bkash',ident,'1234',decode(repeat('11',40),'hex'),false)->>'id')::uuid;
 BEGIN PERFORM pg06_account_add(w,'live','bkash',ident,'1234',decode(repeat('11',40),'hex'),true); RAISE EXCEPTION 'same workspace allowed'; EXCEPTION WHEN unique_violation THEN NULL; END;
 PERFORM set_config('ekmivo.workspace_id',v::text,true);
 PERFORM set_config('ekmivo.payment_plan',jsonb_build_object('workspace_id',v,'fetched_at',now(),'platform_billing',true)::text,true);
 BEGIN PERFORM pg06_account_add(v,'live','bkash',ident,'1234',decode(repeat('11',40),'hex'),false); RAISE EXCEPTION 'missing consent allowed'; EXCEPTION WHEN SQLSTATE 'P6901' THEN NULL; END;
 b:=(pg06_account_add(v,'live','bkash',ident,'1234',decode(repeat('11',40),'hex'),true)->>'id')::uuid;
 IF a=b THEN RAISE EXCEPTION 'account not isolated';END IF;
 PERFORM pg06_account_delete(v,'live',b);
 IF EXISTS(SELECT 1 FROM pg06_phone_account_cipher(v,'live') WHERE account_id=b) THEN RAISE EXCEPTION 'deleted visible';END IF;
 IF NOT EXISTS(SELECT 1 FROM financial_receiving_accounts WHERE id=b) THEN RAISE EXCEPTION 'history lost';END IF;
 BEGIN PERFORM pg09_action(v,'live','gateways',b,'enable','{}',NULL); RAISE EXCEPTION 'deleted enabled'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 IF (pg06_account_add(v,'live','bkash',ident,'1234',decode(repeat('11',40),'hex'),true)->>'id')::uuid<>b THEN RAISE EXCEPTION 'restore failed';END IF;
 BEGIN PERFORM pg06_account_delete(w,'live',a); RAISE EXCEPTION 'cross scope allowed'; EXCEPTION WHEN insufficient_privilege THEN NULL; END;
 RAISE EXCEPTION 'test rollback' USING ERRCODE='P6999';
 EXCEPTION WHEN SQLSTATE 'P6999' THEN NULL;END;
END $test$;
