# Ekmivo Store-first Subscription Purchase — Execution Addendum

**Owner decision:** 2026-10-21 · **Status:** Implementation **IN PROGRESS**; additive schema 0133 **APPLIED TO PRODUCTION**, runtime enablement **PENDING**.
**Authority:** This is a scoped execution addendum to [`DUAL-SAAS-MVP-PLAN.bn.md`](DUAL-SAAS-MVP-PLAN.bn.md), **not** a replacement master plan. The owner's newer one-store and separated-checkout instructions override conflicting historical multi-workspace UI and purchase-flow assumptions. Existing merchant-customer payments, receipts, provider matching and accounting must remain compatible.

## 0. Non-negotiable product contract

1. **One user-facing Store.** Account registration → email verification → name/setup of **one Store** → its dashboard. Do not expose a workspace selector, workspace creation list, store switching, or product-as-workspace navigation. AI, Payments, invoices, orders, customers and their access rights belong to this Store. Internal `workspace_id`/financial scopes can remain during a compatibility migration; the platform's protected/system receiving workspace remains *internal*, never a user-visible Store.
2. **Two separate pages.** SaaS **Order Summary Checkout** is **not** the wallet/payment-method page. Checkout summary shows purchased product/plan/term/quantity, individual price lines, subtotal, yearly/bundle/coupon discounts, applicable tax, total payable, editable coupon, preselected **“Pay with Ekmivo”** and three separate mandatory policy agreements. No bKash/Nagad/Rocket selection on this page. The **Go to Pay** button hands off to a separate `/pay`-family payment page, which alone displays the *platform system receiving workspace's configured, verified, available* wallet methods and completes the pre-existing automatic payment verification.
3. **Coupon lives in Platform Admin.** Full creation, scheduling, validation, redemption, deactivation, audit and reporting under Admin → Billing → Coupons. Do **not** reuse merchant order coupons as Ekmivo subscription coupons.
4. **Preserve purchase intent** through login, registration, OAuth, email verification, Store setup, refresh, cancellation and recoverable failures. A free plan claims its entitlement without a paid wallet step; never invent a charge.
5. **Authoritative money and state live in Go + control Postgres.** Never calculate final payable price in a browser or grant a subscription from a redirect/client event. Use immutable published price/terms version, integer BDT minor units, server quote, signed/opaque capability, explicit consent and verified backend payment evidence. No unsupported auto-debit or card-provider claim.
6. **No fabricated business numbers.** Annual/bundle percent, promotional/free AI credit, tax treatment, coupon exclusions and actual policy text are *admin-configured/owner-approved*, never assumed from historic landing copy.
7. **No destructive auto-migration.** Historic accounts may have multiple workspace memberships or agency/team grants. Inventory and preserve every Store, membership, financial row and external integration. Never delete or arbitrarily assign one without an approved legacy-resolution policy.
8. **Locale and styling.** Canonical public routes omit `/bn` and `/en` path segments. EN/BN uses cookies and actual `html[lang]`; Bengali text and control glyphs use self-hosted Hind Siliguri, avoiding hardcoded Latin-only overrides, while logos/icons/code retain intended faces. Landing, Store dashboard, Admin and payer checkout maintain their existing distinct CSS scopes/tokens. Support light/dark/system, screen reader, keyboard and 320px-to-desktop layouts.

## 1. Scope and current code evidence

