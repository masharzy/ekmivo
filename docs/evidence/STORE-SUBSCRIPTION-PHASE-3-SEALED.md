# Platform subscription coupons — Phase 3

Status: **NOT SEALED — implementation in progress**. This filename is the requested final evidence location, not a seal claim.

Branch: agents/store-subscription-phase3-coupons. Base: 1cefe6393a702974052d422e549018de6388c74f (Phase 2 PR #135 merged). No production migration or deployment authorized/performed by this checkpoint. This is Store-first Phase 3, independent of Briofold merchant commerce.

## Existing source verified

0133 defines coupon/reservation/redemption/intents/quote tables. 0134 provides super-admin CRUD/filter/pagination; 0135 corrects audit schema. Existing requireSuperAdmin web actions check MFA. Admin Billing Coupons already uses the locked Admin UI; preserve it. Phase 2 catalog exposes pinned published BDT prices; informational annual/bundle comparisons do not reduce authoritative payable amounts. No live approved offers were established by the Phase 2 evidence; do not invent prices/tax/stacking policy.

## Current checkpoint

0145 (control only) fixes NULL percentage acceptance in the existing authoring function and adds immutable version snapshots for future saved/status revisions with FORCE RLS and no raw runtime grants. Snapshots begin at each existing row's current revision; historical revisions before this migration are not fabricated. Existing post-use editing restrictions remain until a complete safe versioned-edit lifecycle is implemented. Existing coordinator registers 0145 after 0144. No duplicate coupon subsystem.

## Remaining automatable scope — all OPEN

Go Admin/session API authorization including MFA; server authoritative Apply/Remove/requote with offer/product/term/tax/stacking restrictions, bounded exact math and stable EN/BN errors; transaction-safe reservation limits/expiry/unknown-outcome reconciliation and verified-payment-only idempotent redemption; per-Store first-purchase limits, history/counters/details UI, post-use version authoring, browser parity/draft/retry behavior. Actual isolated PostgreSQL concurrency/RLS/auth tests, Go/TS/lint/build/browser suite and final-head CI must all pass before seal. No Phase4–6 orchestration is claimed.

## Migration and rollback

0145 is unapplied. Review numbering against current main and other PRs before integration. Use the existing migration coordinator against an authorized isolated control branch first; no local Docker. Do not apply to physical financial realms. Invalid existing NULL-percent rows deliberately block migration rather than silently changing business terms. Roll back runtime to previous tested source while retaining additive version history; never delete coupon/redemption/invoice data. Final exact source SHA, tests, CI and external manual gates will be recorded here/PR once available.

## 2026-10-22 continuation (NOT SEALED)

0145 is now applied to production control with ledger checksum `78123a374cbc771e7138fdc813f3650b9877ee96cefa545aac64f5535d79ce1f`; PR #137 records unchanged counts and the pre-existing runtime BYPASSRLS/neon_superuser finding. This supersedes the earlier unapplied statement for 0145 only.

New **unapplied 0146** implements quote adjustment against an existing authenticated, version-pinned order quote; exact fixed/percentage/cap calculations, apply/remove snapshots, revision/idempotency checks, global/per-Store reservation limits, conservative yearly/bundle stacking, expiry recovery only for invoice-unbound intents, zero-due rejection, and invoice-status reconciliation. The invoice settlement trigger redeems once only after existing control invoice proof fields and exact amount agree; pending/unknown invoices retain reservations. Nonzero-tax quotes fail closed with TAX_REQUOTE_REQUIRED until authoritative order tax recalculation is integrated. No new intent creation or payment issuance is implemented here.

Go adds authenticated POST `/v1/platform/purchase-intents/{intentID}/quote` and real MFA/Super Admin GET/POST `/v1/admin/billing/coupons`. Next proxy allows quote POST; browser prices remain untrusted. Admin history adds lazily loaded, paginated immutable revisions and verified redemption records using existing Admin classes and MFA actions.

Actual checks: full `go test ./...` PASS, TypeScript PASS. Isolated Neon branch br-still-fog-b38to82q tested 0133/0134/0135/0145/0146 plus `tools/testing/subscription-coupon-lifecycle.sql` inside a rollback-only subtransaction. Passed percent/fixed/cap/normalization/apply/remove/replay/stale/foreign actor/minimum/schedule/expiry/zero-due/audit/history checks, synthetic paid-invoice hook and duplicate redemption. Afterward coupon and command tables remained absent, proving test DDL/fixtures/configuration rolled back. Synthetic status injection is not real independent payment evidence. No production 0146 applied.

Seal blockers remain: complete product/term restriction authoring and safe post-use version editing; actual multi-connection exhaustion races and role tests, HTTP/browser Apply/Remove/refresh parity, focused browser/Admin layout checks and final-source CI/build. Existing production runtime privilege finding remains unresolved. New branch creation failed with Neon quota 422; no existing branch deleted. Latest source checkpoint intentionally skips automatic full CI per owner instruction to run only the relevant CI job; earlier CI cannot validate this new source. Do not mark Phase3 sealed or merge/deploy this checkpoint.

## 2026-10-22 follow-up source checkpoint — still NOT SEALED

This section supersedes the earlier open implementation items only where concrete code/test evidence is supplied. **Final source SHA/PR CI are pending** until this checkpoint is pushed and its own focused job finishes; neither earlier CI nor synthetic invoices can seal it.

### New additive, unapplied control migrations

- `0147_platform_subscription_coupon_restrictions.sql`: explicit `eligible_products` (`payments`, `ai_credit`, `bundle`) and `eligible_terms` (`monthly`, `yearly`, `one_time`) with fail-closed database validation. Admin create/edit and visible labels use those restrictions. A paused/draft coupon may be edited **after historical use** with mandatory optimistic revision and an immutable old revision. Global and per-Store caps may not be lowered below already redeemed plus currently held reservations. Active edits are refused. Bound invoices keep their previously priced quotes.
- `0148_platform_subscription_coupon_tax_requote.sql`: adds approved product/term tax policies and immutable revisions, MFA-Super-Admin authoring with audit reason, explicit rate including approved zero, integer half-up tax computed on the post-discount base, and original-quote tax consistency checks. No rate or exemption is seeded. Missing approval produces `TAX_POLICY_REQUIRED`; old/mismatched tax produces `TAX_REQUOTE_REQUIRED`. Existing paid invoices are not repriced. This implementation requires the owner to confirm the legally correct post-discount tax base before publishing any policy or enabling purchases.
- `0149_platform_subscription_coupon_quote_read.sql`: authenticated, Store-authorized, `no-store` GET of the latest live quote, immutable applied-code snapshot and quote lines for refresh/uncertain POST recovery; normal Apply/Remove POST includes the confirmed normalized code. The Next proxy forwards both operations; a reusable client component validates and displays server amounts, holds idempotency keys during uncertain retries and never issues invoices. The current older Billing Order Summary does **not** have a Phase 4 intent and remains explicitly preview-only, with coupon Apply disabled; rendering the reusable component there without an authoritative intent would be misleading.
- Coordinator order updated through 0149. `0145` is installed in production control; **0146–0149 are not**. No production application or financial Live/Sandbox DB changes were made.

### Automation observed in this checkpoint

- Neon project `sparkling-mountain-38618629`, existing isolated `br-still-fog-b38to82q`, database `ekmivo`: full 0133/0134/0135/0145–0149 schema plus separate rollback-only coupon-lifecycle and tax fixtures **PASS**. Product/term exclusions, matching eligibility, paused post-redemption revision, immutable original discount, Apply/Remove, stale actor/revision, current-quote GET, audit, pending invoice reservation, synthetic once-only settlement and duplicate replay all passed. Tax fixture proves 10% fictional rate on 10,000 minor-unit subtotal: coupon 1,000 reduces tax 1,000→900 and total 11,000→9,900; Remove restores 1,000 tax/11,000 total; changing policy revision rejects stale quote. This fictional 10% is a rolled-back test case, **not** an approved business setting. Post-run read-only checks confirmed coupon, command and tax tables **absent**. No real provider money was moved.
- Local `node scripts/subscription-coupons-contract.test.mjs` **5/5 PASS**; TypeScript `tsc --noEmit` **PASS**; focused ESLint **PASS**; Admin design validator **PASS**; authorized child-process Next.js 16.4 production build **PASS**. These checks must be re-run after any final edit; final CI on the pushed source remains required.
- `.github/workflows/ci.yml` now schedules only the web/PostgreSQL job for this named PR branch (other jobs skip) and includes actual two-connection last-slot exhaustion in an ephemeral GitHub-hosted PostgreSQL service. This new race test is **NOT YET EXECUTED**. The npm production audit retries transient registry failures but **still fails** on a persistent 503 or genuine high-severity advisories.
- Chromium browser installation in this workspace failed because the CDN returned a truncated/non-ZIP archive; responsive/keyboard/real-HTTP browser acceptance is **NOT PASSED**. A reusable Phase 3 coupon control alone is not a deployed integrated checkout.

### Open before Phase 3 code-level seal

1. Final-head focused GitHub web/PostgreSQL job green, including the **actual multi-connection** race and fresh Go checkout authorization test. Inspect individual failing steps rather than interpreting old-SHA reruns as current evidence.
2. Authenticated HTTP tests for session/MFA, authorized Store owner, wrong tenant, unauthorized member/admin and Apply/Remove/refresh/reload parity. Browser responsive light/dark/EN/BN and keyboard/focus/accessibility checks on the Admin history/tax screens and actual intent-backed coupon control. Do not rely only on static source contracts.
3. Resolve or explicitly release-gate the pre-existing production `ekmivo_runtime` `BYPASSRLS`/`neon_superuser` privilege path after a controlled dependency review. Do not blindly revoke role membership or disturb other services.
4. Only after verified source and CI update exact SHA, links, outcome matrix and independent manual/provider ledger. **No merge, deployment, 0146–0149 production migration, Phase 4 implementation or seal is asserted here.**
