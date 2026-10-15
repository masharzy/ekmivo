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
    encode(f.payer_cipher,'base64') AS payer_cipher_b64,
    coalesce(f.sender,(SELECT d.source FROM pg06_devices d WHERE d.id=t.device_id AND d.workspace_id=w AND d.environment=e)) AS sender
   FROM financial_payments p
   JOIN financial_receipt_observations o ON o.id=p.observation_id
     AND o.workspace_id=w AND o.environment=e
   LEFT JOIN financial_inbound_events ie ON ie.id=o.inbound_event_id
     AND ie.workspace_id=w AND ie.environment=e
   LEFT JOIN LATERAL (
    SELECT f2.id,f2.ciphertext,f2.phone_id,f2.event_id,f2.payer_cipher,f2.sender
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
    encode(f.payer_cipher,'base64') AS payer_cipher_b64,f.sender
   FROM pg06_phone_forwarded f
   WHERE f.workspace_id=w AND f.environment=e
     AND f.id::text IN (SELECT value FROM jsonb_array_elements_text(ids))
   UNION ALL
   SELECT t.id,encode(ie.encrypted_evidence,'base64') AS evidence_b64,
    t.device_id::text||'|'||t.event_id AS aad,
    NULL::text AS payer_cipher_b64,
    (SELECT d.source FROM pg06_devices d WHERE d.id=t.device_id AND d.workspace_id=w AND d.environment=e) AS sender
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

-- Full customer phone evidence for verified payer-group customer rows.
CREATE FUNCTION pg66_customer_payer_evidence(w uuid,e text,ids jsonb)
RETURNS jsonb LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 PERFORM pg06_scope(w,e);
 IF ids IS NULL OR jsonb_typeof(ids)<>'array' OR jsonb_array_length(ids)>50
 OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(ids) z(v) WHERE
  z.v !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$')
 THEN RAISE EXCEPTION 'invalid customer evidence lookup' USING ERRCODE='22023'; END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(x)),'[]'::jsonb) INTO result FROM (
  SELECT ('64'||substr(md5(a.workspace_id::text||':'||a.environment||':'||a.payer_hmac),3))::uuid AS id,
    max(encode(f.payer_cipher,'base64')) AS payer_cipher_b64
  FROM payment_attempts a
  JOIN financial_payments p ON p.attempt_id=a.id AND p.workspace_id=w AND p.environment=e
  JOIN pg06_phone_forwarded f ON f.observation_id=p.observation_id
   AND f.workspace_id=w AND f.environment=e AND f.payer_cipher IS NOT NULL
  WHERE a.workspace_id=w AND a.environment=e
   AND (('64'||substr(md5(a.workspace_id::text||':'||a.environment||':'||a.payer_hmac),3))::uuid)::text
      IN (SELECT value FROM jsonb_array_elements_text(ids))
  GROUP BY a.workspace_id,a.environment,a.payer_hmac
  LIMIT 50
 ) x;
 RETURN result;
