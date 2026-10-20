-- Phase4 onboarding metadata belongs to the control plane, not the five-field
-- public Store/Checkout identity contract. Additive; old rows remain valid.
BEGIN;
DO $$BEGIN
 IF to_regclass('public.briofold_business_onboarding') IS NULL
 OR to_regclass('public.financial_realm') IS NOT NULL
 THEN RAISE EXCEPTION '0132 requires the control database onboarding schema'; END IF;
END $$;
ALTER TABLE briofold_business_onboarding
 ADD COLUMN IF NOT EXISTS business_type text CHECK(business_type IN ('online','physical','service','other')),
 ADD COLUMN IF NOT EXISTS description text NOT NULL DEFAULT ''
  CHECK(length(description)<=60 AND description!~'[[:cntrl:]]');
COMMIT;
