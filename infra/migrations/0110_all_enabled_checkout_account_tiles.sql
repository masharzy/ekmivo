-- 0110: show all enabled receiving accounts; preserve verification lock rules.
-- Apply in both live and sandbox financial realms.
BEGIN;
CREATE OR REPLACE FUNCTION pg110_public_workspace_accounts(w uuid,e text) RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
 SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'method',a.method,'suffix',a.display_suffix,
 'source_online',(EXISTS(SELECT 1 FROM pg06_devices d WHERE d.account_id=a.id AND d.revoked_at IS NULL AND d.permission_ok AND d.heartbeat_at>now()-interval '5 minutes')
 OR EXISTS(SELECT 1 FROM pg06_phones p WHERE p.workspace_id=a.workspace_id AND p.environment=a.environment
 AND p.claimed_at IS NOT NULL AND p.revoked_at IS NULL AND p.permission_ok AND p.heartbeat_at>now()-interval '20 minutes')))
 ORDER BY a.method,a.created_at,a.id),'[]'::jsonb)
 FROM financial_receiving_accounts a
 JOIN pg06_account_configuration cfg ON cfg.account_id=a.id AND cfg.workspace_id=a.workspace_id AND cfg.environment=a.environment
 JOIN financial_workspace_registry reg ON reg.workspace_id=a.workspace_id AND reg.environment=a.environment AND reg.status='active'
 WHERE a.workspace_id=w AND a.environment=e AND e=(SELECT environment FROM financial_realm WHERE singleton)
 AND cfg.disabled_at IS NULL AND cfg.deleted_at IS NULL AND a.method IN ('bkash','nagad','rocket')
$$;
CREATE OR REPLACE FUNCTION pg98_checkout_accounts(cap text) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=public,pg_temp AS $$
DECLARE w uuid;e text;
BEGIN
 IF cap !~ '^[a-f0-9]{64}$' THEN RETURN '[]'::jsonb; END IF;
 SELECT i.workspace_id,i.environment INTO w,e
 FROM pg05_checkout_tokens t JOIN payment_intents i ON i.id=t.intent_id AND i.workspace_id=t.workspace_id AND i.environment=t.environment
 JOIN financial_workspace_registry reg ON reg.workspace_id=i.workspace_id AND reg.environment=i.environment AND reg.status='active'
 WHERE t.token_digest=cap AND t.environment=(SELECT environment FROM financial_realm WHERE singleton)
 AND pg05_intent_state(i.workspace_id,i.environment,i.id)='requires_payer';
 IF w IS NULL THEN RETURN '[]'::jsonb; END IF;
 RETURN pg110_public_workspace_accounts(w,e);
END $$;
REVOKE ALL ON FUNCTION pg110_public_workspace_accounts(uuid,text),pg98_checkout_accounts(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION pg110_public_workspace_accounts(uuid,text),pg98_checkout_accounts(text) TO ekmivo_finance_reader;
COMMIT;