END $$;
REVOKE ALL ON FUNCTION pg66_customer_payer_evidence(uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pg66_customer_payer_evidence(uuid,text,jsonb) TO ekmivo_finance_reader;
-- Do not turn every checkout payment into a merchant-created invoice.

CREATE OR REPLACE FUNCTION pg10_read(w uuid,e text,res text,item uuid,after_id uuid,search text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE result jsonb;
BEGIN
 PERFORM pg06_scope(w,e);IF after_id IS NOT NULL AND NOT EXISTS(SELECT 1 FROM pg64_document_catalog WHERE workspace_id=w AND environment=e AND kind=res AND id=after_id) THEN RAISE EXCEPTION 'invalid document cursor' USING ERRCODE='22023';END IF;
 SELECT coalesce(jsonb_agg(to_jsonb(t)),'[]') INTO result FROM (
 SELECT d.id,d.kind,d.reference,d.status,d.version,CASE WHEN item IS NOT NULL THEN d.body ELSE jsonb_strip_nulls(jsonb_build_object('source',d.body->'source','payment_count',d.body->'payment_count','verified_minor',d.body->'verified_minor','last_payment_at',d.body->'last_payment_at','name',d.body->'name','description',d.body->'description','email',d.body->'email','phone',d.body->'phone','due_at',d.body->'due_at','expires_at',d.body->'expires_at')) END body,d.amount_minor,d.customer_id,d.capability_key,CASE WHEN item IS NOT NULL THEN d.issued_snapshot END issued_snapshot,d.created_at,d.updated_at,
 CASE WHEN d.body->>'source'='automatic_checkout' THEN (SELECT coalesce(sum(a.amount_minor),0) FROM financial_allocations a WHERE a.workspace_id=w AND a.environment=e AND a.intent_id=d.id) ELSE coalesce((SELECT sum(a.amount_minor) FROM pg10_document_intents l JOIN financial_allocations a ON a.intent_id=l.intent_id AND a.workspace_id=l.workspace_id AND a.environment=l.environment WHERE l.document_id=d.id),0) END paid_minor,
 CASE WHEN item IS NULL THEN '[]'::jsonb WHEN d.body->>'source'='automatic_checkout' THEN jsonb_build_array(jsonb_build_object('intent_id',d.id,'state',pg05_intent_state(w,e,d.id))) ELSE (SELECT coalesce(jsonb_agg(jsonb_build_object('intent_id',l.intent_id,'state',pg05_intent_state(w,e,l.intent_id))), '[]') FROM pg10_document_intents l WHERE l.document_id=d.id) END payments,
 CASE WHEN item IS NULL THEN '[]'::jsonb ELSE (SELECT coalesce(jsonb_agg(to_jsonb(v) ORDER BY v.version),'[]') FROM pg10_versions v WHERE v.document_id=d.id) END history
 FROM pg64_document_catalog d WHERE d.workspace_id=w AND d.environment=e AND d.kind=res AND (item IS NULL OR d.id=item)
 AND NOT (res='invoices' AND d.body->>'source'='automatic_checkout')
 AND (search IS NULL OR d.reference ILIKE '%'||search||'%' OR d.body->>'name' ILIKE '%'||search||'%')
 AND (after_id IS NULL OR (d.created_at,d.id)<(SELECT x.created_at,x.id FROM pg64_document_catalog x WHERE x.workspace_id=w AND x.environment=e AND x.kind=res AND x.id=after_id))
 ORDER BY d.created_at DESC,d.id DESC LIMIT 50) t;
 RETURN jsonb_build_object('items',result,'next_cursor',CASE WHEN jsonb_array_length(result)=50 THEN result->49->>'id' ELSE NULL END);
END $$;



CREATE OR REPLACE FUNCTION pg10_customer_activity(w uuid,e text,customer uuid) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM pg06_scope(w,e);
 IF NOT EXISTS(SELECT 1 FROM pg64_document_catalog WHERE workspace_id=w AND environment=e AND id=customer AND kind='customers') THEN RAISE EXCEPTION 'customer missing' USING ERRCODE='P0002';END IF;
 RETURN jsonb_build_object('invoices',coalesce((SELECT jsonb_agg(jsonb_build_object('id',d.id,'reference',d.reference,'status',d.status,'amount_minor',d.amount_minor,
 'paid_minor',CASE WHEN d.body->>'source'='automatic_checkout' THEN (SELECT coalesce(sum(a.amount_minor),0) FROM financial_allocations a WHERE a.workspace_id=w AND a.environment=e AND a.intent_id=d.id)
 ELSE coalesce((SELECT sum(a.amount_minor) FROM pg10_document_intents l JOIN financial_allocations a ON a.intent_id=l.intent_id AND a.workspace_id=w AND a.environment=e WHERE l.document_id=d.id AND l.workspace_id=w AND l.environment=e),0) END))
 FROM pg64_document_catalog d WHERE d.workspace_id=w AND d.environment=e AND d.customer_id=customer AND d.kind='invoices' AND d.body->>'source' IS DISTINCT FROM 'automatic_checkout'),'[]'::jsonb));
END $$;


COMMIT;
