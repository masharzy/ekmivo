-- Financial databases (sandbox and live). Payment automation Phase 2, owner
-- decision 2026-11-26: several numbers per gateway, given out in turn, with the
-- daily and monthly receive limits the wallet provider sets on each number.
--
-- * briofold_account_limits: per receiving account; NULL = no limit, 0 = real 0.
-- * Usage = money that actually arrived on the number (incoming SMS receipts,
--   any sender), counted per Asia/Dhaka day and month, because the provider's
--   limit counts everything the wallet receives, not only our checkouts.
-- * briofold_gateway_pick_account: the next number for a checkout. Only enabled
--   numbers whose phone is online and whose limits the payment would not cross;
--   among them the one given out least recently (oldest payment attempt), so the
--   numbers take turns without any extra state. Read-only; Phase 5 calls it from
--   checkout. Nothing calls it while BRIOFOLD_PAYMENT_GATEWAYS_ENABLED is off.
-- Safe to run twice.
BEGIN;
DO $$BEGIN
 IF to_regclass('public.briofold_gateways') IS NULL OR to_regprocedure('briofold_gateway_scope(uuid,text)') IS NULL
  OR to_regclass('public.financial_receipt_observations') IS NULL OR to_regclass('public.payment_attempts') IS NULL
  OR to_regclass('public.pg06_devices') IS NULL OR to_regclass('public.pg06_phones') IS NULL THEN
  RAISE EXCEPTION '0273 requires 0272 and the phone and receipt tables';
 END IF;
END $$;

CREATE TABLE IF NOT EXISTS briofold_account_limits(
 workspace_id uuid NOT NULL,
 environment text NOT NULL CHECK(environment IN ('sandbox','live')),
 account_id uuid PRIMARY KEY,
 daily_count integer CHECK(daily_count IS NULL OR daily_count BETWEEN 0 AND 100000),
 monthly_count integer CHECK(monthly_count IS NULL OR monthly_count BETWEEN 0 AND 1000000),
 daily_amount_minor bigint CHECK(daily_amount_minor IS NULL OR daily_amount_minor BETWEEN 0 AND 100000000000),
 monthly_amount_minor bigint CHECK(monthly_amount_minor IS NULL OR monthly_amount_minor BETWEEN 0 AND 1000000000000),
 updated_at timestamptz NOT NULL DEFAULT now(),
 FOREIGN KEY(workspace_id,environment,account_id) REFERENCES financial_receiving_accounts(workspace_id,environment,id)
);

-- Money received on one number today and this month (Asia/Dhaka).
CREATE OR REPLACE FUNCTION briofold_account_usage(p_account uuid) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT jsonb_build_object(
  'day_count',count(*) FILTER (WHERE d=today),'day_amount_minor',COALESCE(sum(amount_minor) FILTER (WHERE d=today),0),
  'month_count',count(*),'month_amount_minor',COALESCE(sum(amount_minor),0))
 FROM (SELECT o.amount_minor,(COALESCE(o.original_transaction_at,o.created_at) AT TIME ZONE 'Asia/Dhaka')::date d,
        (now() AT TIME ZONE 'Asia/Dhaka')::date today
       FROM financial_receipt_observations o
       WHERE o.receiving_account_id=p_account AND o.direction='incoming' AND o.amount_minor IS NOT NULL
        AND COALESCE(o.original_transaction_at,o.created_at)>=
         (date_trunc('month',now() AT TIME ZONE 'Asia/Dhaka') AT TIME ZONE 'Asia/Dhaka')) x
$$;

