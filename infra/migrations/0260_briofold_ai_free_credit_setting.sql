-- 0260: the one-time free AI credit amount is set by a Super Admin (owner decision 2026-11-16).
-- Versioned like the shop assistant model (0240): every change is a new row, audited, with optimistic
-- concurrency. No row yet = ৳30 (the amount 0259 shipped with). 0 = free credit off.
-- The claim function reads the amount here; a client never sends an amount. Past grants never change.
-- Safe to run twice. Control database only.
BEGIN;
DO $pre$
BEGIN
 IF to_regprocedure('public.briofold_ai_free_credit_claim(uuid,uuid)') IS NULL OR to_regclass('public.financial_realm') IS NOT NULL
 THEN RAISE EXCEPTION '0260 requires the control database with 0259 applied'; END IF;
END
$pre$;

CREATE TABLE IF NOT EXISTS briofold_ai_free_credit_versions (
 revision bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
 amount_minor bigint NOT NULL CHECK (amount_minor BETWEEN 0 AND 50000), -- ৳0 to ৳500
 actor_id uuid NOT NULL REFERENCES app_users(id),
 created_at timestamptz NOT NULL DEFAULT now()
);

CREATE OR REPLACE FUNCTION briofold_ai_free_credit_amount() RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce((SELECT amount_minor FROM briofold_ai_free_credit_versions ORDER BY revision DESC LIMIT 1),3000)
$$;

CREATE OR REPLACE FUNCTION briofold_ai_free_credit_change(actor uuid, expected bigint, amount bigint) RETURNS bigint
LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE current_revision bigint; current_amount bigint; new_revision bigint;
BEGIN
 PERFORM 1 FROM platform_administrators p JOIN app_users u ON u.id=p.user_id
  WHERE p.user_id=actor AND p.role='super_admin' AND u.disabled_at IS NULL FOR SHARE OF p,u;
 IF NOT FOUND THEN RAISE EXCEPTION 'Super Admin required' USING ERRCODE='42501'; END IF;
 IF amount IS NULL OR amount<0 OR amount>50000 THEN RAISE EXCEPTION 'amount must be ৳0 to ৳500' USING ERRCODE='22023'; END IF;
 LOCK TABLE briofold_ai_free_credit_versions IN SHARE ROW EXCLUSIVE MODE;
 SELECT revision,amount_minor INTO current_revision,current_amount FROM briofold_ai_free_credit_versions ORDER BY revision DESC LIMIT 1;
 IF coalesce(current_revision,0) IS DISTINCT FROM expected THEN RAISE EXCEPTION 'Free credit setting has changed' USING ERRCODE='40001'; END IF;
 IF amount = coalesce(current_amount,3000) AND current_revision IS NOT NULL THEN RETURN current_revision; END IF;
 INSERT INTO briofold_ai_free_credit_versions(amount_minor,actor_id) VALUES(amount,actor) RETURNING revision INTO new_revision;
 INSERT INTO platform_admin_audit(actor_id,action,description)
  VALUES(actor,'ai_free_credit.change','Free AI credit '||coalesce(current_amount,3000)||' -> '||amount||' paisa (revision '||new_revision||')');
 RETURN new_revision;
END $$;

-- Same rules as 0259; only the amount now comes from the setting, and 0 means "off".
CREATE OR REPLACE FUNCTION briofold_ai_free_credit_claim(w uuid,a uuid) RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE
 amount bigint;
 wallet briofold_ai_wallets%ROWTYPE;
BEGIN
 IF w IS NULL OR a IS NULL THEN RAISE EXCEPTION 'invalid request' USING ERRCODE='22023'; END IF;
 PERFORM pg13_actor(w,a,true);
 IF NOT EXISTS(SELECT 1 FROM workspace_members m JOIN app_users u ON u.id=m.user_id
   WHERE m.workspace_id=w AND m.user_id=a AND m.role IN('owner','admin') AND u.disabled_at IS NULL)
 OR NOT EXISTS(SELECT 1 FROM workspace_product_access WHERE workspace_id=w AND product='ai' AND enabled)
 THEN RAISE EXCEPTION 'access denied' USING ERRCODE='42501'; END IF;
 PERFORM pg_advisory_xact_lock(hashtextextended('briofold:ai:'||w::text,0));
 PERFORM pg_advisory_xact_lock(hashtextextended('briofold:ai-free:'||a::text,0));
 amount := briofold_ai_free_credit_amount();
 IF amount <= 0 THEN
  SELECT * INTO wallet FROM briofold_ai_wallets WHERE workspace_id=w;
  RETURN jsonb_build_object('granted',false,'reason','DISABLED','amount_minor',0,'balance_minor',coalesce(wallet.available_minor,0));
 END IF;
 IF EXISTS(SELECT 1 FROM briofold_ai_credit_journal WHERE workspace_id=w AND operation_key='free-credit:'||w::text)
 OR EXISTS(SELECT 1 FROM briofold_ai_credit_journal WHERE kind='free_grant' AND actor_id=a) THEN
  SELECT * INTO wallet FROM briofold_ai_wallets WHERE workspace_id=w;
  RETURN jsonb_build_object('granted',false,'reason','ALREADY_CLAIMED','amount_minor',amount,
   'balance_minor',coalesce(wallet.available_minor,0));
 END IF;
 INSERT INTO briofold_ai_wallets(workspace_id) VALUES(w) ON CONFLICT DO NOTHING;
 UPDATE briofold_ai_wallets SET available_minor=available_minor+amount,updated_at=now()
  WHERE workspace_id=w RETURNING * INTO wallet;
 INSERT INTO briofold_ai_credit_journal(workspace_id,operation_key,kind,available_delta_minor,
   reserved_delta_minor,available_after_minor,reserved_after_minor,actor_id)
  VALUES(w,'free-credit:'||w::text,'free_grant',amount,0,wallet.available_minor,wallet.reserved_minor,a);
 RETURN jsonb_build_object('granted',true,'amount_minor',amount,'balance_minor',wallet.available_minor);
END $$;

CREATE OR REPLACE FUNCTION briofold_ai_free_credit_available(w uuid,a uuid) RETURNS boolean
 LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT briofold_ai_free_credit_amount()>0
    AND NOT EXISTS(SELECT 1 FROM briofold_ai_credit_journal WHERE workspace_id=w AND operation_key='free-credit:'||w::text)
    AND NOT EXISTS(SELECT 1 FROM briofold_ai_credit_journal WHERE kind='free_grant' AND actor_id=a)
$$;

REVOKE ALL ON TABLE briofold_ai_free_credit_versions FROM PUBLIC;
REVOKE ALL ON FUNCTION briofold_ai_free_credit_amount(),briofold_ai_free_credit_change(uuid,bigint,bigint) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION briofold_ai_free_credit_amount() TO ekmivo_financial_runtime,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION briofold_ai_free_credit_change(uuid,bigint,bigint) TO ekmivo_financial_runtime;
DO $$
BEGIN
 IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname='ekmivo_web_app') THEN
  GRANT SELECT ON briofold_ai_free_credit_versions TO ekmivo_web_app;
  GRANT EXECUTE ON FUNCTION briofold_ai_free_credit_amount(),briofold_ai_free_credit_change(uuid,bigint,bigint) TO ekmivo_web_app;
 END IF;
END $$;
COMMIT;
