# AI Commerce Core — Phase 1 (product catalog)

Status 2026-11-09 (Asia/Dhaka): **closed at code level by the owner's decision; verified in pieces, not end to end.** On 2026-11-09 the owner asked for an end-to-end sandbox test (first on their PC, then in the cloud) and then said it is not needed and to finish at code level. The PC sandbox could not start (too little free disk for the Linux workspace). The cloud one is blocked: the Go toolchain and modules come from proxy.golang.org, which egress policy denies, and CI has no builder for a full-chain scratch database (the migration coordinator is a catch-up on a deployment baseline). So no HTTP→Go→database→storage run exists. Read "Not verified" before relying on it.
Branch agents/ai-commerce-phase1 → PR #163 (stacked on Phase 0 PR #162, which is still open).

## What exists
| Area | Where |
|---|---|
| Catalog columns, synonym table, search function, inbox copy | `infra/migrations/0228_briofold_catalog_search.sql` |
| One write path (`commerce_catalog_write`, upsert by `external_id`, replay-safe), scoped API wrappers, stock set, deactivate | `0229_briofold_catalog_api.sql` |
| Woo apply-once state (own table; the notice table is immutable) | `0230_briofold_woo_sync.sql` |
| Grant so the API can resolve the key's actor for image fetch | `0231_briofold_catalog_key_actor.sql` |
| Indexed search filter + missing indexes on `commerce_variants(product_id)` and `commerce_stock(variant_id)` | `0232_briofold_catalog_search_speed.sql` |
| Public API `/v1/products` (POST upsert, GET list/one, PUT, DELETE, PUT stock), key scopes `products:read/write`, mandatory UUID `Idempotency-Key`, rate limits, flag `BRIOFOLD_PRODUCT_API_ENABLED` | `backend/internal/checkout/commerce_catalog_api.go`, docs `docs/api/products-api.md` |
| Dashboard actions `catalog-product`, `catalog-import` (25 per request, per-row result, flag `BRIOFOLD_CATALOG_ENABLED`) | `commerce_catalog_dashboard.go` |
| SSRF-safe image download (https/443 only, public IPs only, redirects revalidated, ≤10 MB, jpg/png/webp by content) | `backend/internal/knowledge/image.go` |
| Woo full import (`woocommerce-import`, page by page) and webhook auto-apply (refetch from store, BDT only, claim/finish), flag `BRIOFOLD_WOO_SYNC_ENABLED` | `commerce_woo_sync.go`, `commerce_woo_hooks.go` |
| Manual form (multiple reorderable images, size/colour variants with price and stock, min price, tags, category, AI notes), CSV/XLSX import with template download and per-row preview errors, Woo import button | `apps/web/src/components/catalog-panel.tsx`, `apps/web/src/lib/client/catalog-import.ts` |

## Evidence
CI (Foundation CI on the merged head `44bb90e`): Go compile and unit tests PASS (includes SSRF rejection of 169.254.169.254, 127.0.0.1, 10.x, 100.64.x, [::1], localhost; API body validation; Woo mapping; migration list), PG04 Docker builds PASS, Android PASS. The Next.js job failure is described under "Not verified".
Local: web `tsc --noEmit` clean; eslint on touched files 0 errors; `node --experimental-strip-types --test apps/web/scripts/catalog-import.test.mjs` 5/5 pass; `tools/testing/catalog-search-harness.sql` 15/15 on an empty PG16.

Neon test branch `ai-commerce-phase1-test-20261109` (br-tiny-mouse-b37574ht), database ekmivo. 0228–0232 applied; ledger rows carry each file's sha256. All behaviour checks ran inside transactions that were rolled back:
- Upsert twice by `external_id` → one product, revision 1→2, `created` true then false.
- Same key + same body → identical answer; same key + different body → rejected.
- Read-only key cannot write; write-only key cannot read.
- Stock set to 12 → on_hand 12; setting 12 again → `changed:false`.
- API list returns the product; delete deactivates it.
- Woo claim: first claim true; second while leased false; retry after a failed apply true; after success false.
- Second run of the DDL in 0229–0232 (constraint, columns, indexes, grants) completes without error.

