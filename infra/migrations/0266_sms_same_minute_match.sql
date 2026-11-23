-- Financial databases (sandbox and live). Owner decision 2026-11-23.
--
-- Bug: bKash/Nagad SMS carry the payment time to the minute only ("20:25"),
-- stored as 20:25:00 with time_precision='minute'. The customer typed their
-- number at 20:25:16 and paid at about 20:25:40, but every check required
-- "SMS time >= number time", so 20:25:00 < 20:25:16 never matched. Seen in
-- production on 17 Nov (two ৳99 payments: number, account, method, amount
-- all equal). The same happened at the other end: a payment in the last
-- minute before expiry needed the whole minute to fit inside the window.
--
-- Fix: for minute-precision SMS the minute is treated as a minute.
-- * start: the SMS minute may be the minute in which the number was entered
--   (briofold_sms_window_start = the window start rounded down to the minute);
-- * end:   the SMS minute only has to start before the window end.
-- Second-precision SMS keep the exact rule. Number, account, method and amount
-- must still be equal, and an SMS or attempt that already has a payment is
-- never matched again (unchanged constraints and checks).
--
-- Patched consistently in every place that applies the rule, including the
-- financial_verify_payment_fields trigger that guards financial_payments.
-- Safe to run twice; stops if a function is not the expected one.
BEGIN;
DO $$BEGIN
 IF to_regclass('public.financial_realm') IS NULL OR to_regclass('public.financial_receipt_observations') IS NULL
 THEN RAISE EXCEPTION '0266 requires a migrated financial database'; END IF;
END $$;

CREATE OR REPLACE FUNCTION briofold_sms_window_start(window_start timestamptz,precision_name text) RETURNS timestamptz
LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
 SELECT CASE WHEN precision_name='minute' THEN date_trunc('minute',window_start) ELSE window_start END
$$;

CREATE FUNCTION pg_temp.patch_minute(sig text,expected integer) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE d text; before text; n integer:=0; i integer; pairs text[][]:=ARRAY[
 ['o.original_transaction_at>=a.window_start','o.original_transaction_at>=briofold_sms_window_start(a.window_start,o.time_precision)'],
 ['o.original_transaction_at>=p.window_start','o.original_transaction_at>=briofold_sms_window_start(p.window_start,o.time_precision)'],
 ['p_time>=a.window_start','p_time>=briofold_sms_window_start(a.window_start,p_precision)'],
 ['o.original_transaction_at<a.window_start','o.original_transaction_at<briofold_sms_window_start(a.window_start,o.time_precision)'],
 ['o.original_transaction_at+interval ''1 minute''<=a.window_end','o.original_transaction_at<a.window_end'],
 ['o.original_transaction_at+interval ''1 minute''<=p.window_end','o.original_transaction_at<p.window_end'],
 ['p_time+interval ''1 minute''<=a.window_end','p_time<a.window_end'],
 ['o.original_transaction_at+interval ''1 minute''>a.window_end','o.original_transaction_at>=a.window_end']];
BEGIN
 d:=pg_get_functiondef(sig::regprocedure);
 IF position('briofold_sms_window_start(' IN d)>0 THEN RETURN; END IF;
 FOR i IN 1..array_length(pairs,1) LOOP
  before:=d;
  d:=replace(d,pairs[i][1],pairs[i][2]);
  n:=n+(length(before)-length(replace(before,pairs[i][1],'')))/length(pairs[i][1]);
 END LOOP;
 IF n<>expected THEN
  RAISE EXCEPTION 'Unknown %: % time checks, expected %; inspect before applying 0266',sig,n,expected;
 END IF;
 EXECUTE d;
END $$;

SELECT pg_temp.patch_minute('pg06_phone_candidate(uuid,text,text,bigint,timestamptz,text)',2);
SELECT pg_temp.patch_minute('pg07_candidates(uuid,text,uuid)',2);
SELECT pg_temp.patch_minute('pg07_match(uuid,bigint)',8);
SELECT pg_temp.patch_minute('pg11_late_phone_receipt_case()',2);
SELECT pg_temp.patch_minute('pg61_transaction_lookup(uuid,text,uuid,text,text,bigint)',1);
SELECT pg_temp.patch_minute('financial_verify_payment_fields()',2);
COMMIT;
