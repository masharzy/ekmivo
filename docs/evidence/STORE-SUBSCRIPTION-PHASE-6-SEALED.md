# Ekmivo Store-first subscription Phase 6 — CODE-LEVEL SEALED

**Current status (supersedes the historical checkpoints below): PHASE 6 — CODE-LEVEL SEALED.** Not merged, not migrated, not deployed; all purchase and payment flags OFF. Real provider/device and controlled production cutover remain operator-owned Phase 7 gates.  
**Branch:** `agents/store-subscription-phase6-payment-activation`  
**Automated seal source SHA:** `5bccfa40a8c4b696533b90d4d361ce827a42bb70`.  
**Final exact-head CI:** [Focused Store Subscription Phase 6 — 39747536415](https://github.com/masharzy/ekmivo/actions/runs/39747536415) **SUCCESS**, [Foundation CI — 39747541439](https://github.com/masharzy/ekmivo/actions/runs/39747541439) **SUCCESS**.  
**Source base:** `main` at `1cefe6393a702974052d422e549018de6388c74f`.  
**Change set:** See branch tip / draft PR commits (the evidence document itself is committed after the implementation).  
**Implementation date:** 2026-10-22.  
**Final migration:** `0153_platform_subscription_payment_handoff.sql` (control database ONLY; **not applied**, not production-authorized). The early `0150` references below document superseded, unapplied review history.

## 2026-10-22 — Final automated Phase 6 seal decision

- Phase 3 #137, Phase 4 #140 and Phase 5 #141 code-level predecessor sources are integrated on this branch, with dependencies ordered 0145–0149 → 0151 → 0152 → Phase 6 0153. Every migration remains unapplied in production. The original migration-0150 collision is resolved.
- **Real disposable PostgreSQL 17**: quote/confirm after actor/primary Store/role checks, three immutable accepted legal versions, expiring quotes, price/coupon revision, idempotent parallel binds, one redemption only after verified invoice, denied forged runtime settlement, late verified money retained for manual recovery, receiver mismatch rejection. The finance verification callback used by Phase 6-specific control fixture is stubbed, and the broader Foundation `pg04-financial-smoke` independently verifies financial/control realm migration and durability; no real provider proof is claimed.
- **Wallet enforcement**: SaaS `SAAS-{invoice}` payer GET and POST lock are now restricted to one unambiguous online, approved live parser-backed account per method; multiple same-method accounts fail closed until verified. Merchant checkout continues independently. Unit tests cover parser revocation, offline, multiple-account, forged method/account and merchant isolation.
- Exact published Go race/vet, Next TypeScript/ESLint/build, pricing/legal/coupon/auth compatibility, Foundation financial/Android CI and real PostgreSQL/Go contracts all passed at the source SHA above. No production wallet tokens, SMS, transfers or migrations were used.
- **Rollout boundary**: `EKMIVO_SUBSCRIPTION_ORDER_QUOTE_ENABLED`, `EKMIVO_SUBSCRIPTION_ORDER_CONFIRM_ENABLED`, `EKMIVO_SUBSCRIPTION_PHASE6_HANDOFF_ENABLED` and `EKMIVO_SUBSCRIPTION_PAYMENT_ENABLED` remain OFF. Phase 7 operator manual/provider acceptance and deployment approvals are separate. If purchase initiation is disabled after launch, do not automatically disable verified in-flight reconciliation.

All later occurrences of **NOT SEALED**, `0150`, or old Phase 5 commit references in this file are historical progress notes from before the final above evidence. They do not describe the sealed code-level state.

## Scope and dependency order

Phase 6 here means **Store-first SaaS subscription payment handoff**, not the unrelated AI Studio/Inbox Phase 6. The latest master and checkout execution plans require Phase 2 versioned quote and final plan/interval fulfillment, Phase 3 coupon concurrency and reservation, Phase 4 durable purchase intent, and Phase 5 confirmed legal/quote/invoice snapshot. Phase 2 is merged. Phase 3 PR #137 and Phase 4 PR #140 remain draft/unmerged; Phase 5 is implemented on [draft PR #141](https://github.com/masharzy/ekmivo/pull/141) at `47235f3e3371ef203c0cd29e4afc8688c53cabcf` (25 changed files, recovered and source-tree verified), but remains unmerged / **NOT SEALED**; these predecessors are **not integrated** on the current source. The Order Summary still has `purchaseEnabled={false}`. This branch builds the separate payment-stage boundary and worker scaffolding, but MUST NOT be merged/enabled until 2 → 3 → 4 → 5 → 6 have been integrated and re-tested.

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

## Latest code-level audit checkpoint — 2026-10-22

- Last implementation commit before this evidence-only update: `8141af88a1d55e2b9ee69d8f7589e2d5c168b0fd`; PR [#139](https://github.com/masharzy/ekmivo/pull/139) remains **DRAFT** and unmerged. Review the PR head for the final tip.
- Corrective commits: migration 0145 collision removed and replaced with `0150_platform_subscription_payment_handoff.sql`; bounded fair reconciliation cursor; Phase 6 JS source contract wired to CI; `./internal/subscriptionpayment` included in Go race; npm audit retries **transport failures only**, still fails genuine high-severity findings.
- Original full CI [39713878582](https://github.com/masharzy/ekmivo/actions/runs/39713878582): Go tests, Android build and production Docker builds passed; Next.js job failed at `npm audit` because the npm advisory endpoint **timed out**, so Next build and PostgreSQL steps **did not execute** in that run. Latest revised source workflow [39715508002](https://github.com/masharzy/ekmivo/actions/runs/39715508002) was pending at inspection; an exact-head green run cannot yet be claimed.
- Predecessors: Phase 2 [#135](https://github.com/masharzy/ekmivo/pull/135) is merged; Phase 3 [#137](https://github.com/masharzy/ekmivo/pull/137) and Phase 4 [#140](https://github.com/masharzy/ekmivo/pull/140) remain draft/unmerged. Phase 5 [#141](https://github.com/masharzy/ekmivo/pull/141) now contains the restored 25-file Order Summary, quote/consents/coupon/confirmation implementation at `47235f3e3371ef203c0cd29e4afc8688c53cabcf`. It is draft / NOT SEALED, unmerged, with isolated transaction tests still required and its separate Phase 5 `0145_platform_subscription_order_summary.sql` migration number colliding with Phase 3's already-applied `0145` (must renumber/register on Phase 5's own branch). Full Phase 2–5 integration and legal/coupon server contracts remain unverified.
- Neon project has 10 branches (including production) and no free isolated branch slot. The owner must authorize cleanup of a clearly disposable old TEST branch or another isolated TEST resource. No unrelated branch deletion or production SQL execution occurred.
- **Blocking security/UI mismatch:** payment issuance validates approved sources, but the generic wallet chooser's account/method tile filtering and lock operation still need an integrated strict per-source authorization test and review. Keep `EKMIVO_SUBSCRIPTION_PAYMENT_ENABLED=false`.
- The Phase 6 migration is **not in the migration coordinator**. Integration must register it **after** Phase 3–5 migrations and only after it passes isolated control/finance SQL tests. Do not treat a source-only migration as applied or reconciled.

**Seal verdict:** **NOT SEALED**. Independent Go/source gates are insufficient; actual SQL isolation, owner-Store paid entitlement E2E, post-merge CI and compatible predecessors are required automatable gates. Genuine provider/device/bank tests remain separate manual acceptance and are not claimed as code-level failures or passes.

## Phase 5 recovery and CI 39715704488 triage — 2026-10-22

- **Removed inaccurate blocker** “Phase 5 implementation absent”: PR [#141](https://github.com/masharzy/ekmivo/pull/141) is present, with commit `47235f3e3371ef203c0cd29e4afc8688c53cabcf`, 25 changed files, opaque Store-bound Order Summary, server quote, three published policy consents, coupon Apply/Remove, guarded Go confirmation and synthetic browser checks. Its code existence is verified; its integration, isolated PostgreSQL acceptance and seal are **NOT** verified.
- [Foundation CI 39715704488](https://github.com/masharzy/ekmivo/actions/runs/39715704488): web job `119617557476` **FAILED** at “Lint all web sources”. ESLint reported **one error and 61 warnings**, specifically `apps/web/src/components/subscription-payment-status.tsx:22:8`, `react-hooks/set-state-in-effect` for direct `refresh(ac.signal)` inside `useEffect`. This was an application lint error, **not npm audit timeout**. Go, Android and Docker CI jobs passed. Downstream web build/DB smoke steps did not run in this job.
- Fix pushed: initial status fetch is scheduled in a cancellable `window.setTimeout(...,0)` callback rather than called synchronously in the React effect. The existing six-second visible-tab polling and AbortController cleanup remain in place. Passing post-fix CI still required; do not infer pass from the code change alone.
- Existing GitHub Actions ephemeral PostgreSQL smoke remains an isolated automated gate (never production), subject to CI reaching that step. The project instruction requires Neon for authoritative schema/finance checks. With Neon branch quota full, use **only a separately authorized isolated test resource** for full control/financial transaction and RLS proof; do not repurpose unrelated Neon branches or run fixtures in production.
- Still blocked: Phase 3–5 dependency-order integration, strict wallet method/account parser filtering at selection/lock time, independently run isolated control+finance PostgreSQL acceptance and post-integration CI. No payment flag, production migration or deployment authorized.

## Follow-up CI regression triage — 2026-10-22

- After the React effect fix, [Foundation CI 39717399470](https://github.com/masharzy/ekmivo/actions/runs/39717399470) advanced **past ESLint**, but its web job failed in `Published subscription pricing contracts (Phase 2)`: two old source-test assertions expected (1) the former “Purchase handoff opens after verified checkout release” UI copy and (2) `<PublicPricing locale={locale}/>` without the `selectedProduct` prop. The merge-tested current `main` renders “Final eligibility and payable total are confirmed in checkout” and passes `selectedProduct={product}`, with server confirmation still required. Updated the two source-contract tests to accept **only those two known safe variants**; no pricing money calculation, offer publication, provider or checkout code was rewritten.
- The Phase 6 status poll's initial React effect now runs in a cancellable asynchronous timer. A regression assertion protects `clearTimeout`, abort cleanup and retained six-second polling. Exact-head CI is required to prove the lint and price-test fixes together.
- These compatibility fixes do not merge/validate Phase 3–5 or approve wallet-account filtering. [Phase 5 PR #141](https://github.com/masharzy/ekmivo/pull/141) is implemented and unsealed; “implementation absent” is no longer a blocker.

## Safe rollback and release boundary

This branch is additive and flag OFF, no production finance writes. Roll back the application branch and keep the flag OFF; do not drop tables containing any eventual financial/audit history. Migration rollback, if it ever becomes necessary, requires a separate owner-approved retention review and isolated branch rehearsal. Do not apply 0150 to production, rotate/reuse Live credentials, enable payment methods, deploy or begin Phase 7 without release authorization.

**External acceptance:** operator-authorized platform receiving config, approved policy/price/discount economics, real signed device/provider traces, finance/control role isolation and receipt-to-entitlement E2E remain outstanding. This file name is per delivery contract, NOT a claim that Phase 6 is sealed.

## Phase 3–6 integration checkpoint — 2026-10-22 (still NOT SEALED)

- Integrated Phase 5 sealed source b2c624476188a9a9b214c837a397a93a38818a53, carrying Phase 3 #137 and Phase 4 #140. Preserved the later main public/auth redesign; resolved five overlapping CI, pricing-test, proxy and manual-ledger conflicts.
- Renamed **unapplied** Phase 6 control migration from 0150 to **0153_platform_subscription_payment_handoff.sql** because Phase 5 requires 0152. The existing release coordinator now registers 0153 *after* 0145–0149, 0151 and 0152. No applied checksum was changed.
- Fixed confirmed-invoice resumption: the binder trusts the immutable Phase 5 confirmation and three versioned legal acceptance snapshots even if a published legal document changes or the original 15-minute quote expires. The pending-invoice coupon reservation survives its original checkout TTL.
- Changed Phase 6 bind/read grants to the existing authenticated control ekmivo_runtime, preserving worker-only settlement/recovery for ekmivo_financial_projection.
- Added a focused disposable PostgreSQL 17 test of 0153, actor/Store, role denial, idempotent bind, coupon redemption, conflicting proof and late-payment recovery after the Phase 5 SQL fixture. This control-plane test **substitutes** the PG13 financial verification callback, and does not prove independent live financial receipt matching.
- Integrated local checks: Phase 2–6 contract tests **6/6 PASS**, TypeScript **PASS**, ESLint **0 errors** (61 existing warnings), Next production build **PASS** under approved process access. These are not exact-remote CI results.
- Added branch-only focused Phase 6 workflow for Go race/vet, Next build and sequential real PostgreSQL control schema.
- **Still NOT SEALED:** exact-head CI, real finance-realm allocation proof, account-specific parser-approved wallet filtering, and full authenticated browser → API → control/finance E2E remain open. Flags remain disabled. No production migration/deployment/provider activity.
