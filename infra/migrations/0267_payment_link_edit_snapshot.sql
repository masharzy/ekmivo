-- Financial databases (sandbox and live). Owner 2026-11-23: options set on a
-- payment link (Redirect URL, notes, amount, quantity...) "do not work".
--
-- Cause: the customer page and the checkout read issued_snapshot, taken when
-- the link was published. Editing an active link updated body (and cancelled
-- its open checkouts) but never the snapshot, so customers kept seeing the
-- published version. Production: link "27 ACS FRB" has a Redirect URL in its
-- body and none in its snapshot.
--
-- Fix: editing an ACTIVE payment link refreshes the snapshot too. Invoices
-- keep their rule (only a correction replaces what was issued). No existing
-- data is changed here; an active link picks up its saved options the next
-- time it is saved. Safe to run twice; stops on an unexpected function.
BEGIN;
DO $$DECLARE d text;
 old text:='issued_snapshot=CASE WHEN action=''correct'' THEN b-''expected_version'' ELSE issued_snapshot END';
 new text:='issued_snapshot=CASE WHEN action=''correct'' OR (res=''payment-links'' AND d.status=''active'') THEN b-''expected_version'' ELSE issued_snapshot END';
BEGIN
 IF to_regclass('public.financial_realm') IS NULL OR to_regclass('public.pg10_documents') IS NULL
 THEN RAISE EXCEPTION '0267 requires a migrated financial database'; END IF;
 d:=pg_get_functiondef('pg10_write(uuid,text,text,uuid,text,jsonb,text,text,text,uuid)'::regprocedure);
 IF position(new IN d)>0 THEN RETURN; END IF;
 IF (length(d)-length(replace(d,old,'')))/length(old)<>1 THEN
  RAISE EXCEPTION 'Unknown pg10_write; inspect before applying 0267';
 END IF;
 EXECUTE replace(d,old,new);
END $$;
COMMIT;
