-- Control only. Explicit approved tax rules; no assumed rate or exemption.
-- Taxable base = subtotal - annual - bundle - coupon discounts, with half-up
-- minor-unit rounding. The operator must approve applicability/legal treatment.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF current_database()<>'ekmivo' OR to_regclass('public.financial_realm') IS NOT NULL
 OR to_regprocedure('public.platform_subscription_coupon_quote(uuid,uuid,uuid,bigint,text)') IS NULL
 OR NOT EXISTS(SELECT 1 FROM information_schema.columns WHERE table_name='platform_subscription_coupons' AND column_name='eligible_terms')
 THEN RAISE EXCEPTION '0148 requires control after 0147'; END IF;
END $$;

CREATE TABLE platform_subscription_tax_policies (
 id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
 product text NOT NULL CHECK(product IN ('payments','ai_credit','bundle')),
 term text NOT NULL CHECK(term IN ('monthly','yearly','one_time')),
 rate_bps integer NOT NULL CHECK(rate_bps BETWEEN 0 AND 10000),
 revision bigint NOT NULL DEFAULT 1 CHECK(revision>0),
 approved_by uuid NOT NULL REFERENCES app_users(id),
 reason text NOT NULL CHECK(length(reason) BETWEEN 10 AND 500),
 updated_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(product,term),UNIQUE(id,revision)
);
CREATE TABLE platform_subscription_tax_policy_versions (
 policy_id uuid NOT NULL REFERENCES platform_subscription_tax_policies(id) ON DELETE RESTRICT,
 revision bigint NOT NULL CHECK(revision>0),
 snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
 recorded_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(policy_id,revision)
);
DO $secure$
DECLARE tbl text;
BEGIN
 FOREACH tbl IN ARRAY ARRAY['platform_subscription_tax_policies','platform_subscription_tax_policy_versions'] LOOP
  EXECUTE format('ALTER TABLE %I ENABLE ROW LEVEL SECURITY',tbl);
  EXECUTE format('ALTER TABLE %I FORCE ROW LEVEL SECURITY',tbl);
  EXECUTE format('CREATE POLICY %I ON %I TO %I USING(true) WITH CHECK(true)',tbl||'_owner',tbl,current_user);
  EXECUTE format('REVOKE ALL ON %I FROM PUBLIC,ekmivo_runtime,ekmivo_financial_runtime',tbl);
 END LOOP;
END $secure$;

CREATE FUNCTION subscription_tax_record_version() RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
 SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
 IF TG_OP='UPDATE' AND NEW.revision<>OLD.revision+1 THEN
  RAISE EXCEPTION 'tax revision must advance once' USING ERRCODE='40001'; END IF;
 INSERT INTO platform_subscription_tax_policy_versions(policy_id,revision,snapshot)
 VALUES(NEW.id,NEW.revision,to_jsonb(NEW));
 RETURN NEW;
END $$;
CREATE TRIGGER subscription_tax_version AFTER INSERT OR UPDATE ON platform_subscription_tax_policies
 FOR EACH ROW EXECUTE FUNCTION subscription_tax_record_version();
CREATE TRIGGER subscription_tax_version_no_mutation BEFORE UPDATE OR DELETE ON platform_subscription_tax_policy_versions
 FOR EACH ROW EXECUTE FUNCTION subscription_coupon_version_immutable();
REVOKE ALL ON FUNCTION subscription_tax_record_version() FROM PUBLIC;

ALTER TABLE platform_subscription_purchase_quotes ADD COLUMN tax_policy_id uuid;
ALTER TABLE platform_subscription_purchase_quotes ADD COLUMN tax_policy_revision bigint;
ALTER TABLE platform_subscription_purchase_quotes ADD CONSTRAINT subscription_quote_tax_version_fk
 FOREIGN KEY(tax_policy_id,tax_policy_revision) REFERENCES platform_subscription_tax_policy_versions(policy_id,revision);
ALTER TABLE platform_subscription_purchase_quotes ADD CONSTRAINT subscription_quote_tax_snapshot_pair
 CHECK((tax_policy_id IS NULL)=(tax_policy_revision IS NULL));

