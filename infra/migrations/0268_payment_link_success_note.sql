-- Financial databases (sandbox and live). Owner 2026-11-23: a payment link
-- needs a note the customer sees after paying ("after success note").
-- The checkout view adds success_note from the link's published snapshot,
-- the same way it already adds return_url. Display only; nothing about the
-- payment changes. Safe to run twice; stops on an unexpected function.
BEGIN;
DO $$DECLARE d text;
 old text:='g10_return_allowed(d.workspace_id,d.environment,d.issued_snapshot->>''return_url''))); RETURN result;';
 new text:='g10_return_allowed(d.workspace_id,d.environment,d.issued_snapshot->>''return_url'')));'
  ||' result:=result||jsonb_strip_nulls(jsonb_build_object(''success_note'',(SELECT left(nullif(btrim(d.issued_snapshot->>''success_note''),''''),500) FROM pg05_checkout_tokens t JOIN pg10_document_intents l ON l.intent_id=t.intent_id JOIN pg10_documents d ON d.id=l.document_id WHERE t.token_digest=cap AND d.kind=''payment-links''))); RETURN result;';
BEGIN
 IF to_regclass('public.financial_realm') IS NULL OR to_regclass('public.pg10_documents') IS NULL
 THEN RAISE EXCEPTION '0268 requires a migrated financial database'; END IF;
 d:=pg_get_functiondef('pg10_checkout_view(text)'::regprocedure);
 IF position('''success_note''' IN d)>0 THEN RETURN; END IF;
 IF (length(d)-length(replace(d,old,'')))/length(old)<>1 THEN
  RAISE EXCEPTION 'Unknown pg10_checkout_view; inspect before applying 0268';
 END IF;
 EXECUTE replace(d,old,new);
END $$;
COMMIT;
