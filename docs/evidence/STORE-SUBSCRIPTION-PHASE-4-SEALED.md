# STORE-FIRST SUBSCRIPTION PHASE 4 — NOT SEALED

Date: 2026-10-22. Branch: `agents/store-subscription-phase4-intents`.
Scope: durable purchase selection, login/verification/OAuth continuation and Store binding.
**Status: SOURCE IN PROGRESS / INTEGRATION BLOCKED. NOT PHASE 4 — CODE-LEVEL SEALED.**

## Source on branch
- `infra/migrations/0151_phase4_durable_purchase_intents.sql`: additive 256-bit public capability digest, distinct guest-session digest, quantity, legacy reference, seven-day expiry ceiling, dedicated `claimed_free` status; no existing Store, membership, subscription or financial row is reassigned.
- `backend/cmd/financial-migrate/dashboard_reference.go`: control-only checksum migration registration; **not applied** to production, sandbox or test.
- `apps/web/src/lib/purchase-capability.ts`: independent random 256-bit guest cookie and deterministic HMAC-SHA256 purchase capability, enabling same-key lost-response recovery.
- `apps/web/src/lib/server/purchase-intents.ts`: pinned published offer version/term; optional prevalidated coupon; idempotent create, owner-only get/bind, expiring guest-to-identity claim, authorized primary Store binding, revision-checked cancellation and transaction-bound free entitlement using existing `payment_plan_claim_free`. No browser-provided user or Store ownership accepted.
- `apps/web/src/app/api/platform/purchase-intents/**`: cookie-authenticated create/get/bind/cancel/free, origin checks, bounded bodies, no-store cache and generic cross-account failure.
- `apps/web/src/app/[locale]/subscribe/**`: legacy-compatible published selection entry; original intent resumes across login, Google OAuth, email verification and Store setup via existing `/workspaces/open`.
- `apps/web/src/app/[locale]/checkout/order/[plan]/page.tsx`: opaque selection preview with pinned term, quantity and coupon; paid checkout remains off. Existing Gateway plan route retained.
- `apps/web/src/components/subscription-offer-pricing.tsx`: carries published catalog `version_id` with selection to prevent unapproved silent repricing.
- `apps/web/src/components/free-purchase-claim.tsx`: accessible free activation action; no wallet or fake paid invoice.
- `apps/web/scripts/subscription-intents-contract.test.mjs` and CI wiring: 256-bit token and retry tests plus source-level safety regression.

## Hard security boundary
The Phase 4 paid path **does not** call `dashboard_billing_issue`, `pg10_intent`, wallet handoff or invoice activation. A published catalog amount is not a payable quote. Phase 5 is responsible for legally accepted authoritative quote confirmation; Phase 6 for verified money and activation. The existing merchant `/pay/{token}` and Gateway existing-plan renewal routes are not repurposed.

## Verification and readiness (as of this writing)
- GitHub branch and source commits: confirmed, see branch and draft PR.
- Migration execution against isolated Neon: **BLOCKED** (Ekmivo project branch quota HTTP 422; no existing test branch was deleted). No destructive or production database write attempted.
- Full Go, Next.js production build, lint, TypeScript, CI, actual browser/PostgreSQL E2E: **PENDING on this exact branch**. The added contract tests are not evidence of E2E or real accounts.
- Prerequisites: Phase 2 source/CI evidence exists in PR #135, but no owner-approved published commercial offers were present at that checkpoint. Phase 3 authoritative coupon quote/redemption confirmation remains unsealed and **must not** be replaced by this module's preliminary eligibility check.
- Runtime privileged DB role/RLS remediation and approved live offer/legal documents remain separate release gates.

## Mandatory remaining automated E2E matrix
Guest → register → verify → Store → summary; guest → password login; guest → Google OAuth; verified Store owner/admin; unverified email and revoked/expired session; monthly/yearly and AI/bundle; coupon revalidation after pause/expiry; changed offer version; free entitlement idempotency and paid exclusion; refresh/back/forward/cross-tab; lost POST response and concurrent binding; cross-account token denial; denied billing member; historical multi-Store membership without reassignment; browser EN/BN, light/dark/system, mobile, keyboard. A CI contract test is **not** evidence for this matrix.

## Follow-up
Verify migrations/functions and concurrency on an **authorized isolated** PostgreSQL/Neon test environment, pin current Phase 3 quote contract, run full browser/Go/Next suite, remedy any CI failures and re-review docs/manual ledger. Never auto-merge/deploy; only declare code-level sealed with actual prerequisite and automated acceptance evidence.
