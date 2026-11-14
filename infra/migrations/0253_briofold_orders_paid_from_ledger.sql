-- 0253 (control): the Orders list and the scanner show what the order payment ledger (0247) received.
-- "Verified paid" was only the sum of manually linked finance records, so an order the AI verified showed 0.
-- It is now the larger of the two figures: a payment that is both in the ledger and linked by hand is one payment,
-- so the figures are not added. Patched in place (like 0216/0234) so every other part of both functions is kept.
-- Requires 0247. Idempotent.
BEGIN;
DO $$DECLARE f regprocedure;d text;n text;BEGIN
 IF NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='commerce_orders' AND column_name='paid_minor') THEN
  RAISE EXCEPTION '0253 requires 0247' USING ERRCODE='42501';
 END IF;
 FOR f IN SELECT p.oid::regprocedure FROM pg_proc p WHERE p.pronamespace='public'::regnamespace AND p.proname IN('commerce_read','commerce_order_scan') LOOP
  d:=pg_get_functiondef(f);
  CONTINUE WHEN position('linked_verified_minor' IN d)=0 OR position('o.paid_minor) linked_verified_minor' IN d)>0;
  n:=regexp_replace(d,'coalesce\(\(SELECT sum\(f\.amount_minor\) FROM commerce_finance_links f\s+WHERE ([^)]*?f\.kind=''payment'')\),0\) linked_verified_minor',
   'greatest(coalesce((SELECT sum(f.amount_minor) FROM commerce_finance_links f WHERE \1),0),o.paid_minor) linked_verified_minor');
  IF n=d THEN RAISE EXCEPTION 'Unexpected definition of %',f;END IF;
  EXECUTE n;
 END LOOP;
END$$;
COMMIT;
