-- Customers learn about their orders.
--
-- Rules this migration keeps:
--   * An AI order never verifies money. The sender number and TrxID are stored as
--     "claimed_payment", exactly as the customer said them, and are always shown as unverified.
--   * No customers are merged here. A chat order attaches to the customer that already owns the chat.
--   * Contact details (payer number) are returned only to owners and admins, like the rest of the CRM.

ALTER TABLE inbox_orders
 ADD COLUMN payment_method text NOT NULL DEFAULT '' CHECK(length(payment_method)<=40),
 ADD COLUMN payer_phone text NOT NULL DEFAULT '' CHECK(length(payer_phone)<=20),
 ADD COLUMN trx_id text NOT NULL DEFAULT '' CHECK(length(trx_id)<=60);

ALTER TABLE commerce_orders
 ADD COLUMN claimed_payment jsonb NOT NULL DEFAULT '{}' CHECK(jsonb_typeof(claimed_payment)='object' AND pg_column_size(claimed_payment)<=1000);

-- The chat order trigger now keeps the customer link and the customer's own payment words.
CREATE OR REPLACE FUNCTION commerce_capture_inbox_order() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE env text;cust uuid;claim jsonb;BEGIN
 SELECT x.environment INTO env FROM inbox_threads t JOIN inbox_connections x ON x.id=t.connection_id WHERE t.id=NEW.thread_id AND t.workspace_id=NEW.workspace_id;
 IF env IS NULL OR NEW.amount_minor>100000000000 THEN RETURN NEW;END IF;
 SELECT coalesce(c.merged_into,c.id) INTO cust FROM briofold_customer_sources s JOIN briofold_customers c ON c.id=s.customer_id
  WHERE s.workspace_id=NEW.workspace_id AND s.environment=env AND s.kind='thread' AND s.source_id=NEW.thread_id LIMIT 1;
 claim:=jsonb_strip_nulls(jsonb_build_object('method',nullif(NEW.payment_method,''),'payer_phone',nullif(NEW.payer_phone,''),'trx_id',nullif(NEW.trx_id,'')));
 INSERT INTO commerce_orders(id,workspace_id,environment,reference,review_required,legacy_summary,source,source_id,customer_id,recipient,subtotal_minor,total_minor,claimed_payment,created_at)
  VALUES(NEW.id,NEW.workspace_id,env,'INBOX-'||NEW.id::text,true,NEW.reference||E'\n'||NEW.items,'ai',NEW.id,cust,'{}',NEW.amount_minor,NEW.amount_minor,claim,NEW.created_at)
  ON CONFLICT(id) DO UPDATE SET legacy_summary=EXCLUDED.legacy_summary,customer_id=coalesce(commerce_orders.customer_id,EXCLUDED.customer_id),claimed_payment=EXCLUDED.claimed_payment,revision=commerce_orders.revision+1,updated_at=now()
  WHERE commerce_orders.workspace_id=NEW.workspace_id AND commerce_orders.review_required;
 INSERT INTO commerce_events(workspace_id,environment,entity_id,actor_id,action,detail) VALUES(NEW.workspace_id,env,NEW.id,NULL,'legacy-order-observed',jsonb_build_object('source_order_id',NEW.id,'source_status',NEW.status));RETURN NEW;
END $$;

-- One-time backfill: chat orders that were captured without a customer.
UPDATE commerce_orders o SET customer_id=sub.cid
 FROM (SELECT o2.id,coalesce(c.merged_into,c.id) AS cid FROM commerce_orders o2
        JOIN inbox_orders io ON io.id=o2.source_id
        JOIN briofold_customer_sources s ON s.workspace_id=o2.workspace_id AND s.environment=o2.environment AND s.kind='thread' AND s.source_id=io.thread_id
        JOIN briofold_customers c ON c.id=s.customer_id
       WHERE o2.source='ai' AND o2.customer_id IS NULL) sub
 WHERE o.id=sub.id AND o.customer_id IS NULL;

