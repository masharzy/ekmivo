-- Financial databases (sandbox and live). Payment automation Phase 3a, owner
-- decision 2026-11-26: money that arrived but does not fit a checkout exactly
-- goes to the shop as "Pending", never completes by itself and is never lost.
--
-- The matcher (pg07_match) already records such SMS receipts as unmatched with
-- the reason partial_amount_requires_reconciliation / excess_amount_requires_
-- reconciliation, or as ambiguous (multiple_exact_candidates). Until now they
-- were only a line in the incoming report. This migration adds, without
-- changing the matcher or any existing function:
--
-- * briofold_review_cases: one case per SMS receipt (observation_id UNIQUE), so
--   one SMS can be claimed by one Pending decision only. Kinds: underpaid,
--   overpaid, ambiguous. Cases are created from receipt results when the shop
--   opens its Pending list (nothing runs while BRIOFOLD_PAYMENT_GATEWAYS_ENABLED
--   is off).
-- * briofold_review_approve: the shop accepts the money for a checkout (the
--   suggested one, or another open checkout of the shop = "move"). Recorded as
--   "confirmed by the shop" through briofold_payment_proofs (0271), never as an
--   SMS-verified payment, so the exact-amount rule of verified payments stays.
-- * briofold_review_reject: the shop refuses; the SMS stays an unmatched receipt.
--
-- Safe to run twice.
BEGIN;
DO $$BEGIN
 IF to_regclass('public.pg07_receipt_results') IS NULL OR to_regclass('public.briofold_payment_proofs') IS NULL
  OR to_regprocedure('briofold_gateway_scope(uuid,text)') IS NULL
  OR to_regprocedure('pg05_intent_state(uuid,text,uuid)') IS NULL
  OR to_regprocedure('briofold_sms_window_start(timestamptz,text)') IS NULL THEN
  RAISE EXCEPTION '0274 requires 0266, 0271 and 0272';
 END IF;
END $$;

CREATE TABLE IF NOT EXISTS briofold_review_cases(
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 workspace_id uuid NOT NULL,
 environment text NOT NULL CHECK(environment IN ('sandbox','live')),
 observation_id uuid NOT NULL UNIQUE,
 kind text NOT NULL CHECK(kind IN ('underpaid','overpaid','ambiguous')),
 suggested_intent_id uuid,
 received_amount_minor bigint NOT NULL CHECK(received_amount_minor>0),
 expected_amount_minor bigint CHECK(expected_amount_minor IS NULL OR expected_amount_minor>0),
 state text NOT NULL DEFAULT 'open' CHECK(state IN ('open','approved','rejected')),
 decided_intent_id uuid,
 decision_reason text CHECK(decision_reason IS NULL OR length(decision_reason)<=300),
 created_at timestamptz NOT NULL DEFAULT now(),
 decided_at timestamptz,
 CHECK((state='approved')=(decided_intent_id IS NOT NULL)),
 FOREIGN KEY(workspace_id,environment,observation_id) REFERENCES financial_receipt_observations(workspace_id,environment,id),
 FOREIGN KEY(workspace_id,environment,suggested_intent_id) REFERENCES payment_intents(workspace_id,environment,id),
 FOREIGN KEY(workspace_id,environment,decided_intent_id) REFERENCES payment_intents(workspace_id,environment,id)
);
CREATE INDEX IF NOT EXISTS briofold_review_cases_open ON briofold_review_cases(workspace_id,environment,state,created_at DESC);
-- A checkout can be accepted from one SMS only.
CREATE UNIQUE INDEX IF NOT EXISTS briofold_review_cases_one_per_intent ON briofold_review_cases(workspace_id,environment,decided_intent_id)
 WHERE state='approved';

-- Attempts whose payer, number, method and time fit the SMS (the window rule of
-- pg07_match after 0266) on checkouts not yet paid.
CREATE OR REPLACE FUNCTION briofold_review_candidates(o financial_receipt_observations,p_exact boolean)
RETURNS SETOF payment_attempts LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT p.* FROM payment_attempts p
 WHERE p.workspace_id=o.workspace_id AND p.environment=o.environment
  AND p.receiving_account_id=o.receiving_account_id AND p.payer_hmac=o.payer_hmac
  AND p.method=o.method AND p.currency=o.currency
  AND (p.amount_minor=o.amount_minor)=p_exact
  AND o.original_transaction_at>=briofold_sms_window_start(p.window_start,o.time_precision)
  AND o.original_transaction_at<p.window_end
  AND pg05_intent_state(p.workspace_id,p.environment,p.intent_id)<>'completed'
