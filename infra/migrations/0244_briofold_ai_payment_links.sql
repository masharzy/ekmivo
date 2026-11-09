BEGIN;
CREATE TABLE IF NOT EXISTS commerce_ai_payment_links(
 order_id uuid PRIMARY KEY REFERENCES commerce_orders(id),
 workspace_id uuid NOT NULL,
 thread_id uuid NOT NULL REFERENCES inbox_threads(id),
 intent_id uuid NOT NULL UNIQUE,
 amount_minor bigint NOT NULL CHECK(amount_minor>0),
 expires_at timestamptz NOT NULL,
 checked_at timestamptz NOT NULL DEFAULT '-infinity',
 state text NOT NULL DEFAULT 'pending' CHECK(state IN ('pending','paid','expired','late-review'))
);
CREATE INDEX IF NOT EXISTS commerce_ai_payment_links_due ON commerce_ai_payment_links(checked_at,order_id) WHERE state IN ('pending','expired');
REVOKE ALL ON commerce_ai_payment_links FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;

CREATE OR REPLACE FUNCTION briofold_ai_payment_link_prepare(job uuid,lease uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j briofold_ai_channel_jobs; o commerce_orders; l commerce_ai_payment_links;
BEGIN
 IF NOT briofold_channel_work_valid(job,lease) THEN RAISE EXCEPTION 'Invalid job lease' USING ERRCODE='42501';END IF;
 SELECT * INTO j FROM briofold_ai_channel_jobs WHERE id=job;
 IF NOT EXISTS(SELECT 1 FROM workspaces WHERE id=j.workspace_id AND service_mode='both')
  OR NOT EXISTS(SELECT 1 FROM workspace_product_access WHERE workspace_id=j.workspace_id AND product='payments' AND enabled)
  OR NOT EXISTS(SELECT 1 FROM commerce_ai_settings WHERE workspace_id=j.workspace_id AND environment='live' AND ai_selling_enabled)
  OR NOT EXISTS(SELECT 1 FROM inbox_threads t JOIN inbox_connections n ON n.id=t.connection_id
   WHERE t.id=j.thread_id AND n.environment='live') THEN
  RETURN jsonb_build_object('error','payment_link_unavailable');
 END IF;
 PERFORM 1 FROM inbox_threads WHERE id=j.thread_id FOR UPDATE;
 SELECT * INTO l FROM commerce_ai_payment_links WHERE thread_id=j.thread_id AND state='pending'
  AND expires_at>now() ORDER BY expires_at DESC LIMIT 1;
 IF FOUND THEN
  RETURN jsonb_build_object('order_id',l.order_id,'intent_id',l.intent_id,'amount_minor',l.amount_minor,'expires_at',l.expires_at);
 END IF;
 SELECT * INTO o FROM commerce_orders WHERE workspace_id=j.workspace_id AND environment='live'
  AND source='ai' AND source_id=j.thread_id AND status='draft' AND payment_state IN ('none','awaiting')
  AND draft_expires_at>now() AND total_minor>0 ORDER BY created_at DESC LIMIT 1 FOR UPDATE;
 IF NOT FOUND THEN RETURN jsonb_build_object('error','no_draft');END IF;
 IF coalesce(o.recipient->>'address','')='' THEN RETURN jsonb_build_object('error','address_required');END IF;
 IF EXISTS(SELECT 1 FROM commerce_finance_links WHERE order_id=o.id) THEN
  RETURN jsonb_build_object('error','payment_link_unavailable');
 END IF;
 RETURN jsonb_build_object('order_id',o.id,'amount_minor',o.total_minor,'expires_at',o.draft_expires_at);
END $$;

CREATE OR REPLACE FUNCTION briofold_ai_payment_link_bind(job uuid,lease uuid,oid uuid,intent uuid,amount bigint,expiry timestamptz)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE order_data jsonb; j briofold_ai_channel_jobs;
BEGIN
 order_data:=briofold_ai_payment_link_prepare(job,lease);
 IF order_data->>'order_id' IS DISTINCT FROM oid::text OR (order_data->>'amount_minor')::bigint IS DISTINCT FROM amount
  OR (order_data->>'expires_at')::timestamptz IS DISTINCT FROM expiry THEN
  RAISE EXCEPTION 'Order changed during checkout creation' USING ERRCODE='40001';
 END IF;
 IF order_data ? 'intent_id' THEN RETURN order_data->>'intent_id'=intent::text;END IF;
 SELECT * INTO j FROM briofold_ai_channel_jobs WHERE id=job;
 UPDATE commerce_orders SET status='hold',payment_state='none',updated_at=now() WHERE id=oid;
 INSERT INTO commerce_ai_payment_links(order_id,workspace_id,thread_id,intent_id,amount_minor,expires_at)
 VALUES(oid,j.workspace_id,j.thread_id,intent,amount,expiry);
 RETURN true;
END $$;

CREATE OR REPLACE FUNCTION briofold_ai_payment_link_guard()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF EXISTS(SELECT 1 FROM commerce_ai_payment_links WHERE order_id=OLD.id AND state='pending') THEN
  RAISE EXCEPTION 'Order has an open payment link' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS briofold_ai_payment_link_guard ON commerce_orders;
CREATE TRIGGER briofold_ai_payment_link_guard BEFORE UPDATE OF status,payment_state,total_minor,recipient,draft_expires_at
 ON commerce_orders FOR EACH ROW EXECUTE FUNCTION briofold_ai_payment_link_guard();

CREATE OR REPLACE FUNCTION briofold_ai_payment_link_active(w uuid,t uuid,oid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM commerce_ai_payment_links l JOIN workspaces s ON s.id=l.workspace_id AND s.service_mode='both'
 JOIN workspace_product_access p ON p.workspace_id=l.workspace_id AND p.product='payments' AND p.enabled
 WHERE l.workspace_id=w AND l.thread_id=t AND l.order_id=oid AND l.state='pending' AND l.expires_at>now())
$$;

CREATE OR REPLACE FUNCTION briofold_ai_payment_links_due()
RETURNS TABLE(order_id uuid,workspace_id uuid,intent_id uuid,amount_minor bigint)
LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 UPDATE commerce_ai_payment_links l SET checked_at=now()
 WHERE l.order_id IN (SELECT x.order_id FROM commerce_ai_payment_links x
  WHERE (x.state='pending' OR (x.state='expired' AND x.expires_at>now()-interval '7 days'))
   AND x.checked_at<=now()-interval '50 seconds'
  ORDER BY x.checked_at,x.order_id LIMIT 100 FOR UPDATE SKIP LOCKED)
 RETURNING l.order_id,l.workspace_id,l.intent_id,l.amount_minor
$$;

CREATE OR REPLACE FUNCTION briofold_ai_payment_link_resolve(oid uuid,intent uuid,outcome text)
RETURNS boolean LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE l commerce_ai_payment_links;
BEGIN
 PERFORM 1 FROM commerce_orders WHERE id=oid FOR UPDATE;
 SELECT * INTO l FROM commerce_ai_payment_links WHERE order_id=oid AND intent_id=intent FOR UPDATE;
 IF NOT FOUND OR l.state IN ('paid','late-review') THEN RETURN false;END IF;
 IF outcome='completed' AND l.state='pending' THEN
  UPDATE commerce_ai_payment_links SET state='paid' WHERE order_id=oid;
  UPDATE commerce_orders SET status='confirmed',payment_state='verified',draft_expires_at=NULL,updated_at=now() WHERE id=oid;
  UPDATE commerce_coupon_claims SET status='redeemed' WHERE order_id=oid AND status='reserved';
 ELSIF outcome='completed' AND l.state='expired' THEN
  UPDATE commerce_ai_payment_links SET state='late-review' WHERE order_id=oid;
  PERFORM briofold_ai_notice_add(oid,'review');
 ELSIF outcome IN ('expired','cancelled') AND l.state='pending' AND l.expires_at+interval '15 minutes'<=now() THEN
  UPDATE commerce_ai_payment_links SET state='expired' WHERE order_id=oid;
  PERFORM briofold_ai_release(oid,'ai_payment_link_expired');
  UPDATE commerce_coupon_claims SET status='released' WHERE order_id=oid AND status='reserved';
  UPDATE commerce_orders SET status='cancelled',payment_state='none',draft_expires_at=NULL,updated_at=now() WHERE id=oid;
 ELSE RETURN false;
 END IF;
 RETURN true;
END $$;

CREATE OR REPLACE FUNCTION briofold_ai_channel_finish_link(job uuid,lease uuid,body text,oid uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE j briofold_ai_channel_jobs; result jsonb;
BEGIN
 SELECT * INTO j FROM briofold_ai_channel_jobs WHERE id=job;
 IF NOT briofold_ai_payment_link_active(j.workspace_id,j.thread_id,oid) THEN
  RAISE EXCEPTION 'Checkout link unavailable' USING ERRCODE='42501';
 END IF;
 result:=briofold_ai_channel_finish(job,lease,body,'');
 IF coalesce((result->>'queued')::boolean,false) THEN
  UPDATE inbox_messages SET content=content||jsonb_build_object('ai_checkout_order',oid)
  WHERE id=(result->>'id')::uuid AND sender='ai' AND state='queued' AND NOT (content ? 'ai_checkout_order');
 END IF;
 RETURN result;
END $$;

CREATE OR REPLACE FUNCTION briofold_ai_website_checkout_orders(sid uuid,o text,secret text,sequences bigint[])
RETURNS jsonb LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_object_agg(m.sequence,m.content->>'ai_checkout_order'),'{}')
 FROM briofold_ai_website_button_scope(sid,o,secret) scope
 JOIN inbox_messages m ON m.thread_id=scope.thread_id AND m.workspace_id=scope.workspace_id
 WHERE cardinality(sequences)<=50 AND m.sequence=ANY(sequences) AND m.sender='ai'
  AND m.state IN ('sent','delivered','seen') AND m.content ? 'ai_checkout_order'
$$;

REVOKE ALL ON FUNCTION briofold_ai_channel_finish_link(uuid,uuid,text,uuid),briofold_ai_website_checkout_orders(uuid,text,text,bigint[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION briofold_ai_channel_finish_link(uuid,uuid,text,uuid),briofold_ai_website_checkout_orders(uuid,text,text,bigint[]) TO ekmivo_financial_runtime,ekmivo_financial_projection;

REVOKE ALL ON FUNCTION briofold_ai_payment_link_prepare(uuid,uuid),briofold_ai_payment_link_bind(uuid,uuid,uuid,uuid,bigint,timestamptz),briofold_ai_payment_link_guard(),briofold_ai_payment_link_active(uuid,uuid,uuid),briofold_ai_payment_links_due(),briofold_ai_payment_link_resolve(uuid,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION briofold_ai_payment_link_prepare(uuid,uuid),briofold_ai_payment_link_bind(uuid,uuid,uuid,uuid,bigint,timestamptz),briofold_ai_payment_link_guard(),briofold_ai_payment_link_active(uuid,uuid,uuid),briofold_ai_payment_links_due(),briofold_ai_payment_link_resolve(uuid,uuid,text) TO ekmivo_financial_runtime,ekmivo_financial_projection;
COMMIT;
