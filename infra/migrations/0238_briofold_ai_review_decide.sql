-- Owner tools for AI selling: a revision-checked settings write and a manual decision for payments in the review queue.
-- Both are owner/admin only (briofold_customer_actor 'contact'). A decision never touches an order that has already
-- moved on (expired, released, cancelled): the owner sees 409 and the order history stays honest.
BEGIN;

-- AI selling: an order above this total is handed to a person (0 = never).
ALTER TABLE commerce_ai_settings ADD COLUMN IF NOT EXISTS handover_above_minor bigint NOT NULL DEFAULT 0;
DO $$BEGIN IF NOT EXISTS(SELECT 1 FROM pg_constraint WHERE conname='commerce_ai_settings_handover_above') THEN
 ALTER TABLE commerce_ai_settings ADD CONSTRAINT commerce_ai_settings_handover_above CHECK(handover_above_minor BETWEEN 0 AND 1000000000);END IF;END $$;

CREATE OR REPLACE FUNCTION briofold_ai_order_limit(w uuid,e text,tool text,res jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE lim bigint;BEGIN
 IF tool<>'upsert_order_draft' OR NOT jsonb_exists(res,'total_minor') THEN RETURN res;END IF;
 SELECT handover_above_minor INTO lim FROM commerce_ai_settings WHERE workspace_id=w AND environment=e;
 IF coalesce(lim,0)>0 AND (res->>'total_minor')::bigint>lim THEN
  RETURN res||jsonb_build_object('handover',true,'note','this order is above the shop limit for AI orders; tell the customer a person from the shop will finish it');
 END IF;
 RETURN res;
END $$;
DO $$DECLARE d text;BEGIN
 SELECT pg_get_functiondef('briofold_ai_tool(uuid,uuid,integer,text,jsonb,jsonb)'::regprocedure) INTO d;
 IF position('briofold_ai_order_limit' IN d)>0 THEN RETURN;END IF;
 IF position('res:=briofold_ai_order_tool(j.workspace_id,env,t.id,j.actor_id,tool_name,args);' IN d)=0 THEN RAISE EXCEPTION 'Unexpected AI tool definition';END IF;
 EXECUTE replace(d,'res:=briofold_ai_order_tool(j.workspace_id,env,t.id,j.actor_id,tool_name,args);',
  'res:=briofold_ai_order_limit(j.workspace_id,env,tool_name,briofold_ai_order_tool(j.workspace_id,env,t.id,j.actor_id,tool_name,args));');
END $$;

-- The buyer hears about a verified payment once (keyed by the order), only inside the channel's 24 hour window.
CREATE OR REPLACE FUNCTION briofold_ai_customer_paid(oid uuid) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE o commerce_orders%ROWTYPE;t inbox_threads%ROWTYPE;BEGIN
 SELECT * INTO o FROM commerce_orders WHERE id=oid;
 IF NOT FOUND OR o.source<>'ai' OR o.source_id IS NULL THEN RETURN;END IF;
 SELECT * INTO t FROM inbox_threads WHERE id=o.source_id AND workspace_id=o.workspace_id;
 IF NOT FOUND OR t.last_customer_at<=now()-interval '23 hours' THEN RETURN;END IF;
 INSERT INTO inbox_messages(workspace_id,thread_id,sender,body,state,idempotency_key)
  VALUES(o.workspace_id,t.id,'seller','আপনার পেমেন্ট যাচাই হয়েছে, অর্ডার '||o.reference||' কনফার্ম হয়েছে। ধন্যবাদ! / Payment verified, order '||o.reference||' is confirmed. Thank you!','queued',oid)
  ON CONFLICT DO NOTHING;
END $$;
CREATE OR REPLACE FUNCTION briofold_ai_notice_order() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NEW.source='ai' AND NEW.payment_state IS DISTINCT FROM OLD.payment_state AND NEW.payment_state IN('verified','cod') THEN
  PERFORM briofold_ai_notice_add(NEW.id,CASE NEW.payment_state WHEN 'verified' THEN 'paid' ELSE 'cod' END);
  IF NEW.payment_state='verified' THEN PERFORM briofold_ai_customer_paid(NEW.id);END IF;
 END IF;
 RETURN NEW;
END $$;

CREATE OR REPLACE FUNCTION briofold_ai_selling_save(w uuid,e text,a uuid,rev bigint,patch jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE cur bigint;BEGIN
 PERFORM briofold_customer_actor(w,a,'contact');
 IF e NOT IN('live','sandbox') OR rev IS NULL OR rev<0 THEN RAISE EXCEPTION 'Invalid settings' USING ERRCODE='22023';END IF;
 INSERT INTO commerce_ai_settings(workspace_id,environment) VALUES(w,e) ON CONFLICT DO NOTHING;
 SELECT revision INTO cur FROM commerce_ai_settings WHERE workspace_id=w AND environment=e FOR UPDATE;
 -- rev 0 = the caller saw no row yet; a fresh row starts at revision 1.
 IF cur<>rev AND NOT(rev=0 AND cur=1) THEN RAISE EXCEPTION 'Settings changed' USING ERRCODE='40001';END IF;
 INSERT INTO commerce_events(workspace_id,environment,entity_id,actor_id,action,detail)
  VALUES(w,e,w,a,'ai-selling-settings',jsonb_build_object('fields',(SELECT coalesce(jsonb_agg(k ORDER BY k),'[]') FROM jsonb_object_keys(patch) k)));
 IF jsonb_exists(patch,'handover_above_minor') THEN
  UPDATE commerce_ai_settings SET handover_above_minor=(patch->>'handover_above_minor')::bigint WHERE workspace_id=w AND environment=e;END IF;
 RETURN briofold_ai_selling_write(w,e,a,patch-'handover_above_minor');
END $$;

CREATE OR REPLACE FUNCTION briofold_ai_review_decide(w uuid,e text,a uuid,cid uuid,decision text) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE c commerce_payment_claims%ROWTYPE;o commerce_orders%ROWTYPE;BEGIN
 PERFORM briofold_customer_actor(w,a,'contact');
 IF e NOT IN('live','sandbox') OR decision NOT IN('approve','reject') THEN RAISE EXCEPTION 'Invalid decision' USING ERRCODE='22023';END IF;
 SELECT * INTO c FROM commerce_payment_claims WHERE id=cid AND workspace_id=w AND environment=e FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'Claim not found' USING ERRCODE='P0002';END IF;
 IF c.state<>'review' THEN RAISE EXCEPTION 'Claim already decided' USING ERRCODE='40001';END IF;
 SELECT * INTO o FROM commerce_orders WHERE id=c.order_id FOR UPDATE;
 IF decision='approve' THEN
  -- An expired or released order no longer holds stock; approving it would confirm an order that cannot ship.
  IF o.status NOT IN('draft','hold') OR o.payment_state<>'claimed' THEN RAISE EXCEPTION 'order changed' USING ERRCODE='23514';END IF;
  UPDATE commerce_payment_claims SET state='verified',reason='owner_approved',resolved_at=now() WHERE id=cid;
  UPDATE commerce_orders SET payment_state='verified',status='confirmed',draft_expires_at=NULL,updated_at=now() WHERE id=o.id;
  UPDATE commerce_coupon_claims SET status='redeemed' WHERE order_id=o.id AND status='reserved';
 ELSE
  UPDATE commerce_payment_claims SET state='failed',reason='owner_rejected',resolved_at=now() WHERE id=cid;
  UPDATE commerce_orders SET payment_state='awaiting',updated_at=now() WHERE id=o.id AND payment_state='claimed' AND status IN('draft','hold');
 END IF;
 INSERT INTO commerce_events(workspace_id,environment,entity_id,actor_id,action,detail)
  VALUES(w,e,o.id,a,'ai-payment-review',jsonb_build_object('order_id',o.id,'claim_id',cid,'decision',decision));
 RETURN briofold_ai_review_queue(w,e,a);
END $$;

REVOKE ALL ON FUNCTION briofold_ai_order_limit(uuid,text,text,jsonb),briofold_ai_customer_paid(uuid) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
REVOKE ALL ON FUNCTION briofold_ai_selling_save(uuid,text,uuid,bigint,jsonb),briofold_ai_review_decide(uuid,text,uuid,uuid,text) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION briofold_ai_selling_save(uuid,text,uuid,bigint,jsonb),briofold_ai_review_decide(uuid,text,uuid,uuid,text) TO ekmivo_financial_runtime,ekmivo_financial_projection;
COMMIT;
