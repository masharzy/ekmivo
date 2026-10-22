-- Control only. Preserve existing coupon identity and append immutable revisions.
BEGIN;
SET LOCAL lock_timeout='5s';
SET LOCAL statement_timeout='30s';
DO $$ BEGIN
 IF current_database()<>'ekmivo'
 OR to_regclass('public.platform_subscription_coupons') IS NULL
 OR to_regclass('public.financial_realm') IS NOT NULL
 THEN RAISE EXCEPTION '0145 requires Ekmivo control after 0135'; END IF;
END $$;

-- SQL CHECK and IF treat NULL as unknown: reject an omitted percentage explicitly.
-- Do not edit the already checksum-installed 0134 migration.
DO $patch$
DECLARE original text; needle text := 'next_percent NOT BETWEEN 1 AND 10000 OR next_fixed IS NOT NULL';
BEGIN
 SELECT pg_get_functiondef('platform_subscription_coupon_admin(uuid,text,jsonb)'::regprocedure) INTO original;
 IF (length(original)-length(replace(original,needle,'')))/length(needle)<>1
 THEN RAISE EXCEPTION 'coupon admin source changed; review 0145'; END IF;
 EXECUTE replace(original,needle,'next_percent IS NULL OR next_percent NOT BETWEEN 1 AND 10000 OR next_fixed IS NOT NULL');
END $patch$;
ALTER TABLE platform_subscription_coupons ADD CONSTRAINT subscription_coupon_nonnull_percentage
 CHECK(discount_kind<>'percent' OR percent_bps IS NOT NULL) NOT VALID;
ALTER TABLE platform_subscription_coupons VALIDATE CONSTRAINT subscription_coupon_nonnull_percentage;

CREATE TABLE platform_subscription_coupon_versions (
 coupon_id uuid NOT NULL REFERENCES platform_subscription_coupons(id) ON DELETE RESTRICT,
 revision bigint NOT NULL CHECK(revision>0),
 snapshot jsonb NOT NULL CHECK(jsonb_typeof(snapshot)='object'),
 recorded_at timestamptz NOT NULL DEFAULT now(),
 PRIMARY KEY(coupon_id,revision)
);
ALTER TABLE platform_subscription_coupon_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE platform_subscription_coupon_versions FORCE ROW LEVEL SECURITY;
DO $$ BEGIN
 EXECUTE format('CREATE POLICY subscription_coupon_versions_owner ON platform_subscription_coupon_versions TO %I USING(true) WITH CHECK(true)',current_user);
END $$;
REVOKE ALL ON platform_subscription_coupon_versions FROM PUBLIC;
DO $$ DECLARE role_name text; BEGIN
 FOREACH role_name IN ARRAY ARRAY['ekmivo_runtime','ekmivo_financial_runtime','ekmivo_financial_projection'] LOOP
 IF EXISTS(SELECT 1 FROM pg_roles WHERE rolname=role_name) THEN
 EXECUTE format('REVOKE ALL ON platform_subscription_coupon_versions FROM %I',role_name);
 END IF; END LOOP;
END $$;
INSERT INTO platform_subscription_coupon_versions(coupon_id,revision,snapshot)
 SELECT id,revision,to_jsonb(c) FROM platform_subscription_coupons c;
CREATE FUNCTION subscription_coupon_record_version() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
 IF TG_OP='UPDATE' AND NEW.revision<>OLD.revision+1 THEN
 RAISE EXCEPTION 'coupon revision must advance once' USING ERRCODE='40001'; END IF;
 INSERT INTO platform_subscription_coupon_versions(coupon_id,revision,snapshot)
 VALUES(NEW.id,NEW.revision,to_jsonb(NEW));
 RETURN NEW;
END $$;
CREATE TRIGGER subscription_coupon_version AFTER INSERT OR UPDATE ON platform_subscription_coupons
 FOR EACH ROW EXECUTE FUNCTION subscription_coupon_record_version();
CREATE FUNCTION subscription_coupon_version_immutable() RETURNS trigger
LANGUAGE plpgsql SET search_path=pg_catalog,public,pg_temp AS $$ BEGIN
 RAISE EXCEPTION 'coupon history is immutable' USING ERRCODE='42501';
END $$;
CREATE TRIGGER subscription_coupon_version_no_mutation BEFORE UPDATE OR DELETE ON platform_subscription_coupon_versions
 FOR EACH ROW EXECUTE FUNCTION subscription_coupon_version_immutable();
REVOKE ALL ON FUNCTION subscription_coupon_record_version() FROM PUBLIC;
REVOKE ALL ON FUNCTION subscription_coupon_version_immutable() FROM PUBLIC;
COMMIT;
