# AI Commerce Core — Phase 0

Status: implementation and isolated catch-up complete; latest PR CI pending. 2026-11-09 (Asia/Dhaka).
Baseline: a3df78814c66e87af201ba7cc07605a7d0973670. PR: https://github.com/masharzy/ekmivo/pull/162.

## Fixes

- Pending draft navigation route and destination Store now share one atomic React state object. This removes the sidebar render ref error without changing its helper, DOM mount points, navigation or CSS.
- Existing dashboard-reference migration coordinator now includes the 43 missing CONTROL migrations in dependency order. Its owner/schema/independent-realm checks, advisory lock, transaction, immutable checksum ledger and financial migration lists are preserved. A Go test guards order, duplicate/missing files, critical dependencies and financial/CONTROL separation.
- Signup transaction smoke now expects the current /businesses/open route. Public-catalog migration-order assertion tolerates Go whitespace while retaining its adjacent ordering requirement.
- Qwen remains on the existing OpenRouter path. No new selling behavior, production flag, model, merge or deployment changes.

## Validation

- Reproduced baseline react-hooks/refs errors at dashboard-frame.tsx:329–330.
- Full web ESLint and TypeScript PASS. Production Next build PASS: webpack compilation, TypeScript, prerender and route generation.
- 208 CI non-browser contract tests PASS, zero skips, including the corrected signup regression. Existing PG02 dirty/save/failure/discard smoke PASS.
- Go go test ./cmd/financial-migrate PASS, including TestDashboardControlCatchupIsOrderedAndComplete.
- Earlier PR CI 42509411121: Go compile/unit tests, containers and Android PASS. Web passed lint and failed the stale signup assertion, now fixed. Latest new CI must pass before seal.

## Production audit (read only)

migration-audit.json inventories 209 repository SQL files, recorded checksums and missing CREATE TABLE/FUNCTION anchors. All 32 production dashboard_reference_migrations checksums match repository LF bytes. commerce_orders and briofold_customers_search were absent. The ledger covers only part of historical deployment: object presence does not prove latest ALTER/function version, and absent financial-realm objects in CONTROL are expected. inbox_blobs was intentionally removed by 0223.

## Backed-up isolated catch-up

The owner authorized deleting the archived test-managed-plans-20261016 branch. Deleted only br-lucky-mode-b3hkfaxa, then created the ready no-compute checkpoint ai-commerce-phase0-checkpoint-20261109 (br-wild-dust-b33asj42) from test-customer-orders-20261108 (br-frosty-mountain-b39lqauo). Neon rejects snapshots of non-root branches, so this checkpoint preserves the equivalent pre-catch-up baseline without modifying production. No backup/test branch has been reset or removed.

After rollback rehearsals, applied 43 CONTROL SQL files atomically to the authorized test branch's ekmivo database using the existing coordinator advisory lock and checksum ledger. First execution: 43 new ledger entries, total 75, latest applied_at 2026-11-08T18:22:23.337Z. Second execution: all files checksum-checked/skipped, still 75 entries and identical latest applied_at. All 75 recorded hashes match repository LF bytes. Schema smoke finds all 19 commerce tables, customer order/search functions and the intentional absence of inbox_blobs. Exact filenames/checksums and checkpoint metadata: test-catchup.json.

0212–0218 are already installed on this baseline and are documented prerequisites; they were not blindly replayed or falsely adopted into the ledger. A preliminary all-file rollback rehearsal correctly rejected the already-present 0212 table without persisting changes. The 43-file ordered catch-up includes 0189/0190/0193/0201/0210/0220 and the temporary 0222→0223 lifecycle, rather than relying only on missing CREATE anchors.

## Rollback and remaining acceptance

For these atomic test applications, any statement error rolls back the entire batch. The retained checkpoint is the recovery source after commit: create a new child with a compute from the checkpoint, compare schema/data and only then redirect a test connection. Never delete commerce tables or reset either existing branch automatically. The original test branch and checkpoint remain available for subsequent phases.

- [x] Sidebar fix, web lint/TypeScript/build and available regression tests.
- [x] Production migration inventory and checksums delivered in PR.
- [x] Backed-up authorized test catch-up, second checksum-protected no-op and schema smoke.
- [ ] Latest PR CI green, including complete isolated PostgreSQL smoke; until then Phase 0 is NOT SEALED.

The connector applied the same reviewed ledger/transaction semantics as the Go coordinator; the three-realm Go CLI was not run against production. This is CONTROL schema verification, not real customer/provider/media/payment acceptance. Customer authorization/PII tests and all AI selling features remain dependent-phase work. Production migrations, merge and deployment require separate owner authorization.

## CI follow-up — 2026-11-09

Commit be1fa39 passed signup and all onboarding contracts in CI. Foundation run 42510118173 subsequently failed a stale public-pay route assertion; replaced the old exact route-list assertion with positive canonical business/catalog/application paths and negative public/pay/checkout paths. Phase 7 run 42510118202 passed Phase 5/6 SQL, then its read-only subscription-runtime-grants.sql check wrongly required database briofold after a branding rename. Restored the actual technical CONTROL database name ekmivo, matching migrations and fixtures. Corrected grant proof passes on the authorized Neon test branch; a wrong-database negative probe still fails closed. No production SQL or application runtime behavior changed.

Foundation run 42511240162 passed the corrected signup/public-pay checks and reached the real business resolver PostgreSQL smoke. Its two revoked/foreign Store redirects still expected /workspaces. Updated both expected destinations to canonical /businesses, preserving the membership rejection and rollback assertions. The rest of the script/route scan only found deliberate legacy-URL simulations, retained unchanged. Phase 7 run 42511240075 is fully green.

Foundation run 42511727026 passed business-context, pricing/order browser checks and isolated financial SQL, then the PG05 browser helper timed out opening a removed /w route. Updated PG05 requests to /payments/links?view=requests, PG09 transactions to /payments, and route browser acceptance to require 404 for deleted /w paths. No application routes restored or authorization weakened.

Run 42512364618 confirms canonical payment-link UI and plan denial pass. The canonical route probe then expected Orders for a pure Payment Gateway fixture, contradicting enabledUnifiedService/unifiedDestination. The probe now reads the fixture service_mode and requires Orders 404 for commerce mode while preserving 200 expectations for allowed routes and the AI Inbox product gate. Application authorization is unchanged.
