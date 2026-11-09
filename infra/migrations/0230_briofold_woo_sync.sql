-- AI Commerce Phase 1 (part 3): WooCommerce product webhooks that apply once.
--
-- The webhook receipt (0206) already records each signed notice once and reports a repeated delivery as "replayed".
-- This adds the missing piece: whether the notice has been APPLIED to the catalog. A notice is claimed with a short lease,
-- applied (after the server re-reads the product from the store), then finished. A repeated or concurrent delivery cannot
-- apply it twice; a failed attempt can be retried after the lease ends.
-- Additive only. Rollback: drop the two functions and the four columns.

ALTER TABLE commerce_woo_hook_events
 ADD COLUMN IF NOT EXISTS applied_at timestamptz,
 ADD COLUMN IF NOT EXISTS apply_lease timestamptz,
 ADD COLUMN IF NOT EXISTS apply_attempts integer NOT NULL DEFAULT 0 CHECK(apply_attempts BETWEEN 0 AND 20),
 ADD COLUMN IF NOT EXISTS apply_error text CHECK(apply_error IS NULL OR length(apply_error)<=300);

-- Claim a notice for applying. claimed=false when it is already applied, being applied, or out of attempts.
-- The acting user is the member who created the webhook; commerce_catalog_write re-checks that they can still manage the store.
CREATE OR REPLACE FUNCTION commerce_woo_event_claim(eid uuid) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE ev commerce_woo_hook_events;src commerce_woo_hook_sources;BEGIN
 SELECT * INTO ev FROM commerce_woo_hook_events WHERE id=eid FOR UPDATE;
 IF ev.id IS NULL THEN RAISE EXCEPTION 'Notice unavailable' USING ERRCODE='42501';END IF;
 SELECT * INTO src FROM commerce_woo_hook_sources WHERE id=ev.source_id AND enabled;
 IF src.id IS NULL THEN RAISE EXCEPTION 'Source unavailable' USING ERRCODE='42501';END IF;
 IF ev.applied_at IS NOT NULL OR ev.apply_attempts>=20 OR (ev.apply_lease IS NOT NULL AND ev.apply_lease>now()) THEN RETURN jsonb_build_object('claimed',false);END IF;
 UPDATE commerce_woo_hook_events SET apply_lease=now()+interval '2 minutes',apply_attempts=apply_attempts+1 WHERE id=eid;
 RETURN jsonb_build_object('claimed',true,'product_id',ev.product_id,'workspace_id',ev.workspace_id,'environment',ev.environment,'actor_id',src.created_by);
END $$;

CREATE OR REPLACE FUNCTION commerce_woo_event_finish(eid uuid,err text DEFAULT NULL) RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path=public,pg_temp AS $$
 UPDATE commerce_woo_hook_events SET applied_at=CASE WHEN err IS NULL THEN now() ELSE applied_at END,apply_lease=NULL,apply_error=left(err,300) WHERE id=eid
$$;

REVOKE ALL ON FUNCTION commerce_woo_event_claim(uuid),commerce_woo_event_finish(uuid,text) FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION commerce_woo_event_claim(uuid),commerce_woo_event_finish(uuid,text) TO ekmivo_financial_runtime,ekmivo_financial_projection;
