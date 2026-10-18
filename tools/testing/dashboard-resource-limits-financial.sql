-- Isolated Neon branch only; fixture changes roll back.
DO $test$ DECLARE w uuid:='6d019df4-ec89-40fb-a261-069c663c5396';n bigint;phones bigint;a uuid;b uuid;ph uuid;ph2 uuid;p jsonb;ident text:=encode(sha256(gen_random_uuid()::text::bytea),'hex');BEGIN
 BEGIN
 PERFORM set_config('ekmivo.workspace_id',w::text,true);PERFORM set_config('ekmivo.environment','live',true);
 SELECT count(*) INTO n FROM pg06_account_configuration WHERE workspace_id=w AND environment='live' AND disabled_at IS NULL;
 SELECT (SELECT count(*) FROM pg06_phones WHERE workspace_id=w AND environment='live' AND revoked_at IS NULL AND (claimed_at IS NOT NULL OR pair_expires_at>now()))+(SELECT count(*) FROM pg06_devices WHERE workspace_id=w AND environment='live' AND revoked_at IS NULL AND physical_phone_id IS NULL AND (claimed_at IS NOT NULL OR pair_expires_at>now())) INTO phones;
 p:=jsonb_build_object('workspace_id',w,'fetched_at',now(),'active',true,'access_until',now()+interval '1 day','terms',jsonb_build_object('limits',jsonb_build_object('payment_methods',n+1,'devices',phones+1)));
 PERFORM set_config('ekmivo.payment_plan',p::text,true);
 a:=(pg06_account_add(w,'live','bkash',ident,'1234',decode(repeat('11',40),'hex'),true)->>'id')::uuid;
 BEGIN PERFORM pg06_account_add(w,'live','nagad',ident,'1234',decode(repeat('11',40),'hex'),true);RAISE EXCEPTION 'account limit bypass';EXCEPTION WHEN SQLSTATE 'P6806' THEN NULL;END;
 PERFORM pg09_action(w,'live','gateways',a,'disable','{}',NULL);
 b:=(pg06_account_add(w,'live','nagad',ident,'1234',decode(repeat('11',40),'hex'),true)->>'id')::uuid;
 BEGIN PERFORM pg09_action(w,'live','gateways',a,'enable','{}',NULL);RAISE EXCEPTION 'reenable limit bypass';EXCEPTION WHEN SQLSTATE 'P6806' THEN NULL;END;
 ph:=(pg06_phone_begin(w,'live','Quota first',encode(sha256(gen_random_uuid()::text::bytea),'hex'))->>'id')::uuid;
 BEGIN PERFORM pg06_phone_begin(w,'live','Quota second',encode(sha256(gen_random_uuid()::text::bytea),'hex'));RAISE EXCEPTION 'phone limit bypass';EXCEPTION WHEN SQLSTATE 'P6806' THEN NULL;END;
 UPDATE pg06_phones SET revoked_at=now() WHERE id=ph;
 ph2:=(pg06_phone_begin(w,'live','Quota second',encode(sha256(gen_random_uuid()::text::bytea),'hex'))->>'id')::uuid;
 BEGIN PERFORM pg06_phone_reconnect(w,'live',ph,encode(sha256(gen_random_uuid()::text::bytea),'hex'));RAISE EXCEPTION 'reconnect limit bypass';EXCEPTION WHEN SQLSTATE 'P6806' THEN NULL;END;
 PERFORM pg06_phone_delete(w,'live',ph2);
 PERFORM pg06_phone_reconnect(w,'live',ph,encode(sha256(gen_random_uuid()::text::bytea),'hex'));
 p:=jsonb_set(p,'{active}','false');p:=jsonb_set(p,'{terms,limits,payment_methods}','null');PERFORM set_config('ekmivo.payment_plan',p::text,true);
 BEGIN PERFORM pg06_account_add(w,'live','rocket',ident,'1234',decode(repeat('11',40),'hex'),true);RAISE EXCEPTION 'inactive unlimited bypass';EXCEPTION WHEN SQLSTATE 'P6802' THEN NULL;END;
 PERFORM pg06_account_delete(w,'live',b);
 RAISE EXCEPTION 'rollback fixture' USING ERRCODE='P6999';EXCEPTION WHEN SQLSTATE 'P6999' THEN NULL;END;
END $test$;
