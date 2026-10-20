-- Control database only. Give the authenticated Go runtime function access,
-- never raw wallet/top-up table access or financial-realm ownership.
BEGIN;
DO $$BEGIN
 IF to_regclass('public.briofold_ai_topups') IS NULL OR to_regclass('public.financial_realm') IS NOT NULL
 THEN RAISE EXCEPTION 'AI top-up runtime access requires control database';END IF;
END $$;
CREATE FUNCTION briofold_ai_topup_context(w uuid,a uuid,tid uuid)
 RETURNS TABLE(receiving_workspace_id uuid,amount_minor bigint)
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=public,pg_temp AS $$
BEGIN
 PERFORM pg13_actor(w,a,true);
 IF pg13_capability_override(w,a,'workspace:settings') IS FALSE
 THEN RAISE EXCEPTION 'access denied' USING ERRCODE='42501';END IF;
 RETURN QUERY SELECT t.receiving_workspace_id,t.amount_minor FROM briofold_ai_topups t
 WHERE t.workspace_id=w AND t.id=tid;
END $$;
REVOKE ALL ON FUNCTION briofold_ai_topup_context(uuid,uuid,uuid) FROM PUBLIC,ekmivo_financial_projection;
GRANT EXECUTE ON FUNCTION briofold_ai_topup_context(uuid,uuid,uuid),
 briofold_ai_topup_issue(uuid,uuid,bigint,text),
 briofold_ai_topup_apply_verified(uuid,uuid,uuid,uuid,bigint) TO ekmivo_financial_runtime;
COMMIT;
