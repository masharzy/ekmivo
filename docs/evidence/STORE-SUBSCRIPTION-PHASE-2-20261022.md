# Store-first Subscription Checkout — Phase 2 evidence (2026-10-22)

**Scope:** published catalog, immutable offer-version price review, public Home and `/pricing` parity, informational approved-price comparisons. **Not** a live purchase launch or a Phase 3–7 seal.

## Source and implementation

- Base includes immutable `platform_subscription_offers` / `platform_subscription_offer_versions`, MFA-gated Admin offer publish/archive actions, read-only public projection `platform_subscription_offers_public()`, Home and `/pricing` published offer cards, and authenticated version-pinned `/checkout/offer/[offer]` review with stale-price rejection.
- Current Phase 2 PR: <https://github.com/masharzy/ekmivo/pull/135>.
- `backend/cmd/financial-migrate/dashboard_reference.go` now registers control migration `0144_platform_subscription_public_catalog.sql` after 0143 for checksum verification during standard migrations.
- `publishedPriceComparison` is shared by price cards, authenticated review and read-only `/api/subscription/quote`. It derives annual savings solely from a unique same-product, same-plan-version, same-included-credits published monthly price. Bundle comparisons require a unique published Payments plan and AI prepaid pack, both matching the published bundle attributes. Missing/ambiguous comparisons do **not** display savings. These figures never reduce a payable amount and never activate checkout.
- No coupons are redeemed, invoice is issued, real-money wallet is selected, or buyer entitlement is activated by these Phase 2 views.

## Verification

| Check | Observation |
| --- | --- |
| `npx tsc --noEmit` | PASS |
| Scoped ESLint of changed TS/TSX | PASS |
| Next.js production `npm run build` | PASS under approved subprocess access |
| Catalog, quote, review and render source tests | PASS (4 files) |
| All web `node --test scripts/*.test.mjs` | 35 passed, 2 browser-dependent test files could not start (`briofold-website-widget`, `subscription-public-responsive-browser`); Chromium unavailable in runner |
| Go backend tests | Not run locally: `go` executable unavailable; CI required |
| Browser viewport/EN-BN/theme visual assertions | Not verified locally; Playwright Chromium download failed, remote CI/browser run required |
| Production control migration 0144 | Read-only Neon query found ledger checksum `6bfc80ba71d10a9f739383d9360656660b71cd0a2884b91114808e022f123ad4`, exactly matching local SQL file; public catalog function exists |
| Published offers in production | **0** — no approved live catalog amounts; do not claim production published pricing parity or live launch |
| Invoice immutability, coupon and payment evidence | Existing issued invoices untouched; Phase 3–7 payment/activation tests pending independently |

## Required before `RELEASE VERIFIED`

1. Run same-commit GitHub CI including Go. Run authenticated browser acceptance against the actual preview for 320/375/768/1024/1440 widths, EN/BN, dark/light and stale-version review, capturing evidence.
2. Obtain owner-approved real Payments monthly/yearly, prepaid AI and bundle prices/credits/terms, then use Admin publish flows. Recheck the same approved version and exact minor units on Home, `/pricing`, quote API and authenticated offer review. Never seed synthetic production offers or invent discount percentages.
3. Production financial checkout and service activation are intentionally disabled until Phases 3–7 verify coupon, purchase intent, three policy consents, pay handoff and settlement. Existing seller payment flows stay unchanged.
4. An isolated Neon test branch was previously blocked by account branch limits. Production 0144 presence/checksum was verified read-only here; that does **not** replace integration testing in an isolated database.

**Status as recorded:** Phase 2 code changes tested locally, PR/CI and live catalog publication not yet verified. This note does not claim a Phase 2 release seal.
