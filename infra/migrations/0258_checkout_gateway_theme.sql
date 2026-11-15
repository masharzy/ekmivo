-- 0258: allow the checkout theme 'gateway' (web theme "Official", behind BRIOFOLD_CHECKOUT_GATEWAY_THEME_ENABLED).
-- Only dashboard_checkout_theme_write's theme allowlist changes; the function is rewritten from its own current
-- definition, so owner, grants and everything else stay as they are. Guarded by the production md5(prosrc);
-- running it twice is safe. No data changes.
DO $m$
DECLARE
  old_md5 constant text := 'e7d0fd7ef32f6f737bc60d056e2c0f7c';
  cur text; def text; fn regprocedure;
  a constant text := $q$'official','receipt','studio','sheet','hero','rail','journal','dial','night'$q$;
  b constant text := $q$'official','gateway','receipt','studio','sheet','hero','rail','journal','dial','night'$q$;
BEGIN
  IF (SELECT count(*) FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname='public' AND p.proname='dashboard_checkout_theme_write')<>1 THEN
    RAISE EXCEPTION '0258: dashboard_checkout_theme_write is not unique; nothing was changed';
  END IF;
  SELECT p.oid::regprocedure, md5(p.prosrc), pg_get_functiondef(p.oid) INTO fn, cur, def
    FROM pg_proc p JOIN pg_namespace s ON s.oid=p.pronamespace WHERE s.nspname='public' AND p.proname='dashboard_checkout_theme_write';
  IF position(b IN def)>0 THEN
    RETURN; -- already applied
  END IF;
  IF cur<>old_md5 OR (length(def)-length(replace(def,a,'')))/length(a)<>1 THEN
    RAISE EXCEPTION '0258: dashboard_checkout_theme_write is not the expected production source; nothing was changed';
  END IF;
  EXECUTE replace(def,a,b);
  IF (SELECT position(b IN pg_get_functiondef(fn)))=0 THEN
    RAISE EXCEPTION '0258: theme allowlist not updated';
  END IF;
END
$m$;
