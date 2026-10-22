# Ekmivo Store-first subscription Phase 6 — NOT SEALED (review candidate)

**Status:** IN PROGRESS / DEPENDENCY-BLOCKED, **not** PHASE 6 — CODE-LEVEL SEALED.  
**Branch:** `agents/store-subscription-phase6-payment-activation`  
**Source base:** `main` at `1cefe6393a702974052d422e549018de6388c74f`.  
**Change set:** See branch tip / draft PR commits (the evidence document itself is committed after the implementation).  
**Implementation date:** 2026-10-22.  
**Migration:** `0150_platform_subscription_payment_handoff.sql` (control database ONLY; **not applied**, not production-authorized).

## Scope and dependency order

Phase 6 here means **Store-first SaaS subscription payment handoff**, not the unrelated AI Studio/Inbox Phase 6. The latest master and checkout execution plans require Phase 2 versioned quote and final plan/interval fulfillment, Phase 3 coupon concurrency and reservation, Phase 4 durable purchase intent, and Phase 5 confirmed legal/quote/invoice snapshot. Phase 2 is merged. Phase 3 PR #137 and Phase 4 PR #140 remain draft/unmerged; the Phase 5 branch is currently identical to main, so these predecessors are **not integrated** on the current source. The Order Summary still has `purchaseEnabled={false}`. This branch builds the separate payment-stage boundary and worker scaffolding, but MUST NOT be merged/enabled until 2 → 3 → 4 → 5 → 6 have been integrated and re-tested.

The introduced `EKMIVO_SUBSCRIPTION_PAYMENT_ENABLED` flag defaults to OFF in Go worker/handler and Next wallet/status pages. Do not set it in production.

## 2026-10-22 stop-ship correction

PR #139 review exposed a migration-number collision: Phase 3 already uses/applied `0145_platform_subscription_coupon_versions.sql`. The Phase 6 unapplied migration was **renamed to `0150_platform_subscription_payment_handoff.sql`**, deliberately sequenced after draft Phase 4's `0148`; it is still **not registered with the release migration coordinator** and must not run before approved Phase 3–5 integration. No production SQL change was made. The bounded reconciliation cursor now atomically advances `last_reconciled_at` on each batch of 50 rows (`FOR UPDATE SKIP LOCKED`), so old expired/cancelled cases cannot permanently starve newer money evidence. Source contract tests are registered in Foundation CI. The function/permission/tenant/financial isolation checks on real PostgreSQL remain outstanding.

## Source changes and intended state machine

- `backend/internal/subscriptionpayment/policy.go`: pure decision contracts; reject cross-Store receiver, non-integer/zero due, unapproved source, yearly/bundle/AI recurring ambiguity; only matched Live verified evidence allows activation, late terminal money needs recovery.
- `backend/internal/checkout/subscription_payment.go`: new authenticated Store-scoped Go GET/POST payment endpoints. POST takes only prior confirmed quote+invoice IDs, not amount; pins system receiver; validates an approved live parser/source; stores SHA-256 token locator, then invokes existing idempotent `pg10_intent` with 60-minute limit. No browser paid mutation.
- `backend/internal/checkout/subscription_payment_recovery.go` plus `maintenance_worker.go`: Live worker sweeps durable immutable digests after a tab closes, after crashes/restarts, and after signing-key rotation. Legacy PG13 invoice sweep explicitly skips Phase 6 invoice handoffs.
- `infra/migrations/0150_platform_subscription_payment_handoff.sql`: control ledger, lock-backed idempotent bind, Store/published legal/quote/coupon snapshots, worker-only verified settlement and exactly-once coupon redemption, terminal release and unique manual recovery cases. No financial realm table/direct grants; no fake account/price/provider data.
- `/pay/subscription/{token}`: authenticated Store-bound capability lookup instead of accidental merchant wallet. Reuses existing payer, destination and wait/countdown UX but returns to SaaS status.
- `/checkout/order/{intent}/status`: buyer-only status polling, pending/verifying/paid/expired/cancelled/recovery, invoice PDF and Store Billing.
- `contracts/store-subscription-payment.yaml`: staged standalone OpenAPI Store subscription issue/status contract; master OpenAPI and generated merchant SDK integration are pending predecessor merge, distinct from `/pay/{documentToken}` and merchant `/checkout/{merchantToken}`.

