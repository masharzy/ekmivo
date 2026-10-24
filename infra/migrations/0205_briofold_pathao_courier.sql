-- CONTROL only. Provider booking never verifies merchant money or COD receipt.
BEGIN;
DO $$BEGIN IF to_regclass('public.commerce_deliveries') IS NULL OR to_regclass('public.financial_realm') IS NOT NULL THEN RAISE EXCEPTION '0205 requires CONTROL commerce schema';END IF;END $$;
ALTER TABLE commerce_integrations DROP CONSTRAINT commerce_integrations_provider_check;
ALTER TABLE commerce_integrations ADD CONSTRAINT commerce_integrations_provider_check CHECK(provider IN ('steadfast','woocommerce','pathao'));
ALTER TABLE commerce_deliveries ADD COLUMN provider_request jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(provider_request)='object' AND pg_column_size(provider_request)<=10000);

CREATE FUNCTION commerce_pathao_credentials(w uuid,e text,a uuid,c bytea DEFAULT NULL,on_value boolean DEFAULT true) RETURNS bytea
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE role_name text;result bytea;
BEGIN
 role_name:=commerce_actor(w,a,true);
 IF e IS NULL OR e NOT IN ('live','sandbox') OR (c IS NOT NULL AND (role_name NOT IN ('owner','admin') OR pg13_capability_override(w,a,'workspace:settings') IS FALSE)) THEN RAISE EXCEPTION 'Courier settings denied' USING ERRCODE='42501';END IF;
 IF c IS NOT NULL THEN
  IF octet_length(c) NOT BETWEEN 28 AND 4096 OR on_value IS NULL THEN RAISE EXCEPTION 'Invalid encrypted credentials' USING ERRCODE='22023';END IF;
  INSERT INTO commerce_integrations(workspace_id,environment,provider,secret_cipher,enabled) VALUES(w,e,'pathao',c,on_value)
   ON CONFLICT(workspace_id,environment,provider) DO UPDATE SET secret_cipher=EXCLUDED.secret_cipher,enabled=EXCLUDED.enabled,updated_at=now();
  INSERT INTO commerce_events(workspace_id,environment,entity_id,actor_id,action) VALUES(w,e,w,a,'pathao-integration-saved');RETURN NULL;
 END IF;
 SELECT secret_cipher INTO result FROM commerce_integrations WHERE workspace_id=w AND environment=e AND provider='pathao' AND enabled;
 IF result IS NULL THEN RAISE EXCEPTION 'Courier not configured' USING ERRCODE='P0002';END IF;RETURN result;
END $$;