| Existing asset or break | What to reuse or change |
| --- | --- |
| `apps/web/src/app/[locale]/subscribe/[plan]/route.ts` | Currently stores a 1-hour cookie and redirects with `#plan-…`; `payment-billing.tsx` reads `?plan=…`. The intent is lost. Replace this with a durable, store-bound subscription checkout intent; preserve legacy deep links. |
| `apps/web/src/components/payment-billing.tsx` | Server quotation, free-plan claim, proration, invoice and paid checkout-token issuance exist. Extract/reuse flows, remove reliance on modal/hash for new purchases; retain existing-plan management. |
| `backend/internal/checkout/billing.go`; `infra/migrations/0076_dashboard_billing.sql`, `0105_buyer_upgrade_timing.sql` | Go-controlled quote/invoice, versioning, 15-minute quote expiry, idempotent issuance, worker reconciliation and verified activation exist. Extend them; never fork a second authoritative billing engine. |
| `apps/web/src/app/[locale]/pay/[token]/page.tsx` | **Important collision:** this currently loads `PublicDocument` for **seller document/payment-link tokens**. SaaS invoice checkout tokens are **not document tokens**. A billing Go-to-Pay redirect cannot simply supply its token to this existing page. Add a distinct billing path under `/pay` or an explicit typed dispatcher, leaving seller documents untouched. |
| `apps/web/src/app/[locale]/checkout/[token]/page.tsx`, `components/checkout-experience.tsx` | Generic payment intent method selection and SMS waiting/verification exist. Reuse as the payment-stage component only; keep it out of Order Summary. |
| `apps/web/src/components/landing/landing-pricing.tsx` and `marketing-experience.tsx` | Payment plans are real, but AI/bundle panes are descriptive; FAQ promises a bundle discount without supporting billing logic. Align all claims to the actual published offer/catalog. |
| `apps/web/src/components/platform-admin-console.tsx` | Admin `billing/coupons` is an explicitly disconnected placeholder. Implement real role-gated data/actions. |
| `apps/web/src/app/layout.tsx`, `app/landing-chrome.css`, `docs/design/tokens.css` | Hind Siliguri is loaded, but landing nav declares a separate Latin font and many operational scopes override body font. Fix localized typography without global `*` overrides. |

## 2. Purchase data model (additive migrations, after an isolated Neon branch test)

Existing `payment_plan_catalog`/`payment_plan_versions`, `pg13_platform_invoices` and verified subscription tables are the starting point. Proposed extension names are illustrative pending schema review; do not duplicate existing concepts.

- `platform_product_offers`: `product` (`payments`, `ai_credit`, `bundle`), `offer_id`, version, live visibility, included line items/entitlements, allowed Store capabilities, publication state. AI currently has a **prepaid balance**, not an automatic recurring mandate; bundle must distinguish a payment subscription discount from a separately purchased AI credit pack.
- `platform_offer_prices`: published immutable minor-unit amount, currency=`BDT`, billing term (`monthly`, `yearly`, a bounded one-time pack), billing/allowance period, effective dates, exact version reference. A yearly variant must have explicit price/term and entitlement limits; `12 × 30 days` must not be silently called a calendar year.
- `platform_promotions`: stable code digest/normalization, display code, percentage or fixed-BDT minor-unit discount, percentage cap, eligible products/prices/term, minimum spend, first-purchase flag, user/Store restrictions, UTC start/expiry, global/per-account caps, stacking policy, priority, `draft/scheduled/active/paused/expired` status, author/version.
- `platform_promotion_reservations` and `platform_promotion_redemptions`: Store/user/order/quote association, idempotency and expiry, unique claim for each completed invoice, counters under transaction lock. Pending/cancelled/expired payments must **not** consume a final redemption; concurrent purchases cannot exceed usage limits.
- `platform_purchase_intents`: opaque unguessable identifier, selected price/offer/version, selected term, optional AI credit quantity, optional approved coupon, auth owner after bind, Store association, intent/quote/invoice/token status, expiration, revision and idempotency key. Before authentication use an expiring signed server-cookie/session reference; rebind once to authenticated identity, never trust query user IDs.
- `platform_purchase_quote_lines`: persisted authoritative snapshot of each product, quantity, original amount, recurring/yearly savings, bundle savings, coupon savings, applicable tax and total. Link quote to pinned published versions and existing billing invoice; ensure PDF and ledger match the immutable paid snapshot.
- `platform_policy_acceptances`: three individually accepted terms (`tos`, `privacy`, `refund`), document version/content checksum, user, Store, purchase intent, server timestamp, request context appropriate for audit. Legal-document URLs/versioning are admin-managed; never log full financial PII.
- Store compatibility: internal existing workspace UUIDs remain unchanged initially. Add/validate one-primary-Store-per-user binding and an explicit legacy exception mechanism only after existing accounts and team memberships are inventoried; keep admin system accounts isolated.

