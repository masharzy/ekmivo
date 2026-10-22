-- Control only. Recover the server-authoritative quote after refresh/unknown POST.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF current_database()<>'ekmivo' OR to_regclass('public.financial_realm') IS NOT NULL
 OR to_regclass('public.platform_subscription_tax_policy_versions') IS NULL
 THEN RAISE EXCEPTION '0149 requires control after 0148'; END IF;
END $$;
CREATE FUNCTION platform_subscription_coupon_current_quote(a uuid,iid uuid)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE i platform_subscription_purchase_intents;q platform_subscription_purchase_quotes;
 coupon_text text;
BEGIN
 SELECT * INTO i FROM platform_subscription_purchase_intents WHERE id=iid;
 IF i.id IS NULL OR i.actor_id IS DISTINCT FROM a OR i.workspace_id IS NULL
 THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 PERFORM pg13_actor(i.workspace_id,a,true);
 IF pg13_capability_override(i.workspace_id,a,'workspace:settings') IS FALSE
 THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF i.status NOT IN ('selected','quoted') OR i.expires_at<=statement_timestamp()
 OR i.confirmed_invoice_id IS NOT NULL
 THEN RAISE EXCEPTION 'QUOTE_CHANGED' USING ERRCODE='40001'; END IF;
 SELECT * INTO q FROM platform_subscription_purchase_quotes WHERE intent_id=iid ORDER BY revision DESC LIMIT 1;
 IF q.id IS NULL OR q.expires_at<=statement_timestamp()
 THEN RAISE EXCEPTION 'QUOTE_REQUIRED' USING ERRCODE='40001'; END IF;
 -- The code comes from the immutable revision, never today's edited campaign.
 IF q.coupon_id IS NOT NULL THEN
 SELECT snapshot->>'code_normalized' INTO coupon_text
 FROM platform_subscription_coupon_versions WHERE coupon_id=q.coupon_id AND revision=q.coupon_revision;
 END IF;
 RETURN to_jsonb(q)||jsonb_build_object('intent_revision',i.revision,
 'coupon_code',coalesce(coupon_text,''),
 'lines',(SELECT coalesce(jsonb_agg(to_jsonb(l) ORDER BY line_no),'[]'::jsonb)
  FROM platform_subscription_quote_lines l WHERE quote_id=q.id));
END $$;
REVOKE ALL ON FUNCTION platform_subscription_coupon_current_quote(uuid,uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_subscription_coupon_current_quote(uuid,uuid) TO ekmivo_runtime;
DO $patch$
DECLARE source text; needle text := '''intent_revision'',n,''coupon_eligible'',true,';
BEGIN
 SELECT pg_get_functiondef('platform_subscription_coupon_quote(uuid,uuid,uuid,bigint,text)'::regprocedure) INTO source;
 IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1
 THEN RAISE EXCEPTION '0149 coupon result source drift'; END IF;
 EXECUTE replace(source,needle,'''intent_revision'',n,''coupon_eligible'',true,''coupon_code'',normalized,');
END $patch$;
COMMIT;