CREATE FUNCTION commerce_pathao_command(w uuid,e text,a uuid,k uuid,act text,b jsonb) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE d commerce_deliveries;o commerce_orders;old commerce_commands;fp text;res jsonb;cid uuid;v text;options jsonb;qty bigint;
BEGIN
 PERFORM commerce_actor(w,a,true);
 IF e<>'live' OR k IS NULL OR jsonb_typeof(b)<>'object' OR pg_column_size(b)>16000 OR act NOT IN ('read','start','finish','status') THEN RAISE EXCEPTION 'Invalid courier scope/action' USING ERRCODE='22023';END IF;
 cid:=(b->>'id')::uuid;
 IF cid IS NULL THEN RAISE EXCEPTION 'Shipment required' USING ERRCODE='22023';END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended(w::text||a::text||k::text,0));
 fp:=encode(digest('pathao:'||act||b::text,'sha256'),'hex');
 SELECT * INTO old FROM commerce_commands WHERE workspace_id=w AND actor_id=a AND operation_key=k;
 IF old.operation_key IS NOT NULL THEN
  IF old.fingerprint<>fp THEN RAISE EXCEPTION 'Operation key conflict' USING ERRCODE='23505';END IF;
  RETURN old.result||jsonb_build_object('replayed',true);
 END IF;
 SELECT * INTO d FROM commerce_deliveries WHERE id=cid AND workspace_id=w AND environment=e FOR UPDATE;
 IF d.id IS NULL OR d.provider<>'pathao' THEN RAISE EXCEPTION 'Shipment unavailable' USING ERRCODE='42501';END IF;
 SELECT * INTO o FROM commerce_orders WHERE id=d.order_id AND workspace_id=w AND environment=e FOR UPDATE;
 IF act IN ('start','finish') AND coalesce(b->>'revision','')!~'^[1-9][0-9]{0,17}$' THEN RAISE EXCEPTION 'Shipment revision required' USING ERRCODE='22023';END IF;
 IF act='start' THEN
  IF d.status<>'ready' OR o.status NOT IN ('confirmed','packed') OR (b->>'revision')::bigint<>d.revision THEN RAISE EXCEPTION 'Reconcile existing courier attempt or refresh shipment' USING ERRCODE='40001';END IF;
  options:=b->'options';
  IF jsonb_typeof(options)<>'object' OR options IS NULL OR options-ARRAY['store_id','recipient_city','recipient_zone','recipient_area','delivery_type','item_type','item_quantity','item_weight']<>'{}'::jsonb THEN RAISE EXCEPTION 'Pathao options required' USING ERRCODE='22023';END IF;
  FOREACH v IN ARRAY ARRAY['store_id','recipient_city','recipient_zone','item_quantity'] LOOP
   IF coalesce(options->>v,'')!~'^[1-9][0-9]{0,8}$' THEN RAISE EXCEPTION 'Invalid Pathao location/quantity' USING ERRCODE='22023';END IF;
  END LOOP;
  IF coalesce(options->>'recipient_area','0')!~'^[0-9]{1,9}$' OR coalesce(options->>'delivery_type','')<>'48' OR coalesce(options->>'item_type','') NOT IN ('1','2')
   OR coalesce(options->>'item_weight','')!~'^[0-9]{1,2}(\.[0-9]{1,3})?$' OR (options->>'item_weight')::numeric NOT BETWEEN 0.5 AND 10
   OR d.cod_minor%100<>0 OR d.cod_minor>greatest(o.total_minor-coalesce((SELECT sum(amount_minor) FROM commerce_finance_links WHERE order_id=o.id AND kind='payment'),0),0)
   OR coalesce(o.recipient->>'phone','')!~'^(\+?88)?01[3-9][0-9]{8}$' OR length(trim(coalesce(o.recipient->>'name',''))) NOT BETWEEN 3 AND 100 OR length(trim(coalesce(o.recipient->>'address',''))) NOT BETWEEN 10 AND 220
  THEN RAISE EXCEPTION 'Pathao needs valid recipient, whole-taka COD and parcel details' USING ERRCODE='22023';END IF;
  UPDATE commerce_deliveries SET status='booking',revision=revision+1,provider_request=options WHERE id=cid RETURNING * INTO d;
 ELSIF act='finish' THEN
  IF d.status<>'booking' OR (b->>'revision')::bigint<>d.revision OR b->>'status' NOT IN ('booked','unknown') OR coalesce(b->>'status','')='' THEN RAISE EXCEPTION 'Stale courier result' USING ERRCODE='40001';END IF;
  IF b->>'status'='booked' AND coalesce(b->>'consignment','')!~'^[A-Za-z0-9_-]{1,100}$' THEN RAISE EXCEPTION 'Invalid provider identity' USING ERRCODE='22023';END IF;
  UPDATE commerce_deliveries SET status=b->>'status',consignment=CASE WHEN b->>'status'='booked' THEN b->>'consignment' ELSE '' END,revision=revision+1 WHERE id=cid RETURNING * INTO d;
 ELSIF act='status' THEN
  IF d.consignment='' OR coalesce(b->>'provider_status','')='' OR length(b->>'provider_status')>80 OR b->>'consignment'<>d.consignment THEN RAISE EXCEPTION 'Invalid provider status source' USING ERRCODE='22023';END IF;
  UPDATE commerce_deliveries SET provider_status=b->>'provider_status',revision=revision+1 WHERE id=cid RETURNING * INTO d;
 END IF;
 res:=jsonb_build_object('id',cid,'order_id',o.id,'provider','pathao','status',d.status,'revision',d.revision,'consignment',d.consignment,'cod_minor',d.cod_minor,'recipient',o.recipient,'notes',o.notes,'replayed',false);
 IF act<>'read' THEN
  INSERT INTO commerce_events(workspace_id,environment,entity_id,actor_id,action,detail) VALUES(w,e,cid,a,'pathao-'||act,jsonb_build_object('status',d.status));
  INSERT INTO commerce_commands(workspace_id,actor_id,operation_key,fingerprint,result) VALUES(w,a,k,fp,res);
 END IF;
 RETURN res;
END $$;
REVOKE ALL ON FUNCTION commerce_pathao_credentials(uuid,text,uuid,bytea,boolean),commerce_pathao_command(uuid,text,uuid,uuid,text,jsonb) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION commerce_pathao_credentials(uuid,text,uuid,bytea,boolean),commerce_pathao_command(uuid,text,uuid,uuid,text,jsonb) TO ekmivo_financial_runtime,ekmivo_financial_projection;
COMMIT;
