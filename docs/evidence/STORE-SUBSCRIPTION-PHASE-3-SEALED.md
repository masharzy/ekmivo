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
