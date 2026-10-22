# Store-first subscription checkout — Phase 5 engineering evidence

**Status: NOT SEALED — integration and real database gates remain open.**

Branch: `agents/store-subscription-phase5-summary`. This requested handoff filename does **not** claim acceptance.

## Scope and implementation

- `/checkout/order/{opaqueIntent}` now resolves Phase 4's 256-bit public handle by server-side SHA-256 lookup to its private UUID, authenticated actor and primary Store. Legacy plan-slug entry remains a Phase 4 dependency. Kept seller checkout routes and CSS isolated.
- The dedicated Ekmivo summary renders server-quoted itemized BDT minor-unit amounts, Store, published offer, term, immutable version, quantity, automatic adjustments, coupon Apply/Remove, configured tax and payable total. There is one preselected `Pay with Ekmivo`, three separate initially unchecked published-policy agreements and one `Go to Pay`. No phone input, wallet method, fabricated savings or client total calculation.
- Next proxy allows only scoped GET/POST order requests, the Phase 3 coupon command and Phase 6's separately owned handoff. Go validates browser Origin, session and idempotency key, with known safe error codes. Go plus control PostgreSQL are the confirmation authority.
- Additive control migration **`0152_platform_subscription_order_summary.sql`**, guarded by Phase 3's 0149 coupon read and approved tax policy as well as Phase 4's 0151 opaque-token schema. It adds per-document acceptance ID/version/SHA/actor/Store/intent/server timestamp, and immutable confirmation snapshot with unique intent/quote/invoice/Store idempotency. Phase 4 owns `requested_quantity`; Phase 3 owns `coupon_revision`, revision-keyed coupon commands, its unique reservation and the `tax_policy_id`/`tax_policy_revision` contract with half-up minor-unit rounding. Phase 5 creates no shadow tax policy, never replaces the Phase 3 coupon function and creates no second coupon reservation. SQL locks and revalidates Store, membership/grants, published offer/version, coupon eligibility/limits and three current legal documents. Repeated confirmation returns the original invoice.
- Confirmation creates an issued invoice, **not** a paid invoice or subscription entitlement. Phase 5's Go handler no longer creates `pg10_intent` or a checkout capability itself: the UI calls Phase 6's separate `subscription-purchases/{intent}/payment` bind after receiving the immutable confirmed invoice/quote. Confirmation requires the three Phase 5 flags and Phase 6's own `EKMIVO_SUBSCRIPTION_PAYMENT_ENABLED` flag; its exposed UI enablement stays false until they are active. AI/bundle/yearly fulfillment and zero-due activation are explicitly disabled until verified downstream adapters exist.
- Phase 6 owns `/pay/subscription/{opaquePaymentToken}`, all wallet choices, payment proof, verified-only activation and recovery. Phase 5 does not merge/deploy or enable financial flags.

## Verification ledger

| Gate | Status |
| --- | --- |
| Backend targeted Go test and compilation | PASS `go test ./internal/checkout ./cmd/api ./cmd/financial-migrate` |
| Control SQL syntax parser (recovered 0145) | Historical 25 statements parse (`pglast`); not execution evidence |
| Full Go test suite and vet | PASS `go test ./...`, `go vet ./...` (in-process TLS test required localhost permission) |
| TypeScript / Next.js production build | PASS `npx tsc --noEmit -p tsconfig.json`; PASS `npm run build` with Next 16.4.0 |
| ESLint / API contracts | PASS `npm run lint` (pre-existing warnings); PASS `npm run payment:contract-check` |
| Chromium 320/375/768/1024/1440 × EN/BN × Light/Dark/System, keyboard/coupons/consents/network | PASS 30 width/theme/locale checks and interactive coupon/legal/price/role/refresh/resume/200% zoom journeys; synthetic Go responses only |
| Control SQL transaction/membership/coupon/consent race tests | **OPEN** — isolated Neon test branch required |
| GitHub exact-commit CI | **OPEN** until push and PR |
| Authenticated real payments or production | Not authorized and not attempted |

### Current continuation checkpoint — 2026-10-22

