# Dashboard and merchant API refinement — 2026-10-15

Implementation evidence, not production acceptance. Source is uncommitted; no deployment or production migration was performed.

## Changes

Original dashboard tokens and layout, compact overview, reduced navigation, workspace tabs, Payments search/filter/columns and URL state, compact document lists, SMS details restricted to managing sessions, persistent inline feedback plus toasts, simple payment aliases and optional automatic signed webhook binding. Existing intent APIs/default endpoints remain compatible. Team SQL ambiguity corrected in additive control migration 0065. Developer documentation includes both flows and a server-verifying idempotent Node receiver in `examples/simple-payment/webhook.mjs`.

## Verified

- `go test ./...` in backend: passed all packages.
- TypeScript noEmit: passed. Contract generation and strict OpenAPI validation: passed, 47 operations. Node receiver syntax: passed.
- Isolated Neon branch `br-silent-breeze-b32znlqj` of project `sparkling-mountain-38618629`: financial migrations 0063/0064 and control 0065 applied. Rollback-only fixture exercises binding isolation/immutability/idempotency, routing/default compatibility, virtual invoice read models and permissions. Passed; no fixture endpoints remain. Copied-record aggregate payer totals/counts and verified event invoice/status callback enrichment passed. Team read succeeds after 0065; production read exposed the original role ambiguity.
- Development browser: 16 overview combinations of EN/BN, light/dark and 320/768/1024/1440 widths passed horizontal overflow and heading overlap checks (`layout-results.json`). Payment columns toggle, URL-backed method filter, invalid-date inline error/toast, and failed-refresh retained rows/toast were observed. Screenshots use fictional labeled development data; fixture routes are removed from final source. System OS preference changes and genuine backend browser integration remain pending.

## Limitations and rollout

Migration 0063/0064 must be applied through the existing financial migration runner with explicit guards, and 0065 through the existing control runner guard, before the corresponding deployed behavior is accepted. Production remains unchanged. No real payment, receiver delivery, SMS-device or fulfillment acceptance is claimed. See the single `docs/MANUAL-VERIFICATION.md` ledger.

Docker was mistakenly started for disposable testing, then its container and Docker Desktop were stopped after the owner's correction. All SQL evidence above uses Neon. The Neon test branch remains for review; deletion requires authorization. Skill validator could not run because system Python lacks PyYAML; this is not a validator pass.

## Release preparation

Owner requested production push on 2026-10-15. Full web lint passes with 20 existing warnings and zero errors after repairing Billing effect scheduling and time reads. Generated extension contract drift was regenerated and contract-check passes. TypeScript and generated example typechecks pass. The first production migration attempt was rejected by automatic approval review before execution because the normal runner also enters the PG04/River base path. Added explicit `BRIOFOLD_DASHBOARD_UPGRADE_ONLY=true` mode to the same runner, requiring all three new migration flags and returning before all base/unrelated migrations. Production application remains pending explicit narrowed authorization.


## Production migration rollout — 2026-10-15

After explicit owner approval (push + migrations), existing financial-migrate runner with `BRIOFOLD_DASHBOARD_UPGRADE_ONLY=true` successfully applied only 0063/0064 to production Neon Sandbox/Live financial databases and 0065 to the control database at 2026-10-15 14:11 UTC. Runner confirmed no base migrations executed. Catalog probes confirm both financial migrations and the Team role fix. Before/after counts unchanged: Sandbox intents 15/payments 2/endpoints 1; Live intents 21/payments 3/endpoints 0. Runtime rollout and actual payment/browser E2E remain separate gates.