**Search speed, Neon test branch, 10,000 committed products (20,000 variants), vacuumed, 60 mixed queries including typo and Bangla:** p50 11.1 ms, p95 40.1 ms, max 43.5 ms (target < 100 ms).
This run found two real problems that are fixed in 0232: before the fix p95 was about 900 ms because (1) the match filter re-expanded JSON per row so the token index was not used and (2) `commerce_variants` had no index on `product_id`, so each candidate product scanned all variants. The 10k test rows were deleted afterwards. Measured with `clock_timestamp()` inside the database, so it excludes network and the Go layer. I did not run `EXPLAIN ANALYZE` on the final function body (it is plpgsql); I ran it on the fuzzy-fallback query where the problem was found.

## Not verified / not done (be sceptical of "done")
- **Go integration tests against a real database were not written.** The unit tests cover validation, mapping, SSRF and ids. The end-to-end paths (HTTP → SQL → media storage → Woo) were not exercised in CI or on a running backend. Image download and storage (`objectRequest`, file scan) have never run against real storage here.
- **Woo against a real store was not tested.** Mapping is tested on fixtures. Webhook auto-apply runs in a background goroutine; a redelivered notice retries an unfinished one, but nothing retries on its own if the store never redelivers.
- **Web UI: checked in real Chrome with a mocked API only.** The real `CatalogPanel` was bundled into a harness and driven at 360 px and 412 px wide (no horizontal overflow, no console errors): two images uploaded and reordered; prices typed as 1200.5 and 900.50 are sent as 120050 and 90050 paisa; the save is sent once with a UUID operation key and the form clears; a CSV with one bad price shows "line 4 PRICE_INVALID", the two good products import (A with 2 variants, C with 1); the Woo button walks pages 1 and 2. The harness has none of the app's CSS and no real backend, so **styling inside the dashboard, Bangla text and the real API were not seen.** Screenshots are in the session only, not committed.
- **CI job "Next.js lint, build and isolated PostgreSQL smoke" fails on this head at step "PG04 independent financial River + realm migration and durability"** with `runChannelPolicies: locator.waitFor: Timeout 30000ms` plus two other browser-suite failures (Phase 9 canonical links, key lifecycle). These are the same browser-suite timeouts Phase 0 has. Migrations and the earlier SQL suites in that job ran before the failure. I did not fix or investigate them.
- **Inbox product picker / AI reply path still read `inbox_products`.** `inbox_products` was copied once into `commerce_products` (BDT only, each size a variant, sku `INBOX-<id>`), but SQL in migrations 0135 and 0202 still validates AI reply facts against the old table. Switching it changes live AI behaviour and should go with the Phase 3 orchestrator. Products created in the new catalog are therefore not yet quotable by the existing inbox AI.
- **Neon rows: the test branch has no inbox products**, so the inbox copy ran on zero rows there (proven on local PG only). Inbox product images are not copied (they live in `inbox_media`); sellers must re-attach.
- **VPS:** nothing was run on the VPS (no SSH). Feature flags are off by default; none is set anywhere.
- **Plan deviations:** the CSV importer accepts the plan's columns (`product_id,name,description,category,tags,search_aliases,sku,options,price,min_price,stock,image_urls`, decimal BDT, `options` as `size=M;color=Red`) and also the older whole-paisa columns (`price_minor`, `min_price_minor`, `size`, `color`, `ai_notes`); the plan-column support was added by a separate commit (632c39b) that I re-tested (6/6 importer tests, tsc clean) but did not write. Image URLs are https-only on port 443, stricter than the plan's "http(s)". The existing `commerce_imports` preview/apply flow was left in place and not extended; the new import is a separate path. Developer-portal page was not added (those pages are generated from the payment contract); docs are `docs/api/products-api.md`.
- **Stock via import/API needs a warehouse**; without one the row fails with a clear error rather than silently skipping stock.
- `CREATE INDEX` in 0232 is not `CONCURRENTLY` (the coordinator runs in a transaction); it takes a short write lock on `commerce_variants` and `commerce_stock`.
- The Neon test branch still carries 4 unused columns on `commerce_woo_hook_events` from an earlier draft of 0230 (not in the final file). Recreating the branch from its parent clears this.

## Rollback
All migrations are additive. For 0232/0231/0230: drop the two indexes, revoke the grant, drop `commerce_woo_event_applies` and the two functions. Never drop `commerce_*` tables. Recovery source: parent Neon branch `test-customer-orders-20261108` (untouched).

## Owner actions taken
Owner approved deleting one archived test branch to free a slot: `test-dashboard-sms-evidence-20261015` (br-cold-paper-b3pks3sr). Nothing else was deleted. No production writes. The synthetic 10k rows and all functional-test rows are gone (functional tests rolled back; perf rows deleted explicitly).
