-- AI Commerce Phase 1 (part 3): WooCommerce product webhooks that apply once.
--
-- The webhook receipt (0206) records each signed notice once and reports a repeat as "replayed". Notices are
-- immutable audit rows (an UPDATE trigger refuses changes), so whether a notice has been APPLIED to the catalog
-- lives in its own table. A notice is claimed with a short lease, applied after the server re-reads the product
-- from the store, then finished. A repeated or concurrent delivery cannot apply it twice; a failed apply can be
-- retried (at most 20 times) when the store redelivers.
CREATE TABLE IF NOT EXISTS commerce_woo_event_applies(
 event_id uuid PRIMARY KEY REFERENCES commerce_woo_hook_events(id),
 applied_at timestamptz,apply_lease timestamptz,
 apply_attempts integer NOT NULL DEFAULT 0 CHECK(apply_attempts BETWEEN 0 AND 20),
 apply_error text CHECK(apply_error IS NULL OR length(apply_error)<=300));
ALTER TABLE commerce_woo_event_applies ENABLE ROW LEVEL SECURITY;
ALTER TABLE commerce_woo_event_applies FORCE ROW LEVEL SECURITY;
DO $$BEGIN IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE tablename='commerce_woo_event_applies' AND policyname='commerce_woo_event_applies_owner') THEN EXECUTE format('CREATE POLICY commerce_woo_event_applies_owner ON commerce_woo_event_applies TO %I USING(true) WITH CHECK(true)',current_user);END IF;END $$;
REVOKE ALL ON commerce_woo_event_applies FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
CREATE OR REPLACE FUNCTION commerce_woo_event_claim(eid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ev commerce_woo_hook_events;src commerce_woo_hook_sources;ap commerce_woo_event_applies;
BEGIN
 SELECT * INTO ev FROM commerce_woo_hook_events WHERE id=eid;
 IF ev.id IS NULL THEN RAISE EXCEPTION 'Notice unavailable' USING ERRCODE='42501';END IF;
 SELECT * INTO src FROM commerce_woo_hook_sources WHERE id=ev.source_id AND enabled;
 IF src.id IS NULL THEN RAISE EXCEPTION 'Source unavailable' USING ERRCODE='42501';END IF;
 INSERT INTO commerce_woo_event_applies(event_id) VALUES(eid) ON CONFLICT DO NOTHING;
 SELECT * INTO ap FROM commerce_woo_event_applies WHERE event_id=eid FOR UPDATE;
 IF ap.applied_at IS NOT NULL OR ap.apply_attempts>=20 OR (ap.apply_lease IS NOT NULL AND ap.apply_lease>now()) THEN RETURN jsonb_build_object('claimed',false);END IF;
 UPDATE commerce_woo_event_applies SET apply_lease=now()+interval '2 minutes',apply_attempts=apply_attempts+1 WHERE event_id=eid;
 RETURN jsonb_build_object('claimed',true,'product_id',ev.product_id,'workspace_id',ev.workspace_id,'environment',ev.environment,'actor_id',src.created_by);
END $$;
CREATE OR REPLACE FUNCTION commerce_woo_event_finish(eid uuid,err text DEFAULT NULL) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 UPDATE commerce_woo_event_applies SET applied_at=CASE WHEN err IS NULL THEN now() ELSE applied_at END,apply_lease=NULL,apply_error=left(err,300) WHERE event_id=eid $$;
REVOKE ALL ON FUNCTION commerce_woo_event_claim(uuid),commerce_woo_event_finish(uuid,text) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION commerce_woo_event_claim(uuid),commerce_woo_event_finish(uuid,text) TO ekmivo_financial_runtime,ekmivo_financial_projection;
