-- 0088: Financial realms only. Repair the legacy 17-argument phone forwarding
-- routine without altering its receipt matching semantics, owner or grants.
-- The later 18-argument signed forwarder remains unchanged.
BEGIN;
DO $repair$
DECLARE original text; signature regprocedure;
BEGIN
 IF to_regclass('public.auth_sessions') IS NOT NULL OR
    to_regclass('public.financial_realm') IS NULL THEN
   RAISE EXCEPTION '0088 refuses control or uninitialized database';
 END IF;
 IF (SELECT environment FROM financial_realm WHERE singleton) NOT IN ('sandbox','live') THEN
   RAISE EXCEPTION '0088 unsupported financial realm';
 END IF;
 signature:=to_regprocedure('public.pg06_phone_forward(uuid,text,text,bytea,text,text,timestamptz,bigint,bigint,uuid,text,bigint,timestamptz,text,text,text,integer)');
 IF signature IS NULL THEN RAISE EXCEPTION '0088 legacy forwarder absent'; END IF;
 original:=pg_get_functiondef(signature);
 IF position('FROM pg06_phone_forwarded AS forwarded WHERE forwarded.phone_id=p.id AND forwarded.event_id=event' IN original)>0 THEN
   RETURN; -- already repaired
 END IF;
 IF position('FROM pg06_phone_forwarded WHERE phone_id=p.id AND event_id=event' IN original)=0 THEN
   RAISE EXCEPTION '0088 unexpected legacy forwarder definition';
 END IF;
 original:=replace(original,
   'FROM pg06_phone_forwarded WHERE phone_id=p.id AND event_id=event',
   'FROM pg06_phone_forwarded AS forwarded WHERE forwarded.phone_id=p.id AND forwarded.event_id=event');
 EXECUTE original;
END
$repair$;
COMMIT;