**Server pricing invariant:** `subtotal = sum(unit_price_minor × quantity)`; calculate published-term, bundle and eligible coupon adjustments in a documented, deterministic order; cap all discounts; compute any legal tax from configured rules on the appropriate tax base; `total_minor = max(0, subtotal - permitted_discounts + tax)`. One active manually entered coupon by default. Whether coupons stack with automatic annual/bundle offers is an explicit policy configuration, not an implied arithmetic trick. Round at each defined minor-unit boundary consistently and preserve the breakdown. Reject negative/overflow/unknown-currency values. If final amount is zero, use an audited zero-due entitlement path **only if** owner policy permits 100%-off purchases; never create a positive-only payment intent with zero amount.

## 3. API and route contract

Financial endpoints belong in the existing Go service, with Next.js server-side session/cookie glue and authorized proxies. Exact URLs can match project routing conventions; do not create a second payment engine in Next.js.

| Responsibility | Proposed API or route | Required authority/behavior |
| --- | --- | --- |
| Published product/price/offers | `GET /v1/platform/offers` | Public, published only; correct version and service availability |
| Create/resume purchase selection | `POST /v1/platform/purchase-intents`; `GET /v1/platform/purchase-intents/{id}` | Guest selection bound to safe session; verified user ownership after login; no open redirects |
| Server quote/apply/remove coupon | `POST /v1/platform/purchase-intents/{id}/quote` | Auth + Store membership; validate coupon, term, tax, quote version/TTL; return line items and precise errors |
| Confirm and accept all legal versions | `POST /v1/platform/purchase-intents/{id}/confirm` | Verified user, Store owner/billing permission, three consents, atomic idempotent invoice + platform payment intent/token (or valid zero-due claim) |
| Purchase/payment status | `GET /v1/platform/purchase-intents/{id}/status` | Auth, Store isolation, verified state from server, never from browser redirect |
| Coupon list/create/edit/pause/audit | `GET/POST/PATCH /v1/admin/billing/coupons` and redemption views | Platform Admin MFA + correct role, audit every mutation, uniqueness/validation and paginated filtering |
| Dedicated order summary | `GET /checkout/order/{opaqueIntent}` | Server-render auth/Store-bound; no wallet selection; supports refresh/back and summary states |
| Dedicated SaaS payment stage | e.g. `GET /pay/subscription/{opaquePaymentToken}` | Reuse existing `CheckoutExperience`/Go payment pipeline; system receiving methods only; no seller document-token confusion |
| Result/receipt | `GET /checkout/order/{opaqueIntent}/status` | Pending/paid/expired/cancelled, links to real invoice and Store dashboard; no query-controlled success |

**Error states:** Offer gone/updated, Store already has plan, no billing permission, unverified email, coupon invalid/expired/exhausted/ineligible, coupon conflict, quote changed/expired, system receiving source offline, payment pending, failed/expired/cancelled, duplicate click, unknown network result. All errors have stable codes and EN/BN messages; an unknown POST response must trigger safe status retrieval/retry **with the same idempotency key**, never a blind second charge.

## 4. Phased build and exact acceptance gates

No phase can be called `100% sealed` before all *automatable* relevant acceptance checks pass. Physical wallet/SMS/live-banking checks remain explicitly `manual pending` and are not claimed as code-level failures or passes. Preserve a single consolidated manual ledger.

### Phase 0 — Contract, baseline and safe migration inventory

**Deliver:** Resolve current route-to-handler diagram and API ownership; record auth/coupon/pricing/payment invariants above as typed schema/contracts; inventory live and test multi-workspace/multi-membership legacy cases **read-only**; add a feature-flagged purchase entry so old billing remains usable during the rollout. Establish test baseline and release rollback points. Track this as an addendum under the canonical plan, rather than a competing project.

**Gate:** Existing CI/build/Go tests baseline recorded; no source data deleted; actual `/pay/{token}` contract and control-vs-financial DB boundaries verified. **No payment UI or DB rollout in this phase.**

### Phase 1 — One-Store identity, onboarding and typography

