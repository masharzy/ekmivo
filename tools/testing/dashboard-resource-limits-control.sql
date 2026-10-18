-- Isolated Neon branch only; fixture changes roll back.
DO $test$ DECLARE w uuid:=gen_random_uuid();a uuid:='30104ad2-6fca-4a2e-bf67-daef9f598d2f';u uuid;u2 uuid;mail text;pid text:='quota-'||substr(replace(gen_random_uuid()::text,'-',''),1,12);v uuid;t jsonb;i uuid;i2 uuid;k uuid;cap text:=encode(sha256(gen_random_uuid()::text::bytea),'hex');BEGIN
 BEGIN
 SELECT id,email INTO u,mail FROM app_users WHERE id<>a AND email_verified_at IS NOT NULL AND disabled_at IS NULL LIMIT 1;
 SELECT id INTO u2 FROM app_users WHERE id<>a AND id<>u AND disabled_at IS NULL LIMIT 1;
 SELECT terms INTO t FROM payment_plan_versions LIMIT 1;
 IF u IS NULL OR u2 IS NULL OR t IS NULL THEN RAISE EXCEPTION 'fixtures unavailable';END IF;
 t:=jsonb_set(t,'{limits}','{"api_keys":1,"team_members":2,"devices":1,"payment_methods":1}');
 INSERT INTO workspaces(id,name,service_mode,created_by) VALUES(w,'Resource quota fixture','commerce',a);
 INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(w,a,'owner');
 INSERT INTO workspace_product_access(workspace_id,product,enabled) VALUES(w,'payments',true) ON CONFLICT(workspace_id,product) DO UPDATE SET enabled=true;
 INSERT INTO pg13_plans(id,name,amount_minor) VALUES(pid,'Quota fixture',100);
 INSERT INTO payment_plan_versions(plan_id,version,terms,created_by) VALUES(pid,1,t,a) RETURNING id INTO v;
 INSERT INTO pg13_subscriptions(workspace_id,plan_id,plan_version_id,paid_until,grace_until) VALUES(w,pid,v,now()+interval '30 days',now()+interval '31 days');
 INSERT INTO pg13_invites(workspace_id,email,role,token_digest,created_by) VALUES(w,mail,'viewer',cap,a) RETURNING id INTO i;
 BEGIN INSERT INTO pg13_invites(workspace_id,email,role,token_digest,created_by) VALUES(w,'other-fixture@example.invalid','viewer',encode(sha256(gen_random_uuid()::text::bytea),'hex'),a);RAISE EXCEPTION 'invite quota bypass';EXCEPTION WHEN SQLSTATE 'P6806' THEN NULL;END;
 UPDATE pg13_invites SET expires_at=now()-interval '1 minute' WHERE id=i;
 INSERT INTO pg13_invites(workspace_id,email,role,token_digest,created_by) VALUES(w,'resend-fixture@example.invalid','viewer',encode(sha256(gen_random_uuid()::text::bytea),'hex'),a) RETURNING id INTO i2;
 BEGIN UPDATE pg13_invites SET expires_at=now()+interval '1 day' WHERE id=i;RAISE EXCEPTION 'resend invite quota bypass';EXCEPTION WHEN SQLSTATE 'P6806' THEN NULL;END;
 UPDATE pg13_invites SET revoked_at=now() WHERE id=i2;
 UPDATE pg13_invites SET expires_at=now()+interval '1 day' WHERE id=i;
 PERFORM pg13_invite_accept(u,cap);
 IF (payment_plan_member_resource_usage(a,w)->>'team_members')::int<>2 OR (payment_plan_member_resource_usage(a,w)->>'pending_invites')::int<>0 THEN RAISE EXCEPTION 'reservation conversion failed';END IF;
 BEGIN INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(w,u2,'viewer');RAISE EXCEPTION 'member quota bypass';EXCEPTION WHEN SQLSTATE 'P6806' THEN NULL;END;
 INSERT INTO merchant_api_keys(workspace_id,environment,public_id,secret_digest,name,scopes,created_by,expires_at) VALUES(w,'live',substr(cap,1,16),cap,'Quota first',ARRAY['payments:read'],a,now()+interval '1 day') RETURNING id INTO k;
 BEGIN INSERT INTO merchant_api_keys(workspace_id,environment,public_id,secret_digest,name,scopes,created_by,expires_at) VALUES(w,'live',substr(encode(sha256(gen_random_uuid()::text::bytea),'hex'),1,16),cap,'Quota second',ARRAY['payments:read'],a,now()+interval '1 day');RAISE EXCEPTION 'key quota bypass';EXCEPTION WHEN SQLSTATE 'P6806' THEN NULL;END;
 UPDATE pg13_subscriptions SET paid_until=now()-interval '2 days',grace_until=now()-interval '1 day' WHERE workspace_id=w;
 UPDATE merchant_api_keys SET revoked_at=now() WHERE id=k;
 PERFORM set_config('ekmivo.key_rotation_id',k::text,true);
 INSERT INTO merchant_api_keys(workspace_id,environment,public_id,secret_digest,name,scopes,created_by,expires_at) VALUES(w,'live',substr(encode(sha256(gen_random_uuid()::text::bytea),'hex'),1,16),cap,'Rotated',ARRAY['payments:read'],a,now()+interval '1 day');
 PERFORM set_config('ekmivo.key_rotation_id','',true);
 BEGIN INSERT INTO merchant_api_keys(workspace_id,environment,public_id,secret_digest,name,scopes,created_by,expires_at) VALUES(w,'live',substr(encode(sha256(gen_random_uuid()::text::bytea),'hex'),1,16),cap,'Expired plan',ARRAY['payments:read'],a,now()+interval '1 day');RAISE EXCEPTION 'expired plan bypass';EXCEPTION WHEN SQLSTATE 'P6802' THEN NULL;END;
 BEGIN PERFORM payment_plan_member_resource_usage(u2,w);RAISE EXCEPTION 'cross tenant aggregate bypass';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 RAISE EXCEPTION 'rollback fixture' USING ERRCODE='P6999';EXCEPTION WHEN SQLSTATE 'P6999' THEN NULL;END;
END $test$;
