-- Fix the one ambiguous PL/pgSQL kind variable in 0140. Immutable ledger preserved.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $migration$
DECLARE original text; patched text;
 old_part text := 'WHERE kind=policy.kind AND status=''published''';
 new_part text := 'WHERE platform_subscription_policy_versions.kind=policy.kind AND status=''published''';
BEGIN
 IF current_database()<>'ekmivo' OR to_regclass('public.platform_subscription_policy_versions') IS NULL
 OR to_regclass('public.financial_realm') IS NOT NULL
 THEN RAISE EXCEPTION '0142 requires Ekmivo control database';END IF;
 SELECT pg_get_functiondef('public.platform_subscription_policy_admin(uuid,text,jsonb)'::regprocedure) INTO original;
 IF (length(original)-length(replace(original,old_part,'')))/length(old_part)<>1
 THEN RAISE EXCEPTION 'policy admin source does not match 0141';END IF;
 patched:=replace(original,old_part,new_part);
 EXECUTE patched;
END $migration$;
COMMIT;