-- The agent (or a person) records what the customer said about payment. Nothing here confirms money.
CREATE FUNCTION inbox_order_payment_claim(w uuid,t uuid,order_id uuid,method text,phone text,trx text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN
 IF length(coalesce(method,''))>40 OR length(coalesce(phone,''))>20 OR length(coalesce(trx,''))>60 THEN RAISE EXCEPTION 'invalid payment claim' USING ERRCODE='22023';END IF;
 UPDATE inbox_orders SET payment_method=coalesce(method,''),payer_phone=regexp_replace(coalesce(phone,''),'[^0-9+]','','g'),trx_id=upper(btrim(coalesce(trx,''))),updated_at=now()
  WHERE id=order_id AND workspace_id=w AND thread_id=t;
 IF NOT FOUND THEN RAISE EXCEPTION 'order unavailable' USING ERRCODE='42501';END IF;
 RETURN jsonb_build_object('saved',true,'verified',false);
END $$;

-- Table columns: order count, total and last order for a page of customers.
CREATE FUNCTION briofold_customer_stats(w uuid,e text,a uuid,ids uuid[]) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$BEGIN
 PERFORM briofold_customer_actor(w,a,'read');
 IF e NOT IN ('live','sandbox') OR cardinality(ids)>100 THEN RAISE EXCEPTION 'Invalid customer filter' USING ERRCODE='22023';END IF;
 RETURN coalesce((SELECT jsonb_object_agg(x.cid::text,jsonb_build_object('orders',x.n,'total_minor',x.total,'last_at',x.last_at))
  FROM (SELECT o.customer_id AS cid,count(*) AS n,coalesce(sum(o.total_minor) FILTER (WHERE o.status NOT IN ('draft','cancelled','returned')),0) AS total,max(o.created_at) AS last_at
         FROM commerce_orders o WHERE o.workspace_id=w AND o.environment=e AND o.customer_id=ANY(ids) GROUP BY o.customer_id) x),'{}'::jsonb);
END $$;

-- Customer drawer: every order, what the customer claimed about payment, and the numbers they used.
CREATE FUNCTION briofold_customer_orders(w uuid,e text,a uuid,c uuid) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$DECLARE role_name text;pii boolean;BEGIN
 role_name:=briofold_customer_actor(w,a,'read');pii:=role_name IN ('owner','admin');
 IF e NOT IN ('live','sandbox') THEN RAISE EXCEPTION 'Invalid customer filter' USING ERRCODE='22023';END IF;
 RETURN jsonb_build_object(
  'orders',coalesce((SELECT jsonb_agg(jsonb_build_object('id',o.id,'reference',o.reference,'status',o.status,'source',o.source,'total_minor',o.total_minor,'created_at',o.created_at,
      'summary',left(o.legacy_summary,300),
      'claimed_payment',CASE WHEN pii THEN o.claimed_payment ELSE o.claimed_payment-'payer_phone' END,
      'paid_verified',EXISTS(SELECT 1 FROM commerce_finance_links f WHERE f.workspace_id=o.workspace_id AND f.environment=o.environment AND f.order_id=o.id AND f.kind='payment')) ORDER BY o.created_at DESC)
    FROM (SELECT * FROM commerce_orders WHERE workspace_id=w AND environment=e AND customer_id=c ORDER BY created_at DESC LIMIT 100) o),'[]'::jsonb),
  'numbers',CASE WHEN pii THEN coalesce((SELECT jsonb_agg(jsonb_build_object('value',z.p,'count',z.n) ORDER BY z.n DESC)
    FROM (SELECT claimed_payment->>'payer_phone' AS p,count(*) AS n FROM commerce_orders WHERE workspace_id=w AND environment=e AND customer_id=c AND claimed_payment ? 'payer_phone' GROUP BY 1) z),'[]'::jsonb) ELSE '[]'::jsonb END);
END $$;

REVOKE ALL ON FUNCTION inbox_order_payment_claim(uuid,uuid,uuid,text,text,text),briofold_customer_stats(uuid,text,uuid,uuid[]),briofold_customer_orders(uuid,text,uuid,uuid) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION inbox_order_payment_claim(uuid,uuid,uuid,text,text,text),briofold_customer_stats(uuid,text,uuid,uuid[]),briofold_customer_orders(uuid,text,uuid,uuid) TO ekmivo_financial_runtime,ekmivo_financial_projection;