- Integrated sealed Phase 3 commit 9b0a488 and Phase 4 source through 751508b into the isolated Phase 5 tree, without writing to the Phase 4 branch. Phase 4's remote migration 0151 contains stray COMMIT tokens in regex expressions. The integration tree repairs the SQL while keeping Phase 4's newest offer-alias and onboarding fixes. Phase 4's own PR still needs to publish a valid migration and complete exact-head CI.
- Added a disposable localhost PostgreSQL service to the focused Phase 5 CI. Its synthetic fixture installs Phase 3 0145–0149, Phase 4 0151 and Phase 5 0152 after the foundation; it checks actor/Store security, restricted raw-table access, three legal identities, quote expiry, concurrent idempotent invoice creation, unknown-response recovery, and coupon Apply/Remove arithmetic. Results are PENDING exact-SHA CI; this is not a database PASS claim.
- Phase 4 opaque resume/identity/Store continuation now reaches Phase 5's paid Order Summary; zero-amount eligible offers use the separate free-claim boundary. Integrated 17/17 contract tests, TypeScript and production Next.js build passed locally before the most recent Phase 4 changes. Recheck on final SHA.
- First integrated remote checkpoint a104f473 was published with an exact tree match. Focused GitHub run 39734788608 passed Go/SQL parser and the web/browser suite; the new real PostgreSQL job applied all Phase 3/4/5 migrations but its synthetic offer seed used double-encoded JSON and failed the terms constraint. Corrected the fixture to bind native JSON objects; a new exact-SHA run must verify the full transaction matrix.
- Phase 4 advanced to bae6424 with exact-head focused CI 39733132654 SUCCESS and Foundation CI 39733138829 SUCCESS, including a corrected standalone migration. The latest Phase 4 corrections have been merged into the Phase 5 integration tree; this is independent code-level evidence only, not deployment.
- Second checkpoint d01f523: Go/SQL parser PASS and full cross-phase PostgreSQL migration execution PASS in CI run 39735459333. Its synthetic policy seed was rejected by the real database because placeholder hashes used non-hex letters. Corrected it to three distinct valid hexadecimal SHA-256 test fingerprints; also made synthetic expired-quote manipulation respect the table's created_at/expiry CHECK. Transaction matrix remains PENDING the next exact-SHA run.
- Third checkpoint 8fcb854: cross-phase migrations, legal-policy seed, actor/Store denial and runtime direct-table revocation reached PASS within the disposable PostgreSQL test; first authoritative quote uncovered an actual PL/pgSQL ambiguity because the Phase 5 routine declared an unused variable named status. Removed that shadow declaration and added a source regression guard. A further exact-SHA run must pass the remaining transaction assertions.
- Fourth checkpoint 54d605a: PostgreSQL quote calculation progressed and tested the expected missing-consent denial; that step exposed a second Phase 5 SQL variable collision between the legal loop variable kind and the policy table column. Renamed the loop variable to consent_kind in every read/write and added regression coverage. Must rerun the full real-database suite before a seal claim.
- Recovered source and original tree were confirmed at `47235f3e3371ef203c0cd29e4afc8688c53cabcf` / `6803f6400c5f36c8ed61bbf00560f3e13ef0ba96` before edits. PR #141 remains draft, with no merge or deploy.
- Rechecked sealed Phase 3 PR #137 at `9b0a488`: Phase 3 allocates **0145–0149**, owns approved tax policies and half-up tax recomputation, and passed its exact-SHA focused GitHub CI. Phase 4 PR #140 has since moved its durable-intent migration from conflicting 0148 to **0151**. This Phase 5 migration was consequently moved from **0151 to 0152**; Phase 6 PR #139 currently allocates **0150** and its release ordering still needs coordination. This paragraph records source allocation only, not Phase 5 PostgreSQL transaction execution proof.
- Actual current-source `npx tsc --noEmit`, focused ESLint, `node --test scripts/subscription-order-contract.test.mjs` and `npm run build` with Next.js 16.4.0 **PASS**. The sandbox blocked Next's TypeScript subprocess (`spawnSync EPERM`); the same build passed when rerun with approved execution permissions. No application was deployed.
- Local Chromium acceptance rerun **BLOCKED** because the Playwright CDN returned an empty/corrupt browser archive five times. Prior-agent 30-case synthetic browser evidence is historical only; the modified coupon/payment API paths have **not** received a current browser pass.
- Isolated Neon branch creation for `phase5-isolated-20261022` failed with **HTTP 422 `branches limit exceeded`**. No existing branch was deleted, reset or repurposed; no migration or fixture was applied. Actual PostgreSQL role/race/consent/quote tests remain **OPEN**.
- Local Go toolchain is unavailable in this workspace. Focused exact-SHA GitHub Actions workflow `store-subscription-phase5.yml` was added for Go, syntax, browser and web checks; record the new SHA/run only after a verified push and CI result. Full Foundation CI is skipped for this PR branch by explicit branch condition.
- Phase 3 PR #137 and Phase 4 PR #140 were both **NOT SEALED** when inspected; the Phase 6 PR #139 payment adapter is separate. Source contracts were aligned at the Phase 5 boundary, but no predecessor integration/production claim is made.

**Remaining code-level gates:** full actual PostgreSQL application and multi-connection security/race tests on an isolated contemporary Neon branch; current-source Chromium/API-backed journey matrix; exact pushed SHA focused CI; verified Phase 3/4 predecessor merge/integration and Phase 6 adapter compatibility. Therefore **PHASE 5 — NOT SEALED**.

## Schema, rollback and dependencies

Forward: additive control-only `infra/migrations/0152_platform_subscription_order_summary.sql` after Phase 3 0145–0149 and Phase 4 **0151**, in addition to 0133–0144. Phase 6 `0150` ordering must be coordinated on that owning branch before a sequential production rollout. Phase 5 publishes no offers, coupons, tax defaults or legal policies, grants no direct runtime table reads, and touches no finance realm. No migrations were applied in this work session. Do not run local Docker/DB tests per `AGENTS.md`.

Rollback exposure by leaving all three flags off and reverting app/API code; retain invoices and consent audit tables. Schema reversal needs a separately audited data-retention plan and operator approval. No destructive down migration is provided.

Phase 2 published pricing, Phase 3 coupon rules, Phase 4 Store-bound durable intent creation and Phase 6 handoff/settlement contracts must all integrate, pass relevant automated checks and be explicitly reviewed before the release gates can close. The Phase 4 normal purchase-entry path is not present on this branch. Administrator-published Terms, Privacy and Refund fingerprints plus explicit tax configuration are necessary for a valid quote; this branch does not publish policies or claim a live configured tax rate.

Manual acceptance is consolidated in `docs/MANUAL-VERIFICATION.md`. **Do not label PHASE 5 — CODE-LEVEL SEALED** until Phase 2–4 contracts are integrated and all automatable checks, including isolated PostgreSQL transaction/security tests, pass on the final commit.
