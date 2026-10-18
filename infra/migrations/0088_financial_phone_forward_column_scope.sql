-- 0088: Fix ambiguous PL/pgSQL function argument vs. stored phone_id column.
-- Both isolated financial realms only. No table rewrite, no historical receipt changes.
-- The original 0047 function argument is also named phone_id, therefore the
-- unqualified WHERE phone_id=p.id expression raises SQLSTATE 42702 at runtime.
BEGIN;
DO $fix$
DECLARE body text;
BEGIN
 body := pg_get_functiondef(
  'public.pg06_phone_forward(uuid,text,text,bytea,text,text,timestamptz,bigint,bigint,uuid,text,bigint,timestamptz,text,text,text,integer)'::regprocedure
 );
 IF position('FROM pg06_phone_forwarded WHERE phone_id=p.id' IN body)>0 THEN
  body := replace(body,
    'FROM pg06_phone_forwarded WHERE phone_id=p.id',
    'FROM pg06_phone_forwarded f WHERE f.phone_id=p.id');
  EXECUTE body;
 ELSIF position('FROM pg06_phone_forwarded f WHERE f.phone_id=p.id' IN body)=0 THEN
  RAISE EXCEPTION '0088 unexpected phone forward implementation' USING ERRCODE='22023';
 END IF;
END
$fix$;
COMMIT;