CREATE FUNCTION platform_subscription_tax_admin(actor uuid, operation text, payload jsonb DEFAULT '{}'::jsonb)
RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$
DECLARE product_name text; term_name text; amount integer; old_rev bigint; memo text;
 policy platform_subscription_tax_policies; result jsonb;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM platform_administrators p JOIN app_users u ON u.id=p.user_id
  WHERE p.user_id=actor AND p.role='super_admin' AND u.disabled_at IS NULL)
 THEN RAISE EXCEPTION 'FORBIDDEN' USING ERRCODE='42501'; END IF;
 IF jsonb_typeof(payload) IS DISTINCT FROM 'object' OR pg_column_size(payload)>4096
 THEN RAISE EXCEPTION 'INVALID_TAX_REQUEST' USING ERRCODE='22023'; END IF;
 IF operation='list' THEN
  RETURN jsonb_build_object('rules',coalesce((SELECT jsonb_agg(to_jsonb(p) ORDER BY product,term)
    FROM platform_subscription_tax_policies p),'[]'::jsonb));
 END IF;
 IF operation<>'save' THEN RAISE EXCEPTION 'INVALID_TAX_REQUEST' USING ERRCODE='22023'; END IF;
 product_name:=payload->>'product';term_name:=payload->>'term';
 IF product_name NOT IN ('payments','ai_credit','bundle') OR term_name NOT IN ('monthly','yearly','one_time')
 OR payload->>'rate_bps' IS NULL OR payload->>'rate_bps' !~ '^(0|[1-9][0-9]{0,4})$'
 OR payload->>'revision' IS NULL OR payload->>'revision' !~ '^(0|[1-9][0-9]{0,15})$'
 THEN RAISE EXCEPTION 'INVALID_TAX_REQUEST' USING ERRCODE='22023'; END IF;
 amount:=(payload->>'rate_bps')::integer;old_rev:=(payload->>'revision')::bigint;
 memo:=trim(coalesce(payload->>'reason',''));
 IF amount NOT BETWEEN 0 AND 10000 OR length(memo) NOT BETWEEN 10 AND 500
 THEN RAISE EXCEPTION 'INVALID_TAX_REQUEST' USING ERRCODE='22023'; END IF;
 -- Single global lock orders rule changes against concurrent quote mutation.
 PERFORM pg_advisory_xact_lock(hashtextextended('platform-subscription-coupon-capacity',0));
 SELECT * INTO policy FROM platform_subscription_tax_policies WHERE product=product_name AND term=term_name FOR UPDATE;
 IF policy.id IS NULL THEN
  IF old_rev<>0 THEN RAISE EXCEPTION 'TAX_REVISION_CHANGED' USING ERRCODE='40001'; END IF;
  INSERT INTO platform_subscription_tax_policies(product,term,rate_bps,approved_by,reason)
  VALUES(product_name,term_name,amount,actor,memo) RETURNING * INTO policy;
 ELSE
  IF policy.revision<>old_rev THEN RAISE EXCEPTION 'TAX_REVISION_CHANGED' USING ERRCODE='40001'; END IF;
  UPDATE platform_subscription_tax_policies SET rate_bps=amount,revision=revision+1,
   approved_by=actor,reason=memo,updated_at=statement_timestamp()
   WHERE id=policy.id RETURNING * INTO policy;
 END IF;
 INSERT INTO platform_admin_audit(actor_id,action,description)
 VALUES(actor,'subscription_tax.save',
 left(product_name||'/'||term_name||' | bps='||amount||' | revision='||policy.revision||' | '||memo,2000));
 RETURN jsonb_build_object('id',policy.id,'revision',policy.revision,'rate_bps',policy.rate_bps);
