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
