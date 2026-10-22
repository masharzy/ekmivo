# Store-first checkout: control DB runtime-role release evidence

Status: isolated-database validation complete; production activation **BLOCKED** until the release gates below are satisfied. This note does not supersede the Phase 3–7 handoffs or the unified manual-verification ledger.

## Scope and corrective change

The authenticated Go API uses `ekmivo_financial_runtime`, a SQL-managed role without `BYPASSRLS`, role creation, or the `neon_superuser` membership. Several Phase 3–7 `SECURITY DEFINER` subscription entrypoints instead granted execution only to the legacy `ekmivo_runtime`. On the production control database that legacy role is elevated, so it must **not** be used for HTTP traffic.

Migration `0155_platform_subscription_safe_runtime_grants.sql` grants only named API/public/admin entrypoints to `ekmivo_financial_runtime`; it does not grant table access or payment settlement/reconciliation/recovery entrypoints. It guards the database realm, predecessor schema, and effective runtime-role safety. The authenticated function implementations retain their own actor/Store/Admin checks.

## Real PostgreSQL isolated proof, 2026-10-22

- Neon project `sparkling-mountain-38618629`, isolated branch `br-wandering-cake-b3jpctrp`, database `ekmivo`, cloned from the production control branch.
- Migration order applied transactionally on that branch: `0146`, `0147`, `0148`, `0149`, `0151`, `0152`, `0153`, `0154`, then `0155`. No corresponding production migration was applied by this isolated test.
- `tools/testing/subscription-runtime-grants.sql` completed successfully. Its 12 named required API functions were executable; none of four sampled protected raw tables was directly accessible; none of four worker-only functions was executable.
- A separate direct connection **as** `ekmivo_financial_runtime` confirmed `current_user` matched the target role, guarded operations `EXECUTE=true`, raw handoffs `SELECT=false`, and payment-worker pending `EXECUTE=false`.
- Control-production preflight backup `br-ancient-cell-b3hme1x2` was preserved; a temporary clone from it was queried successfully to rehearse recoverability. Existing user data and financial Live/Sandbox realms were not altered.

## Production cutover gates

1. Pass exact-SHA GitHub `Store Subscription Phase 7 — Release Readiness` jobs with a disposable PostgreSQL service and real browser API-backed tests. Record the pushed SHA, workflow run, and results here.
2. Before applying control migrations, re-check fresh production ledger checksums, role privileges, predecessor order, available verified backup/restore point, and the absence of unauthorized schema drift. Apply the **source-exact** migrations and checksum ledger rows atomically, in order. Never replay or overwrite a previously applied migration under different content; never run release fixtures on production.
3. Re-run the read-only 0155 acceptance SQL and check production control ledger, API health and logs. This does not itself activate checkout.
4. The current Vercel web `DATABASE_URL` uses the owner-privileged `ekmivo_owner` role. Rotate to an audited least-privilege web runtime only after existing auth/onboarding/dashboard operations pass against that role on an isolated clone. The web credential is **not** changed by 0155. Do not enable checkout traffic while this known privilege gate is open.
5. Vercel web production was still serving an older source SHA (`17eef22`) while Render API served merged Phase 3–7 source (`63a5839`); a Vercel deployments/day quota response `402` blocked a fresh web deployment. Do not claim production rollout or bypass that limit through preview promotion. Require a successful current-source deployment before product E2E validation.
6. Keep `EKMIVO_SUBSCRIPTION_ORDER_QUOTE_ENABLED`, `EKMIVO_SUBSCRIPTION_ORDER_CONFIRM_ENABLED`, and `EKMIVO_SUBSCRIPTION_PHASE6_HANDOFF_ENABLED` disabled until staged rollout checks pass. Human/provider-money evidence is separately owned by the user.

The control-schema migration by itself is not a claim that customer payments are enabled or verified.