**Backend:** One-primary-Store binding for new owner accounts under transaction/unique guard; reentrant setup, ownership and member permission checks; legacy account handling without destructive data loss. Internal existing workspace financial IDs retained. **Frontend:** Replace owner-facing Workspace list/create/switch flows with Store name/setup and canonical Store dashboard; remove exposed `/bn`/`/en` navigation; preserve old deep links with authorized redirects. Fix Bengali Hind Siliguri across real text/inputs/navbar while respecting separately scoped Admin/Dashboard themes, icons and monospace.

**Gate:** New account has exactly one Store on concurrent requests; no duplicate on register retries/OAuth; owner/member denial; existing account survives; email verification/setup resume works; no Store switch control; EN/BN/dark/keyboard/mobile pass; dashboard billing still reads unchanged existing IDs.

### Phase 2 — Publishable monthly/yearly/AI/bundle pricing

**Backend:** Immutable offer + interval price variants; version-aware checkout quote for Payment subscription, separate AI prepaid credits and eligible bundle rule; revalidation against service readiness. **Frontend:** Home and `/pricing` show matching real published amounts, savings, limits, plan comparison, Monthly/Yearly toggle; remove unsupported FAQ promises. Admin pricing UI publishes/version-controls intervals, bundle eligibility, and (if approved) AI credit packs. No arbitrary hardcoded `15%`, `2 months free` or starter-credit amount.

**Gate:** Same plan/term yields same quote on both pricing entrypoints and authenticated summary; round-trip of published terms; no unpublished/disabled offer can be purchased; price/version changes do not alter already-issued invoice; AI usage never silently becomes a recurring mandate.

### Phase 3 — Admin Coupons: complete backend, transactions, UI

**Backend:** Add coupon/promotion migration and Go authorized CRUD, validation, quote adjustments, reservation/redemption lifecycle, audit and counters; fully isolated from merchant `/orders/coupons`. **Admin:** Replace the disconnected `billing/coupons` page with searchable/filterable/paginated coupon table, creation/edit/preview, activation/scheduling/pause, redemptions, exact validation messages, role-gated controls and audit history. **Checkout contract:** Apply/remove a code yields a fresh server quote with the complete discount breakdown and available coupon explanation.

**Gate:** Unit + actual isolated Neon integration tests for fixed/percent, expiration boundaries UTC, percentage cap, plan restrictions, first purchase, once-per-Store/user, concurrent last-slot claims, repeated webhook/proof, expired checkout release, idempotent redemption, zero-due policy, stacked-discount limits, admin-role denial and audit persistence. No cross-Store leakage.

### Phase 4 — Durable plan selection, login/register/verification resume

**Backend:** Expiring server-side purchase intent, safe anonymous-to-user binding, Store binding and idempotent state transitions. **Frontend:** `Choose plan` produces intent and routes authenticated users straight to Order Summary; signed-out users choose Login or Register; password login, Google OAuth, email verification and Store naming all return to the **original** selected product/term/coupon. Free plans bypass wallet payment with safe server entitlement claim. Upgrade/downgrade/renewal preserves current proration/activation semantics.

**Gate:** E2E matrix covers guest→register→verify→Store, guest→login, Google, existing authenticated owner, unverified user, browser refresh/revisit, intended coupon retention, expired intent, plan no longer published, unauthorized Store, double-click and free plan. No `#plan`/`?plan` mismatch, no cookie-clearing before durable handoff, no open redirect.

### Phase 5 — Dedicated SaaS Order Summary Checkout

**Frontend:** A standalone, responsive, accessible summary layout with itemized purchases/term/quantity, old vs current price, subtotal, per-discount lines, promo input with apply/remove, tax and grand total. **Exactly one preselected payment provider entry:** `Pay with Ekmivo`. Three **separate, unchecked, required** consent boxes with clickable versioned policy links: Terms of Service, Privacy Policy, Refund Policy. The sole money handoff button is `Go to Pay`; disable it until all three are checked, quote valid, owner authorized and a legitimate payment route is available. No bKash/Nagad/Rocket selector and no merchant checkout theme on this page.