-- Same "online" rule the checkout already uses when a number is locked (0098).
CREATE OR REPLACE FUNCTION briofold_account_online(p_workspace uuid,p_environment text,p_account uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT EXISTS(SELECT 1 FROM pg06_devices d WHERE d.account_id=p_account AND d.revoked_at IS NULL AND d.permission_ok
   AND d.heartbeat_at>now()-interval '5 minutes')
  OR EXISTS(SELECT 1 FROM pg06_phones p WHERE p.workspace_id=p_workspace AND p.environment=p_environment
   AND p.claimed_at IS NOT NULL AND p.revoked_at IS NULL AND p.permission_ok AND p.heartbeat_at>now()-interval '20 minutes')
$$;

-- NULL when the payment fits, else which limit it would cross.
CREATE OR REPLACE FUNCTION briofold_account_limit_reason(p_account uuid,p_amount bigint) RETURNS text
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE l briofold_account_limits; u jsonb;
BEGIN
 SELECT * INTO l FROM briofold_account_limits WHERE account_id=p_account;
 IF l.account_id IS NULL THEN RETURN NULL; END IF;
 u:=briofold_account_usage(p_account);
 IF l.daily_count IS NOT NULL AND (u->>'day_count')::bigint+1>l.daily_count THEN RETURN 'DAILY_COUNT'; END IF;
 IF l.monthly_count IS NOT NULL AND (u->>'month_count')::bigint+1>l.monthly_count THEN RETURN 'MONTHLY_COUNT'; END IF;
 IF l.daily_amount_minor IS NOT NULL AND (u->>'day_amount_minor')::bigint+p_amount>l.daily_amount_minor THEN RETURN 'DAILY_AMOUNT'; END IF;
 IF l.monthly_amount_minor IS NOT NULL AND (u->>'month_amount_minor')::bigint+p_amount>l.monthly_amount_minor THEN RETURN 'MONTHLY_AMOUNT'; END IF;
 RETURN NULL;
END $$;

-- Numbers of one gateway, with limits, usage and whether each could take p_amount now.
CREATE OR REPLACE FUNCTION briofold_gateway_accounts(p_workspace uuid,p_environment text,p_gateway uuid,p_amount bigint) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 IF NOT briofold_gateway_scope(p_workspace,p_environment) THEN RETURN NULL; END IF;
 IF NOT EXISTS(SELECT 1 FROM briofold_gateways WHERE id=p_gateway AND workspace_id=p_workspace
   AND environment=p_environment AND deleted_at IS NULL) THEN RAISE EXCEPTION 'gateway not found' USING ERRCODE='P7204'; END IF;
 IF p_amount IS NOT NULL AND (p_amount<1 OR p_amount>100000000000) THEN RAISE EXCEPTION 'invalid gateway' USING ERRCODE='P7201'; END IF;
 RETURN jsonb_build_object('items',COALESCE((SELECT jsonb_agg(jsonb_build_object(
   'id',a.id,'method',a.method,'suffix',a.display_suffix,'label',c.label,'enabled',c.disabled_at IS NULL,
   'online',briofold_account_online(a.workspace_id,a.environment,a.id),
   'limits',jsonb_build_object('daily_count',l.daily_count,'monthly_count',l.monthly_count,
     'daily_amount_minor',l.daily_amount_minor,'monthly_amount_minor',l.monthly_amount_minor),
   'usage',briofold_account_usage(a.id),
   'limit_reason',CASE WHEN p_amount IS NULL THEN NULL ELSE briofold_account_limit_reason(a.id,p_amount) END)
   ORDER BY a.created_at,a.id)
  FROM financial_receiving_accounts a JOIN pg06_account_configuration c ON c.account_id=a.id AND c.deleted_at IS NULL
  LEFT JOIN briofold_account_limits l ON l.account_id=a.id
  WHERE a.gateway_id=p_gateway AND a.workspace_id=p_workspace AND a.environment=p_environment),'[]'::jsonb));
END $$;

-- The next number for a payment of p_amount through this gateway, or a reason.
CREATE OR REPLACE FUNCTION briofold_gateway_pick_account(p_workspace uuid,p_environment text,p_gateway uuid,p_amount bigint) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE pick record; any_account boolean;
BEGIN
 IF NOT briofold_gateway_scope(p_workspace,p_environment) THEN RETURN NULL; END IF;
 IF p_amount IS NULL OR p_amount<1 OR p_amount>100000000000 THEN RAISE EXCEPTION 'invalid gateway' USING ERRCODE='P7201'; END IF;
 IF NOT EXISTS(SELECT 1 FROM briofold_gateways WHERE id=p_gateway AND workspace_id=p_workspace
   AND environment=p_environment AND deleted_at IS NULL) THEN RAISE EXCEPTION 'gateway not found' USING ERRCODE='P7204'; END IF;
 SELECT a.id,a.display_suffix INTO pick
 FROM financial_receiving_accounts a JOIN pg06_account_configuration c ON c.account_id=a.id
  AND c.deleted_at IS NULL AND c.disabled_at IS NULL
 WHERE a.gateway_id=p_gateway AND a.workspace_id=p_workspace AND a.environment=p_environment
  AND briofold_account_online(a.workspace_id,a.environment,a.id)
  AND briofold_account_limit_reason(a.id,p_amount) IS NULL
 ORDER BY (SELECT max(t.issued_at) FROM payment_attempts t WHERE t.receiving_account_id=a.id) ASC NULLS FIRST,a.created_at,a.id
 LIMIT 1;
 IF pick.id IS NOT NULL THEN RETURN jsonb_build_object('account_id',pick.id,'suffix',pick.display_suffix,'reason',NULL); END IF;
 SELECT EXISTS(SELECT 1 FROM financial_receiving_accounts a JOIN pg06_account_configuration c ON c.account_id=a.id
  AND c.deleted_at IS NULL AND c.disabled_at IS NULL WHERE a.gateway_id=p_gateway) INTO any_account;
 RETURN jsonb_build_object('account_id',NULL,'suffix',NULL,
  'reason',CASE WHEN any_account THEN 'NO_ACCOUNT_AVAILABLE' ELSE 'NO_ACCOUNT' END);
END $$;

-- Move a number into a gateway. The number's method must be the provider's.
CREATE OR REPLACE FUNCTION briofold_account_assign(p_workspace uuid,p_environment text,p_account uuid,p_gateway uuid) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a financial_receiving_accounts; g briofold_gateways;
BEGIN
 IF NOT briofold_gateway_scope(p_workspace,p_environment) THEN RETURN NULL; END IF;
 SELECT r.* INTO a FROM financial_receiving_accounts r JOIN pg06_account_configuration c ON c.account_id=r.id AND c.deleted_at IS NULL
  WHERE r.id=p_account AND r.workspace_id=p_workspace AND r.environment=p_environment FOR UPDATE OF r;
 SELECT * INTO g FROM briofold_gateways WHERE id=p_gateway AND workspace_id=p_workspace
  AND environment=p_environment AND deleted_at IS NULL FOR UPDATE;
 IF a.id IS NULL OR g.id IS NULL THEN RAISE EXCEPTION 'not found' USING ERRCODE='P7204'; END IF;
 IF NOT EXISTS(SELECT 1 FROM briofold_providers p WHERE p.code=g.provider AND p.legacy_method=a.method) THEN
  RAISE EXCEPTION 'invalid gateway' USING ERRCODE='P7201'; END IF;
 UPDATE financial_receiving_accounts SET gateway_id=g.id WHERE id=a.id;
 UPDATE briofold_gateways SET version=version+1,updated_at=now() WHERE id=g.id OR id=a.gateway_id;
 RETURN briofold_gateway_accounts(p_workspace,p_environment,g.id,NULL);
END $$;

-- Replace one number's limits. Absent or null = no limit.
CREATE OR REPLACE FUNCTION briofold_account_set_limits(p_workspace uuid,p_environment text,p_account uuid,p_body jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE a financial_receiving_accounts;
BEGIN
 IF NOT briofold_gateway_scope(p_workspace,p_environment) THEN RETURN NULL; END IF;
 IF jsonb_typeof(p_body)<>'object' OR EXISTS(SELECT 1 FROM jsonb_object_keys(p_body) k WHERE k NOT IN
   ('daily_count','monthly_count','daily_amount_minor','monthly_amount_minor')) THEN
  RAISE EXCEPTION 'invalid gateway' USING ERRCODE='P7201'; END IF;
 SELECT r.* INTO a FROM financial_receiving_accounts r JOIN pg06_account_configuration c ON c.account_id=r.id AND c.deleted_at IS NULL
  WHERE r.id=p_account AND r.workspace_id=p_workspace AND r.environment=p_environment;
 IF a.id IS NULL THEN RAISE EXCEPTION 'not found' USING ERRCODE='P7204'; END IF;
 BEGIN
  INSERT INTO briofold_account_limits(workspace_id,environment,account_id,daily_count,monthly_count,daily_amount_minor,monthly_amount_minor)
  VALUES(a.workspace_id,a.environment,a.id,(p_body->>'daily_count')::integer,(p_body->>'monthly_count')::integer,
   (p_body->>'daily_amount_minor')::bigint,(p_body->>'monthly_amount_minor')::bigint)
  ON CONFLICT(account_id) DO UPDATE SET daily_count=EXCLUDED.daily_count,monthly_count=EXCLUDED.monthly_count,
   daily_amount_minor=EXCLUDED.daily_amount_minor,monthly_amount_minor=EXCLUDED.monthly_amount_minor,updated_at=now();
 EXCEPTION WHEN check_violation OR invalid_text_representation OR numeric_value_out_of_range THEN
  RAISE EXCEPTION 'invalid gateway' USING ERRCODE='P7201';
 END;
 RETURN jsonb_build_object('account_id',a.id,'limits',(SELECT jsonb_build_object('daily_count',daily_count,'monthly_count',monthly_count,
  'daily_amount_minor',daily_amount_minor,'monthly_amount_minor',monthly_amount_minor) FROM briofold_account_limits WHERE account_id=a.id),
  'usage',briofold_account_usage(a.id));
END $$;

REVOKE ALL ON TABLE briofold_account_limits FROM PUBLIC;
REVOKE ALL ON FUNCTION briofold_account_usage(uuid),briofold_account_online(uuid,text,uuid),
 briofold_account_limit_reason(uuid,bigint),briofold_gateway_accounts(uuid,text,uuid,bigint),
 briofold_gateway_pick_account(uuid,text,uuid,bigint),briofold_account_assign(uuid,text,uuid,uuid),
 briofold_account_set_limits(uuid,text,uuid,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION briofold_gateway_accounts(uuid,text,uuid,bigint),briofold_gateway_pick_account(uuid,text,uuid,bigint),
 briofold_account_assign(uuid,text,uuid,uuid),briofold_account_set_limits(uuid,text,uuid,jsonb) TO ekmivo_finance_reader;
COMMIT;