$$;

-- Open a case for every receipt the matcher set aside for amount or ambiguity
-- that has none yet. Idempotent (one case per SMS).
CREATE OR REPLACE FUNCTION briofold_review_sync(p_workspace uuid,p_environment text) RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE r record; o financial_receipt_observations; n integer:=0; c integer; first payment_attempts;
BEGIN
 FOR r IN SELECT rr.observation_id,rr.reason FROM pg07_receipt_results rr
  WHERE rr.workspace_id=p_workspace AND rr.environment=p_environment
   AND rr.reason IN ('partial_amount_requires_reconciliation','excess_amount_requires_reconciliation','multiple_exact_candidates')
   AND NOT EXISTS(SELECT 1 FROM briofold_review_cases k WHERE k.observation_id=rr.observation_id)
  ORDER BY rr.processed_at NULLS LAST LIMIT 500
 LOOP
  SELECT * INTO o FROM financial_receipt_observations WHERE id=r.observation_id
   AND workspace_id=p_workspace AND environment=p_environment;
  CONTINUE WHEN o.id IS NULL OR o.amount_minor IS NULL OR o.amount_minor<=0;
  SELECT count(*) INTO c FROM briofold_review_candidates(o,r.reason='multiple_exact_candidates');
  SELECT * INTO first FROM briofold_review_candidates(o,r.reason='multiple_exact_candidates') x
   ORDER BY x.issued_at DESC LIMIT 1;
  INSERT INTO briofold_review_cases(workspace_id,environment,observation_id,kind,suggested_intent_id,
   received_amount_minor,expected_amount_minor)
  VALUES(p_workspace,p_environment,o.id,
   CASE WHEN r.reason='multiple_exact_candidates' OR c<>1 THEN 'ambiguous'
        WHEN first.amount_minor>o.amount_minor THEN 'underpaid' ELSE 'overpaid' END,
   CASE WHEN c=1 THEN first.intent_id END,o.amount_minor,CASE WHEN c=1 THEN first.amount_minor END)
  ON CONFLICT(observation_id) DO NOTHING;
  GET DIAGNOSTICS c=ROW_COUNT; n:=n+c;
 END LOOP;
 RETURN n;
END $$;

CREATE OR REPLACE FUNCTION briofold_review_json(k briofold_review_cases) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object('id',k.id,'kind',k.kind,'state',k.state,
  'received_amount_minor',k.received_amount_minor,'expected_amount_minor',k.expected_amount_minor,
  'difference_minor',CASE WHEN k.expected_amount_minor IS NOT NULL THEN k.received_amount_minor-k.expected_amount_minor END,
  'method',o.method,'received_at',o.original_transaction_at,'account_suffix',a.display_suffix,
  'suggested_intent_id',k.suggested_intent_id,'decided_intent_id',k.decided_intent_id,
  'decision_reason',k.decision_reason,'created_at',k.created_at,'decided_at',k.decided_at,
  'candidates',CASE WHEN k.state='open' THEN COALESCE((SELECT jsonb_agg(jsonb_build_object('intent_id',i.id,
     'merchant_reference',i.merchant_reference,'amount_minor',i.amount_minor,'payer_suffix',x.payer_suffix) ORDER BY x.issued_at DESC)
    FROM briofold_review_candidates(o,k.kind='ambiguous') x
    JOIN payment_intents i ON i.workspace_id=x.workspace_id AND i.environment=x.environment AND i.id=x.intent_id),'[]'::jsonb)
   ELSE '[]'::jsonb END)
 FROM financial_receipt_observations o LEFT JOIN financial_receiving_accounts a ON a.id=o.receiving_account_id
 WHERE o.id=k.observation_id
$$;