Nominal states: `confirmed → awaiting_payment → paid` **only** with independent Live allocation; `awaiting_payment → expired|cancelled` releases reservation, and independently discovered money after either terminal outcome → `recovery_required` with unique operator case, **never automatic refund**. Uncertain external outcomes are looked up by persisted digest; never intentionally blindly issue a different payment intent. The exact provider/payer/amount/original-time matching stays with the existing signed receipt engine.

**Known integration gaps requiring review:** default-off partial Phase 6 cannot issue an invoice by itself; final Phase 5 confirm, token/quote handoff and approved annual/bundle/zero-due policy remain prerequisites; coupon reservation lifetime and financial settle concurrency require actual SQL isolation tests. The generic payment method chooser must be revalidated against the strict approved source registry at time of user selection; issuance currently checks readiness but financial checkout's existing public method view is broader. Do not enable on this branch.

## Financial and tenant invariants

One buyer Store vs distinct platform receiving workspace; `Live` receipt proof only; external method restricted to approved online bKash/Nagad/Rocket parsers; exact authoritative BDT minor units; no browser status, screenshot, `I paid` or callback can grant entitlement. Operator recovery is an audited case, not a money transfer. A verified transaction is consumed at most once by invoice `source_payment_id`, unique receipt IDs and coupon redemption keys. AI prepaid credits use their existing separate purchase path; this branch does not make recurring AI mandates.

Control RLS/FORCE and restricted function grants are included, but **the deployed runtime role is known to have BYPASSRLS history; realm/role/ACL isolation cannot be signed off without independently checked credentials**.

## Verification matrix — truthful outcomes

- Go policy tests: added source tests; execution evidence pending current CI.
- Go reconciler fake-row tests: added covering strict proof/amount/receiver, expired/cancelled late proof, missing intent, offline finance, default-off Live. Not equivalent to isolated Postgres.
- Next route/contract test: added under `apps/web/scripts/subscription-payment-handoff-contract.test.mjs`; CI step registered, exact-head completion pending.
- Go unit/integration/race, Next build/lint/typecheck, OpenAPI/SDK sync, real browser, isolated PostgreSQL financial/control transaction tests: **PENDING** until CI/full integrated checkout or authorized runtime is available.
- Neon: prior isolated test-branch creation for this project returned **HTTP 422 `branches limit exceeded`**; no existing test branch was repurposed, no production migration attempted.
- Real signed devices/provider/banking/SMS proofs, wrong original transaction time, duplicate/ambiguous provider evidence, cross-Store SQL transactions, worker crashes, merchant customer link E2E: **MANUAL/PROVIDER OR ISOLATED DB PENDING**, not claimed passed.
- CI: original PR head `83f831fc0ff4b28f95404f03e8c78846499c802c` run [39713878582](https://github.com/masharzy/ekmivo/actions/runs/39713878582) reported Go unit, Android assemble and image builds passed; Next job was still running at inspection and Vercel had a build-rate-limit failure. A new exact-head CI run is required after this corrective change. No green CI is inferred.

## Safe rollback and release boundary

This branch is additive and flag OFF, no production finance writes. Roll back the application branch and keep the flag OFF; do not drop tables containing any eventual financial/audit history. Migration rollback, if it ever becomes necessary, requires a separate owner-approved retention review and isolated branch rehearsal. Do not apply 0150 to production, rotate/reuse Live credentials, enable payment methods, deploy or begin Phase 7 without release authorization.

**External acceptance:** operator-authorized platform receiving config, approved policy/price/discount economics, real signed device/provider traces, finance/control role isolation and receipt-to-entitlement E2E remain outstanding. This file name is per delivery contract, NOT a claim that Phase 6 is sealed.
