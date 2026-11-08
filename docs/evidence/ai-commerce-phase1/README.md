# AI Commerce Core — Phase 1 (catalog) — PARTIAL

Status: data layer only. 2026-11-09 (Asia/Dhaka). Branch agents/ai-commerce-phase1, stacked on Phase 0 PR #162 (not yet sealed).

## Done
Migration `0228_briofold_catalog_search.sql` (sha256 ad1084e0902c2f4b2ef7dd3877b89c68a5baec918352e6f9c86851ff2198c391):
additive catalog columns, synonym table (53 Bangla/Banglish/English terms), trigger-maintained search columns,
`commerce_product_search`, `commerce_catalog_write`, idempotent copy of `inbox_products`, webp allowed in `commerce_media`.
Registered in the financial-migrate coordinator list.

## Evidence
- Local PostgreSQL 16, empty database, migration applied twice: `tools/testing/catalog-search-harness.sql`, 15 assertions PASS.
- Neon test branch `ai-commerce-phase1-test-20261109` (child of `test-customer-orders-20261108`, database ekmivo): 0228 applied once in a single transaction;
  ledger now has 76 rows including 0228 with the file's sha256. Synonym table md5 and normaliser output match the local run exactly.
  Search checks on temporary rows (rolled back, nothing persisted): "panjabi red", "লাল পাঞ্জাবি M", "পাঞ্জাবি লাল এম" all return the same variant;
  blue/L picks the other variant; "t-shirt" matches; a typo still finds the product; a price ceiling and in_stock filter work;
  min_price_minor is never returned; the live environment cannot see sandbox rows.
- Speed, local PG16, 10,000 synthetic products: normal search 23–41 ms. Typo fallback ~105 ms when 20% of products contain the exact word (worst case).

## NOT done / NOT verified
- Neon second execution of the SQL file was not run (a coordinator re-run would skip it by checksum). Idempotent re-execution is proven locally only.
- The Neon test branch has no products and no inbox_products rows, so the inbox copy ran on zero rows there; it is proven locally only.
- Go tests (the repo needs Go 1.27, the sandbox has 1.24, no network): `go test ./cmd/financial-migrate` was NOT run. CI must run it.
- Full migration chain on isolated PostgreSQL, web lint/build: not run for this branch.
- Manual form, CSV import with image URLs (SSRF-safe), public REST API with Idempotency-Key, Woo import/webhooks, feature flags, docs: not started.
- The 10,000-product p95 < 100 ms target is measured on synthetic data in a local PG16, not on Neon.
- Inbox product images are not copied (they live in inbox_media).

## Rollback
All statements are additive. Recovery source: Neon branch `test-customer-orders-20261108` (untouched; this work ran on a child branch).
To undo on the child branch: drop the two triggers, the new functions, the new indexes and columns; never drop commerce_* tables.

## Owner actions taken
Owner approved deleting one archived test branch to free a slot (branches limit): `test-dashboard-sms-evidence-20261015` (br-cold-paper-b3pks3sr). Nothing else was deleted. No production writes.