CREATE OR REPLACE FUNCTION briofold_review_list(p_workspace uuid,p_environment text,p_state text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT briofold_gateway_scope(p_workspace,p_environment) THEN RETURN NULL; END IF;
 IF p_state IS NULL OR p_state NOT IN ('open','approved','rejected') THEN RAISE EXCEPTION 'invalid review' USING ERRCODE='P7201'; END IF;
 PERFORM briofold_review_sync(p_workspace,p_environment);
 RETURN jsonb_build_object('items',COALESCE((SELECT jsonb_agg(briofold_review_json(k) ORDER BY k.created_at DESC)
  FROM (SELECT * FROM briofold_review_cases WHERE workspace_id=p_workspace AND environment=p_environment AND state=p_state
   ORDER BY created_at DESC LIMIT 200) k),'[]'::jsonb));
END $$;

-- Accept the money for p_intent (NULL = the suggested checkout).
-- Errors: P7201 invalid, P7204 not found, P7205 already decided or checkout paid.
CREATE OR REPLACE FUNCTION briofold_review_approve(p_workspace uuid,p_environment text,p_case uuid,p_intent uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE k briofold_review_cases; target uuid;
BEGIN
 IF NOT briofold_gateway_scope(p_workspace,p_environment) THEN RETURN NULL; END IF;
 SELECT * INTO k FROM briofold_review_cases WHERE id=p_case AND workspace_id=p_workspace
  AND environment=p_environment FOR UPDATE;
 IF k.id IS NULL THEN RAISE EXCEPTION 'review not found' USING ERRCODE='P7204'; END IF;
 IF k.state<>'open' THEN RAISE EXCEPTION 'review decided' USING ERRCODE='P7205'; END IF;
 target:=COALESCE(p_intent,k.suggested_intent_id);
 IF target IS NULL THEN RAISE EXCEPTION 'choose a checkout' USING ERRCODE='P7201'; END IF;
 PERFORM 1 FROM payment_intents WHERE workspace_id=p_workspace AND environment=p_environment AND id=target FOR UPDATE;
 IF NOT FOUND THEN RAISE EXCEPTION 'checkout not found' USING ERRCODE='P7204'; END IF;
 IF pg05_intent_state(p_workspace,p_environment,target)='completed'
  OR EXISTS(SELECT 1 FROM briofold_payment_proofs WHERE workspace_id=p_workspace AND environment=p_environment
   AND intent_id=target AND state IN ('approved','auto_verified')) THEN
  RAISE EXCEPTION 'checkout already paid' USING ERRCODE='P7205'; END IF;
 INSERT INTO briofold_payment_proofs(workspace_id,environment,intent_id,state,decided_at,decision_reason,seen_at)
 VALUES(p_workspace,p_environment,target,'approved',now(),'sms_review_'||k.kind,now())
 ON CONFLICT(workspace_id,environment,intent_id) DO UPDATE SET state='approved',decided_at=now(),
  decision_reason='sms_review_'||k.kind,seen_at=COALESCE(briofold_payment_proofs.seen_at,now()),updated_at=now();
 UPDATE briofold_review_cases SET state='approved',decided_intent_id=target,decided_at=now() WHERE id=k.id RETURNING * INTO k;
 RETURN briofold_review_json(k);
END $$;

CREATE OR REPLACE FUNCTION briofold_review_reject(p_workspace uuid,p_environment text,p_case uuid,p_reason text) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE k briofold_review_cases;
BEGIN
 IF NOT briofold_gateway_scope(p_workspace,p_environment) THEN RETURN NULL; END IF;
 IF p_reason IS NOT NULL AND length(p_reason)>300 THEN RAISE EXCEPTION 'invalid review' USING ERRCODE='P7201'; END IF;
 SELECT * INTO k FROM briofold_review_cases WHERE id=p_case AND workspace_id=p_workspace
  AND environment=p_environment FOR UPDATE;
 IF k.id IS NULL THEN RAISE EXCEPTION 'review not found' USING ERRCODE='P7204'; END IF;
 IF k.state<>'open' THEN RAISE EXCEPTION 'review decided' USING ERRCODE='P7205'; END IF;
 UPDATE briofold_review_cases SET state='rejected',decision_reason=NULLIF(btrim(p_reason),''),decided_at=now()
  WHERE id=k.id RETURNING * INTO k;
 RETURN briofold_review_json(k);
END $$;

REVOKE ALL ON TABLE briofold_review_cases FROM PUBLIC;
REVOKE ALL ON FUNCTION briofold_review_candidates(financial_receipt_observations,boolean),briofold_review_sync(uuid,text),
 briofold_review_json(briofold_review_cases),briofold_review_list(uuid,text,text),
 briofold_review_approve(uuid,text,uuid,uuid),briofold_review_reject(uuid,text,uuid,text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION briofold_review_list(uuid,text,text),briofold_review_approve(uuid,text,uuid,uuid),
 briofold_review_reject(uuid,text,uuid,text) TO ekmivo_finance_reader;
COMMIT;
