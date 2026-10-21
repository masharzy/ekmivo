-- Keep applied 0140 checksum immutable; fix the publish advisory-lock key expression.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $migration$
DECLARE original text; patched text;
 old_part text := '''ekmivo-policy-''+policy.kind';
 new_part text := '''ekmivo-policy-''||policy.kind';
BEGIN
 IF current_database()<>'ekmivo' OR to_regclass('public.platform_subscription_policy_versions') IS NULL
 OR to_regclass('public.financial_realm') IS NOT NULL
 THEN RAISE EXCEPTION '0141 requires Ekmivo control database';END IF;
 SELECT pg_get_functiondef('public.platform_subscription_policy_admin(uuid,text,jsonb)'::regprocedure) INTO original;
 IF (length(original)-length(replace(original,old_part,'')))/length(old_part)<>1
 THEN RAISE EXCEPTION 'policy admin source does not match 0140';END IF;
 patched:=replace(original,old_part,new_part);
 EXECUTE patched;
END $migration$;
COMMIT;