**Backend:** Recheck all three distinct accepted policy versions, coupon/offer, authoritative amount, Store and intent in the `confirm` mutation before generating payment capability. Re-clicks must resume same invoice, never issue duplicates.

**Gate:** Snapshot and interactive tests at 320/375/768/1024/1440 widths, 200% zoom, EN/BN, three themes, WCAG keyboard/focus/announcement; exact checkout math matches quote; 3-consent server enforcement; coupon invalid/empty/applied/removed states; no wallet icons or wallet-account data on Order Summary; no unexpected invoice issuance on refresh.

### Phase 6 — `/pay` handoff, verified activation and recovery

**Backend:** Create invoice/payment intent using the existing **platform system receiving** workspace only, never the buyer Store's receiving accounts. Keep locked amount, method/account readiness, 60-minute payment expiry, proof verification, financial isolation, worker reconciler, safe duplicate handling and ledger audit. Coupon redemption **commits only on independently verified paid**; failure/expiry releases reservations. **Frontend:** After `Go to Pay`, open new SaaS-specific path within `/pay`; show only actual available bKash/Nagad/Rocket receiving methods from the system configuration. Reuse the existing payer number, exact transfer amount, copy, waiting, status and expiration UI. Success/pending/failed status returns to SaaS receipt/plan status, not merchant checkout. Store dashboard shows the activated plan and full invoice.

**Gate:** Go E2E/API and isolated financial/control Neon branches: exact amount, no payer match, duplicate/wrong/late proof, offline source, user cancel after sending money, double confirm, retries after unknown response, quote expiration, coupon redemption once, worker restart, payment already verified while tab closed, entitlement only after verified proof. Seller payment links `/pay/{documentToken}` and `/checkout/{merchantToken}` must behave exactly as before. Do not claim live wallet behavior without owner-authorized physical/provider evidence.

### Phase 7 — Operational hardening, release gates and cutover

**Product:** Admin campaign audit/export, platform invoice/refund policy/help/support links, safe receipt PDF, failed/abandoned intent monitoring and bounded recovery. Any refunds or reversals are auditable and obey the owner's approved refund policy; no auto-transfer. Existing seller invoice and payer refund paths are not repurposed for SaaS billing.

**Engineering:** Review security invariants (MFA, least privilege, CSRF, idempotency, opaque token leak prevention, audit, race and exact math), dashboards/alarms for quote failures and verification lag, contract checks and migrations against an isolated Neon test branch. Roll out behind staged flags: catalog/quote → coupon admin → summary preview → authenticated purchase → selected production users → general availability. No direct production migration or destructive legacy Store collapse without approval and backups. Retain emergency disable for new purchases while in-flight paid verification/entitlement reconciliation continues.

**Gate:** Full web build + lint, Go suite, contract drift, Postgres integration, Playwright end-to-end store/account/price/coupon/money states, mobile UX and EN/BN/theme accessibility; CI on the same commit; no lost existing customers/payment records; release/rollback checklist and separate combined manual wallet/evidence ledger. Only then mark implementation `100% code-complete`; real-money/device acceptance remains separately evidenced.

## 5. Acceptance matrix crossing all phases

| Story | Exact expected result |
| --- | --- |
| New guest chooses yearly Payments + eligible coupon | Signup/login and verified one-Store setup return to **same** order, yearly and coupon remain; checkout final amount is re-quoted server-side. |
| Existing logged-in Store owner chooses AI + Payments | Authorized combo quote displays separate price lines/eligible discounts; AI credit remains prepaid; no phantom AI monthly mandate. |
| Existing admin/member without billing permission opens intent | Read/confirm are denied as policy requires; nothing issued, no price/Store record leakage. |
| Free plan selected | Show accurate free terms and confirm; no money intent or `/pay` handoff. |
| Coupon max usage = 1 and two users pay concurrently | At most one valid redemption; failed/pending/non-verified attempts do not consume redeemed count. |
| Coupon becomes invalid while user views summary | `Go to Pay` rejects/requotes and displays the new breakdown; no stale discounted invoice. |
| User checks only two policies | Client button disabled; forged API request rejected until all three document versions accepted. |
| User refreshes after `Go to Pay`/network timeout | Original idempotency key/invoice is resumed; no duplicate bill or double debit. |
| System receiver unavailable | No unsafe send-money instruction; platform reports unavailable and allows safe status/retry; buyer Store method settings are not used. |
| Verified payment after browser closes | Reconciler commits invoice and eligible coupon, activates entitlement once; dashboard/status read correct result. |
| Merchant customer follows an existing payment link | Existing seller `PublicDocument` method selection and separate merchant payment settlement remain unchanged. |
| Legacy member/account had multiple workspaces | Preserve all rows and authorizations; require approved migration resolution before removing picker/constraints for that account. |

