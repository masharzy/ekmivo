-- Control plane: analysts cannot reply to support tickets via direct SQL calls.
BEGIN;
DO $$ DECLARE d text; BEGIN
 SELECT pg_get_functiondef('pg13_support_reply(uuid,uuid,text,text)'::regprocedure) INTO d;
 IF position('WHERE p.user_id=a AND u.disabled_at IS NULL' IN d)=0 THEN RAISE EXCEPTION 'Unexpected support role guard'; END IF;
 EXECUTE replace(d,'WHERE p.user_id=a AND u.disabled_at IS NULL','WHERE p.user_id=a AND p.role IN (''super_admin'',''admin'',''support'') AND u.disabled_at IS NULL');
END $$;
COMMIT;