END $$;
REVOKE ALL ON FUNCTION platform_subscription_tax_admin(uuid,text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION platform_subscription_tax_admin(uuid,text,jsonb) TO ekmivo_runtime;

-- The quote function always validates its previous tax against the current,
-- owner-approved policy. Changed policy revisions require a source re-quote.
-- Without a policy, even a zero-tax value is not silently treated as exempt.
DO $patch$
DECLARE source text; needle text;
BEGIN
 SELECT pg_get_functiondef('platform_subscription_coupon_quote(uuid,uuid,uuid,bigint,text)'::regprocedure) INTO source;
 needle:=' used bigint; store_used bigint; n bigint; stamp timestamptz:=statement_timestamp();';
 IF position(needle in source)=0 THEN RAISE EXCEPTION '0148 declaration drift'; END IF;
 source:=replace(source,needle,' used bigint; store_used bigint; n bigint; computed_tax bigint;
 rule platform_subscription_tax_policies; stamp timestamptz:=statement_timestamp();');
 needle:=' IF q.tax_minor<>0 THEN RAISE EXCEPTION ''TAX_REQUOTE_REQUIRED'' USING ERRCODE=''23514''; END IF;';
 IF position(needle in source)=0 THEN RAISE EXCEPTION '0148 tax source drift'; END IF;
 source:=replace(source,needle,' SELECT p.* INTO rule FROM platform_subscription_tax_policies p
 JOIN platform_subscription_offers o ON o.product=p.product
 WHERE o.offer_key=v.offer_key AND p.term=v.term;
 IF rule.id IS NULL THEN RAISE EXCEPTION ''TAX_POLICY_REQUIRED'' USING ERRCODE=''23514''; END IF;
 IF q.tax_policy_revision IS NOT NULL AND
 (q.tax_policy_id<>rule.id OR q.tax_policy_revision<>rule.revision)
 THEN RAISE EXCEPTION ''TAX_REQUOTE_REQUIRED'' USING ERRCODE=''23514''; END IF;
 computed_tax:=floor(((q.subtotal_minor-q.annual_discount_minor-q.bundle_discount_minor-
 q.coupon_discount_minor)::numeric*rule.rate_bps+5000)/10000)::bigint;
 IF q.tax_minor<>computed_tax THEN RAISE EXCEPTION ''TAX_REQUOTE_REQUIRED'' USING ERRCODE=''23514''; END IF;');
 needle:=' IF normalized<>'''' THEN';
 IF position(needle in source)=0 THEN RAISE EXCEPTION '0148 available base drift'; END IF;
 source:=replace(source,needle,' available:=q.subtotal_minor-q.annual_discount_minor-q.bundle_discount_minor;
 IF normalized<>'''' THEN');
 needle:=' -- Zero-due activation requires a separate owner-approved entitlement policy.';
 IF position(needle in source)=0 THEN RAISE EXCEPTION '0148 discount source drift'; END IF;
 source:=replace(source,needle,' computed_tax:=floor(((available-discount)::numeric*rule.rate_bps+5000)/10000)::bigint;
 -- Zero-due activation requires a separate owner-approved entitlement policy.');
 needle:='-discount+q.tax_minor<=0';
 IF (length(source)-length(replace(source,needle,'')))/length(needle)<>1 THEN RAISE EXCEPTION '0148 zero due drift'; END IF;
 source:=replace(source,needle,'-discount+computed_tax<=0');
 needle:='subtotal_minor,annual_discount_minor,bundle_discount_minor,coupon_discount_minor,tax_minor,total_minor,expires_at)';
 IF position(needle in source)=0 THEN RAISE EXCEPTION '0148 quote insert drift'; END IF;
 source:=replace(source,needle,
 'subtotal_minor,annual_discount_minor,bundle_discount_minor,coupon_discount_minor,tax_minor,total_minor,expires_at,tax_policy_id,tax_policy_revision)');
 needle:='q.tax_minor,q.subtotal_minor-q.annual_discount_minor-q.bundle_discount_minor-discount+q.tax_minor,';
 IF position(needle in source)=0 THEN RAISE EXCEPTION '0148 quote value drift'; END IF;
 source:=replace(source,needle,
 'computed_tax,q.subtotal_minor-q.annual_discount_minor-q.bundle_discount_minor-discount+computed_tax,');
 needle:='least(i.expires_at,stamp+interval ''15 minutes'',coalesce(c.expires_at,i.expires_at))) RETURNING * INTO fresh;';
 IF position(needle in source)=0 THEN RAISE EXCEPTION '0148 quote end drift'; END IF;
 source:=replace(source,needle,
 'least(i.expires_at,stamp+interval ''15 minutes'',coalesce(c.expires_at,i.expires_at)),rule.id,rule.revision) RETURNING * INTO fresh;');
 EXECUTE source;
END $patch$;
COMMIT;
