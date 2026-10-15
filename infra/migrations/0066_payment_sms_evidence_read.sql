-- 0066: bounded read-only ciphertext lookup for authorized merchant payment views.
-- Go authorizes owner/admin and decrypts in process. SQL never returns plaintext.
-- Apply independently to Sandbox/Live only after an isolated Neon branch check.
BEGIN;
DO $preflight$
BEGIN
 IF to_regprocedure('public.pg06_scope(uuid,text)') IS NULL
    OR to_regclass('public.pg06_phone_forwarded') IS NULL
    OR to_regclass('public.pg06_transport') IS NULL
    OR to_regclass('public.financial_inbound_events') IS NULL
 THEN RAISE EXCEPTION '0066 requires existing payment evidence schema'; END IF;
END $preflight$;

CREATE FUNCTION public.pg66_payment_sms_evidence(
 w uuid,e text,resource text,ids jsonb
) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER STABLE SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 PERFORM pg06_scope(w,e);
 IF resource NOT IN ('payments','incoming') OR ids IS NULL
   OR jsonb_typeof(ids)<>'array' OR jsonb_array_length(ids)>50
   OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(ids) z(v)
     WHERE z.v !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
 THEN RAISE EXCEPTION 'invalid evidence lookup' USING ERRCODE='22023'; END IF;
 IF resource='payments' THEN
  SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) INTO result FROM (
   SELECT p.id,
    encode(coalesce(f.ciphertext, ie.encrypted_evidence),'base64') AS evidence_b64,
    CASE WHEN f.id IS NOT NULL THEN f.phone_id::text||'|'||f.event_id
         WHEN t.id IS NOT NULL THEN t.device_id::text||'|'||t.event_id END AS aad,
    encode(f.payer_cipher,'base64') AS payer_cipher_b64
   FROM financial_payments p
   JOIN financial_receipt_observations o ON o.id=p.observation_id
     AND o.workspace_id=w AND o.environment=e
   LEFT JOIN financial_inbound_events ie ON ie.id=o.inbound_event_id
     AND ie.workspace_id=w AND ie.environment=e
   LEFT JOIN LATERAL (
    SELECT f2.id,f2.ciphertext,f2.phone_id,f2.event_id,f2.payer_cipher
    FROM pg06_phone_forwarded f2
    WHERE f2.workspace_id=w AND f2.environment=e AND f2.observation_id=o.id
    ORDER BY f2.received_at DESC,f2.id DESC LIMIT 1
   ) f ON true
   LEFT JOIN LATERAL (
    SELECT t2.id,t2.device_id,t2.event_id FROM pg06_transport t2
    WHERE t2.workspace_id=w AND t2.environment=e AND t2.observation_id=o.id
    ORDER BY t2.received_at DESC,t2.id DESC LIMIT 1
   ) t ON true
   WHERE p.workspace_id=w AND p.environment=e
     AND p.id::text IN (SELECT value FROM jsonb_array_elements_text(ids))
   LIMIT 50
  ) s;
 ELSE
  SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]'::jsonb) INTO result FROM (
   SELECT f.id,encode(f.ciphertext,'base64') AS evidence_b64,
    f.phone_id::text||'|'||f.event_id AS aad,
    encode(f.payer_cipher,'base64') AS payer_cipher_b64
   FROM pg06_phone_forwarded f
   WHERE f.workspace_id=w AND f.environment=e
     AND f.id::text IN (SELECT value FROM jsonb_array_elements_text(ids))
   UNION ALL
   SELECT t.id,encode(ie.encrypted_evidence,'base64') AS evidence_b64,
    t.device_id::text||'|'||t.event_id AS aad,
    NULL::text AS payer_cipher_b64
   FROM pg06_transport t
   LEFT JOIN financial_receipt_observations o ON o.id=t.observation_id
     AND o.workspace_id=w AND o.environment=e
   LEFT JOIN financial_inbound_events ie ON ie.id=o.inbound_event_id
     AND ie.workspace_id=w AND ie.environment=e
   WHERE t.workspace_id=w AND t.environment=e
     AND t.id::text IN (SELECT value FROM jsonb_array_elements_text(ids))
   LIMIT 50
  ) s;
 END IF;
 RETURN result;
END $$;

REVOKE ALL ON FUNCTION public.pg66_payment_sms_evidence(uuid,text,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.pg66_payment_sms_evidence(uuid,text,text,jsonb)
 TO ekmivo_finance_reader;
COMMIT;
