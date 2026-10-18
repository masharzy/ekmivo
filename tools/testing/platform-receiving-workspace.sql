-- Isolated Neon branch only. All fixtures roll back within the exception block.
DO $test$ DECLARE a uuid:='30104ad2-6fca-4a2e-bf67-daef9f598d2f'; u uuid; w uuid:=gen_random_uuid();v uuid:=gen_random_uuid();i uuid;p text;BEGIN
 BEGIN
 SELECT id INTO u FROM app_users WHERE id NOT IN(SELECT user_id FROM platform_administrators WHERE role='super_admin') AND disabled_at IS NULL LIMIT 1;
 SELECT id INTO p FROM pg13_plans LIMIT 1;
 INSERT INTO workspaces(id,name,service_mode,created_by) VALUES(w,'System receiving fixture','commerce',a),(v,'Second system fixture','commerce',a);
 INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(w,a,'owner'),(v,a,'owner');
 INSERT INTO workspace_product_access(workspace_id,product,enabled) VALUES(w,'payments',true),(v,'payments',true) ON CONFLICT(workspace_id,product) DO UPDATE SET enabled=true;
 BEGIN PERFORM platform_billing_set(u,w,'testing denied normal actor');RAISE EXCEPTION 'regular actor allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 PERFORM platform_billing_set(a,w,'test system destination setting');
 IF platform_billing_workspace()<>w THEN RAISE EXCEPTION 'setting missing';END IF;
 BEGIN INSERT INTO workspace_members(workspace_id,user_id,role) VALUES(w,u,'admin');RAISE EXCEPTION 'normal member allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 BEGIN UPDATE platform_administrators SET role='admin' WHERE user_id=a;RAISE EXCEPTION 'role downgrade allowed';EXCEPTION WHEN insufficient_privilege THEN NULL;END;
 INSERT INTO pg13_platform_invoices(workspace_id,plan_id,amount_minor,period_days,grace_days,creation_key) VALUES(v,p,100,30,3,gen_random_uuid()::text) RETURNING id INTO i;
 IF platform_billing_invoice_receiver(v,i)<>w THEN RAISE EXCEPTION 'receiver not pinned';END IF;
 PERFORM platform_billing_set(a,v,'test change current destination');
 IF platform_billing_invoice_receiver(v,i)<>w THEN RAISE EXCEPTION 'old invoice receiver changed';END IF;
 IF NOT platform_billing_system_workspace(w) THEN RAISE EXCEPTION 'old unpaid receiver not protected';END IF;
 IF NOT EXISTS(SELECT 1 FROM platform_admin_audit WHERE actor_id=a AND description LIKE '%'||v::text||'%' AND action='billing.receiving_workspace_changed') THEN RAISE EXCEPTION 'audit missing';END IF;
 RAISE EXCEPTION 'rollback fixtures' USING ERRCODE='P6999';
 EXCEPTION WHEN SQLSTATE 'P6999' THEN NULL;END;
END $test$;
