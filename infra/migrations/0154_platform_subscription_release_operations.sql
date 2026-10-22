-- Phase 7: narrow, operator-only recovery/audit read APIs in the CONTROL DB.
-- Additive, unapplied, no provider actions and no entitlement mutations.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $preflight$
BEGIN
 IF current_database()<>'ekmivo' OR to_regclass('public.financial_realm') IS NOT NULL
    OR to_regclass('public.platform_subscription_payment_handoffs') IS NULL
    OR to_regclass('public.platform_subscription_payment_recovery_cases') IS NULL
 THEN RAISE EXCEPTION '0154 needs isolated control DB and unapplied Phase 6 predecessor must run first';END IF;
END $preflight$;

-- User-identity and MFA are verified in the server-only admin handler. The DB
-- additionally requires a Super Admin row; direct runtime SELECT remains
-- denied on handoffs, recovery cases and coupon redemptions.
CREATE FUNCTION platform_subscription_admin_operations(admin_actor uuid)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM platform_administrators a
  WHERE a.user_id=admin_actor AND a.role='super_admin')
 THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';END IF;
 SELECT jsonb_build_object(
  'stats',(SELECT to_jsonb(s) FROM (
   SELECT count(*) FILTER (WHERE state='awaiting_payment')::int AS awaiting,
    count(*) FILTER (WHERE state='paid')::int AS paid,
    count(*) FILTER (WHERE state='expired')::int AS expired,
    count(*) FILTER (WHERE state='cancelled')::int AS cancelled,
    count(*) FILTER (WHERE state='recovery_required')::int AS recovery,
    (SELECT count(*)::int FROM platform_subscription_payment_recovery_cases WHERE status<>'resolved') AS open_cases,
    round(extract(epoch FROM (now()-min(bound_at) FILTER (WHERE state='awaiting_payment')))/60)::int AS oldest_minutes
   FROM platform_subscription_payment_handoffs) s),
  'cases',COALESCE((SELECT jsonb_agg(to_jsonb(c)) FROM (
   SELECT r.id,r.intent_id,h.invoice_id,h.workspace_id,r.reason,r.status,r.created_at
   FROM platform_subscription_payment_recovery_cases r
   JOIN platform_subscription_payment_handoffs h ON h.intent_id=r.intent_id
   WHERE r.status<>'resolved' ORDER BY r.created_at ASC,r.id LIMIT 50) c),'[]'::jsonb)) INTO result;
 RETURN result;
END $$;

CREATE FUNCTION platform_subscription_admin_export(admin_actor uuid,kind text,filter_text text)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb; term text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM platform_administrators a
   WHERE a.user_id=admin_actor AND a.role='super_admin')
 THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501';END IF;
 term:='%'||left(coalesce(filter_text,''),80)||'%';
 IF kind='subscription-recovery' THEN
  SELECT COALESCE(jsonb_agg(to_jsonb(x)),'[]'::jsonb) INTO result FROM (
   SELECT r.id,r.intent_id,h.invoice_id,h.workspace_id,r.reason,r.status,r.created_at
   FROM platform_subscription_payment_recovery_cases r
   JOIN platform_subscription_payment_handoffs h ON h.intent_id=r.intent_id
   WHERE r.id::text ILIKE term OR h.invoice_id::text ILIKE term OR h.workspace_id::text ILIKE term OR r.reason ILIKE term
   ORDER BY r.created_at DESC,r.id DESC LIMIT 5000) x;
 ELSIF kind='subscription-coupon-audit' THEN
  SELECT COALESCE(jsonb_agg(to_jsonb(x)),'[]'::jsonb) INTO result FROM (
   SELECT r.id,r.invoice_id,r.coupon_id,r.workspace_id,r.reservation_id,r.discount_minor,r.redeemed_at
   FROM platform_subscription_coupon_redemptions r
   WHERE r.invoice_id::text ILIKE term OR r.coupon_id::text ILIKE term
   ORDER BY r.redeemed_at DESC,r.id DESC LIMIT 5000) x;
 ELSE RAISE EXCEPTION 'invalid export kind' USING ERRCODE='22023';END IF;
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION platform_subscription_admin_operations(uuid),
 platform_subscription_admin_export(uuid,text,text) FROM PUBLIC;
DO $$BEGIN
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname='ekmivo_runtime') THEN
  GRANT EXECUTE ON FUNCTION platform_subscription_admin_operations(uuid),
   platform_subscription_admin_export(uuid,text,text) TO ekmivo_runtime;
 END IF;
END $$;
COMMIT;