## 6. Blocking owner-controlled business inputs before live launch

Implementation can build configurable support and fixtures while these are undecided, but **must not advertise or enforce guessed values**:

1. Real published monthly and yearly amounts, annual term semantics, discount percentage/fixed savings, eligible plans, and the calculation of payment allowance for yearly terms.
2. Exact **AI + Payments** economics: whether the AI component is a prepaid pack, included bonus credits, or only a discount on the payment subscription; bundle eligibility and stacking with coupon/annual offers.
3. Default coupon stacking, first-purchase rule, global/per-account caps, partial refund/reversal impact, and whether 100%-off checkout may activate without wallet payment.
4. Actual current Terms of Service, Privacy Policy and Refund Policy URLs/content **with approved version identifiers**, as well as legally correct tax/invoice treatment. No claim of regulatory compliance based only on code.
5. Existing multi-workspace owners and invited multi-Store team members: retention/reassignment/access policy and whether existing accounts remain temporarily in a legacy compatibility mode. **Never delete old Stores or financial records automatically.**
6. Confirm platform system receiving accounts and approved real-wallet verification environment. Internal platform receiving Store is not a selectable customer Store.

## 7. Definition of done and evidence protocol

- Phase status is `NOT STARTED` → `IN PROGRESS` → `CODE COMPLETE / AUTOMATED TESTS PASS` → `RELEASE VERIFIED`. Never use `100%` for mocks, unrun migrations, absent live sources, or untested browser behavior.
- Per-phase record: changed files, schema version, rollback compatibility, branch/commit/CI, Go/web/Neon/Playwright outcomes, state/permission/security test counts, known failures and manual pending.
- All database migration checks use an **isolated Neon branch**, never local Docker without the owner's permission. Production rollout is an independent owner-authorized step; a passing test-branch migration is not a production pass.
- No provider/mobile/bank credentials or SMS evidence in repository, logs or reports. Never conflate the seller's customer checkout with Ekmivo's own subscription purchase.

## 8. 2026-10-21 implementation checkpoint (not sealed)

**Superseding direct-migration decision (later 2026-10-21):** Owner explicitly requested applying the migration directly to production without creating a test branch. New additive control-only `0133_platform_subscription_checkout_foundation.sql` was applied in one successful Neon transaction to project `sparkling-mountain-38618629`, branch `br-solitary-river-b3ztvg8j`, database `ekmivo`. Read-only follow-up confirmed all 12 tables and the checksum `430d1cd8cb0576926fea10bcd4ccdf78ecc3776cd2b5921f46ae0acc74f6c6ff` in `dashboard_reference_migrations`; control DB had no `financial_realm`. No existing record, invoice, payment, payment verification, financial realm or published price was modified. The existing migration coordinator now includes 0133 as a checksum-verified control migration. **No isolated test-branch run was performed** per the newer owner instruction. This is *schema deployed*, not backend CRUD/quote/consent/payment functionality deployed; all runtime actions remain disabled pending implementation and automated checks. See [database evidence](evidence/SUBSCRIPTION-CHECKOUT-MIGRATION-20261021/README.md).

