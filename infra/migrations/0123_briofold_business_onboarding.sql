-- Briofold Phase 4. Control-plane-only onboarding state. Existing businesses
-- without an explicit row remain grandfathered and NEVER get blocked.
BEGIN;
DO $$BEGIN
 IF to_regclass('public.workspaces') IS NULL OR to_regclass('public.financial_realm') IS NOT NULL
 THEN RAISE EXCEPTION 'Briofold onboarding requires the control database'; END IF;
END $$;
CREATE TABLE IF NOT EXISTS briofold_business_onboarding (
 workspace_id uuid PRIMARY KEY REFERENCES workspaces(id) ON DELETE CASCADE,
 owner_id uuid NOT NULL REFERENCES app_users(id),
 step text NOT NULL DEFAULT 'business' CHECK(step IN ('business','services','billing','complete')),
 selected_gateway_plan_id text,
 completed_at timestamptz,
 updated_at timestamptz NOT NULL DEFAULT now(),
 CONSTRAINT briofold_completed_consistent CHECK ((step='complete')=(completed_at IS NOT NULL))
);
CREATE INDEX IF NOT EXISTS briofold_onboarding_owner_idx ON briofold_business_onboarding(owner_id,step);
ALTER TABLE briofold_business_onboarding ENABLE ROW LEVEL SECURITY;
ALTER TABLE briofold_business_onboarding FORCE ROW LEVEL SECURITY;
DO $$BEGIN
 IF NOT EXISTS(SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='briofold_business_onboarding' AND policyname='briofold_business_onboarding_owner') THEN
  EXECUTE format('CREATE POLICY briofold_business_onboarding_owner ON public.briofold_business_onboarding TO %I USING(true) WITH CHECK(true)',current_user);
 END IF;
END $$;
REVOKE ALL ON briofold_business_onboarding FROM PUBLIC,ekmivo_financial_runtime,ekmivo_financial_projection;
COMMIT;
