-- Financial databases (sandbox and live). Owner decision 2026-11-23: every
-- checkout gives the customer 4 minutes to pay, everywhere (merchant API,
-- payment links, invoices, Briofold billing). No per-checkout choice.
-- pg10_intent is the common path for all of these; pg05_create_intent is the
-- older direct path. AI chat payment links keep their order-based expiry.
-- Only the expiry changes; matching, amounts and verification are untouched.
-- Safe to run twice; stops on an unexpected function.
BEGIN;
CREATE FUNCTION pg_temp.patch_four(sig text,pairs text[][]) RETURNS void LANGUAGE plpgsql AS $$
DECLARE d text; i integer;
BEGIN
 d:=pg_get_functiondef(sig::regprocedure);
 IF position('interval ''4 minutes''' IN d)>0 THEN RETURN; END IF;
 FOR i IN 1..array_length(pairs,1) LOOP
  IF (length(d)-length(replace(d,pairs[i][1],'')))/length(pairs[i][1])<>1 THEN
   RAISE EXCEPTION 'Unknown %; inspect before applying 0269',sig;
  END IF;
  d:=replace(d,pairs[i][1],pairs[i][2]);
 END LOOP;
 EXECUTE d;
END $$;
SELECT pg_temp.patch_four('pg10_intent(uuid,text,text,bigint,integer,text,text,text)',ARRAY[
 ['minutes NOT BETWEEN 5 AND 60','minutes NOT BETWEEN 1 AND 60'],
 ['now()+make_interval(mins=>minutes)','now()+interval ''4 minutes''']]);
SELECT pg_temp.patch_four('pg05_create_intent(uuid,text,text,bigint,integer,text,text,text)',ARRAY[
 ['p_minutes NOT BETWEEN 5 AND 60','p_minutes NOT BETWEEN 1 AND 60'],
 ['now()+make_interval(mins=>p_minutes)','now()+interval ''4 minutes''']]);
COMMIT;