- Phase 0/1/4 in progress: scoped Hind Siliguri font fixes for Bengali page chrome; guest plan cookie preserved across login/verification and Store onboarding; `#plan`/`?plan` mismatch corrected; setup radio honors saved plan and routes paid choices to `/subscribe/{plan}`; new one-Store creation has a per-user advisory transaction lock. Existing multi-Store owners remain in legacy compatibility view and no Store is deleted.
- Phase 5 UI preview in progress: `/checkout/order/{plan}` is a dedicated responsive server-priced summary with period quantity, authoritative quote total, Ekmivo-only provider, and three individually required linked legal consents; `/pay/subscription/{token}` is distinct from existing merchant `/pay/{token}`. Coupons/yearly/bundle offers are explicitly **not yet enabled**. The summary cannot issue invoices while server legal/coupon confirmation is pending (`purchaseEnabled=false`).
- Backward compatibility: `EKMIVO_SUBSCRIPTION_ORDER_PREVIEW=0` by default. The existing verified Billing → `/checkout/{token}` path remains active. No real user is sent into an incomplete paid checkout unless explicitly preview-enabled, and even preview cannot collect funds.
- Safety: Published HTTPS legal policy URLs must be configured as `EKMIVO_TERMS_URL`, `EKMIVO_PRIVACY_URL`, `EKMIVO_REFUND_URL` before rollout. Exact legal text/version, discounts, tax and coupon semantics remain owner-controlled.
- Database test blocker: Creating isolated Neon branch `test-store-checkout-20261021` failed with HTTP 422 `branches limit exceeded`. Existing historical branches were **not** deleted or mutated. No coupon/billing migration was applied to the production branch. DB-dependent phases 2/3/5 backend/6 cannot be sealed until an owner-approved test branch is available.
- Automated evidence: Next.js production `npm run build` passed and the new `/checkout/order/[plan]` + `/pay/subscription/[token]` routes appear in the build manifest; `node --test scripts/*.test.mjs` passed **23/23 test files**, scoped ESLint, TypeScript checking and `python apps/web/scripts/verify-admin-design.py` passed. The first sandboxed build attempt failed because child process spawning returned `EPERM`, not due to application code; running the same build with approved process access succeeded. No authenticated browser visual or live-wallet claim is made.
- Go backend tests cannot run here (`go: command not found`); no Go production handler has been edited in this checkpoint. Admin coupon CRUD, yearly/bundle prices, server-side consent audit, final Go-to-Pay confirm, migration and E2E are **not complete**.

## 9. Additional 2026-10-21 checkpoint — Admin coupons (partial phase 3)

- Production control migration `0134` and compatibility hotfix `0135` installed with checksums, audited super-admin coupon create/draft/edit/status/list function. Verified save→activate within a transaction followed by a rollback to savepoint; no actual coupons were left in production. The admin UI now includes Billing & Revenue → Coupons with filters, paginated catalog, create/edit and explicit status transitions, plus fixed/percent/limits/offer eligibility fields.
- `node --test scripts/*.test.mjs` **24/24 test files passed**, Next.js production build passed under approved process access, TypeScript passed, scoped lint 0 errors, Admin reference validator passed. No authenticated visual proof or physical-wallet evidence yet.
- Coupon **redemption/quote application is not wired**, no approved published yearly/bundle/AI offer or versioned legal policies exist, and the new SaaS checkout is still purchase-disabled. This partial backend/Admin milestone must **not** be called Phase 3 complete, let alone all phases.
- Critical production privilege finding: the existing Neon `ekmivo_runtime` belongs to `neon_superuser` with `BYPASSRLS`; raw new-table privilege checks succeed despite lack of direct ACL grants. Do not activate finance-sensitive checkout until a least-privileged runtime credential path is introduced, deployed and verified. No production role memberships or credentials were altered automatically.

### Legal policy management follow-up (partial phase 5)

- Control migrations `0140`–`0142` are applied to production and checksum-ledgered. Admin Settings → Legal & contact can register immutable version/URL/SHA-256 fingerprints and publish/archive documents atomically. Order Summary uses **only** the currently published versioned Terms/Privacy/Refund links; no fallback to unsigned environment variables.
- Final production DB create→publish verification was run within a savepoint and rolled back: no test policy or published legal URL remains. No buyer consent was accepted or persisted; this is only administrative infrastructure. Three owner-approved documents and backend acceptance/confirm remain required before enabling purchases.
