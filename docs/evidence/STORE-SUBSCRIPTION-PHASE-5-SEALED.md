# Store-first subscription checkout — Phase 5 engineering evidence

**Status: NOT SEALED — integration and real database gates remain open.**

Branch: `agents/store-subscription-phase5-summary`. This requested handoff filename does **not** claim acceptance.

## Scope and implementation

- Replaced preview `/checkout/order/{plan}` with the opaque authenticated `/checkout/order/{intent}`. Kept seller checkout routes and CSS isolated.
- The dedicated Ekmivo summary renders server-quoted itemized BDT minor-unit amounts, Store, published offer, term, immutable version, quantity, automatic adjustments, coupon Apply/Remove, configured tax and payable total. There is one preselected `Pay with Ekmivo`, three separate initially unchecked published-policy agreements and one `Go to Pay`. No phone input, wallet method, fabricated savings or client total calculation.
- Next proxy allows only scoped GET, POST `/quote` and POST `/confirm`; Go validates browser Origin, session and idempotency key, with known safe error codes. Go plus control PostgreSQL are the confirmation authority.
- Additive control migration `0145_platform_subscription_order_summary.sql`: explicit tax settings revision (unconfigured is blocked), quantity, quote tax/coupon revision, per-document acceptance ID/version/SHA/actor/Store/intent/server timestamp, and immutable confirmation snapshot with unique intent/quote/invoice/Store idempotency. SQL locks and revalidates Store, membership/grants, published offer/version, coupon eligibility/limits and three current legal documents. Repeated confirmation returns the original invoice.
- Confirmation creates an issued invoice, **not** a paid invoice or subscription entitlement. The existing Go/financial handoff is guarded by `EKMIVO_SUBSCRIPTION_ORDER_QUOTE_ENABLED`, `EKMIVO_SUBSCRIPTION_ORDER_CONFIRM_ENABLED` and `EKMIVO_SUBSCRIPTION_PHASE6_HANDOFF_ENABLED` (all default off). AI/bundle/yearly fulfillment and zero-due activation are explicitly disabled until verified downstream adapters exist.
- Phase 6 owns `/pay/subscription/{opaquePaymentToken}`, all wallet choices, payment proof, verified-only activation and recovery. Phase 5 does not merge/deploy or enable financial flags.

## Verification ledger

| Gate | Status |
| --- | --- |
| Backend targeted Go test and compilation | PASS `go test ./internal/checkout ./cmd/api ./cmd/financial-migrate` |
| Control SQL syntax parser | 25 statements parse (`pglast`); not execution evidence |
| Full Go test suite and vet | PASS `go test ./...`, `go vet ./...` (in-process TLS test required localhost permission) |
| TypeScript / Next.js production build | PASS `npx tsc --noEmit -p tsconfig.json`; PASS `npm run build` with Next 16.4.0 |
| ESLint / API contracts | PASS `npm run lint` (pre-existing warnings); PASS `npm run payment:contract-check` |
| Chromium 320/375/768/1024/1440 × EN/BN × Light/Dark/System, keyboard/coupons/consents/network | PASS 30 width/theme/locale checks and interactive coupon/legal/price/role/refresh/resume/200% zoom journeys; synthetic Go responses only |
| Control SQL transaction/membership/coupon/consent race tests | **OPEN** — isolated Neon test branch required |
| GitHub exact-commit CI | **OPEN** until push and PR |
| Authenticated real payments or production | Not authorized and not attempted |

## Schema, rollback and dependencies

Forward: additive control-only `infra/migrations/0145_platform_subscription_order_summary.sql` after 0133–0144. It publishes no offers, coupons, tax defaults or legal policies, grants no direct runtime table reads, and touches no finance realm. No migrations were applied in this work session. Do not run local Docker/DB tests per `AGENTS.md`.

Rollback exposure by leaving all three flags off and reverting app/API code; retain invoices and consent audit tables. Schema reversal needs a separately audited data-retention plan and operator approval. No destructive down migration is provided.

Phase 2 published pricing, Phase 3 coupon rules, Phase 4 Store-bound durable intent creation and Phase 6 handoff/settlement contracts must all integrate, pass relevant automated checks and be explicitly reviewed before the release gates can close. The Phase 4 normal purchase-entry path is not present on this branch. Administrator-published Terms, Privacy and Refund fingerprints plus explicit tax configuration are necessary for a valid quote; this branch does not publish policies or claim a live configured tax rate.

Manual acceptance is consolidated in `docs/MANUAL-VERIFICATION.md`. **Do not label PHASE 5 — CODE-LEVEL SEALED** until Phase 2–4 contracts are integrated and all automatable checks, including isolated PostgreSQL transaction/security tests, pass on the final commit.
