-- Correct coupon audit routing without changing the existing Admin audit schema.
-- platform_admin_audit.subject_id references app_users(id), not coupon ids.
-- The original 0134 function is already checksum-installed; keep it immutable.
BEGIN;
SET LOCAL lock_timeout = '5s';
SET LOCAL statement_timeout = '30s';
DO $migration$
DECLARE original text;
        replacement text;
        old_columns text := 'INSERT INTO platform_admin_audit(actor_id,action,subject_id,description)';
        old_values text := 'VALUES(actor,''subscription_coupon.''||operation,coupon.id,';
BEGIN
 IF current_database()<>'ekmivo'
 OR to_regclass('public.platform_subscription_coupons') IS NULL
 OR to_regclass('public.financial_realm') IS NOT NULL
 THEN RAISE EXCEPTION '0135 requires Ekmivo control database';END IF;
 SELECT pg_get_functiondef('public.platform_subscription_coupon_admin(uuid,text,jsonb)'::regprocedure)
 INTO original;
 IF (length(original)-length(replace(original,old_columns,'')))/length(old_columns)<>1
 OR (length(original)-length(replace(original,old_values,'')))/length(old_values)<>1
 THEN RAISE EXCEPTION '0134 function definition changed; refusing speculative rewrite';END IF;
 replacement:=replace(replace(original,old_columns,
   'INSERT INTO platform_admin_audit(actor_id,action,description)'),old_values,
   'VALUES(actor,''subscription_coupon.''||operation,');
 EXECUTE replacement;
END $migration$;
COMMIT;
