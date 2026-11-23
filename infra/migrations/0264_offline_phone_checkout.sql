-- Financial databases (sandbox and live). Owner decision 2026-11-22:
-- a checkout must never be refused only because the shop's SMS phone is
-- offline. The customer still pays; verification happens when the SMS
-- arrives, or the shop checks the customer's receipt by hand.
--
-- Today every live checkout path asks "has a paired phone or device sent a
-- heartbeat in the last 20 (phone) or 5 (device) minutes?" and refuses with
-- 'live source unavailable' / 'receiving route not available' when not.
--
-- This migration adds briofold_offline_checkout(), true only when the API's
-- connection carries briofold.offline_checkout=on. The API sets that only
-- when BRIOFOLD_OFFLINE_CHECKOUT_ENABLED=true. Every heartbeat predicate in
-- the checkout paths becomes "(<heartbeat check> OR briofold_offline_checkout())".
-- Flag off (no setting) = exactly the old behaviour.
--
-- Still required with the flag on: an enabled receiving account, and a phone
-- or device that was paired, not revoked and has SMS permission. Only the
-- "recently seen" part is relaxed.
--
-- Not changed on purpose:
-- * pg110_public_workspace_accounts.source_online and the checkout's own
--   `online` (source_online) stay honest, so the checkout can tell the
--   customer the phone is offline.
-- * SMS matching, amounts and verification are untouched.
--
-- Safe to run twice: a patched function is skipped; a function whose text is
-- not the expected one stops the migration.
BEGIN;
DO $$BEGIN
 IF to_regclass('public.financial_realm') IS NULL OR to_regclass('public.pg06_phones') IS NULL
 THEN RAISE EXCEPTION '0264 requires a migrated financial database'; END IF;
END $$;

CREATE OR REPLACE FUNCTION briofold_offline_checkout() RETURNS boolean
LANGUAGE sql STABLE SET search_path=public,pg_temp AS $$
 SELECT coalesce(current_setting('briofold.offline_checkout',true),'')='on'
$$;

CREATE FUNCTION pg_temp.patch_offline(sig text,protect text[],expected integer) RETURNS void
LANGUAGE plpgsql AS $$
DECLARE d text; before text; n integer:=0; i integer; pairs text[]:=ARRAY[
 'd.heartbeat_at>now()-interval ''5 minutes''',
 'device.heartbeat_at>now()-interval ''5 minutes''',
 'phone.heartbeat_at>now()-interval ''20 minutes''',
 'p.heartbeat_at>now()-interval ''20 minutes'''];
BEGIN
 d:=pg_get_functiondef(sig::regprocedure);
 IF position('briofold_offline_checkout()' IN d)>0 THEN RETURN; END IF;
 -- Statements that report whether the phone is really online keep the
 -- plain check: swap them out, patch, swap back.
 FOR i IN 1..coalesce(array_length(protect,1),0) LOOP
  IF (length(d)-length(replace(d,protect[i],'')))/length(protect[i])<>1 THEN
   RAISE EXCEPTION 'Unknown % (protected text not found once: %); inspect before applying 0264',sig,left(protect[i],80);
  END IF;
  d:=replace(d,protect[i],'@@0264_protect_'||i||'@@');
 END LOOP;
 FOR i IN 1..array_length(pairs,1) LOOP
  before:=d;
  d:=replace(d,pairs[i],'('||pairs[i]||' OR briofold_offline_checkout())');
  n:=n+(length(before)-length(replace(before,pairs[i],'')))/length(pairs[i]);
 END LOOP;
 IF n<>expected THEN
  RAISE EXCEPTION 'Unknown %: % heartbeat checks, expected %; inspect before applying 0264',sig,n,expected;
 END IF;
 FOR i IN 1..coalesce(array_length(protect,1),0) LOOP
  d:=replace(d,'@@0264_protect_'||i||'@@',protect[i]);
 END LOOP;
 EXECUTE d;
END $$;

-- 1. Create a checkout (merchant API, payment links, invoices, AI orders, billing).
SELECT pg_temp.patch_offline('briofold_payment_intent_insert(uuid,text,text,bigint,timestamptz,text,text,text)',ARRAY[]::text[],2);
-- 2. Customer enters their number (automatic account choice).
SELECT pg_temp.patch_offline('pg10_lock_route(text,text,text,text)',ARRAY[]::text[],2);
-- 3. Customer enters their number on a chosen account tile.
SELECT pg_temp.patch_offline('pg98_lock_account(text,text,text,text,uuid)',ARRAY[]::text[],2);
-- 4. Payment methods offered on public pages.
SELECT pg_temp.patch_offline('pg10_public_payment_sources(uuid,text)',ARRAY[]::text[],2);
-- 5. Checkout view: methods and sources lists; `online` stays the real state.
SELECT pg_temp.patch_offline('pg10_checkout_view(text)',ARRAY[
 'd.account_id=a.receiving_account_id AND d.revoked_at IS NULL AND d.permission_ok AND d.heartbeat_at>now()-interval ''5 minutes''',
 'AND phone.heartbeat_at>now()-interval ''20 minutes'')) INTO online;'],4);
COMMIT;
